import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/**
 * Two defects shipped to this app that every other guard in the repository
 * was blind to, and they were blind to it for the same reason.
 *
 * The suite verifies prose and arithmetic exhaustively: what a sentence
 * claims, what a number is derived from, which locale says it. Nothing
 * verified what the reader could see or press. So the landing rendered five
 * of its six sections at zero opacity for two days (a `Reveal` wrapper whose
 * IntersectionObserver never fired below the fold), and the Write panel
 * opened with two buttons that both read "Skip this" for four days (a
 * ternary label whose falsy branch was its neighbour's label). Both were
 * user-visible on first paint. Both passed CI.
 *
 * Neither needed a browser to catch. Both have a shape that is a property of
 * the source text, and this file reads for those two shapes.
 *
 * ## What this does not cover
 *
 * This is not a rendering test and does not pretend to be one. It catches two
 * specific, recurring mistakes — copy hidden until client code reveals it, and
 * two controls in one component that can read identically — and says nothing
 * about layout, contrast, or anything that genuinely needs pixels. The value
 * is that these two shapes have now each cost a shipped defect, and they can
 * be refused statically.
 */

const SOURCES = ['app', 'components', 'lib'];

/** Every `.tsx` under the app, as `{ path, code }` with comments stripped. */
function surfaces() {
  const found = [];
  const walk = (absolute) => {
    for (const entry of readdirSync(absolute)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const child = join(absolute, entry);
      if (statSync(child).isDirectory()) {
        walk(child);
        continue;
      }
      if (!entry.endsWith('.tsx')) continue;
      const raw = readFileSync(child, 'utf8');
      found.push({
        path: relative(web, child),
        raw,
        code: raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''),
      });
    }
  };
  for (const root of SOURCES) walk(join(web, root));
  return found;
}

describe('what the app renders, the reader can actually see and tell apart', () => {
  const files = surfaces();

  it('finds the surfaces it claims to read', () => {
    assert.ok(files.length >= 20, `only ${files.length} tsx files walked`);
    assert.ok(
      files.some((file) => file.path === 'app/landing/page.tsx'),
      'the landing is not in the walk',
    );
    assert.ok(
      files.some((file) => file.path === 'components/Writer.tsx'),
      'the Write panel is not in the walk',
    );
  });

  /**
   * The first shape: copy that starts invisible and is revealed by client
   * state.
   *
   * `opacity-0` in a class list is not itself wrong — a hover affordance or a
   * decorative layer may well start at zero. It is wrong when the thing that
   * turns it on is a React state value, because that state starts falsy, the
   * server renders the falsy branch, and everything inside is invisible to a
   * reader whose observer, timer or hydration never arrives. That is exactly
   * how the landing shipped blank.
   */
  it('never hides content behind client state that starts falsy', () => {
    /* `... ? 'opacity-100' : 'opacity-0'` and every spelling around it. */
    const gated = /opacity-0\b[^`'"]*['"`]\s*\}|\?[^?]{0,120}opacity-0/;
    for (const { path, code } of files) {
      for (const line of code.split('\n')) {
        if (!line.includes('opacity-0')) continue;
        if (!gated.test(line)) continue;
        assert.fail(
          `${path} reveals content with a conditional opacity: ${line.trim()}\n`
            + 'Content that a reader must see is rendered visible; motion adds to it, '
            + 'never gates it.',
        );
      }
    }
  });

  /**
   * The same promise, one layer down: an animation that *starts* at zero
   * opacity is a reveal, and a reveal driven by anything other than time can
   * fail to start.
   *
   * The second attempt at fixing the blank landing replaced the observer with
   * `animation-timeline: view()`. It was still blank, because a scroll-driven
   * timeline has no progress when nothing scrolls, and `fill-mode` then pins
   * the element on its `from` keyframe forever. A screenshot of the whole page
   * shows the failure; CI did not.
   */
  it('never starts an animation from invisible on a timeline that may not advance', () => {
    /* Comments stripped: this reads what the stylesheet does, not what it says. */
    const css = readFileSync(join(web, 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const zeroStart = new Set();
    for (const block of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      const [, name, body] = block;
      const from = body.match(/(?:from|0%)\s*\{([^}]*)\}/);
      if (from && /opacity:\s*0\s*[;}]/.test(from[1])) zeroStart.add(name);
    }
    for (const use of css.matchAll(/animation-timeline:\s*([^;]+);/g)) {
      assert.fail(
        `globals.css drives an animation with \`animation-timeline: ${use[1].trim()}\`. `
          + 'A timeline that is not time can sit at zero progress forever; if the animation '
          + 'starts from invisible, so does the content. Reveal on time, or do not reveal.',
      );
    }
    assert.ok(
      zeroStart.size >= 0,
      'unreachable — keeps the parsed set meaningful if the loop above is ever relaxed',
    );
  });

  /**
   * The second shape: two controls in one component that can read the same.
   *
   * The Write panel's primary button was labelled
   * `typed.trim().length > 0 ? t.write.tab : t.write.decline`, and the ghost
   * button beside it was labelled `t.write.decline`. With the textarea empty —
   * which is how the panel opens — both read "Skip this", one of them did the
   * opposite of what it said, and no locale escaped it because the collision
   * is in the structure, not the translation.
   *
   * So: gather every label a button in a file can resolve to, and refuse any
   * label two different buttons share.
   */
  it('never gives two buttons in one component the same label', () => {
    for (const { path, code } of files) {
      const buttons = buttonLabels(code);
      for (let a = 0; a < buttons.length; a += 1) {
        for (let b = a + 1; b < buttons.length; b += 1) {
          for (const one of buttons[a].labels) {
            for (const other of buttons[b].labels) {
              if (one.label !== other.label) continue;
              if (!simultaneous(one, other)) continue;
              assert.fail(
                `${path} has two buttons that both read \`${one.label}\` at once `
                  + `(character ${buttons[a].at} and character ${buttons[b].at}). `
                  + 'A reader cannot choose between two controls with one name.',
              );
            }
          }
        }
      }
    }
  });
});

/**
 * Whether two identical labels can be on screen at the same time.
 *
 * This is the line between the defect and a false alarm, and it is drawn
 * deliberately short of what a browser would know.
 *
 * An unconditional label is always showing, so anything that collides with it
 * collides for real: that is the Write panel's ghost button reading
 * `t.write.decline` beside a primary button whose falsy branch was the same
 * key — the state the panel opens in.
 *
 * Two *conditional* labels are a different case. `copied === url ? copied :
 * copy` next to `copied === badge ? copied : badge` collides on paper and
 * never on screen, because one variable cannot equal two things. Proving that
 * in general means evaluating the conditions, which this file will not
 * pretend to do — so it claims a collision between two conditional labels only
 * when the conditions are written identically and the label sits on the same
 * branch of each, which is the one case where being on screen together follows
 * from the text alone.
 */
function simultaneous(one, other) {
  if (one.when === null || other.when === null) return true;
  return one.when === other.when;
}

/**
 * Every `<Button>` in a file with the labels it can resolve to, and the
 * condition each label is under.
 *
 * Brace-aware rather than regex-shaped, because a button's open tag routinely
 * contains `onClick={() => …}` and an arrow's `>` would end the tag early.
 * Nested elements are stripped before labels are read: a button often wraps an
 * icon, and that icon's `className` is a quoted string sitting in the
 * children — read naively it becomes a label, and two buttons carrying the
 * same icon look like two buttons carrying the same name.
 */
function buttonLabels(code) {
  const found = [];
  for (const open of code.matchAll(/<Button\b/g)) {
    const at = open.index;
    let index = at + '<Button'.length;
    let depth = 0;
    let selfClosing = false;
    for (; index < code.length; index += 1) {
      const character = code[index];
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      else if (character === '>' && depth === 0) {
        selfClosing = code[index - 1] === '/';
        break;
      }
    }
    if (selfClosing) continue;
    const close = code.indexOf('</Button>', index);
    if (close === -1) continue;
    const children = code.slice(index + 1, close).replace(/<[^>]*>/g, ' ').trim();
    const inner = children.startsWith('{') && children.endsWith('}')
      ? children.slice(1, -1).trim()
      : children;
    const ternary = splitTernary(inner);
    const labelled = ternary === null
      ? namesIn(inner).map((label) => ({ label, when: null }))
      : [
          ...namesIn(ternary.consequent).map((label) => ({ label, when: `${ternary.condition}?` })),
          ...namesIn(ternary.alternate).map((label) => ({ label, when: `${ternary.condition}:` })),
        ];
    if (labelled.length > 0) found.push({ labels: labelled, at });
  }
  return found;
}

/** The label-shaped names in one expression: catalogue paths, or literal text. */
function namesIn(expression) {
  const names = new Set();
  for (const path of expression.matchAll(/\bt(?:\.[A-Za-z_$][\w$]*)+/g)) names.add(path[0]);
  for (const literal of expression.matchAll(/'([^'\n]{2,})'|"([^"\n]{2,})"/g)) {
    names.add(literal[1] ?? literal[2]);
  }
  if (names.size > 0) return [...names];
  const text = expression.replace(/\{[\s\S]*?\}/g, ' ').trim();
  return text.length > 0 ? [text] : [];
}

/**
 * `cond ? a : b` split at nesting depth zero, or `null` if the expression is
 * not a conditional. `?.` and `??` are not the operator being looked for.
 */
function splitTernary(expression) {
  let depth = 0;
  let question = -1;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) depth -= 1;
    else if (character === '?' && depth === 0) {
      if (expression[index + 1] === '.' || expression[index + 1] === '?') {
        index += 1;
        continue;
      }
      question = index;
      break;
    }
  }
  if (question === -1) return null;
  depth = 0;
  for (let index = question + 1; index < expression.length; index += 1) {
    const character = expression[index];
    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) depth -= 1;
    else if (character === '?' && depth === 0) return null;
    else if (character === ':' && depth === 0) {
      return {
        condition: expression.slice(0, question).trim(),
        consequent: expression.slice(question + 1, index).trim(),
        alternate: expression.slice(index + 1).trim(),
      };
    }
  }
  return null;
}
