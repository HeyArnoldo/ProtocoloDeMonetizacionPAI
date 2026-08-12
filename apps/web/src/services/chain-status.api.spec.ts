import { describe, expect, it, vi } from 'vitest';
import { buildChainStatus } from '../../e2e/fixtures/api-mock';
import { createChainStatusClient } from './chain-status.api';

describe('chain status client', () => {
  it.each([
    buildChainStatus({
      reachable: false,
      deployed: false,
      contractCount: 0,
      reason: 'RPC_UNAVAILABLE',
    }),
    buildChainStatus({
      reachable: false,
      deployed: false,
      contractCount: 0,
      expectedChainId: 421614,
      observedChainId: 1,
      reason: 'WRONG_CHAIN',
    }),
  ])('accepts typed operational degradation returned over HTTP 200', async (status) => {
    const client = createChainStatusClient({ get: vi.fn().mockResolvedValue({ data: status }) });
    await expect(client.fetch()).resolves.toEqual(status);
  });

  it('preserves actual HTTP or network failure as a query error', async () => {
    const failure = new Error('network unavailable');
    const client = createChainStatusClient({ get: vi.fn().mockRejectedValue(failure) });
    await expect(client.fetch()).rejects.toBe(failure);
  });
});
