// Assemble the full static diagnosis and the corrected Janitor config.
import { fingerprintKey, fingerprintUrl, detectMismatch } from './fingerprint.js';
import { checkUrl } from './urlcheck.js';
import { checkModel } from './modelcheck.js';

const SEV_ORDER = { blocker: 0, warning: 1, info: 2, ok: 3 };

export function sortFindings(findings) {
  return [...findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

// Static (no-network) diagnosis of the URL + key + model triple.
export function diagnose({ url, key, model }, { liveCatalog = null, now = Date.now() } = {}) {
  const findings = [];

  const keyFp = fingerprintKey(key);
  const urlResult = checkUrl(url);
  findings.push(...urlResult.findings);
  const urlFp = urlResult.urlFp;

  // Key-side findings
  if (!keyFp.cleaned) {
    findings.push({
      severity: 'blocker', code: 'key-empty', title: 'No API key',
      detail: 'The API key field is empty. Every provider requires one.',
      fix: (urlFp.provider ? `Create one at ${urlFp.provider.keysPage}` : 'Create one on your provider\'s dashboard.')
    });
  } else {
    if (keyFp.notes.includes('bearer-prefix')) {
      findings.push({
        severity: 'blocker', code: 'key-bearer', title: 'Remove "Bearer" from the key field',
        detail: 'The key was pasted with the word "Bearer" in front. Janitor adds that automatically, so it gets sent twice and the provider rejects it.',
        fix: 'Paste only the key itself, starting with its prefix (sk-, AIza, gsk_, ...).'
      });
    }
    if (keyFp.notes.includes('whitespace') || keyFp.notes.includes('invisible-chars')) {
      findings.push({
        severity: 'warning', code: 'key-hidden-chars', title: 'Hidden characters around the key',
        detail: 'The key had spaces or invisible characters attached (classic mobile copy bug). Providers reject keys that do not match exactly.',
        fix: 'Delete the key in Janitor and re-paste it clean.'
      });
    }
    if (keyFp.notes.includes('inner-whitespace')) {
      findings.push({
        severity: 'blocker', code: 'key-split', title: 'The key contains a space or line break',
        detail: 'Keys are one unbroken string. A space in the middle usually means the copy grabbed a line wrap.',
        fix: 'Re-copy the key from the provider dashboard in one selection.'
      });
    }
    if (keyFp.provider && keyFp.confidence >= 2) {
      findings.push({
        severity: 'ok', code: 'key-recognised',
        title: `Key format matches ${keyFp.provider.name}`,
        detail: `Keys starting like this belong to ${keyFp.provider.name} (${keyFp.provider.keyHint}).`,
        fix: null
      });
    }
  }

  // THE mismatch check
  const mismatch = detectMismatch(keyFp, urlFp);
  if (mismatch) {
    findings.push({
      severity: 'blocker', code: 'triple-mismatch',
      title: `Your key is from ${mismatch.keyProvider.name} but the URL points at ${mismatch.urlProvider.name}`,
      detail: `This is the single most common cause of Janitor's "network error". A ${mismatch.keyProvider.name} key only works against ${mismatch.keyProvider.name}'s own endpoint.`,
      fix: `Either change the Proxy URL to ${mismatch.keyProvider.chatUrl} (keep your key), or get a ${mismatch.urlProvider.name} key at ${mismatch.urlProvider.keysPage} (keep your URL).`
    });
  }

  // Model check runs against whichever provider we trust more: URL (that's who receives the request)
  const effectiveProvider = urlFp.provider || (mismatch ? null : keyFp.provider) || null;
  const modelResult = checkModel(model, urlFp.provider || null, liveCatalog, now);
  findings.push(...modelResult.findings);

  // Build corrected config
  const provider = mismatch ? mismatch.keyProvider : effectiveProvider;
  let corrected = null;
  if (provider && !provider.notCompletionsShaped) {
    let correctedModel = modelResult.corrected;
    if (mismatch && correctedModel) {
      // Model format may need translating to the key's provider
      const mc = checkModel(correctedModel, provider, null, now);
      correctedModel = mc.corrected || correctedModel;
    }
    corrected = {
      providerName: provider.name,
      url: provider.chatUrl,
      model: correctedModel || (provider.modelSnapshot ? provider.modelSnapshot[0] : ''),
      keyNote: keyFp.cleaned
        ? (mismatch || !keyFp.provider || keyFp.provider.id === provider.id
          ? 'your key, re-pasted with no spaces'
          : `a ${provider.name} key from ${provider.keysPage}`)
        : `a key from ${provider.keysPage}`
    };
  } else if (urlFp.kind === 'reverse-proxy' || urlFp.kind === 'unknown') {
    corrected = {
      providerName: 'your custom proxy',
      url: urlResult.corrected || urlFp.cleaned,
      model: modelResult.corrected || model || '',
      keyNote: 'whatever key the proxy owner gave you'
    };
  }

  const blockers = findings.filter(f => f.severity === 'blocker').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const verdict = blockers > 0 ? 'broken' : warnings > 0 ? 'shaky' : 'healthy';

  return {
    findings: sortFindings(findings),
    verdict,
    blockers,
    warnings,
    keyFp,
    urlFp,
    provider: effectiveProvider,
    mismatch,
    corrected
  };
}

// Shareable plain-text summary for Reddit/Discord help threads. Never includes the key.
export function shareText(result, { url, model }) {
  const lines = [];
  lines.push('ProxyMedic diagnosis (proxymedic: free, runs in your browser, key never leaves it)');
  lines.push(`URL: ${url || '(empty)'}`);
  lines.push(`Model: ${model || '(empty)'}`);
  lines.push(`Key: ${result.keyFp && result.keyFp.provider ? result.keyFp.provider.name + '-format key (redacted)' : '(redacted)'}`);
  lines.push(`Verdict: ${result.verdict.toUpperCase()}: ${result.blockers} blocker(s), ${result.warnings} warning(s)`);
  for (const f of result.findings) {
    if (f.severity === 'blocker' || f.severity === 'warning') {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.title}`);
    }
  }
  return lines.join('\n');
}
