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

  function collectFields(adapter) {
    const roots = [];
    document.querySelectorAll(adapter.formSelector || "form").forEach((f) => roots.push(f));
    if (!roots.length) roots.push(document.body);

    const seen = new Set();
    const fields = [];

    roots.forEach((root) => {
      root
        .querySelectorAll(
          'input, textarea, select, ' +
          '[role="combobox"], [role="textbox"][contenteditable="true"], ' +
          // Custom dropdowns that aren't <select>: Workday renders these as
          // buttons, so scanning only form elements missed every one of them.
          '[aria-haspopup="listbox"], [aria-haspopup="menu"], ' +
          'button[data-automation-id*="Dropdown"], div[role="button"][aria-expanded]'
        )
        .forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          if (!M.isFillable(el)) return;
          if (["submit", "reset", "image"].includes(el.type)) return;
          // A <button> only counts as a field if it opens a listbox.
          if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
            const opensMenu =
              el.getAttribute("aria-haspopup") === "listbox" ||
              el.getAttribute("aria-haspopup") === "menu" ||
              /dropdown|select/i.test(el.getAttribute("data-automation-id") || "");
            if (!opensMenu) return;
          } else if (el.type === "button") return;

          // Only fill one radio per group
          if (el.type === "radio") {
            const name = el.getAttribute("name");
            if (name && fields.some((f) => f.el.type === "radio" && f.el.getAttribute("name") === name)) return;
          }

          const label = M.deriveLabel(el);
          fields.push({ el, label, kind: M.fieldKind(el), rule: M.matchRule(el, label, RULES) });
        });
    });

    return fields;
  }

  /* ================================================================== */
  /*  Saved answers                                                      */
  /* ================================================================== */

  /** Delegates to the shared matcher so the server and extension agree. */
  function findSavedAnswer(label) {
    // The derived label concatenates several sources; the first is usually the
    // real question text, so match on that rather than the whole string.
    const question = label.split(" | ")[0];
    return M.findSavedAnswer(question, state.session?.responses ?? []);
  }

  /* ================================================================== */
  /*  The fill                                                           */
  /* ================================================================== */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fillField(field, profile, settings) {
    const { el, label, kind } = field;
    const quirks = state.adapter?.quirks ?? {};

    // 1. Rule-based match against the profile (computed during collection)
    const rule = field.rule ?? M.matchRule(el, label, RULES);

    if (rule) {
      let value = rule.value(profile);

      // Documents are handled specially
      if (value === "__RESUME__" || value === "__COVER_LETTER__") {
        const wantKind = value === "__RESUME__" ? "resume" : "coverLetter";
        const docs = profile.documents ?? [];
        const doc = docs.find((d) => d.kind === wantKind && d.isDefault) || docs.find((d) => d.kind === wantKind);
        if (!doc) return { key: rule.key, status: "no-value" };
        if (kind === "file") {
          return { key: rule.key, status: M.setFileValue(el, doc) ? "filled" : "failed" };
        }
        return { key: rule.key, status: "skipped" };
      }

      if (!value) return { key: rule.key, status: "no-value" };

      let done = false;
      if (kind === "select") {
        if (el.tagName === "SELECT") {
          done = M.setSelectValue(el, value, rule.options);
        } else {
          done = await M.setComboboxValue(el, value, quirks.dropdownDelay ?? 260);
        }
      } else if (kind === "radio") {
        done = M.setRadioValue(el, value, rule.options);
      } else if (kind === "checkbox") {
        const wantChecked = /^(yes|true|1)$/i.test(String(value));
        if (el.checked !== wantChecked) { el.click(); }
        done = true;
      } else if (kind === "file") {
        done = false;
      } else {
        done = M.setTextValue(el, String(value));
      }

      return { key: rule.key, status: done ? "filled" : "failed", label };
    }

    // 2. No rule — try a saved answer for this exact question
    if (settings?.reuseSavedResponses !== false) {
      const saved = findSavedAnswer(label);
      if (saved?.answer) {
        let done = false;
        if (kind === "select") {
          done = el.tagName === "SELECT"
            ? M.setSelectValue(el, saved.answer)
            : await M.setComboboxValue(el, saved.answer, quirks.dropdownDelay ?? 260);
        } else if (kind === "radio") {
          done = M.setRadioValue(el, saved.answer);
        } else if (kind === "checkbox") {
          const want = /^(yes|true|1)$/i.test(saved.answer);
          if (el.checked !== want) el.click();
          done = true;
        } else if (kind !== "file") {
          done = M.setTextValue(el, saved.answer);
        }
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
        if (f.kind === "select" || f.kind === "radio") return true;
        return /\?|describe|why|what|how|tell us|explain|which|when|do you|are you|have you/i.test(q);
      })
      .slice(0, 8);

    if (!targets.length) return 0;

    overlay.show({
      tone: "busy",
      title: `Answering ${targets.length} more question${targets.length === 1 ? "" : "s"}…`,
      body: "Drawn from your profile. Read them before you submit.",
    });

    let done = 0;
    for (const field of targets) {
      const question = field.label.split(" | ")[0];
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
        },
      });
      if (!res?.ok || !res.data?.answer) continue;

      const answer = String(res.data.answer).trim();
      let ok = false;

      if (field.kind === "select") {
        ok = field.el.tagName === "SELECT"
          ? M.setSelectValue(field.el, answer)
          : await M.setComboboxValue(field.el, answer);
      } else if (field.kind === "radio") {
        ok = M.setRadioValue(field.el, answer);
      } else if (field.kind === "checkbox") {
        const want = /^(yes|true|1)$/i.test(answer);
        if (field.el.checked !== want) field.el.click();
        ok = true;
      } else {
        ok = M.setTextValue(field.el, answer);
      }

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
    if (state.filling) return { ok: false, error: "Already filling." };

    const session = state.session ?? (await loadSession());
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
      if (settings.showOverlay !== false && session.premium && (session.profiles?.length ?? 0) > 1) {
        overlay.show({ tone: "busy", title: "Matching your profiles to this role…" });
      }
      const picked = await pickProfile(session, meta);
      state.profile = picked.profile;
      state.scoring = picked.scoring;
    }
    const profile = state.profile ?? session.profile;

    const fields = collectFields(adapter);
    state.allFields = fields;
    const result = { filled: 0, failed: 0, unmatched: 0, detected: fields.length, keys: [] };
    state.unmatched = [];

    if (settings.showOverlay !== false) {
      overlay.show({ tone: "busy", title: "Filling this application…", body: `${fields.length} fields found` });
    }

    for (const field of fields) {
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

    // Premium: draft the open-ended questions that are left.
    result.drafted = await answerRemaining(session, meta, settings);
    if (result.drafted) {
      result.filled += result.drafted;
      result.unmatched = Math.max(0, result.unmatched - result.drafted);
    }

    result.durationMs = Math.round(performance.now() - started);
    result.profileLabel = profile?.label ?? null;
    result.matchScore = state.scoring?.score ?? null;
    state.lastRun = result;
    state.filling = false;

    watchUnmatched();

    if (settings.showOverlay !== false) {
      const scoreLine = state.scoring
        ? `Using "${state.scoring.label}" — ${state.scoring.score}% match. `
        : "";
      const draftLine = result.drafted
        ? `${result.drafted} answer${result.drafted === 1 ? "" : "s"} drafted for you to read. `
        : "";

      overlay.show({
        tone: result.unmatched ? "partial" : "done",
        title: result.unmatched
          ? `Filled ${result.filled} — ${result.unmatched} left for you`
          : `Filled ${result.filled} fields`,
        body:
          scoreLine + draftLine +
          (result.unmatched
            ? "The highlighted questions need your answer. Type once and Zapply remembers."
            : "Review it, then submit."),
        autoHide: !result.unmatched && !result.drafted,
      });
    }

    if (settings.autoPilot && adapter.nextButton) await advance(adapter);

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
    if (el.type === "checkbox") return el.checked ? "Yes" : "No";
    if (el.type === "radio") {
      const name = el.getAttribute("name");
      const group = name
        ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`))
        : [el];
      const picked = group.find((r) => r.checked);
      return picked ? M.visibleText(picked.closest("label") || picked.parentElement) || picked.value : "";
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
      return Array.from(el.options).map((o) => (o.textContent || "").trim()).filter(Boolean).slice(0, 25);
    }
    if (el.type === "radio") {
      const name = el.getAttribute("name");
      if (!name) return [];
      return Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`))
        .map((r) => M.visibleText(r.closest("label") || r.parentElement) || r.value)
        .filter(Boolean)
        .slice(0, 25);
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
    const next = document.querySelector(adapter.nextButton);
    if (!next || next.disabled) return;
    next.click();
    await sleep(1400);
    state.filling = false;
    await run({ manual: false });
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
        <button class="zapply-pill__close" aria-label="Dismiss">&times;</button>`;
      el.querySelector(".zapply-pill__close").addEventListener("click", () => this.hide());
      (document.body || document.documentElement).appendChild(el);
      this.node = el;
      return el;
    },
    show({ tone = "busy", title, body, autoHide = false }) {
      const el = this.ensure();
      el.dataset.tone = tone;
      el.querySelector(".zapply-pill__title").textContent = title;
      el.querySelector(".zapply-pill__body").textContent = body ?? "";
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

  async function loadSession() {
    const res = await send({ type: "ZAPPLY_GET_SESSION" });
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

    if (session.settings?.autofillOnLoad !== false) {
      // Give SPA forms a moment to mount
      await sleep(900);
      await run({ manual: false });
    }

    // Multi-step forms swap the fields under us; re-run when a big change lands.
    if (state.adapter?.quirks?.multiStep) {
      let debounce;
      new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (state.filling) return;
          const fresh = collectFields(state.adapter).filter((f) => !M.hasValue(f.el));
          if (fresh.length >= 3) run({ manual: false });
        }, 1200);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
