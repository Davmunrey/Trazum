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

describe('the Compare tab inverts the sign convention, and says so first', () => {
  /**
   * The one hazard this tab carries.
   *
   * Everywhere else in this application a positive number is money you get back.
   * On Compare every figure is `after - before`, so positive means the edit made
   * things worse — and a reader arriving from the Optimise tab has the opposite
   * expectation already loaded. A caveat placed under the figure is a caveat read
   * after the conclusion.
   */
  it('states the convention above the first number in the source', () => {
    const source = codeOf('components/Comparer.tsx');
    const convention = source.indexOf('t.compare.convention');
    const firstFigure = source.indexOf('t.compare.delta(');

    assert.notEqual(convention, -1, 'the sign convention is not rendered at all');
    assert.notEqual(firstFigure, -1, 'the token delta is not rendered');
    assert.ok(
      convention < firstFigure,
      'the sign convention renders after the figure it applies to',
    );
  });

  it('never renders a delta without a sign', () => {
    // `40 tokens` is unreadable in either direction. The helper forces a `+` on
    // positives; negatives carry their own.
    const source = codeOf('components/Comparer.tsx');
    assert.match(source, /const signed = .*value > 0 \? '\+' : ''/);
    assert.match(source, /formatSignedUsd/, 'money is formatted without an explicit sign');
  });

  it('gives growth the warning colour and shrinkage the good one', () => {
    // The asymmetry is deliberate and worth pinning: growth is what somebody has
    // to act on. Swapping these would congratulate a reader on a regression.
    const source = codeOf('components/Comparer.tsx');
    assert.match(
      source,
      /delta > 0 \? 'text-terracotta' : delta < 0 \? 'text-good'/,
      'the tone of a delta no longer follows its direction',
    );
  });

  it('keeps the tabs holding unsaved work mounted, so a result survives a switch', () => {
    /**
     * Radix unmounts inactive tab content by default, which would discard a
     * comparison somebody is still reading the moment they glanced at Optimise.
     *
     * This used to assert there were exactly two tabs and that both were
     * `forceMount`, which failed the moment a third arrived — on a tab that
     * deliberately is not. The count was standing in for the property. The
     * property is: **a tab holding state the server does not have must stay
     * mounted.** Optimise and Compare hold a result nobody saved; Library holds
     * a list that is already on the server and is better re-read on return.
     */
    const source = codeOf('components/App.tsx');
    const mounts = source.match(/<TabsContent[^>]*>/g) ?? [];
    assert.ok(mounts.length >= 2, 'expected at least the two working tabs');

    const held = ['optimise', 'compare', 'bill'];
    for (const value of held) {
      const tag = mounts.find((m) => m.includes(`value="${value}"`));
      assert.ok(tag, `no TabsContent for ${value}`);
      assert.match(tag, /forceMount/, `TabsContent without forceMount: ${tag}`);
      assert.match(tag, /data-\[state=inactive\]:hidden/, `forceMount without hiding: ${tag}`);
    }

    // And anything that opts out has to be a tab with nothing to lose. Named
    // explicitly rather than inferred, so adding a third working tab and
    // forgetting `forceMount` fails here instead of losing somebody's result.
    const exempt = ['library'];
    for (const tag of mounts) {
      if (/forceMount/.test(tag)) continue;
      const value = /value="([a-z]+)"/.exec(tag)?.[1];
      assert.ok(exempt.includes(value ?? ''), `TabsContent without forceMount: ${tag}`);
    }
  });

  it('owns the usage scenario once for the whole page', () => {
    /**
     * Two tabs with their own copy would price their answers through different
     * workloads while looking like they were about one, which is worse than
     * either being wrong alone.
     *
     * Asserted as the positive property — every field is read from
     * `scenario.usage` and every setter delegates to `scenario.set` — rather
     * than as "there is no local state here". The negative version was written
     * first and a mutant walked straight through it: renaming the local to
     * `callsPerMonth2` satisfied every pattern looking for `const [callsPerMonth,`
     * while the two tabs went back to disagreeing. A test that enumerates ways to
     * be wrong will always be one rename behind.
     *
     * The behaviour itself — set 50,000 calls on Compare, read it on Optimise —
     * cannot be seen from source at all, and was verified by driving the built
     * page in a browser.
     */
    const app = codeOf('components/App.tsx');
    assert.match(app, /const scenario = useScenario\(\)/);
    assert.match(app, /scenario=\{scenario\}[\s\S]{0,400}scenario=\{scenario\}/, 'only one tab is given the scenario');

    const optimizer = codeOf('components/Optimizer.tsx');
    const FIELDS = ['model', 'callsPerMonth', 'avgOutputTokens', 'cacheHitRate', 'batchEligible'];

    // Read from the shared object, in one destructuring.
    const destructured = optimizer.match(/const \{([^}]*)\} = scenario\.usage;/);
    assert.ok(destructured, 'Optimizer does not read the scenario it was handed');
    for (const field of FIELDS) {
      assert.ok(destructured[1].includes(field), `${field} is not read from scenario.usage`);
    }

    // And written back through it, so nothing can be updated locally and lost.
    for (const field of FIELDS) {
      assert.match(
        optimizer,
        new RegExp(`scenario\\.set\\('${field}'`),
        `${field} is not written back through the shared scenario`,
      );
    }
  });

  it('does not keep a second copy of formatUsd', () => {
    // It was byte-identical to the core's for as long as it existed here.
    const optimizer = codeOf('components/Optimizer.tsx');
    assert.equal(
      /function formatUsd/.test(optimizer),
      false,
      'formatUsd is defined here as well as in @trazum/core',
    );
    assert.match(optimizer, /import \{ formatUsd \} from '@trazum\/core'/);
  });
});

describe('the account control does not advertise what the deployment lacks', () => {
  const account = codeOf('components/Account.tsx');

  it('renders nothing at all when sign-in is not configured', () => {
    // Not a disabled button: a disabled button is a promise, and the endpoint
    // behind it answers 503. Most self-hosted deployments are in this case.
    assert.match(account, /if \(!state\?\.enabled\) return null;/);
  });

  it('waits for the answer instead of guessing signed-out', () => {
    // `state` starts null and the same guard covers it, so the first paint
    // shows nothing rather than flashing "Sign in" at somebody who is not.
    assert.match(account, /useState<SessionResponse \| null>\(null\)/);
  });

  it('sends cookies deliberately on every call it makes', () => {
    const fetches = account.match(/fetch\(/g) ?? [];
    const credentialled = account.match(/credentials: 'same-origin'/g) ?? [];
    assert.equal(
      fetches.length,
      credentialled.length,
      'every fetch states its credentials mode',
    );
  });

  it('signs out with POST, which an image tag cannot forge', () => {
    assert.match(account, /'\/api\/auth\/signout', \{ method: 'POST'/);
  });

  it('proposes a destination that is a path, never a whole URL', () => {
    // `window.location.href` here would hand the server an absolute URL and
    // lean on the filter to notice. A path cannot name another origin at all.
    assert.match(account, /window\.location\.pathname \+ window\.location\.search/);
    assert.match(account, /encodeURIComponent/);
    assert.ok(!/next=\$\{window\.location\.href\}/.test(account));
  });

  it('does not leak the current page to whoever serves the avatar', () => {
    assert.match(account, /referrerPolicy="no-referrer"/);
  });

  it('reloads on sign-out rather than clearing state in place', () => {
    // The page holds prompts and results. Dropping the account without
    // dropping those leaves somebody else's work on a signed-out screen.
    assert.match(account, /window\.location\.assign\('\/'\)/);
  });
});

describe('the library tab does not tell the reader something untrue', () => {
  const library = codeOf('components/Library.tsx');
  const app = codeOf('components/App.tsx');

  it('says "no changes to save" instead of "saved" when nothing was written', () => {
    // The API answers `saved: false` for a save that changed nothing. A UI that
    // reports success there is training its reader to distrust it.
    assert.match(library, /saved \? t\.library\.saved : t\.library\.unchanged/);
  });

  it('re-reads the list after every write rather than patching it locally', () => {
    // Patching is faster and is how a version count on screen ends up
    // disagreeing with the server — in the one view whose whole job is being
    // the record.
    const writes = library.match(/method: '(POST|DELETE|PATCH)'/g) ?? [];
    assert.ok(writes.length >= 3, 'expected the create, version and delete calls');
    // All of them go through `mutate`, which is the only place `refresh` is
    // called after a write.
    assert.match(library, /await refresh\(\);/);
    assert.equal((library.match(/async function mutate\(/g) ?? []).length, 1);
  });

  it('sends cookies deliberately on every call', () => {
    const fetches = library.match(/fetch\(/g) ?? [];
    const credentialled = library.match(/credentials: 'same-origin'/g) ?? [];
    assert.equal(fetches.length, credentialled.length);
  });

  it('confirms before destroying a history', () => {
    assert.match(library, /window\.confirm\(t\.library\.confirmDelete/);
  });

  it('compares a version against the one before it, not against the newest', () => {
    // `versions` is newest-first, so the previous version in time is the *next*
    // entry in the list. Off by one here silently inverts every delta.
    assert.match(library, /const previous = open\.versions\[index \+ 1\];/);
  });

  it('shows the tab only to a reader who is signed in', () => {
    // A library nobody can read is worse than an absent tab: it renders an
    // empty list that looks like "you have saved nothing".
    //
    // What is guarded is the gate, not the tag. This first required the trigger
    // to be spelled `<TabsTrigger value="library">` with nothing after it, so
    // giving it a title broke a guard with nothing to say about titles; then it
    // required the attribute on the same line, so wrapping the tag over four
    // lines broke it again. Attributes and whitespace are free. `signedIn &&`
    // sitting immediately in front of the trigger is not.
    const gated = /signedIn && <TabsTrigger\s+value="library"[\s>]/;
    for (const ungated of [
      '<TabsTrigger value="library" onClick={close}>',
      '{hasPrompts && <TabsTrigger value="library">',
      '{signedIn && <TabsTrigger value="bill">}\n<TabsTrigger value="library">',
    ]) {
      assert.ok(!gated.test(ungated), `the gate pattern passed an ungated trigger: ${ungated}`);
    }
    assert.match(app, gated);
    assert.match(app, /\{signedIn && \(/);
  });

  it('owns the prompt at page level so the library saves what is on screen', () => {
    assert.match(app, /const promptText = usePromptText\(locale\);/);
    assert.match(app, /currentPrompt=\{promptText\.value\}/);
    assert.match(app, /promptText=\{promptText\}/);
  });
});

describe('the badge markdown is derived, not assembled twice', () => {
  const control = codeOf('components/ShareControl.tsx');

  it('builds the badge URL from the share URL', () => {
    // Two fields that must agree are two fields that can disagree. The badge
    // and the page are the same capability, so the markdown derives one from
    // the other rather than the API sending both.
    assert.match(control, /share\.url\.replace\('\/c\/', '\/badge\/'\)/);
  });

  it('links the image at the page, so a reader can click through', () => {
    assert.match(control, /\[!\[Trazum\]\(\$\{[^}]+\}\.svg\)\]\(\$\{share\.url\}\)/);
  });
});

describe('styling a shadcn primitive from its parent, which does not work', () => {
  /**
   * The trap this shell hit three times in one pull request.
   *
   * `TabsTrigger` carries declarations behind variant prefixes —
   * `group-data-[orientation=vertical]/tabs:justify-start`,
   * `group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent`,
   * and a `dark:` copy of the second. A `[&_button]:justify-center` written on
   * the `TabsList` is the SAME declaration in the SAME state at lower
   * specificity, so it never applies — and nothing says so. tailwind-merge
   * cleans the class list, the source reads correctly, the build is green, and
   * the computed value is the primitive's. It cost a collapsed rail whose icons
   * sat 12.5px off centre and an active row with no surface at all, in either
   * theme.
   *
   * The state is half the rule, and leaving it out makes the guard cry wolf.
   * `[&_button:hover]:bg-layer-hover` collides with the trigger's `bg` only in
   * a state the trigger does not define, and it is measured winning in both
   * themes — rest `rgba(0,0,0,0)`, hover `rgb(239,238,235)` light and
   * `rgb(43,41,36)` dark. Bare utilities on the trigger are not the problem
   * either: `[&_button]:px-2.5` beats a bare `px-2`, also measured.
   */
  const tabs = codeOf('components/ui/tabs.tsx');

  /** The Tailwind property family a class belongs to, coarsely. */
  const family = (cls) => {
    const bare = cls.split(':').pop() ?? '';
    if (/^justify-/.test(bare)) return 'justify';
    if (/^bg-/.test(bare)) return 'bg';
    if (/^text-[a-z]/.test(bare)) return 'text';
    if (/^border-[a-z]/.test(bare)) return 'border';
    return null;
  };

  /** Which interaction state a class applies in. */
  const state = (cls) => {
    if (/hover/.test(cls)) return 'hover';
    if (/data-\[state=active\]/.test(cls)) return 'active';
    return 'base';
  };

  /** `family@state` pairs the trigger sets behind a variant prefix. */
  const fortified = () => {
    const found = new Set();
    const prefixed = [
      ...(tabs.match(/[A-Za-z0-9[\]&_=:./-]*group-data-\[[^\]]+\][^"'\s]*/g) ?? []),
      ...(tabs.match(/\bdark:[^"'\s]+/g) ?? []),
    ];
    for (const cls of prefixed) {
      const f = family(cls);
      if (f) found.add(`${f}@${state(cls)}`);
    }
    return found;
  };

  /** Parent overrides written on the list, brackets and all. */
  const overrides = (source) =>
    source.match(/\[&_button(?:\[[^\]]*\]|[^\]"'\s])*\]:[^"'\s,]+/g) ?? [];

  /**
   * Does the override land on the trigger itself, or on something inside it?
   *
   * `[&_button[data-state=active]_svg]:text-terracotta` sets a colour on the
   * icon, which nothing in the primitive targets — it is measured painting the
   * active icon terracotta. Only overrides that land on the button compete
   * with the button's own declarations, so only those can lose.
   */
  const targetsDescendant = (cls) => {
    const body = cls.slice(cls.indexOf('&_button') + '&_button'.length, cls.lastIndexOf(']:'));
    return body.includes('_');
  };

  const collides = (cls, guarded) => {
    if (targetsDescendant(cls)) return false;
    const f = family(cls);
    return !!f && guarded.has(`${f}@${state(cls)}`);
  };

  it('knows what the primitive defends, and it is not nothing', () => {
    const guarded = fortified();
    // If this ever empties, the guard below stops guarding and says nothing.
    for (const expected of ['justify@base', 'bg@active', 'text@base']) {
      assert.ok(guarded.has(expected), `${expected} is no longer read out of tabs.tsx`);
    }
  });

  it('finds the overrides even when they carry their own brackets', () => {
    // The first version of this stopped at the inner `]`, so the two worst
    // offenders were invisible to the guard written to catch them.
    const found = overrides("cn('[&_button[data-state=active]]:bg-layer-active', '[&_button]:px-0')");
    assert.deepEqual(found, ['[&_button[data-state=active]]:bg-layer-active', '[&_button]:px-0']);
  });

  it('refuses a parent override of something the trigger defends in that state', () => {
    const guarded = fortified();
    const offenders = overrides(codeOf('components/App.tsx')).filter((c) => collides(c, guarded));
    assert.deepEqual(
      offenders,
      [],
      `these are set on TabsTrigger behind a variant and will not apply from the list:\n  ` +
        `${offenders.join('\n  ')}\n` +
        `Put them on the trigger's own className, in the primitive's variant.`,
    );
  });

  it('and the refusal fires on all three that actually shipped', () => {
    // Prove the guard by breaking it. Each of these was in the source, looked
    // right, passed review, and computed to the primitive's value.
    const guarded = fortified();
    for (const shipped of [
      "'[&_button]:justify-center [&_button]:px-0'",
      "'[&_button[data-state=active]]:bg-layer-active'",
      "'[&_button[data-state=active]]:text-foreground'",
    ]) {
      const hits = overrides(shipped).filter((c) => collides(c, guarded));
      assert.ok(hits.length > 0, `the guard would have let this through: ${shipped}`);
    }
  });

  it('and stays silent on the parent overrides that are measured working', () => {
    const guarded = fortified();
    for (const fine of [
      '[&_button:hover]:bg-layer-hover',
      '[&_button]:px-2.5',
      '[&_button]:py-2',
      '[&_button]:rounded-md',
      '[&_button]:gap-2.5',
      '[&_button]:after:hidden',
      // Lands on the icon, not the button, and is measured painting it.
      '[&_button[data-state=active]_svg]:text-terracotta',
    ]) {
      assert.ok(!collides(fine, guarded), `the guard would refuse a working override: ${fine}`);
    }
  });
});

describe('a focus indicator that computes to nothing', () => {
  /**
   * `outline-none` sets `outline-style: none`, and `outline-2` only sets a
   * width. Written together on one element the pair computes to
   * `outline: none 0px` and paints nothing — measured under real keyboard
   * focus on the account trigger, which for one build was the only control in
   * the rail with no indicator at all while wearing the classes meant to give
   * it one.
   *
   * A ring is a box-shadow and survives the same combination, which is how the
   * language toggles kept theirs.
   */
  const files = ['components/App.tsx', 'components/Account.tsx'];

  const deadOutline = (source) => {
    const kills = /\boutline-(none|hidden)\b/.test(source);
    const outlineRing = /focus-visible:outline-\d/.test(source);
    const boxShadowRing = /focus-visible:ring-\d/.test(source);
    return kills && outlineRing && !boxShadowRing;
  };

  it('fires on the combination that shipped', () => {
    assert.ok(
      deadOutline("'outline-none focus-visible:outline-2 focus-visible:outline-offset-2'"),
      'the guard does not catch the pair it exists for',
    );
  });

  it('does not fire on a ring, which works', () => {
    assert.ok(
      !deadOutline("'outline-none focus-visible:ring-2 focus-visible:ring-ring'"),
      'the guard refuses the working replacement',
    );
  });

  it('does not fire on an outline with nothing cancelling it', () => {
    assert.ok(!deadOutline("'focus-visible:outline-2 focus-visible:outline-ring'"));
  });

  for (const file of files) {
    it(`${file} does not cancel the outline it then asks for`, () => {
      assert.ok(!deadOutline(codeOf(file)), `${file} sets outline-none and then only an outline width`);
    });
  }
});

describe('a desktop preference must not reach a phone drawer', () => {
  /**
   * `collapsed` is a choice made on a laptop. Applied to the drawer as well, it
   * produced a 248px overlay containing a 60px rail — no wordmark, every tab
   * label `sr-only`, and no expand control, because the only one is `lg:flex`.
   * An icon column with no labels and nothing on the device that can undo it.
   *
   * `railCollapsed` is the width for THIS rendering; `collapsed` is the stored
   * preference. Inside the rail only the first is a legitimate thing to read.
   */
  const app = codeOf('components/App.tsx');
  const railBlock = (source) => {
    const from = source.indexOf('const rail = (');
    const to = source.indexOf('return (', from);
    assert.ok(from > 0 && to > from, 'the rail block has moved — this guard is reading nothing');
    return source.slice(from, to);
  };
  /**
   * `collapsed` READ on its own — not as part of `railCollapsed`, and not the
   * name of a prop. `<Account collapsed={railCollapsed} />` is the child's own
   * vocabulary and is correct; `collapsed={collapsed}` is the bug and is still
   * caught, because the value is not followed by an `=`.
   */
  const bare = (block) => block.match(/(?<![A-Za-z])collapsed\b(?!\s*=)/g) ?? [];

  it('fires on the version that shipped', () => {
    assert.ok(
      bare("const rail = (\n<div className={cn(collapsed && 'x')} />\nreturn (").length > 0,
      'the guard does not catch a bare preference inside the rail',
    );
  });

  it('does not fire on the rendering width, nor on a child prop named for it', () => {
    assert.equal(bare("{railCollapsed && 'x'}").length, 0);
    assert.equal(bare('<Account collapsed={railCollapsed} />').length, 0);
  });

  it('still fires when the preference is handed straight to a child', () => {
    assert.equal(bare('<Account collapsed={collapsed} />').length, 1);
  });

  it('the rail reads the rendering width, never the stored preference', () => {
    assert.deepEqual(
      bare(railBlock(app)),
      [],
      'the rail reads `collapsed` directly — a drawer would inherit a desktop choice',
    );
  });

  it('and the drawer closes itself when the window becomes a desktop', () => {
    // Otherwise the scrim survives the resize with `overflow: hidden` on the
    // body and no visible control to lift either, both measured.
    assert.match(app, /matchMedia\('\(min-width: 1024px\)'\)/);
    assert.match(app, /setDrawerOpen\(false\)/);
  });
});
