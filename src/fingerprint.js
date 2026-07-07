// Key + URL fingerprinting and provider mismatch detection.
import { PROVIDERS, REVERSE_PROXY_HINTS, WEBSITE_NOT_API, providerByHost } from './providers.js';

const INVISIBLES = /[​-‍﻿ ⁠]/g;

export function cleanInput(raw) {
  if (raw == null) return { value: '', hadWhitespace: false, hadInvisible: false };
  const str = String(raw);
  const hadInvisible = INVISIBLES.test(str);
  INVISIBLES.lastIndex = 0;
  const stripped = str.replace(INVISIBLES, '');
  const trimmed = stripped.trim();
  return { value: trimmed, hadWhitespace: stripped !== trimmed, hadInvisible };
}

// Identify the provider a key belongs to. Returns {provider, confidence, cleaned, notes[]}
export function fingerprintKey(rawKey) {
  const { value: key0, hadWhitespace, hadInvisible } = cleanInput(rawKey);
  const notes = [];
  let key = key0;
  if (hadWhitespace) notes.push('whitespace');
  if (hadInvisible) notes.push('invisible-chars');
  if (/^bearer\s+/i.test(key)) {
    key = key.replace(/^bearer\s+/i, '');
    notes.push('bearer-prefix');
  }
  if (/\s/.test(key)) notes.push('inner-whitespace');
  const compact = key.replace(/\s+/g, '');

  if (!compact) return { provider: null, confidence: 0, cleaned: '', notes };

  const ordered = [
    ['openrouter', 3], ['anthropic', 3], ['google', 3], ['groq', 3], ['chutes', 3],
    ['deepseek', 2], ['openai', 2]
  ];
  for (const [id, conf] of ordered) {
    const p = PROVIDERS[id];
    if (p.keyPatterns.some(rx => rx.test(compact))) {
      return { provider: p, confidence: conf, cleaned: compact, notes };
    }
  }
  // Weak signals
  if (/^sk-or/i.test(compact)) return { provider: PROVIDERS.openrouter, confidence: 2, cleaned: compact, notes };
  if (/^sk-ant/i.test(compact)) return { provider: PROVIDERS.anthropic, confidence: 2, cleaned: compact, notes };
  if (/^AIza/.test(compact)) return { provider: PROVIDERS.google, confidence: 2, cleaned: compact, notes };
  if (/^gsk_/.test(compact)) return { provider: PROVIDERS.groq, confidence: 2, cleaned: compact, notes };
  if (/^cpk_/.test(compact)) return { provider: PROVIDERS.chutes, confidence: 2, cleaned: compact, notes };
  if (/^sk-/.test(compact)) {
    // Could be OpenAI or DeepSeek. DeepSeek is exactly sk- + 32 hex; anything longer is OpenAI-ish.
    const body = compact.slice(3);
    if (/^[0-9a-f]+$/.test(body) && body.length <= 36) {
      return { provider: PROVIDERS.deepseek, confidence: 1, cleaned: compact, notes };
    }
    return { provider: PROVIDERS.openai, confidence: 1, cleaned: compact, notes };
  }
  if (/^[A-Za-z0-9]{28,40}$/.test(compact)) {
    return { provider: PROVIDERS.mistral, confidence: 1, cleaned: compact, notes };
  }
  return { provider: null, confidence: 0, cleaned: compact, notes };
}

// Identify what a URL points at. Returns {provider, kind, host, cleaned, website, reverseProxy}
export function fingerprintUrl(rawUrl) {
  const { value: cleanedRaw, hadWhitespace, hadInvisible } = cleanInput(rawUrl);
  const notes = [];
  if (hadWhitespace) notes.push('whitespace');
  if (hadInvisible) notes.push('invisible-chars');
  let candidate = cleanedRaw;
  if (candidate && !/^[a-z]+:\/\//i.test(candidate)) candidate = 'https://' + candidate;
  let parsed = null;
  try { parsed = new URL(candidate); } catch { /* unparseable */ }
  if (!parsed) return { provider: null, kind: 'invalid', host: null, cleaned: cleanedRaw, notes };

  const host = parsed.hostname.toLowerCase();
  const website = WEBSITE_NOT_API[host] || null;
  if (website) return { provider: null, kind: 'website', host, cleaned: cleanedRaw, websiteMessage: website, notes };

  const provider = providerByHost(host);
  if (provider) return { provider, kind: 'provider', host, cleaned: cleanedRaw, parsed, notes };

  const reverseProxy = REVERSE_PROXY_HINTS.some(h => host.includes(h.replace(/^\./, '')) || host.endsWith(h));
  return { provider: null, kind: reverseProxy ? 'reverse-proxy' : 'unknown', host, cleaned: cleanedRaw, parsed, notes };
}

// The headline check: does the key belong to the API the URL points at?
export function detectMismatch(keyFp, urlFp) {
  if (!keyFp.provider || !urlFp.provider) return null;
  if (keyFp.provider.id === urlFp.provider.id) return null;
  return {
    keyProvider: keyFp.provider,
    urlProvider: urlFp.provider,
    confidence: Math.min(keyFp.confidence, 3)
  };
}
