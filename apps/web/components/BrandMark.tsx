/** A typographic initial for compact contexts; the full wordmark leads elsewhere. */
export function BrandMark({ className }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-flex items-center justify-center font-display text-[28px] leading-none ${className ?? ''}`}>T</span>;
}
