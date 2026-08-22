# Vercel build fix - resume upload

Fixed `src/app/api/resume/upload/route.ts` TypeScript error caused by Mongoose 8's `findOne().lean()` inference being treated as an object-or-array union.

The upload route now explicitly narrows the lean result to `{ documents?: any[] } | null`, validates that `documents` is actually an array, and safely reads the last saved document.

Previous code accessed `updated.documents` directly from the inferred union and failed Next.js production type-checking on Vercel.
