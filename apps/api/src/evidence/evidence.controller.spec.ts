import { BadRequestException } from '@nestjs/common';
import type { EvidenceService } from './evidence.service';
import { EvidenceController } from './evidence.controller';
import type { User } from '../users/user.entity';

describe('EvidenceController', () => {
  const service = { upload: jest.fn() } as unknown as jest.Mocked<EvidenceService>;

  it('requires a multipart file', () => {
    const controller = new EvidenceController(service);
    expect(() => controller.upload({ id: 'user-1' } as User)).toThrow(BadRequestException);
  });

  it('delegates the in-memory upload to the evidence service', async () => {
    const file = {
      buffer: Buffer.from('content'),
      originalname: 'invoice.pdf',
      mimetype: 'application/pdf',
      size: 7,
    } as Express.Multer.File;
    service.upload.mockResolvedValue({
      id: '7fb79494-272c-4be1-8204-885c0bba3528',
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: '7',
      sha256: `0x${'11'.repeat(32)}`,
      createdAt: new Date(0).toISOString(),
    });
    const controller = new EvidenceController(service);

    const user = { id: 'user-1' } as User;
    await controller.upload(user, file);

    expect(service.upload).toHaveBeenCalledWith(user.id, file);
  });
});
