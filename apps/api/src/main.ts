// PRIMERA línea: los flags de auth y typeorm.config leen process.env al
// importarse, antes de que Nest arranque. No mover.
import './config/load-env';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás de Traefik (Coolify): necesario para cookies secure y req.ip real.
  app.set('trust proxy', 1);

  app.use(cookieParser());

  // CORS con credentials exige orígenes exactos, nunca '*'.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Todo cuelga de /api excepto /health (Docker healthcheck / Coolify).
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = parseInt(process.env.API_PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`API corriendo en http://localhost:${port} (prefijo /api, health en /health)`);
}

void bootstrap();
