import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { suggestFilename } from './compose.ts';

describe('suggestFilename', () => {
  it('tags the export and swaps the extension', () => {
    assert.equal(suggestFilename('portrait.HEIC', 'image/jpeg', 'white'), 'portrait-white.jpg');
    assert.equal(suggestFilename('logo', 'image/png', 'logo'), 'logo-logo.png');
  });

  it('drops odd characters from the tag', () => {
    assert.equal(suggestFilename('a.jpg', 'image/png', '../x'), 'a-x.png');
  });
});
