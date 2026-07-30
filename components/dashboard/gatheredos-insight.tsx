import { Sparkles, ArrowRight } from 'lucide-react'

export function GatheredOSInsight() {
  return (
    <section className="flex h-full flex-col rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-sage/15 text-sage-foreground">
          <Sparkles className="size-4" strokeWidth={2} />
        </span>
        <span className="text-sm font-medium text-muted-foreground">GatheredOS noticed something</span>
      </div>

      <p className="mt-4 text-pretty font-serif text-2xl leading-snug">
        Your water heater is entering the stage where annual maintenance has the biggest impact.
      </p>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Based on its age and usage, a quick service visit now protects it during the years it&apos;s
        most likely to fail.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
          <p className="text-xs text-muted-foreground">Estimated maintenance</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">$180</p>
        </div>
        <div className="rounded-2xl border border-sage/25 bg-sage/10 p-4">
          <p className="text-xs text-sage-foreground">Potential replacement savings</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-sage-foreground">
            $2,400
          </p>
        </div>
      </div>

      <button
        type="button"
        className="mt-5 inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent/50"
      >
        Learn why
        <ArrowRight className="size-4" strokeWidth={2.25} />
      </button>
    </section>
  )
}
