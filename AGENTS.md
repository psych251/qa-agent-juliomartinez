# Psych 251 experiment template

A jsPsych 8 web experiment served from GitHub Pages, saving data to the student's own
Firebase (Firestore) project. Read `docs/student-guide.md` for the human workflow and the
skills in `.claude/skills/` for the detailed procedures.

## Layout
- `index.html` loads vendored libraries from `lib/` and runs `experiment.js`. No build step.
- `experiment.js` is the timeline. Settings live in the `EXPERIMENT` object at the top.
- `src/save.js` (`DataSaver`) handles anonymous auth, chunked trial writes, error logging,
  and an offline fallback. Do not bypass it with ad-hoc Firestore calls.
  Each page load gets its own participant document, named `<auth uid>-<run id>`, so a
  reload or a second run never overwrites an earlier one. Use `saver.docId` (not
  `saver.uid`) wherever a participant id is needed, including
  `jsPsych.data.addProperties`, or trials will not join to participants on export.
- `firebase-config.js` is the pasted web-app config. It is public by design.
- `firebase/firestore.rules` are create-only, keyed to the anonymous uid. Never loosen them
  to `allow read, write: if true`; debug with the emulator instead (`npm run emulators`).
- `scripts/export.js` pulls data to CSV with the Admin SDK (needs a service-account key,
  which is gitignored and must never be committed).
- `analysis/analysis.Rmd` is the R analysis stub.
- `tests/experiment.spec.js` is a Playwright robot that plays the whole experiment.

## Commands
- `npm start` serves the site at http://localhost:8000 (needed: `file://` won't work for Firebase).
- `npm test` runs the emulator + Playwright end to end (10 tests). Run it before every push.
  It installs a test browser on first use; needs Java 17+ for the emulator.
- `npm run export -- --experiment <id>` exports data.
- `npm run vendor` and `npm run bundle:firebase` refresh `lib/` after dependency upgrades.

## Rules for agents
- jsPsych is **version 8**: plugins are globals like `jsPsychHtmlKeyboardResponse`,
  `initJsPsych()` returns the instance, timeline variables via `jsPsych.timelineVariable()`
  (in `data`) or `jsPsych.evaluateTimelineVariable()` (inside functions). Check
  `lib/VERSIONS.json` before writing plugin code. Do not use CDN links; add plugins to
  `scripts/vendor.js` and run `npm run vendor`.
- Every timeline starts with the consent trial and ends with the debrief trial.
- `EXPERIMENT.requires_keyboard` turns away phones and tablets before consent. Leave it
  true for any study with keyboard trials; set it false only for a pure button/typing study.
- Test runs (`?emulator=1`) must never navigate away from the page: the Prolific redirect is
  suppressed there so that setting a completion code cannot break the suite.
- Change `EXPERIMENT.id` when moving from pilot to real data collection.
- When editing the timeline, update `runThroughExperiment` in the test so it still passes.
- Never commit `*service-account*.json`, exported data with identifiers, or a loosened rules file.
