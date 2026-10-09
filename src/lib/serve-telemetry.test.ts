import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseTelemetryBody } from './serve-telemetry.ts';

describe('parseTelemetryBody', () => {
  it('accepts a clipped engine-failed event', () => {
    const parsed = parseTelemetryBody(
      JSON.stringify({
        e: 'engine-failed',
        k: 'ben2:webgpu',
        r: 'adapter lost',
        p: true,
        v: 1,
      }),
    );
    assert.deepEqual(parsed, {
      e: 'engine-failed',
      k: 'ben2:webgpu',
      r: 'adapter lost',
      c: '',
      p: true,
    });
  });

  it('rejects unknown events and oversize payloads', () => {
    assert.equal(parseTelemetryBody('{"e":"page-view"}'), null);
    assert.equal(parseTelemetryBody('not json'), null);
    assert.equal(parseTelemetryBody(`{"e":"error","pad":"${'x'.repeat(600)}"}`), null);
  });

  it('strips control characters from reason text', () => {
    const parsed = parseTelemetryBody(
      JSON.stringify({ e: 'error', c: 'inference-failed', r: 'boom\nsecret' }),
    );
    assert.equal(parsed?.r, 'boom secret');
    assert.equal(parsed?.c, 'inference-failed');
  });
});
