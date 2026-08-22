# AI provider fix

This project now uses Google Gemini as the single AI provider.

- `GOOGLE_API_KEY` is the only AI credential.
- `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`.
- Groq and other OpenAI-compatible provider settings were removed from the application.
- PDF/DOCX text is extracted locally before Gemini structures it.
- Scanned PDFs/images use Gemini multimodal OCR when configured.
