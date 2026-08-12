# Checklist de cierre del MVP en devnet

Estado al **12 de agosto de 2026**, sobre `main` en `15c0540`.

Lo verde está verificado contra la red o contra el servicio en producción, no contra el recuerdo de haberlo hecho. Lo que queda sin marcar es la **ruta crítica real** para que la demo funcione de principio a fin.

---

## ✅ Ya está hecho

### Infraestructura publicada

- [x] Web, API, PostgreSQL y almacenamiento S3 desplegados y accesibles para el jurado.
- [x] HTTPS, dominio, CORS, cookies y `VITE_API_URL` configurados — `pai.cloud.groowtech.com` con la API en `api-pai.cloud.groowtech.com`.
- [x] Migraciones aplicadas sin `synchronize`.
- [x] `/health` responde con la base de datos arriba; login, carga de evidencia y lectura pública de verificación comprobados.

### Cadena

- [x] Seis contratos desplegados en Arbitrum Sepolia desde el bloque `296546459`. Verificado con `eth_getCode` sobre las seis direcciones.
- [x] `chain/deployments/421614.json` es la fuente única de direcciones y hashes.
- [x] API configurada con `CHAIN_ADAPTER=arbitrum`, chain ID `421614`, bloque de deployment y las seis direcciones canónicas.
- [x] `DEFAULT_ADMIN_ROLE` en la wallet Admin, no en el deployer. Verificado con `hasRole`.
- [x] **Lectura en vivo de la red:** `GET /api/chain/status` publica `chainId`, bloque seguro y cabeza. El panel enciende el punto solo con esa lectura y declara `unreachable` si el RPC cae.

### Panel

- [x] 10 rutas + landing pública, sistema visual completo, responsive en móvil.
- [x] Conexión global con MetaMask, con cambio de red a Arbitrum Sepolia.
- [x] Transacciones vinculadas a la wallet conectada.
- [x] Divulgación selectiva con multiproof real end-to-end.
- [x] Desglose del monto prestable, etiquetado honestamente como cálculo local de referencia.
- [x] Verificación pública sin sesión.

### Correcciones de fondo

- [x] **Choque de decimales en `CollateralVault`** corregido en código: el principal se denomina en unidades del token y la base prestable se escala desde centavos con `principalScale`, derivado de `decimals()` del propio token. 69 tests de Foundry en verde.
- [x] El campo del principal en `/prestamo` declara la escala y muestra la equivalencia en dólares mientras se escribe.

---

## 🔴 Ruta crítica — sin esto no hay demo end-to-end

### 1. Flujo de creación del activo en Web ← **el bloqueante**

Hoy no existe: `apps/web/src` no tiene una sola llamada a `/assets`. Se suben evidencias, pero **nunca se crea un activo**, así que no hay `assetId` que registrar, certificar, divulgar ni financiar. `/expediente` solo sabe leer uno si se le pasa `?assetId=0x…`.

- [ ] Pantalla de creación: seleccionar evidencias, cargar cuentas por cobrar y definir la wallet controladora.
- [ ] Conectar creación → intent de registro → firma en MetaMask → confirmación on-chain.
- [ ] Mostrar el `assetId` resultante de forma copiable, y distinguirlo visualmente del SHA-256 de una evidencia: los dos son `0x` + 64 hex y confundirlos ya costó una sesión de depuración.
- [ ] Pruebas de comportamiento y E2E del recorrido.

> La API ya expone creación, intent y confirmación en `AssetsController`. Falta únicamente el recorrido de producto en Web.

### 2. Redespliegue con el arreglo de decimales

El código está corregido y probado, pero los contratos en la red siguen siendo los anteriores. El bytecode cambió, así que las direcciones cambian.

- [ ] `pnpm --filter @app/evm deployment:guard -- prepare` e `inspect` sobre el digest del candidato.
- [ ] Autorización humana explícita del digest inspeccionado, y recién entonces `authorize` + `broadcast`.
- [ ] `deployment:finalize` para regenerar `chain/deployments/421614.json` desde los recibos reales.
- [ ] Actualizar las seis direcciones y `CHAIN_DEPLOYMENT_BLOCK` en el `.env` de la aplicación.
- [ ] Volver a conceder los roles on-chain sobre los contratos nuevos.
- [ ] Confirmar que `GET /api/chain/status` vuelve a `"live"` con el bloque nuevo.

### 3. Provisionar actores y wallets

- [ ] Definir los correos de Admin, PYME, Fondo y los tres Certificadores en la configuración de autenticación.
- [ ] Una wallet testnet independiente por persona; compartir solo direcciones públicas.
- [ ] Financiar cada wallet operativa con `0.001–0.002 ETH` de Arbitrum Sepolia.
- [ ] Acuñar `MockUSDC` en la wallet del fondo, suficiente para el principal del guion.
- [ ] Conceder los roles on-chain de certificador desde la wallet Admin.
- [ ] Verificar por separado el rol de aplicación (correo) y el rol on-chain (wallet).

> Los roles de la aplicación y los del contrato son **sistemas distintos**. Asignar uno no configura el otro.

### 4. Superficie de administración

- [ ] Provisionar roles de aplicación sin editar archivos durante la demo.
- [ ] Preparar las concesiones de rol on-chain mediante MetaMask.

### 5. Recorrido completo en testnet, una vez de principio a fin

- [ ] Registrar un activo real del demo.
- [ ] Emitir las tres certificaciones desde wallets distintas.
- [ ] Confirmar certificado PAI válido.
- [ ] Crear la divulgación selectiva y calcular la base de préstamo.
- [ ] Originar, aprobar `MockUSDC`, financiar y repagar.
- [ ] Confirmar préstamo `Repaid` y activo nuevamente `Attested`.
- [ ] Abrir la verificación pública y contrastar direcciones y transacciones con Arbiscan.
- [ ] Guardar `assetId`, wallets públicas y hashes de transacción para la presentación.

---

## 🟡 Deseable, no bloqueante

- [ ] Worker suscrito a los eventos de los contratos, para que `/actividad` y `/historial` dejen de ser estados vacíos.
- [ ] Motor de riesgo en Stylus (Rust). Hoy `BorrowingBaseEngine` es Solidity y **se presenta como tal**.

---

## Criterio de «listo para hackathon»

- [ ] Una URL pública abre la aplicación sin configuración manual del jurado.
- [ ] Admin puede provisionar usuarios y roles sin editar archivos durante la demo.
- [ ] Cada actor firma únicamente desde su propia MetaMask.
- [ ] El recorrido completo funciona una vez de principio a fin sobre Arbitrum Sepolia.
- [x] La verificación pública refleja el deployment canónico.
- [ ] Existe un guion de recuperación con un activo ya preparado si una wallet o faucet falla.

El guion de exposición y las respuestas a las preguntas incómodas están en [`caso-de-uso-hackathon.md`](caso-de-uso-hackathon.md).

---

## No implementar ni hacer en este cierre

- No construir marketplace, tokens transferibles, oráculos descentralizados, fraccionamiento ni DAO.
- No presentar el motor Solidity como Stylus ni `MockUSDC` como USDC nativo.
- No afirmar que existe firma EIP-712 del backend mientras el flujo use firmas directas de las wallets.
- No implementar ERC-4337, smart accounts, indexador durable ni reconciliación productiva antes de cerrar el recorrido del demo.
- No hacer que la API firme transacciones de valor.
- No usar flotantes para montos; mantener unidades menores enteras.
- No cambiar la codificación Merkle ni `fixtures/golden-vectors.json` sin coordinar la ruptura con Web3.
- No editar manualmente los ABIs de `packages/evm`; siempre regenerarlos desde `chain/`.
- No reutilizar direcciones de deployments rechazados ni saltarse `deployment:guard` para redesplegar.
- No compartir ni versionar `.env`, mnemonic, claves privadas, secretos de storage o credenciales de base de datos.

## Verificación antes de entregar

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
cd chain && forge fmt --check && forge test
```

Además, ejecutar los E2E del recorrido final y comprobar el deployment con el preflight read-only de `@app/evm`.
