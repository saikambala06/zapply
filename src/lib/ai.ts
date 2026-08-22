/**
 * AI PROVIDER
 * -----------
 * Groq by default, over its OpenAI-compatible endpoint.
 *
 * Nothing here is Groq-specific beyond the defaults: the whole surface is the
 * standard /chat/completions shape, so pointing AI_BASE_URL and AI_MODEL
 * somewhere else (xAI's Grok, OpenAI, OpenRouter, a local Ollama) swaps the
 * provider without touching a line of application code.
 */

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

// Groq deprecated its Llama chat models; gpt-oss-120b is the current
// general-purpose recommendation. Override with AI_MODEL if that changes.
const DEFAULT_MODEL = "openai/gpt-oss-120b";

function apiKey() {
  // This project uses GROQ_API_KEY as its only text-AI credential.
  return process.env.GROQ_API_KEY || "";
}

const baseUrl = () => (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const model = () => process.env.AI_MODEL || DEFAULT_MODEL;

export function aiEnabled() {
  return Boolean(apiKey());
}

/** What the UI should tell a user when the key is missing. */
export const AI_SETUP_HINT =
  "AI features need GROQ_API_KEY. Scanned PDF/image OCR also requires GOOGLE_API_KEY for Gemini.";

type Message = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  retries?: number;
};

/**
 * One request to the provider.
 *
 * Retries on 429 and 5xx — Groq's free tier is 30 requests/minute, and the
 * drafting pass can fire several calls back to back, so a transient rate-limit
 * shouldn't surface to the user as a hard failure.
 */
async function chat(messages: Message[], opts: ChatOptions = {}): Promise<string> {
  const { maxTokens = 1024, temperature = 0.4, json = false, retries = 2 } = opts;

  if (!aiEnabled()) throw new Error(AI_SETUP_HINT);

  const body: Record<string, unknown> = {
    model: model(),
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  if (json) {
    body.response_format = { type: "json_object" };
    // Reasoning models (gpt-oss, qwen3) emit a thinking block by default, which
    // is invalid alongside JSON mode. Hiding it is required, not cosmetic.
    body.reasoning_format = "hidden";
  }

  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      lastError = `Couldn't reach the AI provider (${err?.message ?? "network error"}).`;
      await backoff(attempt);
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) return text.trim();
      lastError = "The AI provider returned an empty response.";
      await backoff(attempt);
      continue;
    }

    const detail = await res.text().catch(() => "");

    if (res.status === 401 || res.status === 403) {
      throw new Error("The AI provider rejected the API key. Check GROQ_API_KEY.");
    }
    if (res.status === 404) {
      throw new Error(`The model "${model()}" isn't available on this provider. Set AI_MODEL to one that is.`);
    }
    if (res.status === 429 || res.status >= 500) {
      lastError =
        res.status === 429
          ? "The AI provider is rate limiting us. Try again in a moment."
          : "The AI provider is having trouble. Try again shortly.";
      // Honour Retry-After when the provider sends one.
      const retryAfter = Number(res.headers.get("retry-after"));
      await backoff(attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
      continue;
    }

    throw new Error(`AI request failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  throw new Error(lastError || "The AI request didn't go through.");
}

const backoff = (attempt: number, explicitMs?: number) =>
  new Promise((r) => setTimeout(r, explicitMs ?? Math.min(4000, 400 * 2 ** attempt)));

/** Plain-text completion. */
export async function askAI(system: string, user: string, maxTokens = 1024) {
  return chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { maxTokens }
  );
}

/**
 * JSON completion.
 *
 * Two provider quirks handled here: json_object mode requires the literal word
 * "JSON" somewhere in the messages, and models still occasionally wrap output
 * in markdown fences despite it.
 */
export async function askAIJSON<T>(system: string, user: string, maxTokens = 1500): Promise<T> {
  const raw = await chat(
    [
      { role: "system", content: `${system}\n\nRespond with a single valid JSON object and nothing else. No prose, no markdown fences.` },
      { role: "user", content: user },
    ],
    { maxTokens, json: true, temperature: 0.2 }
  );
  return parseJson<T>(raw);
}

export function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Last resort: pull the outermost object out of surrounding chatter.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new Error("The AI response wasn't valid JSON. Try again.");
  }
}


async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 45000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("Gemini timed out while reading the resume. Please try again with a smaller PDF/DOCX.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function cleanSecret(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^\s*[\'\"]/, "")
    .replace(/[\'\"]\s*$/, "");
}

function getGeminiApiKeys(): string[] {
  // This application intentionally supports only the two keys the project uses:
  // GROQ_API_KEY for text AI and GOOGLE_API_KEY for Gemini OCR/vision.
  // GOOGLE_API_KEY is the single Gemini credential name; no GEMINI_API_KEY is required.
  return [cleanSecret(process.env.GOOGLE_API_KEY)].filter(Boolean);
}

function getGeminiApiKey(): string {
  return getGeminiApiKeys()[0] || "";
}

function geminiAuthError(detail: string): Error {
  const d = String(detail || "").replace(/\s+/g, " ").trim();
  if (/API key expired|API_KEY_INVALID|invalid api key|invalid argument|permission denied|api key not valid/i.test(d)) {
    return new Error("Gemini authentication failed. In Vercel, set GOOGLE_API_KEY to a current Google AI Studio Gemini API key, without quotes or spaces. Ensure the key/project has Gemini API access, then redeploy.");
  }
  return new Error("Gemini authentication failed (HTTP 401/403). Verify the Vercel GOOGLE_API_KEY and that its Google Cloud/AI Studio project allows Gemini API access, then redeploy.");
}

export async function askGeminiJSON<T>(system: string, user: string, maxOutputTokens = 4500): Promise<T> {
  const keys = getGeminiApiKeys();
  if (!keys.length) throw new Error(AI_SETUP_HINT);
  const models = Array.from(new Set([
    process.env.GEMINI_MODEL || "gemini-2.5-flash",
    "gemini-2.5-flash",
    "gemini-3.7-flash",
  ].filter(Boolean)));
  let lastError = "Gemini could not parse the resume.";

  for (const key of keys) {
    for (const geminiModel of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
            "x-goog-api-client": "zapply-resume/1.1",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens, responseMimeType: "application/json" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("\n").trim();
          if (!text) throw new Error("Gemini returned an empty resume parsing response.");
          return parseJson<T>(text);
        }
        const detail = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
          // Try the other configured key before failing. This specifically
          // Authentication errors are retained so the Google credential can be diagnosed.
          lastError = geminiAuthError(detail).message;
          continue;
        }
        if (res.status === 429) throw new Error("Gemini is rate limiting requests. Try again in a moment.");
        if (res.status === 404) { lastError = `Gemini model ${geminiModel} is unavailable.`; continue; }
        lastError = `Gemini request failed (${res.status}). ${detail.slice(0, 220)}`;
      } catch (err: any) {
        const message = String(err?.message || lastError);
        if (/rate limiting/i.test(message)) throw err;
        if (/timed out/i.test(message)) throw err;
        lastError = message;
      }
    }
  }
  throw new Error(lastError);
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
    exp ? `Experience:
${exp}` : "",
    edu ? `Education:
${edu}` : "",
    p.skills?.length ? `Skills: ${p.skills.join(", ")}` : "",
    p.certifications?.length ? `Certifications: ${p.certifications.join(", ")}` : "",
    websites ? `Websites:
${websites}` : "",
    `Work authorization: ${p.workAuth?.authorizedToWork ?? "?"}; needs sponsorship: ${p.workAuth?.requireSponsorship ?? "?"}; visa/work status: ${p.workAuth?.visaStatus ?? "?"}`,
    `Availability: ${p.workAuth?.availableStartDate ?? "?"}; notice period: ${p.workAuth?.noticePeriod ?? "?"}; relocation: ${p.workAuth?.willingToRelocate ?? "?"}; remote preference: ${p.workAuth?.remotePreference ?? "?"}`,
    `Compensation: desired ${p.compensation?.desiredSalary ?? "?"} ${p.compensation?.salaryCurrency ?? "USD"} (${p.compensation?.salaryPeriod ?? "year"}); current ${p.compensation?.currentSalary ?? "?"}`,
    `EEO (only use when the application explicitly asks): gender ${p.eeo?.gender ?? "?"}; race/ethnicity ${p.eeo?.race ?? "?"}; Hispanic/Latino ${p.eeo?.hispanicLatino ?? "?"}; veteran ${p.eeo?.veteranStatus ?? "?"}; disability ${p.eeo?.disabilityStatus ?? "?"}; decline to self-identify ${p.eeo?.declineToSelfIdentify ? "Yes" : "No"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/*  Resume reading                                                     */
/* ------------------------------------------------------------------ */

/**
 * Pulls plain text out of a resume file.
 *
 * Groq's models are text-in, so unlike a provider with native PDF document
 * input we extract first. unpdf wraps pdf.js and runs in serverless without
 * native bindings; mammoth handles .docx.
 */
export type ResumeFileKind = "pdf" | "doc" | "docx" | "text" | "image";

function detectResumeFileKind(buffer: Buffer, mimeType: string, filename: string): ResumeFileKind | null {
  const name = filename.toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  // Prefer the actual file signature over browser-provided MIME metadata. Some
  // browsers/OS combinations report `application/octet-stream` for resumes.
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

/**
 * Pulls plain text out of PDF, DOC, DOCX and plain-text resumes.
 *
 * PDFs are read with unpdf and modern Word documents with mammoth. Legacy
 * Word 97-2003 `.doc` files are sent directly to the optional Gemini Vision
 * parser when GOOGLE_API_KEY is configured, avoiding an unpinned legacy
 * dependency that previously made the npm lockfile inconsistent.
 */
export async function extractResumeText({
  buffer, mimeType, filename,
}: { buffer: Buffer; mimeType: string; filename: string }): Promise<string> {
  const kind = detectResumeFileKind(buffer, mimeType, filename);

  if (!kind) {
    throw new Error("Unsupported resume format. Upload PDF, DOC, DOCX, TXT, PNG, JPG or WEBP.");
  }

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
    // Legacy binary .doc files do not have a reliable built-in Vercel parser.
    // parseResumeDocument() handles them through Gemini Vision when enabled.
    throw new Error(
      "Legacy .DOC files require GOOGLE_API_KEY for Gemini OCR in the serverless parser. Please upload DOCX/PDF or configure GOOGLE_API_KEY for .DOC support."
    );
  }

  return normaliseExtractedText(buffer.toString("utf8"));
}

/**
 * Optional multimodal fallback for scanned/image-only resumes.
 * It is deliberately opt-in: normal text extraction still uses the configured
 * AI provider, while GOOGLE_API_KEY can handle PDFs/images that contain no text
 * layer. This avoids native OCR binaries that are unreliable on Vercel.
 */
async function parseResumeWithGemini({
  buffer, mimeType, system, shape,
}: { buffer: Buffer; mimeType: string; system: string; shape: string }) {
  const keys = getGeminiApiKeys();
  if (!keys.length) return null;
  const models = Array.from(new Set([process.env.GEMINI_MODEL || "gemini-2.5-flash", "gemini-2.5-flash", "gemini-3.7-flash"].filter(Boolean)));
  const safeMime = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|image\/(png|jpe?g|webp))$/i.test(mimeType) ? mimeType : "application/pdf";
  const prompt = `${system}\n\nThe attached resume may be scanned. Read every page with OCR/vision as needed. Preserve exact facts and never invent missing data. Return JSON in exactly this shape:\n${shape}`;
  let lastError = "Resume OCR could not read the document.";

  for (const key of keys) {
    for (const model of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key, "x-goog-api-client": "zapply-resume/1.1" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [
              { text: prompt },
              { inline_data: { mime_type: safeMime, data: buffer.toString("base64") } },
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4500, responseMimeType: "application/json" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("\n").trim();
          if (!text) throw new Error("The OCR service returned no resume data.");
          return parseJson<Record<string, unknown>>(text);
        }
        const detail = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
          lastError = geminiAuthError(detail).message;
          continue;
        }
        if (res.status === 429) throw new Error("Gemini is rate limiting requests. Try again in a moment.");
        if (res.status === 404) { lastError = `Gemini model ${model} is unavailable.`; continue; }
        lastError = `Resume OCR failed (${res.status}). ${detail.slice(0, 220)}`;
      } catch (err: any) {
        const message = String(err?.message || lastError);
        if (/rate limiting|timed out/i.test(message)) throw err;
        lastError = message;
      }
    }
  }
  throw new Error(lastError);
}

/** Reads a resume file and returns structured profile sections. */
export async function parseResumeDocument({
  buffer, mimeType, filename, system, shape,
}: {
  buffer: Buffer; mimeType: string; filename: string; system: string; shape: string;
}) {
  const kind = detectResumeFileKind(buffer, mimeType, filename);

  // Images are vision/OCR inputs rather than text extraction inputs.
  if (kind === "image") {
    const parsed = await parseResumeWithGemini({ buffer, mimeType: mimeType || "image/jpeg", system, shape });
    if (!parsed) {
      throw new Error("This resume is an image. Add GOOGLE_API_KEY to enable OCR/vision parsing, or upload a text-based PDF/DOCX.");
    }
    return parsed;
  }

  let text = "";
  try {
    text = await extractResumeText({ buffer, mimeType, filename });
  } catch (err) {
    // If a PDF cannot expose a usable text layer, Gemini can still read it as a
    // document. This is the key fallback for scanned PDFs.
    if (kind === "pdf" || kind === "doc") {
      const parsed = await parseResumeWithGemini({ buffer, mimeType: mimeType || (kind === "pdf" ? "application/pdf" : "application/msword"), system, shape });
      if (parsed) return parsed;
    }
    throw err;
  }

  if (text.trim().length < 60) {
    if (kind === "pdf" || kind === "doc") {
      const parsed = await parseResumeWithGemini({ buffer, mimeType: mimeType || (kind === "pdf" ? "application/pdf" : "application/msword"), system, shape });
      if (parsed) return parsed;
    }
    throw new Error(
      "That file has almost no readable text. If it is a scanned/image-only resume, add GOOGLE_API_KEY for OCR parsing or export a text-based PDF."
    );
  }

  // Keep substantially more resume text. Truncating at 14k was causing long
  // resumes to lose later experience, education and certifications. If Groq/AI
  // is not configured but Gemini is, use Gemini for the structured extraction
  // instead of returning a 500 for otherwise valid PDF/DOCX uploads.
  const prompt = `Resume text:\n"""\n${text.slice(0, 24000)}\n"""\n\nReturn JSON in exactly this shape:\n${shape}`;
  if (aiEnabled()) return askAIJSON<Record<string, unknown>>(system, prompt, 4500);
  if (getGeminiApiKey()) return askGeminiJSON<Record<string, unknown>>(system, prompt, 4500);
  throw new Error(AI_SETUP_HINT);
}
