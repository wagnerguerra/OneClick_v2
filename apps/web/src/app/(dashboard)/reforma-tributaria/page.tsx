'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Home,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  cn,
} from '@saas/ui'
import { PageHeader } from '@/components/page-header'
import { alerts } from '@/lib/alerts'
import { trpc } from '@/lib/trpc'
import { useTabLabel } from '@/hooks/use-tab-label'

const MODULE_COLOR = 'var(--mod-fiscal, #818cf8)'

type ClienteResumo = {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string | null
  tributacao: string | null
  regime: string | null
  cnaePrincipal: string | null
  faturamento12m: number
  prontidao: number
  danfes: number
  nfse: number
}

type Simulacao = any

const DEFAULT_PREMISSAS = {
  aliquotaCbs: 0.088,
  aliquotaIbs: 0.177,
  aliquotaSimplesIbsCbs: 0.04,
  percentualVendasB2B: 0.55,
  percentualComprasCreditaveis: 0.35,
  pesoCreditoCliente: 0.35,
}

const RECOMENDACAO_CFG: Record<string, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  MANTER_SIMPLES: { label: 'Manter no Simples', tone: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/25', icon: CheckCircle2 },
  AVALIAR_REGULAR: { label: 'Avaliar apuracao regular', tone: 'text-amber-700 bg-amber-500/10 border-amber-500/25', icon: AlertTriangle },
  REGULAR_TENDE_MELHOR: { label: 'Regular tende melhor', tone: 'text-blue-700 bg-blue-500/10 border-blue-500/25', icon: TrendingDown },
  REGIME_REGULAR_ANALISE_IMPACTO: { label: 'Analise de impacto', tone: 'text-violet-700 bg-violet-500/10 border-violet-500/25', icon: TrendingUp },
  INCONCLUSIVO: { label: 'Inconclusivo', tone: 'text-muted-foreground bg-muted border-border', icon: AlertTriangle },
}

function api() {
  return (trpc as any).reformaTributaria
}

function money(v: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v ?? 0))
}

function pct(v: number | null | undefined, digits = 1) {
  return `${((Number(v ?? 0)) * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

function regimeLabel(v: string | null | undefined) {
  const map: Record<string, string> = {
    SIMPLES_NACIONAL: 'Simples Nacional',
    LUCRO_PRESUMIDO: 'Lucro Presumido',
    LUCRO_REAL: 'Lucro Real',
    MEI: 'MEI',
    IMUNE: 'Imune',
    ISENTA: 'Isenta',
  }
  return v ? (map[v] ?? v) : 'Nao informado'
}

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={(value * 100).toString()}
          onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value || 0))) / 100)}
          className="pr-8"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[6px] border bg-background/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function ReformaTributariaPage() {
  useTabLabel('Reforma Tributária')

  const [busca, setBusca] = useState('')
  const [loadingLista, setLoadingLista] = useState(true)
  const [loadingSimulacao, setLoadingSimulacao] = useState(false)
  const [clientes, setClientes] = useState<ClienteResumo[]>([])
  const [dashboard, setDashboard] = useState<{ totalClientes: number; simples: number } | null>(null)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null)
  const [premissas, setPremissas] = useState(DEFAULT_PREMISSAS)

  const clienteSelecionado = useMemo(
    () => clientes.find(c => c.id === clienteId) ?? null,
    [clientes, clienteId],
  )

  const carregarLista = useCallback(async () => {
    setLoadingLista(true)
    try {
      const [dash, list] = await Promise.all([
        api().dashboard.query(),
        api().clientes.query({ busca: busca.trim() || undefined, limit: 60 }),
      ])
      setDashboard(dash)
      setClientes(list)
      setClienteId(prev => prev ?? list[0]?.id ?? null)
    } catch (e) {
      alerts.error('Erro ao carregar Reforma Tributaria', (e as Error).message)
    } finally {
      setLoadingLista(false)
    }
  }, [busca])

  const simular = useCallback(async (id = clienteId) => {
    if (!id) return
    setLoadingSimulacao(true)
    try {
      const data = await api().simular.query({ clienteId: id, meses: 12, premissas })
      setSimulacao(data)
    } catch (e) {
      alerts.error('Erro ao simular', (e as Error).message)
    } finally {
      setLoadingSimulacao(false)
    }
  }, [clienteId, premissas])

  useEffect(() => {
    carregarLista()
  }, [carregarLista])

  useEffect(() => {
    if (clienteId) simular(clienteId)
    // A mudanca de premissas e aplicada pelo botao "Simular" para evitar chamadas a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  const recomendacao = simulacao ? RECOMENDACAO_CFG[simulacao.recomendacao] ?? RECOMENDACAO_CFG.INCONCLUSIVO : null
  const RecomendacaoIcon = recomendacao?.icon ?? AlertTriangle

  return (
    <div className="space-y-5">
      <PageHeader
        color={MODULE_COLOR}
        icon={Calculator}
        title="Reforma Tributária"
        subtitle="Comparativo IBS/CBS para clientes ativos com situação mensal, usando dados do OneClick e do ERP contábil."
        breadcrumb={
          <>
            <Home className="h-3.5 w-3.5" />
            <span>Fiscal</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">Reforma Tributária</span>
          </>
        }
        actions={
          <Button variant="outline" onClick={() => simular()} disabled={!clienteId || loadingSimulacao}>
            {loadingSimulacao ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Simular
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Clientes mensais ativos" value={String(dashboard?.totalClientes ?? 0)} sub="Base OneClick" />
        <Metric label="Simples Nacional" value={String(dashboard?.simples ?? 0)} sub="Foco da decisão dentro x regular" />
        <Metric label="Cliente selecionado" value={clienteSelecionado ? regimeLabel(clienteSelecionado.tributacao) : '-'} sub="Regime atual cadastrado" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Clientes</CardTitle>
              {loadingLista && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por razao social ou CNPJ" className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="max-h-[640px] space-y-2 overflow-auto pt-2">
            {clientes.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => setClienteId(cliente.id)}
                className={cn(
                  'w-full rounded-[6px] border p-3 text-left transition hover:border-primary/40 hover:bg-muted/40',
                  cliente.id === clienteId && 'border-primary bg-primary/5',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cliente.razaoSocial}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{cliente.documento ?? 'Documento nao informado'}</p>
                  </div>
                  <Badge className="shrink-0" variant="outline">{cliente.prontidao}%</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{regimeLabel(cliente.tributacao)}</span>
                  <span>{money(cliente.faturamento12m)}</span>
                </div>
              </button>
            ))}
            {!loadingLista && clientes.length === 0 && (
              <div className="rounded-[6px] border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado para a busca atual.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>{simulacao?.cliente?.razaoSocial ?? 'Selecione um cliente'}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {simulacao?.cliente ? `${regimeLabel(simulacao.cliente.tributacao)} • ${simulacao.cliente.cidade ?? '-'} / ${simulacao.cliente.uf ?? '-'}` : 'O comparativo aparece apos a simulacao.'}
                  </p>
                </div>
                {recomendacao && (
                  <div className={cn('flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm font-medium', recomendacao.tone)}>
                    <RecomendacaoIcon className="h-4 w-4" />
                    {recomendacao.label}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {loadingSimulacao && (
                <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculando cenarios...
                </div>
              )}

              {!loadingSimulacao && simulacao && (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Metric label="Faturamento 12m" value={money(simulacao.metrics.faturamento12m)} />
                    <Metric label="Compras/servicos" value={money(simulacao.metrics.comprasMercadorias12m + simulacao.metrics.servicosTomados12m)} />
                    <Metric label="Qualidade dos dados" value={`${simulacao.qualidade.score}%`} />
                    <Metric label="Impacto estimado" value={money(simulacao.resumo.impacto.valor)} sub={pct(simulacao.resumo.impacto.percentualReceita)} />
                  </div>

                  <div className="rounded-[6px] border bg-background/70 p-4">
                    <p className="text-sm font-medium">{simulacao.resumo.texto}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[6px] border p-3">
                        <p className="text-xs font-medium text-muted-foreground">IBS/CBS dentro do Simples</p>
                        <p className="mt-2 text-xl font-semibold">{money(simulacao.cenarios.simplesDentro.cargaEstimativa)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Credito transferido: {money(simulacao.cenarios.simplesDentro.creditoTransferidoCliente)}</p>
                      </div>
                      <div className="rounded-[6px] border p-3">
                        <p className="text-xs font-medium text-muted-foreground">Apuracao regular</p>
                        <p className="mt-2 text-xl font-semibold">{money(simulacao.cenarios.regular.cargaEstimativa)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Creditos apropriaveis: {money(simulacao.cenarios.regular.creditoApropriavel)}</p>
                      </div>
                    </div>
                  </div>

                  {simulacao.qualidade.faltantes.length > 0 && (
                    <div className="rounded-[6px] border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-800">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Dados que precisam de revisao
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {simulacao.qualidade.faltantes.map((item: string) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                <CardTitle>Premissas da simulacao</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
              <PercentInput label="CBS estimada" value={premissas.aliquotaCbs} onChange={(v) => setPremissas(p => ({ ...p, aliquotaCbs: v }))} />
              <PercentInput label="IBS estimado" value={premissas.aliquotaIbs} onChange={(v) => setPremissas(p => ({ ...p, aliquotaIbs: v }))} />
              <PercentInput label="IBS/CBS no Simples" value={premissas.aliquotaSimplesIbsCbs} onChange={(v) => setPremissas(p => ({ ...p, aliquotaSimplesIbsCbs: v }))} />
              <PercentInput label="Vendas B2B" value={premissas.percentualVendasB2B} onChange={(v) => setPremissas(p => ({ ...p, percentualVendasB2B: v }))} />
              <PercentInput label="Compras creditaveis" value={premissas.percentualComprasCreditaveis} onChange={(v) => setPremissas(p => ({ ...p, percentualComprasCreditaveis: v }))} />
              <PercentInput label="Peso do credito ao cliente" value={premissas.pesoCreditoCliente} onChange={(v) => setPremissas(p => ({ ...p, pesoCreditoCliente: v }))} />
            </CardContent>
          </Card>

          {simulacao?.observacoes?.length > 0 && (
            <div className="rounded-[6px] border bg-muted/35 p-4 text-sm text-muted-foreground">
              {simulacao.observacoes.map((obs: string) => <p key={obs}>{obs}</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
