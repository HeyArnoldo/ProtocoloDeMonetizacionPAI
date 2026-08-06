# Protocolo de Monetización PAI — instrucciones del repo

Antes de escribir código, lee [`docs/arquitectura.md`](docs/arquitectura.md). Fija decisiones que no se vuelven a discutir.

## Reglas duras

- `synchronize: false` siempre. El esquema cambia **solo con migraciones**.
- **SHA-256 para archivos, keccak256 para hojas del árbol.** No son intercambiables.
- La codificación de la hoja de Merkle está definida en `packages/merkle` y verificada por `fixtures/golden-vectors.json`. **Cambiarla exige actualizar los vectores y avisar al lado Web3** — rompe la verificación on-chain.
- El dominio de la API habla con la cadena **solo a través de `ChainPort`**. Nada de Viem, direcciones o ABIs fuera de `apps/api/src/chain/adapters/`.
- La API **no firma transacciones de valor**. Firma atestaciones EIP-712 y lee eventos.
- Cuando Postgres y la cadena discrepan, **gana la cadena**.
- Los ABIs de `packages/evm` se **generan** desde `chain/`. Nunca se editan a mano.
- Montos en **unidades menores** (enteros). Nada de flotantes en dinero, en ningún lado.

## Cómo se trabaja

- **TDD obligatorio en lógica de dominio** (services, reglas, cálculo): test rojo → código mínimo → refactor. Controladores, UI y glue se testean después, pero se testean.
- Receta para una feature: contrato Zod (`packages/contracts`) → entity → service → controller → hooks TanStack Query → página. Está detallada en el README.
- Ramas: `feat|fix|chore/<scope>-<slug>` desde `main`.
- **Conventional commits.** Sin atribución a IA, sin `Co-Authored-By`.
- Antes de push: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
- No se mergea con CI en rojo. Se verifica con `gh pr checks`, no de memoria.

## Convenciones

- Código e identificadores en **inglés**. Comentarios y documentación en **español**.
- Comentarios que expliquen **por qué**, no qué. El qué ya está en el código.

## Alcance: lo que NO se construye

Marketplace, tokens transferibles, oráculos descentralizados, fraccionamiento, DAO. Si una tarea deriva hacia ahí, para y pregunta.
