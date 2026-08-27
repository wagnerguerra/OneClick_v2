'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@saas/ui'
import { Loader2, Search } from 'lucide-react'
import { trpc } from '@/lib/trpc'

export interface OportunidadeOpt { id: string; numero: number | null; titulo: string; cliente: string | null; etapa: string | null }

/** Busca cards de CRM (nº/título) para vincular a um orçamento. */
export function OportunidadeCombobox({ onSelect }: { onSelect: (op: OportunidadeOpt) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<OportunidadeOpt[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await (trpc.orcamento as unknown as { buscarOportunidadesParaVinculo: { query: (i: { search?: string }) => Promise<OportunidadeOpt[]> } })
          .buscarOportunidadesParaVinculo.query({ search: q || undefined })
        setResults(r)
      } catch { setResults([]) } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, open])

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar card de CRM por nº ou título..."
          className="h-9 text-sm pl-8"
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-[260px] overflow-auto nice-scrollbar">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum card encontrado.</div>
          ) : results.map(op => (
            <button
              key={op.id}
              type="button"
              onClick={() => { onSelect(op); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/40 last:border-0"
            >
              <div className="text-sm font-medium truncate">{op.numero != null ? `#${op.numero} · ` : ''}{op.titulo}</div>
              <div className="text-[11px] text-muted-foreground truncate">{op.cliente ?? 'Sem cliente'}{op.etapa ? ` · ${op.etapa}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
