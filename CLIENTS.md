# Clients

Generated from `registry/clients/` by `npm run build`. Do not edit by hand. [Português](CLIENTS.pt-BR.md)

| App | One click | Remote (HTTP) | Local (stdio) | OAuth | Plans | Checked |
| --- | --- | --- | --- | --- | --- | --- |
| [Claude](registry/clients/claude-ai.json) | ✓ | ✓ | — | DCR, CIMD, PKCE | All plans. Free allows one custom connector. On Team and Enterprise only owners add connectors; members then connect. | 2026-11-08 |
| [ChatGPT](registry/clients/chatgpt.json) | — | ✓ | — | DCR, CIMD, PKCE | Documented for Business, Enterprise and Edu on the web (admins and owners, or members with the plugin permission). Plus and Pro availability varies; check in your account. | 2026-11-08 |
| [Claude Code](registry/clients/claude-code.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | Any Claude Code user (Pro, Max, Team, Enterprise or API key). Admins can allow or block servers with managed settings. | 2026-11-08 |
| [Codex](registry/clients/codex.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | Any Codex user (ChatGPT plan with Codex, or API key). The CLI, the desktop app and the IDE extension share the same config. | 2026-11-08 |
| [Cursor](registry/clients/cursor.json) | ✓ | ✓ | ✓ | DCR, PKCE | Available to individual users; Enterprise admins can allowlist servers by command and URL. | 2026-11-08 |
| [VS Code](registry/clients/vscode.json) | ✓ | ✓ | ✓ | DCR, PKCE | Any GitHub Copilot plan, Free included. Business and Enterprise admins control MCP by policy. | 2026-11-08 |
| [Claude Desktop](registry/clients/claude-desktop.json) | ✓ | ✓ | ✓ | DCR, CIMD, PKCE | Any plan, Free included. On Team and Enterprise, owners can turn off public extensions or keep an allowlist. | 2026-11-08 |
| [Gemini CLI](registry/clients/gemini-cli.json) | — | ✓ | ✓ | DCR, PKCE | Anyone running Gemini CLI (Google account, API key, Vertex AI or Code Assist). | 2026-11-08 |
| [Windsurf](registry/clients/windsurf.json) | — | ✓ | ✓ | DCR | Not restricted by plan in the docs; Enterprise admins keep an MCP allowlist and registries. | 2026-11-08 |
| [Gemini](registry/clients/gemini-app.json) | — | ✓ | — | DCR, PKCE | Personal Google accounts, 18+, in the US, in English, with Keep Activity on. Workspace has a separate path in Gemini Enterprise. | 2026-11-08 |
| [Le Chat](registry/clients/le-chat.json) | — | ✓ | — | DCR | Admins add connectors. On Free, Pro and Student the account owner is the admin; on Team and Enterprise an organization admin adds them. | 2026-11-08 |
| [Perplexity](registry/clients/perplexity.json) | — | ✓ | ✓ | ? | Not stated for custom servers. Local servers need the Mac App Store app. | 2026-11-08 |
| [Copilot Studio](registry/clients/copilot-studio.json) | — | ✓ | — | DCR | Copilot Studio license (or Microsoft 365 Copilot / pay-as-you-go) and an agent with generative orchestration on. Power Platform data policies apply. | 2026-11-08 |
| [Notion AI](registry/clients/notion-ai.json) | — | ✓ | — | DCR | Business and Enterprise. An admin must turn on **Enable custom MCP servers**. | 2026-11-08 |
| [Poke](registry/clients/poke.json) | ✓ | ✓ | — | DCR | Any Poke user, from the web app. | 2026-11-08 |
| [Manus](registry/clients/manus.json) | — | ✓ | — | ✓ | Ready-made connectors on every plan; the plan for custom servers isn't stated. | 2026-11-08 |
| [Goose](registry/clients/goose.json) | ✓ | ✓ | ✓ | DCR, CIMD, PKCE | Free and open source (Apache-2.0). | 2026-11-08 |
| [LM Studio](registry/clients/lm-studio.json) | ✓ | ✓ | ✓ | ? | Free app; MCP since version 0.3.17. | 2026-11-08 |
| [Zed](registry/clients/zed.json) | — | ✓ | ✓ | ✓ | Local setting, not tied to a plan. | 2026-11-08 |
| [Cline](registry/clients/cline.json) | — | ✓ | ✓ | ✓ | Free and open source. Enterprise admins can allowlist servers or block personal ones. | 2026-11-08 |
| [Roo Code](registry/clients/roo-code.json) | — | ✓ | ✓ | ? | Open source; no plan restriction. | 2026-11-08 |
| [Kilo Code](registry/clients/kilo-code.json) | — | ✓ | ✓ | ✓ | No plan restriction documented. | 2026-11-08 |
| [OpenCode](registry/clients/opencode.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | Open source, no plan restriction. | 2026-11-08 |
| [JetBrains AI](registry/clients/jetbrains.json) | — | ✓ | ✓ | ✓ | JetBrains AI access in a JetBrains IDE (AI Assistant or Junie). | 2026-11-08 |
| [Visual Studio](registry/clients/visual-studio.json) | ✓ | ✓ | ✓ | ✓ | Any GitHub Copilot plan, Free included. Visual Studio 2026, or 2022 17.14+. | 2026-11-08 |
| [Kiro](registry/clients/kiro.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | IDE, CLI and web; no plan restriction found. Enterprise has an MCP registry for governance. | 2026-11-08 |
| [Warp](registry/clients/warp.json) | — | ✓ | ✓ | ✓ | No plan gate for local agents; sharing servers with a team needs a Warp team. | 2026-11-08 |
| [Raycast](registry/clients/raycast.json) | — | ✓ | ✓ | DCR, PKCE | Raycast Pro. On Enterprise, admins can set servers for the organization. | 2026-11-08 |
| [Msty Studio](registry/clients/msty.json) | — | ✓ | ✓ | ✓ | Not stated. Studio Web needs Studio Desktop to run tools. | 2026-11-08 |
| [BoltAI](registry/clients/boltai.json) | — | ? | ✓ | ? | MCP since Mac app 1.34; plan not stated. | 2026-11-08 |
| [Copilot CLI](registry/clients/copilot-cli.json) | — | ✓ | ✓ | ? | Any Copilot plan. Organization policies (MCP registry and allowlist) can limit which servers run. | 2026-11-08 |
| [Augment Code](registry/clients/augment.json) | — | ✓ | ✓ | ? | Not stated. | 2026-11-08 |
| [Continue](registry/clients/continue.json) | — | ✓ | ✓ | ? | Open source; local config needs no plan. | 2026-11-08 |
| [Amazon Q Developer](registry/clients/amazon-q.json) | — | ✓ | ✓ | ✓ | Not stated. AWS now points people to Kiro. | 2026-11-08 |
| [Instinct](registry/clients/instinct.json) | — | — | — | ? | Invite-only consumer agent on iMessage, WhatsApp and SMS. | 2026-11-08 |
