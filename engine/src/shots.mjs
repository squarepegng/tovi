// Real screenshots of the app, taken by a hidden copy of the Chrome already installed on this computer (no
// browser download). Used where pixel accuracy matters more than the designer's exact screen state: Diagnose
// and the checks after fixing. The page is a fresh load at the same width and theme, so fonts, images, video
// frames and effects all look exactly as visitors see them. Without Chrome, callers fall back to Tovi's redraw.
import fs from 'node:fs';

const CANDIDATES = [
  process.env.TOVI_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
export const chromePath = () => CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;

let browser = null, starting = null, idle = null;
async function getBrowser() {
  if (browser?.connected) return browser;
  if (starting) return starting;
  const exe = chromePath();
  if (!exe) return null;
  starting = (async () => {
    const { default: pp } = await import('puppeteer-core');
    const b = await pp.launch({ executablePath: exe, headless: true, args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio'] });
    b.on('disconnected', () => { if (browser === b) browser = null; });
    browser = b;
    return b;
  })().finally(() => { starting = null; });
  return starting;
}
// Close Chrome after five quiet minutes; the next request starts it again (about a second).
function keepAlive() {
  clearTimeout(idle);
  idle = setTimeout(() => { browser?.close().catch(() => {}); browser = null; }, 5 * 60 * 1000);
}
export function closeShots() { clearTimeout(idle); browser?.close().catch(() => {}); browser = null; }

const MAX_H = 8000;
const b64 = (buf) => Buffer.from(buf).toString('base64');

// origin: the app's own address (http://localhost:5173). path: the page. locs: elements to picture one by one
// (each whole, e.g. every section). full: the whole page top to bottom.
export async function realShots({ origin, path, width = 1280, height = 800, theme = null, locs = [], full = false }) {
  if (!/^\/(?!\/)/.test(String(path || '/'))) return null;
  const b = await getBrowser().catch(() => null);
  if (!b) return null;
  keepAlive();
  const page = await b.newPage();
  try {
    const w = Math.max(320, Math.min(2560, Math.round(width))), h = Math.max(400, Math.min(2000, Math.round(height)));
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(origin + path, { waitUntil: 'networkidle2', timeout: 25000 });
    // The designer's theme, then wait for fonts and images.
    if (theme) await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
    await page.evaluate(async () => {
      await document.fonts?.ready;
      await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })));
    });
    await new Promise((r) => setTimeout(r, 300));
    const out = { width: w, sections: {} };
    if (full) {
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      out.full = b64(await page.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: w, height: Math.min(docH, MAX_H) }, captureBeyondViewport: true }));
    }
    if (locs.length) {
      // A sticky header would cover the top of each section as it scrolls into view: pin it in place first.
      await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) { const p = getComputedStyle(el).position; if (p === 'fixed' || p === 'sticky') el.style.setProperty('position', 'relative', 'important'); } });
      for (const loc of locs.slice(0, 16)) {
        const sel = `[data-kerf="${String(loc).replace(/"/g, '')}"], [data-kerf-use="${String(loc).replace(/"/g, '')}"]`;
        const el = await page.$(sel);
        if (!el) continue;
        const buf = await el.screenshot({ type: 'jpeg', quality: 78, captureBeyondViewport: true }).catch(() => null);
        if (buf) out.sections[loc] = b64(buf);
      }
    }
    return out;
  } finally {
    await page.close().catch(() => {});
  }
}
