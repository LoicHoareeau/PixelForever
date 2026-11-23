#!/usr/bin/env bash
set -euo pipefail
export APP_SECRET="${APP_SECRET:-$(php -r 'echo bin2hex(random_bytes(32));')}"
su -s /bin/sh -c 'php bin/console doctrine:migrations:migrate --no-interaction' www-data
node server/presence.mjs &
relay=$!
apache2-foreground &
web=$!
cleanup() { kill "$relay" "$web" 2>/dev/null || true; wait "$relay" "$web" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 0' TERM INT
wait -n "$relay" "$web"
