# Resume parsing fix

Resume parsing now uses one Gemini path instead of a Groq-plus-Gemini fallback chain.

- PDF text extraction uses `unpdf`.
- DOCX text extraction uses `mammoth`.
- Long extracted resumes are no longer truncated at 24,000 characters.
- Gemini 2.5 Flash receives the full extracted text up to a defensive 900,000-character ceiling.
- The route allows up to 60 seconds and the browser waits slightly longer than the server function budget.
