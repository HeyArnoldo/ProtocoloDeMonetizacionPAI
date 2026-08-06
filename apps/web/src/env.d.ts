/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absoluta de la API en producción. Vacía en dev (proxy de Vite). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
