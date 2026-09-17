/**
 * Main-thread API for the background remover. Wraps the inference worker,
 * gathers hardware hints, persists engine failures across sessions and
 * exposes a promise-based `removeBackground()`.
 *
 * Browser-only: import lazily from components (never during SSR).
 */
import { BackgroundRemovalError } from './errors';
import { BEN2, BIREFNET_LITE, MODELS } from './models';
import type {
  EngineChoice,
  GpuHints,
  HardwareHints,
  RemovalProgress,
  RemovalQuality,
  RemovalResultMeta,
  WorkerInitConfig,
  WorkerToMainMessage,
} from './types';

export type { EngineChoice, RemovalProgress, RemovalQuality } from './types';
export { BackgroundRemovalError, isCancelled } from './errors';
export { MODELS, formatBytes } from './models';

export interface RemoveOptions {
  quality?: RemovalQuality;
  signal?: AbortSignal;
  onProgress?: (progress: RemovalProgress) => void;
}

export interface RemovalResult extends RemovalResultMeta {
  /** Transparent RGBA cutout at the source resolution. Caller owns it. */
  bitmap: ImageBitmap;
}

/** Longest side we feed through the pipeline; larger inputs are downscaled. */
export const MAX_DIMENSION = 6144;
/** Hard megapixel cap to keep canvas memory sane on phones. */
export const MAX_MEGAPIXELS = 32;

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
];
export const IMAGE_ACCEPT_ATTRIBUTE = SUPPORTED_IMAGE_MIME_TYPES.join(',');

// Failure memory is keyed by model revisions so a model/runtime upgrade
// automatically re-tries GPUs that were rejected by the old build.
const FAILURE_KEY = `cleanbg:engine-failures:v1:${BEN2.revision.slice(0, 8)}:${BIREFNET_LITE.revision.slice(0, 8)}`;

function readFailures(): string[] {
  try {
    const raw = localStorage.getItem(FAILURE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberFailure(key: string) {
  // Only GPU failures are worth remembering across sessions; CPU failures
  // are usually memory pressure that varies run to run.
  if (!key.endsWith(':webgpu')) return;
  try {
    const set = new Set(readFailures());
    set.add(key);
    localStorage.setItem(FAILURE_KEY, JSON.stringify([...set]));
  } catch {
    // Storage may be unavailable (private mode); in-session memory still works.
  }
}

export function clearEngineFailures() {
  try {
    localStorage.removeItem(FAILURE_KEY);
  } catch {
    // ignore
  }
}

async function probeGpu(): Promise<GpuHints | null> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return null;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const info = (adapter as GPUAdapter & { info?: { isFallbackAdapter?: boolean } }).info;
    const legacyFallback = (adapter as GPUAdapter & { isFallbackAdapter?: boolean })
      .isFallbackAdapter;
    return {
      fallbackAdapter: Boolean(info?.isFallbackAdapter ?? legacyFallback),
      shaderF16: adapter.features.has('shader-f16'),
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    };
  } catch {
    return null;
  }
}

export async function gatherHardwareHints(): Promise<HardwareHints> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: nav.userAgent,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    maxTouchPoints: nav.maxTouchPoints,
    crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
    gpu: await probeGpu(),
  };
}

/**
 * Decode any supported image into an ImageBitmap, downscaling anything that
 * would blow the canvas/memory budget. Throws typed errors for the UI.
 */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  if (file.type && !SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new BackgroundRemovalError('unsupported-image', `Unsupported image type: ${file.type}`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new BackgroundRemovalError('unsupported-image', 'The image could not be decoded.', {
      cause: error,
    });
  }
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const megapixels = (width * height) / 1e6;
  if (longest <= MAX_DIMENSION && megapixels <= MAX_MEGAPIXELS) return bitmap;

  const scale = Math.min(
    MAX_DIMENSION / longest,
    Math.sqrt(MAX_MEGAPIXELS / megapixels),
  );
  const resizeWidth = Math.max(1, Math.round(width * scale));
  const resizeHeight = Math.max(1, Math.round(height * scale));
  try {
    return await createImageBitmap(bitmap, {
      resizeWidth,
      resizeHeight,
      resizeQuality: 'high',
    });
  } finally {
    bitmap.close();
  }
}

/** Engine failure reasons seen this session (for bug reports / debugging). */
export const debugLog: string[] = [];
if (typeof window !== 'undefined') {
  (window as Window & { __cleanbgDebug?: string[] }).__cleanbgDebug = debugLog;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: BackgroundRemovalError) => void;
  onProgress?: (progress: RemovalProgress) => void;
};

class BackgroundRemover {
  private worker: Worker | null = null;
  private ready: Promise<EngineChoice[]> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  plan: EngineChoice[] = [];

  /** Spin up the worker and plan engines. Idempotent. */
  init(): Promise<EngineChoice[]> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const hints = await gatherHardwareHints();
      const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'cleanbg-inference',
      });
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => this.onMessage(event.data);
      worker.onerror = (event) => this.crash(event.message || 'Worker crashed');

      const rawHost = (import.meta.env.VITE_MODEL_HOST as string | undefined)?.trim() ?? '';
      const config: WorkerInitConfig = {
        hints,
        // Workers resolve relative URLs against the script URL; normalise to
        // an absolute origin-based URL so `/models` works in dev.
        modelHost: rawHost ? new URL(rawHost, location.origin).href : '',
        disabledEngines: readFailures(),
        forceEngine: import.meta.env.DEV
          ? new URLSearchParams(location.search).get('bg-engine') ?? undefined
          : undefined,
      };
      const plan = await new Promise<EngineChoice[]>((resolve) => {
        this.pending.set(0, { resolve: (v) => resolve(v as EngineChoice[]), reject: () => resolve([]) });
        worker.postMessage({ type: 'init', config });
      });
      this.plan = plan;
      return plan;
    })();
    return this.ready;
  }

  /** Download + initialise the preferred engine ahead of the first image. */
  async prepare(onProgress?: (progress: RemovalProgress) => void): Promise<EngineChoice> {
    await this.init();
    const id = this.nextId++;
    return new Promise<EngineChoice>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as EngineChoice),
        reject,
        onProgress,
      });
      this.worker!.postMessage({ type: 'prepare', id });
    });
  }

  async removeBackground(file: Blob, options: RemoveOptions = {}): Promise<RemovalResult> {
    await this.init();
    const quality = options.quality ?? 'fast';
    const bitmap = await decodeImage(file);
    if (options.signal?.aborted) {
      bitmap.close();
      throw new BackgroundRemovalError('cancelled', 'Processing was cancelled.');
    }
    const id = this.nextId++;
    const worker = this.worker!;
    return new Promise<RemovalResult>((resolve, reject) => {
      const onAbort = () => worker.postMessage({ type: 'cancel', id });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (v) => {
          options.signal?.removeEventListener('abort', onAbort);
          resolve(v as RemovalResult);
        },
        reject: (e) => {
          options.signal?.removeEventListener('abort', onAbort);
          reject(e);
        },
        onProgress: options.onProgress,
      });
      worker.postMessage({ type: 'remove', id, bitmap, quality }, [bitmap]);
    });
  }

  private onMessage(msg: WorkerToMainMessage) {
    switch (msg.type) {
      case 'ready':
        this.pending.get(0)?.resolve(msg.plan);
        this.pending.delete(0);
        break;
      case 'progress':
        this.pending.get(msg.id)?.onProgress?.(msg.progress);
        break;
      case 'engine-failed':
        debugLog.push(`${msg.key}: ${msg.reason}`);
        rememberFailure(msg.key);
        break;
      case 'prepared':
        this.pending.get(msg.id)?.resolve(msg.engine);
        this.pending.delete(msg.id);
        break;
      case 'result':
        this.pending.get(msg.id)?.resolve({ bitmap: msg.bitmap, ...msg.meta });
        this.pending.delete(msg.id);
        break;
      case 'error':
        this.pending.get(msg.id)?.reject(new BackgroundRemovalError(msg.code, msg.message));
        this.pending.delete(msg.id);
        break;
    }
  }

  private crash(message: string) {
    const error = new BackgroundRemovalError('worker-crashed', message);
    for (const [id, p] of this.pending) {
      if (id !== 0) p.reject(error);
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}

let instance: BackgroundRemover | null = null;

/** Process-wide singleton (one worker, one set of loaded models). */
export function getRemover(): BackgroundRemover {
  if (!instance) instance = new BackgroundRemover();
  return instance;
}

export function modelForChoice(choice: EngineChoice) {
  return MODELS[choice.model];
}
