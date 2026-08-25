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

  it('what the screenshots taught, kept as law', () => {
    const tour = readFileSync(join(web, 'components/Tour.tsx'), 'utf8');
    // The ring is clamped to the viewport: a panel taller than the screen is
    // ringed by its visible part — the un-clamped rectangle painted the dim
    // off-screen and the tour looked like nothing at all.
    assert.match(tour, /Math.min\(window.innerWidth/);
    assert.match(tour, /Math.min\(window.innerHeight/);
    // The card's top is clamped into the viewport; on phones the un-clamped
    // card clipped its title above the screen edge.
    assert.match(tour, /cardTop = Math.min\(/);
    // The welcome dim is inline style: a backdrop that can quietly not render
    // is a modal with no modality.
    assert.match(tour, /backgroundColor: 'rgba\(0, 0, 0, 0.55\)'/);
    // The ring glides between targets; the global reduced-motion rule makes
    // it instant, so the transition needs no gate of its own.
    assert.match(tour, /cubic-bezier/);
    // Arrow keys walk the steps; the dots draw the walked path.
    assert.match(tour, /ArrowRight/);
    assert.match(tour, /ArrowLeft/);
    assert.match(tour, /TOUR_STEPS.map\(/);
    // The entrance animation lives in globals.css, under the same
    // reduced-motion rule as everything else.
    const globals = readFileSync(join(web, 'app/globals.css'), 'utf8');
    assert.match(globals, /@keyframes tour-card-in/);
    assert.match(tour, /tour-card-in/);
  });

  it('every demo is real: the typed commands run, against the shipped samples', async () => {
    /**
     * The 1.76 contract. A step's demo is not copy — it executes. Every
     * `playground-run` line is run here through the same dispatcher the
     * page uses, against the same sample files, and must produce a real
     * answer: a renamed sample or a broken invocation fails in CI, not in
     * front of a first-time visitor.
     */
    const { createPlaygroundFiles, runPlayground } = await import('../lib/playground.ts');
    const KINDS = new Set(['optimise-sample', 'compare-sample', 'bill-sample', 'playground-run']);
    let demos = 0;
    for (const step of TOUR_STEPS) {
      if (step.demo === undefined) continue;
      demos += 1;
      assert.ok(KINDS.has(step.demo.kind), `step "${step.id}" carries unknown demo "${step.demo.kind}"`);
      if (step.demo.kind !== 'playground-run') continue;
      const out = runPlayground(step.demo.line, createPlaygroundFiles(), en, 'en');
      const text = out.lines.join('\n');
      // `position` answers in one honest line; emptiness is the failure.
      assert.ok(out.lines.length >= 1, `"${step.demo.line}" printed nothing`);
      assert.equal(/No such file/.test(text), false, `"${step.demo.line}" hit a missing sample`);
      assert.equal(/CLI-only|only in the CLI/i.test(text), false, `"${step.demo.line}" is CLI-only in the playground`);
    }
    // The walk actually demos: optimise, compare, bill and three terminal runs.
    assert.ok(demos >= 6, `only ${demos} steps carry a demo`);
    // And the finale exists: the CLI use-case step is part of the walk.
    assert.ok(TOUR_STEPS.some((step) => step.id === 'cli'), 'the CLI use-case step is gone');
  });

  it('the demo can only fire from the open tour, and the visitor always wins', () => {
    const tour = codeOf('components/Tour.tsx');
    // Dispatch lives in the Tour's own step effect — closing the tour
    // unmounts the effect and the pending dispatch with it.
    assert.match(tour, /runDemo\(/);
    const components = readdirSync(join(web, 'components'))
      .filter((name) => name.endsWith('.tsx') && name !== 'Tour.tsx')
      .map((name) => codeOf(`components/${name}`))
      .join('\n');
    assert.equal(/runDemo\(/.test(components), false, 'a component other than Tour dispatches demos');
    // The typing hand yields: visitor keystrokes and edits cancel it.
    const playground = codeOf('components/Playground.tsx');
    assert.match(playground, /cancelTypist\(\)/);
    assert.ok(
      playground.indexOf('cancelTypist();') !== playground.lastIndexOf('cancelTypist();'),
      'the typist is cancelled in fewer than two places — keydown and change must both yield',
    );
    // Reduced motion types instantly rather than performing.
    assert.match(playground, /prefers-reduced-motion/);
    // And the bus itself never fetches.
    const demo = codeOf('lib/demo.ts');
    assert.equal(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(demo), false, 'demo.ts touches the network');
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
