export interface DiffPart {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** Cap on pieces per side: beyond this the LCS table stops being worth it. */
const MAX_PIECES = 1500;

/** Splits into words while keeping the whitespace, so the diff stays readable. */
function toWords(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Word-level diff based on the longest common subsequence.
 *
 * If the text is too large it falls back to a line diff, and if that still
 * does not fit it returns `null` so the UI shows the prompt without a diff
 * rather than locking up the tab.
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
