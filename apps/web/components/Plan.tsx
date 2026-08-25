'use client';

import { useRef, useState } from 'react';

import {
  BUNDLED_CATALOGUE,
  UNLABELLED,
  buildPlan,
  formatUsd,
  parsePlanDocument,
  verifyPlan,
} from '@trazum/core';
import type {
  BillLevers,
  PlanAction,
  PlanAssumption,
  PlanDocument,
  PlanParseFailure,
  PlanVerification,
  UsageProfileReport,
  VerifiedAction,
} from '@trazum/core';

import { track } from './Analytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WebMessages } from '../lib/i18n';

/**
 * The plan, and the check that a plan came true — in the tab.
 *
 * The bill has been readable in the browser since 1.36. Everything the loop
 * does *with* a bill — rank the actions, save the decision, come back later
 * and ask whether it worked — has lived only in a terminal, which made the
 * web app a demo of the smallest half of the product.
 *
 * **The document is the bridge, and it is the same document.** The plan saved
 * from this panel is byte-for-byte what `trazum plan -o plan.json` writes:
 * commit it, gate on it in CI, verify it here or there. One contract, one
 * validator (`parsePlanDocument`, shared with the CLI), no server between the
 * two surfaces. A browser tool whose output the terminal will not accept is a
 * second product wearing the first one's name.
 *
 * Nothing here fetches. The plan is built from the report already in the tab,
 * a saved plan is read with `FileReader` and never uploaded, and the download
 * is a `Blob` the browser writes locally. The privacy promise the bill made in
 * 1.36 is kept the same way it was kept then: there is no endpoint to send
 * anything to.
 */

/** Actions shown before "…and N more". Enough to act on, short enough to read. */
const MAX_ACTIONS = 6;

export function Plan({
  report,
  levers,
  t,
}: {
  report: UsageProfileReport;
  levers: BillLevers;
  t: WebMessages;
}) {
  const plan = buildPlan(report, levers, BUNDLED_CATALOGUE.lastReviewed);
  const [verification, setVerification] = useState<PlanVerification | null>(null);
  const [refusal, setRefusal] = useState<PlanParseFailure | null>(null);
  const planInput = useRef<HTMLInputElement>(null);

  const labelName = (label: string): string => (label === UNLABELLED ? t.bill.unlabelled : label);

  /**
   * Saved as a file, not offered as a link.
   *
   * A link would mean this page storing somebody's bill somewhere, which is
   * an access-control question nobody has designed — the same call the store
   * made in 1.42, for the same reason. A file the reader already has needs no
   * such answer.
   */
  function savePlan() {
    const blob = new Blob([`${JSON.stringify({ ...plan, createdAt: new Date().toISOString() }, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plan.json';
    anchor.click();
    URL.revokeObjectURL(url);
    // Shape only, as everywhere in this app: how many actions, never which.
    track('plan-saved', { actions: plan.actions.length });
  }

  async function verifyAgainst(file: File | undefined) {
    if (!file) return;
    const parsed = parsePlanDocument(await file.text());
    if (!parsed.ok) {
      // A file that is not a plan is named as such, with what is wrong. Never
      // an empty verification: "0 of 0 arrived" reads as a clean result.
      setRefusal(parsed.why);
      setVerification(null);
      return;
    }
    setRefusal(null);
    setVerification(
      verifyPlan(parsed.plan, report, { currentPricingLastReviewed: BUNDLED_CATALOGUE.lastReviewed }),
    );
    track('plan-verified', { actions: parsed.plan.actions.length });
  }

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </CardTitle>
  );

  return (
    <>
      <Card className="gap-4 py-[18px]">
        <CardHeader className="px-[18px]">
          <Eyebrow>{t.plan.heading}</Eyebrow>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-[18px] text-sm">
          {plan.actions.length === 0 ? (
            <span className="text-muted-foreground">{t.plan.nothingToDo}</span>
          ) : (
            <>
              {/*
                The two totals never become one number. A projection and a
                measurement summed is a figure that is neither, and the plan
                has kept them apart since it shipped in 1.38.
              */}
              <div className="flex flex-col gap-1">
                <span>{t.plan.projected(formatUsd(plan.projectedSavingUsd))}</span>
                {plan.measuredStakeUsd > 0 && (
                  <span>{t.plan.staked(formatUsd(plan.measuredStakeUsd))}</span>
                )}
                <span className="text-[13px] text-muted-foreground">{t.plan.neverSummed}</span>
              </div>

              <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                {plan.actions.slice(0, MAX_ACTIONS).map((action, index) => (
                  <li key={`${action.kind}:${action.label}:${action.model}`} className="flex flex-col gap-0.5">
                    <span>
                      <span className="text-muted-foreground">{index + 1}. </span>
                      {t.plan.action(action.kind, labelName(action.label), action.model)}
                      {': '}
                      <span className="font-semibold">{moneyFor(action, t)}</span>
                    </span>
                    {action.detail.routeTo && (
                      <span className="text-[13px] text-muted-foreground">
                        {t.plan.routeTo(action.detail.routeTo.displayName)}
                      </span>
                    )}
                    {action.assumes.map((assumption) => (
                      <span key={assumptionKey(assumption)} className="text-[13px] text-terracotta">
                        {t.plan.assumes(assumptionText(assumption, t))}
                      </span>
                    ))}
                    {action.check !== null && (
                      <span className="text-[13px] text-muted-foreground">
                        {t.plan.check}
                        <code className="font-mono">{action.check}</code>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {plan.actions.length > MAX_ACTIONS && (
                <span className="text-[13px] text-muted-foreground">
                  {t.plan.andMore(plan.actions.length - MAX_ACTIONS)}
                </span>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={savePlan}>
                  {t.plan.save}
                </Button>
                <span className="text-[13px] text-muted-foreground">{t.plan.saveNote}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 py-[18px]">
        <CardHeader className="px-[18px]">
          <Eyebrow>{t.plan.verifyHeading}</Eyebrow>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-[18px] text-sm">
          <p className="m-0 max-w-[72ch] text-muted-foreground">{t.plan.verifyLede}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => planInput.current?.click()}
            >
              {t.plan.chooseePlan}
            </Button>
            <input
              ref={planInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                void verifyAgainst(event.target.files?.[0]);
              }}
            />
          </div>

          {refusal !== null && (
            <span className="text-terracotta">{t.plan.notAPlan(refusalText(refusal, t))}</span>
          )}

          {verification !== null && (
            <div className="flex flex-col gap-2">
              {/*
                Three outcomes, never two — the posture `verify` has had since
                1.39. "Not arrived" and "cannot tell" are different sentences
                and a reader acts on them differently.
              */}
              <span>
                {t.plan.tally(verification.arrived, verification.notArrived, verification.cannotTell)}
              </span>
              {verification.pricesChanged && (
                <span className="text-terracotta">
                  {t.plan.pricesChanged(verification.planPricing, verification.currentPricing)}
                </span>
              )}
              {verification.actions.length === 0 && (
                <span className="text-muted-foreground">{t.plan.emptyPlan}</span>
              )}
              {verification.actions.map((verified) => (
                <VerifiedRow
                  key={`${verified.action.kind}:${verified.action.label}:${verified.action.model}`}
                  verified={verified}
                  labelName={labelName}
                  t={t}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function VerifiedRow({
  verified,
  labelName,
  t,
}: {
  verified: VerifiedAction;
  labelName: (label: string) => string;
  t: WebMessages;
}) {
  const tone =
    verified.outcome === 'arrived'
      ? 'text-good'
      : verified.outcome === 'not-arrived'
        ? 'text-terracotta'
        : 'text-muted-foreground';
  return (
    <div className="flex flex-col gap-0.5">
      <span className={tone}>
        {t.plan.verifiedAction(
          verified.action.kind,
          labelName(verified.action.label),
          verified.action.model,
          verified.outcome,
        )}
      </span>
      {verified.reason !== null && (
        <span className="text-[13px] text-muted-foreground">{t.plan.cannotTell(verified.reason)}</span>
      )}
      {/*
        The world's movement, never a verdict: the measured before and after,
        so "the saving did not arrive" can be told from "the traffic tripled".
      */}
      {verified.attribution?.calls && (
        <span className="text-[13px] text-muted-foreground">
          {t.plan.callsMoved(verified.attribution.calls.before, verified.attribution.calls.after)}
        </span>
      )}
    </div>
  );
}

/** The money on an action: projected or staked, and never both. */
function moneyFor(action: PlanAction, t: WebMessages): string {
  if (action.savingUsd !== null) return t.plan.projectedAmount(formatUsd(action.savingUsd));
  if (action.stakeUsd !== null) return t.plan.stakedAmount(formatUsd(action.stakeUsd));
  return t.plan.noAmount;
}

/** Stable key for an assumption, which carries no id of its own. */
function assumptionKey(assumption: PlanAssumption): string {
  return 'model' in assumption ? `${assumption.kind}:${assumption.model}` : assumption.kind;
}

function assumptionText(assumption: PlanAssumption, t: WebMessages): string {
  return 'model' in assumption
    ? t.plan.assumeModel(assumption.model)
    : t.plan.assumeKind(assumption.kind);
}

function refusalText(why: PlanParseFailure, t: WebMessages): string {
  switch (why.kind) {
    case 'not-json':
      return t.plan.refusalNotJson;
    case 'not-an-object':
      return t.plan.refusalNotAnObject;
    case 'wrong-schema-version':
      return t.plan.refusalSchemaVersion(JSON.stringify(why.found));
    case 'actions-not-a-list':
      return t.plan.refusalNoActions;
    case 'action-malformed':
      return t.plan.refusalActionMalformed(why.index + 1, why.because);
  }
}

export type { PlanDocument };
