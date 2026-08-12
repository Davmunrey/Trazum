'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@trazum/core';

import { Account } from './Account';
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
    <main className="mx-auto max-w-[1180px] px-5 pt-7 pb-16">
      <header className="mb-1.5 flex flex-wrap items-baseline gap-3">
        {/* A drawn mark rather than a stock glyph: a prompt caret with the
            trailing dashes of what the tool takes out. Two paths, no asset,
            and it inherits the terracotta from the palette. */}
        <span className="flex items-baseline gap-2">
          <svg
            viewBox="0 0 22 22"
            aria-hidden="true"
            className="size-[19px] shrink-0 translate-y-px text-terracotta"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 4.5 12 11l-8 6.5" />
            <path d="M15.5 17.5h3" strokeDasharray="1 3.2" />
          </svg>
          <h1 className="font-display text-[27px] leading-none font-semibold tracking-[-0.01em]">
            Trazum
          </h1>
        </span>
        <span className="text-sm text-muted-foreground">{t.meta.tagline}</span>

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
      </header>

      <p className="mt-0 mb-7 max-w-[62ch] text-muted-foreground">{t.page.lede}</p>

      <Tabs defaultValue="optimise">
        <TabsList className="mb-5">
          <TabsTrigger value="optimise">{t.compare.optimiseTab}</TabsTrigger>
          <TabsTrigger value="compare">{t.compare.tab}</TabsTrigger>
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

      <footer className="mt-8 border-t pt-3.5 text-xs text-muted-foreground">
        {t.page.footerLead(pricingReviewed)}
        <code className="font-mono">--exact-tokens</code>
        {t.page.footerTail}
      </footer>
    </main>
  );
}
