//frontend/src/vite-env.d.ts


/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_AUTH_TOKEN?: string;
  readonly VITE_FEATURE_INSTRUCTION_LANGUAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg" {
  const src: string;
  export default src;
}
    
