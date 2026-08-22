import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { askAIJSONFast, parseResumeDocument } from "@/lib/ai";
import { normalizeParsedResume } from "@/lib/profile-shape";

export const dynamic = "force-dynamic";
export const maxDuration = 55;
export const preferredRegion = "iad1";

const MAX_BYTES = 4 * 1024 * 1024;

const SHAPE = `{"personal":{"firstName":"","middleName":"","lastName":"","preferredName":"","email":"","phone":"","phoneCountryCode":"","phoneType":"Mobile","city":"","state":"","zip":"","country":"","address":"","addressLine2":"","nationality":"","citizenship":"","languages":[]},
 "summary":"",
 "targetRole":"",
 "education":[{"school":"","degree":"","fieldOfStudy":"","gpa":"","startDate":"","endDate":"","current":false,"location":"","description":""}],
 "experience":[{"company":"","title":"","employmentType":"","location":"","locationType":"","startDate":"","endDate":"","current":false,"description":""}],
 "skills":[],
 "certifications":[],
 "workAuth":{"authorizedToWork":"","requireSponsorship":"","workAuthType":"","visaStatus":"","willingToRelocate":"","remotePreference":"","availableStartDate":"","noticePeriod":"","over18":"","previouslyEmployedHere":"","referredBy":"","howDidYouHear":"","securityClearance":"","driversLicense":"","willingToDrugTest":"","willingToBackgroundCheck":""},
 "compensation":{"desiredSalary":"","currentSalary":"","salaryCurrency":"USD","salaryPeriod":"year"},
 "eeo":{"gender":"","race":"","hispanicLatino":"","veteranStatus":"","disabilityStatus":"","declineToSelfIdentify":false},
 "websites":[{"label":"LinkedIn","url":""}]}`;

const SYSTEM =
  "Extract structured data from a resume with high factual precision. Preserve exact names, employers, titles, dates, locations, skills, certifications, URLs, phone/email and education details. Never invent an employer, date, degree, salary, credential or answer that is not explicitly present. Use empty strings/arrays for missing data. Dates as YYYY-MM. Normalize degree only to: High School Diploma, Associate's Degree, Bachelor's Degree, Master's Degree, MBA, Doctorate (PhD), Bootcamp, Other. Order experience and education newest first. Capture every experience and education entry, not only the latest one. If a value is uncertain, leave it blank rather than guessing.";

/**
 * Accepts the resume file itself (multipart) or pre-extracted text (JSON).
 *
 * Text is extracted server-side first (unpdf for PDF, mammoth for DOCX) before
 * Gemini structures it. Nothing is written to the profile - the UI shows
 * the result for the user to accept.
 */
export const POST = handler(async (req: Request) => {
  await requireUser(req as any);
  const contentType = req.headers.get("content-type") ?? "";

  // JSON body: the caller already has the text.
  if (contentType.includes("application/json")) {
    const { text } = await req.json();
    if (!text || String(text).trim().length < 60) {
      return fail("We couldn't read enough text from that file. Try a PDF, DOC, DOCX, RTF or TXT resume.", 400);
    }
    const prompt = `Resume text:
"""
${String(text)}
"""

Return JSON in exactly this shape:
${SHAPE}`;
    let parsed: Record<string, unknown>;
    try {
      parsed = await askAIJSONFast<Record<string, unknown>>(SYSTEM, prompt, 3500);
    } catch (err) {
      // Keep JSON/text callers resilient too: the browser may submit already
      // extracted resume text instead of the original file. Never let a bad
      // model response turn into a 500/504 when we can still recover locally.
      console.error("[parse-resume:text-fallback] Gemini failed; using local extraction", err);
      const { fallbackParseResumeText } = await import("@/lib/ai");
      parsed = fallbackParseResumeText(String(text));
    }
    return ok(normalizeParsedResume(parsed));
  }

  // Multipart: the file itself.
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return fail("Choose a resume file to read.", 400);
  if (file.size > MAX_BYTES) return fail("That resume is over 4 MB. Please export/compress it to a smaller PDF or DOCX and try again.", 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const parsed = await parseResumeDocument({
      buffer,
      mimeType: file.type || "application/octet-stream",
      filename: file.name,
      system: SYSTEM,
      shape: SHAPE,
    });

    // A model asked for `skills: string[]` still returns `[{name:"React"}]`
    // sometimes. Coercing here means a drifted shape can never reach the
    // database and blow up the next profile save.
    return ok(normalizeParsedResume(parsed));
  } catch (err: any) {
    const message = String(err?.message || "We couldn't parse that resume.");
    // Bad/corrupt/unsupported files are client-fixable; don't turn them into
    // opaque 500 errors. AI/provider errors are allowed to bubble to handler().
    if (/couldn't read this (pdf|docx|legacy doc|rtf)|unsupported resume format|almost no readable text|password protected|encrypted|corrupted/i.test(message)) {
      return fail(message, 422);
    }
    if (/AI features need|provider rejected|authentication failed|Gemini|AI request failed|AI provider is|AI provider returned|AI request didn't go through|rate limiting|API key|invalid api|unauthorized|forbidden/i.test(message)) {
      return fail(message, 503);
    }
    console.error("[parse-resume] unexpected parser error", err);
    return fail("We could not parse that resume. Please try the upload again with the original file.", 422);
  }
});
