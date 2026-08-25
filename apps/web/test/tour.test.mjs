import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

register('./helpers/loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

const { TOUR_STEPS, TOUR_SEEN_KEY } = await import('../lib/tour.ts');
const { en } = await import('../lib/i18n/en.ts');
const { es } = await import('../lib/i18n/es.ts');

/**
 * The 1.73 guided tour. What these hold: the no-fetch invariant over the new
 * files; every step's anchor exists in some component source, so a refactor
 * cannot orphan a step silently; every step has its copy in both locales and
 * the two locales actually differ; the tour never auto-plays; storage is
 * read behind try/catch; and the reduced-motion branch is present where the
 * one scroll happens.
 */
describe('the guided tour', () => {
  const codeOf = (rel) =>
    readFileSync(join(web, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('still never fetches, with the tour inside the same app', () => {
    for (const rel of ['components/Tour.tsx', 'lib/tour.ts']) {
      const source = codeOf(rel);
      assert.equal(/\bfetch\s*\(/.test(source), false, `${rel} contains a fetch call`);
      assert.equal(/XMLHttpRequest|sendBeacon|WebSocket|FormData/.test(source), false, rel);
    }
  });

  it('every ringed step points at an anchor some component actually carries', () => {
    // The join between the steps file and the JSX. A step whose target no
    // component renders would centre its card forever and nobody would know.
    const sources = readdirSync(join(web, 'components'))
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => readFileSync(join(web, 'components', name), 'utf8'))
      .join('\n');
    for (const step of TOUR_STEPS) {
      if (step.target === null) continue;
      assert.ok(
        sources.includes(`data-tour="${step.target}"`),
        `step "${step.id}" rings data-tour="${step.target}", which no component renders`,
      );
    }
    // And the detector can fail: an invented target is not found.
    assert.equal(sources.includes('data-tour="panel-that-does-not-exist"'), false);
  });

  it('every step speaks both locales, and they are not the same words', () => {
    for (const step of TOUR_STEPS) {
      for (const [name, t] of [
        ['en', en],
        ['es', es],
      ]) {
        const copy = t.tour.steps[step.id];
        assert.ok(copy, `step "${step.id}" has no ${name} copy`);
        assert.ok(copy.title.length > 0 && copy.body.length > 20, `step "${step.id}" ${name} copy is thin`);
      }
      assert.notEqual(
        en.tour.steps[step.id].body,
        es.tour.steps[step.id].body,
        `step "${step.id}" carries the same body in both locales — one is a copy-paste`,
      );
    }
  });

  it('walks every tab the app has, and only tabs the app has', () => {
    const app = readFileSync(join(web, 'components/App.tsx'), 'utf8');
    const tabs = new Set([...app.matchAll(/<TabsContent value="([a-z]+)"/g)].map((m) => m[1]));
    for (const step of TOUR_STEPS) {
      assert.ok(tabs.has(step.tab), `step "${step.id}" opens tab "${step.tab}", which App does not render`);
    }
    // The tour covers the public doors — library is signed-in only and has no step.
    for (const tab of ['optimise', 'write', 'compare', 'bill', 'playground']) {
      assert.ok(
        TOUR_STEPS.some((step) => step.tab === tab),
        `no step opens the "${tab}" tab — a door the tour walks past`,
      );
    }
  });

  it('never auto-plays: the tour renders only behind visitor intent', () => {
    const app = codeOf('components/App.tsx');
    // The component is gated on tourOpen, and tourOpen starts false; only the
    // two visitor actions flip it.
    assert.match(app, /tourOpen && \(/);
    assert.match(app, /useState\(false\);?\s*$/m);
    assert.equal(/setTourOpen\(true\)/.test(app), true);
    // The first-visit offer is a banner with an explicit start button, not an
    // effect that opens the overlay.
    assert.equal(/useEffect\([^)]*setTourOpen\(true\)/s.test(app), false, 'an effect auto-opens the tour');
  });

  it('reads and writes its flag behind try/catch, under its own key', () => {
    assert.equal(TOUR_SEEN_KEY, 'trazum:tour-seen');
    const app = readFileSync(join(web, 'components/App.tsx'), 'utf8');
    const reads = app.indexOf('window.localStorage.getItem(TOUR_SEEN_KEY)');
    const writes = app.indexOf('window.localStorage.setItem(TOUR_SEEN_KEY');
    assert.ok(reads > -1 && writes > -1, 'the flag is not read or not written');
    // Both accesses sit inside a try block — a private window must not throw
    // the app away.
    for (const at of [reads, writes]) {
      const before = app.slice(Math.max(0, at - 200), at);
      assert.match(before, /try \{/, 'a storage access is outside try/catch');
    }
  });

  it('scrolls with the reader, not at them', () => {
    const tour = readFileSync(join(web, 'components/Tour.tsx'), 'utf8');
    assert.match(tour, /prefers-reduced-motion/, 'the scroll ignores prefers-reduced-motion');
    assert.match(tour, /'auto' : 'smooth'/, 'the reduced-motion branch does not pick instant scrolling');
    // Escape leaves; the card takes focus.
    assert.match(tour, /key === 'Escape'/);
    assert.match(tour, /cardRef\.current\?\.focus\(\)/);
  });
});
