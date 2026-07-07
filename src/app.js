// ProxyMedic UI. Browser-only; expects window.PM = {providers, fingerprint, urlcheck, modelcheck, errordecode, livetest, report}.
(function () {
  const PM = window.PM;
  const $ = (id) => document.getElementById(id);

  const els = {
    tabs: document.querySelectorAll('.tab'),
    panels: document.querySelectorAll('.panel'),
    url: $('in-url'), key: $('in-key'), model: $('in-model'),
    diagnose: $('btn-diagnose'), livetest: $('btn-livetest'),
    results: $('results'), corrected: $('corrected'), share: $('btn-share'),
    errText: $('in-error'), decode: $('btn-decode'), errResults: $('err-results')
  };

  let lastResult = null;
  let liveCatalog = null;
  let liveCatalogProvider = null;

  // Remember URL + model (never the key).
  try {
    els.url.value = localStorage.getItem('pm.url') || '';
    els.model.value = localStorage.getItem('pm.model') || '';
  } catch { /* storage unavailable */ }

  els.tabs.forEach(tab => tab.addEventListener('click', () => {
    els.tabs.forEach(t => t.classList.toggle('active', t === tab));
    els.panels.forEach(p => p.classList.toggle('active', p.id === tab.dataset.panel));
  }));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function linkify(s) {
    return esc(s).replace(/(https?:\/\/[^\s,)]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent)">$1</a>');
  }

  function findingHtml(f) {
    return `<div class="finding ${f.severity}">
      <div class="f-title"><span class="sev ${f.severity}">${f.severity === 'ok' ? 'PASS' : f.severity.toUpperCase()}</span> ${esc(f.title)}</div>
      ${f.detail ? `<div class="f-detail">${linkify(f.detail)}</div>` : ''}
      ${f.fix ? `<div class="f-fix"><strong>Fix:</strong> ${linkify(f.fix)}</div>` : ''}
    </div>`;
  }

  function verdictHtml(result) {
    const map = {
      broken: `Broken: ${result.blockers} blocker${result.blockers === 1 ? '' : 's'} found. Fix the red items below.`,
      shaky: 'Works, but shaky. Check the yellow items before they bite.',
      healthy: 'No problems found in the static checks. Run the live test to be sure.'
    };
    return `<div class="verdict ${result.verdict}">${map[result.verdict]}</div>`;
  }

  function correctedHtml(c) {
    if (!c) return '';
    const row = (k, v, copyable) => `<div class="copyrow"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${copyable ? `<button data-copy="${esc(v)}">Copy</button>` : ''}</div>`;
    return `<div class="card corrected">
      <h3>Paste this into Janitor's proxy settings</h3>
      <div class="sub">Fields match Janitor's "add configuration" form (${esc(c.providerName)}).</div>
      ${row('Model', c.model, true)}
      ${row('Proxy URL', c.url, true)}
      ${row('API Key', c.keyNote, false)}
    </div>`;
  }

  function bindCopyButtons(scope) {
    scope.querySelectorAll('button[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.copy);
          btn.textContent = 'Copied'; btn.classList.add('copied');
          setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1600);
        } catch { /* clipboard denied */ }
      });
    });
  }

  function runDiagnosis() {
    const url = els.url.value, key = els.key.value, model = els.model.value;
    try {
      localStorage.setItem('pm.url', url);
      localStorage.setItem('pm.model', model);
    } catch { /* storage unavailable */ }
    const catalog = (liveCatalogProvider && lastProviderId() === liveCatalogProvider) ? liveCatalog : null;
    lastResult = PM.report.diagnose({ url, key, model }, { liveCatalog: catalog });
    els.results.innerHTML = verdictHtml(lastResult) + lastResult.findings.map(findingHtml).join('');
    els.corrected.innerHTML = correctedHtml(lastResult.corrected);
    bindCopyButtons(els.corrected);
    els.livetest.style.display = 'block';
    els.share.style.display = 'block';
    els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function lastProviderId() {
    if (!lastResult) return null;
    const p = lastResult.urlFp && lastResult.urlFp.provider;
    return p ? p.id : null;
  }

  async function runLiveTest() {
    if (!lastResult) return;
    const url = els.url.value, key = els.key.value.trim().replace(/^bearer\s+/i, ''), model = els.model.value.trim();
    const target = (lastResult.corrected && lastResult.corrected.url) ? lastResult.corrected.url : (lastResult.urlFp.cleaned.startsWith('http') ? lastResult.urlFp.cleaned : 'https://' + lastResult.urlFp.cleaned);
    const targetModel = (lastResult.corrected && lastResult.corrected.model) || model;
    // validate against the provider actually being tested (the corrected target may follow the key, not the pasted URL)
    const provider = PM.fingerprint.fingerprintUrl(target).provider || lastResult.urlFp.provider || null;

    els.livetest.disabled = true;
    els.livetest.innerHTML = '<span class="spinner"></span>Testing against the real API…';
    const liveFindings = [];
    try {
      // 1. live model list (also refreshes the catalog for re-diagnosis)
      if (provider) {
        const ml = await PM.livetest.fetchModelList(provider, key);
        if (ml.models) {
          liveCatalog = ml.models; liveCatalogProvider = provider.id;
          const mc = PM.modelcheck.checkModel(targetModel, provider, ml.models);
          for (const f of mc.findings) if (f.code !== 'model-ok') liveFindings.push(f); else liveFindings.push({ ...f, title: f.title + ' (verified against the live model list)' });
        }
        // 2. OpenRouter key info
        const ki = await PM.livetest.fetchKeyInfo(provider, key);
        if (ki) {
          liveFindings.push({
            severity: 'info', code: 'live-keyinfo',
            title: ki.isFreeTier ? 'OpenRouter says: free-tier account' : 'OpenRouter key is active',
            detail: `Usage so far: $${Number(ki.usage || 0).toFixed(2)}${ki.limit != null ? ` · limit $${ki.limit}` : ''}${ki.isFreeTier ? ' · Free tier caps :free models at 50 requests/day.' : ''}`,
            fix: null
          });
        }
      }
      // 3. the real end-to-end chat call
      const r = await PM.livetest.liveChatTest({ url: target, key, model: targetModel, provider });
      liveFindings.push(...r.findings);
      if (target !== (els.url.value || '').trim() && lastResult.corrected) {
        liveFindings.push({
          severity: 'info', code: 'live-tested-corrected',
          title: 'Tested the corrected URL, not the one you pasted',
          detail: `The live test used ${target} (the corrected endpoint) with model "${targetModel}".`,
          fix: null
        });
      }
    } catch (e) {
      liveFindings.push({ severity: 'blocker', code: 'live-crashed', title: 'Live test failed unexpectedly', detail: String(e && e.message || e), fix: null });
    }
    els.livetest.disabled = false;
    els.livetest.textContent = 'Run live test again';
    const block = document.createElement('div');
    block.innerHTML = `<h3 style="margin:16px 0 8px;font-size:1rem">Live test</h3>` + PM.report.sortFindings(liveFindings).map(findingHtml).join('');
    els.results.appendChild(block);
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function runDecode() {
    const text = els.errText.value.trim();
    if (!text) { els.errResults.innerHTML = ''; return; }
    const rules = PM.errordecode.decodeError(text);
    if (!rules.length) {
      els.errResults.innerHTML = `<div class="finding info">
        <div class="f-title"><span class="sev info">INFO</span> No known pattern matched</div>
        <div class="f-detail">ProxyMedic did not recognise this error. Try the full diagnosis tab with your URL, key and model; the live test usually reveals the real cause.</div>
      </div>`;
      return;
    }
    els.errResults.innerHTML = rules.map(rule => findingHtml({
      severity: rule.code === 'err-think-tags' || rule.code === 'err-403-moderation' ? 'info' : 'blocker',
      title: rule.title, detail: rule.cause, fix: rule.fix
    })).join('');
  }

  async function share() {
    if (!lastResult) return;
    const text = PM.report.shareText(lastResult, { url: els.url.value.trim(), model: els.model.value.trim() });
    try {
      await navigator.clipboard.writeText(text);
      els.share.textContent = 'Copied! Paste it into your help thread';
      setTimeout(() => { els.share.textContent = 'Copy diagnosis for a help thread (key redacted)'; }, 2200);
    } catch { /* clipboard denied */ }
  }

  // Quick-start presets: fill a known-good URL + model, user only adds the key.
  document.querySelectorAll('.chip[data-preset]').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = PM.providers.PROVIDERS[chip.dataset.preset];
      if (!p) return;
      els.url.value = p.chatUrl;
      els.model.value = p.presetModel || p.modelSnapshot[0];
      let note = document.querySelector('.preset-note');
      if (!note) {
        note = document.createElement('div');
        note.className = 'preset-note';
        chip.closest('.presets').appendChild(note);
      }
      note.innerHTML = `URL and model filled for ${esc(p.name)}. Now paste your key from <a href="${esc(p.keysPage)}" target="_blank" rel="noopener">${esc(p.keysPage.replace('https://', ''))}</a> and hit Diagnose.`;
      els.key.focus();
    });
  });

  els.diagnose.addEventListener('click', runDiagnosis);
  els.livetest.addEventListener('click', runLiveTest);
  els.decode.addEventListener('click', runDecode);
  els.share.addEventListener('click', share);
  [els.url, els.key, els.model].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') runDiagnosis(); }));
})();
