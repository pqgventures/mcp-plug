# mcp-plug

Como plugar um servidor MCP em todo app de IA, em forma de dados reutilizáveis. Um registro cobre Claude, ChatGPT, Claude Code, Codex, Cursor, VS Code, Gemini e mais de 25 outros clientes e agentes pessoais, com as fontes. Em cima dele há um componente de instalação sem dependências, badges para o README e um CLI.

**[Demonstração](https://pqgventures.github.io/mcp-plug/)** · [Tabela de clientes](CLIENTS.pt-BR.md) · [English](README.md)

## Componente de instalação na sua página

~~~html
<script type="module" src="https://pqgventures.github.io/mcp-plug/mcp-plug.js"></script>
<mcp-plug name="fluxo" display-name="Fluxo" url="https://exemplo.com/mcp" auth="oauth" lang="pt"></mcp-plug>
~~~

Uma aba por app: botão de um clique onde o app tem (Claude, Cursor, VS Code, Visual Studio, LM Studio, Goose, Poke), comando com botão de copiar nos CLIs, o trecho do arquivo de configuração com o caminho do sistema de quem visita e passos curtos nos demais. Quando um app não alcança o servidor, ele diz por quê. Servidores locais também: `command="npx -y seu-mcp"`.

Atributos principais: `name`, `display-name`, `url` ou `command`, `auth` (`oauth`, `none`, `headers`), `clients` (quais apps e em que ordem; `all` para todos), `lang` (`pt` ou `en`), `theme` (`auto`, `light`, `dark`), `texts` (JSON para trocar qualquer texto) `listings` (suas páginas nos diretórios), `audience="consumer"` (para quem não é desenvolvedor: um botão e uma linha, com os passos à mão, planos e documentação dentro de "Não abriu? Faça à mão"), `primary="claude-ai,chatgpt"` (só esses ganham aba; o resto fica em "Outros"), `button-style="outline"` e `dots="none"`. Cores por variáveis CSS (`--mp-accent` e outras). A tabela completa está no [README em inglês](README.md#put-an-install-widget-on-your-page).

Cada clique e cópia dispara `mcp-plug:action` (`{client, method, kind}`) para você contar instalações. Dá para hospedar o arquivo único `dist/mcp-plug.js` no seu domínio.

## Badges e CLI

~~~sh
npx github:pqgventures/mcp-plug badges https://exemplo.com/mcp --name fluxo --lang pt
npx github:pqgventures/mcp-plug https://exemplo.com/mcp --name fluxo --auth oauth --lang pt
~~~

O GitHub remove links como `cursor://` e `vscode:` do README; os badges usam o redirecionador https de cada fabricante quando existe e o [open.html](docs/open.html) do GitHub Pages nos outros casos.

## O registro

Um JSON por app em [registry/clients](registry/clients), validado pelo [schema.json](registry/schema.json): transportes, OAuth (DCR, CIMD, PKCE), planos, limites, métodos de instalação com templates e fontes com a data em que foram conferidas. Textos em português e inglês. Notas de pesquisa em [research/](research/), inclusive os [aprendizados](research/LESSONS.md) de colocar servidores MCP no ar e nos diretórios.

## Manutenção

`npm test` valida tudo e gera cada app para servidores remotos, com cabeçalho, locais e SSE nos dois idiomas. `npm run check-links` confere cada fonte e redirecionador e roda toda semana no CI. Todo mês relemos a documentação de cada app ([MAINTAINING.md](MAINTAINING.md)).

Licença MIT © PQG Ventures

