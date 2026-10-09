import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  Paintbrush,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { IMAGE_ACCEPT_ATTRIBUTE } from '@/lib/bg/formats';
import { formatBytes } from '@/lib/bg/models';
import type { ExportFormat } from '@/lib/bg/compose';
import type { EngineChoice, RemovalProgress, RemovalQuality } from '@/lib/bg/types';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';

import { CompareView, backgroundStyle, type PreviewBackground } from './compare-view';
import { MaskEditor } from './mask-editor';
import { TOOL_PRESETS, type ToolPresetId } from './presets';
import { useRemover, type RemoverJob } from './use-remover';

function progressLabel(p: RemovalProgress): string {
  switch (p.stage) {
    case 'preparing':
      return m['tool.progress.preparing']();
    case 'downloading':
      return m['tool.progress.downloading']({
        size: p.modelBytes ? formatBytes(p.modelBytes) : '',
      });
    case 'loading':
      return m['tool.progress.loading_cached']();
    case 'initializing':
      return m['tool.progress.initializing']();
    case 'processing':
      return m['tool.progress.processing']();
    case 'refining':
      return m['tool.progress.refining']();
    case 'finishing':
      return m['tool.progress.finishing']();
    case 'switching':
      return m['tool.progress.switching']();
    case 'done':
      return m['tool.progress.done']();
  }
}

function engineLabel(engine: EngineChoice): string {
  const provider = engine.provider === 'webgpu' ? m['tool.engine.webgpu']() : m['tool.engine.wasm']();
  const model = engine.model === 'ben2' ? m['tool.engine.model_ben2']() : m['tool.engine.model_lite']();
  return `${provider} · ${model}`;
}

function errorLabel(code: string, message: string): string {
  switch (code) {
    case 'unsupported-image':
      return m['tool.error.unsupported']();
    case 'image-too-large':
      return m['tool.error.too_large']({ mp: '32' });
    case 'model-load-failed':
      return m['tool.error.model_load']();
    case 'cancelled':
      return m['tool.error.cancelled']();
    default:
      return message || m['tool.error.inference']();
  }
}

const BACKGROUNDS: { id: string; bg: PreviewBackground; label: () => string }[] = [
  { id: 'transparent', bg: { type: 'transparent' }, label: () => m['tool.result.bg_transparent']() },
  { id: 'white', bg: { type: 'color', color: '#ffffff' }, label: () => m['tool.result.bg_white']() },
  { id: 'black', bg: { type: 'color', color: '#000000' }, label: () => m['tool.result.bg_black']() },
];

const SIZES: { id: string; value: number | null; label: () => string }[] = [
  { id: 'original', value: null, label: () => m['tool.result.size_original']() },
  { id: '2048', value: 2048, label: () => '2048' },
  { id: '1024', value: 1024, label: () => '1024' },
  { id: '512', value: 512, label: () => '512' },
];

export function Remover({ preset: presetId = 'default' }: { preset?: ToolPresetId }) {
  const preset = TOOL_PRESETS[presetId];
  const {
    state,
    quality,
    plan,
    process,
    processFiles,
    reset,
    retry,
    selectJob,
    changeQuality,
    applyEdit,
  } = useRemover();
  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [bgId, setBgId] = useState<string>(preset.backgroundId);
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(preset.format);
  const [crop, setCrop] = useState(false);
  const [square, setSquare] = useState(preset.square);
  const [sizeId, setSizeId] = useState('original');

  const background: PreviewBackground =
    bgId === 'custom'
      ? { type: 'color', color: customColor }
      : (BACKGROUNDS.find((b) => b.id === bgId)?.bg ?? { type: 'transparent' });

  const exportOptions = {
    format,
    cropToSubject: crop,
    square,
    filenameTag: preset.filenameTag,
    maxDimension: SIZES.find((s) => s.id === sizeId)?.value ?? undefined,
    background:
      background.type === 'color' ? { type: 'color' as const, color: background.color } : { type: 'transparent' as const },
  };

  const pickFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (files && files.length) processFiles(files);
    },
    [processFiles],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length) {
        e.preventDefault();
        pickFiles(items);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pickFiles]);

  useEffect(() => {
    setEditing(false);
  }, [state.phase === 'active' ? state.selectedId : 'idle']);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFiles(e.dataTransfer.files);
  };

  const loadSample = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/samples/portrait.jpg');
      const blob = await res.blob();
      process(new File([blob], 'sample-portrait.jpg', { type: 'image/jpeg' }));
    } catch (error) {
      toast.error(String(error));
    }
  };

  const downloadJob = async (job: RemoverJob) => {
    if (job.status !== 'done' || !job.result) return;
    const { exportCutout, downloadBlob, suggestFilename } = await import('@/lib/bg/compose');
    const blob = await exportCutout(job.result.bitmap, exportOptions);
    downloadBlob(blob, suggestFilename(job.file.name, format, preset.filenameTag));
  };

  const downloadAll = async (jobs: RemoverJob[]) => {
    const done = jobs.filter((j) => j.status === 'done' && j.result);
    if (!done.length) return;
    const { zipCutouts, downloadBlob } = await import('@/lib/bg/compose');
    const blob = await zipCutouts(
      done.map((j) => ({ bitmap: j.result!.bitmap, name: j.file.name })),
      exportOptions,
    );
    downloadBlob(blob, 'cleanbg-batch.zip');
  };

  const copyResult = async (job: RemoverJob) => {
    if (job.status !== 'done' || !job.result) return;
    try {
      const { exportCutout } = await import('@/lib/bg/compose');
      const blob = await exportCutout(job.result.bitmap, {
        ...exportOptions,
        format: 'image/png',
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      toast.success(m['tool.result.copied']());
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const qualityToggle = (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{m['tool.quality.label']()}</span>
      <div className="inline-flex rounded-lg border border-border p-0.5" role="radiogroup">
        {(['fast', 'quality'] as RemovalQuality[]).map((q) => (
          <button
            key={q}
            type="button"
            role="radio"
            aria-checked={quality === q}
            onClick={() => changeQuality(q)}
            className={cn(
              'rounded-md px-3 py-1 text-sm transition-colors',
              quality === q
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={m['tool.quality.hint']()}
          >
            {q === 'fast' ? m['tool.quality.fast']() : m['tool.quality.quality']()}
          </button>
        ))}
      </div>
    </div>
  );

  const privacyBadge = (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5 text-emerald-600" />
      {m['tool.privacy.badge']()}
    </span>
  );

  const hiddenInput = (ref: React.RefObject<HTMLInputElement | null>, onPick: (files: FileList | null) => void) => (
    <input
      ref={ref}
      type="file"
      accept={IMAGE_ACCEPT_ATTRIBUTE}
      multiple
      className="hidden"
      onChange={(e) => {
        onPick(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (state.phase === 'idle') {
    return (
      <div className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'group relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors',
            dragging
              ? 'border-foreground bg-muted/60'
              : 'border-border bg-card hover:border-foreground/40 hover:bg-muted/30',
          )}
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-foreground/80 transition-colors group-hover:bg-foreground group-hover:text-background">
            <Upload className="size-6" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium">{m['tool.dropzone.title']()}</p>
            <p className="text-sm text-muted-foreground">{m['tool.dropzone.subtitle']()}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="lg"
              className="rounded-full px-6"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              <ImagePlus data-icon="inline-start" />
              {m['tool.dropzone.button']()}
            </Button>
            <Button size="lg" variant="ghost" className="rounded-full" onClick={loadSample}>
              {m['tool.dropzone.sample']()}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/80">{m['tool.dropzone.formats']()}</p>
          {hiddenInput(inputRef, (files) => pickFiles(files))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          {privacyBadge}
          <div className="flex items-center gap-4">
            {plan?.[0] ? (
              <span className="text-xs text-muted-foreground">{engineLabel(plan[0])}</span>
            ) : null}
            {qualityToggle}
          </div>
        </div>
      </div>
    );
  }

  const { jobs, selectedId } = state;
  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0];
  const doneCount = jobs.filter((j) => j.status === 'done').length;

  return (
    <div className="space-y-4">
      {jobs.length > 1 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {jobs.map((job, index) => (
            <button
              key={job.id}
              type="button"
              onClick={() => selectJob(job.id)}
              className={cn(
                'relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border',
                job.id === selected.id ? 'border-foreground ring-2 ring-foreground/30' : 'border-border',
              )}
              title={job.file.name}
            >
              <img src={job.originalUrl} alt="" className="size-full object-cover" />
              {job.status === 'processing' ? (
                <span className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <Loader2 className="size-4 animate-spin" />
                </span>
              ) : null}
              {job.status === 'queued' ? (
                <span className="absolute inset-0 flex items-center justify-center bg-background/40 text-xs font-medium">
                  {index + 1}
                </span>
              ) : null}
              {job.status === 'error' ? (
                <span className="absolute inset-0 bg-destructive/30" />
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => addInputRef.current?.click()}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground hover:border-foreground/40"
            aria-label={m['tool.batch.add']()}
          >
            <ImagePlus className="size-5" />
          </button>
          {hiddenInput(addInputRef, (files) => pickFiles(files))}
        </div>
      ) : null}

      {selected.status === 'queued' || selected.status === 'processing' ? (
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <div className="relative mx-auto max-h-[60vh] w-full" style={{ aspectRatio: '4 / 3' }}>
            <img
              src={selected.originalUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain opacity-60 blur-[1px]"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/40 p-6 backdrop-blur-sm">
              <Loader2 className="size-6 animate-spin text-foreground" />
              <p className="text-sm font-medium">
                {selected.status === 'queued'
                  ? m['tool.batch.queued']()
                  : progressLabel(selected.progress ?? { stage: 'preparing', progress: 0 })}
              </p>
              {selected.status === 'processing' && selected.progress ? (
                <>
                  <div className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground transition-[width] duration-300"
                      style={{ width: `${Math.round(selected.progress.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {Math.round(selected.progress.progress * 100)}%
                    {selected.progress.engine ? ` · ${engineLabel(selected.progress.engine)}` : ''}
                    {jobs.length > 1
                      ? ` · ${m['tool.batch.n_done']({ done: String(doneCount), total: String(jobs.length) })}`
                      : ''}
                  </p>
                </>
              ) : null}
              <Button variant="ghost" size="sm" onClick={reset}>
                <X data-icon="inline-start" />
                {m['tool.progress.cancel']()}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {selected.status === 'error' ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-3xl border border-destructive/40 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{errorLabel(selected.code ?? '', selected.message ?? '')}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={retry}>
              <RotateCcw data-icon="inline-start" />
              {m['tool.error.retry']()}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {m['tool.result.new_image']()}
            </Button>
          </div>
        </div>
      ) : null}

      {selected.status === 'done' && selected.result && selected.resultUrl ? (
        editing ? (
          <MaskEditor
            originalUrl={selected.originalUrl}
            cutoutUrl={selected.resultUrl}
            width={selected.result.width}
            height={selected.result.height}
            onApply={(blob) => {
              void applyEdit(blob).then(() => setEditing(false));
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <CompareView
              originalUrl={selected.originalUrl}
              resultUrl={selected.resultUrl}
              width={selected.result.width}
              height={selected.result.height}
              background={background}
              labels={{ original: m['tool.result.original'](), result: m['tool.result.result']() }}
              className="max-h-[70vh] bg-card"
            />

            {preset.dualPreview ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['light', '#ffffff', m['tool.result.preview_light']()],
                    ['dark', '#171717', m['tool.result.preview_dark']()],
                  ] as const
                ).map(([key, color, label]) => (
                  <figure key={key} className="overflow-hidden rounded-2xl border border-border">
                    <figcaption className="px-3 py-2 text-xs text-muted-foreground">{label}</figcaption>
                    <div className="flex items-center justify-center p-4" style={{ backgroundColor: color }}>
                      <img src={selected.resultUrl} alt={label} className="max-h-48 max-w-full" />
                    </div>
                  </figure>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{m['tool.result.background']()}</span>
                  <div className="flex items-center gap-1.5">
                    {BACKGROUNDS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        title={b.label()}
                        aria-label={b.label()}
                        aria-pressed={bgId === b.id}
                        onClick={() => setBgId(b.id)}
                        className={cn(
                          'size-7 rounded-full border transition-shadow',
                          bgId === b.id ? 'border-foreground ring-2 ring-foreground/30' : 'border-border',
                        )}
                        style={backgroundStyle(b.bg)}
                      />
                    ))}
                    <label
                      title={m['tool.result.bg_custom']()}
                      className={cn(
                        'relative size-7 cursor-pointer overflow-hidden rounded-full border transition-shadow',
                        bgId === 'custom' ? 'border-foreground ring-2 ring-foreground/30' : 'border-border',
                      )}
                      style={{ backgroundColor: customColor }}
                    >
                      <input
                        type="color"
                        value={customColor}
                        onChange={(e) => {
                          setCustomColor(e.target.value);
                          setBgId('custom');
                        }}
                        onClick={() => setBgId('custom')}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                        aria-label={m['tool.result.bg_custom']()}
                      />
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="inline-flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={crop}
                      onChange={(e) => setCrop(e.target.checked)}
                    />
                    {m['tool.result.crop']()}
                  </label>
                  <label className="inline-flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={square}
                      onChange={(e) => setSquare(e.target.checked)}
                    />
                    {m['tool.result.square']()}
                  </label>
                  <label className="inline-flex items-center gap-2 text-muted-foreground">
                    {m['tool.result.size']()}
                    <select
                      value={sizeId}
                      onChange={(e) => setSizeId(e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
                    >
                      {SIZES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label()}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(['image/png', 'image/webp', 'image/jpeg'] as ExportFormat[]).map((f) => (
                  <Button
                    key={f}
                    variant={format === f ? 'default' : 'outline'}
                    onClick={() => setFormat(f)}
                  >
                    {f === 'image/png'
                      ? 'PNG'
                      : f === 'image/webp'
                        ? 'WebP'
                        : 'JPG'}
                  </Button>
                ))}
                {preset.jpgWarning ? (
                  <p className="w-full text-xs text-muted-foreground">{m['tool.result.jpg_no_alpha']()}</p>
                ) : null}
                <Button onClick={() => void downloadJob(selected)}>
                  <Download data-icon="inline-start" />
                  {m['tool.result.download']()}
                </Button>
                {doneCount > 1 ? (
                  <Button variant="outline" onClick={() => void downloadAll(jobs)}>
                    {m['tool.result.download_all']({ count: String(doneCount) })}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => void copyResult(selected)}>
                  {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {m['tool.result.copy']()}
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Paintbrush data-icon="inline-start" />
                  {m['tool.mask.edit']()}
                </Button>
                {jobs.length === 1 ? (
                  <Button variant="ghost" onClick={reset}>
                    <ImagePlus data-icon="inline-start" />
                    {m['tool.result.new_image']()}
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => addInputRef.current?.click()}>
                      <ImagePlus data-icon="inline-start" />
                      {m['tool.batch.add']()}
                    </Button>
                    <Button variant="ghost" onClick={reset}>
                      {m['tool.result.new_image']()}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )
      ) : null}

      <div
        className="flex flex-wrap items-center justify-between gap-3 px-1"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={onDrop}
      >
        <div className="flex items-center gap-4">
          {privacyBadge}
          {selected.status === 'done' && selected.result ? (
            <span className="text-xs text-muted-foreground">
              {m['tool.result.processed_in']({
                seconds: (selected.result.durationMs / 1000).toFixed(1),
                provider: engineLabel(selected.result.engine),
              })}
            </span>
          ) : null}
        </div>
        {qualityToggle}
      </div>
    </div>
  );
}
