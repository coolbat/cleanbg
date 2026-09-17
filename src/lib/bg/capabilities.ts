import type { EngineChoice, HardwareHints } from './types';

// The WebGPU API being present does not mean ONNX Runtime supports that
// browser's implementation. Keep GPU inference on Chromium engines, where
// ORT's WebGPU backend is tested; every iOS browser is WebKit regardless of
// brand and goes down the WASM path.
const IOS_DEVICE = /\b(?:iPhone|iPad|iPod)\b/i;
const MACINTOSH = /\bMacintosh\b/i;
const CHROMIUM = /\b(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\/\d+/i;

const MiB = 1024 * 1024;

export function isIOS(userAgent: string): boolean {
  return IOS_DEVICE.test(userAgent);
}

export function isChromium(userAgent: string): boolean {
  return CHROMIUM.test(userAgent);
}

/**
 * iOS and iPadOS-reporting-as-Mac have a tight per-tab memory budget and
 * flaky SharedArrayBuffer support; keep the WASM runtime single-threaded.
 * Any page that is not cross-origin isolated cannot use threads anyway.
 */
export function shouldUseSingleThreadedWasm(hints: HardwareHints): boolean {
  if (!hints.crossOriginIsolated) return true;
  if (isIOS(hints.userAgent)) return true;
  return MACINTOSH.test(hints.userAgent) && (hints.maxTouchPoints ?? 0) > 1;
}

/**
 * Ordered list of engines to try, best first. These are admission
 * heuristics, not compatibility guarantees: runtime failures still fall
 * through to the next entry (see engine.ts).
 *
 *   1. BEN2 on WebGPU        — capable discrete/integrated GPUs
 *   2. BiRefNet-lite WebGPU  — any usable fp16 GPU
 *   3. BiRefNet-lite WASM    — everything else (always present)
 *
 * BEN2 on the CPU is deliberately absent: at 1024px it takes ~25s even on a
 * fast laptop, while lite finishes in ~1.5s. It stays reachable through the
 * dev-only `?bg-engine=ben2:wasm` override.
 */
export function planEngines(hints: HardwareHints, options: { hasModelHost: boolean }): EngineChoice[] {
  const choices: EngineChoice[] = [];
  // BEN2 only exists on our mirror (converted export); without a configured
  // model host the plan is lite-only, straight from Hugging Face.
  if (!options.hasModelHost) {
    if (hints.gpu && isChromium(hints.userAgent) && !isIOS(hints.userAgent) && !hints.gpu.fallbackAdapter && hints.gpu.shaderF16) {
      choices.push({ model: 'birefnet-lite', provider: 'webgpu' });
    }
    choices.push({ model: 'birefnet-lite', provider: 'wasm' });
    return choices;
  }
  const memory = hints.deviceMemory;
  // Missing RAM hints are common (Firefox, Safari); only a reported
  // low-memory device opts out of the heavy model.
  const lowMemory = Boolean(memory && memory < 4);

  const gpu = hints.gpu;
  if (
    gpu &&
    isChromium(hints.userAgent) &&
    !isIOS(hints.userAgent) &&
    !gpu.fallbackAdapter &&
    gpu.shaderF16
  ) {
    if (
      !lowMemory &&
      gpu.maxBufferSize >= 256 * MiB &&
      gpu.maxStorageBufferBindingSize >= 128 * MiB
    ) {
      choices.push({ model: 'ben2', provider: 'webgpu' });
    }
    choices.push({ model: 'birefnet-lite', provider: 'webgpu' });
  }

  choices.push({ model: 'birefnet-lite', provider: 'wasm' });
  return choices;
}
