# `chain/` — contratos y motor de riesgo

Territorio Web3. Nada de acá se importa desde `apps/`: la API habla con la cadena **solo** a través de `ChainPort` (`apps/api/src/chain/chain.port.ts`).

> Antes de escribir un contrato, lee [`docs/arquitectura.md`](../docs/arquitectura.md). Fija la codificación de la hoja, los dos hashes y la máquina de estados.

---

## Estado

```bash
cd chain
forge build
forge test -vv     # 39 tests
forge fmt          # antes de commitear: el CI corre `forge fmt --check`
```

| Pieza                                           | Estado      |
| ----------------------------------------------- | ----------- |
| `ReceivableLeaf.sol` + vectores dorados pasando | ✅          |
| `AssetRegistry.sol`                             | ✅ 16 tests |
| `CertificationAttestor.sol`                     | ✅ 16 tests |
| `BorrowingBaseEngine.sol`                       | ✅ Solidity |
| `CollateralVault.sol`                           | ✅          |
| `PAICertificate.sol`                            | ✅          |
| Deploy en Arbitrum Sepolia                      | ✅          |

Las librerías son **submódulos de git**. Al clonar: `git submodule update --init --recursive`.

---

## Empezar acá

Lo primero no fue escribir Solidity: fue **hacer pasar los vectores dorados**. Ya pasan (`test/GoldenVectors.t.sol`), así que Solidity y TypeScript hashean idéntico y eso está probado, no supuesto.

`packages/merkle/fixtures/golden-vectors.json` contiene entradas fijas con su `leafHash`, el `root` del árbol y un multiproof completo. Un test de Foundry que cargue ese JSON y reproduzca los mismos bytes prueba que los dos lados hashean igual — que es el único punto donde la integración puede romperse en silencio.

```
leaf = keccak256(keccak256(abi.encode(
  bytes32 debtorHash,   // keccak256(salt ‖ utf8(ruc)) — nunca el RUC en claro
  uint256 amountMinor,  // unidades menores. USD 8,000.00 → 800000
  uint64  dueDate,      // segundos Unix, medianoche UTC exacta
  uint16  currency,     // ISO-4217 numérico: USD = 840, PEN = 604
  bytes32 docHash       // SHA-256 del documento en storage
)))
```

Ese formato es el de `StandardMerkleTree` de OpenZeppelin (hoja de doble hash, pares ordenados), así que `MerkleProof.multiProofVerify` lo verifica sin adaptaciones.

---

## El motor Stylus tiene su propia especificación

`packages/borrowing-base` es la **especificación normativa** del `BorrowingBaseEngine`, con sus propios vectores dorados en `packages/borrowing-base/fixtures/golden-vectors.json`. El motor en Rust debe reproducir **los mismos enteros**, línea por línea del desglose.

Detalles completos en [`docs/arquitectura.md`](../docs/arquitectura.md), pero lo esencial para no perder tiempo:

- **Todo en enteros.** Tasas en bps (18% = `1800`), montos en unidades menores. Cero flotantes, ni siquiera intermedios.
- **Descuento simple, no compuesto**, y **por cuota**, no sobre una duración promedio.
- **Los descuentos redondean hacia arriba, el advance rate hacia abajo.** El redondeo nunca puede favorecer al prestatario. Esta es la parte más fácil de romper sin notarlo — y la que los vectores detectan.
- Los descuentos se aplican **en cadena sobre el saldo corriente**, en este orden: plazo → mora → concentración → continuidad. Cambiar el orden cambia el resultado.
- La concentración agrupa por `debtorHash`: el motor nunca sabe quién es el deudor.
- Días hasta el vencimiento recortados en 0: una cuota vencida no puede sumar valor.

Vector de referencia (16 cuotas, 4 deudores, USD):

```
nominal            12,480,000
− plazo             1,112,436
− mora                477,438
− concentración       784,000
− continuidad         222,335
= ajustado          9,883,791
× 52.8%             5,218,641   ← base prestable
```

---

## Suite de contratos

| Contrato                    | Lenguaje          | Responsabilidad                                     |
| --------------------------- | ----------------- | --------------------------------------------------- |
| `AssetRegistry.sol`         | Solidity          | Merkle root de evidencias, ciclo de vida del activo |
| `CertificationAttestor.sol` | Solidity          | Atestaciones firmadas, revocables por rol           |
| `BorrowingBaseEngine`       | **Stylus (Rust)** | Multiproof + haircuts + monto prestable             |
| `CollateralVault.sol`       | Solidity          | Custodia, préstamo, repago, default                 |
| `PAICertificate.sol`        | Solidity          | ERC-721 soulbound — credencial verificable          |

Orden sugerido: `AssetRegistry` + `CertificationAttestor` → `BorrowingBaseEngine` con tests → `CollateralVault`.

**Si Rust se traba:** empezar el vault en Solidity y añadir Stylus después. Un vault roto hunde el 25% de implementación técnica; un Stylus modesto pero funcional asegura el bounty.

---

## Qué espera el backend

La interfaz ya está fijada y testeada contra un adapter en memoria. El esqueleto a rellenar es [`apps/api/src/chain/adapters/arbitrum.adapter.ts`](../apps/api/src/chain/adapters/arbitrum.adapter.ts); cada método documenta a qué llamada corresponde.

| Método del puerto      | Llamada esperada                                                |
| ---------------------- | --------------------------------------------------------------- |
| `registerAsset`        | `AssetRegistry.registerAsset(assetId, merkleRoot, ownerIdHash)` |
| `attest`               | `CertificationAttestor.attest(assetId, kind, certificateHash)`  |
| `revokeAttestation`    | `CertificationAttestor.revoke(assetId, kind)`                   |
| `getAsset`             | `AssetRegistry.assets(assetId)` + eventos indexados             |
| `computeBorrowingBase` | `BorrowingBaseEngine.compute(...)` — `view`, Stylus             |

### Los estados, y su ordinal

Solidity serializa los `enum` como `uint8` **por posición**. Si el contrato reordena su enum, el indexer proyecta estados equivocados sin lanzar un solo error. La tabla vive en `ASSET_STATUS_ORDINAL` (`chain.port.ts`) y hay que mantenerlas iguales:

```
0 Registered   1 Attested   2 Pledged    3 Funded
4 Repaid       5 Revoked    6 Defaulted  7 Executed
```

```
Registered → Attested → Pledged → Funded → Repaid → (vuelve a Attested)
                ↓                    ↓
             Revoked             Defaulted → Executed
```

---

## Reglas que no se negocian

- **El dinero nunca pasa por el servidor.** El USDC va de la wallet del fondo al vault y del vault a la PYME, en la misma transacción. Además de ser mejor ingeniería, es lo que jurídicamente saca al proyecto de ser intermediario financiero.
- **La API no firma transacciones de valor.** Firma atestaciones EIP-712 y lee eventos. `ATTESTOR_PRIVATE_KEY` tiene ese alcance y ninguno más.
- **Los ABIs se generan** desde acá hacia `packages/evm`. Nunca se copian a mano: un ABI copiado se desincroniza el día del demo.
- **En un default el contrato no ejecuta la garantía.** Emite `DEFAULTED` con fecha, monto y atestaciones vigentes. La ejecución es legal y off-chain. Decir lo contrario en el pitch es falso y destruye credibilidad.

---

## Verificación en el explorer

La verificación de contratos WASM en el block explorer estaba aún en desarrollo. Si sigue así, hay que compensar publicando **el hash de compilación y un script reproducible en este repo** — "evidencia verificable en el repositorio" es requisito explícito del track.

## Metadatos y smoke de testnet

El deploy no escribe metadatos: durante la simulación todavía no existen recibos y `block.number` no representa el primer bloque confirmado. Después de un broadcast exitoso, el finalizador toma el menor bloque de los seis recibos `CREATE` exitosos, valida las seis direcciones y lee su bytecode runtime mediante RPC antes de reemplazar `deployments/<chainId>.json`:

```bash
pnpm --filter @app/evm deployment:finalize -- --chain-id=421614
```

El archivo canónico es público, se versiona y no contiene claves ni la cuenta que transmitió el deploy. Incluye el `keccak256` del bytecode runtime de cada contrato; el preflight exige coincidencia exacta, no solo código no vacío. Para comprobar el despliegue sin escribir en la red:

```bash
pnpm --filter @app/evm smoke:preflight
```

El preflight carga el archivo ignorado `chain/.env`, deriva las cuentas de rol con `accountIndex` exactos (admin 0, borrower 1, lender 2 y certificadores 3 a 5) y valida chain ID, hashes de bytecode runtime, bloque de despliegue, wiring, roles, saldos y estado live. No crea wallet clients ni envía transacciones. También imprime hashes SHA-256 deterministas de los metadatos y del plan vigente.

La operación live tiene dos fases obligatorias:

```bash
# Fase 1: solo lectura. Repetir inmediatamente antes de autorizar.
pnpm --filter @app/evm smoke:plan

# Fase 2: BLOQUEADA. Aunque el hash coincida, termina con
# architecture_decision_required y no crea wallet, firma, journal ni envío.
pnpm --filter @app/evm smoke:broadcast -- --confirm-plan 0x<planHash>
```

**La fase 2 está deshabilitada sin excepción.** La arquitectura exige que el registro vuelva a `Attested` después de `Repaid`, pero el contrato desplegado y el readback actual permanecen en `Repaid`. Hasta que una decisión humana cambie primero la arquitectura o los contratos, incluso una solicitud correcta termina de forma estable con `architecture_decision_required`, después de todos los checks de solo lectura y antes de crear cualquier capacidad de escritura.

El ejecutor puro conserva el modelo previsto para una eventual habilitación: prepara y firma una sola vez, calcula el hash localmente, persiste el pending antes de broadcast y solo permite reemitir los mismos bytes firmados y el mismo hash. Nunca deriva éxito de nonce. El raw firmado es una capacidad operacional sensible: si en el futuro se conecta un journal real, debe vivir exclusivamente en `chain/.smoke-journal/` (ignorado), con permisos restringidos al usuario, sin mnemonic ni clave privada, y nunca debe aparecer en logs o errores. Actualmente la CLI no crea ese directorio ni journal.

**Efectos previstos si una decisión futura la habilita:** registraría el activo demo determinista, agregaría tres atestaciones, originaría el préstamo, acuñaría `1_000_000` unidades menores de MockUSDC, configuraría allowances, financiaría `400_000` unidades menores y repagaría `400_000`. El readback desplegado exige registro `Repaid` (ordinal 4), préstamo `Repaid` (ordinal 3), certificado válido y saldos borrower `0`, lender `1_000_000`, vault `0`.

No se aceptan mnemonic ni claves privadas por argumentos y nunca se imprimen errores crudos, transacciones firmadas ni valores del entorno. La API no participa ni firma transacciones de valor. Una autorización del comando no supera el bloqueo arquitectónico: primero hace falta resolver y documentar la transición posterior a `Repaid`.

La demo actual usa contratos Solidity y `MockUSDC`. No usa Stylus, USDC nativo ni atestaciones EIP-712.
