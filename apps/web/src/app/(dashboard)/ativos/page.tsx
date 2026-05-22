'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Loader2, Database, Laptop, ShieldCheck, Wrench, PackageOpen, Coins,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, Pencil, Trash2,
  ClipboardCheck, Printer, AlertTriangle,
} from 'lucide-react'
import {
  Button, Input, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { ATIVO_STATUS_META, calcularValorDepreciado, type AtivoStatus } from '@saas/types'

const STATUS_CHIP_CLS: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
  amber:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  slate:   'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300 dark:border-slate-800',
  sky:     'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800',
  rose:    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800',
}

function fmtBRL(v: number | string | null | undefined): string {
  if (v == null) return '—'
  const n = typeof v === 'string' ? Number(v) : v
  if (isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface AtivoRow {
  id: string
  code: number
  tag: string
  nome: string
  fabricante: string | null
  modelo: string | null
  dataAquisicao: string | null
  valorAquisicao: string | null
  status: AtivoStatus
  isActive: boolean
  tipo:        { id: string; nome: string; cor: string | null; icone: string | null }
  categoria:   { id: string; nome: string; depreciacaoMeses: number | null }
  responsavel: { id: string; name: string; image: string | null } | null
  area:        { id: string; name: string } | null
  cliente:     { id: string; razaoSocial: string; nomeFantasia: string | null } | null
}

interface TipoOpt { id: string; nome: string; cor: string | null; icone: string | null; _count?: { ativos: number; categorias: number } }

const PAGE_SIZES = [10, 20, 50, 100]
// Cor do módulo TI — vem das CSS vars do ThemeProvider (editável no Design System).
// Fallback estático mantido pra primeiro render antes do fetch.
const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

export default function AtivosPage() {
  const [tipos, setTipos] = useState<TipoOpt[]>([])
  const [data, setData] = useState<AtivoRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AtivoStatus | '__all__'>('__all__')
  const [tipoFilter, setTipoFilter] = useState<string>('__all__')

  const [createOpen, setCreateOpen] = useState(false)
  /** IDs selecionados pra ações em massa (inventário, imprimir etiquetas). */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  /** Estatísticas globais (vem do backend — mais preciso que reduce client). */
  const [stats, setStats] = useState<{
    total: number
    porStatus: { ativos: number; manutencao: number; estoque: number; emprestado: number; descartado: number; perdido: number }
    valorPatrimonial: number
    garantiasVencendo: number
    semInventarioSeis: number
    manutencoesAbertas: number
    custoManutencoesTotal: number
  } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchTipos = useCallback(async () => {
    try {
      const t = await (trpc.ativo as any).listTipos.query() as TipoOpt[]
      setTipos(t)
    } catch { /* silent */ }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const s = await (trpc.ativo as any).getEstatisticas.query()
      setStats(s)
    } catch { /* silent */ }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (trpc.ativo as any).list.query({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter === '__all__' ? undefined : statusFilter,
        tipoId: tipoFilter === '__all__' ? undefined : tipoFilter,
      })
      setData(result.data)
      setTotal(result.total)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setData([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, debouncedSearch, statusFilter, tipoFilter])

  useEffect(() => { void fetchTipos() }, [fetchTipos])
  useEffect(() => { void fetchStats() }, [fetchStats])
  useEffect(() => { void fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  // KPIs (sobre TODO o dataset visível do filtro — não só a página atual)
  const kpis = useMemo(() => {
    const totalValor = data.reduce((sum, a) => sum + (a.valorAquisicao ? Number(a.valorAquisicao) : 0), 0)
    const totalDeprec = data.reduce((sum, a) => {
      const v = calcularValorDepreciado(
        a.valorAquisicao ? Number(a.valorAquisicao) : null,
        a.dataAquisicao,
        a.categoria.depreciacaoMeses,
      )
      return sum + (v ?? 0)
    }, 0)
    return {
      totalValor,
      totalDeprec,
      emUso: data.filter(a => a.status === 'ATIVO').length,
      manutencao: data.filter(a => a.status === 'MANUTENCAO').length,
      estoque: data.filter(a => a.status === 'ESTOQUE').length,
    }
  }, [data])

  async function handleDelete(id: string, tag: string) {
    const ok = await alerts.confirm({
      title: 'Remover ativo',
      text: `O ativo ${tag} será baixado (descartado). Os registros são mantidos pra histórico.`,
      confirmText: 'Baixar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await trpcMutate('ativo.delete', { id })
      await alerts.success('Removido', 'Ativo baixado com sucesso.')
      void fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm"
            style={{ background: MODULE_COLOR }}
          >
            <Database className="h-6 w-6" />
          </div>
          <div>
            <h1>Gestão de Ativos</h1>
            <p className="text-sm text-muted-foreground">Patrimônio de TI, mobiliário e equipamentos</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white">
          <Plus className="h-4 w-4" /> Novo ativo
        </Button>
      </div>

      {/* KPIs — vêm do getEstatisticas (consolidado backend, ignora filtros/paginação) */}
      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard icon={Database}      label="Total"             value={(stats?.total ?? 0).toString()} color="sky" />
          <KpiCard icon={Coins}         label="Valor patrimonial" value={fmtBRL(stats?.valorPatrimonial ?? 0)} color="emerald" />
          <KpiCard icon={Laptop}        label="Em uso"            value={(stats?.porStatus.ativos ?? 0).toString()} color="emerald" />
          <KpiCard icon={Wrench}        label="Manutenção"        value={(stats?.porStatus.manutencao ?? 0).toString()} color="amber" />
          <KpiCard icon={PackageOpen}   label="Estoque"           value={(stats?.porStatus.estoque ?? 0).toString()} color="slate" />
          <KpiCard icon={AlertTriangle} label="Garantia ≤ 30d"    value={(stats?.garantiasVencendo ?? 0).toString()} color="amber" />
          <KpiCard icon={ClipboardCheck} label="Sem inventário 6m" value={(stats?.semInventarioSeis ?? 0).toString()} color="rose" />
        </div>
      </Card>

      {/* Filtros + tabela */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as any); setPage(1) }}>
              <SelectTrigger className="h-8 w-[170px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                {Object.entries(ATIVO_STATUS_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tipoFilter} onValueChange={v => { setTipoFilter(v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[200px] text-xs bg-card"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tag, nome, fabricante, serial..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 w-full sm:w-[260px] text-xs bg-card"
            />
          </div>
        </div>

        {/* Barra de ações em massa — só aparece com seleção ativa */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 border-b bg-sky-50 dark:bg-sky-950/20 px-4 py-2">
            <span className="text-[12px] font-semibold text-sky-700 dark:text-sky-300">
              {selectedIds.size} ativo{selectedIds.size === 1 ? '' : 's'} selecionado{selectedIds.size === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline" size="sm"
                onClick={async () => {
                  const ok = await alerts.confirm({
                    title: 'Marcar inventariados',
                    text: `Os ${selectedIds.size} ativos selecionados serão marcados como inventariados agora.`,
                    confirmText: 'Confirmar',
                  })
                  if (!ok) return
                  try {
                    const r = await trpcMutate<{ atualizados: number }>('ativo.marcarInventariadosEmMassa', { ids: Array.from(selectedIds) })
                    await alerts.success('Inventariado', `${r.atualizados} ativos atualizados.`)
                    setSelectedIds(new Set())
                    void fetchStats(); void fetchData()
                  } catch (e) { alerts.error('Erro', (e as Error).message) }
                }}
                className="gap-1.5"
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Marcar inventariados
              </Button>
              <Link href={`/ativos/etiquetas?ids=${Array.from(selectedIds).join(',')}`} target="_blank">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Printer className="h-3.5 w-3.5" /> Imprimir etiquetas
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36px]">
                <input
                  type="checkbox"
                  checked={data.length > 0 && data.every(a => selectedIds.has(a.id))}
                  ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && !data.every(a => selectedIds.has(a.id)) }}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(new Set([...selectedIds, ...data.map(a => a.id)]))
                    else setSelectedIds(new Set([...selectedIds].filter(id => !data.find(a => a.id === id))))
                  }}
                  className="h-3.5 w-3.5 cursor-pointer accent-sky-600"
                />
              </TableHead>
              <TableHead className="w-[88px]">Tag</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-[180px]">Categoria</TableHead>
              <TableHead className="w-[200px]">Responsável</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[140px] text-right">Valor</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="text-center py-10 text-muted-foreground">
                    <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum ativo encontrado.</p>
                    <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="mt-3 gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Cadastrar primeiro ativo
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.map(a => {
              const meta = ATIVO_STATUS_META[a.status]
              const valorDeprec = calcularValorDepreciado(
                a.valorAquisicao ? Number(a.valorAquisicao) : null,
                a.dataAquisicao,
                a.categoria.depreciacaoMeses,
              )
              return (
                <TableRow key={a.id} className="hover:bg-muted/40">
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={e => {
                        const next = new Set(selectedIds)
                        if (e.target.checked) next.add(a.id); else next.delete(a.id)
                        setSelectedIds(next)
                      }}
                      className="h-3.5 w-3.5 cursor-pointer accent-sky-600"
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/ativos/${a.id}`} className="font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:underline">
                      {a.tag}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/ativos/${a.id}`} className="hover:underline">
                      <div className="font-medium text-foreground">{a.nome}</div>
                      {(a.fabricante || a.modelo) && (
                        <div className="text-[11px] text-muted-foreground">
                          {[a.fabricante, a.modelo].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium" style={{ color: a.tipo.cor ?? undefined }}>{a.tipo.nome}</span>
                      <span className="text-[10px] text-muted-foreground">{a.categoria.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.responsavel ? (
                      <div className="text-[12px] font-medium truncate" title={a.responsavel.name}>{a.responsavel.name}</div>
                    ) : a.cliente ? (
                      <div className="text-[12px] text-sky-600 truncate" title={a.cliente.razaoSocial}>
                        🤝 {a.cliente.nomeFantasia ?? a.cliente.razaoSocial}
                      </div>
                    ) : a.area ? (
                      <div className="text-[12px] text-muted-foreground">{a.area.name}</div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">Sem atribuição</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', STATUS_CHIP_CLS[meta.cor])}>
                      {meta.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-[12px] font-medium tabular-nums">{fmtBRL(a.valorAquisicao)}</div>
                    {valorDeprec !== null && a.valorAquisicao && (
                      <div className="text-[10px] text-muted-foreground tabular-nums" title="Valor depreciado atual">
                        ≈ {fmtBRL(valorDeprec)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs"><MoreVertical className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border border-foreground/15 shadow-lg">
                        <DropdownMenuItem asChild>
                          <Link href={`/ativos/${a.id}`}><Pencil className="h-3.5 w-3.5 mr-2 text-sky-600" /> Abrir</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(a.id, a.tag)} className="focus:[&_svg]:text-white">
                          <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-600" /> Baixar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {/* Paginação */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/20">
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {total === 0 ? '0 ativo' : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total} ativo${total === 1 ? '' : 's'}`}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="text-[11px] mx-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="ghost" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </Card>

      {/* Modal criação rápida */}
      {createOpen && (
        <NovoAtivoDialog
          tipos={tipos}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void fetchData() }}
        />
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, color }: {
  icon: typeof Database
  label: string
  value: string
  color: 'sky' | 'emerald' | 'amber' | 'slate' | 'rose'
}) {
  const map: Record<string, string> = {
    sky:     'text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300',
    emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber:   'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
    slate:   'text-slate-700 bg-slate-50 dark:bg-slate-950/30 dark:text-slate-300',
    rose:    'text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-300',
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center', map[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-base font-bold leading-none tabular-nums truncate">{value}</p>
      </div>
    </div>
  )
}

// ── Dialog: criação rápida ─────────────────────────────────────────────

import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter, Label } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'

function NovoAtivoDialog({ tipos, onClose, onCreated }: {
  tipos: TipoOpt[]
  onClose: () => void
  onCreated: () => void
}) {
  const [nome, setNome] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [fabricante, setFabricante] = useState('')
  const [modelo, setModelo] = useState('')
  const [serial, setSerial] = useState('')
  const [valor, setValor] = useState('')
  const [categorias, setCategorias] = useState<Array<{ id: string; nome: string }>>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!tipoId) { setCategorias([]); setCategoriaId(''); return }
    (async () => {
      try {
        const cats = await (trpc.ativo as any).listCategorias.query({ tipoId }) as Array<{ id: string; nome: string }>
        setCategorias(cats)
      } catch { setCategorias([]) }
    })()
  }, [tipoId])

  async function handleSave() {
    if (!nome.trim()) { alerts.error('Erro', 'Nome é obrigatório'); return }
    if (!tipoId || !categoriaId) { alerts.error('Erro', 'Selecione tipo e categoria'); return }
    setSaving(true)
    try {
      // Usa trpcMutate (fetch direto) — o trpc client está travando em mutations
      // sob certas condições; helper bypassa o batching/links e vai direto.
      await trpcMutate('ativo.create', {
        nome:        nome.trim(),
        tipoId, categoriaId,
        fabricante:  fabricante.trim() || undefined,
        modelo:      modelo.trim() || undefined,
        serial:      serial.trim() || undefined,
        valorAquisicao: valor ? Number(valor.replace(',', '.')) : undefined,
      })
      await alerts.success('Cadastrado', 'Ativo cadastrado com sucesso.')
      onCreated()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeaderIcon icon={Database} color="sky">
          <DialogTitle>Novo ativo</DialogTitle>
          <DialogDescription>
            Cadastro rápido — depois você pode editar todos os campos (garantia, fornecedor, anexos, etc) na página do ativo.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder='Ex.: "Notebook Dell Latitude — TI"' className="h-9 text-sm" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Tipo *</Label>
              <Select value={tipoId} onValueChange={setTipoId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Categoria *</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId} disabled={!tipoId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={tipoId ? 'Selecione...' : 'Escolha o tipo primeiro'} /></SelectTrigger>
                <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Fabricante</Label>
              <Input value={fabricante} onChange={e => setFabricante(e.target.value)} placeholder="Dell, HP, Logitech..." className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Modelo</Label>
              <Input value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Latitude 5520" className="h-9 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nº de série</Label>
              <Input value={serial} onChange={e => setSerial(e.target.value)} placeholder="SN..." className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Valor de aquisição (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="3500,00"
                className="h-9 text-sm tabular-nums"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A etiqueta (tag) será gerada automaticamente. Você pode editá-la na página do ativo.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 bg-sky-600 hover:bg-sky-700">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
