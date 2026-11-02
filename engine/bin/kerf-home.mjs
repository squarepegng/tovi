#!/usr/bin/env node
// Tovi's start screen: paste a GitHub link or a folder, and Tovi opens the app
// with the editor attached.   node bin/kerf-home.mjs   →  http://localhost:4100
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProject, PROJECTS_DIR, projects, stopAll } from '../src/project.mjs';
import { readRecent } from '../src/recent.mjs';
import { readPrefs, savePrefs } from '../src/prefs.mjs';
import { MODELS, PROVIDERS, listModels } from '../src/ai.mjs';

const ENV = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env');

const PORT = Number(process.env.KERF_PORT || 4100);
const VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')).version;
// Each key has its own line in .env; saving one never touches the others.
function setEnv(name, value) {
  const lines = (fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '').split('\n').filter((l) => l && !l.startsWith(name + '='));
  lines.push(`${name}=${value}`);
  fs.writeFileSync(ENV, lines.join('\n') + '\n');
  fs.chmodSync(ENV, 0o600);
}
let job = null;

// Every project you've opened, newest first: the editor records each one as it opens (see src/recent.mjs);
// older copies of GitHub repos in ~/Kerf/projects are listed too.
// The editor keeps a small picture of each app in its .kerf folder; its time tells the page when it changed.
const thumbAt = (root) => { try { return Math.round(fs.statSync(path.join(root, '.kerf', 'thumb.jpg')).mtimeMs); } catch { return 0; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function recent() {
  const seen = new Set(), out = [];
  for (const r of readRecent()) {
    if (seen.has(r.root) || !fs.existsSync(r.root)) continue;
    seen.add(r.root);
    out.push({ id: r.root, source: r.source, name: r.name, url: r.pid && alive(r.pid) ? r.url : null, at: r.at, thumb: thumbAt(r.root) });
  }
  if (fs.existsSync(PROJECTS_DIR)) for (const e of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, e.name);
    if (seen.has(dir)) continue;
    let remote = '';
    try { remote = fs.readFileSync(path.join(dir, '.git/config'), 'utf8').match(/url = (.+)/)?.[1] || ''; } catch {}
    const running = projects.get(e.name);
    const source = remote.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '') || dir;
    out.push({ id: dir, source, name: path.basename(source), url: running?.proc?.exitCode === null ? running.url : null, at: fs.statSync(dir).mtimeMs, thumb: thumbAt(dir) });
  }
  return out.sort((a, b) => b.at - a.at);
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') return send(res, 200, PAGE, 'text/html; charset=utf-8');
  if (req.method === 'GET' && req.url === '/api/job') return send(res, 200, job && { ...job, repoRoot: undefined });
  if (req.method === 'GET' && req.url === '/api/key-status') {
    const env = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
    const provider = PROVIDERS[env.match(/^AI_PROVIDER=(\w+)/m)?.[1]] ? env.match(/^AI_PROVIDER=(\w+)/m)[1] : 'anthropic';
    return send(res, 200, { set: /^ANTHROPIC_API_KEY=sk-ant-\S+/m.test(env), unsplash: /^UNSPLASH_ACCESS_KEY=\S+/m.test(env), openai: /^OPENAI_API_KEY=\S+/m.test(env), gemini: /^GEMINI_API_KEY=\S+/m.test(env), provider, model: env.match(/^AI_MODEL=(\S+)/m)?.[1] || PROVIDERS[provider].model, models: MODELS, labels: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.label])) });
  }
  if (req.method === 'POST' && req.url === '/api/unsplash-key') {
    let body = '';
    for await (const c of req) body += c;
    const key = String(JSON.parse(body || '{}').key || '').trim();
    if (!/^[A-Za-z0-9_-]{30,}$/.test(key)) return send(res, 400, { error: 'That does not look like an Unsplash Access Key. Copy the “Access Key” from your Unsplash app page.' });
    setEnv('UNSPLASH_ACCESS_KEY', key);
    return send(res, 200, { ok: true });
  }
  // OpenAI and Gemini keys, and which AI Tovi uses (the editor's Settings has the same controls).
  if (req.method === 'POST' && req.url === '/api/ai-key') {
    let body = '';
    for await (const c of req) body += c;
    const { provider, key: raw } = JSON.parse(body || '{}');
    const key = String(raw || '').trim();
    const AI = { openai: ['OPENAI_API_KEY', 'OpenAI', 'sk-'], gemini: ['GEMINI_API_KEY', 'Gemini', 'AIza'] }[provider];
    if (!AI) return send(res, 400, { error: 'Unknown AI.' });
    // Only a loose check: providers change their key formats. A wrong key shows up on the first request.
    if (/[^\x21-\x7E]/.test(key)) return send(res, 400, { error: 'That key has letters that only look right (from another alphabet). Copy it again straight from your provider’s key page.' });
    if (!/^\S{20,}$/.test(key)) return send(res, 400, { error: `That does not look like a ${AI[1]} key: it should be one long piece of text with no spaces.` });
    setEnv(AI[0], key);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && req.url === '/api/ai-provider') {
    let body = '';
    for await (const c of req) body += c;
    const { provider, model: raw } = JSON.parse(body || '{}');
    const model = String(raw || '').trim() || PROVIDERS[provider]?.model;
    if (!PROVIDERS[provider]) return send(res, 400, { error: 'Unknown AI.' });
    if (!/^[\w.:/-]{2,80}$/.test(model)) return send(res, 400, { error: 'That model name does not look right.' });
    setEnv('AI_PROVIDER', provider);
    setEnv('AI_MODEL', model);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && req.url === '/api/key') {
    let body = '';
    for await (const c of req) body += c;
    const key = String(JSON.parse(body || '{}').key || '').trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return send(res, 400, { error: 'That does not look like an Anthropic key. It starts with sk-ant-.' });
    setEnv('ANTHROPIC_API_KEY', key);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && req.url.startsWith('/api/models?')) return send(res, 200, await listModels(new URL(req.url, 'http://x').searchParams.get('provider')));
  if (req.method === 'GET' && req.url === '/api/prefs') return send(res, 200, readPrefs());
  if (req.method === 'POST' && req.url === '/api/prefs') {
    let body = '';
    for await (const c of req) body += c;
    return send(res, 200, savePrefs(JSON.parse(body || '{}')));
  }
  if (req.method === 'GET' && req.url === '/api/recent') return send(res, 200, recent());
  // Only pictures of projects in the list are served.
  if (req.method === 'GET' && req.url.startsWith('/api/thumb?')) {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const file = id && recent().some((r) => r.id === id) ? path.join(id, '.kerf', 'thumb.jpg') : null;
    if (!file || !fs.existsSync(file)) return send(res, 404, { error: 'No picture yet.' });
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000' });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method === 'GET' && req.url === '/api/about') return send(res, 200, { version: VERSION, projectsDir: PROJECTS_DIR.replace(process.env.HOME || '', '~') });
  if (req.method === 'POST' && req.url === '/api/open') {
    let body = '';
    for await (const c of req) body += c;
    const { source } = JSON.parse(body || '{}');
    if (!source || !String(source).trim()) return send(res, 400, { error: 'Paste a GitHub link or a folder path.' });
    if (job && !job.url && !job.error) return send(res, 409, { error: 'Tovi is already opening a project.' });
    job = { source, step: 'Starting', log: '' };
    openProject(String(source).trim(), (j) => (job = j));
    return send(res, 202, { ok: true });
  }
  send(res, 404, { error: 'Not found' });
}).on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`Tovi is already running at http://localhost:${PORT} (or another app is using port ${PORT}).`);
  console.log(`To use a different port: KERF_PORT=4200 node bin/kerf-home.mjs`);
  process.exit(1);
}).listen(PORT, () => console.log(`Tovi is ready: http://localhost:${PORT}`));

process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tovi</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono&display=swap">
<style>
:root{--canvas:#1B1B1E;--panel:#232327;--raised:#2D2D32;--line:#3A3A40;--ink:#EDEDF0;--ink2:#B0B0BA;--ink3:#8B8B95;--select:#F2F1EE;--onSelect:#111113;--logoA:#E9A3C6;--logoB:#FCBDDD;--intent:#FCBDDD;--danger:#F06A5F;--ok:#6FD39A;--hi:255,255,255;--menu:#1E1E21;color-scheme:dark}
@media (prefers-color-scheme: light){:root[data-theme="system"]{--canvas:#F4F4F6;--panel:#FFFFFF;--raised:#EEEEF1;--line:#E2E2E7;--ink:#1B1B1E;--ink2:#55555F;--ink3:#83838D;--select:#1B1B1E;--onSelect:#FFFFFF;--logoA:#C2508A;--logoB:#E58BB8;--intent:#C2508A;--danger:#D93F33;--ok:#1E8A4F;--hi:0,0,0;--menu:#FAFAFB;color-scheme:light}}
:root[data-theme="light"]{--canvas:#F4F4F6;--panel:#FFFFFF;--raised:#EEEEF1;--line:#E2E2E7;--ink:#1B1B1E;--ink2:#55555F;--ink3:#83838D;--select:#1B1B1E;--onSelect:#FFFFFF;--logoA:#C2508A;--logoB:#E58BB8;--intent:#C2508A;--danger:#D93F33;--ok:#1E8A4F;--hi:0,0,0;--menu:#FAFAFB;color-scheme:light}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;min-height:100%;background:var(--canvas);color:var(--ink);font:400 13px/18px Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.app{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:100vh}
nav{display:flex;flex-direction:column;gap:2px;padding:20px 12px;border-right:1px solid rgba(var(--hi),.06);background:var(--menu);position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;padding:0 8px 20px;font-weight:600;font-size:15px}
nav a{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:500}
nav a:hover{background:var(--panel);color:var(--ink)}
nav a.on{background:var(--raised);color:var(--ink)}
nav a svg{flex:0 0 auto;color:var(--ink3)}
nav a.on svg{color:var(--ink)}
nav .sp{flex:1}
nav .ver{padding:0 10px;color:var(--ink3);font-size:11px}
main{min-width:0;padding:40px 48px 72px;max-width:1240px;width:100%;margin:0 auto}
#v-settings,#v-help{max-width:720px}
.view{display:none;flex-direction:column;gap:32px}
.view.on{display:flex}
h1{margin:0;font-size:26px;line-height:32px;font-weight:600;letter-spacing:-.02em}
h2{margin:0;font-size:13px;font-weight:600;color:var(--ink)}
p{margin:6px 0 0;color:var(--ink2);max-width:560px}
.lead{display:flex;flex-direction:column;align-items:stretch;gap:16px}
form.openf{display:flex;gap:8px;width:100%;max-width:640px}
input{flex:1;min-width:0;height:42px;padding:0 14px;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--ink);font:inherit;outline:none}
input:focus{border-color:var(--select);box-shadow:0 0 0 3px rgba(var(--hi),.2)}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:42px;padding:0 18px;border:0;border-radius:10px;background:var(--select);color:var(--onSelect);font:500 13px Geist,system-ui,sans-serif;cursor:pointer;text-decoration:none;white-space:nowrap}
button:disabled{opacity:.5;cursor:default}
.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}
.ghost:hover{background:var(--panel)}
.sm{height:32px;padding:0 12px;border-radius:8px;font-size:12px}
.hint{color:var(--ink3);font-size:12px}
.banner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-radius:12px;background:rgba(var(--hi),.1);border:1px solid rgba(var(--hi),.35);width:100%;max-width:640px;text-align:left}
.banner span{color:var(--ink)}
.card{display:flex;flex-direction:column;gap:12px;padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:14px}
.status{display:flex;align-items:center;gap:10px;font-weight:500}
.spin{width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
.err{color:var(--danger)}
pre{margin:0;max-height:180px;overflow:auto;padding:10px;background:var(--canvas);border-radius:8px;color:var(--ink3);font:400 11px/16px 'Geist Mono',ui-monospace,monospace;white-space:pre-wrap}
details.logs summary{cursor:pointer;color:var(--ink3);font-size:12px}details.logs pre{margin-top:8px}
.secH{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.empty{padding:28px;border:1px dashed var(--line);border-radius:14px;color:var(--ink3);text-align:center}
.rows{display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:14px}
.srow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid rgba(var(--hi),.06)}
.srow:last-child{border-bottom:0}
.chk{display:flex;align-items:flex-start;gap:10px;color:var(--ink2);cursor:pointer;line-height:20px}
.chk input{width:16px;height:16px;margin:2px 0 0;flex:0 0 auto;accent-color:var(--select);height:16px}
.chk .hint{display:block}
select{flex:0 0 auto;align-self:flex-start;height:36px;min-width:200px;padding:0 32px 0 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='%23B0B0BA' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 12px center;color:var(--ink);font:inherit;appearance:none;cursor:pointer;outline:none}
select:focus{border-color:var(--select);box-shadow:0 0 0 3px rgba(var(--hi),.2)}
.srow .tx{display:flex;flex-direction:column;gap:3px;min-width:0}
.srow .tx b{font-weight:500}
.srow form{display:flex;gap:8px;margin-top:10px;width:100%}
.srow .tx:has(form){flex:1}
.srow input{height:36px;border-radius:8px}
.ok{color:var(--ok)}
.steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.step{padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:14px}
.step i{display:grid;place-items:center;width:24px;height:24px;margin-bottom:10px;border-radius:50%;background:var(--raised);color:var(--ink);font:600 12px/1 Geist,system-ui,sans-serif;font-style:normal}
.step b{display:block;margin-bottom:4px}
.step span{color:var(--ink2)}
table.keys{border-collapse:collapse;width:100%}
table.keys td{padding:9px 0;border-bottom:1px solid rgba(var(--hi),.06);color:var(--ink2)}
table.keys td:last-child{text-align:right}
kbd{display:inline-block;min-width:20px;padding:2px 6px;border-radius:5px;background:var(--raised);color:var(--ink);font:500 11px/16px Geist,system-ui,sans-serif;text-align:center}
/* Start page, after Framer, Figma and Wonder: a quiet sidebar with search, one primary action, filters and big previews. */
:root{--side:#141416}:root[data-theme="light"]{--side:#FAFAFB}
@media (prefers-color-scheme: light){:root[data-theme="system"]{--side:#FAFAFB}}
nav{background:var(--side);border-right-color:rgba(var(--hi),.06);padding:14px 10px}
.brand{padding:4px 8px 14px}
nav a{height:32px;padding:0 10px;font-weight:500;font-size:13px}
nav a.on{background:rgba(var(--hi),.08)}
.nsearch{display:flex;align-items:center;gap:8px;height:32px;margin:0 0 10px;padding:0 6px 0 10px;border-radius:8px;background:rgba(var(--hi),.06);color:var(--ink3)}
.nsearch input{height:30px;padding:0;border:0;background:none;border-radius:0;font-size:13px}
.nsearch input:focus{box-shadow:none}
.nsearch kbd{background:rgba(var(--hi),.07);color:var(--ink3)}
.phead{display:flex;align-items:center;justify-content:space-between;gap:16px}
.phead h1{font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.01em}
.pri{height:34px;padding:0 14px 0 12px;border-radius:9px;background:linear-gradient(180deg,#fff,#E7E6E2);color:#111113;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 0 0 .5px rgba(0,0,0,.55),0 1px 2px rgba(0,0,0,.4)}
:root[data-theme="light"] .pri{background:linear-gradient(180deg,#2A2A2F,#141416);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 2px rgba(0,0,0,.25)}
.pri:active{scale:.97}
.openCard{display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:14px;background:var(--panel);box-shadow:0 0 0 1px rgba(var(--hi),.07),0 12px 32px rgba(0,0,0,.25)}
.openCard h2{font-size:15px;line-height:20px}
.openCard p{margin-top:4px}
.openCard input{height:38px}
.openCard button#go{height:38px}
.ptools{display:flex;align-items:center;gap:10px}
.ptools .sp{flex:1}
.seg{display:inline-flex;gap:2px;padding:2px;border-radius:9px;background:rgba(var(--hi),.05);box-shadow:inset 0 1px 2px rgba(0,0,0,.25)}
.seg button{height:28px;padding:0 10px;border-radius:7px;background:transparent;color:var(--ink2);font:500 12.5px/1 Geist,system-ui,sans-serif}
.seg button span{margin-left:4px;color:var(--ink3);font-variant-numeric:tabular-nums}
.seg button.on{background:#3A3A41;color:var(--ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 0 0 .5px rgba(0,0,0,.55),0 1px 2px rgba(0,0,0,.45)}
:root[data-theme="light"] .seg{box-shadow:inset 0 1px 2px rgba(0,0,0,.08)}
:root[data-theme="light"] .seg button.on{background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.1)}
.seg.vt button{width:30px;padding:0;color:var(--ink3)}
.seg.vt button.on{color:var(--ink)}
.ptools select{height:32px;min-width:0;padding:0 28px 0 10px;background-position:right 9px center;border-color:transparent;background-color:transparent;color:var(--ink2);font-size:12.5px}
.ptools select:hover{background-color:rgba(var(--hi),.05)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:28px 20px}
.proj{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:12px;height:auto;padding:0;border-radius:0;background:none;color:var(--ink);text-align:left;white-space:normal;font:inherit}
.shot{position:relative;display:block;aspect-ratio:16/10;border-radius:12px;overflow:hidden;background:var(--panel);box-shadow:0 0 0 1px rgba(var(--hi),.07);transition:box-shadow .16s cubic-bezier(.2,0,0,1),translate .16s cubic-bezier(.2,0,0,1)}
.shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.shot .ph{position:absolute;inset:0;display:grid;place-items:center;opacity:.22;filter:grayscale(1)}
.proj:hover .shot{translate:0 -2px;box-shadow:0 0 0 1px rgba(var(--hi),.16),0 10px 28px rgba(0,0,0,.3)}
.proj:focus-visible{outline:none}.proj:focus-visible .shot{box-shadow:0 0 0 2px #2B66D9}
.info{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:0 2px}
.info .tx{display:flex;flex-direction:column;min-width:0}
.info b{font-weight:500;font-size:14px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.info .when{color:var(--ink3);font-size:12.5px;line-height:18px}
.info .src{display:none;color:var(--ink3);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.run{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:22px;margin-top:-1px;padding:0 8px;border-radius:6px;background:rgba(111,211,154,.1);color:var(--ok);font-size:11.5px;font-weight:500}
.run::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.grid.list{display:flex;flex-direction:column;gap:2px}
.grid.list .proj{flex-direction:row;align-items:center;gap:14px;padding:8px;border-radius:10px}
.grid.list .proj:hover{background:rgba(var(--hi),.04)}
.grid.list .shot{flex:0 0 80px;width:80px;border-radius:6px}
.grid.list .proj:hover .shot{translate:none;box-shadow:0 0 0 1px rgba(var(--hi),.1)}
.grid.list .info{flex:1;align-items:center}
.grid.list .src{display:block}
#v-projects{gap:24px}
#job:empty{display:none}
input:focus,select:focus{border-color:rgba(43,102,217,.75);box-shadow:0 0 0 3px rgba(43,102,217,.16)}
@media (max-width:760px){.app{grid-template-columns:1fr}nav{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:12px}.brand{padding:0 8px 0 4px}nav .sp,nav .ver{display:none}main{padding:28px 16px 48px}}
@media (prefers-reduced-motion:reduce){.spin{animation:none}}
</style></head>
<body><div class="app">
<nav aria-label="Tovi">
  <div class="brand"><svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="5.5" height="10" rx="1.5" style="fill:var(--logoA)"/><rect x="8.5" y="3" width="5.5" height="10" rx="1.5" style="fill:var(--logoB)"/></svg>Tovi</div>
  <label class="nsearch"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="q" placeholder="Search" autocomplete="off" spellcheck="false" aria-label="Search projects"><kbd>/</kbd></label>
  <a href="#projects" data-v="projects"><svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="2.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2" y="9.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="9.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>Projects</a>
  <a href="#settings" data-v="settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>Settings</a>
  <a href="#help" data-v="help"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.4" r=".8" fill="currentColor"/></svg>Help</a>
  <span class="sp"></span>
  <span class="ver" id="ver"></span>
</nav>
<main>
  <section class="view" id="v-projects" aria-labelledby="pT">
    <div class="phead"><h1 id="pT">Projects</h1><button class="pri" id="openBtn" aria-expanded="false" aria-controls="openCard"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Open project</button></div>
    <div class="openCard" id="openCard" hidden>
      <div><h2 id="oT">Open a project</h2><p>Paste a GitHub link or a folder on this computer. Tovi runs your app and opens it with the editor on top. Your code only changes when you edit.</p></div>
      <form class="openf" id="f"><input id="src" placeholder="github.com/team/app  or  ~/code/app" autocomplete="off" spellcheck="false" aria-label="GitHub link or folder"><button id="go">Open</button></form>
      <label class="chk"><input type="checkbox" id="diagOn" checked><span>Check my product for design issues when it opens <span class="hint">Tovi reviews each page and leaves notes on what to fix.</span></span></label>
      <span class="hint">React apps built with Vite or Next.js 13+, styled with Tailwind CSS v3. Private repos use your GitHub sign-in on this Mac.</span>
    </div>
    <div class="banner" id="keyBanner" hidden><span>Add your Anthropic key to use Tovi’s AI.</span><a class="btn ghost sm" href="#settings">Add key</a></div>
    <div id="job"></div>
    <div class="ptools" id="ptools" hidden>
      <div class="seg" role="group" aria-label="Show"><button class="on" data-f="all">All<span id="nAll"></span></button><button data-f="run">Running<span id="nRun"></span></button></div>
      <span class="sp"></span>
      <select id="sort" aria-label="Sort by"><option value="at">Last opened</option><option value="name">Name</option></select>
      <div class="seg vt" role="group" aria-label="View"><button data-view="grid" class="on" aria-label="Grid" title="Grid"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg></button><button data-view="list" aria-label="List" title="List"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/></svg></button></div>
    </div>
    <div class="grid" id="recent"></div>
  </section>

  <section class="view" id="v-settings" aria-labelledby="sT">
    <div><h1 id="sT">Settings</h1><p>Saved only on this Mac. Keys live in a git-ignored file, and Tovi never shows them again.</p></div>
    <div><div class="secH"><h2>AI</h2></div>
      <div class="rows">
        <div class="srow"><div class="tx"><b>Provider</b><span class="hint" id="aiNow">Checking…</span></div>
          <select id="aiProv" aria-label="Provider"><option value="anthropic">Claude</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option></select></div>
        <div class="srow" data-key="anthropic"><div class="tx"><b>Anthropic key</b><span class="hint" id="keystat">Checking…</span>
          <form id="kf"><input id="kin" type="password" placeholder="sk-ant-..." autocomplete="off" spellcheck="false" aria-label="Anthropic API key"><button class="sm" id="ksave">Save</button></form><span class="err" id="kerr"></span></div></div>
        ${[['openai', 'OpenAI key', 'Paste key', 'https://platform.openai.com/api-keys', 'platform.openai.com'], ['gemini', 'Gemini key', 'Paste key', 'https://aistudio.google.com/apikey', 'aistudio.google.com']].map(([p, n, ph, url, host]) => `<div class="srow" data-key="${p}" hidden><div class="tx"><b>${n}</b><span class="hint" id="st-${p}" data-url="${url}" data-host="${host}">Checking…</span>
          <form class="aif" data-p="${p}"><input type="password" placeholder="${ph}" autocomplete="off" spellcheck="false" aria-label="${n}"><button class="sm">Save</button></form><span class="err"></span></div></div>`).join('')}
        <div class="srow"><div class="tx"><b>Model</b><span class="hint" id="aiFrom">Checking…</span>
          <form id="cmf" hidden><input id="cmIn" placeholder="Model name from your provider’s docs" autocomplete="off" spellcheck="false" aria-label="Model name"><button class="sm">Use</button></form><span class="err" id="cmErr"></span></div>
          <select id="aiModel" aria-label="Model"></select></div>
        <div class="srow"><div class="tx"><b>Unsplash photos <span class="hint">(optional, free)</span></b><span class="hint" id="ustat">Checking…</span><span class="hint">Create an app at <a href="https://unsplash.com/oauth/applications" target="_blank" rel="noopener">unsplash.com/developers</a> and paste its Access Key.</span>
          <form id="uf"><input id="uin" type="password" placeholder="Unsplash Access Key" autocomplete="off" spellcheck="false" aria-label="Unsplash Access Key"><button class="sm">Save</button></form><span class="err" id="uerr"></span></div></div>
      </div>
    </div>
    <div><div class="secH"><h2>Appearance</h2></div>
      <div class="rows"><div class="srow"><div class="tx"><b>Theme</b><span class="hint">Dark unless you choose otherwise. System follows your Mac. The editor uses the same setting.</span></div>
        <select id="themeSel" aria-label="Theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div></div></div>
    <div><div class="secH"><h2>About</h2></div>
      <div class="rows">
        <div class="srow"><div class="tx"><b>Projects folder</b><span class="hint" id="adir"></span></div></div>
        <div class="srow"><div class="tx"><b>Version</b><span class="hint" id="aver"></span></div><a class="btn ghost sm" href="https://github.com/squarepegng/tovi" target="_blank" rel="noopener">GitHub</a></div>
        <div class="srow"><div class="tx"><b>In the editor</b><span class="hint">Editor preferences (Tovi at work, AI style, look-alikes…) are in the editor: Tovi menu → Settings, or ⌘,</span></div></div>
      </div>
    </div>
  </section>

  <section class="view" id="v-help" aria-labelledby="hT">
    <div><h1 id="hT">How Tovi works</h1><p>Edit your team’s real app like a Figma file. Every change is written to the code, and goes to developers as one pull request.</p></div>
    <div class="steps">
      <div class="step"><i>1</i><b>Open a project</b><span>Paste a GitHub link or a folder. Tovi runs the app on this Mac.</span></div>
      <div class="step"><i>2</i><b>Use and select</b><span>Interact (P) to use the app; Select (V) to pick anything and edit it in the panel.</span></div>
      <div class="step"><i>3</i><b>Ask or annotate</b><span>Tell Tovi what to change in the chat, or mark the screen (A) and apply your notes.</span></div>
      <div class="step"><i>4</i><b>Hand off</b><span>Send every change to developers as one pull request.</span></div>
    </div>
    <div><div class="secH"><h2>Shortcuts</h2></div>
      <table class="keys"><tbody>
        <tr><td>Interact with the app</td><td><kbd>P</kbd></td></tr>
        <tr><td>Select</td><td><kbd>V</kbd></td></tr>
        <tr><td>Click through while selecting</td><td><kbd>⌘</kbd> + click</td></tr>
        <tr><td>Annotate</td><td><kbd>A</kbd></td></tr>
        <tr><td>Ask Tovi (chat)</td><td><kbd>⌘K</kbd></td></tr>
        <tr><td>Add an element</td><td><kbd>I</kbd></td></tr>
        <tr><td>Undo</td><td><kbd>⌘Z</kbd></td></tr>
        <tr><td>Settings</td><td><kbd>⌘,</kbd></td></tr>
      </tbody></table>
    </div>
  </section>
</main></div>
<script>
// Theme: dark by default; "System" follows the Mac. A local copy is applied first so the page doesn't flash.
function applyTheme(t){t=t==='light'||t==='system'?t:'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('kerf.theme',t)}catch{}const s=document.getElementById('themeSel');if(s)s.value=t}
try{applyTheme(localStorage.getItem('kerf.theme'))}catch{}
fetch('/api/prefs').then(r=>r.json()).then(p=>applyTheme(p.theme)).catch(()=>{});
document.addEventListener('change',e=>{if(e.target.id!=='themeSel')return;applyTheme(e.target.value);fetch('/api/prefs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:e.target.value})})});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
function route(){const v=(location.hash||'#projects').slice(1);const ok=['projects','settings','help'].includes(v)?v:'projects';document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+ok));document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('on',a.dataset.v===ok));}
addEventListener('hashchange',route);route();
let polling=null,started=false;
async function open(source){
  location.hash='#projects';$('go').disabled=true;started=true;
  const r=await fetch('/api/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source})});
  if(!r.ok){const j=await r.json();$('job').innerHTML='<div class="card"><span class="err">'+esc(j.error)+'</span></div>';$('go').disabled=false;return}
  poll();
}
async function poll(){
  clearTimeout(polling);
  const j=await (await fetch('/api/job')).json();
  if(!j){return}
  const done=j.url||j.error;
  $('job').innerHTML='<div class="card"><div class="status">'+(j.error?'<span class="err">'+esc(j.error)+'</span>':j.url?'Ready':'<span class="spin"></span>'+esc(j.step))+'</div>'+
    (j.url?'<a class="btn sm" style="align-self:flex-start" href="'+esc(j.url)+'">Open in Tovi</a>':'')+'<details class="logs"'+(j.error||window.__logsOpen?' open':'')+'><summary>Technical details</summary><pre id="log">'+esc(j.log.trim())+'</pre></details></div>';
  const dd=document.querySelector('#job details');if(dd)dd.ontoggle=()=>{window.__logsOpen=dd.open};
  const l=$('log');if(l)l.scrollTop=l.scrollHeight;
  if(j.url&&started){const d=$('diagOn')?.checked;location.href=j.url+(d?(j.url.includes('?')?'&':'?')+'diagnose=1':'');return}
  if(done){$('go').disabled=false;loadRecent();return}
  polling=setTimeout(poll,700);
}
const ago=t=>{const s=(Date.now()-t)/1000;return s<3600?Math.max(1,Math.round(s/60))+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' d ago'};
// Projects: All or Running, sorted, as big previews or a list. The card shows the app as it last looked in Tovi.
let LIST=[],F='all',Q='',VIEW='grid';try{VIEW=localStorage.getItem('kerf.view')==='list'?'list':'grid'}catch{}
const LOGO='<svg width="44" height="44" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="5.5" height="10" rx="1.5" fill="currentColor"/><rect x="8.5" y="3" width="5.5" height="10" rx="1.5" fill="currentColor"/></svg>';
const nm=p=>p.name||String(p.source).split('/').filter(Boolean).pop();
function card(p){return '<button class="proj" data-src="'+esc(p.source)+'"'+(p.url?' data-url="'+esc(p.url)+'"':'')+'><span class="shot"><span class="ph">'+LOGO+'</span>'+(p.thumb?'<img src="/api/thumb?id='+encodeURIComponent(p.id)+'&t='+p.thumb+'" alt="" loading="lazy" onerror="this.remove()">':'')+'</span><span class="info"><span class="tx"><b>'+esc(nm(p))+'</b><span class="src">'+esc(p.source)+'</span><span class="when">Opened '+ago(p.at)+'</span></span>'+(p.url?'<span class="run">Running</span>':'')+'</span></button>'}
function showOpen(on,first){const c=$('openCard');c.hidden=!on;$('openBtn').setAttribute('aria-expanded',on);$('openBtn').hidden=!!first;$('oT').textContent=first?'Open your first project':'Open a project';if(on&&!first)setTimeout(()=>$('src').focus(),0)}
function renderList(){
  const has=LIST.length;$('ptools').hidden=!has;if(!has)showOpen(true,true);else $('openBtn').hidden=false;
  $('nAll').textContent=has;$('nRun').textContent=LIST.filter(p=>p.url).length;
  let l=LIST.filter(p=>F==='all'||p.url).filter(p=>!Q||(nm(p)+' '+p.source).toLowerCase().includes(Q));
  if($('sort').value==='name')l=[...l].sort((a,b)=>nm(a).localeCompare(nm(b)));
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===VIEW));
  $('recent').className='grid'+(VIEW==='list'?' list':'');
  $('recent').innerHTML=l.length?l.map(card).join(''):has?'<div class="empty">'+(Q?'No projects match “'+esc(Q)+'”.':'Nothing is running right now.')+'</div>':'';
}
async function loadRecent(){LIST=await (await fetch('/api/recent')).json();renderList()}
$('openBtn').addEventListener('click',()=>showOpen($('openCard').hidden));
document.querySelector('.seg[aria-label="Show"]').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;F=b.dataset.f;b.parentNode.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));renderList()});
document.querySelector('.seg.vt').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;VIEW=b.dataset.view;try{localStorage.setItem('kerf.view',VIEW)}catch{}renderList()});
$('sort').addEventListener('change',renderList);
$('q').addEventListener('input',e=>{Q=e.target.value.trim().toLowerCase();if(location.hash&&location.hash!=='#projects')location.hash='#projects';renderList()});
addEventListener('keydown',e=>{if(e.key==='/'&&!e.target.closest('input,textarea,select')){e.preventDefault();$('q').focus()}else if(e.key==='Escape'&&!$('openCard').hidden&&LIST.length)showOpen(false)});
$('f').addEventListener('submit',e=>{e.preventDefault();const v=$('src').value.trim();if(v)open(v)});
$('recent').addEventListener('click',e=>{const b=e.target.closest('[data-src]');if(!b)return;if(b.dataset.url){location.href=b.dataset.url;return}$('src').value=b.dataset.src;open(b.dataset.src)});
async function loadKey(){const s=await (await fetch('/api/key-status')).json();
  $('keystat').innerHTML=s.set?'<span class="ok">Saved.</span> Paste a new key to replace it.':'No key yet. Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.';
  for(const p of ['openai','gemini']){const el=$('st-'+p);el.innerHTML=s[p]?'<span class="ok">Saved.</span> Paste a new key to replace it.':'No key yet. Get one at <a href="'+el.dataset.url+'" target="_blank" rel="noopener">'+el.dataset.host+'</a>.'}
  AI=s;if(!vp)vp=s.provider;renderAI();
  $('ustat').innerHTML=s.unsplash?'<span class="ok">Saved.</span> Photo search is on.':'Not set: photo search is off.';
  $('keyBanner').hidden=s.provider==='anthropic'?!!s.set:!!s[s.provider];}
async function loadAbout(){try{const a=await (await fetch('/api/about')).json();$('ver').textContent='Version '+a.version;$('aver').textContent=a.version;$('adir').textContent=a.projectsDir+' (Tovi’s copies of the repos you open)';}catch{}}
$('uf').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/unsplash-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:$('uin').value})});const j=await r.json();if(!r.ok){$('uerr').textContent=j.error;return}$('uin').value='';$('uerr').textContent='';loadKey()});
$('kf').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:$('kin').value})});const j=await r.json();if(!r.ok){$('kerr').textContent=j.error;return}$('kin').value='';$('kerr').textContent='';loadKey()});
document.querySelectorAll('.aif').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const i=f.querySelector('input'),er=f.parentNode.querySelector('.err');const r=await fetch('/api/ai-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:f.dataset.p,key:i.value})});const j=await r.json();if(!r.ok){er.textContent=j.error;return}i.value='';er.textContent='';loadKey()}));
// AI: pick a provider, add its key, then pick one of its models. Picking the model is what switches Tovi over.
let AI=null,vp=null;
const hasKey=p=>p==='anthropic'?AI.set:AI[p];
async function renderAI(){
  $('aiProv').value=vp;
  document.querySelectorAll('[data-key]').forEach(r=>r.hidden=r.dataset.key!==vp);
  $('aiNow').textContent='In use: '+AI.labels[AI.provider]+' · '+AI.model;
  const sel=$('aiModel');sel.disabled=true;$('aiFrom').textContent='Loading models…';
  const m=await (await fetch('/api/models?provider='+vp)).json();
  const cur=vp===AI.provider,known=cur&&m.models.some(x=>x.id===AI.model);
  sel.innerHTML=(cur?'':'<option value="" disabled selected>Choose a model</option>')+m.models.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('')+'<option value="__other">Other model…</option>';
  if(cur)sel.value=known?AI.model:'__other';
  $('cmf').hidden=!(cur&&!known);if(cur&&!known)$('cmIn').value=AI.model;
  sel.disabled=false;
  $('aiFrom').textContent=m.live?'Every model your '+AI.labels[vp]+' key can use.':hasKey(vp)?'Couldn’t reach '+AI.labels[vp]+'. Showing the usual models.':'Add your '+AI.labels[vp]+' key above to see every model.';
  if(!cur)$('aiFrom').textContent+=' Choosing one switches Tovi to '+AI.labels[vp]+'.';}
async function setModel(provider,model){const r=await fetch('/api/ai-provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,model})});const j=await r.json();$('cmErr').textContent=r.ok?'':j.error;if(r.ok){$('cmf').hidden=true;loadKey()}}
$('aiProv').addEventListener('change',e=>{vp=e.target.value;$('cmf').hidden=true;$('cmErr').textContent='';renderAI()});
$('aiModel').addEventListener('change',e=>{const v=e.target.value;if(v!=='__other')return setModel(vp,v);$('cmf').hidden=false;$('cmIn').value='';$('cmIn').focus()});
$('cmf').addEventListener('submit',e=>{e.preventDefault();const m=$('cmIn').value.trim();if(m)setModel(vp,m)});
try{const v=localStorage.getItem('kerf.diagOn');if(v!=null)$('diagOn').checked=v==='1'}catch{}
$('diagOn').addEventListener('change',e=>{try{localStorage.setItem('kerf.diagOn',e.target.checked?'1':'0')}catch{}});
loadKey();loadRecent();loadAbout();poll();
</script></body></html>`;
