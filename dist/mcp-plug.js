/*! mcp-plug v0.2.1 | MIT | https://github.com/pqgventures/mcp-plug */
// mcp-plug core: turns a server description + the client registry into install actions.
// Runs unchanged in browsers and Node (no dependencies).

const VERSION = '0.2.1';

const SAFE_SHELL = /^[A-Za-z0-9_\/.:=@%+,-]+$/;

function shellQuote(v) {
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

const FILTERS = {
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
function render(tpl, ctx) {
  if (tpl == null) return undefined;
  let tree = cache.get(tpl);
  if (!tree) { tree = parse(tpl); cache.set(tpl, tree); }
  return renderNodes(tree.children, ctx);
}

const RAW = /^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/;

// Renders a JSON template: "{{x}}" alone keeps the raw value (arrays, objects); empty values are dropped.
function renderValue(tpl, ctx) {
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

function pick(text, lang) {
  if (text == null) return undefined;
  if (typeof text === 'string') return text;
  return text[lang] ?? text.en ?? Object.values(text)[0];
}

// Normalises what the integrator passes in.
function normalizeServer(input) {
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

function splitArgs(line) {
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
function remoteBridge(server) {
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
function plan(registry, input, opts = {}) {
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


const PAGES = 'https://pqgventures.github.io/mcp-plug';

// README badges. App schemes (cursor://, vscode:, ...) go through PAGES/open.html because GitHub strips them.
function badges(registry, input, opts = {}) {
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


// Generated by scripts/build.mjs from registry/. Do not edit.
const REGISTRY = {"version":"0.2.1","updated":"2026-11-08","order":["claude-ai","chatgpt","claude-code","codex","cursor","vscode","gemini-cli","windsurf","claude-desktop","lm-studio"],"defaults":["claude-ai","chatgpt","claude-code","codex","cursor","vscode","gemini-cli","windsurf","claude-desktop","lm-studio"],"clients":[{"id":"amazon-q","name":"Amazon Q Developer","category":"ide","color":"#232f3e","homepage":"https://aws.amazon.com/q/developer/","docs":"https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/mcp-ide.html","transports":{"stdio":true,"http":true,"sse":null},"plans":{"en":"Not stated. AWS now points people to Kiro.","pt":"Não informado. A AWS agora indica o Kiro."},"limits":[{"en":"Being replaced by Kiro; new features land in Kiro first.","pt":"Está sendo substituído pelo Kiro; novidades chegam primeiro no Kiro."},{"en":"The workspace config wins over the global one.","pt":"A configuração do projeto vale mais que a global."}],"methods":[{"id":"config","kind":"config","transport":"both","primary":true,"label":{"en":"Add to mcp.json","pt":"Coloque no mcp.json"},"format":"json","vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.aws/amazonq/mcp.json","windows":"%USERPROFILE%\\.aws\\amazonq\\mcp.json","linux":"~/.aws/amazonq/mcp.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"augment","name":"Augment Code","category":"ide","color":"#141414","homepage":"https://www.augmentcode.com","docs":"https://docs.augmentcode.com/setup-augment/mcp","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Not stated.","pt":"Não informado."},"limits":[{"en":"The IDE extensions keep servers in their Settings panel (**+ Add remote MCP** or **Import from JSON**); the file below is the Auggie CLI's.","pt":"As extensões de IDE guardam os servidores no painel Settings (**+ Add remote MCP** ou **Import from JSON**); o arquivo abaixo é o do Auggie CLI."}],"methods":[{"id":"cli","kind":"command","transport":"both","primary":true,"label":{"en":"Auggie CLI","pt":"Auggie CLI"},"template":"auggie mcp add-json {{name|shell}} {{e|json|shell}}","vars":{"e":{"type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"}}},{"id":"config","kind":"config","transport":"both","label":{"en":"JSON to import, or ~/.augment/settings.json","pt":"JSON para importar, ou ~/.augment/settings.json"},"format":"json","vars":{"e":{"type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"},"cfg":{"mcpServers":{"{{name}}":"{{e}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.augment/settings.json","windows":"%USERPROFILE%\\.augment\\settings.json","linux":"~/.augment/settings.json"}}],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"boltai","name":"BoltAI","category":"desktop","color":"#f59e0b","homepage":"https://boltai.com","docs":"https://docs.boltai.com/docs/plugins/mcp-servers.md","transports":{"stdio":true,"http":null,"sse":true},"plans":{"en":"MCP since Mac app 1.34; plan not stated.","pt":"MCP desde o app de Mac 1.34; plano não informado."},"limits":[{"en":"The Mac app runs local servers; the iOS app only remote ones.","pt":"O app de Mac roda servidores locais; o de iOS, só remotos."},{"en":"The Mac config doesn't sync between devices.","pt":"A configuração do Mac não sincroniza entre aparelhos."}],"methods":[{"id":"config","kind":"config","transport":"stdio","primary":true,"label":{"en":"Settings → Plugins → + (Mac)","pt":"Settings → Plugins → + (Mac)"},"format":"json","vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","note":{"en":"Or **… → Import from Cursor / Claude** if you already set it up there.","pt":"Ou **… → Import from Cursor / Claude** se você já configurou lá."}},{"id":"ios","kind":"steps","transport":"http","label":{"en":"iPhone and iPad","pt":"iPhone e iPad"},"steps":[{"en":"**Settings → MCP Servers → Add**, enter **{{displayName}}** and the server URL above, tap **Add Server**.","pt":"**Settings → MCP Servers → Add**, coloque **{{displayName}}** e a URL do servidor acima, toque em **Add Server**."}]}],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"chatgpt","name":"ChatGPT","category":"chat","color":"#0f0f0f","homepage":"https://chatgpt.com","docs":"https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt","openUrl":"https://chatgpt.com/plugins","transports":{"stdio":false,"http":true,"sse":null},"plans":{"en":"Documented for Business, Enterprise and Edu on the web (admins and owners, or members with the plugin permission). Plus and Pro availability varies; check in your account.","pt":"Documentado para Business, Enterprise e Edu na web (admins e donos, ou membros com a permissão de plugins). Para Plus e Pro varia; confira na sua conta."},"limits":[{"en":"Remote only: a public HTTPS URL (or OpenAI's Secure MCP Tunnel for private servers).","pt":"Só remoto: uma URL HTTPS pública (ou o Secure MCP Tunnel da OpenAI para servidores privados)."},{"en":"After you change tools on the server, open the plugin and click **Refresh**.","pt":"Depois de mudar as ferramentas no servidor, abra o plugin e clique em **Atualizar**."},{"en":"Don't put a query string in the MCP URL: the connection fails (424).","pt":"Não coloque query string na URL do MCP: a conexão falha (424)."},{"en":"Listing in the public directory means a plugin ZIP (plugin.json + mcp.json), test prompts, a demo video and review; digital goods can't be sold inside ChatGPT.","pt":"Entrar no diretório público pede um ZIP de plugin (plugin.json + mcp.json), prompts de teste, vídeo de demonstração e revisão; não dá para vender bens digitais dentro do ChatGPT."}],"methods":[{"id":"open","kind":"link","transport":"http","headers":false,"primary":true,"label":{"en":"Open ChatGPT plugins","pt":"Abrir plugins do ChatGPT"},"template":"https://chatgpt.com/plugins"},{"id":"steps","kind":"steps","transport":"http","headers":false,"label":{"en":"Then","pt":"Depois"},"steps":[{"en":"Click **+** → **Add custom MCP server**.","pt":"Clique em **+** → **Adicionar servidor MCP personalizado**."},{"en":"Name: **{{displayName}}**. Connection: paste the server URL above.","pt":"Nome: **{{displayName}}**. Conexão: cole a URL do servidor acima."},{"en":"Authentication: **{{#oauth}}OAuth{{/oauth}}{{^oauth}}None{{/oauth}}**. Confirm the risk notice and click **Create**.","pt":"Autenticação: **{{#oauth}}OAuth{{/oauth}}{{^oauth}}Nenhuma{{/oauth}}**. Confirme o aviso e clique em **Criar**."},{"en":"In a new chat, type **@** and pick **{{displayName}}**.","pt":"Numa conversa nova, digite **@** e escolha **{{displayName}}**."}],"note":{"en":"On older accounts the path is **Settings → Apps → Advanced → Developer mode → Create**.","pt":"Em contas antigas o caminho é **Configurações → Apps → Avançado → Modo desenvolvedor → Criar**."}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"claude-ai","name":"Claude","category":"chat","color":"#d97757","homepage":"https://claude.ai","docs":"https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp","openUrl":"https://claude.ai/new?modal=add-custom-connector#customize/connectors","transports":{"stdio":false,"http":true,"sse":true},"plans":{"en":"All plans. Free allows one custom connector. On Team and Enterprise only owners add connectors; members then connect.","pt":"Todos os planos. O gratuito permite um conector personalizado. Em Team e Enterprise só os donos adicionam; os membros depois conectam."},"limits":[{"en":"Remote only: Claude connects from Anthropic's cloud, so the server must be reachable from the internet (no localhost or VPN).","pt":"Só remoto: o Claude conecta a partir da nuvem da Anthropic, então o servidor precisa estar acessível pela internet (sem localhost nem VPN)."},{"en":"A connector can't be edited. To change the URL or the sign-in, remove it and add it again.","pt":"Um conector não pode ser editado. Para mudar a URL ou o login, remova e adicione de novo."},{"en":"Connectors added on the web also show up in Claude Desktop, the mobile apps and Claude Code.","pt":"Conectores adicionados na web aparecem também no Claude Desktop, nos apps de celular e no Claude Code."},{"en":"Don't put a query string in the MCP URL (`/mcp?x=1`): connectors fail with a connection error.","pt":"Não coloque query string na URL do MCP (`/mcp?x=1`): o conector falha com erro de conexão."},{"en":"For servers that need an API key, a per-user URL with the key in the path (`/mcp/<key>`) works where headers don't.","pt":"Para servidores que pedem chave, uma URL por pessoa com a chave no caminho (`/mcp/<chave>`) funciona onde cabeçalhos não funcionam."}],"methods":[{"id":"add-link","kind":"link","transport":"http","headers":false,"primary":true,"label":{"en":"Add to Claude","pt":"Adicionar ao Claude"},"template":"https://claude.ai/new?modal=add-custom-connector&connectorName={{displayName|uri}}&connectorUrl={{url|uri}}#customize/connectors","note":{"en":"Opens Claude's Add custom connector window with the name and URL filled in. Click **Add**, then **Connect**.","pt":"Abre a janela Adicionar conector personalizado do Claude com nome e URL preenchidos. Clique em **Adicionar** e depois em **Conectar**."},"oneClick":true,"short":{"en":"Click **Add**, then **Connect**.","pt":"Clique em **Adicionar** e depois em **Conectar**."}},{"id":"steps","kind":"steps","transport":"http","headers":false,"label":{"en":"Or by hand","pt":"Ou à mão"},"steps":[{"en":"In Claude, open **Customize → Connectors** and click **+ → Add custom connector**.","pt":"No Claude, abra **Personalizar → Conectores** e clique em **+ → Adicionar conector personalizado**."},{"en":"Name: **{{displayName}}**. URL: the server URL above.","pt":"Nome: **{{displayName}}**. URL: a URL do servidor acima."},{"en":"Click **Add**, then **Connect**{{#oauth}} and sign in{{/oauth}}.","pt":"Clique em **Adicionar** e depois em **Conectar**{{#oauth}} e entre na sua conta{{/oauth}}."}]}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"claude-code","name":"Claude Code","category":"cli","color":"#c96442","homepage":"https://code.claude.com","docs":"https://code.claude.com/docs/en/mcp","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Any Claude Code user (Pro, Max, Team, Enterprise or API key). Admins can allow or block servers with managed settings.","pt":"Qualquer pessoa que usa o Claude Code (Pro, Max, Team, Enterprise ou chave de API). Admins podem liberar ou bloquear servidores por configuração gerenciada."},"limits":[{"en":"Tool output is capped at 25,000 tokens by default (`MAX_MCP_OUTPUT_TOKENS`).","pt":"A saída de cada ferramenta tem limite de 25.000 tokens por padrão (`MAX_MCP_OUTPUT_TOKENS`)."},{"en":"Headless runs (`claude -p`, Agent SDK) can't do the OAuth sign-in; sign in once interactively.","pt":"Execuções sem tela (`claude -p`, Agent SDK) não fazem o login OAuth; entre uma vez no modo interativo."},{"en":"`--scope user` makes the server available in every project; the default `local` scope is only the current folder.","pt":"`--scope user` deixa o servidor em todos os projetos; o escopo padrão `local` vale só para a pasta atual."}],"methods":[{"id":"cli-http","kind":"command","transport":"http","primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"claude mcp add --transport {{transport}}{{#headerLines}} --header {{.|shell}}{{/headerLines}} --scope user {{name|shell}} {{url|shell}}","note":{"en":"{{#oauth}}Then type `/mcp` in Claude Code, pick **{{name}}** and sign in.{{/oauth}}","pt":"{{#oauth}}Depois digite `/mcp` no Claude Code, escolha **{{name}}** e entre na sua conta.{{/oauth}}"}},{"id":"cli-stdio","kind":"command","transport":"stdio","primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"claude mcp add{{#envPairs}} --env {{.|shell}}{{/envPairs}} --scope user {{name|shell}} -- {{command|shell}}{{#args?}} {{args|shell}}{{/args?}}"},{"id":"project-file","kind":"config","transport":"both","label":{"en":"Or share it with your team in the repo","pt":"Ou compartilhe com o time no repositório"},"vars":{"ccType":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","cfg":{"mcpServers":{"{{name}}":{"type":"{{ccType}}","...":"{{entry}}"}}}},"template":"{{cfg|pretty}}","file":{"any":".mcp.json"},"format":"json"}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"claude-desktop","name":"Claude Desktop","category":"desktop","color":"#b55d3f","homepage":"https://claude.ai/download","docs":"https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Any plan, Free included. On Team and Enterprise, owners can turn off public extensions or keep an allowlist.","pt":"Qualquer plano, inclusive o gratuito. Em Team e Enterprise, os donos podem desligar extensões públicas ou manter uma lista permitida."},"limits":[{"en":"Local servers from the config file don't reach claude.ai on the web or Cowork; remote connectors can't reach localhost.","pt":"Servidores locais do arquivo de configuração não aparecem no claude.ai nem no Cowork; conectores remotos não alcançam localhost."},{"en":"Restart Claude Desktop after editing the config file. Use absolute paths for commands.","pt":"Reinicie o Claude Desktop depois de editar o arquivo. Use caminhos absolutos nos comandos."},{"en":"Windows Store (MSIX) installs may keep the file under `%LOCALAPPDATA%\\Packages\\<Claude package>\\LocalCache\\Roaming\\Claude\\`.","pt":"Instalações pela Microsoft Store (MSIX) podem guardar o arquivo em `%LOCALAPPDATA%\\Packages\\<pacote do Claude>\\LocalCache\\Roaming\\Claude\\`."},{"en":"Ship local servers as a one-click `.mcpb` extension: `npx @anthropic-ai/mcpb init` then `mcpb pack`.","pt":"Distribua servidores locais como extensão `.mcpb` de um clique: `npx @anthropic-ai/mcpb init` e depois `mcpb pack`."}],"methods":[{"id":"connector-link","kind":"link","transport":"http","headers":false,"primary":true,"label":{"en":"Add to Claude","pt":"Adicionar ao Claude"},"template":"https://claude.ai/new?modal=add-custom-connector&connectorName={{displayName|uri}}&connectorUrl={{url|uri}}#customize/connectors","note":{"en":"Remote servers are Claude connectors: add it once and it shows up in Claude Desktop too.","pt":"Servidores remotos são conectores do Claude: adicione uma vez e ele aparece também no Claude Desktop."},"oneClick":true,"short":{"en":"Click **Add**, then **Connect**.","pt":"Clique em **Adicionar** e depois em **Conectar**."}},{"id":"config","kind":"config","transport":"stdio","primary":true,"label":{"en":"Config file","pt":"Arquivo de configuração"},"vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","format":"json","file":{"macos":"~/Library/Application Support/Claude/claude_desktop_config.json","windows":"%APPDATA%\\Claude\\claude_desktop_config.json","linux":"~/.config/Claude/claude_desktop_config.json"},"note":{"en":"Open it from **Settings → Developer → Edit Config**, merge the server into `mcpServers` and restart Claude.","pt":"Abra em **Configurações → Desenvolvedor → Editar configuração**, junte o servidor em `mcpServers` e reinicie o Claude."}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"cline","name":"Cline","category":"ide","color":"#5a4fcf","homepage":"https://cline.bot","docs":"https://docs.cline.bot/mcp/mcp-overview","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Free and open source. Enterprise admins can allowlist servers or block personal ones.","pt":"Gratuito e open source. Admins Enterprise podem limitar servidores ou bloquear os pessoais."},"limits":[{"en":"If `type` is left out on a URL server, Cline uses legacy SSE. Set `\"type\": \"streamableHttp\"`.","pt":"Se faltar o `type` num servidor por URL, o Cline usa o SSE antigo. Coloque `\"type\": \"streamableHttp\"`."},{"en":"The settings file lives in the editor's storage; open it with **MCP Servers → Configure → Configure MCP Servers**.","pt":"O arquivo fica no armazenamento do editor; abra por **MCP Servers → Configure → Configure MCP Servers**."}],"methods":[{"id":"cli","kind":"command","transport":"both","primary":true,"label":{"en":"Cline CLI","pt":"Cline CLI"},"template":"{{#isRemote}}cline mcp add {{name|shell}} {{url|shell}} --transport http{{#headerLines}} --header {{.|shell}}{{/headerLines}} --yes{{/isRemote}}{{^isRemote}}cline mcp add {{name|shell}} --yes -- {{command|shell}}{{#args?}} {{args|shell}}{{/args?}}{{/isRemote}}"},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in cline_mcp_settings.json","pt":"Ou no cline_mcp_settings.json"},"format":"json","vars":{"e":{"type":"{{#isRemote}}{{#sse}}sse{{/sse}}{{^sse}}streamableHttp{{/sse}}{{/isRemote}}","...":"{{entry}}","disabled":false},"cfg":{"mcpServers":{"{{name}}":"{{e}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json","windows":"%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json","linux":"~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"codex","name":"Codex","category":"cli","color":"#10a37f","homepage":"https://developers.openai.com/codex","docs":"https://developers.openai.com/codex/mcp","transports":{"stdio":true,"http":true,"sse":false},"plans":{"en":"Any Codex user (ChatGPT plan with Codex, or API key). The CLI, the desktop app and the IDE extension share the same config.","pt":"Qualquer pessoa que usa o Codex (plano do ChatGPT com Codex ou chave de API). CLI, app e extensão de IDE usam a mesma configuração."},"limits":[{"en":"No legacy SSE: only stdio and Streamable HTTP.","pt":"Sem SSE antigo: só stdio e Streamable HTTP."},{"en":"Servers have 10 s to start by default (`startup_timeout_sec`).","pt":"O servidor tem 10 s para iniciar por padrão (`startup_timeout_sec`)."},{"en":"A project's `.codex/config.toml` is only read in trusted projects.","pt":"O `.codex/config.toml` de um projeto só vale em projetos confiáveis."},{"en":"Codex runs commands in a sandbox; servers that need the network or files outside the workspace may need `sandbox` settings.","pt":"O Codex roda comandos num sandbox; servidores que precisam de rede ou de arquivos fora do projeto podem pedir ajuste no `sandbox`."}],"methods":[{"id":"cli-http","kind":"command","transport":"http","headers":false,"primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"codex mcp add {{name|shell}} --url {{url|shell}}{{#oauth}}\ncodex mcp login {{name|shell}}{{/oauth}}"},{"id":"cli-stdio","kind":"command","transport":"stdio","primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"codex mcp add {{name|shell}}{{#envPairs}} --env {{.|shell}}{{/envPairs}} -- {{command|shell}}{{#args?}} {{args|shell}}{{/args?}}"},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in the config file","pt":"Ou no arquivo de configuração"},"format":"toml","template":"[mcp_servers.{{name|tomlkey}}]\n{{#isRemote}}url = {{url|toml}}\n{{#hasHeaders}}http_headers = {{headers|toml}}\n{{/hasHeaders}}{{/isRemote}}{{^isRemote}}command = {{command|toml}}\n{{#args?}}args = {{args|toml}}\n{{/args?}}{{#hasEnv}}env = {{env|toml}}\n{{/hasEnv}}{{/isRemote}}","file":{"macos":"~/.codex/config.toml","windows":"%USERPROFILE%\\.codex\\config.toml","linux":"~/.codex/config.toml"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"continue","name":"Continue","category":"ide","color":"#1e1e1e","homepage":"https://continue.dev","docs":"https://docs.continue.dev/customize/deep-dives/mcp","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Open source; local config needs no plan.","pt":"Open source; a configuração local não pede plano."},"limits":[{"en":"MCP only works in Agent mode.","pt":"MCP só funciona no modo Agent."},{"en":"Auth for remote servers isn't documented.","pt":"O login de servidores remotos não está documentado."}],"methods":[{"id":"block","kind":"config","transport":"both","primary":true,"label":{"en":"Save as a block in your workspace","pt":"Salve como bloco no projeto"},"format":"yaml","template":"name: {{displayName|yaml}}\nversion: 0.0.1\nschema: v1\nmcpServers:\n  - name: {{name|yaml}}\n{{#isRemote}}    type: {{#sse}}sse{{/sse}}{{^sse}}streamable-http{{/sse}}\n    url: {{url|yaml}}\n{{/isRemote}}{{^isRemote}}    type: stdio\n    command: {{command|yaml}}\n    args: {{args|json}}\n{{#hasEnv}}    env:\n{{#envList}}      {{key|yaml}}: {{value|yaml}}\n{{/envList}}{{/hasEnv}}{{/isRemote}}","file":{"any":".continue/mcpServers/{{name|slug}}.yaml"}}],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"copilot-cli","name":"Copilot CLI","category":"cli","color":"#24292f","homepage":"https://github.com/features/copilot/cli","docs":"https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Any Copilot plan. Organization policies (MCP registry and allowlist) can limit which servers run.","pt":"Qualquer plano do Copilot. Políticas da organização (registro e lista de MCP permitidos) podem limitar os servidores."},"limits":[{"en":"The Copilot cloud agent and code review only use tools (no resources or prompts) and can't sign in to OAuth servers.","pt":"O cloud agent e o code review do Copilot só usam ferramentas (sem resources nem prompts) e não fazem login OAuth."},{"en":"Copilot code review only calls tools marked `readOnlyHint: true`.","pt":"O code review do Copilot só chama ferramentas marcadas com `readOnlyHint: true`."},{"en":"A committed `.mcp.json` or `.github/mcp.json` in the repo is picked up too.","pt":"Um `.mcp.json` ou `.github/mcp.json` no repositório também é lido."}],"methods":[{"id":"cli","kind":"command","transport":"both","primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"{{#isRemote}}copilot mcp add --transport {{transport}}{{#headerLines}} --header {{.|shell}}{{/headerLines}} {{name|shell}} {{url|shell}}{{/isRemote}}{{^isRemote}}copilot mcp add{{#envPairs}} --env {{.|shell}}{{/envPairs}} {{name|shell}} -- {{command|shell}}{{#args?}} {{args|shell}}{{/args?}}{{/isRemote}}"},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in mcp-config.json","pt":"Ou no mcp-config.json"},"format":"json","vars":{"e":{"type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}local{{/isRemote}}","...":"{{entry}}","tools":["*"]},"cfg":{"mcpServers":{"{{name}}":"{{e}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.copilot/mcp-config.json","windows":"%USERPROFILE%\\.copilot\\mcp-config.json","linux":"~/.copilot/mcp-config.json"}}],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"copilot-studio","name":"Copilot Studio","category":"agent","color":"#0f6cbd","homepage":"https://copilotstudio.microsoft.com","docs":"https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent","openUrl":"https://copilotstudio.microsoft.com","transports":{"stdio":false,"http":true,"sse":false},"plans":{"en":"Copilot Studio license (or Microsoft 365 Copilot / pay-as-you-go) and an agent with generative orchestration on. Power Platform data policies apply.","pt":"Licença do Copilot Studio (ou Microsoft 365 Copilot / pré-pago) e um agente com orquestração generativa ligada. Valem as políticas de dados do Power Platform."},"limits":[{"en":"Streamable HTTP only (no SSE since August 2025).","pt":"Só Streamable HTTP (sem SSE desde agosto de 2025)."},{"en":"Uses MCP tools and resources, not prompts.","pt":"Usa ferramentas e resources do MCP, não prompts."},{"en":"The consumer Microsoft Copilot app has no documented way to add custom MCP servers.","pt":"O app Microsoft Copilot para consumidor não tem jeito documentado de adicionar MCP próprio."}],"methods":[{"id":"steps","kind":"steps","transport":"http","primary":true,"label":{"en":"In Copilot Studio","pt":"No Copilot Studio"},"steps":[{"en":"Open your agent → **Tools → Add a tool → New tool → Model Context Protocol**.","pt":"Abra o agente → **Tools → Add a tool → New tool → Model Context Protocol**."},{"en":"Server name: **{{displayName}}**, a short description (the orchestrator reads it) and the server URL above.","pt":"Server name: **{{displayName}}**, uma descrição curta (o orquestrador lê) e a URL do servidor acima."},{"en":"Authentication: **{{#oauth}}OAuth 2.0{{/oauth}}{{^oauth}}{{#hasHeaders}}API key{{/hasHeaders}}{{^hasHeaders}}None{{/hasHeaders}}{{/oauth}}** → **Create**, then create a connection and **Add to agent**.","pt":"Autenticação: **{{#oauth}}OAuth 2.0{{/oauth}}{{^oauth}}{{#hasHeaders}}API key{{/hasHeaders}}{{^hasHeaders}}None{{/hasHeaders}}{{/oauth}}** → **Create**, depois crie a conexão e clique em **Add to agent**."}]}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"cursor","name":"Cursor","category":"ide","color":"#111111","homepage":"https://cursor.com","docs":"https://cursor.com/docs/context/mcp","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Available to individual users; Enterprise admins can allowlist servers by command and URL.","pt":"Disponível para usuários individuais; admins Enterprise podem limitar servidores por comando e URL."},"limits":[{"en":"Install links are capped at 10,000 characters.","pt":"Links de instalação têm limite de 10.000 caracteres."},{"en":"Cloud Agents keep MCP sign-ins separate from the desktop app.","pt":"Os Cloud Agents têm login de MCP separado do app."}],"methods":[{"id":"deeplink","kind":"link","transport":"both","primary":true,"label":{"en":"Add to Cursor","pt":"Adicionar ao Cursor"},"template":"cursor://anysphere.cursor-deeplink/mcp/install?name={{name|uri}}&config={{entry|json|base64|uri}}","webTemplate":"https://cursor.com/install-mcp?name={{name|uri}}&config={{entry|json|base64|uri}}","oneClick":true,"short":{"en":"Cursor opens and asks you to confirm.","pt":"O Cursor abre e pede para você confirmar."}},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in the config file","pt":"Ou no arquivo de configuração"},"vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","format":"json","file":{"macos":"~/.cursor/mcp.json","windows":"%USERPROFILE%\\.cursor\\mcp.json","linux":"~/.cursor/mcp.json"},"note":{"en":"Per project: `.cursor/mcp.json` in the repo.","pt":"Por projeto: `.cursor/mcp.json` no repositório."}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":false}},{"id":"gemini-app","name":"Gemini","category":"chat","color":"#4285f4","homepage":"https://gemini.google.com","docs":"https://support.google.com/gemini/answer/17209137","openUrl":"https://gemini.google.com/apps","transports":{"stdio":false,"http":true,"sse":null},"plans":{"en":"Personal Google accounts, 18+, in the US, in English, with Keep Activity on. Workspace has a separate path in Gemini Enterprise.","pt":"Contas Google pessoais, 18+, nos EUA, em inglês, com a Atividade ligada. O Workspace tem caminho próprio no Gemini Enterprise."},"limits":[{"en":"Custom apps are added on the web only; they then work on mobile.","pt":"Apps próprios só são adicionados na web; depois funcionam no celular."},{"en":"Write actions always ask for confirmation.","pt":"Ações de escrita sempre pedem confirmação."},{"en":"Builders can test at gemini.google.com/devmode before publishing through the Connected Apps platform.","pt":"Quem desenvolve pode testar em gemini.google.com/devmode antes de publicar pela plataforma Connected Apps."}],"methods":[{"id":"open","kind":"link","transport":"http","primary":true,"headers":false,"label":{"en":"Open Gemini connected apps","pt":"Abrir apps conectados do Gemini"},"template":"https://gemini.google.com/apps"},{"id":"steps","kind":"steps","transport":"http","headers":false,"label":{"en":"Then","pt":"Depois"},"steps":[{"en":"Add a custom app and paste the server URL above.","pt":"Adicione um app personalizado e cole a URL do servidor acima."},{"en":"Link your account, then type **@** and pick **{{displayName}}** in a chat.","pt":"Vincule sua conta e, numa conversa, digite **@** e escolha **{{displayName}}**."}]}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":false}},{"id":"gemini-cli","name":"Gemini CLI","category":"cli","color":"#1a73e8","homepage":"https://geminicli.com","docs":"https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Anyone running Gemini CLI (Google account, API key, Vertex AI or Code Assist).","pt":"Qualquer pessoa que roda o Gemini CLI (conta Google, chave de API, Vertex AI ou Code Assist)."},"limits":[{"en":"In settings.json, `httpUrl` is Streamable HTTP and `url` is legacy SSE.","pt":"No settings.json, `httpUrl` é Streamable HTTP e `url` é o SSE antigo."},{"en":"`gemini mcp add` defaults to the project scope; `--scope user` covers every folder.","pt":"`gemini mcp add` usa o escopo do projeto por padrão; `--scope user` vale para todas as pastas."},{"en":"Your shell's secrets aren't passed to servers unless listed in `env`.","pt":"Segredos do seu shell não vão para o servidor a menos que estejam em `env`."}],"methods":[{"id":"cli-http","kind":"command","transport":"http","primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"gemini mcp add --transport {{transport}}{{#headerLines}} -H {{.|shell}}{{/headerLines}} --scope user {{name|shell}} {{url|shell}}","note":{"en":"{{#oauth}}Then run `/mcp auth {{name}}` inside Gemini CLI.{{/oauth}}","pt":"{{#oauth}}Depois rode `/mcp auth {{name}}` dentro do Gemini CLI.{{/oauth}}"}},{"id":"cli-stdio","kind":"command","transport":"stdio","primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"gemini mcp add --scope user{{#envPairs}} -e {{.|shell}}{{/envPairs}} {{name|shell}} {{command|shell}}{{#args?}} -- {{args|shell}}{{/args?}}"},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in settings.json","pt":"Ou no settings.json"},"format":"json","vars":{"g":{"httpUrl":"{{#isRemote}}{{^sse}}{{url}}{{/sse}}{{/isRemote}}","url":"{{#isRemote}}{{#sse}}{{url}}{{/sse}}{{/isRemote}}","headers":"{{headers}}","...":"{{localEntry}}"},"cfg":{"mcpServers":{"{{name}}":"{{g}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.gemini/settings.json","windows":"%USERPROFILE%\\.gemini\\settings.json","linux":"~/.gemini/settings.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"goose","name":"Goose","category":"agent","color":"#3b3b3b","homepage":"https://goose-docs.ai","docs":"https://goose-docs.ai/docs/getting-started/using-extensions/","transports":{"stdio":true,"http":true,"sse":null},"plans":{"en":"Free and open source (Apache-2.0).","pt":"Gratuito e open source (Apache-2.0)."},"limits":[{"en":"Local install links only accept `npx`, `uvx`, `jbang`, `docker` or `goosed` as the command.","pt":"Links de servidor local só aceitam `npx`, `uvx`, `jbang`, `docker` ou `goosed` como comando."},{"en":"Links can't carry secrets; Goose asks for environment variables after the click.","pt":"Links não levam segredos; o Goose pede as variáveis de ambiente depois do clique."}],"methods":[{"id":"deeplink-http","kind":"link","transport":"http","headers":false,"primary":true,"label":{"en":"Add to Goose","pt":"Adicionar ao Goose"},"template":"goose://extension?url={{url|uri}}&type=streamable_http&timeout=300&id={{name|slug|uri}}&name={{displayName|uri}}{{#description?}}&description={{description|uri}}{{/description?}}","oneClick":true,"short":{"en":"Goose opens and asks you to confirm.","pt":"O Goose abre e pede para você confirmar."}},{"id":"deeplink-stdio","kind":"link","transport":"stdio","primary":true,"label":{"en":"Add to Goose","pt":"Adicionar ao Goose"},"template":"goose://extension?cmd={{command|uri}}{{#args}}&arg={{.|uri}}{{/args}}&timeout=300&id={{name|slug|uri}}&name={{displayName|uri}}{{#description?}}&description={{description|uri}}{{/description?}}","oneClick":true,"short":{"en":"Goose opens and asks you to confirm.","pt":"O Goose abre e pede para você confirmar."}},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in the config file","pt":"Ou no arquivo de configuração"},"format":"yaml","template":"extensions:\n  {{name|slug}}:\n    name: {{displayName|yaml}}\n    enabled: true\n    timeout: 300\n{{#isRemote}}    type: streamable_http\n    uri: {{url|yaml}}\n{{#hasHeaders}}    headers:\n{{#headerList}}      {{key|yaml}}: {{value|yaml}}\n{{/headerList}}{{/hasHeaders}}{{/isRemote}}{{^isRemote}}    type: stdio\n    cmd: {{command|yaml}}\n    args: {{args|json}}\n{{#hasEnv}}    envs:\n{{#envList}}      {{key|yaml}}: {{value|yaml}}\n{{/envList}}{{/hasEnv}}{{/isRemote}}","file":{"macos":"~/.config/goose/config.yaml","windows":"%APPDATA%\\Block\\goose\\config\\config.yaml","linux":"~/.config/goose/config.yaml"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"instinct","name":"Instinct","category":"agent","color":"#0ea5e9","homepage":"https://instinct.com","transports":{"stdio":false,"http":false,"sse":false},"plans":{"en":"Invite-only consumer agent on iMessage, WhatsApp and SMS.","pt":"Agente de consumo só por convite, no iMessage, WhatsApp e SMS."},"limits":[{"en":"No way to add your own MCP server, connector or API yet. Integrations are partners Instinct picks (Shopify, Stripe Link, 1Password, Duffel, Yelp).","pt":"Ainda não dá para adicionar servidor MCP, conector ou API próprios. As integrações são parceiros escolhidos pelo Instinct (Shopify, Stripe Link, 1Password, Duffel, Yelp)."},{"en":"Today the way in is indirect: a page it can find and read on the open web, or Shopify agentic checkout.","pt":"Hoje o caminho é indireto: uma página que ele encontra e lê na web aberta, ou o checkout agêntico da Shopify."}],"methods":[],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"jetbrains","name":"JetBrains AI","category":"ide","color":"#ff318c","homepage":"https://www.jetbrains.com/ai/","docs":"https://www.jetbrains.com/help/ai-assistant/mcp.html","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"JetBrains AI access in a JetBrains IDE (AI Assistant or Junie).","pt":"Acesso ao JetBrains AI numa IDE da JetBrains (AI Assistant ou Junie)."},"limits":[{"en":"AI Assistant and Junie keep separate server lists.","pt":"AI Assistant e Junie têm listas de servidores separadas."},{"en":"Junie waits 60 s per request by default.","pt":"O Junie espera 60 s por requisição por padrão."}],"methods":[{"id":"steps","kind":"steps","transport":"both","primary":true,"label":{"en":"AI Assistant","pt":"AI Assistant"},"steps":[{"en":"Open **Settings → Tools → AI Assistant → Model Context Protocol (MCP)** and click **Add**.","pt":"Abra **Settings → Tools → AI Assistant → Model Context Protocol (MCP)** e clique em **Add**."},{"en":"Paste the JSON below, choose global or project, click **OK** and **Apply**.","pt":"Cole o JSON abaixo, escolha global ou projeto, clique em **OK** e **Apply**."}]},{"id":"config","kind":"config","transport":"both","label":{"en":"JSON (also Junie's file)","pt":"JSON (também o arquivo do Junie)"},"format":"json","vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.junie/mcp/mcp.json","windows":"%USERPROFILE%\\.junie\\mcp\\mcp.json","linux":"~/.junie/mcp/mcp.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"kilo-code","name":"Kilo Code","category":"ide","color":"#f8f675","homepage":"https://kilo.ai","docs":"https://kilo.ai/docs/features/mcp/using-mcp-in-kilo-code","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"No plan restriction documented.","pt":"Sem restrição de plano documentada."},"limits":[{"en":"Short timeouts by default: 10 s local, 15 s remote.","pt":"Timeouts curtos por padrão: 10 s local, 15 s remoto."},{"en":"Current format is `mcp` in `kilo.jsonc`; older versions used `mcpServers` in `mcp_settings.json`.","pt":"O formato atual é `mcp` no `kilo.jsonc`; versões antigas usavam `mcpServers` no `mcp_settings.json`."}],"methods":[{"id":"config","kind":"config","transport":"both","primary":true,"label":{"en":"Add to kilo.jsonc","pt":"Coloque no kilo.jsonc"},"format":"jsonc","vars":{"k":{"type":"{{#isRemote}}remote{{/isRemote}}{{^isRemote}}local{{/isRemote}}","url":"{{#isRemote}}{{url}}{{/isRemote}}","headers":"{{headers}}","command":"{{commandArray}}","environment":"{{envLocal}}","enabled":true},"cfg":{"mcp":{"{{name}}":"{{k}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.config/kilo/kilo.jsonc","windows":"%USERPROFILE%\\.config\\kilo\\kilo.jsonc","linux":"~/.config/kilo/kilo.jsonc"},"note":{"en":"Or **Settings → Agent Behaviour → MCP Servers → Add Server** in the extension.","pt":"Ou **Settings → Agent Behaviour → MCP Servers → Add Server** na extensão."}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"kiro","name":"Kiro","category":"ide","color":"#7b42f6","homepage":"https://kiro.dev","docs":"https://kiro.dev/docs/mcp/configuration/","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"IDE, CLI and web; no plan restriction found. Enterprise has an MCP registry for governance.","pt":"IDE, CLI e web; sem restrição de plano encontrada. O Enterprise tem um registro de MCP para governança."},"limits":[{"en":"Turn on the **MCP support** setting first.","pt":"Ligue antes a opção **MCP support**."},{"en":"Same file and format as the old Amazon Q Developer.","pt":"Mesmo arquivo e formato do antigo Amazon Q Developer."}],"methods":[{"id":"config","kind":"config","transport":"both","primary":true,"label":{"en":"Add to Kiro's mcp.json","pt":"Coloque no mcp.json do Kiro"},"format":"json","vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.kiro/settings/mcp.json","windows":"%USERPROFILE%\\.kiro\\settings\\mcp.json","linux":"~/.kiro/settings/mcp.json"},"note":{"en":"Open it with **Kiro: Open user MCP config (JSON)**. Per project: `.kiro/settings/mcp.json`.","pt":"Abra com **Kiro: Open user MCP config (JSON)**. Por projeto: `.kiro/settings/mcp.json`."}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"le-chat","name":"Le Chat","category":"chat","color":"#fa520f","homepage":"https://chat.mistral.ai","docs":"https://docs.mistral.ai/vibe/work/connectors/mcp-connectors","transports":{"stdio":false,"http":true,"sse":true},"plans":{"en":"Admins add connectors. On Free, Pro and Student the account owner is the admin; on Team and Enterprise an organization admin adds them.","pt":"Quem adiciona conectores é o admin. No Free, Pro e Student o dono da conta é o admin; em Team e Enterprise, um admin da organização."},"limits":[{"en":"Remote only, HTTPS with a valid certificate.","pt":"Só remoto, HTTPS com certificado válido."},{"en":"Custom connectors don't pick up tool list changes, resources or prompts yet.","pt":"Conectores próprios ainda não pegam mudanças na lista de ferramentas, resources nem prompts."},{"en":"2026: Mistral documents the assistant as **Work** (chat.mistral.ai/work).","pt":"2026: a Mistral documenta o assistente como **Work** (chat.mistral.ai/work)."}],"methods":[{"id":"steps","kind":"steps","transport":"http","primary":true,"label":{"en":"In Le Chat","pt":"No Le Chat"},"steps":[{"en":"Open **Connectors → + Add Connector → Custom MCP Connector**.","pt":"Abra **Conectores → + Adicionar conector → Custom MCP Connector**."},{"en":"Name: **{{name|slug}}** (no spaces). Server URL: the URL above.","pt":"Nome: **{{name|slug}}** (sem espaços). URL do servidor: a URL acima."},{"en":"Click **Connect**{{#oauth}} and sign in{{/oauth}}.","pt":"Clique em **Conectar**{{#oauth}} e entre na sua conta{{/oauth}}."}]}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"lm-studio","name":"LM Studio","category":"desktop","color":"#4f46e5","homepage":"https://lmstudio.ai","docs":"https://lmstudio.ai/docs/app/mcp","transports":{"stdio":true,"http":true,"sse":null},"plans":{"en":"Free app; MCP since version 0.3.17.","pt":"App gratuito; MCP desde a versão 0.3.17."},"limits":[{"en":"A token inside a public Add to LM Studio link is visible to anyone with the link.","pt":"Um token dentro de um link público do LM Studio fica visível para quem tiver o link."},{"en":"Servers built for Claude or ChatGPT can overflow the context of small local models.","pt":"Servidores feitos para Claude ou ChatGPT podem estourar o contexto de modelos locais pequenos."}],"methods":[{"id":"deeplink","kind":"link","transport":"both","primary":true,"label":{"en":"Add to LM Studio","pt":"Adicionar ao LM Studio"},"template":"lmstudio://add_mcp?name={{name|uri}}&config={{entry|json|base64|uri}}","webTemplate":"https://lmstudio.ai/install-mcp?name={{name|uri}}&config={{entry|json|base64|uri}}","oneClick":true,"short":{"en":"LM Studio opens and asks you to confirm.","pt":"O LM Studio abre e pede para você confirmar."}},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in mcp.json","pt":"Ou no mcp.json"},"vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","format":"json","file":{"macos":"~/.lmstudio/mcp.json","windows":"%USERPROFILE%\\.lmstudio\\mcp.json","linux":"~/.lmstudio/mcp.json"},"note":{"en":"In the app: **Program** tab → **Install** → **Edit mcp.json**.","pt":"No app: aba **Program** → **Install** → **Edit mcp.json**."}}],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"manus","name":"Manus","category":"agent","color":"#2b2b2b","homepage":"https://manus.im","docs":"https://manus.im/docs/integrations/custom-mcp.md","openUrl":"https://manus.im/app?openConnectors=true","transports":{"stdio":false,"http":true,"sse":null},"plans":{"en":"Ready-made connectors on every plan; the plan for custom servers isn't stated.","pt":"Conectores prontos em todos os planos; o plano para servidores próprios não é informado."},"limits":[{"en":"Remote HTTPS servers only.","pt":"Só servidores remotos em HTTPS."}],"methods":[{"id":"open","kind":"link","transport":"http","primary":true,"label":{"en":"Open Manus connectors","pt":"Abrir conectores do Manus"},"template":"https://manus.im/app?openConnectors=true"},{"id":"steps","kind":"steps","transport":"http","label":{"en":"Then","pt":"Depois"},"steps":[{"en":"Go to **Settings → Integrations → Custom MCP Servers → Add Server**.","pt":"Vá em **Settings → Integrations → Custom MCP Servers → Add Server**."},{"en":"Name: **{{displayName}}**. URL: the server URL above.{{#hasHeaders}} Authentication: the key the server needs.{{/hasHeaders}}","pt":"Nome: **{{displayName}}**. URL: a URL do servidor acima.{{#hasHeaders}} Autenticação: a chave que o servidor pede.{{/hasHeaders}}"},{"en":"Save; Manus tests the connection and lists the tools.","pt":"Salve; o Manus testa a conexão e lista as ferramentas."}]}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"msty","name":"Msty Studio","category":"desktop","color":"#7c3aed","homepage":"https://msty.ai","docs":"https://docs.msty.ai/studio/toolbox/tools","transports":{"stdio":true,"http":true,"sse":false},"plans":{"en":"Not stated. Studio Web needs Studio Desktop to run tools.","pt":"Não informado. O Studio Web precisa do Studio Desktop para rodar ferramentas."},"limits":[{"en":"No legacy SSE.","pt":"Sem SSE antigo."},{"en":"Add the tool to a toolset and pick the toolset in the chat; needs a model with tool calling.","pt":"Coloque a ferramenta num toolset e escolha o toolset na conversa; precisa de um modelo com tool calling."}],"methods":[{"id":"steps","kind":"steps","transport":"both","primary":true,"label":{"en":"In Msty Studio","pt":"No Msty Studio"},"steps":[{"en":"Open **Toolbox → Tools → Add New Tool** and name it **{{displayName}}**.","pt":"Abra **Toolbox → Tools → Add New Tool** e dê o nome **{{displayName}}**."},{"en":"{{#isRemote}}Choose **HTTP** and paste the server URL above{{#oauth}} (auth: OAuth){{/oauth}}.{{/isRemote}}{{^isRemote}}Choose **STDIO / JSON** and paste the JSON below.{{/isRemote}}","pt":"{{#isRemote}}Escolha **HTTP** e cole a URL do servidor acima{{#oauth}} (autenticação: OAuth){{/oauth}}.{{/isRemote}}{{^isRemote}}Escolha **STDIO / JSON** e cole o JSON abaixo.{{/isRemote}}"},{"en":"Click **Test tool**, then **Save**, and add it to a toolset.","pt":"Clique em **Test tool**, depois em **Save**, e coloque num toolset."}]},{"id":"json","kind":"config","transport":"stdio","label":{"en":"JSON to paste","pt":"JSON para colar"},"format":"json","template":"{{entry|pretty}}"}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"notion-ai","name":"Notion AI","category":"agent","color":"#191919","homepage":"https://www.notion.com/product/ai","docs":"https://www.notion.com/help/connect-mcp-servers-to-your-notion-agent","transports":{"stdio":false,"http":true,"sse":null},"plans":{"en":"Business and Enterprise. An admin must turn on **Enable custom MCP servers**.","pt":"Business e Enterprise. Um admin precisa ligar **Enable custom MCP servers**."},"limits":[{"en":"Not available on mobile.","pt":"Não funciona no celular."},{"en":"Each Custom Agent needs its own connection; Notion Agent connections aren't shared with them.","pt":"Cada Custom Agent precisa da própria conexão; as do Notion Agent não são compartilhadas."},{"en":"With about 10 or more servers connected, answers slow down.","pt":"Com uns 10 servidores ou mais, as respostas ficam lentas."}],"methods":[{"id":"steps","kind":"steps","transport":"http","primary":true,"label":{"en":"In Notion","pt":"No Notion"},"steps":[{"en":"Open **Settings → Connections → Discover → Add Custom MCP**.","pt":"Abra **Configurações → Conexões → Descobrir → Add Custom MCP**."},{"en":"Paste the server URL above, name it **{{displayName}}** and sign in.","pt":"Cole a URL do servidor acima, dê o nome **{{displayName}}** e entre na sua conta."},{"en":"For a Custom Agent: **Settings → Tools & Access → Add connection → Custom MCP server**.","pt":"Para um Custom Agent: **Settings → Tools & Access → Add connection → Custom MCP server**."}]}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"opencode","name":"OpenCode","category":"cli","color":"#211e1e","homepage":"https://opencode.ai","docs":"https://opencode.ai/docs/mcp-servers/","transports":{"stdio":true,"http":true,"sse":false},"plans":{"en":"Open source, no plan restriction.","pt":"Open source, sem restrição de plano."},"limits":[{"en":"Remote servers must speak Streamable HTTP.","pt":"Servidores remotos precisam falar Streamable HTTP."},{"en":"Local servers take one `command` array (program + arguments) and `environment` instead of `env`.","pt":"Servidores locais usam um único array `command` (programa + argumentos) e `environment` no lugar de `env`."},{"en":"Older configs keep servers directly under `mcp` with `enabled`; current ones use `mcp.servers` with `disabled`.","pt":"Configs antigas põem os servidores direto em `mcp` com `enabled`; as atuais usam `mcp.servers` com `disabled`."}],"methods":[{"id":"cli","kind":"command","transport":"both","primary":true,"label":{"en":"Run in your terminal","pt":"Rode no terminal"},"template":"{{#isRemote}}opencode mcp add {{name|shell}} --global --url {{url|shell}}{{#headerList}} --header {{key}}={{value|shell}}{{/headerList}}{{#oauth}}\nopencode mcp auth {{name|shell}}{{/oauth}}{{/isRemote}}{{^isRemote}}opencode mcp add {{name|shell}} --global{{#envPairs}} --env {{.|shell}}{{/envPairs}} -- {{command|shell}}{{#args?}} {{args|shell}}{{/args?}}{{/isRemote}}"},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in opencode.json","pt":"Ou no opencode.json"},"format":"json","vars":{"cmdArr":"{{commandArray}}","o":{"type":"{{#isRemote}}remote{{/isRemote}}{{^isRemote}}local{{/isRemote}}","url":"{{#isRemote}}{{url}}{{/isRemote}}","headers":"{{headers}}","command":"{{cmdArr}}","environment":"{{envLocal}}"},"cfg":{"$schema":"https://opencode.ai/config.json","mcp":{"servers":{"{{name}}":"{{o}}"}}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.config/opencode/opencode.json","windows":"%USERPROFILE%\\.config\\opencode\\opencode.json","linux":"~/.config/opencode/opencode.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":true}},{"id":"perplexity","name":"Perplexity","category":"chat","color":"#20808d","homepage":"https://www.perplexity.ai","docs":"https://www.perplexity.ai/help-center/en/articles/11502712-local-and-remote-mcps-for-perplexity","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Not stated for custom servers. Local servers need the Mac App Store app.","pt":"Não informado para servidores próprios. Servidores locais precisam do app da Mac App Store."},"limits":[{"en":"Local servers only on macOS (Mac App Store app with the PerplexityXPC helper).","pt":"Servidores locais só no macOS (app da Mac App Store com o helper PerplexityXPC)."},{"en":"Auth options for remote servers aren't documented.","pt":"As opções de login para servidores remotos não estão documentadas."}],"methods":[{"id":"steps","kind":"steps","transport":"both","primary":true,"label":{"en":"In Perplexity","pt":"No Perplexity"},"steps":[{"en":"Open **Plugins** in the sidebar → **Add custom**.","pt":"Abra **Plugins** na barra lateral → **Add custom**."},{"en":"{{#isRemote}}Enter **{{displayName}}** and the server URL above, then sign in.{{/isRemote}}{{^isRemote}}On the **Simple** tab: name **{{displayName}}**, command `{{command}}{{#args?}} {{args|shell}}{{/args?}}`. Save.{{/isRemote}}","pt":"{{#isRemote}}Coloque **{{displayName}}** e a URL do servidor acima, depois entre na sua conta.{{/isRemote}}{{^isRemote}}Na aba **Simple**: nome **{{displayName}}**, comando `{{command}}{{#args?}} {{args|shell}}{{/args?}}`. Salve.{{/isRemote}}"},{"en":"Turn it on under **Sources** on the home page.","pt":"Ligue em **Sources** na página inicial."}]}],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"poke","name":"Poke","category":"agent","color":"#111827","homepage":"https://poke.com","docs":"https://poke.com/docs/mcp-servers","openUrl":"https://poke.com/integrations/new","transports":{"stdio":false,"http":true,"sse":true},"plans":{"en":"Any Poke user, from the web app.","pt":"Qualquer pessoa que usa o Poke, pelo app web."},"limits":[{"en":"Remote only; local servers need `npx poke@latest tunnel <local-url>`.","pt":"Só remoto; servidor local precisa de `npx poke@latest tunnel <url-local>`."},{"en":"An API key inside a shared prefilled link is visible to anyone with the link.","pt":"Uma chave de API dentro de um link compartilhado fica visível para quem tiver o link."},{"en":"Poke recommends Recipes (poke.com/kitchen) for distribution: you can change the server later and earn from usage.","pt":"O Poke recomenda Recipes (poke.com/kitchen) para distribuir: dá para mudar o servidor depois e ganhar com o uso."}],"methods":[{"id":"prefill","kind":"link","transport":"http","headers":false,"primary":true,"label":{"en":"Add to Poke","pt":"Adicionar ao Poke"},"template":"https://poke.com/integrations/new?name={{displayName|uri}}&url={{url|uri}}","note":{"en":"Check the fields and click **Create Integration**.","pt":"Confira os campos e clique em **Create Integration**."},"oneClick":true,"short":{"en":"Check the fields and click **Create Integration**.","pt":"Confira os campos e clique em **Create Integration**."}},{"id":"cli","kind":"command","transport":"http","headers":false,"label":{"en":"Or from the terminal","pt":"Ou pelo terminal"},"template":"npx poke@latest mcp add {{url|shell}} -n {{displayName|shell}}"}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"raycast","name":"Raycast","category":"desktop","color":"#ff6363","homepage":"https://raycast.com","docs":"https://manual.raycast.com/ai/model-context-protocol","transports":{"stdio":true,"http":true,"sse":null},"plans":{"en":"Raycast Pro. On Enterprise, admins can set servers for the organization.","pt":"Raycast Pro. No Enterprise, admins podem definir servidores para a organização."},"limits":[{"en":"No official one-click install link.","pt":"Não há link oficial de instalação de um clique."},{"en":"The iOS app only supports remote (HTTP) servers.","pt":"O app de iOS só aceita servidores remotos (HTTP)."}],"methods":[{"id":"steps","kind":"steps","transport":"both","primary":true,"label":{"en":"In Raycast","pt":"No Raycast"},"steps":[{"en":"Open Raycast and run **Install MCP Server**.","pt":"Abra o Raycast e rode **Install MCP Server**."},{"en":"Name: **{{displayName}}**. {{#isRemote}}Transport: HTTP, URL: the server URL above.{{/isRemote}}{{^isRemote}}Command: `{{command}}`, arguments: `{{args|shell}}`.{{/isRemote}}","pt":"Nome: **{{displayName}}**. {{#isRemote}}Transporte: HTTP, URL: a URL do servidor acima.{{/isRemote}}{{^isRemote}}Comando: `{{command}}`, argumentos: `{{args|shell}}`.{{/isRemote}}"},{"en":"Save, then mention it with **@{{name}}** in AI Chat.","pt":"Salve e chame com **@{{name}}** no AI Chat."}]}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"roo-code","name":"Roo Code","category":"ide","color":"#2f7d32","homepage":"https://roocode.com","docs":"https://docs.roocode.com/features/mcp/using-mcp-in-roo","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Open source; no plan restriction.","pt":"Open source; sem restrição de plano."},"limits":[{"en":"URL servers need an explicit `type`: `streamable-http` (with a hyphen) or `sse`.","pt":"Servidores por URL precisam de `type` explícito: `streamable-http` (com hífen) ou `sse`."}],"methods":[{"id":"config","kind":"config","transport":"both","primary":true,"label":{"en":"Add to Roo's MCP settings","pt":"Coloque nas configurações de MCP do Roo"},"format":"json","vars":{"e":{"type":"{{#isRemote}}{{#sse}}sse{{/sse}}{{^sse}}streamable-http{{/sse}}{{/isRemote}}","...":"{{entry}}"},"cfg":{"mcpServers":{"{{name}}":"{{e}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json","windows":"%APPDATA%\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\mcp_settings.json","linux":"~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json"},"note":{"en":"Open it from the MCP icon → **Edit Global MCP**. Per project: `.roo/mcp.json`.","pt":"Abra pelo ícone de MCP → **Edit Global MCP**. Por projeto: `.roo/mcp.json`."}}],"verified":"2026-11-08","auth":{"oauth":null,"dcr":null,"cimd":null}},{"id":"visual-studio","name":"Visual Studio","category":"ide","color":"#68217a","homepage":"https://visualstudio.microsoft.com","docs":"https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Any GitHub Copilot plan, Free included. Visual Studio 2026, or 2022 17.14+.","pt":"Qualquer plano do GitHub Copilot, inclusive o Free. Visual Studio 2026, ou 2022 17.14+."},"limits":[{"en":"Windows only.","pt":"Só Windows."},{"en":"New tools start disabled; turn them on in Agent mode → Tools.","pt":"Ferramentas novas começam desligadas; ligue em Agent mode → Tools."},{"en":"Visual Studio also reads `.vscode/mcp.json` and `.cursor/mcp.json` from the solution.","pt":"O Visual Studio também lê `.vscode/mcp.json` e `.cursor/mcp.json` da solução."}],"methods":[{"id":"link","kind":"link","transport":"both","primary":true,"label":{"en":"Install in Visual Studio","pt":"Instalar no Visual Studio"},"vars":{"vs":{"name":"{{name}}","type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"}},"template":"vsweb+mcp://install/?{{vs|json|uri}}","webTemplate":"https://vs-open.link/mcp-install?{{vs|json|uri}}","oneClick":true,"short":{"en":"Visual Studio opens and installs it.","pt":"O Visual Studio abre e instala."}},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in .mcp.json","pt":"Ou no .mcp.json"},"format":"json","vars":{"cfg":{"servers":{"{{name}}":{"type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"}}}},"template":"{{cfg|pretty}}","file":{"windows":"%USERPROFILE%\\.mcp.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"vscode","name":"VS Code","category":"ide","color":"#0078d4","homepage":"https://code.visualstudio.com","docs":"https://code.visualstudio.com/docs/copilot/customization/mcp-servers","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Any GitHub Copilot plan, Free included. Business and Enterprise admins control MCP by policy.","pt":"Qualquer plano do GitHub Copilot, inclusive o Free. Admins Business e Enterprise controlam o MCP por política."},"limits":[{"en":"A chat request can use at most 128 tools.","pt":"Um pedido no chat usa no máximo 128 ferramentas."},{"en":"Workspace servers need Workspace Trust.","pt":"Servidores do projeto exigem Workspace Trust."},{"en":"The install link opens a review screen; the person clicks **Install**.","pt":"O link abre uma tela de revisão; a pessoa clica em **Install**."}],"methods":[{"id":"deeplink","kind":"link","transport":"both","primary":true,"label":{"en":"Install in VS Code","pt":"Instalar no VS Code"},"vars":{"vs":{"name":"{{name}}","type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"},"cfg":{"type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"}},"template":"vscode:mcp/install?{{vs|json|uri}}","webTemplate":"https://vscode.dev/redirect/mcp/install?name={{name|uri}}&config={{cfg|json|uri}}","oneClick":true,"short":{"en":"VS Code opens; click **Install**.","pt":"O VS Code abre; clique em **Install**."}},{"id":"insiders","kind":"link","transport":"both","label":{"en":"VS Code Insiders","pt":"VS Code Insiders"},"vars":{"vs":{"name":"{{name}}","type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"},"cfg":{"type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"}},"template":"vscode-insiders:mcp/install?{{vs|json|uri}}","webTemplate":"https://insiders.vscode.dev/redirect/mcp/install?name={{name|uri}}&config={{cfg|json|uri}}&quality=insiders","oneClick":true},{"id":"cli","kind":"command","transport":"both","label":{"en":"Or from the terminal","pt":"Ou pelo terminal"},"vars":{"vs":{"name":"{{name}}","type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"}},"template":"code --add-mcp {{vs|json|shell}}"},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in the config file","pt":"Ou no arquivo de configuração"},"vars":{"cfg":{"servers":{"{{name}}":{"type":"{{#isRemote}}{{transport}}{{/isRemote}}{{^isRemote}}stdio{{/isRemote}}","...":"{{entry}}"}}}},"template":"{{cfg|pretty}}","format":"json","file":{"macos":"~/Library/Application Support/Code/User/mcp.json","windows":"%APPDATA%\\Code\\User\\mcp.json","linux":"~/.config/Code/User/mcp.json"},"note":{"en":"Uses `servers`, not `mcpServers`. Per project: `.vscode/mcp.json`.","pt":"Usa `servers`, e não `mcpServers`. Por projeto: `.vscode/mcp.json`."}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"warp","name":"Warp","category":"cli","color":"#01a4ff","homepage":"https://warp.dev","docs":"https://docs.warp.dev/agents/capabilities/mcp/","openUrl":"warp://settings/mcp","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"No plan gate for local agents; sharing servers with a team needs a Warp team.","pt":"Sem restrição de plano para agentes locais; compartilhar com o time pede um time no Warp."},"limits":[{"en":"Warp can also start servers from `~/.claude.json`, `~/.codex/config.toml` and `~/.agents/.mcp.json` (setting **Auto-spawn servers from third-party agents**).","pt":"O Warp também inicia servidores de `~/.claude.json`, `~/.codex/config.toml` e `~/.agents/.mcp.json` (opção **Auto-spawn servers from third-party agents**)."},{"en":"Project servers (`.warp/.mcp.json`) need approval every session.","pt":"Servidores do projeto (`.warp/.mcp.json`) pedem aprovação a cada sessão."}],"methods":[{"id":"settings","kind":"link","transport":"both","primary":true,"label":{"en":"Open Warp MCP settings","pt":"Abrir MCP no Warp"},"template":"warp://settings/mcp","note":{"en":"Click **+ Add** and paste the JSON below.","pt":"Clique em **+ Add** e cole o JSON abaixo."}},{"id":"config","kind":"config","transport":"both","label":{"en":"JSON to paste, or save in the file","pt":"JSON para colar, ou salve no arquivo"},"format":"json","vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.warp/.mcp.json","linux":"~/.warp/.mcp.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}},{"id":"windsurf","name":"Windsurf","category":"ide","color":"#0b8f6b","homepage":"https://windsurf.com","docs":"https://docs.devin.ai/desktop/cascade/mcp","transports":{"stdio":true,"http":true,"sse":true},"plans":{"en":"Not restricted by plan in the docs; Enterprise admins keep an MCP allowlist and registries.","pt":"A documentação não restringe por plano; admins Enterprise mantêm lista permitida e registros de MCP."},"limits":[{"en":"2026: Windsurf's agent now shares the Devin harness, so the config moved to `~/.config/devin/mcp_config.json` (key `url`). Older installs read `~/.codeium/windsurf/mcp_config.json` with `serverUrl`.","pt":"2026: o agente do Windsurf passou a usar o motor do Devin, e a configuração foi para `~/.config/devin/mcp_config.json` (chave `url`). Instalações antigas leem `~/.codeium/windsurf/mcp_config.json` com `serverUrl`."},{"en":"Tool calls ask for approval by default.","pt":"Chamadas de ferramenta pedem aprovação por padrão."}],"methods":[{"id":"cli","kind":"command","transport":"both","primary":true,"label":{"en":"Run in your terminal (Devin CLI)","pt":"Rode no terminal (Devin CLI)"},"template":"{{#isRemote}}devin mcp add -s user {{name|shell}} {{url|shell}}{{#oauth}}\ndevin mcp login {{name|shell}}{{/oauth}}{{/isRemote}}{{^isRemote}}devin mcp add -s user {{name|shell}} -- {{command|shell}}{{#args?}} {{args|shell}}{{/args?}}{{/isRemote}}","headers":false},{"id":"config","kind":"config","transport":"both","label":{"en":"Or in the config file","pt":"Ou no arquivo de configuração"},"format":"json","vars":{"cfg":{"mcpServers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.config/devin/mcp_config.json","windows":"%APPDATA%\\devin\\mcp_config.json","linux":"~/.config/devin/mcp_config.json"},"note":{"en":"Then refresh in **Customize → MCPs**.","pt":"Depois atualize em **Customize → MCPs**."}},{"id":"legacy","kind":"config","transport":"both","label":{"en":"Older Windsurf versions","pt":"Versões antigas do Windsurf"},"format":"json","vars":{"w":{"serverUrl":"{{#isRemote}}{{url}}{{/isRemote}}","headers":"{{headers}}","...":"{{localEntry}}"},"cfg":{"mcpServers":{"{{name}}":"{{w}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.codeium/windsurf/mcp_config.json","windows":"%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json","linux":"~/.codeium/windsurf/mcp_config.json"}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":true,"cimd":null}},{"id":"zed","name":"Zed","category":"ide","color":"#084ccf","homepage":"https://zed.dev","docs":"https://zed.dev/docs/ai/mcp","transports":{"stdio":true,"http":true,"sse":null},"plans":{"en":"Local setting, not tied to a plan.","pt":"Configuração local, sem ligação com plano."},"limits":[{"en":"Only MCP tools and prompts (no resources, sampling or elicitation).","pt":"Só ferramentas e prompts do MCP (sem resources, sampling nem elicitation)."}],"methods":[{"id":"config","kind":"config","transport":"both","primary":true,"label":{"en":"Add to Zed settings","pt":"Adicione nas configurações do Zed"},"format":"jsonc","vars":{"cfg":{"context_servers":{"{{name}}":"{{entry}}"}}},"template":"{{cfg|pretty}}","file":{"macos":"~/.config/zed/settings.json","windows":"%APPDATA%\\Zed\\settings.json","linux":"~/.config/zed/settings.json"},"note":{"en":"Run **zed: open settings file** and merge into `context_servers`. Or use **Settings → AI → MCP Servers → Add Server**.","pt":"Rode **zed: open settings file** e junte em `context_servers`. Ou use **Settings → AI → MCP Servers → Add Server**."}}],"verified":"2026-11-08","auth":{"oauth":true,"dcr":null,"cimd":null}}],"all":["claude-ai","chatgpt","claude-code","codex","cursor","vscode","claude-desktop","gemini-cli","windsurf","gemini-app","le-chat","perplexity","copilot-studio","notion-ai","poke","manus","goose","lm-studio","zed","cline","roo-code","kilo-code","opencode","jetbrains","visual-studio","kiro","warp","raycast","msty","boltai","copilot-cli","augment","continue","amazon-q","instinct"]};


const TEXTS = {
  en: {
    heading: 'Connect {name} to your AI',
    copy: 'Copy', copied: 'Copied',
    fileIn: 'Add to {file}', otherOs: 'Other systems',
    serverUrl: 'Server URL',
    directory: 'Open {name} in the {client} directory',
    docs: 'Official docs', checked: 'checked {date}',
    plans: 'Plans', limits: 'Good to know',
    oauth: 'The first time, you will be asked to sign in.',
    bridged: 'This app only runs local servers, so this uses the mcp-remote bridge (needs Node.js).',
    'unsupported.no-remote': '{client} only runs local servers, and this server is remote.',
    'unsupported.no-local': '{client} only connects to remote servers, and this server runs locally.',
    'unsupported.headers': '{client} cannot send the custom headers this server needs.',
    'unsupported.no-custom': '{client} does not let you add your own MCP servers yet.',
    'unsupported.unsupported': 'There is no known way to add this server to {client} yet.',
    clients: 'Apps', others: 'Others', manual: "Didn't open? Do it by hand", more: 'More details',
  },
  pt: {
    heading: 'Conecte o {name} à sua IA',
    copy: 'Copiar', copied: 'Copiado',
    fileIn: 'Coloque em {file}', otherOs: 'Outros sistemas',
    serverUrl: 'URL do servidor',
    directory: 'Abrir o {name} no diretório do {client}',
    docs: 'Documentação oficial', checked: 'conferido em {date}',
    plans: 'Planos', limits: 'Bom saber',
    oauth: 'Na primeira vez, ele pede para você entrar na sua conta.',
    bridged: 'Este app só roda servidores locais; aqui usamos a ponte mcp-remote (precisa do Node.js).',
    'unsupported.no-remote': 'O {client} só roda servidores locais, e este servidor é remoto.',
    'unsupported.no-local': 'O {client} só conecta servidores remotos, e este servidor roda no seu computador.',
    'unsupported.headers': 'O {client} não envia os cabeçalhos que este servidor exige.',
    'unsupported.no-custom': 'O {client} ainda não deixa adicionar servidores MCP próprios.',
    'unsupported.unsupported': 'Ainda não há um jeito conhecido de adicionar este servidor ao {client}.',
    clients: 'Apps', others: 'Outros', manual: 'Não abriu? Faça à mão', more: 'Mais detalhes',
  },
};

const OTHERS = '__others';
const OS_LABEL = { macos: 'macOS', windows: 'Windows', linux: 'Linux', any: '' };

function detectOs() {
  const p = (globalThis.navigator && (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent)) || '';
  if (/win/i.test(p)) return 'windows';
  if (/linux|android|cros/i.test(p)) return 'linux';
  return 'macos';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(s) {
  return esc(s)
    .replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function fmt(s, vars) {
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

function parseJson(v, fallback) {
  if (v == null || v === '') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

const CSS = String.raw`
:host{--mp-accent:#2f6df6;--mp-accent-fg:#fff;--mp-bg:#fff;--mp-fg:#16181d;--mp-muted:#5f6673;--mp-border:#e3e6eb;--mp-soft:#f4f6f9;--mp-code-bg:#f4f6f9;--mp-radius:12px;--mp-font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mp-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;display:block;min-width:0;max-width:100%;color:var(--mp-fg);font-family:var(--mp-font);font-size:15px;line-height:1.45}
:host([theme=dark]){--mp-bg:#15171c;--mp-fg:#eceef2;--mp-muted:#9aa1ad;--mp-border:#2a2e37;--mp-soft:#1d2027;--mp-code-bg:#1d2027;--mp-accent:#6b9bff;--mp-accent-fg:#0b0d12}
@media (prefers-color-scheme:dark){:host(:not([theme=light]):not([theme=dark])){--mp-bg:#15171c;--mp-fg:#eceef2;--mp-muted:#9aa1ad;--mp-border:#2a2e37;--mp-soft:#1d2027;--mp-code-bg:#1d2027;--mp-accent:#6b9bff;--mp-accent-fg:#0b0d12}}
*{box-sizing:border-box}
.box{background:var(--mp-bg);border:1px solid var(--mp-border);border-radius:var(--mp-radius);padding:18px;min-width:0}
h2{font-size:17px;margin:0 0 12px;font-weight:650;letter-spacing:-.01em}
.tabs{display:flex;gap:6px;overflow-x:auto;contain:inline-size;scrollbar-width:none;padding:2px 2px 10px;margin:0 -2px 6px;scroll-snap-type:x proximity}
.tabs::-webkit-scrollbar{display:none}
.tabs.more{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent)}
.tab{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-fg);font:inherit;font-size:14px;padding:7px 12px;border-radius:999px;cursor:pointer;scroll-snap-align:start;white-space:nowrap;min-height:36px}
@media (hover:hover){.tab:hover{background:var(--mp-soft)}}
.tab[aria-selected=true]{background:var(--mp-fg);color:var(--mp-bg);border-color:var(--mp-fg)}
.dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:0 0 0 1px var(--mp-border)}
.tab.off{opacity:.55}
.panel{display:grid;gap:14px;min-width:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--mp-accent);color:var(--mp-accent-fg);text-decoration:none;font-weight:600;font-size:15px;padding:11px 16px;border-radius:10px;border:0;cursor:pointer;min-height:44px}
@media (hover:hover){.btn:hover{filter:brightness(1.06)}}
.btn.secondary{background:var(--mp-soft);color:var(--mp-fg);border:1px solid var(--mp-border)}
.outline .btn.primary{background:transparent;color:var(--mp-accent);border:2px solid var(--mp-accent)}
@media (hover:hover){.outline .btn.primary:hover{background:var(--mp-soft);filter:none}}
.code.one{display:flex;align-items:flex-start;gap:8px}
.code.one pre{flex:1;min-width:0}
.code.one .copy{margin:6px 6px 6px 0}
.sub{display:flex;flex-wrap:wrap;gap:6px}
.subtab{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-fg);font:inherit;font-size:13px;padding:5px 10px;border-radius:999px;cursor:pointer;min-height:32px}
.subtab[aria-pressed=true]{border-color:var(--mp-fg);background:var(--mp-soft);box-shadow:inset 0 0 0 1px var(--mp-fg)}
.subtab.off{opacity:.55}
details.manual{margin-top:0}
details.manual summary{color:var(--mp-fg);font-size:14px}
details.manual .inner{display:grid;gap:14px;margin-top:12px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.label{font-size:13px;color:var(--mp-muted);margin:0 0 6px}
.code{background:var(--mp-code-bg);border:1px solid var(--mp-border);border-radius:10px;min-width:0}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin:0 0 6px}
.head .label{margin:0}
pre{margin:0;padding:12px;font-family:var(--mp-mono);font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:normal;overflow-wrap:anywhere;color:var(--mp-fg)}
.copy{flex:none;font:inherit;font-size:13px;background:var(--mp-bg);color:var(--mp-fg);border:1px solid var(--mp-border);border-radius:8px;padding:5px 10px;cursor:pointer;min-height:32px}
.copy.ok{border-color:var(--mp-accent);color:var(--mp-accent)}
ol{margin:0;padding-left:22px;display:grid;gap:6px}
code{font-family:var(--mp-mono);font-size:.9em;background:var(--mp-code-bg);border:1px solid var(--mp-border);border-radius:5px;padding:0 4px;word-break:normal;overflow-wrap:anywhere}
.note{font-size:13px;color:var(--mp-muted);margin:6px 0 0}
.row + .note{margin-top:-6px}
.foot{border-top:1px solid var(--mp-border);padding-top:10px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--mp-muted)}
.foot a,.note a{color:inherit}
details{font-size:13px;color:var(--mp-muted);margin-top:8px}
@media (max-width:480px){.row .btn{flex:1 1 100%}}
details ul{margin:6px 0 0;padding-left:18px;display:grid;gap:4px}
summary{cursor:pointer}
.warn{background:var(--mp-soft);border-radius:10px;padding:12px;margin:0}
:host([compact]) .box{padding:12px}
:host([compact]) h2{display:none}
`;

class McpPlugElement extends HTMLElement {
  static get observedAttributes() {
    return ['name', 'display-name', 'url', 'transport', 'command', 'args', 'env', 'headers', 'auth', 'lang', 'clients', 'exclude', 'default-client', 'heading', 'listings', 'texts', 'bridge', 'hide-footer', 'audience', 'primary', 'dots', 'button-style'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._selected = null;
    this._registry = REGISTRY;
  }

  set config(v) {
    const key = (x) => JSON.stringify([x && x.clients, x && x.primary, x && x.audience]);
    if (key(v) !== key(this._config)) { this._userPicked = false; this._lastOther = null; }
    this._config = v;
    this._render();
  }
  get config() { return this._config; }
  set registry(v) { this._registry = v; this._render(); }
  get registry() { return this._registry; }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { if (this.isConnected) this._render(); }

  _lang() {
    const l = (this._config && this._config.lang) || this.getAttribute('lang') || (globalThis.navigator && navigator.language) || 'en';
    return /^pt/i.test(l) ? 'pt' : 'en';
  }

  _read() {
    const inlineJson = this.querySelector('script[type="application/json"]');
    const fromScript = inlineJson ? parseJson(inlineJson.textContent, {}) : {};
    const a = (k) => this.getAttribute(k);
    const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',').map((s) => s.trim()).filter(Boolean));
    const cfg = {
      name: a('name'), displayName: a('display-name'), url: a('url'), transport: a('transport'),
      command: a('command'), args: a('args') && (parseJson(a('args'), null) || a('args')),
      env: parseJson(a('env'), undefined), headers: parseJson(a('headers'), undefined), auth: a('auth'),
      clients: a('clients'), exclude: a('exclude'), defaultClient: a('default-client'), heading: a('heading'),
      listings: parseJson(a('listings'), undefined), texts: parseJson(a('texts'), undefined),
      bridge: a('bridge') !== 'false', audience: a('audience'), primary: a('primary'), dots: a('dots'), buttonStyle: a('button-style'),
      ...fromScript, ...(this._config || {}),
    };
    for (const k of Object.keys(cfg)) if (cfg[k] == null || cfg[k] === '') delete cfg[k];
    cfg.clients = cfg.clients ? list(cfg.clients) : undefined;
    cfg.exclude = cfg.exclude ? list(cfg.exclude) : undefined;
    cfg.primary = cfg.primary ? list(cfg.primary) : undefined;
    if (cfg.clients && cfg.clients[0] === 'all') cfg.clients = this._registry.all || this._registry.clients.map((c) => c.id);
    return cfg;
  }

  _t(key, vars = {}) {
    const lang = this._lang();
    const over = (this._cfg && this._cfg.texts) || {};
    const v = (over[lang] && over[lang][key]) ?? over[key] ?? TEXTS[lang][key] ?? TEXTS.en[key] ?? key;
    return fmt(v, vars);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent('mcp-plug:' + type, { detail, bubbles: true, composed: true }));
  }

  _render() {
    const root = this.shadowRoot;
    let cfg;
    try {
      cfg = this._read();
      this._cfg = cfg;
      if (!cfg.name || (!cfg.url && !cfg.command)) { root.innerHTML = ''; return; }
      this._plan = plan(this._registry, cfg, { lang: this._lang(), clients: cfg.clients, exclude: cfg.exclude, listings: cfg.listings, bridge: cfg.bridge });
    } catch (e) {
      root.innerHTML = '<style>' + CSS + '</style><div class="box" part="box"><p class="warn">' + esc(e.message) + '</p></div>';
      return;
    }
    // Apps that can't use this server go last, dimmed.
    const items = [...this._plan].sort((a, b) => Number(!a.actions.length) - Number(!b.actions.length));
    if (!items.length) { root.innerHTML = ''; return; }
    // primary="a,b": those get their own tabs, the rest share an "Others" tab.
    const primary = cfg.primary && cfg.primary.length ? cfg.primary.filter((id) => items.some((c) => c.id === id)) : null;
    this._top = primary ? primary.map((id) => items.find((c) => c.id === id)) : items;
    this._rest = primary ? items.filter((c) => !primary.includes(c.id)) : [];
    const current = items.find((c) => c.id === this._selected);
    // Move off a tab that can't serve this server unless the visitor chose it.
    if (!current || (!current.actions.length && !this._userPicked)) {
      const pool = this._top.length ? this._top : items;
      this._selected = (cfg.defaultClient && items.some((c) => c.id === cfg.defaultClient) && cfg.defaultClient) || (pool.find((c) => c.actions.length) || pool[0]).id;
    }
    const heading = cfg.heading === 'none' ? '' : '<h2 part="heading">' + esc(cfg.heading || this._t('heading', { name: cfg.displayName || cfg.name })) + '</h2>';
    const tops = this._top.map((c) => ({ id: c.id, name: c.name, off: !c.actions.length }));
    if (this._rest.length) tops.push({ id: OTHERS, name: this._t('others'), off: false });
    const tabs = tops.map((c) => '<button class="tab' + (c.off ? ' off' : '') + '" part="tab" role="tab" id="tab-' + c.id + '" aria-controls="panel" aria-selected="' + (c.id === this._topId()) + '" data-id="' + c.id + '">'
      + this._dot(c.id) + esc(c.name) + '</button>').join('');
    const boxClass = 'box' + (cfg.buttonStyle === 'outline' ? ' outline' : '') + (cfg.audience === 'consumer' ? ' consumer' : '');
    root.innerHTML = '<style>' + CSS + '</style><div class="' + boxClass + '" part="box">' + heading
      + '<div class="tabs" role="tablist" aria-label="' + esc(this._t('clients')) + '" part="tabs">' + tabs + '</div>'
      + '<div class="panel" id="panel" role="tabpanel" part="panel"></div></div>';
    root.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => this._select(b.dataset.id)));
    root.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = tops.map((c) => c.id);
      const i = ids.indexOf(this._topId()) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = ids[(i + ids.length) % ids.length];
      this._select(next);
      root.getElementById('tab-' + next).focus();
    });
    const strip = root.querySelector('.tabs');
    const fade = () => strip.classList.toggle('more', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
    strip.addEventListener('scroll', fade, { passive: true });
    if (globalThis.ResizeObserver) new ResizeObserver(fade).observe(strip);
    fade();
    const sel = root.getElementById('tab-' + this._topId());
    if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.offsetLeft - 8);
    this._renderPanel();
  }

  _topId() {
    return this._rest && this._rest.some((c) => c.id === this._selected) ? OTHERS : this._selected;
  }

  _dot(id) {
    if (this._cfg.dots === 'none') return '';
    const c = this._registry.clients.find((x) => x.id === id);
    return c ? '<span class="dot" part="dot" style="background:' + esc(c.color || '#6b7280') + '"></span>' : '';
  }

  _select(id) {
    if (id === OTHERS) {
      const keep = this._rest.find((c) => c.id === this._lastOther);
      id = (keep || this._rest.find((c) => c.actions.length) || this._rest[0]).id;
    }
    this._selected = id;
    this._userPicked = true;
    if (this._rest.some((c) => c.id === id)) this._lastOther = id;
    const top = this._topId();
    this.shadowRoot.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === top)));
    const tab = this.shadowRoot.getElementById('tab-' + top);
    if (tab && tab.scrollIntoView) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this._renderPanel();
    this._emit('select', { client: id });
  }

  // Single-line text keeps Copy inside the box; multi-line gets a header row.
  _codeBlock(labelHtml, text, data) {
    const copy = '<button class="copy" part="copy" ' + data + '>' + esc(this._t('copy')) + '</button>';
    if (!String(text).includes('\n')) {
      return (labelHtml ? '<p class="label">' + labelHtml + '</p>' : '') + '<div class="code one"><pre part="code">' + esc(text) + '</pre>' + copy + '</div>';
    }
    return '<div class="head"><p class="label">' + labelHtml + '</p>' + copy + '</div><div class="code"><pre part="code">' + esc(text) + '</pre></div>';
  }

  _button(a, secondary) {
    const web = /^https?:/i.test(a.href);
    const kind = secondary ? 'secondary' : 'primary';
    return '<a class="btn ' + kind + '" part="button button-' + kind + '" data-method="' + esc(a.method) + '" href="' + esc(a.href) + '"' + (web ? ' target="_blank" rel="noopener"' : '') + '>' + esc(a.label) + '</a>';
  }

  _actionsHtml(c, actions, copyAttr, withUrl) {
    const cfg = this._cfg;
    const os = detectOs();
    const parts = [];
    const links = actions.filter((a) => a.kind === 'link');
    if (links.length) {
      parts.push('<div class="row">' + links.map((a, i) => this._button(a, i > 0 || !!c.listing)).join('') + '</div>');
      for (const a of links) if (a.note) parts.push('<p class="note">' + inline(a.note) + '</p>');
    }
    if (withUrl && cfg.url) parts.push('<div>' + this._codeBlock(esc(this._t('serverUrl')), cfg.url, copyAttr(cfg.url, 'url')) + '</div>');
    for (const a of actions) {
      if (a.kind === 'command' || a.kind === 'config') {
        let label = a.label;
        let extra = '';
        if (a.file) {
          const path = a.file[os] || a.file.any || Object.values(a.file)[0];
          label = this._t('fileIn', { file: '\x60' + path + '\x60' });
          const others = Object.entries(a.file).filter(([k, p]) => k !== os && k !== 'any' && p !== path);
          if (others.length) extra = '<details><summary>' + esc(this._t('otherOs')) + '</summary><ul>' + others.map(([k, p]) => '<li>' + esc(OS_LABEL[k]) + ': <code>' + esc(p) + '</code></li>').join('') + '</ul></details>';
        }
        parts.push('<div>' + this._codeBlock(inline(label), a.text, copyAttr(a.text, a.method)) + extra + (a.note ? '<p class="note">' + inline(a.note) + '</p>' : '') + '</div>');
      } else if (a.kind === 'steps') {
        parts.push('<div>' + (a.label ? '<p class="label">' + inline(a.label) + '</p>' : '') + '<ol>' + a.steps.map((s) => '<li>' + inline(s) + '</li>').join('') + '</ol>' + (a.note ? '<p class="note">' + inline(a.note) + '</p>' : '') + '</div>');
      }
    }
    return parts;
  }

  _infoLine(c, withChecked) {
    const bits = [];
    if (c.plans) bits.push('<span>' + esc(this._t('plans')) + ': ' + inline(c.plans) + '</span>');
    if (c.docs) bits.push('<a href="' + esc(c.docs) + '" target="_blank" rel="noopener">' + esc(this._t('docs')) + '</a>');
    if (withChecked && c.verified) bits.push('<span>' + esc(this._t('checked', { date: c.verified })) + '</span>');
    return bits.length ? '<div class="foot" part="footer">' + bits.join('') + '</div>' : '';
  }

  _renderPanel() {
    const c = this._plan.find((x) => x.id === this._selected);
    const panel = this.shadowRoot.getElementById('panel');
    if (!c) return;
    panel.setAttribute('aria-labelledby', 'tab-' + this._topId());
    const cfg = this._cfg;
    const consumer = cfg.audience === 'consumer';
    const hideFooter = this.hasAttribute('hide-footer') || cfg.hideFooter;
    const parts = [];
    this._copies = [];
    const copyAttr = (text, method) => { this._copies.push({ text, method }); return 'data-copy="' + (this._copies.length - 1) + '"'; };
    if (this._topId() === OTHERS) {
      parts.push('<div class="sub" role="group" part="subtabs">' + this._rest.map((o) => '<button class="subtab' + (o.actions.length ? '' : ' off') + '" part="subtab" aria-pressed="' + (o.id === c.id) + '" data-sub="' + o.id + '">' + this._dot(o.id) + esc(o.name) + '</button>').join('') + '</div>');
    }
    if (c.listing) {
      parts.push('<div class="row"><a class="btn primary" part="button button-primary" target="_blank" rel="noopener" data-method="directory" href="' + esc(c.listing) + '">' + esc(this._t('directory', { name: cfg.displayName || cfg.name, client: c.name })) + '</a></div>');
    }
    if (c.unsupported && !c.actions.length) parts.push('<p class="warn">' + esc(this._t('unsupported.' + c.unsupported, { client: c.name })) + '</p>');
    const hasSteps = c.actions.some((a) => a.kind === 'steps');
    const oneClick = c.actions.filter((a) => a.kind === 'link' && a.oneClick);
    if (consumer && oneClick.length) {
      // People who aren't developers: one button and one line; everything else behind "Didn't open?".
      parts.push('<div class="row">' + oneClick.slice(0, 1).map((a) => this._button(a, !!c.listing)).join('') + '</div>');
      const line = oneClick[0].short || oneClick[0].note;
      if (line) parts.push('<p class="note">' + inline(line) + '</p>');
      const rest = c.actions.filter((a) => a !== oneClick[0] && !(a.kind === 'link' && a.oneClick));
      const inner = this._actionsHtml(c, rest, copyAttr, hasSteps || !rest.length);
      if (!hideFooter) inner.push(this._infoLine(c, false));
      parts.push('<details class="manual" part="manual"><summary>' + esc(this._t('manual')) + '</summary><div class="inner">' + inner.join('') + '</div></details>');
    } else {
      parts.push(...this._actionsHtml(c, c.actions, copyAttr, hasSteps));
      if (c.actions.some((a) => a.bridged)) parts.push('<p class="note">' + esc(this._t('bridged')) + '</p>');
      else if (cfg.auth === 'oauth' && c.actions.length) parts.push('<p class="note">' + esc(this._t('oauth')) + '</p>');
      if (!hideFooter) {
        if (consumer) {
          const info = this._infoLine(c, false);
          if (info) parts.push('<details class="manual" part="manual"><summary>' + esc(this._t('more')) + '</summary><div class="inner">' + info + '</div></details>');
        } else {
          let lim = '';
          if (c.limits && c.limits.length) lim = '<details><summary>' + esc(this._t('limits')) + '</summary><ul>' + c.limits.map((l) => '<li>' + inline(l) + '</li>').join('') + '</ul></details>';
          parts.push(lim + this._infoLine(c, true));
        }
      }
    }
    panel.innerHTML = parts.join('');
    panel.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => this._copy(b)));
    panel.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => this._select(b.dataset.sub)));
    panel.querySelectorAll('a[data-method]').forEach((l) => l.addEventListener('click', () => this._emit('action', { client: c.id, method: l.dataset.method, kind: 'link', href: l.getAttribute('href') })));
  }

  async _copy(btn) {
    const item = this._copies[Number(btn.dataset.copy)];
    try {
      await navigator.clipboard.writeText(item.text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = item.text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
    }
    btn.textContent = this._t('copied');
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = this._t('copy'); btn.classList.remove('ok'); }, 1600);
    this._emit('action', { client: this._selected, method: item.method, kind: 'copy' });
  }
}

function define(tag = 'mcp-plug') {
  if (globalThis.customElements && !customElements.get(tag)) customElements.define(tag, McpPlugElement);
}



define();
export { plan, render, normalizeServer, badges, REGISTRY, VERSION, TEXTS, McpPlugElement, define };
