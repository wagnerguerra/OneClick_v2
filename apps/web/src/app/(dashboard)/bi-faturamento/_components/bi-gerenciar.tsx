'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, Trash2, Plus, Minus, ChevronDown, ChevronRight } from 'lucide-react'
import { Button, Input, Badge } from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface BalanceteLinha {
  id?: string
  conta: string
  nomeConta: string
  saldoAnterior?: number
  saldo_anterior?: number
  debitos?: number
  creditos?: number
  saldoAtual?: number
  saldo_atual?: number
  movimento?: number
}

interface BiGerenciarProps {
  clienteId: string
  ano: number
  meses?: number[]
}

export function BiGerenciar({ clienteId, ano }: BiGerenciarProps) {
  const [periodos, setPeriodos] = useState<string[]>([])
  const [selectedPeriodo, setSelectedPeriodo] = useState('')
  const [linhas, setLinhas] = useState<BalanceteLinha[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingPeriodos, setLoadingPeriodos] = useState(true)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Carregar periodos
  useEffect(() => {
    if (!clienteId) return
    setLoadingPeriodos(true)
    setSelectedPeriodo('')
    setLinhas([])
    trpc.cliente.biGetPeriodos.query({ clienteId })
      .then((result) => {
        const raw = (result as Array<{ periodo: string; total: number }>) || []
        const lista = raw.map(r => r.periodo)
        setPeriodos(lista)
        if (lista.length > 0) setSelectedPeriodo(lista[0]!)
      })
      .catch(() => setPeriodos([]))
      .finally(() => setLoadingPeriodos(false))
  }, [clienteId, ano])

  // Carregar linhas
  useEffect(() => {
    if (!clienteId || !selectedPeriodo) { setLinhas([]); return }
    setLoading(true)
    trpc.cliente.biListLinhas.query({ clienteId, periodo: selectedPeriodo })
      .then((result) => {
        setLinhas((result as BalanceteLinha[]) || [])
        setExpanded(new Set())
      })
      .catch(() => setLinhas([]))
      .finally(() => setLoading(false))
  }, [clienteId, selectedPeriodo])

  // Normalizar campos (backend pode retornar camelCase ou snake_case)
  const normalize = (r: BalanceteLinha) => ({
    conta: r.conta,
    nomeConta: r.nomeConta,
    saldoAnterior: Number(r.saldoAnterior ?? r.saldo_anterior ?? 0),
    debitos: Number(r.debitos ?? 0),
    creditos: Number(r.creditos ?? 0),
    saldoAtual: Number(r.saldoAtual ?? r.saldo_atual ?? 0),
    movimento: Number(r.movimento ?? 0),
  })

  // Tree helpers
  const { treeItems, childrenMap } = useMemo(() => {
    const contaSet = new Set(linhas.map(l => l.conta))
    const enriched = linhas.map(l => {
      const parts = l.conta.split('.')
      const nivel = parts.length
      let parentConta: string | null = null
      for (let i = parts.length - 1; i >= 1; i--) {
        const candidate = parts.slice(0, i).join('.')
        if (contaSet.has(candidate)) { parentConta = candidate; break }
      }
      return { ...l, parentConta, nivel }
    })

    const cMap = new Map<string | null, string[]>()
    enriched.forEach(c => {
      const p = c.parentConta
      if (!cMap.has(p)) cMap.set(p, [])
      cMap.get(p)!.push(c.conta)
    })
    for (const [, children] of cMap) children.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    const byKey = new Map(enriched.map(c => [c.conta, c]))
    const ordered: typeof enriched = []
    function walk(parentKey: string | null) {
      for (const childKey of cMap.get(parentKey) ?? []) {
        const item = byKey.get(childKey)
        if (item) { ordered.push(item); walk(childKey) }
      }
    }
    walk(null)
    const inTree = new Set(ordered.map(c => c.conta))
    for (const c of enriched) { if (!inTree.has(c.conta)) ordered.push(c) }

    return { treeItems: ordered, childrenMap: cMap }
  }, [linhas])

  const hasChildren = useCallback((conta: string) => (childrenMap.get(conta)?.length ?? 0) > 0, [childrenMap])

  const toggleExpand = (conta: string) => {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(conta)) {
        n.delete(conta)
        // Collapse descendants
        const collapse = (c: string) => { (childrenMap.get(c) ?? []).forEach(ch => { n.delete(ch); collapse(ch) }) }
        collapse(conta)
      } else { n.add(conta) }
      return n
    })
  }

  // Visible items
  const visibleItems = useMemo(() => {
    if (search) {
      const q = search.toLowerCase()
      return treeItems.filter(c => c.conta.toLowerCase().includes(q) || c.nomeConta.toLowerCase().includes(q))
    }
    const byKey = new Map(treeItems.map(c => [c.conta, c]))
    return treeItems.filter(cat => {
      if (!cat.parentConta) return true
      let current = byKey.get(cat.parentConta)
      while (current) {
        if (!expanded.has(current.conta)) return false
        current = current.parentConta ? byKey.get(current.parentConta) : undefined
      }
      return true
    })
  }, [treeItems, expanded, search])

  // Deletar periodo
  async function handleDeletePeriodo() {
    if (!clienteId || !selectedPeriodo) return
    const confirmed = await alerts.confirm({ title: 'Excluir período?', text: `Deseja excluir "${selectedPeriodo}" e todas as suas linhas?`, confirmText: 'Sim, excluir', icon: 'warning' })
    if (!confirmed) return
    setDeleting(true)
    try {
      await trpc.cliente.biDeletePeriodo.mutate({ clienteId, periodo: selectedPeriodo })
      alerts.success('Excluído', `Período "${selectedPeriodo}" excluído.`)
      const result = await trpc.cliente.biGetPeriodos.query({ clienteId })
      const raw = (result as Array<{ periodo: string; total: number }>) || []
      const lista = raw.map(r => r.periodo)
      setPeriodos(lista)
      if (lista.length > 0) { setSelectedPeriodo(lista[0]!) } else { setSelectedPeriodo(''); setLinhas([]) }
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setDeleting(false) }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-[200px]">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Período</label>
          {loadingPeriodos ? (
            <div className="flex items-center gap-2 h-8 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</div>
          ) : periodos.length === 0 ? (
            <p className="text-xs text-muted-foreground h-8 flex items-center">Nenhum período disponível</p>
          ) : (
            <select value={selectedPeriodo} onChange={e => setSelectedPeriodo(e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {periodos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>

        <div className="flex-1 max-w-xs">
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Buscar</label>
          <Input placeholder="Buscar conta ou nome..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button type="button" onClick={() => setExpanded(new Set(treeItems.filter(c => hasChildren(c.conta)).map(c => c.conta)))} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">Expandir</button>
          <button type="button" onClick={() => setExpanded(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">Recolher</button>
          <Badge variant="outline" className="text-[10px] shrink-0">{visibleItems.length}/{linhas.length}</Badge>
        </div>

        <div className="ml-auto mt-5">
          <Button variant="outline" size="sm" onClick={handleDeletePeriodo} disabled={!selectedPeriodo || deleting} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:!text-white">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Excluir Período
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !selectedPeriodo ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Selecione um período</div>
      ) : visibleItems.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Nenhuma conta encontrada</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60" style={{ maxHeight: '65vh' }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/50 border-b">
                <th className="sticky left-0 z-20 bg-muted/80 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minWidth: 300, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)' }}>Conta</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minWidth: 110 }}>Saldo Anterior</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minWidth: 110 }}>Débitos</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minWidth: 110 }}>Créditos</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minWidth: 110 }}>Saldo Atual</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minWidth: 110 }}>Movimento</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(row => {
                const n = normalize(row)
                const indent = search ? 0 : (row.nivel - 1) * 20
                const hasSub = hasChildren(row.conta)
                const isExpanded = expanded.has(row.conta)
                const isGroup = row.nivel <= 2

                return (
                  <tr key={row.conta} className={cn('border-b border-border/20 hover:bg-muted/20 transition-colors', isGroup && 'bg-muted/10')}>
                    <td className="sticky left-0 z-[5] px-3 py-1.5 whitespace-nowrap" style={{ backgroundColor: '#fff', paddingLeft: `${12 + indent}px`, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.06)' }}>
                      <div className="flex items-center gap-1">
                        {hasSub ? (
                          <button type="button" onClick={() => toggleExpand(row.conta)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted text-muted-foreground">
                            {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          </button>
                        ) : <span className="inline-block w-4 shrink-0" />}
                        <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{row.conta}</span>
                        <span className={cn('truncate', isGroup && 'font-semibold')} title={n.nomeConta}>{n.nomeConta}</span>
                      </div>
                    </td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', n.saldoAnterior < 0 && 'text-red-600', isGroup && 'font-semibold')}>{formatCurrency(n.saldoAnterior)}</td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', n.debitos < 0 && 'text-red-600')}>{formatCurrency(n.debitos)}</td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', n.creditos < 0 && 'text-red-600')}>{formatCurrency(n.creditos)}</td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', n.saldoAtual < 0 && 'text-red-600', isGroup && 'font-semibold')}>{formatCurrency(n.saldoAtual)}</td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', n.movimento < 0 && 'text-red-600')}>{formatCurrency(n.movimento)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
