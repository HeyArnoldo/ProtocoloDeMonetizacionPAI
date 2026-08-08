import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { fetchEvidence, uploadEvidence } from './evidence.api';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

describe('evidence API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the current owner inventory', async () => {
    const inventory = [{ id: 'evidence-1' }];
    vi.mocked(api.get).mockResolvedValue({ data: inventory });

    await expect(fetchEvidence()).resolves.toBe(inventory);
    expect(api.get).toHaveBeenCalledWith('/evidence');
  });

  it('uploads under the file multipart field and leaves the boundary to Axios', async () => {
    const file = new File(['content'], 'invoice.pdf', { type: 'application/pdf' });
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'evidence-1' } });

    await uploadEvidence(file);

    const [url, body, config] = vi.mocked(api.post).mock.calls[0];
    expect(url).toBe('/evidence');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toBeUndefined();
  });
});
