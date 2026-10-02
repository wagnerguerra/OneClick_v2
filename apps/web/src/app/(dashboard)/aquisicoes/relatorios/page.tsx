'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BarChart3, FileWarning, Loader2, ShieldCheck } from 'lucide-react'
import {
  Card, cn, Tabs, TabsContent, TabsTrigger, SlidingTabsList,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { ChartTooltip, CHART_CURSOR_FILL } from '@/components/chart-tooltip'
import { trpc } from '@/lib/trpc'
import { BADGE, TEXT } from '@/lib/color-styles'
import { TIPO_FORNECIMENTO_LABELS } from '@saas/types'

/**
 * Relatórios de Aquisições (02/10/2026):
 *   - Avaliação de fornecedores (IQF) — evidência da ISO 9001, item 8.4
 *   - Gastos, com a curva ABC (Pareto) e a evolução mensal
 *   - Conferência pedido × nota fiscal
 * O cálculo mora no backend (compra/relatorios.ts); a tela só desenha.
 */

const MODULE_COLOR = 'var(--mod-qualidade, #f59e0b)'

type ClasseIqf = 'APROVADO' | 'RESTRICAO' | 'REPROVADO'
interface LinhaIqf {
  fornecedorId: string; fornecedor: string; avaliacoes: number; iqf: number; classe: ClasseIqf
  criterios: Array<{ criterio: string; pct: number; respostas: number }>
  melhorias: number; ultimaAvaliacao: string | null
}
interface Relatorios {
  iqf: {
    criterios: string[]; linhas: LinhaIqf[]
    resumo: { fornecedores: number; avaliacoes: number; aprovados: number; restricao: number; reprovados: number; melhorias: number; iqfGeral: number | null }
  }
  gastos: {
    total: number; pedidos: number; viaNf: number; nfSuspeita: number; ticketMedio: number
    fornecedores: Array<{ fornecedorId: string; fornecedor: string; pedidos: number; valor: number; pct: number; acumuladoPct: number; classe: 'A' | 'B' | 'C' }>
    abc: Array<{ classe: 'A' | 'B' | 'C'; fornecedores: number; valor: number; pct: number }>
    meses: Array<{ mes: string; valor: number; pedidos: number }>
    tipos: Array<{ tipo: string; valor: number }>
  }
  conferencia: {
    conferidos: number; semNf: number; acima: number; abaixo: number
    divergentes: Array<{ id: string; code: number; fornecedor: string; data: string; totalPedido: number; totalNf: number; diferenca: number; diferencaPct: number | null; fonte: string }>
  }
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCurto = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v)
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const fmtData = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')
const nomeMes = (m: string) => {
  const [a, mm] = m.split('-')
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mm) - 1]}/${a?.slice(2)}`
}

const CLASSE_IQF: Record<ClasseIqf, { label: string; badge: string }> = {
  APROVADO: { label: 'Aprovado', badge: BADGE.emerald },
  RESTRICAO: { label: 'Com restrição', badge: BADGE.amber },
  REPROVADO: { label: 'Reprovado', badge: BADGE.rose },
}
const CLASSE_ABC: Record<'A' | 'B' | 'C', string> = { A: BADGE.violet, B: BADGE.sky, C: BADGE.slate }
const FONTE_NF: Record<string, string> = { avaliacao: 'avaliação', recebimento: 'recebimento', danfe: 'DANFE anexado' }

// ── Período ────────────────────────────────────────────────────
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function periodoDe(p: string): { de?: string; ate?: string } {
  const h = hoje()
  const ano = Number(h.slice(0, 4))
  switch (p) {
    case '12m': { const d = new Date(`${h}T12:00:00`); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); return { de: d.toISOString().slice(0, 10), ate: h } }
    case 'ano': return { de: `${ano}-01-01`, ate: h }
    case 'ano_ant': return { de: `${ano - 1}-01-01`, ate: `${ano - 1}-12-31` }
    case '24m': { const d = new Date(`${h}T12:00:00`); d.setFullYear(d.getFullYear() - 2); return { de: d.toISOString().slice(0, 10), ate: h } }
    default: return {}
  }
}
const PERIODOS = [
  { v: '12m', label: 'Últimos 12 meses' },
  { v: 'ano', label: 'Ano atual' },
  { v: 'ano_ant', label: 'Ano anterior' },
  { v: '24m', label: 'Últimos 24 meses' },
  { v: 'tudo', label: 'Todo o histórico' },
]

type Aba = 'iqf' | 'gastos' | 'conferencia'

export default function RelatoriosAquisicoesPage() {
  const [periodo, setPeriodo] = useState('12m')
  const [aba, setAba] = useState<Aba>('iqf')
  const [dados, setDados] = useState<Relatorios | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setCarregando(true); setErro(null)
    ;(trpc.compra as any).relatorios.query(periodoDe(periodo))
      .then((d: Relatorios) => setDados(d))
      .catch((e: Error) => { setDados(null); setErro(e.message) })
      .finally(() => setCarregando(false))
  }, [periodo])

  return (
    <div className="space-y-5">
      <PageHeaderBar actions={<BackButton href="/aquisicoes" label="Voltar" />}>
        <h1 className="truncate">Relatórios de Aquisições</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span><span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/aquisicoes" className="transition-colors hover:text-foreground">Aquisições</Link>
          <span className="text-muted-foreground/50">›</span><span>Relatórios</span>
        </p>
      </PageHeaderBar>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SlidingTabsList
            activeValue={aba}
            indicatorInsetY={4}
            className="!shadow-sm !border !border-border gap-1 !p-1 !bg-muted/40 !rounded-full w-fit max-w-full items-center overflow-x-auto scrollbar-none"
            indicatorClassName="!bg-card !shadow-md"
          >
            {([
              { v: 'iqf', Icon: ShieldCheck, label: 'Avaliação de fornecedores' },
              { v: 'gastos', Icon: BarChart3, label: 'Gastos' },
              { v: 'conferencia', Icon: FileWarning, label: 'Pedido × nota' },
            ] as const).map(({ v, Icon, label }) => (
              <TabsTrigger key={v} value={v}
                className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-2 !text-xs !font-semibold !text-foreground/60 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-foreground gap-1.5 leading-none !items-center whitespace-nowrap">
                <Icon className="h-3.5 w-3.5" /> {label}
              </TabsTrigger>
            ))}
          </SlidingTabsList>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : erro || !dados ? (
          <Card className="py-12 text-center text-sm text-muted-foreground">{erro ?? 'Não foi possível carregar os relatórios.'}</Card>
        ) : (
          <>
            <TabsContent value="iqf" className="mt-4"><RelatorioIqf d={dados.iqf} /></TabsContent>
            <TabsContent value="gastos" className="mt-4"><RelatorioGastos d={dados.gastos} /></TabsContent>
            <TabsContent value="conferencia" className="mt-4"><RelatorioConferencia d={dados.conferencia} /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}

function Indicador({ titulo, valor, nota, cor }: { titulo: string; valor: string; nota?: string; cor?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={cn('mt-1 text-[22px] font-bold leading-tight tabular-nums', cor)}>{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
    </Card>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <Card className="py-12 text-center text-sm text-muted-foreground">{texto}</Card>
}

// ── IQF ────────────────────────────────────────────────────────
function RelatorioIqf({ d }: { d: Relatorios['iqf'] }) {
  if (!d.linhas.length) return <Vazio texto="Nenhuma avaliação com critérios respondidos no período." />
  const r = d.resumo
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="IQF geral" valor={r.iqfGeral != null ? pct(r.iqfGeral) : '—'} nota={`${r.avaliacoes} avaliações de ${r.fornecedores} fornecedores`} />
        <Indicador titulo="Aprovados" valor={String(r.aprovados)} nota="IQF ≥ 90%" cor={TEXT.emerald} />
        <Indicador titulo="Com restrição" valor={String(r.restricao)} nota="IQF de 70% a 89,9%" cor={TEXT.amber} />
        <Indicador titulo="Reprovados" valor={String(r.reprovados)} nota={`IQF < 70% · ${r.melhorias} melhoria(s) aberta(s)`} cor={TEXT.rose} />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border/60 bg-muted/20 px-4 py-2.5">
          <p className="text-[13px] font-semibold">Índice de Qualidade do Fornecedor</p>
          <p className="text-[11px] text-muted-foreground">
            % de “Atende” nos critérios da avaliação. Piores primeiro. Evidência da avaliação e reavaliação de fornecedores (ISO 9001, 8.4).
          </p>
        </div>
        <div className="nice-scrollbar overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px] text-xs">Fornecedor</TableHead>
                <TableHead className="text-center text-xs">Avaliações</TableHead>
                {d.criterios.map((c) => <TableHead key={c} className="min-w-[96px] text-center text-xs">{c}</TableHead>)}
                <TableHead className="text-center text-xs">IQF</TableHead>
                <TableHead className="text-xs">Classificação</TableHead>
                <TableHead className="text-center text-xs">Melhorias</TableHead>
                <TableHead className="text-xs">Última</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.linhas.map((l) => (
                <TableRow key={l.fornecedorId}>
                  <TableCell className="max-w-[280px] truncate text-xs font-medium" title={l.fornecedor}>{l.fornecedor}</TableCell>
                  <TableCell className="text-center text-xs tabular-nums">{l.avaliacoes}</TableCell>
                  {l.criterios.map((c) => (
                    <TableCell key={c.criterio} className={cn('text-center text-xs tabular-nums', c.respostas && c.pct < 70 && TEXT.rose)}>
                      {c.respostas ? pct(c.pct) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-center text-xs font-bold tabular-nums">{pct(l.iqf)}</TableCell>
                  <TableCell><span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium', CLASSE_IQF[l.classe].badge)}>{CLASSE_IQF[l.classe].label}</span></TableCell>
                  <TableCell className="text-center text-xs tabular-nums">{l.melhorias || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtData(l.ultimaAvaliacao)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

// ── Gastos ─────────────────────────────────────────────────────
function RelatorioGastos({ d }: { d: Relatorios['gastos'] }) {
  const meses = useMemo(() => d.meses.map((m) => ({ ...m, nome: nomeMes(m.mes) })), [d.meses])
  if (!d.pedidos) return <Vazio texto="Nenhum pedido aprovado no período." />
  const a = d.abc.find((x) => x.classe === 'A')
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Total gasto" valor={brl(d.total)} nota={`${d.pedidos} pedidos · ${d.viaNf} pelo valor da nota`} />
        <Indicador titulo="Ticket médio" valor={brl(d.ticketMedio)} nota="por pedido" />
        <Indicador titulo="Fornecedores" valor={String(d.fornecedores.length)} nota={a ? `${a.fornecedores} concentram ${pct(a.pct)} (classe A)` : undefined} />
        <Indicador titulo="Notas suspeitas" valor={String(d.nfSuspeita)} cor={d.nfSuspeita ? TEXT.amber : undefined}
          nota="fora de ½× a 2× o pedido — contou o pedido" />
      </div>

      {meses.length > 1 && (
        <Card className="px-4 pb-2 pt-3">
          <p className="text-[13px] font-semibold">Gasto por mês</p>
          <p className="mb-2 text-[11px] text-muted-foreground">Pela data do pedido.</p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={meses} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => brlCurto(v)} width={72} />
                <Tooltip content={<ChartTooltip format={(v) => brl(v)} />} cursor={{ fill: CHART_CURSOR_FILL }} />
                <Bar dataKey="valor" name="Gasto" fill={MODULE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-2.5">
            <p className="text-[13px] font-semibold">Curva ABC de fornecedores</p>
            <p className="text-[11px] text-muted-foreground">A: até 80% do gasto · B: até 95% · C: o restante.</p>
          </div>
          <div className="nice-scrollbar max-h-[520px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-xs">#</TableHead>
                  <TableHead className="text-xs">Fornecedor</TableHead>
                  <TableHead className="text-center text-xs">Pedidos</TableHead>
                  <TableHead className="text-right text-xs">Valor</TableHead>
                  <TableHead className="text-right text-xs">%</TableHead>
                  <TableHead className="w-[140px] text-xs">Acumulado</TableHead>
                  <TableHead className="text-center text-xs">Classe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.fornecedores.map((f, i) => (
                  <TableRow key={f.fornecedorId}>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs font-medium" title={f.fornecedor}>{f.fornecedor}</TableCell>
                    <TableCell className="text-center text-xs tabular-nums">{f.pedidos}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{brl(f.valor)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{pct(f.pct)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.acumuladoPct)}%`, background: MODULE_COLOR }} />
                        </div>
                        <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">{pct(f.acumuladoPct)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn('inline-flex rounded-md border px-1.5 text-[11px] font-semibold', CLASSE_ABC[f.classe])}>{f.classe}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="px-4 py-3">
            <p className="mb-2 text-[13px] font-semibold">Resumo da curva</p>
            <div className="space-y-2">
              {d.abc.map((x) => (
                <div key={x.classe} className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-flex w-6 justify-center rounded-md border text-[11px] font-semibold', CLASSE_ABC[x.classe])}>{x.classe}</span>
                  <span className="flex-1 text-muted-foreground">{x.fornecedores} fornecedor(es)</span>
                  <span className="tabular-nums">{pct(x.pct)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="px-4 py-3">
            <p className="mb-2 text-[13px] font-semibold">Por tipo de fornecimento</p>
            <div className="space-y-1.5">
              {d.tipos.map((t) => (
                <div key={t.tipo} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{TIPO_FORNECIMENTO_LABELS[t.tipo] ?? 'Não informado'}</span>
                  <span className="shrink-0 tabular-nums">{brl(t.valor)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Pedido × nota ──────────────────────────────────────────────
function RelatorioConferencia({ d }: { d: Relatorios['conferencia'] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Pedidos conferidos" valor={String(d.conferidos)} nota={`${d.semNf} recebido(s) sem valor de nota`} />
        <Indicador titulo="Com divergência" valor={String(d.divergentes.length)} cor={d.divergentes.length ? TEXT.amber : TEXT.emerald}
          nota="diferença acima de R$ 0,05" />
        <Indicador titulo="Notas acima do pedido" valor={brl(d.acima)} cor={d.acima ? TEXT.rose : undefined} nota="pago a mais que o aprovado" />
        <Indicador titulo="Notas abaixo do pedido" valor={brl(Math.abs(d.abaixo))} nota="ou valor de nota digitado errado" />
      </div>
      {!d.divergentes.length ? (
        <Vazio texto="Todas as notas fecham com o total do pedido." />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-2.5">
            <p className="text-[13px] font-semibold">Pedidos em que a nota não fecha com o pedido</p>
            <p className="text-[11px] text-muted-foreground">
              Maior diferença primeiro. Diferença muito grande costuma ser erro de digitação do valor da nota — corrija na avaliação do pedido.
            </p>
          </div>
          <div className="nice-scrollbar max-h-[560px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Pedido</TableHead>
                  <TableHead className="text-xs">Fornecedor</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-right text-xs">Pedido</TableHead>
                  <TableHead className="text-right text-xs">Nota(s)</TableHead>
                  <TableHead className="text-right text-xs">Diferença</TableHead>
                  <TableHead className="text-xs">Valor da nota vindo de</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.divergentes.map((x) => {
                  const grave = x.diferencaPct == null || Math.abs(x.diferencaPct) >= 50
                  return (
                    <TableRow key={x.id}>
                      <TableCell className="text-xs">
                        <Link href={`/aquisicoes/${x.id}`} className="font-semibold hover:underline">#{x.code}</Link>
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs" title={x.fornecedor}>{x.fornecedor}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtData(x.data)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{brl(x.totalPedido)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{brl(x.totalNf)}</TableCell>
                      <TableCell className={cn('whitespace-nowrap text-right text-xs font-semibold tabular-nums', x.diferenca > 0 ? TEXT.rose : TEXT.sky)}>
                        <span className="inline-flex items-center gap-1">
                          {grave && <span title="Diferença de 50% ou mais — provável erro de digitação"><AlertTriangle className="h-3.5 w-3.5" /></span>}
                          {x.diferenca > 0 ? '+' : ''}{brl(x.diferenca)}
                          {x.diferencaPct != null && <span className="font-normal text-muted-foreground">({x.diferenca > 0 ? '+' : ''}{pct(x.diferencaPct)})</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{FONTE_NF[x.fonte] ?? x.fonte}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
