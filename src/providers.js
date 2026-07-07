// ProxyMedic provider registry.
// Facts verified live 2026-07-07: CORS preflights pass for every provider below
// from a github.io origin; error JSON shapes captured with invalid keys;
// DeepSeek legacy model deprecation date from api-docs.deepseek.com.

export const DEEPSEEK_LEGACY_CUTOFF_UTC = Date.UTC(2026, 6, 24, 15, 59, 0); // 2026-07-24 15:59 UTC

export const PROVIDERS = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    hosts: ['openrouter.ai'],
    chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    modelsPublic: true,
    keyInfoUrl: 'https://openrouter.ai/api/v1/key',
    keyPatterns: [/^sk-or-v1-[0-9a-f]{16,}$/i, /^sk-or-[A-Za-z0-9-]{16,}$/],
    keyHint: 'sk-or-v1-…',
    keysPage: 'https://openrouter.ai/keys',
    creditsPage: 'https://openrouter.ai/credits',
    modelFormat: 'vendor/model',
    modelNeedsSlash: true,
    corsOk: true,
    presetModel: 'meta-llama/llama-3.3-70b-instruct:free',
    // static snapshot from the live /models endpoint, 2026-07-07 (fallback when offline)
    modelSnapshot: [
      'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v3.2',
      'google/gemini-3.5-flash', 'google/gemini-3.1-flash-lite', 'google/gemini-3.1-pro-preview',
      'anthropic/claude-sonnet-5', 'anthropic/claude-opus-4.8', 'anthropic/claude-opus-4.7',
      'x-ai/grok-4.3', 'x-ai/grok-4.20', 'moonshotai/kimi-k2.6', 'moonshotai/kimi-k2.5',
      'mistralai/mistral-large-2512', 'mistralai/mistral-medium-3-5', 'mistralai/mistral-small-2603',
      'qwen/qwen3.6-plus', 'qwen/qwen3.5-plus-02-15',
      'meta-llama/llama-3.3-70b-instruct:free', 'meta-llama/llama-3.2-3b-instruct:free',
      'nousresearch/hermes-3-llama-3.1-405b:free', 'qwen/qwen3-coder:free',
      'openai/gpt-oss-120b:free', 'openai/gpt-oss-20b:free',
      'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
      'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free'
    ],
    notes: 'Free-tier accounts (under $10 ever purchased) are capped at 50 requests/day on :free models; accounts that have bought $10+ credits get 1000/day.'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek (official API)',
    hosts: ['api.deepseek.com'],
    chatUrl: 'https://api.deepseek.com/v1/chat/completions',
    altPaths: ['/chat/completions'],
    modelsUrl: 'https://api.deepseek.com/models',
    modelsPublic: false,
    keyPatterns: [/^sk-[0-9a-f]{32}$/],
    keyHint: 'sk- followed by 32 characters',
    keysPage: 'https://platform.deepseek.com/api_keys',
    creditsPage: 'https://platform.deepseek.com/top_up',
    modelFormat: 'plain',
    modelNeedsSlash: false,
    corsOk: true,
    modelSnapshot: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    legacyModels: {
      'deepseek-chat': 'deepseek-v4-flash',
      'deepseek-reasoner': 'deepseek-v4-pro'
    },
    notes: 'DeepSeek has no free tier: a fresh account with no top-up returns 402 Insufficient Balance.'
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    hosts: ['generativelanguage.googleapis.com'],
    chatUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
    modelsPublic: false,
    keyPatterns: [/^AIza[0-9A-Za-z_-]{30,}$/],
    keyHint: 'AIza…',
    keysPage: 'https://aistudio.google.com/apikey',
    creditsPage: 'https://aistudio.google.com/apikey',
    modelFormat: 'plain',
    modelNeedsSlash: false,
    corsOk: true,
    modelSnapshot: ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3-pro'],
    notes: 'Gemini has a real free tier with daily quotas; 429 RESOURCE_EXHAUSTED means the daily free quota ran out, not a broken setup.'
  },
  chutes: {
    id: 'chutes',
    name: 'Chutes',
    hosts: ['llm.chutes.ai', 'chutes.ai'],
    chatUrl: 'https://llm.chutes.ai/v1/chat/completions',
    modelsUrl: 'https://llm.chutes.ai/v1/models',
    modelsPublic: true,
    keyPatterns: [/^cpk_[A-Za-z0-9._-]{16,}$/],
    keyHint: 'cpk_…',
    keysPage: 'https://chutes.ai/app/api',
    creditsPage: 'https://chutes.ai/app/account',
    modelFormat: 'vendor/model',
    modelNeedsSlash: true,
    corsOk: true,
    modelSnapshot: ['deepseek-ai/DeepSeek-V3.2', 'deepseek-ai/DeepSeek-R1'],
    notes: 'Chutes ended its unlimited free tier in 2025; most models now need a small paid balance or a subscription plan.'
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    hosts: ['api.groq.com'],
    chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    modelsPublic: false,
    keyPatterns: [/^gsk_[A-Za-z0-9]{20,}$/],
    keyHint: 'gsk_…',
    keysPage: 'https://console.groq.com/keys',
    creditsPage: 'https://console.groq.com/settings/billing',
    modelFormat: 'plain-or-vendor',
    modelNeedsSlash: false,
    corsOk: true,
    modelSnapshot: ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    notes: ''
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    hosts: ['api.mistral.ai'],
    chatUrl: 'https://api.mistral.ai/v1/chat/completions',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    modelsPublic: false,
    keyPatterns: [],
    keyHint: '32-character key with no prefix',
    keysPage: 'https://console.mistral.ai/api-keys',
    creditsPage: 'https://console.mistral.ai/billing',
    modelFormat: 'plain',
    modelNeedsSlash: false,
    corsOk: true,
    modelSnapshot: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mistral-nemo'],
    notes: ''
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    hosts: ['api.openai.com'],
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    modelsUrl: 'https://api.openai.com/v1/models',
    modelsPublic: false,
    keyPatterns: [/^sk-proj-[A-Za-z0-9_-]{20,}$/, /^sk-[A-Za-z0-9_-]{40,}$/],
    keyHint: 'sk-proj-… or sk-…',
    keysPage: 'https://platform.openai.com/api-keys',
    creditsPage: 'https://platform.openai.com/settings/organization/billing',
    modelFormat: 'plain',
    modelNeedsSlash: false,
    corsOk: true,
    modelSnapshot: ['gpt-5.2', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'],
    notes: ''
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    hosts: ['api.anthropic.com'],
    chatUrl: 'https://api.anthropic.com/v1/messages',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    modelsPublic: false,
    keyPatterns: [/^sk-ant-[A-Za-z0-9_-]{20,}$/],
    keyHint: 'sk-ant-…',
    keysPage: 'https://console.anthropic.com/settings/keys',
    creditsPage: 'https://console.anthropic.com/settings/billing',
    modelFormat: 'plain',
    modelNeedsSlash: false,
    corsOk: true,
    notCompletionsShaped: true,
    modelSnapshot: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5'],
    notes: 'The Anthropic API is not OpenAI-compatible. Janitor AI\'s proxy field expects an OpenAI-style /chat/completions endpoint, so a direct Anthropic key only works through a translating proxy such as OpenRouter.'
  }
};

// Hosts that are almost always someone's reverse proxy rather than a first-party API.
export const REVERSE_PROXY_HINTS = [
  '.hf.space', '.workers.dev', '.onrender.com', '.up.railway.app', '.fly.dev',
  '.vercel.app', '.netlify.app', '.ngrok', '.loca.lt', '.serveo.net'
];

// Sites people paste by mistake because they are the *website*, not the API.
export const WEBSITE_NOT_API = {
  'janitorai.com': 'That is Janitor AI itself, not a proxy. The Proxy URL field needs the address of an AI provider\'s API (for example OpenRouter or DeepSeek).',
  'www.janitorai.com': 'That is Janitor AI itself, not a proxy. The Proxy URL field needs the address of an AI provider\'s API (for example OpenRouter or DeepSeek).',
  'chat.deepseek.com': 'That is the DeepSeek chat website. The API lives at https://api.deepseek.com/v1/chat/completions and needs an API key from platform.deepseek.com.',
  'www.deepseek.com': 'That is the DeepSeek marketing site. The API lives at https://api.deepseek.com/v1/chat/completions.',
  'platform.deepseek.com': 'That is the DeepSeek dashboard where you create keys. The API itself lives at https://api.deepseek.com/v1/chat/completions.',
  'chat.openai.com': 'That is the ChatGPT website. The API lives at https://api.openai.com/v1/chat/completions.',
  'chatgpt.com': 'That is the ChatGPT website. The API lives at https://api.openai.com/v1/chat/completions.',
  'gemini.google.com': 'That is the Gemini chat website. The API endpoint is https://generativelanguage.googleapis.com/v1beta/openai/chat/completions.',
  'aistudio.google.com': 'That is Google AI Studio where you create keys. The API endpoint is https://generativelanguage.googleapis.com/v1beta/openai/chat/completions.',
  'claude.ai': 'That is the Claude website. Anthropic\'s API is not OpenAI-compatible; to use Claude models on Janitor, go through OpenRouter instead.'
};

export function providerByHost(host) {
  if (!host) return null;
  const h = host.toLowerCase();
  for (const p of Object.values(PROVIDERS)) {
    if (p.hosts.some(x => h === x || h.endsWith('.' + x))) return p;
  }
  return null;
}
