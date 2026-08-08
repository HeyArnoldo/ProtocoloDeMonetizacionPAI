import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES } from '@app/contracts';
import {
  formatBps,
  formatDueDate,
  formatMinorUnits,
  formatSharePercent,
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
