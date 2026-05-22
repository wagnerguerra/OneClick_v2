'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ClipboardCheck, Search, Loader2, Filter,
  MoreVertical, CalendarDays, List, LayoutGrid,
  CheckCircle2, AlertCircle, Clock, History, FileText,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { EntregarDialog } from './_components/entregar-dialog'
import { LogDialog } from './_components/log-dialog'
import { CalendarioMinhasObrigacoes } from './_components/calendario-minhas-obrigacoes'

const MODULE_COLOR = 'var(--mod-corporativo, #0ea5e9)' // Sky (Administrativo)

type StatusFiltro = 'TODOS' | 'PENDENTES' | 'ATRASADAS' | 'CONCLUIDAS'

interface MinhaObrigacao {
  id: string
  status: string
  prazoLimite: string | null
  acessoriasPrazo: string | null
  acessoriasComp: string | null
  prazoEfetivo: string | null
  atrasada: boolean
  entregueEm: string | null
  servico: { id: string; nome: string; categoria: string | null; mininome: string | null; ehObrigacaoAcessoria: boolean }
  cliente: { id: string; razaoSocial: string; tributacao: string | null } | null
  responsavel: { id: string; name: string; image: string | null } | null
}

interface Stats {
  total: number
  pendentes: number
  atrasadas: number
  concluidas: number
}

function formatDataBR(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCompetencia(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
}

function diasAteVencimento(d: string | null): number | null {
  if (!d) return null
  const dt = new Date(d)
  const ms = dt.getTime() - Date.now()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export default function MinhasObrigacoesPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('PENDENTES')
  const [filtroArea, setFiltroArea] = useState<string>('TODAS')
  const [view, setView] = useState<'tabela' | 'calendario'>('tabela')
  const [items, setItems] = useState<MinhaObrigacao[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const [entregarOpen, setEntregarOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [selecionada, setSelecionada] = useState<MinhaObrigacao | null>(null)

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t) }, [search])

  async function fetchData() {
    setLoading(true)
    try {
      const [list, st] = await Promise.all([
        trpc.minhasObrigacoes.list.query({
          status: filtroStatus,
          area: filtroArea === 'TODAS' ? undefined : filtroArea,
          search: debouncedSearch || undefined,
        }),
        trpc.minhasObrigacoes.stats.query(),
      ])
      setItems(list as unknown as MinhaObrigacao[])
      setStats(st)
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Não foi possível carregar suas obrigações.')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [debouncedSearch, filtroStatus, filtroArea])

  const areasDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.servico.categoria) set.add(i.servico.categoria)
    return Array.from(set).sort()
  }, [items])

  const filtrosAtivos = useMemo(
    () => [filtroStatus !== 'PENDENTES', filtroArea !== 'TODAS', !!debouncedSearch].filter(Boolean).length,
    [filtroStatus, filtroArea, debouncedSearch],
  )

  function handleEntregar(item: MinhaObrigacao) {
    setSelecionada(item)
    setEntregarOpen(true)
  }

  function handleVerLog(item: MinhaObrigacao) {
    setSelecionada(item)
    setLogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ backgroundColor: MODULE_COLOR }}
          >
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div>
            <h1>Minhas Obrigações</h1>
            <p className="text-sm text-muted-foreground">
              Painel das obrigações sob sua responsabilidade — direta ou por área contratada
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{stats.total}</div>
            <div className="text-[11px] text-muted-foreground">no escopo</div>
          </Card>
          <Card className="p-3 border-l-2 border-amber-300">
            <div className="text-[11px] uppercase tracking-wide text-amber-700">Pendentes</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{stats.pendentes}</div>
            <div className="text-[11px] text-muted-foreground">a entregar</div>
          </Card>
          <Card className="p-3 border-l-2 border-red-300">
            <div className="text-[11px] uppercase tracking-wide text-red-700">Atrasadas</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{stats.atrasadas}</div>
            <div className="text-[11px] text-muted-foreground">prazo expirado</div>
          </Card>
          <Card className="p-3 border-l-2 border-emerald-300">
            <div className="text-[11px] uppercase tracking-wide text-emerald-700">Concluídas</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{stats.concluidas}</div>
            <div className="text-[11px] text-muted-foreground">entregues</div>
          </Card>
        </div>
      )}

      {view === 'calendario' ? (
        <CalendarioMinhasObrigacoes
          items={items}
          loading={loading}
          onSelecionar={(item) => handleEntregar(item)}
        />
      ) : (
        <Card>
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filtros</span>
                {filtrosAtivos > 0 && <Badge variant="outline" className="h-5 text-[10px]">{filtrosAtivos}</Badge>}
              </div>
              <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as StatusFiltro)}>
                <SelectTrigger className="h-8 w-[130px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="PENDENTES">Pendentes</SelectItem>
                  <SelectItem value="ATRASADAS">Atrasadas</SelectItem>
                  <SelectItem value="CONCLUIDAS">Concluídas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroArea} onValueChange={setFiltroArea}>
                <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas as áreas</SelectItem>
                  {areasDisponiveis.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="relative max-w-xs w-full sm:w-[260px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar obrigação ou cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-card"
              />
            </div>
          </div>

          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-auto whitespace-nowrap">Cliente</TableHead>
                <TableHead className="w-auto whitespace-nowrap">Obrigação</TableHead>
                <TableHead className="hidden lg:table-cell w-[100px] whitespace-nowrap">Competência</TableHead>
                <TableHead className="hidden md:table-cell w-[140px] whitespace-nowrap">Vencimento</TableHead>
                <TableHead className="hidden sm:table-cell w-[100px] text-center whitespace-nowrap">Status</TableHead>
                <TableHead className="w-[80px] text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: MODULE_COLOR }} />
                      Carregando suas obrigações...
                    </div>
                  </TableCell>
                </TableRow>
              ) : !items.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    Nenhuma obrigação no escopo selecionado
                  </TableCell>
                </TableRow>
              ) : (
                items.map((o) => {
                  const dias = diasAteVencimento(o.prazoEfetivo)
                  const isAtrasada = o.atrasada
                  const isProxima = dias !== null && dias >= 0 && dias <= 7
                  const isConcluida = o.status === 'CONCLUIDO'
                  return (
                    <TableRow key={o.id} className={cn('transition-colors hover:bg-muted/30', isConcluida && 'opacity-60')}>
                      <TableCell className="overflow-hidden">
                        <span className="font-medium text-sm leading-tight truncate block" title={o.cliente?.razaoSocial ?? '—'}>
                          {o.cliente?.razaoSocial ?? '—'}
                        </span>
                        {o.cliente?.tributacao && (
                          <span className="text-[10px] text-muted-foreground">{o.cliente.tributacao}</span>
                        )}
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium text-sm leading-tight truncate" title={o.servico.nome}>
                            {o.servico.mininome ?? o.servico.nome}
                          </span>
                          {o.servico.categoria && (
                            <span className="text-[10px] text-muted-foreground capitalize">{o.servico.categoria}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatCompetencia(o.acessoriasComp)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-nowrap">
                        {o.prazoEfetivo ? (
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
                              {formatDataBR(o.prazoEfetivo)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center whitespace-nowrap">
                        {isConcluida ? (
                          <Badge className="h-5 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />Entregue
                          </Badge>
                        ) : isAtrasada ? (
                          <Badge className="h-5 text-[10px] bg-red-100 text-red-700 border-red-200">
                            <AlertCircle className="h-3 w-3 mr-0.5" />Atrasada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 text-[10px]">
                            <Clock className="h-3 w-3 mr-0.5" />Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {!isConcluida && (
                                <DropdownMenuItem onClick={() => handleEntregar(o)}>
                                  <CheckCircle2 className="h-4 w-4" />Marcar como entregue
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleVerLog(o)}>
                                <History className="h-4 w-4" />Ver histórico
                              </DropdownMenuItem>
                              {o.cliente && (
                                <DropdownMenuItem onClick={() => window.open(`/clientes/${o.cliente!.id}`, '_blank')}>
                                  <FileText className="h-4 w-4" />Abrir cliente
                                </DropdownMenuItem>
                              )}
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
              Exibindo <span className="font-medium text-foreground">{items.length}</span> obrigaç{items.length === 1 ? 'ão' : 'ões'}
              {filtrosAtivos > 0 && <> com filtros aplicados</>}
            </span>
          </div>
        </Card>
      )}

      <EntregarDialog
        open={entregarOpen}
        onOpenChange={setEntregarOpen}
        execucao={selecionada}
        onEntregue={() => { fetchData(); setEntregarOpen(false) }}
      />
      <LogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        execucao={selecionada}
      />
    </div>
  )
}
