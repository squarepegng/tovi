// Versions and shipping: group edits into versions, show the screen as it was
// before a version, restore, and send everything to GitHub as one pull request.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { readPerson } from './person.mjs';
import { KerfError } from './edit.mjs';
import { parseCode } from './ast.mjs';

export function createSession(webRoot, editor) {
  const versions = []; // { n, at, from, to } — indices into editor.history
  let peek = null; // { n, current: Map(file → content) }
  let chat = { messages: [], notes: [] };
  // The project's design direction: a preset feel, a description and up to 3 reference images.
  let direction = null;
  // What has been handed off: how many history entries are in a pull request, and each kerf/ branch's base.
  let handoff = { sent: 0, bases: {} };

  /* ---------- kept on disk, so a restart loses nothing ---------- */
  const DIR = path.join(webRoot, '.kerf');
  const FILE = path.join(DIR, 'session.json');
  function save() {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify({ v: 1, history: editor.history, versions, chat, direction, handoff, peek: peek ? { n: peek.n, current: [...peek.current] } : null }));
    } catch {}
  }
  function load() {
    let d;
    try { d = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return; }
    // A restart while showing "before": put the real files back first.
    if (d.peek) for (const [file, content] of d.peek.current) { try { fs.writeFileSync(file, content); } catch {} }
    editor.history.push(...(d.history || []).filter((h) => fs.existsSync(h.file)));
    versions.push(...(d.versions || []).filter((v) => v.to <= editor.history.length));
    chat = d.chat || chat;
    direction = d.direction || null;
    handoff = { sent: 0, bases: {}, ...(d.handoff || {}) };
    save();
  }
  // Never commit Tovi's own folder.
  function ignoreInGit() {
    try {
      const root = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: webRoot, encoding: 'utf8' }).stdout.trim();
      if (!root) return;
      const ex = path.resolve(webRoot, root, 'info', 'exclude');
      const cur = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : '';
      if (!cur.includes('.kerf/')) { fs.mkdirSync(path.dirname(ex), { recursive: true }); fs.appendFileSync(ex, (cur.endsWith('\n') || !cur ? '' : '\n') + '# Tovi session data\n**/.kerf/\n'); }
    } catch {}
  }

  const end = () => (versions.length ? versions[versions.length - 1].to : 0);
  const entries = (from, to) => editor.history.slice(from, to);
  const describe = (h) => {
    const s = h.summary;
    const code = [s.removed.length || s.added.length ? `${s.removed.join(' ') || '—'} → ${s.added.join(' ')}` : '', ...(s.props || []).map((p) => `${p.name}=${p.to}`)].filter(Boolean).join(' · ');
    return { file: h.rel, loc: h.loc, name: h.change?.name || null, label: (s.labels || []).join(' · ') || code, code, source: h.source || 'hand' };
  };

  // Who made the changes: the designer's name (Settings), read fresh so a change applies at once.
  const authorName = () => readPerson(webRoot);
  // Save a version. Autosaves happen on their own; named ones are saved (and named) by the designer.
  // Naming with nothing new to save names the latest version instead.
  function snapshot(opts = {}) {
    const kind = opts.kind === 'named' || opts.name ? 'named' : 'auto';
    const name = opts.name ? String(opts.name).trim().slice(0, 80) : null;
    if (editor.history.length > end()) versions.push({ n: versions.length + 1, at: Date.now(), from: end(), to: editor.history.length, kind, name, by: authorName() });
    else if (kind === 'named' && versions.length) Object.assign(versions[versions.length - 1], { kind, name: name || versions[versions.length - 1].name });
    return list();
  }
  function rename(n, name) {
    const v = versions.find((x) => x.n === n);
    if (!v) throw new KerfError('That version no longer exists.');
    v.name = String(name || '').trim().slice(0, 80) || null;
    v.kind = v.name ? 'named' : v.kind || 'auto';
    return list();
  }
  function list() {
    return {
      versions: versions.map((v) => ({ n: v.n, at: v.at, kind: v.kind || 'auto', name: v.name || null, by: v.by || authorName(), changes: entries(v.from, v.to).map(describe) })),
      by: authorName(),
      draft: entries(end(), editor.history.length).map(describe),
      peeking: peek ? peek.n : null,
      // Changes already in a pull request: the first `sent` entries (in history order).
      sent: Math.min(handoff.sent, editor.history.length),
    };
  }
  // Undo every edit after version n (n = 0 means back to the start).
  function restore(n) {
    if (peek) unpeekNow();
    const target = n === 0 ? 0 : versions.find((v) => v.n === n)?.to;
    if (target == null) throw new KerfError('That version no longer exists.');
    while (editor.history.length > target) editor.undo();
    while (versions.length && versions[versions.length - 1].to > target) versions.pop();
    return list();
  }
  // Show the files as they were before version n, without losing anything.
  function peekBefore(n) {
    if (peek) unpeekNow();
    const v = versions.find((x) => x.n === n);
    if (!v) throw new KerfError('That version no longer exists.');
    const before = new Map();
    for (const h of entries(v.from, editor.history.length)) for (const f of [h, ...(h.more || [])]) if (!before.has(f.file)) before.set(f.file, f.before);
    const current = new Map();
    for (const [f, content] of before) { current.set(f, fs.readFileSync(f, 'utf8')); fs.writeFileSync(f, content); }
    peek = { n, current };
    return list();
  }
  function unpeekNow() {
    if (!peek) return;
    for (const [f, content] of peek.current) fs.writeFileSync(f, content);
    peek = null;
  }

  /* ---------- git ---------- */
  function git(args, cwd, opts = {}) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', ...opts });
    if (r.error) throw new KerfError('Git isn’t available on this computer.');
    if (r.status !== 0) throw new KerfError((r.stderr || r.stdout || `git ${args[0]} failed`).trim().split('\n').slice(-2).join(' '));
    return r.stdout.trim();
  }
  const hasGh = () => spawnSync('gh', ['--version'], { encoding: 'utf8' }).status === 0;
  function repoInfo() {
    let root, branch, remote = '';
    try { root = git(['rev-parse', '--show-toplevel'], webRoot); } catch { return { git: false }; }
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
    try { remote = git(['remote', 'get-url', 'origin'], root); } catch {}
    const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    const files = [...new Set(editor.history.flatMap((h) => [h, ...(h.more || [])].map((f) => path.relative(root, f.file))))];
    // Porcelain lines start with a status column that can be a space, so don't trim them.
    const st = spawnSync('git', ['status', '--porcelain', '--', ...(files.length ? files : ['.'])], { cwd: root, encoding: 'utf8' }).stdout || '';
    const dirty = st.split('\n').filter((l) => l.length > 3).map((l) => l.slice(3));
    // Images uploaded through Tovi and used in the changed files ship with the PR.
    const ups = new Set();
    for (const h of editor.history) {
      let content = '';
      try { content = fs.readFileSync(h.file, 'utf8'); } catch {}
      for (const m of content.matchAll(/["'(]\/kerf\/([\w.-]+\.(?:png|jpe?g|gif|webp|svg|avif))/gi)) {
        const p = path.join(webRoot, 'public', 'kerf', m[1]);
        if (fs.existsSync(p)) ups.add(path.relative(root, p));
      }
    }
    const upDirty = ups.size ? spawnSync('git', ['status', '--porcelain', '--', ...ups], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter((l) => l.length > 3).map((l) => l.slice(3)) : [];
    return { git: true, root, branch, remote, repo: m ? `${m[1]}/${m[2]}` : null, files: [...files.filter((f) => dirty.includes(f)), ...upDirty], gh: hasGh() };
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'design-updates';
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

  // Plain words for the ways a push can fail. The work is already committed on the branch, so nothing is lost.
  function pushError(msg, branch) {
    const kept = ` Your changes are safe on the branch ${branch}; Hand off again to retry.`;
    if (/Permission denied|could not read Username|Authentication failed|403|denied to|not found|access rights|repository exists|not appear to be a git/i.test(msg)) return new KerfError(`GitHub didn’t accept the push. Sign in to GitHub on this Mac (in Terminal: gh auth login) with an account that can push to this repository.${kept}`);
    if (/rejected|non-fast-forward|fetch first/i.test(msg)) return new KerfError(`GitHub has newer work on ${branch} than this copy. Ask a developer to merge it, or start a new hand off from the main branch.${kept}`);
    if (/Could not resolve host|unable to access|timed out|Network/i.test(msg)) return new KerfError(`Tovi couldn’t reach GitHub. Check your internet connection.${kept}`);
    return new KerfError(`The push to GitHub failed: ${String(msg).replace(/[.\s]+$/, '')}.${kept}`);
  }
  const ghJson = (args, cwd) => { const r = spawnSync('gh', args, { cwd, encoding: 'utf8' }); try { return r.status === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } };

  // Commit Tovi's edits on a kerf/ branch, push it, and open (or update) the pull request.
  //  - every changed code file must still parse, so a broken change never reaches developers
  //  - a branch whose PR was merged or closed isn't reused: a new branch and PR are made
  //  - the PR targets the branch the designer started from
  //  - if the push fails, the commit stays on the branch and the next Hand off just pushes again
  function pullRequest({ title, body, dryRun }) {
    if (peek) throw new KerfError('Close the before view first.');
    snapshot();
    const info = repoInfo();
    if (!info.git) throw new KerfError('This project isn’t a Git repository, so there’s nothing to open a pull request on.');
    if (!info.remote) throw new KerfError('This project isn’t connected to GitHub yet, so there’s nowhere to send it.');
    for (const f of info.files.filter((x) => /\.[cm]?[jt]sx?$/.test(x))) {
      try { parseCode(fs.readFileSync(path.join(info.root, f), 'utf8'), { strict: true, file: f }); }
      catch (e) { throw new KerfError(`${f} has a code error (${String(e.message).split('\n')[0]}), so Tovi won’t send it. Undo the last change and try again.`); }
    }
    title = String(title || 'Design updates from Tovi').trim();
    const onKerf = info.branch.startsWith('kerf/');
    const pr = onKerf && info.gh ? ghJson(['pr', 'view', info.branch, '--json', 'url,state'], info.root) : null;
    const reuse = onKerf && (!pr || pr.state === 'OPEN');
    // Committed but never pushed (a failed push last time)?
    const up = spawnSync('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd: info.root, encoding: 'utf8' });
    const unpushed = onKerf && (up.status !== 0 || +up.stdout.trim() > 0);
    if (!info.files.length && !(reuse && unpushed)) throw new KerfError(pr && pr.state !== 'OPEN' ? 'Everything here is already in a pull request.' : 'There are no changes to send yet.');
    const branch = reuse ? info.branch : `kerf/${slug(title)}-${stamp()}`;
    const base = onKerf ? handoff.bases[info.branch] || null : info.branch;
    const plan = { branch, base, files: info.files, title };
    if (dryRun) return { dryRun: true, reuse, unpushed, ...plan };
    const id = [];
    try { git(['config', 'user.email'], info.root); } catch {
      // No git identity in this copy: use the GitHub account's noreply address if gh knows it.
      const u = hasGh() ? spawnSync('gh', ['api', 'user', '--jq', '.login + " " + (.id|tostring)'], { encoding: 'utf8' }).stdout.trim().split(' ') : [];
      id.push('-c', `user.name=${u[0] || readPerson(webRoot) || 'Tovi'}`, '-c', `user.email=${u[1] ? `${u[1]}+${u[0]}` : 'kerf'}@users.noreply.github.com`);
    }
    if (branch !== info.branch) git(['checkout', '-b', branch], info.root);
    if (base) handoff.bases[branch] = base;
    if (info.files.length) {
      git(['add', '--', ...info.files], info.root);
      git([...id, 'commit', '-m', title, '-m', String(body || '')], info.root);
    }
    handoff.sent = editor.history.length;
    save();
    try { git(['push', '-u', 'origin', branch], info.root); } catch (e) { throw pushError(e.message, branch); }
    let url = null, updated = false, viaGh = false;
    if (info.gh && reuse && pr?.url) {
      // An open PR from this branch: the push updated it. Say what's new in a comment.
      url = pr.url; updated = true; viaGh = true;
      if (info.files.length) spawnSync('gh', ['pr', 'comment', branch, '--body', `**More design updates**\n\n${String(body || title)}`], { cwd: info.root, encoding: 'utf8' });
    } else if (info.gh) {
      const made = spawnSync('gh', ['pr', 'create', '--head', branch, ...(base ? ['--base', base] : []), '--title', title, '--body', String(body || '')], { cwd: info.root, encoding: 'utf8' });
      if (made.status === 0) { url = made.stdout.trim().split('\n').pop(); viaGh = true; }
    }
    if (!url && info.repo) url = `https://github.com/${info.repo}/compare/${base ? `${encodeURIComponent(base)}...` : ''}${encodeURIComponent(branch)}?expand=1`;
    return { ...plan, url, updated, needsGitHubStep: !viaGh };
  }

  ignoreInGit();
  load();
  const setDirection = (x) => {
    if (!x) { direction = null; save(); return null; }
    const refs = (Array.isArray(x.refs) ? x.refs : []).slice(0, 3).filter((r) => r && /^image\/(jpeg|png)$/.test(r.media_type) && typeof r.data === 'string' && r.data.length < 1.5e6).map((r) => ({ media_type: r.media_type, data: r.data, thumb: String(r.thumb || '').slice(0, 60000), name: String(r.name || 'reference').slice(0, 80) }));
    direction = { preset: String(x.preset || '').slice(0, 40), text: String(x.text || '').slice(0, 600), refs };
    save();
    return direction;
  };
  return { save, direction: () => direction, setDirection, chat: () => chat, setChat: (c) => { chat = { messages: (c.messages || []).slice(-200), notes: c.notes || [] }; save(); }, snapshot, rename, list, restore, peekBefore, unpeek: () => { unpeekNow(); return list(); }, isPeeking: () => !!peek, repoInfo, pullRequest };
}
