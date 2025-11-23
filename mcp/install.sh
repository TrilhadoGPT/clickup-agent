#!/usr/bin/env bash
# Installer para rodar o clickup-mcp-server em uma VPS via systemd.
# Uso: bash mcp/install.sh
# Requisitos: git, node (>=18), npm, systemd; permissões sudo para instalar serviço.

set -euo pipefail

REPO_URL_DEFAULT="https://github.com/SEU_USUARIO/SEU_REPO.git"
INSTALL_DIR_DEFAULT="/opt/clickup-mcp"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
NPM_BIN="${NPM_BIN:-/usr/bin/npm}"

prompt() {
  local var_name="$1" prompt_text="$2" default_value="${3-}"
  local value
  if [ -n "$default_value" ]; then
    read -r -p "$prompt_text [$default_value]: " value
    value="${value:-$default_value}"
  else
    while true; do
      read -r -p "$prompt_text: " value
      if [ -n "$value" ]; then break; fi
    done
  fi
  printf '%s' "$value"
}

echo "== Configuração do ClickUp MCP =="
REPO_URL="$(prompt repo_url "URL do repositório Git" "$REPO_URL_DEFAULT")"
INSTALL_DIR="$(prompt install_dir "Diretório de instalação" "$INSTALL_DIR_DEFAULT")"
PORT="$(prompt port "Porta para o servidor (padrão 3001)" "3001")"
CLICKUP_API_TOKEN="$(prompt token "CLICKUP_API_TOKEN (obrigatório)")"
CLICKUP_TEAM_ID="$(prompt team "CLICKUP_TEAM_ID (obrigatório)")"
MCP_BASE_URL="$(prompt base_url "Base URL para chamadas HTTP (ex: http://IP_DA_VPS:${PORT})")"

echo ""
echo "== Clonando/atualizando repositório =="
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch --all
  git -C "$INSTALL_DIR" reset --hard origin/HEAD
else
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$(id -u)":"$(id -g)" "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo "== Instalando dependências =="
$NPM_BIN install

echo "== Gravando .env =="
cat > "$INSTALL_DIR/.env" <<EOF
CLICKUP_API_TOKEN=$CLICKUP_API_TOKEN
CLICKUP_TEAM_ID=$CLICKUP_TEAM_ID
PORT=$PORT
MCP_BASE_URL=$MCP_BASE_URL
EOF

echo "== Criando serviço systemd =="
SERVICE_FILE="/etc/systemd/system/clickup-mcp.service"
sudo bash -c "cat > '$SERVICE_FILE'" <<EOF
[Unit]
Description=ClickUp MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NODE_BIN mcp/clickup-mcp-server.js
Restart=always
RestartSec=5
User=$(whoami)
Group=$(id -gn)

[Install]
WantedBy=multi-user.target
EOF

echo "== Habilitando e iniciando serviço =="
sudo systemctl daemon-reload
sudo systemctl enable --now clickup-mcp.service

echo ""
echo "== Pronto! Teste com: =="
cat <<EOF
export MCP_BASE_URL="$MCP_BASE_URL"
curl -s "\$MCP_BASE_URL/tools" | jq
curl -s -X POST "\$MCP_BASE_URL/tools/get_workspace_hierarchy" -H "Content-Type: application/json" -d '{}'
EOF

