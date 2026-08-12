import { describe, expect, it, vi } from 'vitest';
import { createChainStatusClient, formatBlock } from './chain.api';

const address = `0x${'11'.repeat(20)}`;
const live = {
  status: 'live',
  network: 'arbitrum',
  chainId: 421614,
  safeBlock: '297262745',
  headBlock: '297265110',
  deploymentBlock: '296546459',
  explorerBaseUrl: 'https://sepolia.arbiscan.io',
  contracts: [
    {
      name: 'assetRegistry',
      address,
      explorerUrl: `https://sepolia.arbiscan.io/address/${address}`,
      bytecode: 'present',
    },
  ],
} as const;

describe('chain status client', () => {
  it('reads and validates the live status from the API', async () => {
    const get = vi.fn().mockResolvedValue({ data: live });

    await expect(createChainStatusClient({ get }).fetch()).resolves.toEqual(live);
    expect(get).toHaveBeenCalledWith('/chain/status');
  });

  it('lee un contrato sin campo `bytecode` como no confirmado, nunca como desplegado', async () => {
    // Una API vieja que todavía no verifica bytecode no puede hacer que el
    // panel afirme un despliegue. El silencio se lee como duda, no como sí.
    const legacy = {
      ...live,
      contracts: [{ name: 'assetRegistry', address, explorerUrl: null }],
    };
    const get = vi.fn().mockResolvedValue({ data: legacy });

    const status = await createChainStatusClient({ get }).fetch();

    expect(status).toMatchObject({
      contracts: [{ name: 'assetRegistry', bytecode: 'unconfirmed' }],
    });
  });

  it('accepts the unreachable state: a failing RPC is a status, not an error', async () => {
    const unreachable = {
      status: 'unreachable',
      network: 'arbitrum',
      chainId: 421614,
      deploymentBlock: '296546459',
      explorerBaseUrl: null,
      contracts: [],
      reason: 'fetch failed',
    };
    const get = vi.fn().mockResolvedValue({ data: unreachable });

    await expect(createChainStatusClient({ get }).fetch()).resolves.toEqual(unreachable);
  });

  it('rejects malformed API data instead of rendering a half-status', async () => {
    const client = createChainStatusClient({
      get: vi.fn().mockResolvedValue({ data: { status: 'live', chainId: 'wrong' } }),
    });

    await expect(client.fetch()).rejects.toThrow('estado de cadena inválido');
  });

  it('groups block digits in threes so a nine-digit height stays readable', () => {
    expect(formatBlock('297262745')).toBe('297 262 745');
    expect(formatBlock('42')).toBe('42');
  });
});
