import type { LucideIcon } from 'lucide-react'
import {
  Wind,
  Home,
  Droplet,
  Zap,
  Flame,
  Blocks,
  PaintRoller,
  ShieldCheck,
  Wrench,
  Snowflake,
  Sun,
  Leaf,
  Sprout,
  FileText,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/database.types'

/* ---------------------------------------------------------------------------
   Care data — the operational heart of GatheredOS. The types + presentational maps
   here describe how Care *looks*; the adapters map raw Supabase rows into those
   types so components stay presentational. Icons, tints, and season labels are
   deliberately client-side (never in the DB) — data carries facts, not styling.
--------------------------------------------------------------------------- */

type ItemRow = Database['public']['Tables']['items']['Row']
type TaskRow = Database['public']['Tables']['care_tasks']['Row']
type EventRow = Database['public']['Tables']['care_events']['Row']
type InsightRow = Database['public']['Tables']['insights']['Row']

export type Health = 'excellent' | 'good' | 'watch' | 'plan' | 'unknown'

export const healthLabel: Record<Health, string> = {
  excellent: 'Excellent',
  good: 'Good',
  watch: 'Keep an eye on it',
  plan: 'Plan ahead',
  unknown: 'Not enough information',
}

/* Tone tints reused across the Care surface. */
export const healthTint: Record<Health, string> = {
  excellent: 'bg-sage/15 text-sage-foreground',
  good: 'bg-sage/15 text-sage-foreground',
  watch: 'bg-wood/20 text-wood-foreground',
  plan: 'bg-wood/20 text-wood-foreground',
  unknown: 'bg-muted text-muted-foreground',
}

export const healthDot: Record<Health, string> = {
  excellent: 'bg-sage',
  good: 'bg-sage',
  watch: 'bg-wood-foreground',
  plan: 'bg-wood-foreground',
  unknown: 'bg-muted-foreground',
}

/* ----------------------------- Shared helpers ----------------------------- */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function mapHealth(status: string | null): Health {
  return status === 'excellent' || status === 'good' || status === 'watch' || status === 'plan'
    ? status
    : 'unknown'
}

/** "Mar 2026" — the calm, low-precision date Care uses everywhere. */
export function formatMonthYear(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** "2h ago" / "Yesterday" / "3 days ago", falling back to a month for older dates. */
export function relativeWhen(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  const day = 86_400_000
  if (diff < 3_600_000) return 'Just now'
  if (diff < day) return `${Math.max(1, Math.floor(diff / 3_600_000))}h ago`
  const days = Math.floor(diff / day)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'Last week'
  return formatMonthYear(d)
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/* ----------------------------- Activity Feed ----------------------------- */

/* A quiet, living signal that GatheredOS is watching the house between visits.
   Small and calm — never noisy. */
export type Activity = {
  id: string
  icon: LucideIcon
  text: string
  when: string
  tone?: 'sage' | 'wood'
}

function eventToActivity(e: EventRow): Activity {
  return {
    id: `ev-${e.id}`,
    icon: e.cost != null ? Wrench : FileText,
    text: e.note ? `${e.title}. ${e.note}` : e.title,
    when: relativeWhen(e.occurred_on),
    tone: 'sage',
  }
}

function doneTaskToActivity(t: TaskRow): Activity {
  return {
    id: `tk-${t.id}`,
    icon: CheckCircle2,
    text: `${t.title} completed`,
    when: relativeWhen(t.completed_at ?? t.created_at),
    tone: 'sage',
  }
}

/** Recent service history + recently completed tasks, merged newest-first. */
export function buildActivity(events: EventRow[], doneTasks: TaskRow[], limit = 4): Activity[] {
  const dated = [
    ...events.map((e) => ({ at: e.occurred_on, a: eventToActivity(e) })),
    ...doneTasks.map((t) => ({ at: t.completed_at ?? t.created_at, a: doneTaskToActivity(t) })),
  ]
  return dated
    .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
    .slice(0, limit)
    .map((d) => d.a)
}

/* ----------------------------- This Week ----------------------------- */

export type WeekTask = {
  id: string
  title: string
  time: string
  why: string
  system: string
  priority: 'highest' | 'normal'
}

export function toWeekTask(t: TaskRow, systemName?: string | null): WeekTask {
  return {
    id: t.id,
    title: t.title,
    // ponytail: no duration column; the component hides the clock when empty.
    time: '',
    why: t.detail ?? '',
    system: systemName ?? 'Home',
    priority: t.priority === 'highest' ? 'highest' : 'normal',
  }
}

/* ----------------------------- Home Systems ----------------------------- */

export type SystemFact = { label: string; value: string; tone?: 'good' | 'attention' }

export type System = {
  id: string
  name: string
  /* Stable slug derived from the name — drives the presentational icon map and
     the house-diagram floor placement (real DB ids are opaque uuids). */
  slug: string
  health: Health
  metric: string
  metricSub: string
  summary: string
  facts: SystemFact[]
  nextAction: string
  nextWhen: string
  lastService: string
  installed: number
  lifespanEnd: number
  lifespanLabel: string
  showLifespan: boolean
  href: string
}

/* Icons live client-side, keyed by system slug, so the DB never stores styling. */
export const systemIcon: Record<string, LucideIcon> = {
  hvac: Wind,
  furnace: Flame,
  'water-heater': Flame,
  roof: Home,
  plumbing: Droplet,
  electrical: Zap,
  foundation: Blocks,
  exterior: PaintRoller,
}

export const systemIconFor = (slug: string): LucideIcon => systemIcon[slug] ?? Wrench

function buildFacts(item: ItemRow): SystemFact[] {
  const f: SystemFact[] = []
  if (item.manufacturer) f.push({ label: 'Manufacturer', value: item.manufacturer })
  if (item.installed_on)
    f.push({ label: 'Installed', value: String(new Date(item.installed_on).getFullYear()) })
  return f
}

export function toSystem(
  item: ItemRow,
  ctx: { lastEvent?: EventRow; nextTask?: TaskRow } = {},
): System {
  const facts = (item.facts ?? {}) as Record<string, unknown>
  const installed = item.installed_on ? new Date(item.installed_on).getFullYear() : 0
  const lifespan = item.lifespan_years ?? 0
  const health = mapHealth(item.status)
  return {
    id: item.id,
    name: item.name,
    slug: slugify(item.name),
    health,
    metric: str(facts.metric) ?? healthLabel[health],
    metricSub: str(facts.metricSub) ?? item.summary ?? '',
    summary: item.summary ?? '',
    facts: Array.isArray(facts.facts) ? (facts.facts as SystemFact[]) : buildFacts(item),
    nextAction: ctx.nextTask?.title ?? 'No action needed',
    nextWhen: ctx.nextTask?.due_on ? formatMonthYear(ctx.nextTask.due_on) : 'Monitoring',
    lastService: ctx.lastEvent ? formatMonthYear(ctx.lastEvent.occurred_on) : 'No service on record',
    installed,
    lifespanEnd: installed && lifespan ? installed + lifespan : 0,
    lifespanLabel: str(facts.lifespanLabel) ?? (lifespan ? `${lifespan} yrs` : ''),
    showLifespan:
      typeof facts.showLifespan === 'boolean' ? facts.showLifespan : Boolean(installed && lifespan),
    href: `/library/item/${item.id}`,
  }
}

/** Overall home health, 0-100. */
export function overallHealth(systems: System[]): number | null {
  const known = systems.filter((system) => system.health !== 'unknown')
  if (!known.length) return null
  // ponytail: transparent heuristic — excellent/good = full, watch = 0.6, plan = 0.3, averaged.
  const weight: Record<Exclude<Health, 'unknown'>, number> = { excellent: 1, good: 1, watch: 0.6, plan: 0.3 }
  return Math.round((100 * known.reduce((s, x) => s + weight[x.health as Exclude<Health, 'unknown'>], 0)) / known.length)
}

/* ----------------------------- Seasonal Care ----------------------------- */

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

export const seasonMeta: Record<
  Season,
  { label: string; icon: LucideIcon; blurb: string }
> = {
  spring: { label: 'Spring', icon: Sprout, blurb: 'Recovery and prep after winter.' },
  summer: {
    label: 'Summer',
    icon: Sun,
    blurb: 'Peak cooling season in Minneapolis. Focus on air, water, and the exterior.',
  },
  fall: { label: 'Fall', icon: Leaf, blurb: 'Get ahead of the first freeze.' },
  winter: { label: 'Winter', icon: Snowflake, blurb: 'Protect against cold and moisture.' },
}

/* The current season, derived once so the UI adapts automatically. */
export function currentSeason(date = new Date()): Season {
  const m = date.getMonth()
  if (m >= 2 && m <= 4) return 'spring'
  if (m >= 5 && m <= 7) return 'summer'
  if (m >= 8 && m <= 10) return 'fall'
  return 'winter'
}

export type SeasonalTask = {
  title: string
  detail: string
  done?: boolean
}

export function toSeasonalTask(t: TaskRow): SeasonalTask {
  return { title: t.title, detail: t.detail ?? '', done: t.status === 'done' }
}

/* ----------------------------- Looking Ahead ----------------------------- */

export type FutureItem = {
  year: string
  title: string
  detail: string
  cost: string
  health: Health
}

/** A system replacement/repair coming due within `horizonYears`, or null. */
export function toFutureItem(item: ItemRow, horizonYears = 6): FutureItem | null {
  const installed = item.installed_on ? new Date(item.installed_on).getFullYear() : 0
  const lifespan = item.lifespan_years ?? 0
  if (!installed || !lifespan) return null
  const endYear = installed + lifespan
  const now = new Date().getFullYear()
  if (endYear < now || endYear > now + horizonYears) return null
  const facts = (item.facts ?? {}) as Record<string, unknown>
  // ponytail: cost only if authored in facts.replacementCost; otherwise omitted.
  const cost =
    typeof facts.replacementCost === 'number' ? `$${facts.replacementCost.toLocaleString()}` : ''
  return {
    year: String(endYear),
    title: `Replace the ${item.name}`,
    detail: item.summary ?? 'Plan a proactive replacement before it fails.',
    cost,
    health: mapHealth(item.status),
  }
}

export type Savings = { monthly: number; fiveYear: number; note: string }

export function toSavings(items: FutureItem[]): Savings {
  const total = items.reduce((s, i) => s + Number(i.cost.replace(/[^0-9]/g, '') || 0), 0)
  // ponytail: spread the projected total across 60 months — a rough, honest set-aside.
  return {
    monthly: Math.round(total / 60),
    fiveYear: total,
    note: 'Setting a little aside each month keeps these planned expenses from ever becoming surprises.',
  }
}

/* ----------------------------- Insights ----------------------------- */

export type Insight = {
  id: string
  icon: LucideIcon
  headline: string
  detail: string
  basis: string
  link: { label: string; href: string }
}

const insightIcon: Record<string, LucideIcon> = {
  hvac: Wind,
  warranty: ShieldCheck,
  maintenance: Wrench,
  cost: FileText,
}

export function toInsight(row: InsightRow): Insight {
  return {
    id: row.id,
    icon: insightIcon[row.category] ?? Sparkles,
    headline: row.headline,
    detail: row.detail ?? '',
    basis: row.basis ?? row.source ?? '',
    link: { label: row.action ?? 'Learn more', href: '/worth-knowing' },
  }
}

/* ----------------------------- Recently Completed ----------------------------- */

export type Completed = {
  id: string
  title: string
  when: string
  by: string
  note: string
}

export function toCompleted(t: TaskRow, completerName?: string | null): Completed {
  return {
    id: t.id,
    title: t.title,
    when: formatMonthYear(t.completed_at),
    by: completerName ?? 'You',
    note: t.detail ?? '',
  }
}

export type CareWins = { count: number; window: string; note: string }

/* ----------------------------- Emergency Readiness ----------------------------- */

export type ReadyItem = {
  id: string
  label: string
  icon: LucideIcon
  status: 'ready' | 'soon'
  detail: string
}


/* ------------------------------------------------------------------ */
/* Maintenance templates (intelligence engine §5, §7.6)                */
/* Rule-based schedule seeding — a lookup table, never a Claude call.  */
/* `slug` is the dedupe key: (home_id, item_id, template_slug) unique. */

export type CareTemplate = {
  slug: string
  title: string
  detail: string
  priority: 'low' | 'medium' | 'high'
  season?: Season
  recurrence: string
  /** Narrows a category template to matching item names (e.g. water heaters). */
  match?: RegExp
}

const careTemplates: Record<string, CareTemplate[]> = {
  system: [
    {
      slug: 'wh-flush-annual',
      title: 'Flush the water heater',
      detail: 'Drain sediment to extend tank life and keep heating efficient.',
      priority: 'medium',
      season: 'fall',
      recurrence: 'yearly',
      match: /water\s*heater/i,
    },
    {
      slug: 'hvac-filter-90d',
      title: 'Replace HVAC filter',
      detail: 'A clean filter protects the blower and keeps air quality up.',
      priority: 'medium',
      recurrence: 'every 3 months',
      match: /hvac|furnace|air\s*(conditioner|handler)|heat\s*pump/i,
    },
    {
      slug: 'hvac-tuneup-annual',
      title: 'Annual HVAC tune-up',
      detail: 'Professional inspection before the heavy season starts.',
      priority: 'medium',
      season: 'fall',
      recurrence: 'yearly',
      match: /hvac|furnace|air\s*conditioner|heat\s*pump/i,
    },
    {
      slug: 'sump-test-spring',
      title: 'Test the sump pump',
      detail: 'Pour a bucket of water in the pit and confirm it kicks on.',
      priority: 'high',
      season: 'spring',
      recurrence: 'yearly',
      match: /sump/i,
    },
  ],
  appliance: [
    {
      slug: 'fridge-coils-annual',
      title: 'Vacuum refrigerator coils',
      detail: 'Dusty coils make the compressor work harder and die sooner.',
      priority: 'low',
      recurrence: 'yearly',
      match: /fridge|refrigerator/i,
    },
    {
      slug: 'dryer-vent-annual',
      title: 'Clean the dryer vent',
      detail: 'Lint buildup is a fire risk and slows dry times.',
      priority: 'high',
      recurrence: 'yearly',
      match: /dryer/i,
    },
    {
      slug: 'dishwasher-filter-quarterly',
      title: 'Clean dishwasher filter',
      detail: 'Rinse the filter to keep drainage and cleaning performance up.',
      priority: 'low',
      recurrence: 'every 3 months',
      match: /dishwasher/i,
    },
  ],
  exterior: [
    {
      slug: 'gutters-fall',
      title: 'Clear gutters and downspouts',
      detail: 'Blocked gutters back water into the roofline and foundation.',
      priority: 'high',
      season: 'fall',
      recurrence: 'twice yearly',
      match: /gutter|roof/i,
    },
    {
      slug: 'deck-seal-annual',
      title: 'Inspect and reseal deck',
      detail: 'Check for popped fasteners and reseal before winter.',
      priority: 'medium',
      season: 'summer',
      recurrence: 'yearly',
      match: /deck|porch/i,
    },
  ],
  yard: [
    {
      slug: 'irrigation-winterize',
      title: 'Winterize irrigation',
      detail: 'Blow out lines before the first hard freeze.',
      priority: 'high',
      season: 'fall',
      recurrence: 'yearly',
      match: /irrigation|sprinkler/i,
    },
  ],
}

/**
 * Templates for a new item: category templates whose `match` hits the item
 * name (templates without `match` apply to the whole category).
 */
export function careTemplatesFor(category: string, itemName: string): CareTemplate[] {
  return (careTemplates[category] ?? []).filter((t) => !t.match || t.match.test(itemName))
}

/* ------------------------------------------------------------------ */
/* Recurrence roll (intelligence engine §7.8)                          */
/* Completing a recurring task schedules the next one. Vocabulary + order */
/* mirror iOS recurrenceInterval (SupabaseService.swift): "twice yearly" */
/* must be tested before "yearly". Unknown vocabulary → no roll.        */

type TaskInsert = Database['public']['Tables']['care_tasks']['Insert']

/** Months to advance for a recurrence phrase, or null when unrecognized. */
function recurrenceMonths(recurrence: string | null): number | null {
  if (!recurrence) return null
  const r = recurrence.toLowerCase()
  if (r.includes('every 3 months') || r.includes('quarterly')) return 3
  if (
    r.includes('twice yearly') ||
    r.includes('semiannual') ||
    r.includes('semi-annual') ||
    r.includes('biannual')
  )
    return 6
  if (r.includes('monthly')) return 1
  if (r.includes('yearly') || r.includes('annual')) return 12
  return null
}

/**
 * The next occurrence of a completed recurring task, or null when it doesn't
 * recur. Base is the task's due date (today when undated); month-end dates clamp
 * to the shorter month (Jan 31 + 1mo → Feb 28), matching iOS Calendar. All UTC
 * so a plain `date` never drifts across a timezone.
 *
 * template_slug is intentionally dropped: the (home_id, item_id, template_slug)
 * unique index is still held by the just-completed row, so carrying it forward
 * would 23505. The pipeline re-seeds template-driven tasks by slug (iOS parity).
 */
export function rollRecurrence(
  task: Pick<
    TaskRow,
    | 'home_id'
    | 'item_id'
    | 'title'
    | 'detail'
    | 'priority'
    | 'season'
    | 'recurrence'
    | 'source'
    | 'due_on'
  >,
  today = new Date(),
): TaskInsert | null {
  const months = recurrenceMonths(task.recurrence)
  if (months == null) return null
  const base = task.due_on ? new Date(`${task.due_on}T00:00:00Z`) : today
  const day = base.getUTCDate()
  const next = new Date(base)
  next.setUTCMonth(next.getUTCMonth() + months)
  if (next.getUTCDate() !== day) next.setUTCDate(0) // overflowed a shorter month → clamp to its last day
  return {
    home_id: task.home_id,
    item_id: task.item_id,
    title: task.title,
    detail: task.detail,
    priority: task.priority,
    season: task.season,
    recurrence: task.recurrence,
    source: task.source,
    due_on: next.toISOString().slice(0, 10),
    status: 'open',
  }
}
