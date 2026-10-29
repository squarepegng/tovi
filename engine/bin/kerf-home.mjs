#!/usr/bin/env node
// Tovi's start screen: paste a GitHub link or a folder, and Tovi opens the app
// with the editor attached.   node bin/kerf-home.mjs   →  http://localhost:4100
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProject, PROJECTS_DIR, projects, stopAll } from '../src/project.mjs';
import { readRecent } from '../src/recent.mjs';

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
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function recent() {
  const seen = new Set(), out = [];
  for (const r of readRecent()) {
    if (seen.has(r.root) || !fs.existsSync(r.root)) continue;
    seen.add(r.root);
    out.push({ id: r.root, source: r.source, name: r.name, url: r.pid && alive(r.pid) ? r.url : null, at: r.at });
  }
  if (fs.existsSync(PROJECTS_DIR)) for (const e of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, e.name);
    if (seen.has(dir)) continue;
    let remote = '';
    try { remote = fs.readFileSync(path.join(dir, '.git/config'), 'utf8').match(/url = (.+)/)?.[1] || ''; } catch {}
    const running = projects.get(e.name);
    const source = remote.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '') || dir;
    out.push({ id: dir, source, name: path.basename(source), url: running?.proc?.exitCode === null ? running.url : null, at: fs.statSync(dir).mtimeMs });
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
    return send(res, 200, { set: /^ANTHROPIC_API_KEY=sk-ant-\S+/m.test(env), unsplash: /^UNSPLASH_ACCESS_KEY=\S+/m.test(env) });
  }
  if (req.method === 'POST' && req.url === '/api/unsplash-key') {
    let body = '';
    for await (const c of req) body += c;
    const key = String(JSON.parse(body || '{}').key || '').trim();
    if (!/^[A-Za-z0-9_-]{30,}$/.test(key)) return send(res, 400, { error: 'That does not look like an Unsplash Access Key. Copy the “Access Key” from your Unsplash app page.' });
    setEnv('UNSPLASH_ACCESS_KEY', key);
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
  if (req.method === 'GET' && req.url === '/api/recent') return send(res, 200, recent());
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
:root{--canvas:#1B1B1E;--panel:#232327;--raised:#2D2D32;--line:#3A3A40;--ink:#EDEDF0;--ink2:#B0B0BA;--ink3:#8B8B95;--select:#2B66D9;--intent:#E9B547;--danger:#F06A5F;--ok:#6FD39A;color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;min-height:100%;background:var(--canvas);color:var(--ink);font:400 13px/18px Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.app{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:100vh}
nav{display:flex;flex-direction:column;gap:2px;padding:20px 12px;border-right:1px solid rgba(255,255,255,.06);background:#1E1E21;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;padding:0 8px 20px;font-weight:600;font-size:15px}
nav a{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:500}
nav a:hover{background:var(--panel);color:var(--ink)}
nav a.on{background:var(--raised);color:var(--ink)}
nav a svg{flex:0 0 auto;color:var(--ink3)}
nav a.on svg{color:var(--ink)}
nav .sp{flex:1}
nav .ver{padding:0 10px;color:var(--ink3);font-size:11px}
main{min-width:0;padding:56px 48px 64px;max-width:760px;width:100%;margin:0 auto}
.view{display:none;flex-direction:column;gap:32px}
.view.on{display:flex}
h1{margin:0;font-size:26px;line-height:32px;font-weight:600;letter-spacing:-.02em}
h2{margin:0;font-size:13px;font-weight:600;color:var(--ink)}
p{margin:6px 0 0;color:var(--ink2);max-width:560px}
.lead{display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center}
.lead p{margin-left:auto;margin-right:auto}
.view > div:first-child:not(.lead){text-align:center}
.view > div:first-child:not(.lead) p{margin-left:auto;margin-right:auto}
form.openf{display:flex;gap:8px;width:100%;max-width:640px}
input{flex:1;min-width:0;height:42px;padding:0 14px;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--ink);font:inherit;outline:none}
input:focus{border-color:var(--select);box-shadow:0 0 0 3px rgba(43,102,217,.2)}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:42px;padding:0 18px;border:0;border-radius:10px;background:var(--select);color:#fff;font:500 13px Geist,system-ui,sans-serif;cursor:pointer;text-decoration:none;white-space:nowrap}
button:disabled{opacity:.5;cursor:default}
.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}
.ghost:hover{background:var(--panel)}
.sm{height:32px;padding:0 12px;border-radius:8px;font-size:12px}
.hint{color:var(--ink3);font-size:12px}
.banner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-radius:12px;background:rgba(43,102,217,.1);border:1px solid rgba(43,102,217,.35);width:100%;max-width:640px;text-align:left}
.banner span{color:var(--ink)}
.card{display:flex;flex-direction:column;gap:12px;padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:14px}
.status{display:flex;align-items:center;gap:10px;font-weight:500}
.spin{width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
.err{color:var(--danger)}
pre{margin:0;max-height:180px;overflow:auto;padding:10px;background:var(--canvas);border-radius:8px;color:var(--ink3);font:400 11px/16px 'Geist Mono',ui-monospace,monospace;white-space:pre-wrap}
details.logs summary{cursor:pointer;color:var(--ink3);font-size:12px}details.logs pre{margin-top:8px}
.secH{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.proj{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;white-space:normal;gap:14px;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:14px;cursor:pointer;text-align:left;height:auto;color:var(--ink);font:inherit;transition:border-color .12s,background .12s}
.proj:hover{border-color:#55555d;background:#26262b}
.proj .thumb{display:grid;place-items:center;height:88px;border-radius:10px;background:linear-gradient(135deg,#2a2a2f,#232327);color:var(--ink3);font:600 22px/1 Geist,system-ui,sans-serif;letter-spacing:-.02em}
.proj b{display:block;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.proj .src{display:block;color:var(--ink3);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.proj .meta{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--ink3);font-size:12px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;background:var(--raised);color:var(--ink2);font-size:11px;font-weight:500}
.pill.run{background:rgba(111,211,154,.12);color:var(--ok)}
.pill.run::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--ok)}
.empty{padding:28px;border:1px dashed var(--line);border-radius:14px;color:var(--ink3);text-align:center}
.rows{display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:14px}
.srow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06)}
.srow:last-child{border-bottom:0}
.srow .tx{display:flex;flex-direction:column;gap:3px;min-width:0}
.srow .tx b{font-weight:500}
.srow form{display:flex;gap:8px;margin-top:10px}
.srow input{height:36px;border-radius:8px}
.ok{color:var(--ok)}
.steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.step{padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:14px}
.step i{display:grid;place-items:center;width:24px;height:24px;margin-bottom:10px;border-radius:50%;background:var(--raised);color:var(--ink);font:600 12px/1 Geist,system-ui,sans-serif;font-style:normal}
.step b{display:block;margin-bottom:4px}
.step span{color:var(--ink2)}
table.keys{border-collapse:collapse;width:100%}
table.keys td{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);color:var(--ink2)}
table.keys td:last-child{text-align:right}
kbd{display:inline-block;min-width:20px;padding:2px 6px;border-radius:5px;background:var(--raised);color:var(--ink);font:500 11px/16px Geist,system-ui,sans-serif;text-align:center}
@media (max-width:760px){.app{grid-template-columns:1fr}nav{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:12px}.brand{padding:0 8px 0 4px}nav .sp,nav .ver{display:none}main{padding:28px 16px 48px}}
@media (prefers-reduced-motion:reduce){.spin{animation:none}}
</style></head>
<body><div class="app">
<nav aria-label="Tovi">
  <div class="brand"><svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="5.5" height="10" rx="1.5" fill="#EDEDF0"/><rect x="8.5" y="3" width="5.5" height="10" rx="1.5" fill="#EDEDF0" opacity=".45"/></svg>Tovi</div>
  <a href="#projects" data-v="projects"><svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="2.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2" y="9.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="9.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>Projects</a>
  <a href="#settings" data-v="settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>Settings</a>
  <a href="#help" data-v="help"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.4" r=".8" fill="currentColor"/></svg>Help</a>
  <span class="sp"></span>
  <span class="ver" id="ver"></span>
</nav>
<main>
  <section class="view" id="v-projects" aria-labelledby="pT">
    <div class="lead">
      <div><h1 id="pT">Open a project</h1><p>Paste a GitHub link or a folder on this computer. Tovi runs your app and opens it with the editor on top. Your code only changes when you edit.</p></div>
      <form class="openf" id="f"><input id="src" placeholder="github.com/team/app  or  ~/code/app" autocomplete="off" spellcheck="false" aria-label="GitHub link or folder"><button id="go">Open</button></form>
      <span class="hint">React apps built with Vite or Next.js 13+, styled with Tailwind CSS v3. Private repos use your GitHub sign-in on this Mac.</span>
      <div class="banner" id="keyBanner" hidden><span>Add your Anthropic key to use Tovi’s AI.</span><a class="btn ghost sm" href="#settings">Add key</a></div>
    </div>
    <div id="job"></div>
    <div><div class="secH"><h2>Recent projects</h2><span class="hint" id="pdir"></span></div><div class="grid" id="recent"></div></div>
  </section>

  <section class="view" id="v-settings" aria-labelledby="sT">
    <div><h1 id="sT">Settings</h1><p>Saved only on this Mac. Keys live in a git-ignored file, and Tovi never shows them again.</p></div>
    <div><div class="secH"><h2>AI</h2></div>
      <div class="rows">
        <div class="srow"><div class="tx"><b>Anthropic key</b><span class="hint" id="keystat">Checking…</span>
          <form id="kf"><input id="kin" type="password" placeholder="sk-ant-..." autocomplete="off" spellcheck="false" aria-label="Anthropic API key"><button class="sm" id="ksave">Save</button></form><span class="err" id="kerr"></span></div></div>
        <div class="srow"><div class="tx"><b>Unsplash photos <span class="hint">(optional, free)</span></b><span class="hint" id="ustat">Checking…</span><span class="hint">Create an app at <a href="https://unsplash.com/oauth/applications" target="_blank" rel="noopener">unsplash.com/developers</a> and paste its Access Key.</span>
          <form id="uf"><input id="uin" type="password" placeholder="Unsplash Access Key" autocomplete="off" spellcheck="false" aria-label="Unsplash Access Key"><button class="sm">Save</button></form><span class="err" id="uerr"></span></div></div>
      </div>
    </div>
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
  if(j.url&&started){location.href=j.url;return}
  if(done){$('go').disabled=false;loadRecent();return}
  polling=setTimeout(poll,700);
}
const ago=t=>{const s=(Date.now()-t)/1000;return s<3600?Math.max(1,Math.round(s/60))+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' d ago'};
async function loadRecent(){
  const list=await (await fetch('/api/recent')).json();
  $('recent').innerHTML=list.length?list.map(p=>{const name=p.name||String(p.source).split('/').filter(Boolean).pop();return '<button class="proj" data-src="'+esc(p.source)+'"'+(p.url?' data-url="'+esc(p.url)+'"':'')+'><span class="thumb">'+esc(name.slice(0,2).toUpperCase())+'</span><span><b>'+esc(name)+'</b><span class="src">'+esc(p.source)+'</span></span><span class="meta"><span class="pill'+(p.url?' run':'')+'">'+(p.url?'Running':'Not running')+'</span><span>'+ago(p.at)+'</span></span></button>'}).join(''):'<div class="empty">Projects you open appear here.</div>';
}
$('f').addEventListener('submit',e=>{e.preventDefault();const v=$('src').value.trim();if(v)open(v)});
$('recent').addEventListener('click',e=>{const b=e.target.closest('[data-src]');if(!b)return;if(b.dataset.url){location.href=b.dataset.url;return}$('src').value=b.dataset.src;open(b.dataset.src)});
async function loadKey(){const s=await (await fetch('/api/key-status')).json();
  $('keystat').innerHTML=s.set?'<span class="ok">Saved.</span> Tovi’s AI is on. Paste a new key to replace it.':'No key yet. Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.';
  $('ustat').innerHTML=s.unsplash?'<span class="ok">Saved.</span> Photo search is on.':'Not set: photo search is off.';
  $('keyBanner').hidden=!!s.set;}
async function loadAbout(){try{const a=await (await fetch('/api/about')).json();$('ver').textContent='Version '+a.version;$('aver').textContent=a.version;$('adir').textContent=a.projectsDir+' (Tovi’s copies of the repos you open)';$('pdir').textContent='Newest first';}catch{}}
$('uf').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/unsplash-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:$('uin').value})});const j=await r.json();if(!r.ok){$('uerr').textContent=j.error;return}$('uin').value='';$('uerr').textContent='';loadKey()});
$('kf').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:$('kin').value})});const j=await r.json();if(!r.ok){$('kerr').textContent=j.error;return}$('kin').value='';$('kerr').textContent='';loadKey()});
loadKey();loadRecent();loadAbout();poll();
</script></body></html>`;
