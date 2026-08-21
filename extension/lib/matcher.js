/**
 * ZAPPLY MATCHER
 * --------------
 * Two jobs:
 *   1. Work out what a form field is actually asking (deriveLabel)
 *   2. Put a value into it so the page's own JS believes a human typed it (setValue)
 *
 * (2) is the part that breaks naive autofill tools. React, Vue and Angular
 * track input state internally; assigning `el.value = x` updates the DOM but
 * not the framework's state, so the value vanishes on submit. The fix is to
 * call the *native* value setter from the prototype, then dispatch the events
 * the framework listens for.
 */

(function (global) {
  /* ------------------------------------------------------------------ */
  /*  Label derivation                                                   */
  /* ------------------------------------------------------------------ */

  const clean = (s) => (s || "").replace(/\s+/g, " ").replace(/[*✱]/g, "").trim();

  /** Text of the element, ignoring nested inputs and hidden helper text. */
  function visibleText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("input,select,textarea,button,svg,script,style").forEach((n) => n.remove());
    return clean(clone.textContent);
  }

  /**
   * Collects every plausible description of a field, best source first.
   * Returned as a single string so one regex test covers all of them.
   */
  function deriveLabel(el) {
    const parts = [];
    const push = (v) => {
      const c = clean(v);
      if (c && !parts.includes(c)) parts.push(c);
    };

    // Group question for radio/checkbox controls. Keep it before the option
    // label so AI and rule matching see the actual question as well as the choice.
    if (el.type === "radio" || el.type === "checkbox") {
      const fs = el.closest("fieldset");
      const legend = fs?.querySelector("legend");
      if (legend && !legend.contains(el)) push(visibleText(legend));
    }

    // 1. <label for="id">
    if (el.id) {
      const escaped = (window.CSS && CSS.escape) ? CSS.escape(el.id) : el.id.replace(/["\\]/g, "\\$&");
      document.querySelectorAll(`label[for="${escaped}"]`).forEach((l) => push(visibleText(l)));
    }

    // 2. aria-labelledby -> the referenced nodes
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => {
        const node = document.getElementById(id);
        if (node) push(visibleText(node));
      });
    }

    // 3. Direct attributes
    push(el.getAttribute("aria-label"));
    push(el.getAttribute("placeholder"));
    push(el.getAttribute("title"));
    push(el.getAttribute("data-label"));
    push(el.getAttribute("data-automation-id"));   // Workday
    push(el.getAttribute("data-qa"));              // Lever / Ashby

    // 4. Wrapping <label>
    const wrapping = el.closest("label");
    if (wrapping) push(visibleText(wrapping));

    // 5. Nearest labelled container — covers the common
    //    <div class="field"><div class="label">X</div><input/></div> shape
    let node = el.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const heading = node.querySelector(
        'label, legend, .label, [class*="label"], [class*="question"], [class*="Label"], h3, h4, p'
      );
      if (heading && !heading.contains(el)) {
        const t = visibleText(heading);
        if (t && t.length < 300) { push(t); break; }
      }
      // A fieldset's <legend> is the question for a radio group
      if (node.tagName === "FIELDSET") {
        const legend = node.querySelector("legend");
        if (legend) { push(visibleText(legend)); break; }
      }
    }

    // 6. Fall back to machine names, split into words so /first name/ matches "firstName"
    push(humanize(el.getAttribute("name")));
    push(humanize(el.id));

    return parts.join(" | ").slice(0, 400);
  }

  /** firstName / first_name / first-name -> "first name" */
  function humanize(s) {
    if (!s) return "";
    return s
      .replace(/[_\-.]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\d{4,}/g, " ")        // drop generated ids
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /* ------------------------------------------------------------------ */
  /*  Rule matching                                                      */
  /* ------------------------------------------------------------------ */

  /** The normalized "kind" of a control, used to filter which rules may apply. */
  function fieldKind(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    if (el.getAttribute("role") === "checkbox") return "checkbox";
    if (el.getAttribute("role") === "radio") return "radio";
    if (
      el.getAttribute("role") === "combobox" ||
      el.getAttribute("aria-haspopup") === "listbox" ||
      el.getAttribute("aria-haspopup") === "menu" ||
      (el.tagName === "BUTTON" && /dropdown|select/i.test(el.getAttribute("data-automation-id") || ""))
    ) {
      return "select";
    }
    const type = (el.type || "text").toLowerCase();
    if (["checkbox", "radio", "file", "date", "month", "number", "email", "tel", "url"].includes(type)) return type;
    return "text";
  }

  /**
   * Scores every rule against a field and returns the winner.
   * Score = rule weight + specificity bonus for matching an earlier (better) label source.
   */
  function matchRule(el, label, rules) {
    const kind = fieldKind(el);
    let best = null;
    let bestScore = -1;

    for (const rule of rules) {
      const types = rule.type ?? ["text"];
      const typeOk =
        types.includes(kind) ||
        (kind === "email" && types.includes("text")) ||
        (kind === "tel" && types.includes("text")) ||
        (kind === "url" && types.includes("text")) ||
        (kind === "number" && types.includes("text")) ||
        (kind === "radio" && types.includes("select")) ||
        (kind === "date" && types.includes("text")) ||
        (kind === "month" && types.includes("text"));
      if (!typeOk) continue;

      if (rule.deny?.some((re) => re.test(label))) continue;

      const hitIndex = rule.match.findIndex((re) => re.test(label));
      if (hitIndex === -1) continue;

      // Earlier regexes in a rule are the more precise ones.
      const score = (rule.weight ?? 5) * 10 - hitIndex;
      if (score > bestScore) {
        bestScore = score;
        best = rule;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /*  Value setting (framework-safe)                                     */
  /* ------------------------------------------------------------------ */

  function nativeSetter(el) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, "value")?.set;
  }

  function fire(el, ...types) {
    types.forEach((type) => {
      let evt;
      if (type.startsWith("key")) {
        evt = new KeyboardEvent(type, { bubbles: true, cancelable: true });
      } else if (type.startsWith("mouse") || type === "click") {
        evt = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
      } else if (type.startsWith("pointer") && typeof PointerEvent !== "undefined") {
        evt = new PointerEvent(type, { bubbles: true, cancelable: true });
      } else if (type.startsWith("focus") || type === "blur") {
        evt = new FocusEvent(type, { bubbles: true, cancelable: true });
      } else {
        evt = new Event(type, { bubbles: true, cancelable: true });
      }
      el.dispatchEvent(evt);
    });
  }

  /** Writes a text value and tells the host framework about it. */
  function setTextValue(el, value) {
    el.focus?.();
    const setter = nativeSetter(el);
    if (setter) setter.call(el, value);
    else el.value = value;

    fire(el, "input", "change");
    // Some libraries only commit on blur
    fire(el, "blur");
    return true;
  }

  const norm = (s) => (s || "").toString().toLowerCase().replace(/\s+/g, " ").trim();

  /**
   * Picks the closest option for a <select>.
   * `synonyms` lets a rule say: for the canonical answer "No", accept an option
   * whose text contains "no", "i do not", "false", etc.
   */
  function setSelectValue(el, value, synonyms) {
    if (!value) return false;
    const options = Array.from(el.options ?? []);
    if (!options.length) return false;

    const want = norm(value);
    const accepted = synonyms?.[value]?.map(norm) ?? [want];

    const score = (opt) => {
      const text = norm(opt.textContent);
      const val = norm(opt.value);
      if (!text && !val) return 0;
      if (text === want || val === want) return 100;
      for (const a of accepted) {
        if (!a) continue;
        if (text === a || val === a) return 90;
        if (text.startsWith(a) || val.startsWith(a)) return 70;
        if (text.includes(a) || val.includes(a)) return 55;
      }
      if (text.includes(want) || want.includes(text)) return 40;
      return 0;
    };

    let best = null;
    let bestScore = 30; // floor — below this we'd rather leave it blank
    options.forEach((opt) => {
      if (!opt.value && !opt.textContent?.trim()) return;
      const s = score(opt);
      if (s > bestScore) { bestScore = s; best = opt; }
    });
    if (!best) return false;

    const setter = nativeSetter(el);
    if (setter) setter.call(el, best.value);
    else el.value = best.value;
    el.selectedIndex = best.index;
    fire(el, "input", "change");
    return true;
  }

  /** Radio groups: find the input in the group whose label matches. */
  function setRadioValue(el, value, synonyms) {
    if (!value) return false;
    const name = el.getAttribute("name");
    let group;
    if (el.getAttribute("role") === "radio") {
      group = name
        ? Array.from(document.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`))
        : Array.from(el.closest('fieldset, [role="radiogroup"]')?.querySelectorAll('[role="radio"]') || [el]);
    } else {
      group = name
        ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`))
        : [el];
    }

    const want = norm(value);
    const accepted = synonyms?.[value]?.map(norm) ?? [want];

    let best = null;
    let bestScore = 0;
    group.forEach((radio) => {
      const text = norm(`${deriveLabel(radio)} ${radio.value}`);
      let s = 0;
      if (text === want) s = 100;
      else for (const a of accepted) {
        if (!a) continue;
        if (new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) { s = Math.max(s, 80); }
        else if (text.includes(a)) s = Math.max(s, 50);
      }
      if (s > bestScore) { bestScore = s; best = radio; }
    });

    if (!best || bestScore < 45) return false;
    if (best.getAttribute("role") === "radio") {
      best.click?.();
      best.setAttribute("aria-checked", "true");
      group.forEach((r) => { if (r !== best) r.setAttribute("aria-checked", "false"); });
    } else {
      best.checked = true;
      best.click?.();
    }
    fire(best, "input", "change");
    fire(best, "change");
    return true;
  }

  /** Waits for dropdown options to appear rather than guessing a fixed delay. */
  async function waitForOptions(timeoutMs = 1200) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = visibleOptions();
      if (found.length) return found;
      await new Promise((r) => setTimeout(r, 60));
    }
    return visibleOptions();
  }

  /**
   * Options often render in a portal at the end of <body>, not inside the
   * control, so this searches the whole document for anything option-shaped
   * that is currently on screen.
   */
  function visibleOptions() {
    const nodes = document.querySelectorAll(
      '[role="option"], [role="listbox"] li, [role="menuitem"], ' +
      'li[data-value], [data-automation-id*="promptOption"], ' +
      '[class*="menu"] [class*="option"], [class*="dropdown"] li, [class*="select__option"]'
    );
    return Array.from(nodes).filter((n) => {
      if (n.getAttribute("aria-disabled") === "true") return false;
      const rect = n.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function closeMenu(el) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.click?.();
  }

  /**
   * Custom dropdowns — react-select, Workday, Ashby, MUI.
   *
   * These come in two shapes and the old code only handled one:
   *   - a text input you type into to filter, then click a result
   *   - a button/div you click to open, then click a result
   * A Workday dropdown is `<button aria-haspopup="listbox">`, so typing into it
   * did nothing at all. Now we open first, type only if it accepts text, and
   * poll for the menu instead of assuming it appeared within 260ms.
   */
  async function setComboboxValue(el, value, waitMs = 1200, synonyms) {
    if (!value) return false;
    const want = norm(value);

    el.scrollIntoView?.({ block: "center", behavior: "instant" });
    el.focus?.();
    el.click?.();
    fire(el, "mousedown", "pointerdown");

    const typeable =
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.getAttribute("contenteditable") === "true";

    if (typeable) {
      setTextValue(el, String(value));
      fire(el, "keydown", "keyup");
    }

    let options = await waitForOptions(waitMs);

    // Nothing opened on click — try the keyboard, which some widgets require.
    if (!options.length) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      options = await waitForOptions(600);
    }
    if (!options.length) return false;

    let best = null;
    let bestScore = 0;
    options.forEach((opt) => {
      const text = norm(opt.textContent);
      if (!text) return;
      let s = 0;
      if (text === want) s = 100;
      else if (text.startsWith(want)) s = 82;
      else if (text.includes(want)) s = 66;
      else if (want.includes(text) && text.length > 2) s = 58;
      else {
        const accepted = synonyms?.[value]?.map(norm) ?? [];
        for (const a of accepted) {
          if (text === a) s = Math.max(s, 96);
          else if (text.includes(a) || a.includes(text)) s = Math.max(s, 78);
        }
      }
      if (s > bestScore) { bestScore = s; best = opt; }
    });

    if (!best || bestScore < 55) { closeMenu(el); return false; }

    best.scrollIntoView?.({ block: "nearest" });
    fire(best, "mouseover", "mousedown", "pointerdown");
    best.click();
    fire(best, "mouseup");
    fire(el, "change", "blur");
    return true;
  }

  /** Rebuilds a File from the stored base64 data URL. */
  function fileFromDataUrl(doc) {
    const [meta, b64] = doc.dataUrl.split(",");
    const mime = /:(.*?);/.exec(meta)?.[1] || doc.mimeType || "application/pdf";
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], doc.name || "resume.pdf", { type: mime });
  }

  /**
   * Attaches a resume to an upload control. Three strategies, in order:
   *   1. Assign a DataTransfer FileList to input.files — works on plain inputs.
   *   2. Redefine the `files` property — some widgets freeze the input.
   *   3. Fire a real drop event at the surrounding dropzone — this is how
   *      Greenhouse and Ashby's drag-and-drop uploaders actually take files.
   */
  function setFileValue(el, doc) {
    if (!doc?.dataUrl) return false;

    let file;
    try {
      file = fileFromDataUrl(doc);
    } catch (err) {
      console.warn("[Zapply] couldn't rebuild the resume file:", err);
      return false;
    }

    const dt = (() => {
      try {
        const t = new DataTransfer();
        t.items.add(file);
        return t;
      } catch {
        return null;
      }
    })();

    // 1. Standard assignment
    if (dt) {
      try {
        el.files = dt.files;
        if (el.files?.length) {
          fire(el, "input", "change");
          return true;
        }
      } catch {
        /* fall through */
      }

      // 2. Force the property onto this element only
      try {
        Object.defineProperty(el, "files", { value: dt.files, configurable: true });
        fire(el, "input", "change");
        if (el.files?.length) return true;
      } catch {
        /* fall through */
      }

      // 3. Drop it on the dropzone
      try {
        const zone =
          el.closest('[class*="dropzone"], [class*="drop-zone"], [class*="upload"], [data-testid*="upload"]') ||
          el.parentElement ||
          el;
        ["dragenter", "dragover", "drop"].forEach((type) => {
          const evt = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
          zone.dispatchEvent(evt);
        });
        return true;
      } catch (err) {
        console.warn("[Zapply] file attach failed:", err);
      }
    }

    return false;
  }

  /* ------------------------------------------------------------------ */
  /*  Question matching (shared with the server's normalizeQuestion)      */
  /* ------------------------------------------------------------------ */

  const STOPWORDS =
    /\b(please|kindly|the|a|an|your|you|us|our|this|that|is|are|do|does|did|of|to|for|in|on|at|we|and|or|if|will|would|can|could|may)\b/g;

  /** Must stay in sync with normalizeQuestion() in src/models/SavedResponse.ts */
  function normalizeQuestion(q) {
    return (q || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(STOPWORDS, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  /**
   * Very light suffix stripping so "working"/"work" and "expectations"/"expect"
   * land on the same token. Not a real stemmer — just enough that a reworded
   * question still matches the answer the user already wrote.
   */
  function stem(word) {
    return word
      .replace(/(ations?|ation)$/, "ate")
      .replace(/(ings?)$/, "")
      .replace(/(ed)$/, "")
      .replace(/(ies)$/, "y")
      .replace(/(es)$/, "")
      .replace(/s$/, "")
      .replace(/e$/, "");
  }

  function tokenize(normalized) {
    return new Set(
      normalized
        .split(" ")
        .filter((w) => w.length > 2)
        .map(stem)
        .filter((w) => w.length > 1)
    );
  }

  /** Jaccard-style overlap of stemmed tokens, 0–1. */
  function similarity(a, b) {
    const A = tokenize(a);
    const B = tokenize(b);
    if (!A.size || !B.size) return 0;
    let shared = 0;
    A.forEach((w) => { if (B.has(w)) shared++; });
    return shared / Math.max(A.size, B.size);
  }

  /**
   * Picks the best saved answer for a question, or null.
   * The threshold is deliberately high: filling the wrong answer into a real
   * application is far worse than leaving a field for the user.
   */
  function findSavedAnswer(question, responses, threshold = 0.6) {
    if (!responses?.length) return null;
    const key = normalizeQuestion(question);
    if (!key) return null;

    const exact = responses.find((r) => r.normalizedKey === key);
    if (exact?.answer) return { ...exact, confidence: 1 };

    let best = null;
    let bestScore = threshold;
    responses.forEach((r) => {
      if (!r.answer) return;
      const score = similarity(key, r.normalizedKey || normalizeQuestion(r.question));
      if (score > bestScore) { bestScore = score; best = r; }
    });
    return best ? { ...best, confidence: bestScore } : null;
  }

  function isFillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.type === "hidden") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    // Zero-size elements are usually decorative overlays
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && el.type !== "file") return false;
    return true;
  }

  function hasValue(el) {
    if (el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "radio") {
      return el.getAttribute("aria-checked") === "true";
    }
    if (el.type === "checkbox" || el.type === "radio") return el.checked;
    if (el.type === "file") return el.files?.length > 0;
    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
      const shown = (el.textContent || "").trim();
      return Boolean(shown) && !/^(select|choose|--|please|search)/i.test(shown);
    }
    if (el.tagName === "SELECT") {
      const opt = el.options[el.selectedIndex];
      return Boolean(opt?.value) && !/^(select|choose|--|please)/i.test(opt.textContent || "");
    }
    return Boolean(el.value?.trim());
  }


  /**
   * Select one or more checkboxes in a group. `answer` may be a boolean,
   * a canonical string, a comma/newline separated list, or an array.
   * Matching is based on the visible option label/value, not the DOM value
   * alone, so "United States" can match "United States of America".
   */
  function setCheckboxValue(el, answer, synonyms) {
    if (answer === undefined || answer === null || answer === "") return false;

    const isCustom = el.getAttribute("role") === "checkbox";
    const name = el.getAttribute("name");
    const customContainer = el.closest("fieldset, [role='group']");
    const group = isCustom
      ? (name
          ? Array.from(document.querySelectorAll(`[role="checkbox"][name="${CSS.escape(name)}"]`))
          : Array.from(customContainer?.querySelectorAll('[role="checkbox"]') || [el]))
      : (name
          ? Array.from(document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`))
          : [el]);

    let wants;
    if (Array.isArray(answer)) {
      wants = answer.map(norm).filter(Boolean);
    } else {
      const raw = String(answer).trim();
      if (/^(yes|true|checked|selected|1)$/i.test(raw)) wants = ["yes"];
      else if (/^(no|false|unchecked|not selected|0|none)$/i.test(raw)) wants = [];
      else wants = raw.split(/\s*(?:,|;|\n|\|)\s*/).map(norm).filter(Boolean);
    }

    const checked = (cb) =>
      cb.getAttribute("role") === "checkbox"
        ? cb.getAttribute("aria-checked") === "true"
        : Boolean(cb.checked);

    const setChecked = (cb, shouldCheck) => {
      if (checked(cb) !== shouldCheck) cb.click?.();
      if (cb.getAttribute("role") === "checkbox") cb.setAttribute("aria-checked", String(shouldCheck));
      fire(cb, "input", "change");
    };

    if (group.length === 1 && !wants.includes("yes")) {
      const shouldCheck = !/^(no|false|unchecked|0|none)$/i.test(String(answer).trim());
      setChecked(el, shouldCheck);
      return true;
    }

    for (const cb of group) {
      const label = norm(`${deriveLabel(cb)} ${cb.value || ""}`);
      const shouldCheck = wants.some((want) => {
        if (want === "yes") return true;
        const accepted = synonyms?.[want]?.map(norm) ?? [want];
        return accepted.some((x) => x && (label === x || label.includes(x) || x.includes(label)));
      });
      setChecked(cb, shouldCheck);
    }
    return true;
  }

  /** Reads the visible choices for native/custom controls. */
  function optionTextsFor(el) {
    if (!el) return [];
    if (el.tagName === "SELECT") {
      return Array.from(el.options || [])
        .map((o) => (o.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    if (el.type === "radio" || el.type === "checkbox") {
      const name = el.getAttribute("name");
      const group = name
        ? Array.from(document.querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(name)}"]`))
        : [el];
      return group
        .map((x) => visibleText(x.closest("label") || x.parentElement) || x.value)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    const described = visibleOptions();
    return described.map((x) => (x.textContent || "").trim()).filter(Boolean).slice(0, 50);
  }

  global.ZAPPLY_MATCHER = {
    deriveLabel,
    humanize,
    fieldKind,
    matchRule,
    setTextValue,
    setSelectValue,
    setRadioValue,
    setCheckboxValue,
    setComboboxValue,
    visibleOptions,
    waitForOptions,
    optionTextsFor,
    setFileValue,
    isFillable,
    hasValue,
    visibleText,
    norm,
    normalizeQuestion,
    similarity,
    tokenize,
    findSavedAnswer,
  };
})(typeof window !== "undefined" ? window : globalThis);
