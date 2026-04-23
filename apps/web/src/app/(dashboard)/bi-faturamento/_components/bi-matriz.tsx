'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Loader2, Plus, Minus } from 'lucide-react'
import { Input, Checkbox, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

const MESES_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const fmtNum = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPct = (v: number) => Number.isFinite(v) ? `${v}%` : ''

interface CellValue { realizado: number; pct_av: number }

interface MatrizRow {
  id: string
  conta: string
  nomeConta: string
  level: number
  parentId: string | null
  hasChildren: boolean
  valores: Record<string, CellValue>
  total: CellValue
}

interface MatrizResponse {
  ano: number
  refs: string[]
  rows: MatrizRow[]
}

export function BiMatriz({ clienteId, ano }: { clienteId: string; ano: number }) {
  const [data, setData] = useState<MatrizResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [useParent, setUseParent] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selRow, setSelRow] = useState<string | null>(null)
  const [selCol, setSelCol] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId || !ano) return
    setLoading(true)
    trpc.bi.balanceteMatriz.query({ clienteId, ano, useParent })
      .then((res) => { setData(res as MatrizResponse); setExpanded(new Set()) })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [clienteId, ano, useParent])

  const rows = data?.rows ?? []
  const refs = data?.refs ?? []

  // Children map for expand/collapse
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, string[]>()
    for (const r of rows) {
      const p = r.parentId
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(r.id)
    }
    return map
  }, [rows])

  const getAllDescendants = useCallback((id: string): string[] => {
    const children = childrenMap.get(id) ?? []
    return children.flatMap(c => [c, ...getAllDescendants(c)])
  }, [childrenMap])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id); getAllDescendants(id).forEach(d => n.delete(d)) }
      else n.add(id)
      return n
    })
  }

  const expandAll = () => setExpanded(new Set(rows.filter(r => r.hasChildren).map(r => r.id)))
  const collapseAll = () => setExpanded(new Set())

  // Visible rows
  const visibleRows = useMemo(() => {
    if (search) {
      const q = search.toLowerCase()
      return rows.filter(r => r.conta.toLowerCase().includes(q) || r.nomeConta.toLowerCase().includes(q))
    }
    const byKey = new Map(rows.map(r => [r.id, r]))
    return rows.filter(r => {
      let parent = r.parentId
      while (parent) {
        if (!expanded.has(parent)) return false
        parent = byKey.get(parent)?.parentId ?? null
      }
      return true
    })
  }, [rows, expanded, search])

  // Row type for coloring
  const getRowType = (conta: string, nome: string): 'receita' | 'despesa' | null => {
    const n = (nome || '').toLowerCase()
    if (/^0?1\.?/.test(conta) || /^ativo/i.test(n)) return 'receita'
    if (/^0?3\.?/.test(conta) || /^receita/i.test(n)) return 'receita'
    if (/^0?2\.?/.test(conta) || /^passivo/i.test(n)) return 'despesa'
    if (/^0?4\.?/.test(conta) || /despesa|custo|dedu/i.test(n)) return 'despesa'
    return null
  }

  const handleCellClick = (rowId: string, colRef: string) => {
    if (selRow === rowId && selCol === colRef) { setSelRow(null); setSelCol(null) }
    else { setSelRow(rowId); setSelCol(colRef) }
  }

  const clearSelection = () => { setSelRow(null); setSelCol(null) }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!data || rows.length === 0) return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Nenhum dado disponível. Importe o balancete e configure as categorias "No BI".</div>

  return (
    <div className="space-y-3">
      {/* Crosshair highlight styles */}
      <style>{`
        .mz-row-sel td:not(.mz-sticky-conta) { background-color: rgba(255, 180, 40, 0.12); }
        .mz-cell-sel-col { background-color: rgba(255, 180, 40, 0.12) !important; }
        .mz-cell-sel-cross-l { background-color: rgba(255, 180, 40, 0.35) !important; box-shadow: inset 0 2px 0 rgba(154,114,0,0.5), inset 2px 0 0 rgba(154,114,0,0.5), inset 0 -2px 0 rgba(154,114,0,0.5); }
        .mz-cell-sel-cross-r { background-color: rgba(255, 180, 40, 0.35) !important; box-shadow: inset 0 2px 0 rgba(154,114,0,0.5), inset -2px 0 0 rgba(154,114,0,0.5), inset 0 -2px 0 rgba(154,114,0,0.5); }
        .mz-cat-sel { background-color: rgba(255, 180, 40, 0.3) !important; border-left: 3px solid #9a7200 !important; }
        .mz-head-sel { background-color: rgba(255, 180, 40, 0.4) !important; color: #1e293b !important; }
        .mz-sticky-conta { position: sticky; left: 0; z-index: 15; background-color: #fff; box-shadow: 6px 0 10px -4px rgba(0,0,0,0.15); }
        .mz-sticky-conta.mz-cat-sel { background-color: rgba(255, 180, 40, 0.3); }
      `}</style>
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Input placeholder="Buscar conta..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <Checkbox checked={useParent} onCheckedChange={v => setUseParent(!!v)} className="h-3.5 w-3.5" />
          Agrupar por conta pai
        </label>
        <button type="button" onClick={expandAll} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">Expandir tudo</button>
        <button type="button" onClick={collapseAll} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">Recolher tudo</button>
        <span className="text-[11px] text-muted-foreground">{visibleRows.length} de {rows.length} contas</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border" style={{ maxHeight: '70vh' }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            {/* Row 1: Month headers */}
            <tr className="bg-muted/90 border-b">
              <th
                rowSpan={2}
                className="sticky left-0 z-20 bg-muted px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer"
                style={{ minWidth: 320, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.12)' }}
                onClick={clearSelection}
                title="Clique para limpar o destaque"
              >
                Conta
              </th>
              {refs.map(ref => {
                const mesIdx = Number(ref.slice(4)) - 1
                return (
                  <th
                    key={ref} colSpan={2}
                    className={cn('px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-l border-border/30 cursor-pointer select-none', selCol === ref && 'mz-head-sel')}
                    onClick={() => setSelCol(prev => prev === ref ? null : ref)}
                  >
                    {MESES_LABELS[mesIdx]}/{ref.slice(0, 4)}
                  </th>
                )
              })}
              <th colSpan={2} className="px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-foreground border-l-2 border-border/60 bg-muted">
                Total
              </th>
            </tr>
            {/* Row 2: Realizado + % A.V */}
            <tr className="bg-muted/70 border-b">
              {refs.map(ref => (
                <React.Fragment key={`sub-${ref}`}>
                  <th className="px-2 py-1 text-right text-[9px] font-medium text-muted-foreground border-l border-border/20" style={{ minWidth: 85 }}>Realizado</th>
                  <th className="px-1 py-1 text-right text-[9px] font-medium text-muted-foreground" style={{ minWidth: 42 }} title="% sobre Receita Bruta">% A.V</th>
                </React.Fragment>
              ))}
              <th className="px-2 py-1 text-right text-[9px] font-bold text-foreground border-l-2 border-border/60" style={{ minWidth: 95 }}>Realizado</th>
              <th className="px-1 py-1 text-right text-[9px] font-bold text-foreground" style={{ minWidth: 42 }}>% A.V</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map(row => {
              const indent = search ? 0 : row.level * 18
              const isGroup = row.level === 0
              const rowType = getRowType(row.conta, row.nomeConta)

              const valColor = rowType === 'receita' ? 'text-emerald-700 dark:text-emerald-400'
                : rowType === 'despesa' ? 'text-red-800 dark:text-red-400'
                : ''

              return (
                <tr key={row.id} className={cn('border-b border-border/15 hover:bg-muted/20 transition-colors', isGroup && 'bg-muted/10', isRowSel && 'mz-row-sel')}>
                  {/* Conta (sticky) */}
                  <td
                    className={cn('mz-sticky-conta px-3 py-1.5 whitespace-nowrap text-foreground cursor-pointer', selRow === row.id && 'mz-cat-sel')}
                    style={{ paddingLeft: `${12 + indent}px` }}
                    onClick={() => setSelRow(prev => prev === row.id ? null : row.id)}
                  >
                    <div className="flex items-center gap-1">
                      {row.hasChildren ? (
                        <button type="button" onClick={() => toggleExpand(row.id)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted text-muted-foreground">
                          {expanded.has(row.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        </button>
                      ) : <span className="inline-block w-4 shrink-0" />}
                      <span className={cn('truncate', isGroup && 'font-semibold')} title={`${row.conta} — ${row.nomeConta}`}>
                        {row.nomeConta}
                      </span>
                    </div>
                  </td>

                  {/* Month cells: Realizado + % A.V */}
                  {refs.map(ref => {
                    const cell = row.valores[ref] ?? { realizado: 0, pct_av: 0 }
                    const isNeg = cell.realizado < 0
                    const isRowSel = selRow === row.id
                    const isColSel = selCol === ref
                    const isCross = isRowSel && isColSel
                    const hlL = isCross ? 'mz-cell-sel-cross-l' : isColSel ? 'mz-cell-sel-col' : ''
                    const hlR = isCross ? 'mz-cell-sel-cross-r' : isColSel ? 'mz-cell-sel-col' : ''
                    return (
                      <React.Fragment key={ref}>
                        <td
                          className={cn('px-2 py-1.5 text-right tabular-nums border-l border-border/10 cursor-pointer', isNeg ? 'text-red-600' : valColor, isGroup && 'font-semibold', hlL)}
                          onClick={() => handleCellClick(row.id, ref)}
                        >
                          {fmtNum(cell.realizado)}
                        </td>
                        <td
                          className={cn('px-1 py-1.5 text-right tabular-nums text-muted-foreground cursor-pointer', cell.pct_av < 0 && 'text-red-500', hlR)}
                          onClick={() => handleCellClick(row.id, ref)}
                        >
                          {fmtPct(cell.pct_av)}
                        </td>
                      </React.Fragment>
                    )
                  })}

                  {/* Total */}
                  <td className={cn('px-2 py-1.5 text-right tabular-nums border-l-2 border-border/40 bg-muted/20', row.total.realizado < 0 ? 'text-red-600 font-semibold' : `${valColor} font-semibold`)}>
                    {fmtNum(row.total.realizado)}
                  </td>
                  <td className={cn('px-1 py-1.5 text-right tabular-nums bg-muted/20 text-muted-foreground font-semibold', row.total.pct_av < 0 && 'text-red-500')}>
                    {fmtPct(row.total.pct_av)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
