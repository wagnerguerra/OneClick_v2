'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, FileText, Loader2, FileSignature, Download, RefreshCw, Send, Copy as CopyIcon,
  ShieldCheck, MoreVertical, X, History, Lock, CheckCircle2,
  Briefcase, FileCheck2, ExternalLink, Archive, Building2,
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import {
  Button, Badge, Card, Label,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Tabs, TabsTrigger, TabsContent, SlidingTabsList,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { copyToClipboard } from '@/lib/clipboard'
import Swal from 'sweetalert2'
import { CONTRATO_STATUS_LABELS, CONTRATO_STATUS_COLORS, CLAUSULA_CATEGORIA_LABELS, type ContratoStatus, type ClausulaCategoria } from '@saas/types'
import { AssinarWebPkiModal } from '../_components/assinar-webpki-modal'

// ============================================================
// Constantes (padrão visual /orcamentos)
// ============================================================

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'
const MODULE_RGBA = 'rgba(251, 113, 133, .18)'

// ============================================================
// Tipos
// ============================================================

interface Snapshot {
  id: string
  codigo: string
  versao: number
  titulo: string
  conteudo: string
  categoria: ClausulaCategoria
  ordem: number
  parentId: string | null
}

interface Assinatura {
  id: string
  parte: 'CONTRATADA' | 'CONTRATANTE'
  tipo: 'WEBPKI' | 'GOVBR' | 'SERPROID' | 'SERVER' | 'ACEITE'
  signatarioNome: string
  signatarioDoc: string | null
  signatarioEmail: string | null
  certSubject: string | null
  certIssuer: string | null
  hashPdf: string | null
  ip: string | null
  assinadoEm: string
}

interface Evento {
  id: string
  tipo: string
  descricao: string | null
  createdAt: string
  metadata: any
}

interface Contrato {
  id: string
  numero: number
  token: string
  status: ContratoStatus
  dataInicio: string | null
  dataFim: string | null
  honorarioMensal: string | number | null
  honorarioFormaPagamento: string | null
  diaVencimento: number | null
  pdfUrl: string | null
  pdfHash: string | null
  contratanteRazaoSocial: string | null
  contratanteCnpj: string | null
  observacoes: string | null
  createdAt: string
  cliente: { id: string; razaoSocial: string; documento: string | null }
  template: { id: string; nome: string }
  orcamento: { id: string; numero: number } | null
  snapshots: Snapshot[]
  servicos: Array<{ id: string; nomeServico: string; categoria: string | null; servico: { id: string; nome: string } }>
  assinaturas: Assinatura[]
  eventos: Evento[]
}

// ============================================================
// Componente principal
// ============================================================

export default function ContratoDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const id = params.id

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [signParte, setSignParte] = useState<'CONTRATADA' | 'CONTRATANTE'>('CONTRATADA')
  const [activeTab, setActiveTab] = useState('detalhes')
  const [serproIdLoading, setSerproIdLoading] = useState(false)
  const [serverSignLoading, setServerSignLoading] = useState(false)

  // Seções de cláusulas expandidas (todas começam retraídas).
  // Set<categoria>: presença = expandida.
  const [clausulasExpandidas, setClausulasExpandidas] = useState<Set<string>>(new Set())
  function toggleClausula(cat: string) {
    setClausulasExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const c = await (trpc.contrato as any).getContrato.query({ id })
      setContrato(c)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  // Detecta retorno OAuth do SerproID (?code=...&state=srpid_...)
  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (code && state && state.startsWith('srpid_')) {
      ;(async () => {
        setSerproIdLoading(true)
        try {
          await (trpc.contrato as any).processarCallbackSerproId.mutate({ code, state })
          window.history.replaceState({}, '', window.location.pathname)
          await alerts.success('Assinatura realizada!', 'Contrato assinado via SerproID.')
          fetchData()
        } catch (e) {
          alerts.error('Erro na assinatura SerproID', (e as Error).message)
        } finally { setSerproIdLoading(false) }
      })()
    }
  }, [searchParams, fetchData])

  async function handleAssinarServerSide(parte: 'CONTRATADA' | 'CONTRATANTE') {
    // Server-side assina o PDF com node-signpdf usando o cert da empresa
    // cadastrado em /configuracoes (CERTIFICADO_PATH/CERTIFICADO_SENHA).
    if (!contrato?.pdfUrl) {
      const ok = await alerts.confirm({
        title: 'Gerar PDF antes de assinar?',
        text: 'É preciso gerar o PDF do contrato antes da assinatura. Gerar agora?',
        confirmText: 'Gerar PDF',
        icon: 'question',
      })
      if (!ok) return
      await handleGerarPdf()
    }
    setServerSignLoading(true)
    try {
      await (trpc.contrato as any).assinarServerSide.mutate({ contratoId: id, parte })
      await alerts.success('Assinatura realizada!', 'Contrato assinado pela Central Contábil.')
      fetchData()
    } catch (e) {
      alerts.error('Erro na assinatura', (e as Error).message)
    } finally { setServerSignLoading(false) }
  }

  async function handleAssinarSerproId(parte: 'CONTRATADA' | 'CONTRATANTE') {
    // Garante PDF antes de iniciar OAuth (após o redirect, o backend usa o hash)
    if (!contrato?.pdfHash) {
      const ok = await alerts.confirm({
        title: 'Gerar PDF antes de assinar?',
        text: 'É preciso gerar o PDF do contrato antes de assinar via SerproID. Gerar agora?',
        confirmText: 'Gerar PDF',
        icon: 'question',
      })
      if (!ok) return
      await handleGerarPdf()
    }
    setSerproIdLoading(true)
    try {
      const r = await (trpc.contrato as any).iniciarAssinaturaSerproId.mutate({ contratoId: id, parte })
      window.location.href = r.authUrl
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setSerproIdLoading(false)
    }
  }

  async function handleGerarPdf() {
    setGeneratingPdf(true)
    try {
      await (trpc.contrato as any).gerarPdf.mutate({ id })
      await alerts.success('PDF gerado', 'Documento atualizado com as cláusulas e assinaturas atuais.')
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setGeneratingPdf(false) }
  }

  async function abrirAssinatura(parte: 'CONTRATADA' | 'CONTRATANTE') {
    if (!contrato?.pdfHash) {
      const ok = await alerts.confirm({
        title: 'Gerar PDF antes de assinar?',
        text: 'É preciso gerar o PDF do contrato antes de assinar. Gerar agora?',
        confirmText: 'Gerar PDF',
        icon: 'question',
      })
      if (!ok) return
      await handleGerarPdf()
      const c2 = await (trpc.contrato as any).getContrato.query({ id })
      setContrato(c2)
      if (!c2.pdfHash) return
    }
    setSignParte(parte)
    setSignOpen(true)
  }

  async function copiarLinkCliente() {
    if (!contrato) return
    const url = `${window.location.origin}/contratos/publico/${contrato.token}`
    const ok = await copyToClipboard(url)
    if (ok) {
      alerts.success('Link copiado', url)
    } else {
      // Fallback final: mostra modal com input pra copiar manualmente
      Swal.fire({
        icon: 'info',
        title: 'Copie manualmente',
        html: `<input id="copy-url" type="text" value="${url}" readonly style="width:100%;padding:8px;font-family:monospace;font-size:12px;border:1px solid #d1d5db;border-radius:4px" />`,
        confirmButtonText: 'OK',
        confirmButtonColor: '#fb7185',
        didOpen: () => {
          const el = document.getElementById('copy-url') as HTMLInputElement | null
          el?.focus()
          el?.select()
        },
      })
    }
  }

  async function handleEnviarParaCliente() {
    if (!contrato) return
    if (!contrato.assinaturas.some(a => a.parte === 'CONTRATADA')) {
      alerts.error('Erro', 'A CONTRATADA precisa assinar antes de enviar para o cliente.')
      return
    }
    try {
      await (trpc.contrato as any).changeStatus.mutate({ id, status: 'AGUARDANDO_ASSINATURA' })
      await alerts.success('Enviado!', 'Contrato pronto para o cliente assinar. Compartilhe o link público.')
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function handleEncerrar() {
    if (!contrato) return
    const result = await Swal.fire({
      title: 'Encerrar contrato?',
      input: 'text',
      inputLabel: 'Motivo do encerramento',
      inputPlaceholder: 'Ex: distrato, fim de vigência...',
      showCancelButton: true,
      confirmButtonText: 'Encerrar',
      cancelButtonText: 'Voltar',
      confirmButtonColor: MODULE_COLOR,
      icon: 'question',
    })
    if (!result.isConfirmed) return
    try {
      await (trpc.contrato as any).changeStatus.mutate({ id, status: 'ENCERRADO', motivo: result.value || '' })
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleCancelar() {
    if (!contrato) return
    const result = await Swal.fire({
      title: 'Cancelar contrato?',
      input: 'text',
      inputLabel: 'Motivo do cancelamento',
      inputPlaceholder: 'Ex: solicitação do cliente, erro no orçamento...',
      showCancelButton: true,
      confirmButtonText: 'Cancelar contrato',
      cancelButtonText: 'Voltar',
      confirmButtonColor: '#ef4444',
      icon: 'warning',
    })
    if (!result.isConfirmed) return
    try {
      await (trpc.contrato as any).changeStatus.mutate({ id, status: 'CANCELADO', motivo: result.value || '' })
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (loading || !contrato) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando contrato...
      </div>
    )
  }

  const cor = CONTRATO_STATUS_COLORS[contrato.status]
  const assinaturaContratada = contrato.assinaturas.find(a => a.parte === 'CONTRATADA')
  const assinaturaContratante = contrato.assinaturas.find(a => a.parte === 'CONTRATANTE')

  // Estados de fluxo
  const isLocked = contrato.status === 'ASSINADO' || contrato.status === 'VIGENTE' || contrato.status === 'ENCERRADO' || contrato.status === 'CANCELADO'
  const podeAssinarContratada = contrato.status === 'RASCUNHO' || (contrato.status === 'AGUARDANDO_ASSINATURA' && !assinaturaContratada)
  const podeEnviarCliente = contrato.status === 'RASCUNHO' && !!assinaturaContratada

  // Agrupa snapshots por categoria
  const grupos = new Map<string, Snapshot[]>()
  for (const s of contrato.snapshots) {
    if (!grupos.has(s.categoria)) grupos.set(s.categoria, [])
    grupos.get(s.categoria)!.push(s)
  }
  const gruposOrdenados = Array.from(grupos.entries())

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
      {/* ══════════════════════════════════════════════════════════
          Wrapper bleed-edge cobrindo Header + Tabs (padrão /orcamentos)
          ══════════════════════════════════════════════════════════ */}
      <div
        className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden"
        style={{ backgroundColor: MODULE_RGBA }}
      >
        <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {/* Avatar + título + meta + status */}
            <div className="flex items-start gap-4">
              <div
                className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg"
                style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}
              >
                <FileText className="h-10 w-10" style={{ color: MODULE_COLOR }} />
              </div>
              <div>
                <h1 className="text-xl font-semibold uppercase">{contrato.cliente.razaoSocial}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Contrato #{String(contrato.numero).padStart(5, '0')}
                  {contrato.contratanteCnpj && (<>&nbsp;&nbsp;|&nbsp;&nbsp;{contrato.contratanteCnpj}</>)}
                  &nbsp;&nbsp;|&nbsp;&nbsp;Criado em: {new Date(contrato.createdAt).toLocaleDateString('pt-BR')}, {new Date(contrato.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {/* Status badge */}
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase text-white"
                    style={{ backgroundColor: cor }}
                  >
                    {CONTRATO_STATUS_LABELS[contrato.status]}
                  </span>
                  {/* Modelo */}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-3 py-1 text-xs font-medium uppercase border border-slate-200 dark:border-slate-700">
                    {contrato.template.nome}
                  </span>
                  {/* Orçamento vinculado */}
                  {contrato.orcamento && (
                    <button
                      type="button"
                      onClick={() => router.push(`/orcamentos/${contrato.orcamento!.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-xs font-medium uppercase hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" /> Orçamento #{String(contrato.orcamento.numero).padStart(4, '0')}
                    </button>
                  )}
                  {/* PDF Hash */}
                  {contrato.pdfHash && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 text-[10px] font-mono">
                      <FileCheck2 className="h-3 w-3" /> {contrato.pdfHash.slice(0, 12)}…
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ações contextuais */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Gerar/Regerar PDF — sempre disponível enquanto não estiver cancelado */}
              {contrato.status !== 'CANCELADO' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 bg-white dark:bg-card hover:bg-white/90"
                  onClick={handleGerarPdf}
                  disabled={generatingPdf}
                >
                  {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {contrato.pdfUrl ? 'Regerar PDF' : 'Gerar PDF'}
                </Button>
              )}

              {contrato.pdfUrl && (
                <Button size="sm" variant="outline" className="gap-1.5 bg-white dark:bg-card hover:bg-white/90" asChild>
                  <a href={contrato.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" /> PDF
                  </a>
                </Button>
              )}

              {/* RASCUNHO → CONTRATADA assina.
                  Server-side é o caminho recomendado: backend usa cert do .env (CERTIFICADO_PATH).
                  Web PKI fica como alternativa pra quem prefere assinar com cert local. */}
              {podeAssinarContratada && (
                <>
                  <Button
                    size="sm"
                    style={{ backgroundColor: MODULE_COLOR }}
                    className="text-white gap-1.5"
                    onClick={() => handleAssinarServerSide('CONTRATADA')}
                    disabled={serverSignLoading}
                    title="Assina o PDF com o certificado da Central Contábil cadastrado no servidor"
                  >
                    {serverSignLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                    Assinar como Central
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 bg-white dark:bg-card hover:bg-white/90"
                    onClick={() => abrirAssinatura('CONTRATADA')}
                    title="Assinar com certificado instalado neste computador (Web PKI)"
                  >
                    <Building2 className="h-4 w-4" /> Cert Local
                  </Button>
                </>
              )}

              {/* CONTRATADA assinou e ainda RASCUNHO → enviar pro cliente */}
              {podeEnviarCliente && (
                <Button
                  size="sm"
                  variant="success"
                  className="gap-1.5"
                  onClick={handleEnviarParaCliente}
                >
                  <Send className="h-4 w-4" /> Enviar p/ cliente
                </Button>
              )}

              {/* VIGENTE → encerrar */}
              {contrato.status === 'VIGENTE' && (
                <Button size="sm" variant="outline" className="gap-1.5 bg-white dark:bg-card" onClick={handleEncerrar}>
                  <Archive className="h-4 w-4" /> Encerrar
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" title="Mais opções" className="bg-white dark:bg-card hover:bg-white/90 dark:hover:bg-card/90">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={copiarLinkCliente}>
                    <CopyIcon className="h-4 w-4 mr-2" /> Copiar link do cliente
                  </DropdownMenuItem>
                  {contrato.status !== 'RASCUNHO' && contrato.status !== 'AGUARDANDO_ASSINATURA' && (
                    <DropdownMenuItem onClick={() => router.push(`/contratos/publico/${contrato.token}`)}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Abrir página pública
                    </DropdownMenuItem>
                  )}
                  {contrato.status !== 'CANCELADO' && contrato.status !== 'ENCERRADO' && (
                    <DropdownMenuItem onClick={handleCancelar} className="text-destructive">
                      <X className="h-4 w-4 mr-2" /> Cancelar contrato
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => router.push('/contratos')}
                title="Voltar"
                className="bg-white dark:bg-card hover:bg-white/90 dark:hover:bg-card/90"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* SlidingTabsList — padrão pills centralizado */}
        <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
          <SlidingTabsList
            activeValue={activeTab}
            className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit"
          >
            <TabsTrigger
              value="detalhes"
              className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" /> Detalhes
            </TabsTrigger>
            <TabsTrigger
              value="clausulas"
              className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5"
            >
              <FileCheck2 className="h-3.5 w-3.5" /> Cláusulas
              <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{contrato.snapshots.length}</Badge>
            </TabsTrigger>
            <TabsTrigger
              value="assinaturas"
              className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5"
            >
              <FileSignature className="h-3.5 w-3.5" /> Assinaturas
              <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{contrato.assinaturas.length}/2</Badge>
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-rose-600 dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-rose-400 gap-1.5"
            >
              <History className="h-3.5 w-3.5" /> Timeline
              <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{contrato.eventos.length}</Badge>
            </TabsTrigger>
          </SlidingTabsList>
        </div>
      </div>
      {/* /wrapper imagem */}

      {/* ══════════════════════════════════════════════════════════
          Banner de "contrato congelado" — quando ASSINADO ou superior
          ══════════════════════════════════════════════════════════ */}
      {isLocked && contrato.status !== 'CANCELADO' && (
        <Card className="relative overflow-hidden border-slate-200/80 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/40 dark:to-slate-900/10 dark:border-slate-700/40 shadow-sm">
          <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: MODULE_COLOR }} />
          <div className="flex items-center gap-4 p-4 pl-5">
            <div
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-sm"
              style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 8%, transparent)` }}
            >
              <Lock className="h-5 w-5" style={{ color: MODULE_COLOR }} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">Contrato congelado para edição</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Após assinatura, o conteúdo das cláusulas não pode mais ser alterado. Para mudanças, gere um aditivo ou novo contrato.
              </p>
            </div>
          </div>
        </Card>
      )}

      {contrato.status === 'CANCELADO' && (
        <Card className="relative overflow-hidden border-rose-200/80 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/40 dark:to-rose-950/10 shadow-sm">
          <div className="absolute inset-y-0 left-0 w-1 bg-rose-500" />
          <div className="flex items-center gap-4 p-4 pl-5">
            <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-rose-950 shadow-sm bg-rose-500/15">
              <X className="h-5 w-5 text-rose-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">Contrato cancelado</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Este contrato foi cancelado e não pode mais ser usado.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: Detalhes
          ══════════════════════════════════════════════════════════ */}
      <TabsContent value="detalhes" className="space-y-4 mt-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="border-b px-4 py-2.5 flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-sm font-semibold">Dados gerais</h3>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Cliente" value={contrato.cliente.razaoSocial} />
                <Field label="CNPJ" value={contrato.contratanteCnpj || contrato.cliente.documento || '—'} mono />
                <Field label="Modelo" value={contrato.template.nome} />
                <Field label="Início" value={contrato.dataInicio ? new Date(contrato.dataInicio).toLocaleDateString('pt-BR') : '—'} />
                <Field label="Fim" value={contrato.dataFim ? new Date(contrato.dataFim).toLocaleDateString('pt-BR') : 'Indeterminado'} />
                <Field
                  label="Honorário mensal"
                  value={contrato.honorarioMensal ? Number(contrato.honorarioMensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                />
                {contrato.honorarioFormaPagamento && (
                  <Field label="Forma de pagamento" value={contrato.honorarioFormaPagamento} />
                )}
                {contrato.diaVencimento && (
                  <Field label="Vencimento" value={`Dia ${contrato.diaVencimento}`} />
                )}
              </div>
            </Card>

            {contrato.servicos.length > 0 && (
              <Card>
                <div className="border-b px-4 py-2.5 flex items-center gap-2">
                  <Briefcase className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                  <h3 className="text-sm font-semibold">Serviços contratados</h3>
                  <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{contrato.servicos.length}</Badge>
                </div>
                <div className="divide-y divide-border/60">
                  {contrato.servicos.map(s => (
                    <div key={s.id} className="px-4 py-2.5 flex items-center gap-2">
                      {s.categoria && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{s.categoria}</Badge>
                      )}
                      <span className="text-sm">{s.nomeServico}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {contrato.observacoes && (
              <Card className="p-4">
                <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">Observações</Label>
                <p className="text-sm whitespace-pre-wrap">{contrato.observacoes}</p>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Status visual com chave */}
            <Card className="p-4 space-y-2">
              <Label className="text-[10px] text-muted-foreground uppercase">Estado atual</Label>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase text-white"
                  style={{ backgroundColor: cor }}
                >
                  {CONTRATO_STATUS_LABELS[contrato.status]}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {statusDescricao(contrato.status)}
              </p>
            </Card>

            {/* Resumo de assinaturas */}
            <Card className="p-4 space-y-2">
              <Label className="text-[10px] text-muted-foreground uppercase">Assinaturas</Label>
              <div className="space-y-1.5">
                <ResumoAssinatura titulo="CONTRATADA" assinatura={assinaturaContratada} />
                <ResumoAssinatura titulo="CONTRATANTE" assinatura={assinaturaContratante} />
              </div>
            </Card>

            {/* Auditoria */}
            {contrato.pdfHash && (
              <Card className="p-4 space-y-2">
                <Label className="text-[10px] text-muted-foreground uppercase">Auditoria do PDF</Label>
                <div>
                  <p className="text-[10px] text-muted-foreground">Hash SHA-256</p>
                  <p className="text-[10px] font-mono break-all leading-tight mt-0.5">{contrato.pdfHash}</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </TabsContent>

      {/* ══════════════════════════════════════════════════════════
          TAB: Cláusulas
          ══════════════════════════════════════════════════════════ */}
      <TabsContent value="clausulas" className="space-y-3 mt-0">
        {gruposOrdenados.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma cláusula no contrato. Verifique o template usado.
          </Card>
        ) : (
          <>
            {/* Barra de ações: expandir/recolher todas */}
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setClausulasExpandidas(new Set(gruposOrdenados.map(([cat]) => cat)))}
                disabled={clausulasExpandidas.size === gruposOrdenados.length}
              >
                <ChevronsUpDown className="h-3.5 w-3.5" /> Expandir tudo
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setClausulasExpandidas(new Set())}
                disabled={clausulasExpandidas.size === 0}
              >
                <ChevronsDownUp className="h-3.5 w-3.5" /> Recolher tudo
              </Button>
            </div>

            {gruposOrdenados.map(([cat, items], catIdx) => {
              const isOpen = clausulasExpandidas.has(cat)
              return (
                <Card key={cat} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleClausula(cat)}
                    className={cn(
                      'w-full border-b bg-muted/30 px-4 py-2.5 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left cursor-pointer',
                      !isOpen && 'border-b-transparent',
                    )}
                  >
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <h3 className="text-xs font-semibold uppercase tracking-wider flex-1">
                      Cláusula {catIdx + 1}ª — {CLAUSULA_CATEGORIA_LABELS[cat as ClausulaCategoria] || cat}
                    </h3>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{items.length}</Badge>
                  </button>
                  {isOpen && (
                    <div className="p-4 space-y-4">
                      {items.sort((a, b) => a.ordem - b.ordem).map(s => (
                        <div key={s.id}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{s.codigo}</code>
                            <span className="text-[10px] text-muted-foreground">v{s.versao}</span>
                            <h4 className="text-sm font-semibold flex-1">{s.titulo}</h4>
                          </div>
                          <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderPlaceholders(s.conteudo, contrato) }} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </>
        )}
      </TabsContent>

      {/* ══════════════════════════════════════════════════════════
          TAB: Assinaturas
          ══════════════════════════════════════════════════════════ */}
      <TabsContent value="assinaturas" className="space-y-4 mt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BlocoAssinatura
            titulo="CONTRATADA"
            assinatura={assinaturaContratada}
            onAssinar={() => abrirAssinatura('CONTRATADA')}
            podeAssinar={podeAssinarContratada}
          />
          <BlocoAssinatura
            titulo="CONTRATANTE"
            assinatura={assinaturaContratante}
            onAssinar={() => abrirAssinatura('CONTRATANTE')}
            podeAssinar={contrato.status === 'AGUARDANDO_ASSINATURA' && !!assinaturaContratada}
            notaCliente="Cliente assina pelo link público"
          />
        </div>

        {(assinaturaContratada || assinaturaContratante) && (
          <Card className="p-4">
            <Label className="text-[10px] text-muted-foreground uppercase mb-2 block">Histórico de assinaturas</Label>
            <div className="space-y-2">
              {contrato.assinaturas.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs border-l-2 border-emerald-400 pl-3 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold">{a.parte}:</span>
                  <span>{a.signatarioNome}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{labelTipoAssinatura(a.tipo)}</span>
                  <span className="text-muted-foreground ml-auto whitespace-nowrap">{new Date(a.assinadoEm).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </TabsContent>

      {/* ══════════════════════════════════════════════════════════
          TAB: Timeline
          ══════════════════════════════════════════════════════════ */}
      <TabsContent value="timeline" className="space-y-2 mt-0">
        {contrato.eventos.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum evento registrado</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border/60">
              {contrato.eventos.map(e => (
                <div key={e.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors">
                  <div
                    className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', getTipoEventoCor(e.tipo))}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{tipoEventoLabel(e.tipo)}</p>
                    {e.descricao && <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(e.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </TabsContent>

      {/* Modal de assinatura Web PKI */}
      {contrato.pdfHash && (
        <AssinarWebPkiModal
          open={signOpen}
          onOpenChange={setSignOpen}
          contratoId={contrato.id}
          parte={signParte}
          hashPdf={contrato.pdfHash}
          onSucesso={fetchData}
        />
      )}
    </Tabs>
  )
}

// ============================================================
// Subcomponentes
// ============================================================

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground uppercase">{label}</Label>
      <p className={cn('text-sm font-medium', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

function ResumoAssinatura({ titulo, assinatura }: { titulo: string; assinatura: Assinatura | undefined }) {
  if (assinatura) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</span>
        <span className="text-xs truncate">{assinatura.signatarioNome}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      <span className="text-xs text-muted-foreground italic">aguardando</span>
    </div>
  )
}

function BlocoAssinatura({ titulo, assinatura, onAssinar, podeAssinar, notaCliente }: {
  titulo: string
  assinatura: Assinatura | undefined
  onAssinar: () => void
  podeAssinar: boolean
  notaCliente?: string
}) {
  if (assinatura) {
    return (
      <div className="rounded-md border-2 border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">{titulo}</p>
        </div>
        <p className="text-sm font-semibold">{assinatura.signatarioNome}</p>
        {assinatura.signatarioDoc && (
          <p className="text-[11px] font-mono text-muted-foreground">{assinatura.signatarioDoc}</p>
        )}
        <p className="text-[10px] text-muted-foreground">
          Tipo: <strong>{labelTipoAssinatura(assinatura.tipo)}</strong>
        </p>
        {assinatura.certIssuer && (
          <p className="text-[10px] text-muted-foreground line-clamp-1" title={assinatura.certIssuer}>
            Emitido por: {assinatura.certIssuer.match(/CN=([^,]+)/i)?.[1] || assinatura.certIssuer}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {new Date(assinatura.assinadoEm).toLocaleString('pt-BR')}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border-2 border-dashed border-muted-foreground/30 p-4 text-center">
      <FileSignature className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{titulo}</p>
      <p className="text-xs text-muted-foreground mb-3">Aguardando assinatura</p>
      {podeAssinar ? (
        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onAssinar}>
          <FileSignature className="h-3.5 w-3.5" /> Assinar agora
        </Button>
      ) : notaCliente ? (
        <p className="text-[10px] text-muted-foreground italic">{notaCliente}</p>
      ) : null}
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================

function labelTipoAssinatura(tipo: 'WEBPKI' | 'GOVBR' | 'SERPROID' | 'SERVER' | 'ACEITE'): string {
  switch (tipo) {
    case 'WEBPKI': return 'ICP-Brasil (Cert Local)'
    case 'GOVBR': return 'gov.br'
    case 'SERPROID': return 'SerproID'
    case 'SERVER': return 'ICP-Brasil (Servidor)'
    case 'ACEITE': return 'Aceite Eletrônico'
  }
}

function statusDescricao(status: ContratoStatus): string {
  switch (status) {
    case 'RASCUNHO': return 'Em edição. Gere o PDF e assine como CONTRATADA antes de enviar para o cliente.'
    case 'AGUARDANDO_ASSINATURA': return 'Aguardando o cliente assinar pelo link público.'
    case 'ASSINADO': return 'Ambas as partes assinaram. Aguardando data de início para entrar em vigência.'
    case 'VIGENTE': return 'Contrato ativo. Cobranças e SLAs em execução.'
    case 'ENCERRADO': return 'Contrato finalizado.'
    case 'CANCELADO': return 'Contrato cancelado e não pode mais ser usado.'
  }
}

function tipoEventoLabel(tipo: string): string {
  const map: Record<string, string> = {
    criado: 'Contrato criado',
    pdf_gerado: 'PDF gerado',
    assinado_contratada: 'Assinado pela CONTRATADA',
    assinado_cliente: 'Assinado pelo CLIENTE',
    aceite_cliente: 'Cliente aceitou proposta',
    status_aguardando_assinatura: 'Enviado para assinatura',
    status_assinado: 'Contrato assinado',
    status_vigente: 'Contrato vigente',
    status_encerrado: 'Contrato encerrado',
    status_cancelado: 'Contrato cancelado',
  }
  return map[tipo] || tipo.replace(/_/g, ' ')
}

function getTipoEventoCor(tipo: string): string {
  if (tipo.startsWith('assinado') || tipo === 'aceite_cliente') return 'bg-emerald-500'
  if (tipo === 'status_cancelado') return 'bg-rose-500'
  if (tipo === 'status_vigente') return 'bg-emerald-600'
  if (tipo === 'pdf_gerado') return 'bg-blue-500'
  return 'bg-rose-400'
}

// Mesma lógica do backend (renderPlaceholders) para preview
function renderPlaceholders(html: string, c: Contrato): string {
  const map: Record<string, string> = {
    'cliente.razao_social': c.contratanteRazaoSocial || c.cliente.razaoSocial || '',
    'cliente.cnpj': c.contratanteCnpj || c.cliente.documento || '',
    'cliente.endereco': '',
    'cliente.representante': '',
    'cliente.cpf_rep': '',
    'contrato.numero': String(c.numero || '').padStart(5, '0'),
    'contrato.data_inicio': c.dataInicio ? new Date(c.dataInicio).toLocaleDateString('pt-BR') : '___/___/_____',
    'contrato.data_fim': c.dataFim ? new Date(c.dataFim).toLocaleDateString('pt-BR') : 'prazo indeterminado',
    'honorario.valor': c.honorarioMensal ? Number(c.honorarioMensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ____,__',
    'honorario.forma_pagamento': c.honorarioFormaPagamento || '',
    'honorario.dia_vencimento': c.diaVencimento ? `dia ${c.diaVencimento}` : 'dia ____',
  }
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? `{{${k}}}`)
}
