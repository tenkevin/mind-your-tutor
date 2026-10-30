#!/usr/bin/env node
// QA setup in one command (docs/qa/README.md, "QA tooling").
//
//   node scripts/qa-prep.mjs <PR number> [--task <ID>] [--dir <path>] [--skip-ci]
//
// Tests a PR as it would land: fetches full history, merges the PR head into the
// current origin/idea-map in a scratch worktree, starts Postgres with pgvector on a
// fresh database, runs CI's own steps in order (read from .github/workflows/ci.yml),
// re-runs failed packages alone, tags known timing-only tests, and writes a report
// skeleton with every check from docs/qa/<ID>.md. It never pushes and never changes
// task status. Exit codes: 0 all steps passed, 1 a step failed, 2 merge conflict,
// 3 setup problem.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'tenkevin/mind-your-tutor';
const BASE = 'idea-map';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Timing-only tests known to overrun under load (docs/qa/STATUS.md). A failure here is
// re-run alone and reported as known noise, never as a finding on its own.
const KNOWN_TIMING = [
  'zip bomb',
  'S10b-P1',
  'C2-P2',
  'C3-P1',
  'C3-P2',
  'F5-P1',
  'p95',
  'T2-F2',
  'T2-F5',
  'T2-F7',
];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const pr = Number(args[0]);
if (!Number.isInteger(pr) || pr <= 0) {
  console.error('usage: node scripts/qa-prep.mjs <PR number> [--task <ID>] [--dir <path>] [--skip-ci]');
  process.exit(3);
}

function sh(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
function trySh(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
}
function die(msg, code = 3) {
  console.error(`qa-prep: ${msg}`);
  process.exit(code);
}
const git = (...a) => sh('git', a, { cwd: root });
const gh = (path) => JSON.parse(sh('gh', ['api', path]));

// 1. The PR and its task.
const info = gh(`repos/${REPO}/pulls/${pr}`);
if (info.base.ref !== BASE) die(`PR #${pr} targets ${info.base.ref}, not ${BASE}`);
const head = info.head.sha;
const ref = info.head.ref;
const task = opt('--task') || (ref.match(/^task\/([A-Za-z0-9]+)-/) || [])[1] || null;
console.log(`PR #${pr} ${ref} @ ${head.slice(0, 7)}${task ? ` (task ${task})` : ''}`);

// 2. Full history (a shallow clone can't merge older PR bases), then the scratch merge.
if (git('rev-parse', '--is-shallow-repository') === 'true') {
  console.log('Fetching full history (shallow clone)…');
  git('fetch', '--quiet', '--unshallow', 'origin');
}
git('fetch', '--quiet', 'origin', BASE, ref);
const base = git('rev-parse', `origin/${BASE}`);
const dir = opt('--dir') || join(process.env.TMPDIR || '/tmp', `qa-pr${pr}-${head.slice(0, 7)}`);
const out = join(dir + '-logs');
mkdirSync(out, { recursive: true });
if (existsSync(dir)) trySh('git', ['worktree', 'remove', '--force', dir], { cwd: root });
git('worktree', 'add', '--quiet', '--detach', dir, base);
const merge = trySh('git', ['merge', '--no-ff', '--no-edit', '-m', `QA scratch: merge PR #${pr} into ${BASE}`, head], { cwd: dir });
if (!merge.ok) {
  const files = trySh('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: dir }).out.trim();
  trySh('git', ['merge', '--abort'], { cwd: dir });
  console.log(`\nBLOCKED: PR #${pr} @ ${head.slice(0, 7)} conflicts with ${BASE} @ ${base.slice(0, 7)} in:\n${files || merge.out}`);
  console.log('Do not resolve it for the builder. Report BLOCKED with this list.');
  process.exit(2);
}
const tree = trySh('git', ['rev-parse', 'HEAD'], { cwd: dir }).out.trim();
console.log(`Merged cleanly onto ${BASE} @ ${base.slice(0, 7)} → scratch ${tree.slice(0, 7)} in ${dir}`);

// 3. Postgres 16 with pgvector and a fresh database.
function psql(sql, db = 'postgres') {
  return trySh('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', db, '-tAc', sql], {
    env: { ...process.env, PGPASSWORD: 'postgres' },
  });
}
if (!trySh('pg_isready', ['-h', '127.0.0.1']).ok) {
  trySh('service', ['postgresql', 'start']);
  for (let i = 0; i < 20 && !trySh('pg_isready', ['-h', '127.0.0.1']).ok; i++) spawnSync('sleep', ['1']);
}
if (!trySh('pg_isready', ['-h', '127.0.0.1']).ok) die('Postgres is not running and `service postgresql start` did not start it');
if (!psql('select 1').ok) {
  // A fresh container's postgres user may have no password yet.
  trySh('su', ['postgres', '-c', `psql -c "alter user postgres password 'postgres'"`]);
}
const hasVector = () => psql("select 1 from pg_available_extensions where name = 'vector'").out.trim() === '1';
if (!hasVector()) {
  const major = psql('show server_version_num').out.trim().slice(0, 2) || '16';
  console.log(`Installing pgvector for Postgres ${major}…`);
  trySh('apt-get', ['install', '-y', '-q', `postgresql-${major}-pgvector`]);
  if (!hasVector()) {
    trySh('apt-get', ['update', '-q']);
    trySh('apt-get', ['install', '-y', '-q', `postgresql-${major}-pgvector`]);
  }
  if (!hasVector()) die('pgvector is not available; install postgresql-<major>-pgvector and re-run');
}
const db = `qa_pr${pr}_${Date.now()}`;
if (!psql(`create database ${db}`).ok) die(`could not create database ${db}`);
const DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:5432/${db}`;
console.log(`Fresh database: ${DATABASE_URL}`);

// 4. CI's own steps, in order.
function ciSteps() {
  const lines = readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8').split('\n');
  const steps = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    if (m[2] !== '|') {
      steps.push(m[2]);
      continue;
    }
    const block = [];
    const indent = m[1].length;
    while (i + 1 < lines.length && (lines[i + 1].trim() === '' || lines[i + 1].search(/\S/) > indent)) {
      block.push(lines[++i].trim());
    }
    steps.push(block.filter(Boolean).join(' && '));
  }
  return steps;
}
const env = { ...process.env, DATABASE_URL, CI: 'true' };
const results = [];
if (!args.includes('--skip-ci')) {
  for (const [n, step] of ciSteps().entries()) {
    const log = join(out, `${String(n + 1).padStart(2, '0')}-${step.split(' ').slice(0, 3).join('-').replace(/[^\w-]/g, '')}.log`);
    process.stdout.write(`▶ ${step} … `);
    const t = Date.now();
    const r = spawnSync('bash', ['-c', step], { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 28 });
    writeFileSync(log, `${r.stdout || ''}${r.stderr || ''}`);
    const ok = r.status === 0;
    console.log(`${ok ? 'ok' : `FAIL (exit ${r.status})`} in ${Math.round((Date.now() - t) / 1000)} s · ${log}`);
    results.push({ step, ok, log });
  }

  // 5. Failed test packages, re-run alone, with known timing tests tagged.
  const testRun = results.find((r) => /\bpnpm test\b/.test(r.step) && !r.ok);
  if (testRun) {
    const text = readFileSync(testRun.log, 'utf8');
    const pkgs = [...new Set([...text.matchAll(/(@ideamap\/[\w-]+)(?:@[\w.-]+)? test/g)].map((m) => m[1]))];
    const failing = text.split('\n').filter((l) => /(FAIL|×|✗)\s/.test(l));
    const known = failing.filter((l) => KNOWN_TIMING.some((k) => l.includes(k)));
    console.log(`\nFailing test lines: ${failing.length} (known timing: ${known.length})`);
    for (const l of failing.slice(0, 30)) console.log(`  ${KNOWN_TIMING.some((k) => l.includes(k)) ? '[known timing] ' : ''}${l.trim()}`);
    for (const pkg of pkgs) {
      const log = join(out, `solo-${pkg.replace('@ideamap/', '')}.log`);
      process.stdout.write(`▶ solo re-run ${pkg} … `);
      const r = spawnSync('pnpm', ['--filter', pkg, 'test'], { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 28 });
      writeFileSync(log, `${r.stdout || ''}${r.stderr || ''}`);
      console.log(`${r.status === 0 ? 'ok' : 'FAIL'} · ${log}`);
    }
  }
}

// 6. Report skeleton from the task's criteria.
const report = join(out, 'report.md');
const rows = [];
if (task && existsSync(join(dir, 'docs/qa', `${task}.md`))) {
  for (const line of readFileSync(join(dir, 'docs/qa', `${task}.md`), 'utf8').split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (c.length > 4 && new RegExp(`^${task}-[FSPU]\\d+$`).test(c[1])) rows.push(`| ${c[1]} | ${c[2]} | | ${c[3]} | |`);
  }
}
const ciTable = results.map((r) => `| \`${r.step}\` | ${r.ok ? 'exit 0' : 'FAIL'} | \`${r.log}\` |`).join('\n');
writeFileSync(
  report,
  `# QA report: ${task || '<ID>'} · PR #${pr} · commit ${head}
Verdict: <PASS | FAIL | STRUCTURAL PASS | STRUCTURAL FAIL | BLOCKED>
Tester: <qa agent name> · Date: ${new Date().toISOString().slice(0, 10)}

**Reviewed head:** \`${head.slice(0, 7)}\` · **idea-map:** \`${base.slice(0, 7)}\` · **scratch merge:** \`${tree.slice(0, 7)}\` (clean)

## CI steps on the merged tree (fresh database \`${db}\`)

| Step | Result | Log |
|---|---|---|
${ciTable || '| (skipped) | | |'}

## Checks (\`docs/qa/${task || '<ID>'}.md\`)

| Check | Weight | Result | What | Evidence |
|---|---|---|---|---|
${rows.join('\n') || '| | | | | |'}

## Found during testing

---
_Generated by [Claude Code](https://claude.ai/code)_
`,
);
console.log(`\nReport skeleton: ${report}`);
console.log(`Scratch worktree: ${dir} (remove with: git worktree remove --force ${dir})`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
