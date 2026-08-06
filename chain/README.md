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
| `BorrowingBaseEngine` (Stylus/Rust)             | ⏳          |
| `CollateralVault.sol`                           | ⏳          |
| `PAICertificate.sol`                            | ⏳          |
| Scripts de deploy a Arbitrum Sepolia            | ⏳          |

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
