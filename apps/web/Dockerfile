# Construir desde la RAÍZ del repo (necesita el workspace completo):
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.tudominio.com .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
ENV HUSKY=0

# `packages` entero: el panel va a depender de @app/merkle y @app/borrowing-base
# para recomputar el proof en el navegador, y la lista a mano se desactualiza.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @app/web...

COPY apps/web apps/web

# URL absoluta de la API: queda horneada en el bundle (build-time, no runtime).
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
# El sufijo `...` compila el front y sus dependencias en orden topológico.
RUN pnpm --filter @app/web... build

# ── Runtime: nginx sirviendo estáticos ────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80 >/dev/null 2>&1 || exit 1
