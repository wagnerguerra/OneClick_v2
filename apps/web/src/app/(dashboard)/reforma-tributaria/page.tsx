'use client'

/**
 * Simulador da reforma tributária.
 *
 * A tela é do CLIENTE ESCOLHIDO, e não do escritório inteiro: a versão anterior
 * abria com carteira, ranking, diagnóstico e histórico ao mesmo tempo, e quem
 * queria mostrar o impacto a um cliente precisava garimpar o número no meio de
 * tudo isso. Está preservada em `old/page-backup.tsx`.
 *
 * O que a seleção traz do cadastro: regime (tributação), atividade (deduzida do
 * CNAE) e faturamento mensal (média dos 12 meses de snapshots do ERP). Tudo
 * editável — a simulação é uma conversa, não um relatório fechado.
 *
 * A conta em si mora em `_lib/calculo.ts`, sem React e sem rede. A simulação
 * ANALÍTICA do backend (`reforma-tributaria.service`), que lê snapshot a
 * snapshot e classifica crédito por conta, continua existindo e não foi tocada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Settings2, LayoutGrid, TrendingUp, LayoutDashboard, Sigma,
  Loader2, Building2, Info, ListTree,
} from 'lucide-react'
import {
  Card, cn, Badge,
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderBar } from '@/components/page-header-bar'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { useTabLabel } from '@/hooks/use-tab-label'
import { SeletorCliente, type ClienteSimulador } from './_components/seletor-cliente'
import {
  SecaoConfigurar, SecaoComparar, SecaoTransicao, SecaoVisaoGeral, SecaoCalculadora,
  type ItemComposicao,
} from './_components/secoes'
import {
  type Parametros, type Regime, type Atividade, type Operacao,
  PADRAO, ROTULO_REGIME, ROTULO_ATIVIDADE, reais, porcento,
  calcularRegime, calcularIva,
} from './_lib/calculo'

type Aba = 'configurar' | 'comparar' | 'transicao' | 'visao' | 'calculadora'

const NAV: Array<{ grupo: string | null; itens: Array<{ id: Aba; label: string; icone: typeof Settings2 }> }> = [
  { grupo: null, itens: [{ id: 'configurar', label: 'Configurar', icone: Settings2 }] },
  {
    grupo: 'Simulações',
    itens: [
      { id: 'comparar', label: 'Comparar Regimes', icone: LayoutGrid },
      { id: 'transicao', label: 'Transição 2026–2033', icone: TrendingUp },
    ],
  },
  { grupo: 'Resultado', itens: [{ id: 'visao', label: 'Visão Geral', icone: LayoutDashboard }] },
  { grupo: 'Calculadora', itens: [{ id: 'calculadora', label: 'Calculadora IBS/CBS', icone: Sigma }] },
]

/**
 * Tributação do cadastro → regime do simulador. O cadastro tem mais variações
 * (MEI, imune, isento) do que o simulador comporta; o que não é Simples nem
 * Presumido cai em Lucro Real, que é o cenário de maior carga — errar para o
 * lado pessimista é menos ruim do que prometer economia que não existe.
 */
function regimeDoCadastro(tributacao: string | null): Regime {
  const t = (tributacao ?? '').toUpperCase()
  if (t.includes('SIMPLES') || t.includes('MEI')) return 'SIMPLES'
  if (t.includes('PRESUMIDO')) return 'LUCRO_PRESUMIDO'
  return 'LUCRO_REAL'
}

/**
 * Atividade a partir do CNAE. A divisão (dois primeiros dígitos) basta:
 * 05–33 indústria, 45–47 comércio, o resto serviço.
 */
function atividadeDoCnae(cnae: string | null): Atividade {
  const d = (cnae ?? '').replace(/\D/g, '')
  if (d.length < 2) return 'SERVICOS'
  const divisao = Number(d.slice(0, 2))
  if (divisao >= 5 && divisao <= 33) return 'INDUSTRIA'
  if (divisao >= 45 && divisao <= 47) return 'COMERCIO'
  return 'SERVICOS'
}

const PARAMETROS_INICIAIS: Parametros = {
  regime: 'LUCRO_REAL',
  atividade: 'SERVICOS',
  faturamentoMensal: 0,
  despesasCreditaveis: 0,
  ...PADRAO,
}

export default function ReformaTributariaPage() {
  useTabLabel('Reforma Tributária')

  const [aba, setAba] = useState<Aba>('configurar')
  const [cliente, setCliente] = useState<ClienteSimulador | null>(null)
  const [carregandoCliente, setCarregandoCliente] = useState(false)
  const [p, setP] = useState<Parametros>(PARAMETROS_INICIAIS)
  const [op, setOp] = useState<Operacao>({ valor: 50000, despesasCreditaveis: 0, reducao: 0 })
  /** De onde veio o faturamento — a tela diz, para ninguém apresentar um número
   *  sem saber a procedência. */
  const [origem, setOrigem] = useState<'contrato' | 'erp' | 'nenhuma'>('nenhuma')
  /** Contas do balancete que somam a base de crédito, quando o diagnóstico as
   *  conhece. Sem balancete importado a lista é vazia e o valor não abre. */
  const [composicao, setComposicao] = useState<ItemComposicao[]>([])
  const [verComposicao, setVerComposicao] = useState(false)

  const alterar = useCallback((patch: Partial<Parametros>) => setP(prev => ({ ...prev, ...patch })), [])

  /**
   * Ao escolher o cliente, o formulário nasce com o que o cadastro sabe dele.
   * As despesas creditáveis vêm do diagnóstico (compras e serviços tomados nos
   * últimos 12 meses); sem ERP, ficam em zero e a pessoa preenche — melhor um
   * campo vazio e honesto do que um palpite que ninguém sabe de onde veio.
   */
  const escolher = useCallback(async (c: ClienteSimulador | null) => {
    setCliente(c)
    if (!c) { setP(PARAMETROS_INICIAIS); setOrigem('nenhuma'); setComposicao([]); return }

    // O faturamento do PARÂMETRO DE CONTRATO vem primeiro: é a consulta ao SCI
    // que a Gestão de Contratos usa para precificar, e é mensal. O snapshot do
    // ERP é a reserva — série de 12 meses, que nem todo cliente tem.
    const doContrato = c.faturamentoContrato > 0 ? c.faturamentoContrato : 0
    const doErp = c.faturamento12m > 0 ? c.faturamento12m / 12 : 0
    const mensal = doContrato || doErp
    setOrigem(doContrato ? 'contrato' : doErp ? 'erp' : 'nenhuma')
    setP(prev => ({
      ...prev,
      regime: regimeDoCadastro(c.tributacao),
      atividade: atividadeDoCnae(c.cnaePrincipal),
      faturamentoMensal: Math.round(mensal),
      despesasCreditaveis: 0,
    }))

    setCarregandoCliente(true)
    setComposicao([])
    try {
      const d = await (trpc.reformaTributaria as never as {
        diagnostico: { query: (i: { clienteId: string; meses: number }) => Promise<{
          metrics: {
            comprasMercadorias12m: number
            servicosTomados12m: number
            creditos: { baseAjustada12m: number; itens: ItemComposicao[] }
          }
        }> }
      }).diagnostico.query({ clienteId: c.id, meses: 12 })

      // A base do balancete tem precedência sobre compras+serviços: ela vem de
      // contas classificadas uma a uma, e é a única que sabe dizer de onde veio.
      const doBalancete = d.metrics.creditos?.baseAjustada12m ?? 0
      const doFiscal = d.metrics.comprasMercadorias12m + d.metrics.servicosTomados12m
      const anual = doBalancete > 0 ? doBalancete : doFiscal
      if (anual > 0) setP(prev => ({ ...prev, despesasCreditaveis: Math.round(anual / 12) }))
      if (doBalancete > 0) {
        setComposicao((d.metrics.creditos?.itens ?? []).filter(i => i.categoria === 'CREDITAVEL'))
      }
    } catch { /* sem ERP para este cliente — o campo fica editável em zero */ }
    finally { setCarregandoCliente(false) }
  }, [])

  // A calculadora herda o percentual de crédito do cadastro, mas continua
  // ajustável para a operação específica.
  useEffect(() => {
    const pct = p.faturamentoMensal > 0 ? (p.despesasCreditaveis / p.faturamentoMensal) * 100 : 0
    setOp(prev => ({ ...prev, despesasCreditaveis: Number(pct.toFixed(2)) }))
  }, [p.despesasCreditaveis, p.faturamentoMensal])

  const atual = useMemo(() => calcularRegime(p, p.regime), [p])
  const iva = useMemo(() => calcularIva(p), [p])
  const pronto = !!cliente && p.faturamentoMensal > 0

  return (
    <div className="space-y-5">
      <PageHeaderBar actions={<BackButton href="/dashboard" label="Voltar" />}>
        <h1 className="truncate">Reforma Tributária</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Fiscal</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Reforma Tributária</span>
        </p>
      </PageHeaderBar>

      {/* Cliente à esquerda, resumo à direita: escolher vem antes de ler, e a
          ordem da linha diz isso. O resumo é o contexto de todas as abas e some
          quando não há cliente. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SeletorCliente selecionado={cliente} onSelecionar={escolher} />
          {carregandoCliente && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        {pronto && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-5 py-2.5 shadow-sm">
            {[
              { r: 'Regime', v: ROTULO_REGIME[p.regime].toUpperCase() },
              { r: 'Atividade', v: ROTULO_ATIVIDADE[p.atividade].toUpperCase() },
              { r: 'Faturamento/mês', v: reais(p.faturamentoMensal) },
              { r: 'Carga hoje → nova', v: `${porcento(atual.aliquotaEfetiva)} → ${porcento(iva.aliquotaEfetiva)}` },
            ].map(x => (
              <div key={x.r}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{x.r}</p>
                <p className="text-sm font-bold tabular-nums text-foreground">{x.v}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {!cliente ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Escolha um cliente para começar</p>
          <p className="max-w-md text-xs text-muted-foreground">
            A lista traz os clientes mensais ativos deste tenant. A simulação nasce com o regime, a atividade
            e o faturamento do cadastro — e tudo continua editável.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          {/* Rail de navegação */}
          <nav className="lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-4">
              {NAV.map((g, gi) => (
                <div key={gi}>
                  {g.grupo && (
                    <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {g.grupo}
                    </p>
                  )}
                  <div className="space-y-1">
                    {g.itens.map(item => {
                      const Icone = item.icone
                      const ativa = aba === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAba(item.id)}
                          aria-current={ativa ? 'page' : undefined}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                            ativa
                              ? 'shadow-sm'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                          style={ativa ? { background: '#22d3ee', color: '#0f172a' } : undefined}
                        >
                          <Icone className="h-4 w-4 shrink-0" />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-6 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Simulador pedagógico. Os resultados são estimativas e devem ser validados com especialistas
              tributários.
            </p>
          </nav>

          {/* Conteúdo */}
          <div className="min-w-0">
            {aba === 'configurar' && (
              <SecaoConfigurar
                p={p} onChange={alterar} origem={origem}
                composicao={composicao}
                onAbrirComposicao={() => setVerComposicao(true)}
              />
            )}
            {aba === 'comparar' && <SecaoComparar p={p} />}
            {aba === 'transicao' && <SecaoTransicao p={p} onChange={alterar} />}
            {aba === 'visao' && <SecaoVisaoGeral p={p} cliente={cliente} />}
            {aba === 'calculadora' && (
              <SecaoCalculadora p={p} op={op} onChange={(patch) => setOp(prev => ({ ...prev, ...patch }))} />
            )}
          </div>
        </div>
      )}

      {/* Composição das despesas creditáveis — as contas do balancete que somam
          o valor, com o motivo da classificação. Os valores do diagnóstico são
          de 12 meses; aqui a coluna é mensal, para bater com o campo da tela. */}
      <Dialog open={verComposicao} onOpenChange={setVerComposicao}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={ListTree} color="sky">
            <DialogTitle>Despesas mensais creditáveis</DialogTitle>
            <DialogDescription>
              Contas do balancete classificadas como creditáveis. O total é a média mensal dos últimos 12 meses.
            </DialogDescription>
          </DialogHeaderIcon>
          <div className="nice-scrollbar max-h-[60vh] overflow-y-auto px-5 pb-5">
            {composicao.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Sem balancete importado para este cliente.
              </p>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 text-left">Conta</th>
                    <th className="py-2 text-left">Descrição</th>
                    <th className="py-2 text-right">Mensal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {composicao.map(i => (
                    <tr key={i.conta} title={i.motivo}>
                      <td className="py-2 pr-3 text-xs tabular-nums text-muted-foreground">{i.conta}</td>
                      <td className="py-2 pr-3 text-xs text-foreground">{i.nomeConta}</td>
                      <td className="py-2 text-right text-xs font-medium tabular-nums">{reais(i.valor / 12)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td colSpan={2} className="py-2.5 text-[13px] font-semibold text-foreground">
                      Total mensal
                      <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px] tabular-nums">
                        {composicao.length} conta(s)
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right text-sm font-bold tabular-nums">
                      {reais(composicao.reduce((a, i) => a + i.valor, 0) / 12)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
