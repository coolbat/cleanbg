# CleanBG

Free, unlimited background remover that runs entirely in the browser. Images never leave the user's device: the model is downloaded once, cached, and executed in a Web Worker with WebGPU (WASM fallback).

- Framework: TanStack Start (Vite 8, React 19, Nitro) → Cloudflare Workers
- Inference: `@huggingface/transformers` v4 + ONNX Runtime Web
- Models (MIT): BEN2 (default, 1024px) and BiRefNet-lite (512px fallback), served from a Cloudflare R2 mirror
- i18n: Paraglide (en / zh), locale prefix `/zh`

## Development

```bash
pnpm install
cp .env.example .env.development        # VITE_MODEL_HOST=/models serves the local mirror
pnpm models:build                       # downloads models into ./models and converts BEN2 (needs curl + uv)
pnpm dev                                # http://localhost:3000
```

Useful dev-only URL flag: `?bg-engine=birefnet-lite:wasm` (or `ben2:webgpu`, `ben2:wasm`) forces a specific engine.

## Models

`scripts/build-models.sh` produces `./models` in the Hugging Face path layout
(`{repo}/resolve/{revision}/…`) plus the ONNX Runtime wasm files:

- `studioludens/birefnet-lite-512` — copied verbatim at a pinned revision.
- `cleanbg/ben2-webgpu` — `onnx-community/BEN2-ONNX` converted by `scripts/convert-ben2.py`
  to fp16 weights / fp32 compute. The upstream export triggers a mixed-precision LayerNorm
  shader bug in ORT's WebGPU backend; this conversion keeps the size (~219 MB) and fixes it.

`pnpm models:upload` mirrors `./models` to the R2 bucket (`R2_BUCKET`, default `cleanbg-models`),
sets CORS and long-lived cache headers. Point `VITE_MODEL_HOST` at the bucket's public URL
(custom domain recommended; `wrangler r2 bucket dev-url enable <bucket>` for a quick r2.dev URL).

Model revisions are immutable: bump the revision (`src/lib/bg/models.ts`) when publishing new weights.

## Deploy

```bash
# .env.production: VITE_APP_URL, VITE_APP_NAME, VITE_MODEL_HOST
pnpm cf:build      # NITRO_PRESET=cloudflare_module vite build
pnpm cf:preview    # wrangler dev on the built output
pnpm cf:deploy     # build + wrangler deploy
```

`wrangler.jsonc` holds the Worker name and public vars; there are no secrets.

## Layout

```
src/lib/bg/          inference library (models, capabilities, engine, worker, client, compose)
src/features/remover UI for the tool (dropzone, progress, compare view, export)
src/blocks/          landing sections (read i18n)
src/components/      UI primitives (shadcn) and site chrome
src/content/         MDX pages (privacy, terms) and blog posts
messages/            en.json / zh.json translations
scripts/             model build/convert/upload, dev model server plugin
patches/             pnpm patch: transformers.js promise-chain poisoning fix
```

## Notes

- COOP/COEP (`credentialless`) are set in `src/server.ts` and `public/_headers` so multi-threaded WASM works; Safari falls back to single-threaded WASM.
- `patches/@huggingface__transformers` fixes an upstream bug where one failed session load/run poisons every subsequent call (`webInitChain` / `webInferenceChain` without a rejection handler).
- Engine failures on WebGPU are remembered in `localStorage` (keyed by model revisions) so a device that cannot run BEN2 goes straight to the lite model next time.
