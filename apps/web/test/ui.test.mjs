import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/**
 * The first tests this application has had.
 *
 * They exist because the shadcn/react-bits rework shipped two bugs that
 * compiled cleanly, typechecked cleanly, and were only visible in a browser:
 * a results card that rendered at zero opacity, and two header buttons that
 * fell onto their own row. Neither was a logic error, so nothing in the
 * existing suites could have seen them.
 *
 * These are source assertions rather than a rendering harness. A real one
 * would want jsdom or Playwright in CI, which is a bigger change than this
 * repository should absorb in a UI pull request. What they cover is the class
 * of mistake that actually happened: a component whose default hides content,
 * and a layout override that silently does nothing.
 */

const read = (relative) => readFileSync(join(web, relative), 'utf8');

/** Source with comments stripped, because both bugs are described in prose. */
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

describe('content is never gated on scrolling into view', () => {
  /**
   * The bug, exactly.
   *
   * `AnimatedContent` waited for an `IntersectionObserver` before revealing its
   * children. That is right for a landing page and wrong for a result: the
   * reader had scrolled down to reach the Optimise button, so the summary card
   * mounted above the viewport, the observer reported "not intersecting", and a
   * 214px card sat at zero opacity showing nothing. It compiled, it typechecked,
   * and it was wrong.
   */
  it('AnimatedContent animates on mount unless asked otherwise', () => {
    const source = codeOf('components/motion/AnimatedContent.tsx');
    assert.match(
      source,
      /onView\s*=\s*false/,
      'AnimatedContent waits for an observer by default — content that arrives ' +
        'off-screen will render invisible',
    );
  });

  it('and shows itself when there is no observer to wait for', () => {
    // A browser without IntersectionObserver, a crawler, a snapshot test: the
    // failure mode of getting this wrong is a blank page, so it fails open.
    const source = codeOf('components/motion/AnimatedContent.tsx');
    assert.match(source, /typeof IntersectionObserver === 'undefined'/);
    assert.match(source, /!onView \|\|/, 'the two escape hatches are not on the same branch');
  });

  it('nothing in the app opts into the observer without saying why', () => {
    // Not a ban — `onView` is the right call for content below the fold. But
    // every use of it is a decision to leave something invisible until it is
    // scrolled to, and this makes that decision visible in review rather than
    // discovered in a screenshot.
    const uses = [];
    const walk = (dir, prefix = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path, `${prefix}${entry.name}/`);
          continue;
        }
        if (!entry.name.endsWith('.tsx')) continue;
        if (`${prefix}${entry.name}` === 'components/motion/AnimatedContent.tsx') continue;
        const source = readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^[ \t]*\/\/.*$/gm, '');
        if (/\bonView\b/.test(source)) uses.push(`${prefix}${entry.name}`);
      }
    };
    walk(join(web, 'components'), 'components/');
    walk(join(web, 'app'), 'app/');

    assert.deepEqual(
      uses,
      [],
      `onView is used in ${uses.join(', ')} — check the content there is below the fold`,
    );
  });
});

describe('layout overrides that shadcn would silently ignore', () => {
  /**
   * The second bug. `CardHeader` is a CSS grid, so `flex-row justify-between`
   * merges in and does nothing: `grid` and `flex-row` belong to different
   * Tailwind groups, so tailwind-merge keeps both and the display stays grid.
   * Copy and Clear each landed on their own row, and the class list read as if
   * it should have worked.
   *
   * shadcn's answer is the `CardAction` slot, which `CardHeader` has a
   * `has-data-[slot=card-action]` rule for.
   */
  it('CardHeader is not handed flex utilities that a grid ignores', () => {
    const source = codeOf('components/Optimizer.tsx');
    const headers = source.match(/<CardHeader[^>]*>/g) ?? [];
    assert.ok(headers.length > 0, 'no CardHeader found — has the markup moved?');

    const wrong = headers.filter((tag) => /\bflex-(row|col)\b|\bjustify-between\b/.test(tag));
    assert.deepEqual(
      wrong,
      [],
      `CardHeader is a grid; these flex utilities do nothing:\n  ${wrong.join('\n  ')}\n` +
        'Put the trailing control in <CardAction> instead.',
    );
  });

  it('and the header controls use the slot that does work', () => {
    const source = codeOf('components/Optimizer.tsx');
    assert.match(source, /<CardAction>/, 'no CardAction — the header buttons will stack');
  });
});

describe('the palette stays Trazum, not shadcn defaults', () => {
  it('every shadcn token derives from a named Trazum colour', () => {
    // The point of the whole theming exercise. If somebody later pastes a
    // shadcn theme block over this, the identity goes with it, and the diff
    // looks like a routine token update.
    const css = read('app/globals.css');
    for (const [token, source] of [
      ['--primary', '--terracotta'],
      ['--background', '--paper'],
      ['--foreground', '--ink'],
      ['--muted-foreground', '--ink-soft'],
      ['--ring', '--terracotta'],
    ]) {
      assert.match(
        css,
        new RegExp(`${token}:\\s*var\\(${source}\\)`),
        `${token} no longer derives from ${source} — the palette has been replaced`,
      );
    }
  });

  it('reduced motion is honoured for everything, not per component', () => {
    // Every animation added here is decoration. Somebody who asked their
    // operating system to stop animating things should not have to trust that
    // each new component remembered.
    const css = read('app/globals.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /animation-duration: 0\.01ms !important/);
  });
});

describe('CountUp does not lie about the number', () => {
  it('lands on the exact value rather than the curve final sample', () => {
    // It is used on money. Interpolating and rounding every frame can finish a
    // hair short, and "$3.84 / month" for a $3.85 saving is a wrong number in
    // the one place this product exists to get right.
    const source = codeOf('components/motion/CountUp.tsx');
    assert.match(source, /elapsed >= span[\s\S]{0,120}setValue\(to\)/);
  });

  it('renders the final value for screen readers, not the animation', () => {
    const source = codeOf('components/motion/CountUp.tsx');
    assert.match(source, /aria-hidden="true"/);
    assert.match(source, /className="sr-only">\{format\(to\)\}/);
  });

  it('server-renders the answer, not zero', () => {
    // The initial state is `to`. Starting at `from` would ship HTML claiming
    // the saving is nothing, which is what anyone with slow or blocked
    // JavaScript would be left reading.
    const source = codeOf('components/motion/CountUp.tsx');
    assert.match(source, /useState\(to\)/, 'CountUp server-renders its starting value');
  });
});

describe('the browser cannot build a request the API refuses', () => {
  /**
   * `applySuggestions` without `suggest` is a `400` — it would otherwise return a
   * full report and silently apply nothing, which is how the defect was found in
   * the first place. The panel keeps the two switches in step by clearing the
   * second when the first goes off, and that is worth having: the visible state
   * should be the real state.
   *
   * It is not what makes the request correct, though. A handler is one edit away
   * from losing a line, and the failure would be a `400` in production for a
   * combination the user never chose. The request derives the value instead, so
   * the invariant does not depend on remembering.
   */
  it('applySuggestions is derived from suggest, not sent independently', () => {
    const source = codeOf('components/Optimizer.tsx');
    assert.match(
      source,
      /applySuggestions:\s*suggest\s*&&\s*applySuggestions/,
      'the request passes applySuggestions straight through — with suggest off the ' +
        'API will refuse it',
    );
  });

  it('and the switch still clears itself, so the panel is not lying', () => {
    const source = codeOf('components/Optimizer.tsx');
    assert.match(source, /if \(!next\) setApplySuggestions\(false\)/);
  });
});
