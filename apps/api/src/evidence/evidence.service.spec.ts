import type { Repository } from 'typeorm';
import { Evidence } from './evidence.entity';
import { EvidenceService } from './evidence.service';
import type { EvidenceStorage, PutEvidenceObject } from './evidence-storage.port';

describe('EvidenceService', () => {
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: '7fb79494-272c-4be1-8204-885c0bba3528', ...value })),
  } as unknown as jest.Mocked<Repository<Evidence>>;
  const storage: jest.Mocked<EvidenceStorage> = {
    put: jest.fn(async (_input: PutEvidenceObject): Promise<void> => undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('stores the file under its SHA-256 fingerprint and persists metadata', async () => {
    const service = new EvidenceService(repository, storage);
    const file = {
      buffer: Buffer.from('evidence bytes'),
      originalname: 'invoice.pdf',
      mimetype: 'application/pdf',
      size: 14,
    };

    const result = await service.upload('user-1', file);

    expect(result.sha256).toBe(
      '0x9d11f9a71c12d6194481f5fa5086b0eff7df05a4a228f022f55bd890009a9d16',
    );
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({ body: file.buffer, contentType: file.mimetype }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: 'invoice.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '14',
        sha256: result.sha256,
        createdById: 'user-1',
      }),
    );
  });

  it('does not confuse the SHA-256 file fingerprint with a Merkle leaf hash', async () => {
    const service = new EvidenceService(repository, storage);

    const result = await service.upload('user-1', {
      buffer: Buffer.alloc(0),
      originalname: 'empty.txt',
      mimetype: 'text/plain',
      size: 0,
    });

    expect(result.sha256).toBe(
      '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
