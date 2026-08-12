import { Controller, Get } from '@nestjs/common';
import type { ChainStatusResponse } from '@app/contracts';
import { ChainStatusService } from './chain-status.service';

@Controller('chain/status')
export class ChainStatusController {
  constructor(private readonly status: ChainStatusService) {}

  @Get()
  async get(): Promise<ChainStatusResponse> {
    const status = await this.status.get();
    return {
      ...status,
      blockNumber: status.blockNumber?.toString() ?? null,
    };
  }
}
