import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The voice of GatheredOS. Anything the AI generated speaks in the first person —
 * like a trusted expert who's been quietly paying attention — rather than a
 * clinical "GATHEREDOS NOTICED" system label. Pick the phrase that matches what
 * GatheredOS is doing:
 *   - noticed     → an observation about the present ("I noticed")
 *   - learned     → something newly understood ("I've learned")
 *   - predicts    → a forward-looking estimate ("Here's what I expect")
 *   - found       → surfaced/linked existing info ("I found")
 *   - remembers   → recalling the home's history ("I remember")
 *   - interesting → a delightful, low-stakes observation ("Here's something interesting")
 */
type AiVerb = 'noticed' | 'learned' | 'predicts' | 'found' | 'remembers' | 'interesting'

const phrases: Record<AiVerb, string> = {
  noticed: 'I noticed',
  learned: "I've learned something",
  predicts: 'Here\u2019s what I expect',
  found: 'I found something',
  remembers: 'I remember',
  interesting: 'Here\u2019s something interesting',
}

export function AiBadge({
  verb = 'noticed',
  className,
}: {
  verb?: AiVerb
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-sage/15 px-2.5 py-1 text-xs font-medium text-sage-foreground',
        className,
      )}
    >
      <Sparkles className="size-3.5" strokeWidth={2.25} />
      {phrases[verb]}
    </span>
  )
}
