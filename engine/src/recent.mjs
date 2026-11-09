// Recently opened projects, whichever way they were opened (a GitHub link from the start page, a folder,
// or `node bin/kerf.mjs <folder>`). The editor updates its entry each time it's opened, so the start page
// can list them by when you last used them, and link straight to the ones still running.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RECENT_FILE = path.join(os.homedir(), 'Kerf', 'recent.json');

export function readRecent() {
  try { return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8')).filter((r) => r && r.root && !isScratch(r.root)); } catch { return []; }
}

// Where this app's repo lives and how to open it again: "owner/repo" for Tovi's GitHub copies, else the folder.
function sourceOf(webRoot, projectsDir) {
  let dir = webRoot;
  while (dir !== path.dirname(dir) && !fs.existsSync(path.join(dir, '.git'))) dir = path.dirname(dir);
  const root = fs.existsSync(path.join(dir, '.git')) ? dir : webRoot;
  let remote = '';
  try { remote = fs.readFileSync(path.join(root, '.git/config'), 'utf8').match(/url = (.+)/)?.[1] || ''; } catch {}
  const gh = remote.match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
  const copy = projectsDir && root.startsWith(projectsDir + path.sep);
  return { root, source: copy && gh ? `${gh[1]}/${gh[2]}` : root };
}

// Throwaway copies (tests, scratch folders in the system temp directory) never appear in Recent, so nobody
// opens a test copy by mistake. TOVI_NO_RECENT=1 also keeps a run out of the list.
const isScratch = (dir) => { const t = fs.realpathSync(os.tmpdir()); let d = dir; try { d = fs.realpathSync(dir); } catch {} return d.startsWith(t + path.sep) || d.startsWith('/private/tmp/') || d.startsWith('/tmp/'); };

export function touchRecent(webRoot, url, projectsDir) {
  try {
    if (process.env.TOVI_NO_RECENT === '1') return;
    const { root, source } = sourceOf(webRoot, projectsDir);
    if (isScratch(root)) return;
    const list = readRecent().filter((r) => r.root !== root);
    list.unshift({ root, source, name: path.basename(source), url, pid: process.pid, at: Date.now() });
    fs.mkdirSync(path.dirname(RECENT_FILE), { recursive: true });
    fs.writeFileSync(RECENT_FILE, JSON.stringify(list.slice(0, 30), null, 2));
  } catch {}
}
