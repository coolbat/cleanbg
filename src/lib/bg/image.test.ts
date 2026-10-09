import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { edgeBand, inspectMask, planEdgeTiles } from './image.ts';

describe('inspectMask', () => {
  it('rejects non-finite values', () => {
    const alpha = new Float32Array([0, 1, Number.NaN]);
    assert.equal(inspectMask(alpha).valid, false);
  });

  it('reports a subject when coverage is mixed', () => {
    const alpha = new Float32Array(100);
    alpha.fill(0);
    alpha.fill(1, 0, 40);
    const inspection = inspectMask(alpha);
    assert.equal(inspection.valid, true);
    assert.equal(inspection.hasForegroundSignal, true);
    assert.equal(inspection.coverage, 0.4);
  });
});

describe('planEdgeTiles', () => {
  it('returns no tiles when the image is already near model resolution', () => {
    const width = 256;
    const height = 256;
    const band = new Uint8Array(width * height).fill(1);
    assert.deepEqual(planEdgeTiles(band, width, height, 256, 8), []);
  });

  it('returns no tiles when the edge band is empty', () => {
    const width = 1024;
    const height = 1024;
    const band = new Uint8Array(width * height);
    assert.deepEqual(planEdgeTiles(band, width, height, 256, 8), []);
  });

  it('places tiles over a marked edge band', () => {
    const width = 1024;
    const height = 1024;
    const band = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < 80; x++) band[y * width + x] = 1;
    }
    const tiles = planEdgeTiles(band, width, height, 256, 8);
    assert.ok(tiles.length > 0);
    for (const tile of tiles) {
      assert.equal(tile.right - tile.left, tile.bottom - tile.top);
      assert.ok(tile.left >= 0 && tile.top >= 0);
      assert.ok(tile.right <= width && tile.bottom <= height);
    }
  });

  it('dilates a soft alpha edge into a non-empty band', () => {
    const width = 64;
    const height = 64;
    const alpha = new Float32Array(width * height);
    for (let y = 16; y < 48; y++) {
      for (let x = 16; x < 48; x++) {
        const edge = x < 20 || x >= 44 || y < 20 || y >= 44;
        alpha[y * width + x] = edge ? 0.5 : 1;
      }
    }
    const band = edgeBand(alpha, width, height, 2);
    assert.ok(band.some((v) => v === 1));
  });
});
