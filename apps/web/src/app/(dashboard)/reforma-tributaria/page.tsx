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
  Loader2, Building2, Info, ListTree, Database,
} from 'lucide-react'
import {
  Button, Card, cn, Badge,
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderBar } from '@/components/page-header-bar'
import { TEXT } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { useTabLabel } from '@/hooks/use-tab-label'
import { SeletorCliente, type ClienteSimulador } from './_components/seletor-cliente'
import { BalanceteModal } from './_components/balancete-modal'
import {
  SecaoConfigurar, SecaoComparar, SecaoTransicao, SecaoVisaoGeral, SecaoCalculadora,
  type ItemComposicao, type ItemFolha,
} from './_components/secoes'
import { type AtividadeSimples, type ClassificacaoIva } from './_lib/parametros-fiscais'
import {
  type Parametros, type Regime, type Atividade, type Operacao,
  PADRAO, ROTULO_REGIME, ROTULO_ATIVIDADE, reais, porcentoOuTraco,
  calcularComparativo, colunaDoRegime,
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

/**
 * Classificação do CNAE para as reduções da LC 214/2025 e para o anexo do
 * Simples.
 *
 * Só mapeia o que dá para afirmar pela divisão do CNAE. O que não se encaixa
 * cai em "sem redução" e "outros serviços" — errar para o lado da alíquota
 * cheia é menos ruim do que conceder uma redução que a empresa não tem.
 */
function perfilDoCnae(cnae: string | null): { classificacaoIva: ClassificacaoIva; atividadeSimples: AtividadeSimples } {
  const d = (cnae ?? '').replace(/\D/g, '')
  const divisao = d.length >= 2 ? Number(d.slice(0, 2)) : 0
  const grupo = d.length >= 4 ? d.slice(0, 4) : ''

  // 69.20 — atividades de contabilidade, auditoria e consultoria tributária.
  if (grupo === '6920') return { classificacaoIva: 'PROFISSAO_REGULAMENTADA', atividadeSimples: 'CONTABILIDADE' }
  // 69.11 — advocacia. Profissão regulamentada, mas Anexo IV no Simples.
  if (grupo === '6911') return { classificacaoIva: 'PROFISSAO_REGULAMENTADA', atividadeSimples: 'OUTROS_SERVICOS' }
  // 71 — serviços de arquitetura e engenharia.
  if (divisao === 71) return { classificacaoIva: 'PROFISSAO_REGULAMENTADA', atividadeSimples: 'ENGENHARIA_ARQUITETURA' }
  // 86 — atividades de atenção à saúde humana.
  if (divisao === 86) return { classificacaoIva: 'SAUDE_EDUCACAO', atividadeSimples: 'MEDICINA_AMBULATORIAL' }
  // 85 — educação.
  if (divisao === 85) return { classificacaoIva: 'SAUDE_EDUCACAO', atividadeSimples: 'OUTROS_SERVICOS' }
  // 62 e 63 — tecnologia da informação. Sujeitas ao Fator R.
  if (divisao === 62 || divisao === 63) return { classificacaoIva: 'PADRAO', atividadeSimples: 'TECNOLOGIA' }
  // 70 — consultoria em gestão. Também sujeita ao Fator R.
  if (divisao === 70) return { classificacaoIva: 'PADRAO', atividadeSimples: 'CONSULTORIA' }
  if (divisao >= 45 && divisao <= 47) return { classificacaoIva: 'PADRAO', atividadeSimples: 'COMERCIO' }
  if (divisao >= 5 && divisao <= 33) return { classificacaoIva: 'PADRAO', atividadeSimples: 'INDUSTRIA' }
  return { classificacaoIva: 'PADRAO', atividadeSimples: 'OUTROS_SERVICOS' }
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
  const [origem, setOrigem] = useState<'balancete' | 'contrato' | 'erp' | 'nenhuma'>('nenhuma')
  /** Contas do balancete que somam a base de crédito, quando o diagnóstico as
   *  conhece. Sem balancete importado a lista é vazia e o valor não abre. */
  const [composicao, setComposicao] = useState<ItemComposicao[]>([])
  /** Receita mes a mes do balancete — o detalhe por tras da media exibida. */
  const [serieFaturamento, setSerieFaturamento] = useState<Array<{ periodo: string; receita: number }>>([])
  /** Contas de pessoal do balancete que somam a folha sugerida. */
  const [composicaoFolha, setComposicaoFolha] = useState<ItemFolha[]>([])
  const [verComposicao, setVerComposicao] = useState(false)
  const [verSerie, setVerSerie] = useState(false)
  const [verBalancete, setVerBalancete] = useState(false)

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
    // O RBT12 é o que o ERP conhece; sem snapshot, os 12 meses da mensal são a
    // melhor aproximação disponível — e o campo fica editável para corrigir.
    const rbt12 = c.faturamento12m > 0 ? Math.round(c.faturamento12m) : Math.round(mensal * 12)
    const perfil = perfilDoCnae(c.cnaePrincipal)
    setP(prev => ({
      ...prev,
      regime: regimeDoCadastro(c.tributacao),
      atividade: atividadeDoCnae(c.cnaePrincipal),
      faturamentoMensal: Math.round(mensal),
      despesasCreditaveis: 0,
      rbt12,
      anexo: 'AUTO',
      atividadeSimples: perfil.atividadeSimples,
      classificacaoIva: perfil.classificacaoIva,
      // Folha e DAS informado nunca são chutados: sem eles a tela se declara
      // não conclusiva, que é a informação correta a dar.
      folhaMensal: 0,
      dasInformado: 0,
    }))

    setCarregandoCliente(true)
    setComposicao([])
    setComposicaoFolha([])
    setSerieFaturamento([])
    try {
      const d = await (trpc.reformaTributaria as never as {
        diagnostico: { query: (i: { clienteId: string; meses: number }) => Promise<{
          metrics: {
            faturamentoMedioMensal: number
            faturamentoSerie?: Array<{ periodo: string; receita: number }>
            das?: {
              origem: 'balancete_importado' | 'indisponivel'
              percentualMediano: number
              mensalEstimado: number
              mesesComLancamento: number
            }
            folha?: {
              origem: 'balancete_importado' | 'indisponivel'
              baseMensal: number
              encargosMensal: number
              beneficiosMensal: number
              itens: ItemFolha[]
            }
            comprasMercadorias12m: number
            servicosTomados12m: number
            fontePrincipal: 'BALANCETE_ERP' | 'SNAPSHOT_SCI' | 'DOCUMENTOS_FISCAIS'
            creditos: { baseAjustada12m: number; itens: ItemComposicao[] }
          }
        }> }
      }).diagnostico.query({ clienteId: c.id, meses: 12 })

      // O DAS efetivamente recolhido está no balancete. Entra como "informado"
      // para ser confrontado com a memória de cálculo — que é o ponto do
      // alerta de divergência: se a guia não bate com a tabela, ou o RBT12 está
      // errado, ou a guia tem particularidade que o simulador não conhece.
      const das = d.metrics.das
      if (das && das.origem === 'balancete_importado' && das.mensalEstimado > 0) {
        setP(prev => ({ ...prev, dasInformado: Math.round(das.mensalEstimado * 100) / 100 }))
      }

      // A folha sai das contas de pessoal do balancete — remuneração apenas,
      // sem encargos nem benefícios, que não são base da CPP. Vem como
      // SUGESTÃO com a composição aberta: quem apresenta precisa poder conferir
      // conta a conta antes de dizer quanto custa sair do Simples.
      const folha = d.metrics.folha
      if (folha && folha.origem === 'balancete_importado' && folha.baseMensal > 0) {
        setP(prev => ({ ...prev, folhaMensal: Math.round(folha.baseMensal) }))
        setComposicaoFolha(folha.itens)
      }

      // A base do balancete tem precedência sobre compras+serviços: ela vem de
      // contas classificadas uma a uma, e é a única que sabe dizer de onde veio.
      const doBalancete = d.metrics.creditos?.baseAjustada12m ?? 0
      const doFiscal = d.metrics.comprasMercadorias12m + d.metrics.servicosTomados12m
      const anual = doBalancete > 0 ? doBalancete : doFiscal
      if (anual > 0) setP(prev => ({ ...prev, despesasCreditaveis: Math.round(anual / 12) }))
      if (doBalancete > 0) {
        setComposicao((d.metrics.creditos?.itens ?? []).filter(i => i.categoria === 'CREDITAVEL'))
      }

      // O balancete também sabe o faturamento — sai das contas de receita, e é a
      // apuração contábil do que foi de fato faturado. Por isso vence o parâmetro
      // de contrato, que é premissa de precificação. Antes a tela pegava as
      // despesas do balancete e ignorava a receita dele, e um cliente recém
      // sincronizado abria com faturamento zero e crédito milionário.
      const mensalContabil = d.metrics.faturamentoMedioMensal ?? 0
      if (mensalContabil > 0 && d.metrics.fontePrincipal === 'BALANCETE_ERP') {
        // O RBT12 anda JUNTO com o faturamento. Quando só o mensal era
        // atualizado aqui, o cliente abria com receita de R$ 208 mil e RBT12
        // zero: o DAS caía na 1ª faixa, zerava, e levava o comparativo inteiro
        // junto. Tendo os 12 meses do balancete, a soma deles é o RBT12 de
        // verdade; com série parcial, a média × 12 é a melhor aproximação.
        const serie = d.metrics.faturamentoSerie ?? []
        const rbt12Contabil = serie.length >= 12
          ? serie.reduce((a, m) => a + m.receita, 0)
          : mensalContabil * 12
        setP(prev => ({
          ...prev,
          faturamentoMensal: Math.round(mensalContabil),
          rbt12: Math.round(rbt12Contabil),
        }))
        setOrigem('balancete')
        setSerieFaturamento(serie)
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

  const comparativo = useMemo(() => calcularComparativo(p), [p])
  const atual = colunaDoRegime(comparativo, p.regime)
  const iva = comparativo.iva
  // Basta o cliente: o resumo é o contexto da tela, e escondê-lo quando o
  // faturamento é zero tirava justamente a informação de que ele está zerado.
  const pronto = !!cliente

  return (
    <div className="space-y-5">
      {/* O balancete é a matéria-prima do crédito da simulação, e é o dado que
          mais envelhece — por isso a porta para atualizá-lo fica no título, e
          não escondida numa aba. */}
      <PageHeaderBar actions={cliente ? (
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setVerBalancete(true)}>
          <Database className="h-4 w-4" />Balancete
        </Button>
      ) : undefined}>
        <h1 className="truncate">Reforma Tributária</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Fiscal</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Reforma Tributária</span>
        </p>
      </PageHeaderBar>

      {/* Meia linha para cada: escolher vem antes de ler, e as duas metades têm
          o mesmo peso. Sem cliente escolhido o resumo não existe, e aí o seletor
          toma a linha inteira — é o único passo possível naquele momento. */}
      <div className={cn('grid items-center gap-3', pronto && 'lg:grid-cols-2')}>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SeletorCliente selecionado={cliente} onSelecionar={escolher} />
          {carregandoCliente && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        {pronto && (
          <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-5 py-2 shadow-sm">
            {[
              { r: 'Regime', v: ROTULO_REGIME[p.regime].toUpperCase() },
              { r: 'Atividade', v: ROTULO_ATIVIDADE[p.atividade].toUpperCase() },
              { r: 'Faturamento/mês', v: reais(p.faturamentoMensal) },
              // O "nova" precisa dizer de que ano se trata: a alíquota do IVA
              // é função do ano-base, e só é plena em 2033.
              { r: `Carga hoje → ${p.anoBase}`, v: `${porcentoOuTraco(atual.aliquotaEfetiva)} → ${porcentoOuTraco(iva.aliquotaEfetiva)}` },
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
          {/* Rail dentro de um Card, como o painel lateral da /agenda: a
              navegação flutuava sobre o fundo da página, sem borda nem
              superfície, e por isso não se lia como um bloco — parecia texto
              solto ao lado do conteúdo. */}
          <nav className="lg:sticky lg:top-4 lg:self-start">
            <Card className="space-y-4 p-3">
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

              {/* O aviso entra no mesmo cartão: e parte da navegacao, nao um
                  bloco a parte flutuando embaixo dela. */}
              <p className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Simulador pedagógico. Os resultados são estimativas e devem ser validados com especialistas
                tributários.
              </p>
            </Card>
          </nav>

          {/* Conteúdo */}
          <div className="min-w-0">
            {aba === 'configurar' && (
              <SecaoConfigurar
                composicaoFolha={composicaoFolha}
                p={p} onChange={alterar} origem={origem}
                composicao={composicao}
                onAbrirComposicao={() => setVerComposicao(true)}
                serieFaturamento={serieFaturamento}
                onAbrirSerie={() => setVerSerie(true)}
              />
            )}
            {aba === 'comparar' && <SecaoComparar p={p} onIrParaConfigurar={() => setAba('configurar')} />}
            {aba === 'transicao' && <SecaoTransicao p={p} onChange={alterar} />}
            {aba === 'visao' && <SecaoVisaoGeral p={p} cliente={cliente} />}
            {aba === 'calculadora' && (
              <SecaoCalculadora p={p} op={op} onChange={(patch) => setOp(prev => ({ ...prev, ...patch }))} />
            )}
          </div>
        </div>
      )}

      <BalanceteModal
        clienteId={cliente?.id ?? null}
        clienteNome={cliente?.razaoSocial ?? ''}
        aberto={verBalancete}
        onFechar={() => setVerBalancete(false)}
        onAtualizado={() => { if (cliente) void escolher(cliente) }}
      />

      {/* Composição das despesas creditáveis — as contas do balancete que somam
          o valor, com o motivo da classificação. Os valores do diagnóstico são
          de 12 meses; aqui a coluna é mensal, para bater com o campo da tela. */}
      {/* Faturamento mes a mes — a conferencia da media exibida no campo.
          Uma media de 12 meses trata igual o mes que faltou no balancete e o
          mes atipico que a puxou sozinho; quem apresenta o numero ao cliente
          precisa poder abrir os dois. */}
      <Dialog open={verSerie} onOpenChange={setVerSerie}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={ListTree} color="sky">
            <DialogTitle>Faturamento mês a mês</DialogTitle>
            <DialogDescription>
              Contas de receita do balancete importado, por período. A média destes meses é o valor usado nas simulações.
            </DialogDescription>
          </DialogHeaderIcon>
          <div className="nice-scrollbar max-h-[60vh] overflow-y-auto px-5 pb-5">
            {serieFaturamento.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Sem balancete importado para este cliente.
              </p>
            ) : (() => {
              const total = serieFaturamento.reduce((a, m) => a + m.receita, 0)
              const media = total / serieFaturamento.length
              // O maior mes calibra a barra. Sem ela, doze numeros alinhados
              // nao mostram qual mes destoa — que e justamente o que se procura
              // ao conferir uma media.
              const maior = Math.max(...serieFaturamento.map(m => Math.abs(m.receita)), 1)
              return (
                <table className="w-full">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 text-left">Mês</th>
                      <th className="py-2 text-left">Proporção</th>
                      <th className="py-2 text-right">Receita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {serieFaturamento.map(m => {
                      const ano = m.periodo.slice(0, 4)
                      const mes = m.periodo.slice(4, 6)
                      const zerado = m.receita === 0
                      return (
                        <tr key={m.periodo} className={zerado ? 'opacity-60' : undefined}>
                          <td className="py-2 pr-3 text-xs tabular-nums text-foreground">{mes}/{ano}</td>
                          <td className="py-2 pr-3">
                            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full bg-sky-500"
                                style={{ width: `${Math.max(0, (m.receita / maior) * 100)}%` }}
                              />
                            </span>
                          </td>
                          <td className="py-2 text-right text-xs font-medium tabular-nums text-foreground">
                            {zerado
                              ? <span className="text-muted-foreground">sem lançamento</span>
                              : reais(m.receita)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border">
                      <td colSpan={2} className="py-2.5 text-[13px] font-semibold text-foreground">
                        Média mensal
                      </td>
                      <td className="py-2.5 text-right text-[13px] font-bold tabular-nums text-foreground">
                        {reais(media)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="pb-1 text-[11px] text-muted-foreground">
                        Total no período
                      </td>
                      <td className="pb-1 text-right text-[11px] tabular-nums text-muted-foreground">
                        {reais(total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

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
                      <td className="py-2 pr-3 text-xs text-foreground">
                        {i.nomeConta}
                        {i.valor < 0 && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">(redutora)</span>
                        )}
                      </td>
                      {/* Estornos e devolucoes ABATEM a base: o valor negativo e correto,
                          nao erro de dado — por isso o rotulo e a cor propria. */}
                      <td
                        className={cn(
                          'py-2 text-right text-xs font-medium tabular-nums',
                          i.valor < 0 && TEXT.emerald,
                        )}
                      >
                        {reais(i.valor / 12)}
                      </td>
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
