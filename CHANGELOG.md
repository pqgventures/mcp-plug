# Changelog

Dates are when the registry was checked. Versions follow semver: minor for new clients or install methods, patch for corrections.

## 0.2.1 — 2026-11-10

- Claude (web and desktop): the add-connector link is now `https://claude.ai/new?modal=add-custom-connector&connectorName=…&connectorUrl=…#customize/connectors`, and `openUrl` is `https://claude.ai/new?modal=add-custom-connector#customize/connectors`. Replaces `claude.ai/customize/connectors?modal=…` and `claude.ai/settings/connectors`.

## 0.2.0 — 2026-11-08

Widget options asked for by the first product to embed it (Fluxo, an Open Finance app for regular people).

- `audience="consumer"`: one button and one short line; manual steps, server URL, plans and docs go under a closed "Didn't open? Do it by hand"; developer tips (limits) are hidden. New registry fields `oneClick` and `short` on install methods.
- `primary="claude-ai,chatgpt"`: only those apps get tabs; the rest sit behind an "Others" tab with sub-chips.
- `button-style="outline"` and new parts `button-primary`, `button-secondary`, `dot`, `manual`, `subtabs`, `subtab`.
- `dots="none"` hides the colour dots.
- Single-line commands and URLs keep the Copy button inside the box; multi-line snippets keep it in a header row.

## 0.1.0 — 2026-11-08

First release.

- Registry of 32 clients, each checked against official docs on 2026-11-08: Claude, ChatGPT, Claude Code, Codex, Cursor, VS Code, Claude Desktop, Gemini CLI, Windsurf, Gemini, Le Chat, Perplexity, Copilot Studio, Notion AI, Poke, Manus, Goose, LM Studio, Zed, Cline, Roo Code, Kilo Code, OpenCode, JetBrains AI, Visual Studio, Kiro, Warp, Raycast, Msty Studio, BoltAI, Amazon Q Developer and Instinct.
- `<mcp-plug>` web component (no dependencies, en and pt-BR, themes, events), README badges with an app-link redirector on GitHub Pages, CLI, demo page.
- Tests for the exact link encodings (Cursor, VS Code, LM Studio, Goose, Claude), CLI commands, and a sweep of every client × server type × language. Weekly link check in CI.
- Findings worth knowing: ChatGPT moved custom MCP servers to **Plugins** (chatgpt.com/plugins); Windsurf's agent now uses Devin's config (`~/.config/devin/mcp_config.json`); MCP spec 2026-07-28 deprecates DCR in favour of CIMD; Instinct has no way to add tools yet.

