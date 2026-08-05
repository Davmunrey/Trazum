'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Locale, ModelPricing, OptimizationResult } from '@trazum/core';

import { track } from './Analytics';
import { diffTexts } from './diff';
import type { WebMessages } from '../lib/i18n';

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
}

/**
 * Starter prompts, one per locale.
 *
 * Each is written in its own language on purpose: the point of the example is
 * to show the rules firing, and the phrase dictionaries are per-language.
 */
const EXAMPLES: Record<Locale, string> = {
  en: `You are an expert customer support assistant.

IMPORTANT: You MUST always answer in English.

Please, in order to help the user, I basically need you to analyse the query arriving in {{query}} and, if you don't mind, classify it into one of the categories.

================================================

It is important to note that you have to be very careful when classifying.

Always answer in English and keep a formal tone with the end user.

Check the catalogue at https://api.example.com/v1/catalogue?full=true

Use this function as-is:

\`\`\`python
def classify(text):
    return   model.predict(text)   # do not touch the indentation
\`\`\`

Always answer in English and keep a formal tone with the end user.

Please double-check your answer before responding. Thank you very much!`,

  es: `Eres un asistente experto en atención al cliente.

IMPORTANTE: DEBES responder SIEMPRE en español.

Por favor, con el fin de ayudar al usuario, básicamente necesito que analices la consulta que llega en {{consulta}} y, si no te importa, la clasifiques en una de las categorías.

================================================

Es importante destacar que tienes que ser muy cuidadoso al clasificar.

Responde siempre en español y usa un tono formal con el usuario final.

Consulta el catálogo en https://api.ejemplo.com/v1/catalogo?full=true

Usa esta función tal cual:

\`\`\`python
def clasificar(texto):
    return   modelo.predict(texto)   # no tocar la indentación
\`\`\`

Responde siempre en español y usa un tono formal con el usuario final.

Por favor verifica tu respuesta antes de contestar. ¡¡¡Muchas gracias!!!`,
};

function formatUsd(value: number): string {
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toFixed(5)}`;
  if (abs < 1) return `$${value.toFixed(4)}`;
  if (abs < 1000) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function Optimizer({ locale, t }: { locale: Locale; t: WebMessages }) {
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [prompt, setPrompt] = useState(EXAMPLES[locale]);
  const [level, setLevel] = useState<'safe' | 'aggressive'>('safe');
  const [model, setModel] = useState('claude-opus-5');
  const [callsPerMonth, setCallsPerMonth] = useState(10000);
  const [avgOutputTokens, setAvgOutputTokens] = useState(500);
  const [cacheHitRate, setCacheHitRate] = useState(0.9);
  const [batchEligible, setBatchEligible] = useState(false);

  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmProvider, setLlmProvider] = useState('openai');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');

  const [result, setResult] = useState<OptimizationResult | null>(null);
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

  // Switching language swaps the starter prompt, but never a prompt the reader
  // has actually written: losing someone's text to a language toggle would be
  // unforgivable.
  useEffect(() => {
    setPrompt((current) =>
      Object.values(EXAMPLES).includes(current) ? EXAMPLES[locale] : current,
    );
  }, [locale]);

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
    setModel(entry.model);
    setCallsPerMonth(entry.callsPerMonth);
    setAvgOutputTokens(entry.avgOutputTokens);
    setCacheHitRate(entry.cacheHitRate);
    setBatchEligible(entry.batchEligible);
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
      } else {
        const optimization = data as OptimizationResult;
        setResult(optimization);
        recordHistory(prompt, optimization);
        // Aggregate metrics, never the content of the prompt.
        track('optimize', {
          level,
          model,
          locale,
          reduction_pct: Math.round(optimization.reductionPct),
          tokens_before: optimization.tokensBefore,
          llm_applied: optimization.llm?.applied ?? false,
        });
      }
    } catch {
      setError(t.errors.unreachable);
      setResult(null);
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

  return (
    <div className="grid">
      {/* ---------------- Input ---------------- */}
      <div>
        <div className="card">
          <h2>{t.input.promptHeading}</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            spellCheck={false}
            aria-label={t.input.promptAriaLabel}
          />
        </div>

        <div className="card">
          <h2>{t.input.scenarioHeading}</h2>

          <div className="row">
            <div className="field">
              <label htmlFor="model">{t.input.model}</label>
              <select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
                {(meta?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="level">{t.input.ruleLevel}</label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as 'safe' | 'aggressive')}
              >
                <option value="safe">{t.input.levelSafe}</option>
                <option value="aggressive">{t.input.levelAggressive}</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="calls">{t.input.callsPerMonth}</label>
              <input
                id="calls"
                type="number"
                min={1}
                value={callsPerMonth}
                onChange={(e) => setCallsPerMonth(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
            <div className="field">
              <label htmlFor="out">{t.input.avgOutputTokens}</label>
              <input
                id="out"
                type="number"
                min={0}
                value={avgOutputTokens}
                onChange={(e) => setAvgOutputTokens(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="field">
              <label htmlFor="hit">{t.input.cacheHitRate}</label>
              <input
                id="hit"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={cacheHitRate}
                onChange={(e) =>
                  setCacheHitRate(Math.min(1, Math.max(0, Number(e.target.value) || 0)))
                }
              />
            </div>
          </div>

          <label className="checkbox" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={batchEligible}
              onChange={(e) => setBatchEligible(e.target.checked)}
            />
            {t.input.batchLabel}
          </label>

          <details className="settings" style={{ marginTop: 16 }}>
            <summary>{t.llm.summary}</summary>
            <div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={llmEnabled}
                  onChange={(e) => setLlmEnabled(e.target.checked)}
                />
                {t.llm.enable}
              </label>

              {llmEnabled && (
                <>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="llmProvider">{t.llm.endpointFormat}</label>
                    <select
                      id="llmProvider"
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                    >
                      <option value="openai">{t.llm.formatOpenAi}</option>
                      <option value="anthropic">{t.llm.formatAnthropic}</option>
                    </select>
                  </div>

                  {llmProvider === 'openai' && (
                    <div className="field">
                      <label htmlFor="llmBaseUrl">{t.llm.baseUrl}</label>
                      <input
                        id="llmBaseUrl"
                        value={llmBaseUrl}
                        onChange={(e) => setLlmBaseUrl(e.target.value)}
                        placeholder={t.llm.baseUrlPlaceholder}
                      />
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="llmModel">{t.llm.model}</label>
                    <input
                      id="llmModel"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder={t.llm.modelPlaceholder}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="llmApiKey">{t.llm.apiKey}</label>
                    <input
                      id="llmApiKey"
                      type="password"
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      placeholder={
                        meta?.llmConfiguredOnServer ? t.llm.apiKeyOnServer : t.llm.apiKeyPlaceholder
                      }
                      autoComplete="off"
                    />
                  </div>

                  <p className="note">{t.llm.keyNote}</p>
                  <p className="note">{t.llm.safetyNote}</p>
                </>
              )}
            </div>
          </details>

          <button className="primary" onClick={run} disabled={loading || !prompt.trim()}>
            {loading ? t.input.optimizing : t.input.optimize}
          </button>
        </div>

        {history.length > 0 && (
          <div className="card">
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>{t.history.heading}</h2>
              <button className="ghost" onClick={clearHistory}>
                {t.history.clear}
              </button>
            </div>
            <ul className="plain">
              {history.map((entry) => (
                <li key={entry.id} className="history-entry">
                  <button
                    className="history-restore"
                    onClick={() => restoreEntry(entry)}
                    disabled={entry.prompt === null}
                    title={entry.prompt === null ? t.history.tooLongTitle : t.history.restoreTitle}
                  >
                    <span className="history-excerpt">{entry.excerpt || t.history.noText}</span>
                    <span className="history-meta">
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
            <p className="note">{t.history.privacyNote}</p>
          </div>
        )}
      </div>

      {/* ---------------- Results ---------------- */}
      <div>
        {error && <div className="card error">{error}</div>}

        {!result && !error && (
          <div className="card">
            <p className="empty">{t.results.empty}</p>
          </div>
        )}

        {result && (
          <>
            <div className="card">
              <h2>{t.results.heading}</h2>
              <div className="headline">
                <span className="pct">−{result.reductionPct.toFixed(1)}%</span>
                <span className="tokens">
                  {t.results.inputTokens(n(result.tokensBefore), n(result.tokensAfter))}
                </span>
              </div>

              <div className="money">
                <div className="amount">
                  {t.results.perMonth(formatUsd(result.savings.monthlySavingsUsd))}
                </div>
                <div className="caption">
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
                <p className="note">
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
            </div>

            <div className="card">
              <div className="toolbar">
                <h2 style={{ margin: 0 }}>
                  {showDiff ? t.results.diffHeading : t.results.optimizedHeading}
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ghost" onClick={() => setShowDiff((v) => !v)}>
                    {showDiff ? t.results.showResult : t.results.showDiff}
                  </button>
                  <button className="ghost" onClick={copyOptimized}>
                    {copied ? t.results.copied : t.results.copy}
                  </button>
                </div>
              </div>

              {showDiff ? (
                diff ? (
                  <pre className="diff">
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
                  <p className="note">
                    {t.results.diffTooLong}
                    <code>--diff</code>.
                  </p>
                )
              ) : (
                <pre className="output">{result.optimized}</pre>
              )}
            </div>

            {result.rules.length > 0 && (
              <div className="card">
                <h2>{t.results.rulesHeading}</h2>
                <ul className="plain">
                  {result.rules.map((rule) => (
                    <li key={rule.id} className="rule">
                      <span className={`badge ${rule.level}`}>
                        {rule.level === 'aggressive'
                          ? t.results.badgeAggressive
                          : t.results.badgeSafe}
                      </span>
                      <span>
                        {rule.title}{' '}
                        <span style={{ color: 'var(--text-dim)' }}>
                          {t.results.ruleHits(rule.hits, rule.tokensSaved)}
                        </span>
                        {/* What the rule actually did. Shown for the
                            aggressive level because that is the one whose
                            advice is "read the diff", and a diff of
                            everything at once is not something anyone reads. */}
                        {rule.level === 'aggressive' && rule.changes.length > 0 && (
                          <ul className="rule-changes">
                            {rule.changes.map((change, index) => (
                              <li key={index}>
                                <span className="was">{change.before}</span>
                                <span className="arrow">→</span>
                                {change.after ? (
                                  <span className="now">{change.after}</span>
                                ) : (
                                  <span className="gone">—</span>
                                )}
                              </li>
                            ))}
                            {rule.hits > rule.changes.length && (
                              <li className="more">
                                {t.results.moreChanges(rule.hits - rule.changes.length)}
                              </li>
                            )}
                          </ul>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.advisories.length > 0 && (
              <div className="card">
                <h2>{t.results.advisoriesHeading}</h2>
                <ul className="plain">
                  {result.advisories.map((advisory) => (
                    <li key={advisory.id} className={`advisory ${advisory.severity}`}>
                      <div className="title">
                        {advisory.title}
                        {advisory.estimatedMonthlyUsd !== null && (
                          <span className="est">
                            {t.results.advisoryPerMonth(formatUsd(advisory.estimatedMonthlyUsd))}
                          </span>
                        )}
                      </div>
                      <div className="detail">{advisory.detail}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
