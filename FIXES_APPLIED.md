# Zapply Fix Pack

## Resume/profile
- Resume parsing now preserves much more extracted text so long resumes do not lose later experience, education, certifications, or links.
- Parser schema now captures richer personal/contact data, all experience and education entries, employment/work-location details, certifications, work-authorization fields, compensation, and explicit EEO data when present.
- Scanned/image-only resumes can use an optional Gemini vision/OCR fallback without installing native OCR binaries on Vercel.
- PDF, DOC, DOCX, TXT, PNG, JPG/JPEG, and WEBP uploads are accepted.
- Resume upload and profile save are now separate, deterministic operations; the parsed profile is saved only after the user confirms the parsed sections.
- React state updates no longer perform network saves from inside a state updater, avoiding stale/racing profile saves.

## Autofill
- Autofill never overwrites a field that already contains a value.
- Once the user edits a field, that field becomes user-owned for the current autofill session and validation repair will not replace it.
- Radio/checkbox groups are checked as groups, so selecting the second radio option no longer gets mistaken for an empty field.
- Single checkboxes correctly map Yes/No to checked/unchecked.
- Multi-checkbox answers are read and saved as the selected option labels rather than only Yes/No.
- Custom dropdowns use semantic selected values (`aria-valuetext`, `data-value`, selected options) instead of treating the whole question button text as the selected value.
- Validation repair can retry fields that look filled but are marked invalid by the ATS, while still respecting user-edited fields.
- Repeated work-history and education rows use the corresponding profile entry instead of copying only the latest entry into every row.
- Cross-origin ATS iframe forms can receive a manual Fill/Stop command through `postMessage` while credentials remain in the extension background worker.

## Saved answers / AI
- Saved answers now retain aliases and a question category for better semantic reuse across differently worded application questions.
- Extension bootstrap includes the richer saved-answer metadata.
- Synced answers are merged into their canonical question record instead of creating unnecessary duplicates when the normalized question matches.
- AI answer context now includes more of the saved profile: experience, education, skills, certifications, links, languages, work authorization, availability, compensation, and explicit EEO values for explicitly requested EEO questions.

## Deployment
- Vercel function duration configuration was raised to 60 seconds to match the resume parsing route's server setting.
- `.env.example` documents the optional `GEMINI_API_KEY` and `GEMINI_MODEL` settings.

## Important limitation
No browser extension can guarantee correct filling on every arbitrary custom application site. The extension now has broader generic label/ARIA matching, common ATS adapters, iframe command relay, framework-safe value setting, validation repair, and AI fallback, but a site that intentionally blocks automation or uses an inaccessible proprietary widget may still require manual review.
