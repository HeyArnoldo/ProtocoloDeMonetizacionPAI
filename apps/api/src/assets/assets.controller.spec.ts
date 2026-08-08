import type { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import type { User } from '../users/user.entity';

describe('AssetsController', () => {
  it('delegates validated asset creation to the service', async () => {
    const service = { create: jest.fn() } as unknown as jest.Mocked<AssetsService>;
    const controller = new AssetsController(service);
    const input = {
      controller: `0x${'22'.repeat(20)}` as const,
      receivables: [
        {
          evidenceId: '7fb79494-272c-4be1-8204-885c0bba3528',
          debtorTaxId: '20512345678',
          debtorLabel: 'Customer SAC',
          amountMinor: '800000',
          dueDate: '2026-10-15',
          currency: 840 as const,
        },
      ],
    };

    const user = { id: 'user-1' } as User;
    await controller.create(user, input);

    expect(service.create).toHaveBeenCalledWith(user.id, input);
  });

  it.each(['registrationIntent', 'confirmRegistration'] as const)(
    'delegates %s with authenticated ownership',
    async (method) => {
      const service = { [method]: jest.fn() } as unknown as jest.Mocked<AssetsService>;
      const controller = new AssetsController(service);
      const user = { id: 'user-1' } as User;

      await controller[method](user, 'asset-1');

      expect(service[method]).toHaveBeenCalledWith('user-1', 'asset-1');
    },
  );

  it('delegates asset retrieval by identifier to the service', async () => {
    const service = { get: jest.fn() } as unknown as jest.Mocked<AssetsService>;
    const controller = new AssetsController(service);
    const assetId = `0x${'11'.repeat(32)}`;

    const user = { id: 'user-1' } as User;
    await controller.get(user, assetId);

    expect(service.get).toHaveBeenCalledWith(user.id, assetId);
  });

  it('delegates the chain snapshot with authenticated ownership', async () => {
    const service = { chainSnapshot: jest.fn() } as unknown as jest.Mocked<AssetsService>;
    const controller = new AssetsController(service);
    const user = { id: 'user-1' } as User;

    await controller.chainSnapshot(user, 'asset-1');

    expect(service.chainSnapshot).toHaveBeenCalledWith('user-1', 'asset-1');
  });

  it('delegates the certification-safe chain snapshot without an owner identity', async () => {
    const service = { certificationSnapshot: jest.fn() } as unknown as jest.Mocked<AssetsService>;
    const controller = new AssetsController(service);

    await controller.certificationSnapshot('asset-1');

    expect(service.certificationSnapshot).toHaveBeenCalledWith('asset-1');
  });
});
