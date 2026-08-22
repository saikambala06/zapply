# Resume parse 500 fix

Fixed /api/ai/parse-resume so PDF and DOCX uploads do not fail with an opaque 500 when only GEMINI_API_KEY is configured.

Changes:
- Added Gemini JSON text parsing fallback for extracted PDF/DOCX text when Groq/AI_API_KEY is unavailable.
- Kept Gemini vision/document fallback for scanned PDFs and images.
- Provider/configuration errors are returned as 503 with a useful message instead of an opaque 500.
- PDF and DOCX parsing still uses unpdf/mammoth extraction first for normal text resumes.
