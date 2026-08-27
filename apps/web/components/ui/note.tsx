import { cn } from '@/lib/utils';

/**
 * A short aside: a caveat, a confirmation, a refusal.
 *
 * ## Why this exists
 *
 * The same string of classes —
 * `rounded-lg border border-l-[3px] border-l-<tone> px-3.5 py-3 …` — was typed
 * at ten call sites across three panels, each choosing its own tone and a
 * couple of them their own padding. So "what a notice looks like" was a habit
 * rather than a decision, and changing it meant finding every one.
 *
 * ## Why the coloured edge is gone
 *
 * A 3px accent down the left of a bordered box is the callout every framework
 * ships and no design chose; the craft floor refuses it by name. It is also a
 * weak carrier of meaning: the stripe is four pixels of colour at the far edge
 * of a paragraph, and it disappears entirely under `forced-colors`, which is
 * exactly the reader who most needs the distinction.
 *
 * A notice says which kind it is through the surface it sits on and the colour
 * of its own text — both of which survive a high-contrast substitution, and
 * both of which the reader is already looking at. The wash tokens for this
 * were in the palette from the beginning; nothing here is a new colour.
 */
const TONES = {
  /** The default: context, provenance, a thing worth knowing. No claim. */
  plain: 'border-border bg-muted/60 text-muted-foreground',
  /** A promise kept — nothing uploaded, the card applied, the log converted. */
  good: 'border-good/25 bg-good-wash text-good',
  /** A caveat: this figure is uncertain, this window is partial. */
  warn: 'border-warn/25 bg-warn-wash text-warn',
  /** Something failed, and the sentence says what and how to recover. */
  bad: 'border-destructive/30 bg-terracotta-wash text-destructive',
} as const;

export type NoteTone = keyof typeof TONES;

export function Note({
  tone = 'plain',
  className,
  ...props
}: React.ComponentProps<'div'> & { tone?: NoteTone }) {
  return (
    <div
      data-slot="note"
      className={cn(
        'rounded-lg border px-3.5 py-3 text-[13px] leading-snug',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
