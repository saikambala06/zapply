# Google + Groq AI configuration fix

This version intentionally supports the two project credentials only:

- `GROQ_API_KEY` — primary text AI provider for resume parsing from extracted PDF/DOCX text, scoring, and answers.
- `GOOGLE_API_KEY` — Gemini OCR/vision fallback for scanned/image-only resumes and legacy `.DOC` files.

No `GEMINI_API_KEY` variable is required.

For a normal text-based PDF or DOCX, Gemini is not called when Groq is configured. This prevents an invalid Google key from breaking normal resume parsing.

For a scanned/image-only PDF, image resume, or legacy `.DOC`, Google Gemini is required because the server needs a vision/OCR provider.
