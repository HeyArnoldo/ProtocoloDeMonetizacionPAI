# Arquitectura — decisiones y frontera Web2 ↔ Web3

Este documento fija **lo que no se discute otra vez**. Si algo de acá cambia, se cambia acá primero y luego en el código.

Contexto y caso de uso completo: [`referencia-pai-arbitrum.md`](referencia-pai-arbitrum.md).

---

## 1. El problema de coordinación

Dos personas trabajando en mitades distintas del mismo sistema. Si el backend depende de que existan los contratos desplegados, nadie avanza hasta que ambos terminen. Y peor: los errores de integración aparecen al final, que es exactamente cuando no hay tiempo.

La solución es que la frontera sea un **contrato de datos verificable de los dos lados**, no un deploy.

```
       Web2 (apps/, packages/)          │        Web3 (chain/, packages/evm)
                                        │
  expediente · evidencias · UI          │   AssetRegistry · CertificationAttestor
  certificaciones · divulgación         │   CollateralVault · PAICertificate
                                        │   BorrowingBaseEngine (Stylus)
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              │  packages/merkle   →  hoja canónica + vectores    │
              │  ChainPort         →  interfaz + adapter fake     │
              └───────────────────────────────────────────────────┘
```

Cada mitad se desarrolla y se testea sola. Se encuentran en esas dos piezas.

---

## 2. Los dos hashes (no son intercambiables)

| Uso                               | Algoritmo     | Por qué                                                                                        |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| Huella de un archivo de evidencia | **SHA-256**   | Estándar fuera de la cadena. Cualquier auditor lo verifica con `sha256sum`, sin tooling cripto |
| Hoja y nodos del árbol de Merkle  | **keccak256** | Es el hash nativo del EVM. Verificar SHA-256 on-chain cuesta caro y sin ninguna ventaja        |

El `docHash` (SHA-256, 32 bytes) entra **como dato** dentro de la hoja que se hashea con keccak256. Los dos conviven, cada uno en su capa.

> Confundirlos es el error clásico: si el backend arma la hoja con SHA-256 y el contrato la recomputa con keccak256, el multiproof falla y el mensaje de error no dice nada útil.

---

## 3. La hoja canónica del árbol

**Esta es la definición normativa.** Vive implementada en `packages/merkle` y verificada por los vectores dorados de `packages/merkle/fixtures/`.

Una hoja representa **una cuota de un contrato de suscripción**: un tercero obligado a pagar un monto en una fecha.

| Campo         | Tipo ABI  | Definición                                                                                                |
| ------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| `debtorHash`  | `bytes32` | `keccak256(salt ‖ utf8(ruc))` del deudor. **Nunca el RUC en claro**: la hoja puede publicarse en un proof |
| `amountMinor` | `uint256` | Monto en unidades menores. USD 8,000.00 → `800000`. Sin decimales flotantes, nunca                        |
| `dueDate`     | `uint64`  | Segundos Unix, medianoche **UTC** del día de vencimiento                                                  |
| `currency`    | `uint16`  | Código numérico ISO-4217: USD = `840`, PEN = `604`                                                        |
| `docHash`     | `bytes32` | SHA-256 del documento fuente en storage                                                                   |

```
leaf = keccak256(keccak256(abi.encode(debtorHash, amountMinor, dueDate, currency, docHash)))
```

### Por qué el `debtorHash` lleva salt (y no es opcional)

Un RUC peruano son 11 dígitos: 10¹¹ combinaciones. Un `keccak256` sin salt sobre ese espacio se rompe por fuerza bruta en minutos con hardware común.

Sin salt, cualquiera que reciba un multiproof puede enumerar RUCs, comparar hashes y **reconstruir la cartera de clientes de la empresa**. Eso destruye exactamente la promesa que sostiene el proyecto: _probar sin revelar las contrapartes_.

Con un salt de 32 bytes por expediente el espacio deja de ser enumerable, y quien tenga el salt — el fondo, el certificador — igual puede recomputar y verificar. El salt se genera al crear el expediente (`randomDebtorSalt()`), vive del lado del servidor y se comparte solo con quien deba verificar.

> Consecuencia para el motor Stylus: el haircut de concentración se calcula comparando `debtorHash` entre hojas. **No necesita saber quién es el deudor**, solo qué cuotas comparten deudor. La privacidad no cuesta funcionalidad.

### Lo que un multiproof SÍ revela

Conviene tenerlo claro antes de que lo pregunte un jurado: un multiproof **incluye hashes de hojas hermanas no divulgadas**. Así funciona un árbol de Merkle.

Lo que no revela es su **contenido**: ni deudor, ni monto, ni vencimiento, ni documento. El `leafHash` es irreversible porque contiene el `docHash` (SHA-256 de un archivo real), que tiene entropía completa y no se puede adivinar.

La afirmación precisa es _"no revela el contenido de las hojas ocultas"_, no _"las hojas ocultas no aparecen"_. La segunda es falsa y un jurado técnico lo va a notar.

### Por qué `uint16` para la moneda y no un string

Codificar strings de forma idéntica en TypeScript, Solidity y Rust es una fuente de bugs silenciosos (padding, encoding, longitud). Un código numérico ISO no tiene ambigüedad posible en ningún lenguaje.

### Por qué doble keccak256

Es la defensa estándar contra ataques de segunda preimagen en árboles de Merkle: sin ella, un nodo interno puede pasar por hoja. Es también lo que espera `MerkleProof` de OpenZeppelin.

### Por qué NO implementamos el árbol a mano

`packages/merkle` envuelve **`@openzeppelin/merkle-tree`**, no reimplementa nada. Esa librería produce árboles con hojas de doble hash y pares ordenados, que es exactamente lo que `MerkleProof.multiProofVerify` de OpenZeppelin verifica on-chain — y la port de OZ a Stylus mantiene el mismo formato.

Un árbol propio funcionaría en los tests de TypeScript y fallaría en el contrato. Este es el tipo de decisión que se toma una vez y se respeta.

### Vectores dorados

`packages/merkle/fixtures/golden-vectors.json` contiene entradas fijas con su `leaf`, su `root` y multiproofs esperados.

**Contrato de equipo:** los tests de Foundry y los de Stylus cargan ese mismo JSON y deben producir los mismos bytes. Si un lado cambia la codificación, el test del otro lado se pone rojo en el CI. Esa es toda la protección que necesita la integración.

---

## 4. El motor de borrowing base

Segunda pieza normativa, con el mismo patrón que la hoja: la fórmula vive en TypeScript (`packages/borrowing-base`), los vectores dorados están en `fixtures/golden-vectors.json`, y el motor Stylus debe reproducir **los mismos enteros**.

### Todo en enteros, sin excepción

Las tasas van en **puntos básicos**: 1 bps = 0.01%, así que 18% = `1800` y 100% = `10000`. Los montos van en unidades menores como `bigint`. No hay un solo `number` decimal en el motor. En dinero, un float es una discrepancia esperando el peor momento para aparecer — y el peor momento acá es cuando el fondo recomputa en vivo.

### El cálculo, en orden

```
nominal      = Σ cuotas divulgadas

1. Descuento por plazo   por cuota: monto × tasa × días / (10000 × 365)
2. Mora histórica        saldo × delinquencyBps / 10000
3. Concentración         exceso sobre el umbral × penaltyBps / 10000
4. Continuidad           saldo × (100 − score) × weightBps / (100 × 10000)

= valor ajustado por riesgo
× advanceRateBps / 10000  →  base prestable
```

Cada descuento se aplica sobre el **saldo corriente**, no sobre el nominal. El orden es parte de la especificación: cambiarlo cambia el resultado.

### Descuento simple, no compuesto

El descuento por plazo es **lineal**, no valor presente compuesto. Dos razones: es como se descuenta en factoring, y es exacto en aritmética entera. Una exponenciación con exponente fraccionario on-chain es cara e imprecisa, y acá no aporta nada.

Y se calcula **por cuota**, no sobre una duración promedio de la cartera. Eso es exactamente lo que el árbol permite y un agregado no: dos cuotas de 500k a plazos distintos no valen lo mismo que una de 1M al plazo promedio.

### El redondeo nunca favorece al prestatario

Los descuentos redondean **hacia arriba**, el advance rate **hacia abajo**. Un centavo de más en la base prestable es un centavo que el fondo presta sin colateral. Es una decisión de riesgo, no de estilo, y está fijada por los vectores dorados.

### Concentración sin saber quién es el deudor

El haircut agrupa por `debtorHash`. El motor no necesita saber **quién** es el deudor, solo qué cuotas comparten deudor. Por eso el salt del `debtorHash` protege la privacidad sin costar funcionalidad.

### Cuotas vencidas

Los días hasta el vencimiento se recortan en 0. Sin ese recorte, una cuota vencida generaría un descuento negativo y la cartera valdría **más** cuanto más atrasada estuviera. Penalizar activamente lo vencido es una decisión de riesgo aparte, y todavía no está en el modelo.

### Los parámetros son ilustrativos

Los haircuts por defecto (420 bps de mora, 52.8% de advance rate, umbral de concentración 25%) son consistentes y representativos del mercado SaaS B2B peruano, pero **necesitan calibración de un analista de riesgo real** antes de producción. Decirlo en la presentación muestra criterio.

---

## 5. `ChainPort` — la cadena como puerto

El dominio de la API **no conoce Viem, ni direcciones, ni ABIs**. Conoce una interfaz.

```
apps/api/src/chain/
├── chain.port.ts            # la interfaz + tipos del dominio
├── chain.module.ts          # elige el adapter según CHAIN_ADAPTER
└── adapters/
    ├── in-memory.adapter.ts # funciona hoy, sin cadena. Dev, tests y demo Web2
    └── arbitrum.adapter.ts  # Viem + packages/evm. Territorio Web3
```

```ts
export interface ChainPort {
  registerAsset(input: RegisterAssetInput): Promise<TxRef>;
  attest(input: AttestInput): Promise<TxRef>;
  revokeAttestation(input: RevokeAttestationInput): Promise<TxRef>;
  getAsset(assetId: AssetId): Promise<OnChainAsset | null>;
  computeBorrowingBase(input: BorrowingBaseInput): Promise<BorrowingBaseResult>;
}
```

Se selecciona con `CHAIN_ADAPTER=in-memory | arbitrum` en el `.env`.

### Qué gana cada uno

- **Web2** construye el 70% del MVP (expediente, evidencias, certificaciones, UI, divulgación selectiva) contra el adapter en memoria, con tests deterministas y sin testnet.
- **Web3** implementa `arbitrum.adapter.ts` contra una interfaz que ya existe y ya tiene tests, en vez de contra una idea.

### La regla dura

`in-memory.adapter.ts` **no simula lógica de negocio**: guarda estados y devuelve lo que devolvería la cadena. El día que el motor Stylus calcule 42,000 y el fake calcule otra cosa, el fake está mal — no el motor.

---

## 5. Máquina de estados

```
Registered → Attested → Pledged → Funded → Repaid → (vuelve a Attested)
                ↓                    ↓
             Revoked             Defaulted → Executed
```

La autoridad de las transiciones es **on-chain** (`require()` en el contrato). Postgres es un **índice de eventos**, no la fuente de verdad: el Worker escucha eventos y proyecta el estado.

> Cuando Postgres y la cadena discrepan, gana la cadena. Siempre. Si el código de la API asume lo contrario en algún lado, eso es un bug.

---

## 6. Dónde vive el dinero (y dónde no)

El USDC va de la wallet del fondo al `CollateralVault` y del vault a la PYME, en la misma transacción. **Nunca pasa por el servidor.** Además de ser mejor ingeniería, es lo que jurídicamente saca al proyecto de ser intermediario financiero.

Consecuencia práctica: la API **no firma transacciones de valor**. Firma atestaciones EIP-712 y lee eventos. Nada más.

---

## 7. Lo que NO se construye

Marketplace, tokens transferibles, oráculos descentralizados, fraccionamiento, DAO.

Cuestan tiempo y abren preguntas regulatorias que no se pueden responder en un pitch de 4 minutos.

El `PAICertificate` es **soulbound** a propósito: representa que un activo _fue certificado_, no su propiedad. Un token transferible sería tokenizar derechos económicos, que es otra conversación y otra jurisdicción.

---

## 8. Lo que el contrato inteligente NO hace en un default

Emite el evento `DEFAULTED` con fecha, monto pendiente y atestaciones vigentes. **No se apodera de nada**, porque no puede: los derechos de cobro son un contrato bajo ley peruana.

La ejecución es legal y off-chain. Lo que la cadena aporta es la prueba que la sostiene — la misma prueba que hoy toma meses litigar.

> Un jurado técnico va a preguntar exactamente esto. Responder "el smart contract ejecuta la garantía" es falso y destruye credibilidad.

---

## 9. Variables de entorno pendientes

Todavía **no** están en `.env.example` ni validadas por Zod en `apps/api/src/config/env.validation.ts`. Se conectan en el PR que introduce cada módulo. Se documentan acá para que el lado Web3 sepa exactamente qué nombres esperar y no invente otros.

```env
# ── Cadena (Arbitrum) ─────────────────────────────────────────────
# in-memory → la API funciona sin cadena: dev, tests y demo Web2.
# arbitrum  → usa los contratos desplegados.
CHAIN_ADAPTER=in-memory
CHAIN_ID=421614
CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Direcciones desplegadas — vacías hasta el primer deploy a Arbitrum Sepolia
ASSET_REGISTRY_ADDRESS=
CERTIFICATION_ATTESTOR_ADDRESS=
BORROWING_BASE_ENGINE_ADDRESS=
COLLATERAL_VAULT_ADDRESS=
PAI_CERTIFICATE_ADDRESS=
USDC_ADDRESS=

# Wallet del backend: SOLO firma atestaciones EIP-712, nunca mueve dinero
ATTESTOR_PRIVATE_KEY=

# ── Storage de evidencias (MinIO en local, S3/R2 en producción) ───
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=pai-evidence
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true   # true para MinIO (path-style), false para S3 real
```

`ATTESTOR_PRIVATE_KEY` es la única clave privada del backend y su alcance está acotado a propósito: firma mensajes EIP-712, no transacciones de valor. Si en algún momento el código la usa para mover fondos, eso es un bug de arquitectura, no una feature.

---

## 10. Orden de construcción

| #   | Entrega                                                                | Estado               |
| --- | ---------------------------------------------------------------------- | -------------------- |
| 1   | Bootstrap del monorepo, docs, CI                                       | ✅                   |
| 2   | `packages/merkle` — hoja canónica, árbol, multiproof, vectores dorados | ✅                   |
| 3   | `ChainPort` + adapter en memoria + esqueleto de `chain/`               | ✅                   |
| 4   | Expediente: `assets` + `evidence` + storage + SHA-256                  | ⏳                   |
| 5   | `certifications` + divulgación selectiva + `/verify/:code`             | ⏳                   |
| 6   | Especificación del `BorrowingBaseEngine` con vectores dorados propios  | ✅                   |
| 7a  | `AssetRegistry` + `CertificationAttestor` en Solidity, con tests       | ✅                   |
| 7b  | Motor Stylus, `CollateralVault`, `PAICertificate`                      | ⏳                   |
| 8   | Account Abstraction ERC-4337                                           | Si alcanza el tiempo |

> El paso 3 se adelantó al expediente a propósito: con el puerto en su lugar, los módulos de dominio se escriben contra una interfaz que ya tiene tests, y el lado Web3 queda desbloqueado antes.

> El paso 6 merece el mismo tratamiento que la hoja de Merkle: la fórmula del borrowing base, sus tipos de punto fijo y sus casos borde definidos en TypeScript, con vectores dorados que el motor Stylus deba reproducir. Es lo que evita que el backend y el motor discrepen justo cuando el fondo recomputa en vivo, que es el momento de la demo donde no hay margen.

**Riesgo asumido:** si el equipo se traba con Rust, el `CollateralVault` arranca en Solidity y Stylus llega después. Un vault roto hunde el 25% de implementación técnica; un Stylus modesto pero funcional asegura el bounty.
