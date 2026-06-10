'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Clock, Users, FileBarChart, Loader2, CalendarDays, Lock,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, MapPin,
} from 'lucide-react'
import {
  Button, Card, CardContent, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList,
} from 'recharts'
import { trpc } from '@/lib/trpc'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { resolveAssetUrl } from '@/lib/api-url'

const MOD = 'var(--mod-administrativo, #38bdf8)'

interface UserChip { usuarioId: string; nome: string; image: string | null; quantidade: number }
interface PorTipo { tipoId: string; nome: string; cor: string; corBorda: string; quantidade: number; totalMinutos: number; usuarios: UserChip[] }
interface TipoChip { tipoId: string; nome: string; cor: string; quantidade: number }
interface PorUsuario { usuarioId: string; nome: string; image: string | null; quantidade: number; totalMinutos: number; tipos: TipoChip[] }
interface Relatorio { totais: { quantidade: number; totalMinutos: number }; porTipo: PorTipo[]; porUsuario: PorUsuario[] }
interface Usuario { id: string; name: string; image: string | null }
interface Tipo { id: string; nome: string; cor: string; corBorda: string }
interface EventoDrill {
  id: string; titulo: string; data: string; horaInicio: string | null; horaFim: string | null
  diaInteiro: boolean; local: string | null; tipoNome: string; tipoCor: string; minutos: number; participantes: number
}
interface DrillResult { data: EventoDrill[]; total: number; page: number; limit: number; totalPages: number }

function fmtHoras(min: number): string {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function primeiroDiaMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function ultimoDiaMes(d: Date) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

type SortKey = 'nome' | 'quantidade' | 'totalMinutos'
type SortState = { key: SortKey; dir: 'asc' | 'desc' }

function sortRows<T extends { nome: string; quantidade: number; totalMinutos: number }>(rows: T[], s: SortState): T[] {
  const mult = s.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (s.key === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR') * mult
    return (a[s.key] - b[s.key]) * mult
  })
}

/** Cabeçalho de coluna clicável (ordena asc/desc, com indicador). */
function SortableTh({ label, colKey, sort, setSort, align = 'left', className }: {
  label: string
  colKey: SortKey
  sort: SortState
  setSort: (s: SortState) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = sort.key === colKey
  const onClick = () => setSort(
    active
      ? { key: colKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key: colKey, dir: colKey === 'nome' ? 'asc' : 'desc' },
  )
  return (
    <th
      onClick={onClick}
      className={cn('font-semibold px-4 py-2 cursor-pointer select-none hover:text-foreground transition-colors', align === 'right' ? 'text-right' : 'text-left', className)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        {active
          ? (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  )
}

export default function RelatoriosAgendaPage() {
  const { isMaster, permissions, loading: permsLoading } = useUserPermissions()
  const agendaPerm = permissions.find(p => p.moduleSlug === 'agenda')
  const subs = (agendaPerm?.subPermissions ?? {}) as Record<string, boolean>
  const canVer = isMaster || subs.ver_relatorios === true

  const hoje = useMemo(() => new Date(), [])
  const [dataInicio, setDataInicio] = useState(() => primeiroDiaMes(hoje))
  const [dataFim, setDataFim] = useState(() => ultimoDiaMes(hoje))
  const [usuarioId, setUsuarioId] = useState('')
  const [tipoId, setTipoId] = useState('')

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [data, setData] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortTipo, setSortTipo] = useState<SortState>({ key: 'nome', dir: 'asc' })
  const [sortUser, setSortUser] = useState<SortState>({ key: 'nome', dir: 'asc' })

  // Drill-down: clicar numa linha abre modal com os eventos daquela dimensão.
  const [drill, setDrill] = useState<{ label: string; tipoId?: string; usuarioId?: string } | null>(null)
  const [drillPage, setDrillPage] = useState(1)
  const [drillData, setDrillData] = useState<DrillResult | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    if (!drill) return
    setDrillLoading(true)
    ;(trpc.agenda as any).relatorioEventos.query({
      dataInicio, dataFim, tipoId: drill.tipoId, usuarioId: drill.usuarioId, page: drillPage, limit: 10,
    })
      .then((r: DrillResult) => setDrillData(r))
      .catch(() => setDrillData(null))
      .finally(() => setDrillLoading(false))
  }, [drill, drillPage, dataInicio, dataFim])

  const abrirDrillTipo = (t: PorTipo) => { setDrillData(null); setDrillPage(1); setDrill({ label: `Tipo: ${t.nome}`, tipoId: t.tipoId, usuarioId: usuarioId || undefined }) }
  const abrirDrillUsuario = (u: PorUsuario) => { setDrillData(null); setDrillPage(1); setDrill({ label: `Usuário: ${u.nome}`, usuarioId: u.usuarioId, tipoId: tipoId || undefined }) }

  useEffect(() => {
    if (!canVer) return
    Promise.all([
      trpc.agenda.listUsuarios.query().catch(() => []) as Promise<Usuario[]>,
      trpc.agenda.listTipos.query().catch(() => []) as Promise<Tipo[]>,
    ]).then(([u, t]) => { setUsuarios(u); setTipos(t) })
  }, [canVer])

  const carregar = useCallback(async () => {
    if (!canVer || !dataInicio || !dataFim) return
    setLoading(true)
    try {
      const r = await (trpc.agenda as any).relatorio.query({
        dataInicio, dataFim,
        usuarioId: usuarioId || undefined,
        tipoId: tipoId || undefined,
      })
      setData(r as Relatorio)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [canVer, dataInicio, dataFim, usuarioId, tipoId])

  useEffect(() => { void carregar() }, [carregar])

  const chartData = useMemo(
    () => (data?.porTipo ?? []).map(t => ({ nome: t.nome, quantidade: t.quantidade, cor: t.corBorda || t.cor })),
    [data],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="administrativo" icon={FileBarChart} />
          <div>
            <h1>Relatórios da Agenda</h1>
            <p className="text-sm text-muted-foreground">Tempo em reuniões, visitas, cursos e mais — por tipo e por usuário</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Link href="/agenda"><ArrowLeft className="h-4 w-4" /> Voltar à agenda</Link>
        </Button>
      </div>

      {permsLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !canVer ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você não tem permissão para acessar os relatórios da agenda.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Filtros */}
          <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">De</label>
              <input type="date" value={dataInicio} max={dataFim} onChange={e => setDataInicio(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Até</label>
              <input type="date" value={dataFim} min={dataInicio} onChange={e => setDataFim(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Usuário</label>
              <Select value={usuarioId || 'todos'} onValueChange={v => setUsuarioId(v === 'todos' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os usuários</SelectItem>
                  {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Tipo de evento</label>
              <Select value={tipoId || 'todos'} onValueChange={v => setTipoId(v === 'todos' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent></Card>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !data || data.totais.quantidade === 0 ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground italic">
              Nenhum evento no período/filtro selecionado.
            </CardContent></Card>
          ) : (
            <>
              {/* Cards de resumo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card><CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0" style={{ backgroundColor: MOD }}><CalendarDays className="h-5 w-5" /></div>
                  <div><p className="text-2xl font-bold leading-none">{data.totais.quantidade}</p><p className="text-xs text-muted-foreground mt-1">Eventos no período</p></div>
                </CardContent></Card>
                <Card><CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0 bg-sky-500"><Clock className="h-5 w-5" /></div>
                  <div><p className="text-2xl font-bold leading-none">{fmtHoras(data.totais.totalMinutos)}</p><p className="text-xs text-muted-foreground mt-1">Tempo total (com horário)</p></div>
                </CardContent></Card>
                <Card><CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0 bg-violet-500"><Users className="h-5 w-5" /></div>
                  <div><p className="text-2xl font-bold leading-none">{data.porUsuario.length}</p><p className="text-xs text-muted-foreground mt-1">Usuários envolvidos</p></div>
                </CardContent></Card>
              </div>

              {/* Gráfico por tipo */}
              <Card><CardContent className="p-4">
                <h3 className="text-[13px] font-semibold mb-3">Eventos por tipo</h3>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 16, right: 8, left: -16, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                      />
                      <Bar dataKey="quantidade" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="quantidade" position="top" className="fill-foreground" fontSize={11} />
                        {chartData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent></Card>

              {/* Tabelas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Por tipo */}
                <Card><CardContent className="p-0">
                  <h3 className="text-[13px] font-semibold px-4 py-3 border-b border-border">Por tipo de evento</h3>
                  <div className="max-h-[420px] overflow-y-auto nice-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card"><tr className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                      <SortableTh label="Tipo" colKey="nome" sort={sortTipo} setSort={setSortTipo} />
                      <SortableTh label="Qtd." colKey="quantidade" sort={sortTipo} setSort={setSortTipo} align="right" className="w-20" />
                      <SortableTh label="Tempo" colKey="totalMinutos" sort={sortTipo} setSort={setSortTipo} align="right" className="w-28" />
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {sortRows(data.porTipo, sortTipo).map(t => (
                        <tr key={t.tipoId} className="hover:bg-muted/30 cursor-pointer" onClick={() => abrirDrillTipo(t)} title="Ver eventos">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.corBorda || t.cor }} />
                              <span className="truncate">{t.nome}</span>
                              {t.usuarios.length > 0 && (
                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                  {t.usuarios.slice(0, 8).map(u => (
                                    <span
                                      key={u.usuarioId}
                                      title={`${u.nome}: ${u.quantidade}`}
                                      className="inline-flex items-center gap-1 h-[18px] pl-0.5 pr-1.5 rounded-full bg-muted text-[10px] font-semibold text-foreground/80"
                                    >
                                      {u.image
                                        ? <img src={resolveAssetUrl(u.image)} alt={u.nome} className="h-3.5 w-3.5 rounded-full object-cover" />
                                        : <span className="h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center text-[6px] font-bold">{u.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</span>}
                                      {u.quantidade}
                                    </span>
                                  ))}
                                  {t.usuarios.length > 8 && (
                                    <span className="text-[10px] text-muted-foreground" title={`+${t.usuarios.length - 8} usuários`}>+{t.usuarios.length - 8}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap">{t.quantidade}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtHoras(t.totalMinutos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </CardContent></Card>

                {/* Por usuário */}
                <Card><CardContent className="p-0">
                  <h3 className="text-[13px] font-semibold px-4 py-3 border-b border-border">Por usuário</h3>
                  <div className="max-h-[420px] overflow-y-auto nice-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card"><tr className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                      <SortableTh label="Usuário" colKey="nome" sort={sortUser} setSort={setSortUser} />
                      <SortableTh label="Qtd." colKey="quantidade" sort={sortUser} setSort={setSortUser} align="right" className="w-20" />
                      <SortableTh label="Tempo" colKey="totalMinutos" sort={sortUser} setSort={setSortUser} align="right" className="w-28" />
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {sortRows(data.porUsuario, sortUser).map(u => (
                        <tr key={u.usuarioId} className="hover:bg-muted/30 cursor-pointer" onClick={() => abrirDrillUsuario(u)} title="Ver eventos">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {u.image
                                ? <img src={resolveAssetUrl(u.image)} alt={u.nome} className="h-6 w-6 rounded-full object-cover shrink-0" />
                                : <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">{u.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</span>}
                              <span className="truncate">{u.nome}</span>
                              {u.tipos.length > 0 && (
                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                  {u.tipos.slice(0, 8).map(tc => (
                                    <span
                                      key={tc.tipoId}
                                      title={`${tc.nome}: ${tc.quantidade}`}
                                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold leading-none"
                                      style={{ backgroundColor: tc.cor }}
                                    >
                                      {tc.quantidade}
                                    </span>
                                  ))}
                                  {u.tipos.length > 8 && (
                                    <span className="text-[10px] text-muted-foreground" title={`+${u.tipos.length - 8} tipos`}>+{u.tipos.length - 8}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap">{u.quantidade}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtHoras(u.totalMinutos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </CardContent></Card>
              </div>

              <p className="text-[11px] text-muted-foreground italic px-1">
                * O tempo considera eventos com horário de início e fim; eventos de dia inteiro entram na contagem mas com tempo 0.
              </p>
            </>
          )}
        </>
      )}

      {/* Modal drill-down: eventos da linha clicada (paginado) */}
      <Dialog open={!!drill} onOpenChange={o => { if (!o) setDrill(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={CalendarDays} color="sky">
            <DialogTitle>Eventos relacionados</DialogTitle>
            <DialogDescription>
              {drill?.label}{drillData ? ` · ${drillData.total} evento(s) no período` : ''}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="nice-scrollbar space-y-2 max-h-[60vh]">
            {drillLoading ? (
              <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !drillData || drillData.data.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 italic">Nenhum evento.</p>
            ) : drillData.data.map(ev => {
              const d = new Date(ev.data)
              const dataStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
              const hora = ev.diaInteiro ? 'Dia inteiro' : (ev.horaInicio ? `${ev.horaInicio}${ev.horaFim ? `—${ev.horaFim}` : ''}` : 'Sem horário')
              return (
                <div key={ev.id} className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{ev.titulo}</p>
                    <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 text-white" style={{ backgroundColor: ev.tipoCor }}>{ev.tipoNome}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{dataStr}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{hora}{ev.minutos > 0 ? ` · ${fmtHoras(ev.minutos)}` : ''}</span>
                    {ev.local && <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{ev.local}</span></span>}
                    {ev.participantes > 0 && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{ev.participantes}</span>}
                  </div>
                </div>
              )
            })}
          </DialogBody>
          {drillData && drillData.totalPages > 1 && (
            <DialogFooter className="sm:justify-between sm:items-center">
              <span className="text-xs text-muted-foreground">Página {drillData.page} de {drillData.totalPages} · {drillData.total} eventos</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1" disabled={drillPage <= 1 || drillLoading} onClick={() => setDrillPage(p => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
                <Button variant="outline" size="sm" className="gap-1" disabled={drillPage >= drillData.totalPages || drillLoading} onClick={() => setDrillPage(p => p + 1)}>Próxima <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
