import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES } from '@app/contracts';
import {
  formatBps,
  formatDueDate,
  formatMinorUnits,
  formatSharePercent,
  formatTokenUnits,
  minorUnitsToTokenUnits,
  sharePercent,
} from './money';

/**
 * El dinero del protocolo viaja en unidades menores y en enteros. Estas
 * funciones son la única frontera donde ese entero se convierte en texto, así
 * que son lógica de dominio y se prueban primero.
 */

describe('formatMinorUnits', () => {
  it('separa unidades y céntimos sin pasar por coma flotante', () => {
    expect(formatMinorUnits(800_000n, CURRENCY_CODES.USD)).toBe('USD 8,000.00');
  });

  it('acepta el string decimal con el que viaja el monto en JSON', () => {
    expect(formatMinorUnits('1250000', CURRENCY_CODES.USD)).toBe('USD 12,500.00');
  });

  it('rellena los céntimos a dos dígitos', () => {
    expect(formatMinorUnits(5n, CURRENCY_CODES.USD)).toBe('USD 0.05');
    expect(formatMinorUnits(50n, CURRENCY_CODES.USD)).toBe('USD 0.50');
  });

  it('conserva la precisión en montos que un double ya no representa', () => {
    // 2^53 + 1 en unidades menores: `Number` lo redondearía al par.
    expect(formatMinorUnits('9007199254740993', CURRENCY_CODES.USD)).toBe(
      'USD 90,071,992,547,409.93',
    );
  });

  it('usa el código numérico cuando la moneda no tiene etiqueta conocida', () => {
    expect(formatMinorUnits(100n, 978)).toBe('978 1.00');
  });

  it('rotula el sol peruano', () => {
    expect(formatMinorUnits(100n, CURRENCY_CODES.PEN)).toBe('PEN 1.00');
  });

  /**
   * El total del listado suma cuotas sin agrupar por moneda: no hay una que
   * rotular. Se muestra la cifra sola en vez de atribuirla a un dólar que la
   * respuesta nunca dijo.
   */
  it('omite la etiqueta cuando no hay moneda que afirmar', () => {
    expect(formatMinorUnits('12480000')).toBe('124,800.00');
    expect(formatMinorUnits(-5n)).toBe('-0.05');
  });
});

describe('formatDueDate', () => {
  it('devuelve la fecha ISO en UTC, sin arrastrar la zona horaria del navegador', () => {
    expect(formatDueDate(1_767_225_600)).toBe('2026-01-01');
  });
});

describe('sharePercent', () => {
  it('devuelve el porcentaje que la parte representa del total', () => {
    expect(sharePercent(2_500n, 10_000n)).toBe(25);
  });

  it('devuelve null cuando el total es cero en vez de dividir por cero', () => {
    // La maqueta renderiza literalmente «Infinity%» al limpiar la selección.
    expect(sharePercent(0n, 0n)).toBeNull();
    expect(sharePercent(100n, 0n)).toBeNull();
  });

  it('devuelve null con un total negativo, que no describe ninguna cartera', () => {
    expect(sharePercent(100n, -10n)).toBeNull();
  });
});

describe('formatSharePercent', () => {
  it('redondea al entero más cercano y añade el signo', () => {
    expect(formatSharePercent(3_100n, 10_000n)).toBe('31%');
  });

  it('sustituye el porcentaje imposible por un guion, nunca por Infinity o NaN', () => {
    expect(formatSharePercent(100n, 0n)).toBe('—');
    expect(formatSharePercent(0n, 0n)).toBe('—');
  });
});

describe('formatBps', () => {
  it('convierte puntos básicos a porcentaje sin decimales sobrantes', () => {
    expect(formatBps(1800)).toBe('18%');
    expect(formatBps(10_000)).toBe('100%');
    expect(formatBps(0)).toBe('0%');
  });

  it('conserva el decimal cuando los bps no son múltiplo de 100', () => {
    expect(formatBps(5280)).toBe('52.8%');
    expect(formatBps(420)).toBe('4.2%');
    expect(formatBps(1)).toBe('0.01%');
  });
});

describe('escala del token frente a los centavos', () => {
  it('traduce unidades de mUSDC a dólares con sus seis decimales', () => {
    expect(formatTokenUnits('5000000000')).toBe('USD 5,000.00');
    expect(formatTokenUnits('1')).toBe('USD 0.000001');
    expect(formatTokenUnits('0')).toBe('USD 0.00');
  });

  it('deja ver el error clásico: centavos escritos donde van unidades del token', () => {
    // 5218641 centavos son USD 52.186,41. Escritos en el campo del principal,
    // que va en unidades de 6 decimales, valen USD 5,21 — el bug que hacía
    // revertir el fondeo.
    expect(formatTokenUnits('5218641')).toBe('USD 5.218641');
  });

  it('convierte centavos a unidades del token sin pasar por coma flotante', () => {
    expect(minorUnitsToTokenUnits('5218641')).toBe('52186410000');
    expect(minorUnitsToTokenUnits('0')).toBe('0');
  });

  it('no afirma nada cuando el texto no es un entero positivo', () => {
    expect(formatTokenUnits('')).toBeNull();
    expect(formatTokenUnits('12.5')).toBeNull();
    expect(formatTokenUnits('-1')).toBeNull();
  });
});
