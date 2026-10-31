(() => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- rulers: the page is a canvas ---------- */
  const rx = $('rx'), ry = $('ry'), ryt = $('ryt');
  function rulers() {
    if (getComputedStyle(rx).display === 'none') return;
    rx.innerHTML = '';
    for (let x = 100; x < innerWidth; x += 100) { const s = document.createElement('span'); s.textContent = x; s.style.left = x + 'px'; rx.appendChild(s); }
  }
  let lastY = -1;
  function rulerY() {
    if (getComputedStyle(ry).display === 'none') return;
    const y = Math.round(scrollY);
    if (y === lastY) return; lastY = y;
    ryt.style.translate = `0 ${-(y % 50)}px`;
    ry.querySelectorAll('span').forEach((n) => n.remove());
    for (let v = Math.ceil(y / 100) * 100; v < y + innerHeight; v += 100) { const s = document.createElement('span'); s.textContent = v; s.style.top = v - y + 6 + 'px'; ry.appendChild(s); }
  }
  rulers(); rulerY();
  addEventListener('resize', rulers);
  addEventListener('scroll', () => requestAnimationFrame(rulerY), { passive: true });

  /* ---------- hero: the headline is a live, selected element ---------- */
  const STEPS = [[36, '4xl'], [48, '5xl'], [60, '6xl'], [72, '7xl'], [96, '8xl']];
  const MIN = 36, MAX = 96;
  const h1 = $('h1'), slider = $('slider'), knob = $('knob'), fill = $('fill'), toast = $('toast'), cursor = $('cursor'), stage = $('stage');
  let size = 60, saved = 60, toastT, dimsT;
  const stepOf = (v) => STEPS.reduce((a, b) => (Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a));
  const pct = (v) => (v - MIN) / (MAX - MIN);
  STEPS.forEach(([v, n]) => {
    const t = document.createElement('span'); t.className = 'tick'; t.style.left = pct(v) * 100 + '%'; slider.insertBefore(t, knob);
    const l = document.createElement('span'); l.className = 'lbl'; l.dataset.v = v; l.textContent = n; l.style.left = pct(v) * 100 + '%'; slider.appendChild(l);
  });
  const k = () => parseFloat(getComputedStyle(h1).getPropertyValue('--k')) || 1;
  function paint(v, snap) {
    const s = stepOf(v), shown = snap ? s[0] : Math.round(v);
    h1.style.setProperty('--fs', shown);
    $('sizeV').textContent = shown;
    $('stepV').textContent = snap || Math.abs(shown - s[0]) < 2 ? s[1] : 'custom';
    knob.style.left = fill.style.width = pct(shown) * 100 + '%';
    slider.setAttribute('aria-valuenow', shown);
    slider.querySelectorAll('.lbl').forEach((l) => l.classList.toggle('on', +l.dataset.v === s[0]));
    clearTimeout(dimsT);
    dimsT = setTimeout(() => { $('dims').textContent = `${Math.round(h1.getBoundingClientRect().width / k())} × ${shown}`; }, 580);
  }
  function note(msg, code, ms = 3200) { $('tMsg').textContent = msg; $('tCode').innerHTML = code; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), ms); }
  function save(v) {
    const from = stepOf(saved)[1], to = stepOf(v)[1];
    saved = stepOf(v)[0];
    if (from !== to) note(`Heading, size ${saved}`, `Saved to Hero.jsx · text-${from} → <em>text-${to}</em>`);
  }
  paint(60, true);
  let dragging = false, demo = true;
  const fromX = (x) => { const r = slider.getBoundingClientRect(); return MIN + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (MAX - MIN); };
  slider.addEventListener('pointerdown', (e) => { stopDemo(); dragging = true; slider.setPointerCapture(e.pointerId); size = fromX(e.clientX); paint(size); });
  slider.addEventListener('pointermove', (e) => { if (dragging) { size = fromX(e.clientX); paint(size); } });
  const release = () => { if (!dragging) return; dragging = false; size = stepOf(size)[0]; paint(size, true); save(size); };
  slider.addEventListener('pointerup', release); slider.addEventListener('pointercancel', release);
  slider.addEventListener('keydown', (e) => {
    const i = STEPS.findIndex(([v]) => v === stepOf(size)[0]);
    const j = ['ArrowRight', 'ArrowUp'].includes(e.key) ? Math.min(STEPS.length - 1, i + 1) : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? Math.max(0, i - 1) : -1;
    if (j < 0) return; e.preventDefault(); stopDemo(); size = STEPS[j][0]; paint(size, true); save(size);
  });
  $('undo').addEventListener('click', () => { stopDemo(); const was = stepOf(saved)[1]; size = saved = 60; paint(60, true); note('Undone', `Hero.jsx · text-${was} → <em>text-6xl</em>`, 2200); });
  const rel = (el, fx, fy) => { const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(); return [r.left - s.left + r.width * fx, r.top - s.top + r.height * fy]; };
  const move = (x, y) => { cursor.style.translate = `${x}px ${y}px`; };
  const onKnob = () => { const r = slider.getBoundingClientRect(), s = stage.getBoundingClientRect(); move(r.left - s.left + pct(size) * r.width - 3, r.top - s.top + 6); };
  function stopDemo() { demo = false; cursor.classList.remove('on'); }
  function glide(from, to, ms) {
    const t0 = performance.now();
    return new Promise((res) => { const f = (t) => { if (!demo) return res(); const x = Math.min(1, (t - t0) / ms), e = x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; size = from + (to - from) * e; paint(size); onKnob(); x < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
  }
  (async () => {
    if (still) return;
    await wait(1200);
    let rounds = 0;
    while (demo && rounds < 3) {
      if (getComputedStyle($('panel')).position !== 'absolute' || scrollY > 500) { await wait(3000); continue; }
      rounds++;
      move(...rel($('panel'), 0.2, 1.4)); cursor.classList.add('on'); await wait(700); if (!demo) break;
      onKnob(); await wait(800); if (!demo) break;
      await glide(60, 74, 1100); if (!demo) break;
      size = 72; paint(72, true); save(72); await wait(3400); if (!demo) break;
      move(...rel($('undo'), 0.4, 0.55)); await wait(900); if (!demo) break;
      const was = stepOf(saved)[1]; size = saved = 60; paint(60, true); note('Undone', `Hero.jsx · text-${was} → <em>text-6xl</em>`, 1600);
      await wait(1400); move(...rel($('panel'), 0.9, 1.6)); await wait(500); cursor.classList.remove('on'); await wait(4000);
    }
    cursor.classList.remove('on');
  })();

  /* ---------- the Tovi window: a scripted session on the Aster site ---------- */
  const tv = $('tv'), wrap = $('tvwrap');
  let S = 1;
  const fit = () => { S = wrap.clientWidth / 1240; wrap.style.setProperty('--S', S); };
  fit(); addEventListener('resize', fit);
  let seen = false;
  new IntersectionObserver((es) => es.forEach((e) => { seen = e.isIntersecting; }), { threshold: 0.25 }).observe(wrap);
  const R = (el) => { const r = el.getBoundingClientRect(), t = tv.getBoundingClientRect(); return { x: (r.left - t.left) / S, y: (r.top - t.top) / S, w: r.width / S, h: r.height / S }; };
  const cur = $('tvCur'), tov = $('tvTov');
  const go = (el, fx = 0.5, fy = 0.5, c = cur) => { const r = R(el); c.style.translate = `${r.x + r.w * fx - 4}px ${r.y + r.h * fy - 3}px`; };
  const press = async () => { cur.classList.add('press'); await wait(140); cur.classList.remove('press'); };
  const box = (el, b, pad = 0) => { const r = R(el); Object.assign(b.style, { left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.w + pad * 2 + 'px', height: r.h + pad * 2 + 'px' }); return r; };
  const panel = (n) => ['tvP0', 'tvP1', 'tvP2'].forEach((id, i) => { $(id).style.opacity = i === n ? 1 : 0; });
  const chat = $('tvChat');
  function add(html, cls) { const d = document.createElement('div'); d.className = 'tv-msg ' + cls; d.innerHTML = html; chat.appendChild(d); requestAnimationFrame(() => d.classList.add('on')); return d; }
  async function type(el, text, ms = 32) { el.innerHTML = '<span class="car"></span>'; const car = el.firstChild; for (const ch of text) { car.before(ch); await wait(ms + Math.random() * 25); } }
  const tvToast = $('tvToast');
  const aH1 = $('aH1'), grid = $('aGrid'), sel = $('tvSel'), hov = $('tvHov'), aster = tv.querySelector('.aster');
  let follow = null;
  const track = (el, ms) => { const t0 = performance.now(); cancelAnimationFrame(follow); const f = (t) => { const r = box(el, sel, 3); $('tvSelD').textContent = `${Math.round(r.w / 0.62109)} × ${Math.round(r.h / 0.62109)}`; if (t - t0 < ms) follow = requestAnimationFrame(f); }; follow = requestAnimationFrame(f); };
  async function until() { while (!seen || document.hidden) await wait(300); }
  function reset() {
    [...chat.querySelectorAll('.tv-msg')].forEach((m) => m.remove());
    $('tvEmpty').style.opacity = 1; $('tvChip').textContent = 'Whole screen'; $('tvInput').innerHTML = ''; $('tvSend').classList.remove('go');
    aH1.style.fontSize = ''; grid.classList.remove('premium'); aster.style.translate = '';
    $('tvSizeV').textContent = '72'; $('tvStep').textContent = '7xl'; $('tvSize').classList.remove('hot'); $('tvRad').firstChild.textContent = '14'; $('tvRadS').textContent = 'xl'; $('tvFill').textContent = '11131A';
    $('tvN').textContent = '0'; sel.classList.remove('on'); hov.classList.remove('on'); panel(0);
    [0, 1, 2, 3].forEach((i) => $('pk' + i).classList.remove('on')); tov.classList.remove('on'); $('tvPR').classList.remove('on'); tvToast.classList.remove('on');
  }
  function finalState() {
    aH1.style.fontSize = '96px'; grid.classList.add('premium'); $('tvN').textContent = '5'; panel(1); $('tvSizeV').textContent = '96'; $('tvStep').textContent = '8xl';
  }
  async function scene() {
    reset();
    cur.style.translate = '640px 520px'; cur.classList.add('on');
    await until(); await wait(900);
    // 1. Select the headline.
    go(aH1, 0.35, 0.45); await wait(800);
    box(aH1, hov, 3); hov.classList.add('on'); await wait(350);
    await press(); hov.classList.remove('on');
    $('tvSelT').textContent = 'Title “Nights under the…”'; track(aH1, 50); sel.classList.add('on'); panel(1); $('tvChip').textContent = 'Title “Nights under the…”';
    await wait(1100); await until();
    // 2. Drag its size from 72 to 96 in the panel; it snaps to the scale and is saved to the code.
    go($('tvSize'), 0.35, 0.5); await wait(850); await press(); $('tvSize').classList.add('hot');
    for (const v of [74, 78, 83, 88, 92, 95, 96]) { $('tvSizeV').textContent = v; await wait(70); }
    $('tvStep').textContent = '8xl'; aH1.style.fontSize = '96px'; track(aH1, 950);
    await wait(500); $('tvSize').classList.remove('hot');
    $('tvTM').textContent = 'Title, size 96'; $('tvTC').innerHTML = 'Saved to Hero.jsx · text-7xl → <em>text-8xl</em>'; tvToast.classList.add('on'); $('tvN').textContent = '1';
    await wait(2300); tvToast.classList.remove('on'); await until();
    // 3. Scroll down to the cards, then select one: Tovi knows the four look alike.
    sel.classList.remove('on'); aster.style.translate = '0 -96px'; await wait(1000);
    const card = grid.children[0];
    go(card, 0.5, 0.82); await wait(850); await press();
    $('tvSelT').textContent = 'Card “Lofoten”'; track(card, 50); panel(2); $('tvChip').textContent = 'Card “Lofoten” · 4 look alike';
    await wait(900);
    // 4. Ask Tovi.
    go($('tvInput'), 0.3, 0.5); await wait(850); await press();
    await type($('tvInput'), 'Make these cards feel more premium');
    $('tvSend').classList.add('go'); await wait(300); go($('tvSend')); await wait(700); await press();
    $('tvEmpty').style.opacity = 0; $('tvInput').innerHTML = ''; $('tvSend').classList.remove('go');
    add('Make these cards feel more premium', 'tv-you');
    const st = add('<span class="tv-av"></span><span class="tv-shim">Looking at 4 cards · Thinking</span>', 'tv-status');
    sel.classList.remove('on');
    cur.style.translate = '640px 690px';
    await wait(600);
    [...grid.children].forEach((c, i) => { box(c, $('pk' + i), 4); setTimeout(() => $('pk' + i).classList.add('on'), i * 110); });
    tov.classList.add('on'); go(grid.children[0], 0.6, 0.35, tov); await wait(900);
    go(grid.children[2], 0.5, 0.45, tov); await wait(900);
    st.querySelector('.tv-shim').textContent = 'Changing 4 cards';
    grid.classList.add('premium');
    $('tvRad').firstChild.textContent = '22'; $('tvRadS').textContent = '2xl'; $('tvFill').textContent = '151824';
    const t0 = performance.now(); const f = (t) => { [...grid.children].forEach((c, i) => box(c, $('pk' + i), 4)); if (t - t0 < 1300) requestAnimationFrame(f); }; requestAnimationFrame(f);
    go(grid.children[3], 0.4, 0.5, tov); await wait(1100);
    st.remove(); tov.classList.remove('on');
    add('I gave the cards more room, softer corners and your display font for the titles.<div class="tv-card"><span class="ok"><svg width="8" height="8" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#0B2A18" stroke-width="2.6" stroke-linecap="round"/></svg></span>Applied to 4 cards<span class="u">Undo</span></div>', 'tv-reply');
    $('tvN').textContent = '5';
    await wait(800); [0, 1, 2, 3].forEach((i) => $('pk' + i).classList.remove('on'));
    await wait(1600); await until();
    // 5. Hand off.
    go($('tvHand'), 0.4, 0.5); await wait(900); await press();
    $('tvPR').classList.add('on');
    await wait(3600);
    cur.classList.remove('on'); $('tvPR').classList.remove('on');
    await wait(700);
  }
  (async () => {
    if (still) { finalState(); return; }
    await wait(600);
    for (;;) { await scene(); }
  })();

  /* ---------- the AI band: a chat box that types itself ---------- */
  const ctxt = $('ctxt');
  const lines = ['Make the cards feel more premium', 'Tighten the spacing in the footer', 'Give this heading more contrast', 'Use our display font for every title'];
  let aiSeen = false;
  new IntersectionObserver((es) => es.forEach((e) => { aiSeen = e.isIntersecting; }), { threshold: 0.3 }).observe($('ai'));
  (async () => {
    if (still) { ctxt.textContent = lines[0]; return; }
    for (let i = 0; ; i = (i + 1) % lines.length) {
      while (!aiSeen) await wait(400);
      ctxt.innerHTML = '<span class="car"></span>';
      const car = ctxt.firstChild;
      for (const ch of lines[i]) { car.before(ch); await wait(40 + Math.random() * 35); }
      await wait(2200);
      while (car.previousSibling) { car.previousSibling.remove(); await wait(14); }
      await wait(300);
    }
  })();

  // No sign-up service is connected yet: the form only confirms on the page.
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('thanks').textContent = "Thanks. You're on the list."; e.target.reset(); });
})();
