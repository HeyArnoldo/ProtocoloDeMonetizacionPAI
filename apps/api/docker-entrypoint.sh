#!/bin/sh
set -e

echo "[entrypoint] Corriendo migraciones..."
node apps/api/node_modules/typeorm/cli.js migration:run -d apps/api/dist/config/typeorm.config.js

echo "[entrypoint] Corriendo seed (idempotente)..."
node apps/api/dist/database/seeds/run-seed.js

echo "[entrypoint] Iniciando API..."
exec node apps/api/dist/main.js
