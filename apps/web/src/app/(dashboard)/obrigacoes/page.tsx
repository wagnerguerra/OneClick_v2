'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Receipt, Search, Plus, Pencil, ExternalLink, FileText, Loader2,
  Filter, Power, PowerOff, MoreVertical, CalendarDays, Layers,
  List, LayoutGrid, Sparkles,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  OBRIGACAO_CATEGORIAS, OBRIGACAO_CATEGORIA_CORES,
  RECORRENCIA_FREQUENCIA_LABELS,
  type ObrigacaoCategoria,
  type RecorrenciaFrequencia,
} from '@saas/types'
import { CalendarioObrigacoes } from './_components/calendario-obrigacoes'
import { AuditoriaDialog } from './_components/auditoria-dialog'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // Emerald (Cadastros)

interface Obrigacao {
  id: string
  nome: string
  descricao: string | null
  categoria: string | null
  ativo: boolean
  prioridadePadrao: string
  fonteUrl: string | null
  documentacaoUrl: string | null
  recorrencia: {
    frequencia: RecorrenciaFrequencia
    ancoragem: string
    valorAncoragem: number
    competenciaOffset: number
    modoPersonalizado: boolean
    diasDoMes: number[]
    mesesDoAno: number[]
    ativa: boolean
  } | null
  proximaExecucao: Date | string | null
  totalExecucoes: number
}

interface Stats {
  total: number
  ativas: number
  porCategoria: Record<string, number>
}

function formatDataBR(d: Date | string | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function diasAteVencimento(d: Date | string | null): number | null {
  if (!d) return null
  const dt = typeof d === 'string' ? new Date(d) : d
  const ms = dt.getTime() - Date.now()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function descreverRecorrencia(r: Obrigacao['recorrencia']): string {
  if (!r) return 'Sem regra'
  if (r.modoPersonalizado && r.diasDoMes.length > 0) {
    const dias = r.diasDoMes.map((d) => (d === 31 ? 'último' : `dia ${d}`)).join(', ')
    const meses = r.mesesDoAno.length === 0
      ? 'todos os meses'
      : r.mesesDoAno.map((m) => ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m-1]).join('/')
    return `${dias} · ${meses}`
  }
  const freq = RECORRENCIA_FREQUENCIA_LABELS[r.frequencia] ?? r.frequencia
  if (r.frequencia === 'DIARIA' || r.frequencia === 'SEMANAL') return freq
  if (r.ancoragem === 'DIA_UTIL') return `${freq} · ${r.valorAncoragem}º dia útil`
  if (r.ancoragem === 'DIAS_APOS_COMPETENCIA') return `${freq} · ${r.valorAncoragem} dia(s) após competência`
  return `${freq} · dia ${r.valorAncoragem === 31 ? 'último' : r.valorAncoragem}`
}

export default function ObrigacoesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<'TODAS' | ObrigacaoCategoria>('TODAS')
  const [filtroFrequencia, setFiltroFrequencia] = useState<'TODAS' | RecorrenciaFrequencia>('TODAS')
  const [filtroAtivo, setFiltroAtivo] = useState<'TODOS' | 'ATIVAS' | 'INATIVAS'>('TODOS')
  const [view, setView] = useState<'tabela' | 'calendario'>('tabela')
  const [auditoriaOpen, setAuditoriaOpen] = useState(false)
  const [items, setItems] = useState<Obrigacao[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t) }, [search])

  async function fetchData() {
    setLoading(true)
    try {
      const [list, st] = await Promise.all([
        trpc.obrigacao.list.query({
          search: debouncedSearch || undefined,
          categoria: filtroCategoria === 'TODAS' ? undefined : filtroCategoria,
          frequencia: filtroFrequencia === 'TODAS' ? undefined : filtroFrequencia,
          ativo: filtroAtivo === 'TODOS' ? undefined : filtroAtivo === 'ATIVAS',
        }),
        trpc.obrigacao.stats.query(),
      ])
      setItems(list as Obrigacao[])
      setStats(st)
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Não foi possível carregar as obrigações.')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [debouncedSearch, filtroCategoria, filtroFrequencia, filtroAtivo])

  const filtrosAtivos = useMemo(
    () =>
      [filtroCategoria !== 'TODAS', filtroFrequencia !== 'TODAS', filtroAtivo !== 'TODOS', !!debouncedSearch].filter(Boolean).length,
    [filtroCategoria, filtroFrequencia, filtroAtivo, debouncedSearch],
  )

  async function handleToggleAtivo(id: string, nome: string, ativoAtual: boolean) {
    const verbo = ativoAtual ? 'desativar' : 'ativar'
    const ok = await alerts.confirm({
      title: `Deseja ${verbo} esta obrigação?`,
      text: `"${nome}" ${ativoAtual ? 'não será mais executada automaticamente para nenhum cliente.' : 'voltará a ser executada conforme a regra de recorrência.'}`,
      confirmText: verbo.charAt(0).toUpperCase() + verbo.slice(1),
    })
    if (!ok) return
    try {
      await trpc.obrigacao.toggleAtivo.mutate({ id })
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao atualizar.') }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ backgroundColor: MODULE_COLOR }}
          >
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1>Obrigações Acessórias</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo de obrigações fiscais, trabalhistas e contábeis com vencimento e fonte oficial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle de visualização */}
          <div className="flex items-center rounded border border-border/60 bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setView('tabela')}
              title="Visualização em tabela"
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                view === 'tabela' ? 'text-white' : 'text-muted-foreground hover:text-foreground',
              )}
              style={view === 'tabela' ? { backgroundColor: MODULE_COLOR } : undefined}
            >
              <List className="h-3.5 w-3.5" />Tabela
            </button>
            <button
              type="button"
              onClick={() => setView('calendario')}
              title="Visualização em calendário"
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-l border-border/60',
                view === 'calendario' ? 'text-white' : 'text-muted-foreground hover:text-foreground',
              )}
              style={view === 'calendario' ? { backgroundColor: MODULE_COLOR } : undefined}
            >
              <LayoutGrid className="h-3.5 w-3.5" />Calendário
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuditoriaOpen(true)}
            title="Auditar recorrências usando histórico do Acessórias"
          >
            <Sparkles className="h-4 w-4 text-orange-500" />Auditar
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={() => router.push('/obrigacoes/new')}
            style={{ backgroundColor: MODULE_COLOR }}
          >
            <Plus className="h-4 w-4" />Nova obrigação
          </Button>
        </div>
      </div>

      {/* Stats cards compactos */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{stats.total}</div>
            <div className="text-[11px] text-muted-foreground">{stats.ativas} ativas</div>
          </Card>
          {OBRIGACAO_CATEGORIAS.map((cat) => {
            const cores = OBRIGACAO_CATEGORIA_CORES[cat]
            return (
              <Card key={cat} className={cn('p-3 border-l-2', cores.border)}>
                <div className={cn('text-[11px] uppercase tracking-wide', cores.text)}>{cat}</div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums">{stats.porCategoria[cat] ?? 0}</div>
                <div className="text-[11px] text-muted-foreground">obrigações</div>
              </Card>
            )
          })}
        </div>
      )}

      {view === 'calendario' ? (
        <CalendarioObrigacoes />
      ) : (
      <Card>
        {/* Toolbar com filtros */}
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filtros</span>
              {filtrosAtivos > 0 && (
                <Badge variant="outline" className="h-5 text-[10px]">{filtrosAtivos}</Badge>
              )}
            </div>
            <Select value={filtroCategoria} onValueChange={(v) => setFiltroCategoria(v as any)}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as categorias</SelectItem>
                {OBRIGACAO_CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroFrequencia} onValueChange={(v) => setFiltroFrequencia(v as any)}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas frequências</SelectItem>
                {Object.entries(RECORRENCIA_FREQUENCIA_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroAtivo} onValueChange={(v) => setFiltroAtivo(v as any)}>
              <SelectTrigger className="h-8 w-[120px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todas</SelectItem>
                <SelectItem value="ATIVAS">Ativas</SelectItem>
                <SelectItem value="INATIVAS">Inativas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative max-w-xs w-full sm:w-[260px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar obrigação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>
        </div>

        {/* Tabela */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px] whitespace-nowrap">Categoria</TableHead>
              <TableHead className="w-auto whitespace-nowrap">Obrigação</TableHead>
              <TableHead className="hidden md:table-cell w-[210px] whitespace-nowrap">Recorrência</TableHead>
              <TableHead className="hidden lg:table-cell w-[140px] whitespace-nowrap">Vencimento</TableHead>
              <TableHead className="hidden sm:table-cell w-[80px] text-center whitespace-nowrap">Status</TableHead>
              <TableHead className="w-[80px] text-right whitespace-nowrap">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    Carregando obrigações...
                  </div>
                </TableCell>
              </TableRow>
            ) : !items.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Nenhuma obrigação encontrada
                </TableCell>
              </TableRow>
            ) : (
              items.map((o) => {
                const cores = o.categoria && o.categoria in OBRIGACAO_CATEGORIA_CORES
                  ? OBRIGACAO_CATEGORIA_CORES[o.categoria as ObrigacaoCategoria]
                  : { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' }
                const dias = diasAteVencimento(o.proximaExecucao)
                const isAtrasada = dias !== null && dias < 0
                const isProxima = dias !== null && dias >= 0 && dias <= 7
                return (
                  <TableRow
                    key={o.id}
                    className={cn('cursor-pointer transition-colors hover:bg-muted/30', !o.ativo && 'opacity-50')}
                    onClick={() => router.push(`/servicos/${o.id}`)}
                  >
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium border', cores.bg, cores.text, cores.border)}>
                        {o.categoria ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="overflow-hidden" title={o.descricao ?? o.nome}>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium text-sm leading-tight truncate">{o.nome}</span>
                        <span className="text-[11px] text-muted-foreground line-clamp-1 leading-tight">
                          {o.descricao ? o.descricao.split('.')[0] : '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell truncate" title={descreverRecorrencia(o.recorrencia)}>
                      <span className="text-xs text-muted-foreground">{descreverRecorrencia(o.recorrencia)}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell whitespace-nowrap">
                      {o.proximaExecucao ? (
                        <span
                          className="inline-flex items-center gap-1.5"
                          title={
                            dias === null ? '' :
                            dias === 0 ? 'Vence hoje' :
                            dias > 0 ? `Vence em ${dias} dia${dias > 1 ? 's' : ''}` :
                            `${Math.abs(dias)} dia${Math.abs(dias) > 1 ? 's' : ''} de atraso`
                          }
                        >
                          <CalendarDays
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              isAtrasada ? 'text-red-500' : isProxima ? 'text-amber-500' : 'text-muted-foreground',
                            )}
                          />
                          <span
                            className={cn(
                              'text-xs tabular-nums',
                              isAtrasada ? 'text-red-600 font-medium' : isProxima ? 'text-amber-700 font-medium' : 'text-muted-foreground',
                            )}
                          >
                            {formatDataBR(o.proximaExecucao)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-center whitespace-nowrap">
                      <Badge
                        variant={o.ativo ? 'default' : 'outline'}
                        className={cn(
                          'h-5 text-[10px]',
                          o.ativo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'text-muted-foreground',
                        )}
                      >
                        {o.ativo ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => router.push(`/servicos/${o.id}`)}>
                              <Pencil className="h-4 w-4" />Editar detalhes
                            </DropdownMenuItem>
                            {o.fonteUrl && (
                              <DropdownMenuItem onClick={() => window.open(o.fonteUrl!, '_blank', 'noopener')}>
                                <ExternalLink className="h-4 w-4" />Abrir fonte oficial
                              </DropdownMenuItem>
                            )}
                            {o.documentacaoUrl && (
                              <DropdownMenuItem onClick={() => window.open(o.documentacaoUrl!, '_blank', 'noopener')}>
                                <FileText className="h-4 w-4" />Abrir documentação
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleToggleAtivo(o.id, o.nome, o.ativo)}>
                              {o.ativo ? (
                                <>
                                  <PowerOff className="h-4 w-4" />Desativar
                                </>
                              ) : (
                                <>
                                  <Power className="h-4 w-4" />Reativar
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Exibindo <span className="font-medium text-foreground">{items.length}</span> obrigação{items.length === 1 ? '' : 'ões'}
            {filtrosAtivos > 0 && <> com filtros aplicados</>}
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Templates globais — disponíveis para todos os clientes
          </span>
        </div>
      </Card>
      )}

      <AuditoriaDialog
        open={auditoriaOpen}
        onOpenChange={setAuditoriaOpen}
        onAfterApply={() => fetchData()}
      />
    </div>
  )
}
