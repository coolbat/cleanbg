/// <reference lib="webworker" />
/**
 * Inference worker. Owns model loading, the fallback chain, inference and
 * compositing. Image pixels enter as an ImageBitmap and leave as an
 * ImageBitmap — nothing is ever sent over the network from here.
 */
import { planEngines } from './capabilities';
import {
  configureEngines,
  firstUsable,
  getEngine,
  inferMask,
  markEngineFailed,
  type Engine,
  type LoadProgress,
} from './engine';
import { BackgroundRemovalError, isCancelled } from './errors';
import {
  accumulateTile,
  applyTileMerge,
  bitmapToSquareRgba,
  buildFullAlpha,
  compositeCutout,
  createTileMerge,
  edgeBand,
  findRefinementCrop,
  planEdgeTiles,
  type InferenceMask,
  type MaskRefinement,
} from './image';
import { MODELS } from './models';
import {
  engineKey,
  type EngineChoice,
  type MainToWorkerMessage,
  type ProgressStage,
  type RemovalQuality,
  type WorkerToMainMessage,
} from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let plan: EngineChoice[] = [];
const cancelled = new Set<number>();

function post(message: WorkerToMainMessage, transfer: Transferable[] = []) {
  ctx.postMessage(message, transfer);
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeText = cause instanceof Error ? ` <- ${cause.message}` : cause ? ` <- ${String(cause)}` : '';
    return `${error.message}${causeText}`;
  }
  return String(error);
}

/**
 * A download hiccup (server restart, flaky network, aborted fetch) says
 * nothing about the device; only runtime failures should be remembered
 * across sessions.
 */
function isTransientFailure(reason: string): boolean {
  return /fetch|network|NetworkError|Load failed|HTTP|status code|status:|timed? ?out|aborted|ECONN|unexpected end|Unexpected token/i.test(
    reason,
  );
}

function reportEngineFailure(choice: EngineChoice, error: unknown, phase: 'load' | 'run') {
  const reason = describe(error);
  const persistent = phase === 'run' || !isTransientFailure(reason);
  console.warn(`[cleanbg] engine ${engineKey(choice)} failed during ${phase}: ${reason}`, error);
  markEngineFailed(choice);
  post({ type: 'engine-failed', key: engineKey(choice), reason, persistent });
}

function throwIfCancelled(id: number) {
  if (cancelled.has(id)) {
    throw new BackgroundRemovalError('cancelled', 'Processing was cancelled.');
  }
}

function progressReporter(id: number) {
  let last = 0;
  return (stage: ProgressStage, value: number, engine?: EngineChoice) => {
    last = Math.max(last, value);
    post({
      type: 'progress',
      id,
      progress: {
        stage,
        progress: Math.min(1, last),
        engine,
        modelBytes: engine ? MODELS[engine.model].bytes : undefined,
      },
    });
  };
}

/**
 * Walk the plan until an engine loads. Failed engines are remembered and
 * reported to the main thread (which persists WebGPU failures).
 */
async function acquireEngine(
  id: number,
  report: ReturnType<typeof progressReporter>,
  range: [number, number],
): Promise<Engine> {
  let lastError: unknown;
  for (;;) {
    throwIfCancelled(id);
    const choice = firstUsable(plan);
    if (!choice) break;
    const [from, to] = range;
    const onLoad: LoadProgress = (value, phase) => {
      report(
        phase === 'download' ? 'downloading' : 'initializing',
        from + value * (to - from),
        choice,
      );
    };
    try {
      return await getEngine(choice, onLoad);
    } catch (error) {
      lastError = error;
      // The last-resort engine stays retryable after a transient failure
      // (e.g. network blip); everything else is skipped for this session.
      const isLastResort = choice.model === 'birefnet-lite' && choice.provider === 'wasm';
      if (isLastResort) break;
      reportEngineFailure(choice, error, 'load');
      report('switching', to, undefined);
    }
  }
  console.error('[cleanbg] no engine could be loaded', lastError);
  throw new BackgroundRemovalError(
    'model-load-failed',
    `The local model could not be loaded (${describe(lastError)})`,
    { cause: lastError },
  );
}

async function runInference(
  id: number,
  engine: Engine,
  bitmap: ImageBitmap,
  crop?: { left: number; top: number; right: number; bottom: number },
): Promise<InferenceMask> {
  const size = MODELS[engine.choice.model].inputSize;
  const rgba = bitmapToSquareRgba(bitmap, size, crop);
  throwIfCancelled(id);
  return inferMask(engine, rgba, size);
}

async function handleRemove(id: number, bitmap: ImageBitmap, quality: RemovalQuality) {
  const startedAt = performance.now();
  const report = progressReporter(id);
  try {
    report('preparing', 0.02);
    let engine = await acquireEngine(id, report, [0.05, 0.6]);

    // Base pass — with fallback if this engine produces garbage at runtime
    // (WebGPU fp16 on some drivers returns empty/flat masks).
    let base: InferenceMask;
    for (;;) {
      throwIfCancelled(id);
      report('processing', 0.65, engine.choice);
      try {
        base = await runInference(id, engine, bitmap);
        const bad =
          !base.inspection.valid ||
          (engine.choice.provider === 'webgpu' && !base.inspection.hasForegroundSignal);
        if (bad) throw new Error('The model returned an invalid alpha mask');
        break;
      } catch (error) {
        if (isCancelled(error)) throw error;
        const isLastResort =
          engine.choice.model === 'birefnet-lite' && engine.choice.provider === 'wasm';
        if (isLastResort) {
          console.error('[cleanbg] inference failed on last-resort engine', error);
          throw new BackgroundRemovalError(
            'inference-failed',
            `Background removal failed on this device (${describe(error)})`,
            { cause: error },
          );
        }
        reportEngineFailure(engine.choice, error, 'run');
        report('switching', 0.7);
        engine = await acquireEngine(id, report, [0.7, 0.8]);
      }
    }

    const { width, height } = bitmap;
    let refined = false;

    // Quality pass 1: zoom onto the subject when it is small in the frame.
    let refinement: MaskRefinement | undefined;
    if (quality === 'quality') {
      const crop = findRefinementCrop(base, width, height);
      if (crop) {
        report('refining', 0.78, engine.choice);
        try {
          const pass = await runInference(id, engine, bitmap, crop);
          if (pass.inspection.valid && pass.inspection.hasForegroundSignal) {
            refinement = { mask: pass, crop };
            refined = true;
          }
        } catch (error) {
          if (isCancelled(error)) throw error;
          // Best-effort; keep the base mask.
        }
      }
    }

    throwIfCancelled(id);
    const alpha = buildFullAlpha(width, height, base, refinement);

    // Quality pass 2: re-run the model on 2x-zoomed tiles along the
    // foreground/background boundary so thin hair the low-res pass smeared
    // or dropped is recovered at (closer to) native resolution.
    if (quality === 'quality') {
      const inputSize = MODELS[engine.choice.model].inputSize;
      const band = edgeBand(alpha, width, height, Math.round(Math.min(width, height) * 0.02));
      // Each tile is a full model pass (~1s on a GPU, several on the CPU);
      // cap the count so Quality mode stays interactive.
      const maxTiles = engine.choice.provider === 'webgpu' ? 4 : 2;
      const tiles = planEdgeTiles(band, width, height, inputSize, maxTiles);
      if (tiles.length) {
        const merge = createTileMerge(alpha.length);
        for (let i = 0; i < tiles.length; i++) {
          throwIfCancelled(id);
          report('refining', 0.8 + (0.1 * (i + 1)) / tiles.length, engine.choice);
          try {
            const pass = await runInference(id, engine, bitmap, tiles[i]);
            if (pass.inspection.valid) accumulateTile(merge, band, width, height, tiles[i], pass);
          } catch (error) {
            if (isCancelled(error)) throw error;
            // Skip this tile; the rest still improve the edge.
          }
        }
        applyTileMerge(alpha, merge);
        refined = true;
      }
    }

    throwIfCancelled(id);
    report('finishing', 0.92, engine.choice);
    const result = compositeCutout(bitmap, alpha);
    report('done', 1, engine.choice);
    post(
      {
        type: 'result',
        id,
        bitmap: result,
        meta: {
          width: bitmap.width,
          height: bitmap.height,
          engine: engine.choice,
          quality,
          refined,
          durationMs: Math.round(performance.now() - startedAt),
        },
      },
      [result],
    );
  } catch (error) {
    const err =
      error instanceof BackgroundRemovalError
        ? error
        : new BackgroundRemovalError('inference-failed', String(error), { cause: error });
    post({ type: 'error', id, code: err.code, message: err.message });
  } finally {
    cancelled.delete(id);
    bitmap.close();
  }
}

async function handlePrepare(id: number) {
  const report = progressReporter(id);
  try {
    const engine = await acquireEngine(id, report, [0, 1]);
    post({ type: 'prepared', id, engine: engine.choice });
  } catch (error) {
    const err =
      error instanceof BackgroundRemovalError
        ? error
        : new BackgroundRemovalError('model-load-failed', String(error), { cause: error });
    post({ type: 'error', id, code: err.code, message: err.message });
  } finally {
    cancelled.delete(id);
  }
}

ctx.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init': {
      configureEngines(
        { hints: msg.config.hints, modelHost: msg.config.modelHost },
        msg.config.disabledEngines,
      );
      plan = planEngines(msg.config.hints, { hasModelHost: Boolean(msg.config.modelHost) });
      if (msg.config.forceEngine) {
        const [model, provider] = msg.config.forceEngine.split(':');
        plan = [{ model, provider } as EngineChoice];
      }
      post({ type: 'ready', plan });
      break;
    }
    case 'prepare':
      void handlePrepare(msg.id);
      break;
    case 'remove':
      void handleRemove(msg.id, msg.bitmap, msg.quality);
      break;
    case 'cancel':
      cancelled.add(msg.id);
      break;
  }
};
