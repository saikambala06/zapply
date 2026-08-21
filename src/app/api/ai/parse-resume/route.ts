import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { aiEnabled, askAIJSON, parseResumeDocument, AI_SETUP_HINT } from "@/lib/ai";
import { normalizeParsedResume } from "@/lib/profile-shape";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

const SHAPE = `{"personal":{"firstName":"","middleName":"","lastName":"","email":"","phone":"","city":"","state":"","country":""},
 "summary":"",
 "targetRole":"",
 "education":[{"school":"","degree":"","fieldOfStudy":"","gpa":"","startDate":"","endDate":"","current":false}],
 "experience":[{"company":"","title":"","location":"","startDate":"","endDate":"","current":false,"description":""}],
 "skills":[],
 "certifications":[],
 "websites":[{"label":"LinkedIn","url":""}]}`;

const SYSTEM =
  "Extract structured data from a resume. Copy values exactly as written - never invent an employer, date, degree or number that isn't in the document. Use empty strings for anything missing. Dates as YYYY-MM. For `degree`, normalise to one of: High School Diploma, Associate's Degree, Bachelor's Degree, Master's Degree, MBA, Doctorate (PhD), Bootcamp, Other. Order experience and education newest first.";

/**
 * Accepts the resume file itself (multipart) or pre-extracted text (JSON).
 *
 * Text is extracted server-side first (unpdf for PDF, mammoth for DOCX) because
 * Groq's models take text only. Nothing is written to the profile - the UI shows
 * the result for the user to accept.
 */
export const POST = handler(async (req: Request) => {
  await requireUser(req as any);
  if (!aiEnabled()) {
    return fail(AI_SETUP_HINT, 503);
  }

  const contentType = req.headers.get("content-type") ?? "";

  // JSON body: the caller already has the text.
  if (contentType.includes("application/json")) {
    const { text } = await req.json();
    if (!text || String(text).trim().length < 60) {
      return fail("We couldn't read enough text from that file. Try a text-based PDF, or paste the text.", 400);
    }
    const parsed = await askAIJSON<Record<string, unknown>>(
      SYSTEM,
      `Resume text:\n"""\n${String(text).slice(0, 14000)}\n"""\n\nReturn JSON in exactly this shape:\n${SHAPE}`,
      3000
    );
    return ok(normalizeParsedResume(parsed));
  }

  // Multipart: the file itself.
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return fail("Choose a resume file to read.", 400);
  if (file.size > MAX_BYTES) return fail("That file is over 8 MB. Compress it and try again.", 413);

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
    if (/couldn't read this (pdf|docx|legacy doc)|unsupported resume format|almost no readable text|password protected|encrypted|corrupted/i.test(message)) {
      return fail(message, 422);
    }
    throw err;
  }
});
