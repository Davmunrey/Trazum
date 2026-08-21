'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Receipt, GitCompare, BookMarked, Wand2, X } from 'lucide-react';

import type { Locale } from '@trazum/core';

import { Account, type SessionResponse } from './Account';
import { Bill } from './Bill';
import { Library } from './Library';
import { Comparer } from './Comparer';
import { Optimizer } from './Optimizer';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { LOCALES, LOCALE_STORAGE_KEY, getWebMessages } from '../lib/i18n';
import { usePromptText } from '../lib/prompt-text';
import { useScenario } from '../lib/scenario';

/** Where the rail's expanded/collapsed preference lives between visits. */
const RAIL_STORAGE_KEY = 'trazum:rail';

function storedLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.includes(raw as Locale) ? (raw as Locale) : null;
  } catch {
    // Storage blocked: the header-derived locale is a fine answer.
    return null;
  }
}

/**
 * Owns the locale for the whole page.
 *
 * The server renders with the locale from `Accept-Language`; this component
 * upgrades to the reader's stored choice on hydration. Deliberately applied in
 * an effect rather than during render: reading `localStorage` while rendering
 * would make the client's first pass disagree with the server's HTML.
 */
export function App({
  initialLocale,
  pricingReviewed,
  models,
}: {
  initialLocale: Locale;
  pricingReviewed: string;
  /** Model ids and display names, so Compare can name the one it priced with. */
  models: readonly { id: string; displayName: string }[];
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  /**
   * Two independent disclosures, and they are not the same thing.
   *
   * `collapsed` is a desktop preference — the rail shrinks to icons and stays
   * that way across visits. `drawerOpen` is a phone's transient overlay, which
   * must never be remembered: reopening the page into a menu nobody asked for
   * is how a drawer becomes a modal.
   */
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  const t = getWebMessages(locale);

  // Owned here, like the locale and for the same reason: both tabs price their
  // answers through it, and two tabs disagreeing about the call volume would
  // make their answers incomparable while looking like one workload.
  const scenario = useScenario();

  // Owned here for the same reason as the scenario. The Library tab saves and
  // restores the prompt that is on screen; it cannot do that for a sibling
  // holding its own copy, and two copies of "the prompt" is how a library ends
  // up quietly storing something else.
  const promptText = usePromptText(locale);

  /**
   * One fetch of the session, for everything on the page that needs it.
   *
   * The Library tab appears only for a signed-in reader, and the account
   * control at the foot of the rail is the same question asked again. Both
   * used to ask it separately — two requests per page load for one answer, and
   * two answers that can differ if the session expires between them, which
   * puts a tab on the page for somebody the account control has already
   * decided is signed out.
   *
   * `null` until it answers, which is what keeps the rail from flashing "Sign
   * in" at somebody who is not signed out. No answer means no tab: a library
   * nobody can read is worse than an absent one.
   */
  const [session, setSession] = useState<SessionResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: SessionResponse | null) => {
        if (!cancelled && body) setSession(body);
      })
      .catch(() => {
        // Unanswered stays `null`, which renders neither the tab nor the control.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const signedIn = Boolean(session?.user);
  const modelName =
    models.find((m) => m.id === scenario.usage.model)?.displayName ?? scenario.usage.model;

  useEffect(() => {
    const stored = storedLocale();
    if (stored) setLocale(stored);
  }, []);

  // Read after hydration, like the locale and for the same reason: touching
  // localStorage during render makes the client's first pass disagree with the
  // server's HTML.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(RAIL_STORAGE_KEY) === 'collapsed');
    } catch {
      // Storage blocked. An expanded rail is the right default to fall back to.
    }
  }, []);

  /**
   * Escape closes the drawer, and the page underneath stops scrolling while it
   * is open.
   *
   * An overlay you cannot dismiss from the keyboard is a trap, and a body that
   * scrolls behind one makes the drawer feel detached from the page it belongs
   * to. Both are undone on close, including when the component unmounts —
   * leaving `overflow: hidden` on the document is the classic drawer bug.
   */
  useEffect(() => {
    if (!drawerOpen) return;

    /*
      Tab must not walk out of an open drawer.

      Without this the first Tab left the drawer and landed on the page
      underneath — a page the scrim says you cannot reach, being operated by a
      keyboard that can. The pair is `aria-modal` and a real trap: claiming
      modality and not enforcing it is the worse half on its own.
    */
    /*
      Read the rail on every call, never once at the top.

      Captured once, this silently produced an empty list — and an empty list
      makes both halves of this effect no-ops while Escape, which returns
      before touching it, goes on working. So the drawer looked like it had
      focus management and had none: initial focus never moved and Tab walked
      straight out behind the scrim, with nothing failing anywhere to say so.
      `offsetParent` is the filter that drops the collapse control, which is
      `display: none` at this width.
    */
    const focusable = () => {
      const rail = railRef.current;
      if (!rail) return [];
      return [...rail.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = focusable();
      if (stops.length === 0) return;
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      const rail = railRef.current;
      if (event.shiftKey && (active === first || !rail?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Where the reader was, so they can be put back. A drawer that closes and
    // leaves focus on an element it just hid strands the keyboard at the top
    // of the document.
    const opener = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);

    /*
      Focus the drawer once it is actually focusable, not once React says it is.

      Two things have to have happened first: the class that hides the rail has
      to be off, and layout has to have run, because every control in a hidden
      subtree reports no offset parent and would be filtered out. A single
      `requestAnimationFrame` was not enough — measured, the callback never
      landed and focus stayed on the hamburger with no `focusin` fired at all.
      So it retries, and the condition it retries on is whether focus ACTUALLY
      MOVED — not whether a candidate existed. The first attempt at this stopped
      as soon as it found one, which is how it went on calling `.focus()` on a
      still-hidden button and reporting success to itself.
    */
    let tries = 0;
    let frame = 0;
    const grab = () => {
      const first = focusable()[0];
      first?.focus();
      if (first && document.activeElement === first) return;
      if (++tries < 10) frame = requestAnimationFrame(grab);
    };
    frame = requestAnimationFrame(grab);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, [drawerOpen]);

  /**
   * A window that becomes a desktop closes the drawer.
   *
   * Nothing did before: at `lg` the rail is sticky and the close button is
   * `display: none`, so resizing across the breakpoint with the drawer open
   * left a full-screen scrim over the page with `overflow: hidden` on the body
   * and no visible control to lift either. Measured after a 390 to 1440 resize:
   * scrim still painted, close button not displayed, body still locked.
   *
   * The 1024px is Tailwind's `lg` written out. There is no way to ask the
   * stylesheet, so the comment is the link — change one and change this.
   */
  useEffect(() => {
    if (!drawerOpen) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    const settle = () => {
      if (wide.matches) setDrawerOpen(false);
    };
    settle();
    wide.addEventListener('change', settle);
    return () => wide.removeEventListener('change', settle);
  }, [drawerOpen]);

  function chooseRail(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // Not persisting is survivable; failing to collapse is not.
    }
  }

  // Keep the document language in step with the switcher, so screen readers
  // and browser translation follow what is actually on screen.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function chooseLocale(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Not persisting a preference is survivable; failing to switch is not.
    }
  }

  /**
   * The three modes, with the icon each one earns.
   *
   * Not decoration: at the collapsed width the icon is the only thing left, so
   * it has to carry the whole meaning. A wand for the rewrite, two branches for
   * the comparison, a receipt for the bill somebody already paid.
   */
  /**
   * The classes a rail row needs that CANNOT be set from the list.
   *
   * The second time this trap was hit in one pull request. `TabsTrigger`
   * carries `group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent`
   * and a bare `text-foreground/60`; a `[&_button[data-state=active]]:bg-layer-active`
   * from the list is the same declaration at lower specificity, so the active
   * row had NO surface at all — measured `rgba(0,0,0,0)` in both themes, with
   * the collapsed rail signalling the current mode by icon hue alone. And the
   * inactive labels sat at 3.77:1 in light, because the dark theme had been
   * given a token and the light one left on shadcn's `/60` opacity.
   *
   * Set here, on the trigger, in the primitive's own variant, where
   * tailwind-merge can drop the declaration being replaced.
   */
  /*
    A focus ring at full strength, with the rail's own colour behind it.

    shadcn's default is `ring-ring/50` — the ring colour at half alpha, which
    measured 2.03:1 against this rail. WCAG asks 3:1 of a focus indicator, and
    a rail is exactly where a keyboard reader needs to know where they are.
    Full alpha and a 2px offset in the rail's colour, so the ring reads as
    sitting on the rail rather than as part of the row's own surface.

    Worth saying because the first version of this comment said these controls
    had no indicator AT ALL, on the strength of a probe that read
    `getComputedStyle` the instant after Tab — while `transition-all` was three
    percent of the way through the ring. The controls were under-contrast, not
    unmarked. Measure after the transition settles, or measure a lie.
  */
  const FOCUS_RING =
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-muted';

  const ROW =
    FOCUS_RING + ' ' +
    'text-muted-foreground ' +
    'group-data-[variant=line]/tabs-list:data-[state=active]:bg-layer-active ' +
    // And again for dark, which carries its OWN
    // `dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent`
    // — one specificity step above the light rule, so fixing light alone left
    // the dark rail's active row measuring rgba(0,0,0,0) exactly as before.
    'dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-layer-active ' +
    'group-data-[orientation=vertical]/tabs:data-[state=active]:text-foreground';

  const MODES = [
    { value: 'optimise', label: t.compare.optimiseTab, Icon: Wand2 },
    { value: 'compare', label: t.compare.tab, Icon: GitCompare },
    { value: 'bill', label: t.bill.tab, Icon: Receipt },
  ] as const;

  /**
   * The rail's width for THIS rendering, which is not always the preference.
   *
   * `collapsed` is a desktop choice and it was being applied to the drawer as
   * well, so a reader who collapsed the rail on a laptop and later opened the
   * menu on their phone got a 248px drawer containing a 60px rail: no wordmark,
   * three tab labels all `sr-only`, and no expand control, because the only one
   * is `lg:flex`. An icon column with no labels and nothing on the device that
   * can undo it. The drawer is always the full presentation; the preference is
   * kept, and applies again the next time there is a rail to apply it to.
   */
  const railCollapsed = collapsed && !drawerOpen;

  const rail = (
    <>
      {/*
        The mark is the rail's first row, and is built like one.

        It used to carry its own `px-3`, which put the glyph 12px from the edge
        while every nav icon below it sat at 19 — a logo hanging seven pixels
        left of the column it heads. The nesting here is not decoration: the
        outer box takes the tab list's own padding and the inner one takes a
        row's, so the glyph lands in the same column by construction rather
        than by a number somebody has to keep in step. Collapsed, both are
        dropped and the glyph is simply centred, like every other glyph.
      */}
      <div className={cn('flex h-14 items-center', railCollapsed ? 'justify-center' : 'px-2')}>
        <div
          className={cn(
            'flex min-w-0 items-center gap-2.5',
            !railCollapsed && 'border border-transparent px-2.5',
            // Room for the drawer's close button, which is absolutely
            // positioned in this corner and only exists below `lg`. Without it
            // the Spanish tagline ran 13px under a 32px tap target and lost its
            // last three characters to it. Truncating is the right answer;
            // colliding is not.
            'pr-10 lg:pr-2.5',
          )}
        >
          <svg
            viewBox="0 0 22 22"
            aria-hidden="true"
            className="size-[17px] shrink-0 text-terracotta"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 5 11 11l-6.5 6" />
            <path d="M14 17h4.5" />
          </svg>
          {!railCollapsed && (
            <span className="flex min-w-0 flex-col">
              <h1 className="font-display text-[19px] leading-none font-semibold tracking-[-0.01em]">
                Trazum
              </h1>
              <span className="truncate text-[11px] text-faint" title={t.meta.tagline}>
              {t.meta.tagline}
            </span>
            </span>
          )}
        </div>
      </div>

      {/*
        The nav is the Tabs list. Radix still owns which panel is shown, so the
        rail and the content cannot disagree about the current mode — and the
        keyboard behaviour a tablist already has comes with it.
      */}
      <TabsList
        variant="line"
        className={cn(
          'h-auto w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-2',
          // No `justify-*` here on purpose. `TabsTrigger` sets its own
          // `group-data-[orientation=vertical]/tabs:justify-start`, and a
          // `[&_button]:justify-center` from this parent loses the cascade to
          // it — same declaration, higher specificity, so the collapsed rail
          // silently kept left-aligned icons that measured 12.5px off centre
          // while every other glyph in the rail was centred. The override
          // belongs on the trigger, in the same variant, where tailwind-merge
          // can drop the one it replaces.
          '[&_button]:h-auto [&_button]:w-full [&_button]:gap-2.5',
          '[&_button]:rounded-md [&_button]:px-2.5 [&_button]:py-2 [&_button]:text-[14px]',
          '[&_button:hover]:bg-layer-hover',
          // The active icon takes the mark's colour. Collapsed, the icon is the
          // whole row, so this has to carry weight on its own — and for a while
          // it was carrying ALL of it, see the trigger below.
          '[&_button[data-state=active]_svg]:text-terracotta',
          // The `line` variant draws its marker on the trailing edge, which in
          // a vertical list is a bar sticking out of the rail's border. The
          // active row is marked by its own surface instead.
          '[&_button]:after:hidden',
          railCollapsed && '[&_button]:px-0',
        )}
      >
        {MODES.map(({ value, label, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            title={railCollapsed ? label : undefined}
            className={cn(ROW, railCollapsed && 'group-data-[orientation=vertical]/tabs:justify-center')}
            // Choosing a mode is what the drawer was opened for, so it closes
            // itself. Leaving it open would hide the panel it just switched to
            // behind the menu that switched it.
            onClick={() => setDrawerOpen(false)}
          >
            <Icon className="size-[17px] shrink-0" aria-hidden="true" />
            {/*
              Collapsed, the label is still read out — it is only not drawn.
              A `title` alone would leave the tab's accessible name resting on
              the weakest source the accessibility tree has, on the one control
              a reader has no other way to identify.
            */}
            <span className={cn('truncate', railCollapsed && 'sr-only')}>{label}</span>
          </TabsTrigger>
        ))}
        {signedIn && <TabsTrigger
          value="library"
          title={railCollapsed ? t.library.tab : undefined}
          className={cn(ROW, railCollapsed && 'group-data-[orientation=vertical]/tabs:justify-center')}
          onClick={() => setDrawerOpen(false)}
        >
          <BookMarked className="size-[17px] shrink-0" aria-hidden="true" />
          <span className={cn('truncate', railCollapsed && 'sr-only')}>{t.library.tab}</span>
        </TabsTrigger>}
      </TabsList>

      {/* Account and language live at the foot of the rail: page-level controls,
          not part of the navigation, and reached last rather than first. */}
      <div className={cn('mt-auto flex flex-col gap-2 border-t p-2', railCollapsed && 'items-center')}>
        <Account t={t} session={session} collapsed={railCollapsed} />
        <div
          className={cn('flex gap-0.5 rounded-lg border p-0.5', railCollapsed && 'flex-col')}
          role="group"
          aria-label={t.page.localeSwitchLabel}
        >
          {LOCALES.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={option === locale}
              onClick={() => chooseLocale(option)}
              className={cn(
                // `flex-1` is right in a row and wrong in a column: stacked, it
                // made the two buttons share the group's height and each render
                // 18px against a declared 28. Collapsed they keep their own
                // height and simply fill the width.
                'h-7 px-2 text-[12px] font-normal text-muted-foreground',
                FOCUS_RING,
                railCollapsed ? 'w-full shrink-0' : 'flex-1',
                option === locale && 'bg-muted text-foreground',
              )}
            >
              {railCollapsed ? option.toUpperCase() : getWebMessages(option).endonym}
            </Button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    /*
      A column below `lg`, a row at it.

      The Tabs root is a flex container, and with `orientation="vertical"` the
      primitive leaves it a row so the rail can sit beside the panels. On a
      phone that made the top bar a *column* 128px wide standing next to the
      content, which had 261px of a 390px screen left to work with. The rail is
      `fixed` below `lg` and out of the flow entirely, so stacking here costs
      nothing and puts the bar where a bar goes.
    */
    <Tabs
      defaultValue="optimise"
      orientation="vertical"
      className="min-h-screen flex-col gap-0 lg:flex-row"
    >
      {/*
        A bar that exists only where the rail cannot: below `lg` there is no
        room for a persistent 236px column, so the same navigation arrives as a
        drawer and this bar is what opens it.
      */}
      <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-rule-strong bg-background/90 px-3 backdrop-blur-md lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          aria-label={t.page.openMenu}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-[18px]" aria-hidden="true" />
        </Button>
        <span className="font-display text-[17px] leading-none font-semibold">Trazum</span>
      </div>

      {/* The scrim. Clicking it closes, which is the other half of Escape. Its
          colour is a token of its own rather than `--foreground`, which in the
          dark theme is a near-white and turned this into a floodlight. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-scrim backdrop-blur-[2px] lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        // Below `lg` this is a modal overlay over a scrim, so it says so. At
        // `lg` it is an ordinary landmark and the dialog roles come off — a
        // permanent sidebar announcing itself as a modal dialog is a worse
        // lie than none.
        {...(drawerOpen
          ? { role: 'dialog', 'aria-modal': true, 'aria-label': t.page.openMenu }
          : {})}
        ref={railRef}
        className={cn(
          'z-50 flex shrink-0 flex-col border-r bg-muted transition-[width] duration-150',
          /*
            The width animates; the contents do not. Every label re-renders at
            full size on the first frame while the box is still 60px wide, and
            with nothing clipping it and `z-50` above the page, the language
            toggle was drawn 75px out into the main column — and answered
            hit-tests there, `elementFromPoint(130, 842)` returning a rail
            button 70px past the rail's edge for the first ~50ms of every
            expand. `overflow-x` clips the horizontal spill; leaving `overflow-y`
            to compute to `auto` means a short window scrolls the rail rather
            than cutting it off.
          */
          'overflow-x-hidden',
          // Below lg it is an overlay that slides; at lg it is simply there.
          'fixed inset-y-0 left-0 w-[248px] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          // `invisible`, not just translated away. Off-screen is not gone: a
          // closed drawer kept five controls in the tab order at 390px, so the
          // second Tab from the top of the page landed on a Close button
          // sitting at x=-248. `visibility: hidden` takes them out of the tree
          // and is undone by a media query at `lg`, where the rail is real.
          drawerOpen ? 'translate-x-0' : '-translate-x-full invisible lg:visible',
          collapsed ? 'lg:w-[60px]' : 'lg:w-[236px]',
        )}
      >
        {/*
          One rail, not one per breakpoint.
          
          The first version rendered `rail` twice — inside an `lg:hidden` block
          and again inside a `hidden lg:flex` one. Hidden is not absent: that
          put two tablists on the page controlling the same panels, two
          `role="tab"` elements per mode for a screen reader to read out, and
          two `Account` components each fetching the session. Visibility is a
          style; duplication is a bug.
        */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 size-8 p-0 lg:hidden"
          aria-label={t.page.closeMenu}
          onClick={() => setDrawerOpen(false)}
        >
          <X className="size-[18px]" aria-hidden="true" />
        </Button>
        {rail}

        {/*
          The collapse control belongs to the rail and only exists where the
          rail does. On a phone the drawer is already the collapsed state.
        */}
        <button
          type="button"
          onClick={() => chooseRail(!collapsed)}
          aria-label={collapsed ? t.page.expandRail : t.page.collapseRail}
          className="hidden items-center justify-center border-t py-2 text-muted-foreground transition-colors hover:bg-layer-hover hover:text-foreground lg:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[16px]" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-[16px]" aria-hidden="true" />
          )}
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-5 pt-6 pb-16 lg:px-8">
        <div className="mx-auto max-w-[1080px]">
          <p className="mt-0 mb-6 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
            {t.page.lede}
          </p>

          <TabsContent value="optimise" forceMount className="data-[state=inactive]:hidden">
            <Optimizer locale={locale} t={t} scenario={scenario} promptText={promptText} />
          </TabsContent>
          <TabsContent value="compare" forceMount className="data-[state=inactive]:hidden">
            <Comparer
              locale={locale}
              t={t}
              scenario={scenario}
              modelName={modelName}
              models={models}
            />
          </TabsContent>
          <TabsContent value="bill" forceMount className="data-[state=inactive]:hidden">
            <Bill t={t} />
          </TabsContent>
          {signedIn && (
            <TabsContent value="library">
              <Library
                t={t}
                locale={locale}
                currentPrompt={promptText.value}
                onRestore={(text) => promptText.set(text)}
              />
            </TabsContent>
          )}

          <footer className="mt-8 border-t pt-3.5 text-xs text-faint">
            {t.page.footerLead(pricingReviewed)}
            <code className="font-mono">--exact-tokens</code>
            {t.page.footerTail}
          </footer>
        </div>
      </main>
    </Tabs>
  );
}
