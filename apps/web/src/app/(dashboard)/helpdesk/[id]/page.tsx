'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  Headphones, Loader2, ArrowLeft, MessageSquare, Lock, Send, Paperclip, Clock,
  AlertTriangle, CheckCircle2, XCircle, History, Layers, FileText, UserCog,
  Eye, Star, Save, Tag, Building2, Download, ExternalLink, Image as ImageIcon,
  FileVideo, FileAudio, File as FileIcon, FileSpreadsheet,
  MoreVertical, Pencil, Trash2, Bot, ThumbsUp, ThumbsDown,
  Terminal, Copy, Zap, FileCheck,
} from 'lucide-react'
import {
  Button, Card, CardContent, Badge, Label, cn, RichEditor, Input,
  Tabs, TabsTrigger, TabsContent, SlidingTabsList,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { MarkdownView } from '@/components/ui/markdown-view'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { useSession } from '@/lib/auth-client'
import { linkifyHelpdesk } from '../_components/linkify'
import { AnexosDropzone, type AnexoStaged } from '../_components/anexos-dropzone'
import {
  HELPDESK_STATUS, HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE, HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_PRIORIDADE_COLORS, HELPDESK_TIPO_LABELS,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

interface Mensagem {
  id: string
  conteudo: string
  interna: boolean
  createdAt: string
  editadoEm?: string | null
  autor: { id: string; name: string; image: string | null } | null
}

interface Evento {
  id: string
  tipo: string
  descricao: string
  createdAt: string
  autor: { id: string; name: string; image: string | null } | null
}

interface Anexo {
  id: string
  fileName: string
  fileUrl: string
  mimeType: string | null
  tamanho: number
  createdAt: string
  autor: { id: string; name: string } | null
}

interface AiPlanoMeta {
  arquivosEnvolvidos?: string[]
  riscos?: string
  tempoEstimado?: string
  raciocinio?: string
}

interface Ticket {
  id: string
  numero: number
  titulo: string
  descricao: string
  status: HelpdeskStatus
  prioridade: HelpdeskPrioridade
  tipo: 'INCIDENTE' | 'REQUISICAO' | 'DUVIDA' | 'MELHORIA'
  prazoSla: string | null
  resolvidoEm: string | null
  concluidoEm: string | null
  csatNota: number | null
  csatRespondidoEm: string | null
  tags: string[]
  createdAt: string
  solicitante: { id: string; name: string; email: string | null; image: string | null } | null
  responsavel: { id: string; name: string; email: string | null; image: string | null } | null
  categoria: { id: string; nome: string; cor: string | null; parent: { id: string; nome: string } | null } | null
  area: { id: string; name: string } | null
  watchers: Array<{ id: string; user: { id: string; name: string; image: string | null } }>
  mensagens: Mensagem[]
  anexos: Anexo[]
  eventos: Evento[]
  // Triagem IA (#HLP0083)
  aiScore?: number | null
  aiElegivel?: boolean | null
  aiPlano?: string | null
  aiPlanoMeta?: AiPlanoMeta | null
  aiPlanoStatus?: 'pendente' | 'aprovado' | 'rejeitado' | null
  aiPlanoAprovadoEm?: string | null
  aiPlanoMotivoRejeicao?: string | null
  // Execução automática do plano (#HLP0083)
  aiExecutionResult?: {
    arquivosModificados?: Array<{ path: string; conteudo: string; motivo: string }>
    arquivosARevisar?: string[]
    resumo?: string
    raciocinio?: string
    duracaoMs?: number
  } | null
  aiExecutionCustoUsd?: string | number | null
  aiExecutionEm?: string | null
}

// Mesmas cores semânticas do kanban (STATUS_COR em ../page.tsx)
const STATUS_BADGE: Record<HelpdeskStatus, string> = {
  NOVO: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-700',
  AGUARDANDO_AUDITORIA: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 text-cyan-700',
  EM_ANDAMENTO: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 text-amber-700',
  RESOLVIDO: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 text-purple-700',
  CONCLUIDO: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 text-emerald-700',
  CANCELADO: 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700',
}

export default function HelpdeskTicketDetailPage() {
  const router = useRouter()
  const params = useParams() as { id: string }
  const id = params.id
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? null

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'visao' | 'conversa' | 'anexos' | 'timeline'>('conversa')

  // Mensagem nova
  const [novaMsg, setNovaMsg] = useState('')
  const [interna, setInterna] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msgAnexos, setMsgAnexos] = useState<AnexoStaged[]>([])
  // Edição de mensagem — autor pode editar enquanto ticket não estiver CANCELADO
  const [editingMsg, setEditingMsg] = useState<Mensagem | null>(null)
  const [editingConteudo, setEditingConteudo] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [anexoSelecionadoId, setAnexoSelecionadoId] = useState<string | null>(null)
  // Edição da descrição inicial (título + corpo) — só o solicitante
  const [editingDescricao, setEditingDescricao] = useState(false)
  const [editTitulo, setEditTitulo] = useState('')
  const [editDescricaoConteudo, setEditDescricaoConteudo] = useState('')
  const [savingDescricao, setSavingDescricao] = useState(false)

  // Sidebar — edição inline
  const [savingField, setSavingField] = useState<string | null>(null)
  const [agentes, setAgentes] = useState<Array<{ id: string; name: string; image: string | null; areaName: string | null }>>([])
  // Catálogo de categorias (pra reclassificar o ticket pela sidebar).
  const [categorias, setCategorias] = useState<Array<{ id: string; nome: string; cor: string | null; parent: { id: string; nome: string } | null }>>([])

  // Quem pode atuar (mover status, trocar prioridade, atribuir responsável):
  // mesma regra de /helpdesk → probeAtuarAgente. Colaborador (incluindo
  // solicitante do próprio ticket) tem sidebar read-only.
  const [podeAtuar, setPodeAtuar] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(trpc.helpdesk as any).probeAtuarAgente.query()
      .then((r: { ok: boolean }) => { if (!cancelled) setPodeAtuar(!!r?.ok) })
      .catch(() => { if (!cancelled) setPodeAtuar(false) })
    return () => { cancelled = true }
  }, [])

  // CSAT
  const [csatNota, setCsatNota] = useState<number>(5)
  const [csatComentario, setCsatComentario] = useState('')
  const [csatEnviando, setCsatEnviando] = useState(false)

  // Cancelar ticket — solicitante pode cancelar o próprio enquanto aberto
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  // Aprovar/rejeitar plano da IA (#HLP0083)
  const [processandoPlano, setProcessandoPlano] = useState(false)
  const [rejeitarOpen, setRejeitarOpen] = useState(false)
  const [rejeitarMotivo, setRejeitarMotivo] = useState('')
  // Forçar processamento IA — ignora score baixo
  const [forcandoIa, setForcandoIa] = useState(false)
  // (refs e auto-scroll do thinking declarados mais abaixo)
  // Modal "Como executar o plano" — abre ao aprovar
  const [executarOpen, setExecutarOpen] = useState(false)
  const [executarTab, setExecutarTab] = useState<'cli' | 'auto'>('cli')
  const [promptCli, setPromptCli] = useState<string>('')
  const [carregandoPrompt, setCarregandoPrompt] = useState(false)
  const [estimativa, setEstimativa] = useState<{
    arquivosLidos: number
    arquivosResolvidos?: Array<{ planejado: string; resolvido: string }>
    arquivosAmbiguos?: Array<{ planejado: string; sugestoes: string[] }>
    arquivosNaoEncontrados: string[]
    inputTokensEstimado: number
    outputTokensEstimado: number
    custoMinUsd: number
    custoMaxUsd: number
  } | null>(null)
  const [estimando, setEstimando] = useState(false)
  const [executandoAuto, setExecutandoAuto] = useState(false)
  // Stream do pensamento da IA durante execução automática
  const [thinkingTexto, setThinkingTexto] = useState('')
  const [statusStream, setStatusStream] = useState<string>('')
  const thinkingScrollRef = useRef<HTMLDivElement>(null)
  // Auto-scroll do thinking enquanto chega texto novo
  useEffect(() => {
    if (thinkingScrollRef.current) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight
    }
  }, [thinkingTexto])
  const [resultadoAuto, setResultadoAuto] = useState<{
    arquivosModificados: Array<{ path: string; conteudo: string; motivo: string }>
    arquivosARevisar?: string[]
    resumo: string
    raciocinio: string
  } | null>(null)
  const [custoRealAuto, setCustoRealAuto] = useState<number | null>(null)
  const [copiouPrompt, setCopiouPrompt] = useState(false)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await (trpc.helpdesk as any).getById.query({ id }) as Ticket | null
      setTicket(data)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  // Título da aba do navegador reflete o ticket carregado pra facilitar identificação
  // quando há várias abas abertas. usePageMeta no layout seta "HelpDesk · OneClick"
  // ao entrar na rota; este effect sobrescreve assim que o ticket carrega.
  useEffect(() => {
    if (ticket?.titulo) document.title = `HelpDesk - ${ticket.titulo}`
  }, [ticket?.titulo])

  // Auto-seleciona o primeiro anexo quando carrega ou quando o anexo selecionado
  // não existe mais (foi removido). Garante que o painel de preview nunca fica vazio
  // se há pelo menos 1 anexo.
  useEffect(() => {
    if (!ticket || ticket.anexos.length === 0) {
      setAnexoSelecionadoId(null)
      return
    }
    if (!anexoSelecionadoId || !ticket.anexos.some(a => a.id === anexoSelecionadoId)) {
      setAnexoSelecionadoId(ticket.anexos[0]!.id)
    }
  }, [ticket, anexoSelecionadoId])

  // Carrega agentes atribuíveis (filtrado pela área da categoria)
  useEffect(() => {
    if (!ticket) return
    ;(trpc.helpdesk as any).listAgentesAtribuiveis.query({ ticketId: ticket.id })
      .then((data: typeof agentes) => setAgentes(data || []))
      .catch(() => setAgentes([]))
  }, [ticket])

  // Carrega o catálogo de categorias uma vez (pra reclassificação).
  useEffect(() => {
    ;(trpc.helpdesk as any).listCategorias.query()
      .then((data: typeof categorias) => setCategorias(data || []))
      .catch(() => setCategorias([]))
  }, [])

  async function patch(data: Record<string, unknown>, field: string) {
    setSavingField(field)
    try {
      await (trpc.helpdesk as any).update.mutate({ id, data })
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingField(null)
    }
  }

  async function enviarMensagem() {
    const conteudo = novaMsg.trim()
    // Strip HTML tags pra validar conteúdo de texto
    const texto = conteudo.replace(/<[^>]+>/g, '').trim()
    const temAnexos = msgAnexos.some(a => a.status === 'ready')
    if (!texto && !temAnexos) return
    if (msgAnexos.some(a => a.status === 'uploading')) {
      alerts.error('Aguarde', 'Aguarde o upload dos anexos terminar.')
      return
    }
    // Snapshot do status ANTES de mandar — depois decidimos se pergunta
    // sobre reabertura (#HLP0062). A mensagem é sempre registrada primeiro,
    // independente do status, pra não perder o que o usuário escreveu.
    const statusAntes = ticket?.status
    setEnviando(true)
    try {
      const msg = await (trpc.helpdesk as any).addMensagem.mutate({
        ticketId: id,
        conteudo: conteudo || '<p>(anexo)</p>',
        interna,
      })
      // Grava anexos vinculados à mensagem
      const prontos = msgAnexos.filter(a => a.status === 'ready' && a.fileUrl)
      for (const a of prontos) {
        try {
          await (trpc.helpdesk as any).addAnexo.mutate({
            ticketId: id,
            mensagemId: msg.id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            mimeType: a.mimeType,
            tamanho: a.tamanho,
          })
        } catch (e) {
          console.warn('[Helpdesk] addAnexo falhou:', (e as Error).message)
        }
      }
      setNovaMsg('')
      setMsgAnexos([])
      await fetchData(true)
      // Mensagem registrada — se o ticket estava encerrado, pergunta se quer
      // reabrir (#HLP0062). Notas internas ficam de fora: agente pode anotar
      // sem reativar o ticket pro solicitante.
      const encerrado = statusAntes === 'CONCLUIDO' || statusAntes === 'CANCELADO'
      if (encerrado && !interna) {
        const labelStatus = statusAntes === 'CONCLUIDO' ? 'concluído' : 'cancelado'
        const ok = await alerts.confirm({
          title: 'Reabrir ticket?',
          text: `Este ticket está ${labelStatus}, mas sua mensagem foi registrada. Deseja reabri-lo (voltar para Em andamento)?`,
          confirmText: 'Reabrir',
          icon: 'question',
        })
        if (ok) {
          try {
            // Reabrir = voltar pra EM_ANDAMENTO E desarquivar — senão o ticket
            // reabre mas continua escondido na lista de arquivados.
            await (trpc.helpdesk as any).update.mutate({
              id,
              data: { status: 'EM_ANDAMENTO', arquivado: false },
            })
            await fetchData(true)
          } catch (e) {
            alerts.error('Erro ao reabrir', (e as Error).message)
          }
        }
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  /** Salva edição de mensagem (#HLP0067). */
  async function salvarEdicaoMensagem() {
    if (!editingMsg) return
    const limpo = editingConteudo.replace(/<[^>]+>/g, '').trim()
    if (!limpo) {
      alerts.error('Vazio', 'Mensagem não pode ficar vazia.')
      return
    }
    setSavingEdit(true)
    try {
      await (trpc.helpdesk as any).editMensagem.mutate({
        id: editingMsg.id,
        conteudo: editingConteudo,
      })
      setEditingMsg(null)
      setEditingConteudo('')
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingEdit(false)
    }
  }

  /** Abre o modal de edição da descrição inicial — pré-popula com valores atuais. */
  function abrirEditDescricao() {
    if (!ticket) return
    setEditTitulo(ticket.titulo)
    setEditDescricaoConteudo(ticket.descricao || '')
    setEditingDescricao(true)
  }

  /** Salva a edição do título/descrição (só solicitante, ticket≠CANCELADO). */
  async function salvarEdicaoDescricao() {
    if (!ticket) return
    const tituloLimpo = editTitulo.trim()
    const descricaoLimpo = editDescricaoConteudo.replace(/<[^>]+>/g, '').trim()
    if (!tituloLimpo) {
      alerts.error('Vazio', 'O título não pode ficar vazio.')
      return
    }
    if (!descricaoLimpo) {
      alerts.error('Vazio', 'A descrição não pode ficar vazia.')
      return
    }
    setSavingDescricao(true)
    try {
      await (trpc.helpdesk as any).update.mutate({
        id: ticket.id,
        data: { titulo: tituloLimpo, descricao: editDescricaoConteudo },
      })
      setEditingDescricao(false)
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingDescricao(false)
    }
  }

  /** Exclui mensagem com confirm (#HLP0067). */
  async function excluirMensagem(msg: Mensagem) {
    const ok = await alerts.confirm({
      title: 'Excluir mensagem?',
      text: 'Esta ação não pode ser desfeita. Anexos vinculados também serão removidos.',
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.helpdesk as any).deleteMensagem.mutate({ id: msg.id })
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  /** Exclui anexo individual do ticket — só o autor + ticket≠CANCELADO. */
  async function excluirAnexo(anexo: Anexo) {
    const ok = await alerts.confirm({
      title: 'Excluir anexo?',
      text: `O arquivo "${anexo.fileName}" será removido do ticket. Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.helpdesk as any).deleteAnexo.mutate({ id: anexo.id })
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  /**
   * Força processamento IA do ticket ignorando o threshold de score.
   * Útil pra tickets não-elegíveis (score baixo) que o operador quer planejar
   * mesmo assim (#HLP0083). Síncrono — espera o backend processar e refaz fetch.
   */
  async function handleForcarProcessamentoIa() {
    const aindaSemPlano = !ticket?.aiPlano
    const ok = await alerts.confirm({
      title: 'Processar este ticket com IA?',
      text: aindaSemPlano
        ? 'A IA vai gerar um plano de resolução pra este ticket. Isso consome crédito da API (custo típico US$ 0.01–0.05).'
        : 'O ticket já tem decisão da IA registrada. Reprocessar gera um NOVO plano (substitui o anterior se gerado). Consome crédito da API.',
      confirmText: 'Processar',
      icon: 'question',
    })
    if (!ok) return
    setForcandoIa(true)
    try {
      await (trpc.helpdesk as any).aiProcessarTicket.mutate({ ticketId: id })
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setForcandoIa(false)
    }
  }

  /**
   * Aprovar plano gerado pela IA (#HLP0083). Status → EM_ANDAMENTO + abre
   * modal "Como executar o plano" com duas opções:
   *  1) Copiar prompt pra colar no Claude Code CLI local (sem custo)
   *  2) Executar automaticamente via Claude API (custo estimado mostrado antes)
   */
  async function handleAprovarPlano() {
    setProcessandoPlano(true)
    try {
      await (trpc.helpdesk as any).aiAprovarPlano.mutate({ ticketId: id })
      await fetchData(true)
      // Abre modal de execução já com a aba "CLI" carregando o prompt
      setExecutarTab('cli')
      setExecutarOpen(true)
      setResultadoAuto(null)
      setCustoRealAuto(null)
      setEstimativa(null)
      setCopiouPrompt(false)
      // Busca o prompt CLI em paralelo
      setCarregandoPrompt(true)
      try {
        const r = await (trpc.helpdesk as any).aiGerarPromptParaCli.query({ ticketId: id })
        setPromptCli(r.prompt ?? '')
      } catch (e) {
        alerts.error('Erro ao gerar prompt', (e as Error).message)
      } finally {
        setCarregandoPrompt(false)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setProcessandoPlano(false)
    }
  }

  /** Carrega estimativa de custo da execução automática (lazy — só quando troca pra aba). */
  async function carregarEstimativa() {
    if (estimativa || estimando) return
    setEstimando(true)
    try {
      const r = await (trpc.helpdesk as any).aiEstimarCustoExecucao.query({ ticketId: id })
      setEstimativa(r)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEstimando(false)
    }
  }

  /**
   * Dispara execução automática via API (custo real). Usa SSE pra
   * receber o pensamento da IA em tempo real (#HLP0083).
   */
  async function handleExecutarAutomatico() {
    if (!estimativa) return
    const custoMax = estimativa.custoMaxUsd.toFixed(4)
    const ok = await alerts.confirm({
      title: 'Executar plano automaticamente?',
      text: `Vai consumir crédito da API. Custo estimado: até US$ ${custoMax}. ${estimativa.arquivosLidos} arquivo(s) carregado(s) como contexto. A IA vai propor as alterações — você revisa antes de aplicar.`,
      confirmText: `Executar (~US$ ${custoMax})`,
      icon: 'question',
    })
    if (!ok) return
    setExecutandoAuto(true)
    setThinkingTexto('')
    setStatusStream('Conectando…')
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
      const url = `${apiBase}/api/helpdesk/${id}/ai-execute-stream`
      // EventSource não suporta withCredentials por default em alguns browsers
      // antigos, mas same-origin + Better Auth cookie funciona em todos modernos.
      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(url, { withCredentials: true })
        es.onmessage = (ev) => {
          try {
            const event = JSON.parse(ev.data)
            if (event.type === 'thinking_delta') {
              setThinkingTexto(t => t + event.text)
            } else if (event.type === 'status') {
              const map: Record<string, string> = {
                preparando: 'Preparando…',
                lendo_arquivos: 'Lendo arquivos do repo…',
                chamando_ia: 'Pensando…',
                finalizando: 'Gravando resultado…',
              }
              setStatusStream(map[event.stage] || event.stage)
            } else if (event.type === 'done') {
              setCustoRealAuto(event.custoUsd)
              setStatusStream('Concluído')
              es.close()
              resolve()
            } else if (event.type === 'error') {
              es.close()
              reject(new Error(event.message))
            }
          } catch {
            // ignora linhas que não são JSON (comments, pings)
          }
        }
        es.onerror = () => {
          es.close()
          reject(new Error('Conexão SSE caiu. Verifique o backend.'))
        }
      })
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setExecutandoAuto(false)
      setStatusStream('')
    }
  }

  /** Copia o prompt pro clipboard com fallback. */
  async function copiarPrompt() {
    try {
      await navigator.clipboard.writeText(promptCli)
      setCopiouPrompt(true)
      setTimeout(() => setCopiouPrompt(false), 2000)
    } catch {
      alerts.error('Erro', 'Não foi possível copiar. Selecione manualmente e copie (Ctrl+C).')
    }
  }

  /** Rejeitar plano gerado pela IA (#HLP0083). Status → NOVO. */
  async function handleRejeitarPlano() {
    setProcessandoPlano(true)
    try {
      await (trpc.helpdesk as any).aiRejeitarPlano.mutate({
        ticketId: id,
        motivo: rejeitarMotivo.trim() || undefined,
      })
      setRejeitarOpen(false)
      setRejeitarMotivo('')
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setProcessandoPlano(false)
    }
  }

  async function cancelarTicket() {
    setCancelando(true)
    try {
      await (trpc.helpdesk as any).update.mutate({
        id,
        data: { status: 'CANCELADO' },
      })
      setCancelOpen(false)
      await alerts.success('Ticket cancelado', 'O ticket foi marcado como cancelado.')
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setCancelando(false)
    }
  }

  async function enviarCsat() {
    setCsatEnviando(true)
    try {
      await (trpc.helpdesk as any).responderCsat.mutate({
        ticketId: id,
        nota: csatNota,
        comentario: csatComentario.trim() || null,
      })
      await alerts.success('Obrigado!', 'Sua avaliação foi registrada.')
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setCsatEnviando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!ticket) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <p>Ticket não encontrado</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/helpdesk/meus')}>
          Voltar
        </Button>
      </div>
    )
  }

  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const corPrioridade = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]
  const podeAvaliar = ticket.status === 'RESOLVIDO' && !ticket.csatRespondidoEm
  // Solicitante pode cancelar o próprio ticket enquanto está aberto.
  // TI também pode cancelar (via sidebar/select de status), então aqui foco no solicitante.
  const isSolicitante = !!currentUserId && ticket.solicitante?.id === currentUserId
  const ticketAberto = !['CONCLUIDO', 'CANCELADO'].includes(ticket.status)
  const podeCancelar = isSolicitante && ticketAberto

  return (
    <div className="space-y-0 pb-6">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="space-y-0">
        {/* Header bleed-edge */}
        <div
          className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden"
          style={{ backgroundColor: `color-mix(in srgb, ${MODULO_COLOR} 12%, transparent)` }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `linear-gradient(to right, color-mix(in srgb, ${MODULO_COLOR} 0%, transparent) 0%, color-mix(in srgb, ${MODULO_COLOR} 80%, transparent) 100%)` }}
          />
          <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg"
                  style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}
                >
                  <Headphones className="h-10 w-10" style={{ color: MODULO_COLOR }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-muted-foreground tabular-nums">{ticketNum}</p>
                  <h1 className="text-xl font-semibold truncate">{ticket.titulo}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {HELPDESK_TIPO_LABELS[ticket.tipo]}
                    {ticket.categoria && ` · ${ticket.categoria.parent ? `${ticket.categoria.parent.nome} › ` : ''}${ticket.categoria.nome}`}
                    {ticket.solicitante && ` · Solicitante: ${ticket.solicitante.name}`}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase border ${STATUS_BADGE[ticket.status]}`}>
                      {HELPDESK_STATUS_LABELS[ticket.status]}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase text-white"
                      style={{ backgroundColor: corPrioridade }}
                    >
                      {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {podeCancelar && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setCancelOpen(true)}
                    className="gap-1.5 text-xs text-rose-600 bg-white/70 hover:bg-rose-50 dark:bg-black/30 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                    title="Cancelar este ticket"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                )}
                <BackButton href="/helpdesk" />
              </div>
            </div>
          </div>
          {/* Tabs — padrão SlidingTabsList (mesmo de /orcamentos/[id]) com
              indicador deslizante animado entre os triggers. */}
          <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
            <SlidingTabsList activeValue={activeTab} className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit">
              <TabsTrigger value="conversa" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Conversação
                {ticket.mensagens.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1.5 h-4 px-1.5">{ticket.mensagens.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="visao" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Visão geral
              </TabsTrigger>
              <TabsTrigger value="anexos" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Anexos
                {ticket.anexos.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1.5 h-4 px-1.5">{ticket.anexos.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="timeline" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <History className="h-3.5 w-3.5" /> Histórico
              </TabsTrigger>
            </SlidingTabsList>
          </div>
        </div>

        {/* Body em 2 colunas: conteúdo + sidebar */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="min-w-0 space-y-4">
            {/* Descrição inicial — sempre o primeiro card (antes de triagem e mensagens) */}
            <Card className="border-l-4 border-l-cyan-500/70 overflow-hidden">
              {/* Header com avatar + autor + timestamp */}
              <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-3">
                {ticket.solicitante?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAssetUrl(ticket.solicitante.image)}
                    alt={ticket.solicitante.name}
                    className="h-9 w-9 rounded-full object-cover shrink-0 ring-2 ring-card"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0 ring-2 ring-card">
                    {(ticket.solicitante?.name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">
                      {ticket.solicitante?.name ?? 'Solicitante externo'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-cyan-700 dark:text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/10">
                      <FileText className="h-2.5 w-2.5" /> Descrição inicial
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {ticket.solicitante?.email && (
                      <span className="mr-2">{ticket.solicitante.email}</span>
                    )}
                    <span>{new Date(ticket.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </p>
                </div>
                {!!currentUserId && ticket.solicitante?.id === currentUserId && ticket.status !== 'CANCELADO' && (
                  <button
                    type="button"
                    onClick={abrirEditDescricao}
                    className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Editar título e descrição"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Conteúdo da descrição */}
              <CardContent className="px-5 py-4">
                <div
                  className="text-sm leading-relaxed prose prose-sm prose-neutral dark:prose-invert max-w-none [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_a]:text-cyan-600 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(ticket.descricao) }}
                />
              </CardContent>
            </Card>

            {/* CSAT — destacado se pendente */}
            {podeAvaliar && ticket.solicitante && (
              <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-sm font-semibold">Como foi seu atendimento?</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sua avaliação encerra o ticket — obrigatória para fechamento (auto-fecha em 3 dias úteis com nota neutra).
                  </p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCsatNota(n)}
                        className="p-1 hover:scale-110 transition-transform"
                        title={`${n} estrela${n > 1 ? 's' : ''}`}
                      >
                        <Star
                          className={cn('h-7 w-7', n <= csatNota ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={csatComentario}
                    onChange={e => setCsatComentario(e.target.value)}
                    placeholder="Comentário opcional sobre o atendimento..."
                    rows={2}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    size="sm"
                    onClick={enviarCsat}
                    disabled={csatEnviando}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    {csatEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                    Enviar avaliação
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Status da triagem IA — botão pra forçar quando não tem plano pendente (#HLP0083).
                Aparece se: ainda não tem plano OU plano foi rejeitado. Operador pode
                forçar processamento mesmo se score ficou abaixo do threshold. */}
            {(!ticket.aiPlano || ticket.aiPlanoStatus === 'rejeitado') && (
              <Card className="border-l-4 border-l-slate-400 dark:border-l-slate-500">
                <CardContent className="p-3 flex items-center gap-3">
                  <Bot className="h-4 w-4 text-violet-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Triagem IA</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ticket.aiPlanoStatus === 'rejeitado'
                        ? 'O plano anterior foi rejeitado. Gere um novo se quiser uma nova proposta.'
                        : ticket.aiScore == null
                          ? 'Este ticket ainda não passou pela triagem automática.'
                          : ticket.aiElegivel
                            ? `Score ${ticket.aiScore} — elegível, mas sem plano gerado ainda.`
                            : `Score ${ticket.aiScore} ficou abaixo do threshold — IA não foi consultada automaticamente.`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleForcarProcessamentoIa}
                    disabled={forcandoIa}
                    className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                  >
                    {forcandoIa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                    {forcandoIa ? 'Processando…' : 'Processar com IA'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Plano da IA (#HLP0083) — aparece em qualquer status com plano gerado */}
            {ticket.aiPlano && (
              <Card
                className={cn(
                  'border-l-4 overflow-hidden',
                  ticket.aiPlanoStatus === 'pendente'  && 'border-l-violet-500 bg-violet-50/30 dark:bg-violet-950/20',
                  ticket.aiPlanoStatus === 'aprovado'  && 'border-l-emerald-500',
                  ticket.aiPlanoStatus === 'rejeitado' && 'border-l-rose-500 opacity-80',
                )}
              >
                <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-600" />
                  <h3 className="font-semibold text-sm">Plano de resolução — IA</h3>
                  {ticket.aiPlanoStatus === 'pendente' && (
                    <Badge variant="outline" className="ml-auto bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300">
                      Aguardando aprovação
                    </Badge>
                  )}
                  {ticket.aiPlanoStatus === 'aprovado' && (
                    <Badge variant="outline" className="ml-auto bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovado
                    </Badge>
                  )}
                  {ticket.aiPlanoStatus === 'rejeitado' && (
                    <Badge variant="outline" className="ml-auto bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300">
                      <XCircle className="h-3 w-3 mr-1" /> Rejeitado
                    </Badge>
                  )}
                </div>
                <CardContent className="p-4 space-y-3">
                  {/* Plano armazenado em markdown (vai pra IA bruto) e
                      renderizado pro operador como HTML formatado. */}
                  <MarkdownView source={ticket.aiPlano} />


                  {/* Metadados em grid de 3 colunas */}
                  {ticket.aiPlanoMeta && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border text-[11px]">
                      <PlanoMeta
                        label="Arquivos prováveis"
                        value={Array.isArray(ticket.aiPlanoMeta.arquivosEnvolvidos) && ticket.aiPlanoMeta.arquivosEnvolvidos.length > 0
                          ? ticket.aiPlanoMeta.arquivosEnvolvidos.join(' · ')
                          : '—'}
                        mono
                      />
                      <PlanoMeta label="Riscos" value={ticket.aiPlanoMeta.riscos || '—'} />
                      <PlanoMeta label="Tempo estimado" value={ticket.aiPlanoMeta.tempoEstimado || '—'} />
                    </div>
                  )}

                  {/* Raciocínio da IA (colapsável) */}
                  {ticket.aiPlanoMeta?.raciocinio && (
                    <details className="text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">Por que esse plano (raciocínio da IA)</summary>
                      <p className="mt-1 pl-2 border-l-2 border-border italic">{ticket.aiPlanoMeta.raciocinio}</p>
                    </details>
                  )}

                  {/* Motivo de rejeição (se rejeitado) */}
                  {ticket.aiPlanoStatus === 'rejeitado' && ticket.aiPlanoMotivoRejeicao && (
                    <div className="text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 p-2 rounded">
                      <strong>Motivo da rejeição:</strong> {ticket.aiPlanoMotivoRejeicao}
                    </div>
                  )}

                  {/* Ações — só aparecem se plano está pendente */}
                  {ticket.aiPlanoStatus === 'pendente' && (
                    <div className="flex gap-2 justify-end pt-2 border-t border-border flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRejeitarOpen(true)}
                        disabled={processandoPlano || forcandoIa}
                        className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Rejeitar
                      </Button>
                      {/* Reprocessar — útil quando há novas mensagens no ticket
                          que devem entrar no contexto. Substitui o plano atual. */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleForcarProcessamentoIa}
                        disabled={processandoPlano || forcandoIa}
                        className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30"
                      >
                        {forcandoIa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                        Reprocessar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAprovarPlano}
                        disabled={processandoPlano || forcandoIa}
                        className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        {processandoPlano ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                        Aprovar plano
                      </Button>
                    </div>
                  )}

                  {/* Plano já aprovado — abre o modal de execução pra revisar/copiar/auto-executar */}
                  {ticket.aiPlanoStatus === 'aprovado' && (
                    <div className="flex justify-end pt-2 border-t border-border">
                      <Button
                        size="sm"
                        onClick={async () => {
                          setExecutarTab('cli')
                          setExecutarOpen(true)
                          setCopiouPrompt(false)
                          if (!promptCli) {
                            setCarregandoPrompt(true)
                            try {
                              const r = await (trpc.helpdesk as any).aiGerarPromptParaCli.query({ ticketId: id })
                              setPromptCli(r.prompt ?? '')
                            } catch (e) {
                              alerts.error('Erro', (e as Error).message)
                            } finally {
                              setCarregandoPrompt(false)
                            }
                          }
                        }}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <FileCheck className="h-3.5 w-3.5" />
                        Como executar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <TabsContent value="conversa" className="space-y-3 mt-0">
              {/* Thread */}
              {ticket.mensagens.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">
                  Nenhuma mensagem ainda. Use o composer abaixo pra iniciar a conversa.
                </CardContent></Card>
              ) : ticket.mensagens.map(msg => {
                // Edição/exclusão liberadas para o autor enquanto o ticket
                // não estiver cancelado. O campo editadoEm + evento de
                // auditoria garantem a rastreabilidade.
                const podeEditar = !!currentUserId && msg.autor?.id === currentUserId
                  && ticket.status !== 'CANCELADO'
                return (
                  <Card
                    key={msg.id}
                    className={cn(
                      msg.interna && 'border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20',
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2 text-[11px]">
                        {msg.interna ? (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 font-semibold text-[10px]">
                            <Lock className="h-2.5 w-2.5" /> NOTA INTERNA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-cyan-100 text-cyan-800 font-semibold text-[10px]">
                            <MessageSquare className="h-2.5 w-2.5" /> PÚBLICA
                          </span>
                        )}
                        <span className="text-muted-foreground font-medium">{msg.autor?.name || 'Externo'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{new Date(msg.createdAt).toLocaleString('pt-BR')}</span>
                        {msg.editadoEm && (
                          <span className="text-muted-foreground italic">(editada)</span>
                        )}
                        {podeEditar && (
                          <div className="ml-auto">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                                  aria-label="Ações da mensagem"
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingMsg(msg)
                                    setEditingConteudo(msg.conteudo)
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => excluirMensagem(msg)}
                                  className="text-rose-600 dark:text-rose-400 focus:text-rose-600 dark:focus:text-rose-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                      <div
                        className="text-sm whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(msg.conteudo) }}
                      />
                    </CardContent>
                  </Card>
                )
              })}

              {/* Composer */}
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setInterna(false)}
                      className={cn(
                        'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                        !interna
                          ? 'bg-cyan-100 text-cyan-800'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <MessageSquare className="inline h-3 w-3 mr-1" /> Mensagem pública
                    </button>
                    <button
                      type="button"
                      onClick={() => setInterna(true)}
                      className={cn(
                        'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                        interna
                          ? 'bg-amber-100 text-amber-800'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Lock className="inline h-3 w-3 mr-1" /> Nota interna
                    </button>
                  </div>
                  <RichEditor
                    value={novaMsg}
                    onChange={(html) => setNovaMsg(html)}
                    placeholder={interna ? 'Nota privada (só agentes veem)' : 'Resposta visível ao solicitante'}
                    className="min-h-[100px]"
                  />
                  <AnexosDropzone value={msgAnexos} onChange={setMsgAnexos} compact />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={enviarMensagem}
                      disabled={enviando || (!novaMsg.replace(/<[^>]+>/g, '').trim() && !msgAnexos.some(a => a.status === 'ready'))}
                      style={{ backgroundColor: MODULO_COLOR }}
                      className="text-white gap-1.5"
                    >
                      {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Enviar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="visao" className="mt-0">
              <Card>
                <CardContent className="p-4 space-y-3 text-sm">
                  <InfoLine label="Solicitante" value={ticket.solicitante?.name || '—'} />
                  <InfoLine label="Responsável" value={ticket.responsavel?.name || 'Não atribuído'} />
                  <InfoLine label="Categoria" value={ticket.categoria ? `${ticket.categoria.parent ? ticket.categoria.parent.nome + ' › ' : ''}${ticket.categoria.nome}` : '—'} />
                  <InfoLine label="Área" value={ticket.area?.name || '—'} />
                  <InfoLine label="Criado em" value={new Date(ticket.createdAt).toLocaleString('pt-BR')} />
                  {ticket.prazoSla && (
                    <InfoLine label="Prazo SLA" value={new Date(ticket.prazoSla).toLocaleString('pt-BR')} />
                  )}
                  {ticket.resolvidoEm && <InfoLine label="Resolvido em" value={new Date(ticket.resolvidoEm).toLocaleString('pt-BR')} />}
                  {ticket.concluidoEm && <InfoLine label="Concluído em" value={new Date(ticket.concluidoEm).toLocaleString('pt-BR')} />}
                  {ticket.csatNota && (
                    <InfoLine label="CSAT" value={`${ticket.csatNota}/5${ticket.csatRespondidoEm ? ` (em ${new Date(ticket.csatRespondidoEm).toLocaleDateString('pt-BR')})` : ''}`} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="anexos" className="mt-0">
              <AnexosViewer
                ticketId={ticket.id}
                anexos={ticket.anexos}
                selecionadoId={anexoSelecionadoId}
                onSelect={setAnexoSelecionadoId}
                onUploaded={() => fetchData(true)}
                currentUserId={currentUserId}
                canDelete={ticket.status !== 'CANCELADO'}
                onDelete={excluirAnexo}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              {ticket.eventos.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">
                  Sem eventos registrados.
                </CardContent></Card>
              ) : (
                <Card><CardContent className="p-0 divide-y">
                  {ticket.eventos.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="shrink-0 mt-0.5">
                        {ev.tipo === 'criado' && <FileText className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'atribuido' && <UserCog className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'status_alterado' && <Layers className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'mensagem_publica' && <MessageSquare className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'nota_interna' && <Lock className="h-4 w-4 text-amber-600" />}
                        {ev.tipo === 'anexo_adicionado' && <Paperclip className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'csat_recebido' && <Star className="h-4 w-4 text-emerald-600" />}
                        {!['criado','atribuido','status_alterado','mensagem_publica','nota_interna','anexo_adicionado','csat_recebido'].includes(ev.tipo) && (
                          <History className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{ev.descricao}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {ev.autor?.name || 'Sistema'} · {new Date(ev.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent></Card>
              )}
            </TabsContent>
          </div>

          {/* Sidebar — propriedades editáveis */}
          <aside className="space-y-3 min-w-0">
            <Card>
              <CardContent className="p-3 space-y-3">
                <SideField label="Status" icon={Layers}>
                  {podeAtuar ? (
                    <Select
                      value={ticket.status}
                      onValueChange={v => patch({ status: v }, 'status')}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HELPDESK_STATUS.map(s => (
                          <SelectItem key={s} value={s}>{HELPDESK_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={`text-[10px] h-5 ${STATUS_BADGE[ticket.status]}`}>
                      {HELPDESK_STATUS_LABELS[ticket.status]}
                    </Badge>
                  )}
                </SideField>

                <SideField label="Prioridade" icon={AlertTriangle}>
                  {podeAtuar ? (
                    <Select
                      value={ticket.prioridade}
                      onValueChange={v => patch({ prioridade: v }, 'prioridade')}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HELPDESK_PRIORIDADE.map(p => (
                          <SelectItem key={p} value={p}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HELPDESK_PRIORIDADE_COLORS[p] }} />
                              {HELPDESK_PRIORIDADE_LABELS[p]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HELPDESK_PRIORIDADE_COLORS[ticket.prioridade] }} />
                      {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
                    </span>
                  )}
                </SideField>

                <SideField label="Responsável" icon={UserCog}>
                  {!podeAtuar ? (
                    <p className="text-xs">{ticket.responsavel?.name || <span className="text-muted-foreground italic">Não atribuído</span>}</p>
                  ) : savingField === 'responsavel' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Select
                      value={ticket.responsavel?.id ?? '__null__'}
                      onValueChange={v => patch({ responsavelId: v === '__null__' ? null : v }, 'responsavel')}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">— Sem responsável</SelectItem>
                        {agentes.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="flex flex-col">
                              <span>{a.name}</span>
                              {a.areaName && <span className="text-[9px] text-muted-foreground">{a.areaName}</span>}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </SideField>

                <SideField label="Categoria" icon={Tag}>
                  {!podeAtuar ? (
                    <p className="text-xs">{ticket.categoria ? `${ticket.categoria.parent ? ticket.categoria.parent.nome + ' › ' : ''}${ticket.categoria.nome}` : <span className="text-muted-foreground italic">—</span>}</p>
                  ) : savingField === 'categoria' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Select
                      value={ticket.categoria?.id ?? '__null__'}
                      onValueChange={v => patch({ categoriaId: v === '__null__' ? null : v }, 'categoria')}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">— Sem categoria</SelectItem>
                        {categorias.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.parent ? `${c.parent.nome} › ${c.nome}` : c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </SideField>

                {ticket.area && (
                  <SideField label="Área" icon={Building2}>
                    <p className="text-xs">{ticket.area.name}</p>
                  </SideField>
                )}

                {ticket.prazoSla && (
                  <SideField label="Prazo SLA" icon={Clock}>
                    <p className="text-xs tabular-nums">{new Date(ticket.prazoSla).toLocaleString('pt-BR')}</p>
                  </SideField>
                )}

                {ticket.tags.length > 0 && (
                  <SideField label="Tags" icon={Tag}>
                    <div className="flex flex-wrap gap-1">
                      {ticket.tags.map(t => (
                        <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>
                      ))}
                    </div>
                  </SideField>
                )}

                {ticket.watchers.length > 0 && (
                  <SideField label="Observadores" icon={Eye}>
                    <div className="flex flex-wrap gap-1">
                      {ticket.watchers.map(w => (
                        <span key={w.id} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          {w.user.name}
                        </span>
                      ))}
                    </div>
                  </SideField>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </Tabs>

      {/* Dialog: solicitante cancela o próprio ticket */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeaderIcon icon={XCircle} color="rose">
            <DialogTitle>Cancelar ticket</DialogTitle>
            <DialogDescription>
              Tem certeza que quer cancelar o ticket <strong>{ticketNum}</strong>?
              O atendimento será encerrado sem resolução. Não pode ser desfeito —
              se precisar do suporte depois, abra um novo ticket.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <p className="text-xs text-muted-foreground">
              A TI será notificada e o ticket sairá do kanban ativo.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelando}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={cancelarTicket}
              disabled={cancelando}
              className="gap-1.5"
            >
              {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Sim, cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edição de mensagem (#HLP0067) */}
      <Dialog open={!!editingMsg} onOpenChange={(o) => { if (!o) { setEditingMsg(null); setEditingConteudo('') } }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Editar mensagem</DialogTitle>
            <DialogDescription>
              Após salvar, a mensagem fica marcada como &quot;(editada)&quot; e o evento é
              registrado na timeline do ticket.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <RichEditor
              value={editingConteudo}
              onChange={(html) => setEditingConteudo(html)}
              placeholder="Conteúdo da mensagem"
              className="min-h-[140px]"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingMsg(null); setEditingConteudo('') }} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button
              onClick={salvarEdicaoMensagem}
              disabled={savingEdit || !editingConteudo.replace(/<[^>]+>/g, '').trim()}
              className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white"
            >
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edição da descrição inicial — só pro solicitante, ticket≠CANCELADO */}
      <Dialog open={editingDescricao} onOpenChange={(o) => { if (!o) setEditingDescricao(false) }}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Editar título e descrição</DialogTitle>
            <DialogDescription>
              Ajuste o título ou o corpo inicial do ticket. A alteração fica
              registrada na timeline.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Título</label>
              <Input
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                placeholder="Resumo curto do problema"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Descrição</label>
              <RichEditor
                value={editDescricaoConteudo}
                onChange={(html) => setEditDescricaoConteudo(html)}
                placeholder="Detalhes do problema, contexto e o que você já tentou"
                className="min-h-[180px]"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDescricao(false)} disabled={savingDescricao}>
              Cancelar
            </Button>
            <Button
              onClick={salvarEdicaoDescricao}
              disabled={savingDescricao || !editTitulo.trim() || !editDescricaoConteudo.replace(/<[^>]+>/g, '').trim()}
              className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white"
            >
              {savingDescricao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal "Como executar o plano" (#HLP0083) — abre após aprovar */}
      <Dialog open={executarOpen} onOpenChange={(o) => { if (!o) setExecutarOpen(false) }}>
        <DialogContent className="sm:max-w-[820px]">
          <DialogHeaderIcon icon={FileCheck} color="emerald">
            <DialogTitle>Plano aprovado — como executar?</DialogTitle>
            <DialogDescription>
              Duas formas. A primeira não consome crédito da API — você cola o prompt no Claude Code CLI local e o agente executa no seu repo. A segunda dispara aqui mesmo, custo estimado mostrado antes.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
              <button
                type="button"
                onClick={() => setExecutarTab('cli')}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-medium border-b-2 transition-colors -mb-px',
                  executarTab === 'cli'
                    ? 'border-emerald-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Terminal className="h-3.5 w-3.5 inline mr-1.5" />
                Copiar pro CLI
              </button>
              <button
                type="button"
                onClick={() => { setExecutarTab('auto'); void carregarEstimativa() }}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-medium border-b-2 transition-colors -mb-px',
                  executarTab === 'auto'
                    ? 'border-violet-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Zap className="h-3.5 w-3.5 inline mr-1.5" />
                Processar automaticamente
              </button>
            </div>

            {/* TAB 1: CLI */}
            {executarTab === 'cli' && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Cole o conteúdo abaixo num <strong>Claude Code CLI</strong> aberto no diretório raiz do <code>OneClick_Code</code>. O agente vai executar o plano e fazer commit local.
                </p>
                {carregandoPrompt ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Gerando prompt…
                  </div>
                ) : (
                  <>
                    <textarea
                      readOnly
                      value={promptCli}
                      onClick={e => (e.target as HTMLTextAreaElement).select()}
                      className="w-full font-mono text-[11px] rounded-md border border-input bg-muted/30 px-3 py-2 min-h-[280px] max-h-[420px] overflow-auto"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={copiarPrompt}
                        className={cn(
                          'gap-1.5',
                          copiouPrompt ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700',
                          'text-white',
                        )}
                      >
                        {copiouPrompt ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiouPrompt ? 'Copiado!' : 'Copiar prompt'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: AUTO */}
            {executarTab === 'auto' && (
              <div className="space-y-3">
                {estimando ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lendo arquivos e estimando custo…
                  </div>
                ) : estimativa ? (
                  <>
                    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2 text-[12px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Arquivos carregados como contexto</span>
                        <span className="font-mono tabular-nums">{estimativa.arquivosLidos}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tokens estimados (entrada)</span>
                        <span className="font-mono tabular-nums">{estimativa.inputTokensEstimado.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tokens estimados (saída)</span>
                        <span className="font-mono tabular-nums">{estimativa.outputTokensEstimado.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="font-semibold">Custo estimado</span>
                        <span className="font-mono tabular-nums font-semibold text-violet-700 dark:text-violet-300">
                          US$ {estimativa.custoMinUsd.toFixed(4)} – {estimativa.custoMaxUsd.toFixed(4)}
                        </span>
                      </div>
                    </div>
                    {/* Paths que foram remapeados via fuzzy — IA chutou X, encontrei Y */}
                    {(estimativa.arquivosResolvidos?.length ?? 0) > 0 && (
                      <div className="rounded-md border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 p-2 text-[11px]">
                        <p className="font-semibold text-sky-800 dark:text-sky-300 mb-1">
                          <CheckCircle2 className="inline h-3 w-3 mr-1" />
                          {estimativa.arquivosResolvidos!.length} path(s) remapeado(s) por fuzzy search:
                        </p>
                        <ul className="space-y-0.5 text-sky-700/90 dark:text-sky-300/90 font-mono">
                          {estimativa.arquivosResolvidos!.map((r, i) => (
                            <li key={i}>• <span className="line-through opacity-60">{r.planejado}</span> → <strong>{r.resolvido}</strong></li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Paths com múltiplos matches — operador decide */}
                    {(estimativa.arquivosAmbiguos?.length ?? 0) > 0 && (
                      <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2 text-[11px]">
                        <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                          <AlertTriangle className="inline h-3 w-3 mr-1" />
                          {estimativa.arquivosAmbiguos!.length} path(s) com múltiplos candidatos:
                        </p>
                        <ul className="space-y-1 text-amber-700/90 dark:text-amber-300/90">
                          {estimativa.arquivosAmbiguos!.map((a, i) => (
                            <li key={i} className="font-mono">
                              • {a.planejado}
                              <ul className="pl-4 text-amber-700/70 dark:text-amber-300/70 text-[10px]">
                                {a.sugestoes.map((s, j) => <li key={j}>↳ {s}</li>)}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {estimativa.arquivosNaoEncontrados.length > 0 && (
                      <div className="rounded-md border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 p-2 text-[11px]">
                        <p className="font-semibold text-rose-800 dark:text-rose-300 mb-1">
                          <AlertTriangle className="inline h-3 w-3 mr-1" />
                          {estimativa.arquivosNaoEncontrados.length} arquivo(s) sem match no repo:
                        </p>
                        <ul className="space-y-0.5 text-rose-700/90 dark:text-rose-300/90 font-mono">
                          {estimativa.arquivosNaoEncontrados.map((a, i) => <li key={i}>• {a}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Resultado da execução (quando disponível) */}
                    {ticket.aiExecutionResult && (
                      <div className="rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-2">
                        <div className="flex items-center justify-between text-[12px]">
                          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                            Execução concluída
                          </p>
                          <span className="font-mono text-emerald-700 dark:text-emerald-400">
                            Custo: US$ {Number(ticket.aiExecutionCustoUsd ?? custoRealAuto ?? 0).toFixed(4)}
                          </span>
                        </div>
                        {ticket.aiExecutionResult.resumo && (
                          <p className="text-[12px]"><strong>Resumo:</strong> {ticket.aiExecutionResult.resumo}</p>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                          {ticket.aiExecutionResult.arquivosModificados?.length ?? 0} arquivo(s) modificado(s) ·
                          {' '}{ticket.aiExecutionResult.arquivosARevisar?.length ?? 0} a revisar manualmente
                        </div>
                        {(ticket.aiExecutionResult.arquivosModificados ?? []).map((arq, i) => (
                          <details key={i} className="text-[11px] border border-border rounded bg-card">
                            <summary className="cursor-pointer px-2 py-1.5 font-mono hover:bg-muted/40">
                              📄 {arq.path}
                            </summary>
                            <div className="px-2 py-1.5 border-t border-border space-y-1">
                              <p className="text-muted-foreground italic">{arq.motivo}</p>
                              <pre className="bg-muted/30 p-2 rounded text-[10px] overflow-auto max-h-[300px] whitespace-pre">{arq.conteudo}</pre>
                            </div>
                          </details>
                        ))}
                        {ticket.aiExecutionResult.raciocinio && (
                          <details className="text-[11px]">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              Raciocínio técnico da IA
                            </summary>
                            <p className="mt-1 pl-2 border-l-2 border-border italic text-muted-foreground">
                              {ticket.aiExecutionResult.raciocinio}
                            </p>
                          </details>
                        )}
                        <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 pt-1 border-t border-emerald-300/40">
                          ⚠️ As alterações NÃO foram aplicadas no repo. Revise cada arquivo e copie manualmente, ou use a opção CLI pra deixar o agente local commitar.
                        </p>
                      </div>
                    )}

                    {/* Stream do pensamento da IA — só aparece enquanto executando */}
                    {executandoAuto && (
                      <div className="rounded-md border border-violet-300 dark:border-violet-700 bg-violet-50/30 dark:bg-violet-950/20 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-[12px]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
                          <span className="font-semibold text-violet-700 dark:text-violet-300">Pensamento da IA</span>
                          <span className="ml-auto text-[10px] text-muted-foreground italic">{statusStream}</span>
                        </div>
                        <div
                          ref={thinkingScrollRef}
                          className="bg-card border border-border rounded p-2 max-h-[280px] overflow-auto text-[11px] font-mono whitespace-pre-wrap text-foreground/80"
                        >
                          {thinkingTexto || <span className="text-muted-foreground italic">aguardando primeiros chunks…</span>}
                        </div>
                      </div>
                    )}

                    {!ticket.aiExecutionResult && !executandoAuto && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleExecutarAutomatico}
                          disabled={executandoAuto}
                          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Processar (~US$ {estimativa.custoMaxUsd.toFixed(4)})
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground text-center py-4">Aguardando estimativa...</p>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExecutarOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de rejeição do plano IA (#HLP0083) */}
      <Dialog open={rejeitarOpen} onOpenChange={(o) => { if (!o) { setRejeitarOpen(false); setRejeitarMotivo('') } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={ThumbsDown} color="rose">
            <DialogTitle>Rejeitar plano da IA</DialogTitle>
            <DialogDescription>
              O plano será marcado como rejeitado, o ticket volta pra coluna &quot;Novo&quot; e o motivo
              fica registrado como nota interna. Motivo é opcional, mas ajuda a refinar futuras triagens.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold">Motivo (opcional)</Label>
            <textarea
              value={rejeitarMotivo}
              onChange={e => setRejeitarMotivo(e.target.value)}
              rows={4}
              placeholder="Ex.: plano não considera caso X, arquivo Y está obsoleto, abordagem perigosa..."
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 mt-1.5"
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground mt-1">{rejeitarMotivo.length}/500</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejeitarOpen(false); setRejeitarMotivo('') }} disabled={processandoPlano}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejeitarPlano}
              disabled={processandoPlano}
              className="gap-1.5"
            >
              {processandoPlano ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
              Rejeitar plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlanoMeta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className={cn('text-[11px] text-foreground/85 break-words', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      <p className="col-span-2 text-sm">{value}</p>
    </div>
  )
}

function SideField({ label, icon: Icon, children }: { label: string; icon: typeof Layers; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      </div>
      {children}
    </div>
  )
}

// ============================================================
// Visualizador inline de anexos — lista à esquerda + preview à direita.
// Detecta o tipo pelo mimeType e renderiza embed apropriado (img/iframe/video/audio).
// Tipos sem preview nativo (zip, docx, exe...) caem no fallback com botão de download.
// ============================================================

function categoriaArquivo(mime: string | null): 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other' {
  if (!mime) return 'other'
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') return 'text'
  return 'other'
}

function iconeDoArquivo(mime: string | null) {
  switch (categoriaArquivo(mime)) {
    case 'image': return ImageIcon
    case 'pdf': return FileText
    case 'video': return FileVideo
    case 'audio': return FileAudio
    case 'text': return FileSpreadsheet
    default: return FileIcon
  }
}

function formatarBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function AnexosViewer({ ticketId, anexos, selecionadoId, onSelect, onUploaded, currentUserId, canDelete, onDelete }: {
  ticketId: string
  anexos: Anexo[]
  selecionadoId: string | null
  onSelect: (id: string) => void
  onUploaded: () => void
  currentUserId?: string | null
  canDelete: boolean
  onDelete: (anexo: Anexo) => void | Promise<void>
}) {
  const ativo = anexos.find(a => a.id === selecionadoId) ?? anexos[0]
  const podeExcluirAtivo = !!(ativo && canDelete && currentUserId && ativo.autor?.id === currentUserId)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-[480px]">
          {/* Lista lateral de anexos + dropzone no topo */}
          <div className="border-b md:border-b-0 md:border-r flex flex-col max-h-[680px]">
            <AnexosDropArea ticketId={ticketId} onUploaded={onUploaded} />
            <div className="px-3 py-2 bg-muted/30 border-b border-t">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {anexos.length === 0 ? 'Sem arquivos' : `${anexos.length} arquivo${anexos.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y">
              {anexos.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] text-muted-foreground italic">
                  Arraste ou clique acima<br />pra adicionar.
                </div>
              ) : anexos.map(a => {
                const Icon = iconeDoArquivo(a.mimeType)
                const isAtivo = a.id === ativo?.id
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect(a.id)}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                      isAtivo ? 'bg-cyan-500/10 border-l-2 border-cyan-500' : 'hover:bg-muted/40 border-l-2 border-transparent',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', isAtivo ? 'text-cyan-600 dark:text-cyan-400' : 'text-muted-foreground')} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[12px] truncate leading-tight', isAtivo ? 'font-semibold text-foreground' : 'font-medium')}>{a.fileName}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                        {a.tamanho > 0 ? formatarBytes(a.tamanho) : '—'}
                        {a.autor?.name && ` · ${a.autor.name}`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Painel de preview */}
          <div className="flex flex-col bg-muted/10 min-w-0">
            {!ativo ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-muted-foreground">
                Selecione um arquivo à esquerda pra visualizar
              </div>
            ) : (
              <>
                {/* Toolbar superior do preview */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ativo.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ativo.mimeType || 'tipo desconhecido'}
                      {ativo.tamanho > 0 && ` · ${formatarBytes(ativo.tamanho)}`}
                      {' · '}{new Date(ativo.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <a
                    href={resolveAssetUrl(ativo.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Abrir em nova aba"
                  >
                    <ExternalLink className="h-3 w-3" /> Abrir
                  </a>
                  <a
                    href={resolveAssetUrl(ativo.fileUrl)}
                    download={ativo.fileName}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
                    title="Baixar"
                  >
                    <Download className="h-3 w-3" /> Baixar
                  </a>
                  {podeExcluirAtivo && (
                    <button
                      type="button"
                      onClick={() => onDelete(ativo)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="Excluir anexo (só o autor)"
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </button>
                  )}
                </div>

                {/* Corpo do preview por tipo */}
                <div className="flex-1 overflow-auto p-3 min-h-[400px]">
                  <AnexoPreview anexo={ativo} />
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AnexoPreview({ anexo }: { anexo: Anexo }) {
  const url = resolveAssetUrl(anexo.fileUrl)
  const cat = categoriaArquivo(anexo.mimeType)

  if (cat === 'image') {
    return (
      <div className="flex items-center justify-center h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={anexo.fileName} className="max-w-full max-h-[600px] object-contain rounded shadow-sm" />
      </div>
    )
  }
  if (cat === 'pdf') {
    return (
      <iframe src={url} title={anexo.fileName} className="w-full h-[640px] rounded border border-border bg-white" />
    )
  }
  if (cat === 'video') {
    return (
      <div className="flex items-center justify-center h-full">
        <video src={url} controls className="max-w-full max-h-[600px] rounded shadow-sm bg-black">
          Seu navegador não suporta vídeo HTML5.
        </video>
      </div>
    )
  }
  if (cat === 'audio') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <FileAudio className="h-16 w-16 text-muted-foreground/50" strokeWidth={1.5} />
        <audio src={url} controls className="w-full max-w-md">
          Seu navegador não suporta áudio HTML5.
        </audio>
      </div>
    )
  }
  // Fallback: ícone + mensagem + CTA
  const Icon = iconeDoArquivo(anexo.mimeType)
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8">
      <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center">
        <Icon className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Pré-visualização não disponível</p>
        <p className="text-xs text-muted-foreground mt-1">
          Este tipo de arquivo não pode ser exibido inline. Use os botões acima pra abrir ou baixar.
        </p>
      </div>
    </div>
  )
}

/**
 * Área dropzone embarcada no topo do painel de anexos. Click → file picker;
 * drop → upload direto. Cada arquivo: POST /api/upload → trpc helpdesk.addAnexo
 * (que dispara notificação pro outro lado: TI↔solicitante).
 */
function AnexosDropArea({ ticketId, onUploaded }: { ticketId: string; onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    // Bloqueia executáveis no client
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll']
    const MAX_BYTES = 20 * 1024 * 1024
    const ok = files.filter(f => {
      const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
      if (blocked.includes(ext)) {
        alerts.error('Bloqueado', `${f.name}: tipo não permitido.`)
        return false
      }
      if (f.size > MAX_BYTES) {
        alerts.error('Muito grande', `${f.name}: ${(f.size / 1024 / 1024).toFixed(1)}MB > 20MB.`)
        return false
      }
      return true
    })
    if (ok.length === 0) return

    setUploading(ok.length)
    const apiUrl = (await import('@/lib/api-url')).getApiUrl()
    let sucessos = 0
    for (const file of ok) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
        if (!res.ok) throw new Error(`Upload falhou (${res.status})`)
        const data = await res.json() as { url?: string; filename?: string }
        const fileUrl = data.url || (data.filename ? `${apiUrl}/api/upload/${data.filename}` : null)
        if (!fileUrl) throw new Error('URL ausente na resposta')
        await (trpc.helpdesk as any).addAnexo.mutate({
          ticketId,
          fileName: file.name,
          fileUrl,
          mimeType: file.type || null,
          tamanho: file.size,
        })
        sucessos++
      } catch (e) {
        alerts.error('Erro no anexo', `${file.name}: ${(e as Error).message}`)
      }
    }
    setUploading(0)
    if (sucessos > 0) {
      onUploaded()
    }
  }, [ticketId, onUploaded])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    function onDragEnter(e: DragEvent) { e.preventDefault(); setDragging(true) }
    function onDragOver(e: DragEvent) { e.preventDefault() }
    function onDragLeave(e: DragEvent) {
      e.preventDefault()
      const r = el!.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setDragging(false)
    }
    function onDrop(e: DragEvent) {
      e.preventDefault(); setDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) void handleFiles(files)
    }
    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [handleFiles])

  return (
    <div
      ref={areaRef}
      onClick={() => uploading === 0 && fileInputRef.current?.click()}
      className={cn(
        'cursor-pointer m-2 rounded-md border-2 border-dashed transition-colors px-3 py-4 flex flex-col items-center gap-1.5 text-center',
        dragging
          ? 'border-cyan-400 bg-cyan-50/50 dark:bg-cyan-950/30'
          : 'border-border/60 hover:border-cyan-300 hover:bg-muted/30',
      )}
    >
      {uploading > 0 ? (
        <>
          <Loader2 className="h-5 w-5 text-cyan-600 animate-spin" />
          <span className="text-[11px] text-muted-foreground">Enviando {uploading}…</span>
        </>
      ) : (
        <>
          <Paperclip className={cn('h-5 w-5', dragging ? 'text-cyan-600' : 'text-muted-foreground')} />
          <div className="text-[11px] leading-tight text-muted-foreground">
            <span className="font-medium text-foreground">Clique pra anexar</span>
            <br />ou solte aqui
          </div>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length > 0) void handleFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
