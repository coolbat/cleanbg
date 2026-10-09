import { useCallback, useEffect, useRef, useState } from 'react';

import { isProbablyImageFile } from '@/lib/bg/formats';
import type {
  EngineChoice,
  RemovalErrorCode,
  RemovalProgress,
  RemovalQuality,
} from '@/lib/bg/types';

type Client = typeof import('@/lib/bg/client');
type RemovalResult = import('@/lib/bg/client').RemovalResult;

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export type RemoverJob = {
  id: string;
  file: File;
  originalUrl: string;
  status: JobStatus;
  progress?: RemovalProgress;
  result?: RemovalResult;
  resultUrl?: string;
  code?: RemovalErrorCode;
  message?: string;
};

export type RemoverState =
  | { phase: 'idle' }
  | { phase: 'active'; jobs: RemoverJob[]; selectedId: string };

let clientPromise: Promise<Client> | null = null;
function loadClient(): Promise<Client> {
  if (!clientPromise) clientPromise = import('@/lib/bg/client');
  return clientPromise;
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useRemover() {
  const [state, setState] = useState<RemoverState>({ phase: 'idle' });
  const [quality, setQuality] = useState<RemovalQuality>('fast');
  const [plan, setPlan] = useState<EngineChoice[] | null>(null);
  const qualityTouched = useRef(false);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const abortRef = useRef<AbortController | null>(null);
  const urlsRef = useRef<Set<string>>(new Set());
  const jobsRef = useRef<RemoverJob[]>([]);
  const selectedRef = useRef<string | null>(null);
  const pumping = useRef(false);
  const cancelledIds = useRef(new Set<string>());

  const trackUrl = (url: string) => {
    urlsRef.current.add(url);
    return url;
  };

  const closeJobBitmaps = (job: RemoverJob) => {
    job.result?.bitmap.close();
  };

  const publish = useCallback((jobs: RemoverJob[], selectedId: string) => {
    jobsRef.current = jobs;
    selectedRef.current = selectedId;
    setState({ phase: 'active', jobs, selectedId });
  }, []);

  const releaseAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelledIds.current = new Set(jobsRef.current.map((j) => j.id));
    for (const job of jobsRef.current) closeJobBitmaps(job);
    jobsRef.current = [];
    selectedRef.current = null;
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current.clear();
  }, []);

  useEffect(() => {
    let disposed = false;
    loadClient()
      .then(async (client) => {
        const remover = client.getRemover();
        const nextPlan = await remover.init();
        if (!disposed) {
          setPlan(nextPlan);
          if (nextPlan[0]?.provider === 'webgpu') {
            setQuality((q) => (qualityTouched.current ? q : 'quality'));
          }
        }
        remover.prepare().catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);

  const runJob = useCallback(
    async (job: RemoverJob, nextQuality: RemovalQuality) => {
      if (cancelledIds.current.has(job.id)) return;
      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (partial: Partial<RemoverJob>) => {
        const jobs = jobsRef.current.map((j) => (j.id === job.id ? { ...j, ...partial } : j));
        publish(jobs, selectedRef.current ?? job.id);
      };

      patch({
        status: 'processing',
        progress: { stage: 'preparing', progress: 0 },
        code: undefined,
        message: undefined,
      });

      try {
        const client = await loadClient();
        const remover = client.getRemover();
        const result = await remover.removeBackground(job.file, {
          quality: nextQuality,
          signal: controller.signal,
          onProgress: (progress) => {
            if (controller.signal.aborted || cancelledIds.current.has(job.id)) return;
            patch({ progress });
          },
        });
        if (controller.signal.aborted || cancelledIds.current.has(job.id)) {
          result.bitmap.close();
          return;
        }
        const { exportCutout } = await import('@/lib/bg/compose');
        const png = await exportCutout(result.bitmap, { format: 'image/png' });
        patch({
          status: 'done',
          result,
          resultUrl: trackUrl(URL.createObjectURL(png)),
          progress: { stage: 'done', progress: 1, engine: result.engine },
        });
      } catch (error) {
        if (controller.signal.aborted || cancelledIds.current.has(job.id)) return;
        const client = await loadClient();
        if (client.isCancelled(error)) return;
        const err =
          error instanceof client.BackgroundRemovalError
            ? error
            : new client.BackgroundRemovalError('inference-failed', String(error));
        patch({ status: 'error', code: err.code, message: err.message });
      }
    },
    [publish],
  );

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      while (true) {
        const next = jobsRef.current.find((j) => j.status === 'queued');
        if (!next) break;
        await runJob(next, qualityRef.current);
      }
    } finally {
      pumping.current = false;
      if (jobsRef.current.some((j) => j.status === 'queued')) void pump();
    }
  }, [runJob]);

  const processFiles = useCallback(
    (input: File | File[] | FileList | null | undefined) => {
      if (!input) return;
      const list = input instanceof File ? [input] : Array.from(input);
      const files = list.filter(isProbablyImageFile);
      if (!files.length) return;

      cancelledIds.current = new Set();
      const incoming: RemoverJob[] = files.map((file) => ({
        id: newId(),
        file,
        originalUrl: trackUrl(URL.createObjectURL(file)),
        status: 'queued',
      }));

      if (jobsRef.current.length === 0) {
        publish(incoming, incoming[0].id);
      } else {
        publish([...jobsRef.current, ...incoming], selectedRef.current ?? incoming[0].id);
      }
      void pump();
    },
    [publish, pump],
  );

  const reset = useCallback(() => {
    releaseAll();
    setState({ phase: 'idle' });
  }, [releaseAll]);

  const selectJob = useCallback((id: string) => {
    if (!jobsRef.current.some((j) => j.id === id)) return;
    publish(jobsRef.current, id);
  }, [publish]);

  const retryJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job) return;
      closeJobBitmaps(job);
      cancelledIds.current.delete(id);
      const jobs = jobsRef.current.map((j) =>
        j.id === id
          ? {
              ...j,
              status: 'queued' as const,
              result: undefined,
              resultUrl: undefined,
              code: undefined,
              message: undefined,
            }
          : j,
      );
      publish(jobs, id);
      void pump();
    },
    [publish, pump],
  );

  const changeQuality = useCallback(
    (next: RemovalQuality) => {
      qualityTouched.current = true;
      setQuality(next);
      const selected = selectedRef.current;
      if (!selected) return;
      const job = jobsRef.current.find((j) => j.id === selected);
      if (job && (job.status === 'done' || job.status === 'error')) {
        retryJob(selected);
      }
    },
    [retryJob],
  );

  const applyEdit = useCallback(
    async (blob: Blob) => {
      const selected = selectedRef.current;
      if (!selected) return;
      const job = jobsRef.current.find((j) => j.id === selected);
      if (!job?.result) return;
      const bitmap = await createImageBitmap(blob);
      job.result.bitmap.close();
      const resultUrl = trackUrl(URL.createObjectURL(blob));
      const jobs = jobsRef.current.map((j) =>
        j.id === selected
          ? {
              ...j,
              result: { ...j.result!, bitmap, width: bitmap.width, height: bitmap.height },
              resultUrl,
            }
          : j,
      );
      publish(jobs, selected);
    },
    [publish],
  );

  const process = useCallback(
    (file: File) => processFiles(file),
    [processFiles],
  );

  const retry = useCallback(() => {
    if (selectedRef.current) retryJob(selectedRef.current);
  }, [retryJob]);

  return {
    state,
    quality,
    plan,
    process,
    processFiles,
    reset,
    retry,
    retryJob,
    selectJob,
    changeQuality,
    applyEdit,
  };
}
