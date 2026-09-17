import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/bg/models';
import type { EngineChoice, RemovalProgress, RemovalQuality } from '@/lib/bg/types';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';

import { CompareView, backgroundStyle, type PreviewBackground } from './compare-view';
import { useRemover } from './use-remover';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif';

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

export function Remover() {
  const { state, quality, plan, process, reset, retry, changeQuality } = useRemover();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [bgId, setBgId] = useState('transparent');
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [copied, setCopied] = useState(false);

  const background: PreviewBackground =
    bgId === 'custom'
      ? { type: 'color', color: customColor }
      : (BACKGROUNDS.find((b) => b.id === bgId)?.bg ?? { type: 'transparent' });

  const pickFile = useCallback(
    (files: FileList | File[] | null | undefined) => {
      const file = files && Array.from(files).find((f) => f.type.startsWith('image/'));
      if (file) void process(file);
    },
    [process],
  );

  // Paste anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length) {
        e.preventDefault();
        pickFile(items);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pickFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files);
  };

  const loadSample = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/samples/portrait.jpg');
      const blob = await res.blob();
      void process(new File([blob], 'sample-portrait.jpg', { type: 'image/jpeg' }));
    } catch (error) {
      toast.error(String(error));
    }
  };

  const exportAs = async (format: 'image/png' | 'image/webp') => {
    if (state.status !== 'done') return;
    const { exportCutout, downloadBlob, suggestFilename } = await import('@/lib/bg/compose');
    const blob = await exportCutout(state.result.bitmap, {
      format,
      background:
        background.type === 'color' ? { type: 'color', color: background.color } : { type: 'transparent' },
    });
    downloadBlob(blob, suggestFilename(state.file.name, format));
  };

  const copyResult = async () => {
    if (state.status !== 'done') return;
    try {
      const { exportCutout } = await import('@/lib/bg/compose');
      const blob = await exportCutout(state.result.bitmap, {
        format: 'image/png',
        background:
          background.type === 'color' ? { type: 'color', color: background.color } : { type: 'transparent' },
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

  // ----- idle -------------------------------------------------------------
  if (state.status === 'idle') {
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
            <Button size="lg" className="rounded-full px-6" onClick={(e) => e.stopPropagation()}>
              <ImagePlus data-icon="inline-start" />
              {m['tool.dropzone.button']()}
            </Button>
            <Button size="lg" variant="ghost" className="rounded-full" onClick={loadSample}>
              {m['tool.dropzone.sample']()}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/80">{m['tool.dropzone.formats']()}</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files);
              e.target.value = '';
            }}
          />
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

  // ----- processing -------------------------------------------------------
  if (state.status === 'processing') {
    const pct = Math.round(state.progress.progress * 100);
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <div
            className="relative mx-auto max-h-[60vh] w-full"
            style={{ aspectRatio: '4 / 3' }}
          >
            <img
              src={state.originalUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain opacity-60 blur-[1px]"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/40 p-6 backdrop-blur-sm">
              <Loader2 className="size-6 animate-spin text-foreground" />
              <p className="text-sm font-medium">{progressLabel(state.progress)}</p>
              <div className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {pct}%
                {state.progress.engine ? ` · ${engineLabel(state.progress.engine)}` : ''}
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X data-icon="inline-start" />
                {m['tool.progress.cancel']()}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-1">{privacyBadge}</div>
      </div>
    );
  }

  // ----- error ------------------------------------------------------------
  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-3xl border border-destructive/40 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{errorLabel(state.code, state.message)}</p>
          <div className="flex gap-2">
            {state.file ? (
              <Button variant="outline" onClick={retry}>
                <RotateCcw data-icon="inline-start" />
                {m['tool.error.retry']()}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={reset}>
              {m['tool.result.new_image']()}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ----- done -------------------------------------------------------------
  const { result } = state;
  return (
    <div className="space-y-4">
      <CompareView
        originalUrl={state.originalUrl}
        resultUrl={state.resultUrl}
        width={result.width}
        height={result.height}
        background={background}
        labels={{ original: m['tool.result.original'](), result: m['tool.result.result']() }}
        className="max-h-[70vh] bg-card"
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Background picker */}
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

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => exportAs('image/png')}>
            <Download data-icon="inline-start" />
            {m['tool.result.download_png']()}
          </Button>
          <Button variant="outline" onClick={() => exportAs('image/webp')}>
            {m['tool.result.download_webp']()}
          </Button>
          <Button variant="outline" onClick={copyResult}>
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {m['tool.result.copy']()}
          </Button>
          <Button variant="ghost" onClick={reset}>
            <ImagePlus data-icon="inline-start" />
            {m['tool.result.new_image']()}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-4">
          {privacyBadge}
          <span className="text-xs text-muted-foreground">
            {m['tool.result.processed_in']({
              seconds: (result.durationMs / 1000).toFixed(1),
              provider: engineLabel(result.engine),
            })}
          </span>
        </div>
        {qualityToggle}
      </div>
    </div>
  );
}
