'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Calculator, Save, Loader2, Plus, Trash2, ChevronRight, ChevronDown,
  Search, ChevronsUpDown, Eye, EyeOff, Link2, Copy, RefreshCw, X, ExternalLink,
} from 'lucide-react'
import {
  Button, Input, Card, Checkbox,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useClientesPerms } from './use-clientes-perms'

// ============================================================
// Types
// ============================================================

interface Categoria {
  id: string
  conta: string
  nomeSci: string
  nomeExibicao: string
  parentConta: string | null
  nivel: number
  ordem: number
  tipo: string
  ativo: boolean
}

// ============================================================
// Tree Helpers
// ============================================================

function buildTree(cats: Categoria[]) {
  const byId = new Map(cats.map(c => [c.conta, c]))
  const children = new Map<string | null, Categoria[]>()

  for (const c of cats) {
    const key = c.parentConta
    if (!children.has(key)) children.set(key, [])
    children.get(key)!.push(c)
  }

  // Sort children by ordem then conta
  for (const [, arr] of children) {
    arr.sort((a, b) => a.ordem - b.ordem || a.conta.localeCompare(b.conta))
  }

  return { byId, children }
}

function getRootNodes(children: Map<string | null, Categoria[]>) {
  const roots = children.get(null) || []
  // Also include nodes whose parent doesn't exist
  const allParents = new Set([...children.keys()].filter(Boolean))
  for (const [, arr] of children) {
    for (const c of arr) {
      if (c.parentConta && !children.has(c.parentConta) && !roots.includes(c)) {
        roots.push(c)
      }
    }
  }
  return roots.sort((a, b) => a.ordem - b.ordem || a.conta.localeCompare(b.conta))
}

// ============================================================
// Component
// ============================================================

export function ContabilCard({ clienteId, documento }: { clienteId: string; documento?: string }) {
  const { canManageFiscal } = useClientesPerms()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [showOnlyAtivo, setShowOnlyAtivo] = useState(false)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [periodos, setPeriodos] = useState<Array<{ periodo: string; total: number }>>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, prds] = await Promise.all([
        (trpc.cliente as any).biListCategorias.query({ clienteId }),
        (trpc.cliente as any).biGetPeriodos.query({ clienteId }),
      ])
      setCategorias(cats)
      setPeriodos(prds)
      // Auto-expand first level
      const roots = cats.filter((c: Categoria) => !c.parentConta || c.nivel === 1)
      setExpanded(new Set(roots.map((r: Categoria) => r.conta)))
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { fetchData() }, [fetchData])

  const tree = useMemo(() => buildTree(categorias), [categorias])

  const filteredCats = useMemo(() => {
    if (!search && !showOnlyAtivo) return categorias
    return categorias.filter(c => {
      if (showOnlyAtivo && !c.ativo) return false
      if (search) {
        const s = search.toLowerCase()
        return c.conta.toLowerCase().includes(s) || c.nomeSci.toLowerCase().includes(s) || c.nomeExibicao.toLowerCase().includes(s)
      }
      return true
    })
  }, [categorias, search, showOnlyAtivo])

  function toggleExpand(conta: string) {
    setExpanded(prev => { const n = new Set(prev); if (n.has(conta)) n.delete(conta); else n.add(conta); return n })
  }

  function expandAll() {
    setExpanded(new Set(categorias.filter(c => tree.children.has(c.conta)).map(c => c.conta)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  function updateCat(conta: string, patch: Partial<Categoria>) {
    setCategorias(prev => prev.map(c => c.conta === conta ? { ...c, ...patch } : c))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await (trpc.cliente as any).biSaveCategorias.mutate({
        clienteId,
        categorias: categorias.map(c => ({
          conta: c.conta, nomeSci: c.nomeSci, nomeExibicao: c.nomeExibicao,
          parentConta: c.parentConta, nivel: c.nivel, ordem: c.ordem,
          tipo: c.tipo, ativo: c.ativo,
        })),
      })
      setDirty(false)
      await alerts.success('Salvo', 'Categorias do balancete atualizadas.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSaving(false) }
  }

  async function handleDeleteCat(conta: string) {
    const ok = await alerts.confirmDelete(`a conta ${conta}`)
    if (!ok) return
    try {
      await (trpc.cliente as any).biDeleteCategoria.mutate({ clienteId, conta })
      setCategorias(prev => prev.filter(c => c.conta !== conta))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleAddCategory() {
    const conta = prompt('Codigo da conta (ex: 99.01):')
    if (!conta) return
    const nome = prompt('Nome de exibicao:') || conta
    setCategorias(prev => [...prev, {
      id: '', conta, nomeSci: '', nomeExibicao: nome,
      parentConta: null, nivel: conta.split('.').length,
      ordem: 0, tipo: 'calculada', ativo: true,
    }])
    setDirty(true)
  }

  async function handleGetLink() {
    try {
      const result = await (trpc.cliente as any).biGetLink.query({ clienteId })
      setLinkToken(result.token)
      await navigator.clipboard?.writeText(`${window.location.origin}/bi/${result.token}`)
      await alerts.success('Link copiado', 'O link publico do BI foi copiado para a area de transferencia.')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Render tree recursively
  function renderNode(cat: Categoria, depth: number): React.ReactNode {
    const hasChildren = tree.children.has(cat.conta) && (tree.children.get(cat.conta)?.length ?? 0) > 0
    const isExpanded = expanded.has(cat.conta)
    const childNodes = isExpanded ? (tree.children.get(cat.conta) || []) : []

    // If searching, show all
    if (search && !filteredCats.find(c => c.conta === cat.conta)) return null

    return (
      <div key={cat.conta}>
        <div className={cn(
          'flex items-center gap-1.5 border-b border-border/30 hover:bg-muted/30 transition-colors group',
          !cat.ativo && 'opacity-40',
          depth === 0 && 'bg-muted/10 font-medium',
        )} style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          {/* Expand toggle */}
          <button type="button" onClick={() => hasChildren && toggleExpand(cat.conta)}
            className={cn('shrink-0 w-5 h-5 flex items-center justify-center rounded', hasChildren ? 'hover:bg-muted cursor-pointer' : 'invisible')}>
            {hasChildren && (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
          </button>

          {/* Conta */}
          <span className="shrink-0 w-[80px] font-mono text-[11px] text-muted-foreground">{cat.conta}</span>

          {/* Nome SCI */}
          <span className="shrink-0 w-[160px] text-[11px] text-muted-foreground truncate" title={cat.nomeSci}>{cat.nomeSci || '--'}</span>

          {/* Nome exibicao (editavel) */}
          <input
            type="text"
            value={cat.nomeExibicao}
            onChange={e => updateCat(cat.conta, { nomeExibicao: e.target.value })}
            className="flex-1 min-w-0 text-[11px] bg-transparent border-0 px-1 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 rounded"
            title="Nome de exibicao"
          />

          {/* Ordem */}
          <input
            type="number"
            value={cat.ordem}
            onChange={e => updateCat(cat.conta, { ordem: Number(e.target.value) })}
            className="shrink-0 w-[50px] text-[10px] text-center bg-transparent border border-border/30 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            title="Ordem"
          />

          {/* Tipo */}
          <span className={cn(
            'shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold',
            cat.tipo === 'real' ? 'bg-sky-100 text-sky-700' : cat.tipo === 'calculada' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700',
          )} title={cat.tipo}>
            {cat.tipo === 'real' ? 'R' : cat.tipo === 'calculada' ? 'C' : 'F'}
          </span>

          {/* Ativo (No BI) */}
          <Checkbox
            checked={cat.ativo}
            onCheckedChange={v => updateCat(cat.conta, { ativo: !!v })}
            className="shrink-0"
          />

          {/* Delete */}
          <button type="button" onClick={() => handleDeleteCat(cat.conta)}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Children */}
        {isExpanded && childNodes.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  if (loading) {
    return (
      <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando balancete...
      </Card>
    )
  }

  const roots = getRootNodes(tree.children)

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-5 py-3">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-600" /> BI — Contas do Balancete
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {categorias.length} contas | {periodos.length} periodo(s) importado(s)
            {dirty && <span className="ml-2 text-amber-600 font-medium">Alteracoes nao salvas</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button" variant="outline" size="sm" className="gap-1 text-[11px]" title="Versão expandida"
            onClick={() => {
              const doc = documento || ''
              window.open(`/bi-categorias-balancete?cliente=${doc}`, '_blank')
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Versão expandida
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleGetLink} className="gap-1" title="Link publico do BI">
            <Link2 className="h-3.5 w-3.5" /> Link BI
          </Button>
          {canManageFiscal && <Button type="button" variant="outline" size="sm" onClick={handleAddCategory} className="gap-1" title="Criar categoria virtual">
            <Plus className="h-3.5 w-3.5" />
          </Button>}
          {canManageFiscal && <Button type="button" variant="success" size="sm" onClick={handleSave} disabled={saving || !dirty} className="gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border/40 bg-muted/10">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conta ou nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 text-[11px] pl-7"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={expandAll}>Expandir</Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={collapseAll}>Recolher</Button>
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
          <Checkbox checked={showOnlyAtivo} onCheckedChange={v => setShowOnlyAtivo(!!v)} className="h-3 w-3" />
          Apenas marcadas
        </label>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={fetchData}>
          <RefreshCw className="h-3 w-3" /> Recarregar
        </Button>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-1.5 px-5 py-1.5 border-b border-border/60 bg-muted/30 text-[10px] text-muted-foreground font-medium">
        <span className="w-5" />
        <span className="w-[80px]">Conta</span>
        <span className="w-[160px]">Nome (SCI)</span>
        <span className="flex-1">Nome exibido</span>
        <span className="w-[50px] text-center">Ordem</span>
        <span className="w-[18px] text-center">T</span>
        <span className="w-[16px] text-center">BI</span>
        <span className="w-[20px]" />
      </div>

      {/* Tree */}
      <div className="max-h-[500px] overflow-y-auto">
        {categorias.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calculator className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma conta cadastrada.</p>
            <p className="text-xs mt-1">Importe dados do SCI para popular o balancete.</p>
          </div>
        ) : search ? (
          // Flat search results
          filteredCats.map(cat => renderNode(cat, 0))
        ) : (
          // Tree view
          roots.map(root => renderNode(root, 0))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 bg-muted/20 px-5 py-2.5 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {categorias.filter(c => c.ativo).length} contas ativas de {categorias.length} total
        </p>
        {periodos.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Periodos: {periodos.map(p => p.periodo).join(', ')}
          </p>
        )}
      </div>
    </Card>
  )
}
