import { describe, expect, it, vi } from 'vitest';
import { CURRENCY_CODES } from '@app/contracts';
import { createAssetsClient } from './assets.api';

const assetId = `0x${'1d'.repeat(32)}`;
const asset = {
  id: assetId,
  ownerIdHash: `0x${'ef'.repeat(32)}`,
  controller: `0x${'ab'.repeat(20)}`,
  merkleRoot: `0x${'cd'.repeat(32)}`,
  registrationTxHash: null,
  registrationConfirmed: false,
  registrationBlockNumber: null,
  receivables: [],
  createdAt: '2026-08-12T00:00:00.000Z',
};
const input = {
  controller: `0x${'ab'.repeat(20)}`,
  receivables: [
    {
      evidenceId: '3f6f9c6e-7b1a-4c2f-9d3e-5a8b1c2d4e6f',
      debtorTaxId: '20512345678',
      debtorLabel: 'Supermercados Andinos SAC',
      amountMinor: '800000',
      dueDate: '2026-11-15',
      currency: CURRENCY_CODES.USD,
    },
  ],
};

describe('cliente de expedientes', () => {
  it('crea el expediente y devuelve el assetId que produjo la API', async () => {
    const post = vi.fn().mockResolvedValue({ data: asset });
    const client = createAssetsClient({ post, get: vi.fn() });

    await expect(client.create(input)).resolves.toEqual(asset);
    expect(post).toHaveBeenCalledWith('/assets', input);
  });

  /**
   * El intent se pide sobre el expediente, no sobre `/chain/intents/register`:
   * así el `merkleRoot` y el `assetId` salen de lo persistido y el navegador
   * no puede pedir la firma de un root que no coincide con el guardado.
   */
  it('pide el intent de registro sobre el expediente persistido', async () => {
    const intent = { chainId: 421614, to: `0x${'11'.repeat(20)}`, data: '0xabcd', value: '0' };
    const post = vi.fn().mockResolvedValue({ data: intent });
    const client = createAssetsClient({ post, get: vi.fn() });

    await expect(client.registrationIntent(assetId)).resolves.toEqual(intent);
    expect(post).toHaveBeenCalledWith(`/assets/${assetId}/registration-intent`, {});
  });

  it('confirma el registro contra la cadena', async () => {
    const post = vi.fn().mockResolvedValue({ data: { ...asset, registrationConfirmed: true } });
    const client = createAssetsClient({ post, get: vi.fn() });

    await expect(client.confirmRegistration(assetId)).resolves.toMatchObject({
      registrationConfirmed: true,
    });
    expect(post).toHaveBeenCalledWith(`/assets/${assetId}/confirm-registration`, {});
  });

  it('rechaza una respuesta sin assetId en vez de propagar un expediente a medias', async () => {
    const client = createAssetsClient({
      post: vi.fn().mockResolvedValue({ data: { ...asset, id: 'no-es-bytes32' } }),
      get: vi.fn(),
    });

    await expect(client.create(input)).rejects.toThrow(/expediente inválido/i);
  });

  it('lee un expediente por id', async () => {
    const get = vi.fn().mockResolvedValue({ data: asset });
    const client = createAssetsClient({ post: vi.fn(), get });

    await expect(client.fetch(assetId)).resolves.toEqual(asset);
    expect(get).toHaveBeenCalledWith(`/assets/${assetId}`);
  });
});
