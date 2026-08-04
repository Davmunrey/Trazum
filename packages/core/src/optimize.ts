import { buildAdvisories } from './advisories.js';
import { DEFAULT_MODEL } from './pricing.js';
import { RULES } from './rules.js';
import { computeSavings } from './savings.js';
import { join, segment } from './segment.js';
import { estimateTokens } from './tokenizer.js';
import type { AsyncTokenCounter } from './tokenizer.js';
import type {
  OptimizationResult,
  OptimizeOptions,
  RuleResult,
  Segment,
  TokenCounter,
  UsageProfile,
} from './types.js';

const MASK_OPEN = '\uE000';
const MASK_CLOSE = '\uE001';
const MASK_BASE = 0xe100;
/** Slots del área de uso privado disponibles para máscaras. */
const MASK_CAPACITY = 0xf8ff - MASK_BASE;

export const DEFAULT_USAGE: UsageProfile = {
  model: DEFAULT_MODEL,
  callsPerMonth: 1000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  batchEligible: false,
};

interface Masked {
  text: string;
  /** Texto original de cada segmento protegido, indexado por su máscara. */
  vault: string[];
}

/**
 * Sustituye cada segmento protegido por un marcador de 3 caracteres del área
 * de uso privado Unicode. Las reglas trabajan sobre el texto enmascarado, así
 * que ninguna puede tocar código, URLs ni marcadores de plantilla.
 */
function mask(segments: Segment[]): Masked {
  const vault: string[] = [];
  let text = '';

  for (const seg of segments) {
    if (seg.kind === 'mutable') {
      text += seg.text;
      continue;
    }
    if (vault.length >= MASK_CAPACITY) {
      // Prompt con miles de bloques protegidos: se deja tal cual antes de
      // arriesgar una colisión de máscaras.
      text += seg.text;
      continue;
    }
    const slot = String.fromCharCode(MASK_BASE + vault.length);
    vault.push(seg.text);
    text += MASK_OPEN + slot + MASK_CLOSE;
  }

  return { text, vault };
}

/** Restituye el contenido protegido. */
function unmask(text: string, vault: string[]): string {
  return text.replace(
    new RegExp(`${MASK_OPEN}([\\s\\S])${MASK_CLOSE}`, 'g'),
    (whole, slot: string) => {
      const index = slot.charCodeAt(0) - MASK_BASE;
      const original = vault[index];
      return original === undefined ? whole : original;
    },
  );
}

/** Textos protegidos distintos que deben seguir presentes tras optimizar. */
function distinctProtected(segments: Segment[]): string[] {
  return [...new Set(segments.filter((s) => s.kind === 'protected').map((s) => s.text))];
}

/**
 * Optimiza un prompt aplicando reglas deterministas.
 *
 * El resultado es reproducible: la misma entrada da siempre la misma salida y
 * ejecutarlo no cuesta nada. La pasada opcional por un LLM va aparte, en
 * `refineWithLlm`.
 */
export function optimize(prompt: string, options: OptimizeOptions = {}): OptimizationResult {
  const level = options.level ?? 'safe';
  const disabled = new Set(options.disableRules ?? []);
  const count: TokenCounter = options.tokenCounter ?? estimateTokens;

  const segments = segment(prompt);
  const mustSurvive = distinctProtected(segments);
  const { text: maskedOriginal, vault } = mask(segments);

  let current = maskedOriginal;
  const ruleResults: RuleResult[] = [];

  for (const rule of RULES) {
    if (disabled.has(rule.id)) continue;
    if (rule.level === 'aggressive' && level !== 'aggressive') continue;

    const before = count(unmask(current, vault));
    const { text: candidate, hits } = rule.apply(current);
    if (hits === 0 || candidate === current) continue;

    const candidateUnmasked = unmask(candidate, vault);

    // Red de seguridad: si una regla ha hecho desaparecer contenido protegido,
    // se descarta esa regla en lugar de devolver un prompt roto.
    const lostProtected = mustSurvive.some((text) => !candidateUnmasked.includes(text));
    if (lostProtected) continue;

    const after = count(candidateUnmasked);
    current = candidate;
    ruleResults.push({
      id: rule.id,
      title: rule.title,
      rationale: rule.rationale,
      level: rule.level,
      hits,
      tokensSaved: Math.max(0, before - after),
    });
  }

  const optimized = unmask(current, vault).trim();
  const tokensBefore = count(prompt);
  const tokensAfter = count(optimized);

  const usage: UsageProfile = { ...DEFAULT_USAGE, ...options.usage };
  const savings = computeSavings(tokensBefore, tokensAfter, usage);
  const advisories = buildAdvisories(optimized, tokensAfter, usage);

  return {
    original: prompt,
    optimized,
    tokensBefore,
    tokensAfter,
    tokensSaved: tokensBefore - tokensAfter,
    reductionPct: tokensBefore > 0 ? ((tokensBefore - tokensAfter) / tokensBefore) * 100 : 0,
    rules: ruleResults,
    advisories,
    savings,
    usage,
    tokenSource: options.tokenCounter ? 'external' : 'heuristic',
  };
}

/**
 * Recalcula el informe con un contador de tokens exacto (p. ej. el endpoint
 * oficial de recuento).
 *
 * Solo se recalculan las cifras globales y el ahorro. El reparto de tokens por
 * regla se queda en la estimación heurística: pedir un recuento remoto por cada
 * regla multiplicaría las llamadas sin cambiar ninguna decisión.
 */
export async function withExactTokenCounts(
  result: OptimizationResult,
  counter: AsyncTokenCounter,
): Promise<OptimizationResult> {
  const [tokensBefore, tokensAfter] = await Promise.all([
    counter(result.original),
    counter(result.optimized),
  ]);

  const savings = computeSavings(tokensBefore, tokensAfter, result.usage);
  const advisories = buildAdvisories(result.optimized, tokensAfter, result.usage);

  return {
    ...result,
    tokensBefore,
    tokensAfter,
    tokensSaved: tokensBefore - tokensAfter,
    reductionPct: tokensBefore > 0 ? ((tokensBefore - tokensAfter) / tokensBefore) * 100 : 0,
    savings,
    advisories,
    tokenSource: 'external',
  };
}

/** Reexporta utilidades internas útiles para quien extienda la librería. */
export { join, mask as maskProtected, segment, unmask as unmaskProtected };
