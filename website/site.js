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

  /* Reveals: text drops into place when it comes into view; the hero screen tilts up, then flattens as you scroll. */
  {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { threshold: 0.2 });
    document.querySelectorAll('.rvl').forEach((el) => io.observe(el));
    const shot = $('hero');
    if (shot && !still) {
      shot.classList.add('enter');
      shot.addEventListener('animationend', () => shot.classList.remove('enter'), { once: true });
      const tilt = () => { const k = Math.min(1, Math.max(0, scrollY / 520)); shot.style.setProperty('--tilt', (2.3 * (1 - k)).toFixed(3) + 'deg'); };
      tilt(); addEventListener('scroll', () => requestAnimationFrame(tilt), { passive: true });
    }
  }

  /* ---------- Hero: real screenshots of Tovi, starting in the AI conversation ---------- */
  // Ask Tovi → its edit lands → Diagnose from the toolbar → notes pinned → the notes tool → Tovi applies the notes
  // → a hand edit in the panel → Hand off. Every frame is the real editor; the cursor moves between real controls.
  {
    const root = $('hero'), cur = $('hcur'), fr = [...root.querySelectorAll('.fr')];
    const P = { send: [259, 864], away: [1150, 560], diag: [763, 851], annot: [721, 851], apply: [248, 746], radius: [1372, 408], hoff: [1360, 21], canvas: [900, 470] };
    const go = (k) => { cur.style.left = (P[k][0] / 1440) * 100 + '%'; cur.style.top = (P[k][1] / 900) * 100 + '%'; };
    const show = (i) => fr.forEach((f, j) => f.classList.toggle('on', j === i));
    const click = async (A) => { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); await A.wait(240); };
    scene(root, async (A) => {
      show(0); go('send'); await A.wait(1400); await click(A);
      show(1); go('away'); await A.wait(2200);
      show(2); await A.wait(2600);
      go('diag'); await A.wait(900); await click(A); show(3); await A.wait(2000);
      show(4); await A.wait(2600);
      go('annot'); await A.wait(900); await click(A); go('canvas'); await A.wait(500); show(5); await A.wait(1300);
      show(6); await A.wait(1500);
      go('apply'); await A.wait(900); await click(A); show(7); await A.wait(1800);
      show(8); await A.wait(2400);
      go('radius'); await A.wait(1000); await click(A); show(9); await A.wait(1300);
      show(10); await A.wait(2000);
      go('hoff'); await A.wait(1000); await click(A); show(11); await A.wait(3000);
      go('send'); await A.wait(600);
    }, () => { show(2); cur.style.display = 'none'; });
  }

  /* ---------- Feature cards: real Tovi components playing by themselves ---------- */
  const typeInto = async (A, el, text, speed = 40) => { for (let i = 1; i <= text.length; i++) { el.innerHTML = text.slice(0, i) + '<span class="caret"></span>'; await A.wait(speed + (text[i - 1] === ' ' ? 25 : 0)); } };
  const press = async (A, cur) => { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); await A.wait(240); };

  /* Connect GitHub: type the repository, Open project, the steps tick */
  {
    const root = $('xGh'), cur = $('xGhC'), inp = $('xGhIn'), t = $('xGhT'), st = $('xGhS'), go = $('xGhGo');
    const rows = [...st.children];
    const reset = () => { t.className = 'ph'; t.textContent = 'github.com/team/app'; inp.classList.remove('focus'); inp.style.display = ''; st.classList.remove('on'); rows.forEach((r) => (r.className = '')); go.textContent = 'Open project'; };
    scene(root, async (A) => {
      reset(); A.to(cur, [40, 300]); await A.wait(600);
      await A.move(cur, inp, 0.5, 0.6, 800); await press(A, cur); inp.classList.add('focus'); t.className = '';
      await typeInto(A, t, 'github.com/acme/aster', 45); await A.wait(400); t.textContent = 'github.com/acme/aster';
      await A.move(cur, go, 0.5, 0.6, 700); await press(A, cur);
      inp.style.display = 'none'; st.classList.add('on'); go.textContent = 'Opening…';
      for (const r of rows) { r.className = 'run'; await A.wait(700); r.className = 'ok'; }
      await A.wait(2200);
    }, () => { inp.style.display = 'none'; st.classList.add('on'); rows.forEach((r) => (r.className = 'ok')); cur.style.opacity = 0; });
  }

  /* Edit by hand: scrub corner radius and padding, pick a fill; the card follows */
  {
    const root = $('xEd'), cur = $('xEdCur'), card = $('xEdC'), img = $('xEdI'), sel = $('xEdS');
    const FILLS = [['surface', '#14161C'], ['primary', '#1E5C43']];
    const st = { r: 6, p: 0, f: 0 };
    const place = () => { const r = card.getBoundingClientRect(), o = root.getBoundingClientRect(); Object.assign(sel.style, { left: r.left - o.left - 3 + 'px', top: r.top - o.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' }); };
    const draw = () => { card.style.borderRadius = st.r + 'px'; card.style.padding = st.p + 'px'; card.style.background = FILLS[st.f][1]; img.style.borderRadius = st.p ? Math.max(4, st.r - st.p) + 'px' : '0'; $('xEdRv').textContent = st.r; $('xEdPv').textContent = st.p; $('xEdFs').style.background = FILLS[st.f][1]; $('xEdFv').textContent = FILLS[st.f][0]; requestAnimationFrame(place); setTimeout(place, 480); };
    draw(); addEventListener('resize', place);
    const scrub = async (A, field, key, steps) => {
      const k = field.querySelector('.k'); await A.move(cur, k, 0.5, 0.6, 750); field.classList.add('flash');
      const b = A.box(k); let x = b.x + b.w / 2; cur.style.transition = 'transform .24s linear';
      for (const v of steps) { x += 18; A.to(cur, [x, b.y + b.h * 0.6], 0, 0); st[key] = v; draw(); await A.wait(260); }
      cur.style.transition = ''; field.classList.remove('flash'); await A.wait(400);
    };
    scene(root, async (A) => {
      st.r = 6; st.p = 0; st.f = 0; draw(); A.to(cur, [120, 300]); await A.wait(700);
      await scrub(A, $('xEdR'), 'r', [8, 12, 16, 24]);
      await scrub(A, $('xEdP'), 'p', [4, 8, 12]);
      const f = $('xEdFs').parentNode; await A.move(cur, f, 0.3, 0.5, 700); await press(A, cur); st.f = 1; draw();
      await A.wait(2600);
    }, () => { st.r = 24; st.p = 12; st.f = 1; draw(); cur.style.opacity = 0; });
  }

  /* AI improvements: ask Tovi, it answers, its cursor reworks the destination card into a premium one */
  {
    const root = $('xAi'), th = $('xAiTh'), inp = $('xAiIn'), send = $('xAiSend'), comp = $('xAiComp'), card = $('xAiD'), sel = $('xAiSel'), tov = $('xAiTv');
    const add = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; th.appendChild(d); return d; };
    const box = () => { const r = card.getBoundingClientRect(), o = root.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; };
    const frame = (pink) => { const b = box(); Object.assign(sel.style, { left: b.x - 4 + 'px', top: b.y - 4 + 'px', width: b.w + 8 + 'px', height: b.h + 8 + 'px' }); sel.classList.add('on'); sel.classList.toggle('pk', !!pink); sel.firstChild.textContent = pink ? 'Tovi · editing' : 'Card'; };
    const reset = () => { th.innerHTML = '<div class="xMeta"><img src="img/tovi-avatar.png" alt="">Earlier · Title larger, tighter tracking</div><div class="xDone"><span>✓ Applied</span><u>Undo</u></div>'; inp.className = 'xCompIn'; inp.textContent = 'Describe a change…'; send.classList.remove('on'); comp.classList.remove('busy'); card.classList.remove('prem'); tov.style.opacity = 0; sel.classList.remove('on'); };
    const ask = 'Make this card feel more premium';
    const reply = 'I let the photo lead: taller, with the name set in your display serif on it, softer corners and a quieter pill button.';
    scene(root, async (A) => {
      reset(); await A.wait(300); frame(false); await A.wait(800);
      inp.className = 'xCompIn typing'; await typeInto(A, inp, ask, 40); send.classList.add('on'); await A.wait(450);
      inp.className = 'xCompIn'; inp.textContent = 'Describe a change…'; send.classList.remove('on');
      add('xCtx', 'Card “The Fireside Suite”'); add('xU', ask); comp.classList.add('busy');
      const meta = add('xMeta', '<img src="img/tovi-avatar.png" alt="">Looking at the card…'); await A.wait(1300);
      meta.innerHTML = '<img src="img/tovi-avatar.png" alt="">Looked at 6 elements · Thought for 5s';
      const r = add('xReply', ''); for (let i = 0; i <= reply.length; i += 3) { r.textContent = reply.slice(0, i); await A.wait(26); }
      const b = box(); tov.style.left = b.x + b.w * 0.55 + 'px'; tov.style.top = b.y + b.h * 0.35 + 'px'; tov.style.opacity = 1; frame(true); await A.wait(800);
      card.classList.add('prem'); for (let t = 0; t < 7; t++) { await A.wait(100); frame(true); }
      add('xAppl', '<div class="h">Applied 3 of 3</div><div class="r"><i>✓</i><div>Card “The Fireside Suite”<small>Corners 6 → 20 · Image 130 → 200</small></div></div><div class="r"><i>✓</i><div>Title<small>Newsreader 24 · on the photo</small></div></div><div class="r"><i>✓</i><div>Button “Book”<small>Pill · light fill</small></div></div>');
      add('xDone', '<span>✓ Applied</span><u>Undo</u>'); comp.classList.remove('busy'); tov.style.opacity = 0; frame(false);
      await A.wait(3400);
    }, () => { card.classList.add('prem'); add('xU', ask); add('xReply', reply); add('xDone', '<span>✓ Applied</span><u>Undo</u>'); });
  }

  /* Notes: click on the page, type a note, again; Apply; Tovi fixes them */
  {
    const root = $('xNo'), cur = $('xNoCur'), page = $('xNoP'), tagsEl = $('xNoTags'), pop = $('xNoPop'), popT = $('xNoPopT'), tk = $('xNoTk');
    let notes = [];
    const spots = () => { const c = [...page.children], o = root.getBoundingClientRect(); const at = (el, fx, fy) => { const r = el.getBoundingClientRect(); return { x: r.left - o.left + r.width * fx, y: r.top - o.top + r.height * fy }; }; return [{ ...at(c[0], 0.7, 0.18), t: 'Round these cards more' }, { ...at(c[1], 0.4, 0.62), t: 'Titles feel too small' }]; };
    const draw = (done) => {
      tagsEl.innerHTML = notes.map((n, i) => `<div class="xTag on" style="left:${n.x - 3}px;top:${n.y - 16}px"><i></i><b style="${done ? 'background:#238636;color:#fff' : 'background:rgba(28,28,28,.92);color:#F2F2F2'}">${done ? '✓' : i + 1}</b></div>`).join('');
      const shown = notes.filter((n) => n.t); tk.style.display = shown.length ? '' : 'none';
      tk.innerHTML = shown.map((n, i) => `<div class="tk${done ? ' done' : ''}"><em>${i + 1}</em>${n.t}</div>`).join('') + `<div class="ft"><span>${done ? 'All fixed' : shown.length + ' task' + (shown.length === 1 ? '' : 's')}</span>${done ? '' : '<span class="xGhost">Discard</span><span class="xPink" id="xNoAp">Apply</span>'}</div>`;
    };
    scene(root, async (A) => {
      notes = []; page.classList.remove('fixed'); draw(false); A.to(cur, [60, 290]); await A.wait(600);
      for (const s of spots()) {
        await A.move(cur, [s.x, s.y], 0, 0, 800); await press(A, cur);
        notes.push({ ...s, t: '' }); tagsEl.insertAdjacentHTML('beforeend', `<div class="xTag on" style="left:${s.x - 3}px;top:${s.y - 16}px"><i></i><b style="background:rgba(28,28,28,.92);color:#F2F2F2">${notes.length}</b></div>`);
        Object.assign(pop.style, { left: Math.min(s.x + 12, root.offsetWidth - 214) + 'px', top: s.y + 14 + 'px' }); popT.textContent = ''; pop.classList.add('on');
        await typeInto(A, popT, s.t, 40); await A.wait(350); pop.classList.remove('on');
        notes[notes.length - 1].t = s.t; draw(false); await A.wait(450);
      }
      await A.move(cur, $('xNoAp'), 0.5, 0.5, 800); await press(A, cur);
      await A.wait(900); draw(true); page.classList.add('fixed');
      await A.wait(2800);
    }, () => { notes = spots(); page.classList.add('fixed'); draw(true); cur.style.opacity = 0; });
  }

  /* AI UX audit: a sweep, notes pinned, Tovi's list fills in, then walks through them */
  {
    const root = $('xAu'), sw = $('xAuSw'), tags = [...root.querySelectorAll('.xTag')], rows = [...root.querySelectorAll('.xAuRow')];
    const hl = (i) => { tags.forEach((t) => t.classList.toggle('hl', +t.dataset.i === i)); rows.forEach((r) => r.classList.toggle('hl', +r.dataset.i === i)); };
    scene(root, async (A) => {
      tags.forEach((t) => t.classList.remove('on')); rows.forEach((r) => r.classList.remove('on')); hl(0); await A.wait(600);
      sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go'); await A.wait(1200);
      for (let i = 0; i < 3; i++) { tags[i].classList.add('on'); rows[i].classList.add('on'); await A.wait(320); }
      await A.wait(500);
      for (const i of [1, 2, 3]) { hl(i); await A.wait(1300); }
      hl(0); await A.wait(1200);
    }, () => { tags.forEach((t) => t.classList.add('on')); rows.forEach((r) => r.classList.add('on')); });
  }

  /* Code changes: each edit morphs on screen (before → after), then its diff lines land */
  {
    const tabs = [...$('xCoTabs').children], els = [...document.querySelectorAll('#xCoEl .xE')], ba = $('xCoBA'), F = $('xCoF'), N = $('xCoN'), L = $('xCoL');
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const mk = (x) => esc(x).replace(/\[\[(.+?)\]\]/g, '<mark>$1</mark>');
    const C = [
      { f: 'src/sections/Hero.jsx', n: '+1 −1', l: [['c', '<div className="relative z-10 px-10 pb-16">'], ['c', '  <p className="text-xs uppercase text-primary">'], ['m', '-  <h1 className="font-display [[text-7xl]] text-content">'], ['p', '+  <h1 className="font-display [[text-8xl tracking-tight]] text-content">'], ['c', '     Nights under the northern sky'], ['c', '   </h1>']] },
      { f: 'src/components/Button.jsx', n: '+1 −1', l: [['c', 'const base ='], ['m', '-  "inline-flex items-center gap-2 [[rounded-lg px-6]] py-3"'], ['p', '+  "inline-flex items-center gap-2 [[rounded-full px-7]] py-3"'], ['c', 'const variants = {'], ['c', '  solid: "bg-primary text-primary-fg",'], ['c', '};']] },
      { f: 'src/components/PlaceCard.jsx', n: '+1 −1', l: [['c', 'export function PlaceCard({ place }) {'], ['c', '  return ('], ['m', '-    <article className="[[rounded-md]] bg-surface">'], ['p', '+    <article className="[[rounded-3xl]] bg-surface">'], ['c', '      <img src={place.image} alt={place.name} />'], ['c', '      <h3 className="p-3 font-medium">{place.name}</h3>']] },
    ];
    const show = (i, after) => {
      tabs.forEach((t, k) => t.classList.toggle('on', k === i));
      els.forEach((e, k) => { e.classList.toggle('on', k === i); e.classList.toggle('after', k === i && after); });
      ba.textContent = after ? 'After' : 'Before'; ba.classList.toggle('after', after);
      F.textContent = C[i].f; N.textContent = C[i].n;
      L.innerHTML = C[i].l.map(([k, x]) => `<div class="${k}${!after && k !== 'c' ? ' hide' : ''}">${mk(x)}</div>`).join('');
    };
    let i = 0; show(0, false);
    scene($('xCo'), async (A) => {
      show(i, false); await A.wait(1300);
      show(i, true); await A.wait(2600);
      i = (i + 1) % C.length;
    }, () => show(0, true));
  }

  /* Hand off: add a note, Create pull request, the pull request opens and its checks pass */
  {
    const root = $('xPr'), cur = $('xPrCur'), d = $('xPrD'), note = $('xPrNote'), go = $('xPrGo'), ok = $('xPrOk'), ck = [...ok.querySelectorAll('.xCk div')];
    const reset = () => { d.classList.remove('gone'); note.innerHTML = '<span class="ph">Anything they should know</span>'; go.textContent = 'Create pull request'; ok.classList.remove('on'); ck.forEach((c) => c.classList.remove('ok')); };
    scene(root, async (A) => {
      reset(); A.to(cur, [80, 340]); await A.wait(700);
      await A.move(cur, note, 0.3, 0.5, 800); await press(A, cur);
      await typeInto(A, note, 'The hero now reads more like a magazine cover.', 34); await A.wait(400); note.textContent = 'The hero now reads more like a magazine cover.';
      await A.move(cur, go, 0.5, 0.5, 800); await press(A, cur); go.textContent = 'Opening…'; await A.wait(1100);
      d.classList.add('gone'); ok.classList.add('on'); A.to(cur, [80, 340]);
      for (const c of ck) { await A.wait(550); c.classList.add('ok'); }
      await A.wait(2800);
    }, () => { d.classList.add('gone'); ok.classList.add('on'); ck.forEach((c) => c.classList.add('ok')); cur.style.opacity = 0; });
  }

  /* invite form: no sign-up service is connected yet, so it only confirms on the page */
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('thanks').textContent = "Thanks. You're on the list."; e.target.reset(); });
})();
