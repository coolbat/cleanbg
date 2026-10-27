import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shortPathRedirect, shortPathTarget } from './short-path-redirect.ts';

describe('shortPathTarget', () => {
  it('maps en and zh short paths, with or without a trailing slash', () => {
    assert.equal(shortPathTarget('/privacy'), '/privacy-policy');
    assert.equal(shortPathTarget('/privacy/'), '/privacy-policy');
    assert.equal(shortPathTarget('/zh/privacy'), '/zh/privacy-policy');
    assert.equal(shortPathTarget('/zh/privacy/'), '/zh/privacy-policy');
    assert.equal(shortPathTarget('/terms'), '/terms-of-service');
    assert.equal(shortPathTarget('/terms/'), '/terms-of-service');
    assert.equal(shortPathTarget('/zh/terms'), '/zh/terms-of-service');
    assert.equal(shortPathTarget('/zh/terms/'), '/zh/terms-of-service');
    assert.equal(shortPathTarget('/about'), '/');
    assert.equal(shortPathTarget('/about/'), '/');
    assert.equal(shortPathTarget('/contact'), '/');
    assert.equal(shortPathTarget('/contact/'), '/');
    assert.equal(shortPathTarget('/zh/about'), '/zh');
    assert.equal(shortPathTarget('/zh/about/'), '/zh');
    assert.equal(shortPathTarget('/zh/contact'), '/zh');
    assert.equal(shortPathTarget('/zh/contact/'), '/zh');
  });

  it('leaves canonical and unknown paths alone', () => {
    assert.equal(shortPathTarget('/'), null);
    assert.equal(shortPathTarget('/zh'), null);
    assert.equal(shortPathTarget('/privacy-policy'), null);
    assert.equal(shortPathTarget('/zh/privacy-policy'), null);
    assert.equal(shortPathTarget('/blog'), null);
  });
});

describe('shortPathRedirect', () => {
  it('returns a 301 to the canonical path and keeps origin plus query', () => {
    const res = shortPathRedirect(
      new Request('https://cleanbg.app/privacy/?utm=1'),
    );
    assert.ok(res);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://cleanbg.app/privacy-policy?utm=1');
  });

  it('does not redirect unknown paths', () => {
    assert.equal(shortPathRedirect(new Request('https://cleanbg.app/blog')), null);
  });
});
