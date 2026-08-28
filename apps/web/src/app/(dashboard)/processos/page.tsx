'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Loader2, Eye, LayoutDashboard,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  CheckCircle2, XCircle, PlayCircle, AlertTriangle, Clock,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { UserAvatar } from '@/components/ui/user-avatar'
import { BADGE, FILL } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)' // sky (bloco Administrativo)
const PAGE_SIZES = [10, 20, 50]

interface ProcessoListItem {
  id: string
  nome: string
  status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO'
  iniciadoEm: string
  concluidoEm: string | null
  orcamentoId: string | null
  cliente: { id: string; razaoSocial: string; documento: string } | null
  servicoRaiz: { id: string; nome: string } | null
  responsavel: { id: string; name: string; image: string | null } | null
  progresso: { total: number; concluidas: number; pendentes: number }
  prazo: { atrasadas: number; proximoPrazo: string | null }
  _count: { execucoes: number }
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const STATUS_LABELS: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

// EM_ANDAMENTO = sky (cor do módulo Administrativo, retingida sob .mod-administrativo);
// CONCLUIDO/CANCELADO = status universais. Todos derivam do helper BADGE.
const STATUS_BADGE: Record<string, string> = {
  EM_ANDAMENTO: BADGE.sky,
  CONCLUIDO:    BADGE.emerald,
  CANCELADO:    BADGE.rose,
}

export default function ProcessosPage() {
  const router = useRouter()
  const [items, setItems] = useState<ProcessoListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const fetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await (trpc.processo as any).list.query({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      }) as PaginatedResponse<ProcessoListItem>
      setItems(result.data)
      setTotal(result.total)
    } catch (e) {
      alerts.error('Erro ao carregar processos', (e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, limit, debouncedSearch, statusFilter])

  useEffect(() => { fetch() }, [fetch])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button
            size="sm"
            onClick={() => router.push('/processos/painel')}
            style={{ backgroundColor: MODULE_COLOR }}
            className="text-white gap-1.5"
          >
            <LayoutDashboard className="h-4 w-4" />
            Painel Operacional
          </Button>
        </>}
      >
        <h1 className="truncate">Processos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administrativo</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Processos</span>
        </p>
      </PageHeaderBar>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome do processo ou cliente..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={statusFilter || '__all__'} onValueChange={v => { setStatusFilter(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-9 text-sm sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
            <SelectItem value="CONCLUIDO">Concluído</SelectItem>
            <SelectItem value="CANCELADO">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Processo / Cliente</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden md:table-cell">Prazo</TableHead>
              <TableHead className="hidden md:table-cell">Progresso</TableHead>
              <TableHead className="hidden lg:table-cell">Responsável</TableHead>
              <TableHead className="hidden lg:table-cell">Iniciado</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center py-12">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                Nenhum processo encontrado.
              </TableCell></TableRow>
            )}
            {!loading && items.map(p => {
              const pct = p.progresso.total > 0
                ? Math.round((p.progresso.concluidas / p.progresso.total) * 100)
                : 0
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(`/processos/${p.id}`)}
                >
                  <TableCell>
                    <div className="font-semibold text-sm leading-tight">{p.nome}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[420px]">
                      {p.cliente?.razaoSocial || '—'}
                      {p.servicoRaiz && (
                        <> · <span className="text-foreground/60">raiz: {p.servicoRaiz.nome}</span></>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className={`text-[10px] h-5 ${STATUS_BADGE[p.status]}`}>
                      {p.status === 'EM_ANDAMENTO' && <PlayCircle className="h-2.5 w-2.5 mr-1" />}
                      {p.status === 'CONCLUIDO' && <CheckCircle2 className="h-2.5 w-2.5 mr-1" />}
                      {p.status === 'CANCELADO' && <XCircle className="h-2.5 w-2.5 mr-1" />}
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <PrazoBadge status={p.status} prazo={p.prazo} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="space-y-1 min-w-[140px]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium tabular-nums">
                          {p.progresso.concluidas}/{p.progresso.total}
                        </span>
                        <span className="text-muted-foreground tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full transition-all', p.status === 'CONCLUIDO' ? FILL.emerald : FILL.sky)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {p.responsavel ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar user={p.responsavel} className="h-6 w-6 text-[10px]" bg="bg-sky-500" />
                        <span className="text-xs">{p.responsavel.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground tabular-nums">
                    {new Date(p.iniciadoEm).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="icon-xs"
                      onClick={() => router.push(`/processos/${p.id}`)}
                      title="Abrir"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Paginação */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Itens por página</span>
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[70px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground tabular-nums">
              {(page - 1) * limit + 1}-{Math.min(page * limit, total)} de {total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => setPage(1)} disabled={page === 1}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon-xs" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon-xs" onClick={() => setPage(totalPages)} disabled={page >= totalPages}><ChevronsRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PrazoBadge — indicador agregado de prazo para um processo.
// Lógica: pior caso entre as execuções ativas (atrasado > vencendo > no prazo).
// ─────────────────────────────────────────────────────────────
function PrazoBadge({ status, prazo }: {
  status: ProcessoListItem['status']
  prazo: { atrasadas: number; proximoPrazo: string | null }
}) {
  // Processos finalizados/cancelados não mostram prazo
  if (status !== 'EM_ANDAMENTO') {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  // Tem alguma execução atrasada
  if (prazo.atrasadas > 0) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 rounded-md text-[11px] font-semibold px-2 py-0.5 border', BADGE.red)}
        title={`${prazo.atrasadas} execução(ões) com prazo vencido`}
      >
        <AlertTriangle className="h-3 w-3" />
        Atrasado
        {prazo.atrasadas > 1 && <span className="tabular-nums">×{prazo.atrasadas}</span>}
      </span>
    )
  }

  // Sem prazo próximo (ex: só execuções AGUARDANDO_INICIO)
  if (!prazo.proximoPrazo) {
    return <span className="text-xs text-muted-foreground italic">sem prazo</span>
  }

  const agora = new Date()
  const proximo = new Date(prazo.proximoPrazo)
  const diffDias = Math.ceil((proximo.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDias <= 3) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 rounded-md text-[11px] font-semibold px-2 py-0.5 border', BADGE.amber)}
        title={`Próximo prazo: ${proximo.toLocaleDateString('pt-BR')}`}
      >
        <Clock className="h-3 w-3" />
        {diffDias === 0 ? 'Vence hoje' : `Vence em ${diffDias}d`}
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md text-[11px] font-semibold px-2 py-0.5 border', BADGE.emerald)}
      title={`Próximo prazo: ${proximo.toLocaleDateString('pt-BR')}`}
    >
      <CheckCircle2 className="h-3 w-3" />
      No prazo
      <span className="text-muted-foreground font-normal">({diffDias}d)</span>
    </span>
  )
}
