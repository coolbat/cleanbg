import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  EngineChoice,
  RemovalErrorCode,
  RemovalProgress,
  RemovalQuality,
} from '@/lib/bg/types';

type Client = typeof import('@/lib/bg/client');
type RemovalResult = import('@/lib/bg/client').RemovalResult;

export type RemoverState =
  | { status: 'idle' }
  | {
      status: 'processing';
      file: File;
      originalUrl: string;
      progress: RemovalProgress;
    }
  | {
      status: 'done';
      file: File;
      originalUrl: string;
      result: RemovalResult;
      /** Transparent PNG object URL for on-screen preview. */
      resultUrl: string;
    }
  | {
      status: 'error';
      file: File | null;
      originalUrl: string | null;
      code: RemovalErrorCode;
      message: string;
    };

// Loaded lazily so the worker/ONNX code never touches the SSR bundle.
let clientPromise: Promise<Client> | null = null;
function loadClient(): Promise<Client> {
  if (!clientPromise) clientPromise = import('@/lib/bg/client');
  return clientPromise;
}

export function useRemover() {
  const [state, setState] = useState<RemoverState>({ status: 'idle' });
  const [quality, setQuality] = useState<RemovalQuality>('fast');
  const [plan, setPlan] = useState<EngineChoice[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlsRef = useRef<Set<string>>(new Set());
  const bitmapRef = useRef<ImageBitmap | null>(null);

  const trackUrl = (url: string) => {
    urlsRef.current.add(url);
    return url;
  };
  const releaseAll = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current.clear();
    bitmapRef.current?.close();
    bitmapRef.current = null;
  }, []);

  // Warm up: plan engines (and kick off the model download) as soon as the
  // tool is on screen, so the first image does not pay the full wait.
  useEffect(() => {
    let disposed = false;
    loadClient()
      .then(async (client) => {
        const remover = client.getRemover();
        const nextPlan = await remover.init();
        if (!disposed) setPlan(nextPlan);
        // Best-effort prefetch; ignore failures here, the real run reports them.
        remover.prepare().catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);

  const process = useCallback(
    async (file: File, nextQuality: RemovalQuality = quality) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      releaseAll();

      const originalUrl = trackUrl(URL.createObjectURL(file));
      setState({
        status: 'processing',
        file,
        originalUrl,
        progress: { stage: 'preparing', progress: 0 },
      });

      try {
        const client = await loadClient();
        const remover = client.getRemover();
        const result = await remover.removeBackground(file, {
          quality: nextQuality,
          signal: controller.signal,
          onProgress: (progress) => {
            if (controller.signal.aborted) return;
            setState((prev) =>
              prev.status === 'processing' && prev.file === file
                ? { ...prev, progress }
                : prev,
            );
          },
        });
        if (controller.signal.aborted) {
          result.bitmap.close();
          return;
        }
        const { exportCutout } = await import('@/lib/bg/compose');
        const png = await exportCutout(result.bitmap, { format: 'image/png' });
        bitmapRef.current = result.bitmap;
        setState({
          status: 'done',
          file,
          originalUrl,
          result,
          resultUrl: trackUrl(URL.createObjectURL(png)),
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const client = await loadClient();
        if (client.isCancelled(error)) return;
        const err =
          error instanceof client.BackgroundRemovalError
            ? error
            : new client.BackgroundRemovalError('inference-failed', String(error));
        setState({
          status: 'error',
          file,
          originalUrl,
          code: err.code,
          message: err.message,
        });
      }
    },
    [quality, releaseAll],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    releaseAll();
    setState({ status: 'idle' });
  }, [releaseAll]);

  const changeQuality = useCallback(
    (next: RemovalQuality) => {
      setQuality(next);
      // Re-run on the current image so the toggle has an immediate effect.
      if (state.status === 'done' || state.status === 'error') {
        if (state.file) void process(state.file, next);
      }
    },
    [process, state],
  );

  const retry = useCallback(() => {
    if (state.status === 'error' && state.file) void process(state.file);
  }, [process, state]);

  return { state, quality, plan, process, reset, retry, changeQuality };
}
