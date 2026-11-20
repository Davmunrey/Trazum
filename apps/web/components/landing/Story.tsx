'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

import { DESK_COMMANDS, DESK_COMMAND_NAMES, type DeskCommand, ILLUSTRATIVE_BILL, type LandingCopy, MORE_LINKS } from '../../lib/landing-copy';
import {
  type BlockOwner,
  RECEIPT,
  TERMINAL,
  TERMINAL_COLUMNS,
  TERMINAL_NARROW,
  TERMINAL_NARROW_COLUMNS,
  type TerminalBlock,
  type TerminalRun,
  UNPRICED,
} from '../../lib/landing-terminal';
import { COMMAND } from '../../lib/site';
import type { SiteCopy } from '../../lib/site-copy';
import { NARROW_PREFIX, coverOf, motionOf } from '../../lib/story-motion';
import { CHAPTERS, type ChapterId, LEAD, type ObjectId, type ScreenId, STORY_HEIGHT } from '../../lib/story-timeline';
import { CommandLine } from '../site/CommandLine';
import { GitHubButton } from '../site/GitHub';
import { DashboardAction } from '../site/SiteHeader';

/**
 * The landing's story: one laptop on a desk, pinned while the chapters scroll
 * past, and around it one object per thing Trazum does.
 *
 * There is one laptop on the page, and this is it. The stage stays pinned
 * from the desk's arrival to the end of the story while the chapters' words
 * scroll past beside it (under it, on a phone), and each chapter changes the
 * stage: the desk arrives; `bill` prints and the receipt comes out of the
 * laptop's side; each object takes its turn, lifted and pressed, its command's
 * output on the same screen; the receipt comes forward with each rate's page
 * and date; a model with no published price is named and kept out of the
 * total; what never leaves the machine goes on the screen and the lid closes
 * over it. The chapters and their order are `lib/story-timeline.ts`.
 *
 * ## How scroll drives it
 *
 * Each element that moves with the scroll (`data-mv`) names its own keyframes,
 * which `lib/story-motion.ts` writes from the timeline and this component puts
 * in a `<style>`: `transform`, `opacity` and `clip-path`, over the whole story.
 * Where the browser has scroll-driven animations, the stylesheet runs them on
 * the section's view timeline and no script runs while the visitor scrolls.
 * Where it has not, `useStoryProgress` holds them paused and sets each one's
 * current time to the scroll position: one read and a batch of writes per
 * animation frame, from a passive listener attached only while the section is
 * on screen. Either way the scroll is the only clock, so scrolling back walks
 * the story back.
 *
 * Which chapter is current is read by an `IntersectionObserver` on the
 * chapters' slots, against the same line the timeline uses. It moves nothing:
 * it says which object is pressed (`aria-pressed`), and it is what a reader
 * who asked for less motion sees change, each chapter's last state at once
 * (`data-on`, `data-chapter`).
 *
 * ## What a press does
 *
 * The objects are buttons at every point of the story and after it. A press
 * puts that command's output on the screen and lifts the object, over
 * whatever the scroll had there (`data-pressed`, whose rules are `!important`
 * and so outrank the scroll's keyframes without stopping them); what it sets
 * off may run on a clock, briefly: the output appears a line at a time, the
 * lid swings. The scroll keeps its place underneath, and when the visitor
 * scrolls into the next chapter the press is let go and the story takes over
 * again. A press or focus inside the story also completes the arrival, so a
 * control is never reached half-arrived.
 *
 * ## What it is without JavaScript
 *
 * The layout's bootstrap marks the page `data-desk` before the first paint
 * whenever a script runs, and `data-motion="scroll"` unless the reader asked
 * for reduced motion. Without the first, none of the stage's rules apply: every
 * output on the screen one after another, what never leaves, the receipt with
 * each rate's page, then every chapter's words, in reading order. The
 * objects, which would do nothing, are not drawn.
 *
 * ## What is on the screen
 *
 * `lib/landing-terminal.ts`, written by `scripts/draw-landing-terminal.mjs`
 * from what the built CLI prints, and the receipt from the receipt it writes.
 * Each output is there twice, as a pipe gets it and as a 60-column window
 * does (`TERMINAL_NARROW`); the stylesheet shows the narrow one on a screen
 * too narrow for 80 columns at a size that can be read, and the other one is
 * not displayed, so it is neither drawn nor read out.
 * The text is in the DOM once and does not change as it "types": a clip or an
 * opacity shows it, so it can be selected, and a screen reader reads each line
 * once.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** The keyframes, written once per page load from the timeline and the transcript, and the stretch each runs over. */
const MOTION = motionOf(TERMINAL, RECEIPT.lines.length, TERMINAL_NARROW);

/**
 * An element's own keyframes, by name, and the stretch of the story they run
 * over: as the section's `cover` range for its scroll timeline (`--mv-c0`,
 * `--mv-c1`, in percent) and as a fraction of the story for the fallback
 * script, which sets every animation's time to the story's position in
 * seconds (`--mv-a`, `--mv-b`). The stylesheet reads them; none changes.
 */
const moves = (name: string): Vars => {
  const span = MOTION.spans.get(name);
  if (span === undefined) throw new Error(`no keyframes ${name}`);
  const [a, b] = span;
  const v = (x: number) => Number(x.toFixed(5));
  return { animationName: name, '--mv-c0': v(coverOf(a)), '--mv-c1': v(coverOf(b)), '--mv-a': v(a), '--mv-b': v(b) };
};

/** Every owner of output on the screen, in the order the story shows them: the objects' commands, then the example. */
const OWNERS: readonly BlockOwner[] = [...DESK_COMMANDS, 'unpriced'];
/** A transcript's blocks grouped by the owner whose output they are, in `OWNERS` order. */
const blocksOf = (source: readonly TerminalBlock[]) =>
  Object.fromEntries(OWNERS.map((id) => [id, source.filter((block) => block.cap === id)])) as Record<BlockOwner, TerminalBlock[]>;
const BLOCKS_OF = blocksOf(TERMINAL);
const NARROW_OF = blocksOf(TERMINAL_NARROW);

/** The longest a press's output takes to appear, a line at a time, and the most each line waits. */
const TYPE_MS = 700;
const LINE_MS = 22;

/** A chapter's own entry in the timeline. */
const chapterOf = (id: ChapterId) => CHAPTERS.find((chapter) => chapter.id === id) ?? CHAPTERS[0];

/**
 * The story's position, as each moving element's paused animation, where the
 * browser cannot drive it from CSS. The same line as the stylesheet's
 * `animation-range: entry 50% contain 100%`: 0 when the section's top is
 * `LEAD` svh below the top of the window, 1 when its foot reaches the window's.
 */
function useStoryProgress(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (element === null || root.dataset.motion !== 'scroll') return;
    if (typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()')) return;
    root.dataset.story = 'script';
    // The animations of the elements that move, found once: each is a second
    // long and paused, and the story's position is its current time.
    // A screen that changes width can swap the wide transcript for the narrow one, whose animations only exist once
    // it is displayed: so they are found again on a resize.
    const collect = () => [...element.querySelectorAll<HTMLElement>('[data-mv]')].flatMap((target) => target.getAnimations());
    let animations = collect();
    let frame = 0;
    let listening = false;
    const write = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const lead = (window.innerHeight * LEAD) / 100;
      const span = box.height - window.innerHeight + lead;
      const time = (span > 0 ? Math.min(1, Math.max(0, (lead - box.top) / span)) : 0) * 1000;
      for (const animation of animations) animation.currentTime = time;
    };
    const request = () => {
      if (frame === 0) frame = requestAnimationFrame(write);
    };
    const resized = () => {
      animations = collect();
      request();
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      const method = on ? 'addEventListener' : 'removeEventListener';
      window[method]('scroll', request, { passive: true } as AddEventListenerOptions);
      window[method]('resize', resized, { passive: true } as AddEventListenerOptions);
    };
    // On screen from half a window before the section, so the arrival starts as the hero scrolls out.
    const observer = new IntersectionObserver(
      ([entry]) => {
        listen(entry?.isIntersecting ?? false);
        // One last write on the way out, so the story rests at its start or its end.
        request();
      },
      { rootMargin: '50% 0px 0px 0px' },
    );
    observer.observe(element);
    write();
    return () => {
      observer.disconnect();
      listen(false);
      if (frame !== 0) cancelAnimationFrame(frame);
      delete root.dataset.story;
    };
  }, [ref]);
}

/**
 * Which chapter is current, and whether the stage is pinned at all: a slot is
 * current while its top is above the middle of the window and the next one's
 * is not, the line the timeline uses. Read by an observer of the slots,
 * never by a scroll listener.
 */
function useChapter(ref: React.RefObject<HTMLElement | null>): { chapter: ChapterId; staged: boolean } {
  const [chapter, setChapter] = useState<ChapterId>('arrival');
  const [staged, setStaged] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null || document.documentElement.dataset.desk === undefined) return;
    const tall = window.matchMedia('(min-height: 560px)');
    const update = () => setStaged(tall.matches);
    update();
    tall.addEventListener('change', update);
    const crossing = new Set<ChapterId>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.ch as ChapterId;
          if (entry.isIntersecting) crossing.add(id);
          else crossing.delete(id);
        }
        const current = CHAPTERS.filter((candidate) => crossing.has(candidate.id)).at(-1);
        if (current !== undefined) setChapter(current.id);
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const slot of element.querySelectorAll('[data-ch]')) observer.observe(slot);
    return () => {
      observer.disconnect();
      tall.removeEventListener('change', update);
    };
  }, [ref]);
  return { chapter, staged };
}

/** The classes for a run's style letters, one `t-<letter>` each (bold, dim, a hue, the acid mark). */
function runClass(style: string): string {
  return [...style].map((letter) => `t-${letter}`).join(' ');
}

/** Whether a line ends in a rule of box-drawing dashes, which may be cut at the screen's edge. */
const isRuled = (runs: readonly TerminalRun[]) => runs.length > 0 && /^─+$/.test(runs.at(-1)?.[0] ?? '');

/** One line of a transcript as styled runs; a share bar's blocks are filled by the story under the name `bar`. */
function Runs({ runs, bar }: { runs: readonly TerminalRun[]; bar: string }) {
  return (
    <>
      {runs.map(([text, style], index) =>
        style.includes('a') && /^█+$/.test(text) ? (
          // The share bar: the same characters, filled by the story.
          // biome-ignore lint/suspicious/noArrayIndexKey: the transcript is a constant written by a script: its runs and lines never move, and an empty line or a repeated run has no identity of its own but its place
          <span key={index} className={`t-bar ${runClass(style)}`} data-mv="" style={moves(bar)}>
            {text}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the transcript is a constant written by a script: its runs and lines never move, and an empty line or a repeated run has no identity of its own but its place
          <span key={index} className={style === '' ? undefined : runClass(style)}>
            {text}
          </span>
        ),
      )}
    </>
  );
}

/**
 * One owner's output: each command it runs, its prompt, and the lines it
 * printed. Its first command is typed; the rest prints a line at a time.
 * `narrow` is the same commands as a 60-column window shows them.
 */
function Transcript({ owner, narrow = false }: { owner: BlockOwner; narrow?: boolean }) {
  const blocks = (narrow ? NARROW_OF : BLOCKS_OF)[owner];
  const prefix = narrow ? NARROW_PREFIX : '';
  const count = blocks.reduce((sum, block) => sum + block.command.split('\n').length + block.lines.length, 0);
  const style: Vars = {
    '--step': `${Math.min(LINE_MS, TYPE_MS / Math.max(1, count))}ms`,
    ...(narrow ? { '--cols': TERMINAL_NARROW_COLUMNS } : {}),
    ...moves(`st-print-${prefix}${owner}`),
  };
  let at = 0;
  return (
    <pre className={narrow ? 'term term-narrow' : 'term'} data-mv="" style={style}>
      {blocks.map((block, b) => [
        ...block.command.split('\n').map((line, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a command's lines are a constant written by a script: they never move, and a line has no identity of its own but its place
          <span /* skipcq: JS-0437 */ key={`${block.id}-command-${j}`} className="tl tl-command" style={{ '--i': at++ } as Vars}>
            {j === 0 && (
              <span aria-hidden="true" className="t-prompt">
                ${' '}
              </span>
            )}
            {b === 0 && j === 0 ? (
              <>
                <span className="t-typed" data-mv="" style={moves(`st-type-${owner}`)}>
                  {line}
                </span>
                <span aria-hidden="true" className="t-cursor" data-mv="" style={moves(`st-cursor-${owner}`)} />
              </>
            ) : (
              <span className="t-typed">{line}</span>
            )}
          </span>
        )),
        ...block.lines.map((runs, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the transcript is a constant written by a script: its runs and lines never move, and an empty line or a repeated run has no identity of its own but its place
          <span /* skipcq: JS-0437 */ key={`${block.id}-${j}`} className={isRuled(runs) ? 'tl tl-rule' : 'tl'} style={{ '--i': at++ } as Vars}>
            <Runs runs={runs} bar={`st-bar-${prefix}${block.id}-${j}`} />
          </span>
        )),
      ])}
    </pre>
  );
}

/** The keyboard deck, drawn on a 100 by 68 grid: well, keys, trackpad, the hinge and the lip. */
function Deck() {
  const keys: React.ReactElement[] = [];
  for (let row = 0; row < 5; row += 1) {
    const y = 8.4 + row * 6.2;
    for (let col = 0; col < 14; col += 1) {
      // The bottom row's middle keys are one space bar.
      if (row === 4 && col > 4 && col < 10) {
        if (col === 5) keys.push(<rect key={`${row}-${col}`} x={9.6 + col * 5.9} y={y} width={5.9 * 5 - 0.9} height={5.2} />);
        continue;
      }
      keys.push(<rect key={`${row}-${col}`} x={9.6 + col * 5.9} y={y} width={5} height={5.2} />);
    }
  }
  return (
    <svg className="lt-deck-art" viewBox="0 0 100 68" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100" height="68" fill="#eeeee0" />
      <rect x="7.6" y="6.4" width="84.8" height="33.2" fill="#e6e8d5" stroke="#999f8a" strokeWidth="0.35" />
      <g fill="#fbf9f1" stroke="#999f8a" strokeWidth="0.3">
        {keys}
      </g>
      <rect x="33" y="43.5" width="34" height="19" fill="#fbf9f1" stroke="#20231e" strokeWidth="0.5" />
      <rect x="0" y="0" width="100" height="2.6" fill="#20231e" />
      <rect x="43" y="65.4" width="14" height="2.6" fill="#999f8a" />
    </svg>
  );
}

/** The one laptop: its screen holds every output the story shows and what never leaves, each shown by the scroll or a press. */
function Laptop({ t, screen, pressed, run, mounted }: { t: LandingCopy; screen: ScreenId; pressed: boolean; run: number; mounted: boolean }) {
  // Once the page runs, only what the screen shows is read out; before that (and without a script) all of it is.
  const off = (on: boolean) => (mounted && !on ? { 'aria-hidden': true as const } : {});
  return (
    <div className="lt-device">
      <div className="lt-deck">
        <Deck />
        <div aria-hidden="true" className="lt-deck-shade" data-mv="" style={moves('st-deck-shade')} />
      </div>
      <div className="lt-lid" data-mv="" style={moves('st-lid')}>
        <div className="lt-face lt-front">
          <section className="lt-screen" aria-label={t.desk.screen} aria-live="polite">
            <div className="screen-out">
              {OWNERS.map((owner) => (
                <div
                  key={owner === screen && pressed ? `${owner}-${run}` : owner}
                  className="cap-out"
                  data-cap={owner}
                  data-mv=""
                  style={moves(`st-out-${owner}`)}
                  {...(owner === screen ? { 'data-on': '' } : {})}
                  // The output showing can be scrolled from the keyboard, once the page runs.
                  {...(mounted && owner === screen ? { tabIndex: 0 } : {})}
                  {...(owner === 'unpriced' ? { 'aria-labelledby': 'story-unpriced' } : { 'aria-labelledby': `desk-plate-${owner}`, role: 'group' })}
                  {...off(owner === screen)}
                >
                  {owner === 'unpriced' && <p className="screen-tag">{t.desk.example}</p>}
                  <Transcript owner={owner} />
                  <Transcript owner={owner} narrow />
                </div>
              ))}
            </div>
            <div className="lt-never" data-mv="" style={moves('st-out-never')} {...(screen === 'never' ? { 'data-on': '' } : {})} {...off(screen === 'never')}>
              <p className="lt-never-label">{t.neverLabel}</p>
              <ul>
                {t.neverItems.map((item, index) => (
                  <li key={item} data-mv="" style={{ '--i': index, ...moves(`st-never-${index}`) } as Vars}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div aria-hidden="true" className="lt-screen-off" data-mv="" style={moves('st-screen-off')} />
          </section>
        </div>
        <div aria-hidden="true" className="lt-face lt-back">
          <span>Trazum</span>
        </div>
      </div>
    </div>
  );
}

/** The paper receipt: `bill --receipt` on the same files, each line with the date its rate was read, and a note of the page it was read from. */
function Receipt({ t }: { t: LandingCopy }) {
  const r = t.desk.receipt;
  return (
    <div className="receipt-slot" data-mv="" style={moves('st-receipt')}>
      <div className="receipt" data-mv="" style={moves('st-receipt-face')}>
        <div aria-hidden="true" className="receipt-cast" />
        <div className="receipt-paper">
          <p className="receipt-mark">Trazum</p>
          <p className="receipt-meta">
            {r.heading} · {RECEIPT.source}
          </p>
          <p className="receipt-meta">
            {`${RECEIPT.from} → ${RECEIPT.to}`} · {r.calls(RECEIPT.calls)}
          </p>
          <ul className="receipt-lines">
            {RECEIPT.lines.map((line, index) => (
              <li key={`${line.label}-${line.model}`}>
                <span className="receipt-row">
                  <span>{line.model}</span>
                  <span className="receipt-usd">{line.usd}</span>
                </span>
                <span className="receipt-src">
                  {r.calls(line.calls)} · {r.rateRead(line.reviewedOn)}
                </span>
                <span className="receipt-note" data-mv="" style={moves(`st-note-${index}`)}>
                  <span className="receipt-note-page">
                    {/* The page, broken after its host where the note is narrow. */}
                    <span>{line.source.slice(0, line.source.indexOf('/'))}</span>
                    <span>{line.source.slice(line.source.indexOf('/'))}</span>
                  </span>
                  <span className="receipt-note-date">{r.rateRead(line.reviewedOn)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="receipt-total">
            <span>{r.total}</span>
            <span className="receipt-figure">{RECEIPT.total}</span>
          </p>
          <p className="receipt-caveat">{t.billCaveat}</p>
        </div>
        <div aria-hidden="true" className="receipt-curl" />
      </div>
    </div>
  );
}

/** Each object, drawn on a 40 by 40 grid in ink, on paper, with the acid as a fill. */
function Icon({ id }: { id: ObjectId }) {
  const shapes: Record<ObjectId, React.ReactElement> = {
    bill: (
      <>
        <path className="ic-paper" d="M10 4h20v31l-3.3-2.5-3.4 2.5-3.3-2.5-3.3 2.5-3.4-2.5L10 35z" />
        <path d="M14 11h12M14 16h12M14 21h8" />
        <rect className="ic-acid" x="19" y="25" width="8" height="5" />
      </>
    ),
    check: (
      <>
        <rect className="ic-paper" x="5" y="12" width="5" height="24" />
        <path className="ic-acid" d="M10 15h26v7H10z" />
        <path d="M16 15l5 7M24 15l5 7M32 15l4 6" />
      </>
    ),
    guard: (
      <>
        <rect className="ic-paper" x="9" y="4" width="22" height="32" />
        <rect className="ic-ink" x="15" y="10" width="10" height="20" />
        <rect className="ic-acid" x="17" y="12" width="6" height="8" />
      </>
    ),
    clock: (
      <>
        <circle className="ic-paper" cx="20" cy="20" r="15" />
        <path d="M20 10v10l7 5" />
        <circle className="ic-acid" cx="20" cy="20" r="2.5" />
      </>
    ),
    optimize: (
      <>
        <path className="ic-acid" d="M8 32l3-8 17-17 5 5-17 17z" />
        <path d="M11 24l5 5M4 36h13" />
      </>
    ),
    models: (
      <>
        <rect className="ic-paper" x="5" y="8" width="30" height="27" />
        <rect className="ic-acid" x="5" y="8" width="30" height="7" />
        <path d="M12 4v7M28 4v7M13 25l4 4 9-9" />
      </>
    ),
    lid: (
      <>
        <path className="ic-paper" d="M4 28h32l-4 6H8z" />
        <path className="ic-ink" d="M8 10h24v16H8z" />
        <rect className="ic-acid" x="12" y="14" width="16" height="2" />
      </>
    ),
  };
  return (
    <svg className="obj-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      {shapes[id]}
    </svg>
  );
}

/** An object's face: its drawing, its name and its command. Drawn twice, the second time pressed, which the story fades in. */
function Face({ id, name, hint }: { id: ObjectId; name: string; hint: string }) {
  return (
    <>
      <Icon id={id} />
      <span className="obj-words">
        <span className="obj-name">{name}</span>
        <span className="obj-hint">{hint}</span>
      </span>
    </>
  );
}

/** A chapter's slot in the column: as tall as the timeline says, its words near its top. */
function Slot({ id, children, labelledBy, ...rest }: { id: ChapterId; children: React.ReactNode; labelledBy: string } & Record<`data-${string}`, string>) {
  return (
    <section className="chapter" data-ch={id} aria-labelledby={labelledBy} style={{ '--ch-h': `${chapterOf(id).height}svh` } as Vars} {...rest}>
      <div className="chapter-card">{children}</div>
    </section>
  );
}

/**
 * An object's words: a title, what it does in a sentence, the command at its
 * prompt, and what it does not do. In its chapter the title is the heading
 * its output on the screen is labelled by; on the press card it is a copy.
 */
function PlateWords({
  t,
  id,
  headingId,
  link,
  extra,
}: { t: LandingCopy; id: DeskCommand; headingId?: string; link?: { href: string; label: string }; extra?: React.ReactNode }) {
  const cap = t.desk.caps[id];
  return (
    <>
      <h3 id={headingId} className="plate-title">
        {cap.title}
      </h3>
      <p className="plate-body">{cap.body}</p>
      <p className="plate-run">
        <span aria-hidden="true" className="plate-prompt">
          ${' '}
        </span>
        <code>{DESK_COMMAND_NAMES[id]}</code>
      </p>
      <p className="plate-not">{t.desk.notLabel}</p>
      <ul className="plate-list">
        {cap.not.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {extra}
      {link && (
        <a href={link.href} className="plate-link">
          {link.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      )}
    </>
  );
}

/** What never leaves the machine, in words: the lid's, before it closes over it. */
function NeverWords({ t, headingId }: { t: LandingCopy; headingId?: string }) {
  return (
    <>
      <h3 id={headingId} className="plate-title">
        {t.neverTitle}
      </h3>
      <p className="plate-body">
        <strong className="plate-lead">{t.reasons[3][0]}</strong> {t.reasons[3][1]}
      </p>
      <p className="plate-body">{t.neverLede}</p>
    </>
  );
}

/** An object's chapter: its words in its slot. */
function Plate({ t, id, link, extra }: { t: LandingCopy; id: DeskCommand; link?: { href: string; label: string }; extra?: React.ReactNode }) {
  return (
    <Slot id={id} labelledBy={`desk-plate-${id}`}>
      <PlateWords t={t} id={id} headingId={`desk-plate-${id}`} link={link} extra={extra} />
    </Slot>
  );
}

/**
 * The card a press puts where the chapter's card was: the pressed object's
 * words, so that what the screen shows and the words beside it (under it, on
 * a phone) are about the same thing. A copy for the eye: hidden from
 * assistive technology, which reads the pressed output from the screen's live
 * region, labelled by the object's chapter heading, and with no control of
 * its own, so nothing is reached twice. The lid's card is what never leaves.
 */
function PressCard({ t, id }: { t: LandingCopy; id: ObjectId }) {
  return (
    <div aria-hidden="true" className="press-card" data-for={id}>
      {id === 'lid' ? <NeverWords t={t} /> : <PlateWords t={t} id={id} />}
    </div>
  );
}

/** The story: the pinned stage with the laptop, the receipt and the objects, and the chapters that scroll past it. */
export function Story({ t, copy }: { t: LandingCopy; copy: SiteCopy }) {
  const ref = useRef<HTMLElement>(null);
  useStoryProgress(ref);
  const { chapter, staged } = useChapter(ref);
  // A press: the object the visitor chose, held over the scroll until the next chapter.
  const [pressed, setPressed] = useState<ObjectId | null>(null);
  const [lastCommand, setLastCommand] = useState<DeskCommand>('bill');
  const [run, setRun] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Scrolling into another chapter lets go of a press, and the story takes over again.
  const pressedIn = useRef<ChapterId | null>(null);
  useEffect(() => {
    if (pressedIn.current !== null && pressedIn.current !== chapter) {
      pressedIn.current = null;
      setPressed(null);
    }
  }, [chapter]);

  const current = chapterOf(chapter);
  // What the stage shows: a press, or the current chapter, or, with the stage not pinned, the bill.
  const object: ObjectId | null = pressed ?? (staged ? current.object : 'bill');
  const screen: ScreenId = pressed !== null ? (pressed === 'lid' ? 'never' : pressed) : staged ? current.screen : 'bill';
  const closed = pressed !== null ? pressed === 'lid' : staged && chapter === 'close';
  // A press of an object whose chapter is not the one current puts that object's card where the chapter's was: the
  // lid's is what never leaves, which its own chapter and the one before it already show.
  const cardOf = (id: ObjectId): ChapterId => (id === 'lid' ? 'never' : id);
  const swapped = staged && pressed !== null && cardOf(pressed) !== chapter && !(pressed === 'lid' && chapter === 'close');

  const press = (id: ObjectId) => {
    pressedIn.current = chapter;
    if (id === 'lid') {
      // Open again, it shows the last command it showed.
      setPressed(closed ? lastCommand : 'lid');
    } else {
      setPressed(id);
      setLastCommand(id);
    }
    setRun((count) => count + 1);
  };

  const objects: { id: ObjectId; name: string; hint: string }[] = [
    ...DESK_COMMANDS.map((id) => ({ id, name: t.desk.caps[id].object, hint: DESK_COMMAND_NAMES[id] })),
    { id: 'lid', name: t.desk.lid, hint: t.neverLabel },
  ];
  const links: Partial<Record<DeskCommand, { href: string; label: string }>> = {
    check: { href: MORE_LINKS.ci.href, label: t.more.ci.link },
    optimize: { href: MORE_LINKS.trim.href, label: t.more.trim.link },
  };
  const world: Vars = { '--cols': TERMINAL_COLUMNS };
  const [reasonRates, reasonBilled] = t.reasons;

  return (
    <section
      ref={ref}
      className="story"
      aria-labelledby="desk-title"
      data-story-root=""
      data-chapter={chapter}
      // The story's height, written down, so the scroll timeline has it while the page is still arriving.
      style={{ '--story-h': `${STORY_HEIGHT}svh` } as Vars}
      {...(pressed !== null ? { 'data-pressed': pressed } : {})}
      {...(closed ? { 'data-closed': '' } : {})}
      {...(swapped ? { 'data-swapped': '' } : {})}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: keyframes written in this repository from the timeline and the CLI's transcript; nothing a visitor sends reaches them, and style-src allows inline styles */}
      <style /* skipcq: JS-0440 */ /* nosemgrep */ dangerouslySetInnerHTML={{ __html: MOTION.css }} />
      <div className="story-stage">
        <div className="desk" style={world}>
          <div className="desk-scene">
            <div className="desk-laptop" data-mv="" data-arrive="" style={moves('st-laptop')}>
              <div className="story-3d">
                <Laptop t={t} screen={screen} pressed={pressed !== null} run={run} mounted={mounted} />
              </div>
            </div>
            <Receipt t={t} />
          </div>

          <div className="desk-objects" role="group" aria-label={t.desk.objects}>
            <div className="desk-row">
              {objects.map((item, index) => (
                <div key={item.id} className="obj-slot" data-mv="" data-arrive="" style={moves(`st-obj-${index}`)}>
                  <span aria-hidden="true" className="obj-cast" />
                  <button
                    type="button"
                    className="obj"
                    data-obj={item.id}
                    data-mv=""
                    style={moves(`st-lift-${item.id}`)}
                    aria-pressed={item.id === object}
                    onClick={() => press(item.id)}
                  >
                    <Face {...item} />
                    <span aria-hidden="true" className="obj-skin" data-mv="" style={moves(`st-skin-${item.id}`)}>
                      <Face {...item} />
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        {swapped && pressed !== null && (
          <div className="press-place">
            <PressCard key={pressed} t={t} id={pressed} />
          </div>
        )}
      </div>

      <div className="chapters">
        <Slot id="arrival" labelledBy="desk-title">
          <h2 id="desk-title" className="chapter-title">
            {t.desk.title}
          </h2>
          <p className="plate-body">{t.desk.sub}</p>
        </Slot>
        {DESK_COMMANDS.map((id) => (
          <Plate
            key={id}
            t={t}
            id={id}
            link={links[id]}
            extra={
              id === 'bill' ? (
                <p className="plate-note">
                  {t.billNote}{' '}
                  <a href={ILLUSTRATIVE_BILL.source} target="_blank" rel="noreferrer noopener" className="plate-source">
                    {t.billSource}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                </p>
              ) : undefined
            }
          />
        ))}
        <Slot id="sources" labelledBy="reasons-title">
          <h2 id="reasons-title" className="chapter-title">
            {t.reasonsTitle}
          </h2>
          <h3 className="plate-title">{reasonRates[0]}</h3>
          <p className="plate-body">{reasonRates[1]}</p>
          <h3 className="plate-title plate-title-next">{reasonBilled[0]}</h3>
          <p className="plate-body">{reasonBilled[1]}</p>
        </Slot>
        <Slot id="unpriced" labelledBy="story-unpriced">
          <h3 id="story-unpriced" className="plate-title">
            {t.reasons[2][0]}
          </h3>
          <p className="plate-body">{t.reasons[2][1]}</p>
          <p className="plate-body">{t.desk.unpricedNote(UNPRICED.source, UNPRICED.models.join(', '), UNPRICED.calls)}</p>
        </Slot>
        <Slot id="never" labelledBy="story-never">
          <NeverWords t={t} headingId="story-never" />
        </Slot>
        <Slot id="close" labelledBy="close-title" data-landing-close="">
          <h2 id="close-title" className="chapter-title chapter-close">
            {t.closeTitle}
          </h2>
          <p className="plate-body">{t.closeBody}</p>
          <p className="plate-leaves">
            <span className="plate-not">{t.leavesLabel}</span> {t.leaves}
          </p>
          <div className="chapter-cta">
            <CommandLine command={COMMAND} copyLabel={copy.copyCommand} copiedLabel={copy.copied} size="small" />
            <div className="chapter-actions">
              <DashboardAction label={copy.dashboardCta} className="min-h-12 px-6 text-[16px]" />
              <GitHubButton label={copy.links.github} opensExternal={copy.opensExternal} className="min-h-12" />
            </div>
          </div>
        </Slot>
      </div>
    </section>
  );
}
