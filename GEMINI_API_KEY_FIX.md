# Gemini API key / 401-403 fix

This build improves Gemini authentication handling for Vercel.

## Changes
- Accepts `GEMINI_API_KEY` or the official `GOOGLE_API_KEY` alias.
- Trims whitespace and accidental surrounding quotes from the configured key.
- Sends the key through the `x-goog-api-key` header instead of putting it in the URL.
- Uses the stable `gemini-2.5-flash` as the default model, then `gemini-3.7-flash` as a fallback.
- Returns a specific authentication message for invalid/expired/restricted keys.
- JSON resume parsing also falls back to Gemini when Groq is not configured.

## Vercel
Set one of these server-side environment variables (do not expose it as `NEXT_PUBLIC_*`):

```text
GEMINI_API_KEY=your_current_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash
```

Or:

```text
GOOGLE_API_KEY=your_current_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash
```

After changing environment variables, redeploy the Vercel project so the new server environment is loaded.
