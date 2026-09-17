// Isomorphic env access.
// Every value here is public: this site has no server-side secrets. Public
// vars are VITE_-prefixed and statically injected into the client bundle by
// Vite; process.env is the fallback for server-side rendering on Workers.
const metaEnv: Record<string, string | undefined> =
  (import.meta as any).env ?? {};
const procEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

const publicEnv = (key: string) => metaEnv[key] ?? procEnv[key];

export const envConfigs: Record<string, string> = {
  // App
  app_url: publicEnv('VITE_APP_URL') ?? 'http://localhost:3000',
  app_name: publicEnv('VITE_APP_NAME') ?? 'CleanBG',
  app_description:
    publicEnv('VITE_APP_DESCRIPTION') ??
    'Free background remover that runs entirely in your browser. No uploads, no limits.',
  app_logo: publicEnv('VITE_APP_LOGO') ?? '/logo.png',

  // Model CDN. Empty = load straight from huggingface.co. When set, points
  // Transformers.js at a self-hosted mirror (Cloudflare R2 + custom domain).
  model_host: publicEnv('VITE_MODEL_HOST') ?? '',

  // Analytics (optional)
  ga_id: publicEnv('VITE_GA_ID') ?? '',
  plausible_domain: publicEnv('VITE_PLAUSIBLE_DOMAIN') ?? '',
  plausible_src: publicEnv('VITE_PLAUSIBLE_SRC') ?? '',

  // Links
  github_url: publicEnv('VITE_GITHUB_URL') ?? '',
  x_url: publicEnv('VITE_X_URL') ?? '',

  // Locale
  locale: publicEnv('VITE_DEFAULT_LOCALE') ?? 'en',
};
