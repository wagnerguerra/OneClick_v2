'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, CheckCircle2, XCircle, Pause, Play, X, Check, Lock, ChevronDown, SkipForward, ListChecks,
} from 'lucide-react'
import {
  Button, Input, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import { PassoExtras } from './passo-extras'
import { EmailsConfirmacaoModal, type EmailPendente } from './emails-confirmacao-modal'
import { CamposClienteCapturaModal } from './campos-cliente-captura-modal'

interface PassoExec {
  id: string
  passoId: string
  passoNome: string
  etapaNome: string
  ordem: number
  obrigatorio: boolean
  permiteIgnorar: boolean
  concluido: boolean
  concluidoPor: string | null
  concluidoPorUsuario?: { id: string; name: string; image: string | null } | null
  concluidoEm: string | null
  ignorado: boolean
  ignoradoPor: string | null
  ignoradoPorUsuario?: { id: string; name: string; image: string | null } | null
  ignoradoEm: string | null
  ignoradoMotivo: string | null
  observacao: string | null
}

interface ExecucaoData {
  id: string
  status: string
  iniciadoEm: string
  prazoLimite: string | null
  pausado: boolean
  pausadoMotivo: string | null
  servico: { id: string; nome: string } | null
  cliente: { id: string; razaoSocial: string } | null
  passos: PassoExec[]
}

const STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  EM_ANDAMENTO: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  CONCLUIDO:    { bg: 'bg-emerald-600 dark:bg-emerald-700',   text: 'text-white',                            border: 'border-emerald-600 dark:border-emerald-700' },
  CANCELADO:    { bg: 'bg-red-50 dark:bg-red-900/20',         text: 'text-red-700 dark:text-red-400',        border: 'border-red-200 dark:border-red-800' },
}

/**
 * Modal de execução de checklist (etapas + passos) — usado em /servicos
 * e /meus-servicos. Carrega via getExecucao(id), permite togglePasso, observar,
 * pausar, retomar, concluir e cancelar. Comentários e anexos via PassoExtras.
 *
 * @param accentColor cor do módulo dono da página (ex: '#10b981' Cadastros, '#38bdf8' Administrativo)
 * @param onChange    callback após qualquer mutação — parent usa pra recarregar lista
 */
export function ExecucaoChecklistModal({ open, onOpenChange, execucaoId, accentColor = '#10b981', onChange }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  execucaoId: string | null
  accentColor?: string
  onChange?: () => void
}) {
  const [execucao, setExecucao] = useState<ExecucaoData | null>(null)
  const [loading, setLoading] = useState(false)
  const [pausarOpen, setPausarOpen] = useState(false)
  const [pausarMotivo, setPausarMotivo] = useState('')
  // E-mails pendentes de confirmação após togglePasso — quando o passo concluído
  // tem templates com exigirConfirmacao=true, o backend retorna a lista renderizada
  // e abrimos o modal pra o usuário revisar antes de enviar.
  const [emailsConfirmacao, setEmailsConfirmacao] = useState<{ execPassoId: string; emails: EmailPendente[] } | null>(null)
  // Modal de captura de campos do cliente vinculados ao passo. Quando o passo
  // tem ao menos 1 campo vinculado, ao concluir o togglePasso é precedido por
  // esse modal. O usuário preenche os valores → submit → togglePasso com valoresCampos.
  const [capturaCampos, setCapturaCampos] = useState<{ execPassoId: string } | null>(null)
  // Etapas expandidas (chave = etapaNome). Set vazio = todas recolhidas.
  // Auto-abertura: calculada após carregar a execução (etapa ativa).
  const [etapasAbertas, setEtapasAbertas] = useState<Set<string>>(new Set())
  // Marca de "primeira inicialização" — pra não sobrescrever toggle manual do user
  // toda vez que o reload silencioso atualizar a execução.
  const initRef = useState({ done: false })[0]

  function toggleEtapa(etapaNome: string) {
    // Modo accordion: apenas uma etapa expandida por vez. Clicar na atual fecha-a;
    // clicar em outra fecha a anterior e abre a clicada.
    setEtapasAbertas(prev => {
      if (prev.has(etapaNome)) return new Set()
      return new Set([etapaNome])
    })
  }

  // Passos individuais expandidos (chave = passo.id). Todos começam recolhidos.
  // Quando aberto, exibe a linha de observação + botões (Comentar/Anexar/Concluir).
  const [passosAbertos, setPassosAbertos] = useState<Set<string>>(new Set())
  function togglePassoExpand(passoId: string) {
    setPassosAbertos(prev => {
      const next = new Set(prev)
      if (next.has(passoId)) next.delete(passoId)
      else next.add(passoId)
      return next
    })
  }

  // Carrega com flag de loading — usado apenas na ABERTURA do modal.
  const carregar = useCallback(async () => {
    if (!execucaoId) return
    setLoading(true)
    try {
      const data = await (trpc.servico as any).getExecucao.query({ id: execucaoId })
      setExecucao(data)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      onOpenChange(false)
    } finally { setLoading(false) }
  }, [execucaoId, onOpenChange])

  // Recarrega sem flag de loading — atualiza dados em background após mutações
  // (toggle passo, pausar, retomar). Evita o "piscar" do modal.
  const recarregarSilencioso = useCallback(async () => {
    if (!execucaoId) return
    try {
      const data = await (trpc.servico as any).getExecucao.query({ id: execucaoId })
      setExecucao(data)
    } catch { /* mantém estado anterior */ }
  }, [execucaoId])

  useEffect(() => {
    if (open && execucaoId) carregar()
    else if (!open) {
      setExecucao(null)
      setEtapasAbertas(new Set())
      setPassosAbertos(new Set())
      initRef.done = false
    }
  }, [open, execucaoId, carregar, initRef])

  // Auto-abre a etapa ATIVA na primeira carga: aquela onde está o primeiro passo
  // não concluído (na ordem global). Se tudo concluído, abre a última.
  // Não roda nas atualizações subsequentes (preservar toggle manual do user).
  useEffect(() => {
    if (!execucao || initRef.done) return
    const ordenados = [...execucao.passos].sort((a, b) => a.ordem - b.ordem)
    const proximoPendente = ordenados.find(p => !p.concluido)
    const etapaAtiva = proximoPendente?.etapaNome ?? ordenados[ordenados.length - 1]?.etapaNome
    if (etapaAtiva) {
      setEtapasAbertas(new Set([etapaAtiva]))
    } else if (ordenados[0]) {
      // fallback: primeira etapa
      setEtapasAbertas(new Set([ordenados[0].etapaNome]))
    }
    initRef.done = true
  }, [execucao, initRef])

  /**
   * Aplica togglePasso de fato — opcionalmente com valoresCampos capturados
   * pelo modal de campos do cliente. Centralizado pra reuso entre o caminho
   * direto (sem campos vinculados) e o caminho via modal de captura.
   */
  async function aplicarToggle(passoId: string, valoresCampos?: Record<string, unknown>, camposRevisados?: string[]) {
    setExecucao(prev => prev ? {
      ...prev,
      passos: prev.passos.map(p => p.id === passoId ? { ...p, concluido: !p.concluido } : p),
    } : prev)
    try {
      const result = await (trpc.servico as any).togglePasso.mutate({ id: passoId, valoresCampos, camposRevisados }) as
        { emailsPendentesConfirmacao?: EmailPendente[] } | undefined
      if (result?.emailsPendentesConfirmacao && result.emailsPendentesConfirmacao.length > 0) {
        setEmailsConfirmacao({ execPassoId: passoId, emails: result.emailsPendentesConfirmacao })
      }
      recarregarSilencioso()
      onChange?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      recarregarSilencioso()
    }
  }

  async function handleToggle(passoId: string) {
    // Antes de concluir, descobre se há campos do cliente vinculados a este passo.
    // O preview retorna 0 campos quando o passo é REABERTURA (concluido→não) ou
    // simplesmente não tem vínculos — nesses casos vai direto pro togglePasso.
    const passo = execucao?.passos.find(p => p.id === passoId)
    const indoConcluir = passo && !passo.concluido
    if (indoConcluir) {
      try {
        const preview = await (trpc.servico as any).previewCamposClienteDoPasso.query({ execPassoId: passoId }) as
          { campos: Array<{ id: string }> }
        if (preview.campos.length > 0) {
          // Tem campos vinculados → abre modal de captura. togglePasso só roda após o submit.
          setCapturaCampos({ execPassoId: passoId })
          return
        }
      } catch {
        // Falha no preview não bloqueia — segue com togglePasso normal.
      }
    }
    await aplicarToggle(passoId)
  }

  async function handleObs(passoId: string, obs: string) {
    try { await (trpc.servico as any).updatePassoObs.mutate({ id: passoId, observacao: obs }) }
    catch { /* silent */ }
  }

  async function handleIgnorar(passoId: string) {
    // Pede motivo opcional. alerts.input retorna null se cancelou.
    const motivo = await alerts.input({
      title: 'Ignorar passo',
      text: 'Informe um motivo (opcional) para ignorar este passo.',
      inputLabel: 'Motivo',
      inputPlaceholder: 'Ex: cliente forneceu documento por outro canal',
      confirmText: 'Ignorar passo',
      icon: 'question',
      inputType: 'textarea',
    })
    if (motivo === null) return // cancelado
    // Update otimista
    setExecucao(prev => prev ? {
      ...prev,
      passos: prev.passos.map(p => p.id === passoId ? { ...p, ignorado: true } : p),
    } : prev)
    try {
      await (trpc.servico as any).ignorarPasso.mutate({ id: passoId, motivo: motivo || null })
      recarregarSilencioso()
      onChange?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      recarregarSilencioso()
    }
  }

  async function handleDesfazerIgnorar(passoId: string) {
    // Update otimista
    setExecucao(prev => prev ? {
      ...prev,
      passos: prev.passos.map(p => p.id === passoId ? { ...p, ignorado: false } : p),
    } : prev)
    try {
      await (trpc.servico as any).desfazerIgnorarPasso.mutate({ id: passoId })
      recarregarSilencioso()
      onChange?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      recarregarSilencioso()
    }
  }

  async function handleConcluir() {
    if (!execucao) return
    const ok = await alerts.confirm({ title: 'Concluir execução', text: 'Deseja marcar esta execução como concluída?', icon: 'question' })
    if (!ok) return
    try {
      await (trpc.servico as any).concluirExecucao.mutate({ id: execucao.id })
      await alerts.success('Concluída', 'Execução concluída com sucesso.')
      onOpenChange(false)
      onChange?.()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleCancelar() {
    if (!execucao) return
    // Antes de pedir confirmação, busca o impacto pra o usuário entender as
    // consequências (orçamento + card CRM afetados, se houver).
    let impacto: { orcamento: { numero: number } | null; oportunidade: { titulo: string } | null } | null = null
    try {
      impacto = await (trpc.servico as any).getCancelamentoImpacto.query({ id: execucao.id })
    } catch { /* sem bloquear o cancelar — segue sem impacto */ }
    let texto = 'Deseja cancelar esta execução?'
    if (impacto?.orcamento) {
      texto += `\n\nEsta execução foi originada pelo orçamento #${impacto.orcamento.numero}.`
      if (impacto.oportunidade) {
        texto += `\nO orçamento foi criado pelo card de CRM "${impacto.oportunidade.titulo}".`
      }
      texto += '\n\nCancelar a execução não desfaz o orçamento nem o card do CRM, mas eles ficam visivelmente sem serviço ativo. Confirmar?'
    }
    const ok = await alerts.confirm({ title: 'Cancelar execução', text: texto, icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.servico as any).cancelarExecucao.mutate({ id: execucao.id })
      await alerts.success('Cancelada', 'Execução cancelada.')
      onOpenChange(false)
      onChange?.()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handlePausar() {
    if (!execucao || !pausarMotivo.trim()) {
      alerts.warning('Atenção', 'Informe o motivo da pausa')
      return
    }
    try {
      await (trpc.servico as any).pausarExecucao.mutate({ id: execucao.id, motivo: pausarMotivo.trim() })
      setPausarOpen(false); setPausarMotivo('')
      recarregarSilencioso()
      onChange?.()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRetomar() {
    if (!execucao) return
    try {
      await (trpc.servico as any).retomarExecucao.mutate({ id: execucao.id })
      recarregarSilencioso()
      onChange?.()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Agrupa passos por etapaNome (snapshot)
  const etapas = (execucao?.passos || []).reduce<Record<string, PassoExec[]>>((acc, p) => {
    const key = p.etapaNome || 'Etapa'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})
  const totalPassos = execucao?.passos?.length ?? 0
  const concluidos = execucao?.passos?.filter(p => p.concluido).length ?? 0
  const progressPct = totalPassos > 0 ? Math.round((concluidos / totalPassos) * 100) : 0
  // Concluir só fica disponível quando todos os passos obrigatórios estão fechados.
  // Passos opcionais não bloqueiam — ficam pendentes mesmo após conclusão da execução.
  // Para fins de "podeConcluir" e bloqueio, passos IGNORADOS contam como fechados —
  // eles desbloqueiam os próximos sem precisar serem concluídos.
  const passosObrigatoriosPendentes = execucao?.passos?.filter(p => p.obrigatorio && !p.concluido && !p.ignorado).length ?? 0
  const podeConcluir = totalPassos > 0 && passosObrigatoriosPendentes === 0

  // Calcula quais passos estão bloqueados por obrigatório anterior ainda em aberto.
  // "Em aberto" = não concluído E não ignorado.
  const passosOrdenados = [...(execucao?.passos ?? [])].sort((a, b) => a.ordem - b.ordem)
  const bloqueados = new Set<string>()
  let temObrigPendente = false
  for (const p of passosOrdenados) {
    if (temObrigPendente) bloqueados.add(p.id)
    if (p.obrigatorio && !p.concluido && !p.ignorado) temObrigPendente = true
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[920px] max-h-[88vh] overflow-y-auto">
          {loading || !execucao ? (
            <>
              <DialogHeaderIcon icon={Loader2} srOnly>
                <DialogTitle>Carregando checklist</DialogTitle>
              </DialogHeaderIcon>
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando checklist...
              </div>
            </>
          ) : (
            <>
              <DialogHeaderIcon icon={ListChecks} color="violet">
                <DialogTitle className="flex items-center gap-3">
                  <span>{execucao.servico?.nome || 'Serviço'}</span>
                  <StatusBadge status={execucao.status} />
                </DialogTitle>
                <DialogDescription>
                  {execucao.cliente?.razaoSocial || 'Sem cliente'} — Iniciado em {formatDate(execucao.iniciadoEm)}
                </DialogDescription>
              </DialogHeaderIcon>
              <DialogBody className="space-y-4">
                {execucao.pausado && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 p-3 flex items-start gap-2.5">
                    <Pause className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Execução pausada</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">{execucao.pausadoMotivo || '—'}</p>
                    </div>
                    <Button size="xs" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100" onClick={handleRetomar}>
                      <Play className="h-3 w-3 mr-1" /> Retomar
                    </Button>
                  </div>
                )}

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-semibold" style={{ color: accentColor }}>{progressPct}% ({concluidos}/{totalPassos})</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: accentColor }} />
                  </div>
                </div>

                {/* === Timeline vertical com etapas e passos ===
                    Estrutura: container relativo com linha vertical absoluta;
                    nós (bolinhas) e cabeçalhos de etapa posicionados sobre a linha.
                    Estados: concluído (preenchido), pendente (anel), bloqueado (cinza+lock). */}
                <div className="relative timeline-checklist">
                  {/* Linha vertical conectora (atrás dos nós).
                      Alinhada com o CENTRO horizontal dos nós: nó tem 31px (w-[31px]),
                      centro = 15.5px → left-[15px] (linha de 1px fica entre 15-16px). */}
                  <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border" aria-hidden />

                  {Object.entries(etapas).map(([etapaNome, passos]) => {
                    const etapaConcluidos = passos.filter(p => p.concluido).length
                    const etapaIgnorados = passos.filter(p => p.ignorado).length
                    const etapaFechados = etapaConcluidos + etapaIgnorados
                    const etapaTotal = passos.length
                    const todosConcluidos = etapaTotal > 0 && etapaConcluidos === etapaTotal
                    const todosFechados = etapaTotal > 0 && etapaFechados === etapaTotal
                    // "Em andamento" = pelo menos um fechado, mas não todos
                    const emAndamento = etapaFechados > 0 && etapaFechados < etapaTotal
                    // Progresso 0–1 pra desenhar o anel parcial em etapas em andamento
                    const progressoEtapa = etapaTotal > 0 ? etapaFechados / etapaTotal : 0
                    const aberta = etapasAbertas.has(etapaNome)
                    return (
                    <Collapsible
                      key={etapaNome}
                      open={aberta}
                      onOpenChange={() => toggleEtapa(etapaNome)}
                      className={cn(
                        'mb-4 last:mb-0 transition-opacity duration-200',
                        // Quando alguma etapa está aberta, fade nas demais para destacar a expandida.
                        // Sem nenhuma aberta, todas ficam com opacidade normal (sem foco específico).
                        etapasAbertas.size > 0 && !aberta && 'opacity-40 hover:opacity-70',
                      )}
                    >
                      {/* Cabeçalho da etapa — clicável, alterna expand/collapse com animação */}
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="relative flex items-center gap-3 mb-3 w-full text-left group cursor-pointer"
                        >
                          {/* Bolinha da etapa — estado visual:
                              - Concluída (todos os passos concluídos): verde sólido com check
                              - Concluída-com-ignorados (todos fechados, mas alguns foram ignorados): amber sólido com check
                              - Em andamento (alguns fechados): accent sólido + anel SVG mostrando o % concluído
                              - Pendente (nenhum fechado): accent sólido com bolinha branca */}
                          <div className="relative z-10 shrink-0">
                            {emAndamento ? (
                              // Anel de progresso SVG com fill central da cor accent
                              <div className="relative h-[31px] w-[31px]">
                                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
                                  {/* Anel de fundo (cinza claro) */}
                                  <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                                  {/* Anel preenchido — strokeDasharray = 2π·r ≈ 94.25 */}
                                  <circle
                                    cx="18"
                                    cy="18"
                                    r="15"
                                    fill="none"
                                    stroke={accentColor}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeDasharray={94.25}
                                    strokeDashoffset={94.25 * (1 - progressoEtapa)}
                                  />
                                </svg>
                                <div
                                  className="absolute inset-[5px] rounded-full border-2 border-background bg-card flex items-center justify-center"
                                >
                                  <span
                                    className="text-[9px] font-bold tabular-nums leading-none"
                                    style={{ color: accentColor }}
                                  >
                                    {Math.round(progressoEtapa * 100)}%
                                  </span>
                                </div>
                              </div>
                            ) : todosConcluidos ? (
                              <div className="h-[31px] w-[31px] rounded-full border-2 border-background bg-emerald-500 flex items-center justify-center shadow-sm">
                                <CheckCircle2 className="h-4 w-4 text-white" />
                              </div>
                            ) : todosFechados ? (
                              // Todos fechados, mas com ignorados no meio — amber + check
                              <div
                                className="h-[31px] w-[31px] rounded-full border-2 border-background flex items-center justify-center shadow-sm"
                                style={{ backgroundColor: '#f59e0b' }}
                                title={`Etapa concluída — ${etapaIgnorados} passo${etapaIgnorados > 1 ? 's' : ''} ignorado${etapaIgnorados > 1 ? 's' : ''}`}
                              >
                                <Check className="h-4 w-4 text-white" />
                              </div>
                            ) : (
                              // Pendente — nenhum passo fechado ainda
                              <div
                                className="h-[31px] w-[31px] rounded-full border-2 border-background flex items-center justify-center shadow-sm"
                                style={{ backgroundColor: accentColor }}
                              >
                                <div className="h-2 w-2 rounded-full bg-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h5
                                className={cn(
                                  'text-sm font-bold uppercase tracking-wide leading-none',
                                  todosFechados && !todosConcluidos
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : todosConcluidos
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-foreground',
                                )}
                              >
                                {etapaNome}
                              </h5>
                              {todosConcluidos && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  <CheckCircle2 className="h-2.5 w-2.5" /> Concluída
                                </span>
                              )}
                              {todosFechados && !todosConcluidos && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0 text-[9px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                  <SkipForward className="h-2.5 w-2.5" /> Concluída · {etapaIgnorados} ignorado{etapaIgnorados > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {etapaConcluidos} de {etapaTotal} passo{etapaTotal !== 1 ? 's' : ''} concluído{etapaConcluidos !== 1 ? 's' : ''}
                              {etapaIgnorados > 0 && ` · ${etapaIgnorados} ignorado${etapaIgnorados > 1 ? 's' : ''}`}
                            </p>
                          </div>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                              !aberta && '-rotate-90',
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>

                      {/* Passos da etapa — animação slide via classe sidebar-accordion */}
                      <CollapsibleContent className="sidebar-accordion overflow-hidden">
                      <div className="space-y-3 ml-0">
                        {passos.sort((a, b) => a.ordem - b.ordem).map(passo => {
                          // Passo "fechado" (concluído OU ignorado) não está bloqueado e não conta como ativo.
                          const fechado = passo.concluido || passo.ignorado
                          const bloqueado = bloqueados.has(passo.id) && !fechado
                          const editavelPasso = execucao.status === 'EM_ANDAMENTO' && !bloqueado
                          // "Ativo" = passo pendente que pode ser concluído agora.
                          const ativo = !fechado && !bloqueado && editavelPasso
                          return (
                            <div key={passo.id} className="relative flex items-start gap-3">
                              {/* Node do passo — clicável quando editável */}
                              <button
                                type="button"
                                onClick={() => editavelPasso && handleToggle(passo.id)}
                                disabled={!editavelPasso || passo.ignorado}
                                title={
                                  passo.ignorado
                                    ? `Passo ignorado${passo.ignoradoMotivo ? ` — ${passo.ignoradoMotivo}` : ''}`
                                    : bloqueado
                                      ? `Conclua os passos obrigatórios anteriores primeiro${passo.obrigatorio ? ' (este passo é obrigatório)' : ''}`
                                      : passo.concluido
                                        ? 'Clique para reabrir'
                                        : `Clique para concluir${passo.obrigatorio ? ' · Passo obrigatório' : ''}`
                                }
                                className={cn(
                                  'relative z-10 h-[31px] w-[31px] rounded-full border-2 border-background flex items-center justify-center shrink-0 transition-all',
                                  passo.concluido
                                    ? 'bg-emerald-500 hover:bg-emerald-600 cursor-pointer'
                                    : passo.ignorado
                                      ? 'bg-amber-400 dark:bg-amber-500 cursor-default'
                                      : bloqueado
                                        ? 'bg-muted cursor-not-allowed'
                                        : ativo
                                          ? 'bg-card border-2 cursor-pointer hover:scale-105'
                                          : 'bg-card cursor-not-allowed opacity-60',
                                )}
                                style={!fechado && !bloqueado && editavelPasso ? { borderColor: accentColor } : undefined}
                              >
                                {passo.concluido ? (
                                  <CheckCircle2 className="h-4 w-4 text-white" />
                                ) : passo.ignorado ? (
                                  <SkipForward className="h-3.5 w-3.5 text-white fill-white" />
                                ) : bloqueado ? (
                                  <Lock className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
                                )}
                                {/* Indicador de obrigatoriedade — só pra passos ainda em aberto (não concluídos nem ignorados) */}
                                {passo.obrigatorio && !fechado && (
                                  <span
                                    className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-rose-500 border-2 border-background flex items-center justify-center text-[7px] font-bold text-white leading-none"
                                    title="Passo obrigatório"
                                    aria-label="Obrigatório"
                                  >
                                    *
                                  </span>
                                )}
                              </button>

                              {/* Conteúdo à direita do node */}
                              <Collapsible
                                open={passosAbertos.has(passo.id)}
                                onOpenChange={() => togglePassoExpand(passo.id)}
                                className={cn(
                                  'flex-1 min-w-0 rounded-md border transition-all',
                                  passo.concluido
                                    ? 'bg-emerald-50/40 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'
                                    : bloqueado
                                      ? 'bg-muted/30 border-muted opacity-70'
                                      : ativo
                                        ? 'bg-card ring-1'
                                        : 'bg-card',
                                )}
                                style={ativo ? { ['--tw-ring-color' as any]: `color-mix(in srgb, ${accentColor} 25%, transparent)` } : undefined}
                              >
                                {/* Cabeçalho do passo: nome + badges + chevron — sempre visível */}
                                <CollapsibleTrigger asChild>
                                  <button type="button" className="w-full text-left px-2.5 py-2 flex items-center gap-2 cursor-pointer">
                                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                      <span className={cn('text-sm font-medium', passo.concluido && 'line-through text-muted-foreground', passo.ignorado && 'italic text-muted-foreground')}>
                                        {passo.passoNome}
                                      </span>
                                      {!passo.obrigatorio && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                                          <Check className="h-2.5 w-2.5" /> Opcional
                                        </span>
                                      )}
                                      {bloqueado && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground" title="Aguardando conclusão de passos obrigatórios anteriores">
                                          <Lock className="h-2.5 w-2.5" /> Bloqueado
                                        </span>
                                      )}
                                      {/* Indicadores de comentário/anexo só aparecem aqui se contagem > 0 — pra não esconder info útil quando recolhido */}
                                    </div>
                                    {passo.concluido && (passo.concluidoPorUsuario || passo.concluidoPor) && (
                                      <span
                                        className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0"
                                        title={`Concluído por ${passo.concluidoPorUsuario?.name ?? 'usuário'}${passo.concluidoEm ? ` em ${formatDate(passo.concluidoEm)}` : ''}`}
                                      >
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        {passo.concluidoPorUsuario?.image ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={resolveAssetUrl(passo.concluidoPorUsuario.image)}
                                            alt={passo.concluidoPorUsuario.name}
                                            className="h-4 w-4 rounded-full object-cover border border-background"
                                          />
                                        ) : passo.concluidoPorUsuario?.name ? (
                                          <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[7px] font-bold text-muted-foreground border border-background">
                                            {passo.concluidoPorUsuario.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                          </span>
                                        ) : null}
                                        <span className="font-medium text-foreground/80">
                                          {passo.concluidoPorUsuario?.name ?? '—'}
                                        </span>
                                        {passo.concluidoEm && <span>· {formatDate(passo.concluidoEm)}</span>}
                                      </span>
                                    )}
                                    {passo.ignorado && (
                                      <span
                                        className="hidden sm:inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 shrink-0"
                                        title={`Ignorado por ${passo.ignoradoPorUsuario?.name ?? 'usuário'}${passo.ignoradoEm ? ` em ${formatDate(passo.ignoradoEm)}` : ''}${passo.ignoradoMotivo ? ` — ${passo.ignoradoMotivo}` : ''}`}
                                      >
                                        <SkipForward className="h-3 w-3" />
                                        {passo.ignoradoPorUsuario?.image ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={resolveAssetUrl(passo.ignoradoPorUsuario.image)}
                                            alt={passo.ignoradoPorUsuario.name}
                                            className="h-4 w-4 rounded-full object-cover border border-background"
                                          />
                                        ) : passo.ignoradoPorUsuario?.name ? (
                                          <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[7px] font-bold text-muted-foreground border border-background">
                                            {passo.ignoradoPorUsuario.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                          </span>
                                        ) : null}
                                        <span className="font-medium">Ignorado</span>
                                        {passo.ignoradoEm && <span className="text-muted-foreground">· {formatDate(passo.ignoradoEm)}</span>}
                                      </span>
                                    )}
                                    <ChevronDown
                                      className={cn(
                                        'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200',
                                        !passosAbertos.has(passo.id) && '-rotate-90',
                                      )}
                                    />
                                  </button>
                                </CollapsibleTrigger>

                                {/* Conteúdo expandível: observação + extras */}
                                <CollapsibleContent className="sidebar-accordion overflow-hidden">
                                  <div className="px-2.5 pb-2.5 space-y-0">
                                {execucao.status === 'EM_ANDAMENTO' && !bloqueado && (
                                  <Input
                                    placeholder="Observação..."
                                    defaultValue={passo.observacao || ''}
                                    onBlur={e => handleObs(passo.id, e.target.value)}
                                    className="h-7 text-xs"
                                  />
                                )}
                                <PassoExtras
                                  passoId={passo.id}
                                  editavel={editavelPasso && !execucao.pausado}
                                  rightSlot={
                                    execucao.status === 'EM_ANDAMENTO' && !execucao.pausado ? (
                                      passo.concluido ? (
                                        <button
                                          type="button"
                                          onClick={() => handleToggle(passo.id)}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                          title="Reabrir este passo"
                                        >
                                          <XCircle className="h-3 w-3" /> Reabrir
                                        </button>
                                      ) : passo.ignorado ? (
                                        <button
                                          type="button"
                                          onClick={() => handleDesfazerIgnorar(passo.id)}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                          title="Reverter — passo volta a pendente"
                                        >
                                          <XCircle className="h-3 w-3" /> Desfazer ignorar
                                        </button>
                                      ) : !bloqueado ? (
                                        <div className="flex items-center gap-0.5">
                                          {/* Ação "Ignorar" removida intencionalmente — pra pular
                                              um passo, o gestor desmarca a obrigatoriedade no
                                              template do serviço. O backend `ignorarPasso` segue
                                              disponível pra dar suporte aos passos já ignorados
                                              em execuções antigas (botão "Desfazer ignorar"). */}
                                          <button
                                            type="button"
                                            onClick={() => handleToggle(passo.id)}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors font-medium"
                                            title="Marcar este passo como concluído"
                                          >
                                            <CheckCircle2 className="h-3 w-3" /> Concluir
                                          </button>
                                        </div>
                                      ) : null
                                    ) : null
                                  }
                                />
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          )
                        })}
                      </div>
                      </CollapsibleContent>
                    </Collapsible>
                    )
                  })}
                </div>

                {totalPassos === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhum passo encontrado nesta execução.</p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5 mr-auto">
                  <X className="h-4 w-4" /> Fechar
                </Button>
                {execucao.status === 'EM_ANDAMENTO' && (
                  <>
                    {!execucao.pausado && (
                      <Button variant="outline" size="sm" onClick={() => setPausarOpen(true)} className="gap-1.5">
                        <Pause className="h-4 w-4" /> Pausar
                      </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={handleCancelar} className="gap-1.5">
                      <XCircle className="h-4 w-4" /> Cancelar
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={handleConcluir}
                      className="gap-1.5"
                      disabled={!podeConcluir}
                      title={
                        !podeConcluir
                          ? `Conclua os ${passosObrigatoriosPendentes} passo${passosObrigatoriosPendentes > 1 ? 's' : ''} obrigatório${passosObrigatoriosPendentes > 1 ? 's' : ''} pendente${passosObrigatoriosPendentes > 1 ? 's' : ''} antes de finalizar a execução`
                          : 'Marcar execução como concluída'
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" /> Concluir
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Pausar — coleta motivo */}
      <Dialog open={pausarOpen} onOpenChange={(o) => { if (!o) { setPausarOpen(false); setPausarMotivo('') } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeaderIcon icon={Pause} color="amber">
            <DialogTitle className="text-[15px]">Pausar execução</DialogTitle>
            <DialogDescription className="text-[11px]">
              O SLA não corre durante a pausa — ao retomar, o prazo é estendido pelo tempo pausado.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <label className="text-[13px] font-semibold mb-1.5 block">Motivo da pausa <span className="text-rose-500">*</span></label>
            <textarea
              value={pausarMotivo}
              onChange={e => setPausarMotivo(e.target.value)}
              rows={3}
              placeholder="Ex: aguardando documentação do cliente..."
              autoFocus
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setPausarOpen(false); setPausarMotivo('') }} className="gap-1.5 mr-auto">
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handlePausar}
              disabled={!pausarMotivo.trim()}
              className="gap-1.5 text-white bg-amber-500 hover:bg-amber-600"
            >
              <Pause className="h-4 w-4" /> Pausar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de envio de e-mails — abre quando togglePasso
          devolve templates com exigirConfirmacao=true. */}
      <EmailsConfirmacaoModal
        open={!!emailsConfirmacao}
        execPassoId={emailsConfirmacao?.execPassoId ?? null}
        emails={emailsConfirmacao?.emails ?? []}
        onClose={() => setEmailsConfirmacao(null)}
      />

      {/* Modal de captura de campos do cliente — abre antes do togglePasso
          quando o passo tem ao menos 1 campo vinculado. Submit dispara o
          togglePasso real com valoresCampos. */}
      {capturaCampos && (
        <CamposClienteCapturaModal
          execPassoId={capturaCampos.execPassoId}
          onConfirmar={async (valores, revisados) => {
            const id = capturaCampos.execPassoId
            setCapturaCampos(null)
            await aplicarToggle(id, valores, revisados)
          }}
          onCancelar={() => setCapturaCampos(null)}
        />
      )}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.EM_ANDAMENTO!
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold', c.bg, c.text, c.border)}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}
