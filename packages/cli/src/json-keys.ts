/**
 * The first key an object in a JSON text names twice, or null.
 *
 * `JSON.parse` keeps the last of two equal keys and says nothing, and a
 * provider's parser may keep the first. The gateway prices the body it parsed
 * and forwards the bytes it was sent, so a body with two `model` keys could be
 * judged as one model and run as another (penetration test, finding L-7).
 * Keys are compared as decoded strings, so `"model"` is `"model"`.
 *
 * Expects text that `JSON.parse` already accepted; on anything else the answer
 * means nothing.
 */
export function duplicateKey(text: string): string | null {
  // One entry per open container: the keys an object has named, or null for an array.
  const open: Array<Set<string> | null> = [];
  let expectingKey = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      const keys = open[open.length - 1];
      if (expectingKey && keys) {
        const key = JSON.parse(text.slice(i, end + 1)) as string;
        if (keys.has(key)) return key;
        keys.add(key);
        expectingKey = false;
      }
      i = end + 1;
      continue;
    }
    if (char === '{') {
      open.push(new Set());
      expectingKey = true;
    } else if (char === '[') {
      open.push(null);
      expectingKey = false;
    } else if (char === '}' || char === ']') {
      open.pop();
      expectingKey = false;
    } else if (char === ',') {
      expectingKey = open[open.length - 1] instanceof Set;
    } else if (char === ':') {
      expectingKey = false;
    }
    i += 1;
  }
  return null;
}
