#!/usr/bin/env node
// mcp-plug CLI: prints how to add an MCP server to each client.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, badges, pick, VERSION } from './core.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(join(HERE, '..', 'dist', 'registry.json'), 'utf8'));

const HELP = 'mcp-plug ' + VERSION + ` — how to add an MCP server to every AI client

Usage
  mcp-plug <url> [options]                 remote server (Streamable HTTP)
  mcp-plug [options] -- <command> [args]   local server (stdio)
  mcp-plug badges <url> [options]          README badges (Markdown)
  mcp-plug embed <url> [options]           HTML snippet for your install page
  mcp-plug clients [--json]                every client in the registry

Options
  --name <name>        server name (default: from the URL host)
  --client <a,b>       only these clients, in this order ("all" for every client)
  --header "K: V"      header the server needs (repeatable)
  --env K=V            environment variable for local servers (repeatable)
  --auth oauth         the server signs people in with OAuth
  --sse                legacy SSE server
  --lang pt|en         language (default: en, or pt when LANG starts with pt)
  --json               machine-readable output
  --html               with "badges": HTML instead of Markdown

Example
  npx github:pqgventures/mcp-plug https://example.com/mcp --name example --client cursor,codex
`;

function parse(argv) {
  const o = { headers: {}, env: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.rest = argv.slice(i + 1); break; }
    if (a === '--name') o.name = argv[++i];
    else if (a === '--client' || a === '--clients') o.clients = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--header') { const h = argv[++i]; const k = h.indexOf(':'); o.headers[h.slice(0, k).trim()] = h.slice(k + 1).trim(); }
    else if (a === '--env') { const e = argv[++i]; const k = e.indexOf('='); o.env[e.slice(0, k)] = e.slice(k + 1); }
    else if (a === '--auth') o.auth = argv[++i];
    else if (a === '--sse') o.sse = true;
    else if (a === '--lang') o.lang = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--html') o.html = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else o.positional.push(a);
  }
  return o;
}

function server(o, url) {
  const s = { name: o.name, headers: o.headers, env: o.env, auth: o.auth };
  if (url) { s.url = url; if (o.sse) s.transport = 'sse'; if (!s.name) s.name = new URL(url).hostname.split('.').filter((p) => p !== 'www' && p !== 'mcp')[0]; }
  if (o.rest && o.rest.length) { s.command = o.rest[0]; s.args = o.rest.slice(1); if (!s.name) s.name = (o.rest.find((a) => !a.startsWith('-') && a !== 'npx' && a !== 'uvx') || 'server').replace(/^@[^/]+\//, '').replace(/[^a-z0-9-]/gi, '-'); }
  return s;
}

// "~/.x (Windows: %USERPROFILE%\\.x)" instead of repeating the same path per OS.
function paths(file) {
  const groups = new Map();
  for (const [os, p] of Object.entries(file)) { if (!groups.has(p)) groups.set(p, []); groups.get(p).push(os); }
  const label = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  const list = [...groups.entries()];
  if (list.length === 1) return list[0][0];
  return list.map(([p, oss]) => (oss.length > 1 ? p : p + ' (' + oss.map((o) => label[o] || o).join(', ') + ')')).join('  |  ');
}
const plain = (s) => (s || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`/g, '');

const bold = (s) => (process.stdout.isTTY ? '\x1b[1m' + s + '\x1b[0m' : s);
const dim = (s) => (process.stdout.isTTY ? '\x1b[2m' + s + '\x1b[0m' : s);

function main() {
  const o = parse(process.argv.slice(2));
  const lang = o.lang || (/^pt/i.test(process.env.LANG || '') ? 'pt' : 'en');
  if (o.version) return console.log(VERSION);
  const cmd = ['badges', 'embed', 'clients'].includes(o.positional[0]) ? o.positional.shift() : 'plan';
  if (o.help || (cmd === 'plan' && !o.positional[0] && !o.rest)) return console.log(HELP);
  const clients = o.clients && o.clients[0] === 'all' ? registry.order : o.clients || registry.defaults;

  if (cmd === 'clients') {
    if (o.json) return console.log(JSON.stringify(registry.clients.map(({ id, name, vendor, category, transports, auth, verified }) => ({ id, name, vendor, category, transports, auth, verified })), null, 2));
    for (const id of registry.order) {
      const c = registry.clients.find((x) => x.id === id);
      const t = [c.transports.http ? 'http' : null, c.transports.stdio ? 'stdio' : null].filter(Boolean).join('+') || '—';
      const kinds = [...new Set(c.methods.map((m) => m.kind))].join(',') || 'none';
      console.log(c.id.padEnd(16) + c.name.padEnd(26) + t.padEnd(12) + (c.auth.oauth ? 'oauth ' : '      ') + kinds.padEnd(26) + dim(c.verified));
    }
    return;
  }

  const s = server(o, o.positional[0]);
  if (cmd === 'badges') {
    const b = badges(registry, s, { clients, lang });
    if (o.json) return console.log(JSON.stringify(b, null, 2));
    return console.log(b.map((x) => (o.html ? x.html : x.markdown)).join(o.html ? '\n' : ' '));
  }
  if (cmd === 'embed') {
    const attrs = [['name', s.name], ['url', s.url], ['command', s.command], ['args', s.args && s.args.length ? JSON.stringify(s.args) : null],
      ['headers', Object.keys(s.headers).length ? JSON.stringify(s.headers) : null], ['auth', s.auth], ['lang', o.lang], ['clients', o.clients && o.clients.join(',')]]
      .filter(([, v]) => v).map(([k, v]) => ' ' + k + '="' + String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"').join('');
    return console.log('<script type="module" src="https://pqgventures.github.io/mcp-plug/mcp-plug.js"></script>\n<mcp-plug' + attrs + '></mcp-plug>');
  }
  const items = plan(registry, s, { clients, lang });
  if (o.json) return console.log(JSON.stringify(items, null, 2));
  for (const c of items) {
    console.log('\n' + bold('■ ' + c.name) + (c.unsupported ? dim('  (' + c.unsupported + ')') : ''));
    for (const a of c.actions) {
      if (a.kind === 'link') console.log('  ' + a.label + ':\n    ' + a.href);
      else if (a.kind === 'command' || a.kind === 'config') {
        const f = a.file ? paths(a.file) : '';
        console.log('  ' + a.label + (f ? dim('  → ' + f) : '') + '\n' + a.text.split('\n').map((l) => '    ' + l).join('\n'));
      } else if (a.kind === 'steps') {
        if (s.url && !c.actions.some((x) => x.kind === 'command' || x.kind === 'config') && a === c.actions.find((x) => x.kind === 'steps')) console.log('  URL: ' + s.url);
        a.steps.forEach((st, i) => console.log('  ' + (i + 1) + '. ' + plain(st)));
      }
      if (a.note) console.log(dim('  ' + plain(a.note)));
    }
  }
  console.log('');
}

main();

