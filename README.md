# mcp-plug

How to plug an MCP server into every AI app, as data you can reuse. One registry covers Claude, ChatGPT, Claude Code, Codex, Cursor, VS Code, Gemini and 25+ other clients and personal agents, with sources. On top of it sit a zero-dependency install widget, README badges and a CLI.

**[Live demo](https://pqgventures.github.io/mcp-plug/)** · [Clients table](CLIENTS.md) · [Português](README.pt-BR.md)

## Put an install widget on your page

~~~html
<script type="module" src="https://pqgventures.github.io/mcp-plug/mcp-plug.js"></script>
<mcp-plug name="example" display-name="Example" url="https://example.com/mcp" auth="oauth"></mcp-plug>
~~~

The widget shows one tab per app: a one-click button where the app has one (Claude, Cursor, VS Code, Visual Studio, LM Studio, Goose, Poke), a command with a copy button for CLIs, the config file snippet with the right path for the visitor's OS, and short steps everywhere else. Apps that can't reach your server say why. Local servers work too: `command="npx -y your-mcp"`.

| Attribute | What it does |
| --- | --- |
| `name`, `display-name` | Server key and the name people see |
| `url` / `command` + `args` | Remote (Streamable HTTP) or local (stdio) server. `transport="sse"` for legacy SSE |
| `auth` | `oauth`, `none` or `headers`; `headers='{"Authorization":"Bearer YOUR_KEY"}'` |
| `clients` | Which apps and in what order, e.g. `claude-ai,chatgpt,cursor`. `all` for every app |
| `exclude`, `default-client` | Hide apps; pick the tab that opens first |
| `lang` | `en` or `pt` (default: the browser's language) |
| `theme` | `auto`, `light` or `dark`. Colours via CSS variables such as `--mp-accent` and `::part(button)` |
| `texts` | JSON to replace any text, e.g. `{"pt":{"heading":"Conecte o Fluxo"}}` |
| `listings` | JSON with your directory pages, e.g. `{"claude-ai":"https://claude.ai/directory/..."}` |
| `audience` | `consumer` for people who aren't developers: one button and one line, with manual steps, plans and docs under "Didn't open? Do it by hand"; developer tips hidden |
| `primary` | Apps that get their own tab, e.g. `claude-ai,chatgpt`; the rest share an "Others" tab |
| `button-style` | `outline` when the widget sits next to your own main button |
| `dots` | `none` hides the colour dots on tabs |

Style parts with `::part(box | heading | tabs | tab | dot | panel | button | button-primary | button-secondary | code | copy | manual | subtabs | subtab | footer)`.

It fires `mcp-plug:action` (`{client, method, kind}`) on every click and copy, so you can count installs. You can also set `element.config = {...}` from JavaScript, or self-host the single file `dist/mcp-plug.js` (ESM) or `dist/mcp-plug.global.js` (plain script).

## README badges

~~~sh
npx github:pqgventures/mcp-plug badges https://example.com/mcp --name example
~~~

GitHub strips app links such as `cursor://` and `vscode:` from READMEs, so badges use each vendor's https redirector when there is one and [open.html](docs/open.html) on GitHub Pages otherwise.

## CLI

~~~sh
npx github:pqgventures/mcp-plug https://example.com/mcp --name example --auth oauth
npx github:pqgventures/mcp-plug --name files -- npx -y @acme/files-mcp
npx github:pqgventures/mcp-plug clients
~~~

It prints the link, command or config for each app (`--client`, `--lang pt`, `--json`, `embed` for the HTML tag). To write config files on your own machine, [add-mcp](https://github.com/neon-solutions/add-mcp) does that well.

## The registry

One JSON file per app in [registry/clients](registry/clients), validated by [schema.json](registry/schema.json): transports, OAuth support (DCR, CIMD, PKCE), plans, limits, install methods with templates, and sources with the date each was checked. Text is in English and Brazilian Portuguese. Use the bundle directly: [dist/registry.json](dist/registry.json) or `import { plan } from 'mcp-plug/core'`.

Notes behind the data: [research/ECOSYSTEM.md](research/ECOSYSTEM.md) (spec, auth, registries, directories) and [research/LESSONS.md](research/LESSONS.md) (what broke and what got approved while we shipped MCP servers).

## Keeping it current

`npm test` validates every entry and renders every app for remote, header, local and SSE servers in both languages. `npm run check-links` hits every source and redirector; it also runs weekly in CI and opens an issue when something breaks. Each month we re-read every app's docs ([MAINTAINING.md](MAINTAINING.md)). Something wrong or missing? Open an issue or a PR that edits one JSON file; [docs/TEMPLATES.md](docs/TEMPLATES.md) explains the template syntax.

## License

MIT © PQG Ventures

