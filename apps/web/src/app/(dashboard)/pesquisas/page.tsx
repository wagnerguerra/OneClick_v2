'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Star, Search, Loader2, Plus, MoreVertical, Trash2, Send,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  CheckCircle2, Clock, BarChart3, TrendingUp, Mail,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

// ============================================================
// Tipos e constantes
// ============================================================

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'
const PAGE_SIZES = [10, 20, 50]

interface Pesquisa {
  id: string
  clienteId: string | null
  orcamentoId: string | null
  execucaoId: string | null
  respondenteNome: string | null
  respondenteArea: string | null
  q1Atendeu: boolean | null
  q2Qualidade: number | null
  q3Recomendaria: boolean | null
  nota: number | null
  comentario: string | null
  enviadaEm: string | null
  respondidaEm: string | null
  createdAt: string
  cliente?: { id: string; razaoSocial: string } | null
  orcamento?: { id: string; numero: number } | null
}

interface PesquisaStats {
  total: number
  respondidas: number
  pendentes: number
  taxaResposta: number
  mediaNotas: number
  nps: number
  distribuicao: Record<string, number>
}

// ============================================================
// Helpers
// ============================================================

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function truncate(s: string | null, max: number) {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max) + '...' : s
}

function getStatus(p: Pesquisa): 'respondida' | 'enviada' | 'pendente' {
  if (p.respondidaEm) return 'respondida'
  if (p.enviadaEm) return 'enviada'
  return 'pendente'
}

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', icon: Clock },
  enviada: { label: 'Enviada', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', icon: Mail },
  respondida: { label: 'Respondida', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', icon: CheckCircle2 },
}

function PesquisaStatusBadge({ pesquisa }: { pesquisa: Pesquisa }) {
  const status = getStatus(pesquisa)
  const c = STATUS_CONFIG[status]
  const Icon = c.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold', c.bg, c.text, c.border)}>
      <Icon className="h-3 w-3" />{c.label}
    </span>
  )
}

function StarRating({ nota }: { nota: number | null }) {
  if (nota == null) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= nota ? 'fill-amber-400 text-amber-400' : 'text-gray-200 dark:text-gray-700')} />
      ))}
    </div>
  )
}

function getNpsColor(nps: number): string {
  if (nps < 0) return '#ef4444'
  if (nps <= 50) return '#f59e0b'
  return '#10b981'
}

// ============================================================
// Page
// ============================================================

export default function PesquisasPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [loading, setLoading] = useState(true)
  const [pesquisas, setPesquisas] = useState<Pesquisa[]>([])
  const [totalPesquisas, setTotalPesquisas] = useState(0)
  const [stats, setStats] = useState<PesquisaStats | null>(null)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [clientes, setClientes] = useState<{ id: string; razaoSocial: string }[]>([])
  const [formClienteId, setFormClienteId] = useState('')
  const [formOrcamentoId, setFormOrcamentoId] = useState('')
  const [formExecucaoId, setFormExecucaoId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])

  // ── Fetch ──

  const fetchStats = useCallback(async () => {
    try {
      const s = await (trpc.pesquisa as any).getStats.query()
      setStats(s)
    } catch { /* silent */ }
  }, [])

  const fetchPesquisas = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (trpc.pesquisa as any).list.query()
      const filtered = (result as Pesquisa[]).filter(p =>
        !debouncedSearch ||
        p.cliente?.razaoSocial?.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
      setTotalPesquisas(filtered.length)
      setPesquisas(filtered.slice((page - 1) * limit, page * limit))
    } catch { setPesquisas([]); setTotalPesquisas(0) }
    finally { setLoading(false) }
  }, [debouncedSearch, page, limit])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchPesquisas() }, [fetchPesquisas])

  // ── Actions ──

  async function openCreateModal() {
    setCreateOpen(true)
    setFormClienteId('')
    setFormOrcamentoId('')
    setFormExecucaoId('')
    try {
      const list = await (trpc.cliente as any).listForSelect.query()
      setClientes(list)
    } catch { setClientes([]) }
  }

  async function handleCreate() {
    if (!formClienteId) { alerts.error('Erro', 'Selecione um cliente'); return }
    setCreating(true)
    try {
      await (trpc.pesquisa as any).create.mutate({
        clienteId: formClienteId,
        orcamentoId: formOrcamentoId || undefined,
        execucaoId: formExecucaoId || undefined,
      })
      setCreateOpen(false)
      await alerts.success('Criada', 'Pesquisa de satisfacao criada com sucesso.')
      fetchPesquisas()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setCreating(false) }
  }

  async function handleEnviar(id: string) {
    try {
      await (trpc.pesquisa as any).enviar.mutate({ id })
      await alerts.success('Enviada', 'Pesquisa enviada ao cliente com sucesso.')
      fetchPesquisas()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDelete(id: string) {
    if (!await alerts.confirmDelete('esta pesquisa')) return
    try {
      await (trpc.pesquisa as any).delete.mutate({ id })
      fetchPesquisas()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Pagination ──

  const totalPages = Math.max(1, Math.ceil(totalPesquisas / limit))
  const startRecord = totalPesquisas ? (page - 1) * limit + 1 : 0
  const endRecord = Math.min(page * limit, totalPesquisas)

  function getPageNumbers() {
    const p: number[] = []
    let s = Math.max(1, page - 2)
    const e = Math.min(totalPages, s + 4)
    s = Math.max(1, e - 4)
    for (let i = s; i <= e; i++) p.push(i)
    return p
  }

  // ── Distribution chart ──

  const maxDist = stats ? Math.max(...Object.values(stats.distribuicao), 1) : 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <Star className="h-6 w-6" />
          </div>
          <div>
            <h1>Pesquisa de Satisfacao</h1>
            <p className="text-sm text-muted-foreground">Avalie a satisfacao dos clientes e acompanhe o NPS</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={openCreateModal} className="gap-1.5">
            <Plus className="h-4 w-4" />Nova Pesquisa
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20">
              <BarChart3 className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Pesquisas</p>
              <p className="text-xl font-bold">{stats?.total ?? 0}</p>
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-muted"><div className="h-1 rounded-full" style={{ width: '100%', backgroundColor: MODULE_COLOR }} /></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Respondidas</p>
              <p className="text-xl font-bold">{stats?.respondidas ?? 0}</p>
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-muted"><div className="h-1 rounded-full bg-emerald-500" style={{ width: stats ? `${Math.min(100, stats.taxaResposta)}%` : '0%' }} /></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa de Resposta</p>
              <p className="text-xl font-bold">{stats ? `${stats.taxaResposta.toFixed(0)}%` : '0%'}</p>
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-muted"><div className="h-1 rounded-full bg-amber-500" style={{ width: stats ? `${Math.min(100, stats.taxaResposta)}%` : '0%' }} /></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: stats ? `${getNpsColor(stats.nps)}15` : '#f3f4f6' }}>
              <Star className="h-5 w-5" style={{ color: stats ? getNpsColor(stats.nps) : '#9ca3af' }} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">NPS Score</p>
              <p className="text-xl font-bold" style={{ color: stats ? getNpsColor(stats.nps) : undefined }}>{stats?.nps ?? 0}</p>
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-muted"><div className="h-1 rounded-full" style={{ width: stats ? `${Math.min(100, Math.max(0, stats.nps + 100) / 2)}%` : '0%', backgroundColor: stats ? getNpsColor(stats.nps) : '#d1d5db' }} /></div>
        </Card>
      </div>

      {/* NPS Gauge + Distribution */}
      {stats && stats.total > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* NPS Gauge */}
          <Card className="p-5">
            <h4 className="text-sm font-semibold mb-4">NPS - Net Promoter Score</h4>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <p className="text-6xl font-bold" style={{ color: getNpsColor(stats.nps) }}>{stats.nps}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.nps < 0 ? 'Zona Critica' : stats.nps <= 50 ? 'Zona de Aperfeicoamento' : stats.nps <= 75 ? 'Zona de Qualidade' : 'Zona de Excelencia'}
                </p>
                <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Critico (&lt;0)</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Aperfeicoamento (0-50)</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Excelencia (&gt;50)</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Media de notas: <span className="font-semibold text-foreground">{stats.mediaNotas.toFixed(1)}</span> / 5</p>
              </div>
            </div>
          </Card>

          {/* Star Distribution */}
          <Card className="p-5">
            <h4 className="text-sm font-semibold mb-4">Distribuicao de Notas</h4>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map(nota => {
                const count = stats.distribuicao[String(nota)] || 0
                const pct = maxDist > 0 ? (count / maxDist) * 100 : 0
                return (
                  <div key={nota} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 w-16 shrink-0 justify-end">
                      <span className="text-xs font-medium">{nota}</span>
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    </div>
                    <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: nota >= 4 ? '#10b981' : nota === 3 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{count}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-1">
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-[100px]">Orcamento</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[110px]">Enviada em</TableHead>
              <TableHead className="w-[110px]">Respondida em</TableHead>
              <TableHead className="w-[100px]">Nota</TableHead>
              <TableHead>Comentario</TableHead>
              <TableHead className="w-[50px] text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : !pesquisas.length ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />Nenhuma pesquisa encontrada
              </TableCell></TableRow>
            ) : pesquisas.map(p => (
              <TableRow key={p.id}>
                <TableCell className="text-sm whitespace-nowrap">{p.cliente?.razaoSocial || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{p.orcamento ? `#${p.orcamento.numero}` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap"><PesquisaStatusBadge pesquisa={p} /></TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.enviadaEm)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.respondidaEm)}</TableCell>
                <TableCell className="whitespace-nowrap"><StarRating nota={p.nota} /></TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap"><span className="block max-w-[200px] truncate">{truncate(p.comentario, 40)}</span></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {getStatus(p) === 'pendente' && (
                        <DropdownMenuItem onClick={() => handleEnviar(p.id)}><Send className="h-4 w-4" />Enviar</DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPesquisas > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{totalPesquisas}</span> registros</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers().map(p => (
                  <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Nova Pesquisa de Satisfacao</DialogTitle>
            <DialogDescription>Selecione o cliente para enviar a pesquisa.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Cliente *</Label>
              <Select value={formClienteId || '__none__'} onValueChange={v => setFormClienteId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecione...</SelectItem>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.razaoSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">ID do Orcamento <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={formOrcamentoId} onChange={e => setFormOrcamentoId(e.target.value)} placeholder="ID do orcamento vinculado" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">ID da Execucao <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={formExecucaoId} onChange={e => setFormExecucaoId(e.target.value)} placeholder="ID da execucao vinculada" className="h-9 text-sm" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-1.5" style={{ backgroundColor: MODULE_COLOR }}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Pesquisa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
