#!/usr/bin/env node
// The review queue in one table (docs/qa/README.md, "QA tooling").
//
//   node scripts/qa-queue.mjs [--no-merge]
//
// For every open PR into idea-map: head, commits behind, files a merge into the
// current idea-map would conflict on, CI on the head, the latest QA verdict (a
// "# QA report" PR comment) and the commit it reviewed, and whether the PR's own
// changes are the same now as at that commit (a sync that only merged idea-map keeps
// a PASS; docs/qa/README.md, "Evidence and merge completion"). Read-only: it never
// pushes, comments or changes task status. --no-merge skips the local merge test.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'tenkevin/mind-your-tutor';
const BASE = 'idea-map';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const noMerge = process.argv.includes('--no-merge');

const sh = (cmd, argv, cwd = root) =>
  execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).trim();
const ok = (cmd, argv, cwd = root) => spawnSync(cmd, argv, { cwd, encoding: 'utf8' }).status === 0;
const git = (...a) => sh('git', a);
const gh = (path) => JSON.parse(sh('gh', ['api', path]));
const short = (s) => (s ? s.slice(0, 7) : '—');

if (git('rev-parse', '--is-shallow-repository') === 'true') git('fetch', '--quiet', '--unshallow', 'origin');
git('fetch', '--quiet', 'origin', BASE);
const base = git('rev-parse', `origin/${BASE}`);

const prs = gh(`repos/${REPO}/pulls?base=${BASE}&state=open&per_page=100`);
for (const p of prs) git('fetch', '--quiet', 'origin', `pull/${p.number}/head:refs/remotes/qa-queue/pr${p.number}`);

// The PR's own changes: its diff against where it branched from idea-map.
const ownFiles = (sha) => {
  const mb = git('merge-base', base, sha);
  return git('diff', '--name-only', mb, sha).split('\n').filter(Boolean);
};

// Same task change at `reviewed` and `head`? Compares each of the PR's files as the PR
// left it, ignoring changes that came in from idea-map through a sync.
function sameSince(reviewed, head) {
  if (!reviewed) return '—';
  if (reviewed === head) return 'same head';
  if (!ok('git', ['cat-file', '-e', `${reviewed}^{commit}`])) return 'reviewed commit not found';
  const files = new Set([...ownFiles(reviewed), ...ownFiles(head)]);
  const changed = [];
  const mbOld = git('merge-base', base, reviewed);
  const mbNew = git('merge-base', base, head);
  for (const f of files) {
    if (f.startsWith('docs/')) continue;
    const blob = (rev) => spawnSync('git', ['rev-parse', `${rev}:${f}`], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const [a, b] = [blob(reviewed), blob(head)];
    if (a === b) continue;
    // Changed between reviewed and head: fine only if idea-map made exactly that change.
    if (blob(mbOld) !== blob(mbNew) && b === blob(mbNew)) continue;
    changed.push(f);
  }
  return changed.length ? `CHANGED: ${changed.slice(0, 4).join(' ')}${changed.length > 4 ? ' …' : ''}` : 'task code unchanged';
}

function mergeTest(sha) {
  if (noMerge) return 'not tested';
  const dir = mkdtempSync(join(tmpdir(), 'qa-queue-'));
  try {
    sh('git', ['worktree', 'add', '--quiet', '--detach', dir, base]);
    if (ok('git', ['merge', '--no-commit', '--no-ff', sha], dir)) return 'clean';
    const files = spawnSync('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    return `CONFLICT: ${files.split('\n').join(' ') || '(see git merge)'}`;
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: root });
    rmSync(dir, { recursive: true, force: true });
  }
}

const rows = [];
for (const p of prs.sort((a, b) => a.number - b.number)) {
  const head = p.head.sha;
  const behind = gh(`repos/${REPO}/compare/${BASE}...${head}`).behind_by;
  const runs = gh(`repos/${REPO}/commits/${head}/check-runs`).check_runs;
  const ci = runs.length
    ? runs.every((r) => r.status === 'completed')
      ? runs.every((r) => r.conclusion === 'success')
        ? 'green'
        : `RED (${runs.filter((r) => r.conclusion !== 'success').map((r) => r.name).join(', ')})`
      : 'running'
    : 'none';
  const comments = gh(`repos/${REPO}/issues/${p.number}/comments?per_page=100`);
  const qa = comments.filter((c) => c.body.startsWith('# QA report')).at(-1);
  const verdict = qa ? (qa.body.match(/Verdict:?\**\s*\**([A-Z][A-Z /]+)/) || [])[1]?.trim() || '?' : '—';
  const reviewed = qa ? (qa.body.match(/commit `?([0-9a-f]{7,40})/) || [])[1] : null;
  const reviewedFull = reviewed && ok('git', ['cat-file', '-e', `${reviewed}^{commit}`]) ? git('rev-parse', reviewed) : reviewed;
  rows.push(
    `| #${p.number} | ${p.head.ref.replace(/^task\//, '')} | \`${short(head)}\` | ${behind} | ${mergeTest(head)} | ${ci} | ${verdict} | \`${short(reviewedFull)}\` | ${sameSince(reviewedFull, head)} |`,
  );
}

console.log(`Review queue · ${BASE} @ \`${short(base)}\` · ${new Date().toISOString().slice(0, 16)}Z\n`);
console.log('| PR | Branch | Head | Behind | Merge into idea-map | CI on head | Last QA | QA on | Task code since QA |');
console.log('|---|---|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log('\nCodex reviews are files in docs/qa/codex/ (see docs/qa/codex-ledger.json); this table reads only PR-comment reports.');
