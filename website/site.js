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

  /* ---------- 1. Edit by hand: drag a field's icon, the card follows, the code updates ---------- */
  {
    const root = $('f1'), cur = $('f1cur'), card = $('f1c'), img = $('f1i'), sel = $('f1s'), code = $('f1code');
    const rv = $('f1rv'), pv = $('f1pv'), fs = $('f1fs'), fv = $('f1fv'), sws = [...$('f1sw').children];
    const R = { 0: 'rounded-none', 4: 'rounded', 8: 'rounded-lg', 12: 'rounded-xl', 16: 'rounded-2xl', 24: 'rounded-3xl' };
    const FILLS = [['surface', '#14161C'], ['surface-2', '#2A2F3A'], ['primary', '#1E5C43'], ['accent', '#5B3A7A']];
    const st = { r: 0, p: 0, f: 0, hl: '' };
    const place = () => { const b = (el) => { const r = el.getBoundingClientRect(), o = root.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; }; const c = b(card); Object.assign(sel.style, { left: c.x - 2 + 'px', top: c.y - 2 + 'px', width: c.w + 4 + 'px', height: c.h + 4 + 'px' }); };
    function draw() {
      card.style.borderRadius = st.r + 'px'; card.style.padding = st.p + 'px'; card.style.background = FILLS[st.f][1];
      img.style.borderRadius = st.p ? Math.max(0, st.r - st.p) + 'px' : '0';
      rv.textContent = st.r; pv.textContent = st.p; fs.style.background = FILLS[st.f][1]; fv.textContent = FILLS[st.f][0];
      const h = (k, s) => (st.hl === k ? `<span class="hl">${s}</span>` : s);
      code.innerHTML = `&lt;<span class="k">article</span> className=<span class="s">"${h('r', R[st.r])} ${h('p', st.p ? 'p-' + st.p / 4 : 'p-0')} ${h('f', 'bg-' + FILLS[st.f][0])}"</span>&gt;`;
      requestAnimationFrame(place); setTimeout(place, 520);
    }
    draw(); addEventListener('resize', place);
    const drag = async (A, field, key, to) => {
      const k = field.querySelector('.k'); await A.move(cur, k, 0.5, 0.5, 700);
      const steps = key === 'r' ? [0, 4, 8, 12, 16, 24] : [0, 4, 8, 12];
      let i = steps.indexOf(st[key]); const dir = Math.sign(steps.indexOf(to) - i); let x = A.box(k).x + 8, y = A.box(k).y + 8;
      cur.style.transition = 'transform .22s linear';
      while (steps[i] !== to) { i += dir; x += 16 * dir; A.to(cur, [x, y], 0, 0); st[key] = steps[i]; st.hl = key; draw(); await A.wait(240); }
      cur.style.transition = ''; await A.wait(500);
    };
    let round = 0;
    scene(root, async (A) => {
      const big = round++ % 2 === 0;
      await drag(A, $('f1r'), 'r', big ? 24 : 4);
      await drag(A, $('f1p'), 'p', big ? 12 : 0);
      const f = big ? 2 : (round % 4 === 0 ? 3 : 0);
      await A.move(cur, sws[f], 0.5, 0.5, 700); await A.click(cur); st.f = f; st.hl = 'f'; draw();
      await A.wait(2200);
    }, () => { st.r = 24; st.p = 12; st.f = 2; st.hl = 'f'; draw(); cur.style.opacity = 0; });
  }

  /* ---------- 2. UX audit: a sweep, notes pinned to what's off, the list ---------- */
  {
    const root = $('f2'), sw = $('f2sw'), list = $('f2l'), tags = [...root.querySelectorAll('.tagM')], rows = [...list.children];
    const show = (i) => { tags.forEach((t) => t.classList.toggle('hl', +t.dataset.i === i)); rows.forEach((r) => r.classList.toggle('hl', +r.dataset.i === i)); };
    scene(root, async (A) => {
      tags.forEach((t) => t.classList.remove('on')); list.classList.remove('on'); show(0);
      await A.wait(500);
      sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go');
      await A.wait(1100);
      for (const t of tags) { t.classList.add('on'); await A.wait(260); }
      await A.wait(300); list.classList.add('on'); await A.wait(700);
      for (const i of [1, 2, 3]) { show(i); await A.wait(1100); }
      show(0); await A.wait(1200);
    }, () => { tags.forEach((t) => t.classList.add('on')); list.classList.add('on'); });
  }

  /* ---------- 3. AI improvements: same card, your system, then an exploration ---------- */
  {
    const root = $('f3'), plan = $('f3p'), go = $('f3g'), mode = $('f3m'), steps = $('f3s'), comp = $('f3c'), txt = $('f3t');
    const ask = async (A, q, m, cls, b, s) => {
      txt.textContent = ''; await A.type(txt, q, 38); await A.wait(300);
      txt.textContent = ''; comp.classList.add('busy'); mode.textContent = m;
      const rows = [...steps.children]; rows.forEach((r, i) => { r.textContent = s[i]; r.className = ''; }); steps.classList.add('on');
      for (const r of rows) { r.className = 'run'; await A.wait(520); r.className = 'ok'; }
      plan.className = 'plan ' + cls; go.textContent = b; comp.classList.remove('busy');
      await A.wait(500); steps.classList.remove('on');
    };
    scene(root, async (A) => {
      plan.className = 'plan'; go.textContent = 'Choose plan'; mode.textContent = 'Your design system'; await A.wait(700);
      await ask(A, 'Make this card feel more premium', 'Your design system', 'sys', 'Choose plan', ['Reading the card', 'Using your tokens', 'Checking the result']);
      await A.wait(2400);
      await ask(A, 'Explore something bolder', 'Explore', 'ex', 'Start free', ['Reading the card', 'Trying a new direction', 'Checking contrast']);
      await A.wait(2400);
      await fade(A, plan, () => {});
    }, () => { plan.className = 'plan sys'; });
  }

  /* ---------- 4. Notes: two marks, two tasks, Apply ---------- */
  {
    const root = $('f4'), cur = $('f4cur'), pg = $('f4pg'), tagsEl = $('f4tags'), tk = $('f4tk'), ty = $('f4ty');
    const SPOTS = [{ x: 222, y: 22, t: 'Heading feels timid' }, { x: 170, y: 106, t: 'Round the photos' }];
    let notes = [];
    const draw = (done) => {
      tagsEl.innerHTML = notes.map((n, i) => `<div class="nT${done ? ' done' : ''}" style="left:${n.x}px;top:${n.y}px"><i></i><b>${done ? '✓' : i + 1}</b></div>`).join('');
      tk.innerHTML = notes.map((n, i) => `<div class="tk${done ? ' done' : ''}"><em>${i + 1}</em>${n.t}</div>`).join('') + `<div class="ft"><span>${done ? 'All fixed' : notes.length + ' task' + (notes.length === 1 ? '' : 's')}</span>${done ? '' : '<span class="pinkB" id="f4ap">Apply</span>'}</div>`;
    };
    scene(root, async (A) => {
      notes = []; pg.classList.remove('fixed'); draw(false);
      A.to(cur, [120, 230]); await A.wait(500);
      for (const s of SPOTS) {
        await A.move(cur, [s.x + 26, s.y + 16], 0, 0, 800); await A.click(cur);
        notes.push({ ...s, t: '' }); draw(false);
        Object.assign(ty.style, { left: s.x + 38 + 'px', top: s.y + 30 + 'px' }); ty.textContent = ''; ty.classList.add('on');
        await A.type(ty, s.t, 40); await A.wait(300); ty.classList.remove('on');
        notes[notes.length - 1].t = s.t; draw(false); await A.wait(400);
      }
      await A.move(cur, $('f4ap'), 0.5, 0.5, 800); await A.click(cur);
      draw(true); pg.classList.add('fixed');
      await A.wait(2600);
      await A.move(cur, [120, 230], 0, 0, 500);
      await fade(A, pg, () => { notes = []; pg.classList.remove('fixed'); draw(false); });
    }, () => { notes = SPOTS.map((s) => ({ ...s })); draw(true); pg.classList.add('fixed'); cur.style.opacity = 0; });
  }

  /* ---------- 5. Design system: one token changes, every place that uses it follows ---------- */
  {
    const root = $('f5'), sp = $('f5sp'), C = ['#2563EB', '#C2508A', '#1E8A4F', '#111111'];
    const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
    const apply = (c) => { sp.style.background = c; [['f5bd', (e) => { e.style.background = tint(c, 0.12); e.style.color = c; }], ['f5bar', (e) => (e.style.background = c)], ['f5btn', (e) => (e.style.background = c)], ['f5lk', (e) => (e.style.color = c)]].forEach(([id, f], i) => setTimeout(() => f($(id)), 160 + i * 140)); };
    apply(C[0]); let i = 0;
    scene(root, async (A) => { await A.wait(1800); i = (i + 1) % C.length; apply(C[i]); await A.wait(800); }, () => apply(C[1]));
  }

  /* ---------- 6. GitHub: connect, pick a repository, it opens ---------- */
  {
    const root = $('f6');
    const GH = '<svg viewBox="0 0 24 24" fill="#111" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.7-2.8 5.7-5.5 6 .5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"/></svg>';
    const BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>';
    const CUR = '<div class="cur" id="f6cur"><svg viewBox="0 0 22 22"><path d="M5 3l12 7.2-5.2 1.3 3 5.6-2.2 1.2-3-5.7L5 16.6z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg></div>';
    const repos = [['acme/storefront', 'Next.js'], ['acme/dashboard', 'Vite'], ['acme/marketing', 'Next.js']];
    const view = (inner) => { root.innerHTML = inner + CUR; };
    const done = (n) => `<div class="ghC"><div class="rp">${BOOK}<b style="font-weight:600">${n}</b><small>main</small></div><div class="ghD"><div>React and Tailwind found</div><div>App installed and started</div><div>Opened with its real pages</div></div></div>`;
    scene(root, async (A) => {
      view(`<span class="ghB" id="f6b">${GH}Connect GitHub</span><span class="note">Sign-in happens on GitHub</span>`);
      let cur = $('f6cur'); A.to(cur, [40, 250]); await A.wait(600);
      await A.move(cur, $('f6b'), 0.6, 0.6, 800); await A.click(cur);
      const pos = cur.style.transform;
      view(`<div class="ghC">${repos.map(([n, f], i) => `<div class="rp" id="f6r${i}">${BOOK}${n}<small>${f}</small></div>`).join('')}</div><span class="note">Pick a repository</span>`);
      cur = $('f6cur'); cur.style.transition = 'none'; cur.style.transform = pos; void cur.offsetWidth; cur.style.transition = '';
      await A.wait(500); await A.move(cur, $('f6r1'), 0.4, 0.5, 700); $('f6r1').classList.add('hl'); await A.wait(300);
      await A.move(cur, $('f6r0'), 0.4, 0.5, 500); $('f6r1').classList.remove('hl'); $('f6r0').classList.add('hl'); await A.click(cur);
      view(done('acme/storefront')); cur = $('f6cur'); cur.style.opacity = 0;
      for (const d of root.querySelectorAll('.ghD div')) { await A.wait(450); d.classList.add('on'); }
      await A.wait(2600);
      await fade(A, root, () => {});
    }, () => { view(done('acme/storefront')); root.querySelectorAll('.ghD div').forEach((d) => d.classList.add('on')); $('f6cur').style.opacity = 0; });
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

  /* ---------- 9. History: drag to compare, step through versions ---------- */
  {
    const c = $('f9c'), a = $('f9a'), la = $('f9la'), tl = [...$('f9t').children];
    const V = [['rgba(237,239,244,.6)', '4px', '#888', '#fff', 'v1'], ['rgba(237,239,244,.85)', '4px', '#888', '#fff', 'v2'], ['rgba(237,239,244,.85)', '99px', 'rgba(255,255,255,.2)', '#fff', 'v3']];
    const ver = (i) => { const [fs, br, bg, col, l] = V[i]; a.querySelector('.t').style.color = fs; const b = a.querySelector('.b'); b.style.borderRadius = br; b.style.background = bg; b.style.color = col; la.textContent = l; tl.forEach((t, j) => t.classList.toggle('on', j === i || j === 3)); };
    const knob = async (A, from, to, ms) => { const t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.style.setProperty('--x', from + (to - from) * e + '%'); if (k >= 1) return; await A.wait(16); } };
    ver(0); let v = 0, x = 50;
    scene(c, async (A) => {
      await knob(A, x, 78, 1100); x = 78; await A.wait(600);
      await knob(A, x, 22, 1500); x = 22; await A.wait(600);
      await knob(A, x, 50, 900); x = 50; await A.wait(500);
      v = (v + 1) % 3; ver(v); await A.wait(900);
    }, () => ver(0));
  }

  /* invite form: no sign-up service is connected yet, so it only confirms on the page */
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('thanks').textContent = "Thanks. You're on the list."; e.target.reset(); });
})();
