import { paraglideVitePlugin } from '@inlang/paraglide-js';
import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

import { localModels } from './scripts/vite-plugin-local-models.ts';
import { loadEnvFiles } from './src/lib/env.ts';
import { SECURITY_HEADERS } from './src/lib/security-headers.ts';

// Populate process.env from .env.local / .env.{NODE_ENV} / .env for the dev
// server and build. Everything in this project is public (VITE_*), there
// are no server-side secrets.
loadEnvFiles();

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Pick onnxruntime-web's "extern wasm" build: the default bundle embeds
    // `new URL('ort-wasm-…asyncify.wasm', import.meta.url)`, which makes Vite
    // emit a 27 MB asset — over the 25 MiB Workers static-asset limit. The
    // runtime loads the wasm from `env.backends.onnx.wasm.wasmPaths` instead
    // (our R2 mirror, or jsDelivr when no mirror is configured).
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  server: {
    port: 3000,
    // Dev parity with production: cross-origin isolation is required for
    // multi-threaded WASM (SharedArrayBuffer) in the ONNX runtime.
    headers: SECURITY_HEADERS,
  },
  preview: {
    headers: SECURITY_HEADERS,
  },
  optimizeDeps: {
    // onnxruntime-web ships prebuilt wasm/mjs pairs that must not be
    // pre-bundled or their relative wasm lookups break.
    exclude: ['@huggingface/transformers', 'onnxruntime-web'],
  },
  worker: {
    format: 'es',
  },
  plugins: [
    localModels(),
    // MDX must run before the react plugin so JSX in compiled MDX gets transformed.
    { enforce: 'pre', ...mdx({ providerImportSource: '@mdx-js/react' }) },
    tailwindcss(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'PARAGLIDE_LOCALE',
      strategy: ['url', 'cookie', 'baseLocale'],
      urlPatterns: [
        // Bare locale homes match without a trailing-slash redirect.
        {
          pattern: '/',
          localized: [
            ['zh', '/zh'],
            ['en', '/'],
          ],
        },
        // "as-needed" prefix: zh under /zh, en (default) unprefixed.
        {
          pattern: '/:path(.*)?',
          localized: [
            ['zh', '/zh/:path(.*)?'],
            ['en', '/:path(.*)?'],
          ],
        },
      ],
    }),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    nitro(),
  ],
});
