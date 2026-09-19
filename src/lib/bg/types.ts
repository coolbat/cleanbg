/**
 * Shared types for the in-browser background remover.
 * Everything here is serialisable across the main-thread / worker boundary.
 */

export type RemovalModelName = 'ben2' | 'birefnet-lite';
export type ExecutionProvider = 'webgpu' | 'wasm';
export type RemovalQuality = 'fast' | 'quality';

export interface ModelDefinition {
  name: RemovalModelName;
  /** Hugging Face repo id (also the path on the self-hosted mirror). */
  id: string;
  /** Pinned commit so the cached weights never silently change. */
  revision: string;
  /** Size of the weights file, for progress bars and UI copy. */
  bytes: number;
  /** Square input resolution the model was exported at. */
  inputSize: number;
  /** Weights file name inside the `onnx/` folder. */
  file: string;
  /** Human-readable label. */
  label: string;
  /** Attribution shown in the UI / privacy page. */
  license: string;
}

export interface EngineChoice {
  model: RemovalModelName;
  provider: ExecutionProvider;
}

export function engineKey(choice: EngineChoice): string {
  return `${choice.model}:${choice.provider}`;
}

/** WebGPU adapter facts gathered on the main thread. */
export interface GpuHints {
  fallbackAdapter: boolean;
  shaderF16: boolean;
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
}

/** Everything the engine planner needs to know about the device. */
export interface HardwareHints {
  userAgent: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  maxTouchPoints?: number;
  /** COOP/COEP took effect: SharedArrayBuffer (multi-thread WASM) is usable. */
  crossOriginIsolated: boolean;
  /** `null` when navigator.gpu is missing or requestAdapter() failed. */
  gpu: GpuHints | null;
}

export type ProgressStage =
  | 'preparing'
  | 'downloading'
  | 'loading'
  | 'initializing'
  | 'processing'
  | 'refining'
  | 'finishing'
  | 'switching'
  | 'done';

export interface RemovalProgress {
  stage: ProgressStage;
  /** 0..1, monotonic within a single removal. */
  progress: number;
  /** Engine currently being used or loaded. */
  engine?: EngineChoice;
  /** Weights size for the engine being downloaded. */
  modelBytes?: number;
}

export type RemovalErrorCode =
  | 'unsupported-image'
  | 'image-too-large'
  | 'model-load-failed'
  | 'inference-failed'
  | 'cancelled'
  | 'worker-crashed';

export interface RemovalResultMeta {
  width: number;
  height: number;
  engine: EngineChoice;
  quality: RemovalQuality;
  /** Whether the second (crop) pass was applied. */
  refined: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Worker protocol
// ---------------------------------------------------------------------------

export interface WorkerInitConfig {
  hints: HardwareHints;
  /** Model mirror origin (e.g. https://models.example.com). Empty = Hugging Face. */
  modelHost: string;
  /** Engine keys the main thread remembers as failed on this device. */
  disabledEngines: string[];
  /** Dev-only: restrict the plan to this engine key (e.g. "birefnet-lite:wasm"). */
  forceEngine?: string;
}

export type MainToWorkerMessage =
  | { type: 'init'; config: WorkerInitConfig }
  | { type: 'prepare'; id: number }
  | { type: 'remove'; id: number; bitmap: ImageBitmap; quality: RemovalQuality }
  | { type: 'cancel'; id: number };

export type WorkerToMainMessage =
  | { type: 'ready'; plan: EngineChoice[] }
  | { type: 'progress'; id: number; progress: RemovalProgress }
  | {
      type: 'engine-failed';
      key: string;
      reason: string;
      /** Runtime/GPU failure worth remembering (vs. a transient download error). */
      persistent: boolean;
    }
  | { type: 'prepared'; id: number; engine: EngineChoice }
  | {
      type: 'result';
      id: number;
      bitmap: ImageBitmap;
      meta: RemovalResultMeta;
    }
  | { type: 'error'; id: number; code: RemovalErrorCode; message: string };
