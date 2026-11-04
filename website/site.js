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

  /* ---------- Feature cards: each plays its real Tovi screens in order while it's on screen ---------- */
  document.querySelectorAll('.rv').forEach((rv, n) => {
    const fr = [...rv.querySelectorAll('.fr')];
    if (fr.length < 2) return;
    let i = 0;
    scene(rv, async (A) => {
      await A.wait(2600 + (n % 3) * 200);
      i = (i + 1) % fr.length;
      fr.forEach((f, j) => f.classList.toggle('on', j === i));
      if (i === fr.length - 1) await A.wait(1600);
    }, () => fr.forEach((f, j) => f.classList.toggle('on', j === fr.length - 1)));
  });

  /* invite form: no sign-up service is connected yet, so it only confirms on the page */
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('thanks').textContent = "Thanks. You're on the list."; e.target.reset(); });
})();
