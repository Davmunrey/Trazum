import { cn } from "@/lib/utils"

/**
 * A placeholder in the shape of the thing being fetched.
 *
 * **The sweep replaced a pulse, and the difference is what it says.**
 * `animate-pulse` fades the whole block in and out — the visual vocabulary of
 * something retrying, or of a control that has been disabled. A highlight
 * travelling across the block in one direction reads as filling in, which is
 * what is actually happening behind it.
 *
 * The gradient is built from the app's own surface tokens rather than the
 * white streak every component library ships, so it works on both themes
 * without a `dark:` variant: the base is the muted surface these placeholders
 * already sat on, and the crest is the same lifted tone the rest of the app
 * uses for hover. Reduced motion stops it at the global rule, where the block
 * simply rests as a flat muted rectangle.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-md bg-muted bg-[linear-gradient(100deg,transparent_38%,var(--layer-hover)_50%,transparent_62%)] bg-[length:220%_100%] bg-no-repeat',
        'motion-safe:animate-[trazum-shimmer_1.6s_ease-in-out_infinite]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
