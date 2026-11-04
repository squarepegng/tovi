(() => {
  const $ = (id) => document.getElementById(id);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* nav hairline + top ruler (the page is a canvas) */
  const nav = $('nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });
  const ruler = $('ruler');
  const drawRuler = () => { ruler.innerHTML = ''; for (let x = 100; x < innerWidth; x += 100) { const s = document.createElement('span'); s.textContent = x; s.style.left = x + 'px'; ruler.appendChild(s); } };
  drawRuler();

  /* Scale-to-fit for designs drawn at a fixed size (the hero editor). The foot fades out: the window runs off the page. */
  const fits = [...document.querySelectorAll('.fit')];
  function fit() {
    fits.forEach((f) => {
      const w = +f.dataset.w, h = +f.dataset.h, k = f.clientWidth / w, b = f.firstElementChild;
      b.style.transform = `scale(${k})`;
      f.style.height = Math.round(h * k * 0.94) + 'px';
      f.style.overflow = 'hidden';
      f.style.webkitMaskImage = f.style.maskImage = 'linear-gradient(180deg,#000 86%,transparent)';
    });
  }
  fit();
  addEventListener('resize', () => { fit(); drawRuler(); });

  /* A scene plays only while it's on screen; its clock pauses when it scrolls away. */
  function scene(root, play, poster) {
    let vis = false, wake = null;
    new IntersectionObserver((es) => { vis = es[0].isIntersecting; if (vis && wake) { wake(); wake = null; } }, { threshold: 0.2 }).observe(root);
    const scale = () => root.getBoundingClientRect().width / root.offsetWidth || 1;
    const A = {
      async wait(ms) {
        const end = performance.now() + ms;
        for (;;) {
          if (!vis) await new Promise((r) => (wake = r));
          const left = end - performance.now();
          if (left <= 0) return;
          await sleep(Math.min(left, 120));
        }
      },
      // Where an element sits, in the scene's own (unscaled) pixels.
      box(el) { const r = el.getBoundingClientRect(), o = root.getBoundingClientRect(), k = scale(); return { x: (r.left - o.left) / k, y: (r.top - o.top) / k, w: r.width / k, h: r.height / k }; },
      to(cur, t, fx = 0.5, fy = 0.5) { const p = Array.isArray(t) ? { x: t[0], y: t[1], w: 0, h: 0 } : A.box(t); cur.style.transform = `translate(${p.x + p.w * fx - 4}px,${p.y + p.h * fy - 3}px)`; },
      async move(cur, t, fx, fy, ms = 800) { A.to(cur, t, fx, fy); await A.wait(ms); },
      async click(cur) { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); await A.wait(260); },
      async type(el, text, speed = 42) { for (let i = 1; i <= text.length; i++) { el.innerHTML = text.slice(0, i) + '<span class="caret"></span>'; await A.wait(speed + (text[i - 1] === ' ' ? 30 : 0)); } },
      async count(el, from, to, ms = 700) { const n = Math.max(1, Math.abs(to - from)), step = ms / n; for (let v = from; v !== to; v += Math.sign(to - from)) { el.textContent = v; await A.wait(step); } el.textContent = to; },
      flash(el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); },
      box2: null,
    };
    if (still) { poster && poster(A); return; }
    (async () => { await A.wait(400); for (;;) await play(A); })();
  }
  const fade = async (A, el, f) => { el.style.transition = 'opacity .35s cubic-bezier(.2,0,0,1)'; el.style.opacity = 0; await A.wait(380); f(); el.style.opacity = 1; await A.wait(380); };

  /* ---------- Hero: you select the title, ask Tovi, Tovi edits, you hand off ---------- */
  {
    const ed = $('ed'), cur = $('hCur'), tov = $('hTovi'), sel = $('hSel'), selT = $('hSelT');
    const h1 = $('aH1'), eye = $('aEye'), btn = $('aBtn'), btn2 = $('aBtn2'), cards = [...ed.querySelectorAll('.a-card')];
    const chat = $('hChat'), empty = $('hEmpty'), comp = $('hComp'), chip = $('hChip'), inp = $('hInp'), send = $('hSend');
    const P0 = $('hP0'), P1 = $('hP1'), szV = $('hSzV'), lsV = $('hLsV'), radV = $('hRadV'), hoff = $('hHoff'), hN = $('hN'), toast = $('hToast');
    let A0;
    const selOn = (A, el, label, pink) => { const b = A.box(el); Object.assign(sel.style, { left: b.x - 3 + 'px', top: b.y - 3 + 'px', width: b.w + 6 + 'px', height: b.h + 6 + 'px' }); selT.textContent = label; sel.classList.toggle('pk', !!pink); sel.classList.add('on'); };
    function reset() {
      sel.classList.remove('on', 'pk'); P0.style.opacity = 1; P1.style.opacity = 0;
      chat.querySelectorAll('.uMsg,.kMsg').forEach((n) => n.remove()); empty.style.display = ''; empty.style.opacity = 1;
      chip.textContent = 'Whole screen'; inp.className = 'inp ph'; inp.textContent = 'Describe a change…'; send.classList.remove('on'); comp.classList.remove('busy');
      h1.style.fontSize = ''; h1.style.letterSpacing = ''; h1.style.maxWidth = ''; eye.style.color = ''; btn.style.borderRadius = ''; btn.style.background = ''; btn2.style.borderRadius = ''; cards.forEach((c) => (c.style.borderRadius = ''));
      szV.textContent = 72; lsV.textContent = 0; radV.textContent = 0; hN.textContent = 0; toast.classList.remove('on'); tov.style.opacity = 0;
    }
    function edited() { h1.style.fontSize = '92px'; h1.style.letterSpacing = '-0.02em'; h1.style.maxWidth = '760px'; eye.style.color = '#FCBDDD'; btn.style.borderRadius = '99px'; btn.style.background = '#FCBDDD'; btn2.style.borderRadius = '99px'; cards.forEach((c) => (c.style.borderRadius = '18px')); szV.textContent = 92; lsV.textContent = -2; radV.textContent = 18; }
    function kMsg(html) { const m = document.createElement('div'); m.className = 'kMsg'; m.innerHTML = html; chat.appendChild(m); return m; }
    scene(ed, async (A) => {
      reset();
      A.to(cur, [930, 600]); await A.wait(500);
      // 1. Select the title
      await A.move(cur, h1, 0.32, 0.5, 900);
      await A.click(cur);
      selOn(A, h1, 'Title'); P0.style.opacity = 0; P1.style.opacity = 1; chip.textContent = 'Title “Nights under…”';
      await A.wait(700);
      // 2. Ask Tovi
      await A.move(cur, inp, 0.3, 0.5, 850);
      await A.click(cur);
      inp.className = 'inp'; await A.type(inp, 'Make the hero feel more editorial');
      send.classList.add('on'); await A.move(cur, send, 0.5, 0.5, 450); await A.click(cur);
      empty.style.display = 'none';
      const u = document.createElement('div'); u.className = 'uMsg'; u.textContent = 'Make the hero feel more editorial'; chat.appendChild(u);
      inp.className = 'inp ph'; inp.textContent = 'Describe a change…'; send.classList.remove('on'); comp.classList.add('busy');
      const k = kMsg('<div class="stepL"><div>Reading the hero</div><div>Choosing type from your system</div><div>Checking contrast</div></div>');
      const st = [...k.querySelectorAll('.stepL div')];
      st[0].className = 'run'; await A.wait(800); st[0].className = 'ok'; st[1].className = 'run';
      // 3. Tovi edits, live, on the page
      A.to(tov, h1, 0.95, 0.15); tov.style.opacity = 1; await A.wait(800);
      selOn(A, h1, 'Tovi · editing', true);
      h1.style.fontSize = '92px'; h1.style.letterSpacing = '-0.02em'; h1.style.maxWidth = '760px';
      A.flash($('hSz')); A.count(szV, 72, 92, 800); A.flash($('hLs')); A.count(lsV, 0, -2, 500);
      await A.wait(900); selOn(A, h1, 'Tovi · editing', true); eye.style.color = '#FCBDDD';
      st[1].className = 'ok'; st[2].className = 'run';
      await A.move(tov, btn, 0.85, 0.3, 700);
      selOn(A, btn.parentNode, 'Buttons', true); btn.style.borderRadius = '99px'; btn.style.background = '#FCBDDD'; btn2.style.borderRadius = '99px';
      await A.wait(800);
      await A.move(tov, cards[1], 0.6, 0.2, 700);
      selOn(A, cards[0].parentNode, '4 cards', true); cards.forEach((c, i) => setTimeout(() => (c.style.borderRadius = '18px'), i * 90)); A.flash($('hRad')); A.count(radV, 0, 18, 600);
      await A.wait(900);
      st[2].className = 'ok'; comp.classList.remove('busy'); tov.style.opacity = 0; sel.classList.remove('on');
      kMsg('<span>A larger, tighter title, softer buttons and rounder cards, all from your design system.</span><div class="applied"><i>✓</i>Applied 3 changes<u>Undo</u></div>');
      hN.textContent = 3; hoff.classList.add('bump'); setTimeout(() => hoff.classList.remove('bump'), 200);
      await A.wait(1300);
      // 4. Hand off
      await A.move(cur, hoff, 0.4, 0.5, 900); await A.click(cur);
      hN.textContent = 0; toast.classList.add('on');
      await A.wait(2600);
      // The next take starts from the original page.
      await A.move(cur, [930, 600], 0, 0, 500);
      await fade(A, ed.querySelector('.canvasE'), reset);
    }, (A) => { edited(); P0.style.opacity = 0; P1.style.opacity = 1; empty.style.display = 'none'; kMsg('<div class="applied"><i>✓</i>Applied 3 changes<u>Undo</u></div>'); toast.classList.add('on'); cur.style.opacity = 0; });
  }

  /* ---------- 1. Edit by hand: scrub a field's icon, the card follows on the canvas ---------- */
  {
    const root = $('f1'), cur = $('f1cur'), card = $('f1c'), img = $('f1i'), sel = $('f1s');
    const rv = $('f1rv'), pv = $('f1pv'), fs = $('f1fs'), fv = $('f1fv'), sws = [...$('f1sw').children];
    const FILLS = [['surface', '#14161C'], ['surface-2', '#2A2F3A'], ['primary', '#1E5C43'], ['accent', '#5B3A7A']];
    const st = { r: 4, p: 0, f: 0 };
    const place = () => { const r = card.getBoundingClientRect(), o = root.getBoundingClientRect(); Object.assign(sel.style, { left: r.left - o.left - 3 + 'px', top: r.top - o.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' }); };
    function draw() {
      card.style.borderRadius = st.r + 'px'; card.style.padding = st.p + 'px'; card.style.background = FILLS[st.f][1];
      img.style.borderRadius = st.p ? Math.max(4, st.r - st.p) + 'px' : '0';
      rv.textContent = st.r; pv.textContent = st.p; fs.style.background = FILLS[st.f][1]; fv.textContent = FILLS[st.f][0];
      sws.forEach((x, i) => x.classList.toggle('on', i === st.f));
      requestAnimationFrame(place); setTimeout(place, 480);
    }
    draw(); addEventListener('resize', place);
    const drag = async (A, field, key, to) => {
      const k = field.querySelector('.k'); await A.move(cur, k, 0.5, 0.6, 750);
      field.classList.add('flash');
      const steps = key === 'r' ? [4, 8, 12, 16, 24] : [0, 4, 8, 12];
      let i = steps.indexOf(st[key]); const dir = Math.sign(steps.indexOf(to) - i); const b = A.box(k); let x = b.x + b.w / 2;
      cur.style.transition = 'transform .24s linear';
      while (steps[i] !== to) { i += dir; x += 18 * dir; A.to(cur, [x, b.y + b.h * 0.6], 0, 0); st[key] = steps[i]; draw(); await A.wait(260); }
      cur.style.transition = ''; field.classList.remove('flash'); await A.wait(450);
    };
    let round = 0;
    scene(root, async (A) => {
      const big = round++ % 2 === 0;
      A.to(cur, [120, 300]); await A.wait(300);
      await drag(A, $('f1r'), 'r', big ? 24 : 4);
      await drag(A, $('f1p'), 'p', big ? 12 : 0);
      const f = big ? 2 : 0;
      await A.move(cur, sws[f], 0.5, 0.5, 700); await A.click(cur); st.f = f; draw();
      await A.wait(2400);
    }, () => { st.r = 24; st.p = 12; st.f = 2; draw(); cur.style.opacity = 0; });
  }

  /* ---------- 2. UX audit: a sweep, notes pinned to what's off, one note at a time ---------- */
  {
    const root = $('f2'), sw = $('f2sw'), tags = [...root.querySelectorAll('.tagM')], note = $('f2n');
    const N = [['Heading wraps unevenly', 'Hierarchy'], ['Caption is too faint to read', 'Contrast'], ['Button is small on phones', 'Usability']];
    const show = (i) => { tags.forEach((t) => t.classList.toggle('hl', +t.dataset.i === i)); $('f2e').textContent = i; $('f2t').textContent = N[i - 1][0]; $('f2c').textContent = N[i - 1][1]; const d = note.children[1]; d.classList.remove('sw2'); void d.offsetWidth; d.classList.add('sw2'); };
    scene(root, async (A) => {
      tags.forEach((t) => t.classList.remove('on', 'hl')); note.classList.remove('on');
      await A.wait(500);
      sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go');
      await A.wait(1100);
      for (const t of tags) { t.classList.add('on'); await A.wait(240); }
      await A.wait(300); show(1); note.classList.add('on');
      for (const i of [1, 2, 3]) { show(i); await A.wait(1500); }
      await A.wait(500);
    }, () => { tags.forEach((t) => t.classList.add('on')); show(2); note.classList.add('on'); });
  }

  /* ---------- 3. AI improvements: the same buttons, your system, then an exploration ---------- */
  {
    const root = $('f3'), cv = root.querySelector('.n3cv'), st = $('f3s'), sl = $('f3sl'), comp = $('f3c'), txt = $('f3t');
    const ask = async (A, q, label, cls) => {
      txt.textContent = ''; await A.type(txt, q, 40); await A.wait(350);
      txt.textContent = ''; comp.classList.add('busy'); sl.textContent = label; st.classList.remove('done'); st.classList.add('on');
      await A.wait(1300);
      cv.className = 'n3cv ' + cls; st.classList.add('done'); comp.classList.remove('busy');
      await A.wait(900); st.classList.remove('on');
    };
    scene(root, async (A) => {
      cv.className = 'n3cv'; await A.wait(600);
      await ask(A, 'Make these feel softer', 'Using your design system', 'sys');
      await A.wait(2200);
      await ask(A, 'Try a bolder direction', 'Exploring a new direction', 'ex');
      await A.wait(2400);
      await fade(A, cv, () => (cv.className = 'n3cv'));
    }, () => { cv.className = 'n3cv sys'; });
  }

  /* ---------- 4. Notes: two marks, two tasks, Apply ---------- */
  {
    const root = $('f4'), cur = $('f4cur'), cv = $('f4pg'), tagsEl = $('f4tags'), tk = $('f4tk'), ty = $('f4ty');
    let notes = [];
    const spots = () => { const c = [...cv.children]; const b = (el, fx, fy) => { const r = el.getBoundingClientRect(), o = root.getBoundingClientRect(); return { x: r.left - o.left + r.width * fx, y: r.top - o.top + r.height * fy }; }; return [{ ...b(c[0], 0.8, 0.12), t: 'Round these corners' }, { ...b(c[1], 0.62, 0.42), t: 'Titles feel small' }]; };
    const draw = (done) => {
      tagsEl.innerHTML = notes.map((n, i) => `<div class="nT${done ? ' done' : ''}" style="left:${n.x - 3}px;top:${n.y - 16}px"><i></i><b>${done ? '✓' : i + 1}</b></div>`).join('');
      tk.innerHTML = notes.map((n, i) => `<div class="tk${done ? ' done' : ''}"><em>${i + 1}</em>${n.t}</div>`).join('') + `<div class="ft"><span>${done ? 'All fixed' : notes.length + ' task' + (notes.length === 1 ? '' : 's')}</span>${done ? '' : '<span class="pinkB" id="f4ap">Apply</span>'}</div>`;
      tk.style.display = notes.length ? '' : 'none';
    };
    scene(root, async (A) => {
      notes = []; cv.classList.remove('fixed'); draw(false);
      A.to(cur, [60, 240]); await A.wait(500);
      for (const s of spots()) {
        await A.move(cur, [s.x, s.y], 0, 0, 800); await A.click(cur);
        notes.push({ ...s, t: '' }); draw(false);
        Object.assign(ty.style, { left: Math.min(s.x + 14, root.offsetWidth - 190) + 'px', top: s.y + 14 + 'px' }); ty.textContent = ''; ty.classList.add('on');
        await A.type(ty, s.t, 42); await A.wait(300); ty.classList.remove('on');
        notes[notes.length - 1].t = s.t; draw(false); await A.wait(400);
      }
      await A.move(cur, $('f4ap'), 0.5, 0.5, 800); await A.click(cur);
      draw(true); cv.classList.add('fixed');
      await A.wait(2600);
      await A.move(cur, [60, 240], 0, 0, 500);
      await fade(A, cv, () => { notes = []; cv.classList.remove('fixed'); draw(false); });
    }, () => { notes = spots(); cv.classList.add('fixed'); draw(true); cur.style.opacity = 0; });
  }

  /* ---------- 5. Design system: one token changes, every place that uses it follows ---------- */
  {
    const root = $('f5'), sp = [...$('f5sp').children];
    const C = [['#1E8F5E', '#84F0BA'], ['#C2508A', '#FCBDDD'], ['#2B66D9', '#9DBBF5'], ['#B4651E', '#F5B26B']];
    const apply = (c) => { sp[0].style.background = c[0]; sp[1].style.background = c[1]; [['f5e', (e) => (e.style.color = c[1])], ['f5b', (e) => (e.style.background = c[1])], ['f5l', (e) => (e.style.color = c[1])]].forEach(([id, f], i) => setTimeout(() => f($(id)), 200 + i * 160)); };
    apply(C[0]); let i = 0;
    scene(root, async (A) => { await A.wait(2000); i = (i + 1) % C.length; apply(C[i]); await A.wait(700); }, () => apply(C[1]));
  }

  /* ---------- 6. GitHub: the repository connects ---------- */
  {
    const root = $('f6'), ok = $('f6k'), t = $('f6t');
    scene(root, async (A) => {
      ok.classList.remove('on'); t.textContent = 'Connecting…'; await A.wait(1600);
      t.textContent = 'acme/aster · main'; ok.classList.add('on'); await A.wait(1400);
      t.textContent = 'React and Tailwind found'; await A.wait(1500);
      t.textContent = 'Ready to edit'; await A.wait(2200);
    }, () => { ok.classList.add('on'); t.textContent = 'acme/aster · main'; });
  }

  /* ---------- 7. Hand off: the pull request builds itself ---------- */
  {
    const root = $('f7'), cur = $('f7cur'), b = $('f7b'), card = $('f7c'), s = $('f7s'), ck = [...$('f7k').children];
    const n = b.querySelector('.n');
    scene(root, async (A) => {
      card.classList.remove('on'); s.textContent = 'Draft'; s.classList.remove('open'); ck.forEach((c) => c.classList.remove('ok')); n.textContent = 3;
      A.to(cur, [150, 250]); await A.wait(600);
      await A.move(cur, b, 0.4, 0.55, 800); await A.click(cur);
      n.textContent = 0; card.classList.add('on'); await A.wait(500);
      for (const c of ck) { await A.wait(520); c.classList.add('ok'); }
      await A.wait(300); s.textContent = 'Open'; s.classList.add('open');
      await A.move(cur, [150, 250], 0, 0, 600);
      await A.wait(2400);
    }, () => { card.classList.add('on'); ck.forEach((c) => c.classList.add('ok')); s.textContent = 'Open'; s.classList.add('open'); cur.style.opacity = 0; });
  }

  /* ---------- 8. Code: each visual change, then its exact diff ---------- */
  {
    const CH = [
      { t: 'Hero title', s: 'Size 72 → 92', f: 'src/sections/Hero.jsx', n: '1 line', d: [['c', '<div className="relative z-10 px-10 pb-16">'], ['m', '-  <h1 className="font-display text-7xl text-content">'], ['p', '+  <h1 className="font-display text-[92px] tracking-tight text-content">'], ['c', '     Nights under the northern sky'], ['c', '   </h1>']] },
      { t: 'Place cards', s: 'Corners 6 → 18, all 4', f: 'src/components/PlaceCard.jsx', n: '1 line', d: [['c', 'export function PlaceCard({ place }) {'], ['c', '  return ('], ['m', '-    <article className="rounded-md bg-surface">'], ['p', '+    <article className="rounded-[18px] bg-surface">'], ['c', '      <img src={place.image} alt={place.name} />']] },
      { t: 'Buttons', s: 'Corners 8 → full', f: 'src/components/Button.jsx', n: '2 lines', d: [['c', 'const base ='], ['m', '-  "inline-flex items-center rounded-lg px-6 py-3"'], ['p', '+  "inline-flex items-center rounded-full px-6 py-3"'], ['c', 'const variants = {'], ['m', '-  solid: "bg-primary text-primary-fg",'], ['p', '+  solid: "bg-accent text-accent-fg",']] },
    ];
    const list = $('f8l'), h = $('f8h'), d = $('f8d');
    list.innerHTML = CH.map((c) => `<div><b>${c.t}</b><small>${c.s}</small></div>`).join('');
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const show = (i) => { [...list.children].forEach((x, j) => x.classList.toggle('on', i === j)); h.innerHTML = `${CH[i].f}<span>${CH[i].n} changed</span>`; d.classList.remove('swap'); void d.offsetWidth; d.classList.add('swap'); d.innerHTML = CH[i].d.map(([k, l]) => `<div class="${k}">${esc(l)}</div>`).join(''); };
    show(0); let i = 0;
    scene($('f8'), async (A) => { await A.wait(2600); i = (i + 1) % CH.length; show(i); }, () => show(0));
  }

  /* ---------- 9. History: the selection walks back through versions, Restore shows on the chosen one ---------- */
  {
    const rows = [...$('f9l').children];
    rows.forEach((r) => r.insertAdjacentHTML('beforeend', '<span class="rs">Restore</span>'));
    const pick = (i) => rows.forEach((r, j) => r.classList.toggle('on', i === j));
    pick(0); let i = 0, d = 1;
    scene($('f9'), async (A) => { await A.wait(1500); i += d; if (i === rows.length - 1 || i === 0) d = -d; pick(i); }, () => pick(1));
  }

  /* invite form: no sign-up service is connected yet, so it only confirms on the page */
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('thanks').textContent = "Thanks. You're on the list."; e.target.reset(); });
})();
