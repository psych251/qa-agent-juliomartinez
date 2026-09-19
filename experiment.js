/*
 * Stroop task (pilot), built on the Psych 251 template. The timeline is wired to DataSaver
 * (src/save.js), which writes to your Firebase project.
 *
 * Design
 *   IV        congruency (congruent vs incongruent), within-subjects. No between-subjects condition.
 *   DVs       rt (ms) and correct, on rows with task "stroop". Each row also carries word, ink,
 *             congruency, correct_key, response and timed_out.
 *   Trials    6 practice trials with feedback (task "stroop_practice"), then 24 test trials:
 *             12 congruent (each color word 4x) + 12 incongruent (each of the 6 mismatched
 *             word/ink pairs 2x), so every ink, word and correct key appears 8 times.
 *             500 ms fixation, then the word until a key press or 2000 ms.
 *             Keys name the ink: R = red, G = green, B = blue.
 *   Order     practice and test order are each fully randomized per participant.
 *   Exclude   example criteria in analysis/analysis.Rmd (no responses, < 75% correct on test
 *             trials, RTs under 200 ms). Replace them with the preregistered ones.
 *
 * Timeline
 *   1. consent        course-wide consent text (required at the start of every study)
 *   2. welcome
 *   3. demographics   a multi-question survey page (jsPsych "survey" plugin, SurveyJS)
 *   4. instructions   how the color task works
 *   5. practice       6 trials, each followed by feedback
 *   6. test           24 trials, no feedback
 *   7. debrief        saves data, then shows thanks or redirects to Prolific
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
window.TEMPLATE_VERSION = "0.1.0";

const EXPERIMENT = {
  // Firestore path: experiments/<id>/participants/... Change it when you start a new study
  // so pilot data and real data never mix (e.g. "smith2016-pilot-a", "smith2016-final").
  id: "stroop-pilot-a",

  // Trials per Firestore write. 1 = save every trial the moment it finishes (dropouts leave
  // partial data). The free tier allows 20,000 writes/day: with 200 participants x 100 trials
  // you would exceed it, so raise this for long trial-based tasks (e.g. 20).
  chunk_size: 1,

  // Also store the complete jsPsych dataset on the participant document at the end.
  // Costs one extra write and makes export robust; turn off if trials are very large.
  save_full_data_at_end: true,

  // Prolific: if set, participants are redirected to Prolific when they finish.
  // Leave empty for local testing or non-Prolific samples.
  prolific_completion_code: "",

  // Contact shown in consent and debrief.
  contact_email: "stanfordpsych251@gmail.com",

  // Does this study need a physical keyboard? This one does (the color task uses R, G and B).
  // On a phone or tablet no keyboard appears, so a participant cannot answer those trials;
  // they would time out silently and the session would still look complete. When true, such
  // devices are turned away before consent. Set to false if your study is buttons/touch only.
  requires_keyboard: true,
};

// Stroop colors: the ink shown for each color, and the key that names it.
// The hex values are dark enough to read clearly on the white page.
const INKS = { red: "#d00000", green: "#008000", blue: "#0033ff" };
const KEYS = { red: "r", green: "g", blue: "b" };
const COLORS = Object.keys(INKS);

// True on anything with a mouse, trackpad, or stylus, including laptops with touchscreens.
// False on phones and tablets without a pointing device, which are also the devices with no
// physical keyboard. See docs/student-guide.md "Devices".
function hasFinePointer() {
  return !!(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches);
}

// `?emulator=1` in the URL sends data to the local emulator instead of the real project.
// Used by `npm test`; handy for development too (start it with `npm run emulators`).
const URL_PARAMS = new URLSearchParams(window.location.search);
const USE_EMULATOR = URL_PARAMS.get("emulator") === "1";
// `?chunk_size=N` overrides the setting above; used by the test suite to exercise chunked writes.
const CHUNK_SIZE = Number(URL_PARAMS.get("chunk_size")) || EXPERIMENT.chunk_size;
// Test-only: `?cc=CODE` sets a Prolific completion code during emulator runs, so the test
// suite can check the screen a participant sees once you have set yours. Ignored in live runs.
if (USE_EMULATOR && URL_PARAMS.get("cc")) EXPERIMENT.prolific_completion_code = URL_PARAMS.get("cc");

// ---------------------------------------------------------------------------
// Boot: connect the saver first so even a crash in the first trial gets logged.
// ---------------------------------------------------------------------------
(async function main() {
  const deviceSupported = !EXPERIMENT.requires_keyboard || hasFinePointer();

  const saver = await DataSaver.init({
    experiment_id: EXPERIMENT.id,
    chunk_size: CHUNK_SIZE,
    save_full_data_at_end: EXPERIMENT.save_full_data_at_end,
    use_emulator: USE_EMULATOR,
  });
  window.__saver = saver; // for debugging and the automated test

  // Record the device verdict on the participant document before anything else, so a
  // participant turned away below is still visible in the data rather than simply absent.
  saver.updateParticipant({ device_supported: deviceSupported, requires_keyboard: EXPERIMENT.requires_keyboard });

  if (!deviceSupported) {
    document.body.innerHTML =
      '<div id="device-unsupported" class="jspsych-content" style="max-width:640px;margin:15vh auto;font:16px/1.6 system-ui,sans-serif;">' +
      "<h2>Please use a computer</h2>" +
      "<p>This study needs a computer with a physical keyboard, because part of it is answered " +
      "by pressing keys. Phones and tablets cannot be used.</p>" +
      "<p>Please reopen this link on a laptop or desktop computer. If you were sent here from " +
      "Prolific, you can return the study and take it later on a computer; nothing has been recorded " +
      "against you.</p>" +
      "<p>Questions: <a href=\"mailto:" + EXPERIMENT.contact_email + "\">" + EXPERIMENT.contact_email + "</a></p></div>";
    return;
  }

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    auto_update_progress_bar: true,
    on_data_update: (trial) => saver.onTrial(trial),
    on_finish: async () => {
      const el = jsPsych.getDisplayElement();
      el.innerHTML = '<div id="finish-message"><p class="thanks">Saving your responses…</p></div>';
      // finish() flushes remaining trials, marks the participant complete, and (only if
      // saving failed) appends a download-fallback box to the display element.
      const result = await saver.finish(jsPsych);
      const consentRow = jsPsych.data.get().filter({ task: "consent" }).values()[0];
      const consented = !consentRow || consentRow.consented !== false;
      const msg = document.getElementById("finish-message");

      if (!consented) {
        msg.innerHTML = "<h2 class='thanks'>Thank you</h2><p class='thanks'>You chose not to participate. " +
          "You may close this window" + (EXPERIMENT.prolific_completion_code ? " and return the study on Prolific" : "") + ".</p>";
        return;
      }
      if (result.ok && EXPERIMENT.prolific_completion_code && !USE_EMULATOR) {
        msg.innerHTML = "<p class='thanks'>Saved. Returning you to Prolific…</p>";
        window.location.href =
          "https://app.prolific.com/submissions/complete?cc=" + EXPERIMENT.prolific_completion_code;
        return;
      }
      // In emulator/test runs we stay on the page instead of navigating to Prolific, so that
      // setting a completion code can never turn `npm test` or CI red. Live runs redirect above.
      msg.innerHTML =
        "<h2 class='thanks'>All done</h2>" +
        (result.ok ? "<p class='thanks'>Your responses were saved. Thank you for participating!</p>" : "") +
        (EXPERIMENT.prolific_completion_code
          ? "<p class='thanks'>Your completion code is <strong>" + EXPERIMENT.prolific_completion_code + "</strong>.</p>"
          : "");
    },
  });

  // Record the participant id and URL parameters on every trial row.
  jsPsych.data.addProperties({
    // Must be the run-scoped document id, so trial rows join to participants.csv on export.
    participant_id: saver.docId,
    prolific_pid: saver.params.PROLIFIC_PID || null,
    experiment_id: EXPERIMENT.id,
  });

  // No between-subjects condition: everyone does the same within-subjects task. Record the
  // design and key mapping on every trial and on the participant document instead.
  const participantFacts = {
    design: "within-subjects",
    key_mapping: COLORS.map((c) => KEYS[c] + "=" + c).join(","),
  };
  jsPsych.data.addProperties(participantFacts);
  saver.updateParticipant(participantFacts);

  // -------------------------------------------------------------------------
  // 1. Consent (course-wide IRB text; edit only the contact address)
  // -------------------------------------------------------------------------
  const consent = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="consent">
        <h2>Consent</h2>
        <p>By answering the following questions, you are participating in a study being performed by
        cognitive scientists in the Stanford Department of Psychology. If you have questions about
        this research, please contact us at <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
        You must be at least 18 years old to participate. Your participation in this research is
        voluntary. You may decline to answer any or all of the following questions. You may decline
        further participation, at any time, without adverse consequences. Your anonymity is assured;
        the researchers who have requested your participation will not receive any personal
        information about you.</p>
      </div>`,
    choices: ["I agree to participate", "I do not agree"],
    data: { task: "consent" },
    on_finish: (data) => {
      data.consented = data.response === 0;
      if (!data.consented) {
        // No end message here: jsPsych would paint it over the screen that on_finish renders.
        jsPsych.abortExperiment();
      }
    },
  };

  // -------------------------------------------------------------------------
  // 2. Welcome
  // -------------------------------------------------------------------------
  const instructions = {
    type: jsPsychInstructions,
    pages: [
      `<h2>Welcome</h2>
       <p>This short study has two parts: a few questions about you, and a quick color-naming
       task. It takes about four minutes.</p>`,
      `<p>Please complete the study in one sitting, in a quiet place, on a laptop or desktop
       computer with a keyboard. Use the buttons or the arrow keys to move between pages.</p>`,
    ],
    show_clickable_nav: true,
    data: { task: "instructions" },
  };

  // -------------------------------------------------------------------------
  // 3. Demographics (survey plugin: one page, several question types)
  // -------------------------------------------------------------------------
  const demographics = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      pages: [
        {
          elements: [
            // The consent text promises participants may decline any question, so nothing here is required.
            { type: "text", name: "age", title: "How old are you?", inputType: "number", min: 18, max: 120 },
            {
              type: "radiogroup", name: "gender", title: "What is your gender?",
              choices: ["Woman", "Man", "Non-binary"], showOtherItem: true, showNoneItem: true, noneText: "Prefer not to say",
            },
            { type: "boolean", name: "native_english", title: "Is English your first language?", labelTrue: "Yes", labelFalse: "No" },
          ],
        },
      ],
    },
    data: { task: "demographics" },
  };

  // -------------------------------------------------------------------------
  // 4. Stroop instructions
  // -------------------------------------------------------------------------
  const stroopInstructions = {
    type: jsPsychInstructions,
    pages: [
      `<h2>Color task</h2>
       <p>You will see the words RED, GREEN and BLUE printed in colored ink. Your job is to name
       the <strong>ink color</strong> and ignore what the word says.</p>
       <p>Press <strong>R</strong> for red ink, <strong>G</strong> for green ink and
       <strong>B</strong> for blue ink.</p>
       <p>For example, if you see <span class="example-word" style="color: ${INKS.red}">GREEN</span>,
       press <strong>R</strong>, because the ink is red.</p>`,
      `<p>Each word stays on the screen for up to 2 seconds. Respond as quickly and accurately as
       you can.</p>
       <p>You will start with 6 practice trials that tell you whether you were right. Place your
       fingers on R, G and B now.</p>`,
    ],
    show_clickable_nav: true,
    data: { task: "instructions" },
  };

  // -------------------------------------------------------------------------
  // 5-6. Stroop practice and test
  // -------------------------------------------------------------------------
  const item = (word, ink) => ({
    word: word,
    ink: ink,
    congruency: word === ink ? "congruent" : "incongruent",
    correct_key: KEYS[ink],
  });
  const congruentItems = COLORS.map((c) => item(c, c));
  const incongruentItems = COLORS.flatMap((w) => COLORS.filter((ink) => ink !== w).map((ink) => item(w, ink)));
  // 12 congruent + 12 incongruent; every ink, word and correct key appears 8 times.
  const testItems = jsPsych.randomization.repeat(congruentItems, 4)
    .concat(jsPsych.randomization.repeat(incongruentItems, 2));
  // Practice: each congruent item once, plus one incongruent item per ink (each word once).
  const practiceItems = congruentItems.concat([item("red", "blue"), item("green", "red"), item("blue", "green")]);

  // Shown under the fixation and the word alike, so the word appears exactly where the + was.
  const keyReminder = '<p class="key-reminder">R = red &nbsp;&nbsp; G = green &nbsp;&nbsp; B = blue</p>';
  const fixation = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: '<div class="fixation">+</div>',
    prompt: keyReminder,
    choices: "NO_KEYS",
    trial_duration: 500,
    data: { task: "fixation" },
  };
  const stroopTrial = (task) => ({
    type: jsPsychHtmlKeyboardResponse,
    // data-ink lets the test robot read the answer without decoding colors.
    stimulus: () => {
      const ink = jsPsych.evaluateTimelineVariable("ink");
      const word = jsPsych.evaluateTimelineVariable("word").toUpperCase();
      return `<div class="stimulus" data-ink="${ink}" style="color: ${INKS[ink]}">${word}</div>`;
    },
    prompt: keyReminder,
    choices: COLORS.map((c) => KEYS[c]),
    trial_duration: 2000,
    data: {
      task: task,
      word: jsPsych.timelineVariable("word"),
      ink: jsPsych.timelineVariable("ink"),
      congruency: jsPsych.timelineVariable("congruency"),
      correct_key: jsPsych.timelineVariable("correct_key"),
    },
    on_finish: (data) => {
      data.timed_out = data.response === null;
      // jsPsych accepts "R" for "r" but records the key as typed, so compare in lower case
      // (otherwise Caps Lock would score every answer wrong).
      data.correct = !data.timed_out && data.response.toLowerCase() === data.correct_key;
    },
  });
  const practiceFeedback = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: () => {
      const last = jsPsych.data.getLastTrialData().values()[0];
      if (last.timed_out) return '<div class="feedback">Too slow. Please respond within 2 seconds.</div>';
      if (last.correct) return '<div class="feedback">Correct</div>';
      return `<div class="feedback">Incorrect. The ink was ${last.ink}, so the answer was ${last.correct_key.toUpperCase()}.</div>`;
    },
    choices: "NO_KEYS",
    trial_duration: 1500,
    data: { task: "stroop_feedback" },
  };
  const practice = {
    timeline: [fixation, stroopTrial("stroop_practice"), practiceFeedback],
    timeline_variables: practiceItems,
    randomize_order: true,
  };
  const testStart = {
    type: jsPsychInstructions,
    pages: [
      `<h2>Practice complete</h2>
       <p>Now the real task: 24 words, without feedback. Keep naming the ink color as quickly
       and accurately as you can.</p>`,
    ],
    show_clickable_nav: true,
    data: { task: "instructions" },
  };
  const test = {
    timeline: [fixation, stroopTrial("stroop")],
    timeline_variables: testItems,
    randomize_order: true,
  };

  // -------------------------------------------------------------------------
  // 7. Debrief
  // -------------------------------------------------------------------------
  const debrief = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <h2>Debrief</h2>
      <p>Thank you. This was a Stroop task. People are usually slower and make more mistakes
      naming the ink color when the word names a different color (GREEN printed in red) than
      when the two match (RED printed in red), because reading the word is hard to switch off.
      We are measuring the size of that difference. If you have questions about this research,
      contact <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
      Press the button to save your responses and finish.</p>`,
    choices: ["Finish"],
    data: { task: "debrief" },
  };

  await jsPsych.run([
    consent,
    instructions,
    demographics,
    stroopInstructions,
    practice,
    testStart,
    test,
    debrief,
  ]);
})();
