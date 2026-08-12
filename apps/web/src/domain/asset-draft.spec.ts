import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES } from '@app/contracts';
import { buildCreateAssetInput, emptyRow, type AssetDraftRow } from './asset-draft';

const evidenceId = '3f6f9c6e-7b1a-4c2f-9d3e-5a8b1c2d4e6f';
const controller = `0x${'ab'.repeat(20)}`;

const row = (overrides: Partial<AssetDraftRow> = {}): AssetDraftRow => ({
  ...emptyRow(),
  evidenceId,
  debtorTaxId: '20512345678',
  debtorLabel: 'Supermercados Andinos SAC',
  amountMinor: '800000',
  dueDate: '2026-11-15',
  currency: CURRENCY_CODES.USD,
  ...overrides,
});

describe('borrador del expediente', () => {
  it('convierte el formulario en la entrada que valida la API', () => {
    expect(buildCreateAssetInput({ controller, rows: [row()] })).toEqual({
      controller,
      receivables: [
        {
          evidenceId,
          debtorTaxId: '20512345678',
          debtorLabel: 'Supermercados Andinos SAC',
          amountMinor: '800000',
          dueDate: '2026-11-15',
          currency: CURRENCY_CODES.USD,
        },
      ],
    });
  });

  /**
   * MetaMask entrega la cuenta en checksum (mayúsculas y minúsculas mezcladas)
   * y `addressSchema` exige minúsculas. Sin normalizar, pegar la wallet
   * conectada en el formulario produce un 400 que no dice nada útil.
   */
  it('normaliza a minúsculas la wallet controladora que entrega MetaMask', () => {
    const checksummed = '0xAbC0000000000000000000000000000000000123';
    expect(buildCreateAssetInput({ controller: checksummed, rows: [row()] }).controller).toBe(
      checksummed.toLowerCase(),
    );
  });

  it('recorta los espacios del RUC y de la razón social', () => {
    const built = buildCreateAssetInput({
      controller,
      rows: [row({ debtorTaxId: '  20512345678 ', debtorLabel: '  Farmacias del Norte  ' })],
    });
    expect(built.receivables[0]).toMatchObject({
      debtorTaxId: '20512345678',
      debtorLabel: 'Farmacias del Norte',
    });
  });

  it('conserva el orden de las cuotas: las posiciones del árbol dependen de él', () => {
    const built = buildCreateAssetInput({
      controller,
      rows: [row({ amountMinor: '100' }), row({ amountMinor: '200' }), row({ amountMinor: '300' })],
    });
    expect(built.receivables.map((r) => r.amountMinor)).toEqual(['100', '200', '300']);
  });

  it.each([
    ['sin wallet controladora', { controller: '', rows: [row()] }, /wallet controladora/i],
    ['con wallet inválida', { controller: '0x123', rows: [row()] }, /wallet controladora/i],
    ['sin ninguna cuota', { controller, rows: [] }, /al menos una cuota/i],
    ['con una cuota sin evidencia', { controller, rows: [row({ evidenceId: '' })] }, /evidencia/i],
    [
      'con un monto que no es entero positivo',
      { controller, rows: [row({ amountMinor: '0' })] },
      /monto/i,
    ],
    ['con un monto con decimales', { controller, rows: [row({ amountMinor: '12.50' })] }, /monto/i],
    ['sin fecha de vencimiento', { controller, rows: [row({ dueDate: '' })] }, /vencimiento/i],
    ['sin RUC del deudor', { controller, rows: [row({ debtorTaxId: '  ' })] }, /RUC/i],
    ['sin razón social', { controller, rows: [row({ debtorLabel: '' })] }, /razón social/i],
  ])('rechaza el borrador %s', (_caso, draft, mensaje) => {
    expect(() => buildCreateAssetInput(draft)).toThrow(mensaje);
  });

  it('nombra la fila exacta que falla, no solo que algo falla', () => {
    expect(() =>
      buildCreateAssetInput({ controller, rows: [row(), row({ amountMinor: '' })] }),
    ).toThrow(/cuota 2/i);
  });

  it('una fila nueva arranca vacía y en dólares', () => {
    expect(emptyRow()).toEqual({
      evidenceId: '',
      debtorTaxId: '',
      debtorLabel: '',
      amountMinor: '',
      dueDate: '',
      currency: CURRENCY_CODES.USD,
    });
  });
});
