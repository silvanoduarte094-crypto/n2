#!/usr/bin/env bash
# Starts the N2 bridge inside a GitHub Codespace and prints the public URL + token.
# The web app (GitHub Pages) can then use GitHub Models and other providers without CORS issues.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f dist/index.html ] || [ ! -f server/dist/server.cjs ]; then
  echo "Compilando o N2 (a primeira vez leva ~1 minuto)..."
  npm run build:all
fi

TOKEN_FILE=.codespace-token
if [ ! -f "$TOKEN_FILE" ]; then
  node -e "process.stdout.write(require('node:crypto').randomBytes(18).toString('base64url'))" > "$TOKEN_FILE"
fi
TOKEN="$(cat "$TOKEN_FILE")"

BRIDGE_URL="https://${CODESPACE_NAME:-codespace}-7331.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"

echo ""
echo "======================================================"
echo "  N2 bridge ativo no Codespaces"
echo ""
echo "  Proxy URL : $BRIDGE_URL"
echo "  Token     : $TOKEN"
echo ""
echo "  Cole os dois em: Configurações > Geral > Proxy / bridge"
echo "  (e o token em 'Token do proxy')."
echo "======================================================"
echo ""

export N2_HOST=0.0.0.0
export N2_PORT=7331
export N2_NO_OPEN=1
export N2_PROXY_TOKEN="$TOKEN"
exec node server/dist/server.cjs --no-open
