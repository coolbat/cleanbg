import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { boxBlur, refineMatte } from './matte.ts';

describe('boxBlur', () => {
  it('preserves interior pixels of a uniform field', () => {
    const width = 16;
    const height = 16;
    const radius = 2;
    const src = new Float32Array(width * height).fill(0.4);
    const dst = new Float32Array(src.length);
    boxBlur(src, dst, width, height, radius);
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        assert.ok(Math.abs(dst[y * width + x] - 0.4) < 1e-5);
      }
    }
  });
});

describe('refineMatte', () => {
  it('clears colour on fully transparent pixels', () => {
    const width = 8;
    const height = 8;
    const n = width * height;
    const rgba = new Uint8ClampedArray(n * 4);
    const alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = 200;
      rgba[i * 4 + 1] = 40;
      rgba[i * 4 + 2] = 40;
      rgba[i * 4 + 3] = 255;
      alpha[i] = 0;
    }
    refineMatte(rgba, alpha, width, height, { radius: 1, low: 0.03, high: 0.9 });
    for (let i = 0; i < n; i++) {
      assert.equal(rgba[i * 4], 0);
      assert.equal(rgba[i * 4 + 1], 0);
      assert.equal(rgba[i * 4 + 2], 0);
      assert.equal(rgba[i * 4 + 3], 0);
    }
  });

  it('keeps solid foreground opaque', () => {
    const width = 8;
    const height = 8;
    const n = width * height;
    const rgba = new Uint8ClampedArray(n * 4);
    const alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = 10;
      rgba[i * 4 + 1] = 20;
      rgba[i * 4 + 2] = 30;
      rgba[i * 4 + 3] = 255;
      alpha[i] = 1;
    }
    refineMatte(rgba, alpha, width, height, { radius: 1, low: 0.03, high: 0.9 });
    for (let i = 0; i < n; i++) {
      assert.equal(rgba[i * 4 + 3], 255);
    }
  });
});
