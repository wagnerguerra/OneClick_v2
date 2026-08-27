'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Pencil, Loader2, AlertTriangle, Settings,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { CAPACITACAO_STATUS_LABEL, CAPACITACAO_AMBITO_LABEL } from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const PAGE_SIZES = [10, 20, 50]

export const STATUS_COLORS: Record<string, string> = {
  SOLICITADA: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  AGUARDANDO_AUTORIZACAO: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  AUTORIZADA: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800',
  AVALIADA: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  FINALIZADA: 'bg-muted text-muted-foreground border-border',
  CANCELADA: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
}
const STATUS_OPCOES = ['SOLICITADA', 'AGUARDANDO_AUTORIZACAO', 'AUTORIZADA', 'AVALIADA', 'FINALIZADA', 'CANCELADA']

interface Row {
  id: string
  legacyId: number | null
  titulo: string
  ambito: string
  status: string
  dataInicio: string
  cargaHoraria: number | null
  custo: number | null
  instrutor: string | null
  organizacao: string | null
  prazoAvaliacao: string | null
  avaliadaEm: string | null
  objetivosAtingidos: boolean | null
  avaliacaoVencida: boolean
  metodo: { id: string; nome: string } | null
  _count: { participantes: number; anexos: number }
}
interface Opcao { id: string; nome: string }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export default function CapacitacoesPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'capacitacoes')?.subPermissions ?? {}) as Record<string, boolean>
  const podeSolicitar = isMaster || isEmpresaMaster || subs.solicitar === true
  const podeGerenciar = isMaster || isEmpresaMaster || subs.gerenciar === true
  const podeExcluir = isMaster || isEmpresaMaster || subs.excluir === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [metodoId, setMetodoId] = useState('')
  const [vencidas, setVencidas] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [metodos, setMetodos] = useState<Opcao[]>([])

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.capacitacao as any).listarMetodos.query({}).then(setMetodos).catch(() => setMetodos([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.capacitacao as any).listar.query({
        page, limit,
        search: debounced || undefined,
        status: status || undefined,
        metodoId: metodoId || undefined,
        avaliacaoVencida: vencidas || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, status, metodoId, vencidas])
  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(c: Row) {
    const ok = await alerts.confirm({
      title: `Excluir "${c.titulo}"?`,
      text: `A capacitação e os seus ${c._count.participantes} participante(s) serão apagados.`,
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.capacitacao as any).excluir.mutate({ id: c.id })
      alerts.success('Excluída', 'Capacitação removida.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  const filtrosAtivos = [status, metodoId].filter(Boolean).length + (vencidas ? 1 : 0)

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {podeSolicitar && (
            <Button variant="success" size="sm" asChild>
              <Link href="/capacitacoes/new"><Plus className="h-4 w-4" />Nova Capacitação</Link>
            </Button>
          )}
          {podeGerenciar && (
            <Button variant="outline" size="icon-sm" asChild title="Métodos">
              <Link href="/capacitacoes/configuracoes"><Settings className="h-4 w-4" /></Link>
            </Button>
          )}
      </>}>
        <h1 className="truncate">Capacitações</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Capacitações</span>
        </p>
      </PageHeaderBar>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status || '__all__'} onValueChange={(v) => { setStatus(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[190px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {STATUS_OPCOES.map((s) => <SelectItem key={s} value={s}>{CAPACITACAO_STATUS_LABEL[s as keyof typeof CAPACITACAO_STATUS_LABEL]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={metodoId || '__all__'} onValueChange={(v) => { setMetodoId(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-card"><SelectValue placeholder="Método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os métodos</SelectItem>
                {metodos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* O v1 tinha o prazo de avaliação no cadastro e ninguém era cobrado
                por ele: 124 das 299 nunca foram avaliadas. Este filtro é a
                resposta a isso. */}
            <Button variant={vencidas ? 'default' : 'outline'} size="xs"
              className={vencidas ? 'text-white' : ''}
              style={vencidas ? { backgroundColor: MODULE_COLOR } : undefined}
              onClick={() => { setVencidas((v) => !v); setPage(1) }}>
              <AlertTriangle className="h-3.5 w-3.5" />Avaliação vencida
            </Button>
            {filtrosAtivos > 0 && (
              <Button variant="outline" size="xs" onClick={() => { setStatus(''); setMetodoId(''); setVencidas(false); setPage(1) }}>
                Limpar ({filtrosAtivos})
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por título, instrutor..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Nº</TableHead>
              <TableHead>Capacitação</TableHead>
              <TableHead className="hidden lg:table-cell w-[130px]">Método</TableHead>
              <TableHead className="hidden sm:table-cell w-[110px]">Data</TableHead>
              <TableHead className="hidden md:table-cell w-[80px] text-center">Partic.</TableHead>
              <TableHead className="w-[180px]">Situação</TableHead>
              <TableHead className="w-[90px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma capacitação encontrada.
              </TableCell></TableRow>
            ) : (
              data.data.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/capacitacoes/${c.id}`)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{c.legacyId ?? '—'}</TableCell>
                  <TableCell className="font-medium text-sm">
                    <span className="block truncate" title={c.titulo}>{c.titulo}</span>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {[CAPACITACAO_AMBITO_LABEL[c.ambito as keyof typeof CAPACITACAO_AMBITO_LABEL], c.instrutor, c.organizacao].filter(Boolean).join(' · ')}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate">{c.metodo?.nome ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(c.dataInicio)}</TableCell>
                  <TableCell className="hidden md:table-cell text-center text-sm tabular-nums">{c._count.participantes}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[c.status])}>
                        {CAPACITACAO_STATUS_LABEL[c.status as keyof typeof CAPACITACAO_STATUS_LABEL] ?? c.status}
                      </Badge>
                      {/* Derivado no backend — a tela só compõe. */}
                      {c.avaliacaoVencida && (
                        <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800"
                          title={`Prazo de avaliação venceu em ${dataBR(c.prazoAvaliacao)}`}>
                          <AlertTriangle className="h-3 w-3 mr-0.5" />Avaliação vencida
                        </Badge>
                      )}
                      {c.objetivosAtingidos === false && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                          Objetivos não atingidos
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/capacitacoes/${c.id}`)} title="Abrir">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {podeExcluir && (
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(c)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
