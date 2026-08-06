import { config } from 'dotenv';
import { resolve } from 'path';

// Un solo .env en la raíz del repo, compartido por compose/api/web.
// Se buscan ambas rutas para que funcione corriendo desde apps/api
// (pnpm --filter), desde la raíz, o dentro del contenedor.
config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});
