/**
 * Gemini-only AI provider.
 *
 * Google Gemini 2.5 Flash has a 1M-token context window and a free tier, so the
 * app can send the complete text extracted from long PDF/DOCX resumes instead
 * of truncating them or routing normal parsing through another provider.
 */

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RESUME_TEXT_CHARS = 900_000;

type Message = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  maxTokens?: number;
  temperature?: number;
  retries?: number;
  timeoutMs?: number;
  json?: boolean;
};

function cleanSecret(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^\s*[\'"]/, "")
    .replace(/[\'"]\s*$/, "");
}

function getGeminiApiKey(): string {
  return cleanSecret(process.env.GOOGLE_API_KEY);
}

function getGeminiModel(): string {
  // GEMINI_MODEL is intentionally the only model override. The default is a
  // stable, free-tier model with a 1M-token context window.
  return cleanSecret(process.env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;
}

export function aiEnabled() {
  return Boolean(getGeminiApiKey());
}

export const AI_SETUP_HINT =
  "AI features need GOOGLE_API_KEY. Get a Gemini API key from Google AI Studio and add it to Vercel, then redeploy.";

function geminiAuthError(detail: string): Error {
  const d = String(detail || "").replace(/\s+/g, " ").trim();
  if (/API key expired|API_KEY_INVALID|invalid api key|api key not valid|permission denied|unauthenticated/i.test(d)) {
    return new Error(
      "Gemini authentication failed. Set GOOGLE_API_KEY to a current Google AI Studio Gemini API key, without quotes or spaces, then redeploy."
    );
  }
  return new Error(
    "Gemini authentication failed (HTTP 401/403). Verify GOOGLE_API_KEY and that the key can use the Gemini API, then redeploy."
  );
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 45000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Gemini timed out while parsing the resume. Please retry once.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function backoff(attempt: number, explicitMs?: number) {
  return new Promise((resolve) => setTimeout(resolve, explicitMs ?? Math.min(3000, 500 * 2 ** attempt)));
}

async function geminiGenerate(
  contents: unknown[],
  opts: ChatOptions = {}
): Promise<string> {
  const { maxTokens = 1024, temperature = 0.2, retries = 1, timeoutMs = 45000, json = false } = opts;
  const key = getGeminiApiKey();
  if (!key) throw new Error(AI_SETUP_HINT);

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_ROOT}/${encodeURIComponent(model)}:generateContent`;
  let lastError = "Gemini request failed.";

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
          "x-goog-api-client": "zapply-resume/1.2",
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      }, timeoutMs);
    } catch (err: any) {
      lastError = String(err?.message || "Couldn't reach Gemini.");
      if (attempt < retries) {
        await backoff(attempt);
        continue;
      }
      throw new Error(lastError);
    }

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part?.text || "")
        .join("\n")
        .trim();
      if (text) return text;
      lastError = "Gemini returned an empty response.";
      if (attempt < retries) {
        await backoff(attempt);
        continue;
      }
      throw new Error(lastError);
    }

    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw geminiAuthError(detail);
    if (res.status === 404) throw new Error(`Gemini model \"${model}\" is unavailable. Set GEMINI_MODEL to a supported model.`);
    if (res.status === 429 || res.status >= 500) {
      lastError = res.status === 429
        ? "Gemini is rate limiting requests. Try again in a moment."
        : "Gemini is temporarily unavailable. Please try again shortly.";
      if (attempt < retries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await backoff(attempt, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
        continue;
      }
      throw new Error(lastError);
    }

    throw new Error(`Gemini request failed (${res.status}). ${detail.slice(0, 240)}`);
  }

  throw new Error(lastError);
}

function messagesToContents(messages: Message[]) {
  const systemText = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const nonSystem = messages.filter((m) => m.role !== "system");

  if (!nonSystem.length) {
    return [{ role: "user", parts: [{ text: systemText }] }];
  }

  return nonSystem.map((m, index) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: index === 0 && systemText ? `${systemText}\n\n${m.content}` : m.content }],
  }));
}

export async function askAI(system: string, user: string, maxTokens = 1024) {
  const raw = await geminiGenerate(messagesToContents([
    { role: "system", content: system },
    { role: "user", content: user },
  ]), { maxTokens, temperature: 0.4, retries: 1, timeoutMs: 25000 });
  return raw.trim();
}

export async function askAIJSON<T>(system: string, user: string, maxTokens = 1500): Promise<T> {
  const raw = await geminiGenerate(messagesToContents([
    { role: "system", content: `${system}\n\nRespond with one valid JSON object and nothing else. No prose and no markdown fences.` },
    { role: "user", content: user },
  ]), { maxTokens, temperature: 0.15, retries: 1, timeoutMs: 30000, json: true });
  return parseJson<T>(raw);
}

/** Fast one-shot JSON extraction used by resume parsing. */
export async function askAIJSONFast<T>(system: string, user: string, maxTokens = 4500): Promise<T> {
  const raw = await geminiGenerate(messagesToContents([
    { role: "system", content: `${system}\n\nRespond with one valid JSON object and nothing else. No prose and no markdown fences.` },
    { role: "user", content: user },
  ]), { maxTokens, temperature: 0.1, retries: 0, timeoutMs: 45000, json: true });
  return parseJson<T>(raw);
}

/** Backward-compatible alias for existing imports. */
export async function askGeminiJSON<T>(system: string, user: string, maxOutputTokens = 4500): Promise<T> {
  return askAIJSONFast<T>(system, user, maxOutputTokens);
}

export function parseJson<T>(raw: string): T {
  const cleaned = String(raw ?? "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        // fall through
      }
    }
    throw new Error("The AI response wasn't valid JSON. Please retry the resume parse.");
  }
}

/** Compact profile text used as context for scoring and answer generation. */
export function profileToContext(p: any) {
  const exp = (p.experience ?? [])
    .slice(0, 10)
    .map((e: any) => `- ${e.title} at ${e.company} (${e.startDate}–${e.current ? "present" : e.endDate}). ${e.description ?? ""}`)
    .join("\n");
  const edu = (p.education ?? [])
    .map((e: any) => `- ${e.degree} in ${e.fieldOfStudy}, ${e.school} (${e.startDate}–${e.current ? "present" : e.endDate}). ${e.description ?? ""}`)
    .join("\n");
  const websites = (p.websites ?? [])
    .map((w: any) => `${w.label || "Website"}: ${w.url || ""}`)
    .filter(Boolean)
    .join("\n");
  return [
    `Name: ${p.personal?.firstName ?? ""} ${p.personal?.lastName ?? ""}`,
    `Email: ${p.personal?.email ?? ""}`,
    `Phone: ${p.personal?.phone ?? ""}`,
    `Target role: ${p.targetRole || "not specified"}`,
    `Location: ${[p.personal?.city, p.personal?.state, p.personal?.country].filter(Boolean).join(", ")}`,
    p.personal?.languages?.length ? `Languages: ${p.personal.languages.join(", ")}` : "",
    p.summary ? `Summary: ${p.summary}` : "",
    exp ? `Experience:\n${exp}` : "",
    edu ? `Education:\n${edu}` : "",
    p.skills?.length ? `Skills: ${p.skills.join(", ")}` : "",
    p.certifications?.length ? `Certifications: ${p.certifications.join(", ")}` : "",
    websites ? `Websites:\n${websites}` : "",
    `Work authorization: ${p.workAuth?.authorizedToWork ?? "?"}; needs sponsorship: ${p.workAuth?.requireSponsorship ?? "?"}; visa/work status: ${p.workAuth?.visaStatus ?? "?"}`,
    `Availability: ${p.workAuth?.availableStartDate ?? "?"}; notice period: ${p.workAuth?.noticePeriod ?? "?"}; relocation: ${p.workAuth?.willingToRelocate ?? "?"}; remote preference: ${p.workAuth?.remotePreference ?? "?"}`,
    `Compensation: desired ${p.compensation?.desiredSalary ?? "?"} ${p.compensation?.salaryCurrency ?? "USD"} (${p.compensation?.salaryPeriod ?? "year"}); current ${p.compensation?.currentSalary ?? "?"}`,
    `EEO (only use when the application explicitly asks): gender ${p.eeo?.gender ?? "?"}; race/ethnicity ${p.eeo?.race ?? "?"}; Hispanic/Latino ${p.eeo?.hispanicLatino ?? "?"}; veteran ${p.eeo?.veteranStatus ?? "?"}; disability ${p.eeo?.disabilityStatus ?? "?"}; decline to self-identify ${p.eeo?.declineToSelfIdentify ? "Yes" : "No"}`,
  ].filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ */
/* Resume reading                                                     */
/* ------------------------------------------------------------------ */

export type ResumeFileKind = "pdf" | "doc" | "docx" | "text" | "image";

function detectResumeFileKind(buffer: Buffer, mimeType: string, filename: string): ResumeFileKind | null {
  const name = filename.toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]))) return "doc";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) return "docx";

  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime === "application/msword" || /\.doc$/i.test(name)) return "doc";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(name)) return "docx";
  if (mime.startsWith("text/") || /\.(txt|md)$/i.test(name)) return "text";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(name)) return "image";
  return null;
}

function normaliseExtractedText(text: unknown): string {
  return String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractResumeText({
  buffer, mimeType, filename,
}: { buffer: Buffer; mimeType: string; filename: string }): Promise<string> {
  const kind = detectResumeFileKind(buffer, mimeType, filename);
  if (!kind) throw new Error("Unsupported resume format. Upload PDF, DOC, DOCX, TXT, PNG, JPG or WEBP.");

  if (kind === "pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return normaliseExtractedText(Array.isArray(text) ? text.join("\n") : text);
    } catch (err: any) {
      throw new Error(`We couldn't read this PDF. ${err?.message ?? "The PDF may be corrupted or password protected."}`);
    }
  }

  if (kind === "docx") {
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return normaliseExtractedText(value);
    } catch (err: any) {
      throw new Error(`We couldn't read this DOCX file. ${err?.message ?? "The Word document may be corrupted."}`);
    }
  }

  if (kind === "doc") {
    throw new Error("Legacy .DOC files are not supported by the serverless text extractor. Please save the file as DOCX or PDF.");
  }

  return normaliseExtractedText(buffer.toString("utf8"));
}

/**
 * Gemini multimodal fallback for scanned PDFs and image resumes.
 * This stays within the same single-provider architecture.
 */
async function parseResumeWithGemini({
  buffer, mimeType, system, shape,
}: { buffer: Buffer; mimeType: string; system: string; shape: string }) {
  if (!aiEnabled()) return null;
  const safeMime = /^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(mimeType) ? mimeType : "application/pdf";
  const prompt = `${system}\n\nThe attached resume may be scanned. Read every page with OCR/vision as needed. Preserve exact facts and never invent missing data. Return JSON in exactly this shape:\n${shape}`;

  const raw = await geminiGenerate([
    { role: "user", parts: [
      { text: prompt },
      { inline_data: { mime_type: safeMime, data: buffer.toString("base64") } },
    ] },
  ], { maxTokens: 5000, temperature: 0.1, retries: 0, timeoutMs: 45000, json: true });

  return parseJson<Record<string, unknown>>(raw);
}

export async function parseResumeDocument({
  buffer, mimeType, filename, system, shape,
}: {
  buffer: Buffer; mimeType: string; filename: string; system: string; shape: string;
}) {
  const kind = detectResumeFileKind(buffer, mimeType, filename);

  if (kind === "image") {
    const parsed = await parseResumeWithGemini({ buffer, mimeType: mimeType || "image/jpeg", system, shape });
    if (!parsed) throw new Error("This resume is an image. Add GOOGLE_API_KEY to enable OCR/vision parsing.");
    return parsed;
  }

  let text = "";
  try {
    text = await extractResumeText({ buffer, mimeType, filename });
  } catch (err) {
    if (kind === "pdf") {
      const parsed = await parseResumeWithGemini({
        buffer,
        mimeType: mimeType || "application/pdf",
        system,
        shape,
      });
      if (parsed) return parsed;
    }
    throw err;
  }

  if (text.trim().length < 60) {
    if (kind === "pdf") {
      const parsed = await parseResumeWithGemini({
        buffer,
        mimeType: mimeType || "application/pdf",
        system,
        shape,
      });
      if (parsed) return parsed;
    }
    throw new Error("That file has almost no readable text. If it is a scanned PDF, retry after ensuring GOOGLE_API_KEY is configured.");
  }

  // Do not truncate normal resumes at 24k characters. Gemini 2.5 Flash supports
  // a 1M-token context window, so the complete extracted resume is preserved.
  // A defensive ceiling keeps pathological files inside the model context while
  // still supporting far more than 10-page resumes.
  const boundedText = text.length > MAX_RESUME_TEXT_CHARS
    ? text.slice(0, MAX_RESUME_TEXT_CHARS)
    : text;
  const truncationNote = text.length > MAX_RESUME_TEXT_CHARS
    ? "\n\n[The source document was exceptionally large; the first 900,000 characters were sent to the model.]"
    : "";
  const prompt = `Resume text:\n\"\"\"\n${boundedText}\n\"\"\"${truncationNote}\n\nReturn JSON in exactly this shape:\n${shape}`;

  return await askAIJSONFast<Record<string, unknown>>(system, prompt, 5000);
}
