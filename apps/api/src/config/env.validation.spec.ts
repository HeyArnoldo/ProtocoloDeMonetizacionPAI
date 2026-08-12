import { validateEnv } from './env.validation';

// Lo mínimo que el schema exige siempre, con cualquier CHAIN_ADAPTER.
const baseEnv = {
  DB_HOST: 'db',
  DB_USER: 'app',
  DB_PASSWORD: 'app',
  DB_NAME: 'pai_arbitrum',
  JWT_SECRET: '0123456789abcdef',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'pai-evidence',
  STORAGE_ACCESS_KEY: 'key',
  STORAGE_SECRET_KEY: 'secret',
};

describe('env validation', () => {
  // Docker Compose y Coolify no distinguen "sin definir" de "vacía": una variable
  // declarada y no rellenada llega como ''. Si el schema la tratara como URL, la
  // API no arrancaría por culpa de una variable que el README llama opcional.
  it('treats an empty optional STORAGE_ENDPOINT as not configured', () => {
    expect(validateEnv({ ...baseEnv, STORAGE_ENDPOINT: '' }).STORAGE_ENDPOINT).toBeUndefined();
  });

  it('still rejects a malformed STORAGE_ENDPOINT', () => {
    expect(() => validateEnv({ ...baseEnv, STORAGE_ENDPOINT: 'no-es-una-url' })).toThrow(
      /STORAGE_ENDPOINT/,
    );
  });

  // Sin credenciales de storage no hay subida de evidencias, así que el arranque
  // falla temprano en vez de morir en el primer POST del demo.
  it('requires the storage credentials with any chain adapter', () => {
    const { STORAGE_ACCESS_KEY: _omitted, ...withoutAccessKey } = baseEnv;
    expect(() => validateEnv(withoutAccessKey)).toThrow(/STORAGE_ACCESS_KEY/);
  });

  // El adapter real sin direcciones deja el panel en "offline" con hashes
  // sintéticos: es exactamente el fallo silencioso que queremos evitar.
  it('refuses to boot with CHAIN_ADAPTER=arbitrum and no deployment addresses', () => {
    expect(() => validateEnv({ ...baseEnv, CHAIN_ADAPTER: 'arbitrum' })).toThrow(
      /ASSET_REGISTRY_ADDRESS/,
    );
  });
});
