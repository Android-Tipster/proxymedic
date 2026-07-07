# ProxyMedic 🩺

**Find out exactly why your Janitor AI proxy isn't working, in 10 seconds.**

Live: **https://android-tipster.github.io/proxymedic/**

Janitor AI (and most roleplay frontends) show the same useless message for every proxy failure: *"A network error occurred, you may be rate limited or having connection issues."* Underneath, the real cause is almost always one of a handful of things. ProxyMedic names it.

## What it does

Paste the three things from Janitor's proxy form (**Proxy URL, API key, model name**) and get:

- **Mismatch detection**: the #1 cause of "network error" is a key from one provider with a URL from another (a DeepSeek key on openrouter.ai, an OpenRouter key on api.deepseek.com). ProxyMedic fingerprints both and calls it out.
- **URL repair**: base URL instead of the full `/chat/completions` endpoint, `http://`, `/chat/completion` typos, model-list endpoints, or a *website* pasted instead of an API (chat.deepseek.com, janitorai.com itself).
- **Model-name validation**: vendor-prefix rules per provider (`deepseek/deepseek-v3.2` on OpenRouter vs `deepseek-v4-flash` on DeepSeek direct), fuzzy "did you mean", and **stale-tutorial detection**: DeepSeek's `deepseek-chat` / `deepseek-reasoner` names stop working on **July 24, 2026**. ProxyMedic warns with a countdown and gives the replacement.
- **Hidden-character detection**: trailing spaces, zero-width characters, line-wrapped keys, `Bearer ` pasted into the key field. Mobile copy-paste classics.
- **Live test**: one real request (max 1 token) straight from *your* browser to *your* provider. Auth, balance, rate-limit and model errors come back classified in plain English, with the provider's live model list checked on the way.
- **Error decoder**: paste whatever error you got and get the cause + fix. Knows the real error strings from OpenRouter, DeepSeek, Gemini, Groq, Mistral, Chutes, OpenAI and Janitor itself.
- **Corrected config card**: copy-paste-ready values that match Janitor's form fields exactly.
- **Shareable diagnosis**: one tap copies a key-redacted summary for Reddit/Discord help threads.

## Privacy

- 100% client-side. A static page: no server, no analytics, no logging.
- The static checks never make a network call at all.
- The live test sends your key **directly to your own provider** (the same call Janitor makes) and nowhere else.
- The key is never persisted. URL and model are remembered locally for convenience; the key field is not.

## Providers with full support

OpenRouter, DeepSeek, Google Gemini, Chutes, Groq, Mistral, OpenAI, Anthropic (flagged as not OpenAI-compatible, with the OpenRouter workaround). Community reverse proxies (hf.space, workers.dev, ...) are recognised and supported through the live test.

## Development

Zero dependencies. Pure ES modules shared between Node and the browser.

```bash
node test/run.mjs    # 96-assertion test suite
node build.mjs       # bundles src/ + styles.css into a single self-contained docs/index.html
```

`index.dev.html` runs the unbundled modules directly for development.

## License

MIT
