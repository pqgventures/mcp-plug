# Maintaining mcp-plug

The registry is only useful if it is right this month. Three loops keep it there.

## Every change

`npm test` must pass: it rebuilds `dist/` and `docs/`, validates every client file against the schema, and renders every client for remote, header, local and SSE servers in English and Portuguese. Commit the rebuilt files with the change (CI fails when they are stale).

## Weekly (CI)

`.github/workflows/links.yml` runs `npm run check-links` every Monday. When a source, docs page or redirector stops answering, it opens or updates the issue "Link check failed". 401/403/429 count as reachable (vendors block bots) and are listed for a manual look.

## Monthly review

1. Run `npm run check-links` and fix anything broken (a moved doc usually means the product changed too).
2. For each client in `registry/order.json`, re-read the pages in its `sources` and its changelog. Check: install links and their encoding, config file path and keys, remote vs local, OAuth (DCR, CIMD, PKCE), static headers, plans, limits. Update the entry, set `verified` and each source's `checked` to today, and lower `confidence` when something can't be confirmed.
3. Look for new clients worth adding (new desktop agents, IDEs, chat apps, messaging agents) and for clients that lost MCP support. Candidates on the list today: Continue, Augment, GitHub Copilot CLI, Antigravity, Factory Droid, Grok.
4. Re-read the MCP spec changelog (the newest dated folder under `docs/specification`) and update [research/ECOSYSTEM.md](research/ECOSYSTEM.md).
5. `npm test`, add a CHANGELOG entry (what changed per client, with the date), bump the version (minor for new clients or methods, patch for fixes), commit and push. GitHub Pages updates the demo and the hosted `mcp-plug.js` on push.
6. Tell projects that embed the widget when a method they show changed (they may self-host an older copy).

## Adding a client

Copy a similar file in `registry/clients/`, keep `id` equal to the file name, add it to `registry/order.json`, and write templates as described in [docs/TEMPLATES.md](docs/TEMPLATES.md). Every claim needs a source with a URL. Then `npm test`.

