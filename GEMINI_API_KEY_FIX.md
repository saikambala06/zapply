# Gemini API key fix

Set only:

```env
GOOGLE_API_KEY=your_current_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash
```

Do not add Groq, OpenAI-compatible, OpenRouter, xAI, `AI_BASE_URL`, or `AI_MODEL` credentials. Redeploy after changing Vercel environment variables.
