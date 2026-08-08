import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3EvidenceStorage } from './s3-evidence.storage';

const mockSend = jest.fn(async () => undefined);

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn((input: unknown) => ({ input })),
}));

describe('S3EvidenceStorage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('configures an S3-compatible client and uploads the file with its SHA-256 metadata', async () => {
    const storage = new S3EvidenceStorage({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'pai-evidence',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      forcePathStyle: true,
    });
    const body = Buffer.from('evidence');
    const sha256 = `0x${'ab'.repeat(32)}`;

    await storage.put({
      key: 'evidence/ab/file-id',
      body,
      contentType: 'application/pdf',
      sha256,
    });

    expect(S3Client).toHaveBeenCalledWith({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      },
    });
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'pai-evidence',
      Key: 'evidence/ab/file-id',
      Body: body,
      ContentType: 'application/pdf',
      Metadata: { sha256: sha256.slice(2) },
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ Bucket: 'pai-evidence' }) }),
    );
  });
});
