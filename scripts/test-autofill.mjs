/**
 * Smoke test for the autofill engine.
 * Builds a form shaped like a real Greenhouse/Workday application and checks
 * that each field gets the right value from a sample profile.
 *
 *   node scripts/test-autofill.mjs
 */

import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const HTML = `<!doctype html><html><body>
<form id="application_form">
  <div class="field"><label for="first_name">First Name *</label><input id="first_name" name="job_application[first_name]" type="text"></div>
  <div class="field"><label for="last_name">Last Name *</label><input id="last_name" name="job_application[last_name]" type="text"></div>
  <div class="field"><label for="email">Email *</label><input id="email" name="job_application[email]" type="email"></div>
  <div class="field"><label for="phone">Phone</label><input id="phone" name="job_application[phone]" type="tel"></div>
  <div class="field"><label for="city">City</label><input id="city" type="text"></div>
  <div class="field"><label for="state">State / Province</label><input id="state" type="text"></div>
  <div class="field"><label for="zip">Zip Code</label><input id="zip" type="text"></div>

  <div class="field"><label for="linkedin">LinkedIn Profile</label><input id="linkedin" type="text"></div>
  <div class="field"><label for="github">GitHub URL</label><input id="github" type="text"></div>
  <div class="field"><label for="website">Portfolio / Website</label><input id="website" type="text"></div>

  <div class="field"><label for="company">Current Company</label><input id="company" type="text"></div>
  <div class="field"><label for="title">Current Job Title</label><input id="title" type="text"></div>
  <div class="field"><label for="yoe">Years of relevant experience</label><input id="yoe" type="text"></div>

  <div class="field"><label for="school">School</label><input id="school" type="text"></div>
  <div class="field"><label for="degree">Degree</label>
    <select id="degree">
      <option value="">Select…</option>
      <option>High School</option>
      <option>Bachelor's Degree</option>
      <option>Master's Degree</option>
    </select>
  </div>
  <div class="field"><label for="major">Field of Study</label><input id="major" type="text"></div>
  <div class="field"><label for="gpa">GPA</label><input id="gpa" type="text"></div>

  <div class="field"><label for="auth">Are you legally authorized to work in the United States?</label>
    <select id="auth"><option value="">Select…</option><option>Yes</option><option>No</option></select>
  </div>
  <div class="field"><label for="sponsor">Will you now or in the future require sponsorship for employment visa status?</label>
    <select id="sponsor"><option value="">Select…</option><option>Yes</option><option>No</option></select>
  </div>
  <div class="field"><label for="relocate">Are you willing to relocate?</label>
    <select id="relocate"><option value="">Select…</option><option>Yes</option><option>No</option></select>
  </div>
  <div class="field"><label for="salary">What are your salary expectations?</label><input id="salary" type="text"></div>
  <div class="field"><label for="start">Earliest available start date</label><input id="start" type="date"></div>
  <div class="field"><label for="hear">How did you hear about us?</label>
    <select id="hear"><option value="">Select…</option><option>LinkedIn</option><option>Referral</option><option>Company website</option></select>
  </div>

  <fieldset>
    <legend>Gender</legend>
    <label><input type="radio" name="gender" value="m"> Male</label>
    <label><input type="radio" name="gender" value="f"> Female</label>
    <label><input type="radio" name="gender" value="d"> Decline to self-identify</label>
  </fieldset>

  <div class="field"><label for="veteran">Veteran Status</label>
    <select id="veteran">
      <option value="">Select…</option>
      <option>I am not a protected veteran</option>
      <option>I identify as one or more of the classifications of a protected veteran</option>
      <option>I don't wish to answer</option>
    </select>
  </div>

  <div class="field"><label for="resume">Resume/CV *</label><input id="resume" type="file"></div>
  <div class="field"><label for="why">Why do you want to work at Northwind?</label><textarea id="why"></textarea></div>
  <div class="field"><label for="custom">Describe a system you designed end to end.</label><textarea id="custom"></textarea></div>

  <button type="submit">Submit Application</button>
</form>
</body></html>`;

const PROFILE = {
  personal: {
    firstName: "Aarav", lastName: "Mehta", email: "aarav.mehta@gmail.com",
    phone: "4155550142", phoneCountryCode: "+1",
    address: "440 Bryant St", city: "San Francisco", state: "CA", zip: "94107",
    country: "United States",
  },
  websites: [
    { label: "LinkedIn", url: "https://linkedin.com/in/aaravmehta" },
    { label: "GitHub", url: "https://github.com/aaravmehta" },
    { label: "Portfolio", url: "https://aarav.dev" },
  ],
  experience: [
    { company: "Stripe", title: "Software Engineer", startDate: "2021-03", current: true },
    { company: "Cobalt Labs", title: "Junior Engineer", startDate: "2019-06", endDate: "2021-02" },
  ],
  education: [
    { school: "UC Berkeley", degree: "Bachelor's Degree", fieldOfStudy: "Computer Science", gpa: "3.8", endDate: "2019-05" },
  ],
  skills: ["React", "TypeScript", "Node.js"],
  documents: [{ kind: "resume", name: "aarav-mehta-resume.pdf", mimeType: "application/pdf", isDefault: true, dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" }],
  workAuth: {
    authorizedToWork: "Yes", requireSponsorship: "No", willingToRelocate: "Yes",
    availableStartDate: "2026-09-14", howDidYouHear: "LinkedIn", over18: "Yes",
  },
  compensation: { desiredSalary: "185000" },
  eeo: { gender: "Male", veteranStatus: "I am not a protected veteran" },
  summary: "Product-minded engineer working on payments infrastructure.",
};

// Deliberately worded differently from the questions on the form, to prove the
// matcher tolerates rewording rather than needing an exact string.
const SAVED = [
  { question: "Describe a system that you designed end-to-end.",
    answer: "I rebuilt our webhook delivery pipeline: retries with exponential backoff, idempotency keys, and a replay tool." },
  { question: "What are your salary expectations?", answer: "$185,000" },
];

/* ---- boot a DOM and load the extension libs into it ---- */
const dom = new JSDOM(HTML, { url: "https://boards.greenhouse.io/northwind/jobs/4821", pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
global.CSS = window.CSS ?? { escape: (s) => s.replace(/["\\]/g, "\\$&") };
["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "Event", "KeyboardEvent", "FocusEvent", "File", "getComputedStyle"].forEach((k) => {
  if (window[k]) global[k] = window[k];
});

// jsdom has no DataTransfer/FileList; stand one in so the resume path is exercised.
class FakeDataTransfer {
  constructor() { this._files = []; this.items = { add: (f) => this._files.push(f) }; }
  get files() { return this._files; }
}
global.DataTransfer = FakeDataTransfer;
window.DataTransfer = FakeDataTransfer;
// jsdom's `files` setter demands a real FileList, which it won't let us build.
// Chrome accepts DataTransfer.files directly; here we let the defineProperty
// fallback in setFileValue do the work instead.
class FakeDragEvent extends window.Event {
  constructor(type, init = {}) { super(type, init); this.dataTransfer = init.dataTransfer ?? null; }
}
global.DragEvent = FakeDragEvent;
window.DragEvent = FakeDragEvent;

// jsdom gives every element a zero-size rect; the engine treats that as hidden.
window.Element.prototype.getBoundingClientRect = function () {
  return { width: 200, height: 32, top: 0, left: 0, right: 200, bottom: 32, x: 0, y: 0, toJSON() {} };
};
Object.defineProperty(window.HTMLElement.prototype, "offsetParent", { get() { return window.document.body; } });

for (const f of ["lib/field-map.js", "lib/matcher.js"]) {
  new window.Function(readFileSync(new URL(`../extension/${f}`, import.meta.url), "utf8")).call(window);
}

const M = window.ZAPPLY_MATCHER;
const RULES = window.ZAPPLY_FIELD_MAP;

/* ---- run the matcher over every field ---- */
const results = [];
document.querySelectorAll("input, select, textarea").forEach((el) => {
  if (["submit", "button"].includes(el.type)) return;
  if (el.type === "radio") {
    const name = el.getAttribute("name");
    if (results.some((r) => r.name === name)) return;
  }

  const label = M.deriveLabel(el);
  const rule = M.matchRule(el, label, RULES);
  const kind = M.fieldKind(el);
  let filled = null;

  if (rule) {
    const value = rule.value(PROFILE);
    if (value === "__RESUME__") {
      const doc = PROFILE.documents.find((d) => d.kind === "resume");
      filled = M.setFileValue(el, doc) ? `${doc.name} (attached)` : null;
    } else if (value) {
      if (kind === "select") filled = M.setSelectValue(el, value, rule.options) ? el.options[el.selectedIndex].textContent : null;
      else if (kind === "radio") filled = M.setRadioValue(el, value, rule.options) ? "(radio selected)" : null;
      else filled = M.setTextValue(el, String(value)) ? el.value : null;
    }
  } else {
    // No profile rule matched — try a saved answer, using the same code the
    // extension runs in the browser.
    const question = label.split(" | ")[0];
    const saved = M.findSavedAnswer(question, SAVED.map((s) => ({ ...s, normalizedKey: M.normalizeQuestion(s.question) })));
    if (saved) {
      const ok = kind === "select" ? M.setSelectValue(el, saved.answer) : M.setTextValue(el, saved.answer);
      if (ok) filled = `${String(el.value).slice(0, 30)}… (saved, ${(saved.confidence * 100) | 0}% match)`;
    }
  }

  results.push({
    name: el.getAttribute("name") || el.id,
    question: label.split(" | ")[0].slice(0, 52),
    rule: rule?.key ?? (filled ? "saved-answer" : "—"),
    filled,
  });
});


// Exact iCIMS-style protected-veteran radio test: the profile answer must
// select "I am not a protected veteran", never the first option.
const veteranBox = document.createElement("fieldset");
veteranBox.innerHTML = `
  <legend>Please indicate your protected veteran status</legend>
  <label><input type="radio" name="veteran_radio" value="protected"> I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERAN</label>
  <label><input type="radio" name="veteran_radio" value="not-protected"> I AM NOT A PROTECTED VETERAN</label>
  <label><input type="radio" name="veteran_radio" value="decline"> I DON'T WISH TO ANSWER</label>`;
document.body.appendChild(veteranBox);
const veteranRadio = veteranBox.querySelector('input[type="radio"]');
const veteranOk = M.setRadioValue(veteranRadio, PROFILE.eeo.veteranStatus, {
  "I am not a protected veteran": ["i am not a protected veteran", "not protected veteran"]
});
const pickedVeteran = Array.from(veteranBox.querySelectorAll('input[type="radio"]')).find((r) => r.checked);
if (!veteranOk || pickedVeteran?.value !== "not-protected") {
  console.error("\u001b[31mProtected-veteran radio test FAILED.\u001b[0m", { veteranOk, picked: pickedVeteran?.value });
  process.exit(1);
}
console.log("\u001b[32mProtected-veteran radio test passed.\u001b[0m\n");

/* ---- report ---- */
const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
console.log("\n" + pad("FIELD", 14) + pad("QUESTION", 42) + pad("RULE", 20) + "VALUE");
console.log("-".repeat(118));
results.forEach((r) => {
  const mark = r.filled ? "\u001b[32m✓\u001b[0m" : "\u001b[33m·\u001b[0m";
  console.log(`${mark} ${pad(r.name, 12)}${pad(r.question, 42)}${pad(r.rule, 20)}${r.filled ?? "(left for user)"}`);
});

const filled = results.filter((r) => r.filled).length;
console.log("-".repeat(118));
console.log(`${filled}/${results.length} fields filled — ${results.length - filled} left for the user\n`);


/* ================================================================== */
/*  False-positive guard                                               */
/*  Filling the wrong field is worse than filling nothing, so these     */
/*  decoys must all be left alone.                                      */
/* ================================================================== */

const DECOYS = `
  <form id="decoys">
    <label for="d1">Reference First Name</label><input id="d1" type="text">
    <label for="d2">Emergency Contact Phone</label><input id="d2" type="tel">
    <label for="d3">Manager's Email</label><input id="d3" type="email">
    <label for="d4">Company Website</label><input id="d4" type="text">
    <label for="d5">Spouse Last Name</label><input id="d5" type="text">
    <label for="d6">Previous Employer</label><input id="d6" type="text">
    <label for="d7">Desired Job Title</label><input id="d7" type="text">
    <label for="d8">Confirm Email</label><input id="d8" type="email">
    <label for="d9">Coupon code</label><input id="d9" type="text">
    <label for="d10">Country code</label><input id="d10" type="text">
  </form>`;

const holder = document.createElement("div");
holder.innerHTML = DECOYS;
document.body.appendChild(holder);

// Fields that SHOULD fill even though they sit among the decoys.
const EXPECTED_FILLS = { d8: "emailConfirm", d10: "phoneCountryCode" };

console.log("Decoy check — these must stay empty unless listed as expected:\n");
let leaks = 0;
holder.querySelectorAll("input").forEach((el) => {
  const label = M.deriveLabel(el);
  const rule = M.matchRule(el, label, RULES);
  const value = rule ? rule.value(PROFILE) : null;
  const expected = EXPECTED_FILLS[el.id];

  let verdict;
  if (expected) {
    const okay = rule?.key === expected;
    verdict = okay ? "\u001b[32m✓ fills (expected)\u001b[0m" : `\u001b[31m✗ expected ${expected}, got ${rule?.key ?? "none"}\u001b[0m`;
    if (!okay) leaks++;
  } else if (rule && value) {
    verdict = `\u001b[31m✗ LEAK via ${rule.key} -> ${value}\u001b[0m`;
    leaks++;
  } else {
    verdict = "\u001b[32m✓ left alone\u001b[0m";
  }
  console.log(`  ${pad(label.split(" | ")[0], 30)}${verdict}`);
});

console.log(leaks === 0 ? "\n\u001b[32mNo false positives.\u001b[0m\n" : `\n\u001b[31m${leaks} problem(s).\u001b[0m\n`);
process.exit(leaks === 0 ? 0 : 1);
