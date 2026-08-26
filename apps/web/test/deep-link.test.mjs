import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, '..', 'components', 'App.tsx'), 'utf8');

/**
 * `?tab=<value>` opens a panel directly.
 *
 * The README could send somebody to the Playground and could not land them on
 * it: the demo that runs without installing anything was a link plus an
 * instruction to find a tab, and a visitor who does not take the second step
 * lands on Optimise and never sees what they were sent for. Six screens of
 * README were blamed for that; the link was the actual problem.
 *
 * What these hold is the pair of properties that make the link worth writing
 * down in a README: every panel on the rail is reachable by name, and a bare
 * visit still lands where the product decided it should.
 */
describe('deep links into a panel', () => {
  /** The rail's own values, read off the source rather than listed here. */
  const railValues = (() => {
    const start = app.indexOf('const GROUPS = [');
    assert.ok(start > -1, 'GROUPS moved — this guard can no longer find the rail');
    const block = app.slice(start, app.indexOf('\n  ];', start));
    const values = [...block.matchAll(/value: '([a-z]+)'/g)].map((m) => m[1]);
    assert.ok(values.length >= 5, `only found ${values.length} rail entries — has the shape changed?`);
    return values;
  })();

  it('reads the requested panel from the query string', () => {
    assert.match(
      app,
      /new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/,
      'nothing reads ?tab, so the README cannot land anybody on a panel',
    );
  });

  it('validates against the rail itself, so a panel added tomorrow is linkable', () => {
    /**
     * The alternative is a list of tab names kept in this component, which is
     * the drift this repository has four recorded cases of. A panel added to
     * the rail and missing from that list would be silently unlinkable, and
     * nothing would say so.
     */
    assert.match(
      app,
      /GROUPS\.some\(\(group\) => group\.items\.some\(\(item\) => item\.value === requested\)\)/,
      'the requested tab is not validated against GROUPS, so the linkable set is a second list',
    );
    for (const value of railValues) {
      assert.ok(
        app.includes(`value: '${value}'`),
        `${value} is on the rail and this guard cannot see it`,
      );
    }
  });

  it('leaves the default alone, because which panel a bare visit opens is a product decision', () => {
    assert.match(
      app,
      /useState\('optimise'\)/,
      'the default panel changed, which is a product decision and not something a deep link may smuggle in',
    );
    assert.match(
      app,
      /if \(requested === null\) return;/,
      'a visit with no ?tab no longer short-circuits, so the default is being decided elsewhere',
    );
  });

  it('writes the panel back to the address, and never into history', () => {
    // A tab somebody is looking at has to be a tab they can send. replaceState
    // rather than pushState: the rail is navigation inside one page, and
    // filling the back button with every glance at another panel is how a tab
    // bar starts trapping people.
    assert.match(app, /window\.history\.replaceState/, 'selecting a panel does not update the address');
    assert.doesNotMatch(app, /window\.history\.pushState/, 'the rail is pushing history entries');
    assert.match(
      app,
      /url\.searchParams\.delete\('tab'\)/,
      'returning to the default leaves a stale ?tab in the address',
    );
  });

  it('never lets a bad URL cost the reader a panel', () => {
    // Same posture as every storage access in this component: the panel change
    // is the part that matters, and a URL this browser will not parse must not
    // take it down with it.
    const seed = app.slice(app.indexOf('seededFromUrl'), app.indexOf('const selectTab'));
    assert.match(seed, /try \{/, 'the URL read is not behind try/catch');
    const select = app.slice(app.indexOf('const selectTab'), app.indexOf('const selectTab') + 700);
    assert.match(select, /try \{/, 'the address rewrite is not behind try/catch');
    assert.ok(
      select.indexOf('setActiveTab(value);') < select.indexOf('try {'),
      'the panel changes after the address rewrite, so a URL failure would cost the click',
    );
  });
});
