# Lessons from shipping MCP servers

What we learned putting five MCP servers in front of people in 2026: a real-estate data server (itbisp.com), a due-diligence app with OAuth (Dilligence), an agent-to-agent network (AICQ), a paid tools marketplace (Superpowers) and an Open Finance cash-flow app (Fluxo). Dated, because this field moves monthly.

## URLs and sign-in

- **No query string in the MCP URL.** `/mcp?source=x` made Claude connectors fail with "connection error" and ChatGPT with 424, and on our Cloudflare Worker the route didn't even match. Track the source another way. (itbisp, 2026-11)
- **URL-only clients need the credential in the URL or OAuth.** Claude and ChatGPT connectors take a URL and do OAuth; static headers are a limited beta in Claude and absent in ChatGPT. Before OAuth was ready, a personal URL with the key in the path (`/mcp/<key>`) worked everywhere; treat that URL as a password and let people revoke it. Clients that take headers (Claude Code, Codex, Cursor) get `Authorization: Bearer`. (AICQ, Fluxo)
- **Claude's add-connector link works.** `https://claude.ai/new?modal=add-custom-connector&connectorName=<name>&connectorUrl=<url>#customize/connectors` opens the dialog prefilled (replaces `claude.ai/customize/connectors?modal=…` and `claude.ai/settings/connectors`; ITBI SP, 2026-11-10). It isn't documented, so keep the manual steps next to it. (Dilligence, 2026-11)
- **Support CIMD and keep DCR.** Spec 2026-07-28 deprecates Dynamic Client Registration in favour of Client ID Metadata Documents, but Gemini's connected apps and Notion's agents still require DCR and Cursor has no CIMD yet. Claude, Claude Code, Codex and OpenCode use CIMD when the server offers it.
- **Name the issuer and resource on your own domain.** OAuth metadata that pointed at the hosting provider's hostname confused reviewers and clients; serve `/.well-known/oauth-protected-resource` and the authorization server metadata from the brand domain. (Dilligence)

## Directories

- **Official MCP Registry first.** One `server.json` and `mcp-publisher publish`. Domain namespaces (`com.example/*`) verify by DNS TXT or by an HTTP file at `/.well-known/mcp-registry-auth`; the HTTP route is easier when you can't edit DNS. PulseMCP and others import from it, and directory bots start probing your server within days. (itbisp, Dilligence, 2026-11)
- **Claude Connectors Directory** (claude.ai/directory/manage) needs a paid plan to submit, a title and read-only / destructive / open-world hints on every tool, privacy and terms pages, and a review account with sample data the reviewer can re-run. Keep that account funded and its data intact. (Dilligence, submitted 2026-11-06)
- **ChatGPT plugin directory** (platform.openai.com) takes a ZIP with `.codex-plugin/plugin.json` and `.mcp.json`, five positive and three negative test prompts, a demo video and domain verification. Don't sell digital goods inside ChatGPT: keep credit purchases off the ChatGPT endpoint. Uploading from a browser with the ChatGPT extension may need its file-URL permission. (Dilligence, 2026-11)
- **A server card helps indexers.** `/.well-known/mcp/server-card.json` with server info, transport, auth and the tool list lets directories describe a server whose tools sit behind login. (Dilligence, 2026-11-08)
- **Directories change under you.** PulseMCP paused its own submissions and imports from the registry; Smithery stopped hosting proxies and accounts at the end of October 2026 and is now part of Arcade; Glama lists remote connectors after a health check and lets you claim them by DNS. Check before you plan a submission. (itbisp, Superpowers, 2026-10/11)
- **One public repo can be four plugins.** A repo with `.claude-plugin/marketplace.json`, a Codex plugin, a Cursor `mcp.json` and a `SKILL.md` installs in Claude Code (`/plugin marketplace add owner/repo`), Codex, Cursor and any agent that reads skills. (dilligence-mcp, itbisp-plugin)

## Agents as users

- **Errors make agents give up.** When the database behind the server returned transient "internal error" on half the calls, Claude stopped using the tool for the rest of the task. Retry inside the server. (itbisp, 2026-11)
- **Count people, not probes.** Most early traffic is directory and security bots (index probers, auth probes, Amazonbot). `clientInfo.name` is often empty; log user agent, client, endpoint and account, and separate your own tests. Put events on install buttons ("add to Claude" clicks) to see the funnel. (itbisp, Dilligence)
- **Tool descriptions are the product.** Agents pick tools by description; a natural-language `q` argument and links in results changed what Claude and GPT did more than any page copy. Measure with a fixed bank of tasks before and after each change. (itbisp)
- **Codex runs servers in a sandbox.** Local servers that need the network or files outside the workspace may need sandbox settings; say so in the install steps. (AICQ)
- **Install text stays short.** One line per step; plans, limits and method notes go in a collapsed "good to know". (all)

