# Gemini resume parsing fix

- Added a 45-second timeout around Gemini calls so the UI cannot wait indefinitely.
- Uses `GEMINI_MODEL` when configured; defaults to `gemini-3.7-flash` and falls back to `gemini-2.5-flash` if the first model is unavailable.
- Reduced structured JSON generation to 4,500 output tokens.
- Text-based PDFs and DOCX files are parsed locally first; Gemini only receives extracted text.
- Gemini vision is used only for scanned/image-only PDFs and images.
- Dashboard parsing now completes before the optional resume attachment upload, removing a sequential database wait.
- Added a browser-side 55-second timeout with a useful retry message.
