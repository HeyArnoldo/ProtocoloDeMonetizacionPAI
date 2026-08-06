# Construir desde la RAÍZ del repo (necesita el workspace completo):
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo
# Evita que el script "prepare" (husky) corra dentro del contenedor.
ENV HUSKY=0

# ── Stage 1: build ────────────────────────────────────────────────
FROM base AS build
# Solo manifests primero: la capa de install se cachea entre builds.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @app/api...

COPY packages/tsconfig packages/tsconfig
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @app/contracts build && pnpm --filter @app/api build

# ── Stage 2: runtime ──────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# Reinstala solo deps de producción preservando el layout del workspace
# (los symlinks de pnpm son relativos: funcionan dentro de la imagen).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter @app/api...

COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

# Migraciones + seed SIEMPRE corren antes de levantar la API.
ENTRYPOINT ["./docker-entrypoint.sh"]
