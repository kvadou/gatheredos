import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ShieldCheck,
  DollarSign,
  Sparkles,
  HardHat,
  Phone,
  MapPin,
  ArrowRight,
  Image as ImageIcon,
} from 'lucide-react'
import type { AnswerBlock, Citation, Hotspot } from '@/lib/ask-data'
import { cn } from '@/lib/utils'

/* Quiet tone per confidence tier — matches the app's sage/wood/muted palette. */
const citationTone: Record<Citation['confidence'], string> = {
  known: 'bg-sage/15 text-sage-foreground',
  estimated: 'bg-wood/20 text-wood-foreground',
  general: 'bg-secondary text-muted-foreground',
}

/* Render prose with inline [cN] markers turned into small superscript chips,
   numbered by the citation's position. A marker with no matching citation is
   stripped, so the reader never sees a naked [c1]. Text without markers (old
   messages) passes straight through. */
function withCitations(text: string, citations: Citation[]): ReactNode {
  if (!/\[c\d+\]/.test(text)) return text
  // Remove unmatched markers together with their leading space first, so nothing
  // like "on file ." (stray space before punctuation) survives; every marker left
  // after this pass resolves to a chip.
  const matched = new Set(citations.map((c) => `[${c.id}]`))
  const clean = text.replace(/\s*(\[c\d+\])/g, (full, marker) => (matched.has(marker) ? full : ''))
  if (!/\[c\d+\]/.test(clean)) return clean
  return clean.split(/(\[c\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(c\d+)\]$/)
    if (!m) return part
    const idx = citations.findIndex((c) => c.id === m[1])
    if (idx < 0) return null
    return (
      <sup key={i}>
        <span
          className={cn(
            'ml-0.5 inline-flex items-center justify-center rounded px-1 text-[0.65rem] font-semibold leading-none tabular-nums',
            citationTone[citations[idx].confidence],
          )}
        >
          {idx + 1}
        </span>
      </sup>
    )
  })
}

const statTone: Record<string, string> = {
  good: 'text-sage-foreground',
  attention: 'text-wood-foreground',
  neutral: 'text-foreground',
}

const verdictTone: Record<string, string> = {
  good: 'border-sage/30 bg-sage/10',
  attention: 'border-wood/30 bg-wood/10',
  plan: 'border-primary/20 bg-primary/5',
}

const verdictBadge: Record<string, { label: string; cls: string }> = {
  good: { label: 'Looking good', cls: 'bg-sage/20 text-sage-foreground' },
  attention: { label: 'Act soon', cls: 'bg-wood/25 text-wood-foreground' },
  plan: { label: 'Worth planning', cls: 'bg-primary/10 text-primary' },
}

export function AnswerBlockView({
  block,
  citations = [],
}: {
  block: AnswerBlock
  citations?: Citation[]
}) {
  switch (block.type) {
    case 'lead':
      return (
        <p className="text-pretty text-base leading-relaxed text-foreground sm:text-[1.05rem]">
          {withCitations(block.text, citations)}
        </p>
      )

    case 'text':
      return (
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {withCitations(block.text, citations)}
        </p>
      )

    case 'stats':
      return (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-4">
          {block.items.map((s) => (
            <div key={s.label} className="bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className={cn('mt-1 text-sm font-semibold', statTone[s.tone ?? 'neutral'])}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )

    case 'lifespan':
      return <Lifespan {...block} />

    case 'photo':
      return (
        <figure className="overflow-hidden rounded-2xl border border-border/60 bg-secondary/40">
          <div className="aspect-[16/10] w-full overflow-hidden">
            { }
            <img
              src={block.src || '/placeholder.svg'}
              alt={block.caption}
              className="size-full object-cover"
            />
          </div>
          <figcaption className="px-4 py-2.5 text-xs text-muted-foreground">
            {block.caption}
          </figcaption>
        </figure>
      )

    case 'annotatedPhoto':
      return <AnnotatedPhoto {...block} />

    case 'gallery':
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {block.photos.map((p) => (
            <div
              key={p.label}
              className="overflow-hidden rounded-2xl border border-border/60 bg-secondary/50"
            >
              <div className="aspect-[4/3] w-full overflow-hidden">
                {p.src ? (
                  <img src={p.src || '/placeholder.svg'} alt={p.label} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <ImageIcon className="size-6 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                )}
              </div>
              <p className="px-3 py-2 text-xs text-muted-foreground">{p.label}</p>
            </div>
          ))}
        </div>
      )

    case 'timeline':
      return (
        <div className="rounded-2xl border border-border/60 bg-secondary/30 p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Maintenance history
          </p>
          <ol className="relative ml-1">
            <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-border" />
            {block.entries.map((m) => (
              <li key={m.date + m.title} className="relative flex gap-4 pb-4 last:pb-0">
                <span className="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full bg-sage ring-4 ring-secondary/30" />
                <div>
                  <span className="text-sm font-medium">{m.title}</span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {m.date}
                    {m.by ? ` \u00b7 ${m.by}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )

    case 'warranty':
      return (
        <div className="flex items-start gap-3.5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-2xl',
              block.status === 'active'
                ? 'bg-sage/15 text-sage-foreground'
                : 'bg-wood/20 text-wood-foreground',
            )}
          >
            <ShieldCheck className="size-5" strokeWidth={2} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{block.coverage}</p>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  block.status === 'active'
                    ? 'bg-sage/20 text-sage-foreground'
                    : 'bg-wood/25 text-wood-foreground',
                )}
              >
                {block.status === 'active' ? 'Active' : 'Expired'}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{block.detail}</p>
          </div>
        </div>
      )

    case 'cost':
      return (
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-wood/20 text-wood-foreground">
              <DollarSign className="size-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{block.label}</p>
              <p className="font-serif text-2xl tracking-tight">{block.range}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{block.note}</p>
        </div>
      )

    case 'verdict':
      return (
        <div className={cn('rounded-2xl border p-5', verdictTone[block.tone])}>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                verdictBadge[block.tone].cls,
              )}
            >
              <Sparkles className="size-3" strokeWidth={2.5} />
              {verdictBadge[block.tone].label}
            </span>
          </div>
          <p className="mt-2.5 text-sm font-semibold">{block.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{block.detail}</p>
        </div>
      )

    case 'contractor':
      return (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-wood/20 text-wood-foreground">
            <HardHat className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{block.name}</p>
            <p className="text-xs text-muted-foreground">
              {`${block.trade} · ${block.detail}`}
            </p>
          </div>
          {block.phone && (
            <a
              href={`tel:${block.phone.replace(/[^0-9+]/g, '')}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent/40"
            >
              <Phone className="size-4" strokeWidth={2} />
              {block.phone}
            </a>
          )}
        </div>
      )

    case 'related':
      return (
        <div>
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {block.title}
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {block.items.map((it) => {
              const Icon = it.icon
              const inner = (
                <>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sage/15 text-sage-foreground">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{it.meta}</span>
                  </span>
                  {it.href && (
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2}
                    />
                  )}
                </>
              )
              return it.href ? (
                <Link
                  key={it.label}
                  href={it.href}
                  className="group flex items-center gap-3.5 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3 transition-colors hover:border-sage/40 hover:bg-accent/40"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={it.label}
                  className="flex items-center gap-3.5 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3"
                >
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      )

    case 'location':
      return (
        <div className="flex items-start gap-3.5 rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MapPin className="size-5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-medium">{block.place}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{block.detail}</p>
          </div>
        </div>
      )

    case 'steps':
      return (
        <ol className="flex flex-col gap-2.5">
          {block.items.map((s, i) => (
            <li
              key={s}
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      )

    default:
      return null
  }
}

/* The compact source row under an answer: one flat card per citation, numbered
   to match the inline chips. Renders nothing unless at least one citation is
   grounded in the home's records (all-general answers show chips only). */
export function Sources({ citations }: { citations: Citation[] }) {
  if (!citations.length || !citations.some((c) => c.type !== 'general')) return null
  return (
    <div className="border-t border-border/60 bg-secondary/20 px-5 py-5 sm:px-7">
      <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {citations.map((c, i) => {
          const general = c.type === 'general'
          return (
            <div
              key={c.id}
              className={cn(
                'flex max-w-full items-start gap-2 rounded-2xl border px-3 py-2 shadow-sm',
                general ? 'border-dashed border-border/70 bg-transparent' : 'border-border/60 bg-card',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-[0.7rem] font-semibold tabular-nums',
                  citationTone[c.confidence],
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{c.label}</span>
                {general ? (
                  <span className="block text-xs text-muted-foreground">
                    General guidance, not from your records
                  </span>
                ) : c.detail ? (
                  <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const hotspotTint: Record<string, string> = {
  sage: 'bg-sage text-background ring-sage/30',
  wood: 'bg-wood-foreground text-background ring-wood/30',
  navy: 'bg-primary text-primary-foreground ring-primary/30',
}

function AnnotatedPhoto({
  src,
  caption,
  hotspots,
}: {
  src: string
  caption: string
  hotspots: Hotspot[]
}) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border/60 bg-secondary/40">
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        { }
        <img src={src || '/placeholder.svg'} alt={caption} className="size-full object-cover" />
        {hotspots.map((h, i) => (
          <span
            key={h.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
          >
            <span
              className={cn(
                'ob-check-pop flex size-6 items-center justify-center rounded-full text-xs font-semibold shadow-md ring-4',
                hotspotTint[h.tone ?? 'navy'],
              )}
            >
              {i + 1}
            </span>
          </span>
        ))}
      </div>
      <figcaption className="border-b border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
        {caption}
      </figcaption>
      {/* Legend — GatheredOS naming exactly what it sees */}
      <ul className="divide-y divide-border/50">
        {hotspots.map((h, i) => (
          <li key={h.label} className="flex items-center gap-2.5 px-4 py-2.5">
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                hotspotTint[h.tone ?? 'navy'],
              )}
            >
              {i + 1}
            </span>
            <span className="text-xs text-foreground">{h.label}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function Lifespan({
  installed,
  expectedMin,
  expectedMax,
}: {
  installed: number
  expectedMin: number
  expectedMax: number
}) {
  const now = new Date().getFullYear()
  const span = expectedMax - installed
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  const pct = (year: number) => clamp(((year - installed) / span) * 100)
  const age = Math.max(0, now - installed)
  const windowStart = pct(expectedMin)
  const nowPos = pct(now)

  return (
    <div className="rounded-2xl border border-border/60 bg-secondary/30 p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">
          {age} years old
          <span className="text-muted-foreground">{` · installed ${installed}`}</span>
        </p>
        <p className="text-xs font-medium text-wood-foreground">
          {`Plan ${expectedMin}–${expectedMax}`}
        </p>
      </div>
      <div className="relative mt-4 h-2.5 w-full rounded-full bg-border/70">
        <div
          aria-hidden
          className="absolute inset-y-0 rounded-full bg-wood/40"
          style={{ left: `${windowStart}%`, right: '0%' }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${nowPos}%` }}
        />
        <div
          aria-hidden
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow"
          style={{ left: `${nowPos}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{installed}</span>
        <span>Today</span>
        <span>{expectedMax}</span>
      </div>
    </div>
  )
}
