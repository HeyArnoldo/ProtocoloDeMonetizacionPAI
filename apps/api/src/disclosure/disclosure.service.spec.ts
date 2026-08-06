import { BadRequestException } from '@nestjs/common';
import type { Receivable } from '@app/contracts';
import { CURRENCY_CODES } from '@app/contracts';
import { DisclosureService } from './disclosure.service';

const SALT = `0x${'0f'.repeat(32)}`;

function receivable(index: number, overrides: Partial<Receivable> = {}): Receivable {
  return {
    debtorTaxId: `205123456${String(index % 3).padStart(2, '0')}`,
    debtorLabel: `Cliente ${index % 3}`,
    amountMinor: String(500_000 + index * 1_000),
    dueDate: `2026-${String((index % 12) + 1).padStart(2, '0')}-15`,
    currency: CURRENCY_CODES.USD,
    docHash: `0x${index.toString(16).padStart(64, '0')}`,
    ...overrides,
  };
}

const portfolio = (count: number): Receivable[] =>
  Array.from({ length: count }, (_, i) => receivable(i));

describe('DisclosureService', () => {
  let service: DisclosureService;

  beforeEach(() => {
    service = new DisclosureService();
  });

  describe('samplePortfolio', () => {
    it('devuelve una cartera cargable de una sola vez', () => {
      const sample = service.samplePortfolio();

      expect(sample.receivables.length).toBeGreaterThan(0);
      expect(sample.salt).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('devuelve un salt distinto en cada expediente', () => {
      // El salt es por expediente: reutilizarlo permitiria correlacionar
      // deudores entre carteras de empresas distintas.
      expect(service.samplePortfolio().salt).not.toBe(service.samplePortfolio().salt);
    });
  });

  describe('preview', () => {
    it('el root es estable para la misma cartera y el mismo salt', () => {
      const receivables = portfolio(6);
      const first = service.preview({ salt: SALT, receivables, disclosedIndices: [0] });
      const second = service.preview({ salt: SALT, receivables, disclosedIndices: [3] });

      expect(first.root).toBe(second.root);
    });

    it('el root cambia con otro salt', () => {
      const receivables = portfolio(6);
      const other = `0x${'f0'.repeat(32)}`;

      expect(service.preview({ salt: SALT, receivables, disclosedIndices: [0] }).root).not.toBe(
        service.preview({ salt: other, receivables, disclosedIndices: [0] }).root,
      );
    });

    it('el proof que devuelve verifica contra su propio root', () => {
      const result = service.preview({
        salt: SALT,
        receivables: portfolio(16),
        disclosedIndices: [0, 4, 9],
      });

      expect(result.verified).toBe(true);
    });

    it('cuenta lo divulgado y lo oculto', () => {
      const result = service.preview({
        salt: SALT,
        receivables: portfolio(16),
        disclosedIndices: [0, 4, 9],
      });

      expect(result.totalLeaves).toBe(16);
      expect(result.disclosedCount).toBe(3);
      expect(result.hiddenCount).toBe(13);
    });

    it('suma el nominal divulgado, no el total de la cartera', () => {
      const receivables = portfolio(4);
      const result = service.preview({ salt: SALT, receivables, disclosedIndices: [0, 1] });

      const expected = BigInt(receivables[0]!.amountMinor) + BigInt(receivables[1]!.amountMinor);
      expect(result.disclosedNominalMinor).toBe(expected.toString());
    });

    it('nunca devuelve el identificador del deudor en claro', () => {
      // Es la promesa central del proyecto: probar sin revelar contrapartes.
      const receivables = portfolio(8);
      const result = service.preview({ salt: SALT, receivables, disclosedIndices: [0, 1] });

      const serialized = JSON.stringify(result);
      for (const item of receivables) {
        expect(serialized).not.toContain(item.debtorTaxId);
        expect(serialized).not.toContain(item.debtorLabel);
      }
    });

    it('no devuelve el contenido de las cuotas ocultas', () => {
      const receivables = portfolio(8);
      const result = service.preview({ salt: SALT, receivables, disclosedIndices: [0, 1] });

      const serialized = JSON.stringify(result);
      for (const hidden of receivables.slice(2)) {
        expect(serialized).not.toContain(hidden.docHash.slice(2));
      }
    });

    it('permite divulgar la cartera completa', () => {
      const result = service.preview({
        salt: SALT,
        receivables: portfolio(4),
        disclosedIndices: [0, 1, 2, 3],
      });

      expect(result.hiddenCount).toBe(0);
      expect(result.verified).toBe(true);
    });

    it('ignora indices repetidos en vez de duplicar la hoja', () => {
      const result = service.preview({
        salt: SALT,
        receivables: portfolio(4),
        disclosedIndices: [1, 1, 1],
      });

      expect(result.disclosedCount).toBe(1);
    });

    // ─── Errores de dominio traducidos a 400 ────────────────────────────

    it('rechaza un indice fuera de rango', () => {
      expect(() =>
        service.preview({ salt: SALT, receivables: portfolio(4), disclosedIndices: [9] }),
      ).toThrow(BadRequestException);
    });

    it('rechaza una cartera con cuotas duplicadas', () => {
      // La misma cuota dos veces inflaria la base prestable sin que ningun
      // proof lo delate: las dos hojas son validas.
      const duplicated = [receivable(0), receivable(0)];

      expect(() =>
        service.preview({ salt: SALT, receivables: duplicated, disclosedIndices: [0] }),
      ).toThrow(BadRequestException);
    });

    it('rechaza una fecha que no existe', () => {
      const broken = [receivable(0, { dueDate: '2026-02-30' })];

      expect(() =>
        service.preview({ salt: SALT, receivables: broken, disclosedIndices: [0] }),
      ).toThrow(BadRequestException);
    });

    it('el mensaje de error explica el problema', () => {
      expect(() =>
        service.preview({ salt: SALT, receivables: portfolio(2), disclosedIndices: [7] }),
      ).toThrow(/fuera de rango/i);
    });
  });
});
