export interface DiffPart {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** Límite de piezas por lado: por encima, la tabla de LCS no compensa. */
const MAX_PIECES = 1500;

/** Trocea en palabras conservando los espacios, para que el diff sea legible. */
function toWords(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Diff por palabras basado en la subsecuencia común más larga.
 *
 * Si el texto es demasiado grande cae a un diff por líneas, y si aun así no
 * cabe, devuelve `null` para que la UI muestre el prompt sin diff en vez de
 * bloquear la pestaña.
 */
export function diffTexts(before: string, after: string): DiffPart[] | null {
  let a = toWords(before);
  let b = toWords(after);

  if (a.length > MAX_PIECES || b.length > MAX_PIECES) {
    a = before.split(/(\n)/).filter(Boolean);
    b = after.split(/(\n)/).filter(Boolean);
    if (a.length > MAX_PIECES || b.length > MAX_PIECES) return null;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Int32Array(rows * cols);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + (j + 1)]! + 1
          : Math.max(table[(i + 1) * cols + j]!, table[i * cols + (j + 1)]!);
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + (j + 1)]!) {
      push('del', a[i]!);
      i++;
    } else {
      push('add', b[j]!);
      j++;
    }
  }
  while (i < a.length) push('del', a[i++]!);
  while (j < b.length) push('add', b[j++]!);

  return parts;
}
