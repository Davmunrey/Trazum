/**
 * The mark, drawing itself — the app's one loading screen.
 *
 * ## Why a mark and not a spinner
 *
 * A spinner says *waiting* and says nothing else; it is the same spinner in
 * every product, so the first thing a first-time visitor sees is the one part
 * of the page with no identity in it. The favicon's three strokes are already
 * Trazum's mark — a ledger shortening, which is the whole product in three
 * lines — and stroking them in sequence says *this is Trazum, and it is
 * arriving*. Same geometry as `app/icon.svg`, so the tab and the boot screen
 * are the same object.
 *
 * ## Why it is server-rendered
 *
 * This is what stands in for a route while its JavaScript is still on the
 * wire, so it must be complete in the first HTML and must not need a client
 * runtime to be visible. No hooks, no effects, no `'use client'`: the
 * animation is CSS on inline SVG, and a browser that runs neither still paints
 * the finished mark and the line of text under it.
 *
 * `--draw-length` is per-path because the three strokes are different lengths;
 * one shared dash length would make the short rule appear to finish first and
 * then sit waiting, which reads as a stall rather than a sequence.
 */
export function BootMark({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6"
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="size-14 motion-safe:animate-[trazum-breathe_2.4s_ease-in-out_infinite]"
      >
        <rect width="32" height="32" rx="7" className="fill-terracotta" />
        {/*
          Three rules of decreasing length: the ledger this product shortens.
          Each carries its own dash length so all three finish together rather
          than the short one finishing first and waiting.
        */}
        {[
          { d: 'M7 9h18', length: 18 },
          { d: 'M7 15h13', length: 13 },
          { d: 'M7 21h8', length: 8 },
        ].map((stroke, index) => (
          <path
            key={stroke.d}
            d={stroke.d}
            stroke="var(--primary-foreground)"
            strokeWidth={2.6}
            strokeLinecap="round"
            className="motion-safe:animate-[trazum-draw_1.1s_ease-in-out_infinite_alternate]"
            style={
              {
                '--draw-length': stroke.length,
                strokeDasharray: stroke.length,
                animationDelay: `${index * 140}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </svg>
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}
