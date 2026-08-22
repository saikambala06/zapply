# Resume Parsing SP74UI Fix

## Problem
`/api/ai/parse-resume` could end in a generic HTTP 500 when Groq returned an authentication/provider/network error. The resume parser also had no bounded timeout on the Groq request, so a failed provider could consume most of the Vercel function window before the Google fallback ran.

## Fix
- Added a 14-second bounded Groq JSON request for resume parsing with zero retries.
- Added automatic Google Gemini fallback for extracted PDF/DOCX text when Groq fails.
- Kept Gemini OCR/vision fallback for scanned PDFs and images.
- Groq authentication failures now return an actionable provider error.
- `/api/ai/parse-resume` converts provider/authentication/rate-limit failures to HTTP 503 instead of opaque HTTP 500.
- JSON-body parsing uses the same fast Groq -> Google fallback.

## Provider variables
- `GROQ_API_KEY` for primary text parsing.
- `GOOGLE_API_KEY` for fallback text parsing and OCR/vision.

No new npm dependencies were added.
