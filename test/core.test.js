import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan, render, badges, splitArgs, shellQuote } from '../src/core.js';

const registry = JSON.parse(readFileSync(new URL('../dist/registry.json', import.meta.url), 'utf8'));
const all = registry.order;
const find = (items, id) => items.find((c) => (c.id || c.client) === id);
const action = (items, id, method) => find(items, id).actions.find((a) => a.method === method);
const b64json = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

const REMOTE = { name: 'example', url: 'https://example.com/mcp', auth: 'oauth' };
const HEADERS = { name: 'acme', url: 'https://api.acme.dev/mcp', headers: { Authorization: 'Bearer ${ACME_KEY}' } };
const LOCAL = { name: 'files', command: 'npx', args: ['-y', '@acme/files-mcp', '/Users/me/My Docs'], env: { ACME_TOKEN: 'abc' } };
const SSE = { name: 'legacy', url: 'https://legacy.example.com/sse', transport: 'sse' };

test('template engine: sections, filters, raw values', () => {
  assert.equal(render('{{#xs}}[{{.}}]{{/xs}}', { xs: [1, 2] }), '[1][2]');
  assert.equal(render('{{#h}}{{key}}={{value}};{{/h}}', { h: { a: 1, b: 2 } }), 'a=1;b=2;');
  assert.equal(render('{{^h}}none{{/h}}', { h: {} }), 'none');
  assert.equal(render('{{#h?}}has{{/h?}}', { h: { a: 1 } }), 'has');
  assert.equal(render('{{s|uri}}', { s: 'a b&c' }), 'a%20b%26c');
  assert.equal(shellQuote("it's"), "'it'\\''s'");
  assert.deepEqual(splitArgs('npx -y "my pkg" x'), ['npx', '-y', 'my pkg', 'x']);
});

test('Cursor link carries only the inner server object, base64-encoded (official format)', () => {
  const a = action(plan(registry, REMOTE, { clients: ['cursor'] }), 'cursor', 'deeplink');
  const u = new URL(a.href);
  assert.equal(u.protocol, 'cursor:');
  assert.equal(u.searchParams.get('name'), 'example');
  assert.deepEqual(b64json(u.searchParams.get('config')), { url: 'https://example.com/mcp' });
  assert.ok(a.webHref.startsWith('https://cursor.com/install-mcp?name=example&config=eyJ1cmwiOiJodHRwczovL2V4YW1wbGUuY29tL21jcCJ9'));
  const l = action(plan(registry, LOCAL, { clients: ['cursor'] }), 'cursor', 'deeplink');
  assert.deepEqual(b64json(new URL(l.href).searchParams.get('config')), { command: 'npx', args: LOCAL.args, env: LOCAL.env });
});

test('VS Code link is name + typed config as URL-encoded JSON after the "?"', () => {
  const a = action(plan(registry, HEADERS, { clients: ['vscode'] }), 'vscode', 'deeplink');
  assert.ok(a.href.startsWith('vscode:mcp/install?'));
  const cfg = JSON.parse(decodeURIComponent(a.href.slice('vscode:mcp/install?'.length)));
  assert.deepEqual(cfg, { name: 'acme', type: 'http', url: HEADERS.url, headers: HEADERS.headers });
  const w = new URL(a.webHref);
  assert.equal(w.origin + w.pathname, 'https://vscode.dev/redirect/mcp/install');
  assert.deepEqual(JSON.parse(w.searchParams.get('config')), { type: 'http', url: HEADERS.url, headers: HEADERS.headers });
  const local = action(plan(registry, LOCAL, { clients: ['vscode'] }), 'vscode', 'config');
  assert.equal(JSON.parse(local.text).servers.files.type, 'stdio');
});

test('LM Studio link holds one server entry; Goose repeats arg=', () => {
  const lm = action(plan(registry, HEADERS, { clients: ['lm-studio'] }), 'lm-studio', 'deeplink');
  assert.deepEqual(b64json(new URL(lm.href).searchParams.get('config')), { url: HEADERS.url, headers: HEADERS.headers });
  const g = action(plan(registry, LOCAL, { clients: ['goose'] }), 'goose', 'deeplink-stdio');
  const u = new URL(g.href);
  assert.equal(u.searchParams.get('cmd'), 'npx');
  assert.deepEqual(u.searchParams.getAll('arg'), LOCAL.args);
});

test('Claude link pre-fills name and URL; header-only servers are reported as unsupported', () => {
  const a = action(plan(registry, REMOTE, { clients: ['claude-ai'] }), 'claude-ai', 'add-link');
  const u = new URL(a.href);
  assert.equal(u.searchParams.get('connectorUrl'), REMOTE.url);
  assert.equal(u.searchParams.get('modal'), 'add-custom-connector');
  const h = find(plan(registry, HEADERS, { clients: ['claude-ai'] }), 'claude-ai');
  assert.equal(h.actions.length, 0);
  assert.equal(h.unsupported, 'headers');
});

test('CLI commands: Claude Code, Codex, Gemini CLI', () => {
  const cc = action(plan(registry, HEADERS, { clients: ['claude-code'] }), 'claude-code', 'cli-http');
  assert.equal(cc.text, "claude mcp add --transport http --header 'Authorization: Bearer ${ACME_KEY}' --scope user acme https://api.acme.dev/mcp");
  const cx = action(plan(registry, REMOTE, { clients: ['codex'] }), 'codex', 'cli-http');
  assert.equal(cx.text, 'codex mcp add example --url https://example.com/mcp\ncodex mcp login example');
  const cl = action(plan(registry, LOCAL, { clients: ['codex'] }), 'codex', 'cli-stdio');
  assert.equal(cl.text, "codex mcp add files --env ACME_TOKEN=abc -- npx -y @acme/files-mcp '/Users/me/My Docs'");
  const gs = find(plan(registry, SSE, { clients: ['gemini-cli'] }), 'gemini-cli');
  assert.deepEqual(JSON.parse(gs.actions.find((a) => a.method === 'config').text).mcpServers.legacy, { url: SSE.url });
  const gh = find(plan(registry, REMOTE, { clients: ['gemini-cli'] }), 'gemini-cli');
  assert.deepEqual(JSON.parse(gh.actions.find((a) => a.method === 'config').text).mcpServers.example, { httpUrl: REMOTE.url });
});

test('stdio-only clients reach remote servers through mcp-remote', () => {
  const b = find(plan(registry, HEADERS, { clients: ['boltai'] }), 'boltai');
  assert.ok(b.actions.some((a) => a.bridged));
  const cfg = JSON.parse(b.actions.find((a) => a.kind === 'config' && a.bridged).text);
  assert.deepEqual(cfg.mcpServers.acme.args, ['-y', 'mcp-remote', HEADERS.url, '--header', 'Authorization:Bearer ${ACME_KEY}']);
});

test('every client renders cleanly for remote, header, local and SSE servers', () => {
  for (const [label, server] of Object.entries({ REMOTE, HEADERS, LOCAL, SSE })) {
    for (const lang of ['en', 'pt']) {
      for (const c of plan(registry, server, { clients: all, lang })) {
        for (const a of c.actions) {
          const where = label + '/' + lang + '/' + c.id + '/' + a.method;
          const blob = JSON.stringify(a);
          assert.ok(!/undefined|\[object Object\]|\{\{\s*[#^\/]?[A-Za-z.]/.test(blob), where + ': leftover placeholder in ' + blob);
          assert.ok(a.label, where + ': missing label');
          if (a.kind === 'link') { assert.doesNotThrow(() => new URL(a.href), where); if (a.webHref) assert.match(a.webHref, /^https:\/\//, where); }
          if (a.format === 'json') assert.doesNotThrow(() => JSON.parse(a.text), where + ': invalid JSON\n' + a.text);
          if (a.kind === 'steps') assert.ok(a.steps.length && a.steps.every(Boolean), where);
        }
        if (!c.actions.length) assert.ok(c.unsupported, label + '/' + c.id + ': no actions and no reason');
      }
    }
  }
});

test('badges route app schemes through the Pages redirect', () => {
  const b = badges(registry, REMOTE, { clients: ['cursor', 'goose', 'claude-ai'] });
  assert.ok(find(b, 'cursor').href.startsWith('https://cursor.com/install-mcp'));
  assert.ok(find(b, 'goose').href.startsWith('https://pqgventures.github.io/mcp-plug/open.html?to=goose%3A%2F%2F'));
});

