/**
 * Coercion for profile sections.
 *
 * Two callers need this:
 *  - the resume parser, because a language model asked for `skills: string[]`
 *    will sometimes hand back `[{name:"React"}]` or `"React, Node"`;
 *  - the PATCH route, because the browser can send anything.
 *
 * Without it a drifted shape reaches Mongoose, throws
 * "Cast to [string] failed" on save, and the user sees a generic 500.
 */

const str = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
};

const bool = (v: unknown): boolean => v === true || v === "true" || v === 1 || v === "yes";

/** Anything → string[]. Handles arrays of objects and comma-separated strings. */
export function toStringArray(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") {
    return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 100);
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return str(o.name ?? o.skill ?? o.value ?? o.label ?? o.title).trim();
      }
      return str(item).trim();
    })
    .filter(Boolean)
    .slice(0, 100);
}

/** Anything → [{label,url}]. Bare URL strings become labelled entries. */
export function toWebsites(v: unknown) {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list
    .map((item) => {
      if (typeof item === "string") return { label: labelForUrl(item), url: item.trim() };
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const url = str(o.url ?? o.link ?? o.href).trim();
        return { label: str(o.label ?? o.name ?? o.type) || labelForUrl(url), url };
      }
      return null;
    })
    .filter((w): w is { label: string; url: string } => Boolean(w?.url))
    .slice(0, 20);
}

function labelForUrl(url: string) {
  const u = url.toLowerCase();
  if (u.includes("linkedin")) return "LinkedIn";
  if (u.includes("github")) return "GitHub";
  if (u.includes("twitter") || u.includes("x.com")) return "Twitter/X";
  if (u.includes("dribbble")) return "Dribbble";
  if (u.includes("behance")) return "Behance";
  return "Portfolio";
}

const asArray = (v: unknown) => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []);

export function toExperience(v: unknown) {
  return asArray(v)
    .map((item) => {
      if (typeof item === "string") return { title: item.trim(), company: "", current: false };
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        company: str(o.company ?? o.employer ?? o.organization),
        title: str(o.title ?? o.role ?? o.position ?? o.jobTitle),
        employmentType: str(o.employmentType ?? o.type),
        location: str(o.location),
        locationType: str(o.locationType),
        startDate: normalizeMonth(o.startDate ?? o.start ?? o.from),
        endDate: normalizeMonth(o.endDate ?? o.end ?? o.to),
        current: bool(o.current ?? o.isCurrent),
        description: str(o.description ?? o.summary ?? o.details),
      };
    })
    .filter((e) => e.company || e.title)
    .slice(0, 25);
}

export function toEducation(v: unknown) {
  return asArray(v)
    .map((item) => {
      if (typeof item === "string") return { school: item.trim(), degree: "", current: false };
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        school: str(o.school ?? o.institution ?? o.university ?? o.college),
        degree: str(o.degree ?? o.qualification),
        fieldOfStudy: str(o.fieldOfStudy ?? o.major ?? o.field ?? o.subject),
        gpa: str(o.gpa ?? o.grade),
        startDate: normalizeMonth(o.startDate ?? o.start),
        endDate: normalizeMonth(o.endDate ?? o.end ?? o.graduationDate),
        current: bool(o.current),
        location: str(o.location),
        description: str(o.description),
      };
    })
    .filter((e) => e.school || e.degree)
    .slice(0, 15);
}

/** "March 2021", "2021", "03/2021" → "2021-03". Best effort; blank if unreadable. */
function normalizeMonth(v: unknown): string {
  const s = str(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  if (/^\d{4}$/.test(s)) return `${s}-01`;

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const named = s.toLowerCase().match(/([a-z]{3,})\w*\s+(\d{4})/);
  if (named) {
    const idx = months.indexOf(named[1].slice(0, 3));
    if (idx !== -1) return `${named[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  const numeric = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, "0")}`;

  const year = s.match(/(19|20)\d{2}/);
  return year ? `${year[0]}-01` : "";
}

/** Everything the resume parser may return, coerced to schema shape. */
export function normalizeParsedResume(raw: any) {
  const p = (raw?.personal ?? {}) as Record<string, unknown>;
  return {
    personal: {
      firstName: str(p.firstName ?? p.first_name),
      middleName: str(p.middleName),
      lastName: str(p.lastName ?? p.last_name),
      email: str(p.email),
      phone: str(p.phone ?? p.phoneNumber),
      city: str(p.city),
      state: str(p.state ?? p.region),
      country: str(p.country),
      languages: toStringArray(p.languages),
    },
    summary: str(raw?.summary),
    targetRole: str(raw?.targetRole),
    skills: toStringArray(raw?.skills),
    certifications: toStringArray(raw?.certifications),
    experience: toExperience(raw?.experience),
    education: toEducation(raw?.education),
    websites: toWebsites(raw?.websites ?? raw?.links),
  };
}
