import { useEffect, useRef, useState } from 'react';
import { Eraser, Paintbrush, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';

type Tool = 'keep' | 'erase';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

function imageData(img: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export function MaskEditor({
  originalUrl,
  cutoutUrl,
  width,
  height,
  onApply,
  onCancel,
}: {
  originalUrl: string;
  cutoutUrl: string;
  width: number;
  height: number;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const working = useRef<ImageData | null>(null);
  const original = useRef<ImageData | null>(null);
  const baseline = useRef<ImageData | null>(null);
  const [tool, setTool] = useState<Tool>('erase');
  const [brush, setBrush] = useState(() => Math.round(Math.max(width, height) * 0.03));
  const [ready, setReady] = useState(false);
  const drawing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadImage(originalUrl), loadImage(cutoutUrl)]).then(([src, cut]) => {
      if (cancelled) return;
      original.current = imageData(src, width, height);
      const cutData = imageData(cut, width, height);
      working.current = cutData;
      baseline.current = new ImageData(new Uint8ClampedArray(cutData.data), width, height);
      setReady(true);
      paint();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalUrl, cutoutUrl, width, height]);

  const paint = () => {
    const canvas = displayRef.current;
    const data = working.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(data, 0, 0);
  };

  const stamp = (clientX: number, clientY: number) => {
    const canvas = displayRef.current;
    const dst = working.current;
    const src = original.current;
    if (!canvas || !dst || !src) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((clientX - rect.left) / rect.width) * width);
    const y = Math.round(((clientY - rect.top) / rect.height) * height);
    const r = Math.max(1, brush);
    const r2 = r * r;
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(width - 1, x + r);
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height - 1, y + r);
    const erase = tool === 'erase';
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - x;
        const dy = py - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / r;
        const i = (py * width + px) * 4;
        if (erase) {
          dst.data[i + 3] = Math.round(dst.data[i + 3] * (1 - falloff));
        } else {
          dst.data[i] = src.data[i];
          dst.data[i + 1] = src.data[i + 1];
          dst.data[i + 2] = src.data[i + 2];
          dst.data[i + 3] = Math.min(255, Math.round(dst.data[i + 3] + (255 - dst.data[i + 3]) * falloff));
        }
      }
    }
    paint();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    stamp(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    stamp(e.clientX, e.clientY);
  };
  const stopDraw = () => {
    drawing.current = false;
  };

  const reset = () => {
    if (!baseline.current) return;
    working.current = new ImageData(new Uint8ClampedArray(baseline.current.data), width, height);
    paint();
  };

  const apply = async () => {
    const data = working.current;
    if (!data) return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
    onApply(blob);
  };

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-2xl border border-border"
        style={{
          backgroundColor: '#f4f4f5',
          backgroundImage:
            'linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
        }}
      >
        <canvas
          ref={displayRef}
          width={width}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDraw}
          onPointerCancel={stopDraw}
          className={cn(
            'max-h-[70vh] w-full touch-none object-contain',
            tool === 'erase' ? 'cursor-cell' : 'cursor-copy',
            !ready && 'opacity-0',
          )}
        />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={tool === 'erase' ? 'default' : 'outline'}
            onClick={() => setTool('erase')}
          >
            <Eraser data-icon="inline-start" />
            {m['tool.mask.erase']()}
          </Button>
          <Button
            size="sm"
            variant={tool === 'keep' ? 'default' : 'outline'}
            onClick={() => setTool('keep')}
          >
            <Paintbrush data-icon="inline-start" />
            {m['tool.mask.keep']()}
          </Button>
          <label className="ml-1 flex items-center gap-2 text-sm text-muted-foreground">
            {m['tool.mask.size']()}
            <input
              type="range"
              min={4}
              max={Math.max(48, Math.round(Math.max(width, height) * 0.12))}
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            {m['tool.mask.reset']()}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            <X data-icon="inline-start" />
            {m['tool.mask.cancel']()}
          </Button>
          <Button size="sm" onClick={() => void apply()} disabled={!ready}>
            {m['tool.mask.apply']()}
          </Button>
        </div>
      </div>
      <p className="px-1 text-xs text-muted-foreground">{m['tool.mask.hint']()}</p>
    </div>
  );
}
