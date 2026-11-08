#!/usr/bin/env node
// Checks that every documented URL in the registry still answers, and that app-scheme links still parse.
// Usage: node scripts/check-links.mjs [--json report.json]
import { writeFileSync } from 'node:fs';
import { loadRegistry } from './build.mjs';
import { plan } from '../src/core.js';

const registry = loadRegistry();
const urls = new Map();
const add = (url, where) => { if (!/^https?:\/\//.test(url) || url.includes('{{')) return; if (!urls.has(url)) urls.set(url, []); urls.get(url).push(where); };
for (const c of registry.clients) {
  add(c.homepage, c.id + ' homepage');
  if (c.docs) add(c.docs, c.id + ' docs');
  if (c.openUrl) add(c.openUrl, c.id + ' openUrl');
  for (const s of c.sources) add(s.url, c.id + ' source');
}
// Sample install links whose https form we can request (redirectors like cursor.com/install-mcp, vscode.dev/redirect).
const sample = { name: 'example', url: 'https://example.com/mcp' };
for (const c of plan(registry, sample, { clients: registry.order })) {
  for (const a of c.actions) if (a.kind === 'link') { if (a.webHref) add(a.webHref, c.id + ' ' + a.method + ' (web link)'); else add(a.href, c.id + ' ' + a.method); }
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 mcp-plug-link-check';
async function probe(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(20000) });
      const loc = r.headers.get('location') || '';
      if (r.status >= 300 && r.status < 400) {
        // A redirect to an app scheme means the redirector works.
        if (loc && !/^https?:/i.test(loc) && !loc.startsWith('/')) return { status: r.status, ok: true, note: 'redirects to app: ' + loc.split('?')[0] };
        const next = new URL(loc, url).href;
        const r2 = await fetch(next, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
        return classify(r2.status, 'via ' + next.split('?')[0]);
      }
      return classify(r.status);
    } catch (e) {
      const code = String(e.cause?.code || e.name || e);
      // Google answers with headers larger than Node's limit: the host is up.
      if (code === 'UND_ERR_HEADERS_OVERFLOW') return { status: 200, ok: true, warn: true, note: 'oversized headers, host is up' };
      if (attempt === 1) return { status: 0, ok: false, note: code };
    }
  }
}
function classify(status, note) {
  if (status >= 200 && status < 400) return { status, ok: true, note };
  if ([401, 403, 405, 429, 999].includes(status)) return { status, ok: true, warn: true, note: (note ? note + '; ' : '') + 'blocked for bots, check by hand' };
  return { status, ok: false, note };
}

const queue = [...urls.entries()];
const results = [];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const [url, where] = queue.shift();
    results.push({ url, where, ...(await probe(url)) });
  }
}));
results.sort((a, b) => Number(a.ok) - Number(b.ok) || a.url.localeCompare(b.url));
const broken = results.filter((r) => !r.ok);
const warned = results.filter((r) => r.warn);
for (const r of broken) console.log('✗ ' + r.status + ' ' + r.url + '  [' + r.where.join(', ') + ']' + (r.note ? '  ' + r.note : ''));
for (const r of warned) console.log('! ' + r.status + ' ' + r.url + '  [' + r.where.join(', ') + ']');
console.log(results.length + ' URLs: ' + (results.length - broken.length) + ' ok (' + warned.length + ' blocked for bots), ' + broken.length + ' broken');
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ checked: new Date().toISOString(), results }, null, 2));
process.exit(broken.length ? 1 : 0);

