// In dev, Vite's proxy forwards relative /api and /ws to localhost:8080 (see
// vite.config.ts), so SERVER_URL is empty and requests stay relative. In a
// production build the client and server are deployed as separate services,
// so this must be baked in at build time via VITE_SERVER_URL, e.g.
// "https://pokerminiapp-production.up.railway.app" (no trailing slash).
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL ?? '').trim().replace(/\/+$/, '');
