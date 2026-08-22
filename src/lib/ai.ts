/**
 * Gemini-only AI provider.
 *
 * Google Gemini 2.5 Flash has a 1M-token context window and a free tier, so the
 * app can send the complete text extracted from long PDF/DOCX resumes instead
 * of truncating them or routing normal parsing through another provider.
 */

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RESUME_TEXT_CHARS = 900_000;

type Message = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  maxTokens?: number;
  temperature?: number;
  retries?: number;
  timeoutMs?: number;
  json?: boolean;
  fallbackModels?: boolean;
};

function cleanSecret(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^\s*[\'"]/, "")
    .replace(/[\'"]\s*$/, "");
}

function getGeminiApiKey(): string {
  return cleanSecret(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY);
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
  const { maxTokens = 1024, temperature = 0.2, retries = 1, timeoutMs = 45000, json = false, fallbackModels = true } = opts;
  const key = getGeminiApiKey();
  if (!key) throw new Error(AI_SETUP_HINT);

  const configuredModel = getGeminiModel();
  const models = fallbackModels
    ? Array.from(new Set([configuredModel, ...GEMINI_FALLBACK_MODELS]))
    : [configuredModel];
  let lastError = "Gemini request failed.";

  for (const model of models) {
    const endpoint = `${GEMINI_API_ROOT}/${encodeURIComponent(model)}:generateContent`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res: Response;
      try {
        res = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
            "x-goog-api-client": "zapply-resume/1.3",
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
        break;
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
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
        break;
      }

      const detail = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) throw geminiAuthError(detail);
      if (res.status === 404) {
        lastError = `Gemini model "${model}" is unavailable.`;
        break;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = res.status === 429
          ? "Gemini is rate limiting requests."
          : "Gemini is temporarily unavailable.";
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await backoff(attempt, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : undefined);
          continue;
        }
        break;
      }

      // A few model/account combinations reject JSON mode even though text
      // generation works. The caller can retry once without responseMimeType.
      if (res.status === 400 && json && /json|response.?mime|structured/i.test(detail)) {
        lastError = detail.slice(0, 300) || "Gemini rejected JSON mode.";
        break;
      }

      lastError = `Gemini request failed (${res.status}). ${detail.slice(0, 240)}`;
      break;
    }
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

async function askAIJSONResilient<T>(system: string, user: string, maxTokens = 3500): Promise<T> {
  // Keep resume parsing comfortably below Vercel's serverless timeout. A
  // second 45s provider attempt used to turn a recoverable AI/JSON problem
  // into a platform-level 504. One bounded request is enough because the
  // caller already has a deterministic local parser as a safe fallback.
  return await askAIJSONFast<T>(system, user, maxTokens);
}

/** Fast one-shot JSON extraction used by resume parsing. */
export async function askAIJSONFast<T>(system: string, user: string, maxTokens = 4500): Promise<T> {
  const raw = await geminiGenerate(messagesToContents([
    { role: "system", content: `${system}\n\nRespond with one valid JSON object and nothing else. No prose and no markdown fences.` },
    { role: "user", content: user },
  ]), { maxTokens, temperature: 0.1, retries: 0, timeoutMs: 18000, json: true, fallbackModels: false });
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

export type ResumeFileKind = "pdf" | "doc" | "docx" | "rtf" | "text" | "image";

function detectResumeFileKind(buffer: Buffer, mimeType: string, filename: string): ResumeFileKind | null {
  const name = filename.toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]))) return "doc";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) return "docx";

  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime === "application/msword" || /\.doc$/i.test(name)) return "doc";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(name)) return "docx";
  if (mime === "application/rtf" || mime === "text/rtf" || /\.rtf$/i.test(name)) return "rtf";
  if (mime.startsWith("text/") || /\.(txt|md|csv|html|htm)$/i.test(name)) return "text";
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
  if (!kind) throw new Error("Unsupported resume format. Upload PDF, DOC, DOCX, RTF, TXT, PNG, JPG or WEBP.");

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
    try {
      // word-extractor is pure JavaScript and supports legacy OLE/Word 97-2003
      // files from a Buffer, so this works on Vercel without LibreOffice/antiword.
      const mod: any = await import("word-extractor");
      const WordExtractor = mod.default ?? mod;
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      const pieces = [
        typeof doc?.getBody === "function" ? doc.getBody() : "",
        typeof doc?.getHeaders === "function" ? doc.getHeaders() : "",
        typeof doc?.getFooters === "function" ? doc.getFooters() : "",
        typeof doc?.getTextboxes === "function" ? doc.getTextboxes() : "",
        typeof doc?.getAnnotations === "function" ? doc.getAnnotations() : "",
        typeof doc?.getFootnotes === "function" ? doc.getFootnotes() : "",
        typeof doc?.getEndnotes === "function" ? doc.getEndnotes() : "",
      ].filter(Boolean);
      return normaliseExtractedText(pieces.join("\n"));
    } catch (err: any) {
      throw new Error(`We couldn't read this legacy DOC file. ${err?.message ?? "The Word document may be corrupted, encrypted, or unsupported."}`);
    }
  }

  if (kind === "rtf") {
    const decoded = buffer.toString("latin1")
      .replace(/\\'[0-9a-fA-F]{2}/g, (m: string) => String.fromCharCode(parseInt(m.slice(2), 16)))
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\tab/g, "\t")
      .replace(/\\u-?\d+\??/g, "")
      .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
      .replace(/[{}]/g, "");
    return normaliseExtractedText(decoded);
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
  ], { maxTokens: 3500, temperature: 0.1, retries: 0, timeoutMs: 18000, json: true, fallbackModels: false });

  return parseJson<Record<string, unknown>>(raw);
}


type PersonalNameParts = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneType: string;
};

function extractFirstNameParts(name: string): PersonalNameParts {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
    email: "",
    phone: "",
    phoneType: "Mobile",
  };
}

/**
 * Deterministic fallback used when Gemini is temporarily unavailable or not
 * configured. It is intentionally conservative: it extracts facts that can be
 * identified without guessing and leaves everything else blank.
 */
export function fallbackParseResumeText(text: string): Record<string, unknown> {
  const clean = normaliseExtractedText(text);
  const lines = clean.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const joined = lines.join("\n");
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone = joined.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, " ").trim() ?? "";
  const urlMatches = joined.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const websites = urlMatches.slice(0, 20).map((url) => ({
    label: /linkedin/i.test(url) ? "LinkedIn" : /github/i.test(url) ? "GitHub" : "Portfolio",
    url: url.replace(/[.,;]+$/, ""),
  }));

  const headerWords = new Set(["resume", "curriculum vitae", "cv", "professional summary", "summary", "experience", "professional experience", "skills", "education", "certifications", "certification"]);
  const candidateName = lines.slice(0, 12).find((line) => {
    if (line.length < 3 || line.length > 70) return false;
    if (headerWords.has(line.toLowerCase())) return false;
    if (/@/.test(line) || /https?:\/\//i.test(line) || /\d{3,}/.test(line)) return false;
    return /^[A-Za-z][A-Za-z .,'’-]+$/.test(line) && line.split(/\s+/).length <= 5;
  }) ?? "";
  const personal = extractFirstNameParts(candidateName);
  personal.email = email;
  personal.phone = phone;
  personal.phoneType = "Mobile";

  const section = (names: string[]) => {
    const lower = lines.map((x) => x.toLowerCase());
    const start = lower.findIndex((x) => names.some((n) => x === n || x.startsWith(`${n}:`)));
    if (start < 0) return [] as string[];
    const nextHeadings = ["summary", "professional summary", "experience", "professional experience", "education", "skills", "technical skills", "certifications", "certification", "references"];
    const end = lower.findIndex((x, i) => i > start && nextHeadings.includes(x));
    return lines.slice(start + 1, end > start ? end : Math.min(lines.length, start + 25));
  };

  const summaryLines = section(["summary", "professional summary"]);
  const skillsLines = section(["skills", "technical skills"]);
  const certLines = section(["certifications", "certification"]);
  const educationLines = section(["education", "academic background"]);

  const skillTokens = skillsLines
    .join(",")
    .split(/[,;|•●]+/)
    .map((x) => x.replace(/^[-*]\s*/, "").trim())
    .filter((x) => x.length >= 2 && x.length <= 80)
    .slice(0, 100);
  const certifications = certLines
    .map((x) => x.replace(/^[-*•●]\s*/, "").trim())
    .filter((x) => x.length >= 2 && x.length <= 160)
    .slice(0, 50);
  const education = educationLines
    .map((x) => x.replace(/^[-*•●]\s*/, "").trim())
    .filter((x) => x.length >= 3 && x.length <= 200)
    .slice(0, 15)
    .map((school) => ({ school, degree: "", fieldOfStudy: "", gpa: "", startDate: "", endDate: "", current: false, location: "", description: "" }));

  return {
    personal,
    summary: summaryLines.join(" ").slice(0, 3000),
    targetRole: "",
    skills: skillTokens,
    certifications,
    experience: [],
    education,
    websites,
    workAuth: {},
    compensation: {},
    eeo: {},
  };
}

export async function parseResumeDocument({
  buffer, mimeType, filename, system, shape,
}: {
  buffer: Buffer; mimeType: string; filename: string; system: string; shape: string;
}) {
  const kind = detectResumeFileKind(buffer, mimeType, filename);

  if (kind === "image") {
    if (!aiEnabled()) return fallbackParseResumeText("");
    try {
      const parsed = await parseResumeWithGemini({ buffer, mimeType: mimeType || "image/jpeg", system, shape });
      return parsed ?? fallbackParseResumeText("");
    } catch (err) {
      console.error("[resume-image-fallback] Gemini OCR failed", err);
      return fallbackParseResumeText("");
    }
  }

  let text = "";
  try {
    text = await extractResumeText({ buffer, mimeType, filename });
  } catch (err) {
    if (kind === "pdf" && aiEnabled()) {
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

  if (text.trim().length < 20) {
    if (kind === "pdf" && aiEnabled()) {
      try {
        const parsed = await parseResumeWithGemini({
          buffer,
          mimeType: mimeType || "application/pdf",
          system,
          shape,
        });
        if (parsed) return parsed;
      } catch (err) {
        console.error("[resume-pdf-ocr-fallback] Gemini OCR failed", err);
      }
    }
    return fallbackParseResumeText("");
  }

  // Local extraction is always complete first. If Gemini is not configured or
  // temporarily fails, return a conservative deterministic parse instead of
  // turning an otherwise valid upload into a 500/503.
  if (!aiEnabled()) return fallbackParseResumeText(text);

  // Keep the provider payload deliberately small so normal resumes don't
  // spend the whole serverless budget on a huge prompt. Deterministic local
  // parsing remains the fallback for anything we truncate or can't model.
  const parseLimit = 180_000;
  const boundedText = text.length > parseLimit ? text.slice(0, parseLimit) : text;
  const truncationNote = text.length > parseLimit
    ? `\n\n[The source document was exceptionally large; only the first ${parseLimit} characters were sent to the model.]`
    : "";
  const prompt = `Resume text:\n\"\"\"\n${boundedText}\n\"\"\"${truncationNote}\n\nReturn JSON in exactly this shape:\n${shape}`;

  try {
    return await askAIJSONResilient<Record<string, unknown>>(system, prompt, 3500);
  } catch (err: any) {
    console.error("[resume-parse-fallback] Gemini failed; returning deterministic extraction.", err);
    return fallbackParseResumeText(text);
  }
}
