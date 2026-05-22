'use client'

/**
 * /danfe/agendamento — controle e auditoria do agendamento de buscas fiscais
 * (NFe SEFAZ e NFS-e Nacional ADN).
 *
 * Entrega 1: read-only. Mostra:
 *   - Status do cron (ON/OFF, expressão, próxima execução)
 *   - Quantos clientes têm busca automática ativa
 *   - Última rodada (status, sucesso/erros)
 *   - Estatísticas dos últimos 30 dias
 *   - Histórico de execuções (últimas 50)
 *
 * Pra mudar horário/desligar/disparar manualmente em lote → Entrega 2.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Clock, CheckCircle2, AlertCircle, XCircle, Loader2, RefreshCw,
  ArrowLeft, Calendar, Activity, Users, Hourglass,
  Receipt, Briefcase, Save, Power, PlayCircle, Settings,
} from 'lucide-react'
import { Button, Card, cn, Badge, Input } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

type SchedulerSlug = 'nfe-dist' | 'nfse-dist'

interface SchedulerStatus {
  slug: SchedulerSlug
  nome: string
  cronExpressao: string
  cronSource: 'db' | 'env' | 'default'
  timezone: string
  enabled: boolean
  enabledSource: 'db' | 'env' | 'default'
  proximaExecucao: string | null
  clientesAtivos: number
  ultimaExecucao: {
    id: string
    iniciadoEm: string
    finalizadoEm: string | null
    status: string
    trigger: string
    totalClientes: number
    sucesso: number
    erros: number
    duracaoMs: number | null
  } | null
  stats30d: {
    total: number
    ok: number
    erro: number
    parcial: number
    rodando: number
  }
}

interface Execucao {
  id: string
  scheduler: string
  iniciadoEm: string
  finalizadoEm: string | null
  status: string
  trigger: string
  totalClientes: number
  sucesso: number
  erros: number
  duracaoMs: number | null
  erroGeral: string | null
}

function fmtData(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDataRelativa(d: string | null): string {
  if (!d) return '—'
  const ms = new Date(d).getTime() - Date.now()
  const abs = Math.abs(ms)
  const min = Math.round(abs / 60_000)
  const h = Math.round(abs / 3_600_000)
  const dias = Math.round(abs / 86_400_000)
  const prefix = ms < 0 ? 'há ' : 'em '
  if (min < 60) return `${prefix}${min} min`
  if (h < 24) return `${prefix}${h} h`
  return `${prefix}${dias} d`
}

function fmtDuracao(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)} min`
}

const SCHEDULERS: Array<{ slug: SchedulerSlug; label: string; icon: typeof Receipt }> = [
  { slug: 'nfe-dist', label: 'NFe SEFAZ', icon: Receipt },
  { slug: 'nfse-dist', label: 'NFS-e Nacional', icon: Briefcase },
]

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { cls: string; icon: typeof CheckCircle2; label: string }> = {
    OK:      { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50', icon: CheckCircle2, label: 'OK' },
    ERRO:    { cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50', icon: XCircle, label: 'Erro' },
    PARCIAL: { cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50', icon: AlertCircle, label: 'Parcial' },
    RODANDO: { cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50', icon: Loader2, label: 'Rodando' },
  }
  const v = variants[status] ?? variants.RODANDO
  const Icon = v.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium', v.cls)}>
      <Icon className={cn('h-3 w-3', status === 'RODANDO' && 'animate-spin')} /> {v.label}
    </span>
  )
}

export default function AgendamentoPage() {
  const [tab, setTab] = useState<SchedulerSlug>('nfe-dist')
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const carregar = useCallback(async (slug: SchedulerSlug) => {
    setRefreshing(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [st, ex] = await Promise.all([
        (trpc as any).agendamento.getStatus.query({ scheduler: slug }),
        (trpc as any).agendamento.listExecucoes.query({ scheduler: slug, limit: 50 }),
      ])
      setStatus(st)
      setExecucoes(ex.items)
    } catch (e) {
      console.error('[agendamento] falha ao carregar', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { carregar(tab) }, [tab, carregar])

  const tabInfo = useMemo(() => SCHEDULERS.find(s => s.slug === tab)!, [tab])
  const TabIcon = tabInfo.icon

  return (
    <div className="space-y-4">
      {/* Header — padrão /danfe */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: MODULE_COLOR }}>
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <h1>Agendamento de buscas</h1>
            <p className="text-sm text-muted-foreground">Cron diário, histórico e disparo manual de sync fiscal</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/danfe">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => carregar(tab)}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Recarregar
          </Button>
        </div>
      </div>

      {/* Tabs NFe/NFSe */}
      <div className="flex gap-2 border-b border-border">
        {SCHEDULERS.map(s => {
          const Icon = s.icon
          return (
            <button
              key={s.slug}
              onClick={() => setTab(s.slug)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors',
                tab === s.slug
                  ? 'text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              style={tab === s.slug ? { borderBottomColor: MODULE_COLOR } : {}}
            >
              <Icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !status ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Erro ao carregar status do agendamento.
        </Card>
      ) : (
        <>
          {/* Cards de KPI */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <KpiCard
              icon={status.enabled ? CheckCircle2 : XCircle}
              label="Cron diário"
              valor={status.enabled ? 'Ativo' : 'Desligado'}
              sub={`${status.cronExpressao} (${status.timezone})`}
              colorClass={status.enabled ? 'text-emerald-600' : 'text-muted-foreground'}
            />
            <KpiCard
              icon={Hourglass}
              label="Próxima execução"
              valor={status.proximaExecucao ? fmtDataRelativa(status.proximaExecucao) : '—'}
              sub={status.proximaExecucao ? fmtData(status.proximaExecucao) : 'Cron desligado'}
            />
            <KpiCard
              icon={Users}
              label="Clientes ativos"
              valor={String(status.clientesAtivos)}
              sub={`Com busca ${tabInfo.label.toLowerCase()} ligada`}
            />
            <KpiCard
              icon={Activity}
              label="Últimos 30 dias"
              valor={`${status.stats30d.total} rodadas`}
              sub={`${status.stats30d.ok} OK · ${status.stats30d.parcial} parc · ${status.stats30d.erro} erro`}
            />
          </div>

          {/* Última execução */}
          {status.ultimaExecucao && (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <TabIcon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: MODULE_COLOR }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">
                    Última execução
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <StatusBadge status={status.ultimaExecucao.status} />
                    <span className="text-muted-foreground">{status.ultimaExecucao.trigger}</span>
                    <span>·</span>
                    <span>{fmtData(status.ultimaExecucao.iniciadoEm)}</span>
                    <span className="text-muted-foreground">({fmtDataRelativa(status.ultimaExecucao.iniciadoEm)})</span>
                    <span>·</span>
                    <span className="font-mono text-[12px]">
                      {status.ultimaExecucao.sucesso}/{status.ultimaExecucao.totalClientes} OK
                      {status.ultimaExecucao.erros > 0 && (
                        <span className="text-rose-600 ml-1">· {status.ultimaExecucao.erros} erro(s)</span>
                      )}
                    </span>
                    <span>·</span>
                    <span className="text-muted-foreground">{fmtDuracao(status.ultimaExecucao.duracaoMs)}</span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Histórico */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold">Histórico de execuções</h2>
              <span className="text-[11px] text-muted-foreground">{execucoes.length} última(s)</span>
            </div>

            {execucoes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma execução registrada ainda. O log começa a popular após a primeira rodada do scheduler.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <th className="py-2 px-2 font-medium text-muted-foreground">Início</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground">Status</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground">Gatilho</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right">Clientes</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right">OK</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right">Erros</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right">Duração</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execucoes.map(ex => (
                      <tr key={ex.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-1.5 px-2 whitespace-nowrap">{fmtData(ex.iniciadoEm)}</td>
                        <td className="py-1.5 px-2"><StatusBadge status={ex.status} /></td>
                        <td className="py-1.5 px-2">
                          <Badge variant="outline" className="text-[10px]">{ex.trigger}</Badge>
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono">{ex.totalClientes}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-emerald-700 dark:text-emerald-400">{ex.sucesso}</td>
                        <td className={cn('py-1.5 px-2 text-right font-mono', ex.erros > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground')}>
                          {ex.erros}
                        </td>
                        <td className="py-1.5 px-2 text-right text-muted-foreground">{fmtDuracao(ex.duracaoMs)}</td>
                        <td className="py-1.5 px-2 text-muted-foreground max-w-[280px] truncate" title={ex.erroGeral ?? ''}>
                          {ex.erroGeral ?? (ex.status === 'OK' ? '' : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Painel de Configuração */}
          <ConfigPanel
            status={status}
            onChange={() => carregar(tab)}
          />
        </>
      )}
    </div>
  )
}

/**
 * Painel de configuração — toggle on/off, edição de horário (hh:mm),
 * botão "Disparar agora pra todos".
 */
function ConfigPanel({ status, onChange }: { status: SchedulerStatus; onChange: () => void }) {
  // Converte cron "mm hh * * *" pra hh:mm pro input. Outros formatos = avançado, mostra raw.
  const [hora, minuto] = useMemo(() => {
    const m = status.cronExpressao.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
    if (m) return [Number(m[2]), Number(m[1])]
    return [-1, -1]
  }, [status.cronExpressao])

  const isFormatoSimples = hora >= 0 && minuto >= 0
  const horaInicial = isFormatoSimples ? `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}` : ''

  const [horaEdit, setHoraEdit] = useState(horaInicial)
  const [cronAvancado, setCronAvancado] = useState(status.cronExpressao)
  const [modoAvancado, setModoAvancado] = useState(!isFormatoSimples)
  const [salvando, setSalvando] = useState(false)
  const [togglando, setTogglando] = useState(false)
  const [disparando, setDisparando] = useState(false)

  // Resync quando status muda externamente
  useEffect(() => {
    setHoraEdit(horaInicial)
    setCronAvancado(status.cronExpressao)
    setModoAvancado(!isFormatoSimples)
  }, [status.cronExpressao, horaInicial, isFormatoSimples])

  async function salvarHorario() {
    setSalvando(true)
    try {
      let cron: string
      if (modoAvancado) {
        cron = cronAvancado.trim()
      } else {
        const m = /^(\d{1,2}):(\d{1,2})$/.exec(horaEdit.trim())
        if (!m) {
          alerts.error('Horário inválido', 'Use o formato HH:MM (ex: 03:30)')
          setSalvando(false)
          return
        }
        const h = Number(m[1]), mi = Number(m[2])
        if (h < 0 || h > 23 || mi < 0 || mi > 59) {
          alerts.error('Horário inválido', 'Hora 0-23, minuto 0-59')
          setSalvando(false)
          return
        }
        cron = `${mi} ${h} * * *`
      }
      await trpcMutate('agendamento.salvarHorario', { scheduler: status.slug, cron })
      await alerts.success('Horário atualizado', 'Pode levar até 30s pro scheduler reaplicar.')
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function alternarEnabled() {
    setTogglando(true)
    try {
      await trpcMutate('agendamento.alternarStatus', {
        scheduler: status.slug,
        enabled: !status.enabled,
      })
      await alerts.success(
        status.enabled ? 'Cron desativado' : 'Cron ativado',
        'Pode levar até 30s pro scheduler reaplicar.',
      )
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setTogglando(false)
    }
  }

  async function dispararAgora() {
    if (status.clientesAtivos === 0) {
      alerts.warning('Sem clientes ativos', 'Nenhum cliente tem busca automática habilitada pra esse scheduler.')
      return
    }
    const ok = await alerts.confirm({
      title: 'Disparar busca agora?',
      text: `Vou marcar ${status.clientesAtivos} cliente(s) ativo(s) pra sync imediato. O poll manual de 60s consome.`,
      confirmText: 'Disparar',
    })
    if (!ok) return
    setDisparando(true)
    try {
      const r = await trpcMutate<{ totalMarcados: number }>('agendamento.executarAgora', { scheduler: status.slug })
      await alerts.success('Disparado', `${r.totalMarcados} cliente(s) marcado(s). Sync vai começar nos próximos 60s.`)
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setDisparando(false)
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">Configuração</h2>
        {status.cronSource !== 'db' && status.enabledSource !== 'db' && (
          <Badge variant="outline" className="text-[10px]">Usando defaults</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Toggle on/off */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">Cron diário</div>
              <div className="text-[12px] mt-0.5">
                {status.enabled ? (
                  <span className="text-emerald-700 dark:text-emerald-400">Ativo — roda automaticamente</span>
                ) : (
                  <span className="text-muted-foreground">Desligado — só sync manual funciona</span>
                )}
              </div>
            </div>
            <Button
              variant={status.enabled ? 'outline' : 'default'}
              size="sm"
              onClick={alternarEnabled}
              disabled={togglando}
              className="gap-1.5"
            >
              {togglando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              {status.enabled ? 'Desligar' : 'Ligar'}
            </Button>
          </div>
        </div>

        {/* Disparar agora */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">Busca imediata</div>
              <div className="text-[12px] mt-0.5">
                Marca os <b>{status.clientesAtivos}</b> cliente(s) ativos pra sync agora
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={dispararAgora}
              disabled={disparando || status.clientesAtivos === 0}
              className="gap-1.5"
              style={{ backgroundColor: MODULE_COLOR }}
            >
              {disparando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              <span className="text-white">Disparar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Editor de horário */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">
            Horário de execução
          </div>
          <button
            type="button"
            onClick={() => setModoAvancado(v => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {modoAvancado ? 'Modo simples' : 'Modo avançado (cron)'}
          </button>
        </div>
        <div className="flex items-end gap-2">
          {modoAvancado ? (
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-1">
                Expressão cron (5 campos: min hora diaMes mes diaSem)
              </label>
              <Input
                value={cronAvancado}
                onChange={(e) => setCronAvancado(e.target.value)}
                placeholder="30 3 * * *"
                className="h-9 text-sm font-mono"
              />
            </div>
          ) : (
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Horário (HH:MM) — todos os dias</label>
              <Input
                type="time"
                value={horaEdit}
                onChange={(e) => setHoraEdit(e.target.value)}
                className="h-9 text-sm w-32"
              />
            </div>
          )}
          <Button
            size="sm"
            onClick={salvarHorario}
            disabled={salvando}
            className="gap-1.5 h-9"
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Expressão atual: <code className="font-mono">{status.cronExpressao}</code>
          {' '}({status.cronSource === 'db' ? 'salva no DB' : status.cronSource === 'env' ? 'env var' : 'default'})
          {' · '}
          Fuso: <code className="font-mono">{status.timezone}</code>
        </div>
      </div>
    </Card>
  )
}

function KpiCard({
  icon: Icon, label, valor, sub, colorClass,
}: {
  icon: typeof Clock
  label: string
  valor: string
  sub?: string
  colorClass?: string
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn('h-3.5 w-3.5 text-muted-foreground', colorClass)} />
        <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wide">{label}</span>
      </div>
      <div className={cn('text-[18px] font-semibold leading-tight', colorClass)}>{valor}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  )
}
