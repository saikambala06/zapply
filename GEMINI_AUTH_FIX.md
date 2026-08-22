# Gemini authentication fix

- `GOOGLE_API_KEY` now takes precedence over `GEMINI_API_KEY`, matching Google's current environment-variable behavior.
- Both configured keys are sanitized and tried, so a stale legacy variable cannot break a deployment when the other key is valid.
- Gemini requests use the `x-goog-api-key` header.
- Authentication failures are retried with the second configured key before surfacing an error.
- Stable `gemini-2.5-flash` remains the default model, with an additional fallback.

Important: application code cannot make an invalid/revoked/restricted Google key valid. The key must be a current Gemini API key/auth key with access to the Gemini API. Google currently states that unrestricted standard keys are rejected, and new AI Studio keys are auth keys. See https://ai.google.dev/gemini-api/docs/generate-content/api-key
