# Checklist de cierre del MVP en devnet

La implementación principal ya llegó a `main` mediante el PR #15, pero la rama `feat/web3-testnet-demo` conserva dos correcciones posteriores que aún no están integradas: la configuración `VITE_EXPLORER_TX_URL` del contenedor Web y la documentación actualizada del entorno. Hasta integrar esas diferencias, esta rama es la referencia para el demo.

## Estado de integración

- `origin/main`: `afc7392` — merge del PR #15.
- `origin/feat/web3-testnet-demo`: `2ec6ce4`.
- Diferencias de contenido pendientes frente a `main`:
  - `apps/web/Dockerfile`
  - `README.md`

### Primero

- [ ] Abrir un PR corto desde `feat/web3-testnet-demo` hacia `main` con las diferencias pendientes y este checklist.
- [ ] Confirmar CI verde sobre el commit exacto que se desplegará.
- [ ] Usar `chain/deployments/421614.json` como única fuente de direcciones y hashes del deployment canónico.

## Falta para entregar el MVP

### 1. Publicar una instancia compartida

- [ ] Desplegar Web, API, PostgreSQL y almacenamiento S3/MinIO en un entorno accesible para el jurado.
- [ ] Configurar HTTPS, dominio, CORS, cookies y `VITE_API_URL` para ese entorno.
- [ ] Configurar la API con `CHAIN_ADAPTER=arbitrum`, chain ID `421614`, bloque de deployment y las seis direcciones canónicas.
- [ ] Ejecutar migraciones sin usar `synchronize`.
- [ ] Comprobar `/health`, login, carga de evidencia y lectura pública de verificación.

### 2. Provisionar usuarios y wallets

- [ ] Definir los correos de Admin, PYME, Fondo y los tres Certificadores en la configuración de autenticación.
- [ ] Crear una wallet testnet independiente por persona; compartir solamente direcciones públicas.
- [ ] Financiar cada wallet operativa con aproximadamente `0.001–0.002 ETH` de Arbitrum Sepolia.
- [ ] Conceder los roles on-chain de certificador desde la wallet Admin.
- [ ] Verificar por separado el rol de aplicación asociado al correo y el rol on-chain asociado a la wallet.

> Los roles de la aplicación y los roles del contrato son sistemas distintos. Asignar uno no configura automáticamente el otro.

### 3. Completar las superficies que faltan

- [ ] Añadir una superficie Admin para provisionar roles de aplicación y preparar las concesiones on-chain mediante MetaMask.
- [ ] Añadir el flujo Web de creación del activo: seleccionar evidencias, cargar cuentas por cobrar y definir la wallet controladora.
- [ ] Conectar creación → intent de registro → firma MetaMask → confirmación on-chain.
- [ ] Añadir pruebas de comportamiento y E2E para ambos recorridos.

La API ya expone creación, intent y confirmación en `AssetsController`; falta conectarlos como un recorrido de producto en Web.

### 4. Probar el caso completo en testnet

- [ ] Registrar un activo real del demo.
- [ ] Emitir las tres certificaciones desde wallets distintas.
- [ ] Confirmar certificado PAI válido.
- [ ] Crear la divulgación selectiva y calcular la base de préstamo.
- [ ] Originar, aprobar MockUSDC, financiar y repagar.
- [ ] Confirmar préstamo `Repaid` y activo nuevamente `Attested`.
- [ ] Abrir la verificación pública y contrastar direcciones/transacciones con Arbiscan.
- [ ] Guardar IDs, wallets públicas y hashes de transacción que se usarán durante la presentación.

## Criterio de “listo para hackathon”

- [ ] Una URL pública abre la aplicación sin configuración manual del jurado.
- [ ] Admin puede provisionar usuarios y roles sin editar archivos durante la demo.
- [ ] Cada actor firma únicamente desde su propia MetaMask.
- [ ] El recorrido completo funciona una vez de principio a fin sobre Arbitrum Sepolia.
- [ ] La verificación pública refleja el deployment canónico.
- [ ] Existe un guion de recuperación con un activo ya preparado si una wallet o faucet falla.

## No implementar ni hacer en este cierre

- [ ] No construir marketplace, tokens transferibles, oráculos descentralizados, fraccionamiento ni DAO.
- [ ] No presentar el motor Solidity como Stylus ni `MockUSDC` como USDC nativo.
- [ ] No afirmar que existe firma EIP-712 del backend mientras el flujo use firmas directas de las wallets.
- [ ] No implementar ERC-4337, smart accounts, indexador durable o reconciliación productiva antes de cerrar el recorrido del demo.
- [ ] No hacer que la API firme transacciones de valor.
- [ ] No usar flotantes para montos; mantener unidades menores enteras.
- [ ] No cambiar la codificación Merkle ni `fixtures/golden-vectors.json` sin coordinar la ruptura con Web3.
- [ ] No editar manualmente los ABIs de `packages/evm`; siempre regenerarlos desde `chain/`.
- [ ] No reutilizar direcciones de deployments rechazados ni saltarse `deployment:guard` para redesplegar.
- [ ] No compartir ni versionar `.env`, mnemonic, claves privadas, secretos de storage o credenciales de base de datos.

## Verificación antes de entregar

```powershell
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Además, ejecutar los E2E del recorrido final y comprobar el deployment con el preflight read-only de `@app/evm`.
