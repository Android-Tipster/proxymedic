// Live testing against the real provider, from the user's own browser.
// The key travels ONLY from the user's browser to their provider. Nothing is logged.
// fetchImpl is injectable for tests.
import { classifyResponse } from './errordecode.js';

async function timedFetch(fetchImpl, url, opts, timeoutMs = 20000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  const started = Date.now();
  try {
    const res = await fetchImpl(url, { ...opts, signal: ctrl ? ctrl.signal : undefined });
    return { res, ms: Date.now() - started, netError: null };
  } catch (e) {
    return { res: null, ms: Date.now() - started, netError: e };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function authHeaders(provider, key) {
  if (provider && provider.id === 'anthropic') {
    return {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json'
    };
  }
  return { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };
}

// Fetch the provider's live model list. Returns {models: string[]|null, finding|null}
export async function fetchModelList(provider, key, fetchImpl = fetch) {
  if (!provider || !provider.modelsUrl) return { models: null, finding: null };
  const headers = key ? authHeaders(provider, key) : { 'Content-Type': 'application/json' };
  const { res, netError } = await timedFetch(fetchImpl, provider.modelsUrl, { method: 'GET', headers }, 15000);
  if (netError || !res || !res.ok) return { models: null, finding: null }; // model list is best-effort
  try {
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.data || data.models || []);
    const ids = arr.map(m => (typeof m === 'string' ? m : (m.id || m.name || ''))).filter(Boolean)
      .map(id => id.replace(/^models\//, ''));
    return { models: ids.length ? ids : null, finding: null };
  } catch {
    return { models: null, finding: null };
  }
}

// Run the real end-to-end test: one minimal chat completion.
// Returns { findings: [], latencyMs, status }
export async function liveChatTest({ url, key, model, provider }, fetchImpl = fetch) {
  const findings = [];
  let body;
  if (provider && provider.id === 'anthropic') {
    body = JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
  } else {
    body = JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false });
  }
  const { res, ms, netError } = await timedFetch(fetchImpl, url, {
    method: 'POST', headers: authHeaders(provider, key), body
  });

  if (netError) {
    const aborted = netError && (netError.name === 'AbortError');
    findings.push({
      severity: 'blocker',
      code: aborted ? 'live-timeout' : 'live-network-fail',
      title: aborted ? 'The proxy did not answer within 20 seconds' : 'Could not reach the proxy from the browser',
      detail: aborted
        ? 'The server accepted the connection but never answered. Community reverse proxies do this when their upstream is dead or saturated.'
        : (provider && provider.corsOk
          ? `The browser could not complete the request (${netError.message || netError.name || 'network error'}). Since ${provider.name} allows browser access, this points at your network (VPN, firewall, DNS) or a typo in the URL.`
          : `The browser could not complete the request (${netError.message || netError.name || 'network error'}). Either the host is down, the URL is wrong, or this server does not allow browser (CORS) access.`),
      fix: aborted
        ? 'Try again in a minute. If it keeps happening on a community proxy, the proxy is the problem, not your settings.'
        : 'Double-check the URL for typos, try with any VPN toggled, and confirm the service is up.'
    });
    return { findings, latencyMs: ms, status: null };
  }

  let text = '';
  try { text = await res.text(); } catch { /* body unreadable */ }
  const classified = classifyResponse(res.status, text, provider);
  for (const f of classified) findings.push(f);

  if (res.status >= 200 && res.status < 300) {
    findings.push({
      severity: 'info', code: 'live-latency',
      title: `Round trip: ${ms} ms`,
      detail: ms > 8000
        ? 'That is slow. Expect sluggish replies in chat; reasoning models and saturated proxies both cause this.'
        : 'Latency looks healthy for chatting.',
      fix: null
    });
  }
  return { findings, latencyMs: ms, status: res.status };
}

// OpenRouter bonus: key limit/usage info (only OpenRouter exposes this to inference keys).
export async function fetchKeyInfo(provider, key, fetchImpl = fetch) {
  if (!provider || provider.id !== 'openrouter' || !provider.keyInfoUrl) return null;
  const { res, netError } = await timedFetch(fetchImpl, provider.keyInfoUrl, {
    method: 'GET', headers: authHeaders(provider, key)
  }, 10000);
  if (netError || !res || !res.ok) return null;
  try {
    const data = await res.json();
    const d = data.data || data;
    return {
      usage: d.usage ?? null,
      limit: d.limit ?? null,
      isFreeTier: d.is_free_tier ?? null,
      limitRemaining: d.limit_remaining ?? null
    };
  } catch {
    return null;
  }
}
