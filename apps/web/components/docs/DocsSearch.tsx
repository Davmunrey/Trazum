'use client';

import { Search } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { DocsCopy } from '../../lib/docs/copy';
import { DOCS, docHref } from '../../lib/docs/manifest';
import { SHOWN_RESULTS, searchEntries } from '../../lib/docs/search';
import type { SearchEntry } from '../../lib/docs/types';
import { cn } from '../../lib/utils';

/**
 * The search field: titles and headings, filtered as you type, in the page.
 *
 * The index is a module the build wrote. It is loaded the first time the
 * field is focused or typed in, as a chunk of this site's own files, and
 * from then on the whole search is a function of that list and the text in
 * the field. Nothing is sent anywhere: this file has no `fetch`, no
 * `sendBeacon` and no analytics call, the query is not written to the
 * address, and `docs.test.mjs` reads this file for each of those. What a
 * reader types stays in the page.
 *
 * Keyboard: Arrow Down from the field enters the results, Arrow Up and Down
 * move through them, Arrow Up from the first returns to the field, Enter in
 * the field opens the first result, and Escape empties the field. Each
 * result is a plain link, so Tab reaches them too. The count is announced
 * through a status region as the results change.
 *
 * `children` is what the field's place shows while it is empty (the list of
 * documents, in the sidebar) and is replaced by the results while it is not.
 */

const TITLES: Readonly<Record<string, string>> = Object.fromEntries(DOCS.map((doc) => [doc.slug, doc.title]));

export function DocsSearch({
  copy,
  large = false,
  children,
}: {
  copy: DocsCopy;
  /** The larger field `/docs` opens with. */
  large?: boolean;
  children?: ReactNode;
}) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<readonly SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  /** The index is fetched once, when the field is first used. */
  const load = () => {
    if (started.current) return;
    started.current = true;
    import('../../lib/docs/generated/search')
      .then((module) => setEntries(module.default))
      .catch(() => setFailed(true));
  };

  const hits = useMemo(
    () => (entries === null || query.trim() === '' ? [] : searchEntries(entries, TITLES, query, SHOWN_RESULTS)),
    [entries, query],
  );
  const active = query.trim() !== '';
  const status = !active || entries === null ? '' : hits.length === 0 ? copy.searchNone : copy.searchResults(hits.length);

  const links = () => [...(list.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      const first = links()[0];
      if (first !== undefined) {
        event.preventDefault();
        first.focus();
      }
    } else if (event.key === 'Enter') {
      const first = hits[0];
      if (first !== undefined) {
        event.preventDefault();
        window.location.assign(docHref(first.entry[0], first.entry[2]));
      }
    } else if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
    }
  };

  const onResultKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = links();
    const at = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (at === -1) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      all[Math.min(all.length - 1, at + 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (at === 0) input.current?.focus();
      else all[at - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setQuery('');
      input.current?.focus();
    }
  };

  return (
    <div role="search" className="min-w-0">
      <label htmlFor={inputId} className="sr-only">
        {copy.searchLabel}
      </label>
      <div className="relative">
        <Search
          className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground', large ? 'left-4 size-5' : 'left-3 size-4')}
          aria-hidden="true"
        />
        <input
          ref={input}
          id={inputId}
          type="search"
          value={query}
          placeholder={copy.searchPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          {...(active ? { 'aria-controls': listId } : {})}
          onFocus={load}
          onChange={(event) => {
            load();
            setQuery(event.target.value);
          }}
          onKeyDown={onInputKey}
          className={cn(
            'w-full border-2 border-foreground bg-background text-[16px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
            large ? 'h-14 pr-4 pl-12' : 'h-11 pr-3 pl-10',
          )}
        />
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && active && <p className="mt-3 text-[14px] text-muted-foreground">{copy.searchUnavailable}</p>}
      {active ? (
        <div className="mt-3">
          {status !== '' && (
            <p aria-hidden="true" className="font-mono text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {status}
            </p>
          )}
          <ul id={listId} ref={list} onKeyDown={onResultKey} className="mt-2 border-t-2 border-foreground">
            {hits.map(({ entry }) => {
              const [slug, text, anchor, depth] = entry;
              return (
                <li key={`${slug}#${anchor}`} className="border-b border-rule">
                  <a
                    href={docHref(slug, anchor)}
                    className="block px-3 py-2.5 hover:bg-layer-hover focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
                  >
                    {/* A heading and a title from the documents, English in every language of the site (#862). */}
                    <span lang="en" className="block text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">
                      {text}
                    </span>
                    {depth === 1 ? (
                      <span className="mt-0.5 block font-mono text-[12px] text-muted-foreground">{copy.searchDocument}</span>
                    ) : (
                      <span lang="en" className="mt-0.5 block font-mono text-[12px] text-muted-foreground">
                        {TITLES[slug]}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        children !== undefined && <div className="mt-6">{children}</div>
      )}
    </div>
  );
}
