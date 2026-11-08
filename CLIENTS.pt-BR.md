# Clientes

Gerado de `registry/clients/` por `npm run build`. Não edite à mão. [English](CLIENTS.md)

| App | Um clique | Remoto (HTTP) | Local (stdio) | OAuth | Planos | Conferido |
| --- | --- | --- | --- | --- | --- | --- |
| [Claude](registry/clients/claude-ai.json) | ✓ | ✓ | — | DCR, CIMD, PKCE | Todos os planos. O gratuito permite um conector personalizado. Em Team e Enterprise só os donos adicionam; os membros depois conectam. | 2026-11-08 |
| [ChatGPT](registry/clients/chatgpt.json) | — | ✓ | — | DCR, CIMD, PKCE | Documentado para Business, Enterprise e Edu na web (admins e donos, ou membros com a permissão de plugins). Para Plus e Pro varia; confira na sua conta. | 2026-11-08 |
| [Claude Code](registry/clients/claude-code.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | Qualquer pessoa que usa o Claude Code (Pro, Max, Team, Enterprise ou chave de API). Admins podem liberar ou bloquear servidores por configuração gerenciada. | 2026-11-08 |
| [Codex](registry/clients/codex.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | Qualquer pessoa que usa o Codex (plano do ChatGPT com Codex ou chave de API). CLI, app e extensão de IDE usam a mesma configuração. | 2026-11-08 |
| [Cursor](registry/clients/cursor.json) | ✓ | ✓ | ✓ | DCR, PKCE | Disponível para usuários individuais; admins Enterprise podem limitar servidores por comando e URL. | 2026-11-08 |
| [VS Code](registry/clients/vscode.json) | ✓ | ✓ | ✓ | DCR, PKCE | Qualquer plano do GitHub Copilot, inclusive o Free. Admins Business e Enterprise controlam o MCP por política. | 2026-11-08 |
| [Claude Desktop](registry/clients/claude-desktop.json) | ✓ | ✓ | ✓ | DCR, CIMD, PKCE | Qualquer plano, inclusive o gratuito. Em Team e Enterprise, os donos podem desligar extensões públicas ou manter uma lista permitida. | 2026-11-08 |
| [Gemini CLI](registry/clients/gemini-cli.json) | — | ✓ | ✓ | DCR, PKCE | Qualquer pessoa que roda o Gemini CLI (conta Google, chave de API, Vertex AI ou Code Assist). | 2026-11-08 |
| [Windsurf](registry/clients/windsurf.json) | — | ✓ | ✓ | DCR | A documentação não restringe por plano; admins Enterprise mantêm lista permitida e registros de MCP. | 2026-11-08 |
| [Gemini](registry/clients/gemini-app.json) | — | ✓ | — | DCR, PKCE | Contas Google pessoais, 18+, nos EUA, em inglês, com a Atividade ligada. O Workspace tem caminho próprio no Gemini Enterprise. | 2026-11-08 |
| [Le Chat](registry/clients/le-chat.json) | — | ✓ | — | DCR | Quem adiciona conectores é o admin. No Free, Pro e Student o dono da conta é o admin; em Team e Enterprise, um admin da organização. | 2026-11-08 |
| [Perplexity](registry/clients/perplexity.json) | — | ✓ | ✓ | ? | Não informado para servidores próprios. Servidores locais precisam do app da Mac App Store. | 2026-11-08 |
| [Copilot Studio](registry/clients/copilot-studio.json) | — | ✓ | — | DCR | Licença do Copilot Studio (ou Microsoft 365 Copilot / pré-pago) e um agente com orquestração generativa ligada. Valem as políticas de dados do Power Platform. | 2026-11-08 |
| [Notion AI](registry/clients/notion-ai.json) | — | ✓ | — | DCR | Business e Enterprise. Um admin precisa ligar **Enable custom MCP servers**. | 2026-11-08 |
| [Poke](registry/clients/poke.json) | ✓ | ✓ | — | DCR | Qualquer pessoa que usa o Poke, pelo app web. | 2026-11-08 |
| [Manus](registry/clients/manus.json) | — | ✓ | — | ✓ | Conectores prontos em todos os planos; o plano para servidores próprios não é informado. | 2026-11-08 |
| [Goose](registry/clients/goose.json) | ✓ | ✓ | ✓ | DCR, CIMD, PKCE | Gratuito e open source (Apache-2.0). | 2026-11-08 |
| [LM Studio](registry/clients/lm-studio.json) | ✓ | ✓ | ✓ | ? | App gratuito; MCP desde a versão 0.3.17. | 2026-11-08 |
| [Zed](registry/clients/zed.json) | — | ✓ | ✓ | ✓ | Configuração local, sem ligação com plano. | 2026-11-08 |
| [Cline](registry/clients/cline.json) | — | ✓ | ✓ | ✓ | Gratuito e open source. Admins Enterprise podem limitar servidores ou bloquear os pessoais. | 2026-11-08 |
| [Roo Code](registry/clients/roo-code.json) | — | ✓ | ✓ | ? | Open source; sem restrição de plano. | 2026-11-08 |
| [Kilo Code](registry/clients/kilo-code.json) | — | ✓ | ✓ | ✓ | Sem restrição de plano documentada. | 2026-11-08 |
| [OpenCode](registry/clients/opencode.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | Open source, sem restrição de plano. | 2026-11-08 |
| [JetBrains AI](registry/clients/jetbrains.json) | — | ✓ | ✓ | ✓ | Acesso ao JetBrains AI numa IDE da JetBrains (AI Assistant ou Junie). | 2026-11-08 |
| [Visual Studio](registry/clients/visual-studio.json) | ✓ | ✓ | ✓ | ✓ | Qualquer plano do GitHub Copilot, inclusive o Free. Visual Studio 2026, ou 2022 17.14+. | 2026-11-08 |
| [Kiro](registry/clients/kiro.json) | — | ✓ | ✓ | DCR, CIMD, PKCE | IDE, CLI e web; sem restrição de plano encontrada. O Enterprise tem um registro de MCP para governança. | 2026-11-08 |
| [Warp](registry/clients/warp.json) | — | ✓ | ✓ | ✓ | Sem restrição de plano para agentes locais; compartilhar com o time pede um time no Warp. | 2026-11-08 |
| [Raycast](registry/clients/raycast.json) | — | ✓ | ✓ | DCR, PKCE | Raycast Pro. No Enterprise, admins podem definir servidores para a organização. | 2026-11-08 |
| [Msty Studio](registry/clients/msty.json) | — | ✓ | ✓ | ✓ | Não informado. O Studio Web precisa do Studio Desktop para rodar ferramentas. | 2026-11-08 |
| [BoltAI](registry/clients/boltai.json) | — | ? | ✓ | ? | MCP desde o app de Mac 1.34; plano não informado. | 2026-11-08 |
| [Copilot CLI](registry/clients/copilot-cli.json) | — | ✓ | ✓ | ? | Qualquer plano do Copilot. Políticas da organização (registro e lista de MCP permitidos) podem limitar os servidores. | 2026-11-08 |
| [Augment Code](registry/clients/augment.json) | — | ✓ | ✓ | ? | Não informado. | 2026-11-08 |
| [Continue](registry/clients/continue.json) | — | ✓ | ✓ | ? | Open source; a configuração local não pede plano. | 2026-11-08 |
| [Amazon Q Developer](registry/clients/amazon-q.json) | — | ✓ | ✓ | ✓ | Não informado. A AWS agora indica o Kiro. | 2026-11-08 |
| [Instinct](registry/clients/instinct.json) | — | — | — | ? | Agente de consumo só por convite, no iMessage, WhatsApp e SMS. | 2026-11-08 |
