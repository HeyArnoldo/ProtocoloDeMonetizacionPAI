import type { ChainStatusResponse } from '@app/contracts';
import { Controller, Get } from '@nestjs/common';
import { ChainStatusService } from './chain-status.service';

/**
 * Estado de la conexión con la cadena. Ruta pública a propósito: la landing y
 * la pantalla de verificación la usan sin sesión, y no expone nada que no esté
 * ya en el explorador de bloques.
 */
@Controller('chain')
export class ChainStatusController {
  constructor(private readonly status: ChainStatusService) {}

  @Get('status')
  get(): Promise<ChainStatusResponse> {
    return this.status.get();
  }
}
