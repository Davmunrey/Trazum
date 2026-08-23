'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatUsd } from '@trazum/core';
import type { Locale } from '@trazum/core';

import { track } from './Analytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { WebMessages } from '../lib/i18n';

/**
 * The interview, as a form.
 *
 * **One question at a time, and the next one decided by the server**, because
 * which question is worth asking is the product here and a browser deriving it
 * would be a second implementation of the rule. What the client owns is the
 * answers; it holds all of them and sends all of them, so the route stays
 * stateless and never knows what somebody is halfway through writing.
 *
 * `next` is asked for rather than derived from `missing`. They look alike and
 * mean different things: `missing` holds only the **required** slots, and the
 * interview carries on through the optional ones. Deriving one from the other
 * is how a form starts skipping questions.
 */

interface SlotStanding {
  id: string;
  section: string | null;
  required: boolean;
  open: boolean;
}

interface Measured {
  complete: { required: number; answered: number; declined: string[]; missing: string[] };
  cheap: {
    tokens: number;
    model: string | null;
    monthlyUsd: number | null;
    provenance: 'estimated';
    budgetUsd: number | null;
    verdict: 'within' | 'over' | 'cannot-tell';
    reason: 'no-budget' | 'no-model' | 'model-unpriced' | null;
  };
  clean: { rules: { id: string; hits: number }[]; tokensRecoverable: number };
}

interface Draft {
  prompt: string | null;
  answered: string[];
  declined: string[];
  missing: string[];
  measured: Measured | null;
}

interface WriteResponse {
  draft: Draft;
  next: string | null;
  done: boolean;
  open: string[];
  slots: SlotStanding[];
}

/** Answers, where `null` is a decline — somebody was asked and said no. */
type Answers = Record<string, string | null>;

export function Writer({ t, locale }: { t: WebMessages; locale: Locale }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [typed, setTyped] = useState('');
  const [state, setState] = useState<WriteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const send = useCallback(
    async (next: Answers) => {
      setError(null);
      try {
        const response = await fetch('/api/write', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: next, locale }),
        });
        const body = (await response.json()) as WriteResponse & { error?: string };
        if (!response.ok) {
          setError(body.error ?? null);
          return;
        }
        setState(body);
      } catch {
        setError(t.api.rateLimited);
      }
    },
    [locale, t],
  );

  // The first question, asked before anybody types anything.
  useEffect(() => {
    void send({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = (value: string | null) => {
    const id = state?.next;
    if (!id) return;
    const next = { ...answers, [id]: value };
    setAnswers(next);
    setTyped('');
    track('write_answer', { slot: id, declined: value === null });
    void send(next);
  };

  const current = state?.next ?? null;
  const copy = current ? t.write.slots[current] : null;
  const draft = state?.draft ?? null;
  const measured = draft?.measured ?? null;

  const budgetLine = useMemo(() => {
    if (!measured) return null;
    const { verdict, reason, budgetUsd } = measured.cheap;
    if (verdict === 'within' && budgetUsd !== null) return t.write.within(formatUsd(budgetUsd));
    if (verdict === 'over' && budgetUsd !== null) return t.write.over(formatUsd(budgetUsd));
    return reason === null ? null : t.write.noVerdict(reason);
  }, [measured, t]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[15px] text-muted-foreground">{t.write.lede}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{t.write.privacy}</p>
      </div>

      {error !== null && (
        <p role="alert" className="text-[14px] text-destructive">
          {error}
        </p>
      )}

      {copy !== null && current !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">{copy.question}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-[13px] text-muted-foreground">{copy.unlocks}</p>
            <Label htmlFor="write-answer" className="sr-only">
              {copy.question}
            </Label>
            <Textarea
              id="write-answer"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              rows={3}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => answer(typed.trim().length > 0 ? typed.trim() : null)}>
                {typed.trim().length > 0 ? t.write.tab : t.write.decline}
              </Button>
              {/*
                Skipping is an answer, and it is offered as one. A question a
                reader cannot decline is a question they will answer badly to
                get past — and a bad answer goes into the prompt, where a
                decline would have left nothing.
              */}
              <Button variant="ghost" onClick={() => answer(null)}>
                {t.write.decline}
              </Button>
              {state !== null && !state.slots.find((entry) => entry.id === current)?.required && (
                <span className="text-[12px] text-muted-foreground">{t.write.optional}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {state?.done === true && <p className="text-[14px]">{t.write.done}</p>}

      {draft !== null && draft.prompt === null && draft.missing.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[14px]">{t.write.missing(draft.missing.length)}</p>
          <ul className="list-disc pl-5 text-[13px] text-muted-foreground">
            {draft.missing.map((id) => (
              <li key={id}>
                <strong>{t.write.slots[id]?.question}</strong> — {t.write.slots[id]?.unlocks}
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft?.prompt !== null && draft?.prompt !== undefined && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-[16px]">{t.write.promptHeading}</CardTitle>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(draft.prompt as string);
                setCopied(true);
                track('write_copy', {});
              }}
            >
              {copied ? t.write.copied : t.write.copy}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-layer p-3 text-[13px]">
              {draft.prompt}
            </pre>
            {measured !== null && (
              <div className="flex flex-col gap-1 text-[13px]">
                <span>{t.write.tokens(measured.cheap.tokens.toLocaleString(t.numberLocale))}</span>
                {measured.cheap.monthlyUsd !== null && (
                  <span>{t.write.monthly(formatUsd(measured.cheap.monthlyUsd))}</span>
                )}
                {budgetLine !== null && <span>{budgetLine}</span>}
                <span>
                  {measured.clean.rules.length === 0
                    ? t.write.clean
                    : t.write.notClean(
                        measured.clean.rules.map((rule) => rule.id).join(', '),
                        measured.clean.tokensRecoverable.toLocaleString(t.numberLocale),
                      )}
                </span>
                {measured.complete.declined.length > 0 && (
                  <span className="text-muted-foreground">
                    {t.write.declined}: {measured.complete.declined.join(', ')}
                  </span>
                )}
                {/* The claim this mode refuses to make, said where the figures are. */}
                <span className="mt-2 text-muted-foreground">{t.write.notPerfect}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
