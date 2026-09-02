'use client'

/**
 * As cinco telas do simulador: Configurar, Comparar Regimes, Transição,
 * Visão Geral e Calculadora IBS/CBS.
 *
 * Todas leem o MESMO objeto de parâmetros e a mesma matemática (`_lib/calculo`).
 * Mudar a alíquota em Configurar muda a tabela da transição e o resultado da
 * calculadora — não há uma segunda cópia da conta em lugar nenhum.
 */

import { useMemo, useRef } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList,
} from 'recharts'
import { Info, TrendingDown, TrendingUp, HelpCircle, ListTree, Download, Share2 } from 'lucide-react'
import { Button, Card, Input, Label, Badge, cn } from '@saas/ui'
import {
  type Parametros, type Regime, type Atividade, type Operacao,
  ROTULO_REGIME, ROTULO_ATIVIDADE, ehServico, temIpi,
  calcularRegime, calcularIva, calcularTransicao, calcularOperacao,
  reais, porcento, reaisCurto,
} from '../_lib/calculo'

// ── Tema dos gráficos (receita do LuminAux, em tokens do tema) ───────────
const GRADE = { strokeDasharray: '3 3', stroke: 'var(--border)' } as const
const EIXO = {
  axisLine: false, tickLine: false,
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
} as const
const TOOLTIP = {
  contentStyle: {
    padding: 10, borderRadius: 10, background: 'var(--card)',
    border: '1px solid var(--border)', color: 'var(--foreground)',
    fontSize: 12, boxShadow: 'none',
  },
  labelStyle: { color: 'var(--muted-foreground)', fontSize: 11, marginBottom: 2 },
  cursor: { fill: 'var(--muted-foreground)', fillOpacity: 0.08 },
} as const

/** A cor do IVA é a mesma em toda a tela: é o cenário novo. */
const COR_IVA = '#22d3ee'
const COR_ATUAL = '#0f172a'
const COR_NEUTRA = '#cbd5e1'

const REGIMES: Regime[] = ['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES']

/** Uma conta do balancete que entra na base de crédito. */
export interface ItemComposicao {
  conta: string
  nomeConta: string
  categoria: 'CREDITAVEL' | 'NAO_CREDITAVEL' | 'REVISAR'
  /** Valor no período de 12 meses, como o diagnóstico devolve. */
  valor: number
  motivo: string
}

function Titulo({ eyebrow, titulo, descricao }: { eyebrow: string; titulo: string; descricao: string }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: COR_IVA }}>{eyebrow}</p>
      <h2 className="mt-0.5 text-xl font-bold tracking-tight text-foreground">{titulo}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descricao}</p>
    </div>
  )
}

/**
 * Campo de dinheiro em pt-BR.
 *
 * O estado continua sendo NÚMERO; a máscara é só apresentação. Digitar move da
 * direita para a esquerda, como em caixa registradora: cada tecla é um centavo
 * a mais. Um `<input type="number">` mostrava "1500000" e obrigava a pessoa a
 * contar as casas para saber se era um milhão e meio ou quinze milhões.
 */
function CampoMoeda({ label, valor, onChange, className }: {
  label?: string; valor: number; onChange: (v: number) => void; className?: string
}) {
  const texto = (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div>
      {label && <Label className="text-[13px] font-semibold">{label}</Label>}
      <div className={cn('relative', label && 'mt-1.5')}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: COR_IVA }}>R$</span>
        <input
          inputMode="numeric"
          value={texto}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, '')
            onChange(digitos ? Number(digitos) / 100 : 0)
          }}
          className={cn(
            'h-10 w-full rounded-md border border-border bg-card pl-10 pr-3 text-right text-sm tabular-nums text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring/40',
            className,
          )}
        />
      </div>
    </div>
  )
}

function CampoPercentual({ label, valor, onChange, disabled }: {
  label: string; valor: number; onChange: (v: number) => void; disabled?: boolean
}) {
  return (
    <div>
      <Label className="text-[13px] font-semibold">{label}</Label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: COR_IVA }}>%</span>
        <Input
          type="number" step="0.01" min="0" max="100" disabled={disabled}
          value={Number.isFinite(valor) ? valor : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-10 pl-8 text-sm tabular-nums"
        />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 1. CONFIGURAR
// ══════════════════════════════════════════════════════════════════
export function SecaoConfigurar({ p, onChange, origem, composicao, onAbrirComposicao }: {
  p: Parametros
  onChange: (patch: Partial<Parametros>) => void
  /** De onde veio o faturamento sugerido. */
  origem?: 'balancete' | 'contrato' | 'erp' | 'nenhuma'
  /** Contas do balancete que somam as despesas creditáveis. */
  composicao?: ItemComposicao[]
  onAbrirComposicao?: () => void
}) {
  const totalIva = p.cbs + p.ibs
  const servico = ehServico(p.atividade)

  return (
    <>
      <Titulo
        eyebrow="Comece aqui"
        titulo="Configurar simulação"
        descricao="Informe os dados da empresa e ajuste as alíquotas. Tudo nas outras abas é calculado a partir daqui."
      />

      <Card className="mb-5 border-t-2 p-5" style={{ borderTopColor: COR_IVA }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-foreground">Dados da empresa</h3>
          <span className="text-[11px] text-muted-foreground">usado em todas as simulações</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-[13px] font-semibold">Regime tributário atual</Label>
            <select
              value={p.regime}
              onChange={(e) => onChange({ regime: e.target.value as Regime })}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
            >
              {REGIMES.map(r => <option key={r} value={r}>{ROTULO_REGIME[r].toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[13px] font-semibold">Atividade</Label>
            <select
              value={p.atividade}
              onChange={(e) => onChange({ atividade: e.target.value as Atividade })}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
            >
              {(['INDUSTRIA', 'COMERCIO', 'SERVICOS'] as Atividade[]).map(a => (
                <option key={a} value={a}>{ROTULO_ATIVIDADE[a].toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <CampoMoeda
              label="Faturamento mensal"
              valor={p.faturamentoMensal}
              onChange={(v) => onChange({ faturamentoMensal: v })}
            />
            {/* A procedência do número fica à vista: apresentar faturamento sem
                saber de onde saiu é o jeito mais rápido de perder a conversa. */}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {origem === 'balancete'
                ? 'Das contas de receita do balancete importado.'
                : origem === 'contrato'
                  ? 'Do parâmetro de contrato (consulta ao SCI).'
                  : origem === 'erp'
                    ? 'Média dos últimos 12 meses de snapshot do ERP.'
                    : 'Sem faturamento no cadastro — informe o valor.'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Despesas mensais creditáveis
              </p>
              {/* Clicável quando há composição: o valor sozinho não diz de onde
                  veio, e quem apresenta precisa poder abrir a conta. */}
              {composicao && composicao.length > 0 ? (
                <button
                  type="button"
                  onClick={onAbrirComposicao}
                  className="mt-0.5 flex items-center gap-1.5 text-xl font-bold tabular-nums text-foreground underline-offset-4 hover:underline"
                  title="Ver as contas que somam este valor"
                >
                  {reais(p.despesasCreditaveis)}
                  <ListTree className="h-4 w-4 text-muted-foreground" />
                </button>
              ) : (
                <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{reais(p.despesasCreditaveis)}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {composicao && composicao.length > 0
                  ? `Soma de ${composicao.length} conta(s) do balancete — clique para ver.`
                  : 'É sobre elas que o IVA devolve crédito — o traço que mais muda em relação ao sistema atual.'}
              </p>
            </div>
            <div className="w-[200px]">
              <CampoMoeda valor={p.despesasCreditaveis} onChange={(v) => onChange({ despesasCreditaveis: v })} className="h-9" />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-[13px] font-semibold text-foreground">
            Alíquotas padrão · IVA Dual <span className="font-normal text-muted-foreground">(editáveis)</span>
          </h3>
          <div className="space-y-4">
            <CampoPercentual label="CBS — Federal" valor={p.cbs} onChange={(v) => onChange({ cbs: v })} />
            <CampoPercentual label="IBS — Estadual/Municipal" valor={p.ibs} onChange={(v) => onChange({ ibs: v })} />
          </div>
          <div
            className="mt-5 flex items-center justify-between rounded-lg px-4 py-3 text-white"
            style={{ background: `linear-gradient(135deg, ${COR_ATUAL}, #134e5e)` }}
          >
            <span className="text-sm font-semibold">Total IVA</span>
            <span className="text-lg font-bold tabular-nums">{porcento(totalIva)}</span>
          </div>
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            A alíquota do IVA ainda não está definida em lei, e a estimativa oficial varia de <b>26,5%</b> a <b>28%</b>.
          </p>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-[13px] font-semibold text-foreground">
            Sistema antigo · {ROTULO_REGIME[p.regime]} <span className="font-normal text-muted-foreground">(editáveis)</span>
          </h3>
          {p.regime === 'SIMPLES' ? (
            <div className="space-y-4">
              <CampoPercentual label="DAS — efetivo sobre o faturamento" valor={p.das} onChange={(v) => onChange({ das: v })} />
              <p className="text-[11px] text-muted-foreground">
                O DAS varia por anexo e faixa de receita. Confira a alíquota efetiva do cliente no PGDAS
                antes de apresentar o número.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <CampoPercentual label="PIS" valor={p.pis} onChange={(v) => onChange({ pis: v })} />
              <CampoPercentual label="COFINS" valor={p.cofins} onChange={(v) => onChange({ cofins: v })} />
              {temIpi(p.atividade) && (
                <CampoPercentual label="IPI — Indústria" valor={p.ipi} onChange={(v) => onChange({ ipi: v })} />
              )}
              {servico
                ? <CampoPercentual label="ISS — Município" valor={p.iss} onChange={(v) => onChange({ iss: v })} />
                : <CampoPercentual label="ICMS — Média" valor={p.icms} onChange={(v) => onChange({ icms: v })} />}
            </div>
          )}
        </Card>
      </div>

      <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
        Os resultados da simulação não substituem uma consultoria tributária. Confirme os dados, as alíquotas
        e as regras específicas do setor antes de tomar decisões.
      </p>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════
// 2. COMPARAR REGIMES
// ══════════════════════════════════════════════════════════════════
export function SecaoComparar({ p }: { p: Parametros }) {
  const linhas = useMemo(() => REGIMES.map(r => calcularRegime(p, r)), [p])
  const iva = useMemo(() => calcularIva(p), [p])
  const servico = ehServico(p.atividade)

  const dadosAliquota = [
    ...linhas.map(l => ({ nome: ROTULO_REGIME[l.regime], valor: l.aliquotaEfetiva, atual: l.regime === p.regime })),
    { nome: 'IVA', valor: iva.aliquotaEfetiva, atual: false },
  ]
  const dadosTotal = [
    ...linhas.map(l => ({ nome: ROTULO_REGIME[l.regime], valor: l.totalEfetivo, atual: l.regime === p.regime })),
    { nome: 'IVA', valor: iva.totalEfetivo, atual: false },
  ]

  const Celula = ({ children, forte }: { children: React.ReactNode; forte?: boolean }) => (
    <td className={cn('px-4 py-2.5 text-right text-sm tabular-nums', forte && 'font-semibold')}>{children}</td>
  )

  return (
    <>
      <Titulo
        eyebrow="Comparativo"
        titulo="Comparar Regimes"
        descricao="Carga tributária mensal de cada regime do sistema atual contra o novo IVA Dual (CBS + IBS), a partir dos dados de Configurar. O regime do cliente está destacado."
      />

      <Card className="mb-5 overflow-hidden">
        <div className="overflow-x-auto nice-scrollbar">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-white" style={{ background: `linear-gradient(90deg, ${COR_ATUAL}, #14343f)` }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Item</th>
                {linhas.map(l => (
                  <th key={l.regime} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1.5">
                      {ROTULO_REGIME[l.regime]}
                      {l.regime === p.regime && (
                        <Badge className="h-4 border-0 px-1.5 text-[9px]" style={{ background: COR_IVA, color: COR_ATUAL }}>
                          atual
                        </Badge>
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ background: COR_IVA, color: COR_ATUAL }}>
                  IVA · CBS + IBS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              <tr>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">PIS / DAS (CBS)</td>
                {linhas.map(l => <Celula key={l.regime}>{reais(l.federal)}</Celula>)}
                <Celula>{reais(iva.cbs)}</Celula>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">COFINS</td>
                {linhas.map(l => <Celula key={l.regime}>{l.cofins > 0 ? reais(l.cofins) : '—'}</Celula>)}
                <Celula>—</Celula>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">
                  {servico ? 'ISS (IBS)' : 'IPI / ICMS (IBS)'}
                </td>
                {linhas.map(l => <Celula key={l.regime}>{l.estadualMunicipal > 0 ? reais(l.estadualMunicipal) : '—'}</Celula>)}
                <Celula>{reais(iva.ibs)}</Celula>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">(−) Créditos</td>
                {linhas.map(l => (
                  <Celula key={l.regime}>
                    <span className={l.creditos > 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
                      {l.creditos > 0 ? `−${reais(l.creditos)}` : reais(0)}
                    </span>
                  </Celula>
                ))}
                <Celula>
                  <span className="text-rose-600 dark:text-rose-400">−{reais(iva.creditos)}</span>
                </Celula>
              </tr>
              <tr className="bg-muted/40">
                <td className="px-4 py-2.5 text-sm font-semibold text-foreground">Total nominal</td>
                {linhas.map(l => <Celula key={l.regime} forte>{reais(l.totalNominal)}</Celula>)}
                <Celula forte>{reais(iva.totalNominal)}</Celula>
              </tr>
              <tr className="text-white" style={{ background: `linear-gradient(90deg, ${COR_ATUAL}, #14343f)` }}>
                <td className="px-4 py-3 text-sm font-semibold">Total efetivo</td>
                {linhas.map(l => (
                  <td key={l.regime} className="px-4 py-3 text-right text-sm font-bold tabular-nums">{reais(l.totalEfetivo)}</td>
                ))}
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums" style={{ color: COR_IVA }}>
                  {reais(iva.totalEfetivo)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">Alíquota nominal</td>
                {linhas.map(l => <Celula key={l.regime}>{porcento(l.aliquotaNominal)}</Celula>)}
                <Celula>{porcento(iva.aliquotaNominal)}</Celula>
              </tr>
              <tr className="bg-muted/40">
                <td className="px-4 py-2.5 text-sm font-semibold text-foreground">Alíquota efetiva</td>
                {linhas.map(l => <Celula key={l.regime} forte>{porcento(l.aliquotaEfetiva)}</Celula>)}
                <Celula forte>{porcento(iva.aliquotaEfetiva)}</Celula>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <b>Importante:</b> a simulação não deve ser lida apenas pela alíquota final. Avalie também o impacto da
        geração de créditos, a relação com os clientes (quem compra pode aproveitar o crédito) e a
        competitividade do negócio.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-[13px] font-semibold">Alíquota efetiva por regime</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dadosAliquota} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRADE} vertical={false} />
              <XAxis dataKey="nome" {...EIXO} />
              <YAxis {...EIXO} tickFormatter={(v) => `${v}%`} />
              <Tooltip {...TOOLTIP} formatter={(v) => porcento(Number(v))} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="valor" position="top" formatter={(v) => porcento(Number(v))}
                  style={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                {dadosAliquota.map((d, i) => (
                  <Cell key={i} fill={d.nome === 'IVA' ? COR_IVA : d.atual ? COR_ATUAL : COR_NEUTRA} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-[13px] font-semibold">Imposto total efetivo <span className="font-normal text-muted-foreground">· por mês</span></p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dadosTotal} layout="vertical" margin={{ left: 8, right: 56 }}>
              <CartesianGrid {...GRADE} horizontal={false} />
              <XAxis type="number" {...EIXO} tickFormatter={reaisCurto} />
              <YAxis type="category" dataKey="nome" width={110} {...EIXO} />
              <Tooltip {...TOOLTIP} formatter={(v) => reais(Number(v))} />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={26}>
                <LabelList dataKey="valor" position="right" formatter={(v) => reaisCurto(Number(v))}
                  style={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                {dadosTotal.map((d, i) => (
                  <Cell key={i} fill={d.nome === 'IVA' ? COR_IVA : d.atual ? COR_ATUAL : COR_NEUTRA} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════
// 3. TRANSIÇÃO 2026–2033
// ══════════════════════════════════════════════════════════════════
export function SecaoTransicao({ p, onChange }: {
  p: Parametros; onChange: (patch: Partial<Parametros>) => void
}) {
  const anos = useMemo(() => calcularTransicao(p), [p])
  const atual = useMemo(() => calcularRegime(p, p.regime), [p])
  const iva = useMemo(() => calcularIva(p), [p])

  return (
    <>
      <Titulo
        eyebrow="2026 → 2033"
        titulo="Transição ano a ano"
        descricao="A migração do sistema antigo para o IBS/CBS não é um salto: acontece em etapas até 2033. Os valores são anuais e nominais — o crédito depende do perfil de compras e aparece em Comparar Regimes."
      />

      <Card className="mb-5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-foreground">Parâmetros</h3>
          <span className="text-[11px] text-muted-foreground">alterações refletem em todo o simulador</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-[13px] font-semibold">Regime atual</Label>
            <select
              value={p.regime}
              onChange={(e) => onChange({ regime: e.target.value as Regime })}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
            >
              {REGIMES.map(r => <option key={r} value={r}>{ROTULO_REGIME[r].toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[13px] font-semibold">Faturamento anual</Label>
            <p className="text-[11px] text-muted-foreground">faturamento mensal × 12</p>
            <div className="mt-1 flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium tabular-nums">
              {reais(p.faturamentoMensal * 12)}
            </div>
          </div>
          <div>
            <Label className="text-[13px] font-semibold">Carga atual → nova</Label>
            <p className="text-[11px] text-muted-foreground">alíquota efetiva</p>
            <div className="mt-1 flex h-10 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm font-medium tabular-nums">
              {porcento(atual.aliquotaEfetiva)}
              <span className="text-muted-foreground">→</span>
              <span style={{ color: COR_IVA }}>{porcento(iva.aliquotaEfetiva)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-5 overflow-hidden">
        <div className="overflow-x-auto nice-scrollbar">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-white" style={{ background: `linear-gradient(90deg, ${COR_ATUAL}, #14343f)` }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Ano</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Sistema antigo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">IBS (novo)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">CBS (novo)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ background: COR_IVA, color: COR_ATUAL }}>
                  Total a pagar
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">vs hoje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {anos.map(a => (
                <tr key={a.ano} title={a.nota}>
                  <td className="px-4 py-2.5 text-sm font-semibold tabular-nums text-foreground">{a.ano}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums">{reais(a.sistemaAntigo)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums">{reais(a.ibs)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums">{reais(a.cbs)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-foreground">{reais(a.total)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                      a.vsHoje < -0.005
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : a.vsHoje > 0.005
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          : 'bg-muted text-muted-foreground',
                    )}>
                      {a.vsHoje < -0.005 ? <TrendingDown className="h-3 w-3" /> : a.vsHoje > 0.005 ? <TrendingUp className="h-3 w-3" /> : null}
                      {porcento(a.vsHoje)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">Evolução do imposto a pagar</p>
            <span className="text-[11px] text-muted-foreground">2026–2033</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={anos} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rtTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COR_IVA} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COR_IVA} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRADE} vertical={false} />
              <XAxis dataKey="ano" {...EIXO} />
              <YAxis {...EIXO} tickFormatter={reaisCurto} width={78} />
              <Tooltip {...TOOLTIP} formatter={(v) => reais(Number(v))} />
              <Area type="monotone" dataKey="total" name="Total a pagar" stroke={COR_IVA} strokeWidth={2} fill="url(#rtTotal)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">Migração: sistema antigo × IBS/CBS</p>
            <span className="text-[11px] text-muted-foreground">cada componente ano a ano — não são somáveis</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={anos} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRADE} vertical={false} />
              <XAxis dataKey="ano" {...EIXO} />
              <YAxis {...EIXO} tickFormatter={reaisCurto} width={78} />
              <Tooltip {...TOOLTIP} formatter={(v) => reais(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="sistemaAntigo" name="Sistema antigo" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ibs" name="IBS (novo)" stroke={COR_IVA} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="cbs" name="CBS (novo)" stroke="#84cc16" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  )
}

/**
 * CSS da folha do resumo. Vai para dentro de um iframe na hora de imprimir,
 * onde não existem as variáveis de tema — por isso as cores são literais.
 */
const CSS_FOLHA = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  .rt-doc { max-width: 820px; margin: 0 auto; font-size: 10.5pt; line-height: 1.45; }
  .rt-doc h1 { margin: 0; font-size: 16pt; }
  .rt-doc .sub { margin: 4px 0 0; color: #475569; font-size: 9.5pt; }
  .rt-doc .chips { margin: 10px 0 0; color: #475569; font-size: 9pt; }
  .rt-doc .kpis { display: flex; gap: 10px; margin: 18px 0 0; }
  .rt-doc .kpi { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .rt-doc .kpi p { margin: 0; }
  .rt-doc .kpi .r { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .rt-doc .kpi .v { margin-top: 2px; font-size: 12pt; font-weight: 700; }
  .rt-doc .destaque { margin: 14px 0 0; border: 1px solid #bbf7d0; background: #f0fdf4;
                      border-radius: 8px; padding: 10px 12px; display: flex;
                      justify-content: space-between; font-weight: 700; }
  .rt-doc h2 { margin: 22px 0 8px; font-size: 11pt; }
  .rt-doc table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .rt-doc th { background: #0f172a; color: #fff; padding: 6px 8px; text-align: right;
               font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  .rt-doc th:first-child { text-align: left; }
  .rt-doc td { padding: 5px 8px; text-align: right; border-bottom: 1px solid #e2e8f0; }
  .rt-doc td:first-child { text-align: left; }
  .rt-doc tr.forte td { font-weight: 700; background: #f8fafc; }
  .rt-doc .rodape { margin-top: 26px; border-top: 1px solid #e2e8f0; padding-top: 8px;
                    font-size: 8pt; color: #64748b; }
  @page { size: A4; margin: 14mm 12mm; }
`

// ══════════════════════════════════════════════════════════════════
// 4. VISÃO GERAL
// ══════════════════════════════════════════════════════════════════
export function SecaoVisaoGeral({ p, cliente }: {
  p: Parametros
  cliente: { razaoSocial: string; documento: string | null; cnaePrincipal: string | null; cidade?: string | null; uf?: string | null } | null
}) {
  const atual = useMemo(() => calcularRegime(p, p.regime), [p])
  const iva = useMemo(() => calcularIva(p), [p])
  const diferenca = iva.totalEfetivo - atual.totalEfetivo
  const variacao = atual.totalEfetivo > 0 ? (diferenca / atual.totalEfetivo) * 100 : 0
  const economiaAnual = -diferenca * 12
  const alivio = diferenca < 0

  const anos = useMemo(() => calcularTransicao(p), [p])
  const folhaRef = useRef<HTMLDivElement>(null)

  /**
   * Imprime o resumo por um iframe — o mesmo caminho do comprovante de
   * protocolo. Não é geração de PDF no servidor: quem salva é o navegador, na
   * opção "Salvar como PDF" da própria caixa de impressão. Para um documento de
   * conversa isso basta, e evita subir uma rota que renderiza HTML no backend só
   * para carimbar um arquivo.
   */
  function baixarPdf() {
    const doc = folhaRef.current
    if (!doc) return
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(frame)
    const w = frame.contentWindow
    if (!w) { frame.remove(); return }
    w.document.open()
    w.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
      + `<title>Reforma tributária — ${cliente?.razaoSocial ?? 'simulação'}</title>`
      + `<style>${CSS_FOLHA}</style></head><body>${doc.innerHTML}</body></html>`,
    )
    w.document.close()
    setTimeout(() => { w.focus(); w.print(); setTimeout(() => frame.remove(), 1500) }, 250)
  }

  /**
   * Abre o WhatsApp com o resumo em texto. Sem número de destino: quem envia
   * escolhe o contato na hora — mandar direto para o telefone do cadastro seria
   * disparar mensagem em nome de alguém sem confirmação.
   */
  function compartilhar() {
    const linhas = [
      `*Simulação — Reforma Tributária*`,
      cliente?.razaoSocial ? `Empresa: ${cliente.razaoSocial}` : null,
      `Regime atual: ${ROTULO_REGIME[p.regime]} · ${ROTULO_ATIVIDADE[p.atividade]}`,
      `Faturamento mensal: ${reais(p.faturamentoMensal)}`,
      '',
      `Imposto hoje (efetivo): ${reais(atual.totalEfetivo)}/mês — ${porcento(atual.aliquotaEfetiva)}`,
      `Pós-reforma (IBS+CBS): ${reais(iva.totalEfetivo)}/mês — ${porcento(iva.aliquotaEfetiva)}`,
      `Diferença: ${diferenca < 0 ? '-' : '+'}${reais(Math.abs(diferenca))}/mês (${porcento(variacao)})`,
      `${diferenca < 0 ? 'Economia' : 'Custo adicional'} anual estimado: ${reais(Math.abs(economiaAnual))}`,
      '',
      'Estimativa pedagógica, com alíquota de referência de '
        + `${porcento(p.cbs + p.ibs)} (CBS ${porcento(p.cbs)} + IBS ${porcento(p.ibs)}). `
        + 'Não substitui consultoria tributária.',
    ].filter(Boolean).join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(linhas)}`, '_blank', 'noopener')
  }

  const antesDepois = [
    { nome: 'Hoje', valor: atual.totalEfetivo },
    { nome: 'Pós-reforma', valor: iva.totalEfetivo },
  ]
  const porRegime = [
    ...REGIMES.map(r => { const l = calcularRegime(p, r); return { nome: ROTULO_REGIME[r], valor: l.aliquotaEfetiva, atual: r === p.regime } }),
    { nome: 'IVA', valor: iva.aliquotaEfetiva, atual: false },
  ]

  /** CNPJ por extenso. Era mascarado, mas quem vê esta tela é a equipe e o
   *  próprio cliente — esconder o documento dele não protegia ninguém e ainda
   *  obrigava a conferir o número em outro lugar. */
  const cnpj = (() => {
    const d = (cliente?.documento ?? '').replace(/\D/g, '')
    if (d.length !== 14) return null
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  })()

  return (
    <>
      <div
        className="mb-5 overflow-hidden rounded-2xl px-7 py-8 text-white"
        style={{ background: `linear-gradient(120deg, ${COR_ATUAL} 0%, #0d3b47 60%, #0e5568 100%)` }}
      >
        {/* `text-white` explícito: o global de tipografia define
            `h1,h2,h3 { color: var(--color-foreground) }`, que vence a herança do
            container. No modo claro isso pintava o título de preto sobre a capa
            escura, e ele sumia. */}
        <h2 className="max-w-3xl text-2xl font-bold leading-snug tracking-tight text-white">
          O impacto da reforma em {cliente ? <>uma empresa de {ROTULO_ATIVIDADE[p.atividade].toLowerCase()}</> : 'uma empresa'}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          Comparação entre a carga tributária de hoje e o novo regime (IBS/CBS), considerando o perfil da
          atividade e os dados informados na simulação.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            cliente?.razaoSocial,
            cnpj ? `CNPJ ${cnpj}` : null,
            cliente?.cnaePrincipal ? `CNAE ${cliente.cnaePrincipal}` : null,
            cliente?.cidade && cliente?.uf ? `${cliente.cidade} · ${cliente.uf}` : null,
            ROTULO_REGIME[p.regime],
          ].filter(Boolean).map((t, i) => (
            <span key={i} className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl px-4 py-4 text-white" style={{ background: COR_ATUAL }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Imposto hoje · efetivo</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{reais(atual.totalEfetivo)}</p>
        </div>
        <div className="rounded-xl px-4 py-4" style={{ background: COR_IVA, color: COR_ATUAL }}>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Pós-reforma</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{reais(iva.totalEfetivo)}</p>
        </div>
        <Card className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Diferença mensal</p>
          <p className={cn('mt-1 text-xl font-bold tabular-nums', alivio ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
            {alivio ? '−' : '+'}{reais(Math.abs(diferenca))}
          </p>
        </Card>
        <div className={cn('rounded-xl px-4 py-4', alivio ? 'bg-lime-300 text-slate-900' : 'bg-rose-200 text-rose-950')}>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Variação</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{porcento(variacao)}</p>
        </div>
      </div>

      <div className={cn(
        'mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3',
        alivio
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
          : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30',
      )}>
        <span className={cn('text-sm font-medium', alivio ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300')}>
          {alivio ? 'Economia anual estimada' : 'Custo adicional anual estimado'}
        </span>
        <span className={cn('text-lg font-bold tabular-nums', alivio ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>
          {reais(Math.abs(economiaAnual))}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="gap-2" onClick={baixarPdf}>
          <Download className="h-4 w-4" />Baixar resultados em PDF
        </Button>
        <Button
          type="button" className="gap-2 text-white"
          style={{ background: '#25D366' }}
          onClick={compartilhar}
        >
          <Share2 className="h-4 w-4" />Compartilhar no WhatsApp
        </Button>
        <span className="text-xs text-muted-foreground">
          Envie o resumo da simulação para o cliente ou para a equipe.
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-[13px] font-semibold">Antes × depois <span className="font-normal text-muted-foreground">· imposto mensal</span></p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={antesDepois} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRADE} vertical={false} />
              <XAxis dataKey="nome" {...EIXO} />
              <YAxis {...EIXO} tickFormatter={reaisCurto} width={78} />
              <Tooltip {...TOOLTIP} formatter={(v) => reais(Number(v))} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={90}>
                <LabelList dataKey="valor" position="top" formatter={(v) => reaisCurto(Number(v))}
                  style={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Cell fill={COR_ATUAL} />
                <Cell fill={COR_IVA} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-[13px] font-semibold">Alíquota efetiva por regime</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porRegime} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRADE} vertical={false} />
              <XAxis dataKey="nome" {...EIXO} />
              <YAxis {...EIXO} tickFormatter={(v) => `${v}%`} />
              <Tooltip {...TOOLTIP} formatter={(v) => porcento(Number(v))} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="valor" position="top" formatter={(v) => porcento(Number(v))}
                  style={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                {porRegime.map((d, i) => (
                  <Cell key={i} fill={d.nome === 'IVA' ? COR_IVA : d.atual ? COR_ATUAL : COR_NEUTRA} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* A folha do PDF. Fica fora da tela em vez de `display:none` porque o
          conteúdo precisa existir para ser copiado — e leva os NÚMEROS, não os
          gráficos: SVG do Recharts depende de medida do container, e um gráfico
          gerado fora da vista sai torto no papel. */}
      <div ref={folhaRef} aria-hidden className="pointer-events-none fixed left-[-10000px] top-0 w-[820px]">
        <div className="rt-doc">
          <h1>Reforma tributária — impacto estimado</h1>
          <p className="sub">
            Comparação entre a carga de hoje e o novo regime (IBS + CBS), a partir dos dados da simulação.
          </p>
          <p className="chips">
            {[
              cliente?.razaoSocial,
              ROTULO_REGIME[p.regime],
              ROTULO_ATIVIDADE[p.atividade],
              `Faturamento mensal ${reais(p.faturamentoMensal)}`,
              `Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
            ].filter(Boolean).join('  ·  ')}
          </p>

          <div className="kpis">
            <div className="kpi"><p className="r">Imposto hoje</p><p className="v">{reais(atual.totalEfetivo)}</p></div>
            <div className="kpi"><p className="r">Pós-reforma</p><p className="v">{reais(iva.totalEfetivo)}</p></div>
            <div className="kpi"><p className="r">Diferença mensal</p><p className="v">{diferenca < 0 ? '−' : '+'}{reais(Math.abs(diferenca))}</p></div>
            <div className="kpi"><p className="r">Variação</p><p className="v">{porcento(variacao)}</p></div>
          </div>

          <div className="destaque">
            <span>{alivio ? 'Economia anual estimada' : 'Custo adicional anual estimado'}</span>
            <span>{reais(Math.abs(economiaAnual))}</span>
          </div>

          <h2>Comparativo de regimes — carga mensal</h2>
          <table>
            <thead>
              <tr>
                <th>Regime</th><th>Total nominal</th><th>Total efetivo</th>
                <th>Alíquota nominal</th><th>Alíquota efetiva</th>
              </tr>
            </thead>
            <tbody>
              {REGIMES.map(r => {
                const l = calcularRegime(p, r)
                return (
                  <tr key={r} className={r === p.regime ? 'forte' : undefined}>
                    <td>{ROTULO_REGIME[r]}{r === p.regime ? ' (atual)' : ''}</td>
                    <td>{reais(l.totalNominal)}</td>
                    <td>{reais(l.totalEfetivo)}</td>
                    <td>{porcento(l.aliquotaNominal)}</td>
                    <td>{porcento(l.aliquotaEfetiva)}</td>
                  </tr>
                )
              })}
              <tr className="forte">
                <td>IVA — CBS + IBS</td>
                <td>{reais(iva.totalNominal)}</td>
                <td>{reais(iva.totalEfetivo)}</td>
                <td>{porcento(iva.aliquotaNominal)}</td>
                <td>{porcento(iva.aliquotaEfetiva)}</td>
              </tr>
            </tbody>
          </table>

          <h2>Transição 2026–2033 — valores anuais</h2>
          <table>
            <thead>
              <tr><th>Ano</th><th>Sistema antigo</th><th>IBS</th><th>CBS</th><th>Total</th><th>vs hoje</th></tr>
            </thead>
            <tbody>
              {anos.map(a => (
                <tr key={a.ano}>
                  <td>{a.ano}</td>
                  <td>{reais(a.sistemaAntigo)}</td>
                  <td>{reais(a.ibs)}</td>
                  <td>{reais(a.cbs)}</td>
                  <td>{reais(a.total)}</td>
                  <td>{porcento(a.vsHoje)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="rodape">
            Alíquota de referência: CBS {porcento(p.cbs)} + IBS {porcento(p.ibs)} = {porcento(p.cbs + p.ibs)}.
            A alíquota final ainda não está definida em lei. Simulador pedagógico — os resultados são
            estimativas e não substituem consultoria tributária.
          </p>
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════
// 5. CALCULADORA IBS/CBS
// ══════════════════════════════════════════════════════════════════
export function SecaoCalculadora({ p, op, onChange }: {
  p: Parametros; op: Operacao; onChange: (patch: Partial<Operacao>) => void
}) {
  const r = useMemo(() => calcularOperacao(p, op), [p, op])
  const rosca = [
    { nome: 'Operação', valor: op.valor },
    { nome: 'IBS/CBS', valor: r.destacado },
  ]

  return (
    <>
      <Titulo
        eyebrow="Operação única"
        titulo="Calculadora IBS/CBS"
        descricao="Informe os dados de uma operação — os valores saem da própria nota fiscal — e veja o IBS/CBS destacado, o crédito a compensar e o total do documento."
      />

      <Card className="mb-5 flex gap-3 bg-muted/30 p-4">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: COR_IVA }}
        >
          <HelpCircle className="h-4 w-4" style={{ color: COR_ATUAL }} />
        </span>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="text-[13px] font-semibold text-foreground">Onde achar esses dados na NF-e</p>
          <p><b className="text-foreground">Valor da operação</b> — campo <code className="rounded bg-muted px-1">vBC</code> da nota, ou o valor da mercadoria/serviço antes dos impostos.</p>
          <p><b className="text-foreground">Redução</b> — bens e serviços com alíquota reduzida ou isenção trazem a observação no corpo da nota.</p>
          <p><b className="text-foreground">Crédito</b> — a fração da operação coberta por insumos já tributados.</p>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">Resultado</p>
            <span className="text-[11px] text-muted-foreground">atualiza em tempo real</span>
          </div>
          <div className="divide-y divide-border/60">
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">Débito CBS</span>
              <span className="font-semibold tabular-nums">{reais(r.debitoCbs)}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">Débito IBS</span>
              <span className="font-semibold tabular-nums">{reais(r.debitoIbs)}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">(−) Crédito a compensar</span>
              <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{reais(r.credito)}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">Alíquota efetiva</span>
              <span className="font-semibold tabular-nums">{porcento(r.aliquotaEfetiva)}</span>
            </div>
          </div>
          <div
            className="mt-3 flex items-center justify-between rounded-lg px-4 py-3 text-white"
            style={{ background: `linear-gradient(135deg, ${COR_ATUAL}, #134e5e)` }}
          >
            <span className="text-sm font-semibold">Valor a recolher</span>
            <span className="text-lg font-bold tabular-nums">{reais(r.aRecolher)}</span>
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-4 text-[13px] font-semibold">Dados da operação</p>
          <div className="space-y-4">
            <CampoMoeda
              label="Valor da operação (sem impostos)"
              valor={op.valor}
              onChange={(v) => onChange({ valor: v })}
            />
            <div>
              <Label className="text-[13px] font-semibold">Regime da operação</Label>
              <select
                value={op.reducao}
                onChange={(e) => onChange({ reducao: Number(e.target.value) })}
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
              >
                <option value={0}>Padrão — alíquota cheia</option>
                <option value={30}>Redução de 30% — profissões regulamentadas</option>
                <option value={60}>Redução de 60% — saúde, educação, alimentos</option>
                <option value={100}>Alíquota zero / isento</option>
              </select>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">% de despesas creditáveis</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Vem de Configurar: {reais(p.despesasCreditaveis)} de despesas ÷ {reais(p.faturamentoMensal)} de
                faturamento. Dá para ajustar só para esta operação.
              </p>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: COR_IVA }}>%</span>
                <Input
                  type="number" min="0" max="100" step="0.01" value={op.despesasCreditaveis}
                  onChange={(e) => onChange({ despesasCreditaveis: Number(e.target.value) })}
                  className="h-10 pl-8 text-sm tabular-nums"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <p className="mb-4 text-[13px] font-semibold">Composição da nota fiscal</p>
        <div className="grid items-center gap-5 lg:grid-cols-2">
          <div className="divide-y divide-border/60">
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">Valor da operação (base)</span>
              <span className="font-semibold tabular-nums">{reais(op.valor)}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">(+) IBS/CBS a destacar</span>
              <span className="font-semibold tabular-nums">{reais(r.destacado)}</span>
            </div>
            <div
              className="mt-2 flex items-center justify-between rounded-lg px-4 py-3"
              style={{ background: COR_IVA, color: COR_ATUAL }}
            >
              <span className="text-sm font-semibold">Total da nota fiscal</span>
              <span className="text-lg font-bold tabular-nums">{reais(r.totalNota)}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={rosca} dataKey="valor" nameKey="nome" innerRadius={62} outerRadius={98} paddingAngle={2}>
                <Cell fill={COR_ATUAL} />
                <Cell fill={COR_IVA} />
              </Pie>
              <Tooltip {...TOOLTIP} formatter={(v) => reais(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <p className="mt-5 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Simulador pedagógico. Os resultados são estimativas e devem ser validados com especialistas tributários.
      </p>
    </>
  )
}
