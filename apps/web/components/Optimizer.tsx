'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ModelPricing, OptimizationResult } from '@trazum/core';

import { track } from './Analytics';
import { diffTexts } from './diff';

// --------------------------------------------------------------------------
// Historial local
// --------------------------------------------------------------------------

/**
 * El historial vive en localStorage: privado por diseño, no toca ningún
 * backend. Los prompts muy largos no se guardan enteros para no reventar la
 * cuota del navegador; en ese caso la entrada informa pero no restaura.
 */
interface HistoryEntry {
  id: string;
  at: number;
  excerpt: string;
  /** `null` si el prompt era demasiado largo para guardarlo. */
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
    // Cuota llena o almacenamiento bloqueado: el historial es prescindible.
  }
}

interface Metadata {
  models: ModelPricing[];
  rules: Array<{ id: string; title: string; rationale: string; level: string }>;
  llmConfiguredOnServer: boolean;
}

const EXAMPLE = `Eres un asistente experto en atención al cliente.

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

Por favor verifica tu respuesta antes de contestar. ¡¡¡Muchas gracias!!!`;

function formatUsd(value: number): string {
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toFixed(5)}`;
  if (abs < 1) return `$${value.toFixed(4)}`;
  if (abs < 1000) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function Optimizer() {
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [prompt, setPrompt] = useState(EXAMPLE);
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
        setError(data.error ?? 'No se ha podido optimizar el prompt.');
        setResult(null);
      } else {
        const optimization = data as OptimizationResult;
        setResult(optimization);
        recordHistory(prompt, optimization);
        // Métricas agregadas, nunca el contenido del prompt.
        track('optimize', {
          level,
          model,
          reduction_pct: Math.round(optimization.reductionPct),
          tokens_before: optimization.tokensBefore,
          llm_applied: optimization.llm?.applied ?? false,
        });
      }
    } catch {
      setError('No se ha podido contactar con el servidor.');
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
      {/* ---------------- Entrada ---------------- */}
      <div>
        <div className="card">
          <h2>Prompt</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            spellCheck={false}
            aria-label="Prompt a optimizar"
          />
        </div>

        <div className="card">
          <h2>Escenario de uso</h2>

          <div className="row">
            <div className="field">
              <label htmlFor="model">Modelo</label>
              <select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
                {(meta?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="level">Nivel de las reglas</label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as 'safe' | 'aggressive')}
              >
                <option value="safe">Seguro</option>
                <option value="aggressive">Agresivo</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="calls">Llamadas al mes</label>
              <input
                id="calls"
                type="number"
                min={1}
                value={callsPerMonth}
                onChange={(e) => setCallsPerMonth(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
            <div className="field">
              <label htmlFor="out">Tokens de salida medios</label>
              <input
                id="out"
                type="number"
                min={0}
                value={avgOutputTokens}
                onChange={(e) => setAvgOutputTokens(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="field">
              <label htmlFor="hit">Acierto de caché</label>
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
            El trabajo tolera latencia (Batch API, 50% de descuento)
          </label>

          <details className="settings" style={{ marginTop: 16 }}>
            <summary>Pasada opcional por un LLM</summary>
            <div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={llmEnabled}
                  onChange={(e) => setLlmEnabled(e.target.checked)}
                />
                Añadir compresión semántica con un LLM
              </label>

              {llmEnabled && (
                <>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="llmProvider">Formato del endpoint</label>
                    <select
                      id="llmProvider"
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                    >
                      <option value="openai">Compatible con OpenAI (/chat/completions)</option>
                      <option value="anthropic">Claude API (/v1/messages)</option>
                    </select>
                  </div>

                  {llmProvider === 'openai' && (
                    <div className="field">
                      <label htmlFor="llmBaseUrl">URL base</label>
                      <input
                        id="llmBaseUrl"
                        value={llmBaseUrl}
                        onChange={(e) => setLlmBaseUrl(e.target.value)}
                        placeholder="https://tu-llm.n0.dev/v1"
                      />
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="llmModel">Modelo</label>
                    <input
                      id="llmModel"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder="identificador del modelo"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="llmApiKey">Clave de API</label>
                    <input
                      id="llmApiKey"
                      type="password"
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      placeholder={
                        meta?.llmConfiguredOnServer
                          ? 'configurada en el servidor — déjalo vacío'
                          : 'tu clave'
                      }
                      autoComplete="off"
                    />
                  </div>

                  <p className="note">
                    La clave viaja a este servidor para hacer la llamada y se descarta al terminar:
                    no se guarda ni se registra. Si prefieres no escribirla aquí, define{' '}
                    <code>TRAZUM_LLM_BASE_URL</code>, <code>TRAZUM_LLM_MODEL</code> y{' '}
                    <code>TRAZUM_LLM_API_KEY</code> en el servidor y deja los campos vacíos.
                  </p>
                  <p className="note">
                    El resultado del LLM solo se acepta si es más corto y conserva intactos el
                    código, las URLs y los marcadores de plantilla. Si no, se descarta y te quedas
                    con la versión determinista.
                  </p>
                </>
              )}
            </div>
          </details>

          <button className="primary" onClick={run} disabled={loading || !prompt.trim()}>
            {loading ? 'Optimizando…' : 'Optimizar'}
          </button>
        </div>

        {history.length > 0 && (
          <div className="card">
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Historial</h2>
              <button className="ghost" onClick={clearHistory}>
                Borrar
              </button>
            </div>
            <ul className="plain">
              {history.map((entry) => (
                <li key={entry.id} className="history-entry">
                  <button
                    className="history-restore"
                    onClick={() => restoreEntry(entry)}
                    disabled={entry.prompt === null}
                    title={
                      entry.prompt === null
                        ? 'Prompt demasiado largo para guardarlo; solo se conserva el resumen.'
                        : 'Restaurar este prompt y su escenario'
                    }
                  >
                    <span className="history-excerpt">{entry.excerpt || '(sin texto)'}</span>
                    <span className="history-meta">
                      −{entry.reductionPct.toFixed(0)}% · {formatUsd(entry.monthlySavingsUsd)}/mes ·{' '}
                      {new Date(entry.at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="note">
              El historial se guarda solo en este navegador; nada sale de tu máquina.
            </p>
          </div>
        )}
      </div>

      {/* ---------------- Resultados ---------------- */}
      <div>
        {error && <div className="card error">{error}</div>}

        {!result && !error && (
          <div className="card">
            <p className="empty">
              Pega tu prompt y pulsa <strong>Optimizar</strong> para ver qué sobra y cuánto cuesta.
            </p>
          </div>
        )}

        {result && (
          <>
            <div className="card">
              <h2>Resultado</h2>
              <div className="headline">
                <span className="pct">−{result.reductionPct.toFixed(1)}%</span>
                <span className="tokens">
                  {result.tokensBefore.toLocaleString('es-ES')} →{' '}
                  {result.tokensAfter.toLocaleString('es-ES')} tokens de entrada
                </span>
              </div>

              <div className="money">
                <div className="amount">
                  {formatUsd(result.savings.monthlySavingsUsd)} / mes
                </div>
                <div className="caption">
                  {formatUsd(result.savings.perMonth.before.totalUsd)} →{' '}
                  {formatUsd(result.savings.perMonth.after.totalUsd)} con{' '}
                  {result.savings.modelDisplayName}, {result.usage.callsPerMonth.toLocaleString('es-ES')}{' '}
                  llamadas/mes
                  {result.savings.promoApplied ? ' (precio de lanzamiento)' : ''}
                </div>
              </div>

              {result.llm && (
                <p className="note">
                  {result.llm.applied
                    ? `Pasada por ${result.llm.provider}/${result.llm.model} aplicada: ${result.llm.tokensBefore} → ${result.llm.tokensAfter} tokens.`
                    : `Pasada por LLM descartada: ${result.llm.rejectedReason}`}
                </p>
              )}
            </div>

            <div className="card">
              <div className="toolbar">
                <h2 style={{ margin: 0 }}>
                  {showDiff ? 'Qué ha cambiado' : 'Prompt optimizado'}
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ghost" onClick={() => setShowDiff((v) => !v)}>
                    {showDiff ? 'Ver resultado' : 'Ver diff'}
                  </button>
                  <button className="ghost" onClick={copyOptimized}>
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              {showDiff ? (
                diff ? (
                  <pre className="diff">
                    {diff.map((part, index) => (
                      <span key={index} className={`diff-${part.type === 'same' ? 'same' : part.type}`}>
                        {part.text}
                      </span>
                    ))}
                  </pre>
                ) : (
                  <p className="note">
                    El prompt es demasiado largo para calcular el diff en el navegador. Usa la CLI
                    con <code>--diff</code>.
                  </p>
                )
              ) : (
                <pre className="output">{result.optimized}</pre>
              )}
            </div>

            {result.rules.length > 0 && (
              <div className="card">
                <h2>Reglas aplicadas</h2>
                <ul className="plain">
                  {result.rules.map((rule) => (
                    <li key={rule.id} className="rule">
                      <span className={`badge ${rule.level}`}>
                        {rule.level === 'aggressive' ? 'agresiva' : 'segura'}
                      </span>
                      <span>
                        {rule.title}{' '}
                        <span style={{ color: 'var(--text-dim)' }}>
                          ({rule.hits}×, ~{rule.tokensSaved} tokens)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.advisories.length > 0 && (
              <div className="card">
                <h2>Además de acortar el prompt</h2>
                <ul className="plain">
                  {result.advisories.map((advisory) => (
                    <li key={advisory.id} className={`advisory ${advisory.severity}`}>
                      <div className="title">
                        {advisory.title}
                        {advisory.estimatedMonthlyUsd !== null && (
                          <span className="est">
                            ~{formatUsd(advisory.estimatedMonthlyUsd)}/mes
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
