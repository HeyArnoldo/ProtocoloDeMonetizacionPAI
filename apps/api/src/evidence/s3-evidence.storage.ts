import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { EvidenceStorage, PutEvidenceObject } from './evidence-storage.port';

export interface S3EvidenceStorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

export class S3EvidenceStorage implements EvidenceStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3EvidenceStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  async put(input: PutEvidenceObject): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: { sha256: input.sha256.slice(2) },
      }),
    );
  }
}
