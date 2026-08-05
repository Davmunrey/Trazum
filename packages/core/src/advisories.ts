import { COST_MULTIPLIERS, MODELS, effectivePricing, getModel } from './pricing.js';
import { formatUsd } from './savings.js';
import type { Advisory, ModelPricing, UsageProfile } from './types.js';

const COMPLEX_SIGNALS = [
  'analiza',
  'razona',
  'demuestra',
  'diseña',
  'arquitectura',
  'refactoriza',
  'depura',
  'optimiza',
  'estrategia',
  'agente',
  'herramienta',
  'paso a paso',
  'investiga',
  'audita',
  'migra',
  'analyze',
  'reason',
  'prove',
  'design',
  'architecture',
  'refactor',
  'debug',
  'agent',
  'tool use',
  'multi-step',
  'step by step',
  'strategy',
  'investigate',
  'audit',
  'migrate',
];

const SIMPLE_SIGNALS = [
  'clasifica',
  'traduce',
  'extrae',
  'resume',
  'etiqueta',
  'sentimiento',
  'formatea',
  'corrige la ortografía',
  'sí o no',
  'classify',
  'translate',
  'extract',
  'summarize',
  'label',
  'sentiment',
  'format as',
  'yes or no',
  'tag the',
];

function countSignals(haystack: string, signals: readonly string[]): number {
  let count = 0;
  for (const signal of signals) if (haystack.includes(signal)) count++;
  return count;
}

/**
 * Estima el nivel de capacidad que necesita el prompt.
 *
 * Es una heurística por palabras clave y tamaño, no un juicio sobre la calidad
 * de la respuesta. Trátala como una hipótesis a validar con tus propias
 * evaluaciones antes de bajar de modelo en producción.
 */
export function recommendTier(prompt: string, tokens: number): ModelPricing['tier'] {
  const haystack = prompt.toLowerCase();
  let score = countSignals(haystack, COMPLEX_SIGNALS) * 2 - countSignals(haystack, SIMPLE_SIGNALS) * 2;

  if (tokens > 4000) score += 2;
  else if (tokens > 1500) score += 1;
  else if (tokens < 300) score -= 1;

  if (/```|~~~/.test(prompt)) score += 1;

  if (score >= 3) return 'opus';
  if (score >= 0) return 'sonnet';
  return 'haiku';
}

const TIER_ORDER: Record<ModelPricing['tier'], number> = {
  haiku: 0,
  sonnet: 1,
  opus: 2,
  frontier: 3,
};

/** Modelo más barato de un nivel, mirando el precio de entrada vigente hoy. */
function cheapestInTier(tier: ModelPricing['tier'], on: Date): ModelPricing | undefined {
  const candidates = MODELS.filter((m) => m.tier === tier && m.id !== 'claude-mythos-5');
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, m) =>
    effectivePricing(m, on).inputPerMTok < effectivePricing(best, on).inputPerMTok ? m : best,
  );
}

/** Genera los avisos que no modifican el prompt pero sí la factura. */
export function buildAdvisories(
  optimizedPrompt: string,
  tokensAfter: number,
  usage: UsageProfile,
  on: Date = new Date(),
): Advisory[] {
  const advisories: Advisory[] = [];
  const model = getModel(usage.model);
  const { inputPerMTok, outputPerMTok, promoApplied } = effectivePricing(model, on);

  const monthlyInputUsd =
    (tokensAfter / 1_000_000) * inputPerMTok * usage.callsPerMonth * (usage.batchEligible ? 0.5 : 1);
  const monthlyOutputUsd =
    (usage.avgOutputTokens / 1_000_000) *
    outputPerMTok *
    usage.callsPerMonth *
    (usage.batchEligible ? 0.5 : 1);

  // --- Ventana de contexto ---
  if (tokensAfter > model.contextWindow) {
    advisories.push({
      id: 'context-overflow',
      severity: 'warning',
      title: 'El prompt no cabe en la ventana de contexto',
      detail: `El prompt optimizado ocupa ~${tokensAfter.toLocaleString('es-ES')} tokens y ${model.displayName} admite ${model.contextWindow.toLocaleString('es-ES')}. La llamada fallará: divide el contenido o cambia a un modelo con ventana mayor.`,
      estimatedMonthlyUsd: null,
    });
  }

  // --- Prompt caching ---
  if (usage.callsPerMonth > 1) {
    if (tokensAfter >= model.cacheMinTokens) {
      const h = Math.min(Math.max(usage.cacheHitRate, 0), 1);
      const factor = (1 - h) * COST_MULTIPLIERS.cacheWrite5m + h * COST_MULTIPLIERS.cacheRead;
      const saving = monthlyInputUsd * (1 - factor);
      if (saving > 0) {
        advisories.push({
          id: 'prompt-caching',
          severity: 'opportunity',
          title: 'Activa prompt caching en el prefijo estable',
          detail: `El prompt supera el mínimo cacheable de ${model.cacheMinTokens.toLocaleString('es-ES')} tokens de ${model.displayName}. Con una tasa de acierto del ${Math.round(h * 100)}%, la lectura de caché cuesta un 10% del precio de entrada y la escritura un 125%. Coloca el contenido estable primero y el variable después del último punto de caché: cualquier byte que cambie antes del corte invalida todo lo que va detrás.`,
          estimatedMonthlyUsd: saving,
        });
      } else {
        advisories.push({
          id: 'prompt-caching-not-worth-it',
          severity: 'info',
          title: 'Con esa tasa de acierto, la caché no compensa',
          detail: `Escribir en caché cuesta un 125% del precio de entrada y leer un 10%. Por debajo de un ~28% de aciertos pagas más de lo que ahorras. Sube la reutilización del prefijo o deja la caché desactivada.`,
          estimatedMonthlyUsd: null,
        });
      }
    } else {
      advisories.push({
        id: 'below-cache-minimum',
        severity: 'info',
        title: 'Por debajo del mínimo cacheable',
        detail:
          `${model.displayName} necesita al menos ${model.cacheMinTokens.toLocaleString('es-ES')} tokens de prefijo para cachear; este prompt tiene ~${tokensAfter.toLocaleString('es-ES')}. Marcar cache_control no dará error, simplemente no cacheará.` +
          (model.cacheMinTokens > 512
            ? ' Claude Opus 5 baja ese mínimo a 512 tokens, así que prompts cortos que aquí no cachean, allí sí.'
            : ''),
        estimatedMonthlyUsd: null,
      });
    }
  }

  // --- Batch API ---
  if (!usage.batchEligible && usage.callsPerMonth > 1) {
    const saving = (monthlyInputUsd + monthlyOutputUsd) * COST_MULTIPLIERS.batch;
    advisories.push({
      id: 'batch-api',
      severity: 'opportunity',
      title: 'Si el trabajo tolera latencia, usa la Batch API',
      detail:
        'La Batch API aplica un 50% de descuento sobre entrada y salida. La mayoría de lotes terminan en menos de una hora, con un máximo de 24. Sirve para clasificación masiva, enriquecimiento de datos o evaluaciones: cualquier cosa que no responda a un usuario en tiempo real.',
      estimatedMonthlyUsd: saving,
    });
  }

  // --- Modelo recomendado ---
  const suggestedTier = recommendTier(optimizedPrompt, tokensAfter);
  if (TIER_ORDER[suggestedTier] < TIER_ORDER[model.tier]) {
    const candidate = cheapestInTier(suggestedTier, on);
    if (candidate) {
      const candidatePricing = effectivePricing(candidate, on);
      const candidateMonthly =
        ((tokensAfter / 1_000_000) * candidatePricing.inputPerMTok +
          (usage.avgOutputTokens / 1_000_000) * candidatePricing.outputPerMTok) *
        usage.callsPerMonth *
        (usage.batchEligible ? 0.5 : 1);
      const saving = monthlyInputUsd + monthlyOutputUsd - candidateMonthly;
      if (saving > 0) {
        advisories.push({
          id: 'model-downgrade',
          severity: 'opportunity',
          title: `Esta tarea quizá no necesite ${model.displayName}`,
          detail: `Por longitud y vocabulario, el prompt parece de complejidad "${suggestedTier}". Con ${candidate.displayName} pasarías de ${formatUsd(monthlyInputUsd + monthlyOutputUsd)} a ${formatUsd(candidateMonthly)} al mes. Es una heurística por palabras clave, no un juicio de calidad: mide la diferencia con tus propias evaluaciones antes de cambiar en producción.`,
          estimatedMonthlyUsd: saving,
        });
      }
    }
  }

  // --- Dónde está realmente el dinero ---
  if (monthlyOutputUsd > monthlyInputUsd * 2 && usage.avgOutputTokens > 0) {
    advisories.push({
      id: 'output-dominated',
      severity: 'info',
      title: 'Tu coste está en la salida, no en el prompt',
      detail: `La salida supone ${formatUsd(monthlyOutputUsd)} al mes frente a ${formatUsd(monthlyInputUsd)} de entrada. Acortar el prompt tiene un techo bajo aquí. Los dos controles que mueven la aguja son el parámetro effort (bájalo si la tarea no es intensiva en razonamiento) y pedir respuestas concisas de forma explícita.`,
      estimatedMonthlyUsd: null,
    });
  }

  if (promoApplied && model.promo) {
    advisories.push({
      id: 'promo-pricing',
      severity: 'warning',
      title: 'Estás calculando con precio promocional',
      detail: `${model.displayName} tiene precio de lanzamiento ${model.promo.inputPerMTok}/${model.promo.outputPerMTok} por millón de tokens hasta el ${model.promo.until}. A partir de esa fecha pasa a ${model.inputPerMTok}/${model.outputPerMTok}: tu factura subirá aunque no cambies nada.`,
      estimatedMonthlyUsd: null,
    });
  }

  return advisories.sort((a, b) => (b.estimatedMonthlyUsd ?? 0) - (a.estimatedMonthlyUsd ?? 0));
}
