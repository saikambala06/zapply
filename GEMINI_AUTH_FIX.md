# Gemini authentication fix

Gemini requests use the `x-goog-api-key` header. In Vercel, add a current Google AI Studio API key as `GOOGLE_API_KEY`, without quotes or trailing spaces, and redeploy. The app no longer depends on another AI provider as a fallback.
