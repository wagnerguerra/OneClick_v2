'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Loader2, Save, ChevronDown, ChevronRight, Plus, Trash2, Calculator,
  RefreshCw, Copy, Eraser, Download, Upload, ChevronsDown, ChevronsUp,
  MoreHorizontal, BarChart3, FolderTree, Link2, Building2, ChevronsUpDown, Check,
} from 'lucide-react'
import { Command } from 'cmdk'
import {
  Button, Input, Card, CardHeader, Label,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import Swal from 'sweetalert2'

/* ---------- types ---------- */
interface ClienteOption {
  id: string
  razaoSocial: string
  documento: string
  nomeFantasia?: string | null
}

interface Categoria {
  conta: string
  nomeSci: string
  nomeExibido: string
  parentConta: string | null
  nivel: number
  ordem: number
  tipo: 'R' | 'C' | 'F' | string
  ativo: boolean
  formula?: unknown
}

const MODULE_COLOR = 'var(--mod-contabil, #8b5cf6)'
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  R: { label: 'Real', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  C: { label: 'Calculada', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  F: { label: 'Formula', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
}

const formatCnpj = (doc: string) =>
  doc.length === 14
    ? doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : doc.length === 11
      ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : doc

/* ============================== FORMULA MODAL ============================== */
const OP_LABELS: Record<string, string> = { soma: '+ soma', subtracao: '− subtrair', multiplicacao: '× mult.', divisao: '÷ dividir' }
const OP_SYMBOLS: Record<string, string> = { soma: '+', subtracao: '−', multiplicacao: '×', divisao: '÷' }

function FormulaModal({ conta, nome, categorias, currentFormula, onSave, onClose }: {
  conta: string
  nome: string
  categorias: Array<{ conta: string; nomeSci: string; nomeExibido: string }>
  currentFormula: unknown
  onSave: (formula: unknown) => void
  onClose: () => void
}) {
  const parsed = (currentFormula && typeof currentFormula === 'object') ? currentFormula as Record<string, unknown> : null
  const [operandos, setOperandos] = useState<string[]>(() => {
    if (parsed && Array.isArray(parsed.operandos)) return (parsed.operandos as string[]).filter(Boolean)
    return []
  })
  const [operadores, setOperadores] = useState<string[]>(() => {
    if (parsed && Array.isArray(parsed.operadores)) return parsed.operadores as string[]
    if (parsed && typeof parsed.operacao === 'string' && operandos.length >= 2) return Array(operandos.length - 1).fill(parsed.operacao === 'subtracao' ? 'subtracao' : 'soma')
    return []
  })
  const [busca, setBusca] = useState('')

  const availableCats = categorias.filter(c => c.conta !== conta)
  const filteredCats = busca.trim()
    ? availableCats.filter(c => {
        const q = busca.toLowerCase()
        return (c.conta || '').toLowerCase().includes(q) || (c.nomeSci || '').toLowerCase().includes(q) || (c.nomeExibido || '').toLowerCase().includes(q)
      })
    : availableCats

  const addOperando = (cId: string) => {
    if (operandos.includes(cId)) return
    setOperandos(prev => [...prev, cId])
    if (operandos.length >= 1) setOperadores(prev => [...prev, 'soma'])
  }

  const removeOperando = (idx: number) => {
    setOperandos(prev => { const n = [...prev]; n.splice(idx, 1); return n })
    setOperadores(prev => {
      const n = [...prev]
      if (operandos.length <= 1) return []
      if (idx === 0) n.shift()
      else if (idx >= operandos.length - 1) n.pop()
      else { n.splice(idx - 1, 2, 'soma') }
      return n
    })
  }

  const moveOperando = (idx: number, dir: 'up' | 'down') => {
    const newOps = [...operandos]
    const newOpers = [...operadores]
    if (dir === 'up' && idx > 0) {
      [newOps[idx - 1], newOps[idx]] = [newOps[idx]!, newOps[idx - 1]!]
    } else if (dir === 'down' && idx < newOps.length - 1) {
      [newOps[idx], newOps[idx + 1]] = [newOps[idx + 1]!, newOps[idx]!]
    }
    setOperandos(newOps)
    setOperadores(newOpers)
  }

  const updateOperador = (idx: number, val: string) => {
    setOperadores(prev => { const n = [...prev]; n[idx] = val; return n })
  }

  const handleSave = () => {
    if (operandos.length === 0) { alert('Adicione pelo menos uma conta à fórmula.'); return }
    if (operandos.length === 1) {
      onSave({ operacao: 'igualdade', operandos: [operandos[0]] })
    } else {
      const ops = [...operadores]
      while (ops.length < operandos.length - 1) ops.push('soma')
      ops.length = operandos.length - 1
      onSave({ operacao: 'cadeia', operandos: [...operandos], operadores: ops })
    }
  }

  const getNome = (cId: string) => {
    const cat = categorias.find(c => c.conta === cId)
    return cat ? (cat.nomeSci || cat.nomeExibido || cId) : cId
  }

  // Preview
  const preview = operandos.length === 0 ? '—'
    : operandos.length === 1 ? `[${operandos[0]}] → igual a esta conta`
    : operandos.map((op, i) => {
        const sym = i > 0 ? ` ${OP_SYMBOLS[operadores[i - 1] || 'soma'] || '+'} ` : ''
        return `${sym}[${op}]`
      }).join('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg border bg-background shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Editar fórmula</h3>
            <p className="text-xs text-muted-foreground">{nome}</p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4 max-h-[70vh] overflow-y-auto">
          {/* Instruções */}
          <div className="rounded-md border p-3">
            <p className="text-xs font-semibold mb-1">Operações entre contas</p>
            <p className="text-[11px] text-muted-foreground">Para cada conta após a primeira, escolha <strong>+ − × ÷</strong> antes dela. Ex.: <code>receita</code> <strong>−</strong> <code>deduções</code> <strong>+</strong> <code>outra</code>.</p>
          </div>

          {/* Preview */}
          <div className="rounded-md border p-3">
            <p className="text-xs font-semibold mb-1">Prévia</p>
            <div className="rounded bg-muted/50 px-3 py-2 text-center font-mono text-xs min-h-[36px] flex items-center justify-center">
              {preview}
            </div>
          </div>

          {/* Operandos ordenados */}
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold">Contas na fórmula</p>
              <button type="button" onClick={() => { setOperandos([]); setOperadores([]) }} className="text-[11px] text-red-500 hover:underline">Limpar lista</button>
            </div>
            {operandos.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Use <strong>+ Adicionar</strong> abaixo.</p>
            ) : (
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {operandos.map((cId, i) => (
                  <div key={`${cId}-${i}`} className="flex items-center gap-2 rounded border bg-background px-2 py-1.5">
                    {i > 0 && (
                      <select
                        value={operadores[i - 1] || 'soma'}
                        onChange={e => updateOperador(i - 1, e.target.value)}
                        className="h-6 rounded border border-input bg-background px-1 text-[11px] font-semibold shrink-0 w-[5.5rem]"
                      >
                        {Object.entries(OP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    )}
                    {i === 0 && <span className="w-[5.5rem] shrink-0" />}
                    <span className="inline-flex items-center justify-center rounded bg-violet-100 text-violet-700 px-1.5 text-[10px] font-bold shrink-0">{i + 1}</span>
                    <span className="flex-1 text-xs truncate"><code>{cId}</code> <span className="text-muted-foreground">{getNome(cId)}</span></span>
                    <button type="button" onClick={() => moveOperando(i, 'up')} disabled={i === 0} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => moveOperando(i, 'down')} disabled={i >= operandos.length - 1} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => removeOperando(i)} className="text-xs text-red-500 hover:text-red-700">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Adicionar contas */}
          <div className="rounded-md border p-3">
            <p className="text-xs font-semibold mb-2">Adicionar contas</p>
            <input
              type="text"
              placeholder="Buscar código ou nome..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="mb-2 flex h-7 w-full rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-0.5">
              {filteredCats.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-muted-foreground">Nenhuma categoria encontrada.</p>
              ) : filteredCats.map(c => {
                const inFormula = operandos.includes(c.conta)
                return (
                  <div key={c.conta} className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50">
                    <span className="text-xs truncate"><code>{c.conta}</code> <span className="text-muted-foreground">{c.nomeSci || c.nomeExibido || ''}</span></span>
                    {inFormula ? (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">na fórmula</span>
                    ) : (
                      <button type="button" onClick={() => addOperando(c.conta)} className="text-[11px] font-medium shrink-0 rounded px-2 py-0.5" style={{ color: MODULE_COLOR }}>+ Adicionar</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          <Button type="button" size="sm" onClick={handleSave} style={{ backgroundColor: MODULE_COLOR }} className="text-white hover:opacity-90">Salvar</Button>
        </div>
      </div>
    </div>
  )
}

/* ============================== PAI SELECT (cmdk inline) ============================== */
function PaiSelect({ value, options, excludeConta, onChange }: {
  value: string | null
  options: Array<{ conta: string; nomeSci: string; nomeExibido: string }>
  excludeConta: string
  onChange: (val: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = value || '—'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex h-7 w-full items-center justify-between rounded-md border border-input bg-background px-2 font-mono text-xs',
          'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          !value && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[320px] rounded-lg border bg-popover shadow-lg">
          <Command className="rounded-lg" shouldFilter={true}>
            <Command.Input
              placeholder="Buscar conta..."
              className="w-full border-b border-border bg-transparent px-3 py-2 text-xs outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="max-h-[200px] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                Nenhuma conta encontrada
              </Command.Empty>
              <Command.Item
                value="__nenhum__ raiz nenhum"
                onSelect={() => { onChange(null); setOpen(false) }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:!bg-violet-500 hover:!text-white',
                  !value && 'font-semibold',
                )}
                style={{ background: 'transparent', color: 'inherit' }}
              >
                <span>—</span> Nenhum (raiz)
              </Command.Item>
              {options.filter(c => c.conta !== excludeConta).map(c => (
                <Command.Item
                  key={c.conta}
                  value={`${c.conta} ${c.nomeSci || ''} ${c.nomeExibido || ''}`}
                  onSelect={() => { onChange(c.conta); setOpen(false) }}
                  className={cn(
                    'pai-select-item flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:!bg-violet-500 hover:!text-white',
                    c.conta === value && 'font-semibold',
                  )}
                  style={{ background: 'transparent', color: 'inherit' }}
                >
                  <span className="font-mono shrink-0">{c.conta}</span>
                  <span className="truncate text-muted-foreground pai-select-sub">{c.nomeSci || c.nomeExibido || ''}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  )
}

/* ============================== PAGE ============================== */
export default function BiCategoriasBalancetePage() {
  const searchParams = useSearchParams()
  const clienteParam = searchParams.get('cliente')

  /* --- state --- */
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [clienteId, setClienteId] = useState<string>('')
  const [comboOpen, setComboOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)
  const [year, setYear] = useState(CURRENT_YEAR)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [apenasNoBi, setApenasNoBi] = useState(false)
  const [formulaModal, setFormulaModal] = useState<{ conta: string; nome: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  /* --- load clients --- */
  useEffect(() => {
    trpc.cliente.listForSelect.query()
      .then((list: ClienteOption[]) => {
        setClientes(list)
        if (clienteParam) {
          const found = list.find(
            (c) => c.id === clienteParam || c.documento === clienteParam || c.documento.replace(/\D/g, '') === clienteParam.replace(/\D/g, ''),
          )
          if (found) setClienteId(found.id)
        }
      })
      .catch(() => alerts.error('Erro', 'Falha ao carregar clientes'))
  }, [clienteParam])

  /* --- load categories when client changes --- */
  const loadCategorias = useCallback(async () => {
    if (!clienteId) return
    setLoading(true)
    try {
      const data = await trpc.cliente.biListCategorias.query({ clienteId })
      setCategorias(data as Categoria[])
      setDirty(false)
      setSelected(new Set())
      // Iniciar com todas as contas contraídas
      setExpanded(new Set())
    } catch {
      alerts.error('Erro', 'Falha ao carregar categorias')
      setCategorias([])
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { loadCategorias() }, [loadCategorias])

  /* --- warn on leave with unsaved changes --- */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  /* --- derived --- */
  const selectedCliente = clientes.find((c) => c.id === clienteId)
  const selectedDocumento = selectedCliente?.documento ?? ''

  // Fechar combobox ao clicar fora
  useEffect(() => {
    if (!comboOpen) return
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [comboOpen])

  /* --- tree helpers --- */

  // Build enriched tree: recalculate parentConta, nivel, childrenMap, and tree-order sort
  const { treeItems, childrenMap } = useMemo(() => {
    const contaSet = new Set(categorias.map((c) => c.conta))

    // Enrich each category with derived parent and level
    const enriched = categorias.map((c) => {
      const parts = c.conta.split('.')
      const nivel = parts.length
      // Walk up the hierarchy to find the nearest existing parent
      let parentConta: string | null = null
      for (let i = parts.length - 1; i >= 1; i--) {
        const candidate = parts.slice(0, i).join('.')
        if (contaSet.has(candidate)) {
          parentConta = candidate
          break
        }
      }
      return { ...c, parentConta, nivel }
    })

    // Build children map
    const cMap = new Map<string | null, string[]>()
    enriched.forEach((c) => {
      const p = c.parentConta
      if (!cMap.has(p)) cMap.set(p, [])
      cMap.get(p)!.push(c.conta)
    })

    // Sort children naturally within each parent group
    for (const [, children] of cMap) {
      children.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }

    // Build tree-order list (DFS)
    const byKey = new Map(enriched.map((c) => [c.conta, c]))
    const ordered: typeof enriched = []
    function walk(parentKey: string | null) {
      const children = cMap.get(parentKey) ?? []
      for (const childKey of children) {
        const item = byKey.get(childKey)
        if (item) {
          ordered.push(item)
          walk(childKey)
        }
      }
    }
    walk(null)

    // Add any orphans not reached by the tree walk (safety net)
    const inTree = new Set(ordered.map((c) => c.conta))
    for (const c of enriched) {
      if (!inTree.has(c.conta)) ordered.push(c)
    }

    return { treeItems: ordered, childrenMap: cMap }
  }, [categorias])

  const hasChildren = useCallback(
    (conta: string) => (childrenMap.get(conta)?.length ?? 0) > 0,
    [childrenMap],
  )

  const getAllDescendants = useCallback(
    (conta: string): string[] => {
      const children = childrenMap.get(conta) ?? []
      return children.flatMap((c) => [c, ...getAllDescendants(c)])
    },
    [childrenMap],
  )

  // Determine visibility: a node is visible if all its ancestors are expanded
  // Set of contas that match the search (for highlighting)
  const matchSet = useMemo(() => {
    if (!search) return new Set<string>()
    const q = search.toLowerCase()
    return new Set(
      treeItems
        .filter((c) => (c.conta || '').toLowerCase().includes(q) || (c.nomeSci || '').toLowerCase().includes(q) || (c.nomeExibido || '').toLowerCase().includes(q))
        .map((c) => c.conta),
    )
  }, [treeItems, search])

  // Expand ancestors of matches + scroll to first match
  const executeSearch = useCallback(() => {
    if (!search.trim()) return

    const q = search.toLowerCase()
    const matches = treeItems.filter((c) =>
      (c.conta || '').toLowerCase().includes(q) || (c.nomeSci || '').toLowerCase().includes(q) || (c.nomeExibido || '').toLowerCase().includes(q),
    )
    if (matches.length === 0) return

    // Auto-expand all ancestors of matches
    const byKey = new Map(treeItems.map((c) => [c.conta, c]))
    const toExpand = new Set(expanded)
    for (const match of matches) {
      let current = match.parentConta ? byKey.get(match.parentConta) : undefined
      while (current) {
        toExpand.add(current.conta)
        current = current.parentConta ? byKey.get(current.parentConta) : undefined
      }
    }
    setExpanded(toExpand)

    // Scroll to first match after render
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-match="true"]')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [treeItems, expanded, search])

  // Determine visibility: based on expand/collapse or "Apenas No BI" filter
  const visibleCategorias = useMemo(() => {
    // Modo "Apenas No BI": lista flat de todas as contas ativas, sem hierarquia
    if (apenasNoBi) {
      return treeItems.filter((cat) => cat.ativo)
    }

    // Modo normal: respeita expand/collapse da árvore
    const byKey = new Map(treeItems.map((c) => [c.conta, c]))
    return treeItems.filter((cat) => {
      if (!cat.parentConta) return true
      let current = byKey.get(cat.parentConta)
      while (current) {
        if (!expanded.has(current.conta)) return false
        current = current.parentConta ? byKey.get(current.parentConta) : undefined
      }
      return true
    })
  }, [treeItems, expanded, apenasNoBi])

  /* --- mutations --- */
  const updateField = (conta: string, field: keyof Categoria, value: unknown) => {
    setCategorias((prev) => prev.map((c) => (c.conta === conta ? { ...c, [field]: value } : c)))
    setDirty(true)
  }

  const toggleExpand = (conta: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(conta)) n.delete(conta); else n.add(conta); return n })
  }
  const expandAll = () => setExpanded(new Set(treeItems.filter((c) => hasChildren(c.conta)).map((c) => c.conta)))
  const collapseAll = () => setExpanded(new Set())

  const toggleSelect = (conta: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(conta)) { next.delete(conta); getAllDescendants(conta).forEach((d) => next.delete(d)) }
      else { next.add(conta); getAllDescendants(conta).forEach((d) => next.add(d)) }
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selected.size === visibleCategorias.length) setSelected(new Set())
    else setSelected(new Set(visibleCategorias.map((c) => c.conta)))
  }

  /* --- actions --- */
  const handleSave = async () => {
    if (!clienteId) return
    setSaving(true)
    try {
      await trpc.cliente.biSaveCategorias.mutate({ clienteId, categorias })
      setDirty(false)
      alerts.success('Salvo', 'Categorias salvas com sucesso')
    } catch { alerts.error('Erro', 'Falha ao salvar categorias') }
    finally { setSaving(false) }
  }

  const handleDeleteSelected = async () => {
    if (!clienteId || selected.size === 0) return
    const ok = await alerts.confirm({ title: 'Excluir selecionadas', text: `Deseja excluir ${selected.size} categoria(s)?`, icon: 'warning', confirmText: 'Sim, excluir' })
    if (!ok) return
    try {
      for (const conta of selected) { await trpc.cliente.biDeleteCategoria.mutate({ clienteId, conta }) }
      setCategorias((prev) => prev.filter((c) => !selected.has(c.conta)))
      setSelected(new Set()); setDirty(false)
      alerts.success('Excluidas', `${selected.size} categoria(s) removida(s)`)
    } catch { alerts.error('Erro', 'Falha ao excluir categorias') }
  }

  const handleCreateCategoria = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Nova Categoria', html: `<input id="swal-conta" class="swal2-input" placeholder="Conta (ex: 1.01)"><input id="swal-nome" class="swal2-input" placeholder="Nome exibido"><select id="swal-tipo" class="swal2-select" style="margin-top:8px"><option value="R">Real</option><option value="C">Calculada</option><option value="F">Formula</option></select>`,
      focusConfirm: false, showCancelButton: true, confirmButtonColor: MODULE_COLOR, cancelButtonColor: '#6b7280', confirmButtonText: 'Criar', cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const conta = (document.getElementById('swal-conta') as HTMLInputElement).value.trim()
        const nome = (document.getElementById('swal-nome') as HTMLInputElement).value.trim()
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        if (!conta || !nome) { Swal.showValidationMessage('Conta e nome são obrigatórios'); return null }
        return { conta, nome, tipo }
      },
    })
    if (!formValues) return
    setCategorias((prev) => [...prev, { conta: formValues.conta, nomeSci: formValues.nome, nomeExibido: formValues.nome, parentConta: null, nivel: formValues.conta.split('.').length - 1, ordem: categorias.length + 1, tipo: formValues.tipo as 'R' | 'C' | 'F', ativo: true }])
    setDirty(true)
  }

  const handleCopiar = async () => {
    if (!selectedDocumento || !selectedCliente) return

    // Filtrar clientes destino: apenas MENSAL, excluindo o atual
    const destinos = clientes.filter(c => c.id !== clienteId)

    if (destinos.length === 0) {
      alerts.warning('Sem clientes', 'Não há outros clientes disponíveis para copiar.')
      return
    }

    // Pré-formatar CNPJs para evitar chamar formatCnpj dentro de strings
    const destinosFormatados = destinos.map(c => ({
      ...c,
      cnpjFormatado: formatCnpj(c.documento),
      searchStr: `${c.razaoSocial} ${c.documento}`.toLowerCase(),
    }))

    const result = await Swal.fire({
      title: 'Copiar Configuração de Categorias',
      html: `
        <div style="text-align:left;font-size:13px;">
          <p><strong>Cliente Origem:</strong><br>${selectedCliente.razaoSocial} (${formatCnpj(selectedDocumento)})</p>
          <hr style="margin:12px 0;">
          <p style="margin-bottom:8px;"><strong>Selecione o cliente de destino:</strong></p>
          <input type="text" id="swalBuscaCopiar" placeholder="Buscar cliente por nome ou CNPJ..." style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:8px;outline:none;" autocomplete="off" />
          <input type="hidden" id="swalCopiarDoc" value="" />
          <div id="swalCopiarLista" style="height:220px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;"></div>
          <div id="swalCopiarSelecionado" style="margin-top:6px;font-size:12px;color:#8b5cf6;font-weight:600;min-height:18px;"></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:4px;">Mostrando apenas clientes com situação MENSAL</p>
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:10px 12px;margin-top:12px;font-size:12px;">
            <strong>Esta ação irá:</strong>
            <ul style="margin:4px 0 0 16px;padding:0;">
              <li>Copiar todas as personalizações (nomes, pais, ordens)</li>
              <li>Copiar todas as exclusões e categorias virtuais</li>
              <li><strong style="color:#dc2626;">Substituir</strong> a configuração atual do cliente destino</li>
            </ul>
          </div>
        </div>
      `,
      width: 600,
      showCancelButton: true,
      confirmButtonColor: MODULE_COLOR,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Copiar',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const input = document.getElementById('swalBuscaCopiar') as HTMLInputElement
        const lista = document.getElementById('swalCopiarLista') as HTMLDivElement
        const hiddenDoc = document.getElementById('swalCopiarDoc') as HTMLInputElement
        const selLabel = document.getElementById('swalCopiarSelecionado') as HTMLDivElement
        let selectedDoc = ''

        function render(filtro: string) {
          const q = filtro.toLowerCase()
          const filtered = q ? destinosFormatados.filter(c => c.searchStr.includes(q)) : destinosFormatados

          if (filtered.length === 0) {
            lista.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">Nenhum cliente encontrado</div>'
            return
          }

          lista.innerHTML = filtered.map(c => {
            const isSelected = c.documento === selectedDoc
            return `<div data-doc="${c.documento}" style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:12px;display:flex;justify-content:space-between;align-items:center;${isSelected ? 'background:#8b5cf6;color:#fff;font-weight:600;' : ''}">`
              + `<span>${c.razaoSocial}</span>`
              + `<span style="font-size:10px;font-family:monospace;opacity:0.7;">${c.cnpjFormatado}</span>`
              + `</div>`
          }).join('')
        }

        // Event delegation — click na lista
        lista.addEventListener('click', (e) => {
          const item = (e.target as HTMLElement).closest('[data-doc]') as HTMLElement | null
          if (!item) return
          selectedDoc = item.getAttribute('data-doc') || ''
          hiddenDoc.value = selectedDoc
          const c = destinosFormatados.find(x => x.documento === selectedDoc)
          selLabel.textContent = c ? `Selecionado: ${c.razaoSocial}` : ''
          render(input.value)
        })

        // Hover via CSS injection
        const style = document.createElement('style')
        style.textContent = '#swalCopiarLista [data-doc]:hover { background: #8b5cf6 !important; color: #fff !important; }'
        document.head.appendChild(style)

        // Busca
        input.addEventListener('input', () => render(input.value))
        input.focus()

        // Render inicial
        render('')
      },
      preConfirm: () => {
        const hiddenDoc = document.getElementById('swalCopiarDoc') as HTMLInputElement
        if (!hiddenDoc?.value) { Swal.showValidationMessage('Clique em um cliente da lista para selecioná-lo'); return false }
        return hiddenDoc.value
      },
    })

    if (!result.isConfirmed || !result.value) return
    const documentoDestino = result.value as string
    const clienteDestino = destinos.find(c => c.documento === documentoDestino)

    // Confirmação final
    const confirma = await alerts.confirm({
      title: 'Confirmar Cópia',
      text: `Copiar configuração de "${selectedCliente.razaoSocial}" para "${clienteDestino?.razaoSocial || documentoDestino}"? A configuração atual do destino será substituída!`,
      icon: 'warning',
      confirmText: 'Sim, copiar',
    })
    if (!confirma) return

    try {
      const res = await (trpc.bi as any).categoriasCopiar.mutate({ documentoOrigem: selectedDocumento, documentoDestino })
      alerts.success('Configuração Copiada!', `${res.copied ?? 0} categoria(s) copiada(s) com sucesso.`)
    } catch (e) {
      alerts.error('Erro ao Copiar', (e as Error).message || 'Erro desconhecido')
    }
  }

  const handleLimpar = async () => {
    if (!selectedDocumento) return
    const ok = await alerts.confirm({ title: 'Limpar personalizações', text: 'Isso irá reverter todas as categorias para o padrão. Deseja continuar?', icon: 'warning', confirmText: 'Sim, limpar' })
    if (!ok) return
    try { await trpc.bi.categoriasLimpar.mutate({ documento: selectedDocumento }); await loadCategorias(); alerts.success('Limpo', 'Personalizações removidas') }
    catch { alerts.error('Erro', 'Falha ao limpar personalizações') }
  }

  const handleExportBackup = async () => {
    if (!selectedDocumento) return
    try {
      const data = await trpc.bi.categoriasBackup.query({ documento: selectedDocumento })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `bi-categorias-${selectedDocumento}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
      alerts.success('Exportado', 'Backup salvo com sucesso')
    } catch { alerts.error('Erro', 'Falha ao exportar backup') }
  }

  const handleImportBackup = () => fileInputRef.current?.click()
  const onFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !selectedDocumento) return
    try {
      const text = await file.text(); const parsed = JSON.parse(text)

      // Detectar formato: backup completo SERPRO2 (tem linhas + categorias + version) vs só categorias
      const isBackupCompleto = parsed.version && (parsed.linhas || parsed.consultas)

      if (isBackupCompleto) {
        const result = await (trpc.bi as any).importarBackupCompleto.mutate({ documento: selectedDocumento, backup: parsed })
        await loadCategorias()
        alerts.success('Backup importado', `${result.restoredCats} categorias, ${result.importedLinhas} linhas e ${result.importedConsultas ?? 0} consulta(s) importadas.`)
      } else {
        // Formato simples: array de categorias ou { categorias: [...] }
        const cats = Array.isArray(parsed) ? parsed : parsed.categorias ?? parsed.data ?? []
        await (trpc.bi as any).categoriasRestaurar.mutate({ documento: selectedDocumento, categorias: cats })
        await loadCategorias()
        alerts.success('Importado', 'Backup restaurado com sucesso')
      }
    } catch (err) {
      console.error('Import error:', err)
      alerts.error('Erro', 'Falha ao importar backup. Verifique o formato do arquivo.')
    }
    finally { e.target.value = '' }
  }

  const handleImportarBalancete = async () => {
    if (!clienteId) return
    const now = new Date()
    const curYear = now.getFullYear()
    const curMonth = now.getMonth() + 1

    const mesesOpts = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === 1 ? 'selected' : ''}>${String(i + 1).padStart(2, '0')}</option>`).join('')
    const mesesOptsFim = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === curMonth ? 'selected' : ''}>${String(i + 1).padStart(2, '0')}</option>`).join('')
    const anosOpts = Array.from({ length: 6 }, (_, i) => `<option value="${curYear - i}" ${i === 0 ? 'selected' : ''}>${curYear - i}</option>`).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Importar Balancete do SCI',
      html: `
        <div style="text-align:left;font-size:13px;">
          <div style="display:flex;gap:12px;margin-bottom:12px;">
            <div style="flex:1">
              <label style="font-weight:600;font-size:11px;text-transform:uppercase;color:#6b7280;">Período De</label>
              <div style="display:flex;gap:6px;margin-top:4px;">
                <select id="swal-mesInicio" class="swal2-select" style="flex:1;padding:6px">${mesesOpts}</select>
                <select id="swal-anoInicio" class="swal2-select" style="flex:1;padding:6px">${anosOpts}</select>
              </div>
            </div>
            <div style="flex:1">
              <label style="font-weight:600;font-size:11px;text-transform:uppercase;color:#6b7280;">Período Até</label>
              <div style="display:flex;gap:6px;margin-top:4px;">
                <select id="swal-mesFim" class="swal2-select" style="flex:1;padding:6px">${mesesOptsFim}</select>
                <select id="swal-anoFim" class="swal2-select" style="flex:1;padding:6px">${anosOpts}</select>
              </div>
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:8px;">
            <input type="checkbox" id="swal-substituir" checked style="width:16px;height:16px;accent-color:${MODULE_COLOR}">
            <span>Substituir contas e valores existentes</span>
          </label>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px;">
            Se desmarcado, apenas contas/valores novos são adicionados. Personalizações do BI não são alteradas.
          </p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: MODULE_COLOR,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Importar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const mesInicio = Number((document.getElementById('swal-mesInicio') as HTMLSelectElement).value)
        const anoInicio = Number((document.getElementById('swal-anoInicio') as HTMLSelectElement).value)
        const mesFim = Number((document.getElementById('swal-mesFim') as HTMLSelectElement).value)
        const anoFim = Number((document.getElementById('swal-anoFim') as HTMLSelectElement).value)
        const substituir = (document.getElementById('swal-substituir') as HTMLInputElement).checked

        const refIni = anoInicio * 100 + mesInicio
        const refFim = anoFim * 100 + mesFim
        if (refFim < refIni) {
          Swal.showValidationMessage('O período "Até" deve ser igual ou posterior ao "De"')
          return null
        }
        return { anoInicio, mesInicio, anoFim, mesFim, substituir, refIni, refFim }
      },
    })

    if (!formValues) return

    // Iniciar importação
    try {
      const result = await (trpc.bi as any).balanceteRefreshPeriodo.mutate({
        clienteId,
        anoInicio: formValues.anoInicio,
        mesInicio: formValues.mesInicio,
        anoFim: formValues.anoFim,
        mesFim: formValues.mesFim,
        substituirExistentes: formValues.substituir,
      })

      if (result.started === false) {
        alerts.warning('Em andamento', 'Já existe uma importação em andamento para este período.')
        return
      }

      // Polling de progresso
      const refIni = formValues.refIni
      const refFim = formValues.refFim

      await Swal.fire({
        title: 'Importando Balancete...',
        html: '<div id="swal-progress-text" style="font-size:13px;color:#6b7280;">Iniciando...</div><div id="swal-progress-log" style="max-height:200px;overflow-y:auto;font-family:monospace;font-size:11px;text-align:left;margin-top:12px;padding:8px;background:#f8f9fa;border-radius:6px;"></div>',
        allowOutsideClick: false,
        showConfirmButton: false,
        showCancelButton: false,
        didOpen: () => {
          Swal.showLoading()

          const poll = setInterval(async () => {
            try {
              const status = await (trpc.bi as any).balanceteRefreshStatusByRange.query({
                clienteId, refInicio: refIni, refFim: refFim,
              })

              const job = status.job
              if (!job) { clearInterval(poll); Swal.close(); return }

              const textEl = document.getElementById('swal-progress-text')
              const logEl = document.getElementById('swal-progress-log')
              if (textEl) textEl.textContent = job.message || 'Processando...'
              if (logEl && job.log) logEl.innerHTML = job.log.map((l: string) => `<div>${l}</div>`).join('')

              if (job.status === 'done' || job.status === 'error') {
                clearInterval(poll)
                Swal.close()

                const okCount = (job as any).ok ?? 0
                const failedCount = (job as any).failed ?? 0
                const skippedCount = (job as any).skipped ?? 0

                if (job.status === 'error' && okCount === 0) {
                  alerts.error('Falha na importação', `Nenhum mês importado. ${failedCount} falha(s).`)
                } else {
                  alerts.success('Importação concluída', `${okCount} importado(s), ${skippedCount} pulado(s), ${failedCount} falha(s)`)
                }

                // Recarregar categorias
                await loadCategorias()
              }
            } catch {
              // Ignore polling errors
            }
          }, 1500)
        },
      })
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Falha ao iniciar importação')
    }
  }

  const handleExcluirBalancete = async () => {
    if (!clienteId) return
    const now = new Date()
    const curYear = now.getFullYear()
    const curMonth = now.getMonth() + 1

    const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const mesesOpts = (sel: number) => Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${mesesNomes[i]}</option>`).join('')
    const anosOpts = (sel: number) => Array.from({ length: 6 }, (_, i) => `<option value="${curYear - i}" ${curYear - i === sel ? 'selected' : ''}>${curYear - i}</option>`).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Excluir Balancete',
      html: `
        <div style="text-align:left;font-size:13px;">
          <p style="color:#6b7280;margin-bottom:12px;">Remover dados do balancete do período selecionado (linhas e consultas do mês/ano).</p>
          <div style="display:flex;gap:12px;margin-bottom:12px;">
            <div style="flex:1">
              <label style="font-weight:600;font-size:11px;text-transform:uppercase;color:#6b7280;">De</label>
              <div style="display:flex;gap:6px;margin-top:4px;">
                <select id="swal-exc-mesDe" class="swal2-select" style="flex:1;padding:6px">${mesesOpts(1)}</select>
                <select id="swal-exc-anoDe" class="swal2-select" style="flex:1;padding:6px">${anosOpts(curYear)}</select>
              </div>
            </div>
            <div style="flex:1">
              <label style="font-weight:600;font-size:11px;text-transform:uppercase;color:#6b7280;">Até</label>
              <div style="display:flex;gap:6px;margin-top:4px;">
                <select id="swal-exc-mesAte" class="swal2-select" style="flex:1;padding:6px">${mesesOpts(curMonth)}</select>
                <select id="swal-exc-anoAte" class="swal2-select" style="flex:1;padding:6px">${anosOpts(curYear)}</select>
              </div>
            </div>
          </div>
          <p style="font-size:11px;color:#9ca3af;">As personalizações do BI (categorias, nomes, ordem) não são alteradas; apenas os dados importados do período são removidos.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const mesInicio = Number((document.getElementById('swal-exc-mesDe') as HTMLSelectElement).value)
        const anoInicio = Number((document.getElementById('swal-exc-anoDe') as HTMLSelectElement).value)
        const mesFim = Number((document.getElementById('swal-exc-mesAte') as HTMLSelectElement).value)
        const anoFim = Number((document.getElementById('swal-exc-anoAte') as HTMLSelectElement).value)
        const refIni = anoInicio * 100 + mesInicio
        const refFim = anoFim * 100 + mesFim
        if (refFim < refIni) { Swal.showValidationMessage('"Até" deve ser igual ou posterior a "De"'); return null }
        return { anoInicio, mesInicio, anoFim, mesFim }
      },
    })

    if (!formValues) return

    // Confirmação extra
    const deStr = `${mesesNomes[formValues.mesInicio - 1]}/${formValues.anoInicio}`
    const ateStr = `${mesesNomes[formValues.mesFim - 1]}/${formValues.anoFim}`
    const periodoStr = deStr === ateStr ? deStr : `${deStr} a ${ateStr}`

    const ok = await alerts.confirm({
      title: 'Confirmar exclusão',
      text: `Tem certeza que deseja excluir os dados do balancete de ${periodoStr}? Esta ação não pode ser desfeita.`,
      icon: 'warning',
      confirmText: 'Sim, excluir',
    })
    if (!ok) return

    try {
      const result = await (trpc.bi as any).balanceteExcluirPeriodo.mutate({
        clienteId,
        ano: formValues.anoInicio,
        mesInicio: formValues.mesInicio,
        mesFim: formValues.mesFim,
      })
      const total = (result as any)?.deletedLinhas ?? (result as any)?.deleted ?? 0
      alerts.success('Período excluído', `Dados de ${periodoStr} removidos. ${total} linha(s) excluída(s).`)
      await loadCategorias()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Falha ao excluir período do balancete')
    }
  }

  const handleLimparTudoCliente = async () => {
    if (!clienteId) return
    const nome = selectedCliente?.razaoSocial || 'este cliente'
    const ok = await alerts.confirm({
      title: 'Apagar TODOS os dados BI',
      text: `Isso irá remover permanentemente TODOS os dados do BI de "${nome}": linhas do balancete, categorias, cache, KPIs, regras e link público. Esta ação não pode ser desfeita.`,
      icon: 'warning',
      confirmText: 'Sim, apagar tudo',
    })
    if (!ok) return
    // Segunda confirmação
    const ok2 = await alerts.confirm({
      title: 'Tem certeza?',
      text: `Digite "CONFIRMAR" para prosseguir.`,
      icon: 'warning',
      confirmText: 'Apagar tudo',
    })
    if (!ok2) return
    try {
      const result = await (trpc.bi as any).limparTudoCliente.mutate({ clienteId })
      const total = (result.linhas || 0) + (result.categorias || 0) + (result.cache || 0)
      alerts.success('Dados removidos', `${result.linhas} linha(s), ${result.categorias} categoria(s), ${result.cache} cache(s), ${result.contasIgnoradas} regra(s) KPI, ${result.links} link(s) removidos.`)
      setCategorias([])
      setSelected(new Set())
      setExpanded(new Set())
      setDirty(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Falha ao limpar dados')
    }
  }

  const handleLinkPublico = async () => {
    if (!clienteId) return
    try {
      const { url } = await trpc.bi.linkPublico.mutate({ clienteId }) as { token: string; url: string }
      await navigator.clipboard?.writeText(url)
      alerts.success('Link copiado!', 'O link público do BI foi copiado para a área de transferência.')
    } catch { alerts.error('Erro', 'Falha ao gerar link público') }
  }

  /* ============================== RENDER ============================== */
  return (
    <div className="space-y-6">
      {/* Animation for search highlight */}
      <style>{`
        @keyframes searchPulse {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
          50% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2); }
          100% { box-shadow: 0 1px 6px rgba(245, 158, 11, 0.2); }
        }
        /* Reset cmdk selected state — only hover should highlight */
        .pai-select-item[data-selected=true] {
          background: transparent !important;
          color: inherit !important;
        }
        .pai-select-item:hover {
          background: #8b5cf6 !important;
          color: #fff !important;
        }
        .pai-select-item:hover .pai-select-sub {
          color: rgba(255,255,255,0.8) !important;
        }
      `}</style>
      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={onFileImport} />

      {/* Header — mesmo padrão do BI Faturamento */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, #6d28d9)` }}
          >
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>BI — Categorias do Balancete</h1>
            <p className="text-sm text-muted-foreground">Gerencie as categorias do balancete para análise no BI</p>
          </div>
        </div>
      </div>

      {/* Filter bar — uma única linha, mesmo padrão do BI Faturamento */}
      <Card>
        <div className="px-5 py-4">
          <div className="flex items-end gap-4">
            {/* Seletor de cliente */}
            <div className="w-full sm:w-[500px] shrink-0 space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cliente</Label>
              <div className="relative" ref={comboRef}>
                <button
                  type="button"
                  onClick={() => setComboOpen(v => !v)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs',
                    'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    !clienteId && 'text-muted-foreground',
                  )}
                >
                  <span className="truncate">
                    {selectedCliente ? selectedCliente.razaoSocial : 'Selecione um cliente'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>

                {comboOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg">
                    <Command className="rounded-lg" shouldFilter={true}>
                      <Command.Input
                        placeholder="Buscar por nome ou CNPJ..."
                        className="w-full border-b border-border bg-transparent px-3 py-2 text-xs outline-none placeholder:text-muted-foreground"
                      />
                      <Command.List className="max-h-[250px] overflow-y-auto p-1">
                        <Command.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
                          Nenhum cliente encontrado
                        </Command.Empty>
                        {clientes.map(c => (
                          <Command.Item
                            key={c.id}
                            value={`${c.razaoSocial} ${c.documento}`}
                            onSelect={() => {
                              if (dirty) {
                                alerts.confirm({ title: 'Alterações não salvas', text: 'Deseja descartar as alterações?', icon: 'warning', confirmText: 'Descartar' }).then((ok) => {
                                  if (ok) { setClienteId(c.id); setComboOpen(false) }
                                })
                              } else { setClienteId(c.id); setComboOpen(false) }
                            }}
                            className="group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-violet-500 hover:text-white aria-selected:bg-violet-500 aria-selected:text-white"
                          >
                            <Check className={cn('h-3.5 w-3.5 shrink-0', c.id === clienteId ? 'opacity-100' : 'opacity-0')} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{c.razaoSocial}</p>
                              <p className="font-mono text-[10px] text-muted-foreground group-hover:text-white/80 group-aria-selected:text-white/80">{formatCnpj(c.documento)}</p>
                            </div>
                          </Command.Item>
                        ))}
                      </Command.List>
                    </Command>
                  </div>
                )}
              </div>
            </div>

            {/* Ano */}
            <div className="w-[100px] space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ano</Label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="flex h-[34px] w-full items-center rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Buscar */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Buscar</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar categoria (conta, nome SCI ou nome exibido)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') executeSearch(); if (e.key === 'Escape') setSearch('') }}
                  className="h-[34px] text-xs"
                />
                <Button type="button" variant="outline" size="sm" className="h-[34px] shrink-0 text-xs" onClick={executeSearch} disabled={!search.trim()}>
                  <Search className="h-3.5 w-3.5 mr-1" /> Pesquisar
                </Button>
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">Limpar</button>
                )}
              </div>
              {search && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {matchSet.size} resultado(s) encontrado(s)
                </p>
              )}
            </div>

          </div>
        </div>
      </Card>

      {/* Table card */}
      <Card>
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-5 py-3">
          <div>
            <h5 className="text-sm font-semibold flex items-center gap-2 mb-0">
              <FolderTree className="h-4 w-4 text-muted-foreground" />
              {selectedCliente ? selectedCliente.razaoSocial : 'Categorias do Balancete'}
            </h5>
            {categorias.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {visibleCategorias.length} de {categorias.length} categorias
                {selected.size > 0 && ` · ${selected.size} selecionada(s)`}
                {' · '}{categorias.filter((c) => c.ativo).length} ativas no BI
                {dirty && <span className="ml-2 text-amber-600 font-medium">Alterações não salvas</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground shrink-0">
              <input
                type="checkbox"
                checked={apenasNoBi}
                onChange={(e) => setApenasNoBi(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-sky-500"
              />
              Apenas marcadas no BI
            </label>
            <div className="h-5 w-px bg-border shrink-0" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-[32px] text-xs">
                  <MoreHorizontal className="h-3.5 w-3.5" /> Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={handleCreateCategoria} disabled={!clienteId}><Plus className="mr-2 h-4 w-4" /> Criar Categoria</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={expandAll}><ChevronsDown className="mr-2 h-4 w-4" /> Expandir Tudo</DropdownMenuItem>
                <DropdownMenuItem onClick={collapseAll}><ChevronsUp className="mr-2 h-4 w-4" /> Recolher Tudo</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDeleteSelected} disabled={selected.size === 0} className="text-red-600 focus:text-red-600 hover:!text-white"><Trash2 className="mr-2 h-4 w-4" /> Excluir Selecionadas ({selected.size})</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCopiar} disabled={!clienteId}><Copy className="mr-2 h-4 w-4" /> Copiar para outro cliente</DropdownMenuItem>
                <DropdownMenuItem onClick={handleLimpar} disabled={!clienteId}><Eraser className="mr-2 h-4 w-4" /> Limpar Personalizações</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportBackup} disabled={!clienteId}><Download className="mr-2 h-4 w-4" /> Exportar Backup</DropdownMenuItem>
                <DropdownMenuItem onClick={handleImportBackup} disabled={!clienteId}><Upload className="mr-2 h-4 w-4" /> Importar Backup (JSON)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleImportarBalancete} disabled={!clienteId} className="font-medium hover:!text-white" style={{ color: MODULE_COLOR }}><RefreshCw className="mr-2 h-4 w-4" /> Importar Balancete (SCI)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExcluirBalancete} disabled={!clienteId} className="text-red-600 focus:text-red-600 hover:!text-white"><Trash2 className="mr-2 h-4 w-4" /> Excluir Balancete</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLinkPublico} disabled={!clienteId}><Link2 className="mr-2 h-4 w-4" /> Link Público BI</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={loadCategorias} disabled={!clienteId}><RefreshCw className="mr-2 h-4 w-4" /> Recarregar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLimparTudoCliente} disabled={!clienteId} className="text-red-600 focus:text-red-600 hover:!text-white font-medium"><Trash2 className="mr-2 h-4 w-4" /> Apagar tudo do cliente</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              disabled={!clienteId || !dirty || saving}
              onClick={handleSave}
              style={{ backgroundColor: MODULE_COLOR }}
              className="gap-1.5 text-white hover:opacity-90 h-[32px] text-xs"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </div>
        </div>

        {!clienteId ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Building2 className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Selecione um cliente</p>
            <p className="text-xs mt-1">Escolha um cliente no filtro acima para visualizar as categorias</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : categorias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FolderTree className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhuma categoria encontrada para este cliente</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={handleCreateCategoria}><Plus className="h-4 w-4" /> Criar Categoria</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(0,0,0,0.08)] bg-muted/30">
                  <th className="w-9 px-2 py-2.5 text-center">
                    <input type="checkbox" checked={selected.size > 0 && selected.size === visibleCategorias.length} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded border-gray-300 accent-sky-500" />
                  </th>
                  <th className="w-[90px] px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Conta</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap" style={{ width: '25%' }}>Nome (SCI)</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap" style={{ width: '25%' }}>Nome Exibido</th>
                  <th className="w-[130px] px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Pai</th>
                  <th className="w-[50px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Ordem</th>
                  <th className="w-[95px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Tipo</th>
                  <th className="w-[70px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={categorias.length > 0 && categorias.every((c) => c.ativo)}
                        onChange={(e) => {
                          const val = e.target.checked
                          setCategorias((prev) => prev.map((c) => ({ ...c, ativo: val })))
                          setDirty(true)
                        }}
                        className="h-3.5 w-3.5 rounded border-gray-300 accent-sky-500"
                        title={categorias.every((c) => c.ativo) ? 'Desmarcar todas' : 'Marcar todas'}
                      />
                      <span>No BI</span>
                    </div>
                  </th>
                  <th className="w-[70px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleCategorias.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Nenhuma categoria corresponde ao filtro</td></tr>
                ) : visibleCategorias.map((cat) => {
                  const isExpanded = expanded.has(cat.conta)
                  const hasSub = hasChildren(cat.conta)
                  const indent = apenasNoBi ? 0 : (cat.nivel - 1) * 24
                  const isGroup = cat.nivel <= 2
                  const isMatch = matchSet.has(cat.conta)
                  return (
                    <tr
                      key={cat.conta}
                      data-match={isMatch || undefined}
                      className={cn(
                        'group border-b transition-colors hover:bg-muted/20',
                        selected.has(cat.conta) && 'bg-violet-50/60 dark:bg-violet-900/10',
                        isGroup && !isMatch && 'bg-muted/10',
                        isMatch
                          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 shadow-[0_1px_6px_rgba(245,158,11,0.2)]'
                          : 'border-[rgba(0,0,0,0.04)]',
                      )}
                      style={isMatch ? { borderLeft: '4px solid #f59e0b', animation: 'searchPulse 0.5s ease-in-out' } : undefined}
                    >
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={selected.has(cat.conta)} onChange={() => toggleSelect(cat.conta)} className="h-3.5 w-3.5 rounded border-gray-300 accent-sky-500" />
                      </td>
                      <td className="px-2 py-1 font-mono text-xs">
                        <div className="flex items-center" style={{ paddingLeft: indent }}>
                          {hasSub ? (
                            <button type="button" onClick={() => toggleExpand(cat.conta)} className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            </button>
                          ) : <span className="mr-1.5 inline-block w-5" />}
                          <span className={cn(isGroup && 'font-semibold')}>{cat.conta}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1 text-xs text-muted-foreground">{cat.nomeSci || cat.nomeExibido || '-'}</td>
                      <td className="px-2 py-1">
                        <Input value={cat.nomeExibido || cat.nomeSci || ''} onChange={(e) => updateField(cat.conta, 'nomeExibido', e.target.value)} placeholder={cat.nomeSci || cat.conta} className="h-6 px-2 text-[11px]" />
                      </td>
                      <td className="px-2 py-1">
                        <PaiSelect
                          value={cat.parentConta}
                          options={treeItems}
                          excludeConta={cat.conta}
                          onChange={(val) => updateField(cat.conta, 'parentConta', val)}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <Input type="number" value={cat.ordem} onChange={(e) => updateField(cat.conta, 'ordem', Number(e.target.value))} className="mx-auto h-7 w-14 text-center text-xs" min={0} />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <select
                          value={cat.tipo}
                          onChange={(e) => updateField(cat.conta, 'tipo', e.target.value)}
                          className="h-6 rounded border border-input bg-background px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="R">Real</option>
                          <option value="C">Calculada</option>
                          <option value="F">Referência</option>
                          <option value="real">Real</option>
                          <option value="calculada">Calculada</option>
                          <option value="referencia">Referência</option>
                        </select>
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={cat.ativo} onChange={(e) => updateField(cat.conta, 'ativo', e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 accent-sky-500" />
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="Editar fórmula"
                            disabled={cat.tipo !== 'C' && cat.tipo !== 'calculada'}
                            onClick={() => setFormulaModal({ conta: cat.conta, nome: `${cat.conta} — ${cat.nomeSci || cat.nomeExibido || ''}` })}
                            className={cn(
                              'rounded p-1 transition-colors',
                              cat.tipo === 'C' || cat.tipo === 'calculada'
                                ? 'text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                                : 'text-muted-foreground/30 cursor-not-allowed',
                            )}
                          >
                            <Calculator className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Excluir categoria"
                            onClick={async () => {
                              const ok = await alerts.confirmDelete(cat.conta); if (!ok) return
                              try { await trpc.cliente.biDeleteCategoria.mutate({ clienteId, conta: cat.conta }); setCategorias((prev) => prev.filter((c) => c.conta !== cat.conta)); setSelected((prev) => { const n = new Set(prev); n.delete(cat.conta); return n }) }
                              catch { alerts.error('Erro', 'Falha ao excluir categoria') }
                            }}
                            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Formula modal */}
      {formulaModal && (() => {
        const cat = categorias.find(c => c.conta === formulaModal.conta)
        return (
          <FormulaModal
            conta={formulaModal.conta}
            nome={formulaModal.nome}
            categorias={treeItems}
            currentFormula={cat?.formula}
            onClose={() => setFormulaModal(null)}
            onSave={(formula) => {
              updateField(formulaModal.conta, 'formula', formula)
              setFormulaModal(null)
            }}
          />
        )
      })()}
    </div>
  )
}
