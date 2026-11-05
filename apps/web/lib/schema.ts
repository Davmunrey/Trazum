/**
 * Declarative schemas for what a request body may carry (OWASP ASVS 4.0.3
 * 5.1.4 and 13.2.2).
 *
 * Every route used to read its body field by field, each in its own way, and
 * the gaps between those ways were where the bugs lived: a body of `null`
 * answered 500 on three routes, `llm.apiKey: 5` was sent to a provider as a
 * key, `level: "medium"` quietly meant `safe`, and `disableRules: "filler"`
 * quietly meant nothing. A schema says once what a body is, and nothing that
 * is not that reaches the route.
 *
 * **Small on purpose.** Six kinds of value, which is every kind these bodies
 * take, and no dependency: the web app's runtime packages are a list somebody
 * audits, and a validator is a few dozen lines that never touch the network.
 *
 * **What a schema refuses:**
 *
 * - a field it does not declare, by name. A misspelt `disable_rules` used to
 *   be dropped and its default used, the same silent failure `usage` already
 *   refused;
 * - a value of the wrong type, with no coercion: `"true"` is not `true`;
 * - text over its length, a number outside its range, a word outside its list,
 *   a list over its count.
 *
 * It stops at the first problem and says where it is, as a path. The words a
 * person reads are not here: each body's messages sit beside its schema in
 * `lib/body-schemas.ts`, in the caller's language where the route has one.
 *
 * The output is built from the schema's own keys, never the input's, so a key
 * such as `__proto__` is refused as unknown and can never be written anywhere.
 */

/** What a value had to be, for a message to say so. */
export type Expectation =
  | { kind: 'object'; fields: readonly string[] }
  | { kind: 'text'; max: number }
  | { kind: 'boolean' }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'choice'; of: readonly string[] }
  | { kind: 'list'; max: number };

export type Problem =
  /** A required field is absent, or `null`. */
  | 'missing'
  /** The wrong kind of value: text where a number goes, a list where an object does. */
  | 'type'
  /** Text that is empty, or only whitespace, where something has to be said. */
  | 'blank'
  /** Text longer than its limit. */
  | 'long'
  /** Text not in the form the field takes. */
  | 'pattern'
  /** A number outside its range. */
  | 'range'
  /** A word that is not one of the field's words. */
  | 'choice'
  /** A field the schema does not declare. */
  | 'unknown'
  /** A list with more entries than it may hold. */
  | 'many';

export interface Issue {
  /** Where, from the top of the body: `['llm', 'apiKey']`, `['disableRules', '2']`. `[]` is the body itself. */
  path: readonly string[];
  problem: Problem;
  expected: Expectation;
  /**
   * The text that was refused, for `choice` and `unknown` only: the word that
   * is not on the list, or the name of the field that is not declared. Cut to
   * 80 characters. Never anything else from the body.
   */
  got?: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; issue: Issue };

export interface Schema<T> {
  readonly expected: Expectation;
  /** May be left out. `null` reads as left out too, unless `keepsNull`. */
  readonly optional?: boolean;
  /** `null` is a value of its own, kept as `null`, rather than the field left out. */
  readonly keepsNull?: boolean;
  check(value: unknown, path: readonly string[]): Checked<T>;
}

const fail = (path: readonly string[], problem: Problem, expected: Expectation, got?: string): Checked<never> => ({
  ok: false,
  issue: got === undefined ? { path, problem, expected } : { path, problem, expected, got: got.slice(0, 80) },
});

/** Check a whole body. */
export function check<T>(schema: Schema<T>, value: unknown): Checked<T> {
  return schema.check(value, []);
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export interface TextOptions {
  max: number;
  /** Return the text trimmed, and measure it trimmed. */
  trim?: boolean;
  /** Refuse text that is empty or only whitespace. */
  nonBlank?: boolean;
  /** The whole text must match. Checked after the length, so a long value is called long. */
  pattern?: RegExp;
}

export function text({ max, trim = false, nonBlank = false, pattern }: TextOptions): Schema<string> {
  const expected: Expectation = { kind: 'text', max };
  return {
    expected,
    check(value, path) {
      if (typeof value !== 'string') return fail(path, 'type', expected);
      const result = trim ? value.trim() : value;
      if (nonBlank && !result.trim()) return fail(path, 'blank', expected);
      if (result.length > max) return fail(path, 'long', expected);
      if (pattern && !pattern.test(result)) return fail(path, 'pattern', expected);
      return { ok: true, value: result };
    },
  };
}

export function flag(): Schema<boolean> {
  const expected: Expectation = { kind: 'boolean' };
  return {
    expected,
    check: (value, path) => (typeof value === 'boolean' ? { ok: true, value } : fail(path, 'type', expected)),
  };
}

export interface NumberOptions {
  min: number;
  max: number;
  /**
   * Bring a number outside the range to its nearest end instead of refusing
   * it. A decision a body has to state in its schema, since everywhere else
   * a number out of range is refused. Never applies to a value that is not a
   * number.
   */
  clamp?: boolean;
}

export function number({ min, max, clamp = false }: NumberOptions): Schema<number> {
  const expected: Expectation = { kind: 'number', min, max };
  return {
    expected,
    check(value, path) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'type', expected);
      if (value < min || value > max) {
        return clamp ? { ok: true, value: Math.min(max, Math.max(min, value)) } : fail(path, 'range', expected);
      }
      return { ok: true, value };
    },
  };
}

export function oneOf<const V extends string>(words: readonly V[]): Schema<V> {
  const expected: Expectation = { kind: 'choice', of: words };
  return {
    expected,
    check(value, path) {
      if (typeof value !== 'string') return fail(path, 'type', expected);
      // `includes`, never `in`: `"toString" in {...}` is true.
      return (words as readonly string[]).includes(value)
        ? { ok: true, value: value as V }
        : fail(path, 'choice', expected, value);
    },
  };
}

export function list<T>(item: Schema<T>, { max }: { max: number }): Schema<T[]> {
  const expected: Expectation = { kind: 'list', max };
  return {
    expected,
    check(value, path) {
      if (!Array.isArray(value)) return fail(path, 'type', expected);
      if (value.length > max) return fail(path, 'many', expected);
      const out: T[] = [];
      for (let i = 0; i < value.length; i += 1) {
        const checked = item.check(value[i], [...path, String(i)]);
        if (!checked.ok) return checked;
        out.push(checked.value);
      }
      return { ok: true, value: out };
    },
  };
}

// ---------------------------------------------------------------------------
// Objects, and the fields that may be left out
// ---------------------------------------------------------------------------

/** May be left out; `null` is read as left out, as JSON writers often send it. */
export function optional<T>(schema: Schema<T>): Schema<T | undefined>;
/** May be left out; `null` is kept, because it means something the absence does not. */
export function optional<T>(schema: Schema<T>, nulls: { null: 'kept' }): Schema<T | null | undefined>;
export function optional<T>(schema: Schema<T>, nulls?: { null: 'kept' }): Schema<T | null | undefined> {
  return { expected: schema.expected, optional: true, keepsNull: nulls?.null === 'kept', check: schema.check };
}

type Shape = Record<string, Schema<unknown>>;
export type Infer<S> = S extends Schema<infer T> ? T : never;
/** A field whose schema accepts `undefined` may be left out of the object, and is typed so. */
type OptionalKeys<S extends Shape> = { [K in keyof S]: undefined extends Infer<S[K]> ? K : never }[keyof S];
type Flat<T> = { [K in keyof T]: T[K] };
type Fields<S extends Shape> = Flat<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }
>;

export function object<const S extends Shape>(shape: S): Schema<Fields<S>> {
  const fields = Object.keys(shape);
  const expected: Expectation = { kind: 'object', fields };
  return {
    expected,
    check(value, path) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'type', expected);
      const input = value as Record<string, unknown>;

      // Unknown names first: a misspelt `promt` is better reported as itself
      // than as the `prompt` it left missing.
      for (const key of Object.keys(input)) {
        if (!Object.hasOwn(shape, key)) return fail([...path, key], 'unknown', expected, key);
      }

      const out: Record<string, unknown> = {};
      for (const key of fields) {
        const schema = shape[key]!;
        const raw = Object.hasOwn(input, key) ? input[key] : undefined;
        if (raw === undefined || (raw === null && !schema.keepsNull)) {
          if (schema.optional) continue;
          return fail([...path, key], 'missing', schema.expected);
        }
        if (raw === null) {
          out[key] = null;
          continue;
        }
        const checked = schema.check(raw, [...path, key]);
        if (!checked.ok) return checked;
        out[key] = checked.value;
      }
      return { ok: true, value: out as Fields<S> };
    },
  };
}
