import { segment } from './segment.js';
import type { TokenCounter } from './types.js';

/**
 * Cacheable-prefix analysis.
 *
 * Prompt caching is a byte-for-byte prefix match, so as soon as a template
 * placeholder ({{user}}, ${query}...) is filled with a different value,
 * everything after it stops being cached. The real cacheable prefix of a
 * template is therefore NOT the whole prompt, but whatever precedes the first
 * variable placeholder.
 */
export interface CachePrefixAnalysis {
  /** Total tokens in the prompt. */
  totalTokens: number;
  /** Tokens before the first variable placeholder. With no placeholders, the total. */
  stablePrefixTokens: number;
  /** Text of the first variable placeholder, or `null` when there is none. */
  firstPlaceholder: string | null;
  /**
   * Tokens of NON-placeholder content sitting after the first placeholder:
   * stable instructions that are not cached today and that would be cached if
   * moved ahead of the first placeholder.
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
