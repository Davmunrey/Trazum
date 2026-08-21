'use client';

import { useEffect, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Receipt, GitCompare, BookMarked, Wand2, X } from 'lucide-react';

import type { Locale } from '@trazum/core';

import { Account } from './Account';
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

  // The Library tab appears only for a signed-in reader. Rendered from the same
  // endpoint the header uses, so the tab and the button cannot disagree about
  // whether this deployment has accounts.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.user) setSignedIn(true);
      })
      .catch(() => {
        // No answer means no tab. A library nobody can read is worse than absent.
      });
    return () => {
      cancelled = true;
    };
  }, []);
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
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
  const MODES = [
    { value: 'optimise', label: t.compare.optimiseTab, Icon: Wand2 },
    { value: 'compare', label: t.compare.tab, Icon: GitCompare },
    { value: 'bill', label: t.bill.tab, Icon: Receipt },
  ] as const;

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
      <div className={cn('flex h-14 items-center', collapsed ? 'justify-center' : 'px-2')}>
        <div
          className={cn(
            'flex min-w-0 items-center gap-2.5',
            !collapsed && 'border border-transparent px-2.5',
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
          {!collapsed && (
            <span className="flex min-w-0 flex-col">
              <h1 className="font-display text-[19px] leading-none font-semibold tracking-[-0.01em]">
                Trazum
              </h1>
              <span className="truncate text-[11px] text-faint">{t.meta.tagline}</span>
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
          '[&_button[data-state=active]]:bg-layer-active [&_button[data-state=active]]:text-foreground',
          // The active icon takes the mark's colour. Collapsed, the icon is the
          // whole row, and a surface one shade off the rail's own is not a
          // strong enough answer to "which mode am I in".
          '[&_button[data-state=active]_svg]:text-terracotta',
          // The `line` variant draws its marker on the trailing edge, which in
          // a vertical list is a bar sticking out of the rail's border. The
          // active row is marked by its own surface instead.
          '[&_button]:after:hidden',
          collapsed && '[&_button]:px-0',
        )}
      >
        {MODES.map(({ value, label, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            title={collapsed ? label : undefined}
            className={cn(collapsed && 'group-data-[orientation=vertical]/tabs:justify-center')}
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
            <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
          </TabsTrigger>
        ))}
        {signedIn && <TabsTrigger
          value="library"
          title={collapsed ? t.library.tab : undefined}
          className={cn(collapsed && 'group-data-[orientation=vertical]/tabs:justify-center')}
          onClick={() => setDrawerOpen(false)}
        >
          <BookMarked className="size-[17px] shrink-0" aria-hidden="true" />
          <span className={cn('truncate', collapsed && 'sr-only')}>{t.library.tab}</span>
        </TabsTrigger>}
      </TabsList>

      {/* Account and language live at the foot of the rail: page-level controls,
          not part of the navigation, and reached last rather than first. */}
      <div className={cn('mt-auto flex flex-col gap-2 border-t p-2', collapsed && 'items-center')}>
        <Account t={t} collapsed={collapsed} />
        <div
          className={cn('flex gap-0.5 rounded-lg border p-0.5', collapsed && 'flex-col')}
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
                'h-7 flex-1 px-2 text-[12px] font-normal text-muted-foreground',
                option === locale && 'bg-muted text-foreground',
              )}
            >
              {collapsed ? option.toUpperCase() : getWebMessages(option).endonym}
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

      {/* The scrim. Clicking it closes, which is the other half of Escape. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'z-50 flex shrink-0 flex-col border-r bg-muted transition-[width] duration-150',
          // Below lg it is an overlay that slides; at lg it is simply there.
          'fixed inset-y-0 left-0 w-[248px] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
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
