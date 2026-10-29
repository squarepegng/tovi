// The designer's name, shown on the versions they save and the changes they make. Kept in ~/Kerf so it
// follows them across projects. Starts from the git name on this Mac; the designer can change it in Settings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PERSON_FILE = path.join(os.homedir(), 'Kerf', 'person.json');

export function readPerson(webRoot) {
  try { const n = JSON.parse(fs.readFileSync(PERSON_FILE, 'utf8')).name; if (n) return String(n); } catch {}
  const git = webRoot ? spawnSync('git', ['config', 'user.name'], { cwd: webRoot, encoding: 'utf8' }).stdout?.trim() : '';
  if (git) return git;
  try { return os.userInfo().username; } catch { return 'You'; }
}

export function savePerson(name) {
  const clean = String(name || '').trim().slice(0, 60);
  fs.mkdirSync(path.dirname(PERSON_FILE), { recursive: true });
  fs.writeFileSync(PERSON_FILE, JSON.stringify({ name: clean }, null, 2));
  return clean;
}
