// Google Fonts in a project, the way a developer adds one: load it (one Google Fonts link in index.html, or an
// @import in the global CSS for apps without one), then name it in tailwind.config's fontFamily so it becomes
// part of the design system (font-playfair-display). Returns the files to change; the editor records them as one
// undoable edit, so Undo removes the font and Hand off ships it.
import fs from 'node:fs';
import path from 'node:path';
import { parseCode, walk } from './ast.mjs';
import { KerfError } from './edit.mjs';

const TW_CONFIGS = ['tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs', 'tailwind.config.ts', 'tailwind.config.mts', 'tailwind.config.cts'];
const FALLBACK = { serif: 'serif', 'sans-serif': 'sans-serif', display: 'sans-serif', handwriting: 'cursive', monospace: 'monospace' };
export const fontKey = (family) => String(family).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plus = (family) => String(family).trim().replace(/\s+/g, '+');

// Which weights Google serves for this family: the widest variable range that works, else common static weights.
// A family Google doesn't have is an error the designer can read.
async function resolveSpec(family) {
  const tries = ['100..900', '200..900', '300..900', '400..900', '100..800', '200..800', '300..800', '400..800', '200..700', '300..700', '400..700', '400;500;600;700', '400;700', null];
  for (const w of tries) {
    const spec = w ? `${plus(family)}:wght@${w}` : plus(family);
    let r;
    try { r = await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`); } catch { throw new KerfError('Tovi couldn’t reach Google Fonts. Check your internet connection.'); }
    if (r.ok) return spec;
  }
  throw new KerfError(`Google Fonts has no font called “${family}”. Check the spelling on fonts.google.com.`);
}

// index.html: join the existing Google Fonts link if there is one, else add preconnects and a link in <head>.
export function htmlWithFont(html, spec) {
  const m = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]*)"/);
  if (m) {
    const url = m[1];
    if (url.includes(`family=${spec.split(':')[0]}:`) || url.includes(`family=${spec.split(':')[0]}&`) || url.endsWith(`family=${spec.split(':')[0]}`)) return html;
    const next = url.includes('&display=') ? url.replace('&display=', `&family=${spec}&display=`) : `${url}&family=${spec}`;
    return html.replace(url, next);
  }
  const head = html.match(/\n([ \t]*)<\/head>/);
  if (!head) return null;
  const ind = head[1] + '  ';
  const add = `${ind}<link rel="preconnect" href="https://fonts.googleapis.com" />\n${ind}<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n${ind}<link href="https://fonts.googleapis.com/css2?family=${spec}&display=swap" rel="stylesheet" />\n`;
  return html.replace(/\n([ \t]*)<\/head>/, `\n${add}$1</head>`);
}

// The global CSS (the file with Tailwind's directives), for apps without an index.html (Next.js).
function globalCss(webRoot) {
  const dirs = ['src', 'app', 'src/app', 'styles', 'src/styles', '.'];
  for (const d of dirs) {
    const dir = path.join(webRoot, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.css')) continue;
      const p = path.join(dir, f), css = fs.readFileSync(p, 'utf8');
      if (/@tailwind\s+base|@import\s+["']tailwindcss/.test(css)) return { p, css };
    }
  }
  return null;
}

// tailwind.config: add the family to theme.extend.fontFamily (or theme.fontFamily), matching the file's style.
export function configWithFont(src, file, key, family, fallback) {
  const ast = parseCode(src, { strict: true, file });
  const keyOf = (n) => n.key?.name ?? n.key?.value;
  let ff = null, ext = null, theme = null;
  walk(ast.program, (n) => {
    if (n.type !== 'ObjectProperty' || n.value?.type !== 'ObjectExpression') return;
    const k = keyOf(n);
    if (k === 'theme') theme = n;
    else if (k === 'extend' && theme && n.start > theme.start && n.end < theme.end) ext = n;
    else if (k === 'fontFamily' && (!ff || (ext && n.start > ext.start && n.end < ext.end))) ff = n;
  });
  const q = /'/.test(src.slice(theme?.start || 0, theme?.end || src.length)) ? "'" : '"';
  const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `${q}${key}${q}`;
  const value = `[${q}${q === "'" ? `"${family}"` : `'${family}'`}${q}, ${q}${fallback}${q}]`;
  const lineIndent = (pos) => src.slice(src.lastIndexOf('\n', pos - 1) + 1, pos).match(/^[ \t]*/)[0];
  // Insert a new entry after the object's last property, keeping its trailing-comma style.
  const addTo = (obj, text) => {
    const props = obj.value.properties;
    if (!props.length) {
      const ind = lineIndent(obj.start) + '  ';
      return src.slice(0, obj.value.start + 1) + `\n${ind}${text},\n${lineIndent(obj.start)}` + src.slice(obj.value.end - 1);
    }
    const last = props[props.length - 1], ind = lineIndent(last.start);
    const after = src.slice(last.end).match(/^\s*,/);
    const at = after ? last.end + after[0].length : last.end;
    return src.slice(0, at) + (after ? '' : ',') + `\n${ind}${text}` + (after ? ',' : '') + src.slice(at);
  };
  if (ff) return addTo(ff, `${name}: ${value}`);
  const host = ext || theme;
  if (!host) throw new KerfError('Tovi couldn’t find the theme in tailwind.config to add the font to.');
  const ind = lineIndent(host.value.properties[0]?.start ?? host.start + 2);
  return addTo(host, `fontFamily: {\n${ind}  ${name}: ${value},\n${ind}}`);
}

export async function googleFontFiles(webRoot, theme, family, category) {
  family = String(family || '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9][A-Za-z0-9 ]{1,48}$/.test(family)) throw new KerfError('Type a Google Font name, like “Playfair Display”.');
  const key = fontKey(family);
  if ((theme.keys?.fontFamily || []).includes(key)) return { key, family, files: new Map() };
  const spec = await resolveSpec(family);
  const files = new Map();
  const html = path.join(webRoot, 'index.html');
  if (fs.existsSync(html)) {
    const next = htmlWithFont(fs.readFileSync(html, 'utf8'), spec);
    if (next == null) throw new KerfError('Tovi couldn’t find the <head> in index.html to load the font.');
    files.set(html, next);
  } else {
    const g = globalCss(webRoot);
    if (!g) throw new KerfError('Tovi couldn’t find where this app loads its styles, so it can’t add the font.');
    if (!g.css.includes(`family=${plus(family)}`)) files.set(g.p, `@import url('https://fonts.googleapis.com/css2?family=${spec}&display=swap');\n${g.css}`);
  }
  const cfg = TW_CONFIGS.map((f) => path.join(webRoot, f)).find((f) => fs.existsSync(f));
  if (!cfg) throw new KerfError('This project has no tailwind.config to add the font to.');
  files.set(cfg, configWithFont(fs.readFileSync(cfg, 'utf8'), cfg, key, family, FALLBACK[category] || 'sans-serif'));
  return { key, family, files };
}
