'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input, Label, Badge, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { BarChart3, Loader2, ArrowUpCircle, ArrowDownCircle, FileSpreadsheet, FileText, Users, Layers, Search, ChevronDown, ChevronsDownUp } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SITUACAO_LABELS } from '@saas/types'
import { exportToExcel, exportToCsv, type ExportColumn } from '@/lib/export-data'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'
const COR_ENTRADA = '#10b981'
const COR_SAIDA = '#f43f5e'

type Tab = 'movimentacao' | 'area' | 'responsavel'
const situ = (s: string) => (SITUACAO_LABELS as Record<string, string>)[s] ?? s
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')
const SITUACAO_OPTS = Object.entries(SITUACAO_LABELS).map(([value, label]) => ({ value, label: label as string }))

interface MovLinha { id: string; code: number; documento: string; razaoSocial: string; grupo: string | null; situacao: string; data: string | null }
interface MovData { totalEntradas: number; totalSaidas: number; meses: string[]; serieEntradas: number[]; serieSaidas: number[]; entradas: MovLinha[]; saidas: MovLinha[] }
interface AreaCliente { id: string; code: number; documento: string; razaoSocial: string; email: string | null; telefone: string | null; responsavel: string | null }
interface AreaData { areas: Array<{ areaId: string; areaNome: string; total: number; clientes: AreaCliente[] }>; totalVinculos: number }
interface RespCliente { clienteId: string; code: number; documento: string; razaoSocial: string; area: string | null }
interface RespData { responsaveis: Array<{ responsavelId: string; responsavelNome: string; setor: string | null; total: number; clientes: RespCliente[] }>; totalVinculos: number }

// ── Coluna genérica: get() alimenta busca+export; render() a exibição ──
interface Col<T> { label: string; get: (r: T) => string; render?: (r: T) => React.ReactNode; className?: string }

function TabelaRelatorio<T>({ titulo, cols, rows, nomeArquivo, onRowClick, rowKey, collapsible, open, onToggle }: {
  titulo: string; cols: Col<T>[]; rows: T[]; nomeArquivo: string; onRowClick?: (r: T) => void; rowKey: (r: T, i: number) => string
  collapsible?: boolean; open?: boolean; onToggle?: () => void
}) {
  const [q, setQ] = useState('')
  const [selfOpen, setSelfOpen] = useState(true)
  const aberto = collapsible ? (open ?? selfOpen) : true
  const toggle = () => { if (!collapsible) return; if (onToggle) onToggle(); else setSelfOpen(o => !o) }
  const termo = q.trim().toLowerCase()
  const filtered = termo ? rows.filter(r => cols.some(c => c.get(r).toLowerCase().includes(termo))) : rows
  const expCols: ExportColumn[] = cols.map(c => ({ header: c.label, accessor: (row) => c.get(row as unknown as T) }))
  const doExport = (fmt: 'xlsx' | 'csv') => {
    const data = filtered as unknown as Record<string, unknown>[]
    if (fmt === 'xlsx') exportToExcel(data, expCols, nomeArquivo); else exportToCsv(data, expCols, nomeArquivo)
  }
  return (
    <Card className="overflow-hidden">
      <div
        className={cn('px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between gap-2 flex-wrap', collapsible && 'cursor-pointer select-none')}
        onClick={collapsible ? toggle : undefined}
      >
        <span className="text-[13px] font-semibold flex items-center gap-1.5">
          {collapsible && <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-300', !aberto && '-rotate-90')} />}
          {titulo} <span className="text-muted-foreground font-normal">· {termo && filtered.length !== rows.length ? `${filtered.length} de ${rows.length}` : rows.length}</span>
        </span>
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {aberto && <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar..." className="h-7 text-xs pl-7 w-[150px]" /></div>}
          <Button variant="outline" size="xs" className="gap-1" onClick={() => doExport('xlsx')}><FileSpreadsheet className="h-3.5 w-3.5" />Excel</Button>
          <Button variant="outline" size="xs" className="gap-1" onClick={() => doExport('csv')}><FileText className="h-3.5 w-3.5" />CSV</Button>
        </div>
      </div>
      <div className="grid transition-all duration-300 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: aberto ? '1fr' : '0fr' }} aria-hidden={!aberto}>
        <div className="min-h-0 overflow-hidden">
          <div className="overflow-auto max-h-[360px]">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 sticky top-0"><tr>{cols.map(c => <th key={c.label} className="text-left font-semibold px-3 py-2 uppercase tracking-wider whitespace-nowrap">{c.label}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-muted-foreground">Nenhum registro.</td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={rowKey(r, i)} className={cn('border-b border-border/50 hover:bg-muted/30', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                    {cols.map(c => <td key={c.label} className={cn('px-3 py-1.5', c.className)}>{c.render ? c.render(r) : c.get(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  )
}

function MultiSelect({ label, options, selected, onChange }: {
  label: string; options: Array<{ value: string; label: string }>; selected: Set<string>; onChange: (s: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (v: string) => { const n = new Set(selected); if (n.has(v)) n.delete(v); else n.add(v); onChange(n) }
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border bg-card hover:bg-muted/50">
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{selected.size === 0 ? 'Todos' : `${selected.size} selec.`}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-[230px] max-h-[300px] overflow-auto rounded-md border border-border bg-popover shadow-lg p-1">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border/50 mb-1">
            <span className="text-[11px] text-muted-foreground">{options.length} opções</span>
            {selected.size > 0 && <button type="button" onClick={() => onChange(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground underline">Limpar</button>}
          </div>
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
              <input type="checkbox" className="h-3.5 w-3.5" style={{ accentColor: MODULE_COLOR }} checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RelatoriosClientesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('movimentacao')
  const ano = new Date().getFullYear()
  const [de, setDe] = useState(`${ano}-01-01`)
  const [ate, setAte] = useState(`${ano}-12-31`)
  const [tipos, setTipos] = useState<Set<string>>(new Set())

  const [mov, setMov] = useState<MovData | null>(null)
  const [movLoading, setMovLoading] = useState(false)
  const [area, setArea] = useState<AreaData | null>(null)
  const [areaLoading, setAreaLoading] = useState(false)
  const [areaSel, setAreaSel] = useState<Set<string>>(new Set())
  const [resp, setResp] = useState<RespData | null>(null)
  const [respLoading, setRespLoading] = useState(false)
  const [respSel, setRespSel] = useState<Set<string>>(new Set())
  const [setorSel, setSetorSel] = useState<Set<string>>(new Set())
  const [openResp, setOpenResp] = useState<Set<string>>(new Set()) // cards abertos (padrão: todos recolhidos)

  const carregarMov = useCallback(async () => {
    setMovLoading(true)
    try {
      const r = await (trpc.cliente as unknown as { reportMovimentacao: { query: (i: { dataInicio: string; dataFim: string; situacoes?: string[] }) => Promise<MovData> } })
        .reportMovimentacao.query({ dataInicio: de, dataFim: ate, situacoes: tipos.size ? [...tipos] : undefined })
      setMov(r)
    } catch { setMov(null) } finally { setMovLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, tipos])

  useEffect(() => { if (tab === 'movimentacao' && !mov) carregarMov() }, [tab, mov, carregarMov])
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

  const pieData = mov ? [{ name: 'Entradas', value: mov.totalEntradas }, { name: 'Saídas', value: mov.totalSaidas }] : []
  const barData = mov ? mov.meses.map((m, i) => ({ mes: m, Entradas: mov.serieEntradas[i] ?? 0, Saídas: mov.serieSaidas[i] ?? 0 })) : []

  // Área: cards clicáveis filtram a exibição
  const areasVisiveis = area ? (areaSel.size ? area.areas.filter(a => areaSel.has(a.areaId)) : area.areas) : []

  // Responsável: filtros por usuário e por setor
  const setores = resp ? [...new Set(resp.responsaveis.map(r => r.setor).filter(Boolean))] as string[] : []
  const respVisiveis = resp ? resp.responsaveis.filter(r =>
    (respSel.size === 0 || respSel.has(r.responsavelId)) && (setorSel.size === 0 || (r.setor && setorSel.has(r.setor)))
  ) : []

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
          {/* Toolbar compacta: filtros à esquerda, KPIs à direita */}
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">De</Label>
                <Input type="date" className="h-9 text-sm w-[150px]" value={de} onChange={e => setDe(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Até</Label>
                <Input type="date" className="h-9 text-sm w-[150px]" value={ate} onChange={e => setAte(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Tipo de cliente</Label>
                <MultiSelect label="Tipos" options={SITUACAO_OPTS} selected={tipos} onChange={setTipos} />
              </div>
              <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5 h-9" onClick={carregarMov} disabled={movLoading}>
                {movLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Filtrar
              </Button>

              {mov && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="rounded-md border border-border px-3 py-1.5 flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                    <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">Entradas</p><p className="text-lg font-bold tabular-nums leading-tight text-emerald-600 dark:text-emerald-400">{mov.totalEntradas}</p></div>
                  </div>
                  <div className="rounded-md border border-border px-3 py-1.5 flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4 text-rose-500" />
                    <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">Saídas</p><p className="text-lg font-bold tabular-nums leading-tight text-rose-600 dark:text-rose-400">{mov.totalSaidas}</p></div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {movLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>
          ) : mov ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card className="p-4">
                  <p className="text-[13px] font-semibold mb-2">Entradas × Saídas</p>
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label>
                        <Cell fill={COR_ENTRADA} /><Cell fill={COR_SAIDA} />
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
                <Card className="p-4 lg:col-span-2">
                  <p className="text-[13px] font-semibold mb-2">Acompanhamento mensal</p>
                  <ResponsiveContainer width="100%" height={190}>
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
                const cols: Col<MovLinha>[] = [
                  { label: 'Nº', get: r => `#${r.code}`, className: 'tabular-nums' },
                  { label: 'CNPJ/CPF', get: r => r.documento, className: 'font-mono' },
                  { label: 'Cliente', get: r => r.razaoSocial, className: 'font-medium' },
                  { label: 'Grupo', get: r => r.grupo ?? '—' },
                  { label: 'Situação', get: r => situ(r.situacao), render: r => <Badge variant="secondary" className="text-[10px]">{situ(r.situacao)}</Badge> },
                  { label: tipo === 'entradas' ? 'Data Entrada' : 'Data Saída', get: r => fmtDate(r.data), className: 'tabular-nums' },
                ]
                return <TabelaRelatorio key={tipo} titulo={titulo} cols={cols} rows={rows} nomeArquivo={`clientes-${tipo}`} rowKey={r => r.id} onRowClick={r => router.push(`/clientes/${r.id}`)} />
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
            <div className="flex items-start gap-3 flex-wrap">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 flex-1">
                {area.areas.map(a => {
                  const active = areaSel.has(a.areaId)
                  return (
                    <button key={a.areaId} type="button" onClick={() => { const n = new Set(areaSel); if (n.has(a.areaId)) n.delete(a.areaId); else n.add(a.areaId); setAreaSel(n) }}
                      className={cn('text-left rounded-lg border p-3 transition-colors', active ? 'text-white' : 'bg-card border-border hover:bg-muted/40')}
                      style={active ? { backgroundColor: MODULE_COLOR, borderColor: MODULE_COLOR } : undefined}>
                      <p className={cn('text-[10px] uppercase tracking-wider truncate', active ? 'text-white/80' : 'text-muted-foreground')}>{a.areaNome}</p>
                      <p className="text-xl font-bold tabular-nums">{a.total}</p>
                    </button>
                  )
                })}
              </div>
            </div>
            {areaSel.size > 0 && <p className="text-[11px] text-muted-foreground -mt-2">Mostrando {areasVisiveis.length} de {area.areas.length} áreas · <button type="button" className="underline hover:text-foreground" onClick={() => setAreaSel(new Set())}>limpar seleção</button></p>}

            {areasVisiveis.map(a => {
              const cols: Col<AreaCliente>[] = [
                { label: 'Nº', get: r => `#${r.code}`, className: 'tabular-nums' },
                { label: 'CNPJ/CPF', get: r => r.documento, className: 'font-mono' },
                { label: 'Cliente', get: r => r.razaoSocial, className: 'font-medium' },
                { label: 'E-mail', get: r => r.email ?? '—' },
                { label: 'Telefone', get: r => r.telefone ?? '—' },
                { label: 'Responsável', get: r => r.responsavel ?? '—' },
              ]
              return <TabelaRelatorio key={a.areaId} titulo={a.areaNome} cols={cols} rows={a.clientes} nomeArquivo={`clientes-area-${a.areaNome}`} rowKey={r => r.id} onRowClick={r => router.push(`/clientes/${r.id}`)} />
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">Sem dados.</p>
      )}

      {/* ── Por Responsável ── */}
      {tab === 'responsavel' && (
        respLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>
        ) : resp ? (
          <div className="space-y-3">
            <Card className="p-2.5 flex flex-wrap items-center gap-2 justify-start">
              <MultiSelect label="Responsável" options={resp.responsaveis.map(r => ({ value: r.responsavelId, label: r.responsavelNome }))} selected={respSel} onChange={setRespSel} />
              {setores.length > 0 && <MultiSelect label="Setor" options={setores.map(s => ({ value: s, label: s }))} selected={setorSel} onChange={setSetorSel} />}
              <span className="text-[12px] text-muted-foreground">{respVisiveis.length} de {resp.responsaveis.length} responsáveis</span>
              <div className="ml-auto flex items-center gap-1.5">
                <Button variant="outline" size="xs" className="gap-1" onClick={() => setOpenResp(new Set(respVisiveis.map(r => r.responsavelId)))}><ChevronsDownUp className="h-3.5 w-3.5 rotate-180" />Expandir todos</Button>
                <Button variant="outline" size="xs" className="gap-1" onClick={() => setOpenResp(new Set())}><ChevronsDownUp className="h-3.5 w-3.5" />Recolher todos</Button>
              </div>
            </Card>

            {respVisiveis.map(r => {
              const cols: Col<RespCliente>[] = [
                { label: 'Nº', get: c => `#${c.code}`, className: 'tabular-nums' },
                { label: 'CNPJ/CPF', get: c => c.documento, className: 'font-mono' },
                { label: 'Cliente', get: c => c.razaoSocial, className: 'font-medium' },
                { label: 'Área', get: c => c.area ?? '—' },
              ]
              return (
                <TabelaRelatorio key={r.responsavelId} titulo={`${r.responsavelNome}${r.setor ? ` · ${r.setor}` : ''}`} cols={cols} rows={r.clientes}
                  nomeArquivo={`clientes-resp-${r.responsavelNome}`} rowKey={(c, i) => `${c.clienteId}-${i}`} onRowClick={c => router.push(`/clientes/${c.clienteId}`)}
                  collapsible open={openResp.has(r.responsavelId)}
                  onToggle={() => { const n = new Set(openResp); if (n.has(r.responsavelId)) n.delete(r.responsavelId); else n.add(r.responsavelId); setOpenResp(n) }} />
              )
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">Sem dados.</p>
      )}
    </div>
  )
}
