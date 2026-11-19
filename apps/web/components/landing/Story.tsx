'use client';

import { type CSSProperties, useEffect, useRef } from 'react';

import type { LandingCopy } from '../../lib/landing-copy';
import { TERMINAL, TERMINAL_COLUMNS, type TerminalRun } from '../../lib/landing-terminal';
import { storyMotion } from '../../lib/story-motion';
import { SCENES, SCENE_OF, timeLines, type SceneId, type TimedBlock } from '../../lib/story-timeline';

/**
 * The landing's story: a laptop, the CLI at work on its screen, and a lid
 * that closes over what never leaves the machine.
 *
 * ## How scroll drives it
 *
 * Each element that moves (`data-mv`) names its own keyframes, which
 * `lib/story-motion.ts` writes from the timeline and this component puts in a
 * `<style>`: `transform`, `opacity` and `clip-path`, over the whole story.
 * Where the browser has scroll-driven animations, the stylesheet runs them
 * on the section's view timeline and no script runs while the visitor
 * scrolls. Where it has not, `useStoryProgress` below holds them paused and
 * sets each one's current time to the scroll position: one read and a batch
 * of writes per animation frame, from a passive listener attached only while
 * the section is on screen. Either way the scroll is the only clock, so
 * scrolling back plays the story back.
 *
 * ## What it is without motion
 *
 * The bootstrap in the layout sets `data-motion="scroll"` before the first
 * paint, unless the reader asked for reduced motion. Without it (no
 * JavaScript, reduced motion) none of the story's rules apply: the scenes are
 * ordinary content in reading order, each with its terminal output in full,
 * and the laptop is drawn once, still, with what never leaves on its screen.
 *
 * ## What is on the screen
 *
 * `lib/landing-terminal.ts`, written by `scripts/draw-landing-terminal.mjs`
 * from what the built CLI prints. The text is in the DOM once and does not
 * change as it "types": a clip shows it a character at a time, so it can be
 * selected, and a screen reader reads each line once.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const TIMED = timeLines(TERMINAL);
/** The keyframes, written once per page load from the timeline and the transcript. */
const MOTION = storyMotion(TERMINAL);

/** An element's own keyframes, by name. */
const moves = (name: string): CSSProperties => ({ animationName: name });

/** The story's position, as each moving element's paused animation, where the browser cannot drive it from CSS. */
function useStoryProgress(ref: React.RefObject<HTMLDivElement | null>) {
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

/**
 * The free part of the window on a tall screen, where the terminal's column is centred (#770): under the plate of
 * the scene that is showing, at that plate's own height, and above the marker. CSS cannot read one box's height into
 * another's place, so this measures each plate's foot and the marker's top when the stage or a plate changes size
 * (a resize, the face arriving), never while scrolling, and writes them on the stage; the motion crosses from one
 * scene's free part to the next's as the plates swap. A wide screen does not read them: there the plate stands
 * beside the column.
 */
function useFreeArea(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (element === null || document.documentElement.dataset.motion !== 'scroll' || typeof ResizeObserver === 'undefined') return;
    const world = element.querySelector<HTMLElement>('.story-world');
    const marker = element.querySelector<HTMLElement>('.story-marker');
    const plates = [...element.querySelectorAll<HTMLElement>('.scene-cap')];
    if (world === null || marker === null || plates.length === 0) return;
    const written = new Map<string, string>();
    const write = (name: string, value: number) => {
      const text = `${Math.round(value * 100) / 100}px`;
      if (written.get(name) === text) return;
      written.set(name, text);
      world.style.setProperty(name, text);
    };
    const measure = () => {
      // Under each scene's plate, at its own height: the free part of that scene starts at the plate's foot.
      for (const plate of plates) {
        const scene = plate.closest<HTMLElement>('[data-scene]')?.dataset.scene;
        if (scene) write(`--free-t-${scene}`, plate.offsetTop + plate.offsetHeight);
      }
      // The foot: the marker, or the scene's name standing over it, whichever is higher.
      // A name is placed on the marker (its offset parent), from inside the marker's border.
      const names = [...marker.querySelectorAll<HTMLElement>('.mk-label')].map((name) => marker.offsetTop + marker.clientTop + name.offsetTop);
      write('--free-b', Math.min(marker.offsetTop, ...names));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(world);
    for (const plate of plates) observer.observe(plate);
    measure();
    return () => observer.disconnect();
  }, [ref]);
}

function runClass(style: string): string {
  return [...style].map((letter) => `t-${letter}`).join(' ');
}

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

function Transcript({ scene, timed }: { scene: Exclude<SceneId, 'never'>; timed: readonly TimedBlock[] }) {
  return (
    <pre className="term" data-mv="" style={moves(`st-term-${scene}`)}>
      {timed.map(({ block, lines }) => {
        const index = TIMED.findIndex((entry) => entry.block === block);
        return [
          <span key={`${block.id}-command`} className="tl tl-command">
            <span aria-hidden="true" className="t-prompt">
              ${' '}
            </span>
            <span className="t-typed" data-mv="" style={moves(`st-type-${index}`)}>
              {block.command}
            </span>
            <span aria-hidden="true" className="t-cursor" data-mv="" style={moves(`st-cursor-${index}`)} />
          </span>,
          ...lines.map((_, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the transcript is a constant written by a script: its runs and lines never move, and an empty line or a repeated run has no identity of its own but its place
            <span key={`${block.id}-${j}`} className="tl">
              <Runs runs={block.lines[j] ?? []} bar={`st-bar-${index}-${j}`} />
            </span>
          )),
        ];
      })}
    </pre>
  );
}

function Caption({ id, number, kicker, title, children }: { id: SceneId; number: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <div className="scene-cap" data-mv="" style={moves(`st-words-${id}`)}>
      <p className="scene-kicker">
        <span aria-hidden="true">{number}</span> {kicker}
      </p>
      <h2 id={`scene-${id}`} className="scene-title">
        {title}
      </h2>
      {children}
    </div>
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

function Laptop({ t }: { t: LandingCopy }) {
  return (
    <div className="lt-device">
      <div className="lt-deck">
        <Deck />
        <div aria-hidden="true" className="lt-deck-shade" data-mv="" style={moves('st-shade')} />
      </div>
      <div className="lt-lid" data-mv="" style={moves('st-lid')}>
        <div className="lt-face lt-front">
          <div className="lt-screen">
            <div className="lt-never">
              <p className="lt-never-label" data-mv="" style={moves('st-never-label')}>
                {t.neverLabel}
              </p>
              <ul>
                {t.neverItems.map((item, index) => (
                  <li key={item} data-mv="" style={moves(`st-never-${index}`)}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div aria-hidden="true" className="lt-screen-off" data-mv="" style={moves('st-screen-off')} />
          </div>
        </div>
        <div aria-hidden="true" className="lt-face lt-back">
          <span>Trazum</span>
        </div>
      </div>
    </div>
  );
}

export function Story({ t }: { t: LandingCopy }) {
  const ref = useRef<HTMLDivElement>(null);
  useStoryProgress(ref);
  useFreeArea(ref);

  const scene = (id: Exclude<SceneId, 'never'>) => TIMED.filter(({ block }) => SCENE_OF[block.id] === id);
  // The terminal's widest line, for the type size that fits it.
  const world: Vars = { '--cols': TERMINAL_COLUMNS };
  const labels: Record<SceneId, string> = {
    bill: t.billKicker,
    check: t.more.ci.title,
    trim: t.more.trim.title,
    never: t.neverTitle,
  };

  return (
    <div ref={ref} className="story" data-story-root="">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: keyframes written in this repository from the timeline and the CLI's transcript; nothing a visitor sends reaches them, and style-src allows inline styles */}
      <style dangerouslySetInnerHTML={{ __html: MOTION }} />
      <div className="story-stage">
        <div className="story-world" style={world}>
          <div className="story-layer" data-mv="" style={moves('st-layer')}>
            <div className="term-box">
              <section className="scene" data-scene="bill" aria-labelledby="scene-bill">
                <Caption id="bill" number="01" kicker={t.billKicker} title={t.billTitle}>
                  <p className="scene-body">{t.heroLede}</p>
                  <p className="scene-note">{t.billCaveat}</p>
                </Caption>
                <Transcript scene="bill" timed={scene('bill')} />
              </section>
              <section className="scene" data-scene="check" aria-labelledby="scene-check">
                <Caption id="check" number="02" kicker={t.moreTitle} title={t.more.ci.title}>
                  <p className="scene-body">{t.more.ci.body}</p>
                </Caption>
                <Transcript scene="check" timed={scene('check')} />
              </section>
              <section className="scene" data-scene="trim" aria-labelledby="scene-trim">
                <Caption id="trim" number="03" kicker={t.moreTitle} title={t.more.trim.title}>
                  <p className="scene-body">{t.more.trim.body}</p>
                </Caption>
                <Transcript scene="trim" timed={scene('trim')} />
              </section>
            </div>
            <div aria-hidden="true" className="term-cut" data-mv="" style={moves('st-term-cut')} />
          </div>

          <section className="story-never" data-mv="" style={moves('st-words-never')} data-scene="never" aria-labelledby="scene-never">
            <p className="scene-kicker">
              <span aria-hidden="true">04</span> {t.neverLabel}
            </p>
            <h2 id="scene-never" className="scene-title story-never-title">
              {t.neverTitle}
            </h2>
            <p className="scene-body">{t.neverLede}</p>
          </section>

          <div className="story-camera" data-mv="" style={moves('st-camera')}>
            <div className="story-3d">
              <Laptop t={t} />
            </div>
            <p className="story-leaves" data-mv="" style={moves('st-leaves')} data-leaves="">
              <span className="story-leaves-label">{t.leavesLabel}</span>
              <span className="story-leaves-text">{t.leaves}</span>
            </p>
          </div>

          <ol aria-hidden="true" className="story-marker">
            {SCENES.map((item, index) => (
              <li key={item.id}>
                <span className="mk-n">{String(index + 1).padStart(2, '0')}</span>
                <span className="mk-bar">
                  <span className="mk-fill" data-mv="" style={moves(`st-mark-${item.id}`)} />
                </span>
                <span className="mk-label" data-mv="" style={moves(`st-label-${item.id}`)}>
                  {labels[item.id]}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
