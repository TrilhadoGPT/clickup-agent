# ClickUp MCP Server - Guia de Deploy em VPS

Este guia prepara o `clickup-mcp-server` para rodar em qualquer VPS e ser chamado via HTTP (cURL) com IP parametrizável. O servidor já expõe as tools MCP; basta definir as variáveis de ambiente e apontar o IP/porta nas requisições.

## Requisitos
- Node.js 18+ e npm instalados.
- Porta liberada (padrão `3001`) no firewall/segurança da VPS.

## Instalação
1. Clone o repositório na VPS:
   ```bash
   git clone <REPO_URL> /opt/clickup-mcp
   cd /opt/clickup-mcp
   npm install
   ```
2. Exporte variáveis de ambiente (substitua valores):
   ```bash
   export CLICKUP_API_TOKEN="seu_token_clickup"
   export CLICKUP_TEAM_ID="seu_team_id"
   export PORT=3001            # opcional, default 3001
   ```
3. Inicie o servidor:
   ```bash
   node mcp/clickup-mcp-server.js
   ```
   (Para manter em background, use `nohup ... &` ou um gerenciador como `pm2`/systemd.)

## Teste rápido
Defina o IP/porta da VPS em uma variável para uso nos cURL:
```bash
export MCP_BASE_URL="http://<SEU_IP>:3001"
```

- Listar tools disponíveis:
  ```bash
  curl -s "$MCP_BASE_URL/tools" | jq
  ```

- Listar espaços/pastas/listas (tool `get_workspace_hierarchy`):
  ```bash
  curl -s -X POST "$MCP_BASE_URL/tools/get_workspace_hierarchy" \
    -H "Content-Type: application/json" \
    -d '{}'
  ```

- Listar tarefas da lista `LIST_ID` (tool `get_workspace_tasks`):
  ```bash
  curl -s -X POST "$MCP_BASE_URL/tools/get_workspace_tasks" \
    -H "Content-Type: application/json" \
    -d '{"list_id":"LIST_ID"}'
  ```

- Criar tarefa em uma lista:
  ```bash
  curl -s -X POST "$MCP_BASE_URL/tools/create_task" \
    -H "Content-Type: application/json" \
    -d '{"list_id":"LIST_ID","name":"Título da tarefa","description":"Opcional"}'
  ```

## Observações
- O servidor já valida `CLICKUP_API_TOKEN`/`CLICKUP_TEAM_ID` e retorna erros claros em JSON.
- O binding é `0.0.0.0:<PORT>`, então o IP público da VPS será suficiente se a porta estiver aberta.
- Para atualizar IP em clientes, basta alterar `MCP_BASE_URL`; nenhuma mudança de código é necessária.
