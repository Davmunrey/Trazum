import type * as React from 'react';

import { CardTitle } from '@/components/ui/card';

/**
 * The heading of a panel: small, uppercase, dim.
 *
 * It is what the hand-written stylesheet used and it is worth keeping: these
 * headings label a panel, they do not compete with the numbers inside it.
 * shadcn's `CardTitle` is a heavier default, so it is dressed down here
 * rather than used raw.
 *
 * It was defined three times, each inside the component that used it:
 * `Comparer`, `Optimizer` and `Plan`. A component defined inside another is a
 * new component on every render of its parent, so React unmounted and
 * remounted every heading each time a panel rendered. Nothing in a heading
 * holds state, so nobody saw it; the cost was the work, and three copies of
 * one decision.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </CardTitle>
  );
}
