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
- MCP: server `clickup-mcp-server`; manifest `mcp.clickup.json` declares tools/permissions. Tools must include: `create_space`, `create_folder`, `create_list`, `create_task`, `update_status`, `update_task`, `add_comment`, `assign_user`, `move_task`, `sync_file`, `run_nl_command`.
- Auth: `CLICKUP_API_TOKEN` with full read/write (Spaces, Folders, Lists, Tasks, Comments, Assignees, Status). Never hardcode tokens; load via env/secrets.
- Capabilities: create/edit/move/copy spaces/folders/lists/tasks; descriptions/status/priority/due dates; assign members; comments/attachments/subtasks; auto-build hierarchies; query/filter; sync local files and ClickUp; execute natural-language commands; conversation-driven automations.
- Behavioral rules: confirm destructive actions (delete/rename); validate parents exist or create; read current item before update and apply minimal diff; ask for missing assignee/space/list when ambiguous; avoid renames unless explicit; always return human-readable summaries and diffs.
- Approvals: create/read/update auto-approved; delete or permission changes require manual approval.
- Workflows: creation via chat (e.g., "Crie Space CRM IA com listas backlog, sprint, operacional"); sprint intake (convert bullets to tasks in active list, assign defaults); daily sync (query last 24h, report changes); sync uses `config/clickup-sync.json` mapping listId->local path and should avoid overwriting local edits, logging conflicts.
- Safety & logging: never log tokens; log IDs/status/diffs only; respect rate limits with exponential backoff; validate/sanitize user input; audit critical calls in `logs/` or external collector.
