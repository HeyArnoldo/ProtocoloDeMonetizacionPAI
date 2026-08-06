# Protocolo de Monetización PAI

Infraestructura para que una PYME sin activos fijos hipotecables convierta su **cartera de derechos de cobro** en garantía verificable, y obtenga financiamiento contra ella.

Hackathon **Track Arbitrum**, categoría **DeFi / RWA**.

> **La tesis:** la cadena no reemplaza al abogado ni al registro público — reemplaza la necesidad de confiar en el operador de la plataforma. El monto prestable deja de ser un número que el backend afirma, y pasa a ser una función determinista que el prestamista puede recomputar.

Documento de referencia completo (caso de uso, rúbrica, guion de demo): [`docs/referencia-pai-arbitrum.md`](docs/referencia-pai-arbitrum.md).
Decisiones de arquitectura y frontera Web2 ↔ Web3: [`docs/arquitectura.md`](docs/arquitectura.md).

---

## 🧭 Cómo está partido el trabajo

El repo está diseñado para que las dos mitades avancen **en paralelo, sin bloquearse**:

| Mitad    | Dónde vive               | Qué contiene                                                         |
| -------- | ------------------------ | -------------------------------------------------------------------- |
| **Web2** | `apps/`, `packages/`     | Expediente, evidencias, certificaciones, UI. Corre entero sin cadena |
| **Web3** | `chain/`, `packages/evm` | Contratos Solidity, motor Stylus (Rust), ABIs generados              |

La frontera entre ambas son **dos artefactos**, no un deploy:

1. **`packages/merkle`** — la codificación canónica de la hoja del árbol, en TypeScript, con vectores dorados (`fixtures/`). Los tests de Solidity y Stylus deben reproducir esos mismos vectores byte a byte.
2. **`ChainPort`** — la interfaz que el dominio de la API usa para hablar con la cadena. Tiene un adaptador en memoria que funciona hoy; el adaptador real de Arbitrum se enchufa sin tocar el dominio.

> Si los dos lados hashean distinto, el multiproof falla en la demo y nadie se entera hasta el minuto 2:00 del pitch. Por eso los vectores dorados existen antes que los contratos.

---

## 🚀 Arranque

```bash
cp .env.example .env                 # ajusta JWT_SECRET y ADMIN_*
pnpm install
pnpm --filter "./packages/*" build   # la API importa @app/contracts y @app/merkle
pnpm db:up                           # postgres en docker
pnpm migration:run
pnpm seed                            # admin inicial (idempotente)
pnpm dev                             # api en :3000, web en :5173
```

Entra en **http://localhost:5173** con el `ADMIN_EMAIL` / `ADMIN_PASSWORD` de tu `.env`, y andá a **Divulgación selectiva** en el menú.

Contratos (opcional, necesita [Foundry](https://getfoundry.sh)):

```bash
git submodule update --init --recursive
cd chain && forge test -vv
```

---

## 🔑 El `.env` completo

`.env.example` en el repo **todavía no tiene las variables de cadena y storage**. Este bloque sí las tiene: copialo entero a `.env` y ajustá `JWT_SECRET` y `ADMIN_*`.

```env
# ── Entorno ──────────────────────────────────────────────────────────
NODE_ENV=development

# ── Base de datos (PostgreSQL) ───────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USER=app
DB_PASSWORD=app
DB_NAME=pai_arbitrum

# ── API ──────────────────────────────────────────────────────────────
API_PORT=3000
# Orígenes permitidos para CORS, separados por coma (nunca usar *)
CORS_ORIGIN=http://localhost:5173
# URL del frontend (redirects post-login de Google)
FRONTEND_URL=http://localhost:5173

# ── Auth ─────────────────────────────────────────────────────────────
AUTH_LOCAL_ENABLED=true
# Mínimo 16 caracteres. Genera uno: openssl rand -base64 32
JWT_SECRET=cambiame_por_un_secreto_largo
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# Cookie de sesión httpOnly. En producción detrás de HTTPS: COOKIE_SECURE=true
COOKIE_SECURE=false
# lax si front y api comparten dominio; none (+secure) si son dominios distintos
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=

# ── Google OAuth (opcional) ──────────────────────────────────────────
# Con CLIENT_ID y CLIENT_SECRET, el login con Google se activa solo.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# ── Admin inicial (seed idempotente) ─────────────────────────────────
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin1234!
ADMIN_NAME=Admin

# ── Frontend (Vite) ──────────────────────────────────────────────────
# Vacío en dev (usa el proxy /api). En producción: https://api.tudominio.com
VITE_API_URL=

# ── Cadena (Arbitrum) ────────────────────────────────────────────────
# in-memory → la API funciona sin cadena: dev, tests y demo Web2.
# arbitrum  → usa los contratos desplegados. Exige RPC, direcciones y clave.
CHAIN_ADAPTER=in-memory
CHAIN_ID=421614
CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Direcciones desplegadas — vacías hasta el primer deploy a Arbitrum Sepolia
ASSET_REGISTRY_ADDRESS=
CERTIFICATION_ATTESTOR_ADDRESS=
BORROWING_BASE_ENGINE_ADDRESS=

# Wallet del backend: SOLO firma atestaciones EIP-712, nunca mueve dinero
ATTESTOR_PRIVATE_KEY=

# ── Storage de evidencias (MinIO en local, S3/R2 en producción) ──────
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=pai-evidence
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
# true para MinIO (path-style), false para S3 real
STORAGE_FORCE_PATH_STYLE=true
```

> Con `CHAIN_ADAPTER=arbitrum`, `CHAIN_RPC_URL`, `ASSET_REGISTRY_ADDRESS`, `CERTIFICATION_ATTESTOR_ADDRESS` y `ATTESTOR_PRIVATE_KEY` **dejan de ser opcionales**: la API no levanta sin ellas. Es a propósito — mejor no arrancar que fallar en la primera transacción del demo.
>
> Las variables de storage todavía no están validadas por Zod: entran con el módulo de evidencias.

---

## 📦 Estructura

```
├── apps/
│   ├── api/          # NestJS 11 · TypeORM · auth JWT en cookie httpOnly
│   └── web/          # React 19 · Vite 7 · Tailwind v4 · shadcn · TanStack Query
├── packages/
│   ├── contracts/    # Schemas Zod compartidos api ↔ web (NO son smart contracts)
│   ├── merkle/       # Hoja canónica, árbol y multiproof + vectores dorados
│   ├── evm/          # ABIs y tipos generados desde chain/ (NO editar a mano)
│   └── tsconfig/     # Config TypeScript base
├── chain/            # Foundry (Solidity) + Stylus (Rust). Territorio Web3
└── docs/
```

### ⚠️ El choque de nombres

`packages/contracts` son **schemas Zod**, no smart contracts. Los smart contracts viven en `chain/`. Esto no se cambia: el template ya tiene medio monorepo apuntando a `@app/contracts`.

Los ABIs salen de `chain/` hacia `packages/evm` **por build, nunca a mano**. Un ABI copiado a mano se desincroniza el día del demo.

---

## 🛠 Scripts (desde la raíz)

| Comando                                                  | Qué hace                                        |
| -------------------------------------------------------- | ----------------------------------------------- |
| `pnpm dev`                                               | API + web + contracts en watch, en paralelo     |
| `pnpm dev:api` / `pnpm dev:web`                          | Solo una app                                    |
| `pnpm build`                                             | Build de todo (contracts → api → web, en orden) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`             | Calidad en todos los workspaces                 |
| `pnpm db:up` / `pnpm db:down`                            | Postgres en Docker                              |
| `pnpm migration:generate src/database/migrations/Nombre` | Genera migración desde los cambios en entities  |
| `pnpm migration:run` / `pnpm migration:revert`           | Aplica / revierte migraciones                   |
| `pnpm seed`                                              | Admin inicial (idempotente)                     |

---

## 🗃 Base de datos: migraciones SIEMPRE

```bash
# 1. Edita o crea un *.entity.ts
# 2. Genera la migración (compara entities vs DB real)
pnpm migration:generate src/database/migrations/AgregaCampoX
# 3. Revisa el SQL generado (¡siempre!)
# 4. Aplícala
pnpm migration:run
```

`synchronize: false` está fijo en `apps/api/src/config/typeorm.config.ts`. **No se cambia**: pierde datos y rompe el flujo de migraciones. En producción el `docker-entrypoint.sh` corre `migration:run` + seed antes de arrancar la API.

Adminer (UI de la DB): `docker compose --profile tools up -d` → http://localhost:8081

---

## 🧩 Agregar una feature (receta)

1. **Contrato** — `packages/contracts/src/mi-feature.ts`: schemas Zod + tipos, exporta en `index.ts`.
2. **API** — `apps/api/src/mi-feature/`: `*.entity.ts`, `*.service.ts`, `*.controller.ts` (con `ZodValidationPipe` + `JwtAuthGuard`), `*.module.ts` registrado en `app.module.ts`. Genera y corre la migración.
3. **Web** — `apps/web/src/`: service en `services/`, hooks TanStack Query en `hooks/`, página en `pages/`, ruta en `router.tsx`.

Lógica de dominio (services, reglas de negocio, cálculo) va con **test primero**. Controladores, UI y glue se testean después, pero se testean.

Componentes shadcn nuevos: `cd apps/web && pnpm dlx shadcn@latest add <componente>`.

---

## 🔐 Auth

Se controla **100% con variables de entorno**; el frontend consulta `GET /api/auth/config` y renderiza el login según lo activo.

- `AUTH_LOCAL_ENABLED=true` → email + password. El seed crea el admin.
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` → activa el botón de Google. Con solo `ADMIN_EMAIL` (sin password), ese correo recibe rol admin en su primer login.
- Ambos a la vez: si un usuario local entra luego con Google con el mismo email, las cuentas se vinculan solas.

El JWT viaja en cookie `httpOnly` (`app_session`): el frontend nunca toca el token. CORS exige orígenes exactos porque `credentials: true`.

> Para el demo, el login con Google es el camino: la PYME no debe ver una seed phrase jamás. La smart account ERC-4337 se despliega en segundo plano después del login.

---

## 🚢 Deploy en Coolify

Cada app se despliega como recurso independiente con su Dockerfile (**build context = raíz del repo**):

|             | API                   | Web                   |
| ----------- | --------------------- | --------------------- |
| Dockerfile  | `apps/api/Dockerfile` | `apps/web/Dockerfile` |
| Puerto      | 3000                  | 80                    |
| Healthcheck | `/health`             | `/`                   |

`API_PORT` **no se define** en Coolify: el default es 3000 y el healthcheck del Dockerfile está fijado ahí.

`VITE_API_URL` es **build arg**, no variable de runtime: queda horneada en el bundle al compilar.

Cookies entre dominios:

| Caso                                  | Config                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `app.dominio.com` + `api.dominio.com` | `COOKIE_DOMAIN=.dominio.com` y `COOKIE_SAMESITE=lax`      |
| Dominios distintos                    | `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` obligatorio |

Probar los Dockerfiles en local antes de subir:

```bash
docker compose -f docker-compose.prod.yml up -d --build
# api → http://localhost:3000/health · web → http://localhost:8090
docker compose -f docker-compose.prod.yml down
```

---

## ✅ Calidad incluida

- **Husky + lint-staged**: prettier automático en cada commit.
- **commitlint**: [conventional commits](https://www.conventionalcommits.org/es) obligatorios — un commit mal formado no entra.
- **GitHub Actions** (`.github/workflows/ci.yml`): lint → typecheck → build → test en cada push/PR.
- **TypeScript estricto** en todo el monorepo (base compartida en `packages/tsconfig`).

---

## 📌 Decisiones técnicas (para no pelearse con ellas)

- **pnpm 11 pineado** (`packageManager` + corepack). `pnpm-workspace.yaml` declara `allowBuilds` — sin eso pnpm bloquea los postinstall nativos (esbuild, tailwind oxide).
- **API en CommonJS** (no NodeNext): imports sin sufijo `.js` y la CLI `typeorm-ts-node-commonjs` funciona sin hacks.
- **bcryptjs** (JS puro): cero bindings nativos en Alpine/CI.
- **SHA-256 para archivos, keccak256 para hojas del árbol.** No son intercambiables: ver [`docs/arquitectura.md`](docs/arquitectura.md).
- Código e identificadores en **inglés**, comentarios y docs en **español**.

---

Base del monorepo: [HeyArnoldo/TemplateFullStack](https://github.com/HeyArnoldo/TemplateFullStack).
