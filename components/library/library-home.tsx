'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Search,
  Plus,
  Sparkles,
  Play,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ArrowUpDown,
  Folder,
  FolderUp,
  ArrowRight,
  X,
  Footprints,
} from 'lucide-react'
import {
  iconFor,
  tintClasses,
  type Collection,
  type ItemCard,
  type LibraryFile,
  type LivingObservation,
} from '@/lib/library-data'
import { cn } from '@/lib/utils'
import { FileDeleteButton } from '@/components/library/file-delete-button'
import { ReviewFileActions } from '@/components/library/review-file-actions'

const suggestions = [
  'Water heater',
  'Roof warranty',
  'Kitchen paint color',
  'Sprinkler video',
  'Furnace manual',
  'Where is my water shutoff?',
]

const libraryFilters = [
  { key: 'all', label: 'All records', icon: Folder },
  { key: 'home', label: 'Home Documents', icon: FileText },
  { key: 'review', label: 'Needs Review', icon: Sparkles },
] as const

function isHomeDocument(file: LibraryFile) {
  return file.type === 'documents'
}

type ViewMode = 'grid' | 'list'
type SortMode = 'recent' | 'name' | 'type'

const sortLabels: Record<SortMode, string> = {
  recent: 'Recent',
  name: 'Name',
  type: 'Type',
}

type LibraryHomeProps = {
  collections: Collection[]
  files: LibraryFile[]
  objects: ItemCard[]
  discoveries: LivingObservation[]
  understanding: number | null
  canWrite: boolean
}

export function LibraryHome({ collections, files, objects, discoveries, understanding, canWrite }: LibraryHomeProps) {
  const [query, setQuery] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [sort, setSort] = useState<SortMode>('recent')
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggest(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Top-level records are either whole-home documents or evidence waiting to
  // be attached. Linked evidence is intentionally absent from this surface.
  const counts = useMemo(() => {
    const home = files.filter(isHomeDocument).length
    return { all: files.length, home, review: files.length - home }
  }, [files])

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = files.filter((f) => {
      const homeDocument = isHomeDocument(f)
      const matchesFilter = filter === 'all' || (filter === 'home' ? homeDocument : !homeDocument)
      const matchesQuery =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.typeLabel.toLowerCase().includes(q) ||
        f.collection.toLowerCase().includes(q) ||
        f.meta.toLowerCase().includes(q)
      return matchesFilter && matchesQuery
    })
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'type') return a.typeLabel.localeCompare(b.typeLabel)
      return b.order - a.order
    })
    return list
  }, [files, query, filter, sort])

  // Object results (rich profiles) shown above files when searching.
  const objectResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return objects.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q),
    )
  }, [objects, query])

  const searching = query.trim().length > 0

  function cycleSort() {
    setSort((s) => (s === 'recent' ? 'name' : s === 'name' ? 'type' : 'recent'))
  }

  return (
    <div className="space-y-6">
      {/* Tool identity + toolbar — persistent, compact, unmistakably a browser */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">Library</h1>
            <p className="text-sm text-muted-foreground">
              {files.length} files · {collections.length} collections
            </p>
          </div>
          <div className="flex items-center gap-2"><Link href="/capture" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium shadow-sm hover:bg-accent/40"><Footprints className="size-4" /><span className="hidden sm:inline">Guided setup</span></Link><Link
              href="/library/upload?mode=bulk"
              aria-label="Import everything"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium shadow-sm hover:bg-accent/40"
            >
              <FolderUp className="size-4" />
              <span className="hidden sm:inline">Import everything</span>
            </Link><Link
              href="/library/upload"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Add file</span>
            </Link></div>
        </div>

        {/* Search + view/sort controls */}
        <div className="flex items-center gap-2">
          <div ref={searchRef} className="relative flex-1">
            <Search
              className="absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              value={query}
              onFocus={() => setShowSuggest(true)}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your home's memory..."
              className="h-12 w-full rounded-2xl border border-border bg-card pl-12 pr-10 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            )}

            {showSuggest && !searching && (
              <div className="absolute left-0 right-0 top-14 z-20 overflow-hidden rounded-2xl border border-border bg-popover p-2 shadow-lg">
                <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-3.5 text-sage-foreground" strokeWidth={2} />
                  Try searching
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setQuery(s)
                      setShowSuggest(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent/60"
                  >
                    <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={cycleSort}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent/60"
            title="Change sort order"
          >
            <ArrowUpDown className="size-4 text-muted-foreground" strokeWidth={2} />
            <span className="hidden sm:inline">{sortLabels[sort]}</span>
          </button>

          <div className="flex h-12 shrink-0 items-center rounded-2xl border border-border bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              className={`flex size-10 items-center justify-center rounded-xl transition-colors ${
                view === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <LayoutGrid className="size-4.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="List view"
              aria-pressed={view === 'list'}
              className={`flex size-10 items-center justify-center rounded-xl transition-colors ${
                view === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <List className="size-4.5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Filing-state filters: linked evidence lives inside its item. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {libraryFilters.map(({ key, label, icon: Icon }) => {
            const active = filter === key
            const n = counts[key] ?? 0
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent/60'
                }`}
              >
                <Icon className="size-4" strokeWidth={2} />
                {label}
                <span className={active ? 'text-primary/70' : 'text-muted-foreground/60'}>{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* THE HERO: what GatheredOS knows. The intelligence leads, not the folders. */}
      {!searching && <RecentDiscoveries discoveries={discoveries} understanding={understanding} />}

      {/* Folders — browse by how you think about your home (secondary) */}
      {!searching && collections.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Collections
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {collections.map(({ key, label, icon, count, tint }) => {
              const Icon = iconFor(icon)
              return (
                <Link
                  key={key}
                  href={`/library/collection/${key}`}
                  className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sage/40 hover:shadow-md"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tintClasses[tint]}`}
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{count} items</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Object matches when searching — rich profiles */}
      {searching && objectResults.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Objects
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {objectResults.map((item) => {
              const Icon = iconFor(item.icon)
              return (
                <Link
                  key={item.id}
                  href={`/library/item/${item.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sage/40 hover:shadow-md"
                >
                  <span
                    className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tintClasses[item.tint]}`}
                  >
                    <Icon className="size-5.5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{item.summary}</p>
                  </div>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                  />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Whole-home documents and evidence that still needs filing. */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {searching ? 'Matching records' : filter === 'all' ? 'Home Documents & Needs Review' : libraryFilters.find((f) => f.key === filter)?.label}
          </h2>
          <p className="text-xs text-muted-foreground">
            {visibleFiles.length} {visibleFiles.length === 1 ? 'record' : 'records'}
          </p>
        </div>

        {visibleFiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-10 text-center">
            <Folder className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-muted-foreground">
              {searching ? `No records match “${query}” yet.` : 'Nothing needs filing here.'}
            </p>
            <Link
              href="/library/upload"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Add to your home
            </Link>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleFiles.map((f) => (
              <FileCard key={f.id} file={f} canDelete={canWrite} items={objects} needsReview={!isHomeDocument(f)} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            {visibleFiles.map((f, i) => (
              <FileRow key={f.id} file={f} last={i === visibleFiles.length - 1} canDelete={canWrite} items={objects} needsReview={!isHomeDocument(f)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function RecentDiscoveries({
  discoveries,
  understanding,
}: {
  discoveries: LivingObservation[]
  understanding: number | null
}) {
  const shown = discoveries.slice(0, 4)
  const [showMissing, setShowMissing] = useState(false)
  return (
    <section className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
      {/* Signature Library insight — how much of the home GatheredOS understands */}
      <div className="border-b border-border/60 bg-sage/[0.06] p-6 sm:p-7">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-sage-foreground" strokeWidth={2} />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage-foreground">
            What I know so far
          </p>
        </div>
        <p className="mt-3 text-balance font-serif text-2xl leading-tight tracking-tight sm:text-3xl">
          {understanding == null ? 'Home knowledge is not scored yet' : `I understand about ${understanding}% of your home`}
        </p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          GatheredOS only reports a percentage when there is a defined checklist to measure against. Your saved records appear below without an invented completeness score.
        </p>
        {/* Understanding meter — click to reveal what's holding the number back */}
        {understanding != null && <button
          type="button"
          onClick={() => setShowMissing((v) => !v)}
          aria-expanded={showMissing}
          className="group mt-4 flex min-h-10 w-full items-center gap-3 rounded-xl p-1.5 -m-1.5 text-left transition-colors hover:bg-sage/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-sage" style={{ width: `${understanding}%` }} />
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{understanding}%</span>
          <span className="flex items-center gap-1 text-xs font-medium text-sage-foreground">
            {showMissing ? 'Hide' : "What's missing?"}
            <ArrowRight
              className={cn(
                'size-3.5 transition-transform',
                showMissing ? 'rotate-90' : 'group-hover:translate-x-0.5',
              )}
              strokeWidth={2.25}
            />
          </span>
        </button>}

        {/* The reveal — a concrete checklist that makes you want to improve it */}
        {showMissing && understanding != null && (
          <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Items needed for the documented home checklist.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            </ul>
          </div>
        )}
      </div>

      {/* Recent discoveries — the magic: found, linked, recognized, suggested */}
      <div className="p-6 sm:p-7">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-xl tracking-tight">Recent discoveries</h2>
          <span className="text-xs text-muted-foreground">{discoveries.length} this month</span>
        </div>
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Add your first item or file and GatheredOS will start building your home&apos;s memory here.
            </p>
            <Link
              href="/library/item/new"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Add your first item
            </Link>
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {shown.map((o) => {
              const Icon = iconFor(o.icon)
              return (
                <li key={o.id}>
                  <Link
                    href={o.href}
                    className="group flex h-full items-start gap-3 rounded-2xl border border-border/60 bg-secondary/30 p-4 transition-all hover:-translate-y-0.5 hover:border-sage/40 hover:bg-card hover:shadow-md"
                  >
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tintClasses[o.tint]}`}
                    >
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-relaxed text-foreground">{o.text}</span>
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sage-foreground">
                        {o.action}
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5"
                          strokeWidth={2}
                        />
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function FilePreview({ file, className }: { file: LibraryFile; className?: string }) {
  if (file.preview === 'photo') {
    return file.image ? (
      <div className={`overflow-hidden bg-secondary ${className}`}>
        { }
        <img
          src={file.image || '/placeholder.svg'}
          alt={file.name}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    ) : (
      <div className={`flex items-center justify-center bg-secondary/60 ${className}`}>
        <ImageIcon className="size-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
    )
  }
  if (file.preview === 'swatch') {
    return <div className={className} style={{ backgroundColor: file.color }} />
  }
  if (file.preview === 'video') {
    return (
      <div className={`flex items-center justify-center bg-primary/10 ${className}`}>
        <span className="flex size-11 items-center justify-center rounded-full bg-card text-primary shadow-sm">
          <Play className="size-5 translate-x-0.5 fill-current" strokeWidth={0} />
        </span>
      </div>
    )
  }
  return (
    <div className={`flex items-center justify-center bg-secondary/50 ${className}`}>
      <FileText className="size-8 text-muted-foreground" strokeWidth={1.5} />
    </div>
  )
}

function FileCard({ file, canDelete, items, needsReview }: { file: LibraryFile; canDelete: boolean; items: ItemCard[]; needsReview: boolean }) {
  const inner = (
    <>
      <FilePreview file={file} className="aspect-[16/11] w-full" />
      <div className="flex flex-1 flex-col p-3.5">
        <p className="text-sm font-medium leading-snug">{file.name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{file.meta}</p>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className={`rounded-full px-2 py-0.5 font-medium ${tintClasses[file.tint]}`}>
            {file.typeLabel}
          </span>
          <span>{file.date}</span>
        </div>
      </div>
      {needsReview && canDelete && <div className="px-3.5 pb-3.5"><ReviewFileActions fileId={file.id} items={items} /></div>}
    </>
  )
  const className =
    'group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-sage/40 hover:shadow-md'
  return <div className="relative">
    {canDelete && <FileDeleteButton id={file.id} name={file.name} />}
    {file.itemId ? <Link href={`/library/item/${file.itemId}`} className={className}>{inner}</Link> : <div className={className}>{inner}</div>}
  </div>
}

function FileRow({ file, last, canDelete, items, needsReview }: { file: LibraryFile; last: boolean; canDelete: boolean; items: ItemCard[]; needsReview: boolean }) {
  const inner = (
    <>
      <FilePreview file={file} className="size-11 shrink-0 overflow-hidden rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {file.collection} · {file.meta}
        </p>
      </div>
      <span
        className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline ${tintClasses[file.tint]}`}
      >
        {file.typeLabel}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:inline">
        {file.date}
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        strokeWidth={2}
      />
    </>
  )
  const className = 'group flex min-w-0 flex-1 items-center gap-3.5 py-3 pl-4'
  return <div className={cn('px-2 transition-colors hover:bg-accent/50', !last && 'border-b border-border/60')}>
    <div className="flex items-center">
      {file.itemId ? <Link href={`/library/item/${file.itemId}`} className={className}>{inner}</Link> : <div className={className}>{inner}</div>}
      {canDelete && <FileDeleteButton id={file.id} name={file.name} compact />}
    </div>
    {needsReview && canDelete && <div className="pb-3 pl-[4.25rem]"><ReviewFileActions fileId={file.id} items={items} /></div>}
  </div>
}
