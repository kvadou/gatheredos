import type { Metadata } from 'next'
import { HousePlug } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { requireHome } from '@/lib/supabase/home'
import { createClient } from '@/lib/supabase/server'
import {
  buildActivity,
  overallHealth,
  toCompleted,
  toFutureItem,
  toInsight,
  toSavings,
  toSystem,
  toWeekTask,
  type Activity,
  type CareWins,
  type Completed,
  type FutureItem,
  type Insight,
  type System,
  type WeekTask,
} from '@/lib/care-data'
import { SystemsOverview } from '@/components/care/systems-overview'
import { HouseDiagram } from '@/components/care/house-diagram'
import { CareSection } from '@/components/care/care-section'
import { CareActivity } from '@/components/care/care-activity'
import { ThisWeek } from '@/components/care/this-week'
import { EmergencyReadiness } from '@/components/care/emergency-readiness'
import { CareInsights } from '@/components/care/care-insights'
import { CareOutlook } from '@/components/care/care-outlook'
import { RecentlyCompleted } from '@/components/care/recently-completed'

export const metadata: Metadata = {
  title: 'Care · GatheredOS',
  description:
    'The health of your home at a glance — what needs attention now, what to plan for, and everything you’ve already handled.',
}

export default async function CarePage() {
  const home = await requireHome()
  const supabase = await createClient()
  const homeId = home.id

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()

  const [itemsRes, openRes, eventsRes, doneRes, insightsRes, winsRes] = await Promise.all([
    supabase.from('items').select('*').eq('home_id', homeId).eq('category', 'system').order('created_at', { ascending: true }),
    supabase.from('care_tasks').select('*').eq('home_id', homeId).eq('status', 'open').order('due_on', { ascending: true, nullsFirst: false }),
    supabase.from('care_events').select('*').eq('home_id', homeId).order('occurred_on', { ascending: false }).limit(8),
    supabase.from('care_tasks').select('*').eq('home_id', homeId).eq('status', 'done').order('completed_at', { ascending: false, nullsFirst: false }).limit(5),
    supabase.from('insights').select('*').eq('home_id', homeId).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('care_tasks').select('id', { count: 'exact', head: true }).eq('home_id', homeId).eq('status', 'done').gte('completed_at', ninetyDaysAgo),
  ])

  const itemRows = itemsRes.data ?? []
  const openTasks = openRes.data ?? []
  const events = eventsRes.data ?? []
  const doneTasks = doneRes.data ?? []
  const insightRows = (insightsRes.data ?? []).filter((row) => !row.dedupe_slug?.startsWith('onboarding:'))

  // Soonest open task and latest event per system item (both queries are pre-sorted).
  const nextTaskByItem = new Map<string, (typeof openTasks)[number]>()
  for (const t of openTasks) if (t.item_id && !nextTaskByItem.has(t.item_id)) nextTaskByItem.set(t.item_id, t)
  const lastEventByItem = new Map<string, (typeof events)[number]>()
  for (const e of events) if (e.item_id && !lastEventByItem.has(e.item_id)) lastEventByItem.set(e.item_id, e)

  const systems: System[] = itemRows.map((it) =>
    toSystem(it, { lastEvent: lastEventByItem.get(it.id), nextTask: nextTaskByItem.get(it.id) }),
  )

  const itemNameById = new Map(itemRows.map((it) => [it.id, it.name] as const))
  const weekTasks: WeekTask[] = openTasks.map((t) =>
    toWeekTask(t, t.item_id ? itemNameById.get(t.item_id) : undefined),
  )

  const activity: Activity[] = buildActivity(events, doneTasks)

  const lookingAhead: FutureItem[] = itemRows
    .map((it) => toFutureItem(it))
    .filter((x): x is FutureItem => x !== null)
    .sort((a, b) => Number(a.year) - Number(b.year))
  const savings = toSavings(lookingAhead)

  const careInsights: Insight[] = insightRows.map(toInsight)

  // Resolve completer display names in one extra lookup (avoids a fragile embed cast).
  const completerIds = [...new Set(doneTasks.map((t) => t.completed_by).filter((v): v is string => !!v))]
  const nameById = new Map<string, string | null>()
  if (completerIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', completerIds)
    for (const p of profiles ?? []) nameById.set(p.id, p.name)
  }
  const completed: Completed[] = doneTasks.map((t) =>
    toCompleted(t, t.completed_by ? nameById.get(t.completed_by) : null),
  )
  const winCount = winsRes.count ?? 0
  const wins: CareWins = {
    count: winCount,
    window: 'the last 90 days',
    note: winCount > 0 ? 'You’ve stayed ahead of what mattered.' : 'Your completed tasks will show up here.',
  }

  return (
    <AppShell>
      {/* Care reads like a health report: a vitals panel up top, then tighter,
          clinical sections below (space-y-8) rather than Projects' airy feel. */}
      <div className="space-y-8">
        {/* Vitals — overall health ring, green/amber/red split, systems list */}
        <SystemsOverview systems={systems} overall={overallHealth(systems)} />

        {/* A scannable cutaway of the house — every system where it lives */}
        <CareSection
          icon={<HousePlug className="size-5" strokeWidth={1.75} />}
          title="Your home, system by system"
          subtitle="Select any system to check its health record"
        >
          <HouseDiagram systems={systems} />
        </CareSection>

        {/* "What should I do?" — prioritized, in order */}
        <ThisWeek tasks={weekTasks} />

        {/* Something people immediately care about — kept high */}
        <EmergencyReadiness />

        {/* A quiet signal the house is being watched between visits */}
        <CareActivity activity={activity} />

        {/* Deeper patterns GatheredOS has noticed */}
        <CareInsights insights={careInsights} />

        {/* Progressive disclosure below: reference material, collapsed */}
        <CareOutlook items={lookingAhead} savings={savings} />
        <RecentlyCompleted items={completed} wins={wins} />
      </div>
    </AppShell>
  )
}
