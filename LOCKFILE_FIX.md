# Dependency/lockfile fix

- Removed `word-extractor` from `package.json` and `package-lock.json` because the v3 lockfile referenced it as a root dependency but contained no `node_modules/word-extractor` entry.
- Removed its Next.js external-package configuration and TypeScript declaration.
- Legacy `.doc` resume parsing now uses the existing Gemini Vision path when `GEMINI_API_KEY` is configured; PDF/DOCX/TXT parsing remains server-side.
- Verified every dependency in package.json has a corresponding `node_modules/<dependency>` entry in package-lock.json.

Note: a full `npm ci` could not be completed in this environment because outbound npm registry access timed out. The lockfile consistency issue itself was identified and corrected.
