(() => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = still ? 0 : 1;

  /* nav: a hairline once the page scrolls */
  const nav = $('nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });

  /* Plays a card's demo once, the first time it comes into view. */
  const onView = (el, fn) => new IntersectionObserver((es, o) => { if (es.some((e) => e.isIntersecting)) { o.disconnect(); fn(); } }, { threshold: 0.45 }).observe(el);

  /* ---------- 1. Edit by hand: fields that scrub, a card that follows, code that updates ---------- */
  {
    const place = $('ePlace'), img = $('eImg'), txt = $('eTxt'), sel = $('eSel'), code = $('eCode');
    const STEPS = { radius: [0, 2, 4, 6, 8, 12, 16, 24, 32], pad: [0, 4, 8, 12, 16, 20, 24] };
    const RCLS = { 0: 'rounded-none', 2: 'rounded-sm', 4: 'rounded', 6: 'rounded-md', 8: 'rounded-lg', 12: 'rounded-xl', 16: 'rounded-2xl', 24: 'rounded-3xl', 32: 'rounded-[32px]' };
    const st = { radius: 12, pad: 0, fill: 'surface', color: '#14161C', changed: null };
    const pcls = (v) => (v ? `p-${v / 4}` : 'p-0');
    function draw() {
      place.style.borderRadius = st.radius + 'px';
      place.style.padding = st.pad + 'px';
      place.style.background = st.color;
      img.style.borderRadius = st.pad ? Math.max(0, st.radius - st.pad) + 'px' : '0';
      txt.style.padding = st.pad ? '0 2px 4px' : '0 14px 14px';
      document.querySelectorAll('#cEdit .f[data-p] b').forEach((b) => { b.textContent = st[b.parentNode.dataset.p]; });
      $('eSw').style.background = st.color; $('eFill').textContent = st.fill;
      const h = (k, s) => (st.changed === k ? `<span class="hl">${s}</span>` : s);
      code.innerHTML = `&lt;<span class="k">article</span> className=<span class="s">"${h('radius', RCLS[st.radius])} ${h('pad', pcls(st.pad))} ${h('fill', 'bg-' + st.fill)} overflow-hidden"</span>&gt;`;
      requestAnimationFrame(place2);
    }
    function place2() {
      const r = place.getBoundingClientRect(), c = place.parentNode.getBoundingClientRect();
      Object.assign(sel.style, { left: r.left - c.left - 1 + 'px', top: r.top - c.top - 1 + 'px', width: r.width + 2 + 'px', height: r.height + 2 + 'px' });
    }
    function step(p, dir) {
      const s = STEPS[p], i = s.indexOf(st[p]);
      const n = s[Math.max(0, Math.min(s.length - 1, (i < 0 ? 0 : i) + dir))];
      if (n === st[p]) return;
      st[p] = n; st.changed = p; draw();
    }
    document.querySelectorAll('#cEdit .f[data-p]').forEach((f) => {
      const p = f.dataset.p;
      const [less, more] = f.querySelectorAll('.st button');
      less.addEventListener('click', () => step(p, -1));
      more.addEventListener('click', () => step(p, 1));
      // Drag the icon to scrub, like Figma: every 14px moves one step on the scale.
      const ic = f.querySelector('.ic');
      ic.addEventListener('pointerdown', (e) => {
        e.preventDefault(); ic.setPointerCapture(e.pointerId);
        let x0 = e.clientX;
        const move = (ev) => { const d = Math.trunc((ev.clientX - x0) / 14); if (d) { step(p, Math.sign(d)); x0 = ev.clientX; } };
        const up = () => { ic.removeEventListener('pointermove', move); ic.removeEventListener('pointerup', up); };
        ic.addEventListener('pointermove', move); ic.addEventListener('pointerup', up);
      });
    });
    $('eSws').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $('eSws').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      st.fill = b.dataset.t; st.color = b.dataset.c; st.changed = 'fill'; draw();
    });
    addEventListener('resize', place2);
    draw();
    // A short demo the first time: round the corners, add padding, change the fill.
    onView($('cEdit'), async () => { if (still) return; await wait(500); for (const k of [1, 1]) { step('radius', k); await wait(380); } await wait(250); for (const k of [1, 1, 1]) { step('pad', k); await wait(320); } await wait(300); $('eSws').children[2].click(); });
  }

  /* ---------- 2. UX audit: a sweep, then notes pinned to what's off ---------- */
  {
    const run = $('aRun'), sweep = $('aSweep'), list = $('aList'), tags = [...document.querySelectorAll('#cAudit .tagM')];
    async function audit() {
      run.classList.add('gone'); list.classList.remove('on'); tags.forEach((t) => t.classList.remove('on'));
      sweep.classList.remove('run'); void sweep.offsetWidth; sweep.classList.add('run');
      await wait(1100 * T);
      for (const t of tags) { t.classList.add('on'); await wait(220 * T); }
      list.classList.add('on');
      await wait(400);
      run.textContent = 'Run again'; run.classList.add('again'); run.classList.remove('gone');
    }
    run.addEventListener('click', audit);
    list.addEventListener('mouseover', (e) => { const r = e.target.closest('[data-i]'); tags.forEach((t) => t.classList.toggle('hl', !!r && t.dataset.i === r.dataset.i)); });
    list.addEventListener('mouseleave', () => tags.forEach((t) => t.classList.remove('hl')));
    onView($('cAudit'), () => { if (!still) setTimeout(audit, 600); });
  }

  /* ---------- 3. AI improvements: same request, your system or an exploration ---------- */
  {
    const plan = $('iPlan'), steps = $('iSteps'), go = $('iGo');
    let mode = 'sys', busy = false;
    const CONTENT = {
      sys: { n: 'Starter', p: '$12', li: ['3 projects', 'Unlimited edits', 'Email support'], b: 'Choose plan', s: ['Reading the card', 'Applying your tokens', 'Checking the result'] },
      ex: { n: 'Starter', p: '$12', li: ['3 projects', 'Unlimited edits', 'Email support'], b: 'Start free', s: ['Reading the card', 'Trying a new direction', 'Checking contrast'] },
    };
    document.querySelectorAll('#cAI .modes button').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.m;
      document.querySelectorAll('#cAI .modes button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      plan.className = 'plan'; plan.querySelector('.go').textContent = 'Choose plan';
    }));
    async function improve() {
      if (busy) return; busy = true;
      plan.className = 'plan';
      const c = CONTENT[mode], rows = [...steps.children];
      rows.forEach((r, i) => { r.textContent = c.s[i]; r.classList.remove('ok'); });
      steps.classList.add('on');
      for (const r of rows) { await wait(420 * T); r.classList.add('ok'); }
      plan.classList.add(mode); plan.querySelector('.go').textContent = c.b;
      await wait(900 * T); steps.classList.remove('on'); busy = false;
    }
    go.addEventListener('click', improve);
    onView($('cAI'), () => { if (!still) setTimeout(improve, 700); });
  }

  /* ---------- 4. Notes: click to add, Apply works through them ---------- */
  {
    const area = $('nArea'), tagsEl = $('nTags'), tasks = $('nTasks'), page = $('nPage');
    const START = [{ x: 210, y: 18, t: 'Heading feels timid' }, { x: 150, y: 132, t: 'Round the photos' }];
    let notes = START.map((n) => ({ ...n })), done = false;
    const IDEAS = ['Button needs more weight', 'Caption too faint', 'Tighten this gap', 'Align with the title'];
    function draw() {
      tagsEl.innerHTML = notes.map((n, i) => `<div class="nTag${done ? ' done' : ''}" style="left:${n.x}px;top:${n.y}px"><i></i><b>${done ? '✓' : i + 1}</b></div>`).join('');
      tasks.innerHTML = notes.map((n, i) => `<div class="tk${done ? ' done' : ''}"><em>${i + 1}</em>${n.t}</div>`).join('') +
        `<div class="ft">${done ? '<span style="color:var(--ok)">All fixed</span><button class="linkB" data-r>Reset</button>' : `<span style="color:var(--ink3)">${notes.length} tasks</span><button class="pinkBtn" data-a>Apply</button>`}</div>`;
    }
    area.addEventListener('click', async (e) => {
      if (e.target.closest('[data-r]')) { notes = START.map((n) => ({ ...n })); done = false; page.classList.remove('fixed'); draw(); return; }
      if (e.target.closest('[data-a]')) { done = true; page.classList.add('fixed'); draw(); return; }
      if (e.target.closest('.tasks') || done || notes.length >= 5) return;
      const r = area.getBoundingClientRect();
      notes.push({ x: e.clientX - r.left - 3, y: e.clientY - r.top - 16, t: IDEAS[(notes.length - 2) % IDEAS.length] });
      draw();
    });
    draw();
  }

  /* ---------- 5. Design system: one token, every screen ---------- */
  {
    const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
    function apply(c) {
      $('dSw').style.background = c; $('dBtn').style.background = c; $('dBar').style.background = c;
      $('dBadge').style.background = tint(c, 0.12); $('dBadge').style.color = c; $('dLink').style.color = c;
    }
    $('dSws').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $('dSws').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      apply(b.dataset.c);
    });
    apply('#2563EB');
  }

  /* ---------- 6. GitHub: connect, pick a repository, ready ---------- */
  {
    const box = $('gBox');
    const GH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.7-2.8 5.7-5.5 6 .5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"/></svg>';
    const REPO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>';
    const repos = [['acme/storefront', 'Next.js'], ['acme/dashboard', 'Vite'], ['acme/marketing', 'Next.js']];
    const start = () => { box.innerHTML = `<button class="ghBtn">${GH}Connect GitHub</button><span style="font-size:12px;color:var(--ink3)">Sign-in happens on GitHub's own page</span>`; };
    box.addEventListener('click', async (e) => {
      if (e.target.closest('.ghBtn')) { box.innerHTML = `<div class="ghCard">${repos.map(([n, f]) => `<button class="repo" data-n="${n}">${REPO}${n}<small>${f}</small></button>`).join('')}</div><span style="font-size:12px;color:var(--ink3)">Pick a repository</span>`; return; }
      const r = e.target.closest('.repo');
      if (r) {
        box.innerHTML = `<div class="ghCard"><div class="repo" style="cursor:default">${REPO}<b style="font-weight:600">${r.dataset.n}</b><small>main</small></div><div class="ghDone"><div>React and Tailwind found</div><div>App installed and started</div><div>Opened with its real pages</div></div></div><button class="linkB" data-back>Start again</button>`;
        for (const d of box.querySelectorAll('.ghDone div')) { await wait(380 * T); d.classList.add('on'); }
        return;
      }
      if (e.target.closest('[data-back]')) start();
    });
    start();
  }

  /* ---------- 7. Hand off: the pull request builds itself ---------- */
  {
    const card = $('pCard'), state = $('pState'), checks = [...$('pChecks').children], go = $('pGo');
    let busy = false;
    async function handoff() {
      if (busy) return; busy = true;
      card.classList.remove('on'); state.textContent = 'Draft'; state.style.background = '#6E7781'; checks.forEach((c) => c.classList.remove('ok'));
      await wait(200 * T); card.classList.add('on');
      for (const c of checks) { await wait(450 * T); c.classList.add('ok'); }
      await wait(200 * T); state.textContent = 'Open'; state.style.background = '#1F883D';
      go.querySelector('span').textContent = '0'; busy = false;
      setTimeout(() => { go.querySelector('span').textContent = '3'; }, 2500);
    }
    go.addEventListener('click', handoff);
    onView($('cPR'), () => { if (!still) setTimeout(handoff, 700); else { card.classList.add('on'); checks.forEach((c) => c.classList.add('ok')); state.textContent = 'Open'; } });
  }

  /* ---------- 8. Code tracking: every visual change, its exact diff ---------- */
  {
    const CH = [
      { t: 'Hero title', s: 'Size 72 → 96', f: 'src/sections/Hero.jsx', n: '1 line', d: [['c', '<section className="relative min-h-[760px]">'], ['m', '-  <h1 className="font-display text-7xl text-content">'], ['p', '+  <h1 className="font-display text-8xl text-content">'], ['c', '     Nights under the northern sky'], ['c', '   </h1>']] },
      { t: 'Place cards', s: 'Corners 14 → 20, all 4', f: 'src/components/PlaceCard.jsx', n: '1 line', d: [['c', 'export function PlaceCard({ place }) {'], ['c', '  return ('], ['m', '-    <article className="rounded-xl bg-surface p-4">'], ['p', '+    <article className="rounded-2xl bg-surface p-4">']] },
      { t: 'Book button', s: 'Fill surface → primary', f: 'src/components/Button.jsx', n: '2 lines', d: [['c', 'const variants = {'], ['m', '-  solid: "bg-surface text-content",'], ['p', '+  solid: "bg-primary text-primary-fg",'], ['m', '-  ghost: "border border-border",'], ['p', '+  ghost: "border border-border/60",'], ['c', '};']] },
    ];
    const list = $('cList');
    list.innerHTML = CH.map((c, i) => `<button data-i="${i}"><b>${c.t}</b><small>${c.s}</small></button>`).join('');
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    function show(i) {
      const c = CH[i];
      list.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
      $('cFile').innerHTML = `${c.f}<span>${c.n} changed</span>`;
      const d = $('cDiff'); d.classList.remove('sw'); void d.offsetWidth; d.classList.add('sw');
      d.innerHTML = c.d.map(([k, l]) => `<div class="${k}">${esc(l)}</div>`).join('');
    }
    list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(+b.dataset.i); });
    list.addEventListener('mouseover', (e) => { const b = e.target.closest('button'); if (b && !b.classList.contains('on')) show(+b.dataset.i); });
    show(0);
  }

  /* ---------- 9. Version history: drag to compare, pick a version ---------- */
  {
    const cmp = $('hCmp'), A = $('hA'), LA = $('hLA');
    const set = (x) => cmp.style.setProperty('--x', Math.max(4, Math.min(96, x)) + '%');
    const at = (e) => { const r = cmp.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
    cmp.addEventListener('pointerdown', (e) => { cmp.setPointerCapture(e.pointerId); cmp.classList.add('drag'); at(e); const mv = (ev) => at(ev); cmp.addEventListener('pointermove', mv); cmp.addEventListener('pointerup', () => { cmp.removeEventListener('pointermove', mv); cmp.classList.remove('drag'); }, { once: true }); });
    // Earlier versions differ step by step: v1 the original, v2 bigger title, v3 rounder button.
    const V = { 1: ['22px', '4px', '#888', '#fff', 'v1 · Start'], 2: ['27px', '4px', '#888', '#fff', 'v2 · Title'], 3: ['27px', '99px', '#9A9A9A', '#fff', 'v3 · Button'] };
    $('hTl').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.dataset.v === '4') return;
      $('hTl').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b || x.dataset.v === '4'));
      const [fs, br, bg, c, lab] = V[b.dataset.v];
      A.querySelector('.t').style.fontSize = fs; const btn = A.querySelector('.b'); btn.style.borderRadius = br; btn.style.background = bg; btn.style.color = c; LA.textContent = lab;
    });
    $('hTl').children[0].click();
    onView($('cHist'), async () => { if (still) return; for (const x of [50, 62, 36, 50]) { set(x); await wait(520); } });
  }

  /* invite form: no sign-up service is connected yet, so it only confirms on the page */
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('thanks').textContent = "Thanks. You're on the list."; e.target.reset(); });
})();
