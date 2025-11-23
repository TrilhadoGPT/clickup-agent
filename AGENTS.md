# Repository Guidelines

## Project Structure & Module Organization
- `src/agents/` holds MCP agents; `src/mcp/` stores manifests/clients; `config/` keeps credentials and sync mappings; `tests/` covers unit/integration; `docs/` captures integration notes.
- Each agent ships a README plus its MCP manifest. Keep ClickUp API logic in `src/mcp/services/` and conversational flows in `src/agents/`.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run build` compiles artifacts for release/packaging.
- `npm run dev` runs locally with reload.
- `npm test` executes the suite; `npm run lint` enforces style/format.

## Coding Style & Naming Conventions
- TypeScript/JavaScript, 2-space indent, single quotes, no semicolons.
- Run ESLint + Prettier via `npm run lint` before PRs.
- Name MCP manifests `mcp.<agent>.json`; clients in PascalCase; handlers `verbObjectHandler`.

## Testing Guidelines
- Favor unit tests with mocked ClickUp calls; reserve E2E for full flows.
- Tests live in `tests/*.spec.ts`; run `npm test` pre-PR.
- Cover 401/429 handling, retries, and natural-language request/response mapping.

## Commit & Pull Request Guidelines
- Conventional Commits with agent scope when relevant (e.g., `feat(clickup): ...`).
- PRs: summary, test/lint output, linked issue, and manifest impact (new tools/permissions/breaking changes).

## ClickUp MCP Agent: ClickUp Autonomous Operator
- MCP: usa o servidor `clickup-mcp-server` definido em `mcp/mcp-manifest.json` (entryPoint `node mcp/clickup-mcp-server.js`). Para qualquer pedido de ClickUp (criar/editar tarefa, listar hierarquia, comentar, membros), SEMPRE chamar as tools MCP do manifest.
- Auth: `CLICKUP_API_TOKEN` (ou `CLICKUP_API_KEY`) e `CLICKUP_TEAM_ID` via env/secrets; nunca logar ou hardcode tokens.
- Tools MCP expostas:
  - Workspace: `get_workspace_hierarchy`, `get_list`
  - Tasks: `create_task`, `get_task`, `update_task`, `get_workspace_tasks`
  - Comments: `get_task_comments`, `create_task_comment`
  - Members: `get_workspace_members`, `find_member_by_name`
- Regras de operação: confirmar ações destrutivas; validar Space/Folder/List antes de criar/mover; ler estado atual antes de atualizar e aplicar dif mínimo; pedir assignee/space/list quando faltando; evitar renomear sem ordem explícita; respostas sempre em linguagem natural com resumo e IDs relevantes. Criação/leitura/edição auto-aprovadas; exclusões ou mudanças de permissão exigem confirmação explícita.
- Workflows exemplo:
  - Novo projeto com listas padrão: usar `get_workspace_hierarchy` para localizar Space/Folder/List, criar listas se necessário e semear tarefas iniciais com `create_task` (ex.: backlog, discovery, kickoff).
  - Preparar daily: `get_workspace_tasks` filtrando por `assignees` e janela (`due_date_gt/lt`) para listar pendências e próximos passos.
  - Atualizar status em lote: buscar com `get_workspace_tasks` (por lista/status/assignee), pedir confirmação e aplicar `update_task` em cada `task_id`.
  - Revisar/registrar decisões: ler com `get_task_comments` e escrever com `create_task_comment` indicando próximos passos ou bloqueios.
- Segurança e logging: nunca logar tokens; logar apenas IDs/status/diffs; respeitar rate limits com backoff; sanitizar entradas; auditar chamadas críticas em `logs/` ou coletor configurado.
