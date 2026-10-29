// Tovi editor. The team's real app runs in the iframe; this window holds the
// editor around it (top bar, layers, design panel, toolbar). The iframe is
// same-origin, so the editor reads and outlines the app's DOM directly.
(() => {
  /* ---------- api ---------- */
  const api = (route, body) =>
    fetch('/__kerf' + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.statusText);
      return j;
    });

  /* ---------- state ---------- */
  const S = {
    mode: 'edit', tool: 'select', through: false, space: false, tab: 'design', side: 'design', device: 'desktop',
    sel: null, hover: null, theme: null, project: null, scope: 'all',
    count: 0, corners: false, cpick: null, editing: null, changesOpen: false,
    chat: [], card: null, askOpen: false, shape: 'box', notes: [], noteDraft: null, amber: [],
    versions: { versions: [], draft: [], peeking: null }, open: {}, multi: [], alt: false, handleDrag: null, path: '/', hintSeen: false, layersOpen: innerWidth >= 900, left: (() => { try { return localStorage.getItem('kerf.left') || 'chat'; } catch { return 'chat'; } })(),
  };
  const $ = (id) => document.getElementById(id);
  // What a click on the app does: Interact (or holding ⌘) passes it to the app; Select picks the element.
  const appClicks = () => S.mode === 'preview' || S.tool === 'interact' || (S.tool === 'select' && S.through);
  const picking = () => S.mode === 'edit' && S.tool === 'select' && !S.through;
  // ⌘ (Ctrl on Windows) held during a click while selecting: the click goes to the app.
  const thru = (e) => S.mode === 'edit' && S.tool === 'select' && !!(e.metaKey || e.ctrlKey);
  const frame = $('frame');
  let W = null, D = null; // the app's window and document

  /* ---------- properties ---------- */
  const PX = (css) => (v) => ({ [css]: v + 'px' });
  const PROPS = {
    bg: { css: (v) => ({ background: v }) },
    color: { css: (v) => ({ color: v }) },
    borderC: { css: (v) => ({ 'border-color': v }) },
    fontSize: { min: 6, max: 200, css: PX('font-size') },
    fontWeight: { css: (v) => ({ 'font-weight': v }) },
    lineHeight: { min: 0, max: 200, css: PX('line-height') },
    letterSpacing: { min: -20, max: 50, css: (v) => ({ 'letter-spacing': v / 100 + 'em' }) },
    align: { css: (v) => ({ 'text-align': v }) },
    radius: { max: 999, css: PX('border-radius') },
    rTL: { max: 999, css: PX('border-top-left-radius') },
    rTR: { max: 999, css: PX('border-top-right-radius') },
    rBR: { max: 999, css: PX('border-bottom-right-radius') },
    rBL: { max: 999, css: PX('border-bottom-left-radius') },
    padX: { max: 400, css: (v) => ({ 'padding-left': v + 'px', 'padding-right': v + 'px' }) },
    padY: { max: 400, css: (v) => ({ 'padding-top': v + 'px', 'padding-bottom': v + 'px' }) },
    gap: { max: 400, css: PX('gap') },
    borderW: { max: 20, css: (v) => ({ 'border-width': v + 'px', 'border-style': 'solid' }) },
    opacity: { max: 100, css: (v) => ({ opacity: v / 100 }) },
    shadow: { css: () => ({}) },
    mX: { min: -400, max: 400, css: (v) => ({ 'margin-left': v + 'px', 'margin-right': v + 'px' }) },
    mY: { min: -400, max: 400, css: (v) => ({ 'margin-top': v + 'px', 'margin-bottom': v + 'px' }) },
    w: { max: 4000, css: PX('width') },
    h: { max: 4000, css: PX('height') },
  };
  // The app's scale for a property, as sorted numbers: font sizes, spacing, radius…
  const SCALE_OF = { fontSize: 'fontSize', lineHeight: 'lineHeight', radius: 'radius', rTL: 'radius', rTR: 'radius', rBR: 'radius', rBL: 'radius', padX: 'spacing', padY: 'spacing', mX: 'spacing', mY: 'spacing', gap: 'spacing', w: 'spacing', h: 'spacing', borderW: 'borderWidth', opacity: 'opacity' };
  function scaleSteps(p) {
    const m = S.theme?.byKey?.[SCALE_OF[p]];
    if (!m) return null;
    const v = [...new Set(Object.values(m).filter((x) => typeof x === 'number' && isFinite(x) && x < 9999))].sort((a, b) => a - b);
    return v.length > 2 ? v : null;
  }
  const clamp = (p, v) => Math.max(PROPS[p].min ?? 0, Math.min(PROPS[p].max ?? 9999, v));
  // An element from a page that has since reloaded has no window: fall back to the current one.
  const cs = (el) => (el.ownerDocument?.defaultView || W || window).getComputedStyle(el);
  const rgbHex = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m) return '';
    if (m.length > 3 && +m[3] === 0) return 'transparent';
    return '#' + m.slice(0, 3).map((x) => ('0' + Math.round(+x).toString(16)).slice(-2)).join('').toUpperCase();
  };
  function read(p, el) {
    if (!el || !el.isConnected) return '';
    const c = cs(el), fs = parseFloat(c.fontSize);
    switch (p) {
      case 'bg': return rgbHex(c.backgroundColor);
      case 'color': return rgbHex(c.color);
      case 'borderC': return rgbHex(c.borderTopColor);
      case 'fontSize': return Math.round(fs);
      case 'fontWeight': return Number(c.fontWeight);
      case 'lineHeight': return c.lineHeight === 'normal' ? Math.round(fs * 1.2) : Math.round(parseFloat(c.lineHeight));
      case 'letterSpacing': return c.letterSpacing === 'normal' ? 0 : Math.round((parseFloat(c.letterSpacing) / fs) * 1000) / 10;
      case 'align': { const a = c.textAlign; return a === 'start' ? 'left' : a === 'end' ? 'right' : a; }
      case 'radius': case 'rTL': return Math.round(parseFloat(c.borderTopLeftRadius));
      case 'rTR': return Math.round(parseFloat(c.borderTopRightRadius));
      case 'rBR': return Math.round(parseFloat(c.borderBottomRightRadius));
      case 'rBL': return Math.round(parseFloat(c.borderBottomLeftRadius));
      case 'padX': return Math.round(parseFloat(c.paddingLeft));
      case 'padY': return Math.round(parseFloat(c.paddingTop));
      case 'gap': return Math.round(parseFloat(c.columnGap)) || 0;
      case 'borderW': return Math.round(parseFloat(c.borderTopWidth));
      case 'opacity': return Math.round(Number(c.opacity) * 100);
      case 'mX': return Math.round(parseFloat(c.marginLeft)) || 0;
      case 'mY': return Math.round(parseFloat(c.marginTop)) || 0;
      case 'w': return Math.round(el.getBoundingClientRect().width);
      case 'h': return Math.round(el.getBoundingClientRect().height);
    }
    return '';
  }

  /* ---------- theme helpers ---------- */
  const SHADES = /-(50|[1-9]00|950)$/;
  const tokens = () => Object.entries(S.theme?.colors || {}).filter(([k]) => !SHADES.test(k) && !['inherit', 'current'].includes(k));
  // Token colors are CSS variables defined by the app, so resolve them in the app's document.
  function swatch(v) {
    const css = String(v).replace('<alpha-value>', '1');
    if (!D || !css.includes('var(')) return css;
    const probe = D.createElement('span');
    probe.style.color = css;
    D.body.appendChild(probe);
    const out = cs(probe).color;
    probe.remove();
    return out;
  }
  function tokenOf(prop) {
    const pre = { bg: 'bg-', color: 'text-', borderC: 'border-' }[prop];
    const cls = (info()?.classes || []).filter((c) => !c.includes(':') && c.startsWith(pre)).map((c) => c.slice(pre.length).split('/')[0]);
    return cls.find((c) => S.theme && c in S.theme.colors) || (cls.find((c) => /^\[#/.test(c)) || '').replace(/[[\]]/g, '');
  }
  function shadowOf() {
    const c = (info()?.classes || []).find((x) => !x.includes(':') && (x === 'shadow' || x.startsWith('shadow-')));
    if (!c) return 'none';
    return c === 'shadow' ? 'DEFAULT' : c.slice(7);
  }

  /* ---------- selection ---------- */
  const pick = (t) => (t && t.closest ? t.closest('[data-kerf],[data-kerf-use]') : null);
  const defOf = (el) => el.getAttribute('data-kerf');
  const useOf = (el) => el.getAttribute('data-kerf-use');
  const layerIcon = (el) => { const k = kindOf(el); return / icon$|^Icon$/.test(k) ? 'spark' : k === 'Image' ? 'image' : useOf(el) && /^[A-Z]/.test(el.getAttribute('data-kerf-n') || '') ? 'comp' : TEXTY.has(k) && !el.childElementCount ? 'text' : k === 'Row' ? 'padH' : k === 'Stack' ? 'padV' : 'frame'; };
  const nameOf = (el) => el.getAttribute('data-kerf-n') || el.tagName.toLowerCase();
  const fileName = (loc) => (loc || '').split(':')[0].split('/').pop();
  /* names a designer would use: "Title “Stratemark”", "Button “Enter”", "Row", "Key round icon" */
  const TAGN = { h1: 'Title', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading', p: 'Text', span: 'Text', strong: 'Text', em: 'Text', small: 'Text', b: 'Text', i: 'Text', label: 'Label', a: 'Link', button: 'Button', img: 'Image', picture: 'Image', svg: 'Icon', input: 'Input', textarea: 'Text box', select: 'Dropdown', form: 'Form', ul: 'List', ol: 'List', li: 'List item', nav: 'Navigation', header: 'Header', footer: 'Footer', aside: 'Sidebar', section: 'Section', main: 'Page', article: 'Card', hr: 'Divider', video: 'Video', table: 'Table', tr: 'Table row', td: 'Cell', th: 'Cell', code: 'Code', blockquote: 'Quote', dialog: 'Dialog' };
  const TEXTY = new Set(['Title', 'Heading', 'Text', 'Label', 'Link', 'Button', 'List item', 'Quote', 'Cell']);
  const camelWords = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  const clip = (t, n = 24) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  function kindOf(el) {
    const tag = el.tagName.toLowerCase(), comp = el.getAttribute('data-kerf-n');
    if (comp && /^[A-Z]/.test(comp)) { const w = camelWords(comp); return tag === 'svg' || /Icon$/.test(comp) ? `${w.replace(/ Icon$/, '')} icon` : w; }
    if (TAGN[tag]) return TAGN[tag];
    if (!el.childElementCount && (el.textContent || '').trim()) return 'Text';
    const c = cs(el);
    if (c.display.includes('grid')) return 'Grid';
    if (c.display.includes('flex')) return c.flexDirection.startsWith('column') ? 'Stack' : 'Row';
    return 'Frame';
  }
  // The words shown next to an element: its text, placeholder or alt text.
  function wordsOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') return clip(el.getAttribute('alt'));
    if (tag === 'input' || tag === 'textarea') return clip(el.getAttribute('placeholder') || el.value);
    return clip(el.textContent);
  }
  function dName(el) {
    if (!el) return '';
    const k = kindOf(el), w = wordsOf(el);
    return w && (TEXTY.has(k) || el.getAttribute('data-kerf-n') || /^(input|textarea|img)$/i.test(el.tagName)) && !/ icon$/.test(k) ? `${k} “${w}”` : k;
  }
  const activeLoc = () => (S.sel ? (S.scope === 'here' ? S.sel.use || S.sel.def : S.sel.def || S.sel.use) : null);
  const cvaParam = () => (S.sel?.defInfo?.cva && activeLoc() === S.sel.def ? { mode: S.scope === 'variant' ? 'variant' : 'all', active: activeVariant() } : undefined);
  const info = () => (S.sel ? (activeLoc() === S.sel.def ? S.sel.defInfo : S.sel.useInfo) : null);
  const q = (loc) => `[data-kerf="${CSS.escape(loc)}"],[data-kerf-use="${CSS.escape(loc)}"]`;
  const sameLoc = (el) => (D ? D.querySelectorAll(defOf(el) ? `[data-kerf="${CSS.escape(defOf(el))}"]` : `[data-kerf-use="${CSS.escape(useOf(el))}"]`) : []);

  async function select(el) {
    S.srcScope = 'key';
    S.iconQ = null;
    closeIconPop?.();
    if (!el) { S.multi = []; S.sel = null; S.cpick = null; renderPanel(); renderLayers(); chatCtx(); return; }
    S.pageSel = false;
    const list = [...sameLoc(el)];
    S.sel = { el, def: defOf(el), use: useOf(el), idx: Math.max(0, list.indexOf(el)), repeat: list.length, defInfo: null, useInfo: null };
    if (!S.sel.def) S.scope = 'here';
    else if (!S.sel.use) S.scope = 'all';
    S.cpick = null;
    let p = el.parentElement;
    while (p) { const t = pick(p); if (!t) break; S.open[keyOf(t)] = true; p = t.parentElement; }
    renderPanel();
    renderLayers();
    chatCtx();
    await loadInfo();
    if (S.pendingInsert && S.sel?.el === el) { S.pendingInsert = false; $('toast').hidden = true; S.insertPos = defaultPos(); openInsert(); }
  }
  // The chat box says what Tovi will look at: the selection, or the whole screen.
  function chatCtx() {
    const c = document.querySelector('#lbody .kcCtx');
    if (c) c.innerHTML = `${ico(S.sel ? 'frame' : 'desktop', 12)}${S.sel ? esc(dName(S.sel.el)) : 'Whole screen'}`;
  }
  // Where this instance of a component is used. Components that don't pass their props through to the HTML
  // leave no tag on the page, but React (in development) still knows each element's component and its props.
  function usageOf(el, comp) {
    for (let h = el; h; h = h.parentElement) if (h.getAttribute?.('data-kerf-use') && h.getAttribute('data-kerf-n') === comp) return h.getAttribute('data-kerf-use');
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    let f = key ? el[key] : null;
    for (let i = 0; f && i < 300; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && p['data-kerf-n'] === comp && p['data-kerf-use']) return p['data-kerf-use'];
    }
    return null;
  }
  // Look-alikes: copies written separately in the code that look the same (four feature cards), and the
  // matching parts inside them (each card's title). Style edits can go to all of them, like Figma's
  // "select matching layers". Copies made by one piece of code are already "Repeated" and left out.
  S.simScope = (() => { try { return localStorage.getItem('kerf.sim') || 'all'; } catch { return 'all'; } })();
  S.scaleArrows = (() => { try { return localStorage.getItem('kerf.scale') !== 'off'; } catch { return true; } })();
  const baseCls = (e) => new Set([...e.classList].filter((c) => !c.includes(':')));
  function overlap(a, b) {
    const A = baseCls(a), B = baseCls(b);
    if (!A.size && !B.size) return 1;
    let n = 0;
    for (const c of A) if (B.has(c)) n++;
    return n / (A.size + B.size - n);
  }
  const shape = (e) => e.tagName + '>' + [...e.children].map((c) => c.tagName).join(',');
  const looksLike = (a, b) => a.tagName === b.tagName && shape(a) === shape(b) && overlap(a, b) >= 0.5;
  const isTagged = (e) => e.matches?.('[data-kerf],[data-kerf-use]');
  function similarOf(el) {
    if (!el?.isConnected || !isTagged(el)) return [];
    let unit = el;
    const path = [];
    for (let depth = 0; depth < 6 && unit.parentElement && unit.parentElement !== D.body; depth++) {
      const sibs = [...unit.parentElement.children].filter((x) => x !== unit && looksLike(x, unit) && (defOf(x) || useOf(x)) !== (defOf(unit) || useOf(unit)));
      if (sibs.length) {
        const out = [];
        for (const sb of sibs) {
          let t = sb;
          for (const i of path) { t = t?.children[i]; if (!t) break; }
          if (t && t.tagName === el.tagName && isTagged(t) && overlap(t, el) >= 0.5 && (defOf(t) || useOf(t)) !== (defOf(el) || useOf(el))) out.push(t);
        }
        return out.slice(0, 40);
      }
      path.unshift([...unit.parentElement.children].indexOf(unit));
      unit = unit.parentElement;
    }
    return [];
  }
  async function loadInfo() {
    const s = S.sel;
    if (!s) return;
    const dom = [...s.el.classList];
    const get = (loc) => (loc ? api('/inspect', { loc, dom }).catch((e) => ({ error: e.message })) : null);
    const [d, u] = await Promise.all([get(s.def), get(s.use)]);
    if (S.sel !== s) return;
    // Text that's a component prop ({title}, {children}): edit the string where the component is used.
    for (const inf of [d, u]) {
      const vp = inf?.text?.viaProp;
      if (!vp || inf.text.editable) continue;
      const useLoc = usageOf(s.el, vp.comp);
      const ui = !useLoc ? null : useLoc === s.use ? u : await get(useLoc);
      if (S.sel !== s) return;
      const file = useLoc ? useLoc.replace(/:\d+:\d+$/, '').split('/').pop() : '';
      const val = vp.prop === 'children' ? (ui?.text?.editable ? ui.text.value : null) : (ui?.props || []).find((x) => x.name === vp.prop && x.editable && x.kind === 'string')?.value;
      if (val != null) inf.text = { editable: true, value: String(val), via: { loc: useLoc, prop: vp.prop, file } };
      else if (useLoc) inf.text = { editable: false, reason: `This text is passed in from ${file}, where it’s set by code. Change it there, or ask a developer.` };
    }
    // A component that passes everything through (<button {...props} />) gets its label where it's used.
    if (d && !d.error && !d.text?.editable && u?.text?.editable && !d.text?.via) {
      d.text = { editable: true, value: u.text.value, via: { loc: s.use, prop: 'children', file: s.use.replace(/:\d+:\d+$/, '').split('/').pop() } };
    }
    s.defInfo = d;
    s.useInfo = u;
    s.similar = similarOf(s.el);
    renderPanel();
  }
  // After an edit the app re-renders and the element may be a new node: find it again.
  function refind() {
    const s = S.sel;
    if (!s || !D || (s.el.isConnected && s.el.ownerDocument === D)) return;
    const list = D.querySelectorAll(s.def ? `[data-kerf="${CSS.escape(s.def)}"]` : `[data-kerf-use="${CSS.escape(s.use)}"]`);
    if (list.length) { s.el = list[Math.min(s.idx, list.length - 1)]; s.repeat = list.length; }
  }

  /* ---------- editing ---------- */
  let previewed = null;
  function preview(el, prop, value) {
    const css = PROPS[prop].css(value);
    for (const k in css) el.style.setProperty(k, css[k], 'important');
    previewed = { el, keys: Object.keys(css) };
  }
  function clearPreview() {
    if (!previewed) return;
    previewed.keys.forEach((k) => previewed.el.style.removeProperty(k));
    previewed = null;
  }
  async function commit(change) {
    // Component properties always belong to this use of the component.
    const loc = change.props?.length && S.sel?.use ? S.sel.use : activeLoc();
    if (!loc) return;
    const via = change.text != null && !S.multi.length ? info()?.text?.via : null;
    if (via) {
      // The text is a prop of a component: change the string where this one is used.
      try {
        const who = S.sel ? dName(S.sel.el) : '';
        const r = await api('/edit', via.prop === 'children' ? { loc: via.loc, text: change.text, name: who } : { loc: via.loc, props: [{ name: via.prop, value: change.text }], propText: true, name: who });
        if (r.changed) { S.count = r.n; toast(`${who} · Text “${change.text}”`, `Changed where it’s used, in ${via.file}`, false, true); }
        afterEdit();
      } catch (e) { toast(e.message, '', true); }
      return;
    }
    try {
      // Look-alikes follow style changes (never text or component properties, which are each their own).
      const alike = !S.multi.length && S.simScope === 'all' && change.ops?.length && change.text == null && !change.props?.length ? (S.sel?.similar || []).filter((x) => x.isConnected) : [];
      const group = S.multi.length ? S.multi : alike.map((el) => ({ el, def: defOf(el), use: useOf(el) }));
      if (group.length) {
        // Several at once: apply the same change to each one, in a safe order, as one undo step.
        const edits = [{ loc, ...change, cva: cvaParam(), name: dName(S.sel.el), dom: [...S.sel.el.classList] }, ...group.map((m) => ({ loc: locOf(m), ...change, name: dName(m.el), dom: [...m.el.classList] }))];
        const r = await api('/ai/apply', { batch: Date.now(), edits: edits.map((e) => ({ loc: e.loc, ops: e.ops || [], props: e.props || [], text: e.text, name: e.name, dom: e.dom, bp: bpParam() })) });
        S.count = r.n;
        const ok = r.results.filter((x) => x.ok && x.changed).length;
        toast(`${ok} element${ok === 1 ? '' : 's'} · ${(r.results.find((x) => x.summary)?.summary.labels || []).join(' · ')}`, r.results.some((x) => !x.ok) ? r.results.find((x) => !x.ok).error : '', false, true);
      } else {
        const r = await api('/edit', { loc, ...change, cva: cvaParam(), bp: bpParam(), dom: S.sel ? [...S.sel.el.classList] : [], scope: S.srcScope || 'key', name: S.sel ? dName(S.sel.el) : null });
        if (r.changed) {
          S.count = r.n;
          const sm = r.summary;
          const who = S.sel ? dName(S.sel.el) : '';
          const where = sm.scope === 'variant' ? ` (all “${activeVariant()?.variant}”)` : sm.scope === 'all' ? ' (every one)' : '';
          if (sm.size) sm.labels = (sm.labels || []).map((l) => l.replace(/ \((only on \w+|all sizes)\)$/, ''));
          toast(`${who}${where} · ${(sm.labels || []).join(' · ')}${sm.size ? ` · ${sm.size.toLowerCase()}` : ''}`, sm.offScale.length ? 'Some values are off your design scale' : '', false, true, `${fileName(r.file)}: ${[sm.removed.join(' ') || '—', sm.added.join(' ')].join(' → ')}`);
        }
      }
      afterEdit();
    } catch (e) {
      clearPreview();
      toast(e.message, '', true);
    }
  }
  // Remove a style the way a developer would: delete the element's own class. Only if the style still shows
  // (it comes from somewhere else, like a CSS class) add an override such as shadow-none or border-0.
  async function clearStyle(ops, override, stillShows) {
    await commit({ ops });
    await new Promise((r) => setTimeout(r, 900));
    refind();
    if (S.sel?.el && stillShows(S.sel.el)) await commit({ ops: override });
  }
  function afterEdit() {
    // Give Vite and Tailwind a moment to reload, then show the real result.
    [250, 700, 1500].forEach((ms) => setTimeout(() => { clearPreview(); refind(); loadInfo(); renderLayers(); }, ms));
    refreshVersions();
    renderBar();
    renderTop();
  }
  const pending = {};
  function commitSoon(prop, value) {
    clearTimeout(pending[prop]);
    pending[prop] = setTimeout(() => commit({ ops: [{ prop, value }] }), 450);
  }
  async function undo() {
    try {
      const r = await api('/undo', {});
      if (r.undone) { S.count = r.n; toast(r.label ? `Undone: ${r.label}` : 'Undone'); afterEdit(); renderChanges(); }
      else toast('Nothing to undo');
    } catch (e) { toast(e.message, '', true); }
  }

  /* ---------- text editing on the canvas ---------- */
  function beginText() {
    const s = S.sel, ti = info()?.text;
    if (!s || !ti) return;
    if (!ti.editable) { toast(ti.reason, '', true); return; }
    const el = s.el, orig = el.textContent;
    S.editing = el;
    el.contentEditable = 'true';
    el.focus();
    const r = D.createRange();
    r.selectNodeContents(el);
    const sel = W.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const done = (save) => {
      el.removeEventListener('keydown', kd, true);
      el.removeEventListener('blur', bl);
      el.contentEditable = 'false';
      S.editing = null;
      const v = el.textContent.trim();
      if (save && v && v !== orig.trim()) commit({ text: v });
      else el.textContent = orig;
    };
    const kd = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); el.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); el.removeEventListener('blur', bl); done(false); }
    };
    const bl = () => done(true);
    el.addEventListener('keydown', kd, true);
    el.addEventListener('blur', bl);
  }

  /* ---------- icons ---------- */
  const IC = {
    kerf: '<rect x="2" y="3" width="5.5" height="10" rx="1.5" fill="currentColor"/><rect x="8.5" y="3" width="5.5" height="10" rx="1.5" fill="currentColor" opacity=".45"/>',
    play: '<path d="M5 3.2v9.6l7.5-4.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
    edit: '<rect x="2" y="2" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8.5 8.5l5.2 2-2.3.7-.7 2.3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
    undo: '<path d="M4 6h6a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6.5 3.5L4 6l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    cursor: '<path d="M4 2.5l8.5 5.2-3.7.9 2.1 4.1-1.5.8-2.1-4.2L4.6 12z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
    tap: '<path d="M6.5 8.5V3.2a1.1 1.1 0 0 1 2.2 0v4.3m0-1.1a1.1 1.1 0 0 1 2.2 0v1.3m0-.4a1.1 1.1 0 0 1 2.1 0V10a4 4 0 0 1-4 4H8.6a3.6 3.6 0 0 1-2.9-1.5L3.4 9.4a1.1 1.1 0 0 1 1.7-1.3l1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
    hand: '<path d="M5.2 8.6V4.4a1 1 0 0 1 2 0v3.4m0-4.6a1 1 0 0 1 2 0v4.4m0-3.4a1 1 0 0 1 2 0v3.6m0-2a1 1 0 0 1 2 0v3.4A4.6 4.6 0 0 1 8.6 14h-.4a4.4 4.4 0 0 1-3.6-1.9L2.9 9.6a1 1 0 0 1 1.5-1.3l.8.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
    task: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.2 6h5.6M5.2 8.4h5.6M5.2 10.8h3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="2.8" cy="4" r=".9" fill="currentColor"/><circle cx="2.8" cy="8" r=".9" fill="currentColor"/><circle cx="2.8" cy="12" r=".9" fill="currentColor"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    x: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    plus: '<path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    minus: '<path d="M3.5 8h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    chev: '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    chevR: '<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    alL: '<path d="M3 4h10M3 8h6M3 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    alC: '<path d="M3 4h10M5 8h6M4 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    alR: '<path d="M3 4h10M7 8h6M5 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    corners: '<path d="M3 6V4.5A1.5 1.5 0 0 1 4.5 3H6M10 3h1.5A1.5 1.5 0 0 1 13 4.5V6M13 10v1.5a1.5 1.5 0 0 1-1.5 1.5H10M6 13H4.5A1.5 1.5 0 0 1 3 11.5V10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    rad: '<path d="M4 12V8a4 4 0 0 1 4-4h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    opa: '<circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 3a5 5 0 0 1 0 10z" fill="currentColor"/>',
    gap: '<path d="M3 3v10M13 3v10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M6 8h4M7 6.5L5.5 8 7 9.5M9 6.5l1.5 1.5L9 9.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
    padH: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5 6v4M11 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    padV: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 6h5M5.5 10h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    lh: '<path d="M3 3h10M3 13h10M8 5.5v5M6.5 7l1.5-1.5L9.5 7M6.5 9l1.5 1.5L9.5 9" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
    ls: '<path d="M3 3v10M13 3v10M5.5 8h5M7 6.5L5.5 8 7 9.5M9 6.5l1.5 1.5L9 9.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
    sw: '<path d="M3 4.5h10" stroke="currentColor" stroke-width="1"/><path d="M3 8h10" stroke="currentColor" stroke-width="1.8"/><path d="M3 11.5h10" stroke="currentColor" stroke-width="2.6"/>',
    comp: '<path d="M8 1.8l2.4 2.4L8 6.6 5.6 4.2zM4.2 5.6L6.6 8 4.2 10.4 1.8 8zM11.8 5.6L14.2 8l-2.4 2.4L9.4 8zM8 9.4l2.4 2.4L8 14.2l-2.4-2.4z" fill="none" stroke="currentColor" stroke-width="1.1"/>',
    frame: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    text: '<path d="M3.5 4h9M8 4v9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    spark: '<path d="M8 1.7l1.5 4.2 4.2 1.5-4.2 1.5L8 13.1 6.5 8.9 2.3 7.4l4.2-1.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
    pen: '<path d="M3.4 10.9c-1.7-2.9.6-8 5.1-8 3.4 0 5.1 2.3 4.9 4.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6.9 13.7l.45-2 5-5a1.15 1.15 0 0 1 1.6 1.6l-5 5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
    pin: '<path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="6.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    box: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    circle: '<ellipse cx="8" cy="8" rx="5.5" ry="5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    arrow: '<path d="M3 13L13 3M7 3h6v6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    history: '<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.5H5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 5v3l2 1.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
    desktop: '<rect x="2" y="3" width="12" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M6 13.5h4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
    tablet: '<rect x="3.5" y="2" width="9" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/>',
    mobile: '<rect x="5" y="2" width="6" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/>',
    branch: '<circle cx="4.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="4.5" cy="12.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="11.5" cy="6" r="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 5.1v5.8M11.5 7.6c0 2.6-7 1.4-7 3.3" fill="none" stroke="currentColor" stroke-width="1.1"/>',
    check: '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    dots: '<circle cx="3.5" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12.5" cy="8" r="1.2" fill="currentColor"/>',
    gear: '<g transform="scale(.6667)" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></g>',
    comment: '<g transform="scale(.6667)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></g>',
    addEl: '<g transform="scale(.6667)" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></g>',
    sidebar: '<rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M6 3v10" stroke="currentColor" stroke-width="1.25"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
    dup: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M3 10.5V3.8c0-.4.4-.8.8-.8h6.7" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
    swap: '<path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    image: '<rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="6.5" r="1.2" fill="currentColor"/><path d="M3 12l3.5-3.5 2.5 2.5 2-2 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    code: '<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    search: '<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    heading: '<path d="M3.5 3v10M12.5 3v10M3.5 8h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    button: '<rect x="1.5" y="4.5" width="13" height="7" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 8h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    zin: '<path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    clip: '<path d="M10.5 4.5L5.6 9.4a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4l-5 5a4.2 4.2 0 0 0 6 6l4.4-4.4" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
    mic: '<rect x="6" y="2" width="4" height="7.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M3.8 7.5a4.2 4.2 0 0 0 8.4 0M8 11.8V14" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
    reload: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const ico = (n, s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true">${IC[n]}</svg>`;
  const cornerIco = (deg) => `<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><g transform="rotate(${deg} 8 8)">${IC.rad}</g></svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tip = (label, key) => `<span class="tip">${label}${key ? `<span class="k">${key}</span>` : ''}</span>`;
  const hb = (act, icon, title, v = '', extra = '') => `<button class="ib sm" data-act="${act}" data-v="${v}" ${extra} title="${title}" aria-label="${title}">${ico(icon)}</button>`;

  /* ---------- top bar ---------- */
  const DEVICES = { desktop: 1280, tablet: 820, mobile: 390 };
  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2];
  S.zoom = 'fit';
  S.z = 1;
  // Pages a designer would recognise: "/" is Home, "/deck/new" is "Deck / New".
  const pageName = (p) => {
    const parts = String(p || '/').split('?')[0].split('/').filter(Boolean);
    if (!parts.length) return 'Home';
    return parts.map((x) => (/^[0-9a-f-]{8,}$/i.test(x) || /^\d+$/.test(x) ? '…' : decodeURIComponent(x).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()))).join(' / ');
  };
  S.pages = [];
  const DEV_LABEL = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Phone' };
  function devRange(d) {
    const sc = S.theme?.screens || [];
    const find = (name, min) => sc.find((x) => x.name === name) || sc.find((x) => x.min >= min);
    const tab = find('md', 700)?.min || 768, desk = find('lg', 1000)?.min || 1024;
    return { desktop: `${desk}px and up`, tablet: `${tab}–${desk - 1}px`, mobile: `under ${tab}px` }[d];
  }
  function renderTop() {
    const p = S.project || {};
    const n = S.versions.draft.length + S.versions.versions.reduce((a, v) => a + v.changes.length, 0);
    $('top').innerHTML = `<div class="tside">
        <button class="icon${S.layersOpen && S.mode === 'edit' ? ' on' : ''}" data-act="layersToggle" title="Side panel: Chat and Layers" aria-label="Show or hide the side panel" ${S.mode === 'edit' ? '' : 'disabled'}>${ico('sidebar', 16)}</button>
        <button class="logoBtn" data-act="kerfMenu" title="Tovi menu" aria-label="Tovi menu" aria-haspopup="menu">${ico('kerf', 16)}${ico('chev', 10)}</button>
        <span class="crumbs"><span class="proj" title="${esc(p.repo || p.name || '')}">${esc(String(p.name || 'Tovi').split('/').pop())}</span><span class="sep">/</span><button class="pageBtn" data-act="pagesMenu" title="Pages" aria-haspopup="menu">${esc(pageName(S.path))}${ico('chev', 10)}</button></span>
      </div>
      <div class="tmid"><div class="bps" role="radiogroup" aria-label="Screen size">${Object.keys(DEVICES).map((d) => `<button class="${S.device === d ? 'on' : ''}" data-act="device" data-v="${d}" role="radio" aria-checked="${S.device === d}" title="${DEV_LABEL[d]} · ${devRange(d)}">${ico(d, 14)}<span>${DEV_LABEL[d]}</span></button>`).join('')}</div></div>
      <div class="tside r">
        <button class="zpct" data-act="zoomMenu" title="Zoom" aria-haspopup="menu">${Math.round(S.z * 100)}%${ico('chev', 10)}</button>
        <button class="icon" data-act="present" title="Present: the app full screen" aria-label="Present">${ico('play', 16)}</button>
        <button class="icon" data-act="settings" title="Settings (⌘,)" aria-label="Settings">${ico('gear', 16)}</button>
        <button class="icon${S.side === 'history' ? ' on' : ''}" data-act="history" title="Version history" aria-label="Version history">${ico('history', 16)}${S.versions.versions.length ? '<i class="badgeDot"></i>' : ''}</button>
        <button class="primary" data-act="pr" ${n ? '' : 'disabled'} title="Send your changes to developers as one pull request">Hand off${n ? `<span class="count">${n}</span>` : ''}</button>
      </div>`;
  }

  /* menus: one popover for the Tovi menu, pages, zoom and right-click */
  function openMenu(items, at) {
    const m = $('menu');
    m.innerHTML = items.map((it, i) => it === '-' ? '<div class="msep"></div>' : it.input ? `<form class="minput" data-mi="${i}"><input placeholder="${esc(it.placeholder || '')}" value="${esc(it.value || '')}" spellcheck="false" aria-label="${esc(it.placeholder || '')}"></form>` : it.head ? `<div class="mhead">${esc(it.head)}</div>` : `<button class="mi${it.on ? ' on' : ''}${it.danger ? ' danger' : ''}" data-mi="${i}" ${it.disabled ? 'disabled' : ''} role="menuitem"><span class="mchk">${it.on ? ico('check', 12) : ''}</span><span class="ml">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.kbd ? `<span class="mk">${esc(it.kbd)}</span>` : ''}</button>`).join('');
    m.hidden = false;
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, at.x)) + 'px';
    m.style.top = Math.max(8, Math.min(innerHeight - h - 8, at.y)) + 'px';
    m._items = items;
    const inp = m.querySelector('input');
    if (inp) setTimeout(() => inp.focus(), 0);
  }
  const closeMenu = () => { $('menu').hidden = true; };
  const below = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.bottom + 6 }; };
  $('menu').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mi]');
    if (!b) return;
    const it = $('menu')._items[+b.dataset.mi];
    closeMenu();
    it?.run?.();
  });
  $('menu').addEventListener('submit', (e) => {
    e.preventDefault();
    const it = $('menu')._items[+e.target.dataset.mi];
    const v = e.target.querySelector('input').value.trim();
    closeMenu();
    it?.run?.(v);
  });
  document.addEventListener('pointerdown', (e) => { if (!$('menu').hidden && !e.target.closest('#menu')) closeMenu(); }, true);
  addEventListener('blur', () => setTimeout(() => { if (document.activeElement === frame) return; closeMenu(); }, 0));
  addEventListener('resize', () => closeMenu());
  const goTo = (v) => { if (!v) return; if (!v.startsWith('/')) v = '/' + v; frame.src = v; };
  function kerfMenu(at) {
    const p = S.project || {};
    openMenu([
      { head: p.repo || p.name || 'This project' },
      ...(p.branch ? [{ label: `Branch: ${p.branch}`, disabled: true }] : []),
      { label: 'All projects', run: () => window.open('http://localhost:4100/#projects', '_blank') },
      { label: 'Help', run: () => window.open('http://localhost:4100/#help', '_blank') },
      '-',
      { label: S.direction ? `Design direction: ${dirName()}` : 'Set a design direction…', run: () => openDirection() },
      { label: S.minUI ? 'Show panels' : 'Hide panels', kbd: '⇧\\', run: () => toggleMinUI() },
      { label: 'Settings…', kbd: '⌘,', run: () => openSettings() },
      '-',
      { label: S.agentsOn ? 'Hide Tovi at work' : 'Show Tovi at work', run: () => { S.agentsOn = !S.agentsOn; try { localStorage.setItem('kerf.agents', S.agentsOn ? 'on' : 'off'); } catch {} toast(S.agentsOn ? 'Tovi and its helpers show on the canvas while they work' : 'Changes apply without the helpers on the canvas'); } },
      { label: 'Keyboard shortcuts', kbd: '?', run: () => shortcuts() },
    ], at);
  }
  /* ---------- Settings ---------- */
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  function openSettings() {
    const m = $('modal'), p = S.project || {};
    const tog = (id, on, label, sub) => `<div class="setRow"><span class="setTx"><b>${label}</b><span class="note">${sub}</span></span><button class="switch${on ? ' on' : ''}" data-act="setTog" data-v="${id}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button></div>`;
    const row = (label, sub, ctl) => `<div class="setRow"><span class="setTx"><b>${label}</b><span class="note">${sub}</span></span>${ctl}</div>`;
    const startPage = 'http://localhost:4100/#settings';
    m.hidden = false;
    m.innerHTML = `<section class="dialog settings" role="dialog" aria-modal="true" aria-labelledby="setT"><div class="dh"><h2 id="setT">Settings</h2><button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div>
      <div class="setBody">
        <div class="setSec"><h3>Tovi</h3>
          <form class="setRow" data-form="person" autocomplete="off"><span class="setTx"><b>Your name</b><span class="note">Shown on the versions and changes you make.</span></span><span class="setName"><input id="setPerson" value="" maxlength="60" placeholder="Your name" aria-label="Your name"><button class="outline sm">Save</button></span></form>
          ${tog('agents', S.agentsOn, 'Show Tovi at work', 'See Tovi’s cursor select and change things as it works.')}
          ${row('AI style', 'How far Tovi may go beyond your design system.', `<div class="seg setSeg">${[['system', 'On system'], ['improve', 'Improve'], ['explore', 'Explore']].map(([v, n]) => `<button data-act="setMode" data-v="${v}" class="${S.styleMode === v ? 'on' : ''}">${n}</button>`).join('')}</div>`)}
          ${row('Design direction', S.direction ? esc(dirName()) : 'Not set. Tovi follows your design system.', `<button class="outline sm" data-act="setDir">${S.direction ? 'Change' : 'Set'}</button>`)}
        </div>
        <div class="setSec"><h3>Editing</h3>
          ${tog('sim', S.simScope === 'all', 'Look-alikes change together', 'When cards look the same, style changes go to all of them.')}
          ${tog('scale', S.scaleArrows, 'Arrow keys follow your scale', 'Arrows step through your design system’s sizes. Shift+arrow nudges 1px.')}
          ${row('Panels', 'Put the side panels back to their usual widths.', '<button class="outline sm" data-act="setPanels">Reset</button>')}
        </div>
        <div class="setSec"><h3>AI keys</h3>
          ${row('Anthropic', '<span id="setKeyA">Checking…</span>', `<a class="outline sm" href="${startPage}" target="_blank" rel="noopener">Change</a>`)}
          ${row('Unsplash photos', '<span id="setKeyU">Checking…</span>', `<a class="outline sm" href="${startPage}" target="_blank" rel="noopener">Change</a>`)}
          <span class="note">Keys stay on this Mac in a git-ignored file. Tovi never shows them.</span>
        </div>
        <div class="setSec"><h3>This project</h3>
          ${row(esc(p.name || 'Project'), `${esc(p.repo || 'Not connected to GitHub yet')}${p.branch ? ` · branch ${esc(p.branch)}` : ''}`, '<a class="outline sm" href="http://localhost:4100" target="_blank" rel="noopener">All projects</a>')}
          ${row('Keyboard shortcuts', 'Every key Tovi listens for.', '<button class="outline sm" data-act="keys">Show</button>')}
        </div>
      </div></section>`;
    api('/person').then((p) => { const i = $('setPerson'); if (i && !i.value) i.value = p.name; }).catch(() => {});
    api('/keys').then((k) => {
      const a = $('setKeyA'), u = $('setKeyU');
      if (a) a.textContent = k.anthropic ? 'Saved. Tovi’s AI is on.' : 'No key yet. Add one to use the AI.';
      if (u) u.textContent = k.unsplash ? 'Saved. Photo search is on.' : 'Optional. Add a free key to search photos.';
    }).catch(() => {});
  }
  function pagesMenu(at) {
    const seen = [...new Set([S.path, ...S.pages])].slice(0, 12);
    openMenu([
      { input: true, placeholder: 'Go to a page, e.g. /settings', run: goTo },
      { head: 'Pages you’ve visited' },
      ...seen.map((x) => ({ label: `${pageName(x)}  ·  ${x}`, on: x === S.path, run: () => goTo(x) })),
      '-',
      { label: 'Reload page', kbd: '⌘R', run: () => { try { W.location.reload(); } catch { frame.src = S.path; } } },
    ], at);
  }
  function zoomMenu(at) {
    openMenu([
      { label: 'Zoom in', kbd: '⌘+', run: () => setZoom('in') },
      { label: 'Zoom out', kbd: '⌘−', run: () => setZoom('out') },
      { label: 'Zoom to fit', kbd: '⇧1', on: S.zoom === 'fit', run: () => setZoom('fit') },
      '-',
      ...[0.5, 1, 2].map((z) => ({ label: `${z * 100}%`, kbd: z === 1 ? '⇧0' : '', on: S.zoom === z, run: () => setZoom(z) })),
    ], at);
  }
  // Right-click on the canvas: what a designer reaches for, on the element under the cursor.
  function contextMenu(at) {
    const s = S.sel, inf = info(), el = s?.el;
    if (!el) return;
    const act = (a, v) => () => { const b = document.querySelector(`[data-act="${a}"]${v ? `[data-v="${v}"]` : ''}`); if (b) b.click(); };
    const plain = /^(div|section|span)$/.test(el.tagName.toLowerCase()) && !el.getAttribute('data-kerf-n');
    openMenu([
      { head: dName(el) },
      ...(inf?.text?.editable ? [{ label: 'Edit text', kbd: '↵', run: () => beginText() }] : []),
      { label: 'Ask Tovi about this…', kbd: '⌘K', run: () => toggleAI(true) },
      { label: 'Select parent', kbd: '⇧↵', disabled: !pick(el.parentElement), run: () => { const p = pick(el.parentElement); if (p) select(p); } },
      '-',
      { label: 'Duplicate', kbd: '⌘D', run: () => structure({ type: 'duplicate' }, { keepSel: true }) },
      { label: 'Group into a frame', kbd: '⌥⌘G', run: () => groupSelected() },
      ...(plain ? [{ label: 'Ungroup', kbd: '⇧⌘G', run: () => structure({ type: 'ungroup' }) }] : []),
      { label: 'Move up', kbd: '⌥↑', run: () => structure({ type: 'move', dir: 'up' }, { keepSel: true }) },
      { label: 'Move down', kbd: '⌥↓', run: () => structure({ type: 'move', dir: 'down' }, { keepSel: true }) },
      ...(document.querySelector('[data-act="sSwap"]') ? [{ label: 'Swap with…', run: act('sSwap') }] : []),
      { label: 'Add next to it…', kbd: 'I', run: act('insertMenu') },
      '-',
      { label: 'Delete', kbd: '⌫', danger: true, run: () => deleteSelected() },
    ], at);
  }
  function shortcuts() {
    const rows = [['Select', 'V'], ['Interact with the app', 'P'], ['Click through while selecting', 'Hold ⌘'], ['Annotate', 'A'], ['Ask Tovi (chat)', '⌘K'], ['Undo', '⌘Z'], ['Select parent', '⇧↵'], ['Duplicate', '⌘D'], ['Delete', '⌫'], ['Move up / down', '⌥↑ ⌥↓'], ['Group / ungroup', '⌥⌘G · ⇧⌘G'], ['Add element', 'I'], ['Measure spacing', 'hold ⌥'], ['Select several', '⇧ click'], ['Zoom in / out', '⌘+ · ⌘−'], ['Fit / 100%', '⇧1 · ⇧0'], ['Hide panels', '⇧\\']];
    const m = $('modal');
    m.hidden = false;
    m.innerHTML = `<section class="dialog keys" role="dialog" aria-modal="true" aria-labelledby="kT"><div class="dh"><h2 id="kT">Keyboard shortcuts</h2><button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div><div class="db"><div class="krows">${rows.map(([a, k]) => `<div class="kr"><span>${a}</span><span class="kk">${k}</span></div>`).join('')}</div></div></section>`;
  }
  S.minUI = false;
  function toggleMinUI() {
    S.minUI = !S.minUI;
    document.body.classList.toggle('minUI', S.minUI);
    setTimeout(applyDevice, 0);
  }

  // The app keeps its real width (so desktop stays desktop) and is scaled to fit, like a Figma frame.
  function applyDevice() {
    const c = $('canvas'), fb = $('frameBox');
    if (!c) return;
    // Room for the frame's name above it and a margin below, like an artboard.
    const aw = Math.max(80, c.clientWidth - 48), ah = Math.max(80, c.clientHeight - 64);
    let zFit, w, z, h, left, top = 44;
    if (S.mode === 'preview' && S.device === 'desktop' && S.zoom === 'fit') {
      // Preview on desktop: full screen, edge to edge, like presenting the real product.
      zFit = Math.max(0.5, Math.min(1, c.clientWidth / 1024));
      z = zFit;
      w = Math.round(c.clientWidth / z);
      h = c.clientHeight / z;
      left = 0;
      Object.assign(fb.style, { width: w + 'px', height: h + 'px', left: '0px', top: '0px', transform: `scale(${z})` });
      $('sizer').style.width = '1px';
      $('sizer').style.height = '1px';
    } else {
      // Desktop keeps a desktop width (1024+) by zooming out, but Fit never goes below 50%, so text stays readable.
      zFit = S.device === 'desktop' ? Math.max(0.5, Math.min(1, aw / 1024)) : Math.min(1, aw / DEVICES[S.device]);
      w = S.device === 'desktop' ? Math.round(aw / zFit) : DEVICES[S.device];
      z = S.zoom === 'fit' ? zFit : S.zoom;
      h = ah / z;
      left = Math.max(16, (c.clientWidth - w * z) / 2);
      // +2 for the frame's border, so the app inside is exactly w wide (1024 must count as desktop).
      Object.assign(fb.style, { width: w + 2 + 'px', height: h + 'px', left: left + 'px', top: top + 'px', transform: `scale(${z})` });
      $('sizer').style.width = (left + w * z + 16) + 'px';
      $('sizer').style.height = '1px';
      $('devLabel').style.left = left + 'px';
    }
    fb.style.setProperty('--iz', 1 / z);
    fb.classList.toggle('dev', S.device !== 'desktop');
    const full = S.mode === 'preview' && S.device === 'desktop' && S.zoom === 'fit';
    fb.classList.toggle('full', full);
    // Preview is a presentation: no artboard name, no dotted grid.
    c.classList.toggle('present', S.mode === 'preview');
    $('devLabel').hidden = S.mode === 'preview';
    $('devLabel').innerHTML = `<b>${DEV_LABEL[S.device]}</b><span>${w}</span>`;
    const changed = S.z !== z;
    S.z = z;
    if (changed) { renderTop(); if (S.notes?.length) drawMarks(); }
  }
  function setZoom(v) {
    const cur = S.z;
    if (v === 'fit') S.zoom = 'fit';
    else if (v === 'in') S.zoom = ZOOMS.find((x) => x > cur + 0.01) || 2;
    else if (v === 'out') S.zoom = [...ZOOMS].reverse().find((x) => x < cur - 0.01) || 0.25;
    else S.zoom = Math.min(2, Math.max(0.25, +v || 1));
    applyDevice();
    renderTop();
  }
  new ResizeObserver(() => applyDevice()).observe(document.getElementById('canvas'));
  // When the app's width changes (window, screen size, panels), refresh the measured sizes in the panel,
  // unless the designer is typing in it.
  let panelSizeT;
  new ResizeObserver(() => {
    clearTimeout(panelSizeT);
    panelSizeT = setTimeout(() => { if (S.mode === 'edit' && !$('panel').contains(document.activeElement)) renderPanel(); }, 300);
  }).observe(frame);
  // Side panels: drag their inner edge to resize, double-click to reset. Widths are remembered in this browser.
  const SIDE = { l: { el: 'layers', def: 300, min: 260, max: 520 }, r: { el: 'panel', def: 284, min: 248, max: 520 } };
  const setSide = (k, w) => { const c = SIDE[k]; w = Math.round(Math.max(c.min, Math.min(c.max, w))); document.getElementById(c.el).style.flexBasis = w + 'px'; return w; };
  for (const k of Object.keys(SIDE)) { let w = null; try { w = +localStorage.getItem(`kerf.side.${k}`); } catch {} setSide(k, w || SIDE[k].def); }
  let sideDrag = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest?.('[data-resize]');
    if (!h) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    sideDrag = { k: h.dataset.resize, box: document.getElementById(SIDE[h.dataset.resize].el).getBoundingClientRect() };
    document.body.classList.add('resizing');
  });
  document.addEventListener('pointermove', (e) => {
    if (!sideDrag) return;
    const w = sideDrag.k === 'l' ? e.clientX - sideDrag.box.left : sideDrag.box.right - e.clientX;
    sideDrag.w = setSide(sideDrag.k, w);
    requestAnimationFrame(applyDevice);
  });
  const endSide = () => {
    if (!sideDrag) return;
    try { if (sideDrag.w) localStorage.setItem(`kerf.side.${sideDrag.k}`, sideDrag.w); } catch {}
    sideDrag = null;
    document.body.classList.remove('resizing');
    applyDevice();
  };
  document.addEventListener('pointerup', endSide);
  document.addEventListener('pointercancel', endSide);
  document.addEventListener('dblclick', (e) => {
    const h = e.target.closest?.('[data-resize]');
    if (!h) return;
    setSide(h.dataset.resize, SIDE[h.dataset.resize].def);
    try { localStorage.removeItem(`kerf.side.${h.dataset.resize}`); } catch {}
    applyDevice();
  });
  // Pinch or ⌘-scroll zooms the canvas, inside the app too.
  const pinch = (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom(Math.min(2, Math.max(0.25, Math.round(S.z * Math.exp(-e.deltaY * 0.01) * 100) / 100))); };
  document.getElementById('canvas').addEventListener('wheel', pinch, { passive: false });

  /* ---------- toolbar ---------- */
  function renderBar() {
    // Presenting: the app alone, with one way back.
    if (S.mode === 'preview') { $('bar').innerHTML = `<button class="tb wide" data-act="mode" data-v="edit" aria-label="Stop presenting">${ico('x', 14)}<span>Stop presenting</span><span class="kbd">Esc</span></button>`; $('hint').hidden = true; return; }
    const tool = (t, icon, name, key) => `<button class="tb${S.tool === t ? ' on' : ''}" data-act="tool" data-v="${t}" aria-label="${name}" aria-pressed="${S.tool === t}">${ico(icon, 20)}${tip(name, key)}</button>`;
    $('bar').innerHTML = `<div class="modes">
        ${tool('interact', 'tap', 'Interact with the app', 'P')}
        ${tool('select', 'cursor', 'Select', 'V')}
      </div>
      <span class="div"></span>
      <button class="tb" data-act="insertMenu" aria-label="Add element">${ico('plus', 20)}${tip(S.tool === 'select' ? 'Add element' : 'Add element (switches to Select)', 'I')}</button>
      <button class="tb${S.tool === 'annotate' ? ' on' : ''}" data-act="tool" data-v="annotate" aria-label="Annotate">${ico('comment', 20)}${tip('Annotate', 'A')}</button>
      <span class="div"></span>
      <button class="tb" data-act="undo" ${S.count ? '' : 'disabled'} aria-label="Undo">${ico('undo', 20)}${tip('Undo', '⌘Z')}</button>
      <button class="tb" data-act="changes" aria-label="Changes">${ico('list', 20)}${S.count ? '<i class="badgeDot" style="box-shadow:0 0 0 2px var(--raised)"></i>' : ''}${tip('Changes this session')}</button>`;
    const h = $('hint');
    h.hidden = true;
    if (!h.hidden) h.innerHTML = `Click anything to select it. Press <span class="kbd">P</span> to use your app, hold <span class="kbd">⌘</span> to click through, or <span class="kbd">⌘K</span> to ask Tovi.`;
  }

  /* ---------- layers ---------- */
  const keyOf = (el) => `${defOf(el) || ''}|${useOf(el) || ''}|${[...sameLoc(el)].indexOf(el)}`;
  function layerTree() {
    if (!D?.body) return [];
    let count = 0;
    const walk = (node) => {
      const out = [];
      for (const c of node.children) {
        if (count > 600) break;
        if (c.matches('[data-kerf],[data-kerf-use]')) {
          count++;
          out.push({ el: c, kids: walk(c) });
        } else out.push(...walk(c));
      }
      return out;
    };
    return walk(D.body);
  }
  // The left panel: Chat (the default) and Layers, as two tabs.
  function renderLeft(focusChat) {
    const box = $('layers');
    box.hidden = S.mode !== 'edit' || !S.layersOpen;
    if (box.hidden) return;
    if (!box.querySelector('.ltabs')) box.innerHTML = '<div class="ptabs ltabs"></div><div class="lbody" id="lbody"></div>';
    box.querySelector('.ltabs').innerHTML = `<button data-act="left" data-v="chat" class="${S.left === 'chat' ? 'on' : ''}">Chat <span class="kbd">⌘K</span></button><button data-act="left" data-v="layers" class="${S.left === 'layers' ? 'on' : ''}">Layers</button>`;
    box.dataset.left = S.left;
    if (S.left === 'layers') renderLayers(); else renderChat(focusChat);
  }
  function renderChat(focusChat) {
    const box = $('lbody');
    if (!box || S.left !== 'chat' || $('layers').hidden) return;
    const draft = $('chatIn')?.value || '';
    const hadFocus = document.activeElement?.id === 'chatIn';
    box.innerHTML = chatHTML();
    const sc = $('chatScroll'); if (sc) sc.scrollTop = sc.scrollHeight;
    const ci = $('chatIn'); if (ci) { ci.value = draft; syncKC('chatIn'); if (focusChat || hadFocus) ci.focus(); }
  }
  function renderLayers() {
    const box = $('lbody');
    if (!box || S.left !== 'layers' || $('layers').hidden) return;
    const rows = [];
    const add = (nodes, depth) => {
      for (const n of nodes) {
        const el = n.el, k = keyOf(el), open = !!S.open[k] || depth < 2;
        const on = S.sel?.el === el;
        const leafText = !n.kids.length && el.childElementCount === 0 ? (el.textContent || '').trim().slice(0, 40) : '';
        const icon = layerIcon(el);
        const comp = useOf(el) && /^[A-Z]/.test(el.getAttribute('data-kerf-n') || '');
        rows.push(`<button class="layer${on ? ' on' : ''}${comp ? ' comp' : ''}" data-layer="${rows.length}" style="padding-left:6px"><span class="ind" style="width:${depth * 12}px"></span>
          <span class="tw" data-twist="${esc(k)}">${n.kids.length ? ico(open ? 'chev' : 'chevR', 10) : ''}</span>${ico(icon, 12)}<span class="nm">${esc(kindOf(el))}</span>${(() => { const w = / icon$/.test(kindOf(el)) ? '' : leafText || (/^(img|input|textarea)$/i.test(el.tagName) ? wordsOf(el) : ''); return w ? `<span class="tx">${esc(w)}</span>` : ''; })()}</button>`);
        layerEls.push(el);
        if (n.kids.length && open) add(n.kids, depth + 1);
      }
    };
    layerEls = [];
    add(layerTree(), 0);
    const tree = box.querySelector('.tree');
    const st = tree ? tree.scrollTop : 0;
    const changes = S.versions.draft;
    box.innerHTML = `<div class="lhead"><span>Page</span><button class="lpage" data-act="pagesMenu" title="Pages">${esc(pageName(S.path))}${ico('chev', 10)}</button></div>
      <div class="tree">${rows.join('') || '<div class="empty">This page has no elements Tovi can edit yet.</div>'}</div>
      ${changes.length ? `<button class="lchanges" data-act="history" title="Open version history"><span class="dot"></span><span>${changes.length} unsaved change${changes.length === 1 ? '' : 's'}</span>${ico('chevR', 10)}</button>` : ''}`;
    box.querySelector('.tree').scrollTop = st;
    const onRow = box.querySelector('.layer.on');
    if (onRow && layersScrollToSel) { onRow.scrollIntoView({ block: 'nearest' }); layersScrollToSel = false; }
  }
  let layerEls = [], layersScrollToSel = false;
  let layerTimer = null;
  const layersSoon = () => { clearTimeout(layerTimer); layerTimer = setTimeout(renderLayers, 250); };

  /* ---------- design panel ---------- */
  const val = (p) => read(p, S.sel?.el);
  const nf = (p, icon, title, unit) => `<label class="inp${info()?.sized?.includes(p) ? ' sized' : ''}" title="${title}${info()?.sized?.includes(p) ? ' · different on other screen sizes' : ''}"><span class="ic" data-scrub="${p}">${icon.startsWith('<') ? icon : ico(icon, 12)}</span><input type="text" inputmode="decimal" data-prop="${p}" value="${esc(val(p))}" aria-label="${title}">${unit ? `<span class="u">${unit}</span>` : ''}</label>`;
  const sec = (title, body, act = '') => `<div class="sec"><div class="secH"><span>${title}</span>${act}</div>${body}</div>`;
  function colorRow(p, title, removeAct) {
    const hex = val(p), tok = tokenOf(p), none = hex === 'transparent';
    let h = `<div class="cr"><label class="inp" title="${title}"><button class="cchip${none ? ' none' : ''}" data-act="cpick" data-v="${p}" style="background:${none ? 'transparent' : hex}" aria-label="Choose ${title}"></button><input type="text" data-prop="${p}" data-color="1" value="${none ? '' : hex.replace('#', '')}" placeholder="None" spellcheck="false" aria-label="${title} hex"><span class="u">${esc(tok && !tok.startsWith('#') ? tok : '')}</span></label>${removeAct ? `<button class="ib" data-act="${removeAct}" title="Remove">${ico('minus')}</button>` : ''}</div>`;
    if (S.cpick === p) {
      h += `<div class="cpop"><div class="cpT">Project tokens</div><div class="toks">${tokens().map(([n, v]) => `<button data-act="token" data-p="${p}" data-v="${esc(n)}" title="${esc(n)}" class="${n === tok ? 'on' : ''}"><i style="background:${esc(swatch(v))}"></i><span>${esc(n)}</span></button>`).join('')}</div>
        <label class="cust"><input type="color" data-colorinput="${p}" value="${/^#[0-9A-F]{6}$/.test(hex) ? hex : '#FFFFFF'}"><span>Custom color</span><span class="u">off scale</span></label></div>`;
    }
    return h;
  }
  const isText = (el) => el && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const isLayout = (el) => el && el.isConnected && /flex|grid/.test(cs(el).display);
  /* fill: solid or gradient */
  const DIRS = [['r', '→ Right'], ['l', '← Left'], ['b', '↓ Down'], ['t', '↑ Up'], ['br', '↘ Down right'], ['bl', '↙ Down left'], ['tr', '↗ Up right'], ['tl', '↖ Up left']];
  const CSSDIR = { r: 'to right', l: 'to left', b: 'to bottom', t: 'to top', br: 'to bottom right', bl: 'to bottom left', tr: 'to top right', tl: 'to top left' };
  function gradOf() {
    const cls = (info()?.classes || []).filter((c) => !c.includes(':'));
    const dir = cls.map((c) => c.match(/^bg-(?:gradient|linear)-to-(\w+)$/)).find(Boolean);
    if (!dir) return null;
    const stop = (p) => (cls.find((c) => c.startsWith(p + '-')) || '').slice(p.length + 1).replace(/^\[|\]$/g, '') || null;
    return { dir: dir[1], from: stop('from'), via: stop('via'), to: stop('to'), clip: cls.includes('bg-clip-text') };
  }
  const gradValue = (g) => [g.dir, g.from, g.via, g.to].filter(Boolean).join(' ');
  const tokenSwatch = (n) => { const t = tokens().find(([k]) => k === n); return t ? swatch(t[1]) : n?.startsWith('#') ? n : 'transparent'; };
  const stopSel = (key, cur, allowNone) => `<label class="inp"><i class="sw1" style="background:${esc(tokenSwatch(cur))}"></i><select data-gstop="${key}" aria-label="Gradient ${key}">${allowNone ? `<option value=""${cur ? '' : ' selected'}>No middle color</option>` : ''}${tokens().filter(([n]) => n !== 'transparent').map(([n]) => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>${ico('chev', 12)}</label>`;
  function fillBody(g, el) {
    const seg = `<div class="seg"><button data-act="fillType" data-v="solid" class="${g ? '' : 'on'}">Solid</button><button data-act="fillType" data-v="gradient" class="${g ? 'on' : ''}">Gradient</button></div>`;
    if (!g) return seg + colorRow('bg', 'Fill', 'rmFill');
    const prev = `linear-gradient(${CSSDIR[g.dir] || 'to right'}, ${[g.from, g.via, g.to].filter(Boolean).map(tokenSwatch).join(', ')})`;
    return seg + `<div class="gprev" style="background:${esc(prev)}"></div>
      <div class="cr"><label class="inp"><select data-gstop="dir" aria-label="Direction">${DIRS.map(([v, n]) => `<option value="${v}"${v === g.dir ? ' selected' : ''}>${n}</option>`).join('')}</select>${ico('chev', 12)}</label><button class="ib" data-act="rmFill" title="Remove fill">${ico('minus')}</button></div>
      <div class="kv"><span>From</span>${stopSel('from', g.from)}</div>
      <div class="kv"><span>Middle</span>${stopSel('via', g.via, true)}</div>
      <div class="kv"><span>To</span>${stopSel('to', g.to)}</div>
      ${isText(el) ? `<div class="kv"><span>On text</span><div class="seg"><button data-act="clipText" data-v="off" class="${g.clip ? '' : 'on'}">Off</button><button data-act="clipText" data-v="on" class="${g.clip ? 'on' : ''}">On</button></div></div>` : ''}`;
  }
  document.addEventListener('change', (e) => {
    const k = e.target.dataset?.gstop;
    if (!k || !S.sel) return;
    const g = gradOf() || { dir: 'r' };
    g[k] = e.target.value || null;
    commit({ ops: [{ prop: 'gradient', value: gradValue(g) }] });
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act="fillType"],[data-act="clipText"]');
    if (!a || !S.sel) return;
    if (a.dataset.act === 'clipText') return commit({ ops: [{ prop: 'clipText', value: a.dataset.v }] });
    const g = gradOf();
    const names = tokens().map(([n]) => n).filter((n) => !['transparent', 'black', 'white'].includes(n));
    if (a.dataset.v === 'gradient' && !g) {
      const from = tokenOf('bg') && !tokenOf('bg').startsWith('#') ? tokenOf('bg') : names.includes('primary') ? 'primary' : names[0];
      const to = names.find((n) => n !== from && /positive|accent|secondary|primary/.test(n)) || names.find((n) => n !== from);
      commit({ ops: [{ prop: 'gradient', value: `r ${from} ${to}` }] });
    } else if (a.dataset.v === 'solid' && g) commit({ ops: [{ prop: 'bg', value: g.from || 'transparent' }, { prop: 'clipText', value: 'off' }] });
  });

  // Component properties, like Figma's: they belong to this use of the component, whatever the scope.
  const ICON_DEFAULTS = { 'lucide-react': { size: 24, strokeWidth: 2 }, '@phosphor-icons/react': { weight: 'regular', size: '1em' } };
  const humanize = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  function propsSection(inf0) {
    const inf = S.sel?.useInfo?.component ? S.sel.useInfo : inf0;
    if (!inf?.component) return '';
    // Variants the component offers (from its cva), even ones this use doesn't set yet.
    const c = S.sel?.defInfo?.cva, props = (inf.props || []).slice();
    if (c?.groups) for (const [g, opts] of Object.entries(c.groups)) {
      const i = props.findIndex((p) => p.name === g), cur = i > -1 ? props[i] : null;
      if (cur && !cur.editable) continue;
      const row = { name: g, kind: 'option', options: opts, value: cur?.value ?? null, def: c.defaults?.[g], editable: true, cva: true };
      if (i > -1) props[i] = row; else props.unshift(row);
    }
    if (!props.length) return '';
    const dflt = ICON_DEFAULTS[inf.lib] || {};
    const rows = props.map((p) => {
      let ctl;
      if (!p.editable) ctl = `<label class="inp lock" title="${esc(p.reason)}"><input value="set by code" disabled></label>`;
      else if (p.kind === 'option') ctl = `<label class="inp"><select data-propsel="${esc(p.name)}"${p.cva ? ` data-options="${esc(p.options.join('|'))}"` : ''}${p.value == null && (p.def ?? dflt[p.name]) != null ? ` data-def="${esc(p.def ?? dflt[p.name])}"` : ''} aria-label="${esc(humanize(p.name))}">${p.value == null ? `<option value="" selected>${p.def != null ? `${esc(p.def)} (default)` : dflt[p.name] != null ? `${esc(dflt[p.name])} (default)` : 'Default'}</option>` : ''}${p.options.filter((o) => !(p.value == null && o === (p.def ?? dflt[p.name]))).map((o) => `<option${o === p.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>${ico('chev', 12)}</label>`;
      else if (p.kind === 'boolean') ctl = `<div class="seg"><button data-act="setProp" data-p="${esc(p.name)}" data-v="false" class="${p.value !== true ? 'on' : ''}">Off</button><button data-act="setProp" data-p="${esc(p.name)}" data-v="true" class="${p.value === true ? 'on' : ''}">On</button></div>`;
      else if (p.kind === 'number') ctl = `<label class="inp"><input type="text" inputmode="decimal" data-propnum="${esc(p.name)}" value="${p.value ?? ''}" placeholder="${dflt[p.name] != null ? `${esc(dflt[p.name])} (default)` : 'Default'}" aria-label="${esc(humanize(p.name))}"></label>`;
      else ctl = `<label class="inp"><input type="text" data-proptext="${esc(p.name)}" value="${esc(p.value)}"></label>`;
      return `<div class="kv"><span>${esc(humanize(p.name))}</span>${ctl}</div>`;
    }).join('');
    return sec(`Properties${inf.lib ? ` <span class="note" style="font-weight:400">${esc(inf.lib.replace(/^@/, '').split('/')[0])}</span>` : ''}`, rows);
  }
  /* screen sizes: edit for all sizes, or only the size you're looking at */
  S.sizeOnly = { desktop: false, tablet: true, mobile: true };
  function sizeRange() {
    const sc = S.theme?.screens || [];
    if (!sc.length) return null;
    const find = (name, min) => (sc.find((x) => x.name === name) || sc.find((x) => x.min >= min))?.name || null;
    const tab = find('md', 700), desk = find('lg', 1000);
    return { desktop: [desk, null], tablet: [tab, desk], mobile: [null, tab] }[S.device];
  }
  function bpParam() {
    const r = sizeRange();
    if (!r) return null;
    const dev = S.device;
    return S.sizeOnly[dev] ? { mode: 'only', start: r[0], end: r[1], label: `Only on ${DEV_LABEL[dev].toLowerCase()}` } : { mode: 'all', label: 'All sizes' };
  }
  // Where this element's styles really live (a style table, a constant), and how far a change reaches.
  function sourceHTML(inf) {
    if (inf?.classKind !== 'sourced') return '';
    const tb = inf.sources.find((x) => x.kind === 'table'), src = tb || inf.sources.find((x) => x.kind === 'const');
    if (!src) return '';
    const what = tb ? `${tb.name} “${tb.key ?? '?'}”` : src.name;
    const used = src.usedIn ? ` · used in ${src.usedIn} file${src.usedIn === 1 ? '' : 's'}` : '';
    const opts = [['here', 'Only this one'], ['key', tb ? `All “${tb.key ?? '…'}”` : 'Everywhere'], ...(tb ? [['all', `All ${tb.entries.length}`]] : [])];
    const sc = S.srcScope || 'key';
    return `<div class="srcRow"><span class="note">Styles come from <b>${esc(what)}</b> in ${esc(src.file)}${used}</span><div class="seg">${opts.map(([v, n]) => `<button data-act="srcScope" data-v="${v}" class="${sc === v ? 'on' : ''}" title="${v === 'here' ? 'Change only this element' : v === 'key' ? `Change it in ${esc(src.name)}${tb ? ` for “${esc(tb.key)}”` : ''}, everywhere it’s used` : `Change every entry of ${esc(tb.name)}`}">${esc(n)}</button>`).join('')}</div></div>`;
  }
  // The app's colour tokens, like Figma's local styles: change one and every screen follows.
  S.tokens = null;
  const loadTokens = () => api('/tokens').then((t) => { S.tokens = t; if (S.mode === 'edit' && !S.sel) renderPanel(); renderAI(); }).catch(() => { S.tokens = []; });
  function paletteHTML() {
    if (S.tokens == null) { loadTokens(); return ''; }
    if (!S.tokens.length) return '';
    const themes = [...new Set(S.tokens.flatMap((t) => t.values.map((v) => v.theme)))].slice(0, 3);
    return `<div class="sec palette"><div class="secH"><span>Colours</span><span class="note">${themes.map((x) => esc(x[0].toUpperCase() + x.slice(1))).join(' · ')}</span></div><span class="note">Your design system. Changing one updates every screen that uses it.</span>
      ${S.tokens.map((t) => `<div class="tok"><span class="tn">${esc(t.name)}</span><span class="sw">${themes.map((th) => { const v = t.values.find((x) => x.theme === th) || (th !== 'all' && t.values.find((x) => x.theme === 'all')); return v ? `<label class="swatch" style="background:${esc(v.hex)}" title="${esc(t.name)} · ${esc(th)} · ${esc(v.hex)}"><input type="color" value="${esc(v.hex.slice(0, 7))}" data-token="${esc(t.name)}" data-theme="${esc(v.theme)}" aria-label="${esc(t.name)} ${esc(th)}"></label>` : '<span class="swatch none"></span>'; }).join('')}</span></div>`).join('')}</div>`;
  }
  document.addEventListener('change', async (e) => {
    const i = e.target.closest?.('[data-token]');
    if (!i) return;
    try {
      const r = await api('/token', { name: i.dataset.token, hex: i.value.toUpperCase(), which: i.dataset.theme === 'all' ? 'both' : i.dataset.theme });
      if (r.changed) { S.count = r.n; toast(r.summary.labels?.[0] || 'Colour changed', 'Every screen using it updates', false, true); }
      S.tokens = null;
      afterEdit();
      renderPanel();
    } catch (err) { toast(err.message, '', true); }
  });
  function sizeHTML(inf) {
    if (!sizeRange() || inf?.classKind === 'cva') return '';
    const dev = S.device, only = S.sizeOnly[dev];
    const differs = (inf?.classes || []).some((c) => /^(sm|md|lg|xl|2xl):[^:]+$/.test(c));
    return `<div class="sizeRow"><div class="seg">${[[false, 'All sizes'], [true, `${DEV_LABEL[dev]} only`]].map(([v, n]) => `<button data-act="sizeOnly" data-v="${v}" class="${only === v ? 'on' : ''}" title="${v ? `Change it only on ${DEV_LABEL[dev].toLowerCase()} (${devRange(dev)}); other screen sizes keep how they look now` : 'Make it the same on every screen size'}">${ico(v ? dev : 'corners', 12)}${n}</button>`).join('')}</div>${differs ? '<span class="note" title="This element is styled differently on other screen sizes">Differs by size</span>' : ''}</div>`;
  }
  function scopeHTML(s, name) {
    const c = s.defInfo?.cva;
    if (c) {
      const av = activeVariant(), vname = av?.variant;
      // Short labels that fit the panel; the full meaning is in each button's tooltip.
      const comp = s.use ? (s.useInfo?.tag || name) : name;
      const opts = [...(s.use ? [['here', 'This one', 'Only this one']] : []), ...(vname ? [['variant', `All “${vname}”`, `Every ${comp} with variant “${vname}”`]] : []), ['all', 'All', `Every ${comp}`]];
      if (!opts.some(([v]) => v === S.scope)) S.scope = vname ? 'variant' : 'all';
      return `<div class="seg">${opts.map(([v, n, t]) => `<button data-act="scope" data-v="${v}" class="${S.scope === v ? 'on' : ''}" title="${esc(t)}">${esc(n)}</button>`).join('')}</div>`;
    }
    if (s.def && s.use) return `<div class="seg"><button data-act="scope" data-v="all" class="${S.scope === 'all' ? 'on' : ''}" title="Change the component itself, everywhere it's used">Everywhere</button><button data-act="scope" data-v="here" class="${S.scope === 'here' ? 'on' : ''}" title="Change only this use of the component">Only here</button></div>`;
    return '';
  }
  const tabsHTML = () => '';
  function renderPanel(focusChat) {
    const p = $('panel');
    // While interacting, the panel goes away and the app takes its space.
    const was = p.hidden;
    p.hidden = !(S.mode === 'edit' || S.side === 'history') || (S.tool === 'interact' && S.side !== 'history');
    if (p.hidden !== was) setTimeout(applyDevice, 0);
    $('devLabel')?.classList.toggle('on', !!S.pageSel && !S.sel);
    if (p.hidden) return;
    if (S.side === 'history') { p.innerHTML = historyHTML(); return; }
    const s = S.sel;
    if (!s) {
      // Nothing selected: say how to start, then what applies to the whole page (like Figma's page panel).
      const keys = [['Select the parent', '⇧ ↵'], ['Select several', '⇧ Click'], ['Click through to the app', '⌘ Click'], ['Measure spacing', 'Hold ⌥'], ['Add an element', 'I'], ['Mark something for Tovi', 'A'], ['Ask Tovi', '⌘K']];
      p.innerHTML = tabsHTML() + `<div class="scroll">
        ${S.pageSel ? '' : `<div class="selHint"><span class="shIc">${ico('cursor', 16)}</span><b>Select something to edit it</b><span>Click any element in your app, or pick it in Layers. Double-click text to retype it.</span></div>`}
        <div class="sec"><div class="secH"><span class="nm">${ico('desktop')}Page</span><button class="lpage" data-act="pagesMenu" title="Pages">${esc(pageName(S.path))}${ico('chev', 10)}</button></div>
          <div class="pgRow"><span>Screen</span><span>${DEV_LABEL[S.device]} · ${Math.round(W?.innerWidth || frame.clientWidth || 0)} px</span></div>
          <div class="pgRow"><span>Changes</span>${S.versions.draft.length ? `<button class="linkBtn" data-act="history">${S.versions.draft.length} not saved yet</button>` : '<span>All saved</span>'}</div></div>
        ${paletteHTML()}
        <div class="sec"><div class="secH"><span>Shortcuts</span><button class="linkBtn" data-act="keys">All</button></div><div class="keyList">${keys.map(([a, k]) => `<div><span>${a}</span><span class="kbd">${k}</span></div>`).join('')}</div></div>
      </div>`;
      return;
    }
    const el = s.el, inf = info();
    const name = (activeLoc() === s.use ? s.useInfo?.tag : s.defInfo?.tag) || nameOf(el);
    const loc = activeLoc();
    let h = `<div class="sec head"><div class="secH"><span class="nm">${ico(layerIcon(el))}${esc(dName(el))}</span><span class="hbs">${hb('copyLoc', 'code', `Code: ${loc.replace(/:(\d+):\d+$/, ':$1')} (click to copy)`)}${hb('parent', 'up', 'Select parent')}</span></div>
      ${scopeHTML(s, name)}
      ${s.similar?.length && !S.multi.length ? `<div class="simRow"><span class="note">${s.similar.length + 1} look alike</span><div class="seg"><button data-act="simScope" data-v="all" class="${S.simScope === 'all' ? 'on' : ''}" title="Style changes go to all ${s.similar.length + 1}">All ${s.similar.length + 1}</button><button data-act="simScope" data-v="one" class="${S.simScope === 'one' ? 'on' : ''}" title="Change only this one">This one</button></div></div>` : ''}
      ${sourceHTML(inf)}
      ${sizeHTML(inf)}
      ${S.multi.length ? `<span class="note">+${S.multi.length} more selected: changes apply to all ${S.multi.length + 1}.</span>` : ''}
      ${s.repeat > 1 ? `<span class="note">Repeated ×${s.repeat} by the same code: edits apply to all of them.</span>` : ''}
      ${actionsHTML()}</div>`;
    if (!inf) h += `<div class="sec"><span class="note">Reading code…</span></div>`;
    else if (inf.error) h += `<div class="sec"><span class="note warn">${esc(inf.error)}</span></div>`;
    else if (!el.isConnected) h += `<div class="sec"><span class="note">This element isn’t on screen right now.</span></div>`;
    else {
      h += imageSection(el);
      if (el.tagName.toLowerCase() === 'svg') h += iconSection(el);
      else h += propsSection(inf);
      if (inf.classKind === 'dynamic') h += `<div class="sec"><span class="note warn">${esc(inf.classReason)}</span></div>`;
      if (inf.text?.editable) h += sec('Content', `<label class="inp"><input type="text" data-text="1" value="${esc(inf.text.value)}" aria-label="Text"></label>`);
      else if (isText(el)) h += sec('Content', `<span class="note">${esc(inf.text?.reason || '')}</span>`);
      if (isText(el) || inf.text?.editable) {
        // next/font names fonts like "__geistSans_1e4310": show "Geist Sans".
        const fam = camelWords(cs(el).fontFamily.split(',')[0].replace(/["']/g, '').replace(/^_+/, '').replace(/_[0-9a-f]{4,}$/i, '').replace(/_Fallback.*$/, '')).replace(/^./, (c) => c.toUpperCase());
        const fw = val('fontWeight');
        h += sec('Typography', `<label class="inp lock"><input type="text" value="${esc(fam)}" disabled aria-label="Font"></label>
          <div class="r2"><label class="inp"><select data-sel="fontWeight" aria-label="Weight">${[[100, 'Thin'], [200, 'Extra light'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']].map(([v, n]) => `<option value="${v}"${v === fw ? ' selected' : ''}>${n}</option>`).join('')}</select>${ico('chev', 12)}</label>${nf('fontSize', '<b class="tg">T</b>', 'Font size')}</div>
          <div class="r2">${nf('lineHeight', 'lh', 'Line height')}${nf('letterSpacing', 'ls', 'Letter spacing', '%')}</div>
          <div class="r2"><div class="ibs">${[['left', 'alL'], ['center', 'alC'], ['right', 'alR']].map(([v, i]) => `<button class="ib${val('align') === v ? ' on' : ''}" data-act="set" data-p="align" data-v="${v}" title="Align ${v}">${ico(i)}</button>`).join('')}</div><span></span></div>`);
        h += sec('Text color', colorRow('color', 'Text color'));
      }
      h += layoutSections(el);
      if (el.tagName.toLowerCase() === 'svg') {
        h += sec('Icon color', colorRow('color', 'Icon color'));
        h += sec('Appearance', `<div class="r2">${nf('opacity', 'opa', 'Opacity', '%')}<span></span></div>`);
        const st0 = p.querySelector('.scroll')?.scrollTop || 0;
        p.innerHTML = tabsHTML() + `<div class="scroll">${h}</div>`;
        p.querySelector('.scroll').scrollTop = st0;
        return;
      }
      const indep = S.corners;
      h += sec('Appearance', `<div class="r2c">${nf('opacity', 'opa', 'Opacity', '%')}${nf('radius', 'rad', 'Corner radius')}<button class="ib${indep ? ' on' : ''}" data-act="corners" title="Independent corners">${ico('corners')}</button></div>
        ${indep ? `<div class="r4">${nf('rTL', cornerIco(0), 'Top left')}${nf('rTR', cornerIco(90), 'Top right')}${nf('rBR', cornerIco(180), 'Bottom right')}${nf('rBL', cornerIco(270), 'Bottom left')}</div>` : ''}`);
      const g = gradOf();
      const hasFill = g || (val('bg') && val('bg') !== 'transparent');
      h += sec('Fill', hasFill ? fillBody(g, el) : '', hasFill ? '' : hb('addFill', 'plus', 'Add fill'));
      const hasStroke = val('borderW') > 0;
      h += sec('Stroke', hasStroke ? colorRow('borderC', 'Stroke color', 'rmStroke') + `<div class="r2">${nf('borderW', 'sw', 'Stroke width')}<span></span></div>` : '', hasStroke ? '' : hb('addStroke', 'plus', 'Add stroke'));
      const sh = shadowOf(), keys = (S.theme?.shadow || []).filter((k) => k !== 'none' && k !== 'inner');
      h += sec('Effects', sh !== 'none' ? `<div class="cr"><label class="inp"><select data-sel="shadow" aria-label="Shadow">${keys.map((k) => `<option value="${esc(k)}"${k === sh ? ' selected' : ''}>Shadow · ${k === 'DEFAULT' ? 'default' : esc(k)}</option>`).join('')}</select>${ico('chev', 12)}</label><button class="ib" data-act="rmShadow" title="Remove shadow">${ico('minus')}</button></div>` : '', sh !== 'none' ? '' : hb('set', 'plus', 'Add shadow', 'sm', 'data-p="shadow"'));
    }
    const st = p.querySelector('.scroll')?.scrollTop || 0;
    p.innerHTML = tabsHTML() + `<div class="scroll">${h}</div>`;
    p.querySelector('.scroll').scrollTop = st;
  }

  /* ---------- history ---------- */
  async function refreshVersions() {
    try { S.versions = await api('/versions'); } catch {}
    renderTop();
    if (S.mode === 'edit') layersSoon();
    if (S.side === 'history') renderPanel();
    renderPeek();
  }
  const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const chLabel = (c) => `${c.name ? `<b>${esc(c.name)}</b> · ` : ''}${esc(c.label)}`;
  // Version history like Figma's: a timeline with the current version at the top, named versions as
  // milestones, and runs of autosaves folded into one "N autosave versions" row.
  S.vGroups = new Set(); S.vSel = null; S.vOpen = null; S.vNaming = null;
  const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const initials = (n) => String(n || 'You').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const who = (n) => `<span class="vWho"><i class="vAv">${esc(initials(n))}</i>${esc(n || 'You')}</span>`;
  const RING = '<i class="vRing"></i>';
  function historyHTML() {
    const { versions, draft, peeking, by } = S.versions;
    const v = versions.slice().reverse();
    // Fold runs of autosaves; named versions stand on their own.
    const groups = [];
    for (const x of v) {
      const last = groups[groups.length - 1];
      if (x.kind !== 'named' && last?.auto) last.items.push(x);
      else groups.push({ auto: x.kind !== 'named', items: [x] });
    }
    const changesList = (list) => `<div class="vChanges">${list.slice(0, 8).map((c) => `<span class="ch">${c.source === 'ai' ? '<span class="src">AI</span> ' : ''}${chLabel(c)}</span>`).join('')}${list.length > 8 ? `<span class="note">and ${list.length - 8} more</span>` : ''}</div>`;
    const item = (x, node) => {
      const sel = S.vSel === x.n || peeking === x.n;
      const naming = S.vNaming === x.n;
      return `<div class="vRow">${node ? `<span class="vNode">${RING}</span>` : ''}
        <div class="vItem${sel ? ' sel' : ''}" data-act="vSel" data-v="${x.n}">
          ${naming ? `<form class="vName" data-form="vname" data-n="${x.n}"><input value="${esc(x.name || '')}" placeholder="Name this version" aria-label="Version name" maxlength="80"></form>` : `<div class="vTitle">${x.name ? esc(x.name) : when(x.at)}</div>`}
          ${x.name && !naming ? `<span class="vSub">${when(x.at)}</span>` : ''}
          ${who(x.by || by)}
          ${peeking === x.n ? '<span class="vPeek">Showing the screen before this</span>' : ''}
          ${S.vOpen === x.n ? changesList(x.changes) : ''}
          <button class="vMore" data-act="vMenu" data-v="${x.n}" aria-label="Version actions" title="Actions">${ico('dots', 16)}</button>
        </div></div>`;
    };
    const body = groups.map((g) => {
      if (!g.auto || g.items.length === 1) return g.items.map((x) => item(x, x.kind === 'named')).join('');
      const key = g.items[0].n, open = S.vGroups.has(key) || g.items.some((x) => x.n === S.vSel || x.n === peeking);
      return `<div class="vRow"><span class="vNode sm">${ico(open ? 'chev' : 'chevR', 10)}</span><button class="vGroup" data-act="vGroup" data-v="${key}">${g.items.length} autosave versions</button></div>${open ? g.items.map((x) => item(x, false)).join('') : ''}`;
    }).join('');
    return `<div class="ptabs"><button class="on">Version history</button><button class="x" data-act="history" aria-label="Close">${ico('x')}</button></div>
      <div class="scroll vScroll">
        <p class="vIntro">Tovi saves a version every few minutes, when you change page and when you present. Name a version to keep it as a milestone.</p>
        <div class="vTimeline">
          <div class="vRow"><span class="vNode">${RING}</span><div class="vItem cur${S.vSel == null && peeking == null ? ' sel' : ''}">
            <div class="vTitle">Current version</div>
            ${draft.length ? `<span class="vSub">${draft.length} change${draft.length === 1 ? '' : 's'} not in a version yet</span>${changesList(draft.slice().reverse())}
              <form class="vSave" data-form="vsave"><input placeholder="Name it (optional)" aria-label="Version name" maxlength="80"><button class="primary sm">Save version</button></form>` : `<span class="vSub">Everything is saved</span>`}
            ${who(by)}
          </div></div>
          ${body}
          ${v.length ? '' : '<div class="vRow"><div class="vItem empty"><span class="vSub">No versions yet. They appear here as you work.</span></div></div>'}
        </div>
      </div>`;
  }
  function renderPeek() {
    const b = $('peekBar'), n = S.versions.peeking;
    b.hidden = !n;
    if (n) b.innerHTML = `<span>Showing the screen before version ${n}</span><button class="amberBtn" data-act="peek" data-v="${n}">Back to now</button>`;
  }

  /* ---------- changes popover, toast ---------- */
  async function renderChanges() {
    const c = $('changes');
    c.hidden = !S.changesOpen;
    if (c.hidden) return;
    let list = [];
    try { list = await api('/changes'); } catch {}
    c.innerHTML = `<div class="secH"><span>Changes this session</span>${hb('changes', 'x', 'Close')}</div>` + (list.length
      ? list.slice().reverse().map((x) => `<div class="chg"><span>${esc((x.summary.labels || []).join(' · '))}</span><span class="mono">${esc(x.file)}${x.summary.added?.length || x.summary.removed?.length ? ` · ${esc([x.summary.removed.join(' ') || '—', x.summary.added.join(' ')].join(' → '))}` : ''}</span></div>`).join('')
      : '<span class="note">No changes yet.</span>');
  }
  let toastT;
  function toast(msg, sub, err, withUndo, code) {
    const t = $('toast');
    t.hidden = false;
    t.className = 'toast' + (err ? ' err' : '');
    t.innerHTML = `<div class="tx"><span>${esc(msg)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${code ? `<details class="code"><summary>Code</summary><span class="mono">${esc(code)}</span></details>` : ''}</div>${withUndo ? '<button class="outline" data-act="undo">Undo</button>' : ''}<button class="ib" data-act="toastClose" aria-label="Dismiss">${ico('x')}</button>`;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 4000);
  }

  /* ---------- modes ---------- */
  function setMode(m) {
    if (m === S.mode) return;
    S.mode = m;
    S.hintSeen = true;
    if (m === 'preview') {
      S.hover = null; S.changesOpen = false; S.noteDraft = null; S.tool = S.tool === 'annotate' ? 'select' : S.tool;
      if (S.editing) S.editing.blur();
      saveVersion();
      renderChanges();
    } else { S.askOpen = false; if (S.side === 'history') S.side = 'design'; }
    syncTool();
    renderAll();
    // Panels open or close with the mode, so the presentation re-fits.
    setTimeout(applyDevice, 0);
  }
  // Versions save themselves: after a few minutes of edits, when you move to another page, or when you present.
  S.verAt = 0;
  function saveVersion() {
    if (!S.count || S.count === S.verAt || S.versions.peeking) return;
    S.verAt = S.count;
    api('/version', { kind: 'auto' }).then((v) => { S.versions = v; renderTop(); if (S.side === 'history') renderPanel(); }).catch(() => {});
  }
  setInterval(saveVersion, 3 * 60 * 1000);
  // Cursors and capture layers follow the tool: arrow to select, the app's own cursors to interact, a hand to move.
  function syncTool() {
    document.body.dataset.tool = S.mode === 'preview' ? 'present' : S.tool;
    D?.documentElement?.classList.toggle('kerf-pick', picking() || (S.mode === 'edit' && S.tool === 'annotate'));
  }
  function renderAll() {
    renderTop(); renderBar(); renderLeft(); renderPanel(); renderAsk(); renderMarks();
  }

  /* ---------- outlines follow the page ---------- */
  function place(box, el, label) {
    if (!el || !el.isConnected || !W) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.style.transform = `translate(${r.left}px,${r.top}px)`;
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    const t = box.querySelector('.tag');
    if (label != null && t) { t.textContent = label; t.classList.toggle('in', r.top < 22); }
  }
  const labelOf = (el) => dName(el);
  function pool(container, n, cls) {
    while (container.children.length < n) { const d = document.createElement('div'); d.className = 'box ' + cls; d.innerHTML = '<span class="tag"></span>'; container.appendChild(d); }
    return [...container.children];
  }
  function loop() {
    try { frameStep(); } catch (e) { if (!loop.warned) { console.warn('Tovi: drawing step failed', e); loop.warned = true; } }
    requestAnimationFrame(loop);
  }
  function frameStep() {
    refind();
    const edit = S.mode === 'edit';
    place($('hov'), picking() && S.hover !== S.sel?.el ? S.hover : null, S.hover ? labelOf(S.hover) : '');
    place($('sel'), edit ? S.sel?.el : null, S.sel ? labelOf(S.sel.el) : '');
    if (edit && S.sel?.el?.isConnected) {
      const r = S.sel.el.getBoundingClientRect(), dim = $('sel').querySelector('.dim');
      const t = `${Math.round(r.width)} × ${Math.round(r.height)}`;
      if (dim.textContent !== t) dim.textContent = t;
      $('sel').classList.toggle('comp', !!(useOf(S.sel.el) && /^[A-Z]/.test(S.sel.el.getAttribute('data-kerf-n') || '')));
    }
    const sib = edit && S.sel ? [...(S.sel.repeat > 1 ? [...sameLoc(S.sel.el)].filter((x) => x !== S.sel.el) : []), ...(S.simScope === 'all' && picking() ? (S.sel.similar || []) : [])].slice(0, 60) : [];
    pool($('sibs'), sib.length, 'sib').forEach((b, i) => place(b, sib[i] || null, null));
    const aEls = D ? (S.amber || []).flatMap((loc) => [...D.querySelectorAll(q(loc))]).slice(0, 60) : [];
    pool($('amb'), aEls.length, 'amber').forEach((b, i) => place(b, aEls[i] || null, null));
    if (W) $('marksG').setAttribute('transform', `translate(${-W.scrollX} ${-W.scrollY})`);
    placeHandles(); placeMulti(); measureLines();
    if (W && W.location.pathname + W.location.search !== S.path) {
      S.path = W.location.pathname + W.location.search;
      S.pages = [S.path, ...S.pages.filter((x) => x !== S.path)].slice(0, 20);
      saveVersion();
      if (document.activeElement?.id !== 'pathIn') { const pi = $('pathIn'); if (pi) pi.value = S.path; }
      layersSoon();
    }
  }

  /* ---------- app events ---------- */
  function bindApp() {
    try { W = frame.contentWindow; D = frame.contentDocument; } catch { W = D = null; }
    if (!W || !D) return;
    S.sel = null; S.hover = null;
    // An input the app focuses on load would swallow Tovi's shortcuts (E, A…): release it until the user clicks in the app.
    let touched = false;
    W.addEventListener('pointerdown', () => { touched = true; }, true);
    [0, 300, 1200].forEach((ms) => setTimeout(() => { const a = D.activeElement; if (!touched && a && a !== D.body && /^(input|textarea|select)$/i.test(a.tagName)) a.blur(); }, ms));
    // Selecting shows a plain arrow over the app; interacting keeps the app's own cursors.
    const st = D.createElement('style');
    st.textContent = 'html.kerf-pick, html.kerf-pick *{cursor:default!important}';
    (D.head || D.documentElement).appendChild(st);
    syncTool();
    // ⌘-clicking a link would open a new browser tab: follow it in place instead.
    let passing = false;
    W.addEventListener('click', (e) => {
      if (!thru(e) || !e.isTrusted) return;
      const a = e.target.closest?.('a[href]');
      if (a) { e.preventDefault(); e.stopImmediatePropagation(); passing = true; try { a.click(); } finally { passing = false; } }
    }, true);
    const block = (e) => {
      if (passing || appClicks() || thru(e)) return;
      if (S.editing && S.editing.contains(e.target)) return;
      e.preventDefault(); e.stopPropagation();
    };
    ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'touchstart', 'submit', 'contextmenu', 'auxclick'].forEach((t) => W.addEventListener(t, block, true));
    W.addEventListener('pointerdown', () => { closeMenu(); closeIconPop(); }, true);
    W.addEventListener('scroll', () => closeMenu(), true);
    W.addEventListener('contextmenu', (e) => {
      if (!picking() || S.editing) return;
      const hit = pick(e.target);
      if (!hit) return;
      // Wait for the element's code to be read, so the menu offers everything it can do (like Edit text).
      const ready = S.sel?.el !== hit ? (S.multi = [], select(hit)) : null;
      const fr = frame.getBoundingClientRect(), at = { x: fr.left + e.clientX * S.z, y: fr.top + e.clientY * S.z };
      Promise.resolve(ready).catch(() => {}).then(() => { if (S.sel?.el === hit) contextMenu(at); });
    }, true);
    let lastClick = null;
    // Browsers send no click to a disabled button or input, only pointer events: select those on release.
    W.addEventListener('pointerup', (e) => { if (picking() && !thru(e) && e.button === 0 && e.target.closest?.(':disabled')) onCanvasClick(e); }, true);
    W.addEventListener('click', onCanvasClick, true);
    function onCanvasClick(e) {
      if (passing || !picking() || thru(e)) { closeFloating(); return; }
      if (S.editing && S.editing.contains(e.target)) return;
      block(e);
      closeFloating();
      // A click on a <label> makes the browser click its input too: ignore that echo.
      const now = performance.now();
      if (lastClick && now - lastClick.t < 80 && lastClick.el !== e.target && !lastClick.el.contains(e.target)) return;
      lastClick = { el: e.target, t: now };
      if (S.editing) S.editing.blur();
      layersScrollToSel = true;
      const hit = pick(e.target);
      if (e.shiftKey && S.sel && hit && hit !== S.sel.el) {
        const i = S.multi.findIndex((m) => m.el === hit);
        if (i > -1) S.multi.splice(i, 1); else S.multi.push({ el: hit, def: defOf(hit), use: useOf(hit) });
        renderPanel();
        return;
      }
      S.multi = [];
      select(hit);
    }
    W.addEventListener('dblclick', (e) => {
      if (!picking() || thru(e)) return;
      block(e);
      if (S.sel && S.sel.el.contains(e.target)) beginText();
    }, true);
    W.addEventListener('pointermove', (e) => { S.hover = picking() && !thru(e) ? pick(e.target) : null; }, true);
    W.addEventListener('pointerleave', () => { S.hover = null; });
    W.addEventListener('keydown', onKey, true);
    ['keydown', 'keyup'].forEach((k) => W.addEventListener(k, holdKeys, true));
    W.addEventListener('wheel', pinch, { passive: false });
    // Re-read layers when the app's DOM changes (navigation, data loading, hot reload).
    new W.MutationObserver(() => layersSoon()).observe(D.body, { childList: true, subtree: true });
    renderAll();
  }
  frame.addEventListener('load', bindApp);
  $('devLabel').addEventListener('click', () => { if (S.mode !== 'edit') return; if (S.tool !== 'select') setTool('select'); S.multi = []; select(null); S.pageSel = true; renderPanel(); });
  addEventListener('resize', () => { if (innerWidth < 900 && S.layersOpen) { S.layersOpen = false; renderLeft(); renderTop(); } });

  // Clicking outside a floating card closes it.
  function closeFloating() {
    let changed = false;
    if (S.askOpen && !S.card?.busy) { S.askOpen = false; changed = true; }
    if (S.card && !S.card.busy && S.card.where === 'notes') { S.card = null; changed = true; }
    if (S.changesOpen) { S.changesOpen = false; renderChanges(); }
    if (S.cpick) { S.cpick = null; renderPanel(); }
    if (changed) { S.amber = []; renderAsk(); renderMarks(); renderBar(); }
  }

  /* ---------- keyboard (editor and app) ---------- */
  function onKey(e) {
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleAI(true); return; }
    if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
    if (!typing && !mod && e.key === '?') { e.preventDefault(); shortcuts(); return; }
    if (!typing && !mod && e.shiftKey && (e.key === '|' || e.code === 'Backslash')) { e.preventDefault(); toggleMinUI(); return; }
    if (e.key === 'Escape' && !$('menu').hidden) { closeMenu(); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom('in'); return; }
    if (mod && (e.key === '-' || e.key === '_')) { e.preventDefault(); setZoom('out'); return; }
    if (e.shiftKey && !mod && !typing && (e.code === 'Digit1' || e.code === 'Digit0')) { e.preventDefault(); setZoom(e.code === 'Digit1' ? 'fit' : 1); return; }
    if (e.key === 'Escape') {
      if (S.editing) return;
      // While interacting, Escape belongs to the app (closing its menus and dialogs).
      if (S.mode === 'edit' && S.tool === 'interact' && t?.ownerDocument === D) return;
      e.preventDefault();
      if (!$('modal').hidden) { $('modal').hidden = true; }
      else if (S.cpick) { S.cpick = null; renderPanel(); }
      else if (S.noteDraft) { S.noteDraft = null; renderMarks(); }
      else if (S.pendingInsert) { S.pendingInsert = false; $('toast').hidden = true; }
      else if (S.card && !S.card.busy && S.card.where !== 'chat') { S.card = null; S.amber = []; renderAll(); }
      else if (S.askOpen) { S.askOpen = false; S.amber = []; renderAsk(); renderBar(); }
      else if (S.changesOpen) { S.changesOpen = false; renderChanges(); }
      else if (S.tool === 'annotate') setTool('select');
      else if (S.side === 'history') { S.side = 'design'; renderAll(); }
      else if (S.mode === 'edit' && S.multi.length) { S.multi = []; renderPanel(); }
      else if (S.mode === 'edit' && S.sel) select(null);
      else if (S.pageSel) { S.pageSel = false; renderPanel(); }
      else if (S.mode === 'preview') setMode('edit');
      else if (S.tool !== 'select') setTool('select');
      return;
    }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z' && S.mode === 'edit') { e.preventDefault(); undo(); return; }
    if (mod || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'v' || k === 'e') { if (S.mode === 'preview') setMode('edit'); setTool('select'); }
    else if (k === 'p') { if (S.mode === 'preview') setMode('edit'); setTool('interact'); }
    else if (k === 'i' && (!picking() || !S.sel)) startInsert();
    else if (k === 'a' && S.mode === 'edit') setTool(S.tool === 'annotate' ? 'select' : 'annotate');
    else if (S.mode === 'edit' && k === 'enter' && S.sel) beginText();
    else return;
    e.preventDefault();
  }
  window.addEventListener('keydown', onKey, true);
  function holdKeys(e) {
    const through = (e.metaKey || e.ctrlKey) && e.type === 'keydown';
    if (through !== S.through && (e.key === 'Meta' || e.key === 'Control' || !through)) { S.through = through; S.hover = null; syncTool(); }
  }
  ['keydown', 'keyup'].forEach((k) => window.addEventListener(k, holdKeys, true));
  window.addEventListener('blur', () => { if (S.through) { S.through = false; syncTool(); } });
  function toggleAI() {
    if (S.mode === 'preview') setMode('edit');
    S.left = 'chat';
    if (!S.layersOpen) { S.layersOpen = true; renderTop(); setTimeout(applyDevice, 0); }
    renderLeft(true);
    $('chatIn')?.focus();
  }

  /* ---------- editor clicks ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    const lay = e.target.closest('[data-layer]');
    if (lay) {
      const tw = e.target.closest('[data-twist]');
      if (tw && tw.innerHTML) { const k = tw.dataset.twist; S.open[k] = !(S.open[k] || false); renderLayers(); return; }
      const el = layerEls[+lay.dataset.layer];
      if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); select(el); }
      return;
    }
    if (!a) {
      if (S.cpick && !e.target.closest('.cpop')) { S.cpick = null; renderPanel(); }
      if (!e.target.closest('#ask,#noteRes,#bar,#changes,#toast,#panel,#layers,#top,#modal')) closeFloating();
      return;
    }
    const act = a.dataset.act, v = a.dataset.v;
    switch (act) {
      case 'mode': setMode(v); break;
      case 'present': setMode('preview'); break;
      case 'settings': openSettings(); break;
      case 'setTog':
        if (v === 'agents') { S.agentsOn = !S.agentsOn; save('kerf.agents', S.agentsOn ? 'on' : 'off'); }
        if (v === 'sim') { S.simScope = S.simScope === 'all' ? 'one' : 'all'; save('kerf.sim', S.simScope); renderPanel(); }
        if (v === 'scale') { S.scaleArrows = !S.scaleArrows; save('kerf.scale', S.scaleArrows ? 'on' : 'off'); }
        openSettings(); break;
      case 'setMode': setStyleMode(v); openSettings(); break;
      case 'setDir': $('modal').hidden = true; openDirection(); break;
      case 'setPanels': for (const k of Object.keys(SIDE)) { try { localStorage.removeItem(`kerf.side.${k}`); } catch {} setSide(k, SIDE[k].def); } applyDevice(); toast('Panels are back to their usual widths'); break;
      case 'simScope': S.simScope = v; renderPanel(); break;
      case 'keys': shortcuts(); break;
      case 'undo': undo(); break;
      case 'changes': S.changesOpen = !S.changesOpen; renderChanges(); break;
      case 'toastClose': $('toast').hidden = true; break;
      case 'scope': S.scope = v; S.cpick = null; renderPanel(); break;
      case 'srcScope': S.srcScope = v; renderPanel(); break;
      case 'sizeOnly': S.sizeOnly[S.device] = v === 'true'; renderPanel(); break;
      case 'reveal': S.reveal = { el: S.sel?.el, ...(S.reveal?.el === S.sel?.el ? S.reveal : {}), [v]: true }; renderPanel(); break;
      case 'vSel': if (!e.target.closest('.vMore,.vName')) { S.vSel = S.vSel === +v ? null : +v; renderPanel(); } break;
      case 'vGroup': S.vGroups.has(+v) ? S.vGroups.delete(+v) : S.vGroups.add(+v); renderPanel(); break;
      case 'vMenu': {
        const n = +v, x = S.versions.versions.find((y) => y.n === n);
        const r = a.getBoundingClientRect();
        S.vSel = n; renderPanel();
        openMenu([
          { label: S.vOpen === n ? 'Hide what changed' : `What changed (${x?.changes.length || 0})`, run: () => { S.vOpen = S.vOpen === n ? null : n; renderPanel(); } },
          { label: S.versions.peeking === n ? 'Back to the current screen' : 'Show the screen before this', run: () => peek(n) },
          { label: x?.name ? 'Rename…' : 'Name this version…', run: () => { S.vNaming = n; renderPanel(); setTimeout(() => document.querySelector('.vName input')?.focus(), 0); } },
          '-',
          { label: 'Restore this version', sub: 'Undo every change after it', danger: true, run: () => restore(n) },
        ], { x: r.left - 180, y: r.bottom + 4 });
        break;
      }
      case 'saveVersion': api('/version', {}).then((v) => { S.versions = v; renderPanel(); renderTop(); toast(`Saved version ${v.versions.length}`); }).catch((e) => toast(e.message, '', true)); break;
      case 'copyLoc': navigator.clipboard?.writeText(activeLoc() || '').then(() => toast('Copied the code location', activeLoc() || '')).catch(() => {}); break;
      case 'parent': { const p = S.sel && pick(S.sel.el.parentElement); if (p) select(p); break; }
      case 'corners': S.corners = !S.corners; renderPanel(); break;
      case 'cpick': S.cpick = S.cpick === v ? null : v; renderPanel(); break;
      case 'token': case 'set': commit({ ops: [{ prop: a.dataset.p, value: v }] }); break;
      case 'addFill': commit({ ops: [{ prop: 'bg', value: tokens().find(([n]) => n === 'surface')?.[0] || 'white' }] }); break;
      case 'rmFill': S.cpick = null; if (gradOf()) commit({ ops: [{ prop: 'gradient', value: 'none' }, { prop: 'clipText', value: 'off' }] }); else clearStyle([{ prop: 'bg', value: null }], [{ prop: 'bg', value: 'transparent' }], (el) => !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs(el).backgroundColor)); break;
      case 'rmShadow': clearStyle([{ prop: 'shadow', value: null }], [{ prop: 'shadow', value: 'none' }], (el) => cs(el).boxShadow.split(/,(?![^(]*\))/).some((x) => !/rgba\([^)]*,\s*0\)/.test(x) && /[1-9]\d*(\.\d+)?px/.test(x))); break;
      case 'addStroke': commit({ ops: [{ prop: 'borderW', value: 1 }, { prop: 'borderC', value: tokens().find(([n]) => n === 'border')?.[0] || 'black' }] }); break;
      case 'rmStroke': S.cpick = null; clearStyle([{ prop: 'borderW', value: null }, { prop: 'borderC', value: null }], [{ prop: 'borderW', value: 0 }], (el) => parseFloat(cs(el).borderTopWidth) > 0); break;
      case 'setProp': commit({ props: [{ name: a.dataset.p, value: v }] }); break;
      case 'ask': toggleAI(false); break;
      case 'layersToggle': S.layersOpen = !S.layersOpen; renderLeft(); renderTop(); setTimeout(applyDevice, 0); break;
      case 'left': S.left = v; try { localStorage.setItem('kerf.left', v); } catch {} renderLeft(v === 'chat'); break;
      case 'device': S.device = v; S.zoom = 'fit'; applyDevice(); renderTop(); renderPanel(); break;
      case 'zoom': setZoom(v); break;
      case 'kerfMenu': kerfMenu(below(a)); break;
      case 'pagesMenu': pagesMenu(below(a)); break;
      case 'zoomMenu': zoomMenu(below(a)); break;
      case 'shortcuts': shortcuts(); break;
      case 'reload': W?.location.reload(); break;
      case 'history': S.side = S.side === 'history' ? 'design' : 'history'; if (S.side === 'history') refreshVersions(); renderAll(); break;
      case 'peek': peek(+v); break;
      case 'restore': restore(+v); break;
      case 'pr': openPR(); break;
      case 'closeModal': $('modal').hidden = true; break;
      case 'createPR': createPR(); break;
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.propsel) return t.value && commit({ props: [{ name: t.dataset.propsel, value: t.value, ...(t.dataset.options ? { options: t.dataset.options.split('|') } : {}), ...(t.dataset.def ? { def: t.dataset.def } : {}) }] });
    if (t.dataset.propnum) { const n = parseFloat(t.value); return isFinite(n) && commit({ props: [{ name: t.dataset.propnum, value: n }] }); }
    if (t.dataset.proptext) return commit({ props: [{ name: t.dataset.proptext, value: t.value }] });
    if (t.dataset.sel) return commit({ ops: [{ prop: t.dataset.sel, value: /^\d+$/.test(t.value) ? +t.value : t.value }] });
    if (t.dataset.text) return t.value.trim() && commit({ text: t.value.trim() });
    if (t.dataset.colorinput) return commit({ ops: [{ prop: t.dataset.colorinput, value: t.value.toUpperCase() }] });
    const p = t.dataset.prop;
    if (!p) return;
    if (t.dataset.color) {
      const hx = t.value.trim().replace(/^#/, '');
      if (/^[0-9a-f]{6}$/i.test(hx)) commit({ ops: [{ prop: p, value: '#' + hx.toUpperCase() }] });
      else renderPanel();
      return;
    }
    const n = parseFloat(t.value);
    if (isNaN(n)) return renderPanel();
    const v = clamp(p, Math.round(n * 10) / 10);
    // Icons keep their proportions when resized, like Figma.
    if ((p === 'w' || p === 'h') && S.sel?.el?.tagName.toLowerCase() === 'svg') {
      const r = S.sel.el.getBoundingClientRect(), k = p === 'w' ? r.height / (r.width || 1) : r.width / (r.height || 1);
      return commit({ ops: [{ prop: p, value: v }, { prop: p === 'w' ? 'h' : 'w', value: Math.round(v * k) }] });
    }
    commit({ ops: [{ prop: p, value: v }] });
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.colorinput && S.sel) preview(S.sel.el, t.dataset.colorinput, t.value);
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target, p = t.dataset && t.dataset.prop;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && t.closest && t.closest('.kc')) { e.preventDefault(); t.form.requestSubmit(); return; }
    if (!p || t.dataset.color || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !S.sel) return;
    e.preventDefault();
    // Arrows step through the app's own scale (so values stay on the design system); Shift is a precise 1px nudge.
    const up = e.key === 'ArrowUp', cur = parseFloat(t.value) || 0, steps = S.scaleArrows ? scaleSteps(p) : null;
    const n = clamp(p, steps && !e.shiftKey ? (up ? steps.find((x) => x > cur + 0.01) : [...steps].reverse().find((x) => x < cur - 0.01)) ?? cur + (up ? 1 : -1) : cur + (up ? 1 : -1) * (steps || !e.shiftKey ? 1 : 10));
    t.value = n;
    preview(S.sel.el, p, n);
    commitSoon(p, n);
  });
  // Naming a version: Escape or clicking away cancels.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.closest?.('.vName')) { e.stopPropagation(); S.vNaming = null; renderPanel(); } }, true);
  document.addEventListener('focusout', (e) => { if (e.target.closest?.('.vName') && S.vNaming != null) setTimeout(() => { if (!document.activeElement?.closest('.vName')) { S.vNaming = null; renderPanel(); } }, 120); });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'path') { let v = $('pathIn').value.trim() || '/'; if (!v.startsWith('/')) v = '/' + v; frame.src = v; $('pathIn').blur(); }
    if (f === 'ask') take('askIn', (v, atts) => runAI(v, visibleTargets(), 'ask', null, false, atts));
    if (f === 'chat') sendChat();
    if (f === 'pick' && S.pick) { S.pick.prompt = $('pickQ').value; if (S.pick.kind === 'photo') S.pick.photos = null; else S.pick.drawings = null; runPicker(); }
    if (f === 'note') addNote();
    if (f === 'person') { const name = $('setPerson').value.trim(); if (!name) return; api('/person', { name }).then((p) => { $('setPerson').value = p.name; toast(`Versions will show ${p.name}`); }).catch((err) => toast(err.message, '', true)); }
    if (f === 'vsave') { const name = e.target.querySelector('input').value.trim(); api('/version', { kind: 'named', name: name || null }).then((v) => { S.versions = v; S.verAt = S.count; renderPanel(); renderTop(); toast(name ? `Saved “${name}”` : 'Saved a version'); }).catch((err) => toast(err.message, '', true)); }
    if (f === 'vname') { const n = +e.target.dataset.n, name = e.target.querySelector('input').value.trim(); api('/rename', { n, name }).then((v) => { S.versions = v; S.vNaming = null; renderPanel(); }).catch((err) => toast(err.message, '', true)); }
    if (f === 'reply') {
      const where = e.target.dataset.where, prev = S.card;
      take('replyIn', (v, atts) => runAI(v, where === 'notes' && prev?.targets ? prev.targets : visibleTargets(), where, v, true, atts));
    }
  });
  // Drag a field's icon to scrub its value, like Figma. Preview live, write once on release.
  let scrub = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-scrub]');
    if (!h || !S.sel) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    const p = h.dataset.scrub;
    scrub = { p, x: e.clientX, v: parseFloat(val(p)) || 0, input: h.parentElement.querySelector('input'), n: null };
    document.body.style.cursor = 'ew-resize';
  });
  document.addEventListener('pointermove', (e) => {
    if (!scrub) return;
    const n = clamp(scrub.p, Math.round(scrub.v + (e.clientX - scrub.x) / 2));
    scrub.n = n;
    scrub.input.value = n;
    preview(S.sel.el, scrub.p, n);
  });
  document.addEventListener('pointerup', () => {
    if (!scrub) return;
    const s = scrub;
    scrub = null;
    document.body.style.cursor = '';
    if (s.n != null && s.n !== s.v) commit({ ops: [{ prop: s.p, value: s.n }] });
  });

  /* ---------- history actions ---------- */
  async function peek(n) {
    try {
      S.versions = S.versions.peeking === n ? await api('/unpeek', {}) : await api('/peek', { n });
      toast(S.versions.peeking ? `Showing the screen before version ${n}` : 'Back to the current version');
    } catch (e) { toast(e.message, '', true); }
    afterEdit();
  }
  async function restore(n) {
    if (!confirm(n === 0 ? 'Undo every change from this session?' : 'Restore this version? Every change after it is undone.')) return;
    try {
      S.versions = await api('/restore', { n });
      const c = await api('/changes');
      S.count = c.length;
      toast(n === 0 ? 'Back to how the screen started' : 'Restored that version');
      S.vSel = null;
    } catch (e) { toast(e.message, '', true); }
    afterEdit();
  }

  /* ---------- pull request ---------- */
  async function openPR() {
    await api('/version', {}).then((v) => (S.versions = v)).catch(() => {});
    const p = await api('/project').catch(() => ({}));
    const all = [...S.versions.versions.flatMap((v) => v.changes), ...S.versions.draft];
    const files = [...new Set(all.map((c) => c.file))];
    const title = all.length === 1 ? `Design: ${all[0].name ? all[0].name + ' · ' : ''}${all[0].label}`.slice(0, 72) : `Design updates: ${all.length} changes${S.path === '/' ? '' : ` on ${S.path}`}`;
    S.prAll = all;
    const m = $('modal');
    m.hidden = false;
    m.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="prT">
      <div class="dh"><div style="display:flex;flex-direction:column;gap:4px"><h2 id="prT">Hand off to developers</h2><span class="note">Tovi sends your changes as one pull request on GitHub. Developers review it before anything goes live.</span></div><button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div>
      <div class="db">
        ${!p.repo ? `<span class="note warn">This project isn’t connected to a GitHub repository, so Tovi can’t open a pull request for it.</span>` : ''}
        <label><span class="secT">Title</span><input class="fld" id="prTitle" value="${esc(title)}"></label>
        <label><span class="secT">Note for your developers <span class="note" style="font-weight:400">(optional)</span></span><textarea class="fld" id="prBody" rows="3" placeholder="Anything they should know, e.g. why you made these changes"></textarea></label>
        <div style="display:flex;align-items:center;gap:8px;color:var(--ink2)"><span class="chip mono" style="color:var(--ink)">${p.branch?.startsWith('kerf/') ? esc(p.branch) : 'kerf/…'}</span>→<span class="chip mono" style="color:var(--ink)">${esc(p.branch?.startsWith('kerf/') ? 'its pull request' : p.branch || 'main')}</span>${p.repo ? `<span class="note">${esc(p.repo)}</span>` : ''}</div>
        <div class="files"><div class="fh"><span>What changed · ${all.length}</span><span class="note" title="${esc(files.join('\n'))}">${files.length} code file${files.length === 1 ? '' : 's'}</span></div><div class="frs">${all.map((c) => `<div class="fr"><span class="dot" style="margin:0"></span><span>${c.source === 'ai' ? '<span class="src">AI</span> ' : ''}${c.name ? `<b>${esc(c.name)}</b> · ` : ''}${esc(c.label)}</span></div>`).join('')}</div></div>
      </div>
      <div class="df"><button class="outline" data-act="closeModal">Cancel</button><button class="primary solo" data-act="createPR" ${p.repo && files.length ? '' : 'disabled'}>Create pull request</button></div></section>`;
  }
  async function createPR() {
    const btn = document.querySelector('[data-act="createPR"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="spin"></i>Sending to GitHub…';
    try {
      const all = S.prAll || [], note = $('prBody').value.trim();
      const body = `${note ? note + '\n\n' : ''}### What changed\n${all.map((c) => `- ${c.source === 'ai' ? '(AI) ' : ''}${c.name ? `**${c.name}**: ` : ''}${c.label}`).join('\n')}\n\n<details><summary>Code changes</summary>\n\n${all.map((c) => `- \`${c.file}\`: ${c.code || c.label}`).join('\n')}\n</details>\n\nMade with Tovi.`;
      const r = await api('/pr', { title: $('prTitle').value, body });
      $('modal').innerHTML = `<section class="dialog" role="dialog" aria-modal="true"><div class="db" style="padding:20px;gap:10px">
        <span style="display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--raised)">${ico('check', 16)}</span>
        <h2 style="margin:0;font-size:18px">${r.updated ? 'Pull request updated' : r.needsGitHubStep ? 'Branch pushed' : 'Pull request ready'}</h2>
        <span class="note">${r.files.length} file${r.files.length === 1 ? '' : 's'} on <span class="mono">${esc(r.branch)}</span>.${r.needsGitHubStep ? ' Open the link to finish creating the pull request on GitHub.' : ''}</span>
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>` : ''}</div>
        <div class="df"><button class="primary solo" data-act="closeModal">Done</button></div></section>`;
      S.project = await api('/project').catch(() => S.project);
      renderTop();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Try again';
      toast(e.message, '', true);
    }
  }

  /* ---------- AI: Ask bar, chat, annotations ---------- */
  const PROP_NAMES = { gradient: 'Gradient', clipText: 'Gradient text', fit: 'Image fit', bg: 'Fill', color: 'Text color', borderC: 'Stroke color', fontSize: 'Size', fontWeight: 'Weight', lineHeight: 'Line height', letterSpacing: 'Letter spacing', align: 'Align', radius: 'Radius', rTL: 'Top-left corner', rTR: 'Top-right corner', rBR: 'Bottom-right corner', rBL: 'Bottom-left corner', padX: 'Padding X', padY: 'Padding Y', gap: 'Gap', borderW: 'Stroke', opacity: 'Opacity', shadow: 'Shadow', w: 'Width', h: 'Height', mX: 'Margin X', mY: 'Margin Y', layout: 'Layout', alignItems: 'Align', justify: 'Distribute', wrap: 'Wrap' };
  const UNIT = { w: 'px', h: 'px', mX: 'px', mY: 'px', fontSize: 'px', lineHeight: 'px', radius: 'px', rTL: 'px', rTR: 'px', rBR: 'px', rBL: 'px', padX: 'px', padY: 'px', gap: 'px', borderW: 'px', opacity: '%', letterSpacing: '%' };
  const WORDS = { fill: 'Fill', grow: 'Fill', hug: 'Hug', auto: 'Auto', row: 'Horizontal', col: 'Vertical', none: 'Off', true: 'On', false: 'Off' };
  const opLabel = (o) => { const v = String(o.value); if (o.prop === 'fontWeight') return `Weight ${({ 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold' })[v] || v}`; return `${PROP_NAMES[o.prop] || o.prop} ${WORDS[v] || v}${/^-?[\d.]+$/.test(v) ? UNIT[o.prop] || '' : ''}`; };
  const structLabel = (st) => ({ token: `Colour “${st.name}”${st.which && st.which !== 'both' ? ` (${st.which})` : ''} → ${st.hex}`, code: `Code change in ${String(st.file || '').split('/').pop()}`, group: `Group into a frame (${st.className || ''})`, ungroup: 'Ungroup', replace: `Replace with: ${(st.jsx || '').slice(0, 60)}`, delete: 'Delete', duplicate: 'Duplicate', move: `Move ${st.dir || 'to ' + st.index}`, swap: `Swap → ${st.to}`, insert: `Add ${st.position}: ${(st.jsx || '').slice(0, 60)}`, image: [st.src && `Image → ${st.src}`, st.alt != null && `Alt “${st.alt}”`].filter(Boolean).join(' · ') })[st.type];
  const editLabel = (e) => e.structure ? structLabel(e.structure) : [...e.ops.map(opLabel), ...(e.props || []).map((p) => `${humanize(p.name)} ${p.value}`), ...(e.text ? [`“${e.text}”`] : [])].join(' · ');
  function measure(el) {
    const c = cs(el);
    return { fontSize: c.fontSize, color: rgbHex(c.color), fill: rgbHex(c.backgroundColor), radius: c.borderTopLeftRadius, padding: c.padding, display: c.display };
  }
  function targetsOf(el, note) {
    const def = defOf(el), use = useOf(el);
    const base = targetOf(el, note);
    if (!(def && use && el.getAttribute('data-kerf-n'))) return [base];
    // A component instance: the use site (just this one) and the definition (every use).
    return [{ ...base, loc: use, instance: true, shared: false }, { ...base, loc: def, shared: true, instance: false }];
  }
  function targetOf(el, note) {
    const def = defOf(el), use = useOf(el);
    const loc = use && (!def || el.tagName.toLowerCase() === 'svg' || el.getAttribute('data-kerf-n')) ? use : def || use;
    const img = el.tagName.toLowerCase() === 'img' ? { imgSrc: el.getAttribute('src'), alt: el.getAttribute('alt') } : {};
    return { loc, shared: !!(def && use), measured: measure(el), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100), note, dom: [...el.classList], name: dName(el), box: (() => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })(), ...img };
  }
  function uniq(list) {
    const seen = new Set(), out = [];
    for (const t of list) if (t.loc && !seen.has(t.loc)) { seen.add(t.loc); out.push(t); }
    return out;
  }
  const tagged = (root) => (root || D ? [...(root || D).querySelectorAll('[data-kerf],[data-kerf-use]')] : []);
  // If the frame reports no size (a hidden window), treat the whole page as visible.
  const onScreen = (el) => { const r = el.getBoundingClientRect(); const vw = W.innerWidth || 1e5, vh = W.innerHeight || 1e5; return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; };
  // Fewer, more relevant elements make Claude faster: what's on screen, biggest first is not useful, document order is.
  const visibleTargets = () => (D ? uniq(tagged().filter(onScreen).flatMap((el) => targetsOf(el))).slice(0, 64) : []);
  function selectionTargets() {
    const el = S.sel.el, out = [...targetsOf(el)];
    if (activeLoc() !== out[0].loc) out.unshift({ ...out[0], loc: activeLoc() });
    let p = el.parentElement;
    for (let i = 0; p && i < 2; p = p.parentElement) { const t = pick(p); if (t) { out.push(targetOf(t)); p = t; i++; } }
    tagged(el).slice(0, 30).forEach((c) => out.push(...targetsOf(c)));
    return uniq(out);
  }
  function noteTargets(n, i) {
    const pts = n.shape === 'pin' ? [[n.x, n.y]] : n.shape === 'arrow' ? [[n.x2, n.y2]] : [[n.x + n.w / 2, n.y + n.h / 2]];
    const els = [];
    for (const [px, py] of pts) D.elementsFromPoint(px - W.scrollX, py - W.scrollY).map(pick).filter(Boolean).slice(0, 3).forEach((e) => els.push(e));
    if (n.shape === 'box' || n.shape === 'circle') {
      tagged().forEach((el) => {
        const r = el.getBoundingClientRect(), cx = r.left + r.width / 2 + W.scrollX, cy = r.top + r.height / 2 + W.scrollY;
        if (r.width && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) els.push(el);
      });
    }
    return uniq(els.flatMap((el) => targetsOf(el, i + 1))).slice(0, 24);
  }

  // One conversation shared by the Ask bar, notes and chat.
  function historyFor() {
    const h = [];
    for (const m of S.chat) {
      if (m.role === 'user') h.push({ role: 'user', text: m.text });
      else if (m.error) h.push({ role: 'assistant', text: `(error) ${m.error}` });
      else if (m.proposal) h.push({ role: 'assistant', text: `${m.proposal.message}\nProposed: ${m.proposal.edits.map((e) => `${e.tag} ${editLabel(e)}`).join('; ') || 'no edits'}\nStatus: ${m.status}` });
    }
    return h.filter((x, i) => !(i > 0 && h[i - 1].role === x.role));
  }
  let chatT;
  function saveChat() {
    clearTimeout(chatT);
    chatT = setTimeout(() => api('/chat', { messages: S.chat.filter((m) => !m.busy).map(({ targets, ...m }) => m), notes: S.notes }).catch(() => {}), 300);
  }
  /* style modes: how far Tovi may go beyond the project's design system */
  const MODE_LABEL = { system: 'On system', improve: 'Improve the system', explore: 'Explore freely' };
  const PRESET = { calm: ['Calm & precise', 'One accent, lots of space, crisp hierarchy'], warm: ['Warm & editorial', 'Warm neutrals, expressive type, soft corners'], bold: ['Bold & playful', 'Saturated colour, big type, rounded shapes'], minimal: ['Minimal', 'Near-monochrome, few elements, thin lines'] };
  const modeKey = () => `kerf.mode.${S.project?.name || 'app'}`;
  S.styleMode = 'system';
  S.direction = null;
  try { S.styleMode = localStorage.getItem(modeKey()) || 'system'; } catch {}
  api('/direction').then((d) => { S.direction = d; renderAI(); }).catch(() => {});
  const dirName = () => (S.direction ? PRESET[S.direction.preset]?.[0] || (S.direction.text ? 'Custom' : '') : '');
  function modePill() {
    const m = S.styleMode, d = m !== 'system' && dirName();
    return `<button type="button" class="kcMode ${m}" data-act2="modeMenu" title="How far Tovi may go beyond your design system">${ico(m === 'system' ? 'comp' : m === 'improve' ? 'spark' : 'pen', 12)}<span>${esc(MODE_LABEL[m])}${d ? ` · ${esc(d)}` : ''}</span>${ico('chev', 10)}</button>`;
  }
  function setStyleMode(m) {
    S.styleMode = m;
    try { localStorage.setItem(modeKey(), m); } catch {}
    renderAI();
    renderMarks();
  }
  function modeMenu(at) {
    const pick = (m) => () => { if (m !== 'system' && !S.direction) openDirection(m); else setStyleMode(m); };
    openMenu([
      { head: 'Design system' },
      { label: 'On system', sub: 'Use your design system as it is', on: S.styleMode === 'system', run: pick('system') },
      { label: 'Improve the system', sub: 'Fix colours, type and spacing everywhere', on: S.styleMode === 'improve', run: pick('improve') },
      { label: 'Explore freely', sub: 'Try a new look for this part only', on: S.styleMode === 'explore', run: pick('explore') },
      '-',
      { label: S.direction ? `Design direction: ${dirName()}` : 'Set a design direction…', run: () => openDirection() },
    ], at);
  }
  // The project's design direction: a preset feel, a description and up to 3 reference images.
  function openDirection(thenMode) {
    const d = S.direction || {};
    S._dir = { preset: d.preset || '', text: d.text || '', refs: (d.refs || []).map((r) => ({ ...r, keep: true })), thenMode };
    const m = $('modal');
    m.hidden = false;
    m.innerHTML = `<section class="dialog dirD" role="dialog" aria-modal="true" aria-labelledby="dirT">
      <div class="dh"><div style="display:flex;flex-direction:column;gap:4px"><h2 id="dirT">What feel are you going for?</h2><span class="note">Tovi follows this direction when it improves or explores. You can change it anytime.</span></div><button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div>
      <div class="db">
        <div class="dirGrid">${Object.entries(PRESET).map(([k, [n, sub]]) => `<button class="dirCard${S._dir.preset === k ? ' on' : ''}" data-act2="dirPreset" data-v="${k}"><b>${n}</b><span>${sub}</span></button>`).join('')}</div>
        <label><span class="secT">Describe it <span class="note" style="font-weight:400">(optional)</span></span><textarea class="fld" id="dirText" rows="2" placeholder="e.g. Feel like a premium research tool: confident, quiet, data first">${esc(S._dir.text)}</textarea></label>
        <div><span class="secT">References <span class="note" style="font-weight:400">(optional, up to 3 screenshots of products you like)</span></span><div class="dirRefs" id="dirRefs">${dirRefsHTML()}</div></div>
      </div>
      <div class="df">${S.direction ? '<button class="ghostBtn" data-act2="dirClear">Remove direction</button>' : ''}<span style="flex:1"></span><button class="outline" data-act="closeModal">Cancel</button><button class="primary solo" data-act2="dirSave">Save direction</button></div></section>`;
  }
  const dirRefsHTML = () => `${S._dir.refs.map((r, i) => `<span class="kcThumb"><img src="${r.thumb}" alt="${esc(r.name)}"><button type="button" data-act2="dirRefX" data-i="${i}" aria-label="Remove ${esc(r.name)}">${ico('x', 10)}</button></span>`).join('')}${S._dir.refs.length < 3 ? `<button class="dirAdd" data-act2="dirRefAdd">${ico('plus', 14)}<span>Add</span></button>` : ''}`;

  // What the designer is looking at, so Claude can resolve "this" and "here" and judge the screen.
  function aiContext() {
    let theme = null;
    try {
      const bg = getComputedStyle(D.body).backgroundColor, n = (bg.match(/[\d.]+/g) || []).map(Number);
      if (n.length >= 3 && !(n.length === 4 && n[3] === 0)) theme = 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2] < 128 ? 'dark' : 'light';
    } catch {}
    return { page: pageName(S.path), path: S.path, device: DEV_LABEL[S.device], width: W?.innerWidth, size: bpParam()?.label?.toLowerCase(), theme, selected: S.sel ? dName(S.sel.el) : null };
  }
  // A screenshot of exactly what's on screen (viewport), small and quick; skipped if it takes too long.
  let h2i = null;
  async function captureScreen() {
    if (!D || !W) return null;
    try {
      h2i ||= new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js'; sc.onload = () => res(window.htmlToImage); sc.onerror = rej; document.head.appendChild(sc); });
      const lib = await h2i;
      const w = W.innerWidth, h = W.innerHeight, k = Math.min(1, 1280 / w);
      const shot = lib.toJpeg(D.documentElement, { width: w, height: h, canvasWidth: Math.round(w * k), canvasHeight: Math.round(h * k), pixelRatio: 1, quality: 0.72, skipFonts: true, cacheBust: false, style: { transform: `translate(${-W.scrollX}px, ${-W.scrollY}px)`, transformOrigin: '0 0' } });
      const url = await Promise.race([shot, new Promise((r) => setTimeout(() => r(null), 2500))]);
      return url && url.startsWith('data:image/jpeg') ? { media_type: 'image/jpeg', data: url.split(',')[1] } : null;
    } catch { h2i = null; return null; }
  }
  /* ---------- Tovi and its helpers, visible on the canvas ---------- */
  // Tovi (amber) answers the chat. Tasks go to helpers that work in parallel, each with a name and colour.
  // Blue stays the designer's selection and red stays for errors.
  const AGENTS = [{ name: 'Tovi', color: '#E9B547' }, { name: 'Milo', color: '#2DB3A6' }, { name: 'Juno', color: '#E36BA8' }, { name: 'Remi', color: '#5BBF6A' }, { name: 'Nova', color: '#9B7BEA' }];
  const helperFor = (n) => AGENTS[1 + ((Math.max(1, n) - 1) % 4)];
  const agentNamed = (name) => AGENTS.find((a) => a.name === name) || AGENTS[0];
  const agentOf = () => AGENTS[0]; // one agent on screen: Tovi
  const avatar = (a, cls = '') => `<i class="agAv ${cls}" style="--ac:${a.color}" title="${a.name}">${a.name[0]}</i>`;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  S.agentsOn = (() => { try { return localStorage.getItem('kerf.agents') !== 'off'; } catch { return true; } })();
  const live = () => S.agentsOn && !calm.matches && !!D && S.mode === 'edit';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Each agent is drawn like another person in a Figma file: a cursor with its name, a box in its colour
  // around what it's looking at (thin) or editing (solid, with its name), and a tag for the change it makes.
  // Positions are in the app's own pixels; labels counter-scale with the zoom (--iz).
  const crew = new Map();
  const elOf = (loc) => (D && loc ? D.querySelector(q(loc)) : null);
  function agentDom(a) {
    let g = crew.get(a.name);
    if (g && g.cur.isConnected) { clearTimeout(g.hideT); return g; }
    const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.style.setProperty('--ac', a.color); d.innerHTML = html; $('ov').appendChild(d); return d; };
    const box = mk('agBox', `<span class="agBoxTag">${a.name}</span>`);
    const chip = mk('agChip');
    const cur = mk('agent', `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 2.5l12.5 5.2-5.4 1.7-1.8 5.3z" fill="var(--ac)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="agTag">${avatar(a)}${a.name}</span><span class="agSay" hidden></span>`);
    g = { a, cur, box, chip, x: null, y: null, el: null, mode: null, sayT: null, hideT: null, run: 0 };
    crew.set(a.name, g);
    return g;
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function placeCur(g) {
    g.cur.style.transform = `translate(${g.x}px, ${g.y}px) scale(var(--iz, 1))`;
    // Near the right edge the name tag and bubble sit to the left of the cursor, so they're never cut off.
    g.cur.classList.toggle('flip', !!W && g.x > W.innerWidth - 240 * (S.z ? 1 / S.z : 1));
  }
  // Glide along a gentle curve, faster over long distances, like a hand on a mouse.
  function glide(g, x, y, ms) {
    if (g.x == null) { g.x = x; g.y = y; placeCur(g); g.cur.classList.add('on'); return Promise.resolve(); }
    const x0 = g.x, y0 = g.y, dx = x - x0, dy = y - y0, dist = Math.hypot(dx, dy);
    const dur = ms ?? Math.min(900, 260 + dist * 0.9);
    const bend = Math.min(60, dist * 0.18) * (Math.random() < 0.5 ? -1 : 1);
    const cx = x0 + dx / 2 - (dy / (dist || 1)) * bend, cy = y0 + dy / 2 + (dx / (dist || 1)) * bend;
    const run = ++g.run, t0 = performance.now();
    g.cur.classList.add('on');
    return new Promise((res) => {
      const step = (now) => {
        if (run !== g.run) return res();
        const t = Math.min(1, (now - t0) / dur), k = ease(t), u = 1 - k;
        g.x = u * u * x0 + 2 * u * k * cx + k * k * x; g.y = u * u * y0 + 2 * u * k * cy + k * k * y;
        placeCur(g);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  // The box follows its element every frame (it moves and resizes as the page changes).
  function trackBoxes() {
    let any = false;
    for (const g of crew.values()) {
      if (!g.el || !g.mode) { g.box.classList.remove('on', 'edit'); continue; }
      if (!g.el.isConnected) { const fresh = g.loc ? elOf(g.loc) : null; if (fresh) g.el = fresh; else continue; }
      const r = g.el.getBoundingClientRect();
      Object.assign(g.box.style, { transform: `translate(${r.left}px, ${r.top}px)`, width: r.width + 'px', height: r.height + 'px' });
      g.box.classList.add('on');
      g.box.classList.toggle('edit', g.mode === 'edit');
      if (g.chip.classList.contains('on')) g.chip.style.transform = `translate(${r.left}px, ${r.bottom + 6}px) scale(var(--iz, 1))`;
      any = true;
    }
    if (any) requestAnimationFrame(trackBoxes); else trackBoxes.on = false;
  }
  function track(g, el, mode, loc) {
    g.el = el; g.mode = mode; g.loc = loc || null;
    if (!trackBoxes.on) { trackBoxes.on = true; requestAnimationFrame(trackBoxes); }
  }
  function agentSay(a, text) {
    if (!text || !S.agentsOn) return;
    const g = agentDom(a), b = g.cur.querySelector('.agSay');
    b.textContent = String(text).split(/\s+/).slice(0, 7).join(' ');
    b.hidden = false;
    clearTimeout(g.sayT);
    g.sayT = setTimeout(() => { b.hidden = true; }, 2400);
  }
  const pointIn = (r, fx, fy) => [r.left + r.width * fx, r.top + Math.min(r.height * fy, r.height - 4)];
  async function inView(el) {
    if (!el?.isConnected || !W) return false;
    const r = el.getBoundingClientRect();
    if (r.bottom < 40 || r.top > W.innerHeight - 40) {
      W.scrollTo({ top: Math.max(0, W.scrollY + r.top - W.innerHeight / 3), behavior: calm.matches ? 'auto' : 'smooth' });
      await wait(450);
    }
    return true;
  }
  // Look an element over the way a designer does: hover it, then read across it.
  async function lookAt(a, el, say, loc) {
    if (!el?.isConnected) return;
    const g = agentDom(a);
    track(g, el, 'look', loc);
    let r = el.getBoundingClientRect();
    await glide(g, ...pointIn(r, 0.12 + Math.random() * 0.15, 0.3));
    if (say) agentSay(a, say);
    r = el.getBoundingClientRect();
    await glide(g, ...pointIn(r, 0.55 + Math.random() * 0.3, 0.45 + Math.random() * 0.2), 520 + Math.random() * 300);
    await wait(120 + Math.random() * 200);
  }
  // Make one change like a person would: select the element, go to the right spot (an edge for spacing
  // and size, the middle for colour), click, show what's changing, and drag a little as it lands.
  async function editOn(a, el, e, apply) {
    const g = agentDom(a);
    if (!(await inView(el))) return apply();
    track(g, el, 'edit', e.loc);
    const props = (e.ops || []).map((o) => o.prop);
    const edge = props.some((p) => /^(padX|w|mX|gap)$/.test(p)) ? 'right' : props.some((p) => /^(padY|h|mY)$/.test(p)) ? 'bottom' : props.some((p) => /^(fontSize|fontWeight|lineHeight|letterSpacing|align)$/.test(p)) || e.text ? 'text' : 'center';
    let r = el.getBoundingClientRect();
    const at = edge === 'right' ? [r.right - 2, r.top + r.height / 2] : edge === 'bottom' ? [r.left + r.width / 2, r.bottom - 2] : edge === 'text' ? [r.left + Math.min(14, r.width / 4), r.top + Math.min(r.height / 2, 14)] : [r.left + r.width / 2, r.top + r.height / 2];
    await glide(g, ...at);
    g.cur.classList.add('press');
    setTimeout(() => g.cur.classList.remove('press'), 160);
    g.chip.textContent = editLabel(e) || e.why || 'Updating';
    g.chip.classList.add('on');
    await wait(260);
    const nudge = edge === 'right' ? [14, 0] : edge === 'bottom' ? [0, 12] : [0, 0];
    const drag = glide(g, g.x + nudge[0], g.y + nudge[1], 420);
    const res = await apply();
    await drag;
    await wait(380);
    g.chip.classList.remove('on');
    return res;
  }
  function release(names) {
    for (const n of names) {
      const g = crew.get(n);
      if (!g) continue;
      g.mode = null; g.el = null;
      g.chip.classList.remove('on');
      clearTimeout(g.hideT);
      g.hideT = setTimeout(() => { g.cur.classList.remove('on'); g.x = g.y = null; }, 1400);
    }
  }
  // While thinking, the agents split the elements they're reading and look them over (only ones in view).
  // While thinking, Tovi looks over a few of the elements it's reading, once, then rests there: "Thinking…".
  function agentTour(agents, targets) {
    if (!live()) return () => {};
    const a = AGENTS[0];
    const els = [...new Set(targets.map((t) => elOf(t.loc)).filter(Boolean))].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < W.innerHeight; }).slice(0, 3);
    if (!els.length) return () => {};
    let stop = false;
    (async () => {
      for (const el of els) { if (stop) return; await lookAt(a, el); }
      if (stop) return;
      const g = agentDom(a);
      track(g, els[0], 'look');
      g.chip.textContent = 'Thinking…';
      g.chip.classList.add('on');
    })();
    return () => { stop = true; const g = crew.get(a.name); if (g) g.chip.classList.remove('on'); release([a.name]); };
  }
  // Apply so you can watch it: style changes are shared out to lanes (one per agent), each lane makes its
  // changes one by one as its agent gets there; structure, code and colour-token changes follow together
  // (their order matters). One batch = one undo. A click or key press finishes at once.
  async function applyLive(m, edits) {
    const batch = Date.now();
    m.batch = batch;
    const styles = edits.filter((e) => !e.structure), rest = edits.filter((e) => e.structure);
    const results = [];
    let n = S.count, skip = !live() || edits.length > 40;
    const onSkip = () => { skip = true; };
    if (!skip) { window.addEventListener('pointerdown', onSkip, true); window.addEventListener('keydown', onSkip, true); W?.addEventListener('pointerdown', onSkip, true); }
    const used = new Set(), done = new Set(), talked = new Set();
    // Lanes: tasks keep their helper; chat changes are shared out by element between up to three agents.
    const lanes = new Map();
    const team = [AGENTS[0]];
    const byEl = new Map();
    for (const e of styles) {
      const a = team[0];
      byEl.set(e.loc, a);
      if (!lanes.has(a.name)) lanes.set(a.name, { a, list: [] });
      lanes.get(a.name).list.push(e);
    }
    const one = async (e) => { const r = await api('/ai/apply', { batch, edits: [e] }); results.push(...r.results); n = Math.max(n, r.n); done.add(e); };
    try {
      await Promise.all([...lanes.values()].map(async ({ a, list }, k) => {
        await wait(k * 250);
        for (const e of list) {
          if (skip) return;
          used.add(a.name);
          const el = elOf(e.loc);
          for (const t of (m.talk || []).filter((x) => x.loc === e.loc && !talked.has(x))) {
            talked.add(t);
            const who = agentNamed(t.agent);
            used.add(who.name);
            if (el) await lookAt(who, el, t.text, e.loc);
            await wait(700);
          }
          await editOn(a, el, e, () => one(e));
        }
      }));
      const left = styles.filter((e) => !done.has(e));
      if (left.length) { const r = await api('/ai/apply', { batch, edits: left }); results.push(...r.results); n = r.n; }
      if (rest.length) {
        const a = agentOf(m, rest[0]);
        if (!skip) { used.add(a.name); const el = elOf(rest[0].loc); if (el) { await inView(el); await lookAt(a, el, rest[0].why, rest[0].loc); } }
        const r = await api('/ai/apply', { batch, edits: rest });
        results.push(...r.results);
        n = r.n;
      }
    } catch (err) {
      return results.length ? { results, n } : { error: err.message };
    } finally {
      window.removeEventListener('pointerdown', onSkip, true); window.removeEventListener('keydown', onSkip, true); W?.removeEventListener('pointerdown', onSkip, true);
      release([...used]);
    }
    return { results, n };
  }

  async function runAI(text, targets, where, shown, followUp, atts = [], autoApply = where !== 'notes') {
    text = String(text || '').trim() || (atts.length ? 'Use the attached image.' : '');
    if (!text || S.card?.busy) return;
    if (!targets.length) { toast('Nothing on screen to work with yet. Wait for the page to load, or select something.', '', true); return; }
    const history = historyFor();
    const ctx = followUp ? 'Follow-up' : where === 'chat' && S.sel ? dName(S.sel.el) : where === 'notes' ? `${S.notes.length} task${S.notes.length === 1 ? '' : 's'}` : 'Whole screen';
    S.chat.push({ role: 'user', text, shown: shown || text, ctx, where, atts: atts.map((a) => ({ name: a.name, thumb: a.thumb })) });
    const m = { role: 'kerf', busy: true, status: 'pending', where, targets, noteTexts: where === 'notes' && !followUp ? S.notes.map((n) => n.text) : null, skip: [], started: Date.now(), looked: uniq(targets).map((t) => t.name).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 40), lookedN: targets.length };
    S.chat.push(m);
    S.card = m;
    renderAI();
    try {
      const screen = await captureScreen();
      m.mode = S.modeOnce || S.styleMode;
      S.modeOnce = null;
      const stop = agentTour(AGENTS, targets);
      try { m.proposal = await api('/ai', { request: text, targets, history, screen, context: aiContext(), mode: m.mode, images: atts.map((a) => ({ name: a.name, media_type: a.type, data: a.data, orig: a.orig })) }); } finally { stop(); }
      S.amber = m.proposal.edits.filter((e) => e.structure?.type !== 'token').map((e) => e.loc);
      if (m.proposal.edits.some((e) => e.structure?.type === 'token') && !S.tokens) loadTokens();
      if (!m.proposal.edits.length) m.status = 'info';
    } catch (e) { m.error = e.message; }
    m.busy = false;
    m.took = Math.max(1, Math.round((Date.now() - m.started) / 1000));
    renderAI();
    // Tasks: Apply means apply. Every change is undoable, and the answer has its own Undo.
    if (autoApply && m.status === 'pending' && chosen(m).length) await decide(m, 'apply');
    saveChat();
  }
  async function decide(m, v) {
    if (!m || m.status !== 'pending') return;
    if (m.previewing) { m.previewing = false; previewTokens(m, false); }
    S.amber = [];
    if (v === 'apply') {
      const hadError = !!D?.querySelector('vite-error-overlay');
      m.applying = true;
      renderAI();
      const r = await applyLive(m, chosen(m).map((e) => (e.structure ? e : { ...e, bp: bpParam() }))).catch((e) => ({ error: e.message }));
      m.applying = false;
      if (!r.error && chosen(m).some((e) => e.structure?.type === 'code')) guard(hadError);
      if (r.error) { toast(r.error, '', true); renderAI(); return; }
      const ok = r.results.filter((x) => x.ok && x.changed).length, bad = r.results.filter((x) => !x.ok);
      m.failed = bad.map((x) => x.loc);
      m.appliedN = ok;
      S.count = r.n;
      m.status = ok ? 'applied' : 'failed';
      toast(`Applied ${ok} change${ok === 1 ? '' : 's'}`, bad.length ? `${bad.length} skipped: ${bad[0].error}` : '', !!bad.length && !ok, !!ok);
      if (m.where === 'notes' && ok) S.notes = [];
      if (chosen(m).some((e) => e.structure?.type === 'token')) S.tokens = null;
      afterEdit();
    } else m.status = 'discarded';
    renderAI();
    saveChat();
  }
  const STATUS = { applied: 'Applied', undone: 'Undone', discarded: 'Discarded', failed: 'Couldn’t apply', info: 'No changes to your app' };
  // Status is shown by Tovi, not written into the reply: drop a leading "Nothing changed yet." if the model adds one.
  const cleanMsg = (t) => { const x = String(t || '').replace(/^\s*(nothing (has )?changed( yet)?|no changes( were)?( made)?( yet)?|i (haven[’']t|have not) changed anything( yet)?)\s*[.:;,—–-]*\s*/i, ''); return x ? x[0].toUpperCase() + x.slice(1) : String(t || ''); };
  const chosen = (m) => m.proposal.edits.filter((e, k) => !(m.off || []).includes(k) && !(m.skip || []).includes(e.note ?? 0) && e.structure?.type !== 'imageAsk');
  // Each proposed change shows where it stands: to do, applying, done, failed or left out.
  function rowState(m, e) {
    if (e.structure?.type === 'imageAsk') return m.status === 'pending' ? 'todo' : 'skip';
    const inPlan = chosen(m).includes(e);
    if (m.applying) return inPlan ? 'run' : 'skip';
    if (m.status === 'applied') return !inPlan ? 'skip' : (m.failed || []).includes(e.loc) ? 'bad' : 'ok';
    if (m.status === 'failed') return 'bad';
    if (m.status === 'discarded' || m.status === 'undone') return 'skip';
    return inPlan ? 'pick' : 'unpick';
  }
  const CHECK = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const MARK = { pick: `<i class="mk cbox on">${CHECK}</i>`, unpick: '<i class="mk cbox"></i>', todo: '<i class="mk todo"></i>', run: '<i class="mk run"></i>', ok: `<i class="mk ok">${'<svg width="10" height="10" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'}</i>`, bad: '<i class="mk bad">×</i>', skip: '<i class="mk skip"></i>' };
  const rowFor = (m) => (e) => editRow(e, m ? rowState(m, e) : 'todo', m ? `data-act2="edPick" data-i="${S.chat.indexOf(m)}" data-e="${m.proposal.edits.indexOf(e)}"` : '');
  // While pending, each row is a checkbox: ticked changes are applied, unticked ones left out.
  document.addEventListener('keydown', (e) => { const r = e.target.closest?.('[data-act2="edPick"]') || (e.target.matches?.('[data-act2="tkOpen"],[data-act2="ngOpen"]') ? e.target : null); if (r && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); r.click(); } });
  const editRow = (e, st = 'todo', pick = '') => `<div class="ed ${st}"${st === 'pick' || st === 'unpick' ? ` ${pick} role="checkbox" aria-checked="${st === 'pick'}" tabindex="0" title="${st === 'pick' ? 'Leave this change out' : 'Include this change'}"` : ''}>${MARK[st] || ''}<div class="edB"><div class="edT"><b>${esc(e.name || e.tag)}</b>${e.structure?.type === 'imageAsk' ? `<span class="mono">${e.structure.kind === 'photo' ? 'New photo' : 'New illustration'}: “${esc(e.structure.prompt)}”</span>` : e.structure?.type === 'image' && e.structure.preview ? `<span class="imgPick"><img src="${esc(e.structure.preview)}" alt=""><span class="mono">${esc(e.structure.alt || 'New image')}</span></span>` : e.structure?.type === 'token' ? tokenChange(e.structure) : `<span class="mono">${esc(editLabel(e))}</span>`}${e.offSystem ? '<i class="offSys">Off-system</i>' : ''}</div>${(e.structure?.type === 'imageAsk' || e.structure?.preview) && pick ? `<button class="outline sm imgOpt" ${pick.replace('data-act2="edPick"', 'data-act2="imgOptions"')}>${e.structure.type === 'imageAsk' ? (e.structure.kind === 'photo' ? 'Show photos' : 'Draw options') : 'Choose another'}</button>` : ''}${e.where ? `<span class="reach">Changes ${esc(e.where)}</span>` : ''}${e.why ? `<span>${esc(e.why)}</span>` : ''}${e.structure?.type === 'code' ? `<details class="code"><summary>Code change in ${esc(e.structure.file)}</summary><pre class="diff"><span class="del">${esc(e.structure.find)}</span><span class="add">${esc(e.structure.replace)}</span></pre></details>` : ''}</div></div>`;
  function tokenChange(st) {
    const t = (S.tokens || []).find((x) => x.name === st.name);
    const cur = t ? (t.values.find((v) => v.theme === st.which) || t.values.find((v) => v.theme === (aiContext().theme || 'light')) || t.values[0])?.hex : null;
    return `<span class="swd">${cur ? `<i style="background:${esc(cur)}"></i>${ico('chevR', 10)}` : ''}<i style="background:${esc(st.hex)}"></i><span class="mono">${esc(st.hex)}${st.which && st.which !== 'both' ? ` · ${esc(st.which)}` : ''}</span></span>`;
  }
  // Live preview: the app's colours are CSS variables, so the new palette can be tried on before anything is written.
  const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(String(h).slice(k, k + 2), 16));
  function rgbHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l * 100]; const d = mx - mn, s2 = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s2 * 100, l * 100]; }
  function previewTokens(m, on) {
    if (!D) return;
    const root = D.documentElement, theme = aiContext().theme || 'light';
    for (const v of m._pv || []) root.style.removeProperty(v);
    m._pv = [];
    if (!on) return;
    for (const e of chosen(m).filter((x) => x.structure?.type === 'token')) {
      const t = (S.tokens || []).find((x) => x.name === e.structure.name);
      if (!t?.var || (e.structure.which !== 'both' && e.structure.which !== theme)) continue;
      const [r, g, b] = hexRgb(e.structure.hex);
      const val = t.fn === 'rgb' ? `${r} ${g} ${b}` : t.fn === 'hsl' ? (() => { const [h, s3, l] = rgbHsl(r, g, b); return `${Math.round(h)} ${Math.round(s3)}% ${Math.round(l)}%`; })() : e.structure.hex;
      root.style.setProperty(t.var, val);
      m._pv.push(t.var);
    }
  }
  const NSTAT = { done: ['Done', 'ok'], partial: ['Partly', 'part'], not_possible: ['Not here', 'no'] };
  // Notes answered one by one: the mark's number, what was asked, what Tovi did, and its edits.
  function notesHTML(m, i) {
    const p = m.proposal, texts = m.noteTexts || [];
    const count = Math.max(texts.length, ...p.notes.map((n) => n.note), ...p.edits.map((e) => e.note || 0));
    const groups = [];
    for (let n = 1; n <= count; n++) {
      const info = p.notes.find((x) => x.note === n), eds = p.edits.filter((e) => e.note === n);
      if (!info && !eds.length && !texts[n - 1]) continue;
      groups.push({ n, info, eds, text: texts[n - 1] });
    }
    const loose = p.edits.filter((e) => !e.note || e.note > count);
    if (loose.length) groups.push({ n: 0, info: null, eds: loose, text: null });
    const pending = m.status === 'pending';
    const more = groups.length > 3 && !m.allRows ? groups.length - 3 : 0;
    return groups.slice(0, more ? 3 : groups.length).map((g) => {
      const st = NSTAT[g.info?.status] || (g.eds.length ? NSTAT.done : NSTAT.not_possible);
      const idx = g.eds.map((e) => p.edits.indexOf(e)), offN = idx.filter((k) => (m.off || []).includes(k)).length;
      const off = (m.skip || []).includes(g.n) || (idx.length > 0 && offN === idx.length);
      const some = !off && offN > 0;
      const open = (m.openN || []).includes(g.n);
      const box = pending && g.eds.length ? `<button class="mk cbox${off ? '' : some ? ' some' : ' on'}" data-act2="noteSkip" data-i="${i}" data-n="${g.n}" role="checkbox" aria-checked="${off ? 'false' : some ? 'mixed' : 'true'}" title="${off ? 'Include this task’s changes' : 'Leave this task’s changes out'}">${off ? '' : some ? '<b></b>' : CHECK}</button>` : ico('task', 15);
      return `<div class="ng tk${off ? ' off' : ''}${open ? ' open' : ''}" data-ng="${g.n}" data-i="${i}">
        <div class="tkH" data-act2="ngOpen" data-i="${i}" data-n="${g.n}" role="button" tabindex="0" aria-expanded="${open}">${box}<b>${g.n ? `Task ${g.n}` : 'Also'}</b><span class="tkT">${g.text ? esc(g.text) : g.n ? '' : 'changed alongside'}</span>${(g.info || g.n) && st[1] !== 'ok' ? `<span class="nSt ${st[1]}">${st[0]}</span>` : ''}<span class="tkC">${ico(open ? 'chev' : 'chevR', 10)}</span></div>
        ${open ? `<div class="tkB">${g.info?.summary ? `<p>${esc(g.info.summary)}</p>` : ''}${g.eds.length ? `<div class="ngE">${g.eds.map(rowFor(m)).join('')}</div>` : ''}</div>` : ''}</div>`;
    }).join('') + (groups.length > 3 ? `<button class="tkMore" data-act2="ngMore" data-i="${i}">${m.allRows ? 'Show fewer' : `${more} more task${more === 1 ? '' : 's'}`}${ico(m.allRows ? 'chev' : 'chevR', 10)}</button>` : '');
  }
  function kerfHTML(m, i) {
    if (m.busy && m.helpers) return `<div class="prop"><div class="crewRow">${avatar(AGENTS[0])}<span>Tovi is working on ${m.helpers.length === 1 ? 'the task' : `${m.helpers.length} tasks`}</span></div><div class="kLive"><i class="kSpin"><b></b><b></b><b></b><b></b></i><span class="kT" data-since="${m.started || Date.now()}">${liveText(m.started)}</span></div></div>`;
    if (m.busy) return `<div class="prop">${stepsHTML(m, true)}${live() ? `<div class="crewRow">${avatar(AGENTS[0])}<span>Tovi is looking it over</span></div>` : ''}<div class="kLive"><i class="kSpin"><b></b><b></b><b></b><b></b></i><span class="kT" data-since="${m.started || Date.now()}">${liveText(m.started)}</span></div></div>`;
    if (m.error) return `<div class="prop err">${stepsHTML(m)}<span class="note warn">${esc(m.error)}</span></div>`;
    const p = m.proposal;
    const badge = { partial: 'Partly possible', not_yet: 'Not possible in Tovi yet', needs_developer: 'For developers' }[p.scope];
    const byNote = p.notes?.length && p.edits.length + p.notes.length > 1;
    const n = chosen(m).length;
    const status = STATUS[m.status] ? `<span class="kStatus ${m.status}">${m.status === 'applied' ? ico('check', 12) : m.status === 'info' ? '<i class="kNo"></i>' : ''}${STATUS[m.status]}</span>` : '';
    const toks = p.edits.filter((e) => e.structure?.type === 'token'), rest = p.edits.filter((e) => e.structure?.type !== 'token');
    const suggest = p.suggest && m.status !== 'applied' ? `<div class="kSuggest"><span>${esc(p.suggest.why)}</span><button data-act2="suggestRun" data-i="${i}" data-v="${p.suggest.mode}">${p.suggest.mode === 'improve' ? 'Improve the system instead' : 'Explore freely instead'} →</button></div>` : '';
    // Explore is a try-on: keep it, undo it, or turn it into the design system.
    const keep = p.mode === 'explore' && m.status === 'applied' ? (m.kept ? `<div class="kSuggest"><span>Kept. Want it everywhere?</span><button data-act2="keepLook" data-i="${i}">Make it part of the design system →</button></div>` : `<div class="tryOn"><span>Trying this look on your screen.</span><div class="acts"><button class="ghostBtn" data-act2="tryUndo" data-i="${i}">Undo</button><button class="primary applyBtn" data-act2="tryKeep" data-i="${i}">Keep it</button></div><button class="linkBtn" data-act2="keepLook" data-i="${i}">Make it part of the design system →</button></div>`) : '';
    const head = m.applying ? `Applying ${n} change${n === 1 ? '' : 's'}…` : m.status === 'applied' ? `Applied ${m.appliedN ?? n} of ${p.edits.length}` : `${p.edits.length} proposed change${p.edits.length === 1 ? '' : 's'}`;
    return `<div class="prop${byNote ? ' byNote' : ''}">${stepsHTML(m)}${badge ? `<span class="badge">${badge}</span>` : ''}<p class="kText">${esc(cleanMsg(p.message))}</p>
      ${m.talk?.length ? `<div class="talk">${m.talk.map((t) => `<div>${avatar(agentNamed(t.agent))}<b>${esc(t.agent)}</b><span>${esc(t.text)}</span></div>`).join('')}</div>` : ''}
      ${byNote ? `<div class="ngs">${notesHTML(m, i)}</div>` : toks.length ? `<div class="edits sys"><div class="edH">${ico('comp', 12)}Design system · ${toks.length} colour${toks.length === 1 ? '' : 's'}${m.status === 'pending' ? `<button class="pvBtn${m.previewing ? ' on' : ''}" data-act2="tokPreview" data-i="${i}">${ico('eye', 12)}${m.previewing ? 'Previewing' : 'Preview'}</button>` : ''}</div>${toks.map(rowFor(m)).join('')}</div>${rest.length ? `<div class="edits"><div class="edH">On this screen · ${rest.length}</div>${rest.map(rowFor(m)).join('')}</div>` : ''}` : p.edits.length ? `<div class="edits"><div class="edH">${m.applying ? '<i class="spin"></i>' : ''}${head}</div>${p.edits.map(rowFor(m)).join('')}</div>` : ''}
      ${suggest}${keep}
      ${m.status === 'applied' && !p.mode?.startsWith('explore') ? `<div class="kDone">${status}<button class="ghostBtn sm" data-act2="tryUndo" data-i="${i}">Undo</button></div>` : ''}
      ${(() => { const need = m.status === 'pending' && !m.applying ? p.edits.filter((e) => e.structure?.type === 'imageAsk').length : 0; if (!need) return ''; const kind = p.edits.find((e) => e.structure?.type === 'imageAsk').structure.kind === 'photo' ? 'photo' : 'illustration'; return `<div class="pickBar"><span>${ico('image', 14)}Choose ${need === 1 ? `the ${kind}` : `${need} ${kind}s`} to finish</span><button class="primary applyBtn" data-act2="pickAll" data-i="${i}">Choose ${need === 1 ? kind : `${kind}s`}</button></div>`; })()}
      ${m.status === 'pending' && p.edits.length && !m.applying && !p.edits.some((e) => e.structure?.type === 'imageAsk') ? `<div class="acts${byNote ? ' tkFoot' : ''}">${byNote ? `<span class="tkN">${ico('spark', 14)}${n} change${n === 1 ? '' : 's'}</span>` : ''}<button class="ghostBtn" data-act2="decide" data-i="${i}" data-v="discard">Discard</button><button class="primary applyBtn" data-act2="decide" data-i="${i}" data-v="apply" ${n ? '' : 'disabled'}>${p.mode === 'explore' ? (n < p.edits.length ? `Try ${n} of ${p.edits.length}` : 'Try this look') : byNote ? 'Apply' : n < p.edits.length ? `Apply ${n} of ${p.edits.length}` : `Apply ${n === 1 ? 'change' : `${n} changes`}`}</button></div>` : m.status === 'applied' && !p.mode?.startsWith('explore') ? '' : status}</div>`;
  }
  // "Looked at 14 elements · Thought for 9s", which opens to show what Tovi read.
  function stepsHTML(m, live) {
    const n = m.lookedN || m.looked?.length || 0;
    if (!n) return '';
    const list = (m.looked || []).map((x) => `<li>${esc(x)}</li>`).join('') + (n > (m.looked || []).length ? `<li class="more">and ${n - m.looked.length} more</li>` : '');
    const done = live ? '' : m.took ? ` · Thought for ${m.took}s` : '';
    return `<details class="kSteps"><summary>${ico('eye', 12)}<span>Looked at ${n} element${n === 1 ? '' : 's'}${done}</span>${ico('chevR', 10)}</summary><ul>${list}</ul></details>`;
  }
  const liveText = (since) => {
    const t = Math.max(0, Math.floor((Date.now() - (since || Date.now())) / 1000));
    return `${t < 60 ? `${t}s` : `${Math.floor(t / 60)}m ${t % 60}s`} · ${t < 2 ? 'Reading the screen' : 'Thinking'}`;
  };
  // Tick the live timers without re-drawing the conversation.
  setInterval(() => document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = liveText(+el.dataset.since); }), 1000);
  /* Tovi's floating card: drag it by its header, or collapse it to a slim bar so the page stays visible */
  S.cardPos = {};
  S.cardMin = false;
  function cardShell(where, label, m, body) {
    const p = m.proposal, n = p ? chosen(m).length : 0;
    const mini = m.busy ? `<span class="cmLive"><i class="kSpin"><b></b><b></b><b></b><b></b></i><span data-since="${m.started || Date.now()}">${liveText(m.started)}</span></span>`
      : m.error ? `<span class="note warn">Couldn’t answer</span>`
      : m.status === 'pending' && p?.edits.length ? `<span class="cmTxt">${p.edits.length} proposed change${p.edits.length === 1 ? '' : 's'}${m.previewing ? ' · previewing' : ''}</span><button class="primary applyBtn sm" data-act2="decide" data-i="${S.chat.indexOf(m)}" data-v="apply" ${n ? '' : 'disabled'}>Apply ${n === p.edits.length ? (n === 1 ? 'change' : n) : `${n} of ${p.edits.length}`}</button>`
      : `<span class="cmTxt">${esc(STATUS[m.status] || 'Reply ready')}</span>`;
    return `<div class="card${S.cardMin ? ' min' : ''}" data-card="${where}"><div class="cardTop" data-drag="${where}" title="Drag to move · double-click to ${S.cardMin ? 'expand' : 'collapse'}"><span class="grip" aria-hidden="true"></span><span class="note">${label}</span>${S.cardMin ? mini : '<span class="sp"></span>'}
      ${hb('cardMin2', S.cardMin ? 'chevR' : 'chev', S.cardMin ? 'Expand' : 'Collapse', '', 'data-act2="cardMin"')}${hb('closeCard2', 'x', 'Close', '', 'data-act2="closeCard"')}</div>${S.cardMin ? '' : `<div class="cardBody">${body()}</div>`}</div>`;
  }
  // Keep a card where the designer left it (inside the canvas area); reset when it closes.
  function placeCard(box, where, reset) {
    const pos = S.cardPos[where];
    if (reset || !pos) { Object.assign(box.style, { left: '', top: '', bottom: '', transform: '' }); return; }
    const st = $('stage').getBoundingClientRect(), w = box.offsetWidth || 400, h = box.offsetHeight || 80;
    const x = Math.max(8, Math.min(st.width - w - 8, pos.x)), y = Math.max(8, Math.min(st.height - h - 8, pos.y));
    Object.assign(box.style, { left: x + 'px', top: y + 'px', bottom: 'auto', transform: 'none' });
  }
  let cardDrag = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest?.('[data-drag]');
    if (!h || e.target.closest('button')) return;
    const box = h.closest('#ask,#noteRes'), st = $('stage').getBoundingClientRect(), r = box.getBoundingClientRect();
    cardDrag = { where: h.dataset.drag, box, dx: e.clientX - r.left, dy: e.clientY - r.top, st };
    h.setPointerCapture(e.pointerId);
    document.body.classList.add('dragging');
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (!cardDrag) return;
    S.cardPos[cardDrag.where] = { x: e.clientX - cardDrag.st.left - cardDrag.dx, y: e.clientY - cardDrag.st.top - cardDrag.dy };
    placeCard(cardDrag.box, cardDrag.where);
  });
  document.addEventListener('pointerup', () => { if (cardDrag) { cardDrag = null; document.body.classList.remove('dragging'); } });
  document.addEventListener('dblclick', (e) => { if (e.target.closest?.('[data-drag]') && !e.target.closest('button')) { S.cardMin = !S.cardMin; renderAI(); } });
  const replyForm = (where) => composer('replyIn', { form: 'reply', where, placeholder: 'Reply to Tovi…' });
  function renderAsk() {
    const a = $('ask');
    a.hidden = !(S.askOpen && S.mode === 'preview');
    if (a.hidden) return;
    const m = S.card && S.card.where === 'ask' ? S.card : null;
    if (m) {
      a.innerHTML = cardShell('ask', 'Tovi', m, () => `${kerfHTML(m, S.chat.indexOf(m))}${m.busy ? '' : replyForm('ask')}`);
      placeCard(a, 'ask');
      if (!m.busy) setTimeout(() => { $('replyIn')?.focus(); syncKC('replyIn'); }, 0);
    } else {
      a.innerHTML = `${composer('askIn', { form: 'ask', big: true, lead: `<span class="spark">${ico('spark', 16)}</span>`, placeholder: 'Ask Tovi to change something on this screen' })}
        <div class="askHints">${['Make this page feel more premium', 'Make the text easier to read', 'Tighten the spacing'].map((s) => `<button data-act2="askHint" data-v="${s}">${s}</button>`).join('')}</div>`;
      setTimeout(() => { $('askIn')?.focus(); syncKC('askIn'); }, 0);
    }
  }
  function chatHTML() {
    const ctx = S.sel ? esc(dName(S.sel.el)) : 'Whole screen';
    const msgs = S.chat.map((m, i) => (m.role === 'user' ? `<div class="uMsg"><span class="uCtx">${esc(m.ctx)}</span>${m.atts?.length ? `<div class="uAtt">${m.atts.map((a) => `<img src="${a.thumb}" alt="${esc(a.name)}" title="${esc(a.name)}">`).join('')}</div>` : ''}<div class="bub">${esc(m.shown || m.text)}</div></div>` : `<div class="kMsg">${kerfHTML(m, i)}</div>`)).join('');
    return `<div class="chatScroll" id="chatScroll">${msgs || `<div class="chatEmpty"><span class="ceMark">${ico('spark', 20)}</span><b>What should change?</b><span>Select something, or ask about the whole screen. Tovi proposes the edit first, and you approve it.</span><div class="ceHints">${['Make this feel more premium', 'Improve the contrast', 'Tighten the spacing'].map((t) => `<button data-act2="chatHint" data-v="${t}">${t}</button>`).join('')}</div></div>`}</div>
      <div class="comp">${tasksShown() ? tasksHTML(S.card?.busy && S.card.where === 'notes') : ''}${composer('chatIn', { form: 'chat', ctx, placeholder: 'Describe a change, or follow up…' })}</div>`;
  }
  function sendChat() {
    take('chatIn', (v, atts) => runAI(v, S.sel ? selectionTargets() : visibleTargets(), 'chat', null, false, atts));
  }

  /* composer: one message box for Ask, replies, chat and notes, with images and dictation */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  S.att = {}; S.drafts = {};
  const KC = {};
  let mic = null;
  function composer(id, o) {
    KC[id] = o;
    const atts = S.att[id] || [];
    const rec = mic?.id === id, has = (S.drafts[id] || '').trim() || atts.length;
    return `<form class="kc${o.big ? ' big' : ''}${o.bar ? ' slim' : ''}" data-form="${o.form}" data-where="${o.where || ''}" data-kc="${id}">
      ${atts.length ? `<div class="kcAtt">${atts.map((a, i) => `<span class="kcThumb" title="${esc(a.name)}"><img src="${a.thumb}" alt="${esc(a.name)}"><button type="button" data-act2="attX" data-id="${id}" data-i="${i}" aria-label="Remove ${esc(a.name)}">${ico('x', 10)}</button></span>`).join('')}</div>` : ''}
      ${o.ctx ? `<div class="kcTop"><span class="kcCtx" title="What Tovi will look at">${ico(S.sel ? 'frame' : 'desktop', 12)}${o.ctx}</span></div>` : ''}
      <div class="kcRow">${o.lead || ''}<textarea id="${id}" rows="1" placeholder="${esc(o.placeholder)}" aria-label="${esc(o.placeholder)}">${esc(S.drafts[id] || '')}</textarea></div>
      <div class="kcBar">
        <button type="button" class="kcB" data-act2="attach" data-id="${id}" title="Attach images · or paste / drop them here" aria-label="Attach images">${ico(o.bar ? 'plus' : 'clip', 15)}</button>
        ${o.form !== 'note' ? modePill() : ''}
        <span class="sp"></span>
        ${SR ? `<button type="button" class="kcB mic${rec ? ' rec' : ''}" data-act2="mic" data-id="${id}" title="${rec ? 'Stop dictation' : 'Dictate, in any language'}" aria-label="${rec ? 'Stop dictation' : 'Dictate'}">${ico('mic', 15)}</button>` : ''}
        ${o.send ? `<button class="lightBtn sm"${has ? '' : ' disabled'}>${o.send}</button>` : `<button class="sendB${o.sendIcon ? ' alt' : ''}"${has ? '' : ' disabled'} aria-label="${o.sendLabel || 'Send'}" title="${o.sendLabel || 'Send'}">${ico(o.sendIcon || 'up', 14)}</button>`}
      </div></form>`;
  }
  const grow = (t) => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 168) + 'px'; };
  function syncKC(id) {
    const t = $(id);
    if (!t) return;
    grow(t);
    const has = !!(t.value.trim() || (S.att[id] || []).length);
    t.form.querySelector('.sendB,.lightBtn')?.toggleAttribute('disabled', !has);
  }
  function reKC(id, focus = true) {
    const form = document.querySelector(`[data-kc="${id}"]`);
    if (!form || !KC[id]) return;
    form.outerHTML = composer(id, KC[id]);
    syncKC(id);
    const t = $(id);
    if (focus && t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }
  // Read a composer, clear it, and hand its text and images on.
  function take(id, fn) {
    if (S.card?.busy) return;
    const t = $(id), v = (t?.value || '').trim(), atts = S.att[id] || [];
    if (!v && !atts.length) return;
    if (mic?.id === id) stopMic();
    S.drafts[id] = ''; S.att[id] = [];
    if (t) { t.value = ''; reKC(id, false); }
    fn(v, atts);
  }
  const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  function shrink(img, max, q) {
    const w = img.naturalWidth || max, h = img.naturalHeight || max, k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  const b64 = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(file); });
  async function addFiles(id, files) {
    const list = [...files].filter((x) => /^image\/(png|jpeg|gif|webp|svg\+xml|avif)$/.test(x.type));
    if (!list.length) { toast('Tovi can read images: PNG, JPG, GIF, WebP or SVG.', '', true); return; }
    const cur = (S.att[id] ||= []);
    for (const file of list) {
      if (cur.length >= 4) { toast('Up to 4 images per message.', '', true); break; }
      if (file.size > 10 * 1024 * 1024) { toast(`${file.name} is over 10 MB.`, '', true); continue; }
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImg(url);
        const ext = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[file.type] || file.type.split('/')[1];
        const name = file.name && file.name !== 'image.png' ? file.name : `pasted-image.${ext}`;
        // Claude sees a resized copy; the original goes into the project only if Tovi places it in the design.
        cur.push({ name, type: 'image/jpeg', data: shrink(img, 1568, 0.85).split(',')[1], thumb: shrink(img, 160, 0.8), orig: await b64(file) });
      } catch { toast(`Couldn’t read ${file.name}.`, '', true); } finally { URL.revokeObjectURL(url); }
    }
    reKC(id);
  }
  function stopMic() { if (!mic) return; const r = mic.r; mic = null; try { r.stop(); } catch {} markMic(); }
  const markMic = () => document.querySelectorAll('[data-act2="mic"]').forEach((b) => { const on = mic?.id === b.dataset.id; b.classList.toggle('rec', on); b.title = on ? 'Stop dictation' : 'Dictate, in any language'; });
  function toggleMic(id) {
    const same = mic?.id === id;
    stopMic();
    if (same) return;
    const r = new SR();
    r.lang = navigator.language || 'en-US';
    r.continuous = true;
    r.interimResults = true;
    const t = $(id), base = t && t.value.trim() ? t.value.replace(/\s*$/, ' ') : '';
    mic = { id, r };
    r.onresult = (e) => {
      let said = '';
      for (const x of e.results) said += x[0].transcript;
      const el = $(id);
      if (el) { el.value = base + said.trimStart(); S.drafts[id] = el.value; syncKC(id); }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('The microphone is blocked. Allow it for this site in your browser, then try again.', '', true);
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Dictation stopped', e.error, true);
    };
    r.onend = () => { if (mic?.r === r) { mic = null; markMic(); } };
    try { r.start(); } catch { mic = null; }
    markMic();
    t?.focus();
  }
  document.addEventListener('input', (e) => { const t = e.target; if (t.closest?.('.kc') && t.tagName === 'TEXTAREA') { S.drafts[t.id] = t.value; syncKC(t.id); } });
  document.addEventListener('paste', (e) => {
    const t = e.target.closest?.('.kc');
    const files = [...(e.clipboardData?.files || [])];
    if (!t || !files.length) return;
    e.preventDefault();
    addFiles(t.dataset.kc, files);
  });
  document.addEventListener('dragover', (e) => { const t = e.target.closest?.('.kc'); if (t && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); t.classList.add('drop'); } });
  document.addEventListener('dragleave', (e) => { const t = e.target.closest?.('.kc'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop'); });
  document.addEventListener('drop', (e) => {
    const t = e.target.closest?.('.kc');
    if (!t || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    t.classList.remove('drop');
    addFiles(t.dataset.kc, e.dataTransfer.files);
  });

  /* annotations */
  function shapeSVG(n, i, draft, hl) {
    const st = `stroke="#2B66D9" stroke-width="${2 / (S.z || 1)}" stroke-dasharray="${6 / (S.z || 1)} ${4 / (S.z || 1)}" fill="rgba(43,102,217,.06)"`;
    let s = '';
    // A written note shows only its number; its area comes back while its task is hovered.
    const o = n;
    if (i != null && !hl) n = { ...n, shape: n.shape === 'pin' ? 'pin' : 'none' };
    if (n.shape === 'box') s = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" ${st}/>`;
    else if (n.shape === 'circle') s = `<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" ${st}/>`;
    else if (n.shape === 'arrow') { const a = Math.atan2(n.y2 - n.y, n.x2 - n.x), L = 12; s = `<path d="M${n.x} ${n.y}L${n.x2} ${n.y2}M${n.x2} ${n.y2}L${n.x2 - L * Math.cos(a - 0.5)} ${n.y2 - L * Math.sin(a - 0.5)}M${n.x2} ${n.y2}L${n.x2 - L * Math.cos(a + 0.5)} ${n.y2 - L * Math.sin(a + 0.5)}" stroke="#2B66D9" stroke-width="2.5" fill="none" stroke-linecap="round"/>`; }
    const [bx, by] = o.shape === 'pin' || o.shape === 'arrow' ? [o.x, o.y] : [o.x + o.w, o.y];
    if (i != null) s += `<g transform="translate(${bx} ${by}) scale(${1 / (S.z || 1)})" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))">${hl ? '<circle r="16" fill="rgba(43,102,217,.28)"/>' : ''}<circle r="11" fill="#2B66D9" stroke="#fff" stroke-width="2"/><text y="4" fill="#fff" font-size="11" font-weight="600" font-family="Geist,system-ui,sans-serif" text-anchor="middle">${i + 1}</text></g>`;
    else if (n.shape === 'pin') s += `<circle cx="${n.x}" cy="${n.y}" r="6" fill="#2B66D9"/>`;
    return s;
  }
  const drawMarks = () => { $('marksG').innerHTML = S.notes.map((n, i) => shapeSVG(n, i, false, S.hlNote === i + 1)).join('') + (S.noteDraft ? shapeSVG(S.noteDraft, null, true) : ''); };
  // Hovering a note's answer lights up its mark and the elements it changes.
  document.addEventListener('mouseover', (e) => {
    const row = e.target.closest?.('.ntRow');
    if (row || e.target.closest?.('#notesChip')) { const n = row ? +row.dataset.note : null; if (n !== S.hlNote) { S.hlNote = n; drawMarks(); } return; }
    const g = e.target.closest?.('.ng'), n = g ? +g.dataset.ng : null;
    if (n === (S.hlNote ?? null)) return;
    S.hlNote = n;
    const m = g ? S.chat[+g.dataset.i] : S.card;
    if (m?.proposal && m.status === 'pending') S.amber = (n != null ? m.proposal.edits.filter((x) => (n ? x.note === n : !x.note)) : chosen(m)).map((x) => x.loc);
    drawMarks();
  });
  // Tasks waiting to go to Tovi: hidden once Tovi has answered them (the answer lists them instead).
  const tasksShown = () => S.notes.length > 0 && !(S.card && S.card.where === 'notes' && !S.card.busy && S.card.status === 'pending');
  S.openTask = [];
  // Compact, like Figma: one line per task, a chevron for the details, one footer with the actions.
  function tasksHTML(busy) {
    const n = S.notes.length;
    return `<div class="tasks">
      <div class="tkList">${S.notes.map((x, i) => { if (i >= 3 && !S.tasksAll) return ''; const open = S.openTask.includes(i); return `<div class="tk ntRow${open ? ' open' : ''}" data-note="${i + 1}">
        <div class="tkH" data-act2="tkOpen" data-i="${i}" role="button" tabindex="0" aria-expanded="${open}">${ico('task', 15)}<b>Task ${i + 1}</b><span class="tkT">${esc(x.text)}</span><span class="tkC">${ico(open ? 'chev' : 'chevR', 10)}</span><button class="tkX" data-act2="noteDel" data-i="${i}" title="Remove task" aria-label="Remove task ${i + 1}">${ico('x', 12)}</button></div>
        ${open ? `<div class="tkB"><p>${esc(x.text)}</p>${x.atts?.length ? `<div class="uAtt">${x.atts.map((a) => `<img src="${a.thumb}" alt="${esc(a.name)}">`).join('')}</div>` : ''}<span class="note">${{ pin: 'Pinned', box: 'Boxed', circle: 'Circled', arrow: 'Arrow' }[x.shape] || 'Marked'} on the screen</span></div>` : ''}
      </div>`; }).join('')}${S.notes.length > 3 ? `<button class="tkMore" data-act2="tasksAll">${S.tasksAll ? 'Show fewer' : `${S.notes.length - 3} more task${S.notes.length - 3 === 1 ? '' : 's'}`}${ico(S.tasksAll ? 'chev' : 'chevR', 10)}</button>` : ''}</div>
      <div class="tkFoot">${busy ? `<span class="tkN">${avatar(AGENTS[0])}Tovi is on it…</span>` : `<span class="tkN">${ico('spark', 14)}${n} task${n === 1 ? '' : 's'}</span><button class="ghostBtn" data-act2="notesClear">Discard</button><button class="primary applyBtn" data-act2="notesApply">Apply</button>`}</div>
    </div>`;
  }
  function refreshTasks() {
    renderMarks();
    renderChat();
  }
  function renderMarks() {
    drawMarks();
    $('annoCap').hidden = S.tool !== 'annotate';
    const busy = S.card?.busy && S.card.where === 'notes';
    const chip = $('notesChip');
    chip.hidden = S.mode === 'edit' || !tasksShown() || !!S.noteDraft;
    if (!chip.hidden) chip.innerHTML = tasksHTML(busy);
    const pop = $('notePop');
    pop.hidden = !S.noteDraft;
    if (S.noteDraft && W) {
      const n = S.noteDraft, ow = $('ov').clientWidth, oh = $('ov').clientHeight;
      let ax = (n.shape === 'arrow' ? n.x2 : n.x + (n.w || 0)) - W.scrollX + 22 / S.z, ay = (n.shape === 'arrow' ? n.y2 : n.y) - W.scrollY - 22 / S.z;
      // No room to the right of the mark: put the bar under it (or above it near the bottom), so the mark stays visible.
      if (ax + 392 / S.z > ow) {
        const left = (n.shape === 'arrow' ? Math.min(n.x, n.x2) : n.x) - W.scrollX, top = (n.shape === 'arrow' ? Math.min(n.y, n.y2) : n.y) - W.scrollY;
        const bottom = (n.shape === 'arrow' ? Math.max(n.y, n.y2) : n.y + (n.h || 0)) - W.scrollY;
        ax = left - 16 / S.z;
        ay = bottom + 120 / S.z < oh ? bottom + 18 / S.z : top - 112 / S.z;
      }
      pop.style.transform = `translate(${Math.min(ow - 392 / S.z, Math.max(12, ax))}px,${Math.min(oh - 120 / S.z, Math.max(12, ay))}px) scale(${1 / S.z})`;
      if (!pop.dataset.open) {
        pop.innerHTML = composer('noteIn', { form: 'note', bar: true, sendIcon: 'task', sendLabel: 'Add to tasks', placeholder: 'Ask for changes' });
        pop.dataset.open = '1';
        setTimeout(() => { $('noteIn')?.focus(); syncKC('noteIn'); }, 0);
      }
    } else delete pop.dataset.open;
    const res = $('noteRes');
    const m = S.card && S.card.where === 'notes' && !S.card.busy ? S.card : null;
    res.hidden = !m || S.mode === 'edit';
    if (!res.hidden) { res.innerHTML = cardShell('notes', 'Tovi · notes', m, () => `${kerfHTML(m, S.chat.indexOf(m))}${replyForm('notes')}`); placeCard(res, 'notes'); }
    else placeCard(res, 'notes', true);
  }
  function renderAI() {
    renderAsk();
    renderMarks();
    renderChat();
  }
  // Each task goes to its own helper (Milo, Juno, Remi, Nova), at most four at once, all working in parallel.
  // Tovi then puts their answers together, says where two of them meet, and applies the lot.
  async function applyNotes() {
    if (!S.notes.length || S.card?.busy) return;
    const notes = S.notes.slice();
    const per = notes.map((n, i) => noteTargets(n, i));
    const all = uniq(per.flat());
    if (!all.length) { toast('Nothing on screen to work with yet. Wait for the page to load.', '', true); return; }
    const history = historyFor();
    S.chat.push({ role: 'user', text: notes.map((n, i) => `Note ${i + 1}: ${n.text}`).join('\n'), shown: notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n'), ctx: `${notes.length} task${notes.length === 1 ? '' : 's'}`, where: 'notes', atts: [] });
    const m = { role: 'kerf', busy: true, status: 'pending', where: 'notes', targets: all, noteTexts: notes.map((n) => n.text), skip: [], started: Date.now(), looked: all.map((t) => t.name).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 40), lookedN: all.length, helpers: notes.map((n, i) => ({ n: i + 1, name: helperFor(i + 1).name })) };
    S.chat.push(m);
    S.card = m;
    renderAI();
    const screen = await captureScreen();
    m.mode = S.modeOnce || S.styleMode;
    S.modeOnce = null;
    const run = async (k) => {
      if (!per[k].length) return { error: 'Nothing is under this mark any more (the page may have moved). Draw it again.' };
      const stop = () => {};
      const atts = (notes[k].atts || []).slice(0, 4);
      try {
        const p = await api('/ai', { request: `Note ${k + 1}: ${notes[k].text}\nEach element is tagged with the note it sits under.`, targets: per[k], history, screen, context: aiContext(), mode: m.mode, images: atts.map((x) => ({ name: x.name, media_type: x.type, data: x.data, orig: x.orig })) });
        return { p };
      } catch (e) { return { error: e.message }; } finally { stop(); }
    };
    const out = [];
    let next = 0;
    const stopTour = agentTour(AGENTS, all);
    await Promise.all(Array.from({ length: Math.min(4, notes.length) }, async () => { while (next < notes.length) { const k = next++; out[k] = await run(k); } }));
    stopTour();
    // Put the answers together, one row per task.
    const edits = [], rows = [];
    out.forEach((o, k) => {
      const nn = k + 1;
      if (o.error) { rows.push({ note: nn, status: 'not_possible', summary: o.error }); return; }
      o.p.edits.forEach((e) => edits.push({ ...e, note: nn }));
      const own = o.p.notes?.find((x) => x.note === nn) || o.p.notes?.[0];
      const st = own?.status || (o.p.scope === 'done' ? 'done' : o.p.edits.length ? 'partial' : 'not_possible');
      rows.push({ note: nn, status: st, summary: own?.summary || cleanMsg(o.p.message) });
    });
    // Where two helpers change the same element, they say so (and Tovi applies them in task order).
    const byLoc = new Map();
    edits.forEach((e) => byLoc.set(e.loc, [...new Set([...(byLoc.get(e.loc) || []), e.note])]));
    const talk = [];
    for (const [loc, ns] of byLoc) {
      if (ns.length < 2) continue;
      const [first, ...later] = ns.sort((a, b) => a - b), el = elOf(loc), what = el ? dName(el) : 'this element';

    }
    const names = m.helpers.map((h) => h.name);
    m.talk = talk;
    m.proposal = { scope: rows.every((r) => r.status === 'done') ? 'done' : edits.length ? 'partial' : 'not_yet', message: `Tovi worked on ${notes.length === 1 ? 'the task' : `${notes.length} tasks`}.`, notes: rows, edits, suggest: null, mode: m.mode };
    S.amber = edits.filter((e) => e.structure?.type !== 'token').map((e) => e.loc);
    if (edits.some((e) => e.structure?.type === 'token') && !S.tokens) loadTokens();
    if (!edits.length) m.status = 'info';
    m.busy = false;
    m.took = Math.max(1, Math.round((Date.now() - m.started) / 1000));
    renderAI();
    if (m.status === 'pending' && chosen(m).length) await decide(m, 'apply');
    saveChat();
  }
  let draw = null;
  const ovPoint = (e) => { const r = $('ov').getBoundingClientRect(); return { x: (e.clientX - r.left) / S.z + W.scrollX, y: (e.clientY - r.top) / S.z + W.scrollY }; };
  $('annoCap').addEventListener('pointerdown', (e) => {
    if (S.tool !== 'annotate' || !W) return;
    e.preventDefault();
    try { $('annoCap').setPointerCapture(e.pointerId); } catch {}
    S.noteDraft = null;
    renderMarks();
    draw = ovPoint(e);
  });
  $('annoCap').addEventListener('pointermove', (e) => {
    if (!draw) return;
    const { x: x2, y: y2 } = ovPoint(e);
    S.noteDraft = { shape: 'box', x: Math.min(draw.x, x2), y: Math.min(draw.y, y2), w: Math.abs(x2 - draw.x), h: Math.abs(y2 - draw.y) };
    renderMarks();
  });
  $('annoCap').addEventListener('pointerup', () => {
    if (!draw) return;
    const d = S.noteDraft;
    if (!d || (d.shape !== 'pin' && d.shape !== 'arrow' && d.w < 8 && d.h < 8) || (d.shape === 'arrow' && Math.hypot(d.x2 - d.x, d.y2 - d.y) < 8)) S.noteDraft = { shape: 'pin', x: draw.x, y: draw.y };
    draw = null;
    renderMarks();
  });
  // Scrolling the page while annotating keeps the marks in place.
  $('annoCap').addEventListener('wheel', (e) => { if (W) W.scrollBy(e.deltaX, e.deltaY); }, { passive: true });
  function addNote() {
    if (!S.noteDraft) return;
    take('noteIn', (v, atts) => {
      S.notes.push({ ...S.noteDraft, text: v || 'See the attached image.', atts });
      S.noteDraft = null;
      if (S.mode === 'edit' && (S.left !== 'chat' || !S.layersOpen)) { S.left = 'chat'; if (!S.layersOpen) { S.layersOpen = true; renderTop(); setTimeout(applyDevice, 0); } renderLeft(); }
      refreshTasks();
    });
  }
  function setTool(t) {
    S.tool = t;
    S.noteDraft = null;
    S.hintSeen = true;
    if (t !== 'select') { S.hover = null; S.pendingInsert = false; }
    if (t === 'interact') S.pageSel = false;
    // Interacting or moving around isn't editing: let go of the selection so the outline and handles go away.
    if (t === 'interact' && (S.sel || S.multi.length)) { S.multi = []; select(null); }
    if (t === 'annotate') S.askOpen = false;
    syncTool();
    renderBar(); renderMarks(); renderAsk(); renderPanel();
  }
  // AI buttons use data-act2 so they never collide with the editor's own actions.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act2]');
    if (a) {
      const act = a.dataset.act2, v = a.dataset.v;
      if (act === 'askHint') runAI(v, visibleTargets(), 'ask');
      else if (act === 'chatHint') runAI(v, S.sel ? selectionTargets() : visibleTargets(), 'chat');
      else if (act === 'decide') decide(S.chat[+a.dataset.i], v);
      else if (act === 'cardMin') { S.cardMin = !S.cardMin; renderAI(); }
      else if (act === 'closeCard') { S.cardMin = false; S.cardPos = {}; if (S.card?.previewing) { S.card.previewing = false; previewTokens(S.card, false); } if (S.card?.status === 'pending') S.card.status = 'discarded'; S.card = null; S.amber = []; renderAI(); }
      else if (act === 'modeMenu') { const r = a.getBoundingClientRect(); modeMenu({ x: r.left, y: r.top - 230 }); }
      else if (act === 'suggestRun' || act === 'keepLook') {
        const m = S.chat[+a.dataset.i];
        const k = S.chat.indexOf(m), u = [...S.chat.slice(0, k)].reverse().find((x) => x.role === 'user');
        if (!m || !u) return;
        const go = () => {
          S.modeOnce = act === 'keepLook' ? 'improve' : v;
          if (act === 'keepLook') runAI('Make the design system match the look I just applied, so it is reusable everywhere: adjust the colour tokens to it and keep type and spacing consistent.', visibleTargets(), m.where, null, true);
          else runAI(u.text, m.targets?.length ? m.targets : S.sel ? selectionTargets() : visibleTargets(), m.where, u.shown, true);
        };
        if ((act === 'keepLook' || v !== 'system') && !S.direction) { S._afterDir = go; openDirection(); } else go();
      }
      else if (act === 'tryKeep') { const m = S.chat[+a.dataset.i]; if (m) { m.kept = true; renderAI(); saveChat(); } }
      else if (act === 'tryUndo') {
        const m = S.chat[+a.dataset.i];
        if (!m) return;
        (async () => {
          let undone = 0;
          if (m.batch) { const r = await api('/undo', {}).catch(() => null); if (r?.undone) { S.count = r.n; undone = r.count || 1; } }
          else for (let k = 0; k < (m.appliedN || 0); k++) { const r = await api('/undo', {}).catch(() => null); if (!r?.undone) break; S.count = r.n; undone++; }
          m.status = 'undone';
          const what = m.proposal?.mode === 'explore' ? 'Undid the look:' : 'Undid';
          toast(undone ? `${what} ${undone} change${undone === 1 ? '' : 's'}` : 'Nothing to undo');
          afterEdit(); renderAI(); saveChat();
        })();
      }
      else if (act === 'tokPreview') {
        const m = S.chat[+a.dataset.i];
        if (!m || m.status !== 'pending') return;
        m.previewing = !m.previewing;
        previewTokens(m, m.previewing);
        renderAI();
      }
      else if (act === 'dirPreset') { S._dir.preset = S._dir.preset === v ? '' : v; document.querySelectorAll('.dirCard').forEach((c) => c.classList.toggle('on', c.dataset.v === S._dir.preset)); }
      else if (act === 'dirRefX') { S._dir.refs.splice(+a.dataset.i, 1); $('dirRefs').innerHTML = dirRefsHTML(); }
      else if (act === 'dirRefAdd') {
        pickImages().then(async (files) => {
          for (const f of files.slice(0, 3 - S._dir.refs.length)) {
            const url = URL.createObjectURL(f);
            try { const img = await loadImg(url); S._dir.refs.push({ name: f.name, media_type: 'image/jpeg', data: shrink(img, 1200, 0.8).split(',')[1], thumb: shrink(img, 160, 0.8) }); } catch {} finally { URL.revokeObjectURL(url); }
          }
          if ($('dirRefs')) $('dirRefs').innerHTML = dirRefsHTML();
        });
      }
      else if (act === 'dirClear') { api('/direction', {}).then(() => { S.direction = null; $('modal').hidden = true; setStyleMode('system'); toast('Design direction removed'); }); }
      else if (act === 'dirSave') {
        const text = ($('dirText')?.value || '').trim();
        if (!S._dir.preset && !text && !S._dir.refs.length) { toast('Pick a feel, describe it, or add a reference.', '', true); return; }
        const keepOld = S._dir.refs.filter((r) => r.keep && !r.data).length;
        api('/direction', { preset: S._dir.preset, text, refs: S._dir.refs.filter((r) => r.data) }).then((d) => {
          S.direction = d;
          $('modal').hidden = true;
          if (S._dir.thenMode) setStyleMode(S._dir.thenMode); else renderAI();
          toast(`Design direction saved: ${dirName()}`, keepOld ? 'Add your references again to keep them' : '');
          const after = S._afterDir; S._afterDir = null; if (after) after();
        }).catch((err) => toast(err.message, '', true));
      }
      else if (act === 'pickKind') { if (S.pick) { S.pick.kind = v; S.pick.prompt = $('pickQ')?.value || S.pick.prompt; renderPicker(); if (S.pick.prompt && !(v === 'photo' ? S.pick.photos : S.pick.drawings)) runPicker(); } }
      else if (act === 'pickImg') { if (S.pick) chooseImage(S.pick, +a.dataset.i); }
      else if (act === 'pickAll') {
        // Choose each picture in turn (each opens on its own element); when they're all chosen, apply.
        const m = S.chat[+a.dataset.i];
        if (!m) return;
        const next = () => {
          const e2 = m.proposal.edits.find((x) => x.structure?.type === 'imageAsk');
          if (!e2) { renderAI(); if (m.status === 'pending' && chosen(m).length) decide(m, 'apply'); return; }
          const el = D?.querySelector(q(e2.loc)), left = m.proposal.edits.filter((x) => x.structure?.type === 'imageAsk').length;
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          openImagePicker({ kind: e2.structure.kind, prompt: e2.structure.prompt, el, step: left > 1 || m._picks ? `${(m._picks || 0) + 1} of ${(m._picks || 0) + left}` : '', onPick: ({ src, alt, credit }) => {
            e2.structure = { type: 'image', src, alt, credit, kind: e2.structure.kind, prompt: e2.structure.prompt, preview: src };
            m._picks = (m._picks || 0) + 1;
            renderAI();
            setTimeout(next, 250);
          } });
        };
        next();
      }
      else if (act === 'imgOptions') {
        // A proposed image: open the picker with Tovi's description; the pick fills in this edit.
        const m = S.chat[+a.dataset.i], e2 = m?.proposal.edits[+a.dataset.e];
        if (!m || !e2) return;
        const el = D?.querySelector(q(e2.loc));
        openImagePicker({ kind: e2.structure.kind, prompt: e2.structure.prompt, el, onPick: ({ src, alt, credit }) => { e2.structure = { type: 'image', src, alt, credit, kind: e2.structure.kind, prompt: e2.structure.prompt, preview: src }; renderAI(); } });
      }
      else if (act === 'edPick') {
        if (e.target.closest('details')) return;
        const m = S.chat[+a.dataset.i], k = +a.dataset.e;
        if (!m || m.status !== 'pending') return;
        m.off = (m.off || []).includes(k) ? m.off.filter((x) => x !== k) : [...(m.off || []), k];
        S.amber = chosen(m).map((e) => e.loc);
        renderAI();
      }
      else if (act === 'noteSkip') {
        const m = S.chat[+a.dataset.i], n = +a.dataset.n;
        if (!m || m.status !== 'pending') return;
        // Tick or untick every change under this note.
        const idx = m.proposal.edits.map((e, k) => ((e.note ?? 0) === n || (!n && !e.note) ? k : -1)).filter((k) => k > -1);
        const allOn = idx.every((k) => !(m.off || []).includes(k)) && !(m.skip || []).includes(n);
        m.skip = (m.skip || []).filter((x) => x !== n);
        m.off = allOn ? [...new Set([...(m.off || []), ...idx])] : (m.off || []).filter((k) => !idx.includes(k));
        S.amber = chosen(m).map((e) => e.loc);
        renderAI();
      }
      else if (act === 'noteAdd') addNote();
      else if (act === 'attach') { const id = a.dataset.id; pickImages().then((fs) => fs.length && addFiles(id, fs)); }
      else if (act === 'attX') { (S.att[a.dataset.id] || []).splice(+a.dataset.i, 1); reKC(a.dataset.id); }
      else if (act === 'mic') toggleMic(a.dataset.id);
      else if (act === 'noteDiscard') { S.noteDraft = null; renderMarks(); }
      else if (act === 'noteDel') { S.notes.splice(+a.dataset.i, 1); S.openTask = []; S.hlNote = null; refreshTasks(); }
      else if (act === 'notesClear') { S.notes = []; S.openTask = []; if (S.card?.where === 'notes') S.card = null; S.amber = []; refreshTasks(); }
      else if (act === 'tasksAll') { S.tasksAll = !S.tasksAll; refreshTasks(); }
      else if (act === 'ngMore') { const m = S.chat[+a.dataset.i]; if (m) { m.allRows = !m.allRows; renderAI(); } }
      else if (act === 'tkOpen') { const i = +a.dataset.i; S.openTask = S.openTask.includes(i) ? S.openTask.filter((x) => x !== i) : [...S.openTask, i]; refreshTasks(); }
      else if (act === 'ngOpen') { const m = S.chat[+a.dataset.i], n = +a.dataset.n; if (m) { m.openN = (m.openN || []).includes(n) ? m.openN.filter((x) => x !== n) : [...(m.openN || []), n]; renderAI(); } }
      else if (act === 'notesApply') applyNotes();
      return;
    }
    const t = e.target.closest('[data-act="tool"],[data-act="shape"]');
    if (t) { if (t.dataset.act === 'tool') setTool(t.dataset.v === 'annotate' && S.tool === 'annotate' ? 'select' : t.dataset.v); }
  });

  /* ---------- structure: delete, duplicate, move, swap, insert, images ---------- */
  const kebab = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])([0-9])/g, '$1-$2').toLowerCase();
  const iconSrc = (i) => i.lib === 'lucide-react' ? `https://unpkg.com/lucide-static@0.468.0/icons/${kebab(i.name)}.svg` : `https://unpkg.com/@phosphor-icons/core@2.1.1/assets/regular/${kebab(i.name)}.svg`;
  // Structural edits go to where an element is used (the instance), unless it's a plain element.
  const structLoc = () => (S.sel ? (S.sel.use && (S.scope === 'here' || !S.sel.def || nameOf(S.sel.el) !== S.sel.el.tagName.toLowerCase()) ? S.sel.use : S.sel.def || S.sel.use) : null);
  // Wrap the selection (and Shift-selected neighbors) in a new auto-layout frame.
  async function groupSelected() {
    const others = S.multi.map((m) => locOf(m));
    const dir = S.multi.length && S.multi.every((m) => Math.abs(m.el.getBoundingClientRect().top - S.sel.el.getBoundingClientRect().top) < 8) ? 'flex-row items-center' : 'flex-col';
    const ok = await structure({ type: 'group', others, className: `flex ${dir} gap-2` });
    if (ok) S.multi = [];
  }
  async function deleteSelected() {
    if (!S.multi.length) return structure({ type: 'delete' });
    const edits = [{ loc: structLoc(), structure: { type: 'delete' } }, ...S.multi.map((m) => ({ loc: locOf(m), structure: { type: 'delete' } }))];
    const r = await api('/ai/apply', { edits }).catch((e) => ({ error: e.message }));
    if (r.error) return toast(r.error, '', true);
    S.count = r.n; S.multi = []; S.sel = null;
    const ok = r.results.filter((x) => x.ok && x.changed).length, bad = r.results.find((x) => !x.ok);
    toast(`Deleted ${ok} element${ok === 1 ? '' : 's'}`, bad ? bad.error : '', false, true);
    afterEdit(); renderPanel();
  }
  async function structure(op, { keepSel } = {}) {
    const loc = structLoc();
    if (!loc) { toast('Select an element first.', '', true); return false; }
    const before = D?.querySelector('vite-error-overlay');
    try {
      const r = await api('/structure', { loc, op, name: S.sel ? dName(S.sel.el) : null });
      if (!r.changed) return false;
      S.count = r.n;
      toast(`${S.sel ? dName(S.sel.el) + ' · ' : ''}${r.summary.action}`, '', false, true, fileName(r.file));
      if (!keepSel) { S.sel = null; renderPanel(); }
      afterEdit();
      guard(before);
      return true;
    } catch (e) { toast(e.message, '', true); return false; }
  }
  // If a change makes the page fail to build, undo it straight away.
  function guard(hadError) {
    if (hadError) return;
    setTimeout(async () => {
      if (!D?.querySelector('vite-error-overlay')) return;
      await api('/undo', {}).catch(() => {});
      toast('That change broke the page, so Tovi undid it.', '', true);
      afterEdit();
      setTimeout(() => D?.querySelector('vite-error-overlay')?.remove(), 1500);
    }, 1500);
  }
  function actionsHTML() {
    const isComp = S.sel && /^[A-Z]/.test(nameOf(S.sel.el)) || S.sel?.el.tagName.toLowerCase() === 'svg';
    return `<div class="acts2">
      <button class="ib" data-act="sMove" data-v="up" title="Move up · ⌥↑" aria-label="Move up">${ico('up')}</button>
      <button class="ib" data-act="sMove" data-v="down" title="Move down · ⌥↓" aria-label="Move down"><span style="display:inline-block;transform:rotate(180deg)">${ico('up')}</span></button>
      <button class="ib" data-act="sDup" title="Duplicate · ⌘D" aria-label="Duplicate">${ico('dup')}</button>
      <button class="ib" data-act="sGroup" title="Group into a frame · ⌘⌥G" aria-label="Group">${ico('frame')}</button>
      ${S.sel && /^(div|section|span)$/.test(S.sel.el.tagName.toLowerCase()) && !S.sel.el.getAttribute('data-kerf-n') ? `<button class="ib" data-act="sUngroup" title="Ungroup · ⇧⌘G" aria-label="Ungroup">${ico('corners')}</button>` : ''}
      ${isComp ? `<button class="ib" data-act="sSwap" title="Swap for another icon or component" aria-label="Swap">${ico('swap')}</button>` : ''}
      <button class="ib" data-act="insertMenu" title="Add an element here · I" aria-label="Add">${ico('plus')}</button>
      <button class="ib danger" data-act="sDel" title="Delete · ⌫" aria-label="Delete">${ico('trash')}</button>
    </div>`;
  }
  function imageSection(el) {
    if (!el || el.tagName.toLowerCase() !== 'img') return '';
    const src = el.getAttribute('src') || '', alt = el.getAttribute('alt') || '';
    const fit = cs(el).objectFit;
    return sec('Image', `<div class="thumb"><img src="${esc(el.currentSrc || src)}" alt=""></div>
      <div class="r2"><button class="outline" data-act="imgFind" data-v="photo">${ico('search', 12)} Find a photo</button><button class="outline" data-act="imgFind" data-v="illustration">${ico('pen', 12)} Draw one</button></div>
      <div class="r2"><button class="ghostBtn" data-act="imgUpload">Upload…</button><button class="ghostBtn" data-act="imgLink">Use a link</button></div>
      <label class="inp" title="Alt text"><span class="u">Alt</span><input type="text" data-alt="1" value="${esc(alt)}" placeholder="Describe the image"></label>
      <div class="ibs txt">${['cover', 'contain', 'fill'].map((v) => `<button class="ib${fit === v ? ' on' : ''}" data-act="set" data-p="fit" data-v="${v}" title="${v === 'cover' ? 'Fill the box, crop the edges' : v === 'contain' ? 'Fit inside the box' : 'Stretch to the box'}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`);
  }
  /* image picker: real photos (Unsplash) or illustrations Claude draws, chosen from a few options */
  S.pick = null;
  function openImagePicker({ kind = 'photo', prompt = '', el = S.sel?.el, onPick, step = '' }) {
    const r = el?.getBoundingClientRect?.() || { width: 4, height: 3 };
    const ratio = r.width && r.height ? r.width / r.height : 4 / 3;
    S.pick = { kind, prompt, ratio, onPick, step, photos: null, drawings: null, busy: false, error: '' };
    $('modal').hidden = false;
    renderPicker();
    if (prompt) runPicker();
    else setTimeout(() => $('pickQ')?.focus(), 0);
  }
  function renderPicker() {
    const P = S.pick;
    if (!P) return;
    const res = P.kind === 'photo' ? P.photos : P.drawings;
    const grid = P.busy
      ? `<div class="pkWait"><i class="kSpin"><b></b><b></b><b></b><b></b></i><span data-since="${P.started}">${liveText(P.started)}</span><span class="note">${P.kind === 'photo' ? 'Searching Unsplash…' : 'Claude is drawing 3 options in your colours. This takes about 30 seconds.'}</span></div>`
      : P.error ? `<div class="pkNone warn">${esc(P.error)}</div>`
      : P.needsKey ? `<div class="pkNone">Photo search needs a free Unsplash key. Add it on <a href="http://localhost:4100" target="_blank" rel="noopener">Tovi’s start page</a>, then search again.</div>`
      : !res ? `<div class="pkNone">${P.kind === 'photo' ? 'Describe the photo you want, e.g. “hands shaping a clay bowl”.' : 'Describe the illustration, e.g. “a person arranging ceramics on a shelf”.'}</div>`
      : !res.length ? '<div class="pkNone">Nothing found. Try other words.</div>'
      : P.kind === 'photo'
        ? `<div class="pkGrid">${res.map((x, i) => `<button class="pkItem" data-act2="pickImg" data-i="${i}" title="${esc(x.alt)}"><img src="${esc(x.thumb)}" alt="${esc(x.alt)}" style="aspect-ratio:${P.ratio}"><span>${esc(x.credit?.name || '')}</span></button>`).join('')}</div><p class="note pkCredit">Photos from <a href="https://unsplash.com/?utm_source=kerf&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a>, free to use.</p>`
        : `<div class="pkGrid draw">${res.map((x, i) => `<button class="pkItem" data-act2="pickImg" data-i="${i}" title="${esc(x.title)}"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(x.svg)}" alt="${esc(x.title)}" style="aspect-ratio:${P.ratio}"><span>${esc(x.title)}</span></button>`).join('')}</div>`;
    $('modal').innerHTML = `<section class="dialog pick" role="dialog" aria-modal="true" aria-labelledby="pkT">
      <div class="dh"><div style="display:flex;flex-direction:column;gap:4px"><h2 id="pkT">Choose an image${P.step ? ` <span class="note" style="font-weight:400">· ${esc(P.step)}</span>` : ''}</h2><span class="note">${P.prompt ? `For: “${esc(P.prompt)}”. ` : ''}Pick one and it takes this element’s place, at the same size.</span></div><button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div>
      <div class="db">
        <div class="seg pkTabs"><button data-act2="pickKind" data-v="photo" class="${P.kind === 'photo' ? 'on' : ''}">${ico('image', 12)} Photos</button><button data-act2="pickKind" data-v="illustration" class="${P.kind === 'illustration' ? 'on' : ''}">${ico('pen', 12)} Illustrations</button></div>
        <form class="insSearch" data-form="pick">${ico('search', 14)}<input id="pickQ" value="${esc(P.prompt)}" placeholder="${P.kind === 'photo' ? 'Search photos' : 'Describe the illustration'}" autocomplete="off" spellcheck="false" aria-label="What should the image show?"><button class="primary sm">${P.kind === 'photo' ? 'Search' : 'Draw'}</button></form>
        ${grid}
      </div></section>`;
  }
  async function runPicker() {
    const P = S.pick;
    if (!P || !P.prompt.trim()) return;
    P.busy = true; P.error = ''; P.needsKey = false; P.started = Date.now();
    renderPicker();
    try {
      if (P.kind === 'photo') {
        const o = P.ratio > 1.2 ? 'landscape' : P.ratio < 0.83 ? 'portrait' : 'squarish';
        const r = await api('/images/photos?q=' + encodeURIComponent(P.prompt) + '&orientation=' + o);
        P.needsKey = !!r.needsKey; P.photos = r.photos;
      } else {
        const w = 1200, h = Math.round(1200 / (P.ratio || 1.33));
        P.drawings = (await api('/images/illustrate', { prompt: P.prompt, width: w, height: h, theme: aiContext().theme || 'light', count: 3 })).options;
      }
    } catch (e) { P.error = e.message; }
    if (S.pick === P) { P.busy = false; renderPicker(); }
  }
  // Put a chosen picture in place: photos are used straight from Unsplash; drawings are saved into the project.
  async function chooseImage(P, i) {
    let src, alt, credit = '';
    if (P.kind === 'photo') {
      const x = P.photos[i];
      src = x.url; alt = x.alt; credit = x.credit?.name ? `Photo by ${x.credit.name} on Unsplash` : '';
      api('/images/photo-used', { download: x.download }).catch(() => {});
    } else {
      const x = P.drawings[i];
      const slug = (P.prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'illustration');
      const data = btoa(unescape(encodeURIComponent(x.svg)));
      src = (await api('/upload', { name: `${slug}.svg`, data }).catch((e) => { toast(e.message, '', true); return null; }))?.src;
      alt = x.title;
    }
    if (!src) return;
    $('modal').hidden = true;
    S.pick = null;
    if (P.onPick) P.onPick({ src, alt, credit });
    else { await structure({ type: 'image', src, alt, ...(credit ? { credit } : {}) }, { keepSel: true }); if (credit) toast(credit, 'The credit is added to your pull request.'); }
  }
  function pickImages() {
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.multiple = true;
      i.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif';
      i.onchange = () => resolve([...i.files]);
      i.click();
    });
  }
  function pickFile() {
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif';
      i.onchange = () => resolve(i.files[0] || null);
      i.click();
    });
  }
  async function upload(file) {
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024) { toast('Images must be under 10 MB.', '', true); return null; }
    const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(file); });
    try { return (await api('/upload', { name: file.name, data })).src; } catch (e) { toast(e.message, '', true); return null; }
  }

  /* insert menu */
  function tokenClass(pre, wanted, fallback) {
    const t = tokens().map(([n]) => n);
    const hit = wanted.find((w) => t.includes(w));
    return hit ? `${pre}-${hit}` : fallback;
  }
  async function templates() {
    if (!S.components) S.components = await api('/components').catch(() => []);
    const has = (n) => S.components.some((c) => c.name === n);
    const ink = tokenClass('text', ['content', 'foreground', 'text'], 'text-gray-900');
    const muted = tokenClass('text', ['muted', 'muted-foreground', 'faint'], 'text-gray-500');
    return [
      { k: 'text', label: 'Text', icon: 'text', jsx: `<p className="text-sm ${muted}">New text</p>` },
      { k: 'heading', label: 'Heading', icon: 'heading', jsx: `<h2 className="text-2xl font-semibold ${ink}">New heading</h2>` },
      { k: 'button', label: 'Button', yours: has('Button'), icon: 'button', jsx: has('Button') ? '<Button>Button</Button>' : `<button className="rounded-md px-4 py-2 text-sm font-medium ${tokenClass('bg', ['primary'], 'bg-gray-900')} ${tokenClass('text', ['primary-fg', 'primary-foreground'], 'text-white')}">Button</button>` },
      { k: 'image', label: 'Image…', icon: 'image', image: true },
      { k: 'icon', label: 'Icon…', icon: 'spark', iconPick: true },
      { k: 'frame', label: 'Frame', icon: 'frame', jsx: `<div className="flex flex-col gap-3 rounded-lg ${tokenClass('border', ['border'], 'border-gray-200')} border p-4"><p className="text-sm ${muted}">New frame</p></div>` },
    ];
  }
  // Boxes that hold other elements take new ones inside; text, images and buttons get them after.
  const defaultPos = () => (S.sel && S.sel.el.children.length && !['p', 'span', 'button', 'a', 'label', 'svg'].includes(S.sel.el.tagName.toLowerCase()) ? 'inside' : 'after');
  // Add from anywhere: it switches to Select (clicks must pick a spot, not use the app), and if nothing is
  // selected yet, the next click picks where the new element goes and opens Add right there.
  function startInsert() {
    if (S.mode === 'preview') setMode('edit');
    if (S.tool !== 'select') setTool('select');
    if (!S.sel) {
      S.pendingInsert = true;
      toast('Click where the new element should go', 'Add opens as soon as you pick a spot. Esc to cancel.');
      return;
    }
    S.insertPos = defaultPos();
    openInsert();
  }
  async function openInsert() {
    if (!S.sel) { toast('Select where the new element should go, then add it.', '', true); return; }
    S._tpls = await templates();
    const pos = S.insertPos || 'after';
    const m = $('modal');
    m.hidden = false;
    m.innerHTML = `<section class="dialog ins" role="dialog" aria-modal="true" aria-labelledby="insT">
      <div class="insHead"><div class="insTitle"><h2 id="insT">Add</h2><span class="note">${pos === 'inside' ? 'inside' : pos} <b>${esc(dName(S.sel.el))}</b></span></div>
        <div class="seg insPos">${[['before', 'Before'], ['after', 'After'], ['inside', 'Inside']].map(([p, n]) => `<button data-act="insPos" data-v="${p}" class="${pos === p ? 'on' : ''}">${n}</button>`).join('')}</div>
        <button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div>
      <label class="insSearch">${ico('search', 14)}<input id="compQ" placeholder="Search elements and components" autocomplete="off" spellcheck="false"></label>
      <div class="insBody" id="insBody">${insBody('')}</div></section>`;
    setTimeout(() => $('compQ')?.focus(), 0);
  }
  // Basics as small tiles, then the project's components grouped by folder, with names in plain words.
  function insBody(q) {
    const ql = q.trim().toLowerCase();
    const hit = (t) => !ql || t.toLowerCase().includes(ql);
    const tiles = (S._tpls || []).map((t, i) => ({ t, i })).filter(({ t }) => hit(t.label));
    const groups = new Map();
    for (const c of (S.components || []).filter((c) => c.name !== 'Button')) {
      const label = camelWords(c.name);
      if (!hit(label) && !hit(c.name)) continue;
      const dir = (c.file.split('/').slice(-2, -1)[0] || 'components').replace(/[-_]/g, ' ');
      const g = dir.length <= 3 ? dir.toUpperCase() : dir[0].toUpperCase() + dir.slice(1);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ c, label });
    }
    const sorted = [...groups.entries()].sort((a, b) => (a[0] === 'UI' ? -1 : b[0] === 'UI' ? 1 : a[0].localeCompare(b[0])));
    const out = [];
    if (tiles.length) out.push(`<div class="insSec"><div class="insT">Basics</div><div class="insTiles">${tiles.map(({ t, i }) => `<button class="itile" data-act="insTpl" data-v="${i}"><span class="ii">${ico(t.icon, 16)}</span><span>${esc(t.label.replace(/…$/, ''))}</span>${t.yours ? '<i class="yours">Yours</i>' : ''}</button>`).join('')}</div></div>`);
    for (const [g, items] of sorted) out.push(`<div class="insSec"><div class="insT">${esc(g)}<span>${items.length}</span></div><div class="insList">${items.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 80).map(({ c, label }) => `<button class="crow" data-act="insComp" data-v="${esc(c.name)}" title="${esc(c.name)} · ${esc(c.file)}">${ico('comp', 13)}<span>${esc(label)}</span></button>`).join('')}</div></div>`);
    return out.join('') || `<div class="insNone">Nothing matches “${esc(q)}”.</div>`;
  }
  const CHILD_TEXT = /^(Button|Badge|Label|CardTitle|CardDescription|Tag|Chip|Link|Heading|Title|Text)$/;
  async function insertJsx(jsx) {
    $('modal').hidden = true;
    await structure({ type: 'insert', position: S.insertPos || 'after', jsx });
  }

  /* icon picker (swap or insert) */
  function openIcons(mode) {
    const m = $('modal');
    m.hidden = false;
    m.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="icT" style="width:520px">
      <div class="dh"><div style="display:flex;flex-direction:column;gap:4px"><h2 id="icT">${mode === 'swap' ? 'Swap icon' : 'Add an icon'}</h2><span class="note">From your project’s icon library.</span></div><button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div>
      <div class="db"><label class="inp"><input id="iconQ" placeholder="Search icons, e.g. heart" autocomplete="off" data-mode="${mode}"></label><div class="igrid" id="iconGrid"><span class="note">Type to search…</span></div></div></section>`;
    setTimeout(() => $('iconQ').focus(), 0);
    searchIcons('', mode);
  }
  let iconT;
  function searchIcons(q, mode) {
    clearTimeout(iconT);
    iconT = setTimeout(async () => {
      const only = mode === 'swap' ? (S.sel?.useInfo?.lib || '') : '';
      const list = await api('/icons?q=' + encodeURIComponent(q) + (only ? '&lib=' + encodeURIComponent(only) : '')).catch(() => []);
      const g = $('iconGrid');
      if (!g) return;
      g.innerHTML = list.length ? list.map((i) => `<button class="icell" data-act="pickIcon" data-v="${esc(i.name)}" data-mode="${mode}" title="${esc(i.name)} · ${esc(i.lib)}"><img src="${iconSrc(i)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(i.name)}</span></button>`).join('') : '<span class="note">No icons match.</span>';
    }, 120);
  }
  document.addEventListener('input', (e) => {
    if (e.target.id === 'iconQ') searchIcons(e.target.value, e.target.dataset.mode);
    if (e.target.id === 'compQ') $('insBody').innerHTML = insBody(e.target.value);
  });
  document.addEventListener('keydown', (e) => { if (e.target.id === 'compQ' && e.key === 'Enter') { e.preventDefault(); $('insBody')?.querySelector('button')?.click(); } });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.alt) structure({ type: 'image', alt: e.target.value }, { keepSel: true });
  });
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act, v = a.dataset.v;
    if (act === 'sDel') deleteSelected();
    else if (act === 'sDup') structure({ type: 'duplicate' });
    else if (act === 'sGroup') groupSelected();
    else if (act === 'sUngroup') structure({ type: 'ungroup' });
    else if (act === 'sMove') structure({ type: 'move', dir: v });
    else if (act === 'sSwap') {
      if (S.sel.el.tagName.toLowerCase() === 'svg') openIcons('swap');
      else { S.insertPos = 'after'; openSwapComponent(); }
    }
    else if (act === 'insertMenu') startInsert();
    else if (act === 'insPos') { S.insertPos = v; openInsert(); }
    else if (act === 'insTpl') {
      const t = S._tpls[+v];
      if (t.iconPick) openIcons('insert');
      else if (t.image) { $('modal').hidden = true; const src = await upload(await pickFile()); if (src) insertJsx(`<img src="${src}" alt="" className="h-auto w-full rounded-lg object-cover" />`); }
      else insertJsx(t.jsx);
    }
    else if (act === 'insComp') insertJsx(CHILD_TEXT.test(v) ? `<${v}>${v}</${v}>` : `<${v} />`);
    else if (act === 'pickIcon') {
      if (a.dataset.mode === 'swap') { $('modal').hidden = true; closeIconPop(); structure({ type: 'swap', to: v }, { keepSel: true }); }
      else insertJsx(`<${v} className="h-5 w-5" />`);
    }
    else if (act === 'swapComp') { $('modal').hidden = true; structure({ type: 'swap', to: v }, { keepSel: true }); }
    else if (act === 'iconPick') openIconPop(a);
    else if (act === 'iconUpload') {
      closeIconPop();
      // Your own icon: an uploaded SVG takes this icon's place at the same size.
      const file = await pickFile();
      if (!file) return;
      if (!/svg|png|webp/i.test(file.type)) { toast('Pick an SVG (or a PNG) for the icon.', '', true); return; }
      const src = await upload(file);
      const cls = ((S.sel?.useInfo || S.sel?.defInfo)?.classes || []).filter((c) => /^(h|w|size|shrink|flex|m[trblxy]?|-?m[trblxy]?)-/.test(c)).join(' ') || 'h-4 w-4';
      if (src) structure({ type: 'replace', jsx: `<img src="${src}" alt="" className="${cls}" />` });
    }
    else if (act === 'imgFind') openImagePicker({ kind: v });
    else if (act === 'imgUpload') { const src = await upload(await pickFile()); if (src) structure({ type: 'image', src }, { keepSel: true }); }
    else if (act === 'imgLink') { const u = prompt('Image link (https://…)'); if (u && /^https?:\/\//.test(u)) structure({ type: 'image', src: u.trim() }, { keepSel: true }); }
  });
  /* the icon panel: a compact row like Figma's instance swap, plain stroke controls, and a picker */
  const libName = (lib) => ({ 'lucide-react': 'Lucide', '@phosphor-icons/react': 'Phosphor', 'phosphor-react': 'Phosphor' })[lib] || lib || '';
  function iconSection(el) {
    const name = el.getAttribute('data-kerf-n') || '', lib = S.sel?.useInfo?.lib || '';
    const real = name && /^[A-Z]/.test(name);
    const props = (S.sel?.useInfo?.props || []).filter((p) => p.editable);
    const prop = (n) => props.find((p) => p.name === n);
    const sw = prop('strokeWidth'), abs = prop('absoluteStrokeWidth'), wt = prop('weight');
    const row = `<button class="icRow btnRow" data-act="iconPick" title="Swap icon" aria-haspopup="dialog">
        <span class="icNow">${real ? `<img src="${iconSrc({ name, lib: lib || 'lucide-react' })}" alt="" onerror="this.style.visibility='hidden'">` : ico('spark', 16)}</span>
        <span class="icMeta"><b>${esc(real ? camelWords(name) : 'Custom icon')}</b><span class="note">${esc(real ? libName(lib) || 'Icon' : 'Drawn in the code')}</span></span>
        <span class="icSwap">Swap${ico('chev', 10)}</span></button>`;
    const ctl = [
      sw ? `<div class="kv"><span>Stroke</span><label class="inp"><input type="text" inputmode="decimal" data-propnum="strokeWidth" value="${sw.value ?? ''}" placeholder="2" aria-label="Stroke width"></label></div>` : '',
      abs ? `<div class="kv"><span title="Keep the lines the same thickness when the icon is resized">Fixed stroke</span><div class="seg"><button data-act="setProp" data-p="absoluteStrokeWidth" data-v="false" class="${abs.value !== true ? 'on' : ''}">Off</button><button data-act="setProp" data-p="absoluteStrokeWidth" data-v="true" class="${abs.value === true ? 'on' : ''}">On</button></div></div>` : '',
      wt ? `<div class="kv"><span>Weight</span><label class="inp"><select data-propsel="weight" aria-label="Icon weight">${wt.value == null ? '<option value="" selected>Default</option>' : ''}${wt.options.map((o) => `<option${o === wt.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>${ico('chev', 12)}</label></div>` : '',
    ].join('');
    return sec('Icon', row + ctl);
  }
  // The picker: icons this app already uses, icons like this one, or a search, with names and the current one marked.
  S.iconSug = null;
  const iconCells = (list, cur) => list.map((i) => `<button class="icell${i.name === cur ? ' on' : ''}" data-act="pickIcon" data-v="${esc(i.name)}" data-mode="swap" title="${esc(camelWords(i.name))}"><img src="${iconSrc(i)}" alt="" decoding="async" onerror="this.style.visibility='hidden'"><span>${esc(camelWords(i.name))}</span></button>`).join('');
  function iconPopBody() {
    const name = S.sel?.el.getAttribute('data-kerf-n') || '', q = (S.iconQ || '').trim();
    if (q) return S.iconRes?.q === q ? (S.iconRes.list.length ? `<div class="ipT">Results</div><div class="igrid p">${iconCells(S.iconRes.list.slice(0, 60), name)}</div>` : '<div class="ipNone">No icons match.</div>') : '<div class="ipNone">Searching…</div>';
    if (!S.iconSug) return '<div class="ipNone">Loading…</div>';
    const used = S.iconSug.used.filter((i) => i.name !== name).slice(0, 18), sim = S.iconSug.similar.slice(0, 24);
    return `${sim.length ? `<div class="ipT">Like ${esc(camelWords(name) || 'this one')}</div><div class="igrid p">${iconCells(sim, name)}</div>` : ''}${used.length ? `<div class="ipT">Used in this app</div><div class="igrid p">${iconCells(used, name)}</div>` : ''}` || '<div class="ipNone">Search for an icon.</div>';
  }
  function openIconPop(anchor) {
    let pop = $('iconPop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'iconPop'; pop.className = 'iconPop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Swap icon'); document.body.appendChild(pop); }
    const lib = S.sel?.useInfo?.lib || '', name = S.sel?.el.getAttribute('data-kerf-n') || '';
    S.iconQ = '';
    pop.innerHTML = `<label class="insSearch sm">${ico('search', 12)}<input id="iconQp" placeholder="Search ${esc(libName(lib) || 'icons')}" autocomplete="off" spellcheck="false" aria-label="Search icons"></label><div class="ipBody" id="ipBody">${iconPopBody()}</div><div class="ipFoot"><button class="ghostBtn" data-act="iconUpload">${ico('image', 12)} Use your own SVG…</button></div>`;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), h = Math.min(460, innerHeight - 24);
    const below = innerHeight - r.bottom - 12 >= Math.min(h, 360);
    Object.assign(pop.style, { width: Math.max(260, r.width) + 'px', left: Math.max(8, Math.min(innerWidth - Math.max(260, r.width) - 8, r.left)) + 'px', top: (below ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px', maxHeight: h + 'px' });
    setTimeout(() => $('iconQp')?.focus(), 0);
    api('/icons/suggest?name=' + encodeURIComponent(name) + (lib ? '&lib=' + encodeURIComponent(lib) : '')).then((x) => { S.iconSug = x; if (!(S.iconQ || '').trim() && $('ipBody')) $('ipBody').innerHTML = iconPopBody(); }).catch(() => { S.iconSug = { used: [], similar: [] }; });
  }
  const closeIconPop = () => { const p = $('iconPop'); if (p) p.hidden = true; };
  document.addEventListener('pointerdown', (e) => { const p = $('iconPop'); if (p && !p.hidden && !e.target.closest('#iconPop,[data-act="iconPick"]')) closeIconPop(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeIconPop(); });
  let iconPT;
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'iconQp') return;
    S.iconQ = e.target.value;
    const q = e.target.value.trim(), lib = S.sel?.useInfo?.lib || '';
    if (!q) { $('ipBody').innerHTML = iconPopBody(); return; }
    clearTimeout(iconPT);
    iconPT = setTimeout(async () => {
      const list = await api('/icons?q=' + encodeURIComponent(q) + (lib ? '&lib=' + encodeURIComponent(lib) : '')).catch(() => []);
      S.iconRes = { q, list };
      if ((S.iconQ || '').trim() === q && $('ipBody')) $('ipBody').innerHTML = iconPopBody();
    }, 120);
  });
  async function openSwapComponent() {
    if (!S.components) S.components = await api('/components').catch(() => []);
    const m = $('modal');
    m.hidden = false;
    m.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="swT" style="width:440px">
      <div class="dh"><div style="display:flex;flex-direction:column;gap:4px"><h2 id="swT">Swap ${esc(nameOf(S.sel.el))}</h2><span class="note">Replace it with another of your components. Its properties are kept.</span></div><button class="ib" data-act="closeModal" aria-label="Close">${ico('x')}</button></div>
      <div class="db"><div class="clist">${S.components.map((c) => `<button class="crow" data-act="swapComp" data-v="${esc(c.name)}">${ico('comp', 12)}<span>${esc(c.name)}</span><span class="note mono">${esc(c.file.replace(/^src\//, ''))}</span></button>`).join('')}</div></div></section>`;
  }
  // Keyboard: delete, duplicate, move, insert.
  window.addEventListener('keydown', structKeys, true);
  function structKeys(e) {
    const t = e.target;
    if (!picking() || !S.sel || S.editing || (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName)))) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); deleteSelected(); }
    else if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyG') { e.preventDefault(); e.stopImmediatePropagation(); groupSelected(); }
    else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyG') { e.preventDefault(); e.stopImmediatePropagation(); structure({ type: 'ungroup' }); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); e.stopImmediatePropagation(); structure({ type: 'duplicate' }); }
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopImmediatePropagation(); structure({ type: 'move', dir: e.key === 'ArrowUp' ? 'up' : 'down' }); }
    else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); e.stopImmediatePropagation(); S.insertPos = defaultPos(); openInsert(); }
  }

  /* drag to reorder on the canvas: drag the selected element over a sibling */
  let drag = null;
  function bindDrag() {
    if (!W) return;
    W.addEventListener('keydown', structKeys, true);
    W.addEventListener('pointerdown', (e) => {
      if (!picking() || thru(e) || !S.sel || !S.sel.el.contains(e.target) || S.editing) return;
      const el = S.sel.el, parent = el.parentElement;
      if (!parent) return;
      const sibs = [...parent.children].filter((c) => c.matches('[data-kerf],[data-kerf-use]'));
      if (sibs.length < 2) return;
      drag = { el, sibs, x: e.clientX, y: e.clientY, on: false, idx: sibs.indexOf(el) };
    }, true);
    W.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.on = true;
      const flow = cs(drag.el.parentElement);
      const horiz = /row/.test(flow.flexDirection) && /flex/.test(flow.display) || /grid/.test(flow.display);
      let best = 0, bd = 1e9, after = false;
      drag.sibs.forEach((s, k) => {
        const r = s.getBoundingClientRect(), c = horiz ? r.left + r.width / 2 : r.top + r.height / 2;
        const d = Math.abs((horiz ? e.clientX : e.clientY) - c);
        if (d < bd) { bd = d; best = k; after = (horiz ? e.clientX : e.clientY) > c; }
      });
      let to = best + (after ? 1 : 0);
      if (to > drag.idx) to -= 1;
      drag.to = to;
      const r = drag.sibs[best].getBoundingClientRect(), line = $('dropLine');
      line.hidden = false;
      line.style.cssText = horiz ? `left:${(after ? r.right : r.left) - 1}px;top:${r.top}px;width:3px;height:${r.height}px` : `left:${r.left}px;top:${(after ? r.bottom : r.top) - 1}px;width:${r.width}px;height:3px`;
    }, true);
    W.addEventListener('pointerup', () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      $('dropLine').hidden = true;
      if (d.on && d.to != null && d.to !== d.idx) structure({ type: 'move', index: d.to });
    }, true);
  }
  frame.addEventListener('load', bindDrag);
  if (frame.contentDocument?.readyState === 'complete') setTimeout(bindDrag, 0);

  /* ---------- layout: auto layout, size, margin ---------- */
  function layoutVal(el) {
    const c = cs(el);
    const flex = /flex/.test(c.display);
    const dir = flex ? (/column/.test(c.flexDirection) ? 'col' : 'row') : 'none';
    const norm = (v) => ({ 'flex-start': 'start', start: 'start', normal: 'start', left: 'start', 'flex-end': 'end', end: 'end', right: 'end', center: 'center', 'space-between': 'between', stretch: 'stretch', baseline: 'baseline' }[v] || 'start');
    return { dir, items: norm(c.alignItems), justify: norm(c.justifyContent), wrap: c.flexWrap === 'wrap' };
  }
  function sizeMode(axis) {
    const cls = (info()?.classes || []).filter((x) => !x.includes(':') && x.startsWith(axis + '-'));
    if (cls.includes(axis + '-fit')) return 'hug';
    if (cls.includes(axis + '-full') || (axis === 'w' && (info()?.classes || []).includes('flex-1'))) return 'fill';
    if (cls.some((x) => /^[wh]-(\d|\[)/.test(x))) return 'fixed';
    return 'auto';
  }
  // Frames get auto layout; text, icons and images only get what they can use.
  const isMedia = (el) => /^(img|svg|video|picture|canvas)$/i.test(el.tagName);
  const isContainer = (el) => !isMedia(el) && (el.childElementCount > 0 || !isText(el)) && !/^(input|textarea|select|hr)$/i.test(el.tagName);
  function layoutSections(el) {
    const L = layoutVal(el);
    let h = '';
    const shown = (k) => S.reveal?.el === el && S.reveal[k];
    const hasPad = (+val('padX') || 0) > 0 || (+val('padY') || 0) > 0, hasMargin = (+val('mX') || 0) !== 0 || (+val('mY') || 0) !== 0;
    const marginSec = () => sec('Margin', hasMargin || shown('margin') ? `<div class="r2">${nf('mX', 'padH', 'Horizontal margin')}${nf('mY', 'padV', 'Vertical margin')}</div>` : '', hasMargin || shown('margin') ? '' : hb('reveal', 'plus', 'Add margin', 'margin'));
    // Like Figma: one field per axis, "W 468" with Fixed / Hug / Fill inside it. Typing a number makes it fixed.
    const MODES = [['fixed', 'Fixed'], ['hug', 'Hug'], ['fill', 'Fill'], ['auto', 'Auto']];
    const sizeField = (axis) => {
      const mode = sizeMode(axis), r = el.getBoundingClientRect(), px = Math.round(axis === 'w' ? r.width : r.height), nm = axis === 'w' ? 'Width' : 'Height';
      return `<div class="inp szf${info()?.sized?.includes(axis) ? ' sized' : ''}" title="${nm}"><span class="ic" data-scrub="${axis}"><b class="tg">${axis.toUpperCase()}</b></span><input type="text" inputmode="decimal" data-prop="${axis}" value="${px}" aria-label="${nm}"><label class="szm" title="${nm}: ${MODES.find(([v]) => v === mode)[1]}"><span>${mode === 'fixed' ? '' : MODES.find(([v]) => v === mode)[1]}</span>${ico('chev', 10)}<select data-size="${axis}" aria-label="${nm} sizing">${MODES.map(([v, n]) => `<option value="${v}"${mode === v ? ' selected' : ''}>${n === 'Auto' ? 'Auto (as coded)' : n === 'Hug' ? 'Hug contents' : n === 'Fill' ? 'Fill container' : 'Fixed'}</option>`).join('')}</select></label></div>`;
    };
    const sizeSec = () => sec('Size', `<div class="r2">${sizeField('w')}${sizeField('h')}</div>`);
    if (!isContainer(el)) {
      if (!isMedia(el)) h += sec('Padding', hasPad || shown('pad') ? `<div class="r2">${nf('padX', 'padH', 'Horizontal padding')}${nf('padY', 'padV', 'Vertical padding')}</div>` : '', hasPad || shown('pad') ? '' : hb('reveal', 'plus', 'Add padding', 'pad'));
      return h + sizeSec() + marginSec();
    }
    // Alignment matrix like Figma's: 3×3, mapped to justify/items by direction.
    const pos = ['start', 'center', 'end'];
    const cell = (r, c) => {
      const main = L.dir === 'col' ? pos[r] : pos[c], cross = L.dir === 'col' ? pos[c] : pos[r];
      const on = L.justify === main && (L.items === cross || (L.items === 'stretch' && cross === 'start'));
      return `<button class="mx${on ? ' on' : ''}" data-act="align9" data-j="${main}" data-i="${cross}" title="Align ${cross}, ${main}" aria-label="Align ${cross} ${main}"><i></i></button>`;
    };
    const auto = L.dir !== 'none';
    h += sec('Auto layout', `<div class="r2"><div class="ibs">${[['none', 'Off'], ['col', '↓'], ['row', '→']].map(([v, n]) => `<button class="ib${L.dir === v ? ' on' : ''}" data-act="set" data-p="layout" data-v="${v}" title="${v === 'none' ? 'No auto layout' : v === 'col' ? 'Vertical' : 'Horizontal'}">${n}</button>`).join('')}</div>${auto ? `<div class="ibs txt"><button class="ib${L.wrap ? ' on' : ''}" data-act="set" data-p="wrap" data-v="${L.wrap ? 'nowrap' : 'wrap'}" title="Wrap onto new lines">Wrap</button></div>` : '<span></span>'}</div>
      ${auto ? `<div class="r2c" style="grid-template-columns:76px minmax(0,1fr)"><div class="m9">${[0, 1, 2].map((r) => [0, 1, 2].map((c) => cell(r, c)).join('')).join('')}</div>
        <div style="display:flex;flex-direction:column;gap:8px">${nf('gap', 'gap', 'Gap')}<div class="ibs txt"><button class="ib${L.justify === 'between' ? ' on' : ''}" data-act="set" data-p="justify" data-v="${L.justify === 'between' ? 'start' : 'between'}" title="Space items out evenly">Space between</button></div></div></div>` : ''}
      <div class="r2">${nf('padX', 'padH', 'Horizontal padding')}${nf('padY', 'padV', 'Vertical padding')}</div>`);
    h += sizeSec() + marginSec();
    return h;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act="align9"]');
    if (!a || !S.sel) return;
    const L = layoutVal(S.sel.el);
    commit({ ops: [...(L.dir === 'none' ? [{ prop: 'layout', value: 'col' }] : []), { prop: 'justify', value: a.dataset.j }, { prop: 'alignItems', value: a.dataset.i }] });
  });
  document.addEventListener('change', (e) => {
    const axis = e.target.dataset?.size;
    if (!axis || !S.sel) return;
    const v = e.target.value;
    const r = S.sel.el.getBoundingClientRect();
    commit({ ops: [{ prop: axis, value: v === 'fixed' ? Math.round(axis === 'w' ? r.width : r.height) : v === 'auto' ? null : v }] });
  });

  /* ---------- on-canvas handles: padding and size ---------- */
  function placeHandles() {
    const box = $('handles');
    const el = S.sel?.el;
    const show = S.mode === 'edit' && S.tool === 'select' && el && el.isConnected && !S.editing && !S.multi.length;
    box.hidden = !show;
    if (!show) return;
    const r = el.getBoundingClientRect(), c = cs(el);
    const pl = parseFloat(c.paddingLeft), pt = parseFloat(c.paddingTop);
    const set = (id, x, y) => { const h = $(id); h.style.transform = `translate(${x}px,${y}px) scale(${1 / S.z})`; };
    set('hPadL', r.left + Math.max(2, pl / 2) - 4, r.top + r.height / 2 - 8);
    set('hPadR', r.right - Math.max(2, pl / 2) - 4, r.top + r.height / 2 - 8);
    set('hPadT', r.left + r.width / 2 - 8, r.top + Math.max(2, pt / 2) - 4);
    set('hPadB', r.left + r.width / 2 - 8, r.bottom - Math.max(2, pt / 2) - 4);
    set('hW', r.right - 4, r.top + r.height / 2 - 4);
    set('hH', r.left + r.width / 2 - 4, r.bottom - 4);
    set('hWH', r.right - 4, r.bottom - 4);
    const pad = $('padShade');
    if (S.handleDrag?.kind === 'pad') {
      pad.hidden = false;
      pad.style.cssText = `transform:translate(${r.left}px,${r.top}px);width:${r.width}px;height:${r.height}px;border-style:solid;border-color:rgba(240,106,95,.28);border-width:${c.paddingTop} ${c.paddingRight} ${c.paddingBottom} ${c.paddingLeft}`;
    } else pad.hidden = true;
  }
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-handle]');
    if (!h || !S.sel) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    const k = h.dataset.handle, el = S.sel.el, r = el.getBoundingClientRect(), c = cs(el);
    S.handleDrag = { k, kind: k.startsWith('pad') ? 'pad' : 'size', x: e.clientX, y: e.clientY, padX: parseFloat(c.paddingLeft), padY: parseFloat(c.paddingTop), w: r.width, h: r.height, val: null };
  });
  document.addEventListener('pointermove', (e) => {
    const d = S.handleDrag;
    if (!d) return;
    const dx = (e.clientX - d.x) / S.z, dy = (e.clientY - d.y) / S.z;
    const el = S.sel.el;
    let prop, v;
    if (d.k === 'padL') { prop = 'padX'; v = d.padX + dx; } else if (d.k === 'padR') { prop = 'padX'; v = d.padX - dx; }
    else if (d.k === 'padT') { prop = 'padY'; v = d.padY + dy; } else if (d.k === 'padB') { prop = 'padY'; v = d.padY - dy; }
    else if (d.k === 'w') { prop = 'w'; v = d.w + dx; } else if (d.k === 'h') { prop = 'h'; v = d.h + dy; }
    const snap = (x) => Math.max(0, Math.round(x / (e.shiftKey ? 1 : 4)) * (e.shiftKey ? 1 : 4)); // 4px grid, Shift for 1px
    if (d.k === 'wh') {
      d.both = [snap(d.w + dx), snap(d.h + dy)];
      preview(el, 'w', d.both[0]); preview(el, 'h', d.both[1]);
      showLabel(e.clientX, e.clientY, `${d.both[0]} × ${d.both[1]}`);
      return;
    }
    v = snap(v);
    d.prop = prop; d.val = v;
    preview(el, prop, v);
    showLabel(e.clientX, e.clientY, `${{ padX: 'Padding X', padY: 'Padding Y', w: 'W', h: 'H' }[prop]} ${v}`);
  });
  document.addEventListener('pointerup', () => {
    const d = S.handleDrag;
    if (!d) return;
    S.handleDrag = null;
    $('dragLabel').hidden = true;
    if (d.both) commit({ ops: [{ prop: 'w', value: d.both[0] }, { prop: 'h', value: d.both[1] }] });
    else if (d.val != null) commit({ ops: [{ prop: d.prop, value: d.val }] });
  });
  function showLabel(x, y, text) {
    const l = $('dragLabel'), o = $('ov').getBoundingClientRect();
    l.hidden = false;
    l.textContent = text;
    l.style.transform = `translate(${(x - o.left) / S.z + 12 / S.z}px,${(y - o.top) / S.z + 12 / S.z}px) scale(${1 / S.z})`;
  }

  /* ---------- spacing measurements (hold Alt/Option) ---------- */
  function measureLines() {
    const g = $('measG');
    const a = S.sel?.el, b = S.hover;
    if (!S.alt || S.mode !== 'edit' || !a || !b || a === b || !a.isConnected || !b.isConnected) { g.innerHTML = ''; return; }
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const lines = [];
    const line = (x1, y1, x2, y2) => { const d = Math.round(Math.hypot(x2 - x1, y2 - y1)); if (d > 0) lines.push({ x1, y1, x2, y2, d }); };
    if (B.left <= A.left && B.right >= A.right && B.top <= A.top && B.bottom >= A.bottom) {
      const cx = A.left + A.width / 2, cy = A.top + A.height / 2;
      line(cx, B.top, cx, A.top); line(cx, A.bottom, cx, B.bottom); line(B.left, cy, A.left, cy); line(A.right, cy, B.right, cy);
    } else {
      const cy = (Math.max(A.top, B.top) + Math.min(A.bottom, B.bottom)) / 2, cx = (Math.max(A.left, B.left) + Math.min(A.right, B.right)) / 2;
      const yMid = Math.max(A.top, B.top) < Math.min(A.bottom, B.bottom) ? cy : A.top + A.height / 2;
      const xMid = Math.max(A.left, B.left) < Math.min(A.right, B.right) ? cx : A.left + A.width / 2;
      if (B.left >= A.right) line(A.right, yMid, B.left, yMid); else if (B.right <= A.left) line(B.right, yMid, A.left, yMid);
      if (B.top >= A.bottom) line(xMid, A.bottom, xMid, B.top); else if (B.bottom <= A.top) line(xMid, B.bottom, xMid, A.top);
    }
    g.innerHTML = lines.map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#F06A5F" stroke-width="1"/><rect x="${(l.x1 + l.x2) / 2 - 14}" y="${(l.y1 + l.y2) / 2 - 9}" width="28" height="16" rx="3" fill="#F06A5F"/><text x="${(l.x1 + l.x2) / 2}" y="${(l.y1 + l.y2) / 2 + 3}" fill="#fff" font-size="10" font-weight="600" text-anchor="middle" font-family="Geist,system-ui,sans-serif">${l.d}</text>`).join('');
  }
  const altKey = (e) => { if (e.key === 'Alt') { S.alt = e.type === 'keydown'; } };
  ['keydown', 'keyup'].forEach((t) => window.addEventListener(t, altKey, true));
  window.addEventListener('blur', () => (S.alt = false));

  /* ---------- multi-select (Shift-click) ---------- */
  function placeMulti() {
    const els = S.mode === 'edit' ? S.multi.map((m) => m.el).filter((x) => x.isConnected) : [];
    pool($('multi'), els.length, 'sel').forEach((b, i) => place(b, els[i] || null, els[i] ? labelOf(els[i]) : null));
  }
  const locOf = (m) => (m.use && (!m.def || m.el.getAttribute('data-kerf-n')) ? m.use : m.def || m.use);

  /* ---------- variant components ---------- */
  function activeVariant() {
    const c = S.sel?.defInfo?.cva;
    if (!c) return null;
    const out = {};
    for (const g of Object.keys(c.groups)) {
      const p = (S.sel.useInfo?.props || []).find((x) => x.name === g && x.value != null);
      out[g] = p ? p.value : c.defaults[g];
    }
    return out;
  }

  /* ---------- start ---------- */
  api('/theme').then((t) => { S.theme = t; renderPanel(); }).catch(() => {});
  api('/project').then((p) => { S.project = p; renderTop(); }).catch(() => {});
  api('/changes').then((c) => { S.count = c.length; renderBar(); }).catch(() => {});
  api('/chat').then((c) => { S.chat = (c.messages || []).map((m) => (m.role === 'kerf' && m.status === 'pending' ? { ...m, status: 'discarded' } : m)); S.notes = c.notes || []; renderAI(); }).catch(() => {});
  refreshVersions();
  renderAll();
  if (frame.contentDocument?.readyState === 'complete') bindApp();
  requestAnimationFrame(loop);
})();
