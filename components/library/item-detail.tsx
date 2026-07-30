import Link from 'next/link'
import {
  ArrowLeft,
  Sparkles,
  ArrowRight,
  HardHat,
  ChevronRight,
  DoorOpen,
  Receipt as ReceiptIcon,
  Image as ImageIcon,
  Hammer,
  BookOpen,
  ExternalLink,
  QrCode,
} from 'lucide-react'
import type { LibraryItem } from '@/lib/library-data'
import { tintClasses } from '@/lib/library-data'
import { ItemActions, type EditValues } from '@/components/library/item-actions'
import type { RoomOption } from '@/components/library/item-form'
import { cn } from '@/lib/utils'
import { RecallCheck } from '@/components/library/recall-check'
import type { ManufacturerSupport } from '@/lib/manufacturer-support'

const statusTone: Record<string, string> = {
  good: 'bg-sage/15 text-sage-foreground',
  attention: 'bg-wood/20 text-wood-foreground',
  neutral: 'bg-secondary text-muted-foreground',
}

const recTone: Record<string, string> = {
  attention: 'bg-wood/15 text-wood-foreground',
  plan: 'bg-primary/10 text-primary',
  good: 'bg-sage/15 text-sage-foreground',
}

export function ItemDetail({ item, edit, rooms, support }: { item: LibraryItem; edit: EditValues; rooms: RoomOption[]; support: ManufacturerSupport | null }) {
  const room = item.roomRef

  return (
    <div className="space-y-6">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" strokeWidth={2} />
        Library
      </Link>

      {/* Hero — a living profile, not a document */}
      <header className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:p-8">
          {item.heroPhoto ? (
            <div className="w-full shrink-0 overflow-hidden rounded-2xl bg-secondary sm:w-56">
              { }
              <img
                src={item.heroPhoto || '/placeholder.svg'}
                alt={item.name}
                className="aspect-[4/5] size-full object-cover"
              />
            </div>
          ) : (
            <span
              className={cn(
                'flex size-16 shrink-0 items-center justify-center rounded-3xl',
                tintClasses[item.tint],
              )}
            >
              <item.icon className="size-8" strokeWidth={1.5} />
            </span>
          )}

          <div className="flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">{item.name}</h1>
                {item.status && (
                  <span
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium',
                      statusTone[item.status.tone],
                    )}
                  >
                    {item.status.label}
                  </span>
                )}
              </div>
              <ItemActions id={item.id} name={item.name} values={edit} rooms={rooms} />
            </div>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
              {item.summary}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2.5 py-1 font-medium">
                {item.category}
              </span>
              {room && (
                <Link
                  href={`/library/room/${room.slug}`}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium transition-colors hover:text-foreground"
                >
                  <DoorOpen className="size-3.5" strokeWidth={2} />
                  {room.name}
                </Link>
              )}
            </div>

            {item.lifespan && <Lifespan lifespan={item.lifespan} />}
          </div>
        </div>
      </header>

      <RecallCheck itemId={item.id} canCheck={Boolean(edit.manufacturer || edit.model)} />

      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><QrCode className="size-5" /></span>
          <div className="min-w-0 flex-1"><h2 className="font-serif text-xl tracking-tight">QR label</h2><p className="mt-1 text-sm text-muted-foreground">Label this item so your household can scan directly to its private GatheredOS record.</p></div>
          <Link href={`/library/item/${item.id}/label`} className="inline-flex shrink-0 items-center rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-medium hover:bg-accent">Create label</Link>
        </div>
      </section>

      {support && (
        <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="size-5" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-xl tracking-tight">Manufacturer support</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the manufacturer’s support site to look up manuals, parts, and service{support.model ? <>, then search for model <span className="font-medium text-foreground">{support.model}</span></> : ''}.
              </p>
            </div>
            <a
              href={support.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
            >
              {support.label}
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </section>
      )}

      {/* Recommendations — what GatheredOS thinks you should do */}
      {item.recommendations && item.recommendations.length > 0 && (
        <section className="rounded-3xl border border-primary/15 bg-primary/5 p-6 sm:p-7">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-4" strokeWidth={2} />
            <span className="text-sm font-medium">GatheredOS recommends</span>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {item.recommendations.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize',
                      recTone[r.tone],
                    )}
                  >
                    {r.tone === 'attention' ? 'Act soon' : r.tone === 'plan' ? 'Consider' : 'Good'}
                  </span>
                  <p className="text-sm font-medium">{r.title}</p>
                </div>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {r.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Details */}
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
        <h2 className="font-serif text-xl tracking-tight">Details</h2>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          {item.facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</dt>
              <dd className="mt-1 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Photos */}
      {item.photos && item.photos.length > 0 && (
        <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl tracking-tight">Photos</h2>
            <span className="text-sm text-muted-foreground">{item.photos.length}</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {item.photos.map((p) => (
              <div
                key={p.label}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-secondary/50"
              >
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {p.src ? (
                    <img
                      src={p.src || '/placeholder.svg'}
                      alt={p.label}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <ImageIcon className="size-7 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <p className="px-3 py-2 text-xs text-muted-foreground">{p.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Documents + Receipts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {item.documents.length > 0 && (
          <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
            <h2 className="font-serif text-xl tracking-tight">Documents</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {item.documents.map(({ label, meta, icon: Icon, href }) => {
                const cls =
                  'flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3 text-left transition-colors hover:border-sage/40 hover:bg-accent/40'
                const body = (
                  <>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-5" strokeWidth={2} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{meta}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" strokeWidth={2} />
                  </>
                )
                return (
                  <li key={label}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                        {body}
                      </a>
                    ) : (
                      <div className={`${cls} cursor-default opacity-70`} title="The stored file is not available">
                        {body}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {item.receipts && item.receipts.length > 0 && (
          <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
            <h2 className="font-serif text-xl tracking-tight">Receipts</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {item.receipts.map(({ label, meta, href }) => {
                const cls =
                  'flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3 text-left transition-colors hover:border-sage/40 hover:bg-accent/40'
                const body = (
                  <>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-wood/20 text-wood-foreground">
                      <ReceiptIcon className="size-5" strokeWidth={2} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{meta}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" strokeWidth={2} />
                  </>
                )
                return (
                  <li key={label}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                        {body}
                      </a>
                    ) : (
                      <div className={`${cls} cursor-default opacity-70`} title="The stored receipt is not available">
                        {body}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Maintenance history */}
      {item.maintenance.length > 0 && (
        <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
          <h2 className="font-serif text-xl tracking-tight">Maintenance History</h2>
          <ol className="relative mt-5 ml-1">
            <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-border" />
            {item.maintenance.map((m) => (
              <li key={m.date + m.title} className="relative flex gap-4 pb-5 last:pb-0">
                <span className="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full bg-sage ring-4 ring-card" />
                <div>
                  <span className="text-sm font-medium">{m.title}</span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {m.date}
                    {m.by ? ` · ${m.by}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Knowledge */}
      {item.knowledge.length > 0 && (
        <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
          <h2 className="font-serif text-xl tracking-tight">Knowledge</h2>
          <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {item.knowledge.map(({ label, meta, icon: Icon }) => (
              <li key={label}>
                <div className="flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3 text-left">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sage/15 text-sage-foreground">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{meta}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Contractor + Related projects */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {item.contractor && (
          <section className="flex items-center gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-wood/20 text-wood-foreground">
              <HardHat className="size-6" strokeWidth={1.75} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium">{item.contractor.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.contractor.trade} · Trusted for this item
              </p>
            </div>
          </section>
        )}

        {item.relatedProjects && item.relatedProjects.length > 0 && (
          <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
            <h2 className="font-serif text-lg tracking-tight">Related Projects</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {item.relatedProjects.map((p) => (
                <li
                  key={p.label}
                  className="flex items-center gap-3.5 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sage/15 text-sage-foreground">
                    <Hammer className="size-5" strokeWidth={2} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Related questions — search-first, conversational */}
      <section className="rounded-3xl border border-border/70 bg-secondary/30 p-6 sm:p-7">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="size-4" strokeWidth={2} />
          <span className="text-sm font-medium">Ask about this</span>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          {item.questions.map((q) => (
            <Link
              key={q}
              href="/ask"
              className="group flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:border-sage/40 hover:bg-accent/40"
            >
              {q}
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function Lifespan({
  lifespan,
}: {
  lifespan: { installed: number; expectedMin: number; expectedMax: number }
}) {
  const now = new Date().getFullYear()
  const { installed, expectedMin, expectedMax } = lifespan
  const span = expectedMax - installed
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  const pct = (year: number) => clamp(((year - installed) / span) * 100)
  const age = Math.max(0, now - installed)
  const windowStart = pct(expectedMin)
  const nowPos = pct(now)

  return (
    <div className="mt-6 rounded-2xl bg-secondary/40 p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">
          {age} years old
          <span className="text-muted-foreground"> · installed {installed}</span>
        </p>
        <p className="text-xs font-medium text-wood-foreground">
          Plan replacement {expectedMin}–{expectedMax}
        </p>
      </div>

      <div className="relative mt-4 h-2.5 w-full rounded-full bg-border/70">
        {/* expected replacement window */}
        <div
          aria-hidden
          className="absolute inset-y-0 rounded-full bg-wood/40"
          style={{ left: `${windowStart}%`, right: '0%' }}
        />
        {/* life used so far */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${nowPos}%` }}
        />
        {/* today marker */}
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
