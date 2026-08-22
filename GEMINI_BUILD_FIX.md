# Gemini TypeScript Build Fix

Fixed the Vercel compile error in `src/lib/ai.ts` caused by wrapping an `Error` in `new Error(...)`:

- Before: `throw new Error(geminiAuthError(detail));`
- After: `throw geminiAuthError(detail);`

`geminiAuthError()` already returns an `Error` instance, so the previous code passed an Error object where the constructor expected a string.
