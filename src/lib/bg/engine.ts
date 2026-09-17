/**
 * Worker-side engine management on top of Transformers.js v4.
 *
 * An "engine" is a loaded (model, execution provider) pair. Engines are
 * cached for the life of the worker, failures are remembered so the same
 * engine is not retried in this session, and loading reports byte-weighted
 * download progress.
 */
import { shouldUseSingleThreadedWasm } from './capabilities';
import { BackgroundRemovalError } from './errors';
import { inspectMask, type InferenceMask } from './image';
import { MODELS } from './models';
import { engineKey, type EngineChoice, type HardwareHints } from './types';

type Transformers = typeof import('@huggingface/transformers');
type RawImageCtor = Transformers['RawImage'];

type TensorLike = {
  data: ArrayLike<number>;
  dims: number[];
  to: (type: string) => TensorLike;
  sigmoid_: () => TensorLike;
};

type ModelRunner = {
  (inputs: Record<string, unknown>): Promise<Record<string, TensorLike>>;
  sessions: Record<string, { inputNames: string[]; outputNames: string[] }>;
  dispose: () => Promise<unknown>;
};

type ProcessorRunner = (image: unknown) => Promise<Record<string, unknown>>;

export interface Engine {
  choice: EngineChoice;
  model: ModelRunner;
  processor: ProcessorRunner;
  RawImage: RawImageCtor;
}

export type LoadProgress = (progress: number, phase: 'download' | 'init') => void;

interface EngineConfig {
  hints: HardwareHints;
  modelHost: string;
}

interface EngineLoad {
  promise: Promise<Engine>;
  listeners: Set<LoadProgress>;
  last?: { progress: number; phase: 'download' | 'init' };
}

let transformersPromise: Promise<Transformers> | null = null;
let config: EngineConfig | null = null;
const engines = new Map<string, EngineLoad>();
const failed = new Set<string>();

export function configureEngines(next: EngineConfig, disabled: string[]): void {
  config = next;
  for (const key of disabled) failed.add(key);
}

export function markEngineFailed(choice: EngineChoice): void {
  const key = engineKey(choice);
  failed.add(key);
  const pending = engines.get(key);
  engines.delete(key);
  pending?.promise.then((engine) => engine.model.dispose()).catch(() => undefined);
}

export function isEngineDisabled(choice: EngineChoice): boolean {
  return failed.has(engineKey(choice));
}

export function firstUsable(plan: EngineChoice[]): EngineChoice | null {
  return plan.find((choice) => !failed.has(engineKey(choice))) ?? null;
}

async function loadTransformers(): Promise<Transformers> {
  if (!transformersPromise) {
    transformersPromise = import('@huggingface/transformers').then((mod) => {
      const { env } = mod;
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      if (config?.modelHost) {
        env.remoteHost = config.modelHost.replace(/\/?$/, '/');
        // Mirror keeps the Hugging Face layout, so the default
        // `{model}/resolve/{revision}/` template still applies.
      }
      // Cache API exists in dedicated workers on secure origins.
      env.useBrowserCache = typeof caches !== 'undefined';
      return mod;
    });
  }
  return transformersPromise;
}

/**
 * Transformers.js reports progress per file. Weight each file by its size so
 * the bar tracks real bytes, treat the weights as the bulk of the work, and
 * never let the figure move backwards.
 */
function createDownloadTracker(modelBytes: number, onProgress: LoadProgress) {
  const files = new Map<string, { loaded: number; total: number }>();
  let reported = 0;

  const expectedTotal = (file: string, total?: number) =>
    total && total > 0 ? total : file.endsWith('.onnx') ? modelBytes : 4096;

  const report = () => {
    let loaded = 0;
    let total = 0;
    let sawModel = false;
    for (const [file, entry] of files) {
      loaded += Math.min(entry.loaded, entry.total);
      total += entry.total;
      if (file.endsWith('.onnx')) sawModel = true;
    }
    if (!sawModel) total += modelBytes;
    const value = total > 0 ? loaded / total : 0;
    if (value > reported) {
      reported = value;
      onProgress(Math.min(1, value), 'download');
    }
  };

  return (event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const data = event as {
      status?: string;
      file?: string;
      loaded?: number;
      total?: number;
    };
    if (!data.file) return;
    const current = files.get(data.file);
    if (data.status === 'initiate') {
      if (!current) files.set(data.file, { loaded: 0, total: expectedTotal(data.file) });
    } else if (data.status === 'progress') {
      files.set(data.file, {
        loaded: Math.max(current?.loaded ?? 0, data.loaded ?? 0),
        total: expectedTotal(data.file, data.total),
      });
    } else if (data.status === 'done') {
      const total = current?.total ?? expectedTotal(data.file);
      files.set(data.file, { loaded: total, total });
    } else {
      return;
    }
    report();
    if (data.status === 'done' && data.file.endsWith('.onnx')) onProgress(1, 'init');
  };
}

async function loadEngine(choice: EngineChoice, onProgress: LoadProgress): Promise<Engine> {
  if (!config) throw new Error('Engines not configured');
  const definition = MODELS[choice.model];
  const { AutoModel, AutoProcessor, RawImage, env } = await loadTransformers();

  const wasm = env.backends.onnx.wasm;
  if (wasm && choice.provider === 'wasm') {
    wasm.numThreads = shouldUseSingleThreadedWasm(config.hints)
      ? 1
      : Math.max(1, Math.min(4, (config.hints.hardwareConcurrency ?? 2) - 1));
  }

  const progressCallback = createDownloadTracker(definition.bytes, onProgress);

  const processor = (await AutoProcessor.from_pretrained(definition.id, {
    revision: definition.revision,
    progress_callback: progressCallback,
  })) as unknown as ProcessorRunner;

  const model = (await AutoModel.from_pretrained(definition.id, {
    revision: definition.revision,
    device: choice.provider,
    dtype: 'fp16',
    progress_callback: progressCallback,
  })) as unknown as ModelRunner;

  return { choice, model, processor, RawImage };
}

/**
 * Get (or start loading) an engine. Concurrent callers share one load.
 * Throws `model-load-failed` if the engine cannot be initialised; the caller
 * decides whether to mark it failed and move down the plan.
 */
export function getEngine(choice: EngineChoice, onProgress: LoadProgress): Promise<Engine> {
  const key = engineKey(choice);
  let load = engines.get(key);
  if (!load) {
    const listeners = new Set<LoadProgress>();
    const entry: EngineLoad = { listeners, promise: Promise.resolve() as unknown as Promise<Engine> };
    const broadcast: LoadProgress = (progress, phase) => {
      entry.last = { progress, phase };
      for (const listener of listeners) listener(progress, phase);
    };
    entry.promise = loadEngine(choice, broadcast).catch((error) => {
      if (engines.get(key) === entry) engines.delete(key);
      throw new BackgroundRemovalError(
        'model-load-failed',
        'The local model could not be loaded.',
        { cause: error },
      );
    });
    engines.set(key, entry);
    load = entry;
  } else if (load.last) {
    // Joining a load already in flight (e.g. the warm-up prefetch): replay
    // the latest state so the caller's progress bar starts in the right place.
    onProgress(load.last.progress, load.last.phase);
  }
  load.listeners.add(onProgress);
  return load.promise.finally(() => load!.listeners.delete(onProgress));
}

/**
 * Run one forward pass. `rgba` is a square `size`×`size` RGBA buffer.
 * Returns the alpha matte at the model's output resolution.
 */
export async function inferMask(
  engine: Engine,
  rgba: Uint8ClampedArray,
  size: number,
): Promise<InferenceMask> {
  const image = new engine.RawImage(rgba, size, size, 4);
  const inputs = await engine.processor(image);
  const pixelValues = inputs.pixel_values;
  if (!pixelValues) throw new Error('Image preprocessing produced no pixel_values');

  const session = engine.model.sessions.model;
  const feeds: Record<string, unknown> = session.inputNames.includes('pixel_values')
    ? { pixel_values: pixelValues }
    : { [session.inputNames[0]]: pixelValues };

  const output = await engine.model(feeds);
  const raw = output[session.outputNames[0]];
  if (!raw) throw new Error('The model returned no output');

  let tensor = raw.to('float32');
  const data = tensor.data as Float32Array;
  // Some exports emit logits, others probabilities. Detect and normalise.
  const epsilon = 1e-5;
  let needsSigmoid = false;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < -epsilon || v > 1 + epsilon) {
      needsSigmoid = true;
      break;
    }
  }
  if (needsSigmoid) tensor = tensor.sigmoid_();

  const alpha = new Float32Array(tensor.data as ArrayLike<number>);
  const height = tensor.dims.at(-2);
  const width = tensor.dims.at(-1);
  if (!width || !height || alpha.length !== width * height) {
    throw new Error('The model returned an unexpected mask shape');
  }
  return { alpha, width, height, inspection: inspectMask(alpha) };
}
