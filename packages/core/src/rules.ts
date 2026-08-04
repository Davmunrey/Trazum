import type { Rule } from './types.js';
import {
  EMPHASIS_PREFIXES,
  FILLER,
  HEDGES,
  INTENSIFIERS,
  POLITENESS,
  SELF_CHECK,
  SHOUTED_WORDS,
  VERBOSE_PHRASES,
} from './phrases.js';

/** Escapa un literal para meterlo en una expresión regular. */
function escapeRe(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Construye un regex con fronteras de palabra que entienden acentos.
 * `\b` en JavaScript solo conoce ASCII, así que "de" emparejaría dentro de
 * "ánde". Con lookarounds sobre \p{L} eso no pasa.
 */
function phraseRegex(phrase: string, flags = 'giu'): RegExp {
  const body = escapeRe(phrase).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, flags);
}

/** Limpia los restos que deja borrar una frase: espacios y puntuación suelta. */
function tidyAfterRemoval(text: string): string {
  return (
    text
      // Espacios múltiples dentro de una línea (no toca la sangría inicial).
      .replace(/([^\n\S])[^\S\n]+/g, '$1')
      // Coma o punto y coma pegados a un espacio previo.
      .replace(/[^\S\n]+([,;:.!?])/g, '$1')
      // Comas duplicadas por el borrado.
      .replace(/,(\s*,)+/g, ',')
      // Signo de puntuación al inicio de línea.
      .replace(/^[^\S\n]*[,;:]\s*/gm, '')
      // Apertura de exclamación o interrogación que se quedó sin contenido.
      .replace(/[¡¿]+(?=[^\S\n]*(?:[!?.,;:]|$))/gm, '')
      // Puntuación final duplicada al juntarse dos fragmentos ("contestar.!").
      .replace(/([.!?])[^\S\n]*[.!?]+/g, '$1')
      // Línea que se ha quedado solo con signos de puntuación.
      .replace(/^[^\S\n]*[.,;:!?¡¿]+[^\S\n]*$/gm, '')
      // Un único espacio al inicio de línea: es residuo del borrado, no sangría.
      .replace(/^[^\S\n](?=\S)/gm, '')
      // Espacios al final de línea.
      .replace(/[^\S\n]+$/gm, '')
      // Vuelve a poner mayúscula si el borrado dejó la frase empezando en minúscula.
      // Cuenta como inicio de frase: el principio del texto, tras puntuación
      // fuerte, y el comienzo de un párrafo nuevo.
      .replace(
        /(^|[.!?]\s+|\n\n[^\S\n]*)(\p{Ll})/gu,
        (_m, pre: string, ch: string) => pre + ch.toUpperCase(),
      )
  );
}

/**
 * Regex de borrado: además de la frase, se come las comas que la delimitaban.
 * Sin esto, quitar un inciso como "si no te importa," deja "y, la clasifiques".
 */
function dropRegex(phrase: string): RegExp {
  const body = escapeRe(phrase).replace(/\s+/g, '\\s+');
  // La comprobación de frontera va DESPUÉS de la coma opcional: si fuera antes,
  // la "y" de "y, si no te importa," la haría fallar y la coma se quedaría.
  return new RegExp(
    `(?:,[^\\S\\n]*)?(?<![\\p{L}\\p{N}_])${body}[^\\S\\n]*,?(?![\\p{L}\\p{N}_])`,
    'giu',
  );
}

/** Regla que elimina un conjunto de frases. */
function dropRule(
  id: string,
  title: string,
  rationale: string,
  level: Rule['level'],
  phrases: readonly string[],
): Rule {
  // De más larga a más corta, para que "muchas gracias" gane a "gracias".
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const regexes = sorted.map((p) => dropRegex(p));

  return {
    id,
    title,
    rationale,
    level,
    apply(text) {
      let hits = 0;
      let out = text;
      for (const re of regexes) {
        out = out.replace(re, () => {
          hits++;
          return '';
        });
      }
      return { text: hits > 0 ? tidyAfterRemoval(out) : out, hits };
    },
  };
}

/** Conserva la mayúscula inicial del original al sustituir. */
function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  const firstChar = original[0];
  if (firstChar && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const whitespaceRule: Rule = {
  id: 'whitespace',
  title: 'Espacios y líneas en blanco sobrantes',
  rationale:
    'Quita espacios al final de línea, colapsa espacios repetidos dentro de la línea y reduce las líneas en blanco consecutivas a una. Respeta la sangría inicial para no romper listas ni markdown anidado.',
  level: 'safe',
  apply(text) {
    let hits = 0;
    let out = text;

    out = out.replace(/[^\S\n]+$/gm, () => {
      hits++;
      return '';
    });
    // Colapsa espacios repetidos solo después del primer carácter no-espacio.
    out = out.replace(/(\S)[^\S\n]{2,}/g, (_m, ch: string) => {
      hits++;
      return `${ch} `;
    });
    out = out.replace(/\n{3,}/g, () => {
      hits++;
      return '\n\n';
    });
    out = out.replace(/\t/g, () => {
      hits++;
      return ' ';
    });

    return { text: out, hits };
  },
};

const decorationRule: Rule = {
  id: 'decoration',
  title: 'Separadores decorativos',
  rationale:
    'Elimina líneas hechas solo de caracteres repetidos (====, ----, ****) y las secuencias de signos de exclamación. No aportan estructura que el modelo aproveche y cuestan tokens en cada llamada.',
  level: 'safe',
  apply(text) {
    let hits = 0;
    let out = text;

    // Línea entera de 8 o más caracteres decorativos idénticos.
    out = out.replace(/^[^\S\n]*([=\-_*~#])\1{7,}[^\S\n]*$/gm, () => {
      hits++;
      return '';
    });
    // Signos de exclamación o interrogación repetidos, incluidos los de apertura.
    out = out.replace(/([!?¡¿])\1{1,}/g, (_m, ch: string) => {
      hits++;
      return ch;
    });
    // Limpia las líneas vacías que acaba de dejar el borrado.
    if (hits > 0) out = out.replace(/\n{3,}/g, '\n\n');

    return { text: out, hits };
  },
};

const verbosePhrasesRule: Rule = {
  id: 'verbose-phrases',
  title: 'Perífrasis largas',
  rationale:
    'Sustituye construcciones largas por su equivalente corto ("con el fin de" → "para", "in order to" → "to"). El significado es idéntico; solo cambia el número de tokens.',
  level: 'safe',
  apply(text) {
    let hits = 0;
    let out = text;
    // De más larga a más corta para que gane la sustitución más específica.
    const entries = [...VERBOSE_PHRASES].sort((a, b) => b[0].length - a[0].length);
    for (const [from, to] of entries) {
      const re = phraseRegex(from);
      out = out.replace(re, (match) => {
        hits++;
        return matchCase(match, to);
      });
    }
    return { text: hits > 0 ? tidyAfterRemoval(out) : out, hits };
  },
};

const politenessRule = dropRule(
  'politeness',
  'Fórmulas de cortesía',
  'Quita "por favor", "gracias", "please", "kindly"... El modelo no responde mejor por pedírselo con cortesía, y cada fórmula se paga en todas las llamadas.',
  'safe',
  POLITENESS,
);

const fillerRule = dropRule(
  'filler',
  'Muletillas y rodeos',
  'Elimina arranques vacíos como "básicamente", "cabe destacar que" o "it is important to note that", que no aportan instrucción.',
  'safe',
  FILLER,
);

const intensifiersRule = dropRule(
  'intensifiers',
  'Intensificadores',
  'Quita "muy", "realmente", "extremely"... Rara vez cambian la tarea. Nivel agresivo porque en algún prompt concreto el matiz sí importa.',
  'aggressive',
  INTENSIFIERS,
);

const hedgesRule = dropRule(
  'hedges',
  'Coletillas de duda',
  'Elimina "creo que", "I think", "en mi opinión". En una instrucción debilitan la orden sin añadir información.',
  'aggressive',
  HEDGES,
);

const selfCheckRule = dropRule(
  'self-check',
  'Instrucciones de auto-verificación',
  'Quita "verifica tu respuesta", "double-check your work". Los modelos actuales ya verifican su trabajo; pedirlo explícitamente dispara pasos extra que se pagan en tokens de salida. Desactívala si tu flujo depende de esa verificación.',
  'aggressive',
  SELF_CHECK,
);

const emphasisRule: Rule = {
  id: 'emphasis',
  title: 'Énfasis en mayúsculas',
  rationale:
    'Pasa a minúscula palabras gritadas (MUST, NUNCA, CRITICAL) y quita prefijos tipo "IMPORTANTE:". Las mayúsculas se parten en más tokens que las minúsculas, y en los modelos actuales el énfasis excesivo hace que la instrucción se dispare de más.',
  level: 'aggressive',
  apply(text) {
    let hits = 0;
    let out = text;

    for (const prefix of EMPHASIS_PREFIXES) {
      const re = new RegExp(`^([^\\S\\n]*)${escapeRe(prefix)}\\s*:\\s*`, 'gm');
      out = out.replace(re, (_m, indent: string) => {
        hits++;
        return indent;
      });
    }

    for (const word of SHOUTED_WORDS) {
      const re = phraseRegex(word, 'gu'); // sensible a mayúsculas: solo la versión gritada
      out = out.replace(re, (match) => {
        hits++;
        return match.toLowerCase();
      });
    }

    // Quitar "IMPORTANTE:" deja la frase empezando en minúscula: se recapitaliza.
    return { text: hits > 0 ? tidyAfterRemoval(out) : out, hits };
  },
};

/** Normaliza una línea o párrafo para comparar duplicados. */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const duplicateLinesRule: Rule = {
  id: 'duplicate-lines',
  title: 'Líneas repetidas',
  rationale:
    'Elimina líneas que ya aparecen idénticas antes en el prompt (ignorando mayúsculas, acentos y puntuación). Solo actúa sobre líneas de 25 caracteres o más, para no tocar viñetas ni separadores legítimos.',
  level: 'safe',
  apply(text) {
    const lines = text.split('\n');
    const seen = new Set<string>();
    const kept: string[] = [];
    let hits = 0;

    for (const line of lines) {
      const normalized = normalizeForCompare(line);
      if (normalized.length >= 25) {
        if (seen.has(normalized)) {
          hits++;
          continue;
        }
        seen.add(normalized);
      }
      kept.push(line);
    }

    let out = kept.join('\n');
    if (hits > 0) out = out.replace(/\n{3,}/g, '\n\n');
    return { text: out, hits };
  },
};

const duplicateBlocksRule: Rule = {
  id: 'duplicate-blocks',
  title: 'Párrafos repetidos',
  rationale:
    'Elimina párrafos enteros que ya aparecen antes en el prompt. Es habitual al montar prompts por concatenación de plantillas: el mismo bloque de instrucciones entra dos veces y se paga dos veces.',
  level: 'safe',
  apply(text) {
    const blocks = text.split(/\n{2,}/);
    const seen = new Set<string>();
    const kept: string[] = [];
    let hits = 0;

    for (const block of blocks) {
      const normalized = normalizeForCompare(block);
      if (normalized.length >= 40) {
        if (seen.has(normalized)) {
          hits++;
          continue;
        }
        seen.add(normalized);
      }
      kept.push(block);
    }

    return { text: kept.join('\n\n'), hits };
  },
};

/** Similitud de Jaccard sobre conjuntos de palabras. */
function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

const nearDuplicateBlocksRule: Rule = {
  id: 'near-duplicate-blocks',
  title: 'Párrafos casi idénticos',
  rationale:
    'Elimina párrafos con un 92% o más de palabras en común con otro anterior. Detecta instrucciones reformuladas que dicen lo mismo dos veces. Nivel agresivo: revisa el diff, porque el 8% que difiere puede ser justo el matiz que te importa.',
  level: 'aggressive',
  apply(text) {
    const blocks = text.split(/\n{2,}/);
    const keptNormalized: string[] = [];
    const kept: string[] = [];
    let hits = 0;

    for (const block of blocks) {
      const normalized = normalizeForCompare(block);
      if (normalized.length >= 60) {
        const isDuplicate = keptNormalized.some((prev) => jaccard(prev, normalized) >= 0.92);
        if (isDuplicate) {
          hits++;
          continue;
        }
        keptNormalized.push(normalized);
      }
      kept.push(block);
    }

    return { text: kept.join('\n\n'), hits };
  },
};

/** Todas las reglas, en el orden en que deben ejecutarse. */
export const RULES: readonly Rule[] = [
  // Primero las que borran bloques enteros: así el resto trabaja sobre menos texto.
  duplicateBlocksRule,
  nearDuplicateBlocksRule,
  duplicateLinesRule,
  // Luego las de frase.
  verbosePhrasesRule,
  politenessRule,
  fillerRule,
  hedgesRule,
  intensifiersRule,
  selfCheckRule,
  emphasisRule,
  // Y por último la limpieza tipográfica, que recoge lo que dejaron las demás.
  decorationRule,
  whitespaceRule,
];

export function getRule(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
