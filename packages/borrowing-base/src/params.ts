/**
 * Parámetros del motor de borrowing base.
 *
 * **Todos en enteros.** Las tasas van en puntos básicos (bps): 1 bps = 0.01%,
 * así que 18% = `1800` y 100% = `10000`. No hay un solo número decimal en el
 * motor, ni en TypeScript ni en Rust: en dinero, un float es una discrepancia
 * esperando el peor momento para aparecer.
 *
 * > Los valores por defecto son **ilustrativos**, aritméticamente consistentes
 * > y representativos del mercado SaaS B2B peruano. Para producción necesitan
 * > calibración de un analista de riesgo real. Decirlo en la presentación
 * > muestra criterio, no debilidad.
 */
export interface BorrowingBaseParams {
  /** Fecha de valorización: segundos Unix, medianoche UTC exacta. */
  valuationDate: number;
  /** Tasa de descuento anual en bps. 18% = 1800. */
  discountRateBps: number;
  /** Mora histórica atestada por el contador, en bps. 4.20% = 420. */
  delinquencyBps: number;
  /** Umbral de concentración por deudor, en bps. 25% = 2500. */
  concentrationThresholdBps: number;
  /** Penalidad aplicada al exceso sobre el umbral, en bps. */
  concentrationPenaltyBps: number;
  /** Score de continuidad del servicio, 0..100. Lo atesta el auditor técnico. */
  serviceContinuityScore: number;
  /** Cuánto pesa el score en el descuento, en bps. */
  serviceContinuityWeightBps: number;
  /** Advance rate final sobre el valor ajustado, en bps. 52.8% = 5280. */
  advanceRateBps: number;
}

export const BPS_DENOMINATOR = 10_000n;
export const DAYS_PER_YEAR = 365n;
export const SECONDS_PER_DAY = 86_400;

/** Parámetros del caso Contafácil SAC. Ilustrativos, no calibrados. */
export const DEFAULT_PARAMS: Omit<BorrowingBaseParams, 'valuationDate'> = {
  discountRateBps: 1800,
  delinquencyBps: 420,
  concentrationThresholdBps: 2500,
  concentrationPenaltyBps: 4000,
  serviceContinuityScore: 78,
  serviceContinuityWeightBps: 1000,
  advanceRateBps: 5280,
};

export function assertValidParams(params: BorrowingBaseParams): void {
  const inBpsRange: Array<keyof BorrowingBaseParams> = [
    'delinquencyBps',
    'concentrationThresholdBps',
    'concentrationPenaltyBps',
    'serviceContinuityWeightBps',
    'advanceRateBps',
  ];

  for (const key of inBpsRange) {
    const value = params[key];
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      throw new Error(`${key} debe ser un entero en bps entre 0 y 10000, llegó ${value}.`);
    }
  }

  // La tasa anual puede pasar de 100% en escenarios de estrés, así que solo
  // se exige que sea un entero no negativo.
  if (!Number.isInteger(params.discountRateBps) || params.discountRateBps < 0) {
    throw new Error(
      `discountRateBps debe ser un entero no negativo en bps, llegó ${params.discountRateBps}.`,
    );
  }

  if (
    !Number.isInteger(params.serviceContinuityScore) ||
    params.serviceContinuityScore < 0 ||
    params.serviceContinuityScore > 100
  ) {
    throw new Error(
      `serviceContinuityScore debe ser un entero entre 0 y 100, llegó ${params.serviceContinuityScore}.`,
    );
  }

  if (!Number.isInteger(params.valuationDate) || params.valuationDate <= 0) {
    throw new Error(`valuationDate debe ser un entero positivo, llegó ${params.valuationDate}.`);
  }

  // Misma guarda que la hoja del árbol: si la fecha de valorización lleva hora,
  // el mismo cálculo hecho a distinta hora da distinto resultado y el fondo no
  // reproduce el número.
  if (params.valuationDate % SECONDS_PER_DAY !== 0) {
    throw new Error(
      `valuationDate debe caer en medianoche UTC exacta, llegó ${params.valuationDate}.`,
    );
  }
}
