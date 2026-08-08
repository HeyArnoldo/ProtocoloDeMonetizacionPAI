import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../users/user.entity';
import {
  ChainIntentService,
  type IntentAction,
  type SerializedIntent,
} from './chain-intent.service';

@Controller('chain/intents')
@UseGuards(JwtAuthGuard)
export class ChainIntentController {
  constructor(private readonly intents: ChainIntentService) {}

  @Post(':action')
  build(
    @CurrentUser() user: User,
    @Param('action') action: IntentAction,
    @Body() body: Record<string, unknown>,
  ): SerializedIntent {
    return this.intents.build(action, user.id, body);
  }
}
