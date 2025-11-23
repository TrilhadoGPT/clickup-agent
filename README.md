# ClickUp MCP – Deploy em Container (VPS)

Este guia mostra como rodar o **ClickUp MCP Server** dentro de um container Docker em qualquer VPS.
Depois de instalado, o agente fica disponível via HTTP, pronto para ser chamado por n8n, outros serviços ou scripts.

> 📌 Este README assume que o código deste projeto já está disponível em um repositório Git acessível (ex.: GitHub).

---

## ✅ 1. Pré-requisitos

Na **VPS**:

* Ubuntu ou distro Linux compatível
* Docker instalado
* Acesso à internet (para `git clone` e API do ClickUp)
* Token e Team ID do ClickUp:

  * `CLICKUP_API_TOKEN`
  * `CLICKUP_TEAM_ID`

---

## 🐳 2. Criar o container com Node 18

Na VPS, execute:

```bash
sudo docker run -it --name clickup-mcp \
  -p 3001:3001 \
  node:18-bullseye \
  bash
```

Explicação:

* `--name clickup-mcp` → nome do container
* `-p 3001:3001` → expõe a porta **3001** do container na VPS
* `node:18-bullseye` → imagem oficial do Node 18
* `bash` → abre um shell dentro do container

> Se você sair do container, pode voltar a ele mais tarde com:
>
> ```bash
> sudo docker start clickup-mcp
> sudo docker exec -it clickup-mcp bash
> ```

---

## 📥 3. Clonar o projeto dentro do container

Todos os passos abaixo são **dentro do container**.

1. Atualize pacotes e instale `git`:

   ```bash
   apt-get update
   apt-get install -y git ca-certificates
   ```

2. Clone o repositório do agente (substitua pela URL real):

   ```bash
   git clone https://github.com/SEU_USUARIO/SEU_REPO.git /opt/clickup-mcp
   cd /opt/clickup-mcp
   ```

3. Se existir `package.json`, instale dependências:

   ```bash
   npm install
   ```

---

## 🔐 4. Configurar variáveis de ambiente

Ainda **dentro do container**, defina:

```bash
export CLICKUP_API_TOKEN="SEU_TOKEN_DO_CLICKUP"
export CLICKUP_TEAM_ID="SEU_TEAM_ID"
export PORT=3001
export MCP_BASE_URL="http://IP_DA_VPS:${PORT}"
```

* `IP_DA_VPS` → IP público da VPS
* Porta padrão: `3001` (pode mudar, desde que ajuste o `-p` do Docker)

Opcional: gravar em um arquivo `.env`:

```bash
cat > .env <<EOF
CLICKUP_API_TOKEN=$CLICKUP_API_TOKEN
CLICKUP_TEAM_ID=$CLICKUP_TEAM_ID
PORT=$PORT
MCP_BASE_URL=$MCP_BASE_URL
EOF
```

---

## 🚀 5. Subir o servidor MCP

No diretório do projeto (`/opt/clickup-mcp`):

```bash
node mcp/clickup-mcp-server.js
```

Se tudo estiver certo, você verá algo como:

```text
clickup-mcp-server listening on port 3001
```

> 🔁 Para rodar em background, você pode:
>
> * usar `tmux` ou `screen`, ou
> * iniciar o container em modo `-d` (detached) em vez de `-it`.

---

## 🔎 6. Testar o agente a partir de fora do container

Em qualquer máquina que consiga acessar a VPS (até no seu PC local):

1. Defina a base URL:

   ```bash
   export MCP_BASE_URL="http://IP_DA_VPS:3001"
   ```

2. Liste as tools disponíveis:

   ```bash
   curl -s "$MCP_BASE_URL/tools"
   ```

3. Exemplos de uso:

   **Listar hierarchy (Spaces / Pastas / Listas)**

   ```bash
   curl -s -X POST "$MCP_BASE_URL/tools/get_workspace_hierarchy" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

   **Listar tarefas de uma lista**

   ```bash
   curl -s -X POST "$MCP_BASE_URL/tools/get_workspace_tasks" \
     -H "Content-Type: application/json" \
     -d '{"list_id":"LIST_ID"}'
   ```

   **Criar tarefa**

   ```bash
   curl -s -X POST "$MCP_BASE_URL/tools/create_task" \
     -H "Content-Type: application/json" \
     -d '{"list_id":"LIST_ID","name":"Minha nova tarefa","description":"Criada via MCP"}'
   ```

> Em qualquer lugar que for consumir o agente (n8n, outro backend, scripts), basta apontar para `http://IP_DA_VPS:3001` e usar os mesmos endpoints.

