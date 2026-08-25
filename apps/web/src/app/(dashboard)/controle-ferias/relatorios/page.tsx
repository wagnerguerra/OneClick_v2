'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  BarChart3, Loader2, AlertTriangle, CalendarDays, Wallet, Coins, Users,
  FileSpreadsheet, FileText, Search, CircleAlert, TriangleAlert, CircleCheck, Clock,
} from 'lucide-react'
import {
  Button, Card, Input, Badge, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { PageHeaderBar } from '@/components/page-header-bar'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { exportToExcel, exportToCsv, type ExportColumn } from '@/lib/export-data'

const MODULE_COLOR = 'var(--mod-trabalhista, #a3e635)'

/**
 * Relatórios do Controle de Férias.
 *
 * O v1 não tinha nenhum: a conferência era feita olhando a tela de lançamento,
 * que só responde "quanto fulano tem". Aqui ficam as perguntas que custam
 * dinheiro — quem está para vencer (dobra do art. 137), quem sai em cada mês,
 * o que está por pagar (art. 145) e quanto a empresa deve em dias e em reais.
 *
 * Todo número vem pronto do backend; a tela não refaz conta nenhuma. A única
 * exceção são os percentuais de encargo da provisão, que são premissa do
 * usuário e por isso ficam editáveis aqui.
 */

const FAROL_UI: Record<string, { label: string; cor: string; classe: string }> = {
  VENCIDO: { label: 'Vencido', cor: '#e11d48', classe: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800' },
  CRITICO: { label: 'Vence em 30 dias', cor: '#f59e0b', classe: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' },
  ATENCAO: { label: 'Vence em 90 dias', cor: '#eab308', classe: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800' },
  OK: { label: 'Em dia', cor: '#10b981', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
}

const PAGTO_UI: Record<string, { label: string; classe: string }> = {
  ATRASADO: { label: 'Atrasado', classe: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800' },
  PAGO_EM_ATRASO: { label: 'Pago fora do prazo', classe: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' },
  A_PAGAR: { label: 'A pagar', classe: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800' },
  PAGO: { label: 'Pago', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
}

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Aba = 'painel' | 'vencimentos' | 'saldos' | 'escala' | 'pagamentos' | 'provisao'

// ── Tabela genérica: busca local + export, no padrão de /clientes/relatorios ──
interface Col<T> { label: string; get: (r: T) => string; render?: (r: T) => React.ReactNode; className?: string }

function TabelaRelatorio<T>({ titulo, cols, rows, nomeArquivo, rowKey, onRowClick, rodape }: {
  titulo: string
  cols: Col<T>[]
  rows: T[]
  nomeArquivo: string
  rowKey: (r: T, i: number) => string
  onRowClick?: (r: T) => void
  rodape?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  const termo = q.trim().toLowerCase()
  const filtradas = termo ? rows.filter((r) => cols.some((c) => c.get(r).toLowerCase().includes(termo))) : rows
  const expCols: ExportColumn[] = cols.map((c) => ({ header: c.label, accessor: (row) => c.get(row as unknown as T) }))
  const exportar = (fmt: 'xlsx' | 'csv') => {
    const data = filtradas as unknown as Record<string, unknown>[]
    if (fmt === 'xlsx') exportToExcel(data, expCols, nomeArquivo)
    else exportToCsv(data, expCols, nomeArquivo)
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-[13px] font-semibold">
          {titulo}{' '}
          <span className="font-normal text-muted-foreground">
            · {termo && filtradas.length !== rows.length ? `${filtradas.length} de ${rows.length}` : rows.length}
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar..." className="h-7 w-[150px] pl-7 text-xs" />
          </div>
          <Button variant="outline" size="xs" className="gap-1" onClick={() => exportar('xlsx')}><FileSpreadsheet className="h-3.5 w-3.5" />Excel</Button>
          <Button variant="outline" size="xs" className="gap-1" onClick={() => exportar('csv')}><FileText className="h-3.5 w-3.5" />CSV</Button>
        </div>
      </div>
      <div className="nice-scrollbar max-h-[520px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr>
              {cols.map((c) => (
                <th key={c.label} className={cn('whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wider', c.className)}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-muted-foreground">Nenhum registro.</td></tr>
            ) : filtradas.map((r, i) => (
              <tr
                key={rowKey(r, i)}
                className={cn('border-b border-border/50 hover:bg-muted/30', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {cols.map((c) => <td key={c.label} className={cn('px-3 py-1.5', c.className)}>{c.render ? c.render(r) : c.get(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rodape && <div className="border-t border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">{rodape}</div>}
    </Card>
  )
}

/** Cartão de número — o mesmo formato nas seis abas. */
function Kpi({ label, valor, hint, cor, icone: Icone, destaque }: {
  label: string; valor: string | number; hint?: string; cor?: string; icone?: typeof Users; destaque?: boolean
}) {
  return (
    <Card className={cn('p-3', destaque && 'border-rose-300 dark:border-rose-800')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
          {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {Icone && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${cor ?? MODULE_COLOR} 15%, transparent)` }}>
            <Icone className="h-4 w-4" style={{ color: cor ?? MODULE_COLOR }} />
          </span>
        )}
      </div>
    </Card>
  )
}

// ── Tipos do payload (espelham o service) ────────────────────────────
interface LinhaColab { colaboradorId: string | null; nome: string; imagem: string | null; ativo: boolean | null; area: string | null; cargo: string | null; admissao: string | null }
interface PainelData {
  resumo: { colaboradores: number; comSaldo: number; diasEmAberto: number; periodosVigentes: number; vencidos: number; vencendo90: number; gozosNoMes: number; pagos: number; aPagar: number; semRecibo: number }
  farol: Array<{ farol: string; total: number }>
  saldoPorArea: Array<{ areaId: string | null; area: string; colaboradores: number; dias: number }>
  gozosPorMes: Array<{ mes: string; label: string; dias: number; pessoas: number }>
  pendencias: {
    semAdmissao: Array<{ colaboradorId: string | null; nome: string; area: string | null }>
    semPeriodo: Array<{ colaboradorId: string | null; nome: string; area: string | null; admissao: string | null }>
  }
}
interface VencRow extends LinhaColab { periodoId: string; numero: number; periodo: string; dias: number; gozados: number; saldo: number; previsao: string | null; limite: string | null; limiteAproximado: boolean; diasRestantes: number; farol: string }
interface VencData { resumo: { total: number; vencidos: number; criticos: number; atencao: number; ok: number; diasVencidos: number; aproximados: number }; rows: VencRow[] }
interface SaldoPeriodo { id: string; numero: number; periodo: string; descricao: string | null; dias: number; gozados: number; saldo: number; previsao: string | null; pago: boolean; historico: boolean; limite: string | null; limiteAproximado: boolean; arquivos: number }
interface SaldoRow extends LinhaColab { chave: string; disponivel: number; periodosAbertos: number; totalPeriodos: number; proximoLimite: string | null; periodos: SaldoPeriodo[] }
interface SaldoData { resumo: { colaboradores: number; totalDias: number }; rows: SaldoRow[] }
interface EscalaData {
  ano: number
  meses: string[]
  linhas: Array<{ colaboradorId: string | null; nome: string; imagem: string | null; area: string | null; meses: number[]; total: number }>
  gozos: Array<{ colaboradorId: string | null; nome: string; area: string | null; periodoId: string; periodo: string; inicio: string | null; fim: string | null; dias: number; descricao: string | null }>
  porMes: Array<{ mes: number; label: string; dias: number; pessoas: number }>
  porArea: Array<{ area: string; meses: number[] }>
  resumo: { colaboradores: number; dias: number; picoMes: { mes: number; pessoas: number } }
}
interface PagtoRow extends LinhaColab { periodoId: string; numero: number; periodo: string; descricao: string | null; dias: number; gozados: number; previsao: string | null; pagamento1: string | null; pago: boolean; historico: boolean; inicioGozo: string | null; limitePagamento: string | null; situacao: string; arquivos: number; semRecibo: boolean }
interface PagtoData { resumo: { total: number; pagos: number; pagosEmAtraso: number; aPagar: number; atrasados: number; semRecibo: number }; rows: PagtoRow[] }
interface ProvRow { colaboradorId: string | null; nome: string; area: string | null; cargo: string | null; salario: number; dias: number; base: number; terco: number; total: number }
interface ProvData { resumo: { colaboradores: number; dias: number; base: number; terco: number; total: number; diasSemSalario: number }; rows: ProvRow[]; semSalario: Array<{ colaboradorId: string | null; nome: string; area: string | null; dias: number }> }

const ABAS: Array<{ id: Aba; label: string; icone: typeof BarChart3 }> = [
  { id: 'painel', label: 'Painel', icone: BarChart3 },
  { id: 'vencimentos', label: 'Vencimentos', icone: AlertTriangle },
  { id: 'saldos', label: 'Saldos', icone: Users },
  { id: 'escala', label: 'Escala anual', icone: CalendarDays },
  { id: 'pagamentos', label: 'Pagamentos', icone: Wallet },
  { id: 'provisao', label: 'Provisão (R$)', icone: Coins },
]

export default function RelatoriosFeriasPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { permissions, isMaster, isEmpresaMaster } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'controle-ferias')?.subPermissions ?? {}) as Record<string, boolean>
  const podeVerValores = isMaster || isEmpresaMaster || subs.valores === true

  const [aba, setAba] = useState<Aba>((params.get('aba') as Aba) || 'painel')
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [ano, setAno] = useState(new Date().getFullYear())
  const [farolFiltro, setFarolFiltro] = useState<string>(params.get('farol') ?? '')
  const [situacaoPagto, setSituacaoPagto] = useState<string>('')

  const [painel, setPainel] = useState<PainelData | null>(null)
  const [venc, setVenc] = useState<VencData | null>(null)
  const [saldos, setSaldos] = useState<SaldoData | null>(null)
  const [escala, setEscala] = useState<EscalaData | null>(null)
  const [pagtos, setPagtos] = useState<PagtoData | null>(null)
  const [prov, setProv] = useState<ProvData | null>(null)
  const [loading, setLoading] = useState(false)

  // Encargos da provisão: premissa do usuário, não do sistema — a incidência
  // muda com o enquadramento da empresa, e quem sabe a alíquota é o contador.
  const [encInss, setEncInss] = useState('20')
  const [encRat, setEncRat] = useState('2')
  const [encTerceiros, setEncTerceiros] = useState('5.8')
  const [encFgts, setEncFgts] = useState('8')

  const abas = useMemo(() => ABAS.filter((a) => a.id !== 'provisao' || podeVerValores), [podeVerValores])

  const carregar = useCallback(async () => {
    const api = (trpc as any).controleFerias
    const filtro = { incluirInativos }
    setLoading(true)
    try {
      if (aba === 'painel') setPainel(await api.reportPainel.query(filtro))
      else if (aba === 'vencimentos') setVenc(await api.reportVencimentos.query(filtro))
      else if (aba === 'saldos') setSaldos(await api.reportSaldos.query(filtro))
      else if (aba === 'escala') setEscala(await api.reportEscala.query({ ...filtro, ano }))
      else if (aba === 'pagamentos') setPagtos(await api.reportPagamentos.query({ ...filtro, ano: undefined }))
      else if (aba === 'provisao') setProv(await api.reportProvisao.query(filtro))
    } catch { /* silencioso: a aba mostra o vazio */ }
    finally { setLoading(false) }
  }, [aba, incluirInativos, ano])
  useEffect(() => { carregar() }, [carregar])

  const irParaPeriodo = (id: string) => router.push(`/controle-ferias/${id}`)

  // ── Vencimentos: o filtro do farol também chega por link do sino ──
  const vencFiltradas = venc ? venc.rows.filter((r) => !farolFiltro || r.farol === farolFiltro) : []
  const pagtoFiltradas = pagtos ? pagtos.rows.filter((r) => !situacaoPagto || r.situacao === situacaoPagto) : []

  const encargosPct = (Number(encInss) + Number(encRat) + Number(encTerceiros) + Number(encFgts)) / 100
  const provTotalComEncargos = prov ? prov.resumo.total * (1 + (Number.isFinite(encargosPct) ? encargosPct : 0)) : 0

  return (
    <div className="space-y-6">
      <PageHeaderBar
        actions={
          <div className="flex items-center gap-2">
            <Select value={incluirInativos ? 'TODOS' : 'ATIVOS'} onValueChange={(v) => setIncluirInativos(v === 'TODOS')}>
              <SelectTrigger className="h-8 w-[190px] bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVOS">Colaboradores ativos</SelectItem>
                <SelectItem value="TODOS">Incluir desligados</SelectItem>
              </SelectContent>
            </Select>
            <BackButton href="/controle-ferias" label="Voltar" />
          </div>
        }
      >
        <h1 className="truncate">Relatórios de Férias</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/controle-ferias" className="transition-colors hover:text-foreground">Controle de Férias</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Relatórios</span>
        </p>
      </PageHeaderBar>

      {/* Abas */}
      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {abas.map((a) => {
          const Icone = a.icone
          const ativa = aba === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                ativa ? 'border-current' : 'border-transparent text-muted-foreground hover:text-foreground')}
              style={ativa ? { color: MODULE_COLOR, borderColor: MODULE_COLOR } : undefined}
            >
              <Icone className="h-4 w-4" />{a.label}
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando…
        </div>
      )}

      {/* ── Painel ── */}
      {!loading && aba === 'painel' && painel && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Dias em aberto" valor={painel.resumo.diasEmAberto} hint={`${painel.resumo.comSaldo} colaborador(es) com saldo`} icone={CalendarDays} />
            <Kpi label="Férias vencidas" valor={painel.resumo.vencidos} hint="Devidas em dobro (art. 137)" cor="#e11d48" icone={CircleAlert} destaque={painel.resumo.vencidos > 0} />
            <Kpi label="Vencem em 90 dias" valor={painel.resumo.vencendo90} hint="Programe o gozo" cor="#f59e0b" icone={TriangleAlert} />
            <Kpi label="Gozo neste mês" valor={painel.resumo.gozosNoMes} hint="Dias de ausência no mês corrente" cor="#0ea5e9" icone={Clock} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-3 text-[13px] font-semibold">Saldo por área</p>
              {painel.saldoPorArea.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Sem saldo em aberto.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, painel.saldoPorArea.length * 30)}>
                  <BarChart data={painel.saldoPorArea} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="area" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${v} dias`} labelFormatter={(l) => String(l)} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="dias" radius={[0, 4, 4, 0]} fill={MODULE_COLOR} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-[13px] font-semibold">Dias de gozo por mês <span className="font-normal text-muted-foreground">· últimos 12 meses</span></p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={painel.gozosPorMes} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => `${v} dias`} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="dias" radius={[4, 4, 0, 0]} fill={MODULE_COLOR} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-[13px] font-semibold">
                Situação dos períodos em aberto
              </div>
              <div className="divide-y divide-border/60">
                {painel.farol.map((f) => {
                  const ui = FAROL_UI[f.farol]!
                  return (
                    <button
                      key={f.farol}
                      type="button"
                      onClick={() => { setFarolFiltro(f.farol); setAba('vencimentos') }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: ui.cor }} />
                        {ui.label}
                      </span>
                      <span className="font-semibold tabular-nums">{f.total}</span>
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-[13px] font-semibold">
                Pendências de cadastro
              </div>
              <div className="space-y-2 p-3 text-xs">
                <p className="text-muted-foreground">
                  Sem data de admissão o prazo legal só pode ser <b className="text-foreground">aproximado</b> (31/12 do ano seguinte),
                  e quem não tem período lançado fica de fora de todos os relatórios.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={painel.pendencias.semAdmissao.length ? FAROL_UI.CRITICO!.classe : ''}>
                    {painel.pendencias.semAdmissao.length} sem data de admissão
                  </Badge>
                  <Badge variant="outline" className={painel.pendencias.semPeriodo.length ? FAROL_UI.CRITICO!.classe : ''}>
                    {painel.pendencias.semPeriodo.length} sem período lançado
                  </Badge>
                  <Badge variant="outline">{painel.resumo.semRecibo} período(s) sem recibo</Badge>
                </div>
                {painel.pendencias.semPeriodo.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Sem período: {painel.pendencias.semPeriodo.slice(0, 6).map((c) => c.nome).join(', ')}
                    {painel.pendencias.semPeriodo.length > 6 && ` e mais ${painel.pendencias.semPeriodo.length - 6}`}.
                  </p>
                )}
                {painel.pendencias.semAdmissao.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Sem admissão: {painel.pendencias.semAdmissao.slice(0, 6).map((c) => c.nome).join(', ')}
                    {painel.pendencias.semAdmissao.length > 6 && ` e mais ${painel.pendencias.semAdmissao.length - 6}`}.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Vencimentos ── */}
      {!loading && aba === 'vencimentos' && venc && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Vencidos" valor={venc.resumo.vencidos} hint={`${venc.resumo.diasVencidos} dia(s) fora do prazo`} cor="#e11d48" icone={CircleAlert} destaque={venc.resumo.vencidos > 0} />
            <Kpi label="Vencem em 30 dias" valor={venc.resumo.criticos} cor="#f59e0b" icone={TriangleAlert} />
            <Kpi label="Vencem em 90 dias" valor={venc.resumo.atencao} cor="#eab308" icone={Clock} />
            <Kpi label="Em dia" valor={venc.resumo.ok} cor="#10b981" icone={CircleCheck} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={farolFiltro || '__all__'} onValueChange={(v) => setFarolFiltro(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 w-[190px] bg-card text-xs"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {Object.entries(FAROL_UI).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {venc.resumo.aproximados > 0 && (
              <Badge variant="outline" className={FAROL_UI.ATENCAO!.classe}>
                {venc.resumo.aproximados} com data-limite aproximada (sem admissão no cadastro)
              </Badge>
            )}
          </div>

          <TabelaRelatorio<VencRow>
            titulo="Períodos em aberto por vencimento"
            nomeArquivo={`ferias-vencimentos-${new Date().toISOString().slice(0, 10)}`}
            rows={vencFiltradas}
            rowKey={(r) => r.periodoId}
            onRowClick={(r) => irParaPeriodo(r.periodoId)}
            rodape="Vencido = período concessivo encerrado (art. 134). A partir daí as férias são devidas em dobro (art. 137). Datas marcadas com ~ são aproximadas: o colaborador está sem data de admissão no cadastro."
            cols={[
              { label: 'Nº', get: (r) => String(r.numero), className: 'tabular-nums text-muted-foreground' },
              { label: 'Colaborador', get: (r) => r.nome, render: (r) => (
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">{r.nome}</span>
                  {r.ativo === false && <Badge variant="outline" className="text-[9px]">desligado</Badge>}
                </span>
              ) },
              { label: 'Área', get: (r) => r.area ?? '—' },
              { label: 'Admissão', get: (r) => dataBR(r.admissao), className: 'tabular-nums' },
              { label: 'Período', get: (r) => r.periodo, className: 'tabular-nums' },
              { label: 'Dias', get: (r) => String(r.dias), className: 'tabular-nums text-center' },
              { label: 'Gozados', get: (r) => String(r.gozados), className: 'tabular-nums text-center' },
              { label: 'Dias disp.', get: (r) => String(r.saldo), className: 'tabular-nums text-center font-semibold' },
              { label: 'Limite legal', get: (r) => `${dataBR(r.limite)}${r.limiteAproximado ? ' ~' : ''}`, className: 'tabular-nums' },
              { label: 'Prazo', get: (r) => (r.diasRestantes < 0 ? `${Math.abs(r.diasRestantes)} dias vencido` : `${r.diasRestantes} dias`), className: 'tabular-nums' },
              { label: 'Situação', get: (r) => FAROL_UI[r.farol]?.label ?? r.farol, render: (r) => (
                <Badge variant="outline" className={cn('text-[10px]', FAROL_UI[r.farol]?.classe)}>{FAROL_UI[r.farol]?.label ?? r.farol}</Badge>
              ) },
            ]}
          />
        </div>
      )}

      {/* ── Saldos ── */}
      {!loading && aba === 'saldos' && saldos && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Colaboradores" valor={saldos.resumo.colaboradores} icone={Users} />
            <Kpi label="Dias disponíveis" valor={saldos.resumo.totalDias} hint="Somatório dos períodos em aberto" icone={CalendarDays} />
          </div>
          <TabelaRelatorio<SaldoRow>
            titulo="Saldo por colaborador"
            nomeArquivo={`ferias-saldos-${new Date().toISOString().slice(0, 10)}`}
            rows={saldos.rows}
            rowKey={(r) => r.chave}
            onRowClick={(r) => { const p = r.periodos[0]; if (p) irParaPeriodo(p.id) }}
            rodape="Um registro por colaborador. Os períodos anteriores continuam no histórico dentro de cada registro."
            cols={[
              { label: 'Colaborador', get: (r) => r.nome, render: (r) => (
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">{r.nome}</span>
                  {r.ativo === false && <Badge variant="outline" className="text-[9px]">desligado</Badge>}
                  {r.ativo === null && <Badge variant="outline" className="text-[9px]">sem cadastro</Badge>}
                </span>
              ) },
              { label: 'Área', get: (r) => r.area ?? '—' },
              { label: 'Cargo', get: (r) => r.cargo ?? '—' },
              { label: 'Admissão', get: (r) => dataBR(r.admissao), className: 'tabular-nums' },
              { label: 'Períodos', get: (r) => String(r.totalPeriodos), className: 'tabular-nums text-center' },
              { label: 'Em aberto', get: (r) => String(r.periodosAbertos), className: 'tabular-nums text-center' },
              { label: 'Dias disp.', get: (r) => String(r.disponivel), className: 'tabular-nums text-center font-semibold' },
              { label: 'Próximo limite', get: (r) => dataBR(r.proximoLimite), className: 'tabular-nums' },
            ]}
          />
        </div>
      )}

      {/* ── Escala anual ── */}
      {!loading && aba === 'escala' && escala && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="h-8 w-[120px] bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline">{escala.resumo.colaboradores} colaborador(es) · {escala.resumo.dias} dia(s) no ano</Badge>
            {escala.resumo.picoMes.mes >= 0 && (
              <Badge variant="outline" className={FAROL_UI.ATENCAO!.classe}>
                Pico em {escala.meses[escala.resumo.picoMes.mes]}: {escala.resumo.picoMes.pessoas} pessoa(s)
              </Badge>
            )}
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-3 py-2 text-[13px] font-semibold">
              Mapa de {escala.ano} <span className="font-normal text-muted-foreground">· dias de gozo por mês</span>
            </div>
            <div className="nice-scrollbar max-h-[520px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Colaborador</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Área</th>
                    {escala.meses.map((m) => <th key={m} className="px-1 py-2 text-center font-semibold uppercase tracking-wider">{m}</th>)}
                    <th className="px-3 py-2 text-center font-semibold uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {escala.linhas.length === 0 ? (
                    <tr><td colSpan={15} className="px-3 py-10 text-center text-muted-foreground">Nenhum gozo lançado em {escala.ano}.</td></tr>
                  ) : escala.linhas.map((l) => (
                    <tr key={l.colaboradorId ?? l.nome} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-medium">{l.nome}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{l.area ?? '—'}</td>
                      {l.meses.map((d, i) => (
                        <td key={i} className="px-1 py-1.5 text-center tabular-nums">
                          {d > 0 ? (
                            <span
                              className="inline-flex h-6 min-w-[26px] items-center justify-center rounded px-1 font-semibold"
                              style={{
                                background: `color-mix(in srgb, ${MODULE_COLOR} ${Math.min(70, 18 + d * 2)}%, transparent)`,
                                color: `color-mix(in srgb, ${MODULE_COLOR} 70%, #0f172a)`,
                              }}
                            >{d}</span>
                          ) : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-center font-semibold tabular-nums">{l.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-muted/20">
                  <tr>
                    <td className="px-3 py-2 font-semibold" colSpan={2}>Pessoas fora no mês</td>
                    {escala.porMes.map((m) => (
                      <td key={m.mes} className="px-1 py-2 text-center font-semibold tabular-nums">{m.pessoas || <span className="text-muted-foreground/40">·</span>}</td>
                    ))}
                    <td className="px-3 py-2 text-center font-semibold tabular-nums">{escala.resumo.dias}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <TabelaRelatorio
            titulo={`Gozos de ${escala.ano}`}
            nomeArquivo={`ferias-escala-${escala.ano}`}
            rows={escala.gozos}
            rowKey={(g, i) => `${g.periodoId}-${i}`}
            onRowClick={(g) => irParaPeriodo(g.periodoId)}
            cols={[
              { label: 'Colaborador', get: (g) => g.nome },
              { label: 'Área', get: (g) => g.area ?? '—' },
              { label: 'Período', get: (g) => g.periodo, className: 'tabular-nums' },
              { label: 'Início', get: (g) => dataBR(g.inicio), className: 'tabular-nums' },
              { label: 'Fim', get: (g) => dataBR(g.fim), className: 'tabular-nums' },
              { label: 'Dias', get: (g) => String(g.dias), className: 'tabular-nums text-center' },
              { label: 'Observação', get: (g) => g.descricao ?? '—' },
            ]}
          />
        </div>
      )}

      {/* ── Pagamentos ── */}
      {!loading && aba === 'pagamentos' && pagtos && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Atrasados" valor={pagtos.resumo.atrasados} hint="Gozo iniciado sem pagamento" cor="#e11d48" icone={CircleAlert} destaque={pagtos.resumo.atrasados > 0} />
            <Kpi label="Pagos fora do prazo" valor={pagtos.resumo.pagosEmAtraso} hint="Depois do limite do art. 145" cor="#f59e0b" icone={TriangleAlert} />
            <Kpi label="A pagar" valor={pagtos.resumo.aPagar} cor="#0ea5e9" icone={Wallet} />
            <Kpi label="Pagos" valor={pagtos.resumo.pagos} cor="#10b981" icone={CircleCheck} />
            <Kpi label="Sem recibo" valor={pagtos.resumo.semRecibo} hint="Gozo lançado, arquivo faltando" icone={FileText} />
          </div>

          <Select value={situacaoPagto || '__all__'} onValueChange={(v) => setSituacaoPagto(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 w-[210px] bg-card text-xs"><SelectValue placeholder="Situação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as situações</SelectItem>
              {Object.entries(PAGTO_UI).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <TabelaRelatorio<PagtoRow>
            titulo="Pagamentos e recibos"
            nomeArquivo={`ferias-pagamentos-${new Date().toISOString().slice(0, 10)}`}
            rows={pagtoFiltradas}
            rowKey={(r) => r.periodoId}
            onRowClick={(r) => irParaPeriodo(r.periodoId)}
            rodape="O pagamento das férias vence 2 dias antes do início do gozo (art. 145 da CLT). Em registros importados do v1, a data pode ser a do lançamento, e não a do pagamento efetivo."
            cols={[
              { label: 'Nº', get: (r) => String(r.numero), className: 'tabular-nums text-muted-foreground' },
              { label: 'Colaborador', get: (r) => r.nome },
              { label: 'Área', get: (r) => r.area ?? '—' },
              { label: 'Período', get: (r) => r.periodo, className: 'tabular-nums' },
              { label: 'Início do gozo', get: (r) => dataBR(r.inicioGozo), className: 'tabular-nums' },
              { label: 'Limite p/ pagar', get: (r) => dataBR(r.limitePagamento), className: 'tabular-nums' },
              { label: 'Previsão', get: (r) => dataBR(r.previsao), className: 'tabular-nums' },
              { label: 'Pagamento', get: (r) => dataBR(r.pagamento1), className: 'tabular-nums' },
              { label: 'Situação', get: (r) => PAGTO_UI[r.situacao]?.label ?? r.situacao, render: (r) => (
                <Badge variant="outline" className={cn('text-[10px]', PAGTO_UI[r.situacao]?.classe)}>{PAGTO_UI[r.situacao]?.label ?? r.situacao}</Badge>
              ) },
              { label: 'Recibo', get: (r) => (r.arquivos > 0 ? `${r.arquivos} arquivo(s)` : r.semRecibo ? 'Faltando' : '—'), render: (r) => (
                r.arquivos > 0
                  ? <span className="text-muted-foreground">{r.arquivos}</span>
                  : r.semRecibo
                    ? <Badge variant="outline" className={cn('text-[10px]', FAROL_UI.CRITICO!.classe)}>Faltando</Badge>
                    : <span className="text-muted-foreground/50">—</span>
              ) },
            ]}
          />
        </div>
      )}

      {/* ── Provisão ── */}
      {!loading && aba === 'provisao' && prov && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Dias provisionados" valor={prov.resumo.dias} hint={`${prov.resumo.colaboradores} colaborador(es)`} icone={CalendarDays} />
            <Kpi label="Férias" valor={reais(prov.resumo.base)} icone={Wallet} />
            <Kpi label="1/3 constitucional" valor={reais(prov.resumo.terco)} icone={Coins} />
            <Kpi label="Total com encargos" valor={reais(provTotalComEncargos)} hint={`Férias + 1/3 + ${(encargosPct * 100).toFixed(1)}% de encargos`} cor={MODULE_COLOR} icone={Coins} />
          </div>

          <Card className="p-3">
            <p className="mb-2 text-[13px] font-semibold">Encargos sobre a provisão</p>
            <p className="mb-3 text-[11px] text-muted-foreground">
              A incidência muda conforme o enquadramento da empresa — os percentuais são premissa sua, não do sistema.
              Aplicados sobre férias + 1/3.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              {[
                { label: 'INSS patronal (%)', v: encInss, set: setEncInss },
                { label: 'RAT/FAP (%)', v: encRat, set: setEncRat },
                { label: 'Terceiros (%)', v: encTerceiros, set: setEncTerceiros },
                { label: 'FGTS (%)', v: encFgts, set: setEncFgts },
              ].map((c) => (
                <div key={c.label} className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">{c.label}</p>
                  <Input type="number" step="0.1" value={c.v} onChange={(e) => c.set(e.target.value)} className="h-8 w-[110px] text-xs" />
                </div>
              ))}
              <Badge variant="outline" className="ml-auto">Encargos: {reais(provTotalComEncargos - prov.resumo.total)}</Badge>
            </div>
          </Card>

          {prov.semSalario.length > 0 && (
            <Card className="border-amber-300 p-3 dark:border-amber-800">
              <p className="text-xs">
                <b>{prov.semSalario.length} colaborador(es)</b> com {prov.resumo.diasSemSalario} dia(s) em aberto ficaram
                <b> fora da conta</b> por não terem salário no cadastro — o total abaixo está incompleto:{' '}
                <span className="text-muted-foreground">{prov.semSalario.map((s) => s.nome).join(', ')}</span>.
              </p>
            </Card>
          )}

          <TabelaRelatorio<ProvRow>
            titulo="Provisão por colaborador"
            nomeArquivo={`ferias-provisao-${new Date().toISOString().slice(0, 10)}`}
            rows={prov.rows}
            rowKey={(r) => r.colaboradorId ?? r.nome}
            rodape="Férias = dias em aberto × salário ÷ 30. O 1/3 é o terço constitucional. Os encargos do quadro acima não entram nesta tabela — só no total consolidado."
            cols={[
              { label: 'Colaborador', get: (r) => r.nome },
              { label: 'Área', get: (r) => r.area ?? '—' },
              { label: 'Cargo', get: (r) => r.cargo ?? '—' },
              { label: 'Salário', get: (r) => reais(r.salario), className: 'tabular-nums text-right' },
              { label: 'Dias', get: (r) => String(r.dias), className: 'tabular-nums text-center' },
              { label: 'Férias', get: (r) => reais(r.base), className: 'tabular-nums text-right' },
              { label: '1/3', get: (r) => reais(r.terco), className: 'tabular-nums text-right' },
              { label: 'Total', get: (r) => reais(r.total), className: 'tabular-nums text-right font-semibold' },
            ]}
          />
        </div>
      )}
    </div>
  )
}
