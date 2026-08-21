'use client';

import { useState } from 'react';

import { formatSignedUsd } from '@trazum/core';
import type { AdvisoryId, Locale, RuleId } from '@trazum/core';

import { track } from './Analytics';
import { AnimatedContent } from './motion/AnimatedContent';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { WebMessages } from '../lib/i18n';
import type { Scenario } from '../lib/scenario';
import { ShareControl } from './ShareControl';

/**
 * Two versions of a prompt, and what the edit cost.
 *
 * A separate component from `Optimizer` rather than a mode of it, because it
 * answers a different question and — crucially — **inverts the sign convention**.
 * Everywhere else in this application a positive number is money you get back.
 * Here every figure is `after - before`, so positive means the edit made things
 * worse.
 *
 * That inversion is stated above the numbers, not beside them. A reader who has
 * spent the last ten minutes on the Optimise tab arrives with the opposite
 * expectation already loaded, and a caveat placed after the figure is a caveat
 * read after the conclusion.
 */

interface RuleTitle {
  id: RuleId;
  title: string;
}

interface Comparison {
  tokensBefore: number;
  tokensAfter: number;
  tokenDelta: number;
  deltaPct: number;
  monthlyDeltaUsd: number;
  perCallDeltaUsd: number;
  optimizeBoth: boolean;
  rules: { newlyFiring: RuleTitle[]; noLongerFiring: RuleTitle[] };
  advisories: { appeared: AdvisoryId[]; resolved: AdvisoryId[] };
  usage: { model: string; callsPerMonth: number };
}

const EXAMPLES: Record<Locale, { before: string; after: string }> = {
  en: {
    before: `Classify the support ticket in {{ticket}} into one of: billing, technical, account.

Answer with the category only.`,
    after: `Please, in order to help our users as effectively as possible, I would kindly ask you to carefully classify the support ticket in {{ticket}} into one of the following categories: billing, technical, account.

It is very important that you always double-check your answer before responding.

Answer with the category only. Thank you very much!`,
  },
  es: {
    before: `Clasifica el ticket de soporte de {{ticket}} en una de estas categorías: facturación, técnico, cuenta.

Responde solo con la categoría.`,
    after: `Por favor, para poder ayudar a nuestros usuarios de la forma más eficaz posible, te pido amablemente que clasifiques con mucho cuidado el ticket de soporte de {{ticket}} en una de las siguientes categorías: facturación, técnico, cuenta.

Es muy importante que verifiques siempre tu respuesta antes de contestar.

Responde solo con la categoría. ¡Muchas gracias!`,
  },
};

export function Comparer({
  locale,
  t,
  scenario,
  modelName,
  models,
}: {
  locale: Locale;
  t: WebMessages;
  scenario: Scenario;
  /** Display name for the scenario's model, resolved by the page. */
  modelName: string;
  models: readonly { id: string; displayName: string }[];
}) {
  const [before, setBefore] = useState(EXAMPLES[locale].before);
  const [after, setAfter] = useState(EXAMPLES[locale].after);
  const [optimizeBoth, setOptimizeBoth] = useState(false);
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  /** Signed, always. A bare `40` here is unreadable in either direction. */
  const signed = (value: number): string => `${value > 0 ? '+' : ''}${n(value)}`;

  async function compare() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          before,
          after,
          locale,
          optimizeBoth,
          usage: scenario.usage,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? t.errors.requestFailed);
        setResult(null);
      } else {
        setResult(data as Comparison);
        // Aggregate only, never the content of either version.
        track('compare', {
          direction: data.tokenDelta > 0 ? 'grew' : data.tokenDelta < 0 ? 'shrank' : 'flat',
          optimizeBoth,
        });
      }
    } catch {
      setError(t.errors.unreachable);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </CardTitle>
  );

  /** Growth is what somebody has to act on, so growth is what gets the colour. */
  const toneOf = (delta: number): string =>
    delta > 0 ? 'text-terracotta' : delta < 0 ? 'text-good' : 'text-muted-foreground';

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-[18px]">
        <Card className="gap-4 py-[18px]">
          <CardHeader className="px-[18px]">
            <Eyebrow>{t.compare.beforeLabel}</Eyebrow>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 px-[18px]">
            <Textarea
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              spellCheck={false}
              aria-label={t.compare.beforeLabel}
              className="min-h-44 resize-y bg-muted font-mono text-[13px] leading-relaxed"
            />
            <span className="text-xs text-muted-foreground">{t.compare.beforeHint}</span>
          </CardContent>
        </Card>

        <Card className="gap-4 py-[18px]">
          <CardHeader className="px-[18px]">
            <Eyebrow>{t.compare.afterLabel}</Eyebrow>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 px-[18px]">
            <Textarea
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              spellCheck={false}
              aria-label={t.compare.afterLabel}
              className="min-h-44 resize-y bg-muted font-mono text-[13px] leading-relaxed"
            />
            <span className="text-xs text-muted-foreground">{t.compare.afterHint}</span>
          </CardContent>
        </Card>

        <Card className="gap-4 py-[18px]">
          <CardContent className="flex flex-col gap-3.5 px-[18px]">
            <div className="flex items-start gap-3">
              <Switch
                id="optimizeBoth"
                checked={optimizeBoth}
                onCheckedChange={setOptimizeBoth}
                className="mt-0.5"
              />
              <Label htmlFor="optimizeBoth" className="grid cursor-pointer gap-0.5 font-normal">
                <span className="text-sm text-foreground">{t.compare.optimizeBoth}</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  {t.compare.optimizeBothHint}
                </span>
              </Label>
            </div>

            {/*
              The two settings the money below depends on, here rather than only
              on the Optimise tab. A figure that reads "at 10,000 calls with
              Claude Opus 5" beside no way to change either is a figure resting
              on a setting the reader cannot see.

              Bound to the page's scenario, so changing them here changes them
              there too — which is the point of lifting the state. Duplicating
              two controls is not duplicating the answer.
            */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="compare-model" className="text-xs text-muted-foreground">
                  {t.input.model}
                </Label>
                <Select
                  value={scenario.usage.model}
                  onValueChange={(value) => scenario.set('model', value)}
                >
                  <SelectTrigger id="compare-model" className="w-full bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="compare-calls" className="text-xs text-muted-foreground">
                  {t.input.callsPerMonth}
                </Label>
                <Input
                  id="compare-calls"
                  type="number"
                  min={1}
                  value={scenario.usage.callsPerMonth}
                  onChange={(e) =>
                    scenario.set('callsPerMonth', Math.max(1, Number(e.target.value) || 0))
                  }
                  className="bg-muted"
                />
              </div>
            </div>

            <Button onClick={compare} disabled={loading} className="w-full">
              {loading ? t.compare.working : t.compare.submit}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-[18px]">
        {error !== null && (
          <Card className="gap-0 border-terracotta py-[18px]">
            <CardContent className="px-[18px] text-sm text-terracotta">{error}</CardContent>
          </Card>
        )}

        {/*
          The wait, in the shape of the answer.

          Same defect the Optimise tab had: the button said "Comparing…" and
          this column went on showing the lede, so the only sign that anything
          was happening was at the far side of the screen from where the reader
          is looking. The rows below are the report's real rows — the caveat,
          the headline figure, the two model lines — so nothing moves when the
          numbers arrive.
        */}
        {loading && error === null ? (
          <Card
            className="gap-4 py-[18px]"
            role="status"
            aria-live="polite"
            aria-label={t.compare.working}
          >
            <CardHeader className="px-[18px]">
              <Skeleton className="h-3 w-16" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5 px-[18px]">
              <Skeleton className="h-14 w-full rounded-lg" />
              <div className="rounded-lg border px-3.5 py-3">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="mt-2.5 h-3 w-52" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[76%]" />
            </CardContent>
          </Card>
        ) : result === null ? (
          <Card className="gap-0 py-[18px]">
            <CardContent className="px-[18px] text-sm text-muted-foreground">
              {t.compare.lede}
            </CardContent>
          </Card>
        ) : (
          <AnimatedContent>
            <Card className="gap-4 py-[18px]">
              <CardHeader className="px-[18px]">
                <Eyebrow>{t.compare.tab}</Eyebrow>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5 px-[18px]">
                {/*
                  First, before any figure. Somebody arriving from the Optimise tab
                  has the opposite convention loaded, and a caveat under the number
                  is a caveat read after the conclusion.
                */}
                <div className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-warn">
                  {t.compare.convention}
                </div>

                {result.optimizeBoth && (
                  <div className="text-[13px] text-muted-foreground">
                    {t.compare.measuringOptimised}
                  </div>
                )}

                <div className="rounded-lg border px-3.5 py-3">
                  <div
                    className={`font-display text-[26px] leading-tight font-semibold ${toneOf(result.tokenDelta)}`}
                  >
                    {result.tokenDelta === 0
                      ? t.compare.unchanged
                      : t.compare.delta(
                          signed(result.tokenDelta),
                          `${result.deltaPct > 0 ? '+' : ''}${result.deltaPct.toFixed(0)}%`,
                        )}
                  </div>
                  <div className="mt-1 text-[13px] text-muted-foreground">
                    {t.compare.tokens(n(result.tokensBefore), n(result.tokensAfter))}
                  </div>
                </div>

                {result.tokenDelta !== 0 && (
                  <div className="rounded-lg border px-3.5 py-3">
                    <div className={`text-[19px] font-semibold ${toneOf(result.monthlyDeltaUsd)}`}>
                      {t.compare.monthly(
                        formatSignedUsd(result.monthlyDeltaUsd),
                        n(result.usage.callsPerMonth),
                        modelName,
                      )}
                    </div>
                    <div className="mt-1 text-[13px] text-muted-foreground">
                      {t.compare.perCall(formatSignedUsd(result.perCallDeltaUsd))}
                    </div>
                  </div>
                )}

                {/*
                  What broke comes before what it cost. A reviewer who reads
                  "+$40 a month" and stops has missed that the edit also
                  introduced a contradiction.
                */}
                {result.advisories.appeared.length > 0 && (
                  <div>
                    <div className="mb-1 text-[13px] font-semibold text-terracotta">
                      {t.compare.advisoriesAppeared}
                    </div>
                    <ul className="m-0 list-none p-0 text-[13px]">
                      {result.advisories.appeared.map((id) => (
                        <li key={id} className="py-px">
                          {t.compare.advisoryLabel[id]}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.advisories.resolved.length > 0 && (
                  <div>
                    <div className="mb-1 text-[13px] font-semibold text-good">
                      {t.compare.advisoriesResolved}
                    </div>
                    <ul className="m-0 list-none p-0 text-[13px]">
                      {result.advisories.resolved.map((id) => (
                        <li key={id} className="py-px">
                          {t.compare.advisoryLabel[id]}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.rules.newlyFiring.length > 0 && (
                  <div>
                    <div className="mb-1 text-[13px] font-semibold">
                      {t.compare.rulesNewlyFiring}
                    </div>
                    <ul className="m-0 list-none p-0 text-[13px] text-muted-foreground">
                      {result.rules.newlyFiring.map((rule) => (
                        <li key={rule.id} className="py-px">
                          {rule.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.rules.noLongerFiring.length > 0 && (
                  <div>
                    <div className="mb-1 text-[13px] font-semibold">
                      {t.compare.rulesNoLongerFiring}
                    </div>
                    <ul className="m-0 list-none p-0 text-[13px] text-muted-foreground">
                      {result.rules.noLongerFiring.map((rule) => (
                        <li key={rule.id} className="py-px">
                          {rule.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </AnimatedContent>
        )}
      </div>
      {/*
        Below the result, not beside the inputs. Sharing is something you do to
        a comparison you have looked at, and a share button next to the text
        boxes invites publishing a prompt before reading what it says.
      */}
      <ShareControl
        t={t}
        before={before}
        after={after}
        settings={{
          // The Compare tab has no rule-level control and so always runs at
          // `safe`, which is what the endpoint defaults to when the field is
          // absent. Sent explicitly rather than omitted, so the share records
          // the level the comparison actually used instead of inheriting
          // whatever the default becomes later.
          level: 'safe',
          optimizeBoth,
          model: scenario.usage.model,
          callsPerMonth: scenario.usage.callsPerMonth,
          avgOutputTokens: scenario.usage.avgOutputTokens,
          cacheHitRate: scenario.usage.cacheHitRate,
          batchEligible: scenario.usage.batchEligible,
        }}
      />

    </div>
  );
}
