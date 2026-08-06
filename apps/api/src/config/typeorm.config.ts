import './load-env';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * DataSource único: lo usa el AppModule y la CLI de TypeORM para
 * generar/correr migraciones. synchronize SIEMPRE en false: el esquema
 * cambia solo por migraciones (pnpm migration:generate / migration:run).
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'app',
  password: process.env.DB_PASSWORD ?? 'app',
  database: process.env.DB_NAME ?? 'pai_arbitrum',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
