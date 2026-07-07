// URL shape validation and repair for Janitor AI's Proxy URL field.
// Janitor's own help docs require the FULL endpoint ending in /chat/completions.
import { fingerprintUrl } from './fingerprint.js';

// Analyse a proxy URL. Returns { findings: [], corrected: string|null, urlFp }
export function checkUrl(rawUrl) {
  const findings = [];
  const urlFp = fingerprintUrl(rawUrl);
  const raw = urlFp.cleaned;

  if (!raw) {
    findings.push({
      severity: 'blocker', code: 'url-empty', title: 'No proxy URL',
      detail: 'The Proxy URL field is empty.',
      fix: 'Paste your provider\'s full chat completions URL, for example https://openrouter.ai/api/v1/chat/completions.'
    });
    return { findings, corrected: null, urlFp };
  }

  if (urlFp.notes.includes('whitespace') || urlFp.notes.includes('invisible-chars')) {
    findings.push({
      severity: 'warning', code: 'url-hidden-chars', title: 'Hidden characters in the URL',
      detail: 'The URL had leading/trailing spaces or invisible characters (a common mobile copy-paste bug). They were removed for this diagnosis, but Janitor will use them exactly as pasted.',
      fix: 'Delete the URL in Janitor and re-paste it with no spaces before or after.'
    });
  }

  if (urlFp.kind === 'invalid') {
    findings.push({
      severity: 'blocker', code: 'url-invalid', title: 'Not a valid URL',
      detail: `"${raw}" cannot be parsed as a web address.`,
      fix: 'Copy the endpoint URL again from your provider\'s docs. It should start with https:// and end with /chat/completions.'
    });
    return { findings, corrected: null, urlFp };
  }

  if (urlFp.kind === 'website') {
    findings.push({
      severity: 'blocker', code: 'url-website', title: 'That URL is a website, not an API',
      detail: urlFp.websiteMessage,
      fix: 'Replace the Proxy URL with the API endpoint. See the corrected config below if a provider was detected from your key.'
    });
    return { findings, corrected: null, urlFp };
  }

  const parsed = urlFp.parsed;
  let corrected = null;

  if (parsed.protocol === 'http:') {
    findings.push({
      severity: 'blocker', code: 'url-http', title: 'URL uses http:// instead of https://',
      detail: 'Janitor AI runs on https, so browsers block plain-http proxy calls as mixed content.',
      fix: 'Change http:// to https:// in the Proxy URL.'
    });
  }

  if (urlFp.kind === 'provider') {
    const p = urlFp.provider;
    const want = new URL(p.chatUrl);
    const gotPath = parsed.pathname.replace(/\/+$/, '');
    const wantPath = want.pathname;

    const altOk = (p.altPaths || []).includes(gotPath);
    if (gotPath === wantPath || altOk) {
      findings.push({
        severity: 'ok', code: 'url-ok', title: `URL is the correct ${p.name} endpoint`,
        detail: p.chatUrl, fix: null
      });
      corrected = p.chatUrl;
    } else {
      corrected = p.chatUrl;
      const gotLower = gotPath.toLowerCase();
      if (gotPath === '' || gotPath === '/v1' || gotPath === '/api/v1' || gotPath === '/api' || gotPath === '/openai/v1' || gotPath === '/v1beta/openai') {
        findings.push({
          severity: 'blocker', code: 'url-base-only', title: 'URL is missing the /chat/completions ending',
          detail: `You pasted the base URL (${raw}). Janitor AI needs the full endpoint.`,
          fix: `Use ${p.chatUrl}`
        });
      } else if (gotLower.endsWith('/chat/completion')) {
        findings.push({
          severity: 'blocker', code: 'url-typo-completion', title: 'Typo: "completion" should be "completions"',
          detail: `The path ends in /chat/completion (singular). The endpoint is plural.`,
          fix: `Use ${p.chatUrl}`
        });
      } else if (gotLower.endsWith('/chat/completions') ) {
        findings.push({
          severity: 'blocker', code: 'url-wrong-path', title: `Right ending, wrong path for ${p.name}`,
          detail: `${p.name}'s endpoint is ${want.pathname}, but your URL has ${gotPath}.`,
          fix: `Use ${p.chatUrl}`
        });
      } else if (gotLower.includes('/models')) {
        findings.push({
          severity: 'blocker', code: 'url-models-endpoint', title: 'That is the model-list endpoint, not the chat endpoint',
          detail: 'The /models URL only lists models. Chat requests go to /chat/completions.',
          fix: `Use ${p.chatUrl}`
        });
      } else {
        findings.push({
          severity: 'blocker', code: 'url-unrecognised-path', title: `Unrecognised path on ${p.name}`,
          detail: `${p.name} was detected from the domain, but the path ${gotPath || '/'} is not its chat endpoint.`,
          fix: `Use ${p.chatUrl}`
        });
      }
    }
    if (p.notCompletionsShaped) {
      findings.push({
        severity: 'blocker', code: 'url-not-openai-compatible', title: `${p.name} is not OpenAI-compatible`,
        detail: p.notes,
        fix: 'Create a free OpenRouter account, add your key there, and use https://openrouter.ai/api/v1/chat/completions with an OpenRouter key instead.'
      });
      corrected = null;
    }
  } else if (urlFp.kind === 'reverse-proxy') {
    const endsRight = /\/chat\/completions\/?$/i.test(parsed.pathname);
    findings.push({
      severity: endsRight ? 'info' : 'warning',
      code: 'url-reverse-proxy',
      title: 'This looks like a community reverse proxy',
      detail: `${urlFp.host} is not a first-party AI provider. ProxyMedic can still live-test it, but model names, keys and uptime depend entirely on whoever runs the proxy.` + (endsRight ? '' : ' Its path also does not end in /chat/completions, which most OpenAI-compatible proxies require.'),
      fix: endsRight ? null : 'If the proxy owner gave you a base URL, try adding /v1/chat/completions to the end.'
    });
    corrected = urlFp.cleaned;
  } else {
    const endsRight = /\/chat\/completions\/?$/i.test(parsed.pathname);
    findings.push({
      severity: endsRight ? 'info' : 'warning',
      code: 'url-unknown-host',
      title: 'Unknown API host',
      detail: `${urlFp.host} is not one of the providers ProxyMedic knows. That is fine if it is a smaller or self-hosted service.` + (endsRight ? '' : ' Note the path does not end in /chat/completions, which Janitor normally requires.'),
      fix: endsRight ? null : 'Check the provider\'s docs for the full "chat completions" endpoint URL.'
    });
    corrected = urlFp.cleaned;
  }

  return { findings, corrected, urlFp };
}
