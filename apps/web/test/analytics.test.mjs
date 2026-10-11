import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * What leaves the browser when an operator turns analytics on.
 *
 * The README says aggregate metrics only. posthog-js initialised with a host
 * and nothing else sends far more: the URL of every page, which on a share
 * page is the share link, and the text of whatever was clicked. These hold
 * the two locks: the collectors are off by name, and every event's URLs are
 * rewritten on the way out.
 */

register('./helpers/loader.mjs', import.meta.url);

let redactUrl;
let scrubAnalyticsEvent;

before(async () => {
  ({ redactUrl, scrubAnalyticsEvent } = await import('../lib/analytics.ts'));
});

describe('a URL leaves without the token that opens it', () => {
  it('replaces share and badge tokens with the route name', () => {
    assert.equal(redactUrl('https://trazum.app/c/Xy9-secret_TOKEN'), 'https://trazum.app/c/:token');
    assert.equal(redactUrl('https://trazum.app/badge/Xy9-secret'), 'https://trazum.app/badge/:token');
    assert.equal(redactUrl('https://trazum.app/api/shares/abc123'), 'https://trazum.app/api/shares/:token');
  });

  it('drops the query and the fragment, where a workload name rides', () => {
    assert.equal(redactUrl('https://trazum.app/?tab=bill&label=acme-payroll#x'), 'https://trazum.app/');
  });

  it('handles a bare path the way it handles a URL', () => {
    assert.equal(redactUrl('/c/Xy9-secret?ref=mail'), '/c/:token');
    assert.equal(redactUrl('/'), '/');
  });

  it('keeps only the origin of a referrer from another site', () => {
    assert.equal(redactUrl('https://news.example/item?id=42'), 'https://news.example/item');
  });
});

describe('every event passes the scrub', () => {
  it('rewrites the URLs posthog-js attaches and drops what a click recorded', () => {
    const event = {
      event: 'compare',
      properties: {
        direction: 'shrank',
        $current_url: 'https://trazum.app/c/SECRET?x=1',
        $pathname: '/c/SECRET',
        $referrer: 'https://trazum.app/c/SECRET',
        $el_text: 'Copy link to my payroll prompt',
        $elements_chain: 'button.copy:attr__href="/c/SECRET"',
      },
      $set_once: { $initial_current_url: 'https://trazum.app/c/SECRET' },
    };
    const out = scrubAnalyticsEvent(event);
    assert.equal(out.properties.direction, 'shrank');
    assert.equal(out.properties.$current_url, 'https://trazum.app/c/:token');
    assert.equal(out.properties.$pathname, '/c/:token');
    assert.equal(out.$set_once.$initial_current_url, 'https://trazum.app/c/:token');
    assert.equal('$el_text' in out.properties, false);
    assert.equal('$elements_chain' in out.properties, false);
    assert.doesNotMatch(JSON.stringify(out), /SECRET/);
  });

  it('passes a dropped event through as dropped', () => {
    assert.equal(scrubAnalyticsEvent(null), null);
  });
});

describe('the collectors are switched off by name', () => {
  it('in the one place posthog-js is initialised', () => {
    const source = readFileSync(new URL('../components/Analytics.tsx', import.meta.url), 'utf8');
    for (const setting of [
      'autocapture: false',
      'capture_pageview: false',
      'capture_pageleave: false',
      'disable_session_recording: true',
      'enable_heatmaps: false',
      'disable_surveys: true',
      'mask_all_text: true',
      'mask_all_element_attributes: true',
      "persistence: 'memory'",
      'before_send: (event) => scrubAnalyticsEvent(event)',
    ]) {
      assert.ok(source.includes(setting), `Analytics.tsx no longer says ${setting}`);
    }
    assert.equal((source.match(/posthog\.init\(/g) ?? []).length, 1);
  });
});
