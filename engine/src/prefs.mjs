// Preferences that follow the designer across projects and both Tovi pages (start page and editor).
// Kept in ~/Kerf/prefs.json. theme: 'dark' (the default), 'light', or 'system' (follow the Mac).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PREFS_FILE = path.join(os.homedir(), 'Kerf', 'prefs.json');
const THEMES = new Set(['system', 'light', 'dark']);

export function readPrefs() {
  let p = {};
  try { p = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) || {}; } catch {}
  return { theme: THEMES.has(p.theme) ? p.theme : 'dark' };
}

export function savePrefs(patch = {}) {
  const next = { ...readPrefs() };
  if (THEMES.has(patch.theme)) next.theme = patch.theme;
  fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
  fs.writeFileSync(PREFS_FILE, JSON.stringify(next, null, 2));
  return next;
}
