# PAI × Arbitrum — Documento de referencia

> Consolidado de las decisiones de arquitectura, fundamentos técnicos y caso de uso.
> Contexto: hackathon Track Arbitrum, categoría **DeFi / RWA**.

---

## 1. La decisión estratégica

### El problema con el diseño original

El documento base define un reparto **85% Web2 / 15% Web3**, usando la cadena como notaría de hashes. Es técnicamente correcto, pero frente a este track falla:

- El track exige *"uso verificable de Arbitrum como componente principal"*.
- La rúbrica asigna **35%** a blockchain (20% uso de Arbitrum + 15% innovación).
- **Test decisivo:** si un jurado puede quitar la blockchain y la solución sigue funcionando igual, esos 35 puntos se caen.

Con una notaría de hashes, Arbitrum es reemplazable por Polygon, Base o incluso Postgres con timestamps firmados.

### La corrección

No se trata de tokenizar todo. Se trata de mover **la ruta crítica de confianza** on-chain: valorización, custodia del colateral y dinero.

| | Antes | Ahora |
|---|---|---|
| Reparto | 85% Web2 / 15% Web3 | ~55% Web2 / 45% Arbitrum |
| Rol de la cadena | Notario pasivo | Contraparte activa |
| Autoridad del backend | Escribe estados | Firma atestaciones e indexa eventos |

**El porcentaje importa menos que *qué* se movió.**

---

## 2. Fundamentos: qué hace realmente la blockchain aquí

### El error mental común

No "subes el activo a la blockchain". **Nunca subes el archivo, ni el contrato, ni datos personales.** Solo subes una *huella*.

1. Las evidencias van a **storage** (S3/MinIO), cifradas.
2. El backend calcula **SHA-256** de cada archivo (cambia por completo si se altera un byte).
3. Se arma un **manifiesto** → se hashea todo junto.
4. Solo ese hash se escribe on-chain.

**Qué prueba:** integridad + fecha + quién firmó.
**Qué NO prueba:** propiedad legal, valor, ni que te van a pagar.

### Anatomía del smart contract

```solidity
contract AssetRegistry is AccessControl, Pausable {
```
Herencia de **OpenZeppelin** (librería estándar auditada — no reinventar):
- `AccessControl` → sistema de roles: quién puede llamar qué función.
- `Pausable` → botón de emergencia para congelar el contrato.

```solidity
bytes32 public constant CERTIFIER_ROLE = keccak256("CERTIFIER_ROLE");
```
Un rol es literalmente un hash. Solo wallets con ese rol pueden certificar (en la práctica: la wallet institucional del auditor).

```solidity
struct Asset {
    bytes32 manifestHash;   // huella del expediente
    address controller;     // wallet que controla el activo
    uint64  registeredAt;   // timestamp
    Status  status;         // enum
}
mapping(bytes32 => Asset) public assets;
```
Un `mapping` es un diccionario: clave `assetId`, valor el struct. **Esta es toda la base de datos on-chain.** Nada más.

```solidity
event AssetRegistered(bytes32 indexed assetId, ...);
```
Los **eventos** son la pieza más subestimada. Son logs baratos que el backend "escucha". En vez de consultar la cadena constantemente, el Worker se suscribe y actualiza Postgres. `indexed` permite filtrar eficientemente.

```solidity
function certifyAsset(...) external onlyRole(CERTIFIER_ROLE) {
    require(assets[assetId].status == Status.Active, "Invalid state");
    assets[assetId].status = Status.Certified;
    emit AssetCertified(assetId, certificateHash);
}
```
`onlyRole` es el guardia (revierte si no tiene el rol). `require` valida la máquina de estados. **Es el mismo patrón de guards + validación que ya usas en NestJS, pero on-chain.**

### Las dos piezas de conexión

- **Viem** — cliente que usa NestJS para hablar con la cadena. El equivalente de lo que TypeORM es para Postgres.
- **EIP-712** — estándar para que un usuario *firme un mensaje estructurado* sin gastar gas. Sirve para la declaración de titularidad y para las atestaciones del backend-oráculo.

---

## 3. Los cuatro cambios arquitectónicos

### 3.1 De `manifestHash` a Merkle root

El hash plano solo prueba "este expediente existía". Un **Merkle root** permite probar que *tres facturas específicas* están dentro del expediente certificado sin revelar las otras 197.

Mismo costo on-chain, muchísima más utilidad. Habilita todo lo demás.

### 3.2 La valorización se vuelve verificable

**Este es el cambio de fondo.** En el diseño original el LTV lo calcula el backend y el banco debe creerte — es exactamente el problema que PAI dice resolver, resuelto pidiendo confianza en un nuevo intermediario.

Ahora es una función determinista on-chain que el prestamista recomputa.

### 3.3 Aparece el dinero

El documento original terminaba en *"el activo se marca como garantía"* — un flag en Postgres. Con `CollateralVault` + USDC nativo hay originación, desembolso, repago y default reales.

**Sin esto no calificas en DeFi/RWA, calificas en gestión documental.**

### 3.4 El backend pierde autoridad

Pasa de escribir estados a *firmar atestaciones EIP-712* que el contrato verifica, y a *indexar eventos*. Las transacciones de valor las manda el usuario desde su smart account.

**Efecto secundario crítico:** el dinero nunca pasa por tu servidor → jurídicamente te saca de ser intermediario financiero.

---

## 4. Suite de contratos

| Contrato | Lenguaje | Responsabilidad |
|---|---|---|
| `AssetRegistry.sol` | Solidity | Merkle root de evidencias, ciclo de vida del activo |
| `CertificationAttestor.sol` | Solidity | Atestaciones firmadas, revocables por rol |
| `BorrowingBaseEngine` | **Stylus (Rust)** | Multiproof + haircuts + cálculo de monto prestable |
| `CollateralVault.sol` | Solidity | Custodia, préstamo, repago, default |
| `PAICertificate.sol` | Solidity | ERC-721 **soulbound** — credencial verificable |

**Nota sobre `PAICertificate`:** soulbound (no transferible) representa que un activo *fue certificado*, no su propiedad. Evita la trampa regulatoria de tokenizar derechos económicos.

### Máquina de estados (ahora on-chain)

```
Registered → Attested → Pledged → Funded → Repaid → (vuelve a Attested)
                ↓                    ↓
             Revoked             Defaulted → Executed
```

Antes: 11 estados en un enum de TypeScript.
Ahora: 8 estados on-chain con transiciones aplicadas por `require()`. **Nadie —ni tú— puede saltarse el orden.**

---

## 5. Stylus: por qué es esencial y no decorativo

El bounty *Best Stylus Project* exige que Stylus sea parte esencial de la lógica, no un hello-world.

### El caso de uso: motor de borrowing base

Un lote de cuentas por cobrar puede tener 200+ facturas. Calcular cuánto se puede prestar exige:

1. Verificar inclusión de cada hoja en el Merkle root (multiproof)
2. Aplicar *aging* (descuento por vencimiento)
3. Haircut por concentración de deudor
4. Descuento por plazo con aritmética de punto fijo

**En Solidity ese bucle es prohibitivo. En Rust es natural.**

### El argumento para los jurados

> "No elegimos Rust por gusto. Elegimos Arbitrum porque este cálculo no cabe económicamente en el EVM."

### Datos técnicos verificados

- Stylus permite Rust, C y C++ compilados a WASM, con **interoperabilidad total**: desde Solidity se puede llamar a un programa Rust y viceversa (segunda VM coequal al EVM).
- Costos de gas reducidos para operaciones intensivas en memoria y cómputo.
- **OpenZeppelin ya publicó su librería de contratos para Stylus**, portada desde `openzeppelin-contracts`. El Stylus Rust SDK fue auditado por OpenZeppelin.
- ⚠️ **La verificación de contratos WASM en el block explorer estaba aún en desarrollo.** Si sigue así, compensa publicando el hash de compilación y un script reproducible en el repo — "evidencia verificable en el repositorio" es requisito explícito del track.

### Beneficio colateral: divulgación selectiva

El multiproof permite que la empresa pruebe que N facturas específicas están en el expediente certificado **sin revelar el resto ni sus contrapartes**. Privacidad comercial real, sin ZK.

---

## 6. Por qué Arbitrum y no otra L2

**Ten esta respuesta lista — vale 20% de la nota.**

| Razón | Detalle |
|---|---|
| **Stylus solo existe aquí** | El motor de riesgo es imposible de portar a Base u Optimism sin rediseñarlo |
| **Gas bajo → granularidad económica** | Registrar cada factura como hoja del árbol. En L1 habría que batchear y se pierde trazabilidad fina |
| **USDC nativo de Circle** | RWA lending necesita una stablecoin creíble, no un wrapper |
| **Orbit como fase 2** | Los bancos pedirán cadena permisionada. Una Orbit chain que liquida contra Arbitrum One es la narrativa de escalamiento institucional |

---

## 7. Alineación con la rúbrica

| Criterio | % | Dónde se gana |
|---|---|---|
| Impacto del problema | 20% | PYMES latinoamericanas sin garantía física. Anclar con dato de brecha de financiamiento PYME en Perú |
| Innovación con blockchain | 15% | Valorización verificable + divulgación selectiva sin ZK |
| Implementación técnica | 25% | 5 contratos, tests, indexer, monorepo serio |
| Uso de Arbitrum | 20% | Stylus esencial + USDC nativo + argumento de por qué no otra L2 |
| Experiencia del usuario | 15% | **ERC-4337.** La PYME no debe ver una seed phrase jamás |
| Presentación final | 5% | Demo del flujo completo en vivo, no slides |

**No subestimar el 15% de UX.** Account Abstraction con smart accounts + gas patrocinado es lo que separa "demo de hackathon" de "algo que un contador de PYME usaría". Además cuenta doble: Account Abstraction es categoría oficial del track.

---

## 8. Stack actual vs. lo que falta

Base: `github.com/HeyArnoldo/TemplateFullStack`

### Ya existe (reutilizable tal cual)

- Monorepo pnpm con `apps/api` + `apps/web` + `packages/contracts`
- NestJS 11 + TypeORM + Postgres 16 con migraciones (`synchronize: false`)
- Auth JWT en cookie httpOnly, RBAC, validación Zod compartida
- Deploy Coolify + Docker + CI
- La "receta para agregar feature" (contrato Zod → entity → service → controller → hooks) es el patrón para clonar `assets`, `evidence`, `certifications`

### Lo que hay que agregar

| Pieza | Esfuerzo | Nota |
|---|---|---|
| Módulos `assets`, `evidence`, `valuations`, `certifications` | Medio | CRUD sobre el patrón actual. **~70% del MVP y es Web2 puro** |
| Storage (S3/R2/MinIO) + hashing SHA-256 | Bajo | MinIO en Docker local, `crypto` nativo de Node |
| Carpeta `chain/` con Foundry o Hardhat | Medio | Deploy a **Arbitrum Sepolia** |
| `BlockchainModule` con Viem + Worker con cola (BullMQ + Redis) | Medio-alto | Lo único realmente nuevo. Evita que la API espere confirmaciones |
| Página pública de verificación (`/verify/:code`) | Bajo | Re-hashea y compara contra la cadena. Es el "wow" del demo |
| Smart accounts ERC-4337 | Medio | Al final, si alcanza el tiempo |

### ⚠️ Choque de nombres

El template usa `packages/contracts` para los **schemas Zod**. El documento usa `packages/contracts` para los **smart contracts de Solidity**.

**Solución:** dejar `packages/contracts` = Zod (como está) y poner todo lo blockchain en una carpeta raíz `chain/`. Los ABIs generados se exportan a `packages/evm` para que la API los consuma tipados.

---

## 9. Caso de uso end-to-end: Contafácil SAC

### El perfil

SaaS de facturación electrónica para bodegas, Lima. 4 años, 142 clientes, S/ 48k MRR, 11 empleados, **S/ 0 en activos fijos hipotecables**. Necesita USD 35,000. El banco le pide hipotecar la casa del gerente.

### 9.1 Elegir bien el activo — la decisión crítica

Una empresa de software tiene tres candidatos, **y dos son trampas**:

| Activo | Contraparte identificable | Monto cierto | Fecha de pago | Veredicto |
|---|---|---|---|---|
| Código fuente | No | No | No | Vale por el equipo que lo mantiene. Sin equipo es un ZIP |
| Patente / marca | No | No | No | Ejecutable pero ilíquida. ¿Quién la compra en un remate? |
| **Cartera de contratos de suscripción** | **Sí** | **Sí** | **Sí** | ✅ **Este.** Derecho de cobro con obligado conocido |

> **La regla:** el activo financiable no es el que *vale* más, es el que tiene **un tercero obligado a pagar en una fecha**.

El código, la marca INDECOPI y las cesiones de derechos sí entran al expediente — pero como **evidencia de continuidad del servicio**: prueban que la empresa puede seguir prestando el servicio que genera esos cobros. Si el SaaS muere, los contratos no se cobran.

> **Para financiar una patente pura:** el camino es un contrato de licenciamiento vigente con regalías. O sea, otra vez, un derecho de cobro.

**Activo declarado:** 18 contratos corporativos anuales vigentes. Valor contratado remanente a 12 meses: **USD 154,000**.

### 9.2 Día 1 — Expediente

**Onboarding sin fricción:** login con Google → JWT en cookie httpOnly. En segundo plano se despliega una smart account ERC-4337. **Rosa no ve la palabra "wallet" en ningún momento.**

**Evidencias cargadas (255 documentos):** 18 contratos firmados, 216 facturas XML SUNAT, 12 extractos bancarios, reporte de pasarela de pagos, certificado INDECOPI, 6 cesiones de derechos de ex-contratistas, informe técnico de dependencias/licencias.

**Del expediente al árbol** — el paso que cambia todo:

```
hoja = keccak256(deudorHash, montoUSD, fechaVencimiento, moneda, docHash)
18 contratos × 12 cuotas = 216 hojas → merkleRoot
```

**1 tx on-chain:** `AssetRegistry.registerAsset(assetId, merkleRoot, ownerIdHash)` — firmada por la smart account, no por el backend.

### 9.3 Días 2-7 — Certificación

Ningún certificador ve todo. **Esta separación es lo que hace creíble el resultado.**

| Certificador | Verifica | Atestación |
|---|---|---|
| Contador público | 216 facturas en SUNAT, abonos en extractos. Mora histórica 4.2% | `REVENUE_VERIFIED` — 420 bps |
| Abogado | Cesión permitida, sin prenda previa, marca vigente | `RIGHTS_ASSIGNABLE` — 16 de 18 |
| Auditor técnico | SaaS opera, sin licencias GPL contaminantes, infra sostenible | `SERVICE_CONTINUITY` — 78/100 |

**3 tx on-chain:** cada uno llama `CertificationAttestor.attest()` desde su propia wallet con `CERTIFIER_ROLE`. Firmadas, fechadas y **revocables**.

> **🔑 El hallazgo del abogado es el argumento de venta.** Encontró que 2 de los 18 contratos (las municipalidades) tienen cláusula de no-cesión. Con un solo `manifestHash` eso sería invisible: el expediente estaría certificado o no. Con el árbol de Merkle, esos dos se marcan no elegibles y el resto sigue financiable.
>
> **La granularidad no es un detalle técnico: es lo que evita que un expediente entero se caiga por dos documentos malos.**

**Resultado:** se emite el `PAICertificate` soulbound. Link público compartible con cualquier banco.

### 9.4 Día 8 — Divulgación selectiva y cálculo

Contafácil **no quiere revelar sus dos clientes más grandes** (ventaja competitiva). Selecciona 12 de los 16 contratos elegibles. El backend construye un multiproof de las 144 hojas correspondientes. **Las otras 72 hojas nunca salen de S3.**

**El motor Stylus calcula:**

```
Nominal divulgado (12 contratos × 12 cuotas)          USD  96,000
− Valor presente por plazo (18% anual, dur. 6.5m)     −     8,500
− Haircut morosidad histórica (420 bps, atestado)     −     3,700
− Haircut concentración (cliente top 31%, umbral 25%) −     2,300
− Ajuste continuidad de servicio (score 78/100)       −     1,900
────────────────────────────────────────────────────────────────
= Valor ajustado por riesgo                           USD  79,600
× Advance rate derechos de cobro SaaS (52.8%)         USD  42,000
```

> **Por qué importa:** este número **no lo afirma el backend**. El fondo toma el root certificado, las hojas divulgadas y el proof, llama a la misma función `view` y obtiene 42,000. Si el servidor mintiera, el contrato lo contradiría.

Contafácil solicita **35,000 USDC** a 9 meses (83% de la base, dejando colchón).

### 9.5 Día 9 — Fondeo

Andes Capital (fondo de factoring):
1. Verifica las tres atestaciones on-chain y quién las firmó
2. **Recomputa el borrowing base** contra el motor Stylus → 42,000. Coincide
3. Revisa el contrato legal de cesión de derechos (off-chain, jurisdicción Lima)
4. Llama `fundLoan(loanId, 35000e6)`

El vault ejecuta `transferFrom(fondo → vault)` y `transfer(vault → Contafácil)` en la misma tx.

**Tiempo total: 9 días.** El banco tradicional: 6-10 semanas con hipoteca de vivienda.

### 9.6a Desenlace A — Repago y efecto compuesto

Mes 9: repaga 35,000 + 4,725 de interés. Colateral liberado.

**Lo interesante viene después.** Contafácil tiene ahora un historial crediticio on-chain, portable y verificable:

```
Primer préstamo (sin historial):   18.0% anual · advance rate 52.8%
Segundo préstamo (1 ciclo limpio): 14.5% anual · advance rate 61%
```

> **El flywheel es el argumento de impacto más fuerte del proyecto.** La PYME no solo consigue capital una vez: construye un track record que hoy no existe en ningún lado y que puede llevarse a cualquier prestamista del protocolo.

### 9.6b Desenlace B — Incumplimiento

**Lo que hace el contrato:** transiciona a `DEFAULTED`, emite evento con fecha exacta, monto pendiente y atestaciones vigentes. Prueba incontrovertible.

**Lo que NO hace:** no se apodera de nada. No puede — los derechos de cobro son un contrato bajo ley peruana.

**Lo que pasa realmente:** el evento `DEFAULTED` es el disparador contractual pactado. Andes Capital notifica notarialmente a los 12 clientes que paguen directamente al fondo. **La ejecución es legal y off-chain; la prueba que la sostiene es on-chain.**

> ⚠️ **Un jurado técnico va a preguntar exactamente esto.**
> Responder *"el smart contract ejecuta la garantía"* es falso y destruye credibilidad.
> Responder *"la cadena produce la prueba que activa la ejecución legal, y esa prueba es lo que hoy toma meses litigar"* demuestra que entiendes el dominio.

---

## 10. Guion de demo (4 minutos)

| Min | Pantalla | Frase clave |
|---|---|---|
| 0:00 | Rosa entra con Google. Cero seed phrases | "Ella no sabe que tiene una wallet" |
| 0:30 | Sube contratos → árbol en vivo → tx en Arbiscan | "216 hojas, un root, 3 centavos de gas" |
| 1:15 | Certificadores firman desde 3 wallets distintas | "Ninguno ve todo. Cada firma es acotada y revocable" |
| 2:00 | **Selector de divulgación:** 12 de 16 | "Prueba sin revelar. Sin ZK, solo Merkle" |
| 2:30 | **Stylus calcula 42,000 en vivo** con desglose | "Este número no le pedimos que lo crea. Que lo recompute" |
| 3:15 | Fondo fondea → USDC llega a Rosa | "El dinero nunca tocó nuestro servidor" |
| 3:45 | Historial crediticio on-chain | "Y la próxima vez le cuesta 3.5 puntos menos" |

> **Regla de oro:** mostrar el **selector de divulgación** y el **desglose de Stylus** aunque haya que cortar otra cosa. Son los dos momentos donde un jurado ve algo que no vio en las otras 40 demos.

---

## 11. Alcance y riesgos

### Lo que NO construir

Marketplace, tokens transferibles, oráculos descentralizados, fraccionamiento, DAO. Además de consumir tiempo, exponen a preguntas regulatorias incómodas.

### Orden sugerido

1. `AssetRegistry` + `CertificationAttestor` en Solidity
2. `BorrowingBaseEngine` en Stylus con tests
3. `CollateralVault` con USDC
4. Indexer y UI sobre el template existente
5. Account Abstraction (si alcanza el tiempo)

### ⚠️ Riesgo principal

Rust + Stylus tiene curva de aprendizaje, y el `CollateralVault` maneja fondos (aunque sea testnet).

**Si el equipo no tiene experiencia en Rust:** empezar el vault en Solidity y añadir Stylus después. Un vault roto hunde el 25% de implementación técnica; un Stylus modesto pero funcional asegura el bounty.

### Sobre los números del caso

Los haircuts (420 bps de morosidad, 52.8% de advance rate, umbral de concentración 25%) son **ilustrativos**, aritméticamente consistentes y representativos del mercado SaaS B2B peruano.

Para el hackathon están perfectos. Para producción necesitan calibración de un analista de riesgo real. **Decirlo en la presentación muestra criterio, no debilidad.**

---

## 12. Frases para tener a mano

> "La cadena no reemplaza al abogado ni al registro público — reemplaza la necesidad de confiar en el operador de la plataforma."

> "El monto prestable deja de ser un número que nuestro backend afirma y pasa a ser una función determinista que el prestamista puede recomputar."

> "El activo financiable no es el que vale más, es el que tiene un tercero obligado a pagar en una fecha."

> "Blockchain maneja el estado y la prueba; la ejecución legal sigue siendo off-chain."

---

## 13. Próximos pasos abiertos

- [ ] Especificación funcional del `BorrowingBaseEngine` (fórmulas, tipos de punto fijo, casos borde)
- [ ] Estructura de las hojas del Merkle tree y construcción de multiproofs en el backend
- [ ] Esqueleto de contratos Solidity con Foundry + tests
- [ ] `BlockchainModule` en NestJS con Viem y cola del Worker
- [ ] Dato de brecha de financiamiento PYME en Perú para anclar el impacto
