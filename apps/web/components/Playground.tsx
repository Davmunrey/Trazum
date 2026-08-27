'use client';

import { useEffect, useRef, useState } from 'react';

import type { Locale } from '@trazum/core';

import { onDemo } from '@/lib/demo';
import { createPlaygroundFiles, runPlayground } from '@/lib/playground';
import type { WebMessages } from '@/lib/i18n';

/**
 * The playground tab — the 1.72 arc: the CLI's pure subset, runnable in the
 * page against sample files, through the dispatcher in `lib/playground.ts`.
 *
 * This file owns only the terminal chrome: an output area, a prompt line,
 * arrow-key history — and, since 1.76, the typing hand: the tour's demo
 * types a real command character by character and submits it through the
 * exact path the visitor's Enter uses, history included. **The visitor's
 * keystroke cancels the hand mid-word** — it is their terminal, and a demo
 * that fights the person who took the keyboard is worse than no demo.
 * Reduced motion types instantly.
 *
 * Every answer is computed by `runPlayground`, which runs the same
 * `@trazum/core` functions the CLI imports — and, like every feature of
 * this app, nothing here fetches. The suite greps this file and the
 * dispatcher for the whole family of network calls, the same guard Bill
 * carries.
 */

interface TerminalLine {
  kind: 'input' | 'output';
  text: string;
}

/** Milliseconds per typed character — slow enough to read as writing. */
const TYPE_MS = 18;

export function Playground({ t, locale }: { t: WebMessages; locale: Locale }) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  // History of submitted lines; index counts back from the end while browsing.
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  // The virtual files persist for the life of the tab: `-o` writes land here
  // and the next command reads them, which is the whole demo loop.
  const filesRef = useRef<Map<string, string> | null>(null);
  if (filesRef.current === null) filesRef.current = createPlaygroundFiles();
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The typing hand's pending timers; non-empty means the hand is writing.
  const typistRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** One line through the whole pipe — the visitor's Enter and the demo share it. */
  function execute(line: string) {
    historyIndexRef.current = null;
    if (line === '') return;
    historyRef.current.push(line);
    const result = runPlayground(line, filesRef.current as Map<string, string>, t, locale);
    setLines((previous) => {
      if (result.clear === true) return [];
      return [
        ...previous,
        { kind: 'input' as const, text: `$ ${line}` },
        ...result.lines.map((text) => ({ kind: 'output' as const, text })),
      ];
    });
    // After the state lands, keep the newest line in view.
    requestAnimationFrame(() => {
      outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
    });
  }

  function submit() {
    const line = input.trim();
    setInput('');
    execute(line);
  }

  /** Stop the hand and drop what it half-typed. The visitor's input wins. */
  function cancelTypist() {
    if (typistRef.current.length === 0) return;
    for (const timer of typistRef.current) clearTimeout(timer);
    typistRef.current = [];
    setInput('');
  }

  const executeRef = useRef(execute);
  executeRef.current = execute;
  useEffect(() => {
    return onDemo((action) => {
      if (action.kind !== 'playground-run') return;
      cancelTypist();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        setInput('');
        executeRef.current(action.line);
        return;
      }
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let i = 1; i <= action.line.length; i += 1) {
        timers.push(setTimeout(() => setInput(action.line.slice(0, i)), i * TYPE_MS));
      }
      timers.push(
        setTimeout(() => {
          typistRef.current = [];
          setInput('');
          executeRef.current(action.line);
        }, (action.line.length + 8) * TYPE_MS),
      );
      typistRef.current = timers;
    });
    // Subscribed once — re-subscribing per render would double-type a line
    // mid-hand; the ref reassigned every render keeps `execute` current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A hand still writing when the tab unmounts must not type into the void.
  useEffect(() => () => cancelTypist(), []);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    cancelTypist();
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
      return;
    }
    const history = historyRef.current;
    if (event.key === 'ArrowUp' && history.length > 0) {
      event.preventDefault();
      const index =
        historyIndexRef.current === null ? history.length - 1 : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = index;
      setInput(history[index]);
    } else if (event.key === 'ArrowDown' && historyIndexRef.current !== null) {
      event.preventDefault();
      const index = historyIndexRef.current + 1;
      if (index >= history.length) {
        historyIndexRef.current = null;
        setInput('');
      } else {
        historyIndexRef.current = index;
        setInput(history[index]);
      }
    }
  }

  return (
    <section>
      {/*
        The page header already states this panel's purpose, read off the rail's
        own label. `t.playground.lead` said the same thing again directly under
        it — "the same functions the terminal runs" twice on one screen — and
        pushed the terminal itself down. The line that is left is the one the
        header does not carry: what to type.
      */}
      <p className="mt-0 mb-5 max-w-[68ch] text-[14px] leading-relaxed text-muted-foreground">
        {t.playground.start}
      </p>

      {/*
        The terminal, and now it looks like one.

        It was a paper-coloured card with monospace text in it: the same white
        surface as every panel around it, so the one place in the app where a
        reader types commands read as another form. A terminal is dark — that
        is its use scene, not a preference — and this repository already draws
        one, in `docs/assets/demo.svg` at the top of the README. Same window,
        same mark, same palette, so the thing the README promises and the thing
        the page delivers are recognisably the same object.

        The colours are the dark theme's own tokens, applied in both schemes on
        purpose. A terminal that turns to paper under a light scheme is not the
        light version of a terminal; it is a text box.

        A click anywhere inside focuses the prompt, because that is what a
        terminal does; the output region is still selectable text.
      */}
      <div
        className="overflow-hidden rounded-xl border border-[#363329] bg-[#171512] font-mono text-[13px] leading-relaxed text-[#efece4] shadow-[var(--shadow-focal)]"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex items-center gap-2.5 border-b border-[#363329] bg-[#1e1c18] px-3.5 py-2.5">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0">
            <rect width="24" height="24" rx="5.5" fill="#b0522f" />
            <g strokeWidth="2" strokeLinecap="round">
              <path d="M5.5 7h13.5" stroke="#fff" />
              <path d="M5.5 12h9.5" stroke="#fff" opacity=".45" />
              <path d="M5.5 12h6" stroke="#fff" />
              <path d="M5.5 17h6" stroke="#fff" opacity=".45" />
              <path d="M5.5 17h3.5" stroke="#fff" />
            </g>
          </svg>
          <span className="text-[12px] text-[#a8a495]">trazum</span>
        </div>
        <div
          ref={outputRef}
          className="h-[420px] overflow-x-auto overflow-y-auto px-3.5 py-3"
          aria-live="polite"
        >
          {lines.length === 0 && (
            <div className="whitespace-pre-wrap text-[#a8a495]">{t.playground.lead}</div>
          )}
          {lines.map((line, index) => (
            <div
              key={index}
              className={
                line.kind === 'input'
                  ? 'whitespace-pre-wrap font-semibold'
                  : 'whitespace-pre text-[#a8a495]'
              }
            >
              {line.text === '' ? ' ' : line.text}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-[#363329] px-3.5 py-2.5">
          <span aria-hidden="true" className="select-none text-[#e08a63]">
            $
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => {
              // React fires onChange only for real user input, never for the
              // hand's own setState — so any change here is the visitor, and
              // the visitor wins.
              cancelTypist();
              setInput(event.target.value);
            }}
            onKeyDown={onKeyDown}
            aria-label={t.playground.inputAriaLabel}
            placeholder="help"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent text-[#efece4] caret-[#e08a63] outline-none placeholder:text-[#93907f]"
          />
        </div>
      </div>
    </section>
  );
}
