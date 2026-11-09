// Before/after pictures for hand off pull requests. The pictures never go into the pull request's own branch,
// so the code diff developers review stays clean: they live on a side branch (tovi-screenshots/…) that only
// holds images, and the PR description shows them from there. GitHub serves them to anyone who can see the
// repository, private ones included.
import { spawnSync } from 'node:child_process';

// The side branch for a kerf/ branch: kerf/design-updates-1 → tovi-screenshots/design-updates-1.
export const shotsBranch = (branch) => `tovi-screenshots/${String(branch).replace(/^kerf\//, '')}`;

// Pictures are shown from the commit that holds them, so later hand offs never change earlier ones.
export const shotUrl = (repo, sha, file) => `https://github.com/${repo}/blob/${sha}/${encodeURIComponent(file)}?raw=true`;

// The pages edited since the last hand off, in the order they were first changed (at most four).
export function changedPages(entries, max = 4) {
  const pages = [];
  for (const h of entries) { const p = h.page || '/'; if (!pages.includes(p)) pages.push(p); }
  return pages.slice(0, max);
}

// Each file's content before the given edits (an edit's own `before`, or the first one that touched the file).
export function contentBefore(entries) {
  const before = new Map();
  for (const h of entries) for (const f of [h, ...(h.more || [])]) if (!before.has(f.file)) before.set(f.file, f.before);
  return before;
}

// The markdown that goes in the PR description or update comment.
// shots: [{ page, before: url|null, after: url|null }]
export function shotsMarkdown(shots, branch) {
  const rows = shots.filter((s) => s.before || s.after);
  if (!rows.length) return '';
  const img = (u, alt) => (u ? `<a href="${u}"><img src="${u}" alt="${alt}" width="420"></a>` : '_Couldn’t take this picture_');
  const name = (p) => (p === '/' ? 'Home page' : `Page \`${p}\``);
  return `### Before and after\n\n${rows.map((s) => `**${name(s.page)}**\n\n| Before | After |\n| --- | --- |\n| ${img(s.before, `${s.page} before`)} | ${img(s.after, `${s.page} after`)} |`).join('\n\n')}\n\n<sub>Click a picture to see it full size. The pictures are kept on the branch \`${shotsBranch(branch)}\`, outside this pull request; it can be deleted after merging.</sub>`;
}

// Store the pictures as one commit on the side branch and push it, without touching the working copy.
// files: [{ name, data: Buffer }]. Returns the commit sha, or null if anything fails (pictures are never worth
// blocking a hand off for).
export function pushShots({ root, branch, files, id = [] }) {
  const run = (args, input) => spawnSync('git', args, { cwd: root, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r) => (r.status === 0 ? r.stdout.trim() : null);
  if (!files.length) return null;
  const side = shotsBranch(branch);
  const lines = [];
  for (const f of files) {
    const sha = out(run(['hash-object', '-w', '--stdin'], f.data));
    if (!sha) return null;
    lines.push(`100644 blob ${sha}\t${f.name}`);
  }
  const tree = out(run(['mktree'], lines.join('\n') + '\n'));
  if (!tree) return null;
  // Build on the side branch's last commit, so earlier PRs' pictures stay reachable.
  let parent = null;
  if (run(['fetch', '-q', 'origin', `+refs/heads/${side}:refs/remotes/origin/${side}`]).status === 0) parent = out(run(['rev-parse', `refs/remotes/origin/${side}`]));
  const commit = out(run([...id, 'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Tovi before/after pictures for ${branch}`]));
  if (!commit) return null;
  return run(['push', '-q', 'origin', `${commit}:refs/heads/${side}`]).status === 0 ? commit : null;
}
