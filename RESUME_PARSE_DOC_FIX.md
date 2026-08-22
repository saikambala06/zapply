# Resume parsing fix — legacy DOC and common uploads

The parser now supports legacy Word 97–2003 `.doc` files using the pure-JavaScript `word-extractor` package, so Vercel does not need LibreOffice, antiword, or another system binary. PDF, DOCX, RTF, TXT/Markdown and image resumes remain supported.

The upload and parse paths use the same 4 MB limit, and the browser parser timeout is 90 seconds to avoid cancelling long but valid resumes prematurely.

Gemini remains the only AI provider. Set `GOOGLE_API_KEY` in Vercel and optionally `GEMINI_MODEL=gemini-2.5-flash`.
