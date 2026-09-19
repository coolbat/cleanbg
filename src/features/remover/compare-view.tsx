import { useCallback, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export type PreviewBackground =
  | { type: 'transparent' }
  | { type: 'color'; color: string };

// Opaque checkerboard: a solid base colour under the grey squares. The
// result layer sits on top of the original in the compare view, so any
// transparency here would let the original bleed through the gaps.
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  backgroundImage:
    'linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
};

export function backgroundStyle(bg: PreviewBackground): React.CSSProperties {
  return bg.type === 'color' ? { backgroundColor: bg.color } : CHECKERBOARD;
}

/**
 * Before/after view with a draggable divider. The result layer sits on top
 * and is clipped from the left, so dragging right reveals the original.
 */
export function CompareView({
  originalUrl,
  resultUrl,
  width,
  height,
  background,
  labels,
  className,
}: {
  originalUrl: string;
  resultUrl: string;
  width: number;
  height: number;
  background: PreviewBackground;
  labels: { original: string; result: string };
  className?: string;
}) {
  const [position, setPosition] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  const updateFromPointer = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) updateFromPointer(e.clientX);
  };

  return (
    <div
      ref={ref}
      className={cn(
        'relative select-none overflow-hidden rounded-2xl border border-border touch-none',
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      {/* Original (bottom layer) */}
      <img
        src={originalUrl}
        alt={labels.original}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {/* Result (top layer, clipped from the right side) */}
      <div
        className="absolute inset-0"
        style={{
          ...backgroundStyle(background),
          clipPath: `inset(0 ${100 - position}% 0 0)`,
        }}
      >
        <img
          src={resultUrl}
          alt={labels.result}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>

      {/* Divider */}
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/20 bg-white text-neutral-800 shadow-md">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 6 4 12l4 6M16 6l4 6-4 6" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        {labels.result}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        {labels.original}
      </span>

      {/* Keyboard access */}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label={`${labels.result} / ${labels.original}`}
        className="absolute inset-x-0 bottom-0 h-8 w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
