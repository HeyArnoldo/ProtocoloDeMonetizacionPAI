# Handoff: Panel PAI × Arbitrum

## Qué es esto

El panel de operación del protocolo PAI: 10 pantallas que cubren el flujo completo de 9 días del caso Contafácil SAC — expediente, certificación por tres partes, divulgación selectiva, recómputo del borrowing base en Stylus, fondeo en USDC y verificación pública.

**Empieza por `PROMPT.md`.** Ese archivo es el encargo para Claude Code, escrito para pegarse tal cual. Este README documenta el diseño con el detalle que el prompt no incluye.

## Sobre los archivos

Los archivos de este paquete son **referencias de diseño hechas en HTML** — prototipos que muestran el aspecto y el comportamiento buscados, no código de producción para copiar. La tarea es **recrear estas pantallas en `apps/web`** con lo que el repo ya usa (React + Vite, React Router, TanStack Query, shadcn/ui), no montar el HTML.

## Fidelidad

**Alta.** Colores, tipografía, espaciado e interacciones son finales. La aritmética del borrowing base es real (se ejecuta sobre la selección del usuario); todos los demás datos —hashes, direcciones, txs, atestaciones— son fijos y deben reemplazarse por lecturas de Arbitrum Sepolia.

## Layout general

Shell de dos columnas, alto de viewport, sin scroll en el shell.

- **Sidebar**: 244px fijo, `border-right: 1px solid var(--color-neutral-800)`, padding `18px 14px`, scroll propio. Marca arriba (`PAI` 19px + `× ARBITRUM` mono 10px acento), cuatro grupos de navegación con encabezado `h6` (10px, uppercase, `--color-neutral-600`), y al pie una tarjeta de red (chainId, bloque en vivo, gas).
- **Header**: 13px/26px de padding, borde inferior `--color-neutral-800`. Título 17px + subtítulo 11.5px, un tag de estado on-chain (`PLEDGED` / `FUNDED`) y la identidad con la dirección de la smart account.
- **Contenido**: scroll propio, padding `24px 26px 60px`, ancho máximo 1180-1240px según la pantalla.

Ítem de navegación activo: fondo `--color-accent-900`, texto `--color-accent-200`, radio 8px. Inactivo: transparente sobre `--color-neutral-400`, hover con tinte de texto al 7%.

## Pantallas

### 1. Resumen (`/`)

Cuatro KPIs (`repeat(auto-fit, minmax(190px, 1fr))`, valores mono 25px `white-space: nowrap`), la máquina de estados como fila de seis bloques con el actual en `--color-accent-900` + borde interior `--color-accent-700`, y abajo dos columnas: reparto de responsabilidad Web2/Arbitrum con barras de 4px, y los últimos eventos indexados.

### 2. Expediente (`/expediente`)

Tres tarjetas de identidad (`assetId`, `merkleRoot`, `controller`) y debajo, a 1.5fr/1fr: la **grilla de 216 hojas** (`repeat(24, 1fr)`, celdas `aspect-ratio: 1`, gap 3px, radio 2px) y dos tarjetas explicativas (anatomía de la hoja con la tupla ABI, y por qué el `debtorHash` lleva salt).

Estados de celda: divulgada `--color-accent-500` con borde `--color-accent-400`; oculta `--color-neutral-800` sin borde; no elegible transparente con borde `--color-neutral-700`. La grilla lee la misma selección que `/divulgacion`.

### 3. Evidencias (`/evidencias`)

Tres cifras (255 documentos, **0** archivos on-chain, $0.03 de gas) y una tabla de siete categorías con conteo, rol en el expediente y muestra de SHA-256.

### 4. Divulgación selectiva (`/divulgacion`)

A 1.45fr/1fr. Izquierda: tabla de 18 contratos, fila clicable, checkbox de 15px (marcado: fondo acento, check en color de fondo), tag de elegibilidad. Las dos municipalidades van a `opacity: 0.5`, `cursor: not-allowed` y tag `no cedible`.

Derecha: panel de multiproof con cuatro cifras (hojas divulgadas, ocultas, nominal, tamaño del proof), el root completo, y una segunda tarjeta con el payload exacto que sale hacia el fondo.

### 5. Recómputo del borrowing base (`/borrowing-base`)

A 1fr/1.25fr. Izquierda: parámetros de entrada en mono, botón de ejecución, y la comparación de gas Solidity (~9.4M) vs Stylus (~0.7M). Derecha: el desglose revelado línea a línea cada 380ms, con la base prestable a 22px en `--color-accent-300`, y al terminar la insignia `MATCH`.

Fórmulas implementadas (verificar contra el motor Stylus antes de portarlas):

```
pv       = nominal − nominal / (1 + aging × 6.5/12)
mora     = (nominal − pv) × 0.042
conc     = max(0, topShare − umbral) × nominal × 0.40
cont     = (100 − score) × 0.0009 × nominal
ajustado = nominal − pv − mora − conc − cont
base     = round(ajustado × advanceRate, −2)
```

Con los 12 contratos por defecto: nominal 96,000 → ajustado 79,620 → base 42,000.

### 6. Cola de atestaciones (`/certificacion`)

Tres tarjetas (`auto-fit, minmax(260px, 1fr)`), una por certificador: rol, wallet, ámbito EIP-712 (`REVENUE_VERIFIED`, `RIGHTS_ASSIGNABLE`, `SERVICE_CONTINUITY`), qué verifica y qué **no** ve, la métrica atestada, y el botón de firmar/revocar. Abajo, una tarjeta con marca de acento a la izquierda (`inset 3px 0 0 var(--color-accent)`) con el hallazgo del abogado.

### 7. Préstamo (`/prestamo`)

Dos columnas. Izquierda: seis datos del vault, el par `transferFrom` / `transfer` en un bloque mono, y `fundLoan`. Derecha: dos pestañas de desenlace (repago / default) con el texto correspondiente. La de default debe decir explícitamente que el contrato **produce la prueba**, no ejecuta la garantía.

### 8. Historial crediticio (`/historial`)

Tabla de dos ciclos (real y proyectado) y tres cifras de mejora: −3.5 pts de tasa, +8.2 pts de advance rate, portabilidad.

### 9. Actividad on-chain (`/actividad`)

Cuatro contadores y la tabla de txs: hash enlazable a Arbiscan, contrato, método, firmante, gas, bloque, estado.

### 10. Verificación pública (`/verify/:code`)

Fuera de `ProtectedRoute`. Barra de URL, tarjeta del `PAICertificate` soulbound con las tres atestaciones, y el bloque de re-hasheo que revela cinco pasos cada 420ms hasta «Coincide con `AssetRegistry.assets(assetId).merkleRoot`».

## Interacciones

| Acción                   | Efecto                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Clic en fila de contrato | Alterna divulgación; recalcula hojas, nominal, proof, grilla de 216 celdas y base prestable. Resetea el desglose de Stylus |
| Ejecutar recómputo       | Revela 7 líneas cada 380ms; al final, insignia MATCH                                                                       |
| Firmar atestación        | Alterna firmada/revocada; cambia el botón a `btn-secondary`                                                                |
| `fundLoan`               | Estado FUNDED, avanza la máquina de estados, añade una tx a la actividad                                                   |
| Verificar                | 5 pasos cada 420ms, último en `--color-accent-300`                                                                         |
| Bloque                   | `+1` cada 2400ms                                                                                                           |

Animación de entrada única: `pulseIn`, 220-300ms, `opacity 0 → 1` con `translateY(4px) → 0`.

## Estado

```
screen      string     pantalla activa
selected    number[]   ids de contratos divulgados (por defecto 1..12)
stylusStep  0..7       progreso del desglose
signed      number[]   índices de certificadores con atestación vigente
funded      boolean
outcome     'repago' | 'default'
verifyStep  0..5
block       number
```

En producción: `screen` y `outcome` son estado de UI; `selected` es estado de UI que alimenta la construcción del proof; el resto viene de la cadena.

## Tokens

Todos salen de `nocturne-styles.css`. Los que más se usan:

| Rol                   | Valor                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Fondo                 | `#161826`                                                                 |
| Superficie            | `#232532`                                                                 |
| Texto                 | `#e9e9ed`                                                                 |
| Acento                | `#9184d9`                                                                 |
| Acento oscuro / claro | `--color-accent-900` `#2b2741` · `--color-accent-300` `#d2cefd`           |
| Neutrales usados      | 800 `#3f424d`, 700 `#595d6c`, 600 `#75798c`, 500 `#9397ab`, 400 `#b2b6ca` |
| Radios                | 4 / 8 / 14px                                                              |
| Espaciado             | 2.8 · 5.6 · 8.4 · 11.2 · 16.8 · 22.4px                                    |
| Elevación             | `--shadow-sm` = `0 0 0 1px #3f424d`                                       |

Tipografía: Inter 400/500, headings a 500 y nunca más. Escala usada: 25px (cifra titular), 20/17px (títulos), 13-13.5px (cuerpo), 11-12px (meta), 10px (kicker uppercase con `letter-spacing: 0.1em`).

Todo dato numérico o hexadecimal en `ui-monospace, SFMono-Regular, Menlo, monospace`.

## Assets

Ninguno. Sin imágenes, sin iconos importados. Si añades iconos, usa Phosphor (el sistema lo especifica).

## Archivos

- `PROMPT.md` — el encargo para Claude Code. Empieza aquí.
- `Panel PAI.dc.html` — la maqueta completa. Ábrela en un navegador.
- `nocturne-styles.css` — los tokens y las clases del sistema visual.
- `referencia-pai-arbitrum.md` — el documento de arquitectura del que sale todo el contenido.
