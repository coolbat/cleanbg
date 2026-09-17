import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Dev-only static server for the model mirror at `./models` (gitignored).
 * Mirrors the production R2 bucket layout so `VITE_MODEL_HOST=/models`
 * exercises exactly the same URLs locally:
 *
 *   ./models/{repo-id}/resolve/{revision}/onnx/model_fp16.onnx
 *
 * Not part of the production build — model files never enter `public/`.
 */
export function localModels(root = 'models', prefix = '/models'): Plugin {
  const types: Record<string, string> = {
    '.onnx': 'application/octet-stream',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.mjs': 'text/javascript',
  };
  return {
    name: 'cleanbg:local-models',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(prefix, (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
        const file = join(process.cwd(), root, rel);
        if (!file.startsWith(join(process.cwd(), root)) || !existsSync(file) || !statSync(file).isFile()) {
          return next();
        }
        const size = statSync(file).size;
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Content-Length', String(size));
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(file).pipe(res);
      });
    },
  };
}
