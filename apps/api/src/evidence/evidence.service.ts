import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EvidenceResponse } from '@app/contracts';
import type { Repository } from 'typeorm';
import { Evidence } from './evidence.entity';
import { EVIDENCE_STORAGE, type EvidenceStorage } from './evidence-storage.port';

export interface UploadedEvidenceFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(Evidence) private readonly evidence: Repository<Evidence>,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
  ) {}

  async list(createdById: string): Promise<EvidenceResponse[]> {
    const evidence = await this.evidence.find({
      where: { createdById },
      order: { createdAt: 'DESC' },
    });
    return evidence.map((item) => this.toResponse(item));
  }

  async upload(createdById: string, file: UploadedEvidenceFile): Promise<EvidenceResponse> {
    const sha256 = `0x${createHash('sha256').update(file.buffer).digest('hex')}`;
    const objectKey = `evidence/${sha256.slice(2, 4)}/${randomUUID()}`;

    await this.storage.put({
      key: objectKey,
      body: file.buffer,
      contentType: file.mimetype,
      sha256,
    });

    const saved = await this.evidence.save(
      this.evidence.create({
        createdById,
        objectKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: String(file.size),
        sha256,
      }),
    );
    return this.toResponse(saved);
  }

  private toResponse(evidence: Evidence): EvidenceResponse {
    return {
      id: evidence.id,
      originalName: evidence.originalName,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      sha256: evidence.sha256,
      createdAt: evidence.createdAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }
}
