// mcp-plug core: turns a server description + the client registry into install actions.
// Runs unchanged in browsers and Node (no dependencies).

export const VERSION = '0.2.1';

const SAFE_SHELL = /^[A-Za-z0-9_\/.:=@%+,-]+$/;

export function shellQuote(v) {
  if (Array.isArray(v)) return v.map(shellQuote).join(' ');
  const s = String(v ?? '');
  if (s !== '' && SAFE_SHELL.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function utf8b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function tomlValue(v) {
  if (Array.isArray(v)) return '[' + v.map(tomlValue).join(', ') + ']';
  if (v && typeof v === 'object') {
    return '{ ' + Object.entries(v).map(([k, x]) => tomlKey(k) + ' = ' + tomlValue(x)).join(', ') + ' }';
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v ?? ''));
}

function tomlKey(k) {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
}

function yamlScalar(v) {
  const s = String(v ?? '');
  return /^[A-Za-z0-9_\/.@-][A-Za-z0-9_\/.:@ -]*$/.test(s) && !/:\s|\s$/.test(s) ? s : JSON.stringify(s);
}

export const FILTERS = {
  json: (v) => JSON.stringify(v),
  pretty: (v) => JSON.stringify(v, null, 2),
  base64: (v) => utf8b64(typeof v === 'string' ? v : JSON.stringify(v)),
  uri: (v) => encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v)),
  shell: (v) => shellQuote(v),
  toml: (v) => tomlValue(v),
  tomlkey: (v) => tomlKey(String(v)),
  yaml: (v) => yamlScalar(v),
  lower: (v) => String(v).toLowerCase(),
  upper: (v) => String(v).toUpperCase(),
  slug: (v) => String(v).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''),
};

function lookup(ctx, path) {
  if (path === '.') return ctx['.'];
  let cur = ctx;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function applyFilters(value, filters) {
  let v = value;
  for (const f of filters) {
    const fn = FILTERS[f];
    if (!fn) throw new Error('mcp-plug: unknown filter "' + f + '"');
    v = fn(v);
  }
  return v;
}

function isEmpty(v) {
  if (v == null || v === false || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

// Mustache subset:
//   {{path|filter|filter}}   value (objects become JSON unless filtered)
//   {{#path}}...{{/path}}    arrays: once per item ({{.}}); objects: once per entry ({{key}} {{value}});
//                            other truthy values: once
//   {{#path?}}...{{/path?}}  once if not empty
//   {{^path}}...{{/path}}    once if empty
const TOKEN = /\{\{\s*([#^\/]?)\s*([^}]+?)\s*\}\}/g;

function parse(tpl) {
  const root = { children: [] };
  const stack = [root];
  let last = 0;
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(tpl))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push(tpl.slice(last, m.index));
    last = TOKEN.lastIndex;
    const [, sigil, body] = m;
    if (sigil === '#' || sigil === '^') {
      const node = { type: sigil, name: body, children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (sigil === '/') {
      const open = stack.pop();
      if (!open || open.name !== body) throw new Error('mcp-plug: unbalanced section "' + body + '"');
    } else {
      const [path, ...filters] = body.split('|').map((s) => s.trim());
      top.children.push({ type: 'var', path, filters });
    }
  }
  if (stack.length !== 1) throw new Error('mcp-plug: unclosed section');
  if (last < tpl.length) root.children.push(tpl.slice(last));
  return root;
}

function renderNodes(nodes, ctx) {
  let out = '';
  for (const n of nodes) {
    if (typeof n === 'string') { out += n; continue; }
    if (n.type === 'var') {
      let v = applyFilters(lookup(ctx, n.path), n.filters);
      if (v == null) v = '';
      else if (typeof v === 'object') v = JSON.stringify(v);
      out += v;
      continue;
    }
    const once = n.name.endsWith('?');
    const name = once ? n.name.slice(0, -1) : n.name;
    const v = lookup(ctx, name);
    if (n.type === '^') { if (isEmpty(v)) out += renderNodes(n.children, ctx); continue; }
    if (isEmpty(v)) continue;
    if (once) { out += renderNodes(n.children, ctx); continue; }
    if (Array.isArray(v)) {
      v.forEach((item, i) => { out += renderNodes(n.children, { ...ctx, '.': item, index: i, first: i === 0, last: i === v.length - 1 }); });
    } else if (typeof v === 'object') {
      const entries = Object.entries(v);
      entries.forEach(([key, value], i) => { out += renderNodes(n.children, { ...ctx, '.': value, key, value, index: i, first: i === 0, last: i === entries.length - 1 }); });
    } else {
      out += renderNodes(n.children, ctx);
    }
  }
  return out;
}

const cache = new Map();
export function render(tpl, ctx) {
  if (tpl == null) return undefined;
  let tree = cache.get(tpl);
  if (!tree) { tree = parse(tpl); cache.set(tpl, tree); }
  return renderNodes(tree.children, ctx);
}

const RAW = /^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/;

// Renders a JSON template: "{{x}}" alone keeps the raw value (arrays, objects); empty values are dropped.
export function renderValue(tpl, ctx) {
  if (typeof tpl === 'string') {
    const m = tpl.match(RAW);
    if (m) { const v = lookup(ctx, m[1]); return isEmpty(v) ? undefined : v; }
    const out = render(tpl, ctx);
    return out === '' ? undefined : out;
  }
  if (Array.isArray(tpl)) return tpl.map((x) => renderValue(x, ctx)).filter((x) => x !== undefined);
  if (tpl && typeof tpl === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(tpl)) {
      const v = renderValue(x, ctx);
      if (v === undefined) continue;
      if (k === '...' && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, v); // spread
      else out[render(k, ctx)] = v;
    }
    return out;
  }
  return tpl;
}

export function pick(text, lang) {
  if (text == null) return undefined;
  if (typeof text === 'string') return text;
  return text[lang] ?? text.en ?? Object.values(text)[0];
}

// Normalises what the integrator passes in.
export function normalizeServer(input) {
  const s = { ...input };
  if (!s.name) throw new Error('mcp-plug: "name" is required');
  s.name = String(s.name).trim();
  s.displayName = s.displayName || s.name;
  if (typeof s.args === 'string') s.args = splitArgs(s.args);
  if (typeof s.command === 'string' && !s.args && /\s/.test(s.command.trim())) {
    const parts = splitArgs(s.command);
    s.command = parts.shift();
    s.args = parts;
  }
  s.args = s.args || [];
  s.headers = s.headers || {};
  s.env = s.env || {};
  if (s.url) s.transport = s.transport === 'sse' ? 'sse' : 'http';
  if (!s.url && !s.command) throw new Error('mcp-plug: pass "url" (remote) or "command" (local)');
  s.auth = s.auth || (Object.keys(s.headers).length ? 'headers' : 'none');
  return s;
}

export function splitArgs(line) {
  const out = [];
  let cur = '', q = null, has = false;
  for (const ch of String(line)) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (has || cur) { out.push(cur); cur = ''; has = false; } continue; }
    cur += ch;
  }
  if (has || cur) out.push(cur);
  return out;
}

// The bridge that lets stdio-only clients reach a remote server.
export function remoteBridge(server) {
  const args = ['-y', 'mcp-remote', server.url];
  for (const [k, v] of Object.entries(server.headers)) args.push('--header', k + ':' + v);
  return { command: 'npx', args };
}

function baseContext(server, lang) {
  const headerList = Object.entries(server.headers).map(([key, value]) => ({ key, value }));
  const envList = Object.entries(server.env).map(([key, value]) => ({ key, value }));
  return {
    ...server,
    lang,
    remote: !!server.url,
    local: !!server.command,
    hasHeaders: headerList.length > 0,
    headerLines: headerList.map((h) => h.key + ': ' + h.value),
    envPairs: envList.map((e) => e.key + '=' + e.value),
    hasEnv: envList.length > 0,
    headerList,
    envList,
    oauth: server.auth === 'oauth',
    sse: server.transport === 'sse',
    // Shapes that most clients share.
    stdioEntry: server.command ? { command: server.command, args: server.args.length ? server.args : undefined, env: envList.length ? server.env : undefined } : undefined,
    httpEntry: server.url ? { url: server.url, headers: headerList.length ? server.headers : undefined } : undefined,
  };
}

function methodFits(method, server, mode) {
  const t = method.transport || 'both';
  if (mode === 'remote' && !(t === 'http' || t === 'both')) return false;
  if (mode === 'local' && !(t === 'stdio' || t === 'both')) return false;
  if (mode === 'remote' && server.transport === 'sse' && method.sse === false) return false;
  if (mode === 'remote' && Object.keys(server.headers).length && method.headers === false) return false;
  if (mode === 'remote' && server.auth === 'oauth' && method.oauth === false) return false;
  return true;
}

function renderMethod(client, method, ctx, lang, extra) {
  const local = { ...ctx, client: client.id, mode: extra.mode, isRemote: extra.mode === 'remote' };
  // "entry" is the inner server object most clients share: { url, headers } or { command, args, env }.
  local.entry = extra.mode === 'remote' ? ctx.httpEntry : ctx.stdioEntry;
  local.remoteEntry = extra.mode === 'remote' ? ctx.httpEntry : undefined;
  local.localEntry = extra.mode === 'local' ? ctx.stdioEntry : undefined;
  local.commandArray = extra.mode === 'local' ? [ctx.command, ...ctx.args] : undefined;
  local.envLocal = extra.mode === 'local' && ctx.hasEnv ? ctx.env : undefined;
  for (const [k, tpl] of Object.entries(method.vars || {})) local[k] = renderValue(tpl, local);
  const file = method.file && Object.fromEntries(Object.entries(method.file).map(([os, p]) => [os, render(p, local)]));
  return {
    client: client.id,
    method: method.id,
    kind: method.kind,
    mode: extra.mode,
    bridged: !!extra.bridged,
    label: render(pick(method.label, lang), local),
    href: method.kind === 'link' ? render(method.template, local) : undefined,
    webHref: method.kind === 'link' && method.webTemplate ? render(method.webTemplate, local) : undefined,
    text: method.kind === 'command' || method.kind === 'config' ? render(method.template, local).replace(/\s+$/, '') : undefined,
    format: method.format,
    file,
    steps: (method.steps || []).map((s) => render(pick(s, lang), local)),
    note: render(pick(method.note, lang), local) || undefined,
    primary: !!method.primary,
    oneClick: !!method.oneClick,
    short: render(pick(method.short, lang), local) || undefined,
  };
}

// Returns, for each client, what to show: actions (links, commands, configs, steps) or why it can't connect.
export function plan(registry, input, opts = {}) {
  const lang = opts.lang || 'en';
  const server = normalizeServer(input);
  const wanted = opts.clients && opts.clients.length ? opts.clients : registry.order || registry.clients.map((c) => c.id);
  const byId = new Map(registry.clients.map((c) => [c.id, c]));
  const exclude = new Set(opts.exclude || []);
  const out = [];
  for (const id of wanted) {
    const client = byId.get(id);
    if (!client || exclude.has(id)) continue;
    const ctx = baseContext(server, lang);
    let actions = [];
    const modes = [];
    if (server.url) modes.push('remote');
    if (server.command) modes.push('local');
    for (const mode of modes) {
      for (const m of client.methods) if (methodFits(m, server, mode)) actions.push(renderMethod(client, m, ctx, lang, { mode }));
      if (actions.length) break; // prefer the remote server when both exist
    }
    let unsupported;
    // Bridge remote servers into clients that can't (or may not) connect to them directly.
    const weakRemote = client.transports && client.transports.http !== true;
    if ((!actions.length || weakRemote) && server.url && opts.bridge !== false && client.transports && client.transports.stdio) {
      const bridged = normalizeServer({ name: server.name, displayName: server.displayName, ...remoteBridge(server) });
      const bctx = baseContext(bridged, lang);
      for (const m of client.methods) if (methodFits(m, bridged, 'local')) actions.push(renderMethod(client, m, bctx, lang, { mode: 'local', bridged: true }));
    }
    if (!actions.length) {
      const reasons = [];
      if (server.url && client.transports && client.transports.http === false) reasons.push('no-remote');
      if (server.command && client.transports && client.transports.stdio === false) reasons.push('no-local');
      if (Object.keys(server.headers).length) reasons.push('headers');
      if (!client.methods.length) reasons.push('no-custom');
      unsupported = reasons[0] || 'unsupported';
    }
    out.push({
      id: client.id,
      name: client.name,
      vendor: client.vendor,
      category: client.category,
      openUrl: client.openUrl ? render(client.openUrl, ctx) : undefined,
      docs: client.docs,
      plans: pick(client.plans, lang),
      limits: (client.limits || []).map((l) => pick(l, lang)),
      verified: client.verified,
      listing: opts.listings && opts.listings[client.id],
      actions,
      unsupported,
    });
  }
  return out;
}


export const PAGES = 'https://pqgventures.github.io/mcp-plug';

// README badges. App schemes (cursor://, vscode:, ...) go through PAGES/open.html because GitHub strips them.
export function badges(registry, input, opts = {}) {
  const base = opts.base || PAGES;
  const items = plan(registry, input, { ...opts, bridge: false });
  const out = [];
  for (const c of items) {
    const link = c.actions.find((a) => a.kind === 'link');
    if (!link) continue;
    const web = link.webHref || link.href;
    const href = /^https:/i.test(web) ? web : base + '/open.html?to=' + encodeURIComponent(web);
    const img = base + '/badges/' + c.id + '.svg';
    const alt = (opts.lang === 'pt' ? 'Adicionar ao ' : 'Add to ') + c.name;
    out.push({ client: c.id, name: c.name, href, img, alt,
      markdown: '[![' + alt + '](' + img + ')](' + href + ')',
      html: '<a href="' + href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"><img src="' + img + '" alt="' + alt + '" height="28"></a>' });
  }
  return out;
}

