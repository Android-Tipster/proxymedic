// Error decoder: turns provider/Janitor error text or an HTTP status + body
// into a named cause and a concrete fix.

// Each rule: {code, match: RegExp, status?: number[], title, cause, fix, severity}
// Matching is case-insensitive substring/regex over the raw pasted text or response body.
const RULES = [
  {
    code: 'err-janitor-generic',
    match: /a network error occurred|network error.*rate limited|check your (proxy|api) settings/i,
    title: 'Janitor\'s generic "network error"',
    cause: 'This is Janitor AI\'s catch-all message. It usually means the request never got a usable answer: wrong proxy URL, a key that belongs to a different provider than the URL, a dead reverse proxy, or a blocked/malformed request.',
    fix: 'Run the full diagnosis above with your URL, key and model. The three-field mismatch (key from one provider, URL from another) is the single most common cause.'
  },
  {
    code: 'err-failed-to-fetch',
    match: /failed to fetch|networkerror when attempting|load failed|err_canceled|err_connection|cors/i,
    title: 'The browser could not reach the proxy at all',
    cause: 'The request died before any AI provider saw it: a typo\'d domain, a dead reverse proxy, an http:// URL on an https page, a VPN/firewall block, or a server that does not allow browser (CORS) access.',
    fix: 'Check the URL spelling first. If it is a community reverse proxy, it may simply be offline. All major first-party APIs (OpenRouter, DeepSeek, Gemini, Groq, Mistral) allow browser access, so for those this points at the URL or your network.'
  },
  {
    code: 'err-401-openrouter-user',
    match: /user not found/i, status: [401],
    title: 'OpenRouter does not recognise this key',
    cause: 'The key was deleted, was never valid, or was pasted incompletely. OpenRouter answers "User not found." exactly in that case.',
    fix: 'Open openrouter.ai/keys, create a fresh key, and paste the whole thing (it starts with sk-or-v1-).'
  },
  {
    code: 'err-401-no-auth',
    match: /no auth credentials|no cookie auth|missing.*authorization|authorization.*missing/i, status: [401],
    title: 'No API key reached the provider',
    cause: 'The request arrived with an empty Authorization header. In Janitor this happens when the API key field is empty, or the key was saved into a different configuration than the one selected in the chat.',
    fix: 'Open the proxy settings, confirm the key is present in THIS configuration, hit Save, then refresh the page (Janitor is known to need a full refresh after proxy changes).'
  },
  {
    code: 'err-401-deepseek-auth',
    match: /authentication fails/i, status: [401],
    title: 'DeepSeek rejected the key',
    cause: 'DeepSeek answers "Authentication Fails, Your api key: ****xxxx is invalid" when the key is wrong, revoked, or truncated.',
    fix: 'Create a new key at platform.deepseek.com/api_keys and paste it in one piece (sk- followed by 32 characters, no spaces).'
  },
  {
    code: 'err-401-generic',
    match: /invalid api key|invalid_api_key|incorrect api key|api key not valid|please pass a valid api key|invalid x-api-key|authentication_error/i,
    title: 'The provider rejected the API key',
    cause: 'The key is invalid for this provider. Either it was mistyped/truncated, it was revoked, or it belongs to a different provider than the URL you are calling.',
    fix: 'Compare the key prefix with the URL: sk-or-v1 keys only work on openrouter.ai, AIza keys only on generativelanguage.googleapis.com, sk-(32 chars) DeepSeek keys only on api.deepseek.com. Then re-create the key on the provider\'s dashboard if it still fails.'
  },
  {
    code: 'err-402-deepseek',
    match: /insufficient balance/i,
    title: 'Out of credits (DeepSeek)',
    cause: 'DeepSeek has no free tier. A brand-new account, or one whose top-up ran out, returns 402 Insufficient Balance for every request even though the key is valid.',
    fix: 'Top up at platform.deepseek.com/top_up (a few dollars lasts a long time at DeepSeek prices), or switch to a free OpenRouter model while you decide.'
  },
  {
    code: 'err-402-openrouter',
    match: /requires more credits|insufficient credits|can only afford|prompt tokens limit exceeded/i,
    title: 'Not enough OpenRouter credits',
    cause: 'The account balance cannot cover this request (long chats make it worse: the whole history is re-sent every message).',
    fix: 'Add credits at openrouter.ai/credits, pick a cheaper model, or use a :free variant. Reducing context size in Janitor\'s generation settings also lowers cost per message.'
  },
  {
    code: 'err-402-generic',
    match: /quota.*exceed|exceeded your current quota|billing|payment required/i, status: [402],
    title: 'Billing / quota problem',
    cause: 'The key is valid but the account has no usable balance or its quota ran out.',
    fix: 'Open the provider\'s billing page and check the balance. On pay-as-you-go APIs a $0 balance fails exactly like this.'
  },
  {
    code: 'err-403-region',
    match: /unsupported_country_region_territory|not available in your (country|region)|user location is not supported/i,
    title: 'Region block',
    cause: 'The provider does not serve your country or your VPN exit country.',
    fix: 'Use OpenRouter (which routes around most regional blocks) or try with the VPN off/on a different region.'
  },
  {
    code: 'err-403-moderation',
    match: /flagged|moderation|content policy|violat(ed|ing).*policy|prohibited content/i,
    title: 'Content was refused by the provider\'s filter',
    cause: 'The provider\'s moderation layer blocked the request. This is about the message content or character card, not your setup.',
    fix: 'Nothing is broken. Model choice matters here: different providers and models enforce different content rules.'
  },
  {
    code: 'err-404-model',
    match: /model.*(not exist|not found|does not exist|invalid model|unknown model)|no endpoints found|is not a valid model id/i,
    title: 'The model name is wrong',
    cause: 'The provider does not have a model by that exact name. Model IDs change often and tutorials go stale (DeepSeek retired "deepseek-chat"/"deepseek-reasoner" on July 24, 2026; OpenRouter needs vendor/model format).',
    fix: 'Use the Model check above: it validates your model name against the provider\'s live list and suggests the closest current ID.'
  },
  {
    code: 'err-404-path',
    match: /404|not found/i, status: [404],
    title: '404: the URL path is wrong',
    cause: 'The domain answered but nothing lives at that path. Usually the URL is missing /v1/chat/completions, or has a typo like /chat/completion.',
    fix: 'Use the full endpoint from your provider\'s docs, e.g. https://openrouter.ai/api/v1/chat/completions.'
  },
  {
    code: 'err-429-free-tier',
    match: /free-models-per-day|rate limit exceeded.*free|daily.*limit.*free/i,
    title: 'Daily free-model cap reached (OpenRouter)',
    cause: 'OpenRouter caps :free models at 50 requests/day (1000/day once you have ever bought $10+ of credits). The cap resets daily.',
    fix: 'Wait for the reset, buy the one-time $10 credit to 20x the cap, or point the same key at a cheap paid model.'
  },
  {
    code: 'err-429-resource-exhausted',
    match: /resource_exhausted|resource exhausted/i,
    title: 'Gemini free-tier quota used up',
    cause: 'Google\'s free tier has per-minute and per-day request quotas. RESOURCE_EXHAUSTED means one of them ran out; the key itself is fine.',
    fix: 'Wait a minute (per-minute cap) or until tomorrow (daily cap), switch to a lighter model like gemini-3.1-flash-lite, or enable billing for higher limits.'
  },
  {
    code: 'err-429-generic',
    match: /rate limit|too many requests|429/i, status: [429],
    title: 'Rate limited',
    cause: 'Too many requests in a window, or the provider is throttling free usage. On shared/community proxies this often means the proxy\'s own upstream key is rate limited, not you.',
    fix: 'Wait 60 seconds and retry once. If it persists on a community proxy, the proxy is saturated: switch to your own key on OpenRouter/DeepSeek/Gemini.'
  },
  {
    code: 'err-503-overloaded',
    match: /overloaded|service unavailable|502|503|bad gateway|internal server error|500/i, status: [500, 502, 503],
    title: 'The provider (or proxy) is having problems',
    cause: 'The server answered with a 5xx error: it is down, overloaded, or the reverse proxy\'s upstream is broken. Nothing on your side causes this.',
    fix: 'Retry in a few minutes. Check the provider\'s status page. If it is a community reverse proxy, check the thread/Discord where you got it.'
  },
  {
    code: 'err-think-tags',
    match: /<think>|<\/think>/i,
    title: 'Not an error: those are reasoning tags',
    cause: 'You are using a reasoning model (like deepseek-reasoner / R1 variants). The <think>...</think> block is its visible thought process.',
    fix: 'Switch to a non-reasoning model (deepseek-v4-flash instead of the reasoner) or ignore/delete the think block. Nothing is broken.'
  },
  {
    code: 'err-timeout',
    match: /err_timed_out|timed? ?out|took too long/i,
    title: 'The request timed out',
    cause: 'The server accepted the connection but never answered in time. Reasoning models are slow by design, and community reverse proxies stall when their upstream is dead or saturated.',
    fix: 'Retry once. If you are on a reasoning model (R1, deepseek-reasoner style), try the non-reasoning variant. On a community proxy, the proxy is the bottleneck.'
  },
  {
    code: 'err-insufficient-quota',
    match: /insufficient_quota|insufficient quota/i,
    title: 'The account has no usable quota',
    cause: 'The key is valid but the account behind it has no credits or its plan quota ran out. Common with OpenAI keys that were created without ever adding billing.',
    fix: 'Open the provider\'s billing page and add credits, or switch to a provider with a real free tier (Gemini, or OpenRouter :free models).'
  },
  {
    code: 'err-provider-returned',
    match: /provider returned error|upstream error|error from provider/i,
    title: 'The routing service\'s upstream provider failed',
    cause: 'Your setup reached the router (e.g. OpenRouter) fine, but the actual model host behind it errored. This is on their side, not yours.',
    fix: 'Retry, or pick a different model/variant. On OpenRouter you can also try the same model from a different vendor listing.'
  },
  {
    code: 'err-context-length',
    match: /context length|maximum context|context_length_exceeded|too many tokens|reduce the length/i,
    title: 'The chat is too long for the model',
    cause: 'Janitor re-sends the whole conversation each message. Long chats plus a big character card can exceed the model\'s context window.',
    fix: 'Lower the context size in Janitor\'s generation settings, use Chat Memory to summarise, or pick a model with a larger context window.'
  }
];

export function decodeError(text, status = null) {
  const t = String(text || '');
  const matches = [];
  for (const rule of RULES) {
    const statusOk = !rule.status || status == null || rule.status.includes(status);
    const textHit = rule.match.test(t);
    const statusHit = rule.status && status != null && rule.status.includes(status);
    if ((textHit && statusOk) || (!textHit && statusHit && t.trim() === '')) {
      matches.push(rule);
    }
  }
  // Status-only fallback when text matched nothing
  if (!matches.length && status != null) {
    const byStatus = RULES.filter(r => r.status && r.status.includes(status));
    matches.push(...byStatus);
  }
  return matches;
}

// Classify a live HTTP response (status + body text) into findings.
export function classifyResponse(status, bodyText, provider) {
  const decoded = decodeError(bodyText, status);
  if (status >= 200 && status < 300) {
    return [{
      severity: 'ok', code: 'live-ok', title: 'The provider answered successfully',
      detail: 'A real chat completion request went through with this exact URL, key and model.',
      fix: null
    }];
  }
  if (decoded.length) {
    return decoded.slice(0, 1).map(rule => ({
      severity: rule.code === 'err-think-tags' || rule.code === 'err-403-moderation' ? 'info' : 'blocker',
      code: rule.code,
      title: rule.title,
      detail: rule.cause,
      fix: rule.fix
    }));
  }
  return [{
    severity: 'blocker', code: 'live-unknown-error',
    title: `The provider answered with HTTP ${status}`,
    detail: `Response: ${String(bodyText || '').slice(0, 300)}`,
    fix: provider ? `Check ${provider.name}'s status page and docs; this response is unusual.` : 'Check the provider\'s docs; this response is unusual.'
  }];
}

export { RULES };
