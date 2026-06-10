'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, Clock, Users, FileBarChart, Loader2, CalendarDays, Lock,
} from 'lucide-react'
import {
  Button, Card, CardContent, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList,
} from 'recharts'
import { trpc } from '@/lib/trpc'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { resolveAssetUrl } from '@/lib/api-url'

const MOD = 'var(--mod-administrativo, #38bdf8)'

interface PorTipo { tipoId: string; nome: string; cor: string; corBorda: string; quantidade: number; totalMinutos: number }
interface PorUsuario { usuarioId: string; nome: string; image: string | null; quantidade: number; totalMinutos: number }
interface Relatorio { totais: { quantidade: number; totalMinutos: number }; porTipo: PorTipo[]; porUsuario: PorUsuario[] }
interface Usuario { id: string; name: string; image: string | null }
interface Tipo { id: string; nome: string; cor: string; corBorda: string }

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
                        cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
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
                  <table className="w-full text-sm">
                    <thead><tr className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                      <th className="text-left font-semibold px-4 py-2">Tipo</th>
                      <th className="text-right font-semibold px-4 py-2 w-20">Qtd.</th>
                      <th className="text-right font-semibold px-4 py-2 w-28">Tempo</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.porTipo.map(t => (
                        <tr key={t.tipoId} className="hover:bg-muted/30">
                          <td className="px-4 py-2"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.corBorda || t.cor }} />{t.nome}</span></td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{t.quantidade}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmtHoras(t.totalMinutos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent></Card>

                {/* Por usuário */}
                <Card><CardContent className="p-0">
                  <h3 className="text-[13px] font-semibold px-4 py-3 border-b border-border">Por usuário</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                      <th className="text-left font-semibold px-4 py-2">Usuário</th>
                      <th className="text-right font-semibold px-4 py-2 w-20">Qtd.</th>
                      <th className="text-right font-semibold px-4 py-2 w-28">Tempo</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.porUsuario.map(u => (
                        <tr key={u.usuarioId} className="hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              {u.image
                                ? <img src={resolveAssetUrl(u.image)} alt={u.nome} className="h-6 w-6 rounded-full object-cover shrink-0" />
                                : <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">{u.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</span>}
                              <span className="truncate">{u.nome}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{u.quantidade}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmtHoras(u.totalMinutos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent></Card>
              </div>

              <p className="text-[11px] text-muted-foreground italic px-1">
                * O tempo considera eventos com horário de início e fim; eventos de dia inteiro entram na contagem mas com tempo 0.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
