'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, ArrowUp, Plus, Loader2, Check, MessageCircle, CornerDownRight } from 'lucide-react'
import {
  starterQuestions,
  groundingSteps,
  textToBlocks,
  visibleAnswerText,
  parseCitations,
  usedCitations,
  type AnswerBlock,
  type Citation,
} from '@/lib/ask-data'
import { getConversationMessages } from '@/lib/actions/ask'
import { AnswerBlockView, Sources } from './answer-blocks'
import { cn } from '@/lib/utils'
import { AskActions } from '@/components/ask/ask-actions'

export type RecentConversation = { id: string; question: string; teaser: string }

type Exchange = {
  id: string
  question: string
  blocks: AnswerBlock[] | null
  citations?: Citation[]
  streaming?: string
}

export function AskExperience({ recent, initialPrompt = '' }: { recent: RecentConversation[]; initialPrompt?: string }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState(initialPrompt)
  const [busy, setBusy] = useState(false)
  const latestRef = useRef<HTMLDivElement>(null)
  const scrollSig = useRef('')

  // Align the top of the latest exchange with the top of the viewport when a
  // new question is asked, so the reader lands at the start of the answer.
  useEffect(() => {
    const last = exchanges[exchanges.length - 1]
    const sig = last ? last.id : ''
    if (!sig || sig === scrollSig.current) return
    scrollSig.current = sig
    requestAnimationFrame(() => {
      const el = latestRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY - 24
      window.scrollTo({ top, behavior: 'smooth' })
    })
  }, [exchanges])

  async function ask(raw: string) {
    const question = raw.trim()
    if (!question || busy) return
    setInput('')
    setBusy(true)
    const localId = crypto.randomUUID()
    setExchanges((x) => [...x, { id: localId, question, blocks: null, streaming: '' }])

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, question }),
      })
      const cid = res.headers.get('x-conversation-id')
      if (cid) setConversationId(cid)

      if (!res.ok || !res.body) throw new Error('request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        // Never surface the @@CITATIONS@@ tail (or a partially-arrived one).
        const visible = visibleAnswerText(text, true)
        setExchanges((x) => x.map((e) => (e.id === localId ? { ...e, streaming: visible } : e)))
      }
      const answerText = visibleAnswerText(text)
      const citations = usedCitations(answerText, parseCitations(text))
      setExchanges((x) =>
        x.map((e) =>
          e.id === localId
            ? { ...e, blocks: textToBlocks(answerText), citations, streaming: undefined }
            : e,
        ),
      )
    } catch {
      setExchanges((x) =>
        x.map((e) =>
          e.id === localId
            ? {
                ...e,
                blocks: [
                  {
                    type: 'lead',
                    text: 'Something went wrong reaching GatheredOS. Please try that question again.',
                  },
                ],
                streaming: undefined,
              }
            : e,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  async function openConversation(c: RecentConversation) {
    if (busy) return
    setBusy(true)
    setConversationId(c.id)
    try {
      const loaded = await getConversationMessages(c.id)
      setExchanges(
        loaded.map((e) => ({
          id: e.id,
          question: e.question,
          blocks: e.blocks,
          citations: e.citations,
        })),
      )
    } catch {
      setConversationId(null)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setExchanges([])
    setConversationId(null)
    setInput('')
    setBusy(false)
  }

  const started = exchanges.length > 0

  return (
    <div className="relative">
      {!started ? (
        <Landing
          input={input}
          setInput={setInput}
          onAsk={ask}
          busy={busy}
          recent={recent}
          onOpen={openConversation}
        />
      ) : (
        <div className="space-y-8 pb-40">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-4" strokeWidth={2} />
            New conversation
          </button>

          {exchanges.map((e, i) => (
            <div
              key={e.id}
              ref={i === exchanges.length - 1 ? latestRef : undefined}
              className="scroll-mt-6 space-y-4"
            >
              {/* User question */}
              {e.question && (
                <div className="flex justify-end">
                  <div className="ob-fade-in max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-5 py-3 text-primary-foreground shadow-sm">
                    <p className="text-pretty text-sm leading-relaxed sm:text-base">{e.question}</p>
                  </div>
                </div>
              )}

              {/* Answer, streaming text, or the grounding shell */}
              {e.blocks ? (
                <div className="ob-fade-in">
                  <Answer
                    blocks={e.blocks}
                    citations={e.citations}
                    question={e.question}
                    onFollowup={ask}
                  />
                </div>
              ) : e.streaming ? (
                <Answer blocks={textToBlocks(e.streaming)} />
              ) : (
                <Thinking />
              )}
            </div>
          ))}

          {/* Sticky composer */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/90 backdrop-blur-md lg:left-60">
            <div className="mx-auto max-w-5xl px-5 pt-4 sm:px-8 lg:px-12 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Composer input={input} setInput={setInput} onAsk={ask} busy={busy} compact />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* One GatheredOS answer — the card shell reused from the frozen design, with the
   real (lead + text) blocks and, once complete, contextual follow-up chips. */
function Answer({
  blocks,
  citations = [],
  question,
  onFollowup,
}: {
  blocks: AnswerBlock[]
  citations?: Citation[]
  question?: string
  onFollowup?: (q: string) => void
}) {
  const followups =
    question && onFollowup
      ? starterQuestions
          .filter((s) => s.text.toLowerCase() !== question.trim().toLowerCase())
          .slice(0, 3)
      : []

  return (
    <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5 sm:px-7">
        <span className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-4" strokeWidth={2} />
        </span>
        <p className="text-sm font-medium">GatheredOS</p>
      </div>

      <div className="space-y-4 px-5 py-6 sm:px-7 sm:py-7">
        {blocks.map((block, i) => (
          <AnswerBlockView key={i} block={block} citations={citations} />
        ))}
      </div>

      <Sources citations={citations} />

      {question && <AskActions question={question} answer={blocks.map((b) => 'text' in b ? b.text : '').filter(Boolean).join('\n\n')} />}

      {followups.length > 0 && onFollowup && (
        <div className="border-t border-border/60 bg-secondary/20 px-5 py-5 sm:px-7">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Suggested next questions
          </p>
          <div className="flex flex-col gap-2">
            {followups.map((q) => (
              <button
                key={q.text}
                type="button"
                onClick={() => onFollowup(q.text)}
                className="group flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-4 py-3 text-left text-sm font-medium shadow-sm transition-colors hover:border-sage/40 hover:bg-accent/40"
              >
                <CornerDownRight className="size-4 shrink-0 text-sage-foreground" strokeWidth={2} />
                {q.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Landing({
  input,
  setInput,
  onAsk,
  busy,
  recent,
  onOpen,
}: {
  input: string
  setInput: (v: string) => void
  onAsk: (q: string) => void
  busy: boolean
  recent: RecentConversation[]
  onOpen: (c: RecentConversation) => void
}) {
  return (
    <div className="flex min-h-[calc(100svh-9rem)] flex-col items-center justify-center py-8">
      <section className="flex w-full max-w-2xl flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-6" strokeWidth={1.75} />
        </span>
        <h1 className="mt-6 text-balance font-serif text-4xl tracking-tight sm:text-5xl">
          What would you like to know?
        </h1>
        <p className="mt-3 max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
          Ask about anything in your home. GatheredOS answers from your own documents, history, and the
          things your household knows.
        </p>

        <div className="mt-8 w-full">
          <Composer input={input} setInput={setInput} onAsk={onAsk} busy={busy} />
        </div>

        {/* Suggested questions — plain, quiet chips */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {starterQuestions.map(({ text, icon: Icon }) => (
            <button
              key={text}
              type="button"
              onClick={() => onAsk(text)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-sage/40 hover:bg-accent/40"
            >
              <Icon className="size-4 text-sage-foreground" strokeWidth={2} />
              {text}
            </button>
          ))}
        </div>
      </section>

      {/* Recent conversations — a quiet text list, only when there are any */}
      {recent.length > 0 && (
        <section className="mt-14 w-full max-w-2xl">
          <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent conversations
          </h2>
          <ul className="divide-y divide-border/60">
            {recent.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  className="group flex w-full items-center gap-3 py-3 text-left transition-colors"
                >
                  <MessageCircle className="size-4 shrink-0 text-muted-foreground/60" strokeWidth={2} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground transition-colors group-hover:text-primary">
                      {c.question}
                    </span>
                    {c.teaser && (
                      <span className="truncate text-xs text-muted-foreground">{c.teaser}</span>
                    )}
                  </span>
                  <ArrowUp
                    className="size-3.5 shrink-0 rotate-45 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
                    strokeWidth={2}
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Composer({
  input,
  setInput,
  onAsk,
  busy,
  compact = false,
}: {
  input: string
  setInput: (v: string) => void
  onAsk: (q: string) => void
  busy: boolean
  compact?: boolean
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      onAsk(input)
    }
  }

  return (
    <div className="relative flex items-end gap-2 rounded-[1.75rem] border border-border bg-card p-2 pl-5 shadow-md focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={compact ? 'Ask a follow-up about your home...' : 'Ask about your home...'}
        className={cn(
          'flex-1 resize-none bg-transparent py-2.5 text-foreground outline-none placeholder:text-muted-foreground',
          compact ? 'text-sm' : 'text-base sm:text-lg',
        )}
      />
      <button
        type="button"
        onClick={() => onAsk(input)}
        disabled={busy || !input.trim()}
        aria-label="Ask GatheredOS"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40',
          compact ? 'size-10' : 'size-11',
        )}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" strokeWidth={2} />
        ) : (
          <ArrowUp className="size-5" strokeWidth={2.5} />
        )}
      </button>
    </div>
  )
}

function Thinking() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i < groundingSteps.length; i++) {
      timers.push(setTimeout(() => setStep(i), i * 520))
    }
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="ob-fade-in overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5 sm:px-7">
        <span className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="ob-pulse-soft size-4" strokeWidth={2} />
        </span>
        <p className="text-sm font-medium">GatheredOS is thinking</p>
      </div>
      <ul className="space-y-2.5 px-5 py-5 sm:px-7">
        {groundingSteps.map((s, i) => {
          const done = i < step
          const active = i === step
          return (
            <li
              key={s}
              className={cn(
                'flex items-center gap-2.5 text-sm transition-opacity',
                i > step && 'opacity-40',
              )}
            >
              {done ? (
                <Check className="size-4 shrink-0 text-sage-foreground" strokeWidth={2.5} />
              ) : active ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" strokeWidth={2} />
              ) : (
                <span className="size-4 shrink-0 rounded-full border border-border" />
              )}
              <span className={cn(done ? 'text-muted-foreground' : 'text-foreground')}>{s}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
