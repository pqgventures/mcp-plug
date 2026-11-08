# Changelog

Dates are when the registry was checked. Versions follow semver: minor for new clients or install methods, patch for corrections.

## 0.1.0 — 2026-11-08

First release.

- Registry of 32 clients, each checked against official docs on 2026-11-08: Claude, ChatGPT, Claude Code, Codex, Cursor, VS Code, Claude Desktop, Gemini CLI, Windsurf, Gemini, Le Chat, Perplexity, Copilot Studio, Notion AI, Poke, Manus, Goose, LM Studio, Zed, Cline, Roo Code, Kilo Code, OpenCode, JetBrains AI, Visual Studio, Kiro, Warp, Raycast, Msty Studio, BoltAI, Amazon Q Developer and Instinct.
- `<mcp-plug>` web component (no dependencies, en and pt-BR, themes, events), README badges with an app-link redirector on GitHub Pages, CLI, demo page.
- Tests for the exact link encodings (Cursor, VS Code, LM Studio, Goose, Claude), CLI commands, and a sweep of every client × server type × language. Weekly link check in CI.
- Findings worth knowing: ChatGPT moved custom MCP servers to **Plugins** (chatgpt.com/plugins); Windsurf's agent now uses Devin's config (`~/.config/devin/mcp_config.json`); MCP spec 2026-07-28 deprecates DCR in favour of CIMD; Instinct has no way to add tools yet.

