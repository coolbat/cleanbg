import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planEngines, shouldUseSingleThreadedWasm } from './capabilities.ts';
import type { GpuHints, HardwareHints } from './types.ts';

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0';

const capableGpu: GpuHints = {
  fallbackAdapter: false,
  shaderF16: true,
  maxBufferSize: 1024 * 1024 * 1024,
  maxStorageBufferBindingSize: 512 * 1024 * 1024,
};

function hints(partial: Partial<HardwareHints> & Pick<HardwareHints, 'userAgent'>): HardwareHints {
  return {
    crossOriginIsolated: true,
    gpu: null,
    ...partial,
  };
}

describe('planEngines', () => {
  it('puts BEN2 WebGPU first on a capable Chromium desktop with a model host', () => {
    const plan = planEngines(
      hints({ userAgent: CHROME, gpu: capableGpu, deviceMemory: 8 }),
      { hasModelHost: true },
    );
    assert.deepEqual(plan[0], { model: 'ben2', provider: 'webgpu' });
    assert.deepEqual(plan.at(-1), { model: 'birefnet-lite', provider: 'wasm' });
  });

  it('skips BEN2 when RAM is reported under 4 GB', () => {
    const plan = planEngines(
      hints({ userAgent: CHROME, gpu: capableGpu, deviceMemory: 2 }),
      { hasModelHost: true },
    );
    assert.equal(
      plan.some((e) => e.model === 'ben2'),
      false,
    );
    assert.deepEqual(plan[0], { model: 'birefnet-lite', provider: 'webgpu' });
  });

  it('never selects WebGPU on iOS even if an adapter is present', () => {
    const plan = planEngines(
      hints({ userAgent: IPHONE, gpu: capableGpu, deviceMemory: 8 }),
      { hasModelHost: true },
    );
    assert.deepEqual(plan, [{ model: 'birefnet-lite', provider: 'wasm' }]);
  });

  it('stays lite-only without a model host', () => {
    const plan = planEngines(
      hints({ userAgent: CHROME, gpu: capableGpu, deviceMemory: 8 }),
      { hasModelHost: false },
    );
    assert.equal(
      plan.some((e) => e.model === 'ben2'),
      false,
    );
    assert.deepEqual(plan[0], { model: 'birefnet-lite', provider: 'webgpu' });
  });

  it('falls back to WASM on Firefox', () => {
    const plan = planEngines(
      hints({ userAgent: FIREFOX, gpu: capableGpu, deviceMemory: 8 }),
      { hasModelHost: true },
    );
    assert.deepEqual(plan, [{ model: 'birefnet-lite', provider: 'wasm' }]);
  });
});

describe('shouldUseSingleThreadedWasm', () => {
  it('is true without cross-origin isolation', () => {
    assert.equal(
      shouldUseSingleThreadedWasm(
        hints({ userAgent: CHROME, crossOriginIsolated: false }),
      ),
      true,
    );
  });

  it('is true on iPhone', () => {
    assert.equal(
      shouldUseSingleThreadedWasm(hints({ userAgent: IPHONE })),
      true,
    );
  });
});
