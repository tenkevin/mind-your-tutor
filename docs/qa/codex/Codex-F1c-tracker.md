Reviews: F1, F1b, F1c

# Codex F1c: platform and tracker regression QA

Reviewed commit: `098ee229ca6f0a4eed8e6fd694fe9cadd4fd1864`.
Review date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review. Node 22.22.0 / pnpm 10.28.0. This is the initial pinned-commit review, not a rerun against later commits. Publication context was inspected at `92963ed9bee24c3451c8d081885bb723320906ba`. No implementation changes or task-status changes were made.

Routing: only entries under **Errors** are proposed must-fix defects. **Suggestions** are nonblocking follow-ups. IDs below identify findings, not newly claimed plan tasks. Check overlapping C8/C9 work before scheduling duplicate fixes.

## Validation and limits

**Verdict: specified F1b/F1c checks PASS; architectural guard hardening below.** All root checks pass. Tracker159 tests, contracts205, API2. Exact-head CI build/check success; build45s. Lint0.98s and tracker tests1.28s. Independent mutation checks reject production test-file reexports in lint AND dist build, and reject prototype-constructor clock access in runtime guard. Other historical alias/computed/spread/import/global probes reject as required. Mutations restored; worktree clean.

Workflow permissions are contents:read and actions SHA-pinned. Full/prod dependency audits clean; read-only gitleaks scan of initial idea-map history found no secrets. API health200, unknown routes fixed404; dev apps no failed requests. Historical CI-red PR evidence was inspected; no new PR was created.

Coordinator fresh container at **base `ccdce4918961b243aef7afe443bc0beaeffb1564`**, not F1c head: Node22.22.0, corepack/pnpm10.28.0, 233 packages downloaded without a shared store; frozen/normal installs, lint, format, typecheck, tests, build and plan check all pass, clone clean. Container-local ownership trust was needed only for the read-only local clone fixture. This supplements original agent fresh-container coverage limitations.

## Errors

No additional mandatory F1b/F1c criterion failure confirmed. The transitive-I/O result below is classified as an architectural enforcement suggestion with explicit scope; it is not evidence that current production tracker code performs I/O.

## Suggestions

### F1c-S1 — Cover transitive I/O and resolved dependency boundaries (prior TR-1)

Source: runtime-guard.test.ts around147–220 and import allowlist in eslint.config.js.

Controlled, reverted probe on reviewed head: a domain helper calls readFileSync on a harmless local file; tracker imports it via an allowed relative path into domain/dist and exports it as the existing scaffold packageName function. Domain build0, lint of tracker/domain0, named runtime guard41/41 PASS, tracker build0. The guard invokes the helper without recording I/O. The unrelated scaffold-name test would fail because packageName was deliberately changed: **this is not a claim that the entire mutated suite passes**.

Expected broader architecture: forbidden I/O in imported helpers is detected. The narrow F1c required API list passes. Suggested improvement: constrain resolved relative imports and enforce transitive forbidden I/O with a tested guard/loader policy. Regression: permitted helper attempts a harmless filesystem read and the guard must fail, alongside representative other I/O entry points.

**Integration caveat:** C2 later added domain no-I/O lint; that may reject the exact temporary helper in the merged tree. Revalidate the combined dependencies. The finding concerns the pinned guard's limitations, not a proven final-tree bypass.

### F1c-S2 — Keep evidence scope explicit

Retain the regression mutations for the fixed bypasses, and keep dependency/CI checks tied to exact heads. Test the actual final integration rather than inferring it from separately green branches. Cosmetic favicon.ico behavior and pnpm setup warnings are historical low-priority items, not new blockers.

## Coordinator assessment

The follow-up tracker work closed the specified earlier gaps. Remaining concern is overclaiming the guard's reach into dependencies; the current scaffolding itself did not demonstrate nondeterministic behavior.
