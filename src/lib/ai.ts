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
  // GROQ_API_KEY is the documented name; AI_API_KEY is the generic fallback so
  // a different provider doesn't force a misleading variable name.
  return process.env.GROQ_API_KEY || process.env.AI_API_KEY || "";
}

const baseUrl = () => (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const model = () => process.env.AI_MODEL || DEFAULT_MODEL;

export function aiEnabled() {
  return Boolean(apiKey());
}

/** What the UI should tell a user when the key is missing. */
export const AI_SETUP_HINT =
  "AI features need a GROQ_API_KEY on the server. Get a free one at console.groq.com.";

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

/** Compact profile text used as context for scoring and answer generation. */
export function profileToContext(p: any) {
  const exp = (p.experience ?? [])
    .slice(0, 6)
    .map((e: any) => `- ${e.title} at ${e.company} (${e.startDate}–${e.current ? "present" : e.endDate}). ${e.description ?? ""}`)
    .join("\n");
  const edu = (p.education ?? [])
    .map((e: any) => `- ${e.degree} in ${e.fieldOfStudy}, ${e.school} (${e.endDate})`)
    .join("\n");
  return [
    `Name: ${p.personal?.firstName ?? ""} ${p.personal?.lastName ?? ""}`,
    `Target role: ${p.targetRole || "not specified"}`,
    `Location: ${[p.personal?.city, p.personal?.state, p.personal?.country].filter(Boolean).join(", ")}`,
    p.summary ? `Summary: ${p.summary}` : "",
    exp ? `Experience:\n${exp}` : "",
    edu ? `Education:\n${edu}` : "",
    p.skills?.length ? `Skills: ${p.skills.join(", ")}` : "",
    `Work authorization: ${p.workAuth?.authorizedToWork ?? "?"}; needs sponsorship: ${p.workAuth?.requireSponsorship ?? "?"}`,
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
export async function extractResumeText({
  buffer, mimeType, filename,
}: { buffer: Buffer; mimeType: string; filename: string }): Promise<string> {
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(filename);
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(filename);
  const isText = mimeType.startsWith("text/") || /\.(txt|md)$/i.test(filename);

  if (isPdf) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }

  if (isDocx) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (isText) return buffer.toString("utf8");

  throw new Error("Upload a PDF, DOCX or TXT resume. Older .doc files aren't supported — export as PDF.");
}

/** Reads a resume file and returns structured profile sections. */
export async function parseResumeDocument({
  buffer, mimeType, filename, system, shape,
}: {
  buffer: Buffer; mimeType: string; filename: string; system: string; shape: string;
}) {
  const text = await extractResumeText({ buffer, mimeType, filename });

  if (text.trim().length < 60) {
    throw new Error(
      "That file has almost no readable text. If it's a scan or an image-only PDF, export a text-based PDF and try again."
    );
  }

  return askAIJSON<Record<string, unknown>>(
    system,
    `Resume text:\n"""\n${text.slice(0, 14000)}\n"""\n\nReturn JSON in exactly this shape:\n${shape}`,
    3000
  );
}
