/**
 * Formato del dinero y de los ratios del panel.
 *
 * Dos reglas gobiernan este archivo:
 *
 * 1. **Los montos nunca pasan por coma flotante.** Llegan en unidades menores
 *    como `bigint` o como string decimal (JSON no serializa bigint) y se
 *    parten en unidades y céntimos con aritmética entera. Un `Number` en el
 *    camino es una discrepancia esperando el peor momento.
 * 2. **Ningún ratio divide sin guarda.** La maqueta llega a renderizar
 *    «Infinity%» al limpiar la selección, porque divide por un nominal de 0.
 *    Aquí un total no positivo devuelve `null` y la UI muestra un guion.
 */

/** Códigos numéricos ISO-4217 con etiqueta legible. */
const CURRENCY_LABEL: Record<number, string> = { 840: 'USD', 604: 'PEN' };

const MINOR_UNITS_PER_UNIT = 100n;

/** Separador de millares por grupos de tres, sobre el texto y no sobre el número. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Monto en unidades menores como texto.
 *
 * Sin etiqueta conocida se muestra el código numérico: inventar un símbolo
 * para una moneda que el protocolo no soporta sería peor que enseñar el 978.
 */
export function formatMinorUnits(amountMinor: string | bigint, currency: number): string {
  const minor = BigInt(amountMinor);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;

  const units = absolute / MINOR_UNITS_PER_UNIT;
  const cents = absolute % MINOR_UNITS_PER_UNIT;

  const label = CURRENCY_LABEL[currency] ?? String(currency);
  const amount = `${groupThousands(units.toString())}.${cents.toString().padStart(2, '0')}`;

  return `${label} ${negative ? '-' : ''}${amount}`;
}

/**
 * Fecha de vencimiento en ISO.
 *
 * Se corta el ISO en UTC en vez de usar `toLocaleDateString`: la hoja del
 * árbol fija el vencimiento a medianoche UTC, y un navegador en Lima
 * (UTC−5) mostraría el día anterior.
 */
export function formatDueDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Qué porcentaje representa `part` de `whole`.
 *
 * Devuelve `null` —y no `Infinity` ni `NaN`— cuando el total no es un
 * denominador válido. Quien llame decide cómo se ve un ratio que no existe.
 */
export function sharePercent(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return (Number(part) / Number(whole)) * 100;
}

/** El ratio anterior, ya redondeado y con signo. Un guion cuando no existe. */
export function formatSharePercent(part: bigint, whole: bigint): string {
  const percent = sharePercent(part, whole);
  if (percent === null) return '—';
  return `${Math.round(percent)}%`;
}

/**
 * Puntos básicos como porcentaje. 1800 → «18%», 5280 → «52.8%».
 *
 * Los bps son enteros, así que la conversión es exacta hasta dos decimales:
 * se recorta la cola de ceros en vez de fijar los decimales a mano.
 */
export function formatBps(bps: number): string {
  const percent = (bps / 100).toFixed(2).replace(/\.?0+$/, '');
  return `${percent}%`;
}

/**
 * Decimales de `MockUSDC`, verificados on-chain con `decimals()`.
 *
 * Conviven dos escalas en el protocolo y confundirlas ya costó un bug: las
 * cuotas y la base prestable van en centavos (`MINOR_UNITS_PER_UNIT`), pero el
 * token mueve unidades de seis decimales. El factor entre ambas es 10.000.
 */
const TOKEN_DECIMALS = 6n;
const TOKEN_UNITS_PER_UNIT = 10n ** TOKEN_DECIMALS;
const POSITIVE_INTEGER = /^\d+$/;

/**
 * Unidades del token como dólares legibles, o `null` si el texto no es un
 * entero. Devolver `null` en vez de `USD 0.00` evita afirmar un monto sobre
 * una entrada que el usuario todavía está escribiendo.
 */
export function formatTokenUnits(amount: string): string | null {
  if (!POSITIVE_INTEGER.test(amount)) return null;

  const total = BigInt(amount);
  const units = total / TOKEN_UNITS_PER_UNIT;
  const fraction = (total % TOKEN_UNITS_PER_UNIT).toString().padStart(Number(TOKEN_DECIMALS), '0');
  // Se recortan los ceros de la derecha pero nunca por debajo de dos decimales:
  // el dinero se lee con centavos aunque el token permita seis.
  const trimmed = fraction.replace(/0+$/, '').padEnd(2, '0');

  return `USD ${groupThousands(units.toString())}.${trimmed}`;
}

/** Centavos a unidades del token. Entero puro: el factor es exacto. */
export function minorUnitsToTokenUnits(amountMinor: string | bigint): string {
  return (BigInt(amountMinor) * (TOKEN_UNITS_PER_UNIT / MINOR_UNITS_PER_UNIT)).toString();
}
