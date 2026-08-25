'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Pencil, Loader2, Check,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search as SearchIcon,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import Link from 'next/link'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderBar } from '@/components/page-header-bar'
import { UserCombobox } from '../orcamentos/_components/user-combobox'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const PAGE_SIZES = [10, 20, 50]

interface Row {
  id: string
  legacyId: number | null
  colaboradorNomeResolvido: string | null
  periodoInicial: number
  periodoFinal: number
  descricao: string | null
  dias: number
  saldoAnterior: number
  gozados: number
  saldo: number
  previsao: string | null
  pago: boolean
  historico: boolean
  eventosTotal: number
  arquivosTotal: number
}
interface Usuario { id: string; name: string; email: string | null; image: string | null }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/**
 * Controle de Férias — port do crp_ferias do v1. Um registro por período
 * aquisitivo; o saldo chega derivado do backend (dias + anterior − gozados).
 */
export default function ControleFeriasPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'controle-ferias')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [fColaborador, setFColaborador] = useState('')
  const [fSituacao, setFSituacao] = useState('ABERTOS')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Modal novo período
  const [aberta, setAberta] = useState(false)
  const [mColaborador, setMColaborador] = useState('')
  const [mAnoIni, setMAnoIni] = useState(String(new Date().getFullYear() - 1))
  const [mAnoFim, setMAnoFim] = useState(String(new Date().getFullYear()))
  const [mDias, setMDias] = useState('30')
  const [mSaldoAnt, setMSaldoAnt] = useState('0')
  const [mDescricao, setMDescricao] = useState('PERÍODO AQUISITIVO')
  const [mPrevisao, setMPrevisao] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.controleFerias as any).listarColaboradores.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.controleFerias as any).listar.query({
        page, limit,
        search: debounced || undefined,
        colaboradorId: fColaborador || undefined,
        situacao: fSituacao || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, fColaborador, fSituacao])
  useEffect(() => { fetchData() }, [fetchData])

  async function salvar() {
    if (!mColaborador) { alerts.error('Falta o colaborador', ''); return }
    setSalvando(true)
    try {
      const { id } = await (trpc.controleFerias as any).criar.mutate({
        colaboradorId: mColaborador,
        periodoInicial: Number(mAnoIni),
        periodoFinal: Number(mAnoFim),
        dias: Number(mDias) || 30,
        saldoAnterior: Number(mSaldoAnt) || 0,
        descricao: mDescricao || null,
        previsao: mPrevisao || null,
      })
      alerts.success('Criado', 'Período aquisitivo registrado.')
      setAberta(false)
      router.push(`/controle-ferias/${id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function handleDelete(r: Row) {
    const ok = await alerts.confirm({
      title: `Excluir o período ${r.periodoInicial}/${r.periodoFinal}?`,
      text: 'Os gozos e recibos do período vão junto.',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.controleFerias as any).excluir.mutate({ id: r.id })
      alerts.success('Excluído', '')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  return (
    <div className="space-y-6">
      {/* Header padrão (como o /clientes): barra full-bleed, título + trilha, ações à direita */}
      <PageHeaderBar
        actions={<>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por colaborador..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-60 pl-8 text-sm" />
          </div>
          {podeEscrever && (
            <Button size="sm" className="gap-1.5" onClick={() => setAberta(true)}>
              <Plus className="h-4 w-4" />Novo Período
            </Button>
          )}
        </>}
      >
        <h1 className="truncate">Controle de Férias</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Trabalhista</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Controle de Férias</span>
        </p>
      </PageHeaderBar>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fSituacao || '__all__'} onValueChange={(v) => { setFSituacao(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="ABERTOS">Em aberto</SelectItem>
                <SelectItem value="HISTORICO">Histórico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fColaborador || '__all__'} onValueChange={(v) => { setFColaborador(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[210px] text-xs bg-card"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os colaboradores</SelectItem>
                {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {(fColaborador || fSituacao !== 'ABERTOS') && (
              <Button variant="outline" size="xs" onClick={() => { setFColaborador(''); setFSituacao('ABERTOS'); setPage(1) }}>
                Limpar
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
            <TableRow className="[&_th]:whitespace-nowrap">
              <TableHead>Colaborador</TableHead>
              <TableHead className="w-[110px] text-center">Período</TableHead>
              <TableHead className="w-[70px] text-center">Dias</TableHead>
              <TableHead className="w-[80px] text-center">Gozados</TableHead>
              <TableHead className="w-[70px] text-center">Saldo</TableHead>
              <TableHead className="hidden sm:table-cell w-[105px]">Previsão</TableHead>
              <TableHead className="hidden md:table-cell w-[110px]">Situação</TableHead>
              <TableHead className="w-[100px] pr-5 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum período encontrado.
              </TableCell></TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer [&_td]:whitespace-nowrap [&_td]:py-2" onClick={() => router.push(`/controle-ferias/${r.id}`)}>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium">{r.colaboradorNomeResolvido ?? '—'}</span>
                      {r.descricao && <span className="truncate text-[11px] text-muted-foreground">· {r.descricao}</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.periodoInicial}/{r.periodoFinal}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.dias + r.saldoAnterior}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.gozados}</TableCell>
                  <TableCell className="text-center">
                    <span className={cn('inline-flex h-6 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-bold tabular-nums',
                      r.saldo <= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : r.saldo < 10 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300')}>
                      {r.saldo}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(r.previsao)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1 flex-wrap">
                      {r.historico && <Badge variant="outline" className="text-[10px]">Histórico</Badge>}
                      {r.pago && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                          <Check className="h-3 w-3 mr-0.5" />Pago
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/controle-ferias/${r.id}`)} title="Abrir">
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

      {/* ── Modal: novo período ── */}
      <Dialog open={aberta} onOpenChange={(o) => { if (!salvando) setAberta(o) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Novo período aquisitivo</DialogTitle>
            <DialogDescription>Os gozos, pagamentos e recibos entram no detalhe do período.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Colaborador <span className="text-rose-500">*</span></Label>
                <div className="mt-1.5">
                  <UserCombobox users={usuarios} value={mColaborador} onSelect={setMColaborador} placeholder="Selecione o colaborador" />
                </div>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Ano inicial</Label>
                <Input type="number" value={mAnoIni} onChange={(e) => setMAnoIni(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Ano final</Label>
                <Input type="number" value={mAnoFim} onChange={(e) => setMAnoFim(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Dias</Label>
                <Input type="number" value={mDias} onChange={(e) => setMDias(e.target.value)} className="h-9 text-sm mt-1.5" min="0" max="60" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Saldo anterior</Label>
                <Input type="number" value={mSaldoAnt} onChange={(e) => setMSaldoAnt(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <Input value={mDescricao} onChange={(e) => setMDescricao(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={200} />
              </div>
              <div className="col-span-12 sm:col-span-5">
                <Label className="text-[13px] font-semibold">Previsão de gozo</Label>
                <Input type="date" value={mPrevisao} onChange={(e) => setMPrevisao(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAberta(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
