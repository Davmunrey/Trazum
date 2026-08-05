import { segment } from './segment.js';
import type { TokenCounter } from './types.js';

/**
 * Análisis del prefijo cacheable.
 *
 * El prompt caching es una coincidencia de prefijo byte a byte: en cuanto un
 * marcador de plantilla ({{usuario}}, ${consulta}...) se rellena con un valor
 * distinto, todo lo que va detrás deja de cachearse. Así que el prefijo
 * cacheable real de una plantilla NO es el prompt entero, sino lo que hay
 * antes del primer marcador variable.
 */
export interface CachePrefixAnalysis {
  /** Tokens totales del prompt. */
  totalTokens: number;
  /** Tokens antes del primer marcador variable. Sin marcadores, el total. */
  stablePrefixTokens: number;
  /** Texto del primer marcador variable, o `null` si no hay ninguno. */
  firstPlaceholder: string | null;
  /**
   * Tokens de contenido que NO es marcador situados después del primer
   * marcador: instrucciones estables que hoy no se cachean y que, si se
   * mueven antes del primer marcador, sí se cachearían.
   */
  staticTokensAfter: number;
}

export function analyzeCachePrefix(prompt: string, count: TokenCounter): CachePrefixAnalysis {
  const segments = segment(prompt);
  const totalTokens = count(prompt);

  let firstPlaceholder: string | null = null;
  let prefix = '';
  let staticAfter = '';

  for (const seg of segments) {
    if (firstPlaceholder === null) {
      if (seg.kind === 'protected' && seg.protection === 'placeholder') {
        firstPlaceholder = seg.text;
      } else {
        prefix += seg.text;
      }
    } else if (!(seg.kind === 'protected' && seg.protection === 'placeholder')) {
      staticAfter += seg.text;
    }
  }

  return {
    totalTokens,
    stablePrefixTokens: firstPlaceholder === null ? totalTokens : count(prefix),
    firstPlaceholder,
    staticTokensAfter: firstPlaceholder === null ? 0 : count(staticAfter),
  };
}
