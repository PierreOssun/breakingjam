/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin; empty or unset means same origin. */
  readonly VITE_API_URL?: string;
  /** Public Protomaps key for hosted tiles. */
  readonly VITE_PROTOMAPS_KEY?: string;
  /** Optional `pmtiles://` URL for self-hosted tiles. */
  readonly VITE_TILES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
