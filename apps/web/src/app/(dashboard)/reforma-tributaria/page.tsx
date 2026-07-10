'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  FileText,
  HelpCircle,
  History,
  Home,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
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
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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

type HistoricoItem = {
  id: string
  recomendacao: string
  parecer: string
  qualidadeScore: number
  faturamento12m: number
  createdAt: string
  usuarioNome: string | null
}

type PremissaFiscal = {
  id: string
  nome: string
  ano: number
  setor: string | null
  cnaePrefix: string | null
  aliquotaCbs: number
  aliquotaIbs: number
  aliquotaSimplesIbsCbs: number
  percentualVendasB2B: number
  percentualComprasCreditaveis: number
  pesoCreditoCliente: number
  reducaoSetorial: number
  observacoes: string | null
  ativo: boolean
}

type BalanceteImportStatus = {
  running: boolean
  progress: number
  message: string
  log: string[]
  status?: 'idle' | 'running' | 'done' | 'error'
}

const DEFAULT_PREMISSAS = {
  aliquotaCbs: 0.088,
  aliquotaIbs: 0.177,
  aliquotaSimplesIbsCbs: 0.04,
  percentualVendasB2B: 0.55,
  percentualComprasCreditaveis: 0.35,
  pesoCreditoCliente: 0.35,
  reducaoSetorial: 0,
  premissaNome: undefined as string | undefined,
}

const EMPTY_BALANCETE_STATUS: BalanceteImportStatus = {
  running: false,
  progress: 0,
  message: '',
  log: [],
  status: 'idle',
}

const DEFAULT_PREMISSA_FORM: Omit<PremissaFiscal, 'id'> & { id?: string } = {
  nome: 'Premissa geral',
  ano: 2027,
  setor: 'Geral',
  cnaePrefix: '',
  aliquotaCbs: 0.088,
  aliquotaIbs: 0.177,
  aliquotaSimplesIbsCbs: 0.04,
  percentualVendasB2B: 0.55,
  percentualComprasCreditaveis: 0.35,
  pesoCreditoCliente: 0.35,
  reducaoSetorial: 0,
  observacoes: '',
  ativo: true,
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

function dateTimeBR(v: string | Date | null | undefined) {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function balanceteWindow12m() {
  const now = new Date()
  const fim = new Date(now.getFullYear(), now.getMonth(), 0)
  const inicio = new Date(fim.getFullYear(), fim.getMonth() - 11, 1)
  const anoInicio = inicio.getFullYear()
  const mesInicio = inicio.getMonth() + 1
  const anoFim = fim.getFullYear()
  const mesFim = fim.getMonth() + 1

  return {
    anoInicio,
    mesInicio,
    anoFim,
    mesFim,
    refInicio: (anoInicio * 100) + mesInicio,
    refFim: (anoFim * 100) + mesFim,
  }
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

function premissaToInput(item: PremissaFiscal) {
  return {
    aliquotaCbs: item.aliquotaCbs,
    aliquotaIbs: item.aliquotaIbs,
    aliquotaSimplesIbsCbs: item.aliquotaSimplesIbsCbs,
    percentualVendasB2B: item.percentualVendasB2B,
    percentualComprasCreditaveis: item.percentualComprasCreditaveis,
    pesoCreditoCliente: item.pesoCreditoCliente,
    reducaoSetorial: item.reducaoSetorial,
    premissaNome: item.nome,
  }
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

function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Ajuda: ${text}`}>
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] whitespace-normal leading-5">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

function Metric({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: string }) {
  return (
    <div className="rounded-[6px] border bg-background/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {help && <HelpTip text={help} />}
      </div>
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
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [loadingPremissas, setLoadingPremissas] = useState(false)
  const [salvandoParecer, setSalvandoParecer] = useState(false)
  const [salvandoPremissa, setSalvandoPremissa] = useState(false)
  const [clientes, setClientes] = useState<ClienteResumo[]>([])
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [premissasFiscais, setPremissasFiscais] = useState<PremissaFiscal[]>([])
  const [premissaSelecionadaId, setPremissaSelecionadaId] = useState<string>('default')
  const [premissaForm, setPremissaForm] = useState(DEFAULT_PREMISSA_FORM)
  const [dashboard, setDashboard] = useState<{ totalClientes: number; simples: number } | null>(null)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null)
  const [apenasSimples, setApenasSimples] = useState(false)
  const [premissas, setPremissas] = useState(DEFAULT_PREMISSAS)
  const [balanceteStatus, setBalanceteStatus] = useState<BalanceteImportStatus>(EMPTY_BALANCETE_STATUS)
  const balancetePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clienteSelecionado = useMemo(
    () => clientes.find(c => c.id === clienteId) ?? null,
    [clientes, clienteId],
  )

  const carregarLista = useCallback(async () => {
    setLoadingLista(true)
    try {
      const [dash, list] = await Promise.all([
        api().dashboard.query(),
        api().clientes.query({ busca: busca.trim() || undefined, apenasSimples, limit: 60 }),
      ])
      setDashboard(dash)
      setClientes(list)
      setClienteId(prev => {
        const nextId = prev && list.some((cliente: ClienteResumo) => cliente.id === prev)
          ? prev
          : list[0]?.id ?? null
        if (!nextId) {
          setSimulacao(null)
          setHistorico([])
        }
        return nextId
      })
    } catch (e) {
      alerts.error('Erro ao carregar Reforma Tributaria', (e as Error).message)
    } finally {
      setLoadingLista(false)
    }
  }, [apenasSimples, busca])

  const aplicarPremissa = useCallback((item: PremissaFiscal) => {
    setPremissaSelecionadaId(item.id)
    setPremissas(premissaToInput(item))
    setPremissaForm({ ...item })
  }, [])

  const carregarPremissas = useCallback(async () => {
    setLoadingPremissas(true)
    try {
      const list = await api().premissas.query()
      setPremissasFiscais(list)
      const atual = list.find((item: PremissaFiscal) => item.id === premissaSelecionadaId) ?? list[0]
      if (atual) aplicarPremissa(atual)
    } catch (e) {
      alerts.error('Erro ao carregar premissas', (e as Error).message)
    } finally {
      setLoadingPremissas(false)
    }
  }, [aplicarPremissa, premissaSelecionadaId])

  const salvarPremissa = useCallback(async () => {
    setSalvandoPremissa(true)
    try {
      const payload = {
        ...premissaForm,
        cnaePrefix: premissaForm.cnaePrefix?.trim() || null,
        setor: premissaForm.setor?.trim() || null,
        observacoes: premissaForm.observacoes?.trim() || null,
      }
      await api().salvarPremissa.mutate(payload)
      await carregarPremissas()
      alerts.success('Premissa salva', 'A premissa fiscal foi atualizada.')
    } catch (e) {
      alerts.error('Erro ao salvar premissa', (e as Error).message)
    } finally {
      setSalvandoPremissa(false)
    }
  }, [carregarPremissas, premissaForm])

  const novaPremissa = useCallback(() => {
    setPremissaSelecionadaId('nova')
    setPremissaForm({ ...DEFAULT_PREMISSA_FORM })
  }, [])

  const removerPremissa = useCallback(async () => {
    if (!premissaForm.id || premissaForm.id === 'default') return
    const ok = await alerts.confirmDelete(premissaForm.nome)
    if (!ok) return
    try {
      await api().removerPremissa.mutate({ id: premissaForm.id })
      setPremissaSelecionadaId('default')
      await carregarPremissas()
      alerts.success('Premissa removida', 'A premissa foi inativada.')
    } catch (e) {
      alerts.error('Erro ao remover premissa', (e as Error).message)
    }
  }, [carregarPremissas, premissaForm])

  const carregarHistorico = useCallback(async (id = clienteId) => {
    if (!id) {
      setHistorico([])
      return
    }
    setLoadingHistorico(true)
    try {
      const list = await api().historico.query({ clienteId: id })
      setHistorico(list)
    } catch (e) {
      alerts.error('Erro ao carregar histórico', (e as Error).message)
    } finally {
      setLoadingHistorico(false)
    }
  }, [clienteId])

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

  const pararPollingBalancete = useCallback(() => {
    if (balancetePollRef.current) {
      clearInterval(balancetePollRef.current)
      balancetePollRef.current = null
    }
  }, [])

  const atualizarBalanceteErp = useCallback(async () => {
    if (!clienteId) return

    const periodo = balanceteWindow12m()
    pararPollingBalancete()
    setBalanceteStatus({
      running: true,
      progress: 5,
      message: `Solicitando balancete SCI de ${periodo.refInicio} a ${periodo.refFim}...`,
      log: [],
      status: 'running',
    })

    try {
      const resp = await fetch('/be/api/bi-sync/importar', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          anoInicio: periodo.anoInicio,
          mesInicio: periodo.mesInicio,
          anoFim: periodo.anoFim,
          mesFim: periodo.mesFim,
          substituirExistentes: true,
        }),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `HTTP ${resp.status}`)
      }

      const result = await resp.json().catch(() => ({}))
      if (result?.started === false) {
        setBalanceteStatus({
          running: false,
          progress: 0,
          message: 'Ja existe uma importacao em andamento para este cliente e periodo.',
          log: [],
          status: 'idle',
        })
        alerts.warning('Importacao em andamento', 'Aguarde a importacao atual terminar antes de iniciar outra.')
        return
      }

      balancetePollRef.current = setInterval(async () => {
        try {
          const statusResp = await fetch(`/be/api/bi-sync/status/${clienteId}/${periodo.refInicio}/${periodo.refFim}`, {
            credentials: 'include',
          })
          if (!statusResp.ok) return
          const status = await statusResp.json()
          const job = status?.job

          if (!job) {
            pararPollingBalancete()
            setBalanceteStatus({
              running: false,
              progress: 0,
              message: 'Nenhum job ativo encontrado para o periodo solicitado.',
              log: [],
              status: 'idle',
            })
            return
          }

          const jobStatus: BalanceteImportStatus['status'] =
            job.status === 'done' || job.status === 'error' || job.status === 'running'
              ? job.status
              : 'idle'

          setBalanceteStatus({
            running: jobStatus === 'running',
            progress: Number(job.progress ?? 0),
            message: job.message || 'Processando balancete...',
            log: Array.isArray(job.log) ? job.log : [],
            status: jobStatus,
          })

          if (jobStatus === 'done' || jobStatus === 'error') {
            pararPollingBalancete()
            if (jobStatus === 'done') {
              alerts.success('Balancete atualizado', 'Execute a simulacao novamente para usar o balancete importado.')
            } else {
              alerts.error('Erro ao atualizar balancete', job.message || 'O Service Manager retornou erro na importacao.')
            }
          }
        } catch (e) {
          pararPollingBalancete()
          setBalanceteStatus({
            running: false,
            progress: 0,
            message: (e as Error).message,
            log: [],
            status: 'error',
          })
        }
      }, 1500)
    } catch (e) {
      pararPollingBalancete()
      setBalanceteStatus({
        running: false,
        progress: 0,
        message: (e as Error).message,
        log: [],
        status: 'error',
      })
      alerts.error('Erro ao solicitar balancete', (e as Error).message)
    }
  }, [clienteId, pararPollingBalancete])

  const aplicarRegraSugerida = useCallback(async () => {
    const premissaId = simulacao?.regraSetorial?.premissaId
    if (!clienteId || !premissaId) return
    const item = premissasFiscais.find(p => p.id === premissaId)
    if (!item) {
      alerts.error('Premissa nao encontrada', 'Atualize as premissas fiscais e tente novamente.')
      return
    }
    const nextPremissas = premissaToInput(item)
    aplicarPremissa(item)
    setLoadingSimulacao(true)
    try {
      const data = await api().simular.query({ clienteId, meses: 12, premissas: nextPremissas })
      setSimulacao(data)
      alerts.success('Regra aplicada', `Premissa "${item.nome}" aplicada na simulacao.`)
    } catch (e) {
      alerts.error('Erro ao aplicar regra', (e as Error).message)
    } finally {
      setLoadingSimulacao(false)
    }
  }, [aplicarPremissa, clienteId, premissasFiscais, simulacao])

  const salvarParecer = useCallback(async () => {
    if (!clienteId) return
    setSalvandoParecer(true)
    try {
      const salvo = await api().salvar.mutate({ clienteId, meses: 12, premissas })
      setSimulacao(salvo)
      await carregarHistorico(clienteId)
      alerts.success('Parecer salvo', 'A simulação foi registrada no histórico do cliente.')
    } catch (e) {
      alerts.error('Erro ao salvar parecer', (e as Error).message)
    } finally {
      setSalvandoParecer(false)
    }
  }, [carregarHistorico, clienteId, premissas])

  const removerHistorico = useCallback(async (item: HistoricoItem) => {
    const ok = await alerts.confirmDelete(`simulação de ${dateTimeBR(item.createdAt)}`)
    if (!ok) return
    try {
      await api().remover.mutate({ id: item.id })
      await carregarHistorico()
      alerts.success('Removido', 'Simulação removida do histórico.')
    } catch (e) {
      alerts.error('Erro ao remover', (e as Error).message)
    }
  }, [carregarHistorico])

  const exportarParecerHtml = useCallback(() => {
    if (!simulacao) return
    const parecer = simulacao.parecer || [
      `Cliente: ${simulacao.cliente?.razaoSocial ?? '-'}`,
      `Recomendação: ${simulacao.resumo?.texto ?? '-'}`,
      `Qualidade dos dados: ${simulacao.qualidade?.score ?? 0}%`,
      `Confiabilidade técnica: ${simulacao.confiabilidade?.nivel ?? 'N/A'} (${simulacao.confiabilidade?.score ?? 0}%)`,
    ].join('\n')
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Parecer Reforma Tributária - ${simulacao.cliente?.razaoSocial ?? 'Cliente'}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 40px; line-height: 1.55; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .meta { color: #6b7280; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
    .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
    pre { white-space: pre-wrap; font-family: Arial, sans-serif; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; }
  </style>
</head>
<body>
  <h1>Parecer - Reforma Tributária</h1>
  <div class="meta">${new Date().toLocaleString('pt-BR')} • ${simulacao.cliente?.razaoSocial ?? '-'}</div>
  <h2>Resumo</h2>
  <div class="grid">
    <div class="box"><strong>Recomendação</strong><br />${simulacao.resumo?.texto ?? '-'}</div>
    <div class="box"><strong>Confiabilidade</strong><br />${simulacao.confiabilidade?.nivel ?? '-'} (${simulacao.confiabilidade?.score ?? 0}%)</div>
    <div class="box"><strong>Faturamento 12m</strong><br />${money(simulacao.metrics?.faturamento12m)}</div>
    <div class="box"><strong>Premissa</strong><br />${simulacao.premissas?.premissaNome ?? 'Manual'}</div>
    <div class="box"><strong>Fonte dos dados</strong><br />${simulacao.metrics?.fontePrincipal ?? '-'} / ${simulacao.metrics?.erp?.origem ?? '-'}</div>
    <div class="box"><strong>Regra setorial</strong><br />${simulacao.regraSetorial?.premissaNome ?? simulacao.regraSetorial?.origem ?? '-'}</div>
    <div class="box"><strong>Base creditavel</strong><br />${money(simulacao.metrics?.creditos?.baseCreditavel12m)} (${simulacao.metrics?.creditos?.confianca ?? '-'})</div>
    <div class="box"><strong>Base em revisao</strong><br />${money(simulacao.metrics?.creditos?.baseRevisao12m)}</div>
  </div>
  <h2>Parecer técnico</h2>
  <pre>${parecer.replace(/[&<>]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))}</pre>
  <h2>Sensibilidade</h2>
  <pre>${(simulacao.sensibilidade ?? []).map((s: any) => `${s.label}: ${money(s.cargaRegular)} no regular; diferença ${money(s.diferenca)}; ${s.recomendacao}`).join('\n')}</pre>
  <h2>Plano de ação</h2>
  <pre>${(simulacao.planoAcao ?? []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}</pre>
  <h2>Classificação de créditos</h2>
  <pre>${(simulacao.metrics?.creditos?.itens ?? []).map((i: any) => `${i.categoria}: ${i.conta} - ${i.nomeConta} - ${money(i.valor)} - ${i.motivo}`).join('\n')}</pre>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `parecer-reforma-tributaria-${simulacao.cliente?.documento ?? 'cliente'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [simulacao])

  useEffect(() => {
    carregarLista()
  }, [carregarLista])

  useEffect(() => {
    carregarPremissas()
    // Carrega apenas na montagem; alteracoes no select aplicam localmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setBalanceteStatus(EMPTY_BALANCETE_STATUS)
    return () => pararPollingBalancete()
  }, [clienteId, pararPollingBalancete])

  useEffect(() => {
    if (clienteId) {
      simular(clienteId)
      carregarHistorico(clienteId)
    }
    // A mudanca de premissas e aplicada pelo botao "Simular" para evitar chamadas a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  const recomendacao = simulacao ? RECOMENDACAO_CFG[simulacao.recomendacao] ?? RECOMENDACAO_CFG.INCONCLUSIVO : null
  const RecomendacaoIcon = recomendacao?.icon ?? AlertTriangle
  const fonteBalanceteImportado = simulacao?.metrics?.erp?.origem === 'balancete_importado'
  const podeAtualizarBalancete = !!clienteId && !!simulacao && !fonteBalanceteImportado

  return (
    <TooltipProvider>
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
          <>
            <Button variant="outline" onClick={() => simular()} disabled={!clienteId || loadingSimulacao}>
              {loadingSimulacao ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Simular
            </Button>
            <Button onClick={salvarParecer} disabled={!clienteId || loadingSimulacao || salvandoParecer}>
              {salvandoParecer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar parecer
            </Button>
            <Button variant="outline" onClick={exportarParecerHtml} disabled={!simulacao}>
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Clientes mensais ativos" value={String(dashboard?.totalClientes ?? 0)} sub="Base OneClick" help="Total de clientes ativos com situação MENSAL considerados no módulo. Clientes inativos, excluídos ou fora da situação mensal não entram nesta base." />
        <Metric label="Simples Nacional" value={String(dashboard?.simples ?? 0)} sub="Foco da decisão dentro x regular" help="Quantidade de clientes da base mensal ativa cadastrados como Simples Nacional. Esses são o foco principal da decisão entre permanecer com IBS/CBS dentro do Simples ou avaliar apuração regular." />
        <Metric label="Cliente selecionado" value={clienteSelecionado ? regimeLabel(clienteSelecionado.tributacao) : '-'} sub="Regime atual cadastrado" help="Regime tributário cadastrado no cliente. Para clientes fora do Simples, a tela mostra análise de impacto, não uma recomendação de permanência no Simples." />
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
            <label
              htmlFor="filtro-simples"
              className="flex cursor-pointer items-center gap-2 rounded-[6px] border bg-background/70 px-3 py-2 text-sm"
            >
              <Checkbox
                id="filtro-simples"
                checked={apenasSimples}
                onCheckedChange={(checked) => setApenasSimples(checked === true)}
              />
              <span>Listar apenas clientes do Simples Nacional</span>
            </label>
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
                  <div className="grid gap-3 md:grid-cols-5">
                    <Metric label="Faturamento 12m" value={money(simulacao.metrics.faturamento12m)} help="Receita dos últimos 12 meses. Prioriza balancete ERP importado; se não houver, usa snapshots SCI e depois documentos fiscais como fallback." />
                    <Metric label="Compras/servicos" value={money(simulacao.metrics.comprasMercadorias12m + simulacao.metrics.servicosTomados12m)} help="Base usada para estimar créditos. Quando existe balancete, considera a base classificada de créditos; sem balancete, usa documentos fiscais/snapshots como aproximação." />
                    <Metric label="Qualidade dos dados" value={`${simulacao.qualidade.score}%`} help="Pontuação de completude cadastral e fiscal: regime, CNAE, faturamento, base de crédito e volume de documentos importados." />
                    <Metric label="Confiabilidade" value={simulacao.confiabilidade?.nivel ?? '-'} sub={`${simulacao.confiabilidade?.score ?? 0}%`} help="Nível técnico da simulação. Sobe quando há premissa versionada, ERP/balancete disponível, documentos suficientes e base de créditos classificada." />
                    <Metric label="Impacto estimado" value={money(simulacao.resumo.impacto.valor)} sub={pct(simulacao.resumo.impacto.percentualReceita)} help="Diferença absoluta entre os cenários calculados, ajustada pelo peso comercial do crédito transferido ao cliente B2B." />
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-[6px] border bg-background/70 p-4 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <Database className="h-4 w-4" />
                        Fonte dos dados
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Metric label="Fonte principal" value={simulacao.metrics?.fontePrincipal ?? '-'} help="Indica de onde veio a principal base numérica: balancete ERP, snapshot SCI ou documentos fiscais." />
                        <Metric label="Origem ERP" value={simulacao.metrics?.erp?.origem ?? '-'} sub={simulacao.metrics?.erp?.disponivel ? 'Disponivel' : 'Indisponivel'} help="Mostra se o módulo conseguiu usar dados do ERP. 'snapshot' é resumo mensal; 'balancete_importado' permite classificação contábil mais precisa." />
                      </div>
                      {simulacao.metrics?.erp?.mensagem && (
                        <p className="mt-3 text-xs text-muted-foreground">{simulacao.metrics.erp.mensagem}</p>
                      )}
                      {simulacao.metrics?.erp?.margemOperacionalPercentual != null && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Margem operacional estimada pelo balancete: {pct(simulacao.metrics.erp.margemOperacionalPercentual)}
                        </p>
                      )}
                      {podeAtualizarBalancete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={atualizarBalanceteErp}
                          disabled={balanceteStatus.running}
                        >
                          {balanceteStatus.running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                          {balanceteStatus.running ? 'Atualizando balancete...' : 'Atualizar balancete ERP'}
                        </Button>
                      )}
                      {balanceteStatus.message && (
                        <div className={cn(
                          'mt-3 rounded-[6px] border p-3 text-xs',
                          balanceteStatus.status === 'error'
                            ? 'border-red-500/25 bg-red-500/10 text-red-800'
                            : balanceteStatus.status === 'done'
                              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800'
                              : 'bg-muted/35 text-muted-foreground',
                        )}>
                          <div className="flex items-center gap-2">
                            {balanceteStatus.running && <Loader2 className="h-4 w-4 animate-spin" />}
                            {balanceteStatus.status === 'done' && <CheckCircle2 className="h-4 w-4" />}
                            {balanceteStatus.status === 'error' && <AlertTriangle className="h-4 w-4" />}
                            <span className="min-w-0 flex-1">{balanceteStatus.message}</span>
                            <span className="tabular-nums">{Math.max(0, Math.min(100, balanceteStatus.progress))}%</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/70">
                            <div
                              className="h-full rounded-full bg-current transition-all"
                              style={{ width: `${Math.max(0, Math.min(100, balanceteStatus.progress))}%` }}
                            />
                          </div>
                          {balanceteStatus.log.length > 0 && (
                            <div className="mt-2 space-y-1 text-[11px] opacity-80">
                              {balanceteStatus.log.slice(-3).map((item, index) => (
                                <p key={`${index}-${item}`} className="truncate">{item}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-[6px] border bg-background/70 p-4 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <Settings2 className="h-4 w-4" />
                        Regra setorial
                      </div>
                      {simulacao.regraSetorial?.premissaId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={aplicarRegraSugerida}
                          disabled={loadingSimulacao}
                        >
                          {loadingSimulacao ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          Aplicar regra sugerida
                        </Button>
                      )}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Metric label="Origem" value={simulacao.regraSetorial?.origem ?? 'SEM_REGRA'} help="Como a regra setorial foi identificada: premissa por CNAE, benefício do cliente, atividade cadastrada ou ausência de regra." />
                        <Metric
                          label="Reducao sugerida"
                          value={pct(simulacao.regraSetorial?.reducaoSetorial ?? 0)}
                          sub={simulacao.regraSetorial?.premissaNome ?? simulacao.regraSetorial?.setor ?? 'Sem premissa vinculada'}
                          help="Redução setorial cadastrada na premissa sugerida. Deve ser validada tecnicamente antes de emitir parecer conclusivo."
                        />
                      </div>
                      {simulacao.regraSetorial?.alertas?.length > 0 && (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                          {simulacao.regraSetorial.alertas.map((item: string) => <li key={item}>{item}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>

                  {simulacao.metrics?.creditos && (
                    <div className="rounded-[6px] border bg-background/70 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <SlidersHorizontal className="h-4 w-4" />
                        Classificacao de creditos IBS/CBS
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <Metric label="Origem" value={simulacao.metrics.creditos.origem ?? '-'} sub={`Confianca ${simulacao.metrics.creditos.confianca ?? '-'}`} help="Fonte usada para classificar a base de crédito. Balancete importado é mais confiável; documentos fiscais e premissa são fallback." />
                        <Metric label="Creditavel" value={money(simulacao.metrics.creditos.baseCreditavel12m)} help="Contas ou documentos classificados como potencialmente creditáveis para IBS/CBS, sujeitos a validação fiscal." />
                        <Metric label="Nao creditavel" value={money(simulacao.metrics.creditos.baseNaoCreditavel12m)} help="Valores classificados como tipicamente não creditáveis, como folha, tributos, multas, juros e itens sem direito aparente a crédito." />
                        <Metric label="Revisar" value={money(simulacao.metrics.creditos.baseRevisao12m)} sub={`Base ajustada ${money(simulacao.metrics.creditos.baseAjustada12m)}`} help="Valores que exigem análise fiscal. O cálculo conservador considera apenas 25% dessa base na estimativa ajustada." />
                      </div>
                      {simulacao.metrics.creditos.itens?.length > 0 && (
                        <div className="mt-4 overflow-hidden rounded-[6px] border">
                          <div className="grid grid-cols-[110px_minmax(0,1fr)_120px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                            <span>Classe</span>
                            <span>Conta</span>
                            <span className="text-right">Valor</span>
                          </div>
                          <div className="divide-y">
                            {simulacao.metrics.creditos.itens.map((item: any) => (
                              <div key={`${item.conta}-${item.categoria}`} className="grid grid-cols-[110px_minmax(0,1fr)_120px] gap-3 px-3 py-2 text-xs">
                                <Badge variant="outline" className="w-fit">{item.categoria}</Badge>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{item.conta} - {item.nomeConta}</p>
                                  <p className="mt-0.5 truncate text-muted-foreground">{item.motivo}</p>
                                </div>
                                <span className="text-right tabular-nums">{money(item.valor)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-[6px] border bg-background/70 p-4">
                    <p className="text-sm font-medium">{simulacao.resumo.texto}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[6px] border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">IBS/CBS dentro do Simples</p>
                          <HelpTip text="Estimativa da carga de IBS/CBS mantendo o recolhimento dentro do Simples Nacional, conforme alíquota parametrizada na simulação." />
                        </div>
                        <p className="mt-2 text-xl font-semibold">{money(simulacao.cenarios.simplesDentro.cargaEstimativa)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Credito transferido: {money(simulacao.cenarios.simplesDentro.creditoTransferidoCliente)}</p>
                      </div>
                      <div className="rounded-[6px] border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">Apuracao regular</p>
                          <HelpTip text="Estimativa de débito menos créditos apropriáveis no regime regular. Usa alíquotas CBS/IBS, redução setorial e base de créditos classificada quando disponível." />
                        </div>
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

                  {simulacao.confiabilidade && (
                    <div className="rounded-[6px] border bg-background/70 p-4 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Confiabilidade técnica: {simulacao.confiabilidade.nivel} ({simulacao.confiabilidade.score}%)
                      </div>
                      {simulacao.confiabilidade.fatores?.length > 0 && (
                        <p className="mt-2 text-muted-foreground">Fatores positivos: {simulacao.confiabilidade.fatores.join('; ')}.</p>
                      )}
                      {simulacao.confiabilidade.pendencias?.length > 0 && (
                        <p className="mt-2 text-muted-foreground">Pendências: {simulacao.confiabilidade.pendencias.join('; ')}.</p>
                      )}
                    </div>
                  )}

                  {simulacao.sensibilidade?.length > 0 && (
                    <div className="rounded-[6px] border bg-background/70 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <TrendingUp className="h-4 w-4" />
                        Análise de sensibilidade
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        {simulacao.sensibilidade.map((item: any) => {
                          const cfg = RECOMENDACAO_CFG[item.recomendacao] ?? RECOMENDACAO_CFG.INCONCLUSIVO!
                          return (
                            <div key={item.cenario} className="rounded-[6px] border p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{item.label}</p>
                                <Badge variant="outline" className={cn('border', cfg.tone)}>{cfg.label}</Badge>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">Regular: {money(item.cargaRegular)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">Simples: {money(item.cargaSimples)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">Diferença ajustada: {money(item.diferenca)}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {simulacao.planoAcao?.length > 0 && (
                    <div className="rounded-[6px] border bg-background/70 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Plano de ação técnico
                      </div>
                      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                        {simulacao.planoAcao.map((item: string) => <li key={item}>{item}</li>)}
                      </ol>
                    </div>
                  )}

                  {simulacao.parecer && (
                    <div className="rounded-[6px] border bg-background/70 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4" />
                        Parecer salvo
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">{simulacao.parecer}</pre>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  <CardTitle>Premissas fiscais</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={novaPremissa}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Premissa aplicada</Label>
                  <Select
                    value={premissaSelecionadaId}
                    onValueChange={(value) => {
                      const item = premissasFiscais.find(p => p.id === value)
                      if (item) aplicarPremissa(item)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingPremissas ? 'Carregando...' : 'Selecione uma premissa'} />
                    </SelectTrigger>
                    <SelectContent>
                      {premissasFiscais.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.nome} ({item.ano})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nome</Label>
                  <Input value={premissaForm.nome} onChange={(e) => setPremissaForm(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ano</Label>
                  <Input type="number" value={premissaForm.ano} onChange={(e) => setPremissaForm(p => ({ ...p, ano: Number(e.target.value || 2027) }))} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Setor</Label>
                  <Input value={premissaForm.setor ?? ''} onChange={(e) => setPremissaForm(p => ({ ...p, setor: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Prefixo CNAE</Label>
                  <Input value={premissaForm.cnaePrefix ?? ''} onChange={(e) => setPremissaForm(p => ({ ...p, cnaePrefix: e.target.value }))} />
                </div>
                <PercentInput label="Redução setorial" value={premissaForm.reducaoSetorial} onChange={(v) => setPremissaForm(p => ({ ...p, reducaoSetorial: v }))} />
                <PercentInput label="Peso crédito cliente" value={premissaForm.pesoCreditoCliente} onChange={(v) => setPremissaForm(p => ({ ...p, pesoCreditoCliente: v }))} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <PercentInput label="CBS" value={premissaForm.aliquotaCbs} onChange={(v) => setPremissaForm(p => ({ ...p, aliquotaCbs: v }))} />
                <PercentInput label="IBS" value={premissaForm.aliquotaIbs} onChange={(v) => setPremissaForm(p => ({ ...p, aliquotaIbs: v }))} />
                <PercentInput label="IBS/CBS no Simples" value={premissaForm.aliquotaSimplesIbsCbs} onChange={(v) => setPremissaForm(p => ({ ...p, aliquotaSimplesIbsCbs: v }))} />
                <PercentInput label="Vendas B2B" value={premissaForm.percentualVendasB2B} onChange={(v) => setPremissaForm(p => ({ ...p, percentualVendasB2B: v }))} />
                <PercentInput label="Compras creditáveis" value={premissaForm.percentualComprasCreditaveis} onChange={(v) => setPremissaForm(p => ({ ...p, percentualComprasCreditaveis: v }))} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Observações técnicas</Label>
                <Textarea
                  value={premissaForm.observacoes ?? ''}
                  onChange={(e) => setPremissaForm(p => ({ ...p, observacoes: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {premissaForm.id && premissaForm.id !== 'default' && (
                  <Button variant="outline" onClick={removerPremissa}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Inativar
                  </Button>
                )}
                <Button variant="outline" onClick={() => aplicarPremissa({ id: premissaForm.id ?? 'manual', ...premissaForm })}>
                  Aplicar na simulação
                </Button>
                <Button onClick={salvarPremissa} disabled={salvandoPremissa}>
                  {salvandoPremissa ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar premissa
                </Button>
              </div>
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
              <PercentInput label="Redução setorial" value={premissas.reducaoSetorial} onChange={(v) => setPremissas(p => ({ ...p, reducaoSetorial: v }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <CardTitle>Histórico de pareceres</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => carregarHistorico()} disabled={!clienteId || loadingHistorico}>
                  {loadingHistorico ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {loadingHistorico && (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando histórico...
                </div>
              )}

              {!loadingHistorico && historico.length === 0 && (
                <div className="rounded-[6px] border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum parecer salvo para este cliente.
                </div>
              )}

              {!loadingHistorico && historico.map(item => {
                const cfg = RECOMENDACAO_CFG[item.recomendacao] ?? RECOMENDACAO_CFG.INCONCLUSIVO!
                return (
                  <div key={item.id} className="rounded-[6px] border bg-background/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={cn('border', cfg.tone)}>{cfg.label}</Badge>
                          <span className="text-xs text-muted-foreground">{dateTimeBR(item.createdAt)}</span>
                          <span className="text-xs text-muted-foreground">Qualidade {item.qualidadeScore}%</span>
                          <span className="text-xs text-muted-foreground">{money(item.faturamento12m)}</span>
                        </div>
                        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">{item.parecer}</pre>
                        {item.usuarioNome && <p className="mt-3 text-xs text-muted-foreground">Salvo por {item.usuarioNome}</p>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removerHistorico(item)} title="Remover parecer">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                )
              })}
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
    </TooltipProvider>
  )
}
