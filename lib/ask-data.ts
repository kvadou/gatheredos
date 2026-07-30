import type { LucideIcon } from 'lucide-react'
import { Flame, Droplet, Snowflake, Wind, Palette, TrendingUp } from 'lucide-react'

/* Photo hotspot annotation — AI pointing at exactly what it's talking about. */
export type Hotspot = { x: number; y: number; label: string; tone?: 'sage' | 'wood' | 'navy' }

/* Rich answer blocks. Real answers today are just `lead` + `text` (see
   textToBlocks); the richer variants stay in the type system and in
   AnswerBlockView so we can render them once the model synthesizes them. */
export type AnswerBlock =
  | { type: 'lead'; text: string }
  | { type: 'text'; text: string }
  | {
      type: 'stats'
      items: { label: string; value: string; tone?: 'good' | 'attention' | 'neutral' }[]
    }
  | { type: 'lifespan'; installed: number; expectedMin: number; expectedMax: number }
  | { type: 'photo'; src: string; caption: string }
  | { type: 'annotatedPhoto'; src: string; caption: string; hotspots: Hotspot[] }
  | { type: 'gallery'; photos: { src?: string; label: string }[] }
  | { type: 'timeline'; entries: { date: string; title: string; by?: string }[] }
  | { type: 'warranty'; status: 'active' | 'expired'; coverage: string; detail: string }
  | { type: 'cost'; label: string; range: string; note: string }
  | { type: 'verdict'; headline: string; detail: string; tone: 'good' | 'attention' | 'plan' }
  | { type: 'contractor'; name: string; trade: string; detail: string; phone?: string }
  | {
      type: 'related'
      title: string
      items: { label: string; meta: string; icon: LucideIcon; href?: string }[]
    }
  | { type: 'location'; place: string; detail: string }
  | { type: 'steps'; items: string[] }

/* A machine-resolvable source behind a factual claim. The model emits inline
   [c1] markers in the prose and a parallel array of these; the client resolves
   each marker to a numbered chip and a Sources card. (Playbook §1.2.) */
export type Citation = {
  id: string // "c1", "c2" — matches the inline [c1] marker
  type:
    | 'item'
    | 'file'
    | 'care_event'
    | 'care_task'
    | 'project'
    | 'contractor'
    | 'timeline'
    | 'home_fact'
    | 'warranty'
    | 'extraction'
    | 'home_profile'
    | 'general'
  ref_id: string | null // uuid of the source row; null for general/home_profile
  label: string
  detail?: string
  confidence: 'known' | 'estimated' | 'general'
}

/* What GatheredOS stores as an assistant message's content, and what the client
   renders. Kept in sync with the /api/ask route handler. */
export type AnswerContent = { blocks: AnswerBlock[]; citations?: Citation[] }

/* The model appends `@@CITATIONS@@ <json array>` after the answer prose. Both
   the route (persistence) and the client (streaming) split on this so the tail
   is never shown as text. */
export const CITATION_SENTINEL = '@@CITATIONS@@'

const CITATION_TYPES = [
  'item', 'file', 'care_event', 'care_task', 'project', 'contractor',
  'timeline', 'home_fact', 'warranty', 'extraction', 'home_profile', 'general',
] as const
const CITATION_CONFIDENCE = ['known', 'estimated', 'general'] as const

/* The answer prose — everything before the sentinel. While streaming, also hold
   back a trailing partial sentinel (e.g. a buffer ending "...@@CIT") so a
   half-arrived marker never flashes on screen. */
export function visibleAnswerText(buffer: string, streaming = false): string {
  const idx = buffer.indexOf(CITATION_SENTINEL)
  if (idx >= 0) return buffer.slice(0, idx)
  if (!streaming) return buffer
  const max = Math.min(CITATION_SENTINEL.length - 1, buffer.length)
  for (let n = max; n > 0; n--) {
    if (buffer.endsWith(CITATION_SENTINEL.slice(0, n))) return buffer.slice(0, buffer.length - n)
  }
  return buffer
}

/* Parse the JSON array after the sentinel. Tolerates absence, surrounding
   whitespace, and malformed tails → []. */
export function parseCitations(buffer: string): Citation[] {
  const idx = buffer.indexOf(CITATION_SENTINEL)
  if (idx < 0) return []
  const tail = buffer.slice(idx + CITATION_SENTINEL.length)
  const start = tail.indexOf('[')
  const end = tail.lastIndexOf(']')
  if (start < 0 || end < start) return []
  try {
    const parsed = JSON.parse(tail.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (c) => !!c && typeof c.id === 'string' && typeof c.label === 'string',
      )
      .map((c): Citation => {
        // An unknown type or confidence gets the visually-distinct general
        // treatment (grey chip, "general guidance" card) rather than a broken
        // one — never let a bad type masquerade as a grounded record.
        const validType = CITATION_TYPES.includes(c.type)
        const type: Citation['type'] = validType ? c.type : 'general'
        // A bad type means an untrusted citation, so its chip must read grey too —
        // never a sage "known" chip on something we couldn't resolve.
        const confidence: Citation['confidence'] =
          type !== 'general' && CITATION_CONFIDENCE.includes(c.confidence)
            ? c.confidence
            : 'general'
        return {
          id: c.id,
          type,
          ref_id: type === 'general' ? null : (c.ref_id ?? null),
          label: c.label,
          detail: typeof c.detail === 'string' ? c.detail : undefined,
          confidence,
        }
      })
  } catch {
    return []
  }
}

/* Keep only citations actually referenced by a [cN] marker in the prose. */
export function usedCitations(text: string, citations: Citation[] | undefined): Citation[] {
  if (!citations?.length) return []
  return citations.filter((c) => text.includes(`[${c.id}]`))
}

/* Starter chips on the empty Ask page. Double as the pool for follow-up chips. */
export const starterQuestions: { text: string; icon: LucideIcon }[] = [
  { text: 'When should I replace my water heater?', icon: Flame },
  { text: 'Where is my water shutoff?', icon: Droplet },
  { text: 'What maintenance should I do before winter?', icon: Snowflake },
  { text: 'Who serviced my HVAC last?', icon: Wind },
  { text: 'What paint color is in the kitchen?', icon: Palette },
  { text: 'Which projects have the highest ROI?', icon: TrendingUp },
]

/* The grounding steps shown while GatheredOS "thinks" — reinforces that answers
   are drawn from the home's real records, not a generic model. */
export const groundingSteps = [
  'Searching your documents',
  'Checking maintenance history',
  'Reading warranties & receipts',
  'Connecting related systems',
]

/* Split a plain-text answer into a lead paragraph + trailing text paragraphs.
   Shared by the /api/ask route (persistence) and the client (progressive
   render) so both derive the same block shape. */
export function textToBlocks(text: string): AnswerBlock[] {
  const paras = text
    .split(/\n{2,}/)
    // Strip stray **bold** the model occasionally slips past the no-markdown rule.
    .map((p) => p.replace(/\*\*([^*]+)\*\*/g, '$1').trim())
    .filter(Boolean)
  if (paras.length === 0) return []
  const [lead, ...rest] = paras
  return [
    { type: 'lead', text: lead },
    ...rest.map((t): AnswerBlock => ({ type: 'text', text: t })),
  ]
}
