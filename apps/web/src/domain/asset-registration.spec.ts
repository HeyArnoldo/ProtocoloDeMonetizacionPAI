import { describe, expect, it, vi } from 'vitest';
import { CURRENCY_CODES } from '@app/contracts';
import { runAssetRegistration, type AssetRegistrationState } from './asset-registration';

const assetId = `0x${'1d'.repeat(32)}`;
const hash = `0x${'ee'.repeat(32)}` as const;
const asset = { id: assetId, registrationConfirmed: false } as never;
const confirmed = { id: assetId, registrationConfirmed: true } as never;
const intent = { chainId: 421614, to: `0x${'11'.repeat(20)}`, data: '0xabcd', value: '0' } as never;
const input = {
  controller: `0x${'ab'.repeat(20)}`,
  receivables: [
    {
      evidenceId: '3f6f9c6e-7b1a-4c2f-9d3e-5a8b1c2d4e6f',
      debtorTaxId: '20512345678',
      debtorLabel: 'Contafácil SAC',
      amountMinor: '800000',
      dueDate: '2026-11-15',
      currency: CURRENCY_CODES.USD,
    },
  ],
};

const client = (overrides = {}) => ({
  create: vi.fn().mockResolvedValue(asset),
  registrationIntent: vi.fn().mockResolvedValue(intent),
  confirmRegistration: vi.fn().mockResolvedValue(confirmed),
  ...overrides,
});

describe('registro de un expediente end-to-end', () => {
  it('encadena crear, firmar y confirmar, y publica cada fase', async () => {
    const api = client();
    const submitter = { submit: vi.fn().mockResolvedValue(hash) };
    const states: AssetRegistrationState[] = [];

    const result = await runAssetRegistration(api, submitter, input, (s) => states.push(s));

    expect(states.map((s) => s.step)).toEqual(['creating', 'signing', 'confirming', 'confirmed']);
    expect(api.registrationIntent).toHaveBeenCalledWith(assetId);
    expect(api.confirmRegistration).toHaveBeenCalledWith(assetId);
    expect(result).toMatchObject({ id: assetId, registrationConfirmed: true });
    expect(states.at(-1)).toMatchObject({ assetId, hash, asset: confirmed });
  });

  /**
   * El expediente ya existe en Postgres antes de que la wallet firme. Si el
   * usuario rechaza la firma, perder el `assetId` obligaría a recrearlo —y
   * `create` es idempotente por `creationKey`, así que crearía un duplicado
   * silencioso. El id sobrevive al error a propósito.
   */
  it('conserva el assetId cuando la firma se rechaza, para poder reintentar', async () => {
    const api = client();
    const submitter = { submit: vi.fn().mockRejectedValue(new Error('User rejected')) };
    const states: AssetRegistrationState[] = [];

    await expect(
      runAssetRegistration(api, submitter, input, (s) => states.push(s)),
    ).rejects.toThrow('User rejected');

    expect(states.at(-1)).toMatchObject({ step: 'error', assetId });
    expect(api.confirmRegistration).not.toHaveBeenCalled();
  });

  it('no confirma si la creación falla: no hay expediente que confirmar', async () => {
    const api = client({ create: vi.fn().mockRejectedValue(new Error('Evidence not found')) });
    const submitter = { submit: vi.fn() };

    await expect(runAssetRegistration(api, submitter, input, () => {})).rejects.toThrow(
      'Evidence not found',
    );
    expect(submitter.submit).not.toHaveBeenCalled();
  });

  it('propaga el desacuerdo entre la cadena y el borrador sin marcarlo confirmado', async () => {
    const api = client({
      confirmRegistration: vi
        .fn()
        .mockRejectedValue(new Error('On-chain merkleRoot does not match')),
    });
    const states: AssetRegistrationState[] = [];

    await expect(
      runAssetRegistration(api, { submit: vi.fn().mockResolvedValue(hash) }, input, (s) =>
        states.push(s),
      ),
    ).rejects.toThrow(/merkleRoot/);

    expect(states.at(-1)).toMatchObject({ step: 'error', assetId, hash });
  });

  /** Reanudar sin volver a crear: el expediente ya existe y solo falta firmar. */
  it('reanuda desde un expediente existente sin recrearlo', async () => {
    const api = client();
    const submitter = { submit: vi.fn().mockResolvedValue(hash) };

    await runAssetRegistration(api, submitter, input, () => {}, assetId);

    expect(api.create).not.toHaveBeenCalled();
    expect(api.registrationIntent).toHaveBeenCalledWith(assetId);
  });
});
