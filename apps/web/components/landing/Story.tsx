'use client';

import { ArrowRight } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

import { DESK_COMMANDS, DESK_COMMAND_NAMES, type DeskCommand, type LandingCopy, MORE_LINKS } from '../../lib/landing-copy';
import { RECEIPT, TERMINAL, TERMINAL_COLUMNS, type TerminalBlock, type TerminalRun } from '../../lib/landing-terminal';
import { storyMotion } from '../../lib/story-motion';
import { STORY_BLOCK } from '../../lib/story-timeline';

/**
 * The landing's desk: one laptop on a desk, and around it one object per
 * thing Trazum does. Pressing an object shows that command's output on the
 * laptop's screen and says, on a plate beside it, what it does and what it
 * does not do. The receipt prints out of the laptop's side; the lid closes
 * over what never leaves the machine.
 *
 * There is one laptop on the page, and this is it. The story told by scrolling
 * is how it arrives: the desk comes up, the laptop lands on it, the objects
 * arrive around it, `bill` runs on its screen and the receipt prints. When the
 * stage lets go the same laptop stays, and the desk is the visitor's.
 *
 * ## How scroll drives the arrival
 *
 * Each element that moves with the scroll (`data-mv`) names its own keyframes,
 * which `lib/story-motion.ts` writes from the timeline and this component puts
 * in a `<style>`: `transform`, `opacity` and `clip-path`, over the whole story.
 * Where the browser has scroll-driven animations, the stylesheet runs them on
 * the section's view timeline and no script runs while the visitor scrolls.
 * Where it has not, `useStoryProgress` holds them paused and sets each one's
 * current time to the scroll position: one read and a batch of writes per
 * animation frame, from a passive listener attached only while the section is
 * on screen. Either way the scroll is the only clock, so scrolling back plays
 * the arrival back.
 *
 * ## What a press does
 *
 * A press is the visitor's, so what it sets off may run on a clock, briefly:
 * the output appears a line at a time and the lid swings shut, both by the
 * stylesheet, from the attributes this component sets (`data-active`,
 * `data-closed`, `data-used`). Nothing moves on its own. Once the visitor has
 * pressed anything, or put focus inside the desk, the arrival is over: every
 * scroll keyframe gives way to the desk as it rests, so a control is never
 * reached half-arrived.
 *
 * ## What it is without JavaScript
 *
 * The layout's bootstrap marks the page `data-desk` before the first paint
 * whenever a script runs, and `data-motion="scroll"` unless the reader asked
 * for reduced motion. Without the first, none of the desk's rules apply: every
 * command's output is on the screen one after another, then what never
 * leaves, then the receipt, then every plate, in reading order, and the
 * objects, which would do nothing, are not drawn. With reduced motion the desk
 * works and nothing on it moves: a press shows its output at once.
 *
 * ## What is on the screen
 *
 * `lib/landing-terminal.ts`, written by `scripts/draw-landing-terminal.mjs`
 * from what the built CLI prints, and the receipt from the receipt it writes.
 * The text is in the DOM once and does not change as it "types": a clip or an
 * opacity shows it, so it can be selected, and a screen reader reads each line
 * once.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;
type ObjectId = DeskCommand | 'lid';

/** The keyframes, written once per page load from the timeline and the transcript. */
const MOTION = storyMotion(TERMINAL);

/** An element's own keyframes, by name. */
const moves = (name: string): CSSProperties => ({ animationName: name });

/** The output each object shows, in the order the desk lays them out. */
const BLOCKS_OF = Object.fromEntries(DESK_COMMANDS.map((id) => [id, TERMINAL.filter((block) => block.cap === id)])) as Record<
  DeskCommand,
  TerminalBlock[]
>;

/** The longest a press's output takes to appear, a line at a time, and the most each line waits. */
const TYPE_MS = 700;
const LINE_MS = 22;

/** The story's position, as each moving element's paused animation, where the browser cannot drive it from CSS. */
function useStoryProgress(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (element === null || root.dataset.motion !== 'scroll') return;
    if (typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()')) return;
    root.dataset.story = 'script';
    // The animations of the elements that move, found once: each is a second
    // long and paused, and the story's position is its current time.
    const animations = [...element.querySelectorAll<HTMLElement>('[data-mv]')].flatMap((target) => target.getAnimations());
    let frame = 0;
    let listening = false;
    const write = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const span = box.height - window.innerHeight;
      const time = (span > 0 ? Math.min(1, Math.max(0, -box.top / span)) : 0) * 1000;
      for (const animation of animations) animation.currentTime = time;
    };
    const request = () => {
      if (frame === 0) frame = requestAnimationFrame(write);
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      const method = on ? 'addEventListener' : 'removeEventListener';
      window[method]('scroll', request, { passive: true } as AddEventListenerOptions);
      window[method]('resize', request, { passive: true } as AddEventListenerOptions);
    };
    const observer = new IntersectionObserver(([entry]) => {
      listen(entry?.isIntersecting ?? false);
      // One last write on the way out, so the story rests at its start or its end.
      request();
    });
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

function runClass(style: string): string {
  return [...style].map((letter) => `t-${letter}`).join(' ');
}

const isRuled = (runs: readonly TerminalRun[]) => runs.length > 0 && /^─+$/.test(runs.at(-1)?.[0] ?? '');

function Runs({ runs, bar }: { runs: readonly TerminalRun[]; bar: string | null }) {
  return (
    <>
      {runs.map(([text, style], index) =>
        bar !== null && style.includes('a') && /^█+$/.test(text) ? (
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

/** One object's output: each command it runs, its prompt, and the lines it printed. The story's command moves with the scroll. */
function Transcript({ blocks }: { blocks: readonly TerminalBlock[] }) {
  const story = blocks.some((block) => block.id === STORY_BLOCK);
  const count = blocks.reduce((sum, block) => sum + block.command.split('\n').length + block.lines.length, 0);
  const style: Vars = { '--step': `${Math.min(LINE_MS, TYPE_MS / Math.max(1, count))}ms`, ...(story ? moves('st-print') : {}) };
  let at = 0;
  return (
    <pre className="term" {...(story ? { 'data-mv': '' } : {})} style={style}>
      {blocks.map((block) => {
        const scrolled = block.id === STORY_BLOCK;
        return [
          ...block.command.split('\n').map((line, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a command's lines are a constant written by a script: they never move, and a line has no identity of its own but its place
            <span key={`${block.id}-command-${j}`} className="tl tl-command" style={{ '--i': at++ } as Vars}>
              {j === 0 && (
                <span aria-hidden="true" className="t-prompt">
                  ${' '}
                </span>
              )}
              {scrolled ? (
                <>
                  <span className="t-typed" data-mv="" style={moves('st-type')}>
                    {line}
                  </span>
                  <span aria-hidden="true" className="t-cursor" data-mv="" style={moves('st-cursor')} />
                </>
              ) : (
                <span className="t-typed">{line}</span>
              )}
            </span>
          )),
          ...block.lines.map((runs, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the transcript is a constant written by a script: its runs and lines never move, and an empty line or a repeated run has no identity of its own but its place
            <span key={`${block.id}-${j}`} className={isRuled(runs) ? 'tl tl-rule' : 'tl'} style={{ '--i': at++ } as Vars}>
              <Runs runs={runs} bar={scrolled ? `st-bar-${j}` : null} />
            </span>
          )),
        ];
      })}
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

/** The one laptop: the screen shows the pressed object's output, or, under the closing lid, what never leaves. */
function Laptop({ t, active, closed, used, run }: { t: LandingCopy; active: DeskCommand; closed: boolean; used: boolean; run: number }) {
  return (
    <div className="lt-device">
      <div className="lt-deck">
        <Deck />
        <div aria-hidden="true" className="lt-deck-shade" />
      </div>
      <div className="lt-lid">
        <div className="lt-face lt-front">
          <section className="lt-screen" aria-label={t.desk.screen} aria-live="polite">
            <div className="screen-out" tabIndex={used ? 0 : -1}>
              {DESK_COMMANDS.map((id) => (
                <div key={id === active ? `${id}-${run}` : id} className="cap-out" data-cap={id} aria-labelledby={`desk-plate-${id}`} role="group" hidden={id !== active || closed}>
                  <Transcript blocks={BLOCKS_OF[id]} />
                </div>
              ))}
            </div>
            <div className="lt-never" hidden={!closed}>
              <p className="lt-never-label">{t.neverLabel}</p>
              <ul>
                {t.neverItems.map((item, index) => (
                  <li key={item} style={{ '--i': index } as Vars}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div aria-hidden="true" className="lt-screen-off" />
          </section>
        </div>
        <div aria-hidden="true" className="lt-face lt-back">
          <span>Trazum</span>
        </div>
      </div>
    </div>
  );
}

/** The paper receipt: `bill --receipt` on the same files, each line with the date its rate was read. */
function Receipt({ t }: { t: LandingCopy }) {
  const r = t.desk.receipt;
  return (
    <div className="receipt-slot" data-mv="" style={moves('st-receipt')}>
      <div className="receipt">
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
            {RECEIPT.lines.map((line) => (
              <li key={`${line.label}-${line.model}`}>
                <span className="receipt-row">
                  <span>{line.model}</span>
                  <span className="receipt-usd">{line.usd}</span>
                </span>
                <span className="receipt-src">
                  {r.calls(line.calls)} · {r.rateRead(line.reviewedOn)}
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

/** The plate beside the laptop: the pressed object's command, what it does in a sentence, and what it does not do. */
function Plate({
  id,
  eyebrow,
  title,
  body,
  listLabel,
  list,
  link,
  shown,
}: {
  id: ObjectId;
  eyebrow: string;
  title: string;
  body: string;
  listLabel: string;
  list: readonly string[];
  link?: { href: string; label: string };
  shown: boolean;
}) {
  return (
    <section className="plate" data-plate={id} aria-labelledby={`desk-plate-${id}`} hidden={!shown}>
      <p className="plate-eyebrow">{eyebrow}</p>
      <h3 id={`desk-plate-${id}`} className="plate-title">
        {title}
      </h3>
      <p className="plate-body">{body}</p>
      <p className="plate-not">{listLabel}</p>
      <ul className="plate-list">
        {list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {link && (
        <a href={link.href} className="plate-link">
          {link.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      )}
    </section>
  );
}

export function Story({ t }: { t: LandingCopy }) {
  const ref = useRef<HTMLElement>(null);
  useStoryProgress(ref);
  const [active, setActive] = useState<DeskCommand>('bill');
  const [closed, setClosed] = useState(false);
  const [used, setUsed] = useState(false);
  const [run, setRun] = useState(0);

  const press = (id: ObjectId) => {
    setUsed(true);
    if (id === 'lid') {
      // Open again, it shows the last command it showed.
      setClosed((was) => !was);
      return;
    }
    setClosed(false);
    setActive(id);
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

  return (
    <section
      ref={ref}
      className="story"
      aria-labelledby="desk-title"
      data-story-root=""
      data-active={active}
      {...(closed ? { 'data-closed': '' } : {})}
      {...(used ? { 'data-used': '' } : {})}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: keyframes written in this repository from the timeline and the CLI's transcript; nothing a visitor sends reaches them, and style-src allows inline styles */}
      <style dangerouslySetInnerHTML={{ __html: MOTION }} />
      <div className="story-stage">
        <div className="desk" style={world}>
          <div aria-hidden="true" className="desk-plane" data-mv="" style={moves('st-desk')}>
            <div className="desk-top" />
            <div className="desk-edge" />
          </div>

          {/* The bill's total, set huge on the far plane behind the laptop, which stands in front of it. The receipt and the screen say it in words. */}
          <p aria-hidden="true" className="desk-figure" data-mv="" style={moves('st-figure')}>
            {RECEIPT.total}
          </p>

          <header className="desk-head" data-mv="" style={moves('st-head')}>
            <p className="desk-kicker">{t.desk.kicker}</p>
            <h2 id="desk-title" className="desk-title">
              {t.desk.title}
            </h2>
            <p className="desk-sub">{t.desk.sub}</p>
          </header>

          <div className="desk-scene">
            <div className="desk-laptop" data-mv="" style={moves('st-laptop')}>
              <div className="story-3d">
                <Laptop t={t} active={active} closed={closed} used={used} run={run} />
              </div>
            </div>
            <Receipt t={t} />
          </div>

          <div className="desk-plate" data-mv="" style={moves('st-plate')}>
            {DESK_COMMANDS.map((id) => (
              <Plate
                key={id}
                id={id}
                eyebrow={DESK_COMMAND_NAMES[id]}
                title={t.desk.caps[id].title}
                body={t.desk.caps[id].body}
                listLabel={t.desk.notLabel}
                list={t.desk.caps[id].not}
                link={links[id]}
                shown={!closed && id === active}
              />
            ))}
            <Plate id="lid" eyebrow={t.neverLabel} title={t.neverTitle} body={t.neverLede} listLabel={t.leavesLabel} list={[t.leaves]} shown={closed} />
          </div>

          <div className="desk-objects" role="group" aria-label={t.desk.objects}>
            <div className="desk-row">
              {objects.map((object, index) => (
                <div key={object.id} className="obj-slot" data-mv="" style={moves(`st-obj-${index}`)}>
                  <button
                    type="button"
                    className="obj"
                    data-obj={object.id}
                    aria-pressed={object.id === 'lid' ? closed : !closed && object.id === active}
                    onClick={() => press(object.id)}
                  >
                    <Icon id={object.id} />
                    <span className="obj-words">
                      <span className="obj-name">{object.name}</span>
                      <span className="obj-hint">{object.hint}</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
