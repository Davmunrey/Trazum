/**
 * The demo bus — the 1.76 arc's join, and nothing but the join.
 *
 * The tour dispatches an action when the visitor steps onto a page; the
 * component that owns that page decides what the action means inside it,
 * using the exact run path the visitor's own click would use. The bus knows
 * neither DOM nor React: a Set of handlers and a dispatch, testable in Node.
 *
 * Deliberately not a global event target on `window`: a typed union and a
 * module-scoped Set mean an action nobody handles is visible in a test, and
 * a handler nobody removes is a leak the unsubscribe return makes findable.
 */

export type DemoAction =
  /** Fill the Optimiser with the playground's sample prompt and run the free pass. */
  | { kind: 'optimise-sample' }
  /** Run the Compare tab's analysis over the two versions it already carries. */
  | { kind: 'compare-sample' }
  /** Price the playground's sample month in the Bill tab, as if pasted. */
  | { kind: 'bill-sample' }
  /** Type one line into the terminal and run it — the typing hand. */
  | { kind: 'playground-run'; line: string };

type Handler = (action: DemoAction) => void;

const handlers = new Set<Handler>();

/** Subscribe; returns the unsubscribe. Components call this in an effect. */
export function onDemo(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Dispatch to every subscriber. Fire-and-forget: a demo never awaits. */
export function runDemo(action: DemoAction): void {
  for (const handler of handlers) handler(action);
}
