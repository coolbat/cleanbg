import type { ModelDefinition, RemovalModelName } from './types';

/**
 * Only MIT-licensed models are used so the tool can stay free (and carry ads
 * or a donation link) without a commercial model license.
 *
 * Revisions are pinned: a cached model never changes underneath a user, and
 * the mirror layout (`{id}/resolve/{revision}/onnx/{file}`) matches the
 * Hugging Face URL scheme so Transformers.js only needs a different host.
 */

/**
 * BEN2 base — best hair/edge quality, 1024px input.
 *
 * Served only from our mirror: it is `onnx-community/BEN2-ONNX@c552aa8`
 * converted to fp16 weights + fp32 compute (scripts/convert-ben2.py). The
 * upstream export trips a mixed-precision LayerNorm bug in ONNX Runtime's
 * WebGPU backend and fails on every GPU. Same size, same output.
 */
export const BEN2: ModelDefinition = {
  name: 'ben2',
  id: 'cleanbg/ben2-webgpu',
  revision: 'v2',
  bytes: 219_109_618,
  inputSize: 1024,
  file: 'model_fp16.onnx',
  label: 'BEN2',
  license: 'MIT — PramaLLC/BEN2',
};

/** BiRefNet lite (Swin-T) re-exported at 512px — small and browser-safe. */
export const BIREFNET_LITE: ModelDefinition = {
  name: 'birefnet-lite',
  id: 'studioludens/birefnet-lite-512',
  revision: '4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7',
  bytes: 98_484_532,
  inputSize: 512,
  file: 'model_fp16.onnx',
  label: 'BiRefNet Lite',
  license: 'MIT — ZhengPeng7/BiRefNet',
};

export const MODELS: Record<RemovalModelName, ModelDefinition> = {
  ben2: BEN2,
  'birefnet-lite': BIREFNET_LITE,
};

export function modelUrl(model: ModelDefinition, host = 'https://huggingface.co'): string {
  return `${host.replace(/\/$/, '')}/${model.id}/resolve/${model.revision}/onnx/${model.file}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}
