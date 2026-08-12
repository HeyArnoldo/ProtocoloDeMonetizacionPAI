# Caso de uso para exponer — PAI × Arbitrum

Este documento es para **pararse frente al jurado**. La narrativa completa y los números del caso viven en [`referencia-pai-arbitrum.md`](referencia-pai-arbitrum.md); acá está lo que se muestra, en qué orden, qué frase acompaña cada pantalla y —lo más importante— **qué se responde cuando pregunten por lo que falta**.

Una regla gobierna todo el documento:

> **Nada que no se pueda abrir en Arbiscan delante del jurado.** Un jurado que descubre una sola pieza maquillada deja de creer el resto, incluido lo que sí era cierto.

---

## 1. El problema, en treinta segundos

Contafácil SAC factura S/ 48k al mes con 142 clientes. Tiene cuatro años de operación, once empleados y **cero activos fijos hipotecables**. Necesita USD 35 000 para crecer.

El banco le ofrece una salida: que el gerente hipoteque su casa.

Ese es el problema. No es falta de solvencia — es que **la solvencia de esta empresa no tiene forma de ser probada**. Sus contratos de suscripción valen dinero real y no existen para el sistema financiero.

## 2. La tesis

> La cadena no reemplaza al abogado ni al registro público. Reemplaza **la necesidad de confiar en el operador de la plataforma**.

El monto prestable deja de ser un número que un backend afirma y pasa a ser una **función determinista que el prestamista recomputa por su cuenta**.

**El test decisivo del track:** si un jurado quita la blockchain y la solución sigue funcionando igual, esto es gestión documental, no DeFi/RWA. Por eso on-chain vive la **ruta crítica de confianza** —valorización, custodia y dinero— y no el expediente.

## 3. Por qué una cartera de cobros y no la marca

Es la decisión que separa este proyecto de un tokenizador genérico, y conviene decirla en voz alta:

| Activo candidato             | Contraparte identificable | Monto cierto | Fecha de pago | Veredicto                                                |
| ---------------------------- | ------------------------- | ------------ | ------------- | -------------------------------------------------------- |
| Código fuente                | No                        | No           | No            | Sin el equipo que lo mantiene es un ZIP                  |
| Patente o marca              | No                        | No           | No            | Ejecutable pero ilíquida: ¿quién la compra en un remate? |
| **Cartera de suscripciones** | **Sí**                    | **Sí**       | **Sí**        | ✅ Derecho de cobro con obligado conocido                |

> **La regla:** el activo financiable no es el que más _vale_, es el que tiene **un tercero obligado a pagar en una fecha**.

El código, la marca y las cesiones sí entran al expediente — como **evidencia de continuidad**: prueban que la empresa puede seguir prestando el servicio que genera esos cobros.

## 4. Los dos momentos que ganan la ronda

Si hay que cortar algo, se corta cualquier otra cosa menos estos dos.

### 4.1 Divulgación selectiva — `/divulgacion`

El prestamista necesita valorar la cartera. La PYME no quiere entregarle su lista de clientes.

Se eligen las cuotas a mostrar y se construye un **multiproof de Merkle real**. El prestamista recibe solo las hojas divulgadas y prueba que pertenecen al expediente certificado, sin ver las demás ni sus contrapartes.

**El argumento entero cabe en un detalle:** el `merkleRoot` **no cambia** con la selección. La pantalla lo hace explícito y cuenta cuántas selecciones distintas se probaron sin que se moviera.

> «Sin ZK. Solo un árbol de Merkle, y la propiedad que nos hacía falta ya estaba ahí.»

### 4.2 Recómputo del monto prestable — `/borrowing-base`

El desglose línea a línea: nominal divulgado, descuento por plazo, haircut de morosidad, haircut de concentración, ajuste de continuidad, valor ajustado, base prestable.

> «Este número no le pedimos que lo crea. Le pedimos que lo recompute.»

**Y acá viene la parte honesta**, que se dice antes de que la pregunten: hoy ese cálculo corre en el navegador con `@app/borrowing-base`, la especificación normativa que el motor debe reproducir byte a byte. La pantalla lo etiqueta **cálculo local de referencia** y no muestra la insignia MATCH.

> «MATCH solo significa algo cuando hay dos números de dos fuentes distintas. Hoy hay uno, y decir MATCH sería comparar la pantalla consigo misma.»

Esa frase compra más credibilidad que un badge verde inventado.

## 5. Qué se puede abrir en Arbiscan ahora mismo

Los seis contratos están desplegados en **Arbitrum Sepolia** (chain `421614`). Fuente única: [`chain/deployments/421614.json`](../chain/deployments/421614.json).

| Contrato                | Qué prueba delante del jurado                                  |
| ----------------------- | -------------------------------------------------------------- |
| `AssetRegistry`         | El `merkleRoot` del expediente queda escrito y fechado         |
| `CertificationAttestor` | Cada atestación es de un firmante acotado y es revocable       |
| `PAICertificate`        | Credencial soulbound: no se vende ni se transfiere             |
| `BorrowingBaseEngine`   | La fórmula del monto prestable vive on-chain                   |
| `CollateralVault`       | Custodia, préstamo, repago y default                           |
| `MockUSDC`              | Token de demo de 6 decimales. **No es USDC nativo, y se dice** |

El panel no afirma esa conexión: la demuestra. `GET /api/chain/status` devuelve `chainId`, bloque seguro y cabeza de cadena, y el punto del sidebar solo late cuando hubo una lectura real del RPC. Si el RPC se cae en vivo, el panel lo dice — no se queda en verde mintiendo.

```bash
curl -s https://api-pai.cloud.groowtech.com/api/chain/status | jq '{status, chainId, safeBlock}'
```

## 6. Guion de demo — 4 minutos

| Min  | Pantalla                                        | Frase clave                                                      |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 0:00 | Login y panel. El punto late con el bloque real | «El panel no dice que está conectado: muestra a qué altura leyó» |
| 0:30 | Evidencias → árbol de Merkle → tx en Arbiscan   | «Del expediente entero, on-chain viajan 32 bytes»                |
| 1:15 | Certificación desde tres wallets distintas      | «Ninguno ve todo. Cada firma es acotada y revocable»             |
| 2:00 | **Divulgación selectiva: 12 de 16**             | «Prueba sin revelar. Sin ZK, solo Merkle»                        |
| 2:30 | **Desglose del monto prestable**                | «Este número no le pedimos que lo crea. Que lo recompute»        |
| 3:15 | Originación y fondeo → mUSDC llega a la PYME    | «El dinero nunca tocó nuestro servidor»                          |
| 3:45 | Verificación pública sin sesión                 | «Ábrala usted, sin credenciales nuestras»                        |

**Cierre sugerido:** abrir `/verify` en el navegador del jurado. Es la única pantalla que no requiere confiar en nadie del equipo.

## 7. Las preguntas incómodas, con su respuesta

Anticiparlas es la diferencia entre parecer honesto y parecer descubierto.

**«¿El motor de riesgo es Stylus, como dice el track?»**
Todavía no. `BorrowingBaseEngine` está desplegado y funcionando **en Solidity**, con sus vectores dorados pasando. La especificación normativa en TypeScript ya existe justamente para que la versión en Rust tenga contra qué compararse byte a byte. Presentarlo como Stylus hoy sería falso.

**«¿Eso es USDC de verdad?»**
No. Es `MockUSDC`, un token de demo de 6 decimales desplegado por nosotros. En producción se apunta al USDC nativo de Arbitrum y no cambia una línea del vault.

**«¿La empresa maneja una wallet?»**
Hoy sí: cada actor firma desde su propia MetaMask, y eso es deliberado — **el backend no guarda ninguna clave privada** y por lo tanto no puede mover el dinero de nadie. La cuenta inteligente ERC-4337 que haría invisible la wallet está diseñada, no construida.

**«¿Y si su servidor miente?»**
Esa es la pregunta que el proyecto responde. El monto prestable sale de una función `view` sobre datos cuyo `merkleRoot` está on-chain: recompútelo usted. Cuando Postgres y la cadena discrepan, gana la cadena.

**«¿Los haircuts de dónde salen?»**
Son ilustrativos, aritméticamente consistentes y representativos del mercado SaaS B2B peruano. Para producción necesitan la calibración de un analista de riesgo real. Decirlo muestra criterio.

## 8. Lo que hay que tener listo antes de subir al escenario

El detalle que hunde demos: llegar a la pantalla del préstamo con las wallets sin fondear.

- [ ] Un expediente **ya registrado y certificado** en testnet, con su `assetId` anotado. La demo se abre sobre él; no se crea uno en vivo.
- [ ] Las seis wallets con `0.001–0.002 ETH` de Arbitrum Sepolia.
- [ ] La wallet del fondo con saldo de `MockUSDC` suficiente para el principal del guion.
- [ ] Roles on-chain concedidos desde la wallet Admin — son un sistema distinto de los roles de la aplicación.
- [ ] Un segundo expediente de repuesto, por si una tx queda colgada.
- [ ] `GET /api/chain/status` devolviendo `"live"` diez minutos antes.

> **El principal se escribe en unidades del token (6 decimales), no en centavos.** USD 5 000,00 son `5000000000`. El campo del panel muestra la equivalencia mientras se escribe, precisamente porque confundir las dos escalas hace revertir la transacción y MetaMask, al no poder estimar el gas de una tx que revierte, muestra cifras absurdas.
