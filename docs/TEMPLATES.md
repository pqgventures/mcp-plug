# Install method templates

Each client lists `methods`. The widget, the CLI and the badges render them with the server the integrator describes.

~~~json
{
  "id": "deeplink",
  "kind": "link",
  "transport": "both",
  "label": { "en": "Add to Cursor", "pt": "Adicionar ao Cursor" },
  "template": "cursor://anysphere.cursor-deeplink/mcp/install?name={{name|uri}}&config={{entry|json|base64|uri}}",
  "webTemplate": "https://cursor.com/install-mcp?name={{name|uri}}&config={{entry|json|base64|uri}}"
}
~~~

- `kind`: `link` (a button), `command` (copy), `config` (file snippet, with `file` paths per OS and `format`), `steps` (numbered text).
- `transport`: `http`, `stdio` or `both`. Remote servers use `http` methods first; local servers use `stdio` ones.
- `headers: false` / `oauth: false` / `sse: false`: the method can't serve servers that need headers, OAuth or legacy SSE.
- `webTemplate`: the https form of an app-scheme link, used for README badges.
- `vars`: named JSON templates rendered first (in order) and usable in `template`.

## Values you can use

`name`, `displayName`, `url`, `transport` (`http`/`sse`), `headers` (object), `headerLines` (`["K: V"]`), `headerList` (`[{key,value}]`), `command`, `args`, `env`, `envPairs` (`["K=V"]`), `envList`, `description`, and the booleans `isRemote`, `oauth`, `sse`, `hasHeaders`, `hasEnv`.

Shapes most clients share: `entry` is `{url, headers}` for remote and `{command, args, env}` for local; `remoteEntry` and `localEntry` are the same but only in their mode; `commandArray` is `[command, ...args]`; `envLocal` is `env` in local mode.

## Syntax

- `{{value|filter|filter}}`. Filters: `json`, `pretty`, `base64` (UTF-8), `uri`, `shell` (POSIX quoting; arrays become quoted words), `toml`, `tomlkey`, `yaml`, `slug`, `lower`, `upper`.
- `{{#list}}…{{/list}}` repeats for arrays (`{{.}}`) and objects (`{{key}}`, `{{value}}`); for other truthy values it renders once. `{{#value?}}…{{/value?}}` renders once when not empty. `{{^value}}…{{/value}}` renders when empty or false.
- In `vars`, a string that is exactly `"{{value}}"` keeps the raw value (object, array); empty values are dropped, and the key `"..."` spreads an object into its parent: `{"type": "http", "...": "{{entry}}"}`.

Remote servers in clients that only run local servers get an automatic `npx -y mcp-remote <url>` bridge.

