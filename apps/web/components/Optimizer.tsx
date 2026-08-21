'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  Locale,
  ModelPricing,
  OptimizationResult,
  ReorderResult,
  SuggestResult,
} from '@trazum/core';

import { formatUsd } from '@trazum/core';

import { track } from './Analytics';
import { diffTexts } from './diff';
import type { WebMessages } from '../lib/i18n';
import type { PromptText } from '../lib/prompt-text';
import type { Scenario } from '../lib/scenario';

import { Check, ChevronDown, Copy, Trash2 } from 'lucide-react';

import { AnimatedContent } from './motion/AnimatedContent';
import { CountUp } from './motion/CountUp';
import { ShinyText } from './motion/ShinyText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// --------------------------------------------------------------------------
// Local history
// --------------------------------------------------------------------------

/**
 * History lives in localStorage: private by design, it never touches a
 * backend. Very long prompts are not stored in full so we do not blow the
 * browser's quota; in that case the entry still reports, but cannot restore.
 */
interface HistoryEntry {
  id: string;
  at: number;
  excerpt: string;
  /** `null` when the prompt was too long to store. */
  prompt: string | null;
  level: 'safe' | 'aggressive';
  model: string;
  callsPerMonth: number;
  avgOutputTokens: number;
  cacheHitRate: number;
  batchEligible: boolean;
  tokensBefore: number;
  tokensAfter: number;
  reductionPct: number;
  monthlySavingsUsd: number;
}

const HISTORY_KEY = 'trazum:history:v1';
const HISTORY_MAX = 20;
const HISTORY_MAX_PROMPT_CHARS = 20_000;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Quota full or storage blocked: history is expendable.
  }
}

interface Metadata {
  models: ModelPricing[];
  llmConfiguredOnServer: boolean;
  /**
   * Endpoints this deployment is willing to call, from the server's
   * `TRAZUM_ALLOWED_LLM_ENDPOINTS`. Empty by default, and the field below
   * becomes a picker over exactly this list rather than free text: the server
   * refuses anything else, so offering a text box would only invite a 400.
   */
  allowedEndpoints?: readonly string[];
}


/** One line of a declined block, short enough to sit in a list. */
function excerpt(text: string, max = 48): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}\u2026`;
}

export function Optimizer({
  locale,
  t,
  scenario,
  promptText,
}: {
  locale: Locale;
  t: WebMessages;
  scenario: Scenario;
  promptText: PromptText;
}) {
  const [meta, setMeta] = useState<Metadata | null>(null);
  // Owned by the page, so the Library tab saves and restores the prompt that
  // is actually on screen rather than a copy of it.
  const { value: prompt, set: setPrompt } = promptText;
  const [level, setLevel] = useState<'safe' | 'aggressive'>('safe');
  const [reorder, setReorder] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [applySuggestions, setApplySuggestions] = useState(false);
  // Owned by `App`, not here: the Compare tab prices its answer through the same
  // scenario, and two tabs disagreeing about the call volume would make their
  // answers incomparable while looking like they were about one workload.
  const { model, callsPerMonth, avgOutputTokens, cacheHitRate, batchEligible } = scenario.usage;
  const setModel = (value: string) => scenario.set('model', value);
  const setCallsPerMonth = (value: number) => scenario.set('callsPerMonth', value);
  const setAvgOutputTokens = (value: number) => scenario.set('avgOutputTokens', value);
  const setCacheHitRate = (value: number) => scenario.set('cacheHitRate', value);
  const setBatchEligible = (value: boolean) => scenario.set('batchEligible', value);

  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmProvider, setLlmProvider] = useState('openai');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const endpointChoices = meta?.allowedEndpoints ?? [];

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [reorderResult, setReorderResult] = useState<ReorderResult | null>(null);
  const [suggestions, setSuggestions] = useState<(SuggestResult & { applied: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const n = (value: number): string => value.toLocaleString(t.numberLocale);

  useEffect(() => {
    fetch('/api/optimize')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta(null));
    setHistory(loadHistory());
  }, []);

  function recordHistory(promptUsed: string, data: OptimizationResult) {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      excerpt: promptUsed.replace(/\s+/g, ' ').trim().slice(0, 90),
      prompt: promptUsed.length <= HISTORY_MAX_PROMPT_CHARS ? promptUsed : null,
      level,
      model,
      callsPerMonth,
      avgOutputTokens,
      cacheHitRate,
      batchEligible,
      tokensBefore: data.tokensBefore,
      tokensAfter: data.tokensAfter,
      reductionPct: data.reductionPct,
      monthlySavingsUsd: data.savings.monthlySavingsUsd,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  }

  function restoreEntry(entry: HistoryEntry) {
    if (entry.prompt !== null) setPrompt(entry.prompt);
    setLevel(entry.level);
    // One update rather than five: five setters on shared state is five renders
    // and, in between them, four scenarios that are nobody's.
    scenario.restore({
      model: entry.model,
      callsPerMonth: entry.callsPerMonth,
      avgOutputTokens: entry.avgOutputTokens,
      cacheHitRate: entry.cacheHitRate,
      batchEligible: entry.batchEligible,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
  }

  const diff = useMemo(
    () => (result && showDiff ? diffTexts(result.original, result.optimized) : null),
    [result, showDiff],
  );

  async function run() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          level,
          locale,
          reorder,
          suggest,
          /*
            Derived rather than passed through. The API refuses
            `applySuggestions` without `suggest` — on its own it would return a
            report and silently apply nothing — and the toggle below already
            clears itself when `suggest` goes off. That clearing is the UI being
            honest about its own state; this is the request being correct
            whatever the state turns out to be, which is a different guarantee
            and the one that survives somebody editing the handler.
          */
          applySuggestions: suggest && applySuggestions,
          usage: { model, callsPerMonth, avgOutputTokens, cacheHitRate, batchEligible },
          llm: llmEnabled
            ? {
                enabled: true,
                provider: llmProvider,
                baseUrl: llmBaseUrl || undefined,
                model: llmModel || undefined,
                apiKey: llmApiKey || undefined,
              }
            : { enabled: false },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? t.errors.requestFailed);
        setResult(null);
        setReorderResult(null);
        setSuggestions(null);
      } else {
        const optimization = data as OptimizationResult & {
          reorder?: ReorderResult;
          suggestions?: SuggestResult & { applied: boolean };
        };
        setResult(optimization);
        setReorderResult(optimization.reorder ?? null);
        setSuggestions(optimization.suggestions ?? null);
        recordHistory(prompt, optimization);
        // Aggregate metrics, never the content of the prompt.
        track('optimize', {
          level,
          model,
          locale,
          reduction_pct: Math.round(optimization.reductionPct),
          tokens_before: optimization.tokensBefore,
          llm_applied: optimization.llm?.applied ?? false,
          reordered: optimization.reorder?.moved.length ?? 0,
        });
      }
    } catch {
      setError(t.errors.unreachable);
      setResult(null);
      setReorderResult(null);
      setSuggestions(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyOptimized() {
    if (!result) return;
    await navigator.clipboard.writeText(result.optimized);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  /**
   * A section heading.
   *
   * The eyebrow — small, uppercase, dim — is what the hand-written stylesheet
   * used and it is worth keeping: these headings label a panel, they do not
   * compete with the numbers inside it. shadcn's `CardTitle` is a heavier
   * default, so it is dressed down here rather than used raw.
   */
  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </CardTitle>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      {/*
        ---------------- Input ----------------

        Two columns side by side on a wide screen; one column on a narrow one.
        `contents` is what makes the narrow case work: it dissolves the two
        wrappers so every card becomes a direct grid item, which lets the
        history card take `order-last` and stop sitting between the button and
        the answer the reader just pressed it for.
      */}
      <div className="contents lg:flex lg:flex-col lg:gap-[18px]">
        <Card className="gap-4 py-[18px]">
          <CardHeader className="px-[18px]">
            <Eyebrow>{t.input.promptHeading}</Eyebrow>
          </CardHeader>
          <CardContent className="px-[18px]">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              spellCheck={false}
              aria-label={t.input.promptAriaLabel}
              className="min-h-80 resize-y bg-muted font-mono text-[13px] leading-relaxed"
            />
          </CardContent>
        </Card>

        <Card className="gap-4 py-[18px]">
          <CardHeader className="px-[18px]">
            <Eyebrow>{t.input.scenarioHeading}</Eyebrow>
          </CardHeader>
          <CardContent className="flex flex-col gap-3.5 px-[18px]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="model" className="text-xs text-muted-foreground">
                  {t.input.model}
                </Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="model" className="w-full bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(meta?.models ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="level" className="text-xs text-muted-foreground">
                  {t.input.ruleLevel}
                </Label>
                <Select
                  value={level}
                  onValueChange={(value) => setLevel(value as 'safe' | 'aggressive')}
                >
                  <SelectTrigger id="level" className="w-full bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safe">{t.input.levelSafe}</SelectItem>
                    <SelectItem value="aggressive">{t.input.levelAggressive}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/*
              Its own row rather than a third dropdown beside the level, because
              it is not a level. Every other control here changes how hard the
              rules push at deleting text; this one moves text, and the label has
              to say so before the switch is flipped rather than after.
            */}
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
              <Switch
                id="reorder"
                checked={reorder}
                onCheckedChange={setReorder}
                className="mt-0.5"
              />
              <Label htmlFor="reorder" className="grid cursor-pointer gap-0.5 font-normal">
                <span className="text-sm text-foreground">{t.input.reorderLabel}</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  {t.input.reorderHint}
                </span>
              </Label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="calls" className="text-xs text-muted-foreground">
                  {t.input.callsPerMonth}
                </Label>
                <Input
                  id="calls"
                  type="number"
                  min={1}
                  value={callsPerMonth}
                  onChange={(e) => setCallsPerMonth(Math.max(1, Number(e.target.value) || 0))}
                  className="bg-muted"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="out" className="text-xs text-muted-foreground">
                  {t.input.avgOutputTokens}
                </Label>
                <Input
                  id="out"
                  type="number"
                  min={0}
                  value={avgOutputTokens}
                  onChange={(e) => setAvgOutputTokens(Math.max(0, Number(e.target.value) || 0))}
                  className="bg-muted"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="hit" className="text-xs text-muted-foreground">
                  {t.input.cacheHitRate}
                </Label>
                <Input
                  id="hit"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cacheHitRate}
                  onChange={(e) =>
                    setCacheHitRate(Math.min(1, Math.max(0, Number(e.target.value) || 0)))
                  }
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch id="batch" checked={batchEligible} onCheckedChange={setBatchEligible} />
              <Label htmlFor="batch" className="cursor-pointer font-normal">
                {t.input.batchLabel}
              </Label>
            </div>

            <Collapsible className="group/llm border-t pt-3.5">
              <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                <ChevronDown className="size-3.5 transition-transform group-data-[state=open]/llm:rotate-180" />
                {t.llm.summary}
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3 pt-3">
                <div className="flex items-center gap-3">
                  <Switch id="llm" checked={llmEnabled} onCheckedChange={setLlmEnabled} />
                  <Label htmlFor="llm" className="cursor-pointer font-normal">
                    {t.llm.enable}
                  </Label>
                </div>

                {/*
                  A separate question from the one above, not a refinement of it.
                  `llm.enabled` rewrites the whole prompt and you accept or
                  discard the lot; this proposes phrases you judge one at a time.
                */}
                <div className="flex items-start gap-3">
                  <Switch
                    id="suggest"
                    checked={suggest}
                    onCheckedChange={(next) => {
                      setSuggest(next);
                      // Turning the question off cannot leave the answer armed.
                      if (!next) setApplySuggestions(false);
                    }}
                    className="mt-0.5"
                  />
                  <Label htmlFor="suggest" className="grid cursor-pointer gap-0.5 font-normal">
                    <span className="text-sm text-foreground">{t.llm.suggest}</span>
                    <span className="text-xs leading-snug text-muted-foreground">
                      {t.llm.suggestHint}
                    </span>
                  </Label>
                </div>

                {suggest && (
                  <div className="flex items-start gap-3 pl-9">
                    <Switch
                      id="applySuggestions"
                      checked={applySuggestions}
                      onCheckedChange={setApplySuggestions}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="applySuggestions"
                      className="grid cursor-pointer gap-0.5 font-normal"
                    >
                      <span className="text-sm text-foreground">{t.llm.applySuggestions}</span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {t.llm.applySuggestionsHint}
                      </span>
                    </Label>
                  </div>
                )}

                {llmEnabled && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="llmProvider" className="text-xs text-muted-foreground">
                        {t.llm.endpointFormat}
                      </Label>
                      <Select value={llmProvider} onValueChange={setLlmProvider}>
                        <SelectTrigger id="llmProvider" className="w-full bg-muted">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">{t.llm.formatOpenAi}</SelectItem>
                          <SelectItem value="anthropic">{t.llm.formatAnthropic}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {llmProvider === 'openai' &&
                      (endpointChoices.length > 0 ? (
                        <div className="grid gap-1.5">
                          <Label htmlFor="llmBaseUrl" className="text-xs text-muted-foreground">
                            {t.llm.baseUrl}
                          </Label>
                          <Select value={llmBaseUrl} onValueChange={setLlmBaseUrl}>
                            <SelectTrigger id="llmBaseUrl" className="w-full bg-muted">
                              <SelectValue placeholder={t.llm.baseUrlServerDefault} />
                            </SelectTrigger>
                            <SelectContent>
                              {endpointChoices.map((url) => (
                                <SelectItem key={url} value={url}>
                                  {url}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t.llm.baseUrlNotOffered}</p>
                      ))}

                    <div className="grid gap-1.5">
                      <Label htmlFor="llmModel" className="text-xs text-muted-foreground">
                        {t.llm.model}
                      </Label>
                      <Input
                        id="llmModel"
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                        placeholder={t.llm.modelPlaceholder}
                        className="bg-muted"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="llmApiKey" className="text-xs text-muted-foreground">
                        {t.llm.apiKey}
                      </Label>
                      <Input
                        id="llmApiKey"
                        type="password"
                        value={llmApiKey}
                        onChange={(e) => setLlmApiKey(e.target.value)}
                        placeholder={
                          meta?.llmConfiguredOnServer
                            ? t.llm.apiKeyOnServer
                            : t.llm.apiKeyPlaceholder
                        }
                        autoComplete="off"
                        className="bg-muted"
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">{t.llm.keyNote}</p>
                    <p className="text-xs text-muted-foreground">{t.llm.safetyNote}</p>
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Button
              onClick={run}
              disabled={loading || !prompt.trim()}
              size="lg"
              className="mt-1 w-full text-[15px] font-semibold"
            >
              {loading ? <ShinyText>{t.input.optimizing}</ShinyText> : t.input.optimize}
            </Button>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card className="order-last gap-4 py-[18px] lg:order-none">
            <CardHeader className="items-center px-[18px]">
              <Eyebrow>{t.history.heading}</Eyebrow>
              <CardAction>
                <Button variant="ghost" size="sm" onClick={clearHistory} className="text-xs">
                  <Trash2 />
                  {t.history.clear}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="px-[18px]">
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => restoreEntry(entry)}
                      disabled={entry.prompt === null}
                      title={
                        entry.prompt === null ? t.history.tooLongTitle : t.history.restoreTitle
                      }
                      className={cn(
                        'flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border bg-muted px-2.5 py-2 text-left text-[13px] transition-colors',
                        'hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                        'disabled:cursor-default disabled:opacity-70 disabled:hover:border-border',
                      )}
                    >
                      <span className="truncate">{entry.excerpt || t.history.noText}</span>
                      <span className="text-xs text-muted-foreground">
                        −{entry.reductionPct.toFixed(0)}% ·{' '}
                        {t.history.perMonth(formatUsd(entry.monthlySavingsUsd))} ·{' '}
                        {new Date(entry.at).toLocaleDateString(t.numberLocale, {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-xs text-muted-foreground">{t.history.privacyNote}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---------------- Results ---------------- */}
      <div className="contents lg:flex lg:flex-col lg:gap-[18px]">
        {error && (
          <Card className="border-warn bg-warn-wash py-3.5">
            <CardContent className="px-3.5 text-sm text-warn">{error}</CardContent>
          </Card>
        )}

        {/*
          An empty state that names what the report will contain.

          It was one italic sentence centred in a grey box — the shape of a
          panel apologising for being empty. It is the first thing every
          reader sees, before they have typed anything, so it is the page's
          only chance to say what pressing the button is worth. Title, the
          instruction, then the three things the report actually holds.

          Still a sunken panel and still no card: borrowing the elevation the
          real report will have would make the wait look like a result.
        */}
        {!result && !error && (
          <div className="rounded-xl bg-muted/60 px-7 py-9">
            <div className="mx-auto flex max-w-[40ch] flex-col gap-3">
              <h3 className="font-display text-[17px] leading-snug font-semibold">
                {t.results.emptyTitle}
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{t.results.empty}</p>
              <ul className="mt-1 flex flex-col gap-2 border-t pt-4 text-[13px] leading-snug text-faint">
                {t.results.emptyWillShow.map((line) => (
                  <li key={line} className="flex gap-2.5">
                    {/* A rule, not a bullet glyph: the list is three parts of
                        one answer rather than three unrelated items. */}
                    <span aria-hidden="true" className="mt-[0.55em] h-px w-3 shrink-0 bg-rule-strong" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {result && (
          <>
            <AnimatedContent>
              {/*
                The one focal surface on the page. Elevation once: the border
                goes transparent because the shadow is already doing the
                separating, and two things drawing the same edge is what makes
                an interface look assembled.
              */}
              <Card className="gap-4 border-transparent py-[18px] shadow-focal">
                <CardHeader className="px-[18px]">
                  <Eyebrow>{t.results.heading}</Eyebrow>
                </CardHeader>
                <CardContent className="px-[18px]">
                  <div className="mb-1 flex flex-wrap items-baseline gap-3.5">
                    <span className="font-display text-[clamp(40px,5.5vw,52px)] leading-none font-semibold tracking-[-0.015em] text-good">
                      −
                      <CountUp
                        to={result.reductionPct}
                        format={(v) => v.toFixed(1)}
                        duration={0.6}
                      />
                      %
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t.results.inputTokens(n(result.tokensBefore), n(result.tokensAfter))}
                    </span>
                  </div>

                  {/*
                    Above the money, because the rearrangement is the bigger
                    change and the one the reader has to make a judgement about —
                    a saving they accept without reading is not a saving they
                    chose.
                  */}
                  {reorderResult && (
                    <div className="mt-3.5 rounded-lg bg-terracotta-wash px-3.5 py-3">
                      {reorderResult.moved.length > 0 ? (
                        <>
                          <div className="text-[15px] font-semibold">
                            {t.results.reorderMoved(
                              reorderResult.moved.length,
                              n(reorderResult.tokensMoved),
                            )}
                          </div>
                          <div className="mt-0.5 text-[13px] text-muted-foreground">
                            {t.results.reorderPrefix(
                              n(reorderResult.prefixTokensBefore),
                              n(reorderResult.prefixTokensAfter),
                            )}
                          </div>
                          <div className="mt-2 text-[13px] text-warn">
                            {t.results.reorderReview}
                          </div>
                        </>
                      ) : (
                        <div className="text-[15px] font-semibold">{t.results.reorderNothing}</div>
                      )}

                      {/*
                        Refusals are shown whether or not anything moved. "No
                        saving here" and "there was a saving and it was not safe
                        to take" are different answers, and only the second is
                        actionable.
                      */}
                      {reorderResult.declined.length > 0 && (
                        <ul className="m-0 mt-2.5 list-none p-0 text-[13px] text-muted-foreground">
                          {reorderResult.declined.slice(0, 3).map((d, i) => (
                            <li key={i} className="mt-1 first:mt-0">
                              {d.reason === 'uncovered-script'
                                ? t.results.reorderDeclinedScript(d.script ?? '')
                                : d.reason === 'backward-reference'
                                  ? t.results.reorderDeclinedRef(d.phrase ?? '', excerpt(d.text))
                                  : t.results.reorderDeclinedAfter(excerpt(d.text))}
                            </li>
                          ))}
                          {reorderResult.declined.length > 3 && (
                            <li className="mt-1">
                              {t.results.reorderDeclinedMore(reorderResult.declined.length - 3)}
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}

                  {/*
                    Above the money, like the rearrangement and for the same
                    reason: these are changes to judge, and a saving read before
                    the caveat is a saving nobody chose.
                  */}
                  {suggestions && (
                    <div className="mt-3.5 rounded-lg bg-terracotta-wash px-3.5 py-3">
                      {suggestions.suggestions.length > 0 ? (
                        <>
                          <div className="text-[15px] font-semibold">
                            {suggestions.applied
                              ? t.results.suggestApplied(
                                  suggestions.suggestions.length,
                                  n(suggestions.suggestions.reduce((sum, x) => sum + x.tokensSaved, 0)),
                                )
                              : t.results.suggestOffered(
                                  suggestions.suggestions.length,
                                  n(suggestions.suggestions.reduce((sum, x) => sum + x.tokensSaved, 0)),
                                )}
                          </div>
                          <ul className="m-0 mt-2 list-none p-0 font-mono text-[12.5px]">
                            {suggestions.suggestions.map((s, i) => (
                              <li key={i} className="flex min-w-0 items-baseline gap-[7px] py-px">
                                <span className="max-w-[26ch] truncate text-terracotta line-through decoration-1">
                                  {s.before}
                                </span>
                                <span className="flex-none text-muted-foreground">→</span>
                                {s.after === '' ? (
                                  <span className="flex-none text-muted-foreground">
                                    {t.results.suggestRemoved}
                                  </span>
                                ) : (
                                  <span className="max-w-[20ch] truncate text-good">{s.after}</span>
                                )}
                                <span className="flex-none text-muted-foreground">
                                  ~{n(s.tokensSaved)}
                                  {s.offsets.length > 1 ? ` ×${s.offsets.length}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {!suggestions.applied && (
                            <div className="mt-2 text-[13px] text-warn">
                              {t.results.suggestNotApplied}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-[15px] font-semibold">
                          {t.results.suggestNothing(suggestions.provider, suggestions.model)}
                        </div>
                      )}

                      {/*
                        Refusals summarised, not listed. "Four did not survive" is
                        the useful fact; which four is noise unless you are
                        debugging the model, and the JSON has them for then.
                      */}
                      {suggestions.rejected.length > 0 && (
                        <div className="mt-2 text-[13px] text-muted-foreground">
                          {t.results.suggestRejected(suggestions.rejected.length)}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3.5 rounded-lg bg-good-wash px-4 py-3.5">
                    <div className="font-display text-[26px] leading-tight font-semibold text-good">
                      {t.results.perMonth(formatUsd(result.savings.monthlySavingsUsd))}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {t.results.costCaption(
                        formatUsd(result.savings.perMonth.before.totalUsd),
                        formatUsd(result.savings.perMonth.after.totalUsd),
                        result.savings.modelDisplayName,
                        n(result.usage.callsPerMonth),
                      )}
                      {result.savings.promoApplied ? t.results.promoSuffix : ''}
                    </div>
                  </div>

                  {result.llm && (
                    <p className="mt-2.5 text-xs text-muted-foreground">
                      {result.llm.applied
                        ? t.results.llmApplied(
                            result.llm.provider,
                            result.llm.model,
                            result.llm.tokensBefore,
                            result.llm.tokensAfter,
                          )
                        : t.results.llmRejected(result.llm.rejectedReason ?? '')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </AnimatedContent>

            <AnimatedContent delay={0.05}>
              <Card className="gap-4 py-[18px]">
                <CardHeader className="items-center px-[18px]">
                  {/*
                    Tabs rather than the "show diff / show result" toggle button
                    that was here. The two views are peers — neither is a mode
                    you escape from — and a toggle whose label is the *other*
                    state is read wrong at least half the time.
                  */}
                  <Tabs
                    value={showDiff ? 'diff' : 'result'}
                    onValueChange={(v) => setShowDiff(v === 'diff')}
                  >
                    <TabsList variant="line">
                      <TabsTrigger value="result">{t.results.optimizedHeading}</TabsTrigger>
                      <TabsTrigger value="diff">{t.results.diffHeading}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <CardAction>
                    <Button variant="outline" size="sm" onClick={copyOptimized} className="text-xs">
                      {copied ? <Check className="text-good" /> : <Copy />}
                      {copied ? t.results.copied : t.results.copy}
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="px-[18px]">
                  {showDiff ? (
                    diff ? (
                      <pre className="m-0 max-h-[460px] overflow-auto rounded-lg border bg-muted p-3.5 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">
                        {diff.map((part, index) => (
                          <span
                            key={index}
                            className={`diff-${part.type === 'same' ? 'same' : part.type}`}
                          >
                            {part.text}
                          </span>
                        ))}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t.results.diffTooLong}
                        <code className="font-mono">--diff</code>.
                      </p>
                    )
                  ) : (
                    <pre className="m-0 max-h-[460px] overflow-auto rounded-lg border bg-muted p-3.5 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">
                      {result.optimized}
                    </pre>
                  )}
                </CardContent>
              </Card>
            </AnimatedContent>

            {result.rules.length > 0 && (
              <AnimatedContent delay={0.1}>
                <Card className="gap-4 py-[18px]">
                  <CardHeader className="px-[18px]">
                    <Eyebrow>{t.results.rulesHeading}</Eyebrow>
                  </CardHeader>
                  <CardContent className="px-[18px]">
                    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                      {result.rules.map((rule) => (
                        <li key={rule.id} className="flex items-baseline gap-2.5 text-sm">
                          <Badge
                            variant={rule.level === 'aggressive' ? 'outline' : 'secondary'}
                            className={cn(
                              'shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.06em] uppercase',
                              rule.level === 'aggressive' &&
                                'border-transparent bg-warn-wash text-warn',
                            )}
                          >
                            {rule.level === 'aggressive'
                              ? t.results.badgeAggressive
                              : t.results.badgeSafe}
                          </Badge>
                          <span className="min-w-0">
                            {rule.title}{' '}
                            <span className="text-muted-foreground">
                              {t.results.ruleHits(rule.hits, rule.tokensSaved)}
                            </span>
                            {/* What the rule actually changed. Shown for the
                                aggressive level because that is the one whose
                                advice is "read the diff", and a diff of
                                everything at once is not something anyone
                                reads. */}
                            {rule.level === 'aggressive' && rule.changes.length > 0 && (
                              <ul className="m-0 mt-1.5 list-none p-0 font-mono text-[12.5px]">
                                {rule.changes.map((change, index) => (
                                  <li
                                    key={index}
                                    className="flex min-w-0 items-baseline gap-[7px] py-px"
                                  >
                                    {/* Long snippets truncate rather than
                                        wrapping: the point is to scan the list,
                                        and a wrapped entry reads as two
                                        changes. */}
                                    <span className="max-w-[22ch] truncate text-terracotta line-through decoration-1">
                                      {change.before}
                                    </span>
                                    <span className="flex-none text-muted-foreground">→</span>
                                    {change.after ? (
                                      <span className="max-w-[16ch] truncate text-good">
                                        {change.after}
                                      </span>
                                    ) : (
                                      <span className="flex-none text-muted-foreground">—</span>
                                    )}
                                  </li>
                                ))}
                                {rule.hits > rule.changes.length && (
                                  <li className="font-sans text-muted-foreground">
                                    {t.results.moreChanges(rule.hits - rule.changes.length)}
                                  </li>
                                )}
                              </ul>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </AnimatedContent>
            )}

            {result.advisories.length > 0 && (
              <AnimatedContent delay={0.15}>
                <Card className="gap-4 py-[18px]">
                  <CardHeader className="px-[18px]">
                    <Eyebrow>{t.results.advisoriesHeading}</Eyebrow>
                  </CardHeader>
                  <CardContent className="px-[18px]">
                    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                      {result.advisories.map((advisory) => (
                        <li key={advisory.id} className="relative pl-[18px]">
                          {/* Severity reads from a dot on the title's baseline
                              rather than a coloured stripe down the side. The
                              stripe is the single most recognisable tell of a
                              generated interface, and it spent a full 3px gutter
                              saying what a 6px dot says without claiming the eye
                              first. Optically centred on the title's cap height,
                              not its line box. */}
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute top-[7px] left-0 size-1.5 rounded-full bg-muted-foreground',
                              advisory.severity === 'opportunity' && 'bg-primary',
                              advisory.severity === 'warning' && 'bg-warn',
                            )}
                          />
                          <div
                            className={cn(
                              'text-sm leading-snug font-semibold',
                              // The one finding that is a defect rather than a
                              // saving earns the extra weight: everything else
                              // on this list is optional, this one is not.
                              advisory.severity === 'warning' && 'text-warn',
                            )}
                          >
                            {advisory.title}
                            {advisory.estimatedMonthlyUsd !== null && (
                              <span className="ml-1.5 text-[13px] font-bold text-good">
                                {t.results.advisoryPerMonth(
                                  formatUsd(advisory.estimatedMonthlyUsd),
                                )}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[13px] text-muted-foreground">
                            {advisory.detail}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </AnimatedContent>
            )}
          </>
        )}
      </div>
    </div>
  );
}
