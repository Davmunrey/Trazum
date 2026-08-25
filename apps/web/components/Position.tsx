'use client';

import { useMemo, useState } from 'react';

import {
  BUNDLED_CATALOGUE,
  ConfigError,
  formatUsd,
  parseConfig,
  parseUsageLine,
  positionReport,
} from '@trazum/core';
import type { LimitsConfig, PositionDocument, SpendConfig } from '@trazum/core';

import { AnimatedContent } from './motion/AnimatedContent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { WebMessages } from '../lib/i18n';

/**
 * The position card — `trazum position` in the Bill tab, the fourth door on
 * one document.
 *
 * The other three doors (the CLI, its HTML page, the MCP tool) all call
 * `positionReport` and render what it returns; this card does exactly that
 * and nothing else, so four surfaces cannot disagree about where the month
 * stands. The ceilings come from the reader's own `trazum.config.json`,
 * parsed by the same `parseConfig` the CLI reads it with — the same
 * validation, the same error sentences, the same refusal of a negative
 * ceiling. No bespoke number fields that could accept what the schema
 * refuses.
 *
 * Like everything in this tab, nothing leaves the page: the log was already
 * pasted above, the config is parsed here, and there is no fetch in this
 * file.
 */

/** The parsed ceilings, or why there are none to parse. */
type ConfigState =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'no-ceilings' }
  | { kind: 'ceilings'; spend?: SpendConfig; limits?: LimitsConfig };

export function PositionCard({ logText, t }: { logText: string; t: WebMessages }) {
  const [pasted, setPasted] = useState('');
  const [config, setConfig] = useState<ConfigState>({ kind: 'none' });

  function readConfig() {
    let parsed;
    try {
      parsed = parseConfig(pasted);
    } catch (error) {
      // The parser's own sentence, verbatim: a config refused here is refused
      // at the CLI with the same words, which is the point of one parser.
      setConfig({
        kind: 'error',
        message: error instanceof ConfigError ? error.message : String(error),
      });
      return;
    }
    const hasCeilings =
      parsed.spend?.monthlyUsd !== undefined ||
      parsed.limits?.dayUsd !== undefined ||
      parsed.limits?.sessionUsd !== undefined ||
      Object.keys(parsed.limits?.byLabel ?? {}).length > 0;
    if (!hasCeilings) {
      // Valid and empty of ceilings is its own answer, never an empty report.
      setConfig({ kind: 'no-ceilings' });
      return;
    }
    setConfig({
      kind: 'ceilings',
      ...(parsed.spend === undefined ? {} : { spend: parsed.spend }),
      ...(parsed.limits === undefined ? {} : { limits: parsed.limits }),
    });
  }

  /**
   * The document, from the same parse the CLI does: split lines, parse each,
   * drop what does not parse (the bill above already counts skipped lines out
   * loud). Memoised on its two inputs — a large log re-parsed on every
   * keystroke of the config textarea would be waste; a stale document beside
   * a fresh log would be worse, so the log text is a dependency.
   */
  const document = useMemo<PositionDocument | null>(() => {
    if (config.kind !== 'ceilings') return null;
    const records = logText
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => parseUsageLine(line))
      .filter((record): record is NonNullable<ReturnType<typeof parseUsageLine>> => record !== null);
    return positionReport(
      records,
      {
        ...(config.spend === undefined ? {} : { spend: config.spend }),
        ...(config.limits === undefined ? {} : { limits: config.limits }),
      },
      { catalogue: BUNDLED_CATALOGUE },
    );
  }, [logText, config]);

  const scopeName = (entry: { scope: string; label: string | null }): string =>
    entry.scope === 'month'
      ? t.position.scopeMonth
      : entry.scope === 'day'
        ? t.position.scopeDay
        : t.position.scopeLabel(entry.label ?? '');

  return (
    <AnimatedContent>
      <Card className="gap-4 py-[18px]">
        <CardHeader className="px-[18px]">
          <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t.position.heading}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3.5 px-[18px]">
          <p className="m-0 max-w-[72ch] text-sm text-muted-foreground">{t.position.lede}</p>

          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            {t.position.configLabel}
            <Textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              spellCheck={false}
              aria-label={t.position.configAriaLabel}
              placeholder='{"spend":{"monthlyUsd":200},"limits":{"dayUsd":15,"byLabel":{"support":40}}}'
              className="min-h-20 resize-y bg-muted font-mono text-[13px] leading-relaxed"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={readConfig} disabled={pasted.trim() === ''} size="sm">
              {t.position.read}
            </Button>
            {config.kind !== 'none' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfig({ kind: 'none' })}
              >
                {t.position.clear}
              </Button>
            )}
          </div>

          {config.kind === 'error' && (
            <div className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-warn">
              {t.position.configError(config.message)}
            </div>
          )}
          {config.kind === 'no-ceilings' && (
            <div className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug">
              {t.position.noCeilings}
            </div>
          )}

          {document !== null && (
            <div className="flex flex-col gap-2.5">
              <div className="text-[15px] font-semibold">
                {t.position.monthHeading(document.month.id)}
              </div>

              {document.positions.map((position) => {
                const scope = scopeName(position);
                const key = `${position.scope}:${position.label ?? ''}`;
                if (position.verdict === 'cannot-tell') {
                  return (
                    <div key={key} className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug">
                      {t.position.cannotTell(scope)}
                    </div>
                  );
                }
                if (position.verdict === 'over') {
                  return (
                    <div key={key} className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-terracotta">
                      {t.position.over(
                        scope,
                        formatUsd(position.measuredUsd),
                        formatUsd(position.limitUsd),
                        formatUsd(-position.remainingUsd),
                      )}
                    </div>
                  );
                }
                return (
                  <div key={key} className="rounded-lg border border-l-[3px] border-l-good px-3.5 py-3 text-[13px] leading-snug">
                    {t.position.within(
                      scope,
                      formatUsd(position.measuredUsd),
                      formatUsd(position.limitUsd),
                      formatUsd(position.remainingUsd),
                      position.daysMeasured,
                      position.daysElapsed,
                    )}
                    {/*
                      Present only when `positionReport` granted it: under the
                      seven-day floor, on an over, and on a zero rate the field
                      is null and this line does not render — the card never
                      re-derives the arithmetic the document withheld.
                    */}
                    {position.distance !== null && (
                      <div className="mt-1 text-muted-foreground">
                        {t.position.distance(
                          position.distance.daysAway.toFixed(1),
                          formatUsd(position.distance.usdPerDay),
                          position.distance.overDays,
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {document.unmeasured.length > 0 && (
                <div className="flex flex-col gap-1 text-[13px]">
                  <span className="font-semibold">{t.position.unmeasuredHeading}</span>
                  {document.unmeasured.map((entry) => (
                    <span key={`${entry.scope}:${entry.label ?? ''}`} className="text-terracotta">
                      {t.position.unmeasured(scopeName(entry), t.position.why(entry.why))}
                    </span>
                  ))}
                </div>
              )}

              {/*
                Furniture, not footnotes — the 1.64 rule. The document's own
                sentences, verbatim: what it deliberately does not answer is
                part of the answer.
              */}
              {document.cannotSay.length > 0 && (
                <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
                  <span className="font-semibold">{t.position.cannotSayHeading}</span>
                  {document.cannotSay.map((code) => (
                    <span key={code}>{t.position.cannotSay[code] ?? code}</span>
                  ))}
                </div>
              )}

              {document.unpricedRecords > 0 && (
                <span className="text-[13px] text-terracotta">
                  {t.position.unpriced(document.unpricedRecords)}
                </span>
              )}

              <span className="text-[13px] text-muted-foreground">{t.position.source}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </AnimatedContent>
  );
}
