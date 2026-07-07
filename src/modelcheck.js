// Model-name validation: format rules per provider, legacy warnings, fuzzy "did you mean".
import { PROVIDERS, DEEPSEEK_LEGACY_CUTOFF_UTC } from './providers.js';
import { cleanInput } from './fingerprint.js';

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function closestModel(model, catalog, maxResults = 3) {
  const q = model.toLowerCase();
  const scored = catalog.map(id => {
    const idL = id.toLowerCase();
    let score;
    if (idL === q) score = 0;
    else if (idL.includes(q) || q.includes(idL.split('/').pop())) score = 1;
    else score = 2 + levenshtein(q, idL) / Math.max(q.length, idL.length);
    return { id, score };
  }).sort((x, y) => x.score - y.score);
  return scored.slice(0, maxResults).filter(s => s.score < 2.6).map(s => s.id);
}

// provider may be null (unknown host). liveCatalog: string[] fetched at runtime, optional.
// now: ms epoch for testability.
export function checkModel(rawModel, provider, liveCatalog = null, now = Date.now()) {
  const findings = [];
  const { value: model, hadWhitespace, hadInvisible } = cleanInput(rawModel);

  if (!model) {
    findings.push({
      severity: 'blocker', code: 'model-empty', title: 'No model name',
      detail: 'The Model field is empty. Janitor sends this string to the provider, and providers reject requests with no model.',
      fix: provider ? `For ${provider.name}, a safe starting choice is ${provider.modelSnapshot[0]}.` : 'Check your provider\'s docs for the exact model ID.'
    });
    return { findings, corrected: null };
  }
  if (hadWhitespace || hadInvisible) {
    findings.push({
      severity: 'warning', code: 'model-hidden-chars', title: 'Hidden characters in the model name',
      detail: 'The model name had extra spaces or invisible characters. Providers match model names exactly, so "deepseek-chat " with a trailing space fails.',
      fix: 'Re-type the model name in Janitor with no spaces around it.'
    });
  }

  let corrected = model;

  if (!provider) {
    findings.push({
      severity: 'info', code: 'model-unverifiable', title: 'Model name cannot be verified',
      detail: 'The proxy host is not a known provider, so ProxyMedic cannot check whether this model name exists there. The live test will reveal it.',
      fix: null
    });
    return { findings, corrected };
  }

  const catalog = (liveCatalog && liveCatalog.length) ? liveCatalog : (provider.modelSnapshot || []);
  const catalogIsLive = !!(liveCatalog && liveCatalog.length);

  // Format rules
  const hasSlash = model.includes('/');
  if (provider.modelNeedsSlash && !hasSlash) {
    const suggestions = closestModel(model, catalog);
    findings.push({
      severity: 'blocker', code: 'model-needs-vendor-prefix', title: `${provider.name} model names need a vendor prefix`,
      detail: `${provider.name} uses "vendor/model" IDs (for example deepseek/deepseek-v3.2). "${model}" has no vendor part, so the provider will answer "model not found".`,
      fix: suggestions.length ? `Did you mean: ${suggestions.join(', ')}` : `Browse the model list at ${provider.modelsUrl.replace('/api/v1/models', '/models')}`
    });
    if (suggestions.length) corrected = suggestions[0];
  } else if (!provider.modelNeedsSlash && hasSlash && provider.modelFormat === 'plain') {
    const stripped = model.split('/').pop();
    const suggestions = closestModel(stripped, catalog);
    findings.push({
      severity: 'blocker', code: 'model-vendor-prefix-wrong', title: `${provider.name} does not use vendor/model IDs`,
      detail: `"${model}" looks like an OpenRouter-style ID. On ${provider.name}'s own API the model name has no vendor prefix.`,
      fix: suggestions.length ? `Use ${suggestions[0]}` : `Try "${stripped}"`
    });
    corrected = suggestions.length ? suggestions[0] : stripped;
  }

  // DeepSeek legacy names (verified from api-docs.deepseek.com: gone 2026-07-24 15:59 UTC)
  if (provider.legacyModels && provider.legacyModels[model]) {
    const replacement = provider.legacyModels[model];
    const gone = now >= DEEPSEEK_LEGACY_CUTOFF_UTC;
    const daysLeft = Math.max(0, Math.ceil((DEEPSEEK_LEGACY_CUTOFF_UTC - now) / 86400000));
    findings.push({
      severity: gone ? 'blocker' : 'warning',
      code: gone ? 'model-legacy-dead' : 'model-legacy-dying',
      title: gone ? `"${model}" was discontinued on July 24, 2026` : `"${model}" stops working on July 24, 2026`,
      detail: gone
        ? `DeepSeek retired the legacy name "${model}". Every tutorial written before mid-2026 still uses it, which is why setups that worked for months suddenly broke.`
        : `DeepSeek is retiring the legacy name "${model}" in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (July 24, 2026 15:59 UTC). Your setup works today but will break that day.`,
      fix: `Switch the Model field to ${replacement} now.`
    });
    corrected = gone ? replacement : corrected;
  } else if (catalog.length && !catalog.some(id => id.toLowerCase() === model.toLowerCase())) {
    // Not in catalog
    const suggestions = closestModel(model, catalog);
    const already = findings.some(f => f.code === 'model-needs-vendor-prefix' || f.code === 'model-vendor-prefix-wrong');
    if (!already) {
      findings.push({
        severity: catalogIsLive ? 'blocker' : 'warning',
        code: catalogIsLive ? 'model-not-in-live-list' : 'model-not-in-snapshot',
        title: catalogIsLive
          ? `"${model}" is not in ${provider.name}'s live model list`
          : `"${model}" is not a model name ProxyMedic recognises for ${provider.name}`,
        detail: catalogIsLive
          ? `The provider's own /models endpoint was checked a moment ago and does not list this ID.`
          : `This check used a built-in snapshot, so a very new model might be missing. The live test will settle it.`,
        fix: suggestions.length ? `Closest matches: ${suggestions.join(', ')}` : 'Check the exact ID on your provider\'s model list.'
      });
      if (suggestions.length && catalogIsLive) corrected = suggestions[0];
    }
  } else if (catalog.length) {
    const exact = catalog.find(id => id.toLowerCase() === model.toLowerCase());
    if (exact && exact !== model) {
      findings.push({
        severity: 'warning', code: 'model-case', title: 'Model name capitalisation differs',
        detail: `The provider lists it as "${exact}" but you wrote "${model}". Some providers match case-sensitively.`,
        fix: `Use ${exact}`
      });
      corrected = exact;
    } else {
      findings.push({
        severity: 'ok', code: 'model-ok', title: `Model name looks right for ${provider.name}`,
        detail: model, fix: null
      });
    }
  }

  // OpenRouter :free hint
  if (provider.id === 'openrouter' && model.endsWith(':free')) {
    findings.push({
      severity: 'info', code: 'model-free-tier', title: 'Free model daily caps apply',
      detail: PROVIDERS.openrouter.notes,
      fix: null
    });
  }

  return { findings, corrected };
}
