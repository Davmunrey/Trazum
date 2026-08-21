'use client';

import { useEffect, useState } from 'react';

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

  return (
    <>
      {/*
        A bar, not a row of things that happen to be at the top.
        
        The header was a wrap-around flex line: wordmark, tagline, account and
        language all at the same altitude, so nothing said "this is the
        application's chrome and the rest is the work". A bar with its own rule
        and a sticky position separates the two, and it is the only element on
        the page that spans the full width — which is what makes it read as the
        frame rather than as the first card.
      */}
      <header className="sticky top-0 z-40 border-b border-rule-strong bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-5">
        {/* A drawn mark rather than a stock glyph: the prompt caret and its
            cursor, which is where a prompt is written and the only place this
            tool ever touches. Two paths, no asset, and it takes the terracotta
            from the palette. */}
        <span className="flex items-baseline gap-2">
          <svg
            viewBox="0 0 22 22"
            aria-hidden="true"
            className="size-[18px] shrink-0 translate-y-px text-terracotta"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 5 11 11l-6.5 6" />
            <path d="M14 17h4.5" />
          </svg>
          <h1 className="font-display text-[22px] leading-none font-semibold tracking-[-0.01em]">
            Trazum
          </h1>
        </span>
        {/*
          Dropped below `sm`. On a 390px screen the tagline and the two
          controls cannot share a line without one of them wrapping, and a
          wrapping bar stops being a bar. The name and the controls are what
          the bar is for; the tagline is said again in the lede below.
        */}
        <span className="hidden text-[13px] text-faint sm:inline">{t.meta.tagline}</span>

        {/* Pushed to the far end so they read as page-level controls rather
            than as part of the title. */}
        <div className="ml-auto flex items-center gap-3">
          <Account t={t} />

          <div
            className="flex gap-0.5 rounded-lg border p-0.5"
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
                  'h-7 px-2.5 text-[13px] font-normal text-muted-foreground',
                  option === locale && 'bg-muted text-foreground',
                )}
              >
                {getWebMessages(option).endonym}
              </Button>
            ))}
          </div>
        </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pt-7 pb-16">
        {/*
          The lede is five lines of prose above the tool it describes, and it
          is the first thing on the page — so on a laptop the thing somebody
          came to use started below the fold. Kept, because it is the honest
          description of what this does, and given the width and weight of
          supporting copy rather than of a headline.
        */}
        <p className="mt-0 mb-7 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
          {t.page.lede}
        </p>

      <Tabs defaultValue="optimise">
        {/*
          The three modes are the page's real navigation, and they were dressed
          as a settings toggle: a small pill group in the sunken grey, the same
          weight as a rule-level switch. They are not one control with three
          positions — Optimise shortens a prompt, Compare judges two of them,
          and Your bill reads a usage log, which are three different jobs on
          three different inputs.

          A line variant with a terracotta marker says "you are here" the way a
          nav does. Styled from the list rather than on each trigger, because a
          test pins the exact source of the Library trigger and a className
          there would break it — and because a rule that lives once cannot
          drift between four call sites.
        */}
        <TabsList
          variant="line"
          className="mb-6 h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0
            [&_button]:h-auto [&_button]:flex-none [&_button]:rounded-none [&_button]:px-3.5 [&_button]:py-2.5
            [&_button]:text-[15px] [&_button]:font-medium
            [&_button:hover]:bg-layer-hover
            [&_button[data-state=active]]:text-foreground
            [&_button[data-state=active]]:after:bg-terracotta
            [&_button[data-state=active]]:after:bottom-[-1px]
            [&_button[data-state=active]]:after:h-[2px]">
          <TabsTrigger value="optimise">{t.compare.optimiseTab}</TabsTrigger>
          <TabsTrigger value="compare">{t.compare.tab}</TabsTrigger>
          <TabsTrigger value="bill">{t.bill.tab}</TabsTrigger>
          {signedIn && <TabsTrigger value="library">{t.library.tab}</TabsTrigger>}
        </TabsList>

        {/*
          Both tabs stay mounted. Switching to Compare and back must not throw
          away a result somebody is still reading, and Radix unmounts inactive
          content unless told otherwise.
        */}
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
        {/*
          forceMount for the same reason as Optimise and Compare: the pasted
          log and its report exist nowhere but this tab — the whole point of
          the tab is that they were never sent anywhere — so unmounting it
          would destroy the one copy.
        */}
        <TabsContent value="bill" forceMount className="data-[state=inactive]:hidden">
          <Bill t={t} />
        </TabsContent>
        {signedIn && (
          // Not forceMount, unlike the other two: this tab holds no unsaved
          // work — everything in it is already on the server — and remounting
          // re-reads the list, which is the behaviour you want on return.
          <TabsContent value="library">
            <Library
              t={t}
              locale={locale}
              currentPrompt={promptText.value}
              onRestore={(text) => promptText.set(text)}
            />
          </TabsContent>
        )}
      </Tabs>

        <footer className="mt-8 border-t pt-3.5 text-xs text-faint">
          {t.page.footerLead(pricingReviewed)}
          <code className="font-mono">--exact-tokens</code>
          {t.page.footerTail}
        </footer>
      </main>
    </>
  );
}
