# QA report: S5 · UDL 3.0 baseline (PR #26)

**Tester:** `qa-s5` (independent; did not write this code)
**Head tested:** `eac048de5ad6afd03b9e01cbeab9f24118942a5e`
**Combined tree:** that head merged in scratch with `origin/idea-map` `f02a22325ee2588b5f8e75b06ea060ea92dd5b22`. The merge was clean (local merge commit `dad2c71`, not pushed).
**Browser:** Chromium 153.0.8010.12 from `/opt/pw-browsers` (Playwright `channel: 'chromium'`, new headless), serving `apps/student` `dist/` via `vite preview`. axe-core 4.10.3, WCAG 2.0/2.1 A+AA tags.
**Database:** local throwaway Postgres 16.15 with pgvector (`postgresql-16-pgvector` installed with apt). Every DB test ran; none were skipped.

## Verdict: **FAIL**, on S5-U1 (keyboard and screen-reader focus handling)

Every other check passes. The fixes are small and all in `SpeakOrType`, `ReadAloud` and `Feedback`. Merge gate note: the PR head is 4 commits behind `idea-map` (docs and plan only, and it merges cleanly). It needs `origin/idea-map` merged in before it can merge.

## Results

| Id | Result | Evidence |
|---|---|---|
| S5-F1 Read-aloud | PASS (stubbed speech) | Tested on the idea (`IdeaText`), the quiz question and the feedback message. Each `speak()`s its own text with the on-device voice ("Local en"; the cloud voice in the stub is never chosen). Highlight starts on word 1, and a `boundary` event moves it ("warms", "vapour", "heat,"). Pause shows "Keep going", Resume works, and Stop clears the highlight and brings back the play button. "Slower" sets rate 0.75. With only a non-local voice, the read controls are hidden and the text stays on screen. **Stubs:** headless Chromium has 0 voices, so the speech-synthesis tests used an injected `speechSynthesis` stub with one local and one cloud voice. Real Chromium hides the controls correctly with 0 voices. |
| S5-F2 Text and visual | PASS | The idea with media has an `img` with alt text and a `figcaption`, and the text paragraph is always rendered. The idea without media shows text only. `Media.alt` is required by its type. Mission state appears as a word ("Ready / To do / Locked / Done") plus an icon, not as colour alone. |
| S5-F3 Spoken input | PASS (stubbed recognition) | Free-text answer: the typed "Water goes" plus the dictated "up into the air when it is hot" fills the box. Nothing is sent until Send is pressed (the log was empty before Send). The student edited the text, then sent it. Challenge: an interim transcript fills the box and is sent only by "Send to my teacher". Typed input with Ctrl+Enter works. Recognition is created with `processLocally = true`, `lang en-US`. When the stub reports `available → 'unavailable'`, the Talk button is hidden and typing still works. **Stubs:** recognition was stubbed. Real Chromium reports `available({processLocally:true}) = 'downloadable'`, and its no-stub behaviour is under "Found during testing". |
| S5-F4 Choice and pacing | PASS | MissionPicker logs "Mission chosen: quiz-cond". The locked mission is `aria-disabled`, says "Master 2 more ideas first" and does nothing on click or Enter. StepFlow: Next moves focus to the step heading. "Take a break" shows "Your place is saved. You were on: Find an example." After a **page reload** it is still on step 2, paused. "Keep going" resumes, and Finish clears the stored place (`localStorage` key is null). |
| S5-F5 200% / reduced motion | PASS | No horizontal scroll and no off-screen or clipped elements at: browser zoom 200% (640 CSS px viewport at DPR 2), in-app "Biggest" (`--udl-scale: 2`, text 15→30 px), both combined, and 320 px reflow. `prefers-reduced-motion: reduce` and "Calm screen" (`data-motion=reduce`) each leave 0 animated or transitioning elements while listening. Without either, only the mic icon pulse animates. |
| S5-F6 Checklist | PASS | `docs/qa/README.md` gains "UDL 3.0 checklist (student-facing tasks)". It has Engagement, Representation, Action and expression, plus Privacy, as **must** checks (`<ID>-U<n>`) for any task that changes what a student sees or does. |
| S5-F7 Everything passes | PASS | On the combined tree: `pnpm install --frozen-lockfile`, `lint`, `format:check`, `typecheck`, `test` (with `DATABASE_URL`), `build`, `node scripts/plan.mjs check` ("plan: ok") and migrations twice (second run "nothing to do") all exit 0. Test counts: db 169, api 71, contracts 217, tracker 172, domain 96, connectors 118, ui 78, student 35, teacher 22, worker 18, ai 6. `function_binding.test.ts` ran verbosely, and its 4 tests pass. CI on `eac048d`: `build` and `check` both success. |
| S5-S1 No new tracking | PASS | After load, using read-aloud, voice answer, voice challenge, missions, steps and display settings sent no requests except same-origin static GETs (html, js, css, svg, woff2, favicon). There were 0 POSTs and 0 off-origin requests, both stubbed and in real Chromium. The UDL code has no `fetch`, `sendBeacon`, XHR, WebSocket, `MediaRecorder`, tracker or contracts import. |
| S5-S2 Mic permission | PASS (see U1) | Before the press: 0 recognisers constructed and 0 `getUserMedia` calls (`available()` is queried, which does not touch the mic). Pressing Talk shows the explanation first, still with 0 mic access: "Talk instead of typing… Your voice stays on this device: it is not recorded or sent. Your browser will ask if this page can use the microphone." The mic is requested only on "Start talking". "Not now" backs out. |
| S5-P1 Low-end device | PASS | With 4x CPU throttle (CDP `Emulation.setCPUThrottlingRate 4`), 5 cold first presses measured in-page: click → `speechSynthesis.speak()` took 0.9–5.6 ms, and click → painted Pause plus highlight took 23–36 ms. 8 warm presses: `speak()` within 0.1–1.2 ms. Size: the `src/udl` bundle with React external is 18.15 kB min, **5.72 kB gzipped**, and `udl.css` is 1.9 kB gzipped. That is about 7.6 kB, under 30 kB. (The built `udl-*.js` 73 kB gzip chunk is the shared React runtime chunk, not the components.) |
| S5-U1 WCAG 2.1 AA | **FAIL** | axe: 0 violations in 7 states (initial, reading, mic explainer, challenge open, 320 px, 200%+Biggest). The only "incomplete" items are the empty textareas, so I measured them by hand: placeholder 5.25:1, text 12.55:1. 104 element×state combinations (rest, hover, active, focus via CDP `forcePseudoState`) on every button, segment and checkbox label: all text ≥ 4.5:1, and focus rings are 4.71:1. No D10 pair is hit (buttons render on the card surface, and the failing D10 states did not appear in measurement), and there are no new failing pairs. Keyboard: every control is reachable in a logical order with a visible 2 px ring, and radios work with arrow keys. **But focus is dropped to `<body>` in 7 transitions** (details below). In the main voice flow, pressing **Talk** with the keyboard and then Tab **skips the new "Start talking" and "Not now" buttons and the Send button**, landing on the next card's "Read to me". The explanation also isn't announced. This fails WCAG 2.4.3 Focus Order for the keyboard and screen-reader check this criterion requires. |
| S5-U2 K-2 friendly | PASS | All 30 controls measured are ≥ 44×44 px. Checkbox and radio targets are their labels: "Slower" 80×44, "Big" 48×44. Every control with an icon has a visible text label (0 icon-only). Wording is short and plain: "Read to me", "Slower", "Keep going", "Talk", "Not now", "Take a break", "Words on the page: Normal / Big / Biggest", "Calm screen (no moving parts)", "I didn't hear anything. Try again, or type." |

### S5-U1 detail: focus lost to `<body>` (keyboard Enter on each control)

| Action | Focus after |
|---|---|
| ReadAloud **Stop** | BODY (Stop button unmounts) |
| SpeakOrType **Talk** (opens explainer) | BODY. Tab goes to the *next card's* "Read to me", skipping "Start talking", "Not now" and "Send" |
| Explainer **Not now** | BODY |
| Explainer **Start talking** | BODY |
| SpeakOrType **Send** | BODY (Send becomes disabled when the box clears) |
| Feedback **Challenge this** | BODY (the new text box isn't focused) |
| Feedback **Send to my teacher** | BODY (replaced by the status line) |

These were fine: Read to me → Pause, Pause → Keep going, Stop talking → Talk, and every StepFlow change (focus moves to the step heading).

Screen reader: no real screen reader exists in this container. I used the Chromium accessibility tree (Playwright `ariaSnapshot` and CDP `Accessibility.getFullAXTree`) as a proxy. Roles and names are good: the "Read aloud" group, `progressbar "Step 2 of 3"`, the locked mission exposed as disabled with "Locked" in its name, and the "Words on the page" group. Two problems:
- `.udl-status:empty { display: none }` removes the `role=status` region from the accessibility tree until it has text (0 status nodes before listening, 1 after). A live region that appears with its text already in it is often not announced. That affects "I'm listening…" and the mic error messages. Feedback's "Sent to your teacher" status is also mounted with its text already in it.
- The mic explainer (`role=note`) appears with no focus move and no announcement.

**Suggested fix (for the author):**
- Move focus to "Start talking" when the explainer opens.
- Return focus to Talk on Not now or Start talking, to the text box after Send or Challenge this, to the play button after Stop, and to the status after "Send to my teacher".
- Keep each `role=status` element in the accessibility tree while empty, for example visually empty but not `display: none`.

## Found during testing

1. **Dictation can hang with a dead "Stop talking" button (real Chromium, no stubs). Should fix.** Real Chromium 153 reports on-device recognition as `'downloadable'`, so `start()` awaits `install()`. Here it never resolved, and after 15 s the button still read "Stop talking" (`aria-pressed=true`, icon pulsing) with an empty status. Pressing it does nothing, because `Dictation.stop()` is a no-op while `rec` is null in the `'starting'` state. There's no message telling the student. Typing and Send still work. The fix: make Stop cancel a pending start, show a "Getting ready to listen…" status, and/or time out to the `not-on-device` message.
2. **Headless-shell renderer crash (browser bug, for awareness).** In Playwright's default `chromium_headless_shell` 153, `SpeechRecognition.available({processLocally:true})` crashes the renderer ("Target crashed"). `SpeakOrType` calls it on mount, so any page with that component crashes there, including `udl-reference.html`. The same call with `processLocally:false` doesn't crash, and full Chromium new-headless is fine (`'downloadable'`). It doesn't affect real users, but future Playwright and e2e suites for student pages must use `channel: 'chromium'` or stub `SpeechRecognition`.
3. **Language-pack download is browser-level traffic.** When the pack is `'downloadable'`, `install()` asks the browser to fetch Chrome's on-device speech model. No page-level requests were observed (and none carry audio), but it is a one-time browser download on first Talk. It may be worth one line in the explainer or in the §10 data inventory.
4. **Minor:** StepFlow restores "paused" only for steps > 0, so a break taken on step 1 comes back as not paused after a reload (the place itself is kept). Low impact.
5. **Merge gate:** the head is 4 commits behind `idea-map` (`cd49565`, `1d3eef1`, `0b80b2b`, `f02a223`: docs and plan). It merges cleanly, and all gates pass on the combined tree.

## Not run / limits

- No real screen reader (NVDA, VoiceOver, ChromeVox) is available. I used the accessibility-tree proxy described above.
- No real voices or mic in the container. Read-aloud and recognition behaviour was verified with injected Web Speech stubs. Real-API behaviour checked: 0 voices hides read-aloud, and recognition is `'downloadable'` (finding 1).
- The 4x CPU throttle is CDP emulation, not a physical Chromebook.


---
_Generated by [Claude Code](https://claude.ai/code)_
