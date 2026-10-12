/** Server-rendered loading state; the finished mark remains visible without motion. */
export function BootMark({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6">
      <span className="font-display text-4xl font-bold tracking-[-0.025em]">Trazum</span>
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}
