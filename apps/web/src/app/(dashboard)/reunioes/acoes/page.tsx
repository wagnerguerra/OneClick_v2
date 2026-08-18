'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ListTodo, Loader2, Check, AlertTriangle, Users,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BackButton } from '@/components/ui/back-button'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const PAGE_SIZES = [10, 20, 50]

interface Row {
  id: string; descricao: string; status: string; prazo: string | null
  responsavelNome: string | null
  responsavel: { id: string; name: string } | null
  reuniao: { id: string; numero: number | null; titulo: string; data: string; cliente: { razaoSocial: string } | null }
}

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/**
 * O que ficou pendente das reuniões — a pergunta que o v1 só respondia como um
 * número solto no menu, sem dizer de quem nem de qual reunião. Por padrão traz
 * as ações do próprio usuário; quem tem `ver_todas` pode abrir para a equipe.
 */
export default function AcoesReunioesPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'reunioes')?.subPermissions ?? {}) as Record<string, boolean>
  const podeVerTodas = isMaster || isEmpresaMaster || subs.ver_todas === true

  const [status, setStatus] = useState('PENDENTE')
  const [vencidas, setVencidas] = useState(false)
  const [todos, setTodos] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.reuniao as any).listarAcoes.query({
        page, limit,
        status: status || undefined,
        somenteVencidas: vencidas || undefined,
        todosResponsaveis: todos || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, status, vencidas, todos])
  useEffect(() => { fetchData() }, [fetchData])

  async function concluir(a: Row) {
    setActing(true)
    try {
      await (trpc.reuniao as any).concluirAcao.mutate({ id: a.id, concluida: true })
      alerts.success('Concluída', 'Ação baixada.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setActing(false) }
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <ListTodo className="h-6 w-6" />
          </div>
          <div>
            <h1>Ações das Reuniões</h1>
            <p className="text-sm text-muted-foreground">O que ficou combinado e ainda não foi feito</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/reunioes" label="Voltar" />
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status || '__all__'} onValueChange={(v) => { setStatus(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                <SelectItem value="PENDENTE">Pendentes</SelectItem>
                <SelectItem value="CONCLUIDA">Concluídas</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={vencidas ? 'default' : 'outline'} size="xs"
              className={vencidas ? 'text-white' : ''}
              style={vencidas ? { backgroundColor: MODULE_COLOR } : undefined}
              onClick={() => { setVencidas((v) => !v); setPage(1) }}>
              <AlertTriangle className="h-3.5 w-3.5" />Só vencidas
            </Button>
            {podeVerTodas && (
              <Button variant={todos ? 'default' : 'outline'} size="xs"
                className={todos ? 'text-white' : ''}
                style={todos ? { backgroundColor: MODULE_COLOR } : undefined}
                onClick={() => { setTodos((v) => !v); setPage(1) }}>
                <Users className="h-3.5 w-3.5" />Toda a equipe
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Ação</TableHead>
              <TableHead className="hidden md:table-cell w-[200px]">Reunião</TableHead>
              <TableHead className="hidden sm:table-cell w-[160px]">Responsável</TableHead>
              <TableHead className="w-[120px]">Prazo</TableHead>
              <TableHead className="w-[110px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                Nada pendente por aqui.
              </TableCell></TableRow>
            ) : (
              data.data.map((a) => {
                const vencida = a.status === 'PENDENTE' && a.prazo && a.prazo.slice(0, 10) < hoje
                return (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/reunioes/${a.reuniao.id}`)}>
                    <TableCell className="text-sm">
                      <span className={cn('block truncate', a.status === 'CONCLUIDA' && 'line-through text-muted-foreground')} title={a.descricao}>
                        {a.descricao}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      <Link href={`/reunioes/${a.reuniao.id}`} className="hover:text-foreground truncate block" onClick={(e) => e.stopPropagation()}>
                        {a.reuniao.titulo} · {dataBR(a.reuniao.data)}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground truncate">
                      {a.responsavel?.name ?? a.responsavelNome ?? '—'}
                    </TableCell>
                    <TableCell>
                      {a.prazo ? (
                        <Badge variant="outline" className={cn('text-[10px] tabular-nums',
                          vencida
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800'
                            : 'bg-muted text-muted-foreground border-border')}>
                          {vencida && <AlertTriangle className="h-3 w-3 mr-0.5" />}{dataBR(a.prazo)}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        {a.status === 'PENDENTE' && (
                          <Button size="xs" variant="success" disabled={acting} onClick={() => concluir(a)}>
                            <Check className="h-3.5 w-3.5" />Concluir
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? 'Mostrando 0 registros' : (<>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</>)}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">{page} / {totalPages}</span>
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
