'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Handshake, Save, ArrowLeft, Search as SearchIcon, Camera,
  FileText, ShoppingCart, Receipt, Plus, Send,
  Briefcase, FileBarChart, History, File, Calculator, Shield,
  ListChecks, StickyNote, FileInput, MessageSquareQuote, Users, ListTodo,
  ExternalLink, X, Loader2, Building2, Phone, Star, Pencil, Trash2, Link2, Check, Hash, Calendar, ClipboardCheck, Sparkles, Paperclip,
  CircleUser, CheckCircle2, XCircle, Download, Mail, AlertTriangle, MailWarning, Clock, MailOpen, HardDriveDownload,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, MoreVertical,
  Image as ImageIcon, Activity, Percent, ShieldCheck,
  Lock, RotateCcw, Ban,
} from 'lucide-react'
import {
  cn, Button, Input, Label, Card, CardHeader, Checkbox, RichEditor, Badge,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tabs, TabsContent, TooltipProvider,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  RichContent,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { CertDetalhesModal } from '@/components/certificado/cert-detalhes-modal'
import { CertCadastroModal } from '@/components/certificado/cert-cadastro-modal'
import { ParametrosContratoModal } from '@/components/contrato/parametros-contrato-modal'
import { VerificarErpModal } from '@/components/contrato/verificar-erp-modal'
import { OrcamentosTab } from './orcamentos-tab'
import { InativarClienteModal } from './inativar-cliente-modal'
import { ReativarClienteModal } from './reativar-cliente-modal'
import { EVENT_BADGE_CLASS, INATIVAR_BTN_CLASS } from './cliente-status-ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { toDateInputValue } from '@/lib/date'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { classificarArquivo } from '@/lib/arquivo-tipo'
import { mensagemErro } from '@/lib/errors'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { useClientesPerms } from './use-clientes-perms'
import { useBeneficioFiscalPerms } from '@/hooks/use-beneficio-fiscal'
import { ServicosCard } from './servicos-card'
import { ParticularidadesCard } from './particularidades-card'
import { LegalizacaoCard } from './legalizacao-card'
import { CnpjFilialSelect } from './cnpj-filial-select'
import { ContabilCard } from './contabil-card'
import { ObrigacoesClienteSection } from './obrigacoes-cliente-section'
import { ProtocolosCard } from './protocolos-card'
import { DriveSyncCard } from './drive-sync-card'
import { ContratoChartModal } from './contrato-charts'
import { masks, limparCnpj } from '@/lib/masks'
import {
  createClienteSchema,
  SITUACAO_LABELS, SITUACAO_COLORS,
  STATUS_LABELS, STATUS_COLORS,
  REGIME_LABELS,
  type CreateClienteInput,
} from '@saas/types'

function RequiredMark() {
  return <span className="text-destructive ml-0.5">*</span>
}

function PlaceholderTab({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/20 mb-3" />
      <h4 className="text-sm font-semibold text-muted-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-md">{description}</p>
    </Card>
  )
}

// Opções de enums do legado
const TIPO_CLIENTE_OPTIONS = [
  { value: 'A DEFINIR', label: 'A DEFINIR' },
  { value: 'MATRIZ', label: 'MATRIZ' },
  { value: 'FILIAL', label: 'FILIAL' },
  { value: 'UNICO', label: 'ÚNICO' },
]

const CATEGORIA_OPTIONS = [
  { value: 'NAO_INFORMADO', label: 'NÃO INFORMADO' },
  { value: 'STANDARD', label: 'STANDARD' },
  { value: 'ADVANCED', label: 'ADVANCED' },
  { value: 'PREMIUM', label: 'PREMIUM' },
]

// ORIGEM_OPTIONS carregado dinamicamente do banco via loadOpcoes

const TRIBUTACAO_OPTIONS = [
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
  { value: 'MEI', label: 'MEI' },
  { value: 'IMUNE', label: 'Imune' },
  { value: 'ISENTA', label: 'Isenta' },
]

interface CnpjCardData {
  cnpj: string; razaoSocial: string; nomeFantasia: string | null; situacao: string; dataAbertura: string | null
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null
  bairro: string | null; municipio: string | null; uf: string | null
  naturezaJuridica: string | null; atividadePrincipal: string | null; porte: string | null
  capitalSocial: number | null; cnaePrincipalCodigo: string | null
  cnaesSecundarios: Array<{ codigo: string; descricao: string }>
  qsa: Array<{ nome: string; cpfCnpj: string; qualificacao: string; percentualCapital: number | null }>
  fonte: string
  gateAviso?: string
}

interface ClienteFormProps {
  mode: 'create' | 'edit'
  clienteId?: string
  defaultValues?: Partial<CreateClienteInput> & { code?: number; version?: number; createdAt?: string }
  // #HLP0209/0211 — motivo da inativação (estado derivado do getById, vindo do
  // último evento 'inactivated'). Só usado no aviso "Cliente inativado".
  motivoInativacao?: string | null
}

const PROGRESS_FIELDS = [
  'razaoSocial', 'documento', 'nomeFantasia', 'tipoCliente',
  'situacao', 'status', 'grupo', 'tributacao',
  'cep', 'logradouro', 'bairro', 'cidade', 'uf',
  'telefone', 'email', 'origem',
] as const

export function ClienteForm({ mode, clienteId, defaultValues, motivoInativacao }: ClienteFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('detalhes')
  // #HLP0209/0211 — motivo exibido no aviso "Cliente inativado". Estado local
  // (não é campo do form): inativar seta, reativar limpa, sem recarregar.
  const [motivoInativado, setMotivoInativado] = useState(motivoInativacao ?? '')
  // Modal de inativação (só o próprio cliente, no detalhe). `inativarDataInicial`
  // pré-preenche a data quando o gatilho vem do campo "Data de saída".
  const [inativarAberto, setInativarAberto] = useState(false)
  const [inativarDataInicial, setInativarDataInicial] = useState('')
  const [reativarAberto, setReativarAberto] = useState(false)
  function abrirInativar(dataInicial = '') { setInativarDataInicial(dataInicial); setInativarAberto(true) }
  const [clienteLogo, setClienteLogo] = useState<string | null>(defaultValues?.logoUrl || null)
  const [chatMsg, setChatMsg] = useState('')
  const [chatAsCliente, setChatAsCliente] = useState(false)

  // Capa do header — config global do modulo. Apenas Master pode editar.
  const { isMaster } = useUserPermissions()
  // Sub-permissões por aba (espelham o gateamento do backend). O hook usa o slug
  // correto ('clientes') e já trata master/empresa-master.
  // Detalhes → edit_details; Comercial → manage_commercial; Fiscal → manage_fiscal.
  // As demais abas (serviços, legalização, contábil, obrigações, protocolos,
  // particularidades) já gatilham internamente pelos seus próprios cards.
  const { canEditDetails, canManageCommercial, canManageFiscal } = useClientesPerms()
  const [headerCover, setHeaderCover] = useState<string>('')
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const cfg = await (trpc.cliente as any).getHeaderCover.query()
        setHeaderCover(cfg?.headerCover || '')
      } catch { /* silent */ }
    })()
  }, [])

  async function handleCoverUpload(file: File) {
    setUploadingCover(true)
    try {
      const apiUrl = getApiUrl()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error(`Falha no upload (${res.status})`)
      const data = await res.json()
      const fileUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
      await (trpc.cliente as any).setHeaderCover.mutate({ url: fileUrl })
      setHeaderCover(fileUrl)
      alerts.success('Capa atualizada', 'A imagem de fundo do header foi atualizada')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setUploadingCover(false) }
  }

  async function handleCoverRemove() {
    const ok = await alerts.confirm({ title: 'Remover capa?', text: 'A imagem de fundo personalizada será removida e voltará ao padrão.', icon: 'warning', confirmText: 'Remover' })
    if (!ok) return
    setUploadingCover(true)
    try {
      await (trpc.cliente as any).setHeaderCover.mutate({ url: null })
      setHeaderCover('')
      alerts.success('Capa removida', 'A imagem de fundo foi removida')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setUploadingCover(false) }
  }

  const { register, handleSubmit, formState: { errors }, control, setValue, watch } = useForm<CreateClienteInput>({
    resolver: zodResolver(createClienteSchema),
    defaultValues: {
      razaoSocial: '', nomeFantasia: '', documento: '', tipoDocumento: 'CNPJ',
      tipoCliente: 'A DEFINIR', situacao: 'MENSAL', status: 'ATIVO', grupo: '', origem: '',
      dataEntrada: '', dataSaida: '', observacoes: '',
      tributacao: undefined, regime: undefined,
      inscricaoEstadual: '', inscricaoMunicipal: '',
      areasContratadas: '',
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
      telefone: '', email: '', isActive: true,
      ...defaultValues,
    },
  })

  const tipoDocumento = watch('tipoDocumento')
  const watchedValues = watch()
  const [opcoesOrigem, setOpcoesOrigem] = useState<Array<{ id: string; valor: string }>>([])
  const [opcoesGrupo, setOpcoesGrupo] = useState<Array<{ id: string; valor: string }>>([])

  useEffect(() => {
    ;(trpc.cliente as any).listOpcoes.query({ tipo: 'ORIGEM' }).then((data: Array<{ id: string; valor: string }>) => setOpcoesOrigem(data)).catch(() => {})
    ;(trpc.cliente as any).listOpcoes.query({ tipo: 'GRUPO' }).then((data: Array<{ id: string; valor: string }>) => setOpcoesGrupo(data)).catch(() => {})
  }, [])
  const [cnpjCard, setCnpjCard] = useState<CnpjCardData | null>(null)
  const [cnpjCardLoading, setCnpjCardLoading] = useState(false)
  // Sócios cadastrados (#HLP0068): entra como item da barra "Progresso do
  // cadastro" pra PJ. Pra PF não faz sentido (sem QSA), então só somamos
  // o check pra CNPJ.
  const [sociosCount, setSociosCount] = useState<number | null>(null)
  useEffect(() => {
    if (mode !== 'edit' || !clienteId) return
    ;(trpc.socio as any).listByCliente.query({ clienteId })
      .then((data: Array<{ id: string }>) => setSociosCount(data?.length ?? 0))
      .catch(() => setSociosCount(0))
  }, [mode, clienteId])

  const progress = useMemo(() => {
    let filled = 0
    for (const field of PROGRESS_FIELDS) {
      const val = watchedValues[field]
      if (val && String(val).trim() !== '') filled++
    }
    // Sócios entra como check extra pra PJ (tipoDocumento === 'CNPJ')
    const isPJ = watchedValues.tipoDocumento === 'CNPJ'
    const total = PROGRESS_FIELDS.length + (isPJ ? 1 : 0)
    if (isPJ && sociosCount !== null && sociosCount > 0) filled++
    return { filled, total, percent: Math.round((filled / total) * 100) }
  }, [watchedValues, sociosCount])

  async function buscarCnpj() {
    // limparCnpj preserva letras (CNPJ alfanumérico) — não usar \D, senão o
    // guard de 14 caracteres falha para o alfanumérico.
    const doc = limparCnpj(watch('documento'))
    if (!doc || doc.length !== 14) return alerts.error('CNPJ inválido', 'Informe um CNPJ com 14 caracteres.')
    // A consulta automática (Receita/SERPRO/BrasilAPI) ainda não aceita CNPJ
    // alfanumérico — enquanto o upstream não suportar, orienta o preenchimento
    // manual em vez de mandar uma consulta que falharia.
    if (/[A-Z]/.test(doc)) return alerts.error('Consulta indisponível', 'A consulta automática ainda não está disponível para CNPJ alfanumérico. Preencha os dados manualmente.')
    try {
      const data = await (trpc.socio as any).consultarCnpj.query({ cnpj: doc }) as {
        razaoSocial: string; nomeFantasia: string | null; cep: string | null; logradouro: string | null
        numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null
        gateAviso?: string
      }
      if (data.razaoSocial) setValue('razaoSocial', data.razaoSocial)
      if (data.nomeFantasia) setValue('nomeFantasia', data.nomeFantasia)
      if (data.cep) setValue('cep', masks.cep(String(data.cep)))
      if (data.logradouro) setValue('logradouro', data.logradouro)
      if (data.numero) setValue('numero', data.numero)
      if (data.complemento) setValue('complemento', data.complemento)
      if (data.bairro) setValue('bairro', data.bairro)
      if (data.municipio) setValue('cidade', data.municipio)
      if (data.uf) setValue('uf', data.uf)
      if (data.gateAviso) alerts.warning('Consulta na base gratuita', data.gateAviso)
      else alerts.success('CNPJ consultado', data.razaoSocial || 'Dados preenchidos com sucesso.')
    } catch (err) {
      alerts.error('Erro', (err as Error).message || 'Não foi possível consultar o CNPJ.')
    }
  }

  async function consultarCartaoCnpj() {
    const doc = limparCnpj(watch('documento')) // preserva letras (CNPJ alfanumérico)
    if (!doc || doc.length !== 14) return alerts.error('CNPJ inválido', 'Informe um CNPJ com 14 caracteres.')
    if (/[A-Z]/.test(doc)) return alerts.error('Consulta indisponível', 'A consulta automática ainda não está disponível para CNPJ alfanumérico. Preencha os dados manualmente.')
    try {
      setCnpjCardLoading(true)
      const data = await (trpc.socio as any).consultarCnpj.query({ cnpj: doc }) as CnpjCardData

      // Buscar sócios do cache (já salvos com participações do PDF)
      if (clienteId) {
        let socios = await (trpc.socio as any).listByCliente.query({ clienteId }) as Array<{ nomeCompleto: string; cpf: string; tipoSocio: string; participacao: number | null }>

        // Se não houver sócios no cache, importar via QSA
        if (socios.length === 0) {
          try {
            await (trpc.socio as any).importQsa.mutate({ clienteId, documento: doc, force: false })
            socios = await (trpc.socio as any).listByCliente.query({ clienteId }) as typeof socios
          } catch { /* silencioso — usa QSA da API */ }
        }

        // Enriquecer o QSA do cartão com os percentuais do cache
        if (socios.length > 0) {
          // Buscar capital social do cliente
          let capitalCliente = data.capitalSocial
          try {
            const cs = await (trpc.cliente as any).getCapitalSocial.query({ clienteId }) as { capitalSocial: number | null }
            if (cs.capitalSocial != null) capitalCliente = cs.capitalSocial
          } catch { /* usa o da API */ }
          if (capitalCliente != null) data.capitalSocial = capitalCliente

          data.qsa = socios.map(s => {
            // Encontrar o sócio correspondente na API para manter qualificação
            const apiMatch = data.qsa.find(q => q.nome.toUpperCase() === s.nomeCompleto.toUpperCase())
            return {
              nome: s.nomeCompleto,
              cpfCnpj: s.cpf || apiMatch?.cpfCnpj || '',
              qualificacao: apiMatch?.qualificacao || s.tipoSocio,
              percentualCapital: s.participacao,
            }
          })
        }
      }

      setCnpjCard(data)
      if (data.gateAviso) alerts.warning('Consulta na base gratuita', data.gateAviso)
    } catch (err) {
      alerts.error('Erro', (err as Error).message || 'Não foi possível consultar o CNPJ.')
    } finally { setCnpjCardLoading(false) }
  }

  async function buscarCep() {
    const cep = watch('cep')?.replace(/\D/g, '')
    if (!cep || cep.length < 8) return
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.street) setValue('logradouro', data.street)
      if (data.neighborhood) setValue('bairro', data.neighborhood)
      if (data.city) setValue('cidade', data.city)
      if (data.state) setValue('uf', data.state)
    } catch { /* silencioso */ }
  }

  async function onSubmit(data: CreateClienteInput) {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        const created = await trpc.cliente.create.mutate(data)
        await alerts.success('Cliente criado', 'O cliente foi cadastrado com sucesso.')
        router.push(`/clientes/${created.id}`)
      } else {
        await trpc.cliente.update.mutate({ id: clienteId!, data })
        await alerts.success('Cliente atualizado', 'Os dados foram salvos com sucesso.')
      }
    } catch {
      setError(mode === 'create' ? 'Erro ao criar o cliente.' : 'Erro ao atualizar o cliente.')
    } finally { setSaving(false) }
  }

  /**
   * Grava na hora uma escolha feita direto no cabeçalho (situação e status).
   * São cliques de um passo só — trocar para "Ativa" e ainda ter de achar o
   * disquete no canto é um jeito fácil de perder a alteração ao sair da tela.
   * No cadastro novo (sem id) só atualiza o formulário; grava junto no salvar.
   */
  async function salvarCampoDoCabecalho(campo: 'situacao' | 'status', valor: string, aplicar: (v: string) => void) {
    const anterior = watchedValues[campo]
    aplicar(valor)
    if (mode !== 'edit' || !clienteId) return
    try {
      await trpc.cliente.update.mutate({ id: clienteId, data: { [campo]: valor } as never })
    } catch {
      // Volta ao valor anterior para a tela não mostrar algo que o banco não tem.
      if (anterior !== undefined) aplicar(String(anterior))
      alerts.error('Erro', 'Não foi possível salvar a alteração.')
    }
  }

  // #HLP0209 — reativar: volta status=ATIVO, limpa a saída e registra o motivo
  // (obrigatório) de reativação. Vem do ReativarClienteModal (mesmo do /clientes).
  // O banner some na hora, sem recarregar.
  async function reativarConfirmado(motivo: string) {
    if (!clienteId) return
    await trpc.cliente.reativar.mutate({ id: clienteId, motivo })
    setValue('status', 'ATIVO', { shouldDirty: false })
    setValue('dataSaida', '', { shouldDirty: false })
    setMotivoInativado('')
    alerts.success('Cliente reativado', 'O cliente voltou a ser ativo.')
  }

  // #HLP0209/0211 — confirma a inativação vinda do modal do detalhe (data de
  // saída opcional + motivo). Atualiza o form e o banner sem recarregar.
  async function inativarConfirmado(dataSaida: string, motivo: string) {
    if (!clienteId) return
    await trpc.cliente.inativar.mutate({ id: clienteId, dataSaida: dataSaida || undefined, motivo })
    setValue('status', 'INATIVO', { shouldDirty: false })
    setValue('dataSaida', dataSaida, { shouldDirty: false })
    setMotivoInativado(motivo)
    alerts.success('Cliente inativado', 'O cliente foi inativado.')
  }

  const isEdit = mode === 'edit' && defaultValues?.code

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit, (validationErrors) => {
        const fields = Object.keys(validationErrors).join(', ')
        setError(`Campos com erro de validação: ${fields}`)
      })} className={isEdit ? 'space-y-0' : 'space-y-5'}>

        {/* ============================================================ */}
        {/* HEADER + TABS (Tabs envolve para incluir TabsList no wrapper)*/}
        {/* ============================================================ */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
        {isEdit ? (
          <>
          {/* ── Barra de página (padrão LuminAux): título + trilha; ações à direita ── */}
          <PageHeaderBar className="mb-0 sm:mb-0"
            actions={<>
              {isEdit && canEditDetails && watchedValues.status === 'ATIVO' && (
                <Button type="button" variant="outline" className={INATIVAR_BTN_CLASS} size="sm" onClick={() => abrirInativar()} title="Inativar cliente">
                  <Ban className="h-4 w-4" />Inativar
                </Button>
              )}
              {canEditDetails && <Button size="sm" type="submit" disabled={saving} className="gap-1.5"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}</Button>}
              <BackButton href="/clientes" />
            </>}
          >
            <h1 className="truncate">Cliente #{defaultValues.code}</h1>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
              <span className="text-muted-foreground/50">›</span>
              <span>Cadastros</span>
              <span className="text-muted-foreground/50">›</span>
              <Link href="/clientes" className="hover:text-foreground transition-colors">Clientes</Link>
              <span className="text-muted-foreground/50">›</span>
              <span className="truncate">{defaultValues?.razaoSocial || 'Cliente'}</span>
            </p>
          </PageHeaderBar>

          {/* ── Hero (modelo /settings): capa + identidade, tabs na base ── */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative overflow-hidden group/cover">
            {/* Capa em cover; sem imagem, gradiente do módulo */}
            {headerCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerCover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, var(--mod-cadastros, #10b981) 0%, var(--color-primary) 100%)' }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />
            {false && (
              <div
                aria-label="Capa do cliente"
                className="absolute inset-0"
                style={{
                  backgroundImage: `url('${headerCover}')`,
                  backgroundRepeat: 'repeat',
                  backgroundSize: 'auto',
                  backgroundPosition: 'top left',
                  opacity: 0.2,
                }}
              />
            )}
            {/* (overlay antigo desativado — o hero usa o degradê escuro acima) */}
            {false && (
              <div
                className="absolute inset-0"
                style={{ backgroundImage: 'linear-gradient(to right, rgba(106, 218, 125, 0) 0%, rgba(106, 218, 125, 0.8) 100%)' }}
              />
            )}
            {/* Controles de capa — somente Master, hover, base direita */}
            {isMaster && (
              <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/30 backdrop-blur transition-colors hover:bg-white/30 disabled:opacity-60"
                  title={headerCover ? 'Trocar imagem de fundo' : 'Personalizar capa'}
                >
                  {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Alterar capa</span>
                </button>
                {headerCover && (
                  <button
                    type="button"
                    onClick={handleCoverRemove}
                    disabled={uploadingCover}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-white/30 backdrop-blur transition-colors hover:bg-rose-500/60 disabled:opacity-60"
                    title="Remover capa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleCoverUpload(file)
                    e.target.value = ''
                  }}
                />
              </div>
            )}
            <div className="relative z-10 px-5 pb-5 pt-24 text-white sm:px-6 sm:pt-28">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative shrink-0 group">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-card overflow-hidden shadow-lg ring-4 ring-white/50">
                  {clienteLogo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={resolveAssetUrl(clienteLogo.startsWith('http') || clienteLogo.startsWith('/') ? clienteLogo : `/api/upload/${clienteLogo}`)}
                      alt="Logo"
                      className="h-20 w-20 object-contain rounded-xl"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <Handshake className="h-10 w-10 text-emerald-500" />
                  )}
                </div>
                <button
                  type="button"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/40 backdrop-blur transition-colors hover:bg-white/30"
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*'
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0]
                      if (!file) return
                      const formData = new FormData()
                      formData.append('file', file)
                      try {
                        const apiUrl = getApiUrl()
                        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
                        if (!res.ok) { alerts.error('Erro', 'Falha no upload.'); return }
                        const data = await res.json()
                        const logoUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
                        setClienteLogo(logoUrl)
                        if (clienteId) {
                          await trpc.cliente.update.mutate({ id: clienteId, data: { logoUrl } as never })
                        }
                      } catch { alerts.error('Erro', 'Falha no upload da imagem.') }
                    }
                    input.click()
                  }}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-bold tracking-tight text-white drop-shadow">{defaultValues?.razaoSocial || 'Cliente'}</p>
                  <Controller control={control} name="situacao" render={({ field }) => {
                    const style = { backgroundColor: SITUACAO_COLORS[field.value as keyof typeof SITUACAO_COLORS]?.bg || 'var(--color-muted)', color: SITUACAO_COLORS[field.value as keyof typeof SITUACAO_COLORS]?.color || 'var(--color-foreground)' }
                    const conteudo = <><ShoppingCart className="h-3 w-3" />{SITUACAO_LABELS[field.value as keyof typeof SITUACAO_LABELS] || field.value}</>
                    // Sem "Gerenciar aba comercial": o atalho vira badge de LEITURA
                    // (a situação é informação que todos veem; só o EDITAR é gateado).
                    if (!canManageCommercial) return (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ring-white/25" style={style} title={'Editar a situação requer a permissão "Gerenciar aba comercial"'}>{conteudo}</span>
                    )
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase cursor-pointer transition-opacity hover:opacity-80 ring-1 ring-white/25" style={style}>{conteudo}</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {Object.entries(SITUACAO_LABELS).map(([v, l]) => (
                            <DropdownMenuItem key={v} onClick={() => salvarCampoDoCabecalho('situacao', v, field.onChange)} className={field.value === v ? 'font-bold' : ''}>{l}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  }} />
                  <Controller control={control} name="status" render={({ field }) => {
                    const style = { backgroundColor: STATUS_COLORS[field.value as keyof typeof STATUS_COLORS]?.bg || 'var(--color-muted)', color: STATUS_COLORS[field.value as keyof typeof STATUS_COLORS]?.color || 'var(--color-foreground)' }
                    const conteudo = STATUS_LABELS[field.value as keyof typeof STATUS_LABELS] || field.value
                    // #HLP0209 — status é badge de LEITURA. Inativar/reativar passam pelos
                    // fluxos dedicados (botão "Inativar" + aviso "Cliente inativado"),
                    // que registram motivo — nunca por toggle silencioso.
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ring-white/25" style={style}>{conteudo}</span>
                    )
                  }} />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                    <Handshake className="h-3 w-3" />
                    {watchedValues.tipoCliente || 'A DEFINIR'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85 [&_button]:text-white [&_button]:hover:text-white">
                  <span className="inline-flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{defaultValues.code}</span>
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />
                    {clienteId
                      ? <CnpjFilialSelect clienteId={clienteId} documento={defaultValues.documento || ''} tipoDocumento={tipoDocumento} />
                      : <>{tipoDocumento === 'CPF' ? masks.cpf(defaultValues.documento || '') : masks.cnpj(defaultValues.documento || '')}</>}
                  </span>
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Criado em {defaultValues.createdAt ? new Date(defaultValues.createdAt).toLocaleDateString('pt-BR') : '—'}</span>
                </div>
              </div>
            </div>
            {/* Stats do modelo */}
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-lg font-bold tracking-tight text-white drop-shadow">{watchedValues.dataEntrada ? String(watchedValues.dataEntrada).slice(0, 4) : (defaultValues.createdAt ? new Date(defaultValues.createdAt).getFullYear() : '—')}</p>
                <p className="text-xs text-white/75">Cliente desde</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{progress.percent}%</p>
                <p className="text-xs text-white/75">Cadastro</p>
              </div>
            </div>          </div>
            </div>
          </div>
          {/* /capa */}
          {/* Tira de tabs do modelo: botões simples (fora do [role=tablist] global) */}
          <div className="border-t border-border px-3">
            <div className="flex gap-1.5 overflow-x-auto py-2 nice-scrollbar">
                <button type="button" onClick={() => setActiveTab('detalhes')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'detalhes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <FileText className="h-4 w-4" /> Detalhes
                </button>
                <button type="button" onClick={() => setActiveTab('comercial')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'comercial' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Handshake className="h-4 w-4" /> Comercial
                </button>
                <button type="button" onClick={() => setActiveTab('fiscal')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'fiscal' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Receipt className="h-4 w-4" /> Fiscal
                </button>
                <button type="button" onClick={() => setActiveTab('contabil')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'contabil' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Calculator className="h-4 w-4" /> Contábil
                </button>
                <button type="button" onClick={() => setActiveTab('legalizacao')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'legalizacao' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Shield className="h-4 w-4" /> Legalização
                </button>
                <button type="button" onClick={() => setActiveTab('obrigacoes')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'obrigacoes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <ListChecks className="h-4 w-4" /> Obrigações
                </button>
                <button type="button" onClick={() => setActiveTab('servicos')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'servicos' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Briefcase className="h-4 w-4" /> Serviços
                </button>
                <button type="button" onClick={() => setActiveTab('particularidades')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'particularidades' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <StickyNote className="h-4 w-4" /> Particularidades
                </button>
                <button type="button" onClick={() => setActiveTab('protocolos')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'protocolos' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <FileInput className="h-4 w-4" /> Protocolos
                </button>
                <button type="button" onClick={() => setActiveTab('reclamacoes')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'reclamacoes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <MessageSquareQuote className="h-4 w-4" /> Reclamações
                </button>
                <button type="button" onClick={() => setActiveTab('usuarios')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'usuarios' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Users className="h-4 w-4" /> Usuários
                </button>
                <button type="button" onClick={() => setActiveTab('logs')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'logs' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <ListTodo className="h-4 w-4" /> Log&apos;s
                </button>
            </div>
          </div>
          </div>
          {/* /hero */}
          </>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-emerald-500 text-white shadow-md">
                <Handshake className="h-6 w-6" />
              </div>
              <div>
                <h1>Novo Cliente</h1>
                <p className="text-sm text-muted-foreground">Preencha os dados para cadastrar um novo cliente</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              {canEditDetails && <Button variant="success" size="sm" type="submit" disabled={saving}><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}</Button>}
              <BackButton href="/clientes" label="Voltar" />
            </div>
          </div>
        )}

        {error && <div className={cn('rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive', isEdit && 'mt-4')}>{error}</div>}

        {/* No cadastro de novo cliente NÃO mostramos as abas de topo — a aba
            "Detalhes" (Dados Gerais) já reúne tudo o que é necessário p/ criar.
            As demais abas (Comercial, Fiscal, Contábil, etc.) só fazem sentido
            na edição de um cliente já salvo, então aparecem só no modo edição. */}

          {/* Layout 2 colunas */}
          <div className={cn('mt-6', isEdit ? 'grid items-start gap-6 lg:grid-cols-[1fr_20rem]' : '')}>
            <div className="min-w-0">

              {/* ======================================================== */}
              {/* TAB: DETALHES (card com pills laterais)                   */}
              {/* ======================================================== */}
              <TabsContent value="detalhes" className="mt-0">
                <DetalhesCard
                  register={register} control={control} watch={watch} errors={errors}
                  setValue={setValue} clienteId={clienteId}
                  watchedValues={watchedValues} tipoDocumento={tipoDocumento}
                  buscarCnpj={buscarCnpj} buscarCep={buscarCep}
                  consultarCartaoCnpj={consultarCartaoCnpj} cnpjCard={cnpjCard} cnpjCardLoading={cnpjCardLoading} setCnpjCard={setCnpjCard}
                  canEdit={canEditDetails}
                />
              </TabsContent>

              {/* ======================================================== */}
              {/* TAB: COMERCIAL (card com pills laterais)                  */}
              {/* ======================================================== */}
              <TabsContent value="comercial" className="mt-0">
                <ComercialCard
                  register={register} control={control} watch={watch} errors={errors}
                  chatMsg={chatMsg} setChatMsg={setChatMsg}
                  chatAsCliente={chatAsCliente} setChatAsCliente={setChatAsCliente}
                  clienteId={clienteId}
                  opcoesOrigem={opcoesOrigem} opcoesGrupo={opcoesGrupo} canEdit={canManageCommercial}
                  onPedirInativar={abrirInativar}
                />
              </TabsContent>

              {/* ======================================================== */}
              {/* TAB: FISCAL                                               */}
              {/* ======================================================== */}
              <TabsContent value="fiscal" className="mt-0">
                <FiscalCard
                  register={register}
                  control={control}
                  clienteId={clienteId}
                  isEdit={!!isEdit}
                  documento={watchedValues.documento || defaultValues?.documento || ''}
                  canEdit={canManageFiscal}
                />
              </TabsContent>

              {/* ======================================================== */}
              {/* TABS PLACEHOLDER (futuras)                                */}
              {/* ======================================================== */}
              <TabsContent value="contabil" className="mt-0">
                {isEdit && clienteId ? (
                  <ContabilCard clienteId={clienteId} documento={limparCnpj(watchedValues.documento || defaultValues?.documento || '')} />
                ) : (
                  <PlaceholderTab icon={Calculator} title="Contábil" description="Salve o cliente primeiro para acessar o BI Balancete." />
                )}
              </TabsContent>
              <TabsContent value="legalizacao" className="mt-0">
                <LegalizacaoCard register={register} clienteId={clienteId} documento={limparCnpj(watchedValues.documento || defaultValues?.documento || '')} />
              </TabsContent>
              <TabsContent value="obrigacoes" className="mt-0">
                {isEdit && clienteId ? (
                  <ObrigacoesClienteSection clienteId={clienteId} />
                ) : (
                  <PlaceholderTab icon={ListChecks} title="Obrigações" description="Salve o cliente primeiro para gerenciar obrigações." />
                )}
              </TabsContent>
              <TabsContent value="servicos" className="mt-0">
                {isEdit && clienteId ? (
                  <ServicosCard clienteId={clienteId} />
                ) : (
                  <PlaceholderTab icon={Briefcase} title="Serviços" description="Salve o cliente primeiro para gerenciar serviços contratados." />
                )}
              </TabsContent>
              <TabsContent value="particularidades" className="mt-0">
                {isEdit && clienteId ? (
                  <ParticularidadesCard clienteId={clienteId} />
                ) : (
                  <PlaceholderTab icon={StickyNote} title="Particularidades" description="Salve o cliente primeiro para gerenciar particularidades." />
                )}
              </TabsContent>
              <TabsContent value="protocolos" className="mt-0">
                {isEdit && clienteId ? (
                  <ProtocolosCard clienteId={clienteId} />
                ) : (
                  <PlaceholderTab icon={FileInput} title="Protocolos" description="Salve o cliente primeiro para registrar protocolos." />
                )}
              </TabsContent>
              <TabsContent value="reclamacoes" className="mt-0">
                <PlaceholderTab icon={MessageSquareQuote} title="Reclamações" description="Registro de reclamações e tratativas. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="usuarios" className="mt-0">
                <PlaceholderTab icon={Users} title="Usuários" description="Usuários vinculados ao cliente. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="logs" className="mt-0">
                {isEdit && clienteId ? <LogsTab clienteId={clienteId} /> : (
                  <PlaceholderTab icon={ListTodo} title="Log's" description="Salve o cliente primeiro para visualizar o histórico." />
                )}
              </TabsContent>
            </div>

            {/* ============================================================ */}
            {/* SIDEBAR (modo edit)                                          */}
            {/* ============================================================ */}
            {isEdit && (
              <div className="space-y-4">
                {/* Avisos — cliente inativado (cabeçalho em gradiente âmbar, como no orçamento) */}
                {watchedValues.status === 'INATIVO' && (
                  <Card className="overflow-hidden rounded-2xl p-0">
                    <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-amber-500/10 to-amber-500/[0.03] px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white"><Ban className="h-4 w-4" /></span>
                        <div>
                          <p className="text-xs text-muted-foreground">Avisos</p>
                          <p className="text-base font-bold text-foreground">Cliente inativado</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5">
                    <dl className="space-y-1.5 text-[13px]">
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0">Data de saída:</dt>
                        <dd className="font-medium">{watchedValues.dataSaida ? toDateInputValue(watchedValues.dataSaida).split('-').reverse().join('/') : '—'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0">Motivo:</dt>
                        <dd className="font-medium break-words">{motivoInativado || '—'}</dd>
                      </div>
                    </dl>
                    {canEditDetails && (
                      <Button type="button" variant="outline" className="mt-3 w-full gap-1.5" size="sm" onClick={() => setReativarAberto(true)}>
                        <RotateCcw className="h-3.5 w-3.5" />Reativar cliente
                      </Button>
                    )}
                    </div>
                  </Card>
                )}
                {/* Progresso — card "plano" do modelo: cabeçalho em gradiente + pill + barra */}
                <Card className="overflow-hidden rounded-2xl p-0">
                  <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary/10 to-sky-500/5 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ClipboardCheck className="h-4 w-4" /></span>
                      <div>
                        <p className="text-xs text-muted-foreground">Progresso do cadastro</p>
                        <p className="text-base font-bold text-foreground tabular-nums">{progress.percent}%</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{progress.filled} / {progress.total}</span>
                  </div>
                  <div className="p-5">
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{progress.filled} de {progress.total} campos preenchidos</p>
                  {progress.percent < 100 && (
                    <details className="mt-3">
                      <summary className="text-[11px] text-emerald-600 cursor-pointer hover:underline">Ver campos pendentes</summary>
                      <ul className="mt-2 space-y-1">
                        {/* Sócios pendentes (#HLP0068): só pra PJ, quando ainda não cadastrou nenhum */}
                        {watchedValues.tipoDocumento === 'CNPJ' && sociosCount === 0 && (
                          <li className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            <span>Sócios</span>
                            <span className="text-[10px] text-muted-foreground/60">(legalizacao)</span>
                          </li>
                        )}
                        {PROGRESS_FIELDS.filter(f => { const v = watchedValues[f]; return !v || String(v).trim() === '' }).map(f => {
                          const FIELD_TAB_MAP: Record<string, { tab: string; label: string }> = {
                            razaoSocial: { tab: 'detalhes', label: 'Razao Social' },
                            documento: { tab: 'detalhes', label: 'Documento' },
                            nomeFantasia: { tab: 'detalhes', label: 'Nome Fantasia' },
                            tipoCliente: { tab: 'detalhes', label: 'Tipo Cliente' },
                            telefone: { tab: 'detalhes', label: 'Telefone' },
                            email: { tab: 'detalhes', label: 'E-mail' },
                            cep: { tab: 'detalhes', label: 'CEP' },
                            logradouro: { tab: 'detalhes', label: 'Logradouro' },
                            bairro: { tab: 'detalhes', label: 'Bairro' },
                            cidade: { tab: 'detalhes', label: 'Cidade' },
                            uf: { tab: 'detalhes', label: 'UF' },
                            situacao: { tab: 'comercial', label: 'Situacao' },
                            status: { tab: 'comercial', label: 'Status' },
                            grupo: { tab: 'comercial', label: 'Grupo' },
                            origem: { tab: 'comercial', label: 'Origem' },
                            tributacao: { tab: 'fiscal', label: 'Tributacao' },
                            areasContratadas: { tab: 'servicos', label: 'Areas Contratadas' },
                          }
                          const info = FIELD_TAB_MAP[f] || { tab: 'detalhes', label: f }
                          return (
                            <li key={f} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                              <span>{info.label}</span>
                              <span className="text-[10px] text-muted-foreground/60">({info.tab})</span>
                            </li>
                          )
                        })}
                      </ul>
                    </details>
                  )}
                  </div>
                </Card>

                {/* Atividades e Benefícios (#5/#6) — substitui o card de Áreas Contratadas */}
                {clienteId && <AtividadesBeneficiosSidebar clienteId={clienteId} />}

                {/* Arquivos */}
                {clienteId && <ArquivosSidebar clienteId={clienteId} />}

              </div>
            )}
          </div>
        </Tabs>
      </form>

      {/* #HLP0209/0211 — inativação do cliente (data opcional + motivo). */}
      <InativarClienteModal
        open={inativarAberto}
        count={1}
        nome={defaultValues?.razaoSocial}
        initialDataSaida={inativarDataInicial}
        onOpenChange={setInativarAberto}
        onConfirm={inativarConfirmado}
      />

      {/* #HLP0209 — reativação (mesmo modal usado no /clientes). */}
      <ReativarClienteModal
        open={reativarAberto}
        nome={defaultValues?.razaoSocial}
        onOpenChange={setReativarAberto}
        onConfirm={reativarConfirmado}
      />
    </TooltipProvider>
  )
}

// ================================================================
// Sub-componentes funcionais
// ================================================================

/* ================================================================== */
/* DetalhesCard — pills laterais (padrão igual ComercialCard)         */
/* ================================================================== */
function DetalhesCard({ register, control, watch, errors, setValue, clienteId, watchedValues, buscarCnpj, buscarCep, consultarCartaoCnpj, cnpjCard, cnpjCardLoading, setCnpjCard, canEdit }: {
  register: ReturnType<typeof useForm<CreateClienteInput>>['register']
  control: ReturnType<typeof useForm<CreateClienteInput>>['control']
  watch: ReturnType<typeof useForm<CreateClienteInput>>['watch']
  errors: ReturnType<typeof useForm<CreateClienteInput>>['formState']['errors']
  setValue: ReturnType<typeof useForm<CreateClienteInput>>['setValue']
  clienteId?: string
  watchedValues: CreateClienteInput
  tipoDocumento: string
  buscarCnpj: () => void
  buscarCep: () => void
  consultarCartaoCnpj: () => void
  cnpjCard: CnpjCardData | null
  cnpjCardLoading: boolean
  setCnpjCard: (v: CnpjCardData | null) => void
  canEdit: boolean
}) {

  const [activeTab, setActiveTab] = useState('dados')

  // "Dados Gerais" reúne todos os campos essenciais (igual ao cadastro do
  // OneClick v1, modal-add.asp): identificação, situação/regime/origem/grupo,
  // inscrições, datas, contato, endereço (+mapa) e observações — tudo numa tela.
  const tabs = [
    { key: 'dados', label: 'Dados Gerais', icon: Building2 },
    { key: 'contato', label: 'Contatos', icon: Phone },
    { key: 'integracoes', label: 'Integrações', icon: Link2 },
  ]

  return (
    <Card>
      <CardHeader>
        <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" /> Detalhes do Cliente
        </h5>
      </CardHeader>
      <div className="flex min-h-[450px]">
        {/* Pills laterais */}
        <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                    activeTab === tab.key
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                  )}
                  style={activeTab === tab.key ? { backgroundColor: 'var(--mod-cadastros, #10b981)' } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conteúdo — fieldset desabilita TODOS os campos quando sem permissão 'edit_details' */}
        <fieldset disabled={!canEdit} className="flex-1 min-w-0 border-0 m-0 p-0 [&:disabled_*]:pointer-events-none">
        <div key={activeTab} className="min-w-0 flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>

          {/* ---- SUB-TAB: DADOS GERAIS (tela única — igual ao v1) ---- */}
          {activeTab === 'dados' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Dados Gerais</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                {/* Linha 1: Tipo (2) + CNPJ/CPF (4) + Razão Social (6) */}
                <div className="col-span-12 md:col-span-2 space-y-1.5">
                  <Label>Tipo<RequiredMark /></Label>
                  <Controller control={control} name="tipoCliente" render={({ field }) => (
                    <Select value={field.value || 'A DEFINIR'} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPO_CLIENTE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>CNPJ / CPF</Label>
                  <div className="flex" style={{ borderRadius: '0.25rem' }}>
                    <Controller control={control} name="documento" render={({ field }) => (
                      <Input
                        placeholder="CNPJ ou CPF (opcional)"
                        // Máscara combinada: ≤11 dígitos formata como CPF, acima como CNPJ.
                        value={masks.cpfCnpj(field.value || '')}
                        onChange={(e) => {
                          const masked = masks.cpfCnpj(e.target.value)
                          field.onChange(masked)
                          // Auto-detecta o tipo. limparCnpj preserva letras: qualquer
                          // letra ⇒ CNPJ (alfanumérico); senão decide pelo tamanho.
                          const d = limparCnpj(masked)
                          const ehCnpj = /[A-Z]/.test(d) || d.length > 11
                          setValue('tipoDocumento', ehCnpj ? 'CNPJ' : 'CPF', { shouldDirty: true })
                        }}
                        className="rounded-r-none border-r-0"
                      />
                    )} />
                    <button type="button" className="shrink-0 rounded-none border border-l-0 border-r-0 border-sky-500 h-9 px-3 text-[12px] font-medium bg-sky-500 text-white cursor-pointer hover:bg-sky-600" onClick={() => buscarCnpj()}>
                      Completar
                    </button>
                    <button type="button" className="shrink-0 rounded-r-[0.25rem] border border-l-0 border-input h-9 px-3 text-[12px] font-medium cursor-pointer hover:bg-accent flex items-center gap-1" onClick={() => consultarCartaoCnpj()} disabled={cnpjCardLoading}>
                      {cnpjCardLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />} {cnpjCardLoading ? 'Consultando...' : 'Consultar'}
                    </button>
                  </div>
                  {errors.documento && <p className="text-xs text-destructive">{errors.documento.message}</p>}
                  {/* Matriz/filial no CNPJ ALFANUMÉRICO (Fase 3): a ordem pode ter
                      letras, então o /0001 não identifica mais a matriz. Só aparece
                      para CNPJ alfanumérico; no numérico é derivado automaticamente. */}
                  {(() => {
                    const docLimpo = limparCnpj(watchedValues.documento || '')
                    if (!(docLimpo.length === 14 && /[A-Z]/.test(docLimpo))) return null
                    return (
                      <label className="flex items-start gap-2 mt-1.5 text-[12px] cursor-pointer select-none text-muted-foreground">
                        <Controller control={control} name="ehMatriz" render={({ field }) => (
                          <input type="checkbox" checked={field.value !== false} onChange={e => field.onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sky-500" />
                        )} />
                        <span>Este CNPJ é <strong className="text-foreground">matriz</strong> — desmarque se for filial. No CNPJ alfanumérico o <code>/0001</code> não identifica mais a matriz automaticamente.</span>
                      </label>
                    )
                  })()}
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label className="text-info">Razão Social<RequiredMark /></Label>
                  <Input placeholder="Razão Social / Nome" {...register('razaoSocial')} />
                  {errors.razaoSocial && <p className="text-xs text-destructive">{errors.razaoSocial.message}</p>}
                </div>

                {/* Linha 2: Nome Fantasia. Situação, Origem e Grupo Empresarial foram
                    movidos para a aba Comercial (HLP0269/0333) — eram os mesmos campos
                    nas duas abas e editar um refletia no outro. "Regime" (→ Fiscal) e
                    "Data de Início" (= Data Entrada, → Comercial) já haviam saído pelo
                    mesmo motivo. O Status seguiu o mesmo caminho: na edição quem manda
                    é o badge do cabeçalho, visível em qualquer aba. Aqui ele só aparece
                    no CADASTRO, onde não há cabeçalho com badges — sem isso, cliente
                    novo nasceria sempre "Ativa", sem escolha. */}
                <div className={cn('col-span-12 space-y-1.5', clienteId ? 'md:col-span-12' : 'md:col-span-9')}>
                  <Label>Nome Fantasia</Label>
                  <Input placeholder="Nome Fantasia" {...register('nomeFantasia')} />
                </div>
                {!clienteId && (
                  <div className="col-span-12 md:col-span-3 space-y-1.5">
                    <Label>Status</Label>
                    <Controller control={control} name="status" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  </div>
                )}

                {/* Inscrição Estadual/Municipal migradas para a aba Fiscal → Registro de Inscrições. */}

                {/* Linha 5: Telefones (6) + E-Mails (6) */}
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label className="text-info">Telefones</Label>
                  <Input placeholder="(00) 00000-0000" {...register('telefone')} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label className="text-info">E-Mails</Label>
                  <Input placeholder="email@dominio.com" {...register('email')} />
                </div>

                {/* Subtítulo Endereço */}
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-border">
                    <h4 className="text-[13px] font-semibold text-foreground">Endereço</h4>
                  </div>
                </div>
                <div className="col-span-12 md:col-span-2 space-y-1.5">
                  <Label className="text-info">CEP</Label>
                  <Input placeholder="00000-000" {...register('cep')}
                    onChange={(e) => { e.target.value = masks.cep(e.target.value); register('cep').onChange(e) }}
                    onBlur={buscarCep} />
                </div>
                <div className="col-span-12 md:col-span-8 space-y-1.5">
                  <Label className="text-info">Endereço</Label>
                  <Input placeholder="Rua / Avenida" {...register('logradouro')} />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-1.5">
                  <Label>Número</Label>
                  <Input placeholder="Nº" {...register('numero')} />
                </div>
                <div className="col-span-12 md:col-span-5 space-y-1.5">
                  <Label className="text-info">Bairro</Label>
                  <Input placeholder="Bairro" {...register('bairro')} />
                </div>
                <div className="col-span-12 md:col-span-5 space-y-1.5">
                  <Label className="text-info">Cidade</Label>
                  <Input placeholder="Cidade" {...register('cidade')} />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-1.5">
                  <Label className="text-info">Estado</Label>
                  <Input placeholder="ES" maxLength={2} {...register('uf')} />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label className="text-info">Complemento</Label>
                  <Input placeholder="Apto / Sala / Bloco..." {...register('complemento')} />
                </div>

                {/* Google Maps */}
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-border">
                    <h4 className="text-[13px] font-semibold text-foreground">Posição no Google Maps</h4>
                  </div>
                </div>
                <div className="col-span-12">
                  <GoogleMapsEmbed
                    logradouro={watchedValues.logradouro}
                    numero={watchedValues.numero}
                    bairro={watchedValues.bairro}
                    cidade={watchedValues.cidade}
                    uf={watchedValues.uf}
                    cep={watchedValues.cep}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ---- SUB-TAB: CONTATOS ---- */}
          {activeTab === 'contato' && (
            <ContatosTab clienteId={clienteId} />
          )}

          {/* (Endereço migrado para a aba "Dados Gerais" — igual v1. Observações mora
              só em Comercial > Cadastros > "Observações gerais": é um campo só do
              cliente, e dois editores para o mesmo `observacoes` disputavam o valor.) */}

          {/* ---- SUB-TAB: INTEGRAÇÕES ---- */}
          {activeTab === 'integracoes' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Integrações com Sistemas Externos</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                {/* ID SCI (6) + botão importar */}
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>ID SCI</Label>
                  <div className="flex" style={{ borderRadius: '0.25rem', overflow: 'hidden' }}>
                    <Input placeholder="ID no SCI (Sistema Contábil Integrado)" {...register('idSistema')} style={{ borderRadius: '0.25rem 0 0 0.25rem', borderRight: 'none' }} />
                    <button
                      type="button"
                      title="Importar ID do SCI pelo CNPJ"
                      className="shrink-0 flex items-center gap-1.5"
                      style={{ padding: '0.55rem 0.75rem', fontSize: '.77rem', fontWeight: 500, backgroundColor: '#0ea5e9', color: '#fff', border: '1px solid #0ea5e9', borderLeft: 'none', borderRadius: '0 0.25rem 0.25rem 0', cursor: 'pointer' }}
                      onClick={async () => {
                        if (!clienteId) { alerts.error('Salve o cliente', 'Salve o cliente antes de importar o ID SCI.'); return }
                        const currentId = watch('idSistema')
                        let force = false
                        if (currentId) {
                          const confirm = await alerts.confirmDelete(`O ID SCI atual é "${currentId}". Deseja sobrescrever com o valor do SCI?`)
                          if (!confirm) return
                          force = true
                        }
                        try {
                          const result = await trpc.cliente.atualizarIdSistemaSci.mutate({ clienteId, force }) as Record<string, unknown>
                          if (result.needsConfirmation) {
                            const confirm = await alerts.confirmDelete(String(result.message))
                            if (!confirm) return
                            const r2 = await trpc.cliente.atualizarIdSistemaSci.mutate({ clienteId, force: true }) as Record<string, unknown>
                            setValue('idSistema', String(r2.idSistema))
                            await alerts.success('ID SCI atualizado', `ID ${r2.idSistema} importado do SCI (${r2.metodo}).${r2.idAnterior ? ` Anterior: ${r2.idAnterior}` : ''}`)
                          } else {
                            setValue('idSistema', String(result.idSistema))
                            await alerts.success('ID SCI importado', `ID ${result.idSistema} importado do SCI (${result.metodo}).${result.idAnterior ? ` Anterior: ${result.idAnterior}` : ''}`)
                          }
                        } catch (e) {
                          const msg = (e as Error).message || ''
                          if (msg.includes('CNPJ')) alerts.error('CNPJ inválido', msg)
                          else if (msg.includes('SCI')) alerts.error('Erro SCI', msg)
                          else if (msg.includes('encontrado')) alerts.error('Não encontrado', msg)
                          else alerts.error('Erro', msg || 'Não foi possível importar o ID SCI.')
                        }
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 rotate-[270deg]" /> Importar
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Identificador no Sistema Contábil Integrado (Firebird)</p>
                </div>

                {/* ID OneClick (6) */}
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>ID OneClick</Label>
                  <Input placeholder="ID no OneClick" {...register('idOneClick')} />
                  <p className="text-[11px] text-muted-foreground">Identificador no sistema OneClick legado</p>
                </div>

                {/* Subtítulo Omie */}
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-border">
                    <h4 className="text-[13px] font-semibold text-foreground">Omie ERP</h4>
                  </div>
                </div>

                {/* ID Omie (6) + Empresa Omie (6) */}
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>ID Omie</Label>
                  <Input placeholder="Código do cliente no Omie" {...register('idOmie')} />
                  <p className="text-[11px] text-muted-foreground">Código do cliente na plataforma Omie</p>
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>Empresa Omie</Label>
                  <Controller control={control} name="omieEmpresa" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="CENTRAL">Central</SelectItem>
                        <SelectItem value="LL">L&amp;L</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                  <p className="text-[11px] text-muted-foreground">Empresa vinculada no Omie para este cliente</p>
                </div>

                {/* Buscar no Omie por CNPJ (API) */}
                <OmieBuscarButton
                  documento={watch('documento')}
                  omieEmpresa={watch('omieEmpresa')}
                  onResult={(idOmie, empresa) => {
                    setValue('idOmie', idOmie, { shouldDirty: true })
                    setValue('omieEmpresa', empresa, { shouldDirty: true })
                  }}
                />

                {/* Subtítulo Acessórias */}
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-border">
                    <h4 className="text-[13px] font-semibold text-foreground">Acessórias</h4>
                  </div>
                </div>

                <AcessoriasIntegracao clienteId={clienteId ?? null} />
              </div>
            </div>
          )}
        </div>
        </fieldset>
      </div>

      {/* Modal Cartão CNPJ — Réplica fiel do SERPRO2 */}
      {cnpjCard && (() => {
        const cnpjF = masks.cnpj(cnpjCard.cnpj || '') || cnpjCard.cnpj
        const dtAb = cnpjCard.dataAbertura ? new Date(cnpjCard.dataAbertura + 'T00:00:00').toLocaleDateString('pt-BR') : '\u2014'
        const capF = cnpjCard.capitalSocial != null ? `R$ ${Number(cnpjCard.capitalSocial).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '\u2014'
        const cellB = 'border: 1px solid #000; padding: 3.5pt;'
        const cellL = 'border-left: none; border-right: 1px solid #000; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3.5pt;'
        return (
        <Dialog open={!!cnpjCard} onOpenChange={(open) => { if (!open) setCnpjCard(null) }}>
          <DialogContent className="max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0">
            <DialogHeaderIcon icon={FileText} color="emerald">
              <DialogTitle className="text-[15px]">Cartao CNPJ (Consulta)</DialogTitle>
              <DialogDescription className="text-[11px]">
                Comprovante de inscricao e situacao cadastral — Receita Federal | Fonte: {cnpjCard.fonte === 'serpro' ? 'SERPRO' : 'BrasilAPI'}
              </DialogDescription>
            </DialogHeaderIcon>
            <DialogBody>
              <div style={{ maxWidth: '17cm', margin: '0 auto', lineHeight: '9pt', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                <div dangerouslySetInnerHTML={{ __html: `
                  <style>
                    .cnpj-cw { max-width: 17cm; margin: 0 auto; line-height: 9pt; font-family: Arial, Helvetica, sans-serif; }
                    .cnpj-cw table { border-collapse: collapse; width: 100%; font-size: 8pt; }
                    .cnpj-cw .cl { font-size: 6pt; text-transform: uppercase; }
                    .cnpj-cw .cv { font-weight: 700; }
                    .cnpj-cw .sp { margin: 0; height: 6px; font-size: 1px; line-height: 6px; }
                  </style>
                  <div class="cnpj-cw">
                  <table border="1" cellspacing="0" style="line-height: 9pt;"><tbody><tr><td style="${cellB}">

                    <table border="0" width="100%" style="line-height: 9pt;">
                      <tbody><tr>
                        <td valign="middle" align="left" width="60" height="60">
                          <img width="60" height="60" src="/brasao2.png" alt="Brasao" border="0" />
                        </td>
                        <td align="center">
                          <p style="margin:0cm; margin-bottom:0pt;">&nbsp;</p>
                          <font face="Arial" size="4"><b>REP\u00daBLICA FEDERATIVA DO BRASIL</b></font>
                          <p style="margin:0cm; margin-bottom:0pt;">&nbsp;</p>
                          <p style="margin:0cm; margin-bottom:0pt;">&nbsp;</p>
                          <p style="margin:0cm; margin-bottom:0pt;">&nbsp;</p>
                          <font face="Arial"><b>CADASTRO NACIONAL DA PESSOA JUR\u00cdDICA</b></font>
                          <p style="margin:0cm; margin-bottom:0pt;">&nbsp;</p>
                        </td>
                        <td valign="middle" align="left" width="60" height="60"></td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="24%" valign="top" style="${cellB}">
                          <span class="cl">N\u00daMERO DE INSCRI\u00c7\u00c3O</span><br>
                          <span class="cv">${cnpjF}</span><br><span class="cv">MATRIZ</span><br>
                        </td>
                        <td width="52%" valign="center" style="${cellL}">
                          <center><span class="cv" style="font-size: 10pt;">COMPROVANTE DE INSCRI\u00c7\u00c3O E DE SITUA\u00c7\u00c3O CADASTRAL</span></center>
                        </td>
                        <td width="24%" valign="top" style="${cellB}">
                          <span class="cl">DATA DE ABERTURA</span><br>
                          <span class="cv">${dtAb}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">NOME EMPRESARIAL</span><br>
                          <span class="cv">${cnpjCard.razaoSocial || '\u2014'}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">CAPITAL SOCIAL</span><br>
                          <span class="cv">${capF}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="88%" valign="top" style="${cellB}">
                          <span class="cl">T\u00cdTULO DO ESTABELECIMENTO (NOME DE FANTASIA)</span><br>
                          <span class="cv">${cnpjCard.nomeFantasia || '\u2014'}</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="10%" valign="top" style="${cellB}">
                          <span class="cl">PORTE</span><br>
                          <span class="cv">${cnpjCard.porte || '\u2014'}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">C\u00d3DIGO E DESCRI\u00c7\u00c3O DA ATIVIDADE ECON\u00d4MICA PRINCIPAL</span><br>
                          <span class="cv">${cnpjCard.cnaePrincipalCodigo ? cnpjCard.cnaePrincipalCodigo + ' - ' : ''}${cnpjCard.atividadePrincipal || '\u2014'}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">C\u00d3DIGO E DESCRI\u00c7\u00c3O DAS ATIVIDADES ECON\u00d4MICAS SECUND\u00c1RIAS</span><br>
                          ${cnpjCard.cnaesSecundarios.length > 0
                            ? cnpjCard.cnaesSecundarios.map(c => `<span class="cv">${c.codigo} - ${c.descricao}</span><br>`).join('')
                            : '<span class="cv">\u2014</span><br>'}
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">C\u00d3DIGO E DESCRI\u00c7\u00c3O DA NATUREZA JUR\u00cdDICA</span><br>
                          <span class="cv">${cnpjCard.naturezaJuridica || '\u2014'}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">QSA \u2014 QUADRO DE S\u00d3CIOS E ADMINISTRADORES</span>
                          ${cnpjCard.qsa.length > 0
                            ? `<table border="0" width="100%" style="border-collapse: collapse; margin-top: 4pt; font-size: inherit;">
                                <thead><tr>
                                  <th style="${cellB} text-align: left;">S\u00f3cio</th>
                                  <th style="${cellB} text-align: left;">CPF/CNPJ</th>
                                  <th style="${cellB} text-align: left;">Qualifica\u00e7\u00e3o</th>
                                  <th style="${cellB} text-align: right;">Participa\u00e7\u00e3o</th>
                                  <th style="${cellB} text-align: right;">Valor</th>
                                </tr></thead>
                                <tbody>${cnpjCard.qsa.map(s => {
                                  const doc = s.cpfCnpj ? s.cpfCnpj.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : '\u2014'
                                  const pct = s.percentualCapital != null ? Number(s.percentualCapital) : null
                                  const pctStr = pct != null ? pct.toFixed(2) + '%' : '\u2014'
                                  const valorPart = pct != null && cnpjCard.capitalSocial != null ? (cnpjCard.capitalSocial * pct / 100) : null
                                  const valorStr = valorPart != null ? 'R$ ' + valorPart.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'
                                  return `<tr><td style="${cellB}">${s.nome}</td><td style="${cellB}">${doc}</td><td style="${cellB}">${s.qualificacao}</td><td style="${cellB} text-align: right;">${pctStr}</td><td style="${cellB} text-align: right;">${valorStr}</td></tr>`
                                }).join('')}
                                ${cnpjCard.capitalSocial != null ? `<tr style="background: #f5f5f5;"><td colspan="3" style="${cellB} text-align: right; font-weight: 700;">Capital Social</td><td style="${cellB} text-align: right; font-weight: 700;">100,00%</td><td style="${cellB} text-align: right; font-weight: 700;">${capF}</td></tr>` : ''}
                                </tbody>
                              </table>`
                            : '<br><span class="cv">\u2014</span>'}
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="50%" valign="top" style="${cellB}">
                          <span class="cl">LOGRADOURO</span><br>
                          <span class="cv">${cnpjCard.logradouro || '\u2014'}</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="10%" valign="top" style="${cellL}">
                          <span class="cl">N\u00daMERO</span><br>
                          <span class="cv">${cnpjCard.numero || '\u2014'}</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="36%" valign="top" style="${cellL}">
                          <span class="cl">COMPLEMENTO</span><br>
                          <span class="cv">${cnpjCard.complemento || '\u2014'}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="18%" valign="top" style="${cellB}">
                          <span class="cl">CEP</span><br>
                          <span class="cv">${cnpjCard.cep || '\u2014'}</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="30%" valign="top" style="${cellL}">
                          <span class="cl">BAIRRO/DISTRITO</span><br>
                          <span class="cv">${cnpjCard.bairro || '\u2014'}</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="38%" valign="top" style="${cellL}">
                          <span class="cl">MUNIC\u00cdPIO</span><br>
                          <span class="cv">${cnpjCard.municipio || '\u2014'}</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="10%" valign="top" style="${cellL}">
                          <span class="cl">UF</span><br>
                          <span class="cv">${cnpjCard.uf || '\u2014'}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">ENTE FEDERATIVO RESPONS\u00c1VEL (EFR)</span><br>
                          <span class="cv">*****</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="64%" valign="top" style="${cellB}">
                          <span class="cl">SITUA\u00c7\u00c3O CADASTRAL</span><br>
                          <span class="cv">${cnpjCard.situacao || '\u2014'}</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="24%" valign="top" style="${cellL}">
                          <span class="cl">DATA DA SITUA\u00c7\u00c3O CADASTRAL</span><br>
                          <span class="cv">${dtAb}</span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="100%" valign="top" style="${cellB}">
                          <span class="cl">MOTIVO DE SITUA\u00c7\u00c3O CADASTRAL</span><br>
                          <span class="cv"></span><br>
                        </td>
                      </tr></tbody>
                    </table>
                    <p class="sp">&nbsp;</p>

                    <table border="0" width="100%" style="border-collapse: collapse;">
                      <tbody><tr>
                        <td width="64%" valign="top" style="${cellB}">
                          <span class="cl">SITUA\u00c7\u00c3O ESPECIAL</span><br>
                          <span class="cv">********</span><br>
                        </td>
                        <td width="2%" style="border-right: 1px solid #000;"></td>
                        <td width="24%" valign="top" style="${cellL}">
                          <span class="cl">DATA DA SITUA\u00c7\u00c3O ESPECIAL</span><br>
                          <span class="cv">********</span><br>
                        </td>
                      </tr></tbody>
                    </table>

                  </td></tr></tbody></table>
                  </div>
                ` }} />
              </div>
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <a href="https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Abrir cartao oficial
              </a>
              <div className="flex gap-2">
                <Button type="button" variant="success" size="sm" className="gap-1" onClick={() => { buscarCnpj(); setCnpjCard(null) }}>
                  <CheckCircle2 className="h-4 w-4" /> Completar no formulario
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setCnpjCard(null)}>
                  Fechar
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )
      })()}
    </Card>
  )
}

function ComercialCard({ register, control, watch, chatMsg, setChatMsg, chatAsCliente, setChatAsCliente, clienteId, opcoesOrigem, opcoesGrupo, canEdit, onPedirInativar }: {
  register: ReturnType<typeof useForm<CreateClienteInput>>['register']
  control: ReturnType<typeof useForm<CreateClienteInput>>['control']
  watch: ReturnType<typeof useForm<CreateClienteInput>>['watch']
  errors: ReturnType<typeof useForm<CreateClienteInput>>['formState']['errors']
  chatMsg: string; setChatMsg: (v: string) => void
  chatAsCliente: boolean; setChatAsCliente: (v: boolean) => void
  clienteId?: string
  opcoesOrigem: Array<{ id: string; valor: string }>
  opcoesGrupo: Array<{ id: string; valor: string }>
  canEdit: boolean
  onPedirInativar: (dataSaida: string) => void
}) {
  /**
   * Data de saída preenchida → oferece inativar o cliente (#HLP0329).
   *
   * Sair da carteira e continuar ativo no sistema é o estado que ninguém quer:
   * o cliente segue aparecendo em listagem, cobrança e obrigação. Antes isso
   * dependia de lembrar de trocar a situação num campo do outro lado da tela.
   *
   * #HLP0209 — em vez de um confirm cru, ABRE o modal de inativação já com a
   * data preenchida (o modal coleta o motivo e chama o endpoint dedicado). É
   * PERGUNTA, não automático: quem só registra a data pode cancelar.
   */
  function perguntarInativar(dataSaida: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataSaida)) return   // data incompleta
    if (watch('status') === 'INATIVO') return
    onPedirInativar(dataSaida)
  }

  const [activeTab, setActiveTab] = useState('cadastros')
  const [historicos, setHistoricos] = useState<Array<{ id: string; mensagem: string; tipo: string; createdAt: string; user: { id: string; name: string } | null }>>([])
  const [histLoaded, setHistLoaded] = useState(false)
  const [histSending, setHistSending] = useState(false)

  // Lazy load historicos
  useEffect(() => {
    if (activeTab === 'historicos' && clienteId && !histLoaded) {
      trpc.cliente.listHistoricos.query({ clienteId }).then((data: unknown) => {
        setHistoricos(data as typeof historicos)
        setHistLoaded(true)
      }).catch(() => setHistLoaded(true))
    }
  }, [activeTab, clienteId, histLoaded])

  async function sendHistorico() {
    if (!clienteId || !chatMsg.trim()) return
    setHistSending(true)
    try {
      const item = await trpc.cliente.createHistorico.mutate({
        clienteId, mensagem: chatMsg, tipo: chatAsCliente ? 'cliente' : 'equipe',
      })
      setHistoricos(prev => [...prev, item as typeof historicos[0]])
      setChatMsg('')
    } catch { alerts.error('Erro', 'Não foi possível enviar.') }
    finally { setHistSending(false) }
  }

  async function deleteHistorico(id: string) {
    const ok = await alerts.confirmDelete('esta mensagem')
    if (!ok) return
    try {
      await trpc.cliente.deleteHistorico.mutate({ id })
      setHistoricos(prev => prev.filter(h => h.id !== id))
    } catch {}
  }

  const tabs = [
    { key: 'cadastros', label: 'Cadastros', icon: Briefcase },
    { key: 'contratos', label: 'Contratos', icon: File },
    { key: 'orcamentos', label: 'Orçamentos', icon: FileBarChart },
    { key: 'historicos', label: 'Históricos', icon: History },
  ]

  return (
    <Card>
      <CardHeader>
        <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Comercial
        </h5>
      </CardHeader>
      <div className="flex min-h-[450px]">
        {/* Pills laterais */}
        <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                    activeTab === tab.key
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                  )}
                  style={activeTab === tab.key ? { backgroundColor: 'var(--mod-cadastros, #10b981)' } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conteúdo — read-only sem permissão 'manage_commercial' (mantém as pills) */}
        <fieldset disabled={!canEdit} className="flex-1 min-w-0 border-0 m-0 p-0 [&:disabled_*]:pointer-events-none">
        <div key={activeTab} className="min-w-0 flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
          {activeTab === 'cadastros' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Dados Comerciais</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>Grupo Empresarial</Label>
                  <Controller control={control} name="grupo" render={({ field }) => {
                    const opts = opcoesGrupo.map((o) => o.valor)
                    const cur = field.value || ''
                    const merged = cur && !opts.includes(cur) ? [cur, ...opts] : opts
                    return (
                      <Select value={cur} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{merged.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    )
                  }} />
                </div>
                <div className="col-span-6 md:col-span-3 space-y-1.5">
                  <Label>Data Entrada</Label>
                  <Input type="date" {...register('dataEntrada')} />
                </div>
                <div className="col-span-6 md:col-span-3 space-y-1.5">
                  <Label>Data Saída</Label>
                  <Input type="date" {...register('dataSaida', {
                    onChange: (e: { target: { value: string } }) => { void perguntarInativar(e.target.value) },
                  })} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Categoria<RequiredMark /></Label>
                  <Controller control={control} name="categoria" render={({ field }) => (
                    <Select value={field.value || 'NAO_INFORMADO'} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
                {/* Situação sai daqui: o badge do cabeçalho já edita o mesmo campo,
                    com a mesma permissão ("Gerenciar aba comercial"). Só existe no
                    modo edição — no cadastro esta aba nem aparece. */}
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Origem</Label>
                  <Controller control={control} name="origem" render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{opcoesOrigem.map((o) => <SelectItem key={o.id} value={o.valor}>{o.valor}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-border">
                    <h4 className="text-[13px] font-semibold text-foreground">Observações gerais</h4>
                  </div>
                </div>
                <div className="col-span-12" style={{ marginTop: 'calc(var(--spacing) * -5)' }}>
                  <Controller control={control} name="observacoes" render={({ field }) => (
                    <RichEditor
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Informações relevantes sobre o cliente..."
                    />
                  )} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contratos' && (
            <ContratosPanel clienteId={clienteId} />
          )}

          {activeTab === 'orcamentos' && (
            <OrcamentosTab clienteId={clienteId} />
          )}

          {activeTab === 'historicos' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Histórico de negociações</h4>
              </div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground mb-4">Registros em formato de chat. Use para anotar falas e acordos com o cliente.</p>
                {/* Chat messages */}
                <div className="border border-border rounded-lg bg-muted/10 min-h-[200px] max-h-[400px] overflow-y-auto p-4 mb-4 space-y-3 scrollbar-none">
                  {!histLoaded ? (
                    <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                  ) : historicos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground text-sm py-10">
                      <History className="h-8 w-8 mb-2 opacity-30" />
                      Nenhum registro ainda.
                    </div>
                  ) : (
                    historicos.map((h) => (
                      <div key={h.id} className={cn('flex', h.tipo === 'cliente' ? 'justify-start' : 'justify-end')}>
                        <div className={cn(
                          'max-w-[80%] rounded-lg px-4 py-2.5 relative group',
                          h.tipo === 'cliente'
                            ? 'bg-white border border-border/60 dark:bg-gray-800'
                            : 'text-white'
                        )} style={h.tipo !== 'cliente' ? { backgroundColor: 'var(--mod-cadastros, #10b981)' } : undefined}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold" style={h.tipo !== 'cliente' ? { color: 'rgba(255,255,255,0.8)' } : { color: '#495057' }}>
                              {h.tipo === 'cliente' ? 'Cliente' : (h.user?.name || 'Equipe')}
                            </span>
                            <span className="text-[9px]" style={h.tipo !== 'cliente' ? { color: 'rgba(255,255,255,0.6)' } : { color: '#878a99' }}>
                              {new Date(h.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <RichContent className="text-xs" style={h.tipo !== 'cliente' ? { color: '#fff' } : undefined} html={h.mensagem} />
                          <button
                            type="button"
                            onClick={() => deleteHistorico(h.id)}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            title="Excluir"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {/* Compose */}
                <div className="space-y-3">
                  <RichEditor
                    value={chatMsg}
                    onChange={setChatMsg}
                    placeholder="Digite uma mensagem..."
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                      <Checkbox checked={chatAsCliente} onCheckedChange={(v) => setChatAsCliente(!!v)} />
                      Registrar como fala do cliente
                    </label>
                    <Button type="button" size="sm" disabled={!chatMsg.trim() || histSending} onClick={sendHistorico} style={{ backgroundColor: 'var(--mod-cadastros, #10b981)', color: '#fff' }}>
                      {histSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {histSending ? 'Enviando...' : 'Enviar'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </fieldset>
      </div>
    </Card>
  )
}

function ContratosPanel({ clienteId }: { clienteId?: string }) {
  const [showParamModal, setShowParamModal] = useState(false)

  // Verificar no ERP
  const [showErpModal, setShowErpModal] = useState(false)

  // Graficos
  const [showChartModal, setShowChartModal] = useState(false)
  const [chartDatei, setChartDatei] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10) })
  const [chartDatef, setChartDatef] = useState(() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10) })
  const [chartData, setChartData] = useState<Record<string, unknown> | null>(null)
  const [chartLoading, setChartLoading] = useState(false)
  /** Baseline do contrato só para as linhas de referência do gráfico — quem
   *  edita é o ParametrosContratoModal. */
  const [baseline, setBaseline] = useState({
    honorario: 0, lancamentos: 0, faturamento: 0, nfEntrada: 0, nfSaida: 0, nfPrestado: 0, nfTomado: 0, funcionarios: 0,
  })

  // Arquivos do contrato
  const [showFilesModal, setShowFilesModal] = useState(false)
  const [files, setFiles] = useState<Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; createdAt: string; user: { name: string } | null }>>([])
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function loadChartData() {
    if (!clienteId) return
    setChartLoading(true)
    try {
      // Sempre lê do snapshot (DB). Quem alimenta é o botão "Verificar no ERP",
      // que ao buscar do SCI também grava no DB.
      const [result, par] = await Promise.all([
        trpc.cliente.getMetricasSnapshot.query({ clienteId, datai: chartDatei, dataf: chartDatef }),
        trpc.cliente.getContratoParams.query({ clienteId }).catch(() => null),
      ])
      setChartData(result as Record<string, unknown>)
      if (par) {
        const d = par as Record<string, unknown>
        const n = (k: string) => Number(d[k]) || 0
        setBaseline({
          honorario: n('honorario'), lancamentos: n('lancamentos'), faturamento: n('faturamento'),
          nfEntrada: n('nfEntrada'), nfSaida: n('nfSaida'), nfPrestado: n('nfPrestado'),
          nfTomado: n('nfTomado'), funcionarios: n('funcionarios'),
        })
      }
    } catch (e) {
      alerts.error('Erro', mensagemErro(e, 'Nao foi possivel carregar dados para os graficos.'))
    } finally { setChartLoading(false) }
  }

  async function loadFiles() {
    if (!clienteId) return
    try {
      const data = await trpc.cliente.listArquivos.query({ clienteId })
      setFiles(data as typeof files)
      setFilesLoaded(true)
    } catch { setFilesLoaded(true) }
  }

  async function openFilesModal() {
    setShowFilesModal(true)
    if (!filesLoaded) loadFiles()
  }

  async function uploadFiles(fileList: FileList | File[]) {
    if (!clienteId || !fileList || (fileList as FileList).length === 0) return
    setUploading(true)
    const apiUrl = getApiUrl()
    let uploaded = 0
    for (const file of Array.from(fileList)) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          const url = data.url || data.filename || ''
          if (url) {
            await trpc.cliente.addArquivo.mutate({ clienteId: clienteId!, fileName: file.name, fileUrl: url, fileSize: file.size, mimeType: file.type })
            uploaded++
          }
        }
      } catch { /* skip */ }
    }
    setUploading(false)
    // Forcar reload da lista
    setFilesLoaded(false)
    try {
      const freshData = await trpc.cliente.listArquivos.query({ clienteId: clienteId! })
      setFiles(freshData as typeof files)
      setFilesLoaded(true)
    } catch { setFilesLoaded(true) }
    if (uploaded > 0) alerts.success('Upload concluido', `${uploaded} arquivo(s) enviado(s) com sucesso.`)
  }

  function handleFileClick() {
    if (!clienteId) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = (e) => {
      const fl = (e.target as HTMLInputElement).files
      if (fl) uploadFiles(fl)
    }
    input.click()
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('border-emerald-400')
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  async function deleteFile(id: string, name: string) {
    const ok = await alerts.confirmDelete(name)
    if (!ok) return
    try {
      await trpc.cliente.removeArquivo.mutate({ arquivoId: id })
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch {}
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  function getFileIcon(mime: string | null, name: string) {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️'
    if (mime === 'application/pdf' || ext === 'pdf') return '📄'
    if (['doc', 'docx'].includes(ext)) return '📝'
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
    if (['zip', 'rar', '7z'].includes(ext)) return '📦'
    return '📎'
  }

  async function openChartModal() {
    setShowChartModal(true)
    if (!chartData) loadChartData()
  }

  return (
    <>
      <div className="-m-5">
        <div className="px-5 py-3 border-b border-border">
          <h4 className="text-[13px] font-semibold text-foreground">Contratos</h4>
        </div>
        <div className="p-5 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col items-center text-center p-5 rounded border border-dashed border-border/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3"><FileText className="h-6 w-6 text-muted-foreground" /></div>
            <h4 className="font-semibold text-xs mb-1">Parametros</h4>
            <p className="text-[10px] text-muted-foreground mb-3">Parametros do contrato para acompanhamento no grafico.</p>
            <div className="flex flex-col gap-2 w-full">
              <Button type="button" size="sm" onClick={() => setShowParamModal(true)} style={{ backgroundColor: 'var(--mod-cadastros, #10b981)', color: '#fff' }} className="w-full">→ Atualizar Parametros</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowErpModal(true)} className="w-full"><ExternalLink className="h-3 w-3" /> Verificar no ERP</Button>
            </div>
          </div>
          <div className="flex flex-col items-center text-center p-5 rounded border border-dashed border-border/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3"><FileBarChart className="h-6 w-6 text-muted-foreground" /></div>
            <h4 className="font-semibold text-xs mb-1">Graficos</h4>
            <p className="text-[10px] text-muted-foreground mb-3">Indicadores do cliente (Contrato x ERP).</p>
            <Button type="button" variant="outline" size="sm" onClick={openChartModal}>→ Abrir Graficos</Button>
          </div>
          <div className="flex flex-col items-center text-center p-5 rounded border border-dashed border-border/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3"><File className="h-6 w-6 text-muted-foreground" /></div>
            <h4 className="font-semibold text-xs mb-1">Arquivos</h4>
            <p className="text-[10px] text-muted-foreground mb-3">Contratos, aditivos e documentos.</p>
            <Button type="button" size="sm" onClick={openFilesModal} style={{ backgroundColor: 'var(--mod-cadastros, #10b981)', color: '#fff' }}>
              → Gerenciar Arquivos {filesLoaded && files.length > 0 && <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/30 px-1 text-[10px]">{files.length}</span>}
            </Button>
          </div>
        </div>
      </div>

      {/* Parâmetros do contrato — componente compartilhado com o painel de
          gestão de contratos, que abre o mesmo modal pela coluna Situação. */}
      {clienteId && (
        <ParametrosContratoModal
          clienteId={clienteId}
          open={showParamModal}
          onOpenChange={setShowParamModal}
        />
      )}

      {/* Verificar no ERP — componente compartilhado com o painel de gestão
          de contratos, que abre o mesmo modal pelo ícone de banco da coluna
          Situação. A consulta já grava os snapshots. */}
      {clienteId && (
        <VerificarErpModal
          clienteId={clienteId}
          open={showErpModal}
          onOpenChange={setShowErpModal}
        />
      )}

      {/* Modal Gerenciar Arquivos */}
      {showFilesModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => setShowFilesModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col modal-content" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
                <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground" /> Arquivos do Contrato
                  {files.length > 0 && <span className="text-[10px] font-normal text-muted-foreground">({files.length})</span>}
                </h4>
                <button type="button" onClick={() => setShowFilesModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {/* Upload area */}
              <div className="px-5 py-3 border-b border-border shrink-0">
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border/60 px-4 py-5 cursor-pointer hover:border-emerald-400/50 transition-colors"
                  onClick={handleFileClick}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('border-emerald-400') }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-emerald-400') }}
                  onDrop={handleFileDrop}
                >
                  {uploading ? (
                    <><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /><p className="text-xs text-muted-foreground">Enviando arquivos...</p></>
                  ) : (
                    <><FileText className="h-6 w-6 text-muted-foreground/40" /><p className="text-xs font-medium">Clique ou arraste arquivos aqui</p><p className="text-[10px] text-muted-foreground">PDF, Word, Excel, imagens, ZIP</p></>
                  )}
                </div>
              </div>
              {/* Lista de arquivos */}
              <div className="flex-1 overflow-y-auto scrollbar-none">
                {!filesLoaded ? (
                  <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <File className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">Nenhum arquivo enviado.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {files.map((f) => {
                      const isImage = f.mimeType?.startsWith('image/')
                      const apiUrl = getApiUrl()
                      const fullUrl = f.fileUrl.startsWith('http') ? f.fileUrl : `${apiUrl}${f.fileUrl}`
                      return (
                        <div key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 group">
                          {/* Preview / Icon */}
                          <div className="shrink-0">
                            {isImage ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={fullUrl} alt={f.fileName} className="h-10 w-10 rounded object-cover border border-border/40" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-lg">
                                {getFileIcon(f.mimeType, f.fileName)}
                              </div>
                            )}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <InlineFileName
                              fileName={f.fileName}
                              fileUrl={fullUrl}
                              onRename={async (newName) => {
                                await trpc.cliente.renameArquivo.mutate({ arquivoId: f.id, fileName: newName })
                                setFiles(prev => prev.map(x => x.id === f.id ? { ...x, fileName: newName } : x))
                              }}
                            />
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {f.fileSize && <span>{formatFileSize(f.fileSize)}</span>}
                              {f.user && <span>por {f.user.name}</span>}
                              <span>{new Date(f.createdAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                            <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Visualizar">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button type="button" onClick={() => deleteFile(f.id, f.fileName)} className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600" title="Excluir">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
                <span className="text-[10px] text-muted-foreground">{files.length} arquivo(s)</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowFilesModal(false)}>Fechar</Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Gráficos — Contrato x ERP (componente extraído) */}
      {showChartModal && (
        <ContratoChartModal
          chartDatei={chartDatei} setChartDatei={setChartDatei}
          chartDatef={chartDatef} setChartDatef={setChartDatef}
          chartData={chartData} chartLoading={chartLoading}
          params={baseline}
          onLoad={loadChartData}
          onClose={() => setShowChartModal(false)}
          onOpenErp={() => { setShowChartModal(false); setShowErpModal(true) }}
        />
      )}
    </>
  )
}


function InlineFileName({ fileName, onRename }: { fileName: string; fileUrl: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Separar nome e extensao
  const dotIdx = fileName.lastIndexOf('.')
  const baseName = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName
  const extension = dotIdx > 0 ? fileName.slice(dotIdx) : ''
  const [value, setValue] = useState(baseName)

  async function save() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === baseName) { setEditing(false); setValue(baseName); return }
    setSaving(true)
    try {
      await onRename(trimmed + extension)
      setEditing(false)
    } catch { setValue(baseName); setEditing(false) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          autoFocus
          className="text-xs font-medium border border-primary rounded px-1.5 py-0.5 flex-1 outline-none min-w-0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(baseName) } }}
          onBlur={save}
          disabled={saving}
          onFocus={(e) => e.target.select()}
        />
        <span className="text-[10px] text-muted-foreground shrink-0">{extension}</span>
      </div>
    )
  }

  return (
    <span
      className="text-xs font-medium truncate block cursor-text hover:text-primary"
      onClick={() => { setValue(baseName); setEditing(true) }}
      title="Clique para renomear"
    >
      {fileName}
    </span>
  )
}

function GoogleMapsEmbed({ logradouro, numero, bairro, cidade, uf, cep }: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string
}) {
  const address = [logradouro, numero, bairro, cidade, uf, cep].filter(Boolean).join(', ')

  if (!address || address.replace(/,\s*/g, '').trim().length < 5) {
    return (
      <div className="flex items-center justify-center rounded bg-muted/30 border border-dashed border-border/60 py-12 text-sm text-muted-foreground">
        Preencha o endereço para visualizar no mapa
      </div>
    )
  }

  const query = encodeURIComponent(address)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`

  return (
    <div className="space-y-2">
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        Abrir no Maps <ExternalLink className="h-3 w-3" />
      </a>
      <div className="relative w-full overflow-hidden rounded" style={{ aspectRatio: '21/9' }}>
        <iframe
          title="Mapa do cliente"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          allowFullScreen
          src={`https://maps.google.com/maps?q=${query}&z=15&output=embed`}
        />
      </div>
    </div>
  )
}

// ============================================================
// OmieBuscarButton — botão da aba Integrações que localiza o cliente no Omie
// pelo CNPJ (API Omie) e preenche ID Omie + Empresa Omie no formulário.
// Port da integração de cadastro do SERPRO2 (omieService.obterCodigoClientePorCnpj).
// ============================================================
function OmieBuscarButton({ documento, omieEmpresa, onResult }: {
  documento: string | undefined
  omieEmpresa: string | undefined
  onResult: (idOmie: string, empresa: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    const doc = (documento || '').replace(/\D/g, '')
    if (!doc) {
      alerts.error('CNPJ ausente', 'Preencha o documento (CNPJ) do cliente antes de buscar no Omie.')
      return
    }
    setLoading(true)
    try {
      const r = await trpc.cliente.omieBuscarCliente.query({ documento: doc, omieEmpresa: omieEmpresa || undefined })
      if (r.encontrado && r.idOmie && r.omieEmpresa) {
        onResult(r.idOmie, r.omieEmpresa)
        await alerts.success(
          'Cliente localizado no Omie',
          `ID ${r.idOmie} · ${r.omieEmpresa}${r.razaoSocialOmie ? ' · ' + r.razaoSocialOmie : ''}. Salve o cadastro para gravar o vínculo.`,
        )
      } else {
        alerts.error('Não encontrado', 'Nenhum cliente com esse CNPJ foi localizado no Omie.')
      }
    } catch (e) {
      alerts.error('Falha na busca', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="col-span-12 flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="button" onClick={handle} disabled={loading} className="gap-2 shrink-0" style={{ backgroundColor: '#0ea5e9', color: '#fff' }}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />}
        Buscar no Omie por CNPJ
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Localiza o cliente no Omie pelo CNPJ e preenche o ID e a empresa. Com a empresa Omie já selecionada, busca só nela; senão varre Central e L&amp;L.
      </p>
    </div>
  )
}

// ============================================================
// AcessoriasIntegracao — bloco da aba Integrações que mostra o ID
// atual no Acessórias (se existir) e o botão de cadastro/sincronia.
// Lê o status via trpc.cliente.getById (idAcessorias) e dispara
// trpc.acessorias.createCompanyFromCliente quando clicado.
// ============================================================
function AcessoriasIntegracao({ clienteId }: { clienteId: string | null }) {
  const [loading, setLoading] = useState(false)
  const [idAtual, setIdAtual] = useState<number | null>(null)
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)

  // Busca o idAcessorias atual ao abrir a aba (só uma vez por cliente)
  useEffect(() => {
    if (!clienteId || fetchedFor === clienteId) return
    setFetchedFor(clienteId)
    trpc.cliente.getById.query({ id: clienteId })
      .then((c: any) => setIdAtual(c?.idAcessorias ?? null))
      .catch(() => setIdAtual(null))
  }, [clienteId, fetchedFor])

  const handleCadastrar = async () => {
    if (!clienteId) {
      alerts.error('Salve o cliente', 'Salve o cliente antes de cadastrar no Acessórias.')
      return
    }
    if (idAtual) {
      const ok = await alerts.confirmDelete(
        `Cliente já está vinculado ao Acessórias (ID ${idAtual}). Reenviar dados pode atualizar o cadastro lá. Continuar?`,
      )
      if (!ok) return
    }
    setLoading(true)
    try {
      const r = await (trpc as any).acessorias.createCompanyFromCliente.mutate({ clienteId })
      setIdAtual(r.idAcessorias)
      await alerts.success(
        r.atualizou ? 'Cliente atualizado no Acessórias' : 'Cliente cadastrado no Acessórias',
        `ID Acessórias: ${r.idAcessorias}. ${r.mensagem}`,
      )
    } catch (e) {
      alerts.error('Falha ao cadastrar', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="col-span-12 md:col-span-6 space-y-1.5">
        <Label>ID Acessórias</Label>
        <Input value={idAtual != null ? String(idAtual) : ''} readOnly placeholder="—" />
        <p className="text-[11px] text-muted-foreground">Atualizado automaticamente ao cadastrar via botão</p>
      </div>
      <div className="col-span-12 md:col-span-6 flex items-end">
        <Button
          type="button"
          onClick={handleCadastrar}
          disabled={loading || !clienteId}
          className="gap-2"
          style={{ backgroundColor: '#0ea5e9', color: '#fff' }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          {idAtual ? 'Sincronizar no Acessórias' : 'Cadastrar no Acessórias'}
        </Button>
      </div>
    </>
  )
}

// ============================================================
// ============================================================
// FiscalCard — pills laterais (padrão igual ComercialCard)
// ============================================================

function FiscalCard({ control, clienteId, isEdit, documento, canEdit }: {
  register: ReturnType<typeof useForm<CreateClienteInput>>['register']
  control: ReturnType<typeof useForm<CreateClienteInput>>['control']
  clienteId?: string
  isEdit: boolean
  documento: string
  canEdit: boolean
}) {
  const [activeTab, setActiveTab] = useState('dados')

  const tabs = [
    { key: 'dados', label: 'Dados Fiscais', icon: Receipt },
    { key: 'situacao', label: 'Situação Fiscal', icon: Shield },
    { key: 'caixapostal', label: 'Caixa Postal', icon: Mail },
    { key: 'drive', label: 'Monitorar XML', icon: HardDriveDownload },
    { key: 'atalhos', label: 'Atalhos', icon: ExternalLink },
  ]

  return (
    <Card>
      <CardHeader>
        <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" /> Fiscal
        </h5>
      </CardHeader>
      <div className="flex min-h-[450px]">
        {/* Pills laterais */}
        <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                    activeTab === tab.key
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                  )}
                  style={activeTab === tab.key ? { backgroundColor: 'var(--mod-cadastros, #10b981)' } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conteúdo — read-only sem permissão 'manage_fiscal' (mantém as pills) */}
        <fieldset disabled={!canEdit} className="flex-1 min-w-0 border-0 m-0 p-0 [&:disabled_*]:pointer-events-none">
        <div key={activeTab} className="min-w-0 flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
          {activeTab === 'dados' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Dados Fiscais</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>Tributação</Label>
                  <Controller control={control} name="tributacao" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        {TRIBUTACAO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>Regime</Label>
                  <Controller control={control} name="regime" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        {Object.entries(REGIME_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>

              {/* Registro de Inscrições — mesmo padrão visual de "Dados Fiscais"
                  (header-bar full-width + conteúdo em p-5). */}
              <div className="px-5 py-3 border-b border-border dark:border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Registro de Inscrições</h4>
              </div>
              <div className="p-5">
                {isEdit && clienteId ? (
                  <RegistroInscricoesCard clienteId={clienteId} />
                ) : (
                  <p className="text-xs text-muted-foreground">Salve o cliente para registrar inscrições.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'situacao' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Situação Fiscal (SERPRO)</h4>
              </div>
              <div className="p-5">
                {isEdit && clienteId ? (
                  <SituacaoFiscalCard clienteId={clienteId} documento={documento} />
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Salve o cliente para consultar a situação fiscal.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'caixapostal' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Caixa Postal e-CAC</h4>
              </div>
              <div className="p-5">
                {isEdit && clienteId ? (
                  <CaixaPostalClienteCard documento={documento} />
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Salve o cliente para visualizar a caixa postal.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'drive' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Monitorar XML — captura automática de NFe</h4>
              </div>
              <div className="p-5">
                {isEdit && clienteId ? (
                  <DriveSyncCard clienteId={clienteId} />
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <HardDriveDownload className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Salve o cliente para vincular uma pasta do Drive.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'atalhos' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Atalhos Fiscais</h4>
              </div>
              <div className="p-5 space-y-2">
                <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.open('https://agenciavirtual.sefaz.es.gov.br', '_blank')}>
                  <ExternalLink className="h-4 w-4" /> Agência Virtual — SEFAZ/ES
                </Button>
                <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.open('https://cav.receita.fazenda.gov.br', '_blank')}>
                  <ExternalLink className="h-4 w-4" /> e-CAC — Receita Federal
                </Button>
                <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.open('https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir', '_blank')}>
                  <ExternalLink className="h-4 w-4" /> Certidão Negativa — Receita Federal
                </Button>
                <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.open('https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf', '_blank')}>
                  <ExternalLink className="h-4 w-4" /> CRF — FGTS (Caixa)
                </Button>
                <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.open('https://cndt-certidao.tst.jus.br/inicio.faces', '_blank')}>
                  <ExternalLink className="h-4 w-4" /> CNDT — Certidão Trabalhista
                </Button>
              </div>
            </div>
          )}
        </div>
        </fieldset>
      </div>
    </Card>
  )
}

// Situação Fiscal Card (dentro da aba Fiscal)
// ============================================================

const CERTIDAO_COLORS_INLINE: Record<string, string> = {
  'Negativa': 'bg-emerald-100 text-emerald-800',
  'Positiva': 'bg-red-100 text-red-800',
  'Positiva com Efeitos de Negativa': 'bg-amber-100 text-amber-800',
  'Pendente': 'bg-gray-100 text-gray-600',
}

function SituacaoFiscalCard({ clienteId, documento }: { clienteId: string; documento: string }) {
  const [consultas, setConsultas] = useState<Array<{
    id: string; documento: string; razaoSocial: string | null
    tipoCertidao: string | null; etapa: string; sucesso: boolean; erro: string | null
    createdAt: string; user: { id: string; name: string } | null
  }>>([])
  const [loading, setLoading] = useState(true)
  const [consultando, setConsultando] = useState(false)

  const loadConsultas = useCallback(async () => {
    setLoading(true)
    try { setConsultas(await trpc.sitfis.getByClienteId.query({ clienteId }) as typeof consultas) }
    catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { loadConsultas() }, [loadConsultas])

  async function handleConsultar() {
    const doc = (documento || '').replace(/\D/g, '')
    if (doc.length !== 11 && doc.length !== 14) {
      alerts.error('Documento inválido', 'O cliente precisa ter um CPF ou CNPJ válido.')
      return
    }
    setConsultando(true)
    try {
      const result = await trpc.sitfis.consultar.mutate({ documento: doc, clienteId })
      if (result.sucesso) {
        await alerts.success('Consulta realizada', `Certidão: ${result.tipoCertidao || 'Processando'}`)
      } else {
        alerts.error('Erro', result.erro || 'Não foi possível consultar.')
      }
      loadConsultas()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setConsultando(false) }
  }

  async function handleDownloadPdf(id: string) {
    try {
      const pdf = await trpc.sitfis.getPdf.query({ id })
      if (!pdf) { alerts.error('PDF não disponível', 'O relatório PDF não foi gerado.'); return }
      const blob = new Blob([Buffer.from(pdf, 'base64')], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `sitfis_${limparCnpj(documento)}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { alerts.error('Erro', 'Não foi possível baixar.') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CircleUser className="h-4 w-4" /> Situação Fiscal (SERPRO)
          </h4>
          {consultas.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Última consulta: {new Date(consultas[0]!.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <Button type="button" variant="success" size="sm" onClick={handleConsultar} disabled={consultando} className="gap-1.5">
          {consultando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />}
          {consultando ? 'Consultando...' : 'Consultar Situação Fiscal'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : consultas.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Nenhuma consulta de situação fiscal realizada para este cliente.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {consultas.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10">
              <div className="flex items-center gap-3">
                {c.sucesso ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                <div>
                  <div className="flex items-center gap-2">
                    {c.tipoCertidao && (
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', CERTIDAO_COLORS_INLINE[c.tipoCertidao] || 'bg-gray-100 text-gray-600')}>
                        {c.tipoCertidao}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {c.erro && <p className="text-[10px] text-red-500 mt-0.5">{c.erro.slice(0, 100)}</p>}
                  {c.user && <p className="text-[10px] text-muted-foreground mt-0.5">por {c.user.name}</p>}
                </div>
              </div>
              {c.sucesso && (
                <Button type="button" variant="soft-info" size="icon-sm" onClick={() => handleDownloadPdf(c.id)} title="Baixar PDF">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LogsTab({ clienteId }: { clienteId: string }) {
  const [events, setEvents] = useState<Array<{
    id: string; type: string; version: number; changes: Record<string, { from: unknown; to: unknown }> | null
    createdAt: string; user: { id: string; name: string } | null
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    trpc.cliente.getEvents.query({ clienteId })
      .then((data: unknown) => setEvents(data as typeof events))
      .finally(() => setLoading(false))
  }, [clienteId])

  const typeLabels: Record<string, { label: string; color: string }> = {
    created: { label: 'Criado', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    updated: { label: 'Atualizado', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    // #HLP0209 — inativação/reativação (status como soft-delete). Cores derivam da
    // fonte única (cliente-status-ui). deleted/restored ficam para a antiga Lixeira.
    inactivated: { label: 'Inativado', color: EVENT_BADGE_CLASS.inactivated },
    reactivated: { label: 'Reativado', color: EVENT_BADGE_CLASS.reactivated },
    deleted: { label: 'Excluído', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    restored: { label: 'Restaurado', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  }

  if (loading) return <Card className="flex items-center justify-center py-16"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></Card>

  if (events.length === 0) return <PlaceholderTab icon={ListTodo} title="Sem registros" description="Nenhuma alteração registrada ainda." />

  return (
    <Card className="p-5">
      <h4 className="text-sm font-semibold mb-4">Histórico de alterações</h4>
      <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-none">
        {events.map((evt) => {
          const t = typeLabels[evt.type] || { label: evt.type, color: 'bg-muted text-muted-foreground' }
          return (
            <div key={evt.id} className="flex gap-3 text-sm border-b border-border/30 pb-3 last:border-0">
              <div className="shrink-0 mt-0.5">
                <span className={cn('inline-flex rounded px-2 py-0.5 text-[10px] font-medium', t.color)}>{t.label}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {evt.user?.name || 'Sistema'} &middot; v{evt.version} &middot; {new Date(evt.createdAt).toLocaleDateString('pt-BR')} {new Date(evt.createdAt).toLocaleTimeString('pt-BR')}
                </p>
                {evt.changes && Object.keys(evt.changes).length > 0 && (() => {
                  // #HLP0209 — inativação/reativação guardam campos PLANOS (motivo,
                  // dataSaida), não diffs {from,to}: renderiza como rótulos.
                  if (evt.type === 'inactivated' || evt.type === 'reactivated') {
                    const ch = evt.changes as unknown as Record<string, unknown>
                    const motivo = typeof ch.motivo === 'string' ? ch.motivo : null
                    const ds = typeof ch.dataSaida === 'string' ? ch.dataSaida : null
                    return (
                      <div className="mt-1.5 space-y-1 text-xs">
                        {motivo && <div><span className="font-medium">Motivo</span>: <span className="text-muted-foreground">{motivo}</span></div>}
                        {evt.type === 'inactivated' && ds && <div><span className="font-medium">Data de saída</span>: <span className="text-muted-foreground">{ds.split('-').reverse().join('/')}</span></div>}
                      </div>
                    )
                  }
                  return (
                    <div className="mt-1.5 space-y-1">
                      {Object.entries(evt.changes!).map(([field, change]) => (
                        <div key={field} className="text-xs">
                          <span className="font-medium">{field}</span>: <span className="text-muted-foreground line-through">{String(change.from || '—')}</span> → <span className="text-foreground">{String(change.to || '—')}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// Hook de permissões do módulo clientes extraído para `./use-clientes-perms`
// (compartilhado com os cards de cada aba).

const MODULE_COLOR_CLIENTES = 'var(--mod-cadastros, #10b981)'

const UF_LIST = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

interface InscricaoRow { id: string; estado: string; inscricao: string; descricao: string | null; createdAt: string }

/* ================================================================== */
/* Registro de Inscrições (estaduais — N por cliente, migrado do legado) */
/* ================================================================== */
function RegistroInscricoesCard({ clienteId }: { clienteId: string }) {
  const { canWrite, canDelete } = useClientesPerms()
  const [rows, setRows] = useState<InscricaoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState('')
  const [inscricao, setInscricao] = useState('')
  const [descricaoNova, setDescricaoNova] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editEstado, setEditEstado] = useState('')
  const [editInscricao, setEditInscricao] = useState('')
  const [editDescricao, setEditDescricao] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc.cliente as any).listInscricoes.query({ clienteId })
      setRows(data as InscricaoRow[])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [clienteId])
  useEffect(() => { void load() }, [load])

  async function handleAdd() {
    if (!estado || !inscricao.trim()) { alerts.error('Preencha o estado e a inscrição.'); return }
    setSaving(true)
    try {
      await (trpc.cliente as any).addInscricao.mutate({ clienteId, estado, inscricao: inscricao.trim(), descricao: descricaoNova.trim() || undefined })
      setEstado(''); setInscricao(''); setDescricaoNova('')
      await load()
    } catch (e) { alerts.error('Erro', (e as Error).message || 'Não foi possível adicionar.') }
    finally { setSaving(false) }
  }

  function startEdit(r: InscricaoRow) { setEditId(r.id); setEditEstado(r.estado); setEditInscricao(r.inscricao); setEditDescricao(r.descricao || '') }
  function cancelEdit() { setEditId(null); setEditEstado(''); setEditInscricao(''); setEditDescricao('') }
  async function saveEdit() {
    if (!editId) return
    if (!editEstado || !editInscricao.trim()) { alerts.error('Preencha o estado e a inscrição.'); return }
    setSaving(true)
    try {
      await (trpc.cliente as any).updateInscricao.mutate({ id: editId, estado: editEstado, inscricao: editInscricao.trim(), descricao: editDescricao.trim() || undefined })
      cancelEdit()
      await load()
    } catch (e) { alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }

  async function handleRemove(id: string) {
    const ok = await alerts.confirmDelete('esta inscrição')
    if (!ok) return
    try {
      await (trpc.cliente as any).removeInscricao.mutate({ id })
      await load()
    } catch (e) { alerts.error('Erro', (e as Error).message || 'Não foi possível remover.') }
  }

  return (
    <div>
      {loading ? (
        <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem registro</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-24 px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Inscrição</th>
                <th className="px-3 py-2 text-left">Descrição</th>
                {(canWrite || canDelete) && <th className="w-20 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => editId === r.id ? (
                <tr key={r.id} className="border-b border-border/60 last:border-0 bg-muted/20">
                  <td className="px-3 py-1.5">
                    <Select value={editEstado || '__none__'} onValueChange={(v) => setEditEstado(v === '__none__' ? '' : v)}>
                      <SelectTrigger className="h-8 w-24 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">UF</SelectItem>
                        {UF_LIST.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={editInscricao} onChange={(e) => setEditInscricao(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveEdit() } if (e.key === 'Escape') cancelEdit() }} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} placeholder="Opcional" className="h-8 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveEdit() } if (e.key === 'Escape') cancelEdit() }} />
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => void saveEdit()} disabled={saving} className="mr-2 text-emerald-600 hover:text-emerald-700" title="Salvar"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground" title="Cancelar"><X className="h-4 w-4" /></button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{r.estado}</td>
                  <td className="px-3 py-2 text-foreground">{r.inscricao}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.descricao || '—'}</td>
                  {(canWrite || canDelete) && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canWrite && (
                        <button type="button" onClick={() => startEdit(r)} className="mr-2 text-muted-foreground hover:text-sky-600" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => handleRemove(r.id)} className="text-muted-foreground hover:text-rose-600" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Estado</Label>
            <Select value={estado || '__none__'} onValueChange={(v) => setEstado(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 w-24 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">UF</SelectItem>
                {UF_LIST.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[150px] space-y-1">
            <Label className="text-[11px]">Inscrição</Label>
            <Input value={inscricao} onChange={(e) => setInscricao(e.target.value)} placeholder="Número da inscrição" className="h-9 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }} />
          </div>
          <div className="flex-1 min-w-[140px] space-y-1">
            <Label className="text-[11px]">Descrição</Label>
            <Input value={descricaoNova} onChange={(e) => setDescricaoNova(e.target.value)} placeholder="Opcional" className="h-9 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }} />
          </div>
          <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/* AtividadesBeneficiosSidebar (#5/#6/#7) — substitui Áreas Contratadas */
/* ================================================================== */
type AtivBenefItem = { id: string; valor: string }
type OpcaoItem = { id: string; valor: string }
type BFStatus = 'NO_PRAZO' | 'VENCENDO' | 'VENCIDO' | 'SEM_DATA'
type BFItem = {
  id: string; catalogoId: string; beneficioNome: string; dataVencimento: string | null
  portaria: string | null; processo: string | null; obs: string | null
  orcamentoId: string | null; orcamentoNumero: number | null; status: BFStatus
}
const BF_STATUS_COR: Record<BFStatus, string> = { NO_PRAZO: '#16a34a', VENCENDO: '#d97706', VENCIDO: '#dc2626', SEM_DATA: '#6b7280' }
function bfFmtData(d: string | null): string {
  if (!d) return 'Sem data'
  const dt = new Date(d); return isNaN(dt.getTime()) ? 'Sem data' : dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function AtividadesBeneficiosSidebar({ clienteId }: { clienteId: string }) {
  const { canManageActivitiesBenefits } = useClientesPerms()
  const bfPerms = useBeneficioFiscalPerms()
  // Seção unificada: quem gerencia atividades OU benefícios pode mexer nas atividades.
  const canManageAtiv = canManageActivitiesBenefits || bfPerms.canWrite
  const [atividades, setAtividades] = useState<AtivBenefItem[]>([])
  // Benefícios agora vêm do módulo estruturado Benefícios Fiscais (catálogo + vencimento).
  const [beneficios, setBeneficios] = useState<BFItem[]>([])
  const [catBenef, setCatBenef] = useState<{ id: string; nome: string; ativo: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [optAtividade, setOptAtividade] = useState<OpcaoItem[]>([])

  // Modal de atividade (texto livre — inalterado)
  const [modal, setModal] = useState<{ kind: 'atividade'; id?: string; valor: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // Modal de benefício (estruturado)
  const [modalBenef, setModalBenef] = useState<null | { id?: string; catalogoId: string; dataVencimento: string; portaria: string; processo: string; obs: string }>(null)
  const [savingBenef, setSavingBenef] = useState(false)

  function loadBenef() {
    // Carrega sempre — o backend autoriza por 'clientes' OU 'beneficios-fiscais'.
    // (Antes travava em bfPerms.canRead, escondendo os benefícios de quem gerencia
    //  o cliente mas não tem acesso ao módulo Benefícios.)
    ;(trpc as any).beneficioFiscal.list.query({ clienteId }).then((b: BFItem[]) => setBeneficios(b)).catch(() => {})
  }

  function load() {
    Promise.all([
      trpc.cliente.listAtividades.query({ clienteId }) as Promise<AtivBenefItem[]>,
    ])
      .then(([a]) => { setAtividades(a) })
      .catch(() => {})
      .finally(() => setLoading(false))
    loadBenef()
  }

  useEffect(() => {
    load()
    // Catálogo de atividades = tipo 'ATIVIDADE' (gerenciado em Opções de Cadastro → aba
    // Atividades). Antes lia 'CLIENTE_ATIVIDADE', que nada popula → select sempre vazio.
    ;(trpc.cliente as any).listOpcoes.query({ tipo: 'ATIVIDADE' }).then((d: OpcaoItem[]) => setOptAtividade(d)).catch(() => {})
    ;(trpc as any).beneficioFiscal.listCatalogo.query().then((c: { id: string; nome: string; ativo: boolean }[]) => setCatBenef(c)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  async function handleSave() {
    if (!modal || !modal.valor.trim()) return
    setSaving(true)
    try {
      if (modal.id) await trpc.cliente.updateAtividade.mutate({ id: modal.id, valor: modal.valor })
      else await trpc.cliente.addAtividade.mutate({ clienteId, valor: modal.valor })
      setModal(null)
      load()
      alerts.success('Salvo', 'Registro salvo com sucesso.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  async function handleRemove(id: string, valor: string) {
    const ok = await alerts.confirmDelete(valor)
    if (!ok) return
    try {
      await trpc.cliente.removeAtividade.mutate({ id })
      load()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível excluir.')
    }
  }

  async function handleSaveBenef() {
    if (!modalBenef || !modalBenef.catalogoId) return
    setSavingBenef(true)
    try {
      const payload = {
        dataVencimento: modalBenef.dataVencimento || null,
        portaria: modalBenef.portaria || null,
        processo: modalBenef.processo || null,
        obs: modalBenef.obs || null,
      }
      if (modalBenef.id) await (trpc as any).beneficioFiscal.update.mutate({ id: modalBenef.id, ...payload })
      else await (trpc as any).beneficioFiscal.create.mutate({ clienteId, catalogoId: modalBenef.catalogoId, ...payload })
      setModalBenef(null)
      loadBenef()
      alerts.success('Salvo', 'Benefício salvo com sucesso.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally { setSavingBenef(false) }
  }

  async function handleRemoveBenef(b: BFItem) {
    const ok = await alerts.confirmDelete(b.beneficioNome)
    if (!ok) return
    try {
      await (trpc as any).beneficioFiscal.remove.mutate({ id: b.id })
      loadBenef()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível excluir.')
    }
  }

  const options = optAtividade

  // Cada seção só existe se tiver o que mostrar. A de benefícios carrega junto a
  // permissão de leitura — sem ela a lista vem vazia e o rótulo não deve aparecer.
  const temAtividades = atividades.length > 0
  const temBeneficios = beneficios.length > 0 && (bfPerms.canRead || bfPerms.canWrite || canManageActivitiesBenefits)

  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold truncate">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
          Atividades e Benefícios
        </h4>
        {(canManageActivitiesBenefits || bfPerms.canWrite) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2 text-[11px]">
                <Plus className="h-4 w-4" /> Adicionar <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManageAtiv && (
                <DropdownMenuItem onClick={() => setModal({ kind: 'atividade', valor: '' })}>
                  <Activity className="h-4 w-4" /> Atividade
                </DropdownMenuItem>
              )}
              {bfPerms.canWrite && (
                <DropdownMenuItem onClick={() => setModalBenef({ catalogoId: '', dataVencimento: '', portaria: '', processo: '', obs: '' })}>
                  <Percent className="h-4 w-4" /> Benefício Fiscal
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : (!temAtividades && !temBeneficios) ? (
        <p className="text-xs text-muted-foreground">Sem registro</p>
      ) : (
        <div className="space-y-3.5">
          {/* Uma seção só aparece quando tem conteúdo: um rótulo seguido de
              "Nenhuma atividade." ocupa a mesma altura de um item de verdade e
              não informa nada — quem cadastra usa o "Adicionar" do topo. Com as
              duas vazias, o card inteiro cai no "Sem registro" acima. */}
          {temAtividades && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> Atividades
              <span className="text-[10px] font-normal text-muted-foreground/60">({atividades.length})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
                {atividades.map((a) => (
                  <div
                    key={a.id}
                    className="group/chip inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-0.5 text-[11px] font-medium transition-colors"
                    style={{ borderColor: `color-mix(in srgb, ${MODULE_COLOR_CLIENTES} 35%, transparent)`, color: MODULE_COLOR_CLIENTES, backgroundColor: `color-mix(in srgb, ${MODULE_COLOR_CLIENTES} 10%, transparent)` }}
                  >
                    <span
                      className={canManageAtiv ? 'cursor-pointer' : ''}
                      onClick={() => canManageAtiv && setModal({ kind: 'atividade', id: a.id, valor: a.valor })}
                      title={canManageAtiv ? 'Editar atividade' : undefined}
                    >
                      {a.valor}
                    </span>
                    {canManageAtiv && (
                      <button
                        type="button"
                        onClick={() => handleRemove(a.id, a.valor)}
                        title="Remover"
                        className="shrink-0 rounded-full p-0.5 opacity-40 hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-600 transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
          )}

          {/* Benefícios Fiscais — mini-cards com hierarquia (módulo Benefícios Fiscais / bloco Legalização) */}
          {temBeneficios && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Percent className="h-3 w-3" /> Benefícios Fiscais
              <span className="text-[10px] font-normal text-muted-foreground/60">({beneficios.length})</span>
            </p>
            <div className="space-y-1.5">
                {beneficios.map((b) => (
                  <div key={b.id} className="group flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-semibold text-foreground truncate">{b.beneficioNome}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ color: BF_STATUS_COR[b.status], backgroundColor: BF_STATUS_COR[b.status] + '18' }}>
                          {bfFmtData(b.dataVencimento)}
                        </span>
                      </div>
                      {(b.portaria || b.processo) && (
                        <p className="text-[10px] text-muted-foreground truncate">{[b.portaria, b.processo].filter(Boolean).join(' · ')}</p>
                      )}
                      {b.orcamentoId && (
                        <a href={`/orcamentos/${b.orcamentoId}`} className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5">
                          Orç. #{b.orcamentoNumero}<ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    {(bfPerms.canWrite || bfPerms.canDelete) && (
                      <AtivBenefActions
                        onEdit={() => setModalBenef({ id: b.id, catalogoId: b.catalogoId, dataVencimento: toDateInputValue(b.dataVencimento), portaria: b.portaria ?? '', processo: b.processo ?? '', obs: b.obs ?? '' })}
                        onDelete={() => handleRemoveBenef(b)}
                      />
                    )}
                  </div>
                ))}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Modal incluir/editar atividade (texto livre) */}
      <Dialog open={!!modal} onOpenChange={(o) => { if (!o) setModal(null) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Activity} color={modal?.id ? 'sky' : 'emerald'}>
            <DialogTitle>{modal?.id ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
            <DialogDescription>Selecione a atividade do cliente.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Atividade</Label>
              <Select value={modal?.valor || ''} onValueChange={(v) => setModal((m) => (m ? { ...m, valor: v } : m))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => <SelectItem key={o.id} value={o.valor}>{o.valor}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button type="button" variant="success" onClick={handleSave} disabled={saving || !modal?.valor.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal incluir/editar benefício fiscal (estruturado) */}
      <Dialog open={!!modalBenef} onOpenChange={(o) => { if (!o) setModalBenef(null) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Percent} color={modalBenef?.id ? 'sky' : 'emerald'}>
            <DialogTitle>{modalBenef?.id ? 'Editar benefício' : 'Novo benefício'}</DialogTitle>
            <DialogDescription>Benefício fiscal do cliente, vencimento e referências legais.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Benefício *</Label>
              <Select value={modalBenef?.catalogoId || ''} onValueChange={(v) => setModalBenef((m) => (m ? { ...m, catalogoId: v } : m))} disabled={!!modalBenef?.id}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o benefício" /></SelectTrigger>
                <SelectContent>
                  {catBenef.filter((c) => c.ativo).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Vencimento</Label>
                <Input type="date" className="h-9 text-sm" value={modalBenef?.dataVencimento ?? ''} onChange={(e) => setModalBenef((m) => (m ? { ...m, dataVencimento: e.target.value } : m))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Portaria</Label>
                <Input className="h-9 text-sm" value={modalBenef?.portaria ?? ''} onChange={(e) => setModalBenef((m) => (m ? { ...m, portaria: e.target.value } : m))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Processo</Label>
              <Input className="h-9 text-sm" value={modalBenef?.processo ?? ''} onChange={(e) => setModalBenef((m) => (m ? { ...m, processo: e.target.value } : m))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Observações</Label>
              <Input className="h-9 text-sm" value={modalBenef?.obs ?? ''} onChange={(e) => setModalBenef((m) => (m ? { ...m, obs: e.target.value } : m))} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalBenef(null)}>Cancelar</Button>
            <Button type="button" variant="success" onClick={handleSaveBenef} disabled={savingBenef || !modalBenef?.catalogoId}>
              {savingBenef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// Dropdown de ações (⋮) reutilizado pelas linhas de atividade/benefício
function AtivBenefActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ml-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type CertSidebarItem = {
  id: string; titular: string | null; emissor: string | null; documento: string | null
  emitidoEm: string | null; expiraEm: string | null; status: string | null
  observacoes: string | null; arquivado: boolean
}

// A classificação de arquivo (ícone + etiqueta por tipo) nasceu aqui e agora
// mora em @/lib/arquivo-tipo: o mesmo card existe em Aquisições, e duas cópias
// divergiriam na primeira extensão nova acrescentada de um lado só.

/** Cor do prazo, igual à do certificado: vencido grita, perto de vencer avisa. */
function corDoVencimento(dias: number | null) {
  if (dias === null) return 'text-muted-foreground'
  if (dias < 0) return 'text-rose-600 dark:text-rose-400 font-semibold'
  if (dias < 30) return 'text-amber-600 dark:text-amber-400 font-semibold'
  return 'text-muted-foreground'
}
function diasAte(data: string | null) {
  if (!data) return null
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

function ArquivosSidebar({ clienteId }: { clienteId: string }) {
  const { canManageFiles, canEditCertificados } = useClientesPerms()
  const [arquivos, setArquivos] = useState<Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; descricao: string | null; vencimento: string | null; createdAt: string; user: { name: string } | null }>>([])
  const [certificados, setCertificados] = useState<CertSidebarItem[]>([])
  const [loading, setLoading] = useState(true)
  // Modal de edição (#2): renomear + descrição/detalhes
  const [editing, setEditing] = useState<{ id: string; fileName: string; descricao: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  // Modal de edição de observações do certificado
  const [editingCert, setEditingCert] = useState<{ id: string; titular: string; emissor: string; observacoes: string } | null>(null)
  // Alvo do deep-link `#arquivos` (ver o efeito de scroll abaixo).
  const cardRef = useRef<HTMLDivElement>(null)
  const [destacado, setDestacado] = useState(false)
  const [savingCert, setSavingCert] = useState(false)
  // Modal de detalhes (read-only) do certificado — componente compartilhado com o
  // módulo Legalização; embute o fluxo de acesso (ver senha / baixar PFX). #HLP0301
  const [viewCert, setViewCert] = useState<CertSidebarItem | null>(null)
  // Cadastro de certificado ao soltar um .pfx/.p12 no card de Arquivos — usa o
  // modal unificado (CertCadastroModal) com arquivo + cliente pré-selecionados.
  const [certUpload, setCertUpload] = useState<File | null>(null)

  function load() {
    trpc.cliente.listArquivos.query({ clienteId })
      .then((data: unknown) => setArquivos(data as typeof arquivos))
      .finally(() => setLoading(false))
  }

  function loadCertificados() {
    // Silencioso: usuário pode não ter permissão no módulo de certificados
    trpc.certificadoDigital.list.query({ clienteId, incluirArquivados: false })
      .then((data: unknown) => setCertificados(data as CertSidebarItem[]))
      .catch(() => setCertificados([]))
  }

  useEffect(() => { load(); loadCertificados() }, [clienteId])

  /**
   * Quem chega por `/clientes/{id}#arquivos` (ação "Anexar arquivos" da gestão
   * de contratos) cai no topo da página, com este card fora da vista. Rola até
   * ele depois que a lista carrega — antes disso a altura do card ainda muda e
   * o scroll erraria o alvo. Âncora nativa não serve pelo mesmo motivo.
   */
  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    if (window.location.hash !== '#arquivos') return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setDestacado(true)
    const t = setTimeout(() => setDestacado(false), 2000)
    return () => clearTimeout(t)
  }, [loading])

  async function handleSaveCert() {
    if (!editingCert) return
    setSavingCert(true)
    try {
      await trpc.certificadoDigital.update.mutate({
        id: editingCert.id,
        observacoes: editingCert.observacoes.trim() || null,
      })
      setEditingCert(null)
      loadCertificados()
      alerts.success('Certificado atualizado', 'As observações foram salvas.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally { setSavingCert(false) }
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    const dt = new Date(d)
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR')
  }

  const isPfx = (f: File) => /\.(pfx|p12)$/i.test(f.name)

  function handleUpload() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? [])
      if (!files.length) return
      // Certificados (.pfx/.p12) NÃO viram arquivo genérico: abrem o modal de
      // cadastro de certificado digital. Os demais arquivos seguem o upload normal.
      const certs = files.filter(isPfx)
      const outros = files.filter(f => !isPfx(f))

      for (const file of outros) {
        const formData = new FormData()
        formData.append('file', file)
        try {
          const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
          const { url } = await res.json()
          await trpc.cliente.addArquivo.mutate({
            clienteId, fileName: file.name, fileUrl: url,
            fileSize: file.size, mimeType: file.type,
          })
        } catch { /* skip */ }
      }
      if (outros.length) { load(); alerts.success('Upload concluído', `${outros.length} arquivo(s) enviado(s).`) }

      if (certs.length) {
        if (!canEditCertificados) {
          alerts.error('Sem permissão', 'O arquivo é um certificado digital (.pfx). Você não tem permissão para cadastrá-lo — peça a um responsável pela legalização.')
        } else {
          // Cadastra um certificado por vez (o modal pede a senha e extrai os dados).
          setCertUpload(certs[0]!)
        }
      }
    }
    input.click()
  }


  async function handleRemove(id: string, name: string) {
    const ok = await alerts.confirmDelete(name)
    if (!ok) return
    await trpc.cliente.removeArquivo.mutate({ arquivoId: id })
    load()
  }

  async function handleSaveEdit() {
    if (!editing || !editing.fileName.trim()) return
    setSavingEdit(true)
    try {
      await trpc.cliente.updateArquivo.mutate({
        id: editing.id,
        fileName: editing.fileName.trim(),
        descricao: editing.descricao.trim() || null,
      })
      setEditing(null)
      load()
      alerts.success('Arquivo atualizado', 'As alterações foram salvas.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally { setSavingEdit(false) }
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <Card
      id="arquivos"
      ref={cardRef}
      className={cn('rounded-2xl p-5 transition-shadow', destacado && 'ring-2 ring-primary/40')}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Paperclip className="h-4 w-4" /></span>
          Arquivos
        </h4>
        {canManageFiles && (
          <Button type="button" variant="outline" size="sm" onClick={handleUpload}><Plus className="h-4 w-4" /> Adicionar</Button>
        )}
      </div>
      {/* Certificados digitais — leitura + edição de observações (seção adicional).
          Sem subtítulo: o badge "Certificado" em cada item já identifica. */}
      {certificados.length > 0 && (
        <div className="mb-4">
          <div className="space-y-2">
            {certificados.map((cert) => {
              const dias = diasAte(cert.expiraEm)
              const expColor = corDoVencimento(dias)
              return (
                <div
                  key={cert.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewCert(cert)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewCert(cert) } }}
                  className="flex items-start gap-2 text-xs group rounded-md border border-border p-2 bg-muted/30 cursor-pointer hover:bg-muted/50 hover:border-fuchsia-300 dark:hover:border-fuchsia-800 transition-colors"
                  title="Ver detalhes do certificado"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-400 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">
                        {cert.titular || cert.documento || cert.id}
                      </span>
                      <Badge variant="outline" className="h-4 px-1 text-[9px] shrink-0">Certificado</Badge>
                    </div>
                    {cert.emissor && <p className="text-muted-foreground truncate" title={cert.emissor}>{cert.emissor}</p>}
                    <p className={expColor}>
                      Expira: {formatDate(cert.expiraEm)}
                      {dias !== null && (dias < 0 ? ` (vencido há ${Math.abs(dias)}d)` : ` (${dias}d)`)}
                    </p>
                    {cert.observacoes && <p className="text-muted-foreground truncate" title={cert.observacoes}>{cert.observacoes}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 sm:shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {canEditCertificados && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditingCert({ id: cert.id, titular: cert.titular || '', emissor: cert.emissor || '', observacoes: cert.observacoes || '' }) }} className="text-muted-foreground hover:text-foreground" title="Editar observações">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <a href={`/gestao-certificados?openId=${cert.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground" title="Abrir na gestão de certificados">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : arquivos.length === 0 ? (
        // Só mostra o vazio quando não há NEM certificado nem arquivo — senão
        // contradiz o certificado exibido logo acima.
        certificados.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum arquivo enviado.</p>
        ) : null
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-none">
          {arquivos.map((arq) => {
            const tipo = classificarArquivo(arq.fileName, arq.mimeType)
            const Icone = tipo.icon
            const dias = diasAte(arq.vencimento ?? null)
            return (
              <div
                key={arq.id}
                className={cn(
                  'flex items-start gap-2 text-xs group rounded-md border border-border p-2 bg-muted/30 transition-colors',
                  tipo.hover,
                )}
              >
                <Icone className={cn('h-4 w-4 shrink-0 mt-0.5', tipo.cor)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={arq.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium hover:text-primary"
                      title={arq.fileName}
                    >
                      {arq.fileName}
                    </a>
                    <Badge variant="outline" className="h-4 px-1 text-[9px] shrink-0">{tipo.label}</Badge>
                    {/* Sem permissão de gestão o item é só leitura — o cadeado
                        explica a ausência dos botões, que de outro modo pareceria
                        um item quebrado. */}
                    {!canManageFiles && (
                      <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Somente leitura" />
                    )}
                  </div>
                  {arq.descricao && <p className="text-muted-foreground truncate" title={arq.descricao}>{arq.descricao}</p>}
                  {arq.vencimento && (
                    <p className={corDoVencimento(dias)}>
                      Vence: {formatDate(arq.vencimento)}
                      {dias !== null && (dias < 0 ? ` (vencido há ${Math.abs(dias)}d)` : ` (${dias}d)`)}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    {[formatSize(arq.fileSize), arq.user?.name, formatDate(arq.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1 sm:shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <a
                    href={arq.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Abrir / baixar"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  {canManageFiles && (
                    <button type="button" onClick={() => setEditing({ id: arq.id, fileName: arq.fileName, descricao: arq.descricao || '' })} className="text-muted-foreground hover:text-foreground" title="Editar arquivo">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canManageFiles && (
                    <button type="button" onClick={() => handleRemove(arq.id, arq.fileName)} className="text-destructive hover:text-destructive/80" title="Excluir arquivo">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de edição de arquivo (#2) */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Editar arquivo</DialogTitle>
            <DialogDescription>Renomeie o arquivo e adicione detalhes.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome do arquivo</Label>
              <Input className="h-9 text-sm" value={editing?.fileName || ''} onChange={(e) => setEditing((s) => (s ? { ...s, fileName: e.target.value } : s))} placeholder="Nome do arquivo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Detalhes / descrição</Label>
              <Input className="h-9 text-sm" value={editing?.descricao || ''} onChange={(e) => setEditing((s) => (s ? { ...s, descricao: e.target.value } : s))} placeholder="Ex.: Contrato social, procuração..." />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="button" variant="success" onClick={handleSaveEdit} disabled={savingEdit || !editing?.fileName.trim()}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edição de observações do certificado */}
      <Dialog open={!!editingCert} onOpenChange={(o) => { if (!o) setEditingCert(null) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Editar certificado</DialogTitle>
            <DialogDescription>Titular e emissor vêm do .pfx e não são editáveis. Ajuste apenas as observações.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Titular</Label>
              <Input className="h-9 text-sm" value={editingCert?.titular || ''} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Emissor</Label>
              <Input className="h-9 text-sm" value={editingCert?.emissor || ''} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Detalhes / observações</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={editingCert?.observacoes || ''}
                onChange={(e) => setEditingCert((s) => (s ? { ...s, observacoes: e.target.value } : s))}
                placeholder="Anotações internas sobre este certificado..."
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingCert(null)}>Cancelar</Button>
            <Button type="button" variant="success" onClick={handleSaveCert} disabled={savingCert}>
              {savingCert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhes (read-only) + acesso seguro — componente compartilhado (#HLP0301).
          Sem as abas Geral/Auditoria: dentro do cliente é só o conteúdo da Geral. */}
      <CertDetalhesModal
        certId={viewCert?.id ?? null}
        open={!!viewCert}
        onOpenChange={(o) => { if (!o) setViewCert(null) }}
        showAcessosTab={false}
        hideClienteSection
        origem="cliente"
        canDownload
      />

      {/* Cadastro de certificado (unificado #HLP0301) — arquivo e cliente já
          pré-selecionados, então esses campos não aparecem. */}
      <CertCadastroModal
        open={!!certUpload}
        onOpenChange={(o) => { if (!o) setCertUpload(null) }}
        onCreated={() => { setCertUpload(null); loadCertificados() }}
        presetFile={certUpload}
        presetClienteId={clienteId}
        title="Cadastrar certificado digital"
        subtitle="O arquivo é um certificado (.pfx). Informe a senha — o sistema extrai titular, validade e emissor automaticamente."
        note={
          <p className="text-[11px] text-muted-foreground">
            🔒 A senha é cifrada com AES-256-GCM. O certificado fica vinculado a este cliente e aparece também na aba <b>Legalização → Certificado Digital</b>.
          </p>
        }
      />
    </Card>
  )
}

/* ================================================================== */
/* ContatosTab — tabela de contatos dentro da sub-tab Contato         */
/* ================================================================== */
type ContatoRow = {
  id: string; nome: string; cargo: string | null; telefone: string | null
  email: string | null; observacoes: string | null; principal: boolean
  areaId: string | null; area: { id: string; name: string } | null
}
type AreaOption = { id: string; name: string }

function ContatosTab({ clienteId }: { clienteId?: string }) {
  const [contatos, setContatos] = useState<ContatoRow[]>([])
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // form fields
  const [fNome, setFNome] = useState('')
  const [fCargo, setFCargo] = useState('')
  const [fTelefone, setFTelefone] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fObs, setFObs] = useState('')
  const [fAreaId, setFAreaId] = useState('')

  function load() {
    if (!clienteId) { setLoading(false); return }
    trpc.cliente.listContatos.query({ clienteId })
      .then((data: unknown) => setContatos(data as ContatoRow[]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    trpc.area.listForSelect.query()
      .then((data: unknown) => setAreas(data as AreaOption[]))
      .catch(() => {})
  }, [clienteId])

  function resetForm() {
    setFNome(''); setFCargo(''); setFTelefone(''); setFEmail(''); setFObs(''); setFAreaId('')
  }

  function startEdit(c: ContatoRow) {
    setEditingId(c.id)
    setFNome(c.nome)
    setFCargo(c.cargo || '')
    setFTelefone(c.telefone || '')
    setFEmail(c.email || '')
    setFObs(c.observacoes || '')
    setFAreaId(c.areaId || '')
    setAdding(false)
  }

  function cancelEdit() {
    setEditingId(null)
    resetForm()
  }

  function startAdd() {
    setAdding(true)
    setEditingId(null)
    resetForm()
  }

  async function handleAdd() {
    if (!clienteId || !fNome.trim()) return
    await trpc.cliente.addContato.mutate({
      clienteId, nome: fNome, cargo: fCargo || undefined,
      telefone: fTelefone || undefined, email: fEmail || undefined,
      observacoes: fObs || undefined, areaId: fAreaId || undefined,
    })
    resetForm()
    setAdding(false)
    load()
  }

  async function handleUpdate() {
    if (!editingId || !fNome.trim()) return
    await trpc.cliente.updateContato.mutate({
      contatoId: editingId, nome: fNome, cargo: fCargo || undefined,
      telefone: fTelefone || undefined, email: fEmail || undefined,
      observacoes: fObs || undefined, areaId: fAreaId || null,
    })
    cancelEdit()
    load()
  }

  async function handleRemove(id: string, nome: string) {
    const ok = await alerts.confirmDelete(nome)
    if (!ok) return
    await trpc.cliente.removeContato.mutate({ contatoId: id })
    if (editingId === id) cancelEdit()
    load()
  }

  async function handleSetPrincipal(id: string) {
    await trpc.cliente.setPrincipalContato.mutate({ contatoId: id })
    load()
  }

  /* Select de área reutilizável */
  function AreaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Nenhuma</SelectItem>
          {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  if (!clienteId) {
    return (
      <div className="-m-5">
        <div className="px-5 py-3 border-b border-border">
          <h4 className="text-[13px] font-semibold text-foreground">Contatos do Cliente</h4>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mb-2 opacity-20" />
          <p className="text-sm">Salve o cliente primeiro para gerenciar contatos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="-m-5">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-foreground">Contatos do Cliente</h4>
        <Button type="button" variant="outline" size="sm" onClick={startAdd}>
          <Plus className="h-4 w-4" /> Novo Contato
        </Button>
      </div>

      <div className="p-5">
        {/* Form inline para adicionar */}
        {adding && (
          <div className="mb-4 p-4 rounded-lg border border-emerald-200 bg-emerald-50/50">
            <h5 className="text-xs font-semibold text-foreground mb-3">Novo Contato</h5>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Nome *</Label>
                <Input placeholder="Nome do contato" value={fNome} onChange={(e) => setFNome(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Cargo</Label>
                <Input placeholder="Ex: Diretor, Gerente..." value={fCargo} onChange={(e) => setFCargo(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Área Vinculada</Label>
                <AreaSelect value={fAreaId} onChange={setFAreaId} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Telefone</Label>
                <Input placeholder="(xx) xxxxx-xxxx" value={fTelefone} onChange={(e) => setFTelefone(masks.telefone(e.target.value))} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="email@empresa.com" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Observações</Label>
                <Input placeholder="Observações sobre este contato..." value={fObs} onChange={(e) => setFObs(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button type="button" size="sm" className="bg-emerald-500 text-white hover:bg-emerald-600" onClick={handleAdd} disabled={!fNome.trim()}>
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); resetForm() }}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Form inline para editar */}
        {editingId && (
          <div className="mb-4 p-4 rounded-lg border border-sky-200 bg-sky-50/50">
            <h5 className="text-xs font-semibold text-foreground mb-3">Editar Contato</h5>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Nome *</Label>
                <Input placeholder="Nome do contato" value={fNome} onChange={(e) => setFNome(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Cargo</Label>
                <Input placeholder="Ex: Diretor, Gerente..." value={fCargo} onChange={(e) => setFCargo(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Área Vinculada</Label>
                <AreaSelect value={fAreaId} onChange={setFAreaId} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Telefone</Label>
                <Input placeholder="(xx) xxxxx-xxxx" value={fTelefone} onChange={(e) => setFTelefone(masks.telefone(e.target.value))} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="email@empresa.com" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Observações</Label>
                <Input placeholder="Observações sobre este contato..." value={fObs} onChange={(e) => setFObs(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button type="button" size="sm" className="bg-sky-500 text-white hover:bg-sky-600" onClick={handleUpdate} disabled={!fNome.trim()}>
                <Save className="h-4 w-4" /> Salvar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Tabela de contatos */}
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : contatos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm">Nenhum contato cadastrado.</p>
            <p className="text-xs mt-1">Clique em &quot;Novo Contato&quot; para adicionar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 font-semibold w-[40px]"></th>
                  <th className="text-left py-2.5 px-3 font-semibold">Nome</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Cargo</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Área</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Telefone</th>
                  <th className="text-left py-2.5 px-3 font-semibold">E-mail</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Observações</th>
                  <th className="text-center py-2.5 px-3 font-semibold w-[90px]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contatos.map((c) => (
                  <tr key={c.id} className={cn(
                    'border-b border-border group transition-colors',
                    c.principal ? 'bg-emerald-50/60' : 'hover:bg-muted/30'
                  )}>
                    {/* Estrela principal */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        title={c.principal ? 'Contato principal' : 'Definir como principal'}
                        onClick={() => !c.principal && handleSetPrincipal(c.id)}
                        className={cn(
                          'transition-colors',
                          c.principal
                            ? 'text-amber-500 cursor-default'
                            : 'text-muted-foreground/30 hover:text-amber-400 cursor-pointer'
                        )}
                      >
                        <Star className={cn('h-4 w-4', c.principal && 'fill-amber-500')} />
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium">{c.nome}</span>
                      {c.principal && <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium">Principal</span>}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.cargo || '—'}</td>
                    <td className="py-2.5 px-3">
                      {c.area ? (
                        <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-[10px] font-medium border border-sky-200">
                          {c.area.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.telefone || '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.email || '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground max-w-[180px] truncate">{c.observacoes || '—'}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button type="button" title="Editar" onClick={() => startEdit(c)}
                          className="p-1 rounded hover:bg-sky-100 text-sky-600 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" title="Excluir" onClick={() => handleRemove(c.id, c.nome)}
                          className="p-1 rounded hover:bg-red-100 text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Caixa Postal do cliente (dentro da aba Fiscal)
// ============================================================

const PRIORIDADE_STYLES: Record<string, { bg: string; text: string; icon: typeof AlertTriangle }> = {
  P0: { bg: 'bg-red-600', text: 'text-white', icon: AlertTriangle },
  P1: { bg: 'bg-orange-500', text: 'text-white', icon: MailWarning },
  P2: { bg: 'bg-amber-400', text: 'text-amber-950', icon: Clock },
  P3: { bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', icon: Mail },
}

function CaixaPostalBadge({ p }: { p: string }) {
  const s = PRIORIDADE_STYLES[p] || PRIORIDADE_STYLES.P3!
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-sm', s.bg, s.text)}>
      <Icon className="h-3 w-3" />{p}
    </span>
  )
}

function formatDateSerpro(d: string | undefined) {
  if (!d) return '—'
  if (d.length === 8) return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`
  return d
}

interface CaixaPostalMsg {
  isn?: string; ISN?: string
  assuntoModelo?: string; origemModelo?: string; descricaoOrigem?: string
  dataEnvio?: string; prioridade: string; score: number
  sla_dias: number | null; lida: boolean; importante?: boolean
  [key: string]: unknown
}

function CaixaPostalClienteCard({ documento }: { documento: string }) {
  const [mensagens, setMensagens] = useState<CaixaPostalMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [consultando, setConsultando] = useState(false)
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 20

  // Modal de detalhe
  const [detalheOpen, setDetalheOpen] = useState(false)
  const [detalheMsg, setDetalheMsg] = useState<CaixaPostalMsg | null>(null)
  const [detalheData, setDetalheData] = useState<unknown>(null)
  const [detalheLoading, setDetalheLoading] = useState(false)

  const docLimpo = limparCnpj(documento)
  const tipo = docLimpo.length === 11 ? 1 : 2

  const carregarCache = useCallback(async () => {
    setLoading(true)
    setPagina(1)
    try {
      const result = await trpc.caixaPostal.listCache.query({ contribuinte: { numero: docLimpo, tipo } })
      setMensagens((result.mensagensClassificadas || []).map((m: unknown) => m as CaixaPostalMsg))
    } catch {
      setMensagens([])
    } finally { setLoading(false) }
  }, [docLimpo, tipo])

  useEffect(() => { carregarCache() }, [carregarCache])

  async function consultarApi() {
    setConsultando(true)
    setPagina(1)
    try {
      const result = await trpc.caixaPostal.consultarClassificadas.mutate({ contribuinte: { numero: docLimpo, tipo } })
      setMensagens((result.mensagensClassificadas || []).map((m: unknown) => m as CaixaPostalMsg))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setConsultando(false) }
  }

  async function handleDetalhar(msg: CaixaPostalMsg) {
    const isn = msg.isn || msg.ISN
    if (!isn) return

    setDetalheOpen(true)
    setDetalheLoading(true)
    setDetalheData(null)
    setDetalheMsg(msg)

    try {
      const result = await trpc.caixaPostal.detalhar.mutate({
        contribuinte: { numero: docLimpo, tipo },
        isn,
      })
      setDetalheData(result)

      // Marcar como lida
      if (!msg.lida) {
        await trpc.caixaPostal.marcarLida.mutate({ isn, contribuinte: docLimpo })
        setMensagens(prev => prev.map(m => (m.isn || m.ISN) === isn ? { ...m, lida: true } : m))
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setDetalheLoading(false)
    }
  }

  function extrairCorpoMensagem(dados: unknown): string | null {
    if (!dados) return null
    let base = dados as Record<string, unknown>
    if (typeof dados === 'string') { try { base = JSON.parse(dados) } catch { return null } }
    if (base?.dados && typeof base.dados === 'string') { try { base = JSON.parse(base.dados as string) } catch { /* keep */ } }
    else if (base?.dados && typeof base.dados === 'object') { base = base.dados as Record<string, unknown> }
    if (base?.conteudo && Array.isArray(base.conteudo) && base.conteudo.length > 0) {
      const msg = base.conteudo[0] as Record<string, unknown>
      if (msg?.corpoModelo && typeof msg.corpoModelo === 'string') {
        let result = msg.corpoModelo as string
        if (msg.valorParametroAssunto && typeof msg.valorParametroAssunto === 'string') {
          const params = (msg.valorParametroAssunto as string).split('|')
          if (params[0]) result = result.replace(/\+\+1\+\+/g, params[0])
          if (params[1]) result = result.replace(/\+\+2\+\+/g, params[1])
        }
        result = result.replace(/\+\+\d+\+\+/g, '')
        return result
      }
    }
    return null
  }

  const naoLidas = mensagens.filter(m => !m.lida).length
  const importantes = mensagens.filter(m => m.importante).length

  const totalPaginas = Math.max(1, Math.ceil(mensagens.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const msgPaginadas = mensagens.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)
  const startRec = mensagens.length > 0 ? (paginaAtual - 1) * POR_PAGINA + 1 : 0
  const endRec = Math.min(paginaAtual * POR_PAGINA, mensagens.length)

  function getCpPageNumbers() {
    const pages: number[] = []
    let start = Math.max(1, paginaAtual - 2)
    const end = Math.min(totalPaginas, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  return (
    <div className="space-y-4">
      {/* Modal de detalhamento */}
      <Dialog open={detalheOpen} onOpenChange={(o) => { if (!o) setDetalheOpen(false) }}>
        <DialogContent className="max-w-[720px]">
          {/* Exceção ao padrão DialogHeaderIcon: o slot do ícone é ocupado pelo
              badge de prioridade dinâmico (P0/P1/P2/P3 com cor/ícone variáveis).
              Padrão não comporta esse caso. */}
          <DialogHeader>
            <div className="flex items-center gap-4">
              {detalheMsg && (() => {
                const p = detalheMsg.prioridade
                const styles: Record<string, { bg: string; text: string; label: string; icon: typeof AlertTriangle }> = {
                  P0: { bg: 'bg-red-600', text: 'text-white', label: 'Crítica', icon: AlertTriangle },
                  P1: { bg: 'bg-orange-500', text: 'text-white', label: 'Alta', icon: MailWarning },
                  P2: { bg: 'bg-amber-400', text: 'text-amber-950', label: 'Média', icon: Clock },
                  P3: { bg: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-700 dark:text-gray-200', label: 'Baixa', icon: Mail },
                }
                const s = styles[p] || styles.P3!
                const Icon = s.icon
                return (
                  <div className={cn('flex flex-col items-center justify-center rounded-lg px-3 py-2 min-w-[56px] shadow-sm', s.bg, s.text)}>
                    <Icon className="h-5 w-5" />
                    <span className="text-[11px] font-black mt-0.5">{p}</span>
                    <span className="text-[8px] font-semibold uppercase tracking-wider opacity-80">{s.label}</span>
                  </div>
                )
              })()}
              <div className="flex-1 min-w-0">
                <DialogTitle>Detalhamento da Mensagem</DialogTitle>
                {detalheMsg && <DialogDescription className="truncate">{detalheMsg.assuntoModelo || 'Sem assunto'}</DialogDescription>}
              </div>
            </div>
          </DialogHeader>

          <DialogBody>
            {detalheLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div>
                {/* Metadados */}
                {detalheMsg && (
                  <div className="mb-4 p-3 rounded-lg bg-muted/20 space-y-2">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div><span className="text-muted-foreground">Origem: </span><span className="font-medium">{detalheMsg.descricaoOrigem || detalheMsg.origemModelo || '—'}</span></div>
                      <div><span className="text-muted-foreground">Data envio: </span><span className="font-medium">{formatDateSerpro(detalheMsg.dataEnvio)}</span></div>
                      {detalheMsg.sla_dias !== null && detalheMsg.sla_dias !== undefined && (
                        <div><span className="text-muted-foreground">SLA: </span><span className={cn('font-medium', detalheMsg.sla_dias <= 0 ? 'text-red-600' : detalheMsg.sla_dias <= 3 ? 'text-orange-600' : '')}>{detalheMsg.sla_dias} dia(s)</span></div>
                      )}
                      <div><span className="text-muted-foreground">Score: </span><span className="font-medium">{detalheMsg.score}/100</span></div>
                    </div>
                    {typeof detalheMsg.acao_recomendada === 'string' && detalheMsg.acao_recomendada && (
                      <div className="text-xs p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                        <strong>Ação recomendada:</strong> {detalheMsg.acao_recomendada as string}
                      </div>
                    )}
                  </div>
                )}

                {/* Corpo */}
                {(() => {
                  const corpo = extrairCorpoMensagem(detalheData)
                  if (corpo) return <RichContent className="text-sm leading-relaxed [&_p]:mb-3 [&_a]:text-sky-600" html={corpo} />
                  if (detalheData) return (<div><p className="text-xs text-muted-foreground mb-2">Resposta bruta da API:</p><pre className="text-xs whitespace-pre-wrap bg-muted/30 rounded-lg p-4 overflow-x-auto max-h-[400px]">{JSON.stringify(detalheData, null, 2)}</pre></div>)
                  return <p className="text-center text-muted-foreground py-10">Nenhum conteúdo disponível.</p>
                })()}

                {/* Motivos */}
                {detalheMsg && Array.isArray(detalheMsg.motivos) && (detalheMsg.motivos as string[]).length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Motivos da classificação</p>
                    <div className="flex flex-wrap gap-1">
                      {(detalheMsg.motivos as string[]).map((m, i) => <Badge key={i} variant="outline" className="text-[10px] font-normal">{m}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {detalheMsg && (
              <div className="flex-1 text-xs text-muted-foreground">
                ISN: <span className="font-mono">{detalheMsg.isn || detalheMsg.ISN || '—'}</span>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setDetalheOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header com ações e resumo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {mensagens.length > 0 && (
            <>
              <Badge variant="outline" className="text-[10px]">{mensagens.length} mensagem(ns)</Badge>
              {naoLidas > 0 && <Badge variant="destructive" className="text-[10px]">{naoLidas} não lida(s)</Badge>}
              {importantes > 0 && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">
                  <Star className="h-3 w-3 fill-amber-400 mr-0.5" />{importantes} importante(s)
                </Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="text-[11px] h-7 gap-1" onClick={carregarCache} disabled={loading}>
            <Mail className="h-3 w-3" />Cache
          </Button>
          <Button type="button" variant="success" size="sm" className="text-[11px] h-7 gap-1" onClick={consultarApi} disabled={consultando}>
            {consultando ? <Loader2 className="h-3 w-3 animate-spin" /> : <SearchIcon className="h-3 w-3" />}
            Consultar API
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-[11px] h-7 gap-1" asChild>
            <a href="/caixapostal" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />Abrir módulo
            </a>
          </Button>
        </div>
      </div>

      {/* Tabela de mensagens */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando...
        </div>
      ) : mensagens.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Nenhuma mensagem na caixa postal.</p>
          <p className="text-[10px] mt-1">Clique em "Consultar API" para buscar mensagens do SERPRO.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-3 py-2 font-medium w-[50px]">Prior.</th>
                <th className="text-left px-3 py-2 font-medium">Assunto</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Origem</th>
                <th className="text-left px-3 py-2 font-medium w-[80px]">Data</th>
                <th className="text-center px-3 py-2 font-medium w-[50px]">SLA</th>
                <th className="text-center px-3 py-2 font-medium w-[40px]">Lida</th>
              </tr>
            </thead>
            <tbody>
              {msgPaginadas.map((m, idx) => {
                const isn = m.isn || m.ISN || `m-${idx}`
                const isImp = m.importante === true
                return (
                  <tr key={`${isn}-${idx}`} onClick={() => handleDetalhar(m)} className={cn(
                    'border-b last:border-b-0 hover:bg-muted/30 cursor-pointer',
                    isImp && 'bg-amber-50/60 dark:bg-amber-950/15',
                    !isImp && !m.lida && 'bg-sky-50/40 dark:bg-sky-950/15',
                  )}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <CaixaPostalBadge p={m.prioridade} />
                        {isImp && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                      </div>
                    </td>
                    <td className={cn('px-3 py-2 max-w-[250px] truncate', !m.lida ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                      {m.assuntoModelo || '(Sem assunto)'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-[180px] truncate">
                      {m.descricaoOrigem || m.origemModelo || '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateSerpro(m.dataEnvio)}</td>
                    <td className="px-3 py-2 text-center">
                      {m.sla_dias !== null && m.sla_dias !== undefined ? (
                        <span className={cn('font-mono text-[10px]', m.sla_dias <= 0 ? 'text-red-600 font-bold' : m.sla_dias <= 3 ? 'text-orange-600' : 'text-muted-foreground')}>
                          {m.sla_dias}d
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {m.lida ? <MailOpen className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" /> : <Mail className="h-3.5 w-3.5 text-sky-500 mx-auto" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {/* Paginação */}
          {mensagens.length > POR_PAGINA && (
            <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">
                Mostrando <span className="font-medium">{startRec}</span> a <span className="font-medium">{endRec}</span> de <span className="font-medium">{mensagens.length}</span>
              </p>
              <div className="flex items-center gap-0.5">
                <Button type="button" variant="outline" size="icon-xs" disabled={paginaAtual === 1} onClick={() => setPagina(1)}><ChevronsLeft className="h-3 w-3" /></Button>
                <Button type="button" variant="outline" size="icon-xs" disabled={paginaAtual === 1} onClick={() => setPagina(p => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                {getCpPageNumbers().map(p => (
                  <Button type="button" key={p} variant={p === paginaAtual ? 'soft' : 'outline'} size="icon-xs" className="text-[10px]" onClick={() => setPagina(p)}>{p}</Button>
                ))}
                <Button type="button" variant="outline" size="icon-xs" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
                <Button type="button" variant="outline" size="icon-xs" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(totalPaginas)}><ChevronsRight className="h-3 w-3" /></Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
