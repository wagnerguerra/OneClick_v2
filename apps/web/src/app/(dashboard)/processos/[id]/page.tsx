'use client'

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Workflow, Loader2, CheckCircle2, XCircle, PlayCircle, Pause, Clock,
  ListChecks, Layers, AlertCircle, AlertTriangle, History, Ban, MessageSquare, Search, X, UserCog,
} from 'lucide-react'
import {
  Button, Card, CardContent, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter, Label,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-processos, #8b5cf6)'

interface Passo {
  id: string
  ordem: number
  passoNome: string
  concluido: boolean
  ignorado: boolean
  obrigatorio: boolean
}

interface Execucao {
  id: string
  status: string
  iniciadoEm: string
  concluidoEm: string | null
  prazoLimite: string | null
  pausado?: boolean
  servicoId: string
  predecessorExecucaoId: string | null
  encadeamentoId: string | null
  servico: { id: string; nome: string }
  encadeamento: { id: string; obrigatorio: boolean; iniciaAuto: boolean } | null
  responsavel: { id: string; name: string; image: string | null } | null
  passos: Passo[]
}

interface Evento {
  id: string
  tipo: string
  descricao: string
  createdAt: string
  metadata: Record<string, unknown> | null
  usuario: { id: string; name: string; image: string | null } | null
}

interface Processo {
  id: string
  nome: string
  status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO'
  iniciadoEm: string
  concluidoEm: string | null
  canceladoMotivo: string | null
  orcamentoId: string | null
  cliente: { id: string; razaoSocial: string; documento: string; email: string | null } | null
  servicoRaiz: { id: string; nome: string; descricao: string | null } | null
  responsavel: { id: string; name: string; image: string | null } | null
  execucoes: Execucao[]
  eventos: Evento[]
}

const STATUS_LABELS: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

const STATUS_BADGE: Record<string, string> = {
  EM_ANDAMENTO: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400',
  CONCLUIDO:    'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400',
  CANCELADO:    'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400',
  AGUARDANDO_INICIO: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
  AGUARDANDO_RESPOSTA: 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400',
  PULADO:       'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
}

const EXEC_STATUS_LABELS: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  AGUARDANDO_INICIO: 'Aguardando início',
  AGUARDANDO_RESPOSTA: 'Aguardando resposta',
  PULADO: 'Pulado',
}

export default function ProcessoDetalhePage() {
  const router = useRouter()
  const params = useParams() as { id: string }
  const id = params.id

  const [proc, setProc] = useState<Processo | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'visao' | 'fluxo' | 'execucoes' | 'pendencias' | 'timeline'>('visao')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [canceling, setCanceling] = useState(false)
  // Pular sucessor opcional
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipExec, setSkipExec] = useState<{ id: string; nome: string } | null>(null)
  const [skipMotivo, setSkipMotivo] = useState('')
  const [skipping, setSkipping] = useState(false)
  // Iniciar manualmente (loading por linha pra desabilitar o botão)
  const [iniciandoId, setIniciandoId] = useState<string | null>(null)
  // Resposta de bloco PERGUNTA — opções escolhidas + observação por execução
  const [respostaOpcoes, setRespostaOpcoes] = useState<Record<string, string[]>>({})
  const [respostaObs, setRespostaObs] = useState<Record<string, string>>({})
  const [respondendoId, setRespondendoId] = useState<string | null>(null)

  const fetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await (trpc.processo as any).getById.query({ id }) as Processo | null
      setProc(data)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  async function handleCancelar() {
    if (!cancelMotivo.trim()) {
      alerts.error('Validação', 'Informe o motivo do cancelamento')
      return
    }
    setCanceling(true)
    try {
      await (trpc.processo as any).cancelar.mutate({ id, motivo: cancelMotivo.trim() })
      alerts.success('Processo cancelado')
      setCancelOpen(false)
      setCancelMotivo('')
      fetch(true)
    } catch (e) {
      alerts.error('Erro ao cancelar', (e as Error).message)
    } finally {
      setCanceling(false)
    }
  }

  async function handleIniciarSucessor(execId: string) {
    setIniciandoId(execId)
    try {
      await (trpc.servico as any).iniciarSucessorManual.mutate({ id: execId })
      alerts.success('Execução iniciada')
      fetch(true)
    } catch (e) {
      alerts.error('Erro ao iniciar', (e as Error).message)
    } finally {
      setIniciandoId(null)
    }
  }

  async function handleResponderPergunta(execId: string) {
    const opcoes = respostaOpcoes[execId] ?? []
    if (opcoes.length === 0) {
      alerts.error('Validação', 'Selecione ao menos uma opção.')
      return
    }
    setRespondendoId(execId)
    try {
      await (trpc.servico as any).responderPergunta.mutate({
        execucaoId: execId,
        opcoes,
        observacao: respostaObs[execId]?.trim() || undefined,
      })
      alerts.success('Resposta registrada', `Opção(ões): ${opcoes.join(', ')}`)
      // Limpa o estado dessa execução e refaz fetch
      setRespostaOpcoes(prev => { const c = { ...prev }; delete c[execId]; return c })
      setRespostaObs(prev => { const c = { ...prev }; delete c[execId]; return c })
      fetch(true)
    } catch (e) {
      alerts.error('Erro ao responder', (e as Error).message)
    } finally {
      setRespondendoId(null)
    }
  }

  function openSkipDialog(execId: string, nome: string) {
    setSkipExec({ id: execId, nome })
    setSkipMotivo('')
    setSkipOpen(true)
  }

  async function handleSkipSucessor() {
    if (!skipExec) return
    setSkipping(true)
    try {
      await (trpc.servico as any).pularSucessorOpcional.mutate({
        id: skipExec.id,
        motivo: skipMotivo.trim() || undefined,
      })
      alerts.success('Sucessor pulado')
      setSkipOpen(false)
      setSkipExec(null)
      setSkipMotivo('')
      fetch(true)
    } catch (e) {
      alerts.error('Erro ao pular', (e as Error).message)
    } finally {
      setSkipping(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!proc) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <p>Processo não encontrado</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/processos')}>Voltar</Button>
      </div>
    )
  }

  const totalExec = proc.execucoes.length
  const concluidas = proc.execucoes.filter(e => e.status === 'CONCLUIDO' || e.status === 'PULADO').length
  const pendentes = proc.execucoes.filter(
    e => e.status === 'AGUARDANDO_INICIO' || e.status === 'AGUARDANDO_RESPOSTA',
  ).length
  const emAndamento = proc.execucoes.filter(e => e.status === 'EM_ANDAMENTO').length
  const pct = totalExec > 0 ? Math.round((concluidas / totalExec) * 100) : 0

  return (
    <div className="space-y-0 pb-6">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="space-y-0">
        {/* Wrapper bleed-edge — padrão de páginas de detalhe (espelha /orcamentos/[id]) */}
        <div
          className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden"
          style={{ backgroundColor: 'rgba(139, 92, 246, .18)' }}
        >
          {/* Overlay em gradiente: 0% à esquerda → 80% à direita */}
          <div
            className="absolute inset-0"
            style={{ backgroundImage: 'linear-gradient(to right, rgba(139, 92, 246, 0) 0%, rgba(139, 92, 246, 0.8) 100%)' }}
          />

          <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                {/* Logo round 88x88 */}
                <div
                  className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg"
                  style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}
                >
                  <Workflow className="h-10 w-10" style={{ color: MODULE_COLOR }} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold uppercase truncate">{proc.nome}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {proc.cliente?.razaoSocial || 'Sem cliente'}
                    {proc.cliente?.documento && (<>&nbsp;&nbsp;|&nbsp;&nbsp;{proc.cliente.documento}</>)}
                    &nbsp;&nbsp;|&nbsp;&nbsp;Iniciado em: {new Date(proc.iniciadoEm).toLocaleDateString('pt-BR')}, {new Date(proc.iniciadoEm).toLocaleTimeString('pt-BR')}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase border ${STATUS_BADGE[proc.status]}`}>
                      {proc.status === 'EM_ANDAMENTO' && <PlayCircle className="h-3 w-3" />}
                      {proc.status === 'CONCLUIDO' && <CheckCircle2 className="h-3 w-3" />}
                      {proc.status === 'CANCELADO' && <XCircle className="h-3 w-3" />}
                      {STATUS_LABELS[proc.status]}
                    </span>
                    {proc.orcamentoId && (
                      <Link
                        href={`/orcamentos/${proc.orcamentoId}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/60 hover:bg-white text-violet-700 dark:bg-black/30 dark:text-violet-300 dark:hover:bg-black/50 px-3 py-1 text-xs font-medium uppercase border border-violet-200/60 dark:border-violet-800/60 transition-colors"
                      >
                        Origem: orçamento ↗
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {proc.status === 'EM_ANDAMENTO' && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setCancelOpen(true)}
                    className="gap-1.5 text-xs text-rose-600 bg-white/70 hover:bg-rose-50 dark:bg-black/30 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                  >
                    <Ban className="h-3.5 w-3.5" />Cancelar
                  </Button>
                )}
                <BackButton href="/processos" />
              </div>
            </div>
          </div>

          {/* TabsList em pills centralizadas — dentro do mesmo wrapper */}
          <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
            <TabsList className="min-w-max !shadow-sm !border !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit h-auto">
              <TabsTrigger value="visao" className="!relative !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-white data-[state=active]:!shadow-sm data-[state=active]:!text-violet-700 dark:data-[state=active]:!bg-white/90 dark:data-[state=active]:!text-violet-700 gap-1.5">
                <Layers className="h-3.5 w-3.5" />Visão geral
              </TabsTrigger>
              <TabsTrigger value="fluxo" className="!relative !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-white data-[state=active]:!shadow-sm data-[state=active]:!text-violet-700 dark:data-[state=active]:!bg-white/90 dark:data-[state=active]:!text-violet-700 gap-1.5">
                <Workflow className="h-3.5 w-3.5" />Fluxo
              </TabsTrigger>
              <TabsTrigger value="execucoes" className="!relative !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-white data-[state=active]:!shadow-sm data-[state=active]:!text-violet-700 dark:data-[state=active]:!bg-white/90 dark:data-[state=active]:!text-violet-700 gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />Execuções
                <span className="ml-1 text-[10px] px-1.5 rounded-full bg-violet-100 text-violet-700 tabular-nums">{totalExec}</span>
              </TabsTrigger>
              <TabsTrigger value="pendencias" className="!relative !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-white data-[state=active]:!shadow-sm data-[state=active]:!text-violet-700 dark:data-[state=active]:!bg-white/90 dark:data-[state=active]:!text-violet-700 gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />Pendências
                {pendentes > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 rounded-full bg-amber-100 text-amber-700 tabular-nums">{pendentes}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="timeline" className="!relative !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-white data-[state=active]:!shadow-sm data-[state=active]:!text-violet-700 dark:data-[state=active]:!bg-white/90 dark:data-[state=active]:!text-violet-700 gap-1.5">
                <History className="h-3.5 w-3.5" />Timeline
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        {/* /wrapper */}

        {/* Visão geral */}
        <TabsContent value="visao" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Execuções" value={totalExec} Icon={Layers} color="violet" />
            <KpiCard label="Em andamento" value={emAndamento} Icon={PlayCircle} color="violet" />
            <KpiCard label="Concluídas" value={concluidas} Icon={CheckCircle2} color="emerald" />
            <KpiCard label="Aguardando" value={pendentes} Icon={Clock} color="amber" />
          </div>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Progresso da cadeia</Label>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium tabular-nums">{concluidas} de {totalExec} concluídas</span>
                    <span className="text-muted-foreground tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: proc.status === 'CONCLUIDO' ? '#10b981' : MODULE_COLOR,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                <InfoLine label="Cliente" value={proc.cliente?.razaoSocial || '—'} />
                <InfoLine label="Documento" value={proc.cliente?.documento || '—'} />
                <InfoLine label="Serviço-raiz" value={proc.servicoRaiz?.nome || '—'} />
                <InfoLine
                  label="Responsável"
                  value={proc.responsavel?.name || 'Não atribuído'}
                />
                <InfoLine label="Iniciado em" value={new Date(proc.iniciadoEm).toLocaleString('pt-BR')} />
                {proc.concluidoEm && (
                  <InfoLine label="Concluído em" value={new Date(proc.concluidoEm).toLocaleString('pt-BR')} />
                )}
                {proc.canceladoMotivo && (
                  <div className="sm:col-span-2">
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Motivo do cancelamento</Label>
                    <p className="text-sm mt-1 italic text-rose-700 dark:text-rose-400">{proc.canceladoMotivo}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fluxo (DAG visual) */}
        <TabsContent value="fluxo" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <FluxoGraph execucoes={proc.execucoes} onChanged={() => fetch(true)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Execuções */}
        <TabsContent value="execucoes" className="mt-4">
          {proc.execucoes.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Sem execuções vinculadas.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {proc.execucoes.map(exec => (
                <ExecucaoCard key={exec.id} exec={exec} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Pendências */}
        <TabsContent value="pendencias" className="mt-4">
          {(() => {
            const pend = proc.execucoes.filter(
              e => e.status === 'AGUARDANDO_INICIO' || e.status === 'AGUARDANDO_RESPOSTA',
            )
            if (pend.length === 0) {
              return (
                <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma execução aguardando confirmação manual.
                </CardContent></Card>
              )
            }
            return (
              <div className="space-y-2">
                <div className="rounded-lg border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20 p-3">
                  <p className="text-xs text-amber-900 dark:text-amber-200">
                    <strong>{pend.length}</strong> {pend.length === 1 ? 'execução aguarda' : 'execuções aguardam'} ação do gestor.
                    Sucessores podem ser iniciados ou pulados; blocos de pergunta precisam ser respondidos.
                  </p>
                </div>
                {pend.map(exec => {
                  // Bloco PERGUNTA — card especial com opções + observação
                  if (exec.status === 'AGUARDANDO_RESPOSTA' && (exec.servico as any).tipo === 'PERGUNTA') {
                    const sv = exec.servico as any
                    const opcoesValidas = (sv.perguntaOpcoes as string[] | null) ?? []
                    const multi = !!sv.perguntaMulti
                    const escolhidas = respostaOpcoes[exec.id] ?? []
                    const toggleOpcao = (op: string) => {
                      setRespostaOpcoes(prev => {
                        const atuais = prev[exec.id] ?? []
                        if (multi) {
                          return atuais.includes(op)
                            ? { ...prev, [exec.id]: atuais.filter(x => x !== op) }
                            : { ...prev, [exec.id]: [...atuais, op] }
                        }
                        return { ...prev, [exec.id]: [op] }
                      })
                    }
                    return (
                      <Card key={exec.id} className="border-l-4 border-l-orange-400">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-semibold">{sv.nome}</span>
                                <Badge variant="outline" className={`text-[10px] h-5 ${STATUS_BADGE.AGUARDANDO_RESPOSTA}`}>
                                  Aguardando resposta
                                </Badge>
                                <Badge variant="outline" className="text-[10px] h-5">
                                  {multi ? 'Múltipla escolha' : 'Escolha única'}
                                </Badge>
                              </div>
                              <p className="text-[12px] font-medium text-foreground/90 mt-1">
                                {sv.perguntaTexto || sv.nome}
                              </p>
                              <div className="text-[11px] text-muted-foreground mt-1">
                                {exec.responsavel?.name || 'Sem responsável'} · Criada em {new Date(exec.iniciadoEm).toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {opcoesValidas.map((op, idx) => {
                              const checked = escolhidas.includes(op)
                              return (
                                <label
                                  key={idx}
                                  className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm transition-colors ${checked ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700' : 'border-border hover:bg-muted/50'}`}
                                >
                                  <input
                                    type={multi ? 'checkbox' : 'radio'}
                                    name={`pergunta-${exec.id}`}
                                    checked={checked}
                                    onChange={() => toggleOpcao(op)}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span>{op}</span>
                                </label>
                              )
                            })}
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-foreground block mb-1">
                              Observação (opcional)
                            </label>
                            <textarea
                              rows={2}
                              maxLength={2000}
                              value={respostaObs[exec.id] ?? ''}
                              onChange={e => setRespostaObs(prev => ({ ...prev, [exec.id]: e.target.value }))}
                              placeholder="Adicione contexto da decisão (opcional)"
                              className="w-full text-sm border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              onClick={() => handleResponderPergunta(exec.id)}
                              disabled={respondendoId === exec.id || escolhidas.length === 0}
                              className="gap-1.5"
                              style={{ backgroundColor: '#f59e0b', color: '#fff' }}
                            >
                              {respondendoId === exec.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <CheckCircle2 className="h-3.5 w-3.5" />}
                              Confirmar resposta
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  }
                  // AGUARDANDO_INICIO — card original
                  const podePular = exec.encadeamento ? !exec.encadeamento.obrigatorio : false
                  return (
                    <Card key={exec.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-semibold">{exec.servico.nome}</span>
                              <Badge variant="outline" className={`text-[10px] h-5 ${STATUS_BADGE.AGUARDANDO_INICIO}`}>
                                <Clock className="h-2.5 w-2.5 mr-1" />Aguardando início
                              </Badge>
                              {!podePular && (
                                <Badge variant="outline" className="text-[10px] h-5">
                                  Obrigatório
                                </Badge>
                              )}
                              {podePular && (
                                <Badge variant="outline" className="text-[10px] h-5 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400">
                                  Opcional
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {exec.responsavel?.name || 'Sem responsável'} ·
                              {' '}Criada em {new Date(exec.iniciadoEm).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => handleIniciarSucessor(exec.id)}
                              disabled={iniciandoId === exec.id}
                              className="gap-1.5"
                              style={{ backgroundColor: MODULE_COLOR }}
                            >
                              {iniciandoId === exec.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <PlayCircle className="h-3.5 w-3.5" />}
                              Iniciar
                            </Button>
                            {podePular && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openSkipDialog(exec.id, exec.servico.nome)}
                                className="gap-1.5"
                              >
                                <Pause className="h-3.5 w-3.5" />Pular
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )
          })()}
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="mt-4">
          {proc.eventos.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Sem eventos registrados.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {proc.eventos.map(ev => (
                  <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="shrink-0 mt-0.5">
                      {ev.tipo === 'concluido' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {ev.tipo === 'cancelado' && <XCircle className="h-4 w-4 text-rose-600" />}
                      {ev.tipo === 'criado' && <PlayCircle className="h-4 w-4 text-violet-600" />}
                      {ev.tipo === 'execucao_criada' && <ListChecks className="h-4 w-4 text-violet-600" />}
                      {ev.tipo === 'execucao_concluida' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {ev.tipo === 'sucessor_pulado_condicao' && <Pause className="h-4 w-4 text-gray-500" />}
                      {ev.tipo === 'sucessor_pulado_manual' && <Pause className="h-4 w-4 text-gray-500" />}
                      {!['concluido','cancelado','criado','execucao_criada','execucao_concluida','sucessor_pulado_condicao','sucessor_pulado_manual'].includes(ev.tipo) && (
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{ev.descricao}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {ev.usuario?.name || 'Sistema'} · {new Date(ev.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog pular sucessor */}
      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={AlertTriangle} color="amber">
            <DialogTitle>Pular sucessor</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja pular &quot;{skipExec?.nome}&quot;? Esta execução não será realizada.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold">Motivo (opcional)</Label>
            <textarea
              value={skipMotivo}
              onChange={e => setSkipMotivo(e.target.value)}
              rows={3}
              placeholder="Ex: cliente já tem o serviço com outro fornecedor."
              className="w-full mt-1.5 rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipOpen(false)}>Voltar</Button>
            <Button onClick={handleSkipSucessor} disabled={skipping} variant="destructive" className="gap-1.5">
              {skipping && <Loader2 className="h-4 w-4 animate-spin" />}
              <Pause className="h-3.5 w-3.5" />Pular execução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cancelar */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeaderIcon icon={Ban} color="rose">
            <DialogTitle>Cancelar processo</DialogTitle>
            <DialogDescription>
              Todas as execuções em andamento ou aguardando início serão canceladas.
              Execuções já concluídas permanecem como histórico.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold">Motivo *</Label>
            <textarea
              value={cancelMotivo}
              onChange={e => setCancelMotivo(e.target.value)}
              rows={3}
              placeholder="Descreva por que o processo está sendo cancelado..."
              className="w-full mt-1.5 rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button
              onClick={handleCancelar}
              disabled={canceling || !cancelMotivo.trim()}
              variant="destructive"
              className="gap-1.5"
            >
              {canceling && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancelar processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, Icon, color }: {
  label: string; value: number; Icon: typeof Workflow; color: 'violet' | 'emerald' | 'amber'
}) {
  const styles: Record<string, string> = {
    violet:  'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600',
    amber:   'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600',
  }
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${styles[color]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
        <p className="text-[10px] uppercase tracking-wide font-medium opacity-80">{label}</p>
      </div>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      <p className="text-sm mt-0.5">{value}</p>
    </div>
  )
}

function ExecucaoCard({ exec }: { exec: Execucao }) {
  const total = exec.passos.length
  const fechados = exec.passos.filter(p => p.concluido || p.ignorado).length
  const pct = total > 0 ? Math.round((fechados / total) * 100) : 0

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold">{exec.servico.nome}</span>
              <Badge variant="outline" className={`text-[10px] h-5 ${STATUS_BADGE[exec.status] || ''}`}>
                {EXEC_STATUS_LABELS[exec.status] || exec.status}
              </Badge>
              {exec.predecessorExecucaoId && (
                <Badge variant="outline" className="text-[10px] h-5 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400">
                  Sucessor
                </Badge>
              )}
              {!exec.predecessorExecucaoId && (
                <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">
                  Raiz
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{exec.responsavel?.name || 'Sem responsável'}</span>
              <span>·</span>
              <span>Iniciada em {new Date(exec.iniciadoEm).toLocaleDateString('pt-BR')}</span>
              {exec.concluidoEm && (
                <>
                  <span>·</span>
                  <span>Concluída em {new Date(exec.concluidoEm).toLocaleDateString('pt-BR')}</span>
                </>
              )}
            </div>
            {total > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="tabular-nums">{fechados}/{total} passos</span>
                  <span className="text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: MODULE_COLOR }} />
                </div>
              </div>
            )}
          </div>
          <Link
            href={`/meus-servicos?exec=${exec.id}`}
            className="shrink-0 inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 hover:underline"
          >
            Abrir checklist →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// FluxoGraph — visualização SVG do DAG de execuções
// Layout em níveis: BFS partindo das raízes (sem predecessor),
// nível = coluna, posição vertical distribuída por linha.
// ─────────────────────────────────────────────────────────────

interface ResponsavelCandidato {
  id: string
  name: string
  image: string | null
  areaName: string | null
}

function FluxoGraph({ execucoes, onChanged }: {
  execucoes: Execucao[]
  onChanged?: () => void
}) {
  // Probe de permissão (sem execId — só pra saber se renderiza hit-areas).
  // A lista real de candidatos é carregada por execução ao abrir o popover,
  // pra que o backend filtre pela área do serviço (categoria → Area.name).
  const [canAssign, setCanAssign] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(trpc.servico as any).listResponsaveisAtribuiveis.query()
      .then((r: { canAssign: boolean }) => { if (!cancelled) setCanAssign(r.canAssign) })
      .catch(() => { if (!cancelled) setCanAssign(false) })
    return () => { cancelled = true }
  }, [])

  // Bloco em edição (popover aberto). Guarda a exec + retângulo do gatilho na viewport.
  const [editing, setEditing] = useState<{
    exec: Execucao
    rect: { top: number; left: number; bottom: number; right: number }
  } | null>(null)

  if (execucoes.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">Nenhuma execução para exibir.</p>
  }

  const NODE_W = 220
  const NODE_H = 100  // 5 linhas: título, status+progresso, barra, prazo/conclusão, responsável
  const GAP_H = 80
  const GAP_V = 16
  const PAD = 16

  // Calcula nivel (depth) de cada execucao via BFS
  const byId = new Map(execucoes.map(e => [e.id, e]))
  const childrenMap = new Map<string | null, Execucao[]>()
  for (const e of execucoes) {
    const k = e.predecessorExecucaoId
    const arr = childrenMap.get(k) ?? []
    arr.push(e)
    childrenMap.set(k, arr)
  }
  const level = new Map<string, number>()
  const roots = childrenMap.get(null) ?? []
  const queue: Array<{ id: string; depth: number }> = roots.map(r => ({ id: r.id, depth: 0 }))
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (level.has(cur.id)) continue
    level.set(cur.id, cur.depth)
    const kids = childrenMap.get(cur.id) ?? []
    for (const k of kids) queue.push({ id: k.id, depth: cur.depth + 1 })
  }
  // Execucoes orfãs (sem nivel) — coloca em nivel 0 também
  for (const e of execucoes) if (!level.has(e.id)) level.set(e.id, 0)

  // Agrupa por nível
  const byLevel = new Map<number, Execucao[]>()
  for (const e of execucoes) {
    const lv = level.get(e.id) ?? 0
    const arr = byLevel.get(lv) ?? []
    arr.push(e)
    byLevel.set(lv, arr)
  }
  const maxLevel = Math.max(...Array.from(byLevel.keys()))
  const maxRows = Math.max(...Array.from(byLevel.values()).map(a => a.length))

  // Calcula posição (x, y) de cada nó
  const pos = new Map<string, { x: number; y: number }>()
  for (let lv = 0; lv <= maxLevel; lv++) {
    const arr = byLevel.get(lv) ?? []
    arr.forEach((e, idx) => {
      const x = PAD + lv * (NODE_W + GAP_H)
      const y = PAD + idx * (NODE_H + GAP_V)
      pos.set(e.id, { x, y })
    })
  }

  const svgWidth = PAD * 2 + (maxLevel + 1) * NODE_W + maxLevel * GAP_H
  const svgHeight = PAD * 2 + maxRows * NODE_H + (maxRows - 1) * GAP_V

  // Cores do bloco: combinam status + prazo.
  //  - CONCLUIDO/PULADO     → cinza (encerrados, contexto histórico)
  //  - CANCELADO            → rose (encerrado por exceção)
  //  - AGUARDANDO_INICIO    → âmbar suave (depende de ação manual)
  //  - EM_ANDAMENTO + atrasado    → vermelho
  //  - EM_ANDAMENTO + ≤3 dias     → amarelo
  //  - EM_ANDAMENTO + folgado     → verde
  type Cores = { fill: string; stroke: string; text: string }
  function corDoBloco(e: Execucao): Cores {
    if (e.status === 'CONCLUIDO') {
      return { fill: '#e5e7eb', stroke: '#9ca3af', text: '#4b5563' } // gray
    }
    if (e.status === 'PULADO') {
      return { fill: '#f3f4f6', stroke: '#d1d5db', text: '#6b7280' } // gray claro
    }
    if (e.status === 'CANCELADO') {
      return { fill: '#ffe4e6', stroke: '#f43f5e', text: '#be123c' } // rose
    }
    if (e.status === 'AGUARDANDO_INICIO') {
      return { fill: '#fef3c7', stroke: '#f59e0b', text: '#b45309' } // amber
    }
    // EM_ANDAMENTO — depende do prazo
    if (e.prazoLimite) {
      const agora = Date.now()
      const prazo = new Date(e.prazoLimite).getTime()
      const diffDias = Math.ceil((prazo - agora) / (1000 * 60 * 60 * 24))
      if (diffDias < 0) {
        return { fill: '#fee2e2', stroke: '#dc2626', text: '#991b1b' } // red atrasado
      }
      if (diffDias <= 3) {
        return { fill: '#fef3c7', stroke: '#d97706', text: '#92400e' } // yellow vencendo
      }
    }
    // sem prazo OU prazo folgado → verde "no prazo"
    return { fill: '#d1fae5', stroke: '#10b981', text: '#047857' }
  }

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="text-foreground">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>
        {/* Edges */}
        {execucoes.map(e => {
          if (!e.predecessorExecucaoId) return null
          const from = pos.get(e.predecessorExecucaoId)
          const to = pos.get(e.id)
          if (!from || !to) return null
          const x1 = from.x + NODE_W
          const y1 = from.y + NODE_H / 2
          const x2 = to.x
          const y2 = to.y + NODE_H / 2
          const dx = (x2 - x1) / 2
          const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
          return (
            <path
              key={`edge-${e.id}`}
              d={path}
              stroke="#94a3b8"
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#arrow)"
            />
          )
        })}
        {/* Nodes */}
        {execucoes.map(e => {
          const p = pos.get(e.id)
          if (!p) return null
          const { fill, stroke, text } = corDoBloco(e)
          const total = e.passos.length
          const fechados = e.passos.filter(pa => pa.concluido || pa.ignorado).length
          const pct = total > 0 ? Math.round((fechados / total) * 100) : 0
          return (
            <g key={`node-${e.id}`} transform={`translate(${p.x}, ${p.y})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                ry={8}
                fill={fill}
                stroke={stroke}
                strokeWidth="1.5"
              />
              <text
                x={12}
                y={20}
                fontSize="12"
                fontWeight="600"
                fill={text}
                style={{ pointerEvents: 'none' }}
              >
                {truncate(e.servico.nome, 26)}
              </text>
              <text
                x={12}
                y={36}
                fontSize="10"
                fill={text}
                opacity="0.75"
                style={{ pointerEvents: 'none' }}
              >
                {EXEC_STATUS_LABELS[e.status] ?? e.status}
                {total > 0 && ` · ${fechados}/${total} (${pct}%)`}
              </text>
              {/* mini-barra */}
              {total > 0 && (
                <>
                  <rect x={12} y={48} width={NODE_W - 24} height={4} rx={2} ry={2} fill="rgba(0,0,0,0.08)" />
                  <rect x={12} y={48} width={(NODE_W - 24) * (pct / 100)} height={4} rx={2} ry={2} fill={stroke} />
                </>
              )}
              {/* Linha de prazo / conclusão */}
              <PrazoNode exec={e} y={68} />
              {/* Avatar + nome do responsável */}
              <ResponsavelNode user={e.responsavel} y={86} />
              {/* hover/click: link para checklist */}
              <a href={`/meus-servicos?exec=${e.id}`}>
                <rect width={NODE_W} height={NODE_H} fill="transparent" style={{ cursor: 'pointer' }}>
                  <title>
                    {e.servico.nome} — {EXEC_STATUS_LABELS[e.status] ?? e.status}
                    {e.status === 'CONCLUIDO' && e.concluidoEm
                      ? ` · Concluído em ${new Date(e.concluidoEm).toLocaleString('pt-BR')}`
                      : e.prazoLimite ? ` · Prazo: ${new Date(e.prazoLimite).toLocaleString('pt-BR')}` : ''}
                    {e.responsavel ? ` · Responsável: ${e.responsavel.name}` : ' · Sem responsável'}
                  </title>
                </rect>
              </a>
              {/* Hit-area do responsável — desenhada APÓS o <a> pra ficar por cima
                  (SVG não tem z-index; ordem de pintura define o hit). Só renderiza
                  se o user logado pode atribuir. */}
              {canAssign && (
                <rect
                  x={6}
                  y={78}
                  width={NODE_W - 12}
                  height={20}
                  rx={4}
                  ry={4}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    const r = (ev.currentTarget as SVGRectElement).getBoundingClientRect()
                    setEditing({
                      exec: e,
                      rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
                    })
                  }}
                >
                  <title>Alterar responsável</title>
                </rect>
              )}
            </g>
          )
        })}
      </svg>
      {/* Legenda — cores combinam status + prazo */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <LegendDot color="#10b981" label="No prazo" />
        <LegendDot color="#d97706" label="Vencendo (≤3d)" />
        <LegendDot color="#dc2626" label="Atrasado" />
        <LegendDot color="#f59e0b" label="Aguardando início" />
        <LegendDot color="#9ca3af" label="Concluído" />
        <LegendDot color="#f43f5e" label="Cancelado" />
        <LegendDot color="#d1d5db" label="Pulado" />
      </div>
      {/* Popover de troca de responsável — só monta quando aberto */}
      {editing && (
        <FluxoResponsavelPopover
          exec={editing.exec}
          triggerRect={editing.rect}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null)
            onChanged?.()
          }}
        />
      )}
    </div>
  )
}

// Popover via portal pra trocar responsável de um bloco do fluxo.
// Posiciona com position:fixed relativo a triggerRect (BoundingClientRect do
// hit-area no SVG). Faz auto-flip se não couber abaixo/à direita; reposiciona
// em scroll/resize. Fecha em ESC ou clique fora.
//
// Carrega candidatos filtrados pela área da execução (categoria do serviço).
// Loading state aparece enquanto busca.
function FluxoResponsavelPopover({ exec, triggerRect, onClose, onChanged }: {
  exec: Execucao
  triggerRect: { top: number; left: number; bottom: number; right: number }
  onClose: () => void
  onChanged: () => void
}) {
  const W = 280
  const MAX_H = 360
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [query, setQuery] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<ResponsavelCandidato[]>([])
  const [areaFiltro, setAreaFiltro] = useState<{ id: string; name: string } | null>(null)
  const [loadingCands, setLoadingCands] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingCands(true)
    ;(trpc.servico as any).listResponsaveisAtribuiveis.query({ execId: exec.id })
      .then((r: { canAssign: boolean; candidates: ResponsavelCandidato[]; areaFiltro: { id: string; name: string } | null }) => {
        if (cancelled) return
        setCandidates(r.candidates || [])
        setAreaFiltro(r.areaFiltro ?? null)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          alerts.error('Erro', e.message)
          setCandidates([])
        }
      })
      .finally(() => { if (!cancelled) setLoadingCands(false) })
    return () => { cancelled = true }
  }, [exec.id])

  const recalc = useCallback(() => {
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = triggerRect.left
    if (left + W + margin > vw) left = Math.max(margin, vw - W - margin)
    let top = triggerRect.bottom + 4
    if (top + MAX_H + margin > vh) {
      const above = triggerRect.top - 4 - MAX_H
      top = above >= margin ? above : Math.max(margin, vh - MAX_H - margin)
    }
    setPos({ top, left })
  }, [triggerRect.top, triggerRect.left, triggerRect.bottom, triggerRect.right])

  useLayoutEffect(() => {
    recalc()
    function onScrollOrResize() { recalc() }
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [recalc])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? candidates.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.areaName?.toLowerCase().includes(q) ?? false))
    : candidates

  async function aplicar(novoId: string | null) {
    setSalvando(novoId ?? '__null__')
    try {
      await (trpc.servico as any).setResponsavelExecucao.mutate({ id: exec.id, responsavelId: novoId })
      onChanged()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  if (!pos || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-[60] rounded-md border bg-popover shadow-lg overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: W, maxHeight: MAX_H }}
    >
      <div className="p-1.5 border-b bg-popover flex items-center gap-1.5">
        <UserCog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold text-foreground flex-1 truncate" title={exec.servico.nome}>
          {exec.servico.nome}
        </span>
        <button type="button" onClick={onClose} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" title="Fechar">
          <X className="h-3 w-3" />
        </button>
      </div>
      {/* Badge de filtro por área — quando o serviço tem categoria que bate com Area.name */}
      {areaFiltro && (
        <div className="px-2 py-1.5 border-b bg-violet-50 dark:bg-violet-950/30 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
          <span className="text-[10px] text-violet-700 dark:text-violet-300">
            Filtrado pela área <strong>{areaFiltro.name}</strong>
          </span>
        </div>
      )}
      <div className="p-1.5 border-b bg-popover flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar pessoa ou área..."
          className="h-7 text-xs w-full bg-transparent border-0 px-1 outline-none"
        />
      </div>
      <div className="overflow-y-auto py-1" style={{ maxHeight: MAX_H - 80 }}>
        {loadingCands && (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </div>
        )}
        {!loadingCands && exec.responsavel && (
          <button
            type="button"
            disabled={salvando !== null}
            onClick={() => aplicar(null)}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 text-muted-foreground italic disabled:opacity-50"
          >
            {salvando === '__null__' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            Remover responsável
          </button>
        )}
        {!loadingCands && filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground text-center">
            {areaFiltro
              ? `Nenhuma pessoa na área ${areaFiltro.name}`
              : 'Nenhuma pessoa encontrada'}
          </p>
        ) : !loadingCands && filtered.map(c => {
          const ehAtual = c.id === (exec.responsavel?.id ?? null)
          const initials = c.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
          return (
            <button
              key={c.id}
              type="button"
              disabled={salvando !== null || ehAtual}
              onClick={() => aplicar(c.id)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 disabled:opacity-50 ${ehAtual ? 'bg-accent/50' : ''}`}
            >
              {salvando === c.id ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : c.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resolveAssetUrl(c.image)} alt={c.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
              ) : (
                <span className="h-5 w-5 rounded-full bg-[#5ea3cb] text-white text-[8px] flex items-center justify-center font-bold shrink-0">
                  {initials}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium text-foreground">{c.name}</span>
                {c.areaName && (
                  <span className="block truncate text-[10px] text-muted-foreground">{c.areaName}</span>
                )}
              </span>
              {ehAtual && <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

// Renderiza linha "prazo / conclusão" dentro de um nó SVG do FluxoGraph.
// Regras:
//  - CONCLUIDO  → "✓ Concluído em DD/MM/YY" em verde
//  - CANCELADO  → "Cancelado" em vermelho
//  - PULADO     → "Pulado" em cinza
//  - prazo passou e não concluído → "⚠ Atrasado · DD/MM" em vermelho
//  - prazo ≤ 3 dias → "⏰ Vence em Xd" em âmbar
//  - prazo > 3 dias → "📅 Vence em DD/MM" em cinza
//  - sem prazo definido → "—" em cinza claro
function PrazoNode({ exec, y }: { exec: Execucao; y: number }) {
  const x = 12
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const fmtCurto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  let icone = ''
  let texto = ''
  let cor = '#6b7280' // gray-500 default

  if (exec.status === 'CONCLUIDO' && exec.concluidoEm) {
    icone = '✓'
    texto = `Concluído em ${fmt(exec.concluidoEm)}`
    cor = '#059669' // emerald-600
  } else if (exec.status === 'CANCELADO') {
    icone = '✕'
    texto = 'Cancelado'
    cor = '#be123c' // rose-700
  } else if (exec.status === 'PULADO') {
    icone = '⤼'
    texto = 'Pulado'
    cor = '#6b7280'
  } else if (exec.prazoLimite) {
    const agora = Date.now()
    const prazo = new Date(exec.prazoLimite).getTime()
    const diffDias = Math.ceil((prazo - agora) / (1000 * 60 * 60 * 24))
    if (diffDias < 0) {
      icone = '⚠'
      texto = `Atrasado desde ${fmtCurto(exec.prazoLimite)}`
      cor = '#dc2626' // red-600
    } else if (diffDias <= 3) {
      icone = '⏰'
      texto = diffDias === 0 ? `Vence hoje (${fmtCurto(exec.prazoLimite)})` : `Vence em ${diffDias}d`
      cor = '#d97706' // amber-600
    } else {
      icone = '📅'
      texto = `Vence ${fmt(exec.prazoLimite)}`
      cor = '#6b7280'
    }
  } else {
    icone = ''
    texto = 'Sem prazo definido'
    cor = '#9ca3af' // gray-400
  }

  return (
    <g style={{ pointerEvents: 'none' }}>
      {icone && (
        <text x={x} y={y} fontSize="10" fill={cor} fontWeight="600">
          {icone}
        </text>
      )}
      <text x={icone ? x + 12 : x} y={y} fontSize="10" fill={cor} fontWeight="500">
        {truncate(texto, 30)}
      </text>
    </g>
  )
}

// Renderiza avatar (foto ou inicial em círculo) + nome do responsável dentro
// de um nó SVG do FluxoGraph. Posiciona em x=12, y dado pelo prop. Quando
// não há responsável, mostra "Sem responsável" em itálico. Imagens usam
// clipPath circular pra recorte limpo.
function ResponsavelNode({ user, y }: {
  user: { id: string; name: string; image: string | null } | null
  y: number
}) {
  const cx = 19  // x=12 + raio=7
  const cy = y - 1
  const r = 7
  const textX = 32
  const textY = y + 4

  if (!user) {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <circle cx={cx} cy={cy} r={r} fill="#e5e7eb" stroke="rgba(0,0,0,0.08)" strokeWidth="0.5" />
        <text x={cx} y={cy + 3} fontSize="8" fontWeight="700" fill="#9ca3af" textAnchor="middle">?</text>
        <text x={textX} y={textY} fontSize="10" fill="#9ca3af" fontStyle="italic">Sem responsável</text>
      </g>
    )
  }

  const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const clipId = `clip-resp-${user.id}`

  return (
    <g style={{ pointerEvents: 'none' }}>
      {user.image ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={r} />
            </clipPath>
          </defs>
          <image
            href={user.image}
            x={cx - r}
            y={cy - r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
        </>
      ) : (
        <>
          <circle cx={cx} cy={cy} r={r} fill="#5ea3cb" />
          <text
            x={cx}
            y={cy + 3}
            fontSize="7.5"
            fontWeight="700"
            fill="#fff"
            textAnchor="middle"
          >
            {initials}
          </text>
        </>
      )}
      <text x={textX} y={textY} fontSize="10" fill="#374151" fontWeight="500">
        {truncate(user.name, 22)}
      </text>
    </g>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
