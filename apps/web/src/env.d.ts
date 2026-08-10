/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absoluta de la API en producción. Vacía en dev (proxy de Vite). */
  readonly VITE_API_URL?: string;
  readonly VITE_EXPLORER_TX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
