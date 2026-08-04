import type { ProtectionKind, Segment } from './types.js';

/**
 * Trocea el prompt en segmentos mutables y protegidos.
 *
 * Lo protegido no se toca NUNCA. Comprimir un bloque de código, una URL o un
 * marcador de plantilla rompería el prompt, y ese es exactamente el fallo que
 * hace inservible a un optimizador de prompts.
 */

interface PatternDef {
  kind: ProtectionKind;
  regex: RegExp;
  /**
   * Caracteres a recortar del final de la coincidencia. Hace falta en las URLs:
   * el punto de "visita https://ejemplo.com/guia." es de la frase, no de la URL,
   * y protegerlo deja puntuación duplicada al limpiar el resto.
   */
  trimTrailing?: RegExp;
}

// El orden importa: el primero que empareja en una posición gana.
const PATTERNS: PatternDef[] = [
  // Bloques de código con vallas ``` o ~~~ (incluye bloques sin cerrar hasta el final).
  { kind: 'fenced-code', regex: /(?:```|~~~)[\s\S]*?(?:```|~~~|$)/g },
  // Bloques indentados de 4+ espacios se dejan a las reglas: son ambiguos en markdown.
  { kind: 'url', regex: /\b(?:https?|ftp):\/\/[^\s<>"')\]]+/g, trimTrailing: /[.,;:!?]+$/ },
  // Marcadores de plantilla: {{var}}, {var}, ${var}, {% tag %}, <<VAR>>, %(var)s
  { kind: 'placeholder', regex: /\{\{[^{}]*\}\}|\{%[\s\S]*?%\}|\$\{[^{}]*\}|<<[A-Z0-9_]+>>|%\([^()]*\)[sdfr]|\{[A-Za-z_][A-Za-z0-9_.]*\}/g },
  // Código en línea con backticks.
  { kind: 'inline-code', regex: /`[^`\n]+`/g },
  // Etiquetas XML/HTML, muy usadas para estructurar prompts.
  { kind: 'xml-tag', regex: /<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*?)?\/?>/g },
];

interface Match {
  start: number;
  end: number;
  kind: ProtectionKind;
}

/** Divide el texto en segmentos, marcando lo que no debe modificarse. */
export function segment(text: string): Segment[] {
  const matches: Match[] = [];

  for (const { kind, regex, trimTrailing } of PATTERNS) {
    // Copia el regex para no compartir lastIndex entre llamadas.
    const re = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let matched = m[0];
      if (matched.length === 0) {
        re.lastIndex++;
        continue;
      }
      if (trimTrailing) matched = matched.replace(trimTrailing, '');
      if (matched.length === 0) continue;
      matches.push({ start: m.index, end: m.index + matched.length, kind });
    }
  }

  // Ordena por inicio y, a igualdad, por el tramo más largo primero.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Elimina solapamientos quedándose con el primero de cada posición.
  const kept: Match[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    kept.push(match);
    cursor = match.end;
  }

  const segments: Segment[] = [];
  let pos = 0;
  for (const match of kept) {
    if (match.start > pos) {
      segments.push({ kind: 'mutable', text: text.slice(pos, match.start) });
    }
    segments.push({
      kind: 'protected',
      protection: match.kind,
      text: text.slice(match.start, match.end),
    });
    pos = match.end;
  }
  if (pos < text.length) {
    segments.push({ kind: 'mutable', text: text.slice(pos) });
  }

  return segments;
}

/** Vuelve a unir los segmentos en un texto. */
export function join(segments: Segment[]): string {
  return segments.map((s) => s.text).join('');
}

/** Devuelve solo el texto de los segmentos protegidos, en orden. */
export function protectedTexts(segments: Segment[]): string[] {
  return segments.filter((s) => s.kind === 'protected').map((s) => s.text);
}
