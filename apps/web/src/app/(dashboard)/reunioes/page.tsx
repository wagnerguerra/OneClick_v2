'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Video, Trash2, Pencil, Loader2, AlertTriangle, Settings, ListTodo,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const PAGE_SIZES = [10, 20, 50]

interface Row {
  id: string
  numero: number | null
  titulo: string
  data: string
  horaInicio: string | null
  local: string | null
  tipo: { id: string; nome: string } | null
  cliente: { id: string; razaoSocial: string } | null
  area: { id: string; name: string } | null
  autor: { id: string; name: string } | null
  acoesPendentes: number
  acoesVencidas: number
  _count: { participantes: number; acoes: number; arquivos: number }
}
interface Opcao { id: string; nome: string }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export default function ReunioesPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'reunioes')?.subPermissions ?? {}) as Record<string, boolean>
  const podeRegistrar = isMaster || isEmpresaMaster || subs.registrar === true
  const podeExcluir = isMaster || isEmpresaMaster || subs.excluir === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [pendentes, setPendentes] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tipos, setTipos] = useState<Opcao[]>([])

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.reuniao as any).listarTipos.query({}).then(setTipos).catch(() => setTipos([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.reuniao as any).listar.query({
        page, limit,
        search: debounced || undefined,
        tipoId: tipoId || undefined,
        comAcaoPendente: pendentes || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, tipoId, pendentes])
  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(r: Row) {
    const ok = await alerts.confirm({
      title: `Excluir "${r.titulo}"?`,
      text: 'A reunião, as ações e o histórico serão apagados.',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.reuniao as any).excluir.mutate({ id: r.id })
      alerts.success('Excluída', 'Reunião removida.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  const filtrosAtivos = (tipoId ? 1 : 0) + (pendentes ? 1 : 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Video className="h-6 w-6" />
          </div>
          <div>
            <h1>Reuniões</h1>
            <p className="text-sm text-muted-foreground">Atas, participantes e o plano de ação de cada reunião</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/reunioes/acoes"><ListTodo className="h-4 w-4" />Minhas ações</Link>
          </Button>
          {podeRegistrar && (
            <Button variant="success" size="sm" asChild>
              <Link href="/reunioes/new"><Plus className="h-4 w-4" />Nova Reunião</Link>
            </Button>
          )}
          {podeRegistrar && (
            <Button variant="outline" size="icon-sm" asChild title="Tipos de reunião">
              <Link href="/reunioes/configuracoes"><Settings className="h-4 w-4" /></Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tipoId || '__all__'} onValueChange={(v) => { setTipoId(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[170px] text-xs bg-card"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* O badge de pendências que o v1 mostrava no menu, agora como filtro. */}
            <Button variant={pendentes ? 'default' : 'outline'} size="xs"
              className={pendentes ? 'text-white' : ''}
              style={pendentes ? { backgroundColor: MODULE_COLOR } : undefined}
              onClick={() => { setPendentes((v) => !v); setPage(1) }}>
              <AlertTriangle className="h-3.5 w-3.5" />Com ação pendente
            </Button>
            {filtrosAtivos > 0 && (
              <Button variant="outline" size="xs" onClick={() => { setTipoId(''); setPendentes(false); setPage(1) }}>
                Limpar ({filtrosAtivos})
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por título, local, cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Nº</TableHead>
              <TableHead>Reunião</TableHead>
              <TableHead className="hidden lg:table-cell w-[140px]">Tipo</TableHead>
              <TableHead className="hidden sm:table-cell w-[110px]">Data</TableHead>
              <TableHead className="hidden md:table-cell w-[80px] text-center">Partic.</TableHead>
              <TableHead className="w-[160px]">Ações da reunião</TableHead>
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
                Nenhuma reunião encontrada.
              </TableCell></TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/reunioes/${r.id}`)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{r.numero ?? '—'}</TableCell>
                  <TableCell className="font-medium text-sm">
                    <span className="block truncate" title={r.titulo}>{r.titulo}</span>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {[r.cliente?.razaoSocial, r.local].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate">{r.tipo?.nome ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(r.data)}</TableCell>
                  <TableCell className="hidden md:table-cell text-center text-sm tabular-nums">{r._count.participantes}</TableCell>
                  <TableCell>
                    {r._count.acoes === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : r.acoesPendentes === 0 ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                        {r._count.acoes} concluída{r._count.acoes === 1 ? '' : 's'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn('text-[10px]',
                        r.acoesVencidas > 0
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800')}>
                        {r.acoesVencidas > 0 && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                        {r.acoesPendentes} pendente{r.acoesPendentes === 1 ? '' : 's'}
                        {r.acoesVencidas > 0 ? ` (${r.acoesVencidas} vencida${r.acoesVencidas === 1 ? '' : 's'})` : ''}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/reunioes/${r.id}`)} title="Abrir">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {podeExcluir && (
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(r)} title="Excluir">
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
