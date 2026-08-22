# Gemini resume parsing

Gemini 2.5 Flash is the default parser. Normal PDF/DOCX resumes are extracted to text on the server first, then parsed as structured JSON. The parser preserves substantially more text so 10+ page resumes do not lose later sections.

Scanned/image-only PDFs fall back to Gemini multimodal input when `GOOGLE_API_KEY` is configured.
