import type { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';

describe('VerificationController', () => {
  it('is anonymous and delegates only the validated public identifier', async () => {
    const service = { get: jest.fn() } as unknown as jest.Mocked<VerificationService>;
    const controller = new VerificationController(service);

    await controller.get(`0x${'11'.repeat(32)}`);

    expect(Reflect.getMetadata('__guards__', VerificationController)).toBeUndefined();
    expect(service.get).toHaveBeenCalledWith(`0x${'11'.repeat(32)}`);
  });
});
