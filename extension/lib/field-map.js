/**
 * ZAPPLY FIELD MAP
 * ----------------
 * The table that turns a form field's label into a value from the user's profile.
 *
 * Each rule has:
 *   key      unique id, used for logging and for the "skipped" report
 *   match    regexes tested against the field's derived label (label text,
 *            aria-label, placeholder, name, id — see matcher.js)
 *   deny     regexes that disqualify a match even if `match` hit. This is how
 *            "First name" is kept from stealing "First name of your reference".
 *   type     which input types this rule is allowed to fill
 *   value    (profile) => string | null
 *   options  for select/radio: how to pick among the available choices
 *   weight   tie-breaker when two rules match; higher wins
 *
 * Order matters only as a tie-break of last resort — scoring in matcher.js
 * decides, so put specific rules above general ones for readability.
 */

(function (global) {
  const P = (p) => p?.personal ?? {};
  const W = (p) => p?.workAuth ?? {};
  const C = (p) => p?.compensation ?? {};
  const E = (p) => p?.eeo ?? {};

  const site = (p, ...labels) => {
    const list = p?.websites ?? [];
    for (const label of labels) {
      const hit = list.find((w) => (w.label || "").toLowerCase().includes(label));
      if (hit?.url) return hit.url;
    }
    return null;
  };

  const latestJob = (p, index = 0) => (p?.experience ?? [])[Math.max(0, Number(index) || 0)] ?? (p?.experience ?? [])[0] ?? {};
  const latestSchool = (p, index = 0) => (p?.education ?? [])[Math.max(0, Number(index) || 0)] ?? (p?.education ?? [])[0] ?? {};

  const datePart = (raw, part) => {
    const value = String(raw ?? "").trim();
    if (!value) return null;
    const m = value.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (!m) return value;
    if (part === "year") return m[1];
    if (part === "month") return String(m[2]).padStart(2, "0");
    if (part === "monthName") {
      const names = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      return names[Math.max(0, Number(m[2]) - 1)] || null;
    }
    return value;
  };

  const dateForField = (raw, el) => {
    const type = (el?.type || "").toLowerCase();
    if (type === "month") return datePart(raw, "month");
    if (type === "date") return raw ? String(raw).slice(0, 10) : null;
    return raw;
  };

  const dateMonth = (raw) => datePart(raw, "monthName") || datePart(raw, "month");
  const dateYear = (raw) => datePart(raw, "year");

  const fullName = (p) =>
    [P(p).firstName, P(p).lastName].filter(Boolean).join(" ") || null;

  const fullAddress = (p) =>
    [P(p).address, P(p).addressLine2].filter(Boolean).join(", ") || null;

  const yearsExperience = (p) => {
    const roles = p?.experience ?? [];
    if (!roles.length) return null;
    let months = 0;
    roles.forEach((r) => {
      if (!r.startDate) return;
      const start = new Date(`${r.startDate}-01`);
      const end = r.current || !r.endDate ? new Date() : new Date(`${r.endDate}-01`);
      months += Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
    });
    return String(Math.max(1, Math.round(months / 12)));
  };

  const RULES = [
    /* ---------------- Name ---------------- */
    {
      key: "firstName",
      weight: 10,
      match: [/\b(first|given|fore)\s*name\b/i, /^fname$/i, /\bfirst_?name\b/i],
      deny: [/reference|emergency|supervisor|manager|contact\s*person|spouse|parent/i],
      type: ["text"],
      value: (p) => P(p).firstName,
    },
    {
      key: "lastName",
      weight: 10,
      match: [/\b(last|family|sur)\s*name\b/i, /^lname$/i, /\blast_?name\b/i],
      deny: [/reference|emergency|supervisor|manager|contact\s*person|spouse|parent/i],
      type: ["text"],
      value: (p) => P(p).lastName,
    },
    {
      key: "middleName",
      weight: 10,
      match: [/\bmiddle\s*(name|initial)\b/i],
      type: ["text"],
      value: (p) => P(p).middleName,
    },
    {
      key: "preferredName",
      weight: 9,
      match: [/\b(preferred|nick)\s*name\b/i, /\bwhat.*(call|go by)\b/i],
      type: ["text"],
      value: (p) => P(p).preferredName || P(p).firstName,
    },
    {
      key: "fullName",
      weight: 6,
      match: [/\b(full|legal|your)\s*name\b/i, /^name$/i, /\bcandidate\s*name\b/i, /\bapplicant\s*name\b/i],
      deny: [/first|last|middle|company|school|university|employer|reference|file|user/i],
      type: ["text"],
      value: fullName,
    },
    {
      key: "signature",
      weight: 8,
      match: [/\b(e-?)?signature\b/i, /\btype\s*your\s*(full\s*)?name\b/i, /\bsign\s*(here|below)\b/i],
      type: ["text"],
      value: (p) => E(p).disabilitySignatureName || fullName(p),
    },
    {
      key: "pronouns",
      weight: 9,
      match: [/\bpronouns?\b/i],
      type: ["text", "select", "radio"],
      value: (p) => P(p).pronouns,
    },
    {
      key: "dateOfBirth",
      weight: 11,
      match: [/\b(date\s*of\s*birth|birth\s*date|dob)\b/i],
      deny: [/graduat|start|end|employment/i],
      type: ["text", "date", "month"],
      value: (p, el) => dateForField(P(p).dateOfBirth, el),
    },
    {
      key: "nationality",
      weight: 10,
      match: [/\b(nationality|citizenship|citizen(ship)?\s*status)\b/i],
      deny: [/work\s*authorization|sponsor|visa/i],
      type: ["text", "select"],
      value: (p) => P(p).nationality || P(p).citizenship,
    },

    /* ---------------- Contact ---------------- */
    {
      key: "email",
      weight: 10,
      match: [/\be-?mail\b/i],
      deny: [/confirm|verify|re-?enter|alternate|reference|emergency/i],
      type: ["text", "email"],
      value: (p) => P(p).email,
    },
    {
      key: "emailConfirm",
      weight: 11,
      match: [/(confirm|verify|re-?enter|repeat).*e-?mail/i, /e-?mail.*(confirm|again)/i],
      type: ["text", "email"],
      value: (p) => P(p).email,
    },
    {
      key: "phoneCountryCode",
      weight: 11,
      match: [/\b(country|dial|area)\s*code\b/i, /\bphone.*code\b/i],
      type: ["text", "select", "tel"],
      value: (p) => P(p).phoneCountryCode,
    },
    {
      key: "phone",
      weight: 9,
      match: [/\b(phone|mobile|cell|telephone|contact\s*number)\b/i],
      deny: [/country|area\s*code|extension|emergency|reference|type/i],
      type: ["text", "tel"],
      value: (p) => P(p).phone,
    },
    {
      key: "phoneType",
      weight: 10,
      match: [/\bphone\s*(type|device)\b/i],
      type: ["select", "radio", "text"],
      value: (p) => P(p).phoneType || "Mobile",
      options: ["mobile", "cell", "home", "personal"],
    },

    /* ---------------- Address ---------------- */
    {
      key: "addressLine2",
      weight: 11,
      match: [/\b(address\s*(line\s*)?2|apt|apartment|suite|unit)\b/i],
      type: ["text"],
      value: (p) => P(p).addressLine2,
    },
    {
      key: "address",
      weight: 8,
      match: [/\b(street|address\s*(line\s*)?1?|mailing\s*address|home\s*address)\b/i],
      deny: [/e-?mail|city|state|zip|postal|country|line\s*2|apt|suite/i],
      type: ["text"],
      value: fullAddress,
    },
    {
      key: "city",
      weight: 10,
      match: [/\bcity\b/i, /\btown\b/i, /\blocality\b/i],
      deny: [/school|university|employer|company|birth/i],
      type: ["text", "select"],
      value: (p) => P(p).city,
    },
    {
      key: "state",
      weight: 10,
      match: [/\b(state|province|region|county)\b/i],
      deny: [/united\s*states\b.*country|veteran|marital|employment\s*status/i],
      type: ["text", "select"],
      value: (p) => P(p).state,
    },
    {
      key: "zip",
      weight: 10,
      match: [/\b(zip|postal)\s*code\b/i, /^zip$/i, /\bpostcode\b/i],
      type: ["text"],
      value: (p) => P(p).zip,
    },
    {
      key: "country",
      weight: 9,
      match: [/\bcountry\b/i],
      deny: [/code|citizenship|origin/i],
      type: ["text", "select"],
      value: (p) => P(p).country,
    },
    {
      key: "location",
      weight: 6,
      match: [/\b(location|where are you (based|located))\b/i, /\bcurrent\s*location\b/i],
      deny: [/job|role|position|office|preferred\s*work/i],
      type: ["text"],
      value: (p) => [P(p).city, P(p).state, P(p).country].filter(Boolean).join(", ") || null,
    },

    /* ---------------- Links ---------------- */
    {
      key: "linkedin",
      weight: 11,
      match: [/\blinked-?in\b/i],
      type: ["text", "url"],
      value: (p) => site(p, "linkedin"),
    },
    {
      key: "github",
      weight: 11,
      match: [/\bgit-?hub\b/i],
      type: ["text", "url"],
      value: (p) => site(p, "github"),
    },
    {
      key: "portfolio",
      weight: 9,
      match: [/\b(portfolio|personal\s*(web)?site|website|your\s*url)\b/i],
      deny: [/company|employer|linkedin|github/i],
      type: ["text", "url"],
      value: (p) => site(p, "portfolio", "personal", "website") || site(p, "github"),
    },
    {
      key: "twitter",
      weight: 11,
      match: [/\b(twitter|x\.com)\b/i],
      type: ["text", "url"],
      value: (p) => site(p, "twitter", "x"),
    },

    /* ---------------- Work history ---------------- */
    {
      key: "currentCompany",
      weight: 9,
      match: [/\b(current|present|most recent|latest)\s*(employer|company|organization)\b/i, /^company$/i, /\bemployer\b/i],
      deny: [/previous|former|why|reason|reference/i],
      type: ["text"],
      value: (p, _el, _label, index) => latestJob(p, index).company,
    },
    {
      key: "currentTitle",
      weight: 9,
      match: [/\b(current|present|most recent|latest)\s*(job\s*)?title\b/i, /\byour\s*(job\s*)?title\b/i, /^job\s*title$/i, /\bposition\s*title\b/i],
      deny: [/desired|applying|role you|reference/i],
      type: ["text"],
      value: (p, _el, _label, index) => latestJob(p, index).title,
    },
    {
      key: "employmentType",
      weight: 12,
      match: [/\bemployment\s*(type|status)\b/i, /\bjob\s*(type|status)\b/i, /\bwork\s*(type|status)\b/i],
      deny: [/current|previous|eligibility|authorized/i],
      type: ["text", "select", "radio"],
      value: (p, _el, _label, index) => latestJob(p, index).employmentType,
    },
    {
      key: "experienceLocation",
      weight: 12,
      match: [
        /\b(experience|employment|work\s*history|job\s*history)\b.*\blocation\b/i,
        /\blocation\b.*\b(experience|employment|work\s*history|job\s*history)\b/i,
      ],
      type: ["text", "select"],
      value: (p, _el, _label, index) => latestJob(p, index).location,
    },
    {
      key: "experienceLocationType",
      weight: 12,
      match: [
        /\b(work|job|employment|experience)\b.*\b(location|workplace)\s*(type|mode|arrangement)\b/i,
        /\b(remote|hybrid|on[- ]site)\b.*\b(work|employment|location)\b/i,
      ],
      type: ["text", "select", "radio"],
      value: (p, _el, _label, index) => latestJob(p, index).locationType,
      options: {
        "On-site": ["on-site", "onsite", "office"],
        Remote: ["remote", "work from home", "wfh"],
        Hybrid: ["hybrid"],
      },
    },
    {
      key: "responsibilities",
      weight: 9,
      match: [/\b(responsibilit(?:y|ies)|what\s+you\s+did|duties|job\s+duties)\b/i],
      deny: [/reference|emergency/i],
      type: ["text", "textarea"],
      value: (p, _el, _label, index) => latestJob(p, index).description,
    },
    {
      key: "experienceStartDate",
      weight: 12,
      match: [
        /\b(experience|employment|work\s*history|job\s*history)\b.*\bstart\b/i,
        /\bstart\b.*\b(experience|employment|work\s*history|job\s*history)\b/i,
      ],
      type: ["text", "date", "month"],
      value: (p, el, _label, index) => dateForField(latestJob(p, index).startDate, el),
    },
    {
      key: "experienceEndDate",
      weight: 12,
      match: [
        /\b(experience|employment|work\s*history|job\s*history)\b.*\bend\b/i,
        /\bend\b.*\b(experience|employment|work\s*history|job\s*history)\b/i,
      ],
      type: ["text", "date", "month"],
      value: (p, el, _label, index) => dateForField(latestJob(p, index).endDate, el),
    },
    {
      key: "experienceStartMonth",
      weight: 13,
      match: [/\bstart\s*date\s*month\b/i, /\bstart\s*month\b/i],
      deny: [/education|school|college|university/i],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateMonth(latestJob(p, index).startDate),
    },
    {
      key: "experienceStartYear",
      weight: 13,
      match: [/\bstart\s*date\s*year\b/i, /\bstart\s*year\b/i],
      deny: [/education|school|college|university/i],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateYear(latestJob(p, index).startDate),
    },
    {
      key: "experienceEndMonth",
      weight: 13,
      match: [/\bend\s*date\s*month\b/i, /\bend\s*month\b/i],
      deny: [/education|school|college|university/i],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateMonth(latestJob(p, index).endDate),
    },
    {
      key: "experienceEndYear",
      weight: 13,
      match: [/\bend\s*date\s*year\b/i, /\bend\s*year\b/i],
      deny: [/education|school|college|university/i],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateYear(latestJob(p, index).endDate),
    },
    {
      key: "currentJob",
      weight: 12,
      match: [/\bcurrently\s*(work|employed)\b/i, /\bcurrent\s*(job|role|position)\b/i, /\bthis\s*is\s*my\s*current\s*(job|role)\b/i],
      type: ["checkbox", "radio", "select"],
      value: (p, _el, _label, index) => latestJob(p, index).current ? "Yes" : "No",
      options: { Yes: ["yes", "currently", "current", "true"], No: ["no", "not current", "false"] },
    },
    {
      key: "yearsExperience",
      weight: 9,
      match: [/\byears?\s*(of\s*)?(relevant\s*|professional\s*|work\s*)?experience\b/i, /\bhow many years\b/i, /\bexperience\s*\(years\)/i],
      type: ["text", "number", "select", "radio"],
      value: yearsExperience,
    },

    /* ---------------- Education ---------------- */
    {
      key: "school",
      weight: 10,
      match: [/\b(school|university|college|institution)\b/i],
      deny: [/high\s*school\s*only|graduated\b.*\?/i],
      type: ["text", "select"],
      value: (p, _el, _label, index) => latestSchool(p, index).school,
    },
    {
      key: "degree",
      weight: 10,
      match: [/\bdegree\b/i, /\beducation\s*level\b/i, /\bhighest\s*(level\s*of\s*)?education\b/i],
      deny: [/field|major|subject|date/i],
      type: ["text", "select", "radio"],
      value: (p, _el, _label, index) => latestSchool(p, index).degree,
    },
    {
      key: "fieldOfStudy",
      weight: 11,
      match: [/\b(field\s*of\s*study|major|discipline|concentration|area\s*of\s*study)\b/i],
      type: ["text", "select"],
      value: (p, _el, _label, index) => latestSchool(p, index).fieldOfStudy,
    },
    {
      key: "educationLocation",
      weight: 8,
      match: [/\b(school|college|university|education)\b.*\blocation\b/i, /\blocation\b.*\b(school|college|university)\b/i],
      type: ["text", "select"],
      value: (p, _el, _label, index) => latestSchool(p, index).location,
    },
    {
      key: "gpa",
      weight: 11,
      match: [/\bgpa\b/i, /\bgrade\s*point\b/i],
      type: ["text", "number"],
      value: (p, _el, _label, index) => latestSchool(p, index).gpa,
    },
    {
      key: "graduationDate",
      weight: 9,
      match: [/\b(graduation|grad)\s*(date|year|month)\b/i, /\b(expected|anticipated)\s*graduation\b/i],
      type: ["text", "date", "month", "select"],
      value: (p, el, _label, index) => dateForField(latestSchool(p, index).endDate, el),
    },
    {
      key: "educationStartMonth",
      weight: 13,
      match: [
        /\b(education|school|college|university)\b.*\b(start|begin)\w*\s*date\s*month\b/i,
        /\b(start|begin)\w*\s*date\s*month\b.*\b(education|school|college|university)\b/i,
      ],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateMonth(latestSchool(p, index).startDate),
    },
    {
      key: "educationStartYear",
      weight: 13,
      match: [
        /\b(education|school|college|university)\b.*\b(start|begin)\w*\s*date\s*year\b/i,
        /\b(start|begin)\w*\s*date\s*year\b.*\b(education|school|college|university)\b/i,
      ],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateYear(latestSchool(p, index).startDate),
    },
    {
      key: "educationEndMonth",
      weight: 13,
      match: [
        /\b(education|school|college|university)\b.*\bend\s*date\s*month\b/i,
        /\bend\s*date\s*month\b.*\b(education|school|college|university)\b/i,
        /\bend\s*\(?(or\s+expected)?\)?\s*date\s*month\b.*\b(education|school|college|university)\b/i,
      ],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateMonth(latestSchool(p, index).endDate),
    },
    {
      key: "educationEndYear",
      weight: 13,
      match: [
        /\b(education|school|college|university)\b.*\bend\s*date\s*year\b/i,
        /\bend\s*date\s*year\b.*\b(education|school|college|university)\b/i,
        /\bend\s*\(?(or\s+expected)?\)?\s*date\s*year\b.*\b(education|school|college|university)\b/i,
      ],
      type: ["select", "text"],
      value: (p, _el, _label, index) => dateYear(latestSchool(p, index).endDate),
    },

    /* ---------------- Work eligibility ---------------- */
    {
      key: "authorizedToWork",
      weight: 12,
      match: [
        /\b(legally\s*)?(authoriz|eligib)\w*\s*to\s*work\b/i,
        /\bwork\s*authoriz\w*\b/i,
        /\blegally\s*(entitled|permitted)\s*to\s*work\b/i,
        /\bright\s*to\s*work\b/i,
      ],
      deny: [/sponsor/i],
      type: ["select", "radio", "text"],
      value: (p) => W(p).authorizedToWork || "Yes",
      options: { Yes: ["yes", "i am", "authorized", "true"], No: ["no", "not authorized", "false"] },
    },
    {
      key: "requireSponsorship",
      weight: 13,
      match: [
        /\b(require|need|seek)\w*\s*(visa\s*)?sponsor/i,
        /\bsponsorship\b.*\b(now|future|require|need)\b/i,
        /\bwill\s*you\s*.*sponsorship\b/i,
        /\bimmigration\s*sponsorship\b/i,
      ],
      type: ["select", "radio", "text"],
      value: (p) => W(p).requireSponsorship || "No",
      options: { Yes: ["yes", "i will", "true"], No: ["no", "i do not", "i don't", "false"] },
    },
    {
      key: "visaStatus",
      weight: 10,
      match: [/\bvisa\s*(status|type)\b/i, /\bimmigration\s*status\b/i, /\bwork\s*permit\s*type\b/i],
      type: ["select", "text"],
      value: (p) => W(p).workAuthType || W(p).visaStatus,
    },
    {
      key: "willingToRelocate",
      weight: 11,
      match: [/\bwilling\s*to\s*relocat/i, /\bopen\s*to\s*relocat/i, /\brelocation\b/i],
      type: ["select", "radio", "text"],
      value: (p) => W(p).willingToRelocate || "Yes",
      options: { Yes: ["yes", "willing", "true"], No: ["no", "not willing", "false"] },
    },
    {
      key: "remotePreference",
      weight: 10,
      match: [/\b(remote|work\s*(location\s*)?preference|hybrid|on-?site)\s*(preference)?\b/i],
      type: ["select", "radio"],
      value: (p) => W(p).remotePreference,
    },
    {
      key: "startDate",
      weight: 10,
      match: [/\b(available|earliest|possible|potential)\s*(to\s*)?start\s*(date)?\b/i, /\bwhen\s*can\s*you\s*start\b/i, /\bstart\s*date\b/i, /\bavailability\s*date\b/i],
      deny: [/employment\s*start|previous|current\s*job|experience|employment|work\s*history|education|school|college|university/i],
      type: ["text", "date", "month"],
      value: (p, el) => dateForField(W(p).availableStartDate, el),
    },
    {
      key: "noticePeriod",
      weight: 11,
      match: [/\bnotice\s*period\b/i, /\bhow\s*much\s*notice\b/i],
      type: ["text", "select"],
      value: (p) => W(p).noticePeriod,
    },
    {
      key: "over18",
      weight: 12,
      match: [/\b(are\s*you\s*)?(at\s*least\s*)?(18|eighteen)\s*(years)?\s*(of\s*age|or\s*older|\+)?\b/i, /\blegal\s*working\s*age\b/i],
      type: ["select", "radio"],
      value: (p) => W(p).over18 || "Yes",
      options: { Yes: ["yes", "true"], No: ["no", "false"] },
    },
    {
      key: "previouslyEmployed",
      weight: 12,
      match: [/\b(previously|ever)\s*(been\s*)?(employed|worked)\b/i, /\bformer\s*employee\b/i, /\bworked\s*(here|for\s*(us|this))\b/i],
      type: ["select", "radio"],
      value: (p) => W(p).previouslyEmployedHere || "No",
      options: { Yes: ["yes", "true"], No: ["no", "false"] },
    },
    {
      key: "referredBy",
      weight: 11,
      match: [/\breferr?ed\s*by\b/i, /\breferral\s*(name|source)\b/i, /\bwho\s*referred\b/i],
      type: ["text"],
      value: (p) => W(p).referredBy,
    },
    {
      key: "howDidYouHear",
      weight: 11,
      match: [/\bhow\s*did\s*you\s*(hear|find|learn)\b/i, /\bsource\s*of\s*(referral|application)\b/i, /\bwhere\s*did\s*you\s*(hear|find)\b/i],
      type: ["select", "text", "radio"],
      value: (p) => W(p).howDidYouHear,
    },
    {
      key: "securityClearance",
      weight: 11,
      match: [/\bsecurity\s*clearance\b/i, /\bclearance\s*level\b/i],
      type: ["select", "radio", "text"],
      value: (p) => W(p).securityClearance,
    },
    {
      key: "driversLicense",
      weight: 11,
      match: [/\bdriver'?s?\s*licen[cs]e\b/i],
      type: ["select", "radio", "text"],
      value: (p) => W(p).driversLicense,
    },
    {
      key: "willingToDrugTest",
      weight: 11,
      match: [/\b(willing|agree|consent).*\bdrug\s*test\b/i, /\bdrug\s*test\b/i],
      type: ["select", "radio"],
      value: (p) => W(p).willingToDrugTest || "Yes",
      options: { Yes: ["yes", "agree", "consent", "true"], No: ["no", "do not", "decline", "false"] },
    },
    {
      key: "willingToBackgroundCheck",
      weight: 11,
      match: [/\b(willing|agree|consent).*\bbackground\s*(check|screening)\b/i, /\bbackground\s*(check|screening)\b/i],
      type: ["select", "radio"],
      value: (p) => W(p).willingToBackgroundCheck || "Yes",
      options: { Yes: ["yes", "agree", "consent", "true"], No: ["no", "do not", "decline", "false"] },
    },

    /* ---------------- Compensation ---------------- */
    {
      key: "desiredSalary",
      weight: 11,
      match: [
        /\b(desired|expected|requested|target)\s*(salary|compensation|pay|rate)\b/i,
        /\bsalary\s*(expectation|requirement)/i,
        /\bcompensation\s*expectation/i,
        /\bwhat.*salary.*(looking|expect)/i,
      ],
      type: ["text", "number"],
      value: (p) => C(p).desiredSalary,
    },
    {
      key: "currentSalary",
      weight: 12,
      match: [/\b(current|present)\s*(salary|compensation|pay)\b/i],
      type: ["text", "number"],
      value: (p) => C(p).currentSalary,
    },

    /* ---------------- EEO ---------------- */
    {
      key: "gender",
      weight: 10,
      match: [/\bgender\b/i, /\bsex\b/i],
      deny: [/identity\s*expression|transgender/i],
      type: ["select", "radio"],
      value: (p) => (E(p).declineToSelfIdentify ? "Prefer not to say" : E(p).gender),
      options: {
        Male: ["male", "man"],
        Female: ["female", "woman"],
        "Non-binary": ["non-binary", "nonbinary", "non binary"],
        "Prefer not to say": ["decline", "prefer not", "do not wish", "don't wish", "not disclose", "i don't want"],
      },
    },
    {
      key: "hispanicLatino",
      weight: 12,
      match: [/\bhispanic\s*(or|\/)?\s*latino\b/i],
      type: ["select", "radio"],
      value: (p) => (E(p).declineToSelfIdentify ? "Prefer not to say" : E(p).hispanicLatino),
      options: {
        Yes: ["yes"],
        No: ["no"],
        "Prefer not to say": ["decline", "prefer not", "do not wish", "not disclose"],
      },
    },
    {
      key: "race",
      weight: 10,
      match: [/\b(race|ethnicity|ethnic\s*(group|background))\b/i],
      type: ["select", "radio", "checkbox"],
      value: (p) => (E(p).declineToSelfIdentify ? "Prefer not to say" : E(p).race),
      options: null,
    },
    {
      key: "veteranStatus",
      weight: 11,
      match: [/\bveteran\b/i, /\bmilitary\s*(service|status)\b/i, /\bprotected\s*veteran\b/i],
      type: ["select", "radio"],
      value: (p) => E(p).veteranStatus || (E(p).declineToSelfIdentify ? "I don't wish to answer" : null),
      options: null,
    },
    {
      key: "disabilityStatus",
      weight: 11,
      match: [/\bdisabilit(y|ies)\b/i, /\bsection\s*503\b/i],
      deny: [/accommodation/i],
      type: ["select", "radio"],
      value: (p) => (E(p).declineToSelfIdentify ? "I don't wish to answer" : E(p).disabilityStatus),
      options: null,
    },

    /* ---------------- Misc ---------------- */
    {
      key: "resume",
      weight: 12,
      match: [/\bresume\b/i, /\bcv\b/i, /\bupload\s*(your\s*)?(resume|cv)\b/i],
      deny: [/cover\s*letter|transcript|portfolio\s*file/i],
      type: ["file"],
      value: () => "__RESUME__",
    },
    {
      key: "coverLetter",
      weight: 12,
      match: [/\bcover\s*letter\b/i, /\bmotivation\s*letter\b/i],
      type: ["file", "textarea"],
      value: () => "__COVER_LETTER__",
    },
    {
      key: "certifications",
      weight: 8,
      match: [/\b(certification|certifications|professional\s*license|licen[cs]e)\b/i],
      deny: [/driver'?s?/i],
      type: ["text", "textarea"],
      value: (p) => (p?.certifications ?? []).join(", "),
    },
    {
      key: "languages",
      weight: 8,
      match: [/\b(language|languages|spoken\s*languages|language\s*proficiency)\b/i],
      type: ["text", "textarea"],
      value: (p) => (P(p).languages ?? []).join(", "),
    },
    {
      key: "summary",
      weight: 6,
      match: [/\b(about\s*(you|yourself)|summary|bio|profile\s*summary|tell\s*us\s*about\s*you)\b/i],
      type: ["textarea"],
      value: (p) => p?.summary,
    },
  ];

  global.ZAPPLY_FIELD_MAP = RULES;
})(typeof window !== "undefined" ? window : globalThis);
