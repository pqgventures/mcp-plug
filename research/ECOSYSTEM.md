# MCP ecosystem notes (checked 2026-11-08)

Fetched from official repos, docs and the npm/PyPI/GitHub APIs on 2026-11-08. PulseMCP and mcpservers.org sit behind Cloudflare challenges, so they are described only at a high level.

## 1. Spec versions and what changed for installers

Dated spec folders in modelcontextprotocol/modelcontextprotocol/docs/specification: 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25, **2026-07-28**, draft. https://modelcontextprotocol.io/specification/latest now redirects to **2026-07-28**.

- **2025-06-18**: removed JSON-RPC batching; added structured tool output and elicitation; MCP servers became OAuth Resource Servers (Protected Resource Metadata) and clients **MUST** implement Resource Indicators (RFC 8707). Source: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/changelog.mdx
- **2025-11-25**: OpenID Connect Discovery support for authorization server discovery; icons for tools/resources/prompts (SEP-973); incremental scope consent via WWW-Authenticate (SEP-835); URL-mode elicitation (SEP-1036); **Client ID Metadata Documents (CIMD) added as the recommended registration mechanism** (SEP-991); Protected Resource Metadata discovery aligned with RFC 9728, WWW-Authenticate optional with .well-known fallback (SEP-985). Source: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/changelog.mdx
- **2026-07-28** (current): MCP becomes **stateless**. No `initialize` handshake and no `Mcp-Session-Id`; protocol version and client capabilities travel in `_meta` on every request; new `server/discover` RPC (servers MUST implement); `subscriptions/listen` replaces the HTTP GET stream; SSE resumability removed; Multi Round-Trip Requests replace server-initiated requests (sampling, elicitation, roots); required `resultType`; required `Mcp-Method`/`Mcp-Name` headers on Streamable HTTP POSTs plus `x-mcp-header`; `ttlMs`/`cacheScope` on list results; tasks moved to an extension. **Deprecated**: Roots, Sampling, Logging, and **Dynamic Client Registration** (kept only for backward compatibility with authorization servers that lack CIMD). Source: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx

### Authorization in 2026-07-28
Source folder: https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/docs/specification/2026-07-28/basic/authorization (index, authorization-server-discovery, client-registration, security-considerations).

- Applies to HTTP transports; stdio implementations "SHOULD NOT" follow it and take credentials from the environment.
- Authorization servers MUST implement OAuth 2.1. PKCE is part of the flow: the client stores the PKCE code verifier together with the recorded issuer.
- MCP servers MUST implement **Protected Resource Metadata (RFC 9728)**, and clients MUST use it to discover the authorization server. Clients MUST support both discovery mechanisms (RFC 8414 metadata and OpenID Connect Discovery).
- Client registration priority (client-registration.mdx): pre-registered client info first, then CIMD, then DCR. Clients and authorization servers **SHOULD support CIMD**: the client_id is an https URL with a path (for example https://example.com/client.json) that serves JSON with at least client_id, client_name and redirect_uris. DCR (RFC 7591) is deprecated; clients that still use it must send a suitable application_type (SEP-837).
- Clients MUST send the RFC 8707 `resource` parameter (the canonical server URI, preferably without a trailing slash) in authorization and token requests, whether or not the authorization server supports it.
- New in 2026-07-28: authorization servers SHOULD return `iss` (RFC 9207) and clients MUST validate it when present (SEP-2468). Credentials are bound to the issuing authorization server and must be re-registered if it changes (SEP-2352).
- Tokens go only in the Authorization header, never in the query string. Servers MUST validate the audience and answer 401 for invalid tokens. Scope challenges in WWW-Authenticate drive step-up authorization.

**What this means for mcp-plug:** a server that wants one-click installs in as many clients as possible should, in 2026, support CIMD and still accept DCR. Notion's agents, Raycast ("Dynamic" OAuth), Poke and goose rely on DCR or CIMD, and Notion refuses OAuth servers without DCR unless a static API key works. Static bearer headers remain the common fallback (LM Studio, Warp, Manus, Msty, Poke apiKey), but any header embedded in a public install link leaks the secret. The transport field should say `http` (Streamable HTTP). SSE is out of the current spec's mainline, and some clients (Msty) never supported it.

## 2. Official MCP Registry
- URL: https://registry.modelcontextprotocol.io (API docs at /docs; list endpoint `/v0/servers`; API frozen at **v0.1** since 2025-10-24). Repo: https://github.com/modelcontextprotocol/registry, latest release **v1.8.8 (2026-11-06)**. Still labelled preview, so data resets are possible before GA.
- Each entry is a `server.json`. Current schema seen in live API output: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`. Key fields: `name` (namespaced), `title`, `description`, `version`, `packages[]` (npm, pypi, oci, nuget, mcpb, with runtime args and env vars) and/or `remotes[]` (`{type: "streamable-http" | "sse", url, headers?}`). The registry adds `_meta["io.modelcontextprotocol.registry/official"]` with status, publishedAt and isLatest.
- Publishing: `mcp-publisher init` → edit server.json → `mcp-publisher login github` (or dns / http) → `mcp-publisher publish` (`validate` also exists). Namespaces: GitHub auth gives `io.github.<user|org>/*`; domain auth gives reverse-DNS names such as `com.example/*`. For npm packages, `package.json` must carry `"mcpName"` equal to the server.json `name`. The registry verifies namespace ownership but does not verify that you control a remote URL. Docs: https://github.com/modelcontextprotocol/registry/tree/main/docs/modelcontextprotocol-io (quickstart, authentication, remote-servers, package-types, registry-aggregators, github-actions).
- **Borrow:** use server.json as mcp-plug's input format. One server.json (remotes plus packages) holds everything needed to render each client's deeplink or config. Licence not re-checked today.

## 3. Directories
| Site | What it is today | Notes / what to borrow |
|---|---|---|
| Smithery: https://smithery.ai | Registry and hosted gateway. Page title: "Smithery · MCP servers, **now part of Arcade**". CLI moved to npm package `smithery` (v1.2.0, 2026-05-31, Node 20+): `smithery mcp search/add/list/remove`, `smithery tool call`, `smithery mcp publish <url or .mcpb>`, plus skills. The older `@smithery/cli install <server> --client <x>` (v4.11.1, modified 2026-04-30) is legacy. | Its old per-client "Installation > Auto" dropdown is still what some client docs (BoltAI) point to. |
| Glama: https://glama.ai/mcp/servers | "Open-Source MCP Servers – 117,443 in the Glama Registry". | Largest count; per-server checks. |
| mcp.so: https://mcp.so | "MCP Servers for Claude, Cursor & AI Agents", with remote endpoints and setup guides per client. | Per-client setup copy. |
| PulseMCP: https://www.pulsemcp.com | Directory and newsletter; its maintainer Tadas Antanavicius is on the official Registry working group. Cloudflare blocked curl today. | Good list of which clients exist. |
| mcpservers.org | Directory (Cloudflare challenge today). | Not checked. |
| add-mcp registry: https://add-mcp.com/registry | Registry behind `npx add-mcp find`; its config at ~/.config/add-mcp/config.json can point at the official registry. | Registry-compatible client setup. |
| punkpeye/awesome-mcp-servers | 97.5k stars, pushed 2026-11-06, MIT. | Main community list. |
| wong2/awesome-mcp-servers | 4.4k stars, pushed 2026-07-13, MIT. | |
| appcypher/awesome-mcp-servers | 5.8k stars, pushed 2026-05-06, no licence. | Getting stale. |
| modelcontextprotocol/servers | 91.9k stars, pushed 2026-11-05. | Reference servers. |

## 4. Existing open-source installers and button generators
| Project | Version / freshness | Licence | What it does | Borrow |
|---|---|---|---|---|
| **add-mcp** (https://github.com/neon-solutions/add-mcp, npm `add-mcp`) | 2.6.1, npm modified 2026-11-01, 321 stars | Apache-2.0 | `npx add-mcp <url or package> [--agent x] [--env] [--args] [--header]` and `find`; programmatic `upsertServer(agent, name, {type: "http", url}, {local: true})`. Supports Claude Code, Codex, Cursor, OpenCode, VS Code, Grok Build and 19 more (Antigravity, Cline, Claude Desktop, Factory Droid, fx, Gemini CLI, goose, Copilot CLI and others), with project and global paths per agent. | Best maintained path table per agent; `${VAR}` placeholders that prompt; a programmatic API we can call or mirror. |
| **install-mcp** (https://github.com/supermemoryai/install-mcp) | 1.10.2, npm modified 2026-01-02, repo pushed 2026-10-26, 197 stars | MIT | `npx install-mcp <pkg|cmd|url> --client <x> [--header ...]`; infers names from URLs, asks whether a remote server uses OAuth, writes Warp-style args. | Name inference rules and OAuth prompt flow. |
| **mcpm.sh** (https://github.com/pathintegral-institute/mcpm.sh, PyPI `mcpm`) | 2.15.0, repo pushed 2026-11-04, about 1k stars | MIT | "Homebrew-like" manager across clients, with profiles and a router. The npm package `mcpm` is an unrelated Minecraft tool. | Grouping servers into profiles per client. |
| **mcp-get** (npm `mcp-get`, now mcpskills/mcp-get) | 0.1.0, modified 2026-01-17; the original michaellatman/mcp-get is archived | MIT | Package manager mostly for Claude Desktop. | Mostly historical. |
| **Smithery CLI** | see above | | Registry-backed connect and publish. | MCPB bundle publishing. |
| Vendor generators | goose: https://goose-docs.ai/deeplink-generator/ ; LM Studio: generator on https://lmstudio.ai/docs/app/mcp/deeplink and badges at https://files.lmstudio.ai/deeplink/mcp-install-light.svg / -dark.svg ; Poke: prefill URL https://poke.com/integrations/new?name=&url=&apiKey= | | Vendor-approved formats. | Copy exact encodings into mcp-plug templates. |
| @modelcontextprotocol/inspector | 2.14.0, 2026-11-05 | see repo | Debug and test servers. | Run in CI to check a server before generating buttons. |

## 5. Takeaways for the mcp-plug data model
1. Encodings vary a lot. goose uses repeated `arg=` params and a cmd allowlist (jbang, npx, uvx, goosed, docker); LM Studio base64-encodes a **bare server entry** (no `mcpServers` wrapper, no name); Poke takes plain query params; Msty takes a bare object; Warp, BoltAI and LM Studio files use `mcpServers`; goose YAML uses `uri` for the remote URL. The model needs a per-client entry shape (wrapped or bare, `url` or `uri`, allowed `type` values).
2. Several clients now read other clients' config files: Warp reads ~/.claude.json, ~/.codex/config.toml and ~/.agents/.mcp.json; BoltAI imports from Cursor and Claude. Writing one well-known file can make a server show up in several clients.
3. Plan gates matter as much as protocol support: Raycast needs Pro; Notion needs Business or Enterprise plus an admin toggle; Manus's custom-server plan is unclear.
4. Messaging agents differ completely. Poke is open (prefill link, CLI, recipes with revenue share, X-Poke-User-Id header); Instinct has no public tool or MCP channel.
5. Track spec 2026-07-28: stateless servers and the DCR deprecation will break assumptions in older clients, so record per client whether it supports CIMD.


## 6. How clients compare on install paths (2026-11)

- **True one-click links:** Claude (prefilled add-connector dialog, undocumented), Cursor (`cursor://…/mcp/install` and `cursor.com/install-mcp`), VS Code and Insiders (`vscode:mcp/install` and `vscode.dev/redirect/mcp/install`), Visual Studio (`vsweb+mcp://install/` and `vs-open.link/mcp-install`), LM Studio (`lmstudio://add_mcp` and `lmstudio.ai/install-mcp`), Goose (`goose://extension`), Poke (`poke.com/integrations/new?name=&url=`).
- **Opens the right screen only:** ChatGPT (`chatgpt.com/plugins`), Gemini (`gemini.google.com/apps`), Manus (`manus.im/app?openConnectors=true`), Warp (`warp://settings/mcp`).
- **CLI command:** Claude Code, Codex, Gemini CLI, Devin/Windsurf, Cline, OpenCode, VS Code (`code --add-mcp`), Poke.
- **Config file only:** Zed (`context_servers`), Kiro, Roo Code, Kilo Code, Amazon Q, JetBrains Junie, BoltAI.
- **Remote only:** Claude, ChatGPT, Gemini, Le Chat, Copilot Studio, Notion AI, Manus, Poke. **No custom servers:** Instinct.
- **Key spellings differ:** Gemini CLI `httpUrl` (Streamable HTTP) vs `url` (SSE); Cline `streamableHttp`; Roo `streamable-http`; legacy Windsurf `serverUrl`; Goose `uri`; OpenCode and Kilo `type: remote|local` with one `command` array and `environment`; VS Code and Visual Studio `servers` instead of `mcpServers`; Zed `context_servers`.

