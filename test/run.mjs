// ProxyMedic test suite. Run: node test/run.mjs
import { PROVIDERS, providerByHost, DEEPSEEK_LEGACY_CUTOFF_UTC } from '../src/providers.js';
import { cleanInput, fingerprintKey, fingerprintUrl, detectMismatch } from '../src/fingerprint.js';
import { checkUrl } from '../src/urlcheck.js';
import { checkModel, closestModel, levenshtein } from '../src/modelcheck.js';
import { decodeError, classifyResponse } from '../src/errordecode.js';
import { liveChatTest, fetchModelList, fetchKeyInfo } from '../src/livetest.js';
import { diagnose, shareText, sortFindings } from '../src/report.js';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function has(findings, code, sev = null) {
  return findings.some(f => f.code === code && (!sev || f.severity === sev));
}

const NOW_BEFORE = Date.UTC(2026, 6, 7);   // Jul 7 2026, before deepseek cutoff
const NOW_AFTER = Date.UTC(2026, 7, 1);    // Aug 1 2026, after cutoff

// ---------- cleanInput ----------
{
  const r = cleanInput('  sk-abc  ');
  ok(r.value === 'sk-abc' && r.hadWhitespace, 'cleanInput trims and flags whitespace');
  const r2 = cleanInput('sk-​abc');
  ok(r2.value === 'sk-abc' && r2.hadInvisible, 'cleanInput strips zero-width and flags it');
  const r3 = cleanInput('sk-abc');
  ok(r3.value === 'sk-abc' && !r3.hadWhitespace && !r3.hadInvisible, 'cleanInput clean passthrough');
  ok(cleanInput(null).value === '', 'cleanInput null-safe');
}

// ---------- fingerprintKey ----------
{
  const orKey = 'sk-or-v1-' + 'a1b2c3d4'.repeat(8);
  ok(fingerprintKey(orKey).provider.id === 'openrouter', 'key: openrouter sk-or-v1');
  ok(fingerprintKey('sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx').provider.id === 'anthropic', 'key: anthropic sk-ant');
  ok(fingerprintKey('AIzaSyB' + 'x'.repeat(32)).provider.id === 'google', 'key: google AIza');
  ok(fingerprintKey('gsk_' + 'Ab1'.repeat(10)).provider.id === 'groq', 'key: groq gsk_');
  ok(fingerprintKey('cpk_abcdef1234567890.abc').provider.id === 'chutes', 'key: chutes cpk_');
  const ds = fingerprintKey('sk-' + '0123456789abcdef0123456789abcdef');
  ok(ds.provider.id === 'deepseek', 'key: deepseek sk-+32hex');
  const oa = fingerprintKey('sk-proj-' + 'Ab1_'.repeat(10));
  ok(oa.provider.id === 'openai', 'key: openai sk-proj');
  const oaLong = fingerprintKey('sk-' + 'Ab1x'.repeat(13));
  ok(oaLong.provider.id === 'openai', 'key: long base62 sk- classed openai');
  const bearer = fingerprintKey('Bearer sk-or-v1-' + 'ab12'.repeat(16));
  ok(bearer.provider.id === 'openrouter' && bearer.notes.includes('bearer-prefix'), 'key: bearer prefix stripped + flagged');
  ok(fingerprintKey('').provider === null, 'key: empty -> null');
  const mist = fingerprintKey('QmFzZTY0aXNoS2V5MTIzNDU2Nzg5MDEy');
  ok(mist.provider && mist.provider.id === 'mistral' && mist.confidence === 1, 'key: bare 32-char guessed mistral low-confidence');
}

// ---------- fingerprintUrl ----------
{
  ok(fingerprintUrl('https://openrouter.ai/api/v1/chat/completions').provider.id === 'openrouter', 'url: openrouter host');
  ok(fingerprintUrl('openrouter.ai/api/v1/chat/completions').provider.id === 'openrouter', 'url: protocol auto-added');
  ok(fingerprintUrl('https://api.deepseek.com/v1/chat/completions').provider.id === 'deepseek', 'url: deepseek host');
  ok(fingerprintUrl('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions').provider.id === 'google', 'url: gemini host');
  ok(fingerprintUrl('https://janitorai.com/settings').kind === 'website', 'url: janitorai.com flagged website');
  ok(fingerprintUrl('https://chat.deepseek.com/').kind === 'website', 'url: chat.deepseek.com flagged website');
  ok(fingerprintUrl('https://myproxy.hf.space/v1/chat/completions').kind === 'reverse-proxy', 'url: hf.space reverse proxy');
  ok(fingerprintUrl('https://cool.workers.dev/api').kind === 'reverse-proxy', 'url: workers.dev reverse proxy');
  ok(fingerprintUrl('https://api.example.com/v1/chat/completions').kind === 'unknown', 'url: unknown host');
  ok(fingerprintUrl('ht!tp:/broken').kind === 'invalid' || fingerprintUrl('').kind === 'invalid', 'url: garbage invalid');
  ok(providerByHost('openrouter.ai').id === 'openrouter', 'providerByHost exact');
  ok(providerByHost('api.deepseek.com').id === 'deepseek', 'providerByHost deepseek');
}

// ---------- detectMismatch ----------
{
  const dsKey = fingerprintKey('sk-' + 'ab'.repeat(16));
  const orUrl = fingerprintUrl('https://openrouter.ai/api/v1/chat/completions');
  const mm = detectMismatch(dsKey, orUrl);
  ok(mm && mm.keyProvider.id === 'deepseek' && mm.urlProvider.id === 'openrouter', 'mismatch: deepseek key on openrouter url');
  const orKey = fingerprintKey('sk-or-v1-' + 'a1b2c3d4'.repeat(8));
  ok(detectMismatch(orKey, orUrl) === null, 'mismatch: matching pair -> null');
  const unk = fingerprintUrl('https://myproxy.hf.space/v1/chat/completions');
  ok(detectMismatch(orKey, unk) === null, 'mismatch: unknown url -> null');
}

// ---------- checkUrl ----------
{
  let r = checkUrl('https://openrouter.ai/api/v1/chat/completions');
  ok(has(r.findings, 'url-ok', 'ok') && r.corrected === PROVIDERS.openrouter.chatUrl, 'checkUrl: perfect openrouter');
  r = checkUrl('https://api.deepseek.com/chat/completions');
  ok(has(r.findings, 'url-ok', 'ok'), 'checkUrl: deepseek altPath accepted');
  r = checkUrl('https://openrouter.ai/api/v1');
  ok(has(r.findings, 'url-base-only', 'blocker') && r.corrected === PROVIDERS.openrouter.chatUrl, 'checkUrl: base-only blocked + corrected');
  r = checkUrl('https://openrouter.ai/api/v1/chat/completion');
  ok(has(r.findings, 'url-typo-completion', 'blocker'), 'checkUrl: completion typo');
  r = checkUrl('https://openrouter.ai/api/v1/models');
  ok(has(r.findings, 'url-models-endpoint', 'blocker'), 'checkUrl: models endpoint');
  r = checkUrl('http://openrouter.ai/api/v1/chat/completions');
  ok(has(r.findings, 'url-http', 'blocker'), 'checkUrl: plain http blocked');
  r = checkUrl('https://www.janitorai.com/');
  ok(has(r.findings, 'url-website', 'blocker'), 'checkUrl: website blocked');
  r = checkUrl('');
  ok(has(r.findings, 'url-empty', 'blocker'), 'checkUrl: empty');
  r = checkUrl('https://api.anthropic.com/v1/messages');
  ok(has(r.findings, 'url-not-openai-compatible', 'blocker'), 'checkUrl: anthropic flagged not compatible');
  r = checkUrl('https://myproxy.hf.space');
  ok(has(r.findings, 'url-reverse-proxy', 'warning'), 'checkUrl: reverse proxy w/o path warns');
  r = checkUrl('https://myproxy.hf.space/v1/chat/completions');
  ok(has(r.findings, 'url-reverse-proxy', 'info'), 'checkUrl: reverse proxy with path info only');
  r = checkUrl('  https://openrouter.ai/api/v1/chat/completions ');
  ok(has(r.findings, 'url-hidden-chars', 'warning'), 'checkUrl: padded url flagged');
}

// ---------- checkModel ----------
{
  let r = checkModel('', PROVIDERS.openrouter);
  ok(has(r.findings, 'model-empty', 'blocker'), 'model: empty');
  r = checkModel('deepseek-chat', PROVIDERS.openrouter);
  ok(has(r.findings, 'model-needs-vendor-prefix', 'blocker'), 'model: openrouter needs slash');
  r = checkModel('deepseek/deepseek-chat', PROVIDERS.deepseek, null, NOW_BEFORE);
  ok(has(r.findings, 'model-vendor-prefix-wrong', 'blocker'), 'model: deepseek rejects vendor prefix');
  r = checkModel('deepseek-chat', PROVIDERS.deepseek, null, NOW_BEFORE);
  ok(has(r.findings, 'model-legacy-dying', 'warning'), 'model: deepseek-chat legacy warning before cutoff');
  ok(r.findings.find(f => f.code === 'model-legacy-dying').detail.includes('day'), 'model: legacy warning mentions days left');
  r = checkModel('deepseek-chat', PROVIDERS.deepseek, null, NOW_AFTER);
  ok(has(r.findings, 'model-legacy-dead', 'blocker') && r.corrected === 'deepseek-v4-flash', 'model: legacy blocker + corrected after cutoff');
  r = checkModel('deepseek-reasoner', PROVIDERS.deepseek, null, NOW_AFTER);
  ok(r.corrected === 'deepseek-v4-pro', 'model: reasoner corrected to v4-pro after cutoff');
  r = checkModel('deepseek-v4-flash', PROVIDERS.deepseek, null, NOW_BEFORE);
  ok(has(r.findings, 'model-ok', 'ok'), 'model: current deepseek id ok');
  r = checkModel('deepseek/deepseek-v9.9', PROVIDERS.openrouter, ['deepseek/deepseek-v4-pro', 'deepseek/deepseek-v3.2']);
  ok(has(r.findings, 'model-not-in-live-list', 'blocker'), 'model: live catalog miss is blocker');
  r = checkModel('deepseek/deepseek-v3.2', PROVIDERS.openrouter, ['deepseek/deepseek-v3.2']);
  ok(has(r.findings, 'model-ok', 'ok'), 'model: live catalog hit ok');
  r = checkModel('DeepSeek/DeepSeek-V3.2', PROVIDERS.openrouter, ['deepseek/deepseek-v3.2']);
  ok(has(r.findings, 'model-case', 'warning') && r.corrected === 'deepseek/deepseek-v3.2', 'model: case difference warned + corrected');
  r = checkModel('meta-llama/llama-3.3-70b-instruct:free', PROVIDERS.openrouter);
  ok(has(r.findings, 'model-free-tier', 'info'), 'model: :free info shown');
  r = checkModel('whatever-model', null);
  ok(has(r.findings, 'model-unverifiable', 'info'), 'model: unknown provider unverifiable');
  ok(levenshtein('kitten', 'sitting') === 3, 'levenshtein sanity');
  const sugg = closestModel('deepseek-v3', ['deepseek/deepseek-v3.2', 'google/gemini-3.5-flash']);
  ok(sugg[0] === 'deepseek/deepseek-v3.2', 'closestModel finds deepseek');
}

// ---------- decodeError (real captured strings) ----------
{
  ok(decodeError('{"error":{"message":"User not found.","code":401}}', 401).some(r => r.code === 'err-401-openrouter-user'), 'decode: openrouter user not found');
  ok(decodeError('Authentication Fails, Your api key: ****test is invalid', 401).some(r => r.code === 'err-401-deepseek-auth'), 'decode: deepseek auth fails');
  ok(decodeError('[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]', 400).some(r => r.code === 'err-401-generic'), 'decode: gemini invalid key');
  ok(decodeError('Insufficient Balance').some(r => r.code === 'err-402-deepseek'), 'decode: deepseek balance');
  ok(decodeError('Rate limit exceeded: free-models-per-day').some(r => r.code === 'err-429-free-tier'), 'decode: openrouter free cap');
  ok(decodeError('RESOURCE_EXHAUSTED: quota exceeded').some(r => r.code === 'err-429-resource-exhausted'), 'decode: gemini quota');
  ok(decodeError('No endpoints found for deepseek/deepseek-chat-v3').some(r => r.code === 'err-404-model'), 'decode: openrouter no endpoints');
  ok(decodeError('The model `gpt-9` does not exist or you do not have access to it.').some(r => r.code === 'err-404-model'), 'decode: openai bad model');
  ok(decodeError('A network error occurred, you may be rate limited or having connection issues').some(r => r.code === 'err-janitor-generic'), 'decode: janitor generic');
  ok(decodeError('TypeError: Failed to fetch').some(r => r.code === 'err-failed-to-fetch'), 'decode: failed to fetch');
  ok(decodeError('response contains <think>reasoning</think> tags').some(r => r.code === 'err-think-tags'), 'decode: think tags');
  ok(decodeError('This model\'s maximum context length is 65536 tokens').some(r => r.code === 'err-context-length'), 'decode: context length');
  ok(decodeError('', 503).some(r => r.code === 'err-503-overloaded'), 'decode: bare 503 status fallback');
  ok(decodeError('unsupported_country_region_territory').some(r => r.code === 'err-403-region'), 'decode: region block');
  ok(decodeError('your input was flagged by moderation').some(r => r.code === 'err-403-moderation'), 'decode: moderation');
  const cls = classifyResponse(200, '{"choices":[{"message":{"content":"hi"}}]}', PROVIDERS.openrouter);
  ok(cls.length === 1 && cls[0].code === 'live-ok', 'classify: 200 ok');
  const cls2 = classifyResponse(401, '{"error":{"message":"User not found.","code":401}}', PROVIDERS.openrouter);
  ok(cls2[0].severity === 'blocker' && cls2[0].code === 'err-401-openrouter-user', 'classify: 401 blocker');
}

// ---------- livetest with mock fetch ----------
{
  const mkRes = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    text: async () => body, json: async () => JSON.parse(body)
  });
  const cfgOR = { url: PROVIDERS.openrouter.chatUrl, key: 'sk-or-v1-x', model: 'deepseek/deepseek-v3.2', provider: PROVIDERS.openrouter };

  let r = await liveChatTest(cfgOR, async () => mkRes(200, '{"choices":[]}'));
  ok(has(r.findings, 'live-ok', 'ok') && has(r.findings, 'live-latency', 'info') && r.status === 200, 'live: 200 path');

  r = await liveChatTest(cfgOR, async () => mkRes(401, '{"error":{"message":"User not found.","code":401}}'));
  ok(has(r.findings, 'err-401-openrouter-user', 'blocker'), 'live: 401 classified');

  r = await liveChatTest(cfgOR, async () => { throw new TypeError('Failed to fetch'); });
  ok(has(r.findings, 'live-network-fail', 'blocker'), 'live: network failure');

  r = await liveChatTest(cfgOR, async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; });
  ok(has(r.findings, 'live-timeout', 'blocker'), 'live: timeout classified');

  // model list parsing: openai-style {data:[{id}]}
  let ml = await fetchModelList(PROVIDERS.openrouter, 'k', async () => mkRes(200, JSON.stringify({ data: [{ id: 'a/b' }, { id: 'c/d' }] })));
  ok(ml.models && ml.models.length === 2 && ml.models[0] === 'a/b', 'live: model list openai shape');
  // gemini-style {models:[{name:"models/gemini-x"}]}
  ml = await fetchModelList(PROVIDERS.google, 'k', async () => mkRes(200, JSON.stringify({ models: [{ name: 'models/gemini-3.5-flash' }] })));
  ok(ml.models && ml.models[0] === 'gemini-3.5-flash', 'live: model list gemini shape + prefix strip');
  ml = await fetchModelList(PROVIDERS.openrouter, 'k', async () => mkRes(500, 'oops'));
  ok(ml.models === null, 'live: model list failure is silent');

  const ki = await fetchKeyInfo(PROVIDERS.openrouter, 'k', async () => mkRes(200, JSON.stringify({ data: { usage: 1.5, limit: null, is_free_tier: true } })));
  ok(ki && ki.usage === 1.5 && ki.isFreeTier === true, 'live: key info parsed');
  const ki2 = await fetchKeyInfo(PROVIDERS.deepseek, 'k', async () => mkRes(200, '{}'));
  ok(ki2 === null, 'live: key info only for openrouter');
}

// ---------- diagnose end-to-end ----------
{
  const orKey = 'sk-or-v1-' + 'a1b2c3d4'.repeat(8);

  // healthy openrouter
  let r = diagnose({ url: 'https://openrouter.ai/api/v1/chat/completions', key: orKey, model: 'deepseek/deepseek-v3.2' }, { now: NOW_BEFORE });
  ok(r.verdict === 'healthy' && r.blockers === 0, 'diagnose: healthy openrouter');
  ok(has(r.findings, 'key-recognised', 'ok'), 'diagnose: key recognised finding');

  // the classic mismatch
  r = diagnose({ url: 'https://openrouter.ai/api/v1/chat/completions', key: 'sk-' + 'ab'.repeat(16), model: 'deepseek-chat' }, { now: NOW_BEFORE });
  ok(has(r.findings, 'triple-mismatch', 'blocker'), 'diagnose: mismatch detected');
  ok(r.corrected && r.corrected.url === PROVIDERS.deepseek.chatUrl, 'diagnose: corrected url follows the key');
  ok(r.corrected.model && !r.corrected.model.includes('/'), 'diagnose: corrected model in deepseek format');

  // website url
  r = diagnose({ url: 'https://janitorai.com', key: orKey, model: 'x' });
  ok(has(r.findings, 'url-website', 'blocker'), 'diagnose: website url blocked');

  // legacy deepseek pre-cutoff: healthy-ish but warned
  r = diagnose({ url: 'https://api.deepseek.com/v1/chat/completions', key: 'sk-' + 'ab'.repeat(16), model: 'deepseek-chat' }, { now: NOW_BEFORE });
  ok(r.verdict === 'shaky' && has(r.findings, 'model-legacy-dying', 'warning'), 'diagnose: legacy model = shaky');

  // all empty
  r = diagnose({ url: '', key: '', model: '' });
  ok(has(r.findings, 'url-empty') && has(r.findings, 'key-empty') && has(r.findings, 'model-empty'), 'diagnose: triple empty');
  ok(r.verdict === 'broken', 'diagnose: empty verdict broken');

  // bearer prefix
  r = diagnose({ url: 'https://openrouter.ai/api/v1/chat/completions', key: 'Bearer ' + orKey, model: 'deepseek/deepseek-v3.2' }, { now: NOW_BEFORE });
  ok(has(r.findings, 'key-bearer', 'blocker'), 'diagnose: bearer prefix blocked');

  // sorting: blockers first
  const sorted = sortFindings([{ severity: 'ok' }, { severity: 'blocker' }, { severity: 'info' }, { severity: 'warning' }]);
  ok(sorted[0].severity === 'blocker' && sorted[3].severity === 'ok', 'sortFindings order');

  // share text redacts key
  r = diagnose({ url: 'https://openrouter.ai/api/v1/chat/completions', key: orKey, model: 'deepseek/deepseek-v3.2' }, { now: NOW_BEFORE });
  const share = shareText(r, { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'deepseek/deepseek-v3.2' });
  ok(!share.includes(orKey) && share.includes('redacted'), 'shareText never contains the key');
  ok(share.includes('HEALTHY'), 'shareText includes verdict');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
