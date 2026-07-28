'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input, Label, Badge, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { BarChart3, Loader2, ArrowUpCircle, ArrowDownCircle, FileSpreadsheet, FileText, Users, Layers } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SITUACAO_LABELS } from '@saas/types'
import { exportToExcel, exportToCsv, type ExportColumn } from '@/lib/export-data'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'
const COR_ENTRADA = '#10b981'
const COR_SAIDA = '#f43f5e'

type Tab = 'movimentacao' | 'area' | 'responsavel'
const situ = (s: string) => (SITUACAO_LABELS as Record<string, string>)[s] ?? s
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')

interface MovLinha { id: string; code: number; documento: string; razaoSocial: string; grupo: string | null; situacao: string; data: string | null }
interface MovData { totalEntradas: number; totalSaidas: number; meses: string[]; serieEntradas: number[]; serieSaidas: number[]; entradas: MovLinha[]; saidas: MovLinha[] }
interface AreaData { areas: Array<{ areaId: string; areaNome: string; total: number; clientes: Array<{ id: string; code: number; documento: string; razaoSocial: string; email: string | null; telefone: string | null; responsavel: string | null }> }>; totalVinculos: number }
interface RespData { responsaveis: Array<{ responsavelId: string; responsavelNome: string; total: number; clientes: Array<{ clienteId: string; code: number; documento: string; razaoSocial: string; area: string | null }> }>; totalVinculos: number }

export default function RelatoriosClientesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('movimentacao')
  const ano = new Date().getFullYear()
  const [de, setDe] = useState(`${ano}-01-01`)
  const [ate, setAte] = useState(`${ano}-12-31`)

  const [mov, setMov] = useState<MovData | null>(null)
  const [movLoading, setMovLoading] = useState(false)
  const [area, setArea] = useState<AreaData | null>(null)
  const [areaLoading, setAreaLoading] = useState(false)
  const [resp, setResp] = useState<RespData | null>(null)
  const [respLoading, setRespLoading] = useState(false)

  const carregarMov = useCallback(async () => {
    setMovLoading(true)
    try {
      const r = await (trpc.cliente as unknown as { reportMovimentacao: { query: (i: { dataInicio: string; dataFim: string }) => Promise<MovData> } })
        .reportMovimentacao.query({ dataInicio: de, dataFim: ate })
      setMov(r)
    } catch { setMov(null) } finally { setMovLoading(false) }
  }, [de, ate])

  useEffect(() => { if (tab === 'movimentacao') carregarMov() }, [tab, carregarMov])
  useEffect(() => {
    if (tab !== 'area' || area) return
    setAreaLoading(true)
    ;(trpc.cliente as unknown as { reportPorArea: { query: () => Promise<AreaData> } }).reportPorArea.query()
      .then(setArea).catch(() => setArea(null)).finally(() => setAreaLoading(false))
  }, [tab, area])
  useEffect(() => {
    if (tab !== 'responsavel' || resp) return
    setRespLoading(true)
    ;(trpc.cliente as unknown as { reportPorResponsavel: { query: () => Promise<RespData> } }).reportPorResponsavel.query()
      .then(setResp).catch(() => setResp(null)).finally(() => setRespLoading(false))
  }, [tab, resp])

  const TABS: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
    { id: 'movimentacao', label: 'Acompanhamento Anual', icon: BarChart3 },
    { id: 'area', label: 'Por Área Contratada', icon: Layers },
    { id: 'responsavel', label: 'Por Responsável', icon: Users },
  ]

  function exportar(nome: string, cols: ExportColumn[], rows: Record<string, unknown>[], formato: 'xlsx' | 'csv') {
    if (formato === 'xlsx') exportToExcel(rows, cols, nome)
    else exportToCsv(rows, cols, nome)
  }

  const pieData = mov ? [{ name: 'Entradas', value: mov.totalEntradas }, { name: 'Saídas', value: mov.totalSaidas }] : []
  const barData = mov ? mov.meses.map((m, i) => ({ mes: m, Entradas: mov.serieEntradas[i] ?? 0, Saídas: mov.serieSaidas[i] ?? 0 })) : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>Relatórios de Clientes</h1>
            <p className="text-sm text-muted-foreground">Acompanhamento anual, por área contratada e por responsável.</p>
          </div>
        </div>
        <BackButton href="/clientes" label="Voltar" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                active ? 'border-current' : 'border-transparent text-muted-foreground hover:text-foreground')}
              style={active ? { color: MODULE_COLOR, borderColor: MODULE_COLOR } : undefined}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Acompanhamento Anual ── */}
      {tab === 'movimentacao' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">De</Label>
              <Input type="date" className="h-9 text-sm" value={de} onChange={e => setDe(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Até</Label>
              <Input type="date" className="h-9 text-sm" value={ate} onChange={e => setAte(e.target.value)} />
            </div>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={carregarMov} disabled={movLoading}>
              {movLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Filtrar
            </Button>
          </Card>

          {movLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>
          ) : mov ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 flex items-center justify-between">
                  <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Entradas</p><p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{mov.totalEntradas}</p></div>
                  <ArrowUpCircle className="h-8 w-8 text-emerald-500/70" />
                </Card>
                <Card className="p-4 flex items-center justify-between">
                  <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Saídas</p><p className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{mov.totalSaidas}</p></div>
                  <ArrowDownCircle className="h-8 w-8 text-rose-500/70" />
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card className="p-4">
                  <p className="text-[13px] font-semibold mb-2">Entradas × Saídas</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} label>
                        <Cell fill={COR_ENTRADA} /><Cell fill={COR_SAIDA} />
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
                <Card className="p-4 lg:col-span-2">
                  <p className="text-[13px] font-semibold mb-2">Acompanhamento mensal</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip /><Legend />
                      <Bar dataKey="Entradas" fill={COR_ENTRADA} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Saídas" fill={COR_SAIDA} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {(['entradas', 'saidas'] as const).map(tipo => {
                const rows = tipo === 'entradas' ? mov.entradas : mov.saidas
                const titulo = tipo === 'entradas' ? 'Clientes que entraram' : 'Clientes que saíram'
                const cols: ExportColumn[] = [
                  { header: 'Nº', accessor: (r) => `#${(r as unknown as MovLinha).code}` },
                  { header: 'CNPJ/CPF', accessor: 'documento' },
                  { header: 'Cliente', accessor: 'razaoSocial' },
                  { header: 'Grupo', accessor: (r) => (r as unknown as MovLinha).grupo ?? '—' },
                  { header: 'Situação', accessor: (r) => situ((r as unknown as MovLinha).situacao) },
                  { header: tipo === 'entradas' ? 'Data Entrada' : 'Data Saída', accessor: (r) => fmtDate((r as unknown as MovLinha).data) },
                ]
                return (
                  <Card key={tipo} className="overflow-hidden">
                    <div className="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold">{titulo} ({rows.length})</span>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="xs" className="gap-1" onClick={() => exportar(`clientes-${tipo}`, cols, rows as unknown as Record<string, unknown>[], 'xlsx')}><FileSpreadsheet className="h-3.5 w-3.5" />Excel</Button>
                        <Button variant="outline" size="xs" className="gap-1" onClick={() => exportar(`clientes-${tipo}`, cols, rows as unknown as Record<string, unknown>[], 'csv')}><FileText className="h-3.5 w-3.5" />CSV</Button>
                      </div>
                    </div>
                    <div className="overflow-auto max-h-[360px]">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/20 sticky top-0"><tr>
                          <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Nº</th>
                          <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">CNPJ/CPF</th>
                          <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Cliente</th>
                          <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Grupo</th>
                          <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Situação</th>
                          <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Data</th>
                        </tr></thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhum cliente no período.</td></tr>
                          ) : rows.map(c => (
                            <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/clientes/${c.id}`)}>
                              <td className="px-3 py-1.5 tabular-nums">#{c.code}</td>
                              <td className="px-3 py-1.5 font-mono">{c.documento}</td>
                              <td className="px-3 py-1.5 font-medium">{c.razaoSocial}</td>
                              <td className="px-3 py-1.5">{c.grupo ?? '—'}</td>
                              <td className="px-3 py-1.5"><Badge variant="secondary" className="text-[10px]">{situ(c.situacao)}</Badge></td>
                              <td className="px-3 py-1.5 tabular-nums">{fmtDate(c.data)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )
              })}
            </>
          ) : null}
        </div>
      )}

      {/* ── Por Área Contratada ── */}
      {tab === 'area' && (
        areaLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>
        ) : area ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 flex-1">
                {area.areas.map(a => (
                  <Card key={a.areaId} className="p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{a.areaNome}</p>
                    <p className="text-xl font-bold tabular-nums">{a.total}</p>
                  </Card>
                ))}
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => {
                const cols: ExportColumn[] = [
                  { header: 'Área', accessor: 'areaNome' }, { header: 'Nº', accessor: (r) => `#${(r as Record<string, unknown>).code}` },
                  { header: 'CNPJ/CPF', accessor: 'documento' }, { header: 'Cliente', accessor: 'razaoSocial' },
                  { header: 'E-mail', accessor: (r) => (r as Record<string, unknown>).email ?? '—' }, { header: 'Telefone', accessor: (r) => (r as Record<string, unknown>).telefone ?? '—' },
                  { header: 'Responsável', accessor: (r) => (r as Record<string, unknown>).responsavel ?? '—' },
                ]
                const flat = area.areas.flatMap(a => a.clientes.map(c => ({ areaNome: a.areaNome, ...c })))
                exportToExcel(flat, cols, 'clientes-por-area')
              }}><FileSpreadsheet className="h-4 w-4" />Exportar tudo</Button>
            </div>

            {area.areas.map(a => (
              <Card key={a.areaId} className="overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border text-[13px] font-semibold">{a.areaNome} <span className="text-muted-foreground font-normal">· {a.total} cliente(s)</span></div>
                <div className="overflow-auto max-h-[340px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20 sticky top-0"><tr>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Nº</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">CNPJ/CPF</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Cliente</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">E-mail</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Telefone</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Responsável</th>
                    </tr></thead>
                    <tbody>
                      {a.clientes.map(c => (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/clientes/${c.id}`)}>
                          <td className="px-3 py-1.5 tabular-nums">#{c.code}</td>
                          <td className="px-3 py-1.5 font-mono">{c.documento}</td>
                          <td className="px-3 py-1.5 font-medium">{c.razaoSocial}</td>
                          <td className="px-3 py-1.5">{c.email ?? '—'}</td>
                          <td className="px-3 py-1.5">{c.telefone ?? '—'}</td>
                          <td className="px-3 py-1.5">{c.responsavel ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Sem dados.</p>
      )}

      {/* ── Por Responsável ── */}
      {tab === 'responsavel' && (
        respLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>
        ) : resp ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                const cols: ExportColumn[] = [
                  { header: 'Responsável', accessor: 'responsavelNome' }, { header: 'Nº', accessor: (r) => `#${(r as Record<string, unknown>).code}` },
                  { header: 'CNPJ/CPF', accessor: 'documento' }, { header: 'Cliente', accessor: 'razaoSocial' }, { header: 'Área', accessor: (r) => (r as Record<string, unknown>).area ?? '—' },
                ]
                const flat = resp.responsaveis.flatMap(r => r.clientes.map(c => ({ responsavelNome: r.responsavelNome, ...c })))
                exportToExcel(flat, cols, 'clientes-por-responsavel')
              }}><FileSpreadsheet className="h-4 w-4" />Exportar tudo</Button>
            </div>

            {resp.responsaveis.map(r => (
              <Card key={r.responsavelId} className="overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border text-[13px] font-semibold">{r.responsavelNome} <span className="text-muted-foreground font-normal">· {r.total} cliente(s)</span></div>
                <div className="overflow-auto max-h-[340px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20 sticky top-0"><tr>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Nº</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">CNPJ/CPF</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Cliente</th>
                      <th className="text-left font-semibold px-3 py-2 uppercase tracking-wider">Área</th>
                    </tr></thead>
                    <tbody>
                      {r.clientes.map((c, i) => (
                        <tr key={`${c.clienteId}-${i}`} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/clientes/${c.clienteId}`)}>
                          <td className="px-3 py-1.5 tabular-nums">#{c.code}</td>
                          <td className="px-3 py-1.5 font-mono">{c.documento}</td>
                          <td className="px-3 py-1.5 font-medium">{c.razaoSocial}</td>
                          <td className="px-3 py-1.5">{c.area ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Sem dados.</p>
      )}
    </div>
  )
}
