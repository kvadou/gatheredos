'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Minus, Plus, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'

type LabelItem = { id: string; name: string; manufacturer: string | null; model: string | null }
type Layout = 'single' | 'avery'

export function QrLabelSheet({ item, roomName }: { item: LabelItem; roomName: string | null }) {
  const [layout, setLayout] = useState<Layout>('single')
  const [copies, setCopies] = useState(1)
  const detail = [roomName, item.manufacturer, item.model].filter(Boolean).join(' · ')
  const shortId = item.id.slice(0, 8).toUpperCase()
  const labels = Array.from({ length: layout === 'avery' ? copies : 1 })

  return (
    <main className="min-h-screen bg-secondary/30 px-4 py-6 text-foreground print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl print:hidden">
        <Link href={`/library/item/${item.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {item.name}
        </Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><h1 className="font-serif text-3xl tracking-tight">Print QR label</h1><p className="mt-1 text-sm text-muted-foreground">Scanning opens this private item record after sign-in.</p></div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Printer className="size-4" />Print labels</button>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex rounded-xl bg-secondary p-1">
            {(['single', 'avery'] as Layout[]).map((value) => <button key={value} type="button" onClick={() => setLayout(value)} className={cn('rounded-lg px-3 py-2 text-sm font-medium', layout === value ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{value === 'single' ? 'Individual label' : 'Avery 5160 sheet'}</button>)}
          </div>
          {layout === 'avery' && <div className="ml-auto flex items-center gap-2"><span className="text-sm text-muted-foreground">Copies</span><button type="button" aria-label="Fewer copies" onClick={() => setCopies((n) => Math.max(1, n - 1))} className="flex size-9 items-center justify-center rounded-lg border border-border"><Minus className="size-4" /></button><span className="w-6 text-center text-sm font-medium tabular-nums">{copies}</span><button type="button" aria-label="More copies" onClick={() => setCopies((n) => Math.min(30, n + 1))} className="flex size-9 items-center justify-center rounded-lg border border-border"><Plus className="size-4" /></button></div>}
        </div>
      </div>

      <section className={cn('label-page mx-auto mt-8 bg-white print:mt-0', layout === 'avery' ? 'avery-sheet' : 'single-sheet')}>
        {labels.map((_, index) => <ItemLabel key={index} item={item} detail={detail} shortId={shortId} />)}
      </section>
      <style jsx global>{`
        .label-page { color: #0a2e4d; }
        .single-sheet { width: 3in; min-height: 2in; padding: .12in; display: flex; align-items: center; justify-content: center; }
        .avery-sheet { width: 8.5in; min-height: 11in; padding: .5in .1875in; display: grid; grid-template-columns: repeat(3, 2.625in); grid-auto-rows: 1in; column-gap: .125in; align-content: start; }
        @media print { @page { size: ${layout === 'single' ? '3in 2in' : 'letter'}; margin: 0; } .single-sheet, .avery-sheet { margin: 0; } }
      `}</style>
    </main>
  )
}

function ItemLabel({ item, detail, shortId }: { item: LabelItem; detail: string; shortId: string }) {
  return <article className="flex h-[1in] w-[2.625in] items-center gap-[.09in] overflow-hidden px-[.11in] py-[.07in]">
    <img src={`/api/items/${item.id}/qr`} alt={`QR code for ${item.name}`} className="size-[.78in] shrink-0" />
    <div className="min-w-0"><p className="truncate text-[11pt] font-semibold leading-tight">{item.name}</p>{detail && <p className="mt-1 line-clamp-2 text-[7.5pt] leading-tight text-[#526979]">{detail}</p>}<p className="mt-1 text-[6.5pt] font-medium tracking-wide text-[#526979]">SCAN WITH GATHEREDOS · {shortId}</p></div>
  </article>
}
