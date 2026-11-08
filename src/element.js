import { plan, pick, render, normalizeServer, badges, VERSION } from './core.js';
import { REGISTRY } from './registry.data.js';

export const TEXTS = {
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
    clients: 'Apps',
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
    clients: 'Apps',
  },
};

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
.tab:hover{background:var(--mp-soft)}
.tab[aria-selected=true]{background:var(--mp-fg);color:var(--mp-bg);border-color:var(--mp-fg)}
.dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:0 0 0 1px var(--mp-border)}
.tab.off{opacity:.55}
.panel{display:grid;gap:14px;min-width:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--mp-accent);color:var(--mp-accent-fg);text-decoration:none;font-weight:600;font-size:15px;padding:11px 16px;border-radius:10px;border:0;cursor:pointer;min-height:44px}
.btn:hover{filter:brightness(1.06)}
.btn.secondary{background:var(--mp-soft);color:var(--mp-fg);border:1px solid var(--mp-border)}
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

export class McpPlugElement extends HTMLElement {
  static get observedAttributes() {
    return ['name', 'display-name', 'url', 'transport', 'command', 'args', 'env', 'headers', 'auth', 'lang', 'clients', 'exclude', 'default-client', 'heading', 'listings', 'texts', 'bridge', 'hide-footer'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._selected = null;
    this._registry = REGISTRY;
  }

  set config(v) { this._config = v; this._render(); }
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
      bridge: a('bridge') !== 'false',
      ...fromScript, ...(this._config || {}),
    };
    for (const k of Object.keys(cfg)) if (cfg[k] == null || cfg[k] === '') delete cfg[k];
    cfg.clients = cfg.clients ? list(cfg.clients) : undefined;
    cfg.exclude = cfg.exclude ? list(cfg.exclude) : undefined;
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
    const current = items.find((c) => c.id === this._selected);
    // Move off a tab that can't serve this server unless the visitor chose it.
    if (!current || (!current.actions.length && !this._userPicked)) {
      this._selected = (cfg.defaultClient && items.some((c) => c.id === cfg.defaultClient) && cfg.defaultClient) || (items.find((c) => c.actions.length) || items[0]).id;
    }
    const heading = cfg.heading === 'none' ? '' : '<h2 part="heading">' + esc(cfg.heading || this._t('heading', { name: cfg.displayName || cfg.name })) + '</h2>';
    const colors = Object.fromEntries(this._registry.clients.map((c) => [c.id, c.color || '#6b7280']));
    const tabs = items.map((c) => '<button class="tab' + (c.actions.length ? '' : ' off') + '" part="tab" role="tab" id="tab-' + c.id + '" aria-controls="panel" aria-selected="' + (c.id === this._selected) + '" data-id="' + c.id + '">'
      + '<span class="dot" style="background:' + esc(colors[c.id]) + '"></span>' + esc(c.name) + '</button>').join('');
    root.innerHTML = '<style>' + CSS + '</style><div class="box" part="box">' + heading
      + '<div class="tabs" role="tablist" aria-label="' + esc(this._t('clients')) + '" part="tabs">' + tabs + '</div>'
      + '<div class="panel" id="panel" role="tabpanel" part="panel"></div></div>';
    root.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => this._select(b.dataset.id)));
    root.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = items.map((c) => c.id);
      const i = ids.indexOf(this._selected) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = ids[(i + ids.length) % ids.length];
      this._select(next);
      root.getElementById('tab-' + next).focus();
    });
    const strip = root.querySelector('.tabs');
    const fade = () => strip.classList.toggle('more', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
    strip.addEventListener('scroll', fade, { passive: true });
    if (globalThis.ResizeObserver) new ResizeObserver(fade).observe(strip);
    fade();
    const sel = root.getElementById('tab-' + this._selected);
    if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.offsetLeft - 8);
    this._renderPanel();
  }

  _select(id) {
    this._selected = id;
    this._userPicked = true;
    this.shadowRoot.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
    const tab = this.shadowRoot.getElementById('tab-' + id);
    if (tab && tab.scrollIntoView) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this._renderPanel();
    this._emit('select', { client: id });
  }

  _codeBlock(labelHtml, text, data) {
    return '<div class="head"><p class="label">' + labelHtml + '</p><button class="copy" part="copy" ' + data + '>' + esc(this._t('copy')) + '</button></div>'
      + '<div class="code"><pre part="code">' + esc(text) + '</pre></div>';
  }

  _renderPanel() {
    const c = this._plan.find((x) => x.id === this._selected);
    const panel = this.shadowRoot.getElementById('panel');
    if (!c) return;
    panel.setAttribute('aria-labelledby', 'tab-' + c.id);
    const cfg = this._cfg;
    const os = detectOs();
    const parts = [];
    this._copies = [];
    const copyAttr = (text, method) => { this._copies.push({ text, method }); return 'data-copy="' + (this._copies.length - 1) + '"'; };
    if (c.listing) {
      parts.push('<div class="row"><a class="btn" part="button" target="_blank" rel="noopener" data-method="directory" href="' + esc(c.listing) + '">' + esc(this._t('directory', { name: cfg.displayName || cfg.name, client: c.name })) + '</a></div>');
    }
    if (c.unsupported) {
      parts.push('<p class="warn">' + esc(this._t('unsupported.' + c.unsupported, { client: c.name })) + '</p>');
    }
    const links = c.actions.filter((a) => a.kind === 'link');
    if (links.length) {
      parts.push('<div class="row">' + links.map((a, i) => {
        const web = /^https?:/i.test(a.href);
        return '<a class="btn' + (i || c.listing ? ' secondary' : '') + '" part="button" data-method="' + esc(a.method) + '" href="' + esc(a.href) + '"' + (web ? ' target="_blank" rel="noopener"' : '') + '>' + esc(a.label) + '</a>';
      }).join('') + '</div>');
      for (const a of links) if (a.note) parts.push('<p class="note">' + inline(a.note) + '</p>');
    }
    const hasSteps = c.actions.some((a) => a.kind === 'steps');
    if (hasSteps && cfg.url) {
      parts.push('<div>' + this._codeBlock(esc(this._t('serverUrl')), cfg.url, copyAttr(cfg.url, 'url')) + '</div>');
    }
    for (const a of c.actions) {
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
    if (c.actions.some((a) => a.bridged)) parts.push('<p class="note">' + esc(this._t('bridged')) + '</p>');
    else if (cfg.auth === 'oauth' && c.actions.length) parts.push('<p class="note">' + esc(this._t('oauth')) + '</p>');
    if (!this.hasAttribute('hide-footer') && !cfg.hideFooter) {
      const bits = [];
      if (c.plans) bits.push('<span>' + esc(this._t('plans')) + ': ' + inline(c.plans) + '</span>');
      if (c.docs) bits.push('<a href="' + esc(c.docs) + '" target="_blank" rel="noopener">' + esc(this._t('docs')) + '</a>');
      if (c.verified) bits.push('<span>' + esc(this._t('checked', { date: c.verified })) + '</span>');
      let lim = '';
      if (c.limits && c.limits.length) lim = '<details><summary>' + esc(this._t('limits')) + '</summary><ul>' + c.limits.map((l) => '<li>' + inline(l) + '</li>').join('') + '</ul></details>';
      parts.push(lim + '<div class="foot" part="footer">' + bits.join('') + '</div>');
    }
    panel.innerHTML = parts.join('');
    panel.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => this._copy(b)));
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

export function define(tag = 'mcp-plug') {
  if (globalThis.customElements && !customElements.get(tag)) customElements.define(tag, McpPlugElement);
}

export { plan, render, normalizeServer, badges, VERSION, REGISTRY };

