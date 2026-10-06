/** The source revision this build came from (Coolify's SOURCE_COMMIT), or "dev" locally. */
export const APP_VERSION = String(import.meta.env.VITE_APP_VERSION || 'dev').slice(0, 12);
