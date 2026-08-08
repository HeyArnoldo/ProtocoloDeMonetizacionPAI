import type { DisclosureService } from './disclosure.service';
import { DisclosureController } from './disclosure.controller';
import type { User } from '../users/user.entity';

describe('DisclosureController', () => {
  it('passes only the asset identifier and selected positions to the persisted service', async () => {
    const service = { preview: jest.fn() } as unknown as jest.Mocked<DisclosureService>;
    const controller = new DisclosureController(service);
    const assetId = `0x${'11'.repeat(32)}`;
    const request = { disclosedIndices: [0, 2] };

    const user = { id: 'user-1' } as User;
    await controller.preview(user, assetId, request);

    expect(service.preview).toHaveBeenCalledWith(user.id, assetId, request);
  });
});
