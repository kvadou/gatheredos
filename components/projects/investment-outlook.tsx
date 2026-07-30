'use client'

import { useEffect, useState } from 'react'
import { LineChart, TrendingUp, PiggyBank, CalendarRange, Sparkles } from 'lucide-react'
import type { InvestmentOutlook as InvestmentOutlookData } from '@/lib/projects-data'
import { CareSection } from '@/components/care/care-section'
import Link from 'next/link'

export function InvestmentOutlook({ outlook }: { outlook: InvestmentOutlookData }) {
  const { totalInvested, valueAdded, fiveYearNeeds, monthlyReserve, insight, investedNum, valueAddedNum } =
    outlook

  // Animate the comparison bars on mount. Scale invested against value added so
  // the story ("value outpaces spend") reads visually; guard divide-by-zero.
  const investedPct = valueAddedNum > 0 ? Math.min(100, (investedNum / valueAddedNum) * 100) : 0
  const [grow, setGrow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrow(true), 150)
    return () => clearTimeout(t)
  }, [])

  const supporting = [
    { icon: TrendingUp, label: 'Total invested', value: totalInvested, note: 'Across five years' },
    {
      icon: CalendarRange,
      label: 'Upcoming 5-year needs',
      value: fiveYearNeeds,
      note: 'Mostly system replacements',
    },
    {
      icon: PiggyBank,
      label: 'Suggested monthly reserve',
      value: monthlyReserve,
      note: 'Keeps you ahead',
    },
  ]

  return (
    <CareSection
      icon={<LineChart className="size-5" strokeWidth={1.75} />}
      iconTint="wood"
      title="Investment Outlook"
      subtitle="How your spending is building long-term value"
      accessory={
        <span className="rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          All figures estimated
        </span>
      }
    >
      {/* Hero — estimated value added is the star of this section */}
      <div className="rounded-3xl border border-sage/30 bg-sage/[0.08] p-6 sm:p-8">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-sage-foreground">
          <TrendingUp className="size-4" strokeWidth={2.25} />
          Estimated value added
        </p>
        <p className="mt-2 font-serif text-5xl leading-none tracking-tight tabular-nums text-sage-foreground sm:text-6xl">
          {valueAdded}
        </p>
        <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Your improvements are estimated to have added more value to your home than they cost —
          turning maintenance into a lasting investment.
        </p>

        {/* Visual comparison: spend vs. value created */}
        <div className="mt-6 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Invested</span>
              <span className="tabular-nums">{totalInvested}</span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-muted-foreground/40 transition-[width] duration-700 ease-out"
                style={{ width: grow ? `${investedPct}%` : '0%' }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-sage-foreground">Estimated value added</span>
              <span className="tabular-nums text-sage-foreground">{valueAdded}</span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-sage transition-[width] duration-700 ease-out"
                style={{ width: grow ? '100%' : '0%' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Supporting figures — quieter row beneath the hero */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {supporting.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="rounded-2xl border border-border/60 bg-secondary/30 p-4">
            <Icon className="size-4 text-muted-foreground" strokeWidth={2} />
            <p className="mt-2 font-serif text-2xl leading-none tracking-tight tabular-nums">
              {value}
            </p>
            <p className="mt-1.5 text-xs font-medium text-foreground">{label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>

      {/* GatheredOS insight */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sage/20 bg-sage/[0.06] p-4">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-sage-foreground" strokeWidth={2} />
        <div>
          <p className="text-sm font-medium text-sage-foreground">GatheredOS insight</p>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{insight}</p>
        </div>
      </div>
      <Link href="/forecast" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent/40">View full 10-year forecast</Link>
    </CareSection>
  )
}
