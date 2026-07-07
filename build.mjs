// Build one self-contained docs/index.html from index.dev.html + src modules + styles.css.
// Each ESM module becomes an IIFE assigned to PM.<name>; imports become destructuring from PM.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ORDER = ['providers', 'fingerprint', 'urlcheck', 'modelcheck', 'errordecode', 'livetest', 'report'];

function transformModule(name, code) {
  const exports = [];
  // collect exported names
  for (const m of code.matchAll(/^export (?:async )?function (\w+)/gm)) exports.push(m[1]);
  for (const m of code.matchAll(/^export const (\w+)/gm)) exports.push(m[1]);
  for (const m of code.matchAll(/^export \{ ([^}]+) \};?/gm)) {
    for (const n of m[1].split(',')) exports.push(n.trim());
  }
  // imports -> destructure from PM
  const importLines = [];
  code = code.replace(/^import \{([^}]+)\} from '\.\/(\w+)\.js';\s*$/gm, (_, names, mod) => {
    importLines.push(`const {${names}} = PM.${mod};`);
    return '';
  });
  // strip export keywords
  code = code
    .replace(/^export (?:async )?function /gm, m => m.replace('export ', ''))
    .replace(/^export const /gm, 'const ')
    .replace(/^export \{ [^}]+ \};?\s*$/gm, '');
  const uniq = [...new Set(exports)];
  return `PM.${name} = (function () {\n${importLines.join('\n')}\n${code}\nreturn { ${uniq.join(', ')} };\n})();`;
}

const css = readFileSync('styles.css', 'utf8');
let html = readFileSync('index.dev.html', 'utf8');

const bundled = ['"use strict";\nvar PM = {};\nif (typeof window !== "undefined") window.PM = PM;']
  .concat(ORDER.map(n => transformModule(n, readFileSync(`src/${n}.js`, 'utf8'))))
  .join('\n\n');

const appCode = readFileSync('src/app.js', 'utf8');

html = html.replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>\n${css}</style>`);
html = html.replace(/<script type="module">[\s\S]*?<\/script>/, () => `<script>\n${bundled}\n\n${appCode}\n</script>`);

mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', html);
console.log(`built docs/index.html (${(html.length / 1024).toFixed(1)} KB)`);
