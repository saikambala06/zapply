/**
 * ZAPPLY CONTENT SCRIPT
 * ---------------------
 * Runs on every page. Decides whether the page is a job application, fills it,
 * captures whatever the user answers by hand, and reports the result.
 *
 * Flow:
 *   detect ATS -> collect fields -> match each to a rule or a saved answer
 *   -> fill -> show the status pill -> watch for submit -> sync to the API
 */

(() => {
  if (window.__zapplyLoaded) return;
  window.__zapplyLoaded = true;

  const M = window.ZAPPLY_MATCHER;
  const RULES = window.ZAPPLY_FIELD_MAP;
  const ATS = window.ZAPPLY_ATS;
  if (!M || !RULES || !ATS) return;

  const state = {
    session: null,      // { profile, settings, responses, premium }
    adapter: null,
    lastRun: null,
    unmatched: [],      // fields we couldn't answer — watched for manual input
    captured: new Map(),// question -> answer typed by the user
    filling: false,
    profile: null,      // the profile actually used (Premium may pick a different one)
    scoring: null,      // { score, reason, label } from Premium profile scoring
    drafted: new Set(), // elements filled by AI — the user must review these
    duplicate: null,    // a prior application for this posting, if any
    allFields: [],      // everything scanned on the last run
    stopRequested: false,
    manualSessionActive: false,
  };

  /* ================================================================== */
  /*  Messaging                                                          */
  /* ================================================================== */

  const send = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(res ?? { ok: false });
        });
      } catch {
        resolve({ ok: false });
      }
    });

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.type === "ZAPPLY_RUN") {
      run({ manual: true }).then((r) => respond(r));
      return true;
    }
    if (msg?.type === "ZAPPLY_STOP") {
      state.stopRequested = true;
      state.manualSessionActive = false;
      return respond({ ok: true });
    }
    if (msg?.type === "ZAPPLY_STATUS") {
      respond({
        ok: true,
        isApplication: isApplicationPage(),
        ats: state.adapter?.label ?? null,
        lastRun: state.lastRun,
        duplicate: state.duplicate,
        profileLabel: state.profile?.label ?? null,
      });
      return true;
    }
    return false;
  });

  /* ================================================================== */
  /*  Page classification                                                */
  /* ================================================================== */

  /**
   * We only fill pages that look like applications. Three signals, any two of
   * which is enough: an application-ish URL, a form with several text inputs,
   * and the presence of tell-tale fields (resume upload, EEO block).
   */
  function isApplicationPage() {
    const urlHit = /apply|application|careers?|job|candidate|opening|position|requisition/i.test(
      location.href
    );
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea'
    );
    const formHit = inputs.length >= 3;
    const fileHit = Boolean(document.querySelector('input[type="file"]'));
    const eeoHit = /gender|veteran|disability|ethnicity|race/i.test(document.body?.innerText?.slice(0, 30000) || "");

    return [urlHit, formHit, fileHit, eeoHit].filter(Boolean).length >= 2;
  }

  function isExcluded(settings) {
    const list = settings?.excludedDomains ?? [];
    return list.some((d) => d && location.hostname.includes(d.trim()));
  }

  /* ================================================================== */
  /*  Field collection                                                   */
  /* ================================================================== */

  function collectSearchRoots() {
    const roots = [document];
    const seen = new Set(roots);
    const visit = (root) => {
      try {
        root.querySelectorAll("*").forEach((el) => {
          if (el.shadowRoot && !seen.has(el.shadowRoot)) {
            seen.add(el.shadowRoot);
            roots.push(el.shadowRoot);
            visit(el.shadowRoot);
          }
        });
      } catch {}
    };
    visit(document);
    return roots;
  }

  function collectFields(adapter) {
    const searchRoots = collectSearchRoots();
    const roots = [];
    for (const root of searchRoots) {
      try {
        root.querySelectorAll(adapter.formSelector || "form").forEach((f) => roots.push(f));
      } catch {}
    }
    // Generic/custom web-component forms often have no <form> at all.
    if (!roots.length) roots.push(...searchRoots);

    const seen = new Set();
    const fields = [];

    roots.forEach((root) => {
      try {
        root
          .querySelectorAll(
            'input, textarea, select, ' +
            '[role="combobox"], [role="textbox"][contenteditable="true"], ' +
            '[aria-haspopup="listbox"], [aria-haspopup="menu"], ' +
            'button[data-automation-id*="Dropdown"], button[data-automation-id*="Prompt"], ' +
            'div[role="button"][aria-expanded], ' +
            '[role="checkbox"], [role="radio"], ' +
            '[data-qa], [data-testid], [data-test-id], [contenteditable="true"]'
          )
          .forEach((el) => {
            if (seen.has(el)) return;
            seen.add(el);
            if (!M.isFillable(el)) return;
            if (["submit", "reset", "image"].includes(el.type)) return;

            if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
              const opensMenu =
                el.getAttribute("aria-haspopup") === "listbox" ||
                el.getAttribute("aria-haspopup") === "menu" ||
                /dropdown|select|prompt/i.test(el.getAttribute("data-automation-id") || "") ||
                el.getAttribute("aria-expanded") !== null;
              if (!opensMenu) return;
            } else if (el.type === "button") return;

            if (el.type === "radio" || el.type === "checkbox" ||
                el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox") {
              const role = el.getAttribute("role") || el.type;
              const name = el.getAttribute("name");
              const container = el.closest("fieldset, [role='radiogroup'], [role='group']");
              if (container && !container.dataset.zapplyGroupKey) {
                container.dataset.zapplyGroupKey = `g${Math.random().toString(36).slice(2)}`;
              }
              const groupKey = `${role}|${name || container?.dataset?.zapplyGroupKey || `single-${fields.length}`}`;
              if (fields.some((f) => f._groupKey === groupKey && f.el !== el)) return;
              el.dataset.zapplyGroup = el.dataset.zapplyGroup || (name || container?.dataset?.zapplyGroupKey || `g${fields.length}`);
              const label = M.deriveLabel(el);
              fields.push({ el, label, kind: M.fieldKind(el), rule: M.matchRule(el, label, RULES), _groupKey: groupKey });
              return;
            }

            const label = M.deriveLabel(el);
            fields.push({ el, label, kind: M.fieldKind(el), rule: M.matchRule(el, label, RULES) });
          });
      } catch {}
    });

    return fields;
  }

  /* ================================================================== */
  /*  Saved answers                                                      */
  /* ================================================================== */

  /** Delegates to the shared matcher so the server and extension agree. */
  function findSavedAnswer(label) {
    // Try the visible question first, then the other reliable label sources.
    // This helps ATSs whose <label> says only "Question" while aria-label,
    // data-qa or the field name contains the real question.
    const responses = state.session?.responses ?? [];
    const candidates = String(label || "").split(" | ").map((x) => x.trim()).filter(Boolean);
    let best = null;
    for (const question of candidates.slice(0, 6)) {
      const hit = M.findSavedAnswer(question, responses);
      if (hit && (!best || (hit.confidence ?? 0) > (best.confidence ?? 0))) best = hit;
    }
    return best;
  }

  /* ================================================================== */
  /*  The fill                                                           */
  /* ================================================================== */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


  /** Verify that the website actually accepted a value, not merely that a
   * setter/click ran. This is what prevents the extension from saying "filled"
   * while the ATS still shows "This field is required". */
  function verifyField(field, expected) {
    const el = field.el;
    const kind = field.kind;
    const want = M.norm(expected);
    const visible = (node) => M.norm(node?.textContent || node?.getAttribute?.('aria-label') || node?.getAttribute?.('aria-valuetext') || '');
    if (kind === "radio") {
      const role = el.getAttribute('role');
      const name = el.getAttribute("name");
      const group = role === 'radio'
        ? (name ? Array.from(document.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`)) : Array.from(el.closest('fieldset, [role="radiogroup"], [role="group"]')?.querySelectorAll('[role="radio"]') || [el]))
        : (name ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)) : Array.from(el.closest('fieldset, [role="radiogroup"], [role="group"]')?.querySelectorAll('input[type="radio"]') || [el]));
      return group.some(r => {
        const selected = role === 'radio' ? r.getAttribute('aria-checked') === 'true' : r.checked === true;
        if (!selected) return false;
        const lab = M.norm(M.visibleText(r.closest('label') || r.parentElement) || r.getAttribute('aria-label') || r.value || '');
        const val = M.norm(r.value || '');
        return !want || lab === want || val === want || lab.includes(want) || want.includes(lab);
      });
    }
    if (kind === "checkbox") {
      const role = el.getAttribute("role");
      const name = el.getAttribute("name");
      const group = role === "checkbox"
        ? (name ? Array.from(document.querySelectorAll(`[role="checkbox"][name="${CSS.escape(name)}"]`)) : [el])
        : (name ? Array.from(document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`)) : [el]);
      const checked = group.filter(c => role === 'checkbox' ? c.getAttribute('aria-checked') === 'true' : c.checked).length;
      if (/^(no|false|unchecked|none|0)$/i.test(String(expected))) return checked === 0;
      return checked > 0;
    }
    if (kind === "select") {
      if (el.tagName === "SELECT") {
        const opt = el.options[el.selectedIndex];
        if (!opt || /^(select|choose|please|--)/i.test(opt.textContent || '')) return false;
        const text = M.normalizeChoiceText(opt.textContent), val = M.normalizeChoiceText(opt.value);
        const expectedChoice = M.normalizeChoiceText(expected);
        return text === expectedChoice || val === expectedChoice || text.includes(expectedChoice) || expectedChoice.includes(text);
      }
      // Custom selects: use an actual selected option or a value attribute.
      // Never use the whole button text because it often contains the question
      // label (which made "Country: United States" look selected even when it
      // wasn't committed).
      const selected = el.querySelector?.('[aria-selected="true"]') ||
        (el.getAttribute("aria-activedescendant") ? document.getElementById(el.getAttribute("aria-activedescendant")) : null);
      const text = M.normalizeChoiceText(
        el.getAttribute('aria-valuetext') ||
        el.getAttribute('data-value') ||
        el.value ||
        (selected && selected.textContent) ||
        ''
      );
      const expected = M.normalizeChoiceText(expected);
      const buttonText = M.normalizeChoiceText(el.textContent || "");
      const placeholder = /^(select|choose|please select|please choose|--)/i.test(buttonText);
      return Boolean(text) && (text === expected || text.includes(expected) || expected.includes(text)) ||
        (!placeholder && Boolean(expected) && buttonText.includes(expected));
    }
    if (kind === "file") return Boolean(el.files?.length);
    return M.norm(el.value) === want || M.norm(el.value).includes(want);
  }


  async function fillAndVerify(field, value, rule) {
    const quirks = state.adapter?.quirks ?? {};
    let ok = false;
    const apply = async () => {
      if (field.kind === "select") {
        return field.el.tagName === "SELECT"
          ? M.setSelectValue(field.el, value, rule?.options)
          : await M.setComboboxValue(field.el, value, quirks.dropdownDelay ?? 900, rule?.options);
      }
      if (field.kind === "radio") return M.setRadioValue(field.el, value, rule?.options);
      if (field.kind === "checkbox") return M.setCheckboxValue(field.el, value, rule?.options);
      if (field.kind === "file") return M.setFileValue(field.el, value);
      return M.setTextValue(field.el, String(value));
    };

    ok = await apply();
    await sleep(80);
    if (!ok || !verifyField(field, value)) {
      // Controlled components occasionally render after the first event. Retry
      // once using the same UI interaction, then verify again.
      ok = await apply();
      await sleep(140);
    }
    return ok && verifyField(field, value);
  }

  function collectRequiredErrors() {
    const nodes = Array.from(document.querySelectorAll(
      '[aria-invalid="true"], .error, .field-error, [class*="error"], [data-automation-id*="error"], [role="alert"]'
    ));
    return nodes.filter(n => {
      const text = (n.textContent || "").trim();
      return text && /required|please select|please enter|invalid|must be/i.test(text) && n.getBoundingClientRect().height > 0;
    }).map(n => (n.textContent || "").trim()).slice(0, 30);
  }

  async function fillField(field, profile, settings) {
    const { el, label, kind } = field;
    const quirks = state.adapter?.quirks ?? {};

    // 1. Rule-based match against the profile (computed during collection)
    const rule = field.rule ?? M.matchRule(el, label, RULES);

    if (rule) {
      let value = rule.value(profile, el, label);

      // Documents are handled specially
      if (value === "__RESUME__" || value === "__COVER_LETTER__") {
        const wantKind = value === "__RESUME__" ? "resume" : "coverLetter";
        const docs = profile.documents ?? [];
        const doc = docs.find((d) => d.kind === wantKind && d.isDefault) || docs.find((d) => d.kind === wantKind);
        if (!doc) return { key: rule.key, status: "unmatched", label };
        if (kind === "file") {
          return { key: rule.key, status: M.setFileValue(el, doc) ? "filled" : "failed" };
        }
        return { key: rule.key, status: "skipped" };
      }

      if (!value) {
        // A missing profile value should still get a chance to use a saved
        // answer for this exact question.
        if (settings?.reuseSavedResponses !== false && kind !== "file") {
          const saved = findSavedAnswer(label);
          if (saved?.answer) {
            const savedDone = await fillAndVerify(field, saved.answer, null);
            if (savedDone) return { key: "saved-answer", status: "filled", label, fromMemory: true };
          }
        }
        return { key: rule.key, status: "unmatched", label };
      }

      if (kind === "file") return { key: rule.key, status: "failed", label };
      const done = await fillAndVerify(field, value, rule);
      if (done) return { key: rule.key, status: "filled", label };

      // A profile value can be semantically correct but not be one of this
      // portal's exact choices (for example "Master's Degree" vs "Master of
      // Science"). If the user has already answered this same question on
      // another portal, prefer that saved answer over guessing.
      if (settings?.reuseSavedResponses !== false) {
        const saved = findSavedAnswer(label);
        if (saved?.answer && saved.answer !== value) {
          const savedDone = await fillAndVerify(field, saved.answer, null);
          if (savedDone) return { key: "saved-answer", status: "filled", label, fromMemory: true };
        }
      }
      return { key: rule.key, status: "failed", label };
    }

    // 2. No profile rule — try a saved answer for this exact question
    if (settings?.reuseSavedResponses !== false) {
      const saved = findSavedAnswer(label);
      if (saved?.answer && kind !== "file") {
        const done = await fillAndVerify(field, saved.answer, null);
        if (done) return { key: "saved-answer", status: "filled", label, fromMemory: true };
      }
    }

    return { key: null, status: "unmatched", label };
  }

  /**
   * Premium — scores each saved profile against this posting and returns the
   * best fit. Falls back to the active profile if scoring is unavailable, since
   * a failed score should never block the fill.
   */
  async function pickProfile(session, meta) {
    const profiles = session.profiles ?? [];
    if (!session.premium || profiles.length < 2) return { profile: session.profile, scoring: null };

    const res = await send({
      type: "ZAPPLY_SCORE",
      payload: { jobTitle: meta.jobTitle, company: meta.company, jobDescription: meta.description },
    });
    if (!res?.ok || !res.data?.best) return { profile: session.profile, scoring: null };

    const best = profiles.find((p) => p._id === res.data.best.profileId);
    if (!best) return { profile: session.profile, scoring: null };

    return {
      profile: best,
      scoring: { score: res.data.best.score, reason: res.data.best.reason, label: best.label },
    };
  }

  /**
   * Premium — answers everything the profile and saved answers couldn't cover.
   *
   * This used to only handle long text boxes, which meant unmatched dropdowns
   * and radio groups were simply left blank. Choice fields now get their option
   * list sent along, and the model must reply with one of them verbatim.
   */
  async function answerRemaining(session, meta, settings) {
    if (!session.premium || !settings.aiAnswers) return 0;

    const targets = state.unmatched
      .filter((f) => f.kind !== "file" && !M.hasValue(f.el))
      .filter((f) => {
        const q = f.label.split(" | ")[0];
        if (q.length < 8) return false;
        // Choice fields are cheap and high-value: always worth asking.
        if (f.kind === "select" || f.kind === "radio" || f.kind === "checkbox") return true;
        return /\?|describe|why|what|how|tell us|explain|which|when|do you|are you|have you/i.test(q);
      })
      .slice(0, 8);

    if (!targets.length) return 0;

    // AI drafting is also silent; drafted fields are visibly marked on the
    // form itself so there is no popup covering the application.

    let done = 0;
    for (const field of targets) {
      const question = field.label.split(" | ")[0];
      if (field.kind === "select" && field.el.tagName !== "SELECT") {
        try {
          field.el.scrollIntoView?.({ block: "center", behavior: "instant" });
          field.el.click?.();
          await M.waitForOptions(state.adapter?.quirks?.dropdownDelay ?? 800);
        } catch { /* continue with whatever options are available */ }
      }
      const options = optionsFor(field);

      const res = await send({
        type: "ZAPPLY_ANSWER",
        payload: {
          question,
          options,
          jobTitle: meta.jobTitle,
          company: meta.company,
          jobDescription: meta.description?.slice(0, 3000),
          profileId: state.profile?._id,
          maxWords: field.kind === "textarea" ? 130 : 40,
          fieldType: field.kind,
          multiple: field.kind === "checkbox" && options.length > 1,
        },
      });
      if (!res?.ok || !res.data?.answer) continue;

      let answer = res.data.answer;
      if (field.kind !== "checkbox") answer = String(answer).trim();
      else if (typeof answer === "string") {
        try { answer = JSON.parse(answer); } catch { /* comma-separated fallback */ }
      }
      const ok = await fillAndVerify(field, answer, null);

      if (ok) {
        done++;
        state.drafted.add(field.el);
        field.el.classList.remove("zapply-needs-you");
        field.el.classList.add("zapply-drafted");
        flash(field.el);
      }
    }
    return done;
  }

  async function run({ manual = false } = {}) {
    // Autofill is deliberately manual. The page may detect an application, but
    // it must never mutate the form until the user explicitly starts it.
    if (!manual) return { ok: false, error: "manual-start-required" };
    if (state.filling) return { ok: false, error: "Already filling." };
    state.stopRequested = false;
    state.manualSessionActive = true;

    // Always refresh on an explicit fill. Profile edits and saved answers are
    // frequently made in the dashboard immediately before applying, and the
    // old cached session could keep stale data for up to 30 minutes.
    const session = await loadSession(true);
    if (session?.profile) {
      state.profile = null;
      state.scoring = null;
    }
    if (!session?.profile) {
      if (manual) overlay.show({ tone: "warn", title: "Not connected", body: "Open the Zapply popup and pair with your dashboard." });
      return { ok: false, error: "not-connected" };
    }
    if (isExcluded(session.settings)) return { ok: false, error: "excluded" };

    state.filling = true;
    const started = performance.now();
    const adapter = state.adapter ?? (state.adapter = ATS.detect());
    const settings = session.settings ?? {};
    const delay = Math.max(0, Number(settings.fillDelayMs ?? 120));
    const meta = ATS.readJobMeta(adapter);

    // Premium: which of the user's profiles actually fits this posting?
    if (!state.profile) {
      // Profile selection is silent; only unresolved fields are surfaced later.
      const picked = await pickProfile(session, meta);
      state.profile = picked.profile;
      state.scoring = picked.scoring;
    }
    const profile = state.profile ?? session.profile;

    const fields = collectFields(adapter);
    state.allFields = fields;
    const result = { filled: 0, failed: 0, unmatched: 0, detected: fields.length, keys: [] };
    state.unmatched = [];

    // Autofill runs silently. A warning is shown only if safe matching leaves
    // a field unresolved after the retry/validation pass.

    for (const field of fields) {
      if (state.stopRequested) break;
      // Never overwrite something the user already typed
      if (M.hasValue(field.el) && field.kind !== "checkbox") continue;

      let outcome;
      try {
        outcome = await fillField(field, profile, settings);
      } catch (err) {
        outcome = { status: "failed", label: field.label };
      }

      if (outcome.status === "filled") {
        result.filled++;
        result.keys.push(outcome.key);
        flash(field.el);
      } else if (outcome.status === "failed") {
        result.failed++;
      } else if (outcome.status === "unmatched") {
        result.unmatched++;
        state.unmatched.push(field);
        mark(field.el);
      }

      if (delay) await sleep(delay);
    }

    // Some React/Workday/Oracle forms mount dependent fields only after an
    // earlier answer changes the page. Rescan twice so those newly-created
    // controls receive the same profile/saved-answer pass.
    for (let pass = 0; pass < 2; pass++) {
      await sleep(180);
      const fresh = collectFields(adapter);
      const known = new Set(fields.map((f) => f.el));
      const added = fresh.filter((f) => !known.has(f.el));
      if (!added.length) break;
      fields.push(...added);
      result.detected = fields.length;

      for (const field of added) {
        if (state.stopRequested) break;
        if (M.hasValue(field.el) && field.kind !== "checkbox") continue;
        try {
          const outcome = await fillField(field, profile, settings);
          if (outcome.status === "filled") {
            result.filled++;
            result.keys.push(outcome.key);
            flash(field.el);
          } else if (outcome.status === "failed") {
            result.failed++;
          } else if (outcome.status === "unmatched") {
            state.unmatched.push(field);
            mark(field.el);
          }
        } catch {
          result.failed++;
          state.unmatched.push(field);
          mark(field.el);
        }
        if (delay) await sleep(delay);
      }
    }

    result.unmatched = state.unmatched.length;

    // A failed interaction is not an answered field. Put it back into the
    // retry/AI queue instead of counting it as merely "failed" and moving on.
    if (result.failed) {
      for (const field of fields) {
        if (!state.unmatched.includes(field) && !M.hasValue(field.el) && field.kind !== "file") {
          state.unmatched.push(field);
          mark(field.el);
        }
      }
      result.unmatched = state.unmatched.length;
    }

    if (state.stopRequested) {
      result.stopped = true;
      result.unmatched = state.unmatched.length;
      result.durationMs = Math.round(performance.now() - started);
      result.profileLabel = profile?.label ?? null;
      result.matchScore = state.scoring?.score ?? null;
      state.lastRun = result;
      state.filling = false;
      overlay.show({ tone: "warn", title: `Stopped — ${result.filled} fields filled`, body: "Autofill stopped. You can review the form and start again when ready." });
      return { ok: true, data: result };
    }

    // Premium: draft the open-ended questions that are left.
    result.drafted = await answerRemaining(session, meta, settings);
    if (result.drafted) {
      result.filled += result.drafted;
      result.unmatched = Math.max(0, result.unmatched - result.drafted);
    }

    // Final commit pass. Workday and other controlled ATS forms can render the
    // value immediately but commit it only after a real editing/change cycle.
    // Retry every unresolved field once before reading validation errors.
    await sleep(250);
    for (const field of fields) {
      if (state.stopRequested) break;
      if (field.kind === 'file') continue;
      if (M.hasValue(field.el)) continue;
      try {
        const retry = await fillField(field, profile, settings);
        if (retry.status === 'filled') {
          result.filled++;
          result.unmatched = Math.max(0, result.unmatched - 1);
          field.el.classList.remove('zapply-needs-you');
          flash(field.el);
        }
      } catch {}
    }
    await sleep(350);
    const validationErrors = collectRequiredErrors();
    result.validationErrors = validationErrors;
    if (validationErrors.length) {
      for (const field of fields) {
        if (field.kind === "file") continue;
        if (!M.hasValue(field.el) && !state.unmatched.includes(field)) {
          state.unmatched.push(field);
          mark(field.el);
        }
      }
      result.unmatched = state.unmatched.length;
    }

    result.durationMs = Math.round(performance.now() - started);
    result.profileLabel = profile?.label ?? null;
    result.matchScore = state.scoring?.score ?? null;
    state.lastRun = result;
    state.filling = false;

    watchUnmatched();

    // Do not show a success/status popup after correct profile or saved-answer
    // fills. Only surface a warning when something genuinely needs the user.
    if (settings.showOverlay !== false && result.unmatched) {
      const scoreLine = state.scoring
        ? `Profile match: ${state.scoring.score}%. `
        : "";
      overlay.show({
        tone: "partial",
        title: `${result.unmatched} field${result.unmatched === 1 ? "" : "s"} need your answer`,
        body:
          scoreLine +
          `${result.validationErrors?.length ? `${result.validationErrors.length} validation message${result.validationErrors.length === 1 ? "" : "s"} detected. ` : ""}` +
          "The highlighted questions were not safely answered.",
        autoHide: false,
      });
    } else {
      overlay.hide();
    }

    if (!state.stopRequested && settings.autoPilot && adapter.nextButton) await advance(adapter);

    return { ok: true, data: result };
  }

  /* ================================================================== */
  /*  Capturing what the user answers by hand                            */
  /* ================================================================== */

  /**
   * Answers used to be held in memory and only sent when we detected a submit.
   * Submit detection is unreliable on single-page application forms, so any
   * missed click meant every answer the user typed was lost.
   *
   * Now each answer is pushed shortly after the field is left, independently of
   * whether we ever see a submit.
   */
  let flushTimer = null;
  const pending = new Map();

  function queueAnswer(entry) {
    if (!entry.question || !String(entry.answer ?? "").trim()) return;
    pending.set(entry.question, entry);
    state.captured.set(entry.question, entry);

    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushAnswers, 1500);
  }

  function flushAnswers() {
    clearTimeout(flushTimer);
    if (!pending.size) return;
    const responses = Array.from(pending.values());
    pending.clear();
    send({ type: "ZAPPLY_SYNC", payload: { responses } });
  }

  /** Reads whatever the user has put in a field, in a comparable form. */
  function readValue(field) {
    const el = field.el;
    if (el.type === "checkbox" || el.getAttribute("role") === "checkbox") {
      return (el.getAttribute("role") === "checkbox" ? el.getAttribute("aria-checked") === "true" : el.checked) ? "Yes" : "No";
    }
    if (el.type === "radio" || el.getAttribute("role") === "radio") {
      const custom = el.getAttribute("role") === "radio";
      const name = el.getAttribute("name");
      const group = custom
        ? (name
            ? Array.from(document.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`))
            : Array.from(el.closest("fieldset, [role='radiogroup']")?.querySelectorAll('[role="radio"]') || [el]))
        : (name
            ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`))
            : [el]);
      const picked = group.find((r) => custom ? r.getAttribute("aria-checked") === "true" : r.checked);
      return picked ? M.visibleText(picked.closest("label") || picked.parentElement) || picked.getAttribute("aria-label") || picked.value : "";
    }
    if (el.tagName === "SELECT") {
      const opt = el.options[el.selectedIndex];
      return opt && opt.value ? (opt.textContent || "").trim() : "";
    }
    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
      return (el.textContent || "").trim();
    }
    return el.value ?? "";
  }

  function optionsFor(field) {
    const el = field.el;
    if (el.tagName === "SELECT") {
      return Array.from(el.options || [])
        .map((o) => (o.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    if (el.type === "radio" || el.type === "checkbox" ||
        el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox") {
      const role = el.getAttribute("role");
      const type = el.type;
      const name = el.getAttribute("name");
      let group;
      if (role === "radio" || role === "checkbox") {
        group = name
          ? Array.from(document.querySelectorAll(`[role="${role}"][name="${CSS.escape(name)}"]`))
          : Array.from(el.closest(`fieldset, [role="${role === "radio" ? "radiogroup" : "group"}"]`)?.querySelectorAll(`[role="${role}"]`) || [el]);
      } else {
        group = name
          ? Array.from(document.querySelectorAll(`input[type="${type}"][name="${CSS.escape(name)}"]`))
          : [el];
      }
      return group
        .map((x) => M.visibleText(x.closest("label") || x.parentElement) || x.getAttribute("aria-label") || x.value)
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    if (field.kind === "select") {
      return M.visibleOptions()
        .map((x) => (x.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    return [];
  }

  function captureOn(field) {
    if (field.el.__zapplyWatched) return;
    field.el.__zapplyWatched = true;

    const capture = () => {
      const answer = String(readValue(field) ?? "").trim();
      if (!answer) return;
      if (/^(select|choose|please select|--)/i.test(answer)) return;

      const question = field.label.split(" | ")[0];
      if (question.length < 5 || question.length > 300) return;

      queueAnswer({
        question,
        answer,
        inputType: field.kind,
        options: optionsFor(field),
        ats: state.adapter?.key,
        domain: location.hostname,
        source: state.drafted.has(field.el) ? "ai" : "user",
      });
      field.el.classList.remove("zapply-needs-you");
    };

    field.el.addEventListener("blur", capture, true);
    field.el.addEventListener("change", capture);
    // Button dropdowns never blur in a useful way; catch the click instead.
    if (field.el.tagName === "BUTTON") {
      field.el.addEventListener("click", () => setTimeout(capture, 700));
    }
  }

  /**
   * Watches every field whose answer isn't already known from the profile —
   * not just the ones left blank. A value Zapply filled and the user then
   * corrected is exactly the answer worth remembering.
   */
  function watchUnmatched() {
    state.unmatched.forEach(captureOn);
    state.drafted.forEach((el) => {
      const field = state.allFields?.find((f) => f.el === el);
      if (field) captureOn(field);
    });
    (state.allFields ?? []).forEach((field) => {
      if (field.rule) return;              // comes from the profile, not worth storing
      if (field.kind === "file") return;
      captureOn(field);
    });
  }

  // Nothing should be lost when the tab is closed or navigated away from.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAnswers();
  });
  window.addEventListener("pagehide", flushAnswers);

  /* ================================================================== */
  /*  Submit detection + sync                                            */
  /* ================================================================== */

  function watchSubmit() {
    const report = () => {
      const settings = state.session?.settings ?? {};
      const meta = ATS.readJobMeta(state.adapter ?? ATS.detect());
      const responses = Array.from(state.captured.values());

      // Answers are pushed as they're typed, so this only needs to flush
      // anything still sitting in the debounce window.
      flushAnswers();
      const payload = { responses };
      if (settings.trackAutomatically !== false && state.lastRun) {
        payload.application = {
          jobTitle: meta.jobTitle,
          company: meta.company,
          companyDomain: meta.companyDomain,
          location: meta.location,
          url: meta.url,
          ats: meta.ats,
          autofill: {
            fieldsDetected: state.lastRun.detected,
            fieldsFilled: state.lastRun.filled,
            durationMs: state.lastRun.durationMs,
          },
        };
      }
      if (payload.application || responses.length) send({ type: "ZAPPLY_SYNC", payload });
      state.captured.clear();
    };

    // Real form submits
    document.addEventListener("submit", () => setTimeout(report, 300), true);

    // SPA submits: a click on anything that reads like a submit control
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target?.closest?.('button, input[type="submit"], a[role="button"]');
        if (!btn) return;
        const text = (btn.textContent || btn.value || "").trim().toLowerCase();
        if (/^(submit|submit application|apply|send application|finish|complete)/.test(text)) {
          setTimeout(report, 700);
        }
      },
      true
    );
  }

  /** Auto Pilot: click through to the next step and re-run on the new fields. */
  async function advance(adapter) {
    if (state.stopRequested || !state.manualSessionActive) return;
    const next = document.querySelector(adapter.nextButton);
    if (!next || next.disabled) return;
    next.click();
    await sleep(1400);
    state.filling = false;
    if (!state.stopRequested && state.manualSessionActive) await run({ manual: true });
  }

  /* ================================================================== */
  /*  Visual feedback                                                    */
  /* ================================================================== */

  function flash(el) {
    el.classList.add("zapply-filled");
    setTimeout(() => el.classList.remove("zapply-filled"), 1400);
  }
  function mark(el) {
    el.classList.add("zapply-needs-you");
  }

  const overlay = {
    node: null,
    timer: null,
    ensure() {
      if (this.node?.isConnected) return this.node;
      const el = document.createElement("div");
      el.className = "zapply-pill";
      el.innerHTML = `
        <span class="zapply-pill__dot"></span>
        <span class="zapply-pill__text">
          <span class="zapply-pill__title"></span>
          <span class="zapply-pill__body"></span>
        </span>
        <button class="zapply-pill__stop" type="button">Stop</button>
        <button class="zapply-pill__close" aria-label="Dismiss">&times;</button>`;
      el.querySelector(".zapply-pill__close").addEventListener("click", () => this.hide());
      el.querySelector(".zapply-pill__stop").addEventListener("click", async () => {
        state.stopRequested = true;
        state.manualSessionActive = false;
        await send({ type: "ZAPPLY_STOP" });
        el.querySelector(".zapply-pill__stop").disabled = true;
        el.querySelector(".zapply-pill__stop").textContent = "Stopping…";
      });
      (document.body || document.documentElement).appendChild(el);
      this.node = el;
      return el;
    },
    show({ tone = "busy", title, body, autoHide = false }) {
      const el = this.ensure();
      el.dataset.tone = tone;
      el.querySelector(".zapply-pill__title").textContent = title;
      el.querySelector(".zapply-pill__body").textContent = body ?? "";
      const stop = el.querySelector(".zapply-pill__stop");
      stop.disabled = !state.filling;
      stop.textContent = "Stop";
      stop.hidden = !state.filling;
      el.classList.add("zapply-pill--visible");
      clearTimeout(this.timer);
      if (autoHide) this.timer = setTimeout(() => this.hide(), 4500);
    },
    hide() {
      this.node?.classList.remove("zapply-pill--visible");
    },
  };

  /* ================================================================== */
  /*  Boot                                                               */
  /* ================================================================== */

  async function loadSession(force = false) {
    const res = await send({ type: "ZAPPLY_GET_SESSION", force });
    if (res?.ok) state.session = res.data;
    return state.session;
  }

  async function boot() {
    if (!isApplicationPage()) return;
    state.adapter = ATS.detect();

    const session = await loadSession();
    if (!session?.profile) return;
    if (isExcluded(session.settings)) return;

    watchSubmit();

    // Have we already applied to this posting? Warn instead of quietly filling
    // it a second time — duplicate applications look careless to a recruiter.
    const meta = ATS.readJobMeta(state.adapter);
    const dupe = await send({
      type: "ZAPPLY_CHECK",
      payload: { url: meta.url, jobTitle: meta.jobTitle, company: meta.company },
    });

    if (dupe?.ok && dupe.data?.duplicate) {
      state.duplicate = dupe.data.application;
      const when = new Date(state.duplicate.appliedAt).toLocaleDateString(undefined, {
        month: "short", day: "numeric",
      });
      overlay.show({
        tone: "warn",
        title: "You already applied to this",
        body: `Sent ${when} — currently "${state.duplicate.stage}". Click the Zapply icon to fill it anyway.`,
      });
      return; // manual fill still works via the popup
    }

    // IMPORTANT: detection is passive. Never fill automatically on page load.
    // The user must click "Fill this application" in the extension.

    // Multi-step forms swap the fields under us; only re-run while a user-started
    // fill session is active. This prevents SPA mutations from starting autofill.
    if (state.adapter?.quirks?.multiStep) {
      let debounce;
      new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (state.filling || !state.manualSessionActive || state.stopRequested) return;
          const fresh = collectFields(state.adapter).filter((f) => !M.hasValue(f.el));
          if (fresh.length >= 3) run({ manual: true });
        }, 1200);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  // When Save and Continue triggers ATS validation, automatically repair fields
  // that were visually filled but not committed. This is especially important
  // for Workday's controlled inputs and dropdowns.
  let validationRepairTimer = null;
  let validationRepairBusy = false;
  const validationObserver = new MutationObserver(() => {
    if (validationRepairBusy || state.filling || !state.manualSessionActive || state.stopRequested) return;
    const errors = collectRequiredErrors();
    if (!errors.length || !state.profile || !state.allFields.length) return;
    clearTimeout(validationRepairTimer);
    validationRepairTimer = setTimeout(async () => {
      if (validationRepairBusy || state.filling || !state.manualSessionActive || state.stopRequested) return;
      validationRepairBusy = true;
      try {
        for (const field of state.allFields) {
          if (field.kind === 'file' || M.hasValue(field.el)) continue;
          await fillField(field, state.profile, state.session?.settings || {});
        }
      } finally {
        validationRepairBusy = false;
      }
    }, 180);
  });
  try { validationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-invalid', 'aria-checked', 'aria-expanded', 'class'] }); } catch {}

})();
