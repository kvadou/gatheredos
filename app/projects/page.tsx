import { AppShell } from '@/components/app-shell'
import { ProjectsHeader } from '@/components/projects/projects-header'
import { ActiveProjects } from '@/components/projects/active-projects'
import { RecommendedProjects } from '@/components/projects/recommended-projects'
import { InvestmentOutlook } from '@/components/projects/investment-outlook'
import { HomeTimeline } from '@/components/projects/home-timeline'
import { ProjectIdeas } from '@/components/projects/project-ideas'
import { RecentlyFinished } from '@/components/projects/recently-finished'
import { CompletedProjects } from '@/components/projects/completed-projects'
import { requireHome } from '@/lib/supabase/home'
import { createClient } from '@/lib/supabase/server'
import {
  buildProjectsView,
  compact,
  plusCompact,
  type ProjectWithContractor,
} from '@/lib/projects-data'

export default async function ProjectsPage() {
  const home = await requireHome()
  const supabase = await createClient()

  const [{ data: projectRows }, { data: eventRows }] = await Promise.all([
    supabase.from('projects').select('*, contractor:contractors(name)').eq('home_id', home.id),
    supabase.from('timeline_events').select('*').eq('home_id', home.id),
  ])

  const view = buildProjectsView(
    (projectRows ?? []) as unknown as ProjectWithContractor[],
    eventRows ?? [],
  )

  return (
    <AppShell>
      {/* Generous spacing so each section reads as its own chapter — the airy,
          editorial rhythm that sets Projects apart from Care's tighter feel. */}
      <div className="space-y-16">
        {/* Overview — how is my home evolving? */}
        <ProjectsHeader summary={view.hero} />

        {/* The primary focus: what am I building right now? */}
        <ActiveProjects projects={view.active} />

        {/* One of the strongest differentiators — you're building wealth, not
            just spending. Surfaced high, right after what you're building. */}
        <InvestmentOutlook outlook={view.outlook} />

        {/* Where GatheredOS gets proactive — personalized next investments */}
        <RecommendedProjects projects={view.recommended} />

        {/* The story of the house, past into future */}
        <HomeTimeline entries={view.timeline} yearBuilt={home.year_built} />

        {/* Future inspiration, not yet projects */}
        <ProjectIdeas ideas={view.ideas} />

        {/* Fresh momentum — recent wins, just above the lifetime archive */}
        <RecentlyFinished
          wins={view.recentWins}
          completedCount={view.completed.length}
          valueAddedShort={compact(view.outlook.valueAddedNum)}
        />

        {/* The archive — permanent memories of finished work */}
        <CompletedProjects
          projects={view.completed}
          count={view.completed.length}
          investedShort={compact(view.outlook.investedNum)}
          valueAddedShort={plusCompact(view.outlook.valueAddedNum)}
        />
      </div>
    </AppShell>
  )
}
