'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Shield, ShieldCheck, Loader2, Users, ExternalLink, Plus, Trash2, Eye, EyeOff, CalendarClock, Check, CheckCircle2, XCircle, AlertTriangle, FileText, FileLock, KeyRound, Clock, ListChecks, Link2, Download, Printer, Pencil, X, MoreVertical } from 'lucide-react'
import {
  Button, Input, Label, Card,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { ImportStatusModal, type ImportStep } from './import-status-modal'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useClientesPerms } from './use-clientes-perms'
import type { UseFormRegister } from 'react-hook-form'
import type { CreateClienteInput } from '@saas/types'

// ============================================================
// POP: Registros Gerais (usa campos do form principal)
// ============================================================

interface LegalizacaoCardProps {
  register: UseFormRegister<CreateClienteInput>
  clienteId?: string
  documento?: string
}

interface Socio {
  id: string
  nomeCompleto: string
  cpf: string
  tipoSocio: string
  participacao: number | null
  createdAt: string
}

const TIPO_SOCIO_LABELS: Record<string, string> = {
  SOCIO_ADMINISTRADOR: 'Socio Administrador',
  SOCIO_DIRETOR: 'Socio Diretor',
  REPRESENTANTE_LEGAL: 'Representante Legal',
  SOCIO_QUOTISTA: 'Socio Quotista',
  TITULAR: 'Titular',
}

const LINKS_RAPIDOS = [
  { label: 'RedeSim', url: 'https://www.gov.br/empresas-e-negocios/pt-br/redesim' },
  { label: 'JUCEES', url: 'https://www.jucees.es.gov.br' },
  { label: 'Corpo de Bombeiros ES', url: 'https://cb.es.gov.br' },
  { label: 'Agencia Virtual SEFAZ', url: 'https://agenciavirtual.sefaz.es.gov.br' },
]

interface Acesso { id: string; portal: string; usuario: string | null; senha: string | null; observacoes: string | null }
interface Vencimento { id: string; descricao: string; data_vencimento: string; alerta_dias: number; observacoes: string | null; concluido: boolean }

export function LegalizacaoCard({ register, clienteId, documento }: LegalizacaoCardProps) {
  const { canManageRegistration, canManageFiscal } = useClientesPerms()
  const [activeTab, setActiveTab] = useState('pop')
  // Importação OneClick (via Service Manager) com indicador de status por etapa.
  const [importSteps, setImportSteps] = useState<ImportStep[] | null>(null)
  const [importDone, setImportDone] = useState(false)
  const atualizarEtapa = (key: string, patch: Partial<ImportStep>) =>
    setImportSteps((prev) => prev?.map((s) => (s.key === key ? { ...s, ...patch } : s)) ?? null)

  // Fluxo consolidado do "Importar": (1) cadastro legado via ponte do Service
  // Manager, (2) QSA — sócios oficiais da Receita/SERPRO (modo mesclar), (3) CNAE
  // da Receita. Mostra progresso por etapa.
  const importarOneClickFluxo = async () => {
    if (!clienteId || !documento) return
    setImportDone(false)
    setImportSteps([
      { key: 'legado', label: 'Importando cadastro do OneClick (registros, acessos, sócios…)', status: 'running' },
      { key: 'qsa', label: 'Sincronizando sócios da Receita (QSA)', status: 'pending' },
      { key: 'cnae', label: 'Buscando CNAE na Receita Federal', status: 'pending' },
    ])
    // 1) Legado via Service Manager (ponte — só lê na LAN e devolve; a API aplica)
    try {
      const r = await (trpc.cliente as { importOneclickViaLauncher: { mutate: (i: { clienteId: string; documento: string }) => Promise<{ message: string }> } }).importOneclickViaLauncher.mutate({ clienteId, documento })
      atualizarEtapa('legado', { status: 'done', detail: r.message })
    } catch (e) {
      atualizarEtapa('legado', { status: 'error', detail: (e as Error).message })
    }
    // 2) QSA — quadro societário oficial da Receita (mescla, não substitui)
    atualizarEtapa('qsa', { status: 'running' })
    try {
      const q = await (trpc.socio as { importQsa: { mutate: (i: { clienteId: string; documento: string; force: boolean }) => Promise<{ message: string }> } }).importQsa.mutate({ clienteId, documento, force: false })
      atualizarEtapa('qsa', { status: 'done', detail: q.message })
    } catch (e) {
      atualizarEtapa('qsa', { status: 'error', detail: (e as Error).message })
    }
    // 3) CNAE (SERPRO — independente do legado)
    atualizarEtapa('cnae', { status: 'running' })
    try {
      const c = await (trpc.cliente as { importCnaes: { mutate: (i: { clienteId: string; documento: string }) => Promise<{ message: string }> } }).importCnaes.mutate({ clienteId, documento })
      atualizarEtapa('cnae', { status: 'done', detail: c.message })
    } catch (e) {
      atualizarEtapa('cnae', { status: 'error', detail: (e as Error).message })
    }
    setImportDone(true)
    // Zera as pills → os useEffects por aba refazem o fetch (a ativa na hora).
    setSocios([]); setAcessos([]); setVencimentos([]); setAndamentos([]); setCnaes([]); setCertidoes([])
    ;(trpc.cliente as { getCapitalSocial: { query: (i: { clienteId: string }) => Promise<{ capitalSocial: number | null }> } }).getCapitalSocial.query({ clienteId }).then((cs) => setCapitalSocial(cs.capitalSocial)).catch(() => {})
  }
  const [socios, setSocios] = useState<Socio[]>([])
  const [sociosLoading, setSociosLoading] = useState(false)
  const [capitalSocial, setCapitalSocial] = useState<number | null>(null)
  // Modal de edição de sócio in-place (não redireciona pra /socios/[id])
  const [editSocioId, setEditSocioId] = useState<string | null>(null)
  // Modal de cadastro novo (in-place, pré-vinculado ao cliente)
  const [novoSocioOpen, setNovoSocioOpen] = useState(false)
  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [acessosLoading, setAcessosLoading] = useState(false)
  const [vencimentos, setVencimentos] = useState<Vencimento[]>([])
  const [vencimentosLoading, setVencimentosLoading] = useState(false)
  const [senhaVisivel, setSenhaVisivel] = useState<Set<string>>(new Set())
  const [andamentos, setAndamentos] = useState<Array<{ id: string; descricao: string; tipo: string; status: string; data_inicio: string | null; data_conclusao: string | null; observacoes: string | null; usuario_nome: string | null; created_at: string }>>([])
  const [certidoes, setCertidoes] = useState<Array<{ id: string; tipo: string; label: string; situacao: string | null; dataValidade: string | null; dataConsulta: string | null; sucesso: boolean; temPdf: boolean }>>([])
  const [certidoesLoading, setCertidoesLoading] = useState(false)
  const [dteMensagens, setDteMensagens] = useState<Array<{ id: string; tipo: string | null; titulo: string | null; data_mensagem: string | null; observacao: string | null; created_at: string }>>([])
  const [dteLoading, setDteLoading] = useState(false)
  // Certificados digitais vinculados ao cliente (#HLP0078). A sub-aba "Certificado"
  // sumiu do detalhe do cliente quando reescrevemos o módulo — agora volta listando
  // os certificados ativos e linkando pra /gestao-certificados pra criar/gerenciar.
  const [certificados, setCertificados] = useState<Array<{ id: string; nome: string | null; cnpj: string | null; titular: string | null; expiraEm: string | null; emissor: string | null; status: string }>>([])
  const [certificadosLoading, setCertificadosLoading] = useState(false)

  // Modal Acesso
  const [aceModalOpen, setAceModalOpen] = useState(false)
  const [aceEditId, setAceEditId] = useState<string | null>(null)
  const [aceForm, setAceForm] = useState({ portal: '', usuario: '', senha: '', link: '' })
  // Modal Vencimento
  const [vncModalOpen, setVncModalOpen] = useState(false)
  const [vncEditId, setVncEditId] = useState<string | null>(null)
  const [vncForm, setVncForm] = useState({ descricao: '', dataVencimento: '', observacoes: '' })
  // Modal Andamento
  const TIPOS_ANDAMENTO = ['Localização', 'Sanitário', 'Bombeiro', 'Ambiental', 'Publicidade', 'Outros']
  const [andModalOpen, setAndModalOpen] = useState(false)
  const [andEditId, setAndEditId] = useState<string | null>(null)
  const [andForm, setAndForm] = useState({ tipo: 'Localização', titulo: '', vencimento: '', descricao: '' })

  const [certPdfData, setCertPdfData] = useState<string | null>(null)
  const [certPdfOpen, setCertPdfOpen] = useState(false)
  const [certPdfLabel, setCertPdfLabel] = useState('')
  const [andamentosLoading, setAndamentosLoading] = useState(false)
  const [cnaes, setCnaes] = useState<Array<{ id: string; codigo: string; descricao: string; principal: boolean }>>([])
  const [cnaesLoading, setCnaesLoading] = useState(false)

  // Carregar contagens ao montar (para badges)
  useEffect(() => {
    if (!clienteId) return
    ;(trpc.socio as any).listByCliente.query({ clienteId }).then((d: Socio[]) => setSocios(d)).catch(() => {})
    ;(trpc.cliente as any).getCapitalSocial.query({ clienteId }).then((r: { capitalSocial: number | null }) => setCapitalSocial(r.capitalSocial)).catch(() => {})
    ;(trpc.cliente as any).listAcessos.query({ clienteId }).then((d: typeof acessos) => setAcessos(d)).catch(() => {})
    ;(trpc.cliente as any).listVencimentos.query({ clienteId }).then((d: typeof vencimentos) => setVencimentos(d)).catch(() => {})
    ;(trpc.cliente as any).listAndamentos.query({ clienteId }).then((d: typeof andamentos) => setAndamentos(d)).catch(() => {})
    ;(trpc.cliente as any).listCnaes?.query({ clienteId }).then((d: typeof cnaes) => setCnaes(d)).catch(() => {})
    ;(trpc.cnd as any).certidoesCliente.query({ clienteId }).then((d: typeof certidoes) => setCertidoes(d)).catch(() => {})
    ;(trpc.cliente as any).dteMensagens.query({ clienteId }).then((d: typeof dteMensagens) => setDteMensagens(d)).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  // Lazy load socios
  useEffect(() => {
    if (activeTab === 'socios' && clienteId && socios.length === 0) {
      setSociosLoading(true)
      ;(trpc.socio as any).listByCliente.query({ clienteId })
        .then((data: unknown) => setSocios(data as Socio[]))
        .catch(() => {})
        .finally(() => setSociosLoading(false))
    }
  }, [activeTab, clienteId, socios.length])

  // Lazy load acessos
  useEffect(() => {
    if (activeTab === 'acessos' && clienteId && acessos.length === 0) {
      setAcessosLoading(true)
      ;(trpc.cliente as any).listAcessos.query({ clienteId })
        .then((data: Acesso[]) => setAcessos(data))
        .catch(() => {})
        .finally(() => setAcessosLoading(false))
    }
  }, [activeTab, clienteId, acessos.length])

  // Lazy load vencimentos
  useEffect(() => {
    if (activeTab === 'vencimentos' && clienteId && vencimentos.length === 0) {
      setVencimentosLoading(true)
      ;(trpc.cliente as any).listVencimentos.query({ clienteId })
        .then((data: Vencimento[]) => setVencimentos(data))
        .catch(() => {})
        .finally(() => setVencimentosLoading(false))
    }
  }, [activeTab, clienteId, vencimentos.length])

  // Lazy load andamentos
  useEffect(() => {
    if (activeTab === 'andamentos' && clienteId && andamentos.length === 0) {
      setAndamentosLoading(true)
      ;(trpc.cliente as any).listAndamentos.query({ clienteId })
        .then((data: typeof andamentos) => setAndamentos(data))
        .catch(() => {})
        .finally(() => setAndamentosLoading(false))
    }
  }, [activeTab, clienteId, andamentos.length])

  // Lazy load cnaes
  useEffect(() => {
    if (activeTab === 'cnaes' && clienteId && cnaes.length === 0) {
      setCnaesLoading(true)
      ;(trpc.cliente as any).listCnaes.query({ clienteId })
        .then((data: typeof cnaes) => setCnaes(data))
        .catch(() => {})
        .finally(() => setCnaesLoading(false))
    }
  }, [activeTab, clienteId, cnaes.length])

  useEffect(() => {
    if (activeTab === 'dte' && clienteId && dteMensagens.length === 0) {
      setDteLoading(true)
      ;(trpc.cliente as any).dteMensagens.query({ clienteId })
        .then((data: typeof dteMensagens) => setDteMensagens(data))
        .catch(() => {})
        .finally(() => setDteLoading(false))
    }
  }, [activeTab, clienteId, dteMensagens.length])

  useEffect(() => {
    if (activeTab === 'certidoes' && clienteId && certidoes.length === 0) {
      setCertidoesLoading(true)
      ;(trpc.cnd as any).certidoesCliente.query({ clienteId })
        .then((data: typeof certidoes) => setCertidoes(data))
        .catch(() => {})
        .finally(() => setCertidoesLoading(false))
    }
  }, [activeTab, clienteId, certidoes.length])

  // Lazy load de certificados digitais (#HLP0078)
  useEffect(() => {
    if (activeTab === 'certificados' && clienteId && certificados.length === 0) {
      setCertificadosLoading(true)
      ;(trpc.certificadoDigital as any).list.query({ clienteId, incluirArquivados: false })
        .then((data: typeof certificados) => setCertificados(data))
        .catch(() => {})
        .finally(() => setCertificadosLoading(false))
    }
  }, [activeTab, clienteId, certificados.length])

  // ── Acesso CRUD ──
  function openAceModal(acesso?: typeof acessos[0]) {
    if (acesso) {
      setAceEditId(acesso.id)
      setAceForm({ portal: acesso.portal, usuario: acesso.usuario || '', senha: '', link: acesso.observacoes || '' })
    } else {
      setAceEditId(null)
      setAceForm({ portal: '', usuario: '', senha: '', link: '' })
    }
    setAceModalOpen(true)
  }
  async function saveAcesso() {
    if (!clienteId || !aceForm.portal) return
    try {
      if (aceEditId) {
        await (trpc.cliente as any).updateAcesso.mutate({ id: aceEditId, portal: aceForm.portal, usuario: aceForm.usuario || undefined, senha: aceForm.senha || undefined, observacoes: aceForm.link || undefined })
      } else {
        await (trpc.cliente as any).addAcesso.mutate({ clienteId, portal: aceForm.portal, usuario: aceForm.usuario || undefined, senha: aceForm.senha || undefined, observacoes: aceForm.link || undefined })
      }
      setAceModalOpen(false)
      setAcessos([])
      ;(trpc.cliente as any).listAcessos.query({ clienteId }).then((d: typeof acessos) => setAcessos(d)).catch(() => {})
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function removeAcesso(id: string) {
    if (!await alerts.confirmDelete('este acesso')) return
    try { await (trpc.cliente as any).removeAcesso.mutate({ id }); setAcessos(prev => prev.filter(a => a.id !== id)) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Vencimento CRUD ──
  function openVncModal(vnc?: typeof vencimentos[0]) {
    if (vnc) {
      setVncEditId(vnc.id)
      setVncForm({ descricao: vnc.descricao, dataVencimento: vnc.data_vencimento ? new Date(vnc.data_vencimento).toISOString().slice(0, 10) : '', observacoes: vnc.observacoes || '' })
    } else {
      setVncEditId(null)
      setVncForm({ descricao: '', dataVencimento: '', observacoes: '' })
    }
    setVncModalOpen(true)
  }
  async function saveVencimento() {
    if (!clienteId || !vncForm.descricao) return
    try {
      if (vncEditId) {
        await (trpc.cliente as any).updateVencimento.mutate({ id: vncEditId, descricao: vncForm.descricao, dataVencimento: vncForm.dataVencimento || undefined, observacoes: vncForm.observacoes || undefined })
      } else {
        await (trpc.cliente as any).addVencimento.mutate({ clienteId, descricao: vncForm.descricao, dataVencimento: vncForm.dataVencimento || undefined, observacoes: vncForm.observacoes || undefined })
      }
      setVncModalOpen(false)
      setVencimentos([])
      ;(trpc.cliente as any).listVencimentos.query({ clienteId }).then((d: typeof vencimentos) => setVencimentos(d)).catch(() => {})
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function toggleVencimento(id: string) {
    try { await (trpc.cliente as any).toggleVencimento.mutate({ id }); setVencimentos(prev => prev.map(v => v.id === id ? { ...v, concluido: !v.concluido } : v)) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function removeVencimento(id: string) {
    if (!await alerts.confirmDelete('este vencimento')) return
    try { await (trpc.cliente as any).removeVencimento.mutate({ id }); setVencimentos(prev => prev.filter(v => v.id !== id)) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Andamento CRUD ──
  function openAndModal(and_?: typeof andamentos[0]) {
    if (and_) {
      setAndEditId(and_.id)
      setAndForm({ tipo: and_.tipo || 'Outros', titulo: and_.descricao || '', vencimento: '', descricao: and_.observacoes || '' })
    } else {
      setAndEditId(null)
      setAndForm({ tipo: 'Localização', titulo: '', vencimento: '', descricao: '' })
    }
    setAndModalOpen(true)
  }
  async function saveAndamento() {
    if (!clienteId || !andForm.tipo) return
    try {
      if (andEditId) {
        await (trpc.cliente as any).updateAndamento.mutate({ id: andEditId, descricao: andForm.titulo || andForm.tipo, tipo: andForm.tipo, status: 'Em andamento', observacoes: andForm.descricao || undefined })
      } else {
        await (trpc.cliente as any).addAndamento.mutate({ clienteId, descricao: andForm.titulo || andForm.tipo, tipo: andForm.tipo, observacoes: andForm.descricao || undefined })
      }
      setAndModalOpen(false)
      setAndamentos([])
      ;(trpc.cliente as any).listAndamentos.query({ clienteId }).then((d: typeof andamentos) => setAndamentos(d)).catch(() => {})
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function removeAndamento(id: string) {
    if (!await alerts.confirmDelete('este andamento')) return
    try { await (trpc.cliente as any).removeAndamento.mutate({ id }); setAndamentos(prev => prev.filter(a => a.id !== id)) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function addCnae() {
    if (!clienteId) return
    const codigo = prompt('Codigo CNAE (ex: 6202-3/00):')
    if (!codigo) return
    const descricao = prompt('Descricao:') || ''
    try {
      await (trpc.cliente as any).addCnae.mutate({ clienteId, codigo, descricao })
      setCnaes([])
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function removeCnae(id: string) {
    const ok = await alerts.confirmDelete('este CNAE')
    if (!ok) return
    try {
      await (trpc.cliente as any).removeCnae.mutate({ id })
      setCnaes(prev => prev.filter(c => c.id !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const pillCounts: Record<string, number | null> = {
    socios: socios.length || null,
    acessos: acessos.length || null,
    vencimentos: vencimentos.length || null,
    andamentos: andamentos.length || null,
    cnaes: cnaes.length || null,
    certidoes: certidoes.length || null,
    certificados: certificados.length || null,
    dte: dteMensagens.length || null,
  }

  const pills: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'pop', label: 'Registros Gerais', icon: FileText },
    { id: 'socios', label: 'Sócios', icon: Users },
    { id: 'acessos', label: 'Acessos', icon: KeyRound },
    { id: 'vencimentos', label: 'Vencimentos', icon: Clock },
    { id: 'andamentos', label: 'Andamentos', icon: ListChecks },
    { id: 'cnaes', label: 'CNAEs', icon: ListChecks },
    { id: 'certidoes', label: "CND's e Alvarás", icon: Shield },
    { id: 'certificados', label: 'Certificado Digital', icon: ShieldCheck },
    { id: 'dte', label: 'DT-e', icon: FileText },
    { id: 'links', label: 'Links Rápidos', icon: Link2 },
  ]

  return (
    <>
    <Card>
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-600" />
          <h5 className="text-[13px] font-semibold">Legalização</h5>
        </div>
        {clienteId && (<div className="flex items-center gap-1.5">
          {documento && (
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void importarOneClickFluxo() }}>
              <Download className="h-3 w-3" />Importar
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" type="button"
            onClick={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!clienteId) return
              try {
                const resumo = await (trpc.cliente as any).resumoLegalizacao.query({ clienteId }) as Record<string, unknown> | null
                if (!resumo) { alerts.warning('Resumo', 'Dados não encontrados'); return }
                const cli = resumo.cliente as Record<string, string | null>
                const soc = resumo.socios as Array<Record<string, unknown>>
                const ace = resumo.acessos as Array<Record<string, unknown>>
                const ven = resumo.vencimentos as Array<Record<string, unknown>>
                const and_ = resumo.andamentos as Array<Record<string, unknown>>
                const cna = resumo.cnaes as Array<Record<string, unknown>>
                const cert = resumo.certidoes as Array<{ label: string; situacao: string | null; dataValidade: string | null; sucesso: boolean }>

                const doc = (cli.documento || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
                const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

                const tableStyle = 'width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;'
                const thStyle = 'text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#475569;'
                const tdStyle = 'padding:6px 8px;border-bottom:1px solid #f1f5f9;'
                const h2Style = 'font-size:13px;font-weight:700;color:#1e293b;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;'

                const html = `<!DOCTYPE html><html><head><title>Resumo Legalização — ${cli.razaoSocial}</title>
                  <style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } } body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #334155; }</style></head><body>
                  <div style="text-align:center;margin-bottom:24px;">
                    <h1 style="font-size:18px;color:#1e293b;margin:0;">Resumo de Legalização</h1>
                    <p style="font-size:12px;color:#94a3b8;margin:4px 0 0;">Gerado em ${dataAtual}</p>
                  </div>
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1e293b;">${cli.razaoSocial || ''}</p>
                    ${cli.nomeFantasia ? `<p style="margin:0 0 2px;font-size:11px;color:#64748b;">Nome Fantasia: ${cli.nomeFantasia}</p>` : ''}
                    <p style="margin:0 0 2px;font-size:11px;color:#64748b;">CNPJ: <strong>${doc}</strong> | IE: ${cli.inscricaoEstadual || '—'} | IM: ${cli.inscricaoMunicipal || '—'}</p>
                    <p style="margin:0;font-size:11px;color:#64748b;">${[cli.logradouro, cli.numero, cli.bairro, cli.cidade, cli.uf].filter(Boolean).join(', ')} ${cli.cep ? '— CEP: ' + cli.cep : ''}</p>
                  </div>

                  ${soc.length > 0 ? `<h2 style="${h2Style}">Sócios</h2>
                  <table style="${tableStyle}"><tr><th style="${thStyle}">Nome</th><th style="${thStyle}">CPF/CNPJ</th><th style="${thStyle}">Tipo</th><th style="${thStyle}">Participação</th></tr>
                  ${soc.map(s => `<tr><td style="${tdStyle}">${s.nomeCompleto}</td><td style="${tdStyle}">${s.cpf || '—'}</td><td style="${tdStyle}">${s.tipoSocio}</td><td style="${tdStyle}">${s.participacao != null ? Number(s.participacao).toFixed(2) + '%' : '—'}</td></tr>`).join('')}</table>` : ''}

                  ${ace.length > 0 ? `<h2 style="${h2Style}">Acessos</h2>
                  <table style="${tableStyle}"><tr><th style="${thStyle}">Portal</th><th style="${thStyle}">Usuário</th><th style="${thStyle}">Observações</th></tr>
                  ${ace.map(a => `<tr><td style="${tdStyle}">${a.portal || ''}</td><td style="${tdStyle}">${a.usuario || '—'}</td><td style="${tdStyle}">${a.observacoes || '—'}</td></tr>`).join('')}</table>` : ''}

                  ${ven.length > 0 ? `<h2 style="${h2Style}">Vencimentos</h2>
                  <table style="${tableStyle}"><tr><th style="${thStyle}">Descrição</th><th style="${thStyle}">Vencimento</th><th style="${thStyle}">Status</th></tr>
                  ${ven.map(v => `<tr><td style="${tdStyle}">${v.descricao || ''}</td><td style="${tdStyle}">${v.data_vencimento ? new Date(v.data_vencimento as string).toLocaleDateString('pt-BR') : '—'}</td><td style="${tdStyle}">${v.concluido ? '✓ Concluído' : 'Pendente'}</td></tr>`).join('')}</table>` : ''}

                  ${and_.length > 0 ? `<h2 style="${h2Style}">Andamentos</h2>
                  <table style="${tableStyle}"><tr><th style="${thStyle}">Descrição</th><th style="${thStyle}">Tipo</th><th style="${thStyle}">Status</th><th style="${thStyle}">Data</th></tr>
                  ${and_.map(a => `<tr><td style="${tdStyle}">${a.descricao || ''}</td><td style="${tdStyle}">${a.tipo || '—'}</td><td style="${tdStyle}">${a.status || '—'}</td><td style="${tdStyle}">${a.created_at ? new Date(a.created_at as string).toLocaleDateString('pt-BR') : '—'}</td></tr>`).join('')}</table>` : ''}

                  ${cna.length > 0 ? `<h2 style="${h2Style}">CNAEs</h2>
                  <table style="${tableStyle}"><tr><th style="${thStyle}">Código</th><th style="${thStyle}">Descrição</th><th style="${thStyle}">Principal</th></tr>
                  ${cna.map(c => `<tr><td style="${tdStyle}">${c.codigo || ''}</td><td style="${tdStyle}">${c.descricao || ''}</td><td style="${tdStyle}">${c.principal ? '★ Sim' : '—'}</td></tr>`).join('')}</table>` : ''}

                  ${cert.length > 0 ? `<h2 style="${h2Style}">CND's e Alvarás</h2>
                  <table style="${tableStyle}"><tr><th style="${thStyle}">Certidão / Alvará</th><th style="${thStyle}">Situação</th><th style="${thStyle}">Validade</th></tr>
                  ${cert.map(c => `<tr><td style="${tdStyle}">${c.label}</td><td style="${tdStyle};color:${c.sucesso ? '#16a34a' : '#ef4444'};font-weight:500;">${c.situacao || (c.sucesso ? 'Emitida' : 'Não emitida')}</td><td style="${tdStyle}">${c.dataValidade ? new Date(c.dataValidade + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td></tr>`).join('')}</table>` : ''}

                  <p style="font-size:9px;color:#cbd5e1;text-align:center;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:12px;">OneClick ERP — Resumo de Legalização</p>
                </body></html>`

                const win = window.open('', '_blank')
                if (win) { win.document.write(html); win.document.close(); win.print() }
              } catch (err) { alerts.error('Erro', (err as Error).message) }
            }}>
            <Printer className="h-3 w-3" />Imprimir Resumo
          </Button>
        </div>)}
      </div>
      <div className="flex min-h-[400px]">
        {/* Pills laterais */}
        <div className="w-[160px] shrink-0 border-r border-border bg-muted/40 p-3 space-y-1">
          {pills.map(pill => {
            const Icon = pill.icon
            const count = pillCounts[pill.id]
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setActiveTab(pill.id)}
                className={cn(
                  'flex items-center gap-2 w-full rounded-md px-3 py-2 text-[11px] font-medium transition-colors text-left',
                  activeTab === pill.id
                    ? 'text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/60',
                )}
                style={activeTab === pill.id ? { backgroundColor: '#10b981' } : undefined}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{pill.label}</span>
                {count != null && count > 0 ? (
                  <span className={cn('text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center ml-auto shrink-0',
                    activeTab === pill.id ? 'bg-white/30 text-white' : 'bg-red-500 text-white')}>
                    {count}
                  </span>
                ) : <span className="ml-auto shrink-0 w-[16px]" />}
              </button>
            )
          })}
        </div>

        {/* Conteudo */}
        <div key={activeTab} className="flex-1" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
          {/* POP: Registros Gerais */}
          {activeTab === 'pop' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">POP: Registros Gerais</h4>
                </div>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Inscricao Estadual</Label>
                  <Input placeholder="IE" {...register('inscricaoEstadual')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Inscricao Municipal</Label>
                  <Input placeholder="IM" {...register('inscricaoMunicipal')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>CNAE Principal</Label>
                  <Input placeholder="0000-0/00" {...register('cnaePrincipal' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>NIRE</Label>
                  <Input placeholder="NIRE" {...register('nire' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>RG Edificacao</Label>
                  <Input placeholder="RG Edificacao" {...register('rgEdificacao' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Codigo Simples</Label>
                  <Input placeholder="Codigo Simples Nacional" {...register('codigoSimples' as any)} />
                </div>

                {/* Separador Bombeiros */}
                <div className="col-span-12 -mx-5 border-t border-[rgba(0,0,0,0.08)] mt-2" />
                <div className="col-span-12 -mx-5 px-5 py-2">
                  <h4 className="text-[13px] font-semibold text-foreground">Corpo de Bombeiros</h4>
                </div>

                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Tipo / Ocupacao</Label>
                  <Input placeholder="Tipo de ocupacao" {...register('bombeirosOcupacao' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Metragem</Label>
                  <Input placeholder="m²" {...register('bombeirosMetragem' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Rota</Label>
                  <Input placeholder="Rota" {...register('bombeirosRota' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Projeto</Label>
                  <Input placeholder="N° Projeto" {...register('bombeirosProjeto' as any)} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Capacidade</Label>
                  <Input placeholder="Capacidade" {...register('bombeirosCapacidade' as any)} />
                </div>
              </div>
            </>
          )}

          {/* Socios */}
          {activeTab === 'socios' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <div>
                    <h4 className="text-[13px] font-semibold text-foreground">Sócios vinculados</h4>
                    <div className="flex items-center gap-3">
                      {capitalSocial != null && <p className="text-[10px] text-muted-foreground">Capital Social: <strong>R$ {capitalSocial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>}
                      {socios.length > 0 && <p className="text-[10px] text-muted-foreground">Ultima consulta: <strong>{new Date(Math.max(...socios.map(s => new Date(s.createdAt).getTime()))).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></p>}
                    </div>
                  </div>
                  {clienteId && (
                    <div className="flex items-center gap-1.5">
                      {/* Cadastro manual — abre o modal in-place no contexto do cliente */}
                      {canManageRegistration && (
                        <Button
                          variant="outline" size="sm" className="h-7 text-[11px] gap-1" type="button"
                          onClick={e => { e.preventDefault(); e.stopPropagation(); setNovoSocioOpen(true) }}
                        >
                          <Plus className="h-3 w-3" />Novo Sócio
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5">
                {sociosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando socios...
                  </div>
                ) : socios.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum socio vinculado a este cliente.</p>
                    <p className="text-xs mt-1">Vincule socios no modulo de Socios.</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-muted/30 text-[11px] text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Nome</th>
                          <th className="text-left px-3 py-2 font-medium">CPF/CNPJ</th>
                          <th className="text-left px-3 py-2 font-medium">Tipo</th>
                          <th className="text-right px-3 py-2 font-medium">Participacao</th>
                          <th className="text-right px-3 py-2 font-medium">Valor</th>
                          <th className="text-right px-3 py-2 font-medium w-10">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {socios.map(s => {
                          const pct = s.participacao != null ? Number(s.participacao) : null
                          const valor = pct != null && capitalSocial != null ? (capitalSocial * pct) / 100 : null
                          return (
                          <tr key={s.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium text-foreground">{s.nomeCompleto}</td>
                            <td className="px-3 py-2 text-muted-foreground">{s.cpf?.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') || '--'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{TIPO_SOCIO_LABELS[s.tipoSocio] || s.tipoSocio}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{pct != null ? `${pct.toFixed(2)}%` : '--'}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{valor != null ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--'}</td>
                            <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={e => e.stopPropagation()}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
                                    title="Ações"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-36">
                                  <DropdownMenuItem
                                    onClick={e => {
                                      e.stopPropagation()
                                      setEditSocioId(s.id)
                                    }}
                                    className="text-xs gap-2 cursor-pointer"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={async e => {
                                      e.stopPropagation()
                                      const ok = await alerts.confirm({
                                        title: 'Excluir sócio?',
                                        text: `Deseja excluir o sócio "${s.nomeCompleto}"? Esta ação não pode ser desfeita.`,
                                        confirmText: 'Excluir',
                                        icon: 'warning',
                                      })
                                      if (!ok) return
                                      try {
                                        await (trpc.socio as any).delete.mutate({ id: s.id })
                                        const data = await (trpc.socio as any).listByCliente.query({ clienteId }) as typeof socios
                                        setSocios(data)
                                        alerts.success('Excluído', 'Sócio removido com sucesso.')
                                      } catch (err) { alerts.error('Erro', (err as Error).message) }
                                    }}
                                    className="text-xs gap-2 cursor-pointer text-rose-600 dark:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Acessos */}
          {activeTab === 'acessos' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">Acessos a Portais</h4>
                  <div className="flex items-center gap-1.5">
                    {acessos.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        const csv = ['Portal;Usuário;Link', ...acessos.map(a => `${a.portal};${a.usuario || ''};${(a.observacoes || '').replace(/\n/g, ' ')}`)].join('\n')
                        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = 'acessos.csv'; a.click()
                      }}><Download className="h-3 w-3" />Excel</Button>
                    )}
                    {clienteId && canManageRegistration && <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAceModal() }} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>}
                  </div>
                </div>
              </div>
              <div className="p-5">
                {acessosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : acessos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum acesso cadastrado.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b">
                        <th className="text-left px-3 py-2 font-medium">Tipo</th>
                        <th className="text-left px-3 py-2 font-medium">Link</th>
                        <th className="text-left px-3 py-2 font-medium">Usuário</th>
                        <th className="text-left px-3 py-2 font-medium">Senha</th>
                        <th className="text-right px-3 py-2 font-medium w-[80px]">Ações</th>
                      </tr></thead>
                      <tbody>
                        {acessos.map(a => (
                          <tr key={a.id} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">{a.portal}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate" title={a.observacoes || ''}>{a.observacoes || '—'}</td>
                            <td className="px-3 py-2 font-mono">{a.usuario || '—'}</td>
                            <td className="px-3 py-2 font-mono">
                              {senhaVisivel.has(a.id) ? (a.senha || '—') : (a.senha ? '••••••' : '—')}
                              {a.senha && <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => setSenhaVisivel(prev => { const n = new Set(prev); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n })}>{senhaVisivel.has(a.id) ? <EyeOff className="h-3 w-3 inline" /> : <Eye className="h-3 w-3 inline" />}</button>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button type="button" className="rounded p-1 hover:bg-muted mr-1" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAceModal(a) }}><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                              <button type="button" className="rounded p-1 hover:bg-muted" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAcesso(a.id) }}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Vencimentos */}
          {activeTab === 'vencimentos' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">Vencimentos e Prazos</h4>
                  <div className="flex items-center gap-1.5">
                    {vencimentos.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        const csv = ['Tipo;Vencimento;Status;Observações', ...vencimentos.map(v => `${v.descricao};${v.data_vencimento ? new Date(v.data_vencimento).toLocaleDateString('pt-BR') : ''};${v.concluido ? 'Concluído' : 'Pendente'};${(v.observacoes || '').replace(/\n/g, ' ')}`)].join('\n')
                        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = 'vencimentos.csv'; a.click()
                      }}><Download className="h-3 w-3" />Excel</Button>
                    )}
                    {clienteId && canManageRegistration && <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openVncModal() }} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>}
                  </div>
                </div>
              </div>
              <div className="p-5">
                {vencimentosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : vencimentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum vencimento cadastrado.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b">
                        <th className="text-left px-3 py-2 font-medium">Tipo</th>
                        <th className="text-left px-3 py-2 font-medium">Observações</th>
                        <th className="text-left px-3 py-2 font-medium">Vencimento</th>
                        <th className="text-center px-3 py-2 font-medium w-[60px]">Status</th>
                        <th className="text-right px-3 py-2 font-medium w-[80px]">Ações</th>
                      </tr></thead>
                      <tbody>
                        {vencimentos.map(v => {
                          const dt = v.data_vencimento ? new Date(v.data_vencimento) : null
                          const diffDays = dt ? Math.ceil((dt.getTime() - Date.now()) / 86400000) : null
                          const vencido = diffDays !== null && diffDays < 0 && !v.concluido
                          const proximo = diffDays !== null && diffDays >= 0 && diffDays <= (v.alerta_dias || 30) && !v.concluido
                          return (
                            <tr key={v.id} className={cn('border-b last:border-b-0 hover:bg-muted/20', vencido && 'bg-red-50/50', proximo && 'bg-amber-50/50', v.concluido && 'opacity-50')}>
                              <td className={cn('px-3 py-2 font-medium', v.concluido && 'line-through')}>{v.descricao}</td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate" title={v.observacoes || ''}>{v.observacoes || '—'}</td>
                              <td className="px-3 py-2">
                                {dt ? <span className={cn('font-medium', vencido && 'text-red-600', proximo && 'text-amber-600', !vencido && !proximo && 'text-emerald-600')}>{dt.toLocaleDateString('pt-BR')}</span> : '—'}
                                {vencido && <span className="text-[9px] text-red-500 ml-1">(vencido)</span>}
                                {proximo && !vencido && diffDays !== null && <span className="text-[9px] text-amber-500 ml-1">({diffDays}d)</span>}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleVencimento(v.id) }} className={cn('h-5 w-5 rounded-full border-2 flex items-center justify-center mx-auto', v.concluido ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40')}>
                                  {v.concluido && <Check className="h-3 w-3 text-white" />}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button type="button" className="rounded p-1 hover:bg-muted mr-1" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openVncModal(v) }}><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                                <button type="button" className="rounded p-1 hover:bg-muted" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeVencimento(v.id) }}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Andamentos */}
          {activeTab === 'andamentos' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">Registro de Andamentos</h4>
                  {clienteId && canManageRegistration && <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAndModal() }} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>}
                </div>
              </div>
              <div className="p-5">
                {andamentosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : andamentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum andamento registrado.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b">
                        <th className="text-left px-3 py-2 font-medium">Tipo</th>
                        <th className="text-left px-3 py-2 font-medium">Título</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Data</th>
                        <th className="text-right px-3 py-2 font-medium w-[80px]">Ações</th>
                      </tr></thead>
                      <tbody>
                        {andamentos.map(a => (
                          <tr key={a.id} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">{a.tipo || '—'}</td>
                            <td className="px-3 py-2">{a.descricao}</td>
                            <td className="px-3 py-2">
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                                a.status === 'concluido' || a.status === 'Concluído' ? 'bg-emerald-100 text-emerald-700' :
                                a.status === 'em_andamento' || a.status === 'Em andamento' ? 'bg-sky-100 text-sky-700' :
                                a.status === 'cancelado' || a.status === 'Cancelado' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700')}>
                                {a.status || 'Pendente'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button type="button" className="rounded p-1 hover:bg-muted mr-1" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAndModal(a) }}><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                              <button type="button" className="rounded p-1 hover:bg-muted" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAndamento(a.id) }}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* CNAEs */}
          {activeTab === 'cnaes' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">CNAE (Receita Federal / Serpro)</h4>
                  <div className="flex items-center gap-1.5">
                    {clienteId && canManageFiscal && <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); addCnae() }} className="gap-1.5 h-7 text-[11px]"><Plus className="h-3 w-3" /> Manual</Button>}
                  </div>
                </div>
              </div>
              <div className="p-5">
                {cnaesLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...</div>
                ) : cnaes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Use o botão <strong>Importar</strong> (no topo) para carregar os CNAEs da Receita Federal.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b">
                        <th className="text-left px-3 py-2 font-medium w-[90px]">Tipo</th>
                        <th className="text-left px-3 py-2 font-medium">Código e descrição</th>
                        <th className="text-right px-3 py-2 font-medium w-[40px]"></th>
                      </tr></thead>
                      <tbody>
                        {cnaes.map(c => (
                          <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border',
                                c.principal ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted/50 border-border text-muted-foreground')}>
                                {c.principal ? 'Principal' : 'Secundário'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-mono font-medium">{c.codigo}</span>
                              {c.descricao && <span className="text-muted-foreground ml-1">— {c.descricao}</span>}
                            </td>
                            <td className="px-1 py-2 text-right">
                              <button type="button" className="rounded p-1 hover:bg-muted" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeCnae(c.id) }}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* CND's e Alvarás */}
          {activeTab === 'certidoes' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">CND's e Alvarás</h4>
                  {clienteId && (
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={() => { setCertidoes([]); setCertidoesLoading(true);
                        (trpc.cnd as any).certidoesCliente.query({ clienteId })
                          .then((data: typeof certidoes) => setCertidoes(data))
                          .catch(() => {})
                          .finally(() => setCertidoesLoading(false))
                      }}>
                      <Loader2 className={cn('h-3 w-3', certidoesLoading ? 'animate-spin' : 'hidden')} />
                      Atualizar
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-5">
                {certidoesLoading ? (
                  <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : certidoes.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Nenhuma certidão ou alvará consultado para este cliente
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-2 py-2 font-medium">Certidão / Alvará</th>
                        <th className="text-left px-2 py-2 font-medium">Situação</th>
                        <th className="text-left px-2 py-2 font-medium">Validade</th>
                        <th className="text-left px-2 py-2 font-medium">Consulta</th>
                        <th className="text-right px-2 py-2 font-medium w-[60px]">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certidoes.map((c, idx) => {
                        const sitLower = (c.situacao || '').toLowerCase()
                        const isPositive = sitLower.includes('negativa') && !sitLower.includes('positiva') || sitLower.includes('nada consta') || sitLower.includes('regular') || sitLower.includes('emitid')
                        const isWarning = sitLower.includes('positiva') || sitLower.includes('vencen')
                        const isNeg = sitLower.includes('irregular') || sitLower.includes('consta') && !sitLower.includes('nada')

                        let valBadge = null
                        if (c.dataValidade) {
                          const val = new Date(c.dataValidade + 'T00:00:00')
                          const diff = Math.ceil((val.getTime() - Date.now()) / 86400000)
                          const formatted = val.toLocaleDateString('pt-BR')
                          if (diff < 0) valBadge = <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-700">{formatted} <span className="text-[9px] opacity-70">(vencida)</span></span>
                          else if (diff <= 15) valBadge = <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700">{formatted} <span className="text-[9px] opacity-70">({diff}d)</span></span>
                          else valBadge = <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{formatted}</span>
                        }

                        return (
                          <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-2 py-2.5 font-medium">{c.label}</td>
                            <td className="px-2 py-2.5">
                              {c.sucesso ? (
                                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border',
                                  isPositive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                  isWarning ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                  isNeg ? 'bg-red-50 border-red-200 text-red-700' :
                                  'bg-emerald-50 border-emerald-200 text-emerald-700')}>
                                  {isPositive ? <CheckCircle2 className="h-3 w-3" /> : isNeg ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                  {c.situacao || 'Emitida'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-700">
                                  <XCircle className="h-3 w-3" />{c.situacao || 'Não emitida'}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2.5">{valBadge || <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-2 py-2.5 text-muted-foreground">{c.dataConsulta ? new Date(c.dataConsulta).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                            <td className="px-2 py-2.5 text-right">
                              {c.temPdf && (
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" type="button"
                                  onClick={async (e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    try {
                                      const det = await (trpc.cnd as any).certidaoPdf.query({ tipo: c.tipo, id: c.id }) as { pdfBase64: string | null }
                                      if (det.pdfBase64) { setCertPdfData(det.pdfBase64); setCertPdfLabel(c.label); setCertPdfOpen(true) }
                                      else alerts.warning('PDF', 'PDF não disponível')
                                    } catch (err) { alerts.error('Erro', (err as Error).message) }
                                  }}>
                                  <Eye className="h-3 w-3" />PDF
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* Certificado Digital (#HLP0078) */}
          {activeTab === 'certificados' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <div>
                    <h4 className="text-[13px] font-semibold text-foreground">Certificado Digital</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Certificados (.pfx) vinculados a este cliente. A senha é cifrada com AES-256-GCM.
                    </p>
                  </div>
                  <a
                    href={`/gestao-certificados?clienteId=${clienteId ?? ''}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" type="button">
                      <Plus className="h-3 w-3" /> Adicionar / Gerenciar
                    </Button>
                  </a>
                </div>
              </div>
              <div className="p-5">
                {certificadosLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando certificados...
                  </div>
                ) : certificados.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum certificado vinculado a este cliente.</p>
                    <p className="text-xs mt-1">
                      Use o botão "Adicionar / Gerenciar" pra fazer upload do .pfx no módulo de certificados.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {certificados.map(cert => {
                      const exp = cert.expiraEm ? new Date(cert.expiraEm) : null
                      const diasParaExpirar = exp ? Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
                      const expColor = diasParaExpirar === null
                        ? 'text-muted-foreground'
                        : diasParaExpirar < 0
                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                          : diasParaExpirar < 30
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-emerald-600 dark:text-emerald-400'
                      return (
                        <a
                          key={cert.id}
                          href={`/gestao-certificados?openId=${cert.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border hover:bg-muted/30 transition-colors"
                        >
                          <FileLock className="h-5 w-5 text-fuchsia-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {cert.titular || cert.nome || cert.id}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {cert.cnpj && <>CNPJ: <span className="font-mono">{cert.cnpj}</span> · </>}
                              {cert.emissor && <>Emissor: {cert.emissor}</>}
                            </p>
                          </div>
                          <div className={cn('text-[11px] shrink-0 text-right', expColor)}>
                            {exp ? (
                              <>
                                <div>Expira: {exp.toLocaleDateString('pt-BR')}</div>
                                <div className="text-[10px]">
                                  {diasParaExpirar !== null && diasParaExpirar < 0
                                    ? `${Math.abs(diasParaExpirar)} dia(s) vencido`
                                    : diasParaExpirar !== null
                                      ? `${diasParaExpirar} dia(s) restante(s)`
                                      : '—'}
                                </div>
                              </>
                            ) : '—'}
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* DT-e Mensagens */}
          {activeTab === 'dte' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">DT-e — Domicílio Tributário Eletrônico</h4>
                  {clienteId && canManageFiscal && (
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" type="button"
                      onClick={async (e) => {
                        e.preventDefault(); e.stopPropagation()
                        const titulo = prompt('Título da mensagem:')
                        if (!titulo) return
                        const tipo = prompt('Tipo (ex: Intimação, Notificação, Ciência):') || ''
                        try {
                          await (trpc.cliente as any).dteAddMensagem.mutate({ clienteId, titulo, tipo, dataMensagem: new Date().toISOString() })
                          const data = await (trpc.cliente as any).dteMensagens.query({ clienteId }) as typeof dteMensagens
                          setDteMensagens(data)
                        } catch (err) { alerts.error('Erro', (err as Error).message) }
                      }}>
                      <Plus className="h-3 w-3" />Nova Mensagem
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-5">
                {dteLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : dteMensagens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Nenhuma mensagem DT-e registrada
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b">
                        <th className="text-left px-3 py-2 font-medium">Tipo</th>
                        <th className="text-left px-3 py-2 font-medium">Título</th>
                        <th className="text-left px-3 py-2 font-medium">Data</th>
                        <th className="w-[40px]"></th>
                      </tr></thead>
                      <tbody>
                        {dteMensagens.map(m => (
                          <tr key={m.id} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground">{m.tipo || '—'}</td>
                            <td className="px-3 py-2 font-medium">{m.titulo || '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{m.data_mensagem ? new Date(m.data_mensagem).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                            <td className="px-1 py-2">
                              <button type="button" className="rounded p-1 hover:bg-muted transition-colors" onClick={async (e) => {
                                e.preventDefault(); e.stopPropagation()
                                if (!confirm('Excluir esta mensagem?')) return
                                try {
                                  await (trpc.cliente as any).dteDeleteMensagem.mutate({ id: m.id })
                                  setDteMensagens(prev => prev.filter(x => x.id !== m.id))
                                } catch (err) { alerts.error('Erro', (err as Error).message) }
                              }}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Links Rapidos */}
          {activeTab === 'links' && (
            <>
              <div className="-m-0">
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Links Rapidos</h4>
                </div>
              </div>
              <div className="p-5 grid grid-cols-2 gap-2">
                {LINKS_RAPIDOS.map(link => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/40 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 text-emerald-600 shrink-0" />
                    {link.label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>

    {/* Modal Acesso */}
    {aceModalOpen && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: "dialog-fade-in 200ms ease-out" }}>
        <div className="fixed inset-0 bg-black/60" onClick={() => setAceModalOpen(false)} />
        <div className="relative bg-background rounded-xl shadow-2xl border w-full max-w-md" style={{ animation: "dialog-zoom-in 200ms ease-out" }}>
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="text-sm font-semibold">{aceEditId ? 'Editar Acesso' : 'Novo Acesso'}</h3>
            <button type="button" onClick={() => setAceModalOpen(false)} className="rounded-md p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div><Label className="text-xs">Tipo do Acesso *</Label><Input value={aceForm.portal} onChange={e => setAceForm(p => ({ ...p, portal: e.target.value }))} placeholder="Ex: Portal, Sistema" className="text-xs mt-1" /></div>
            <div><Label className="text-xs">Usuário</Label><Input value={aceForm.usuario} onChange={e => setAceForm(p => ({ ...p, usuario: e.target.value }))} className="text-xs mt-1" /></div>
            <div><Label className="text-xs">Senha {aceEditId ? '(vazio = não alterar)' : ''}</Label><Input value={aceForm.senha} onChange={e => setAceForm(p => ({ ...p, senha: e.target.value }))} placeholder={aceEditId ? 'Deixar vazio para não alterar' : ''} className="text-xs mt-1" /></div>
            <div><Label className="text-xs">Link</Label><Input value={aceForm.link} onChange={e => setAceForm(p => ({ ...p, link: e.target.value }))} placeholder="https://" className="text-xs mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setAceModalOpen(false)}>Fechar</Button>
            <Button type="button" size="sm" onClick={saveAcesso} disabled={!aceForm.portal}>Salvar</Button>
          </div>
        </div>
      </div>,
      document.body,
    )}

    {/* Modal Vencimento */}
    {vncModalOpen && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: "dialog-fade-in 200ms ease-out" }}>
        <div className="fixed inset-0 bg-black/60" onClick={() => setVncModalOpen(false)} />
        <div className="relative bg-background rounded-xl shadow-2xl border w-full max-w-md" style={{ animation: "dialog-zoom-in 200ms ease-out" }}>
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="text-sm font-semibold">{vncEditId ? 'Editar Vencimento' : 'Novo Vencimento'}</h3>
            <button type="button" onClick={() => setVncModalOpen(false)} className="rounded-md p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div><Label className="text-xs">Tipo do Alvará *</Label><Input value={vncForm.descricao} onChange={e => setVncForm(p => ({ ...p, descricao: e.target.value }))} className="text-xs mt-1" /></div>
            <div><Label className="text-xs">Vencimento</Label><Input type="date" value={vncForm.dataVencimento} onChange={e => setVncForm(p => ({ ...p, dataVencimento: e.target.value }))} className="text-xs mt-1" /></div>
            <div><Label className="text-xs">Observações</Label><textarea value={vncForm.observacoes} onChange={e => setVncForm(p => ({ ...p, observacoes: e.target.value }))} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs mt-1 resize-none" /></div>
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setVncModalOpen(false)}>Fechar</Button>
            <Button type="button" size="sm" onClick={saveVencimento} disabled={!vncForm.descricao}>Salvar</Button>
          </div>
        </div>
      </div>,
      document.body,
    )}

    {/* Modal Andamento */}
    {andModalOpen && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: "dialog-fade-in 200ms ease-out" }}>
        <div className="fixed inset-0 bg-black/60" onClick={() => setAndModalOpen(false)} />
        <div className="relative bg-background rounded-xl shadow-2xl border w-full max-w-lg" style={{ animation: "dialog-zoom-in 200ms ease-out" }}>
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="text-sm font-semibold">{andEditId ? 'Editar Andamento' : 'Novo Andamento'}</h3>
            <button type="button" onClick={() => setAndModalOpen(false)} className="rounded-md p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <Label className="text-xs">Tipo *</Label>
              <select value={andForm.tipo} onChange={e => setAndForm(p => ({ ...p, tipo: e.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs mt-1">
                {TIPOS_ANDAMENTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Título</Label><Input value={andForm.titulo} onChange={e => setAndForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Título do andamento" className="text-xs mt-1" /></div>
            <div><Label className="text-xs">Descrição</Label><textarea value={andForm.descricao} onChange={e => setAndForm(p => ({ ...p, descricao: e.target.value }))} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs mt-1 resize-none" placeholder="Descrição detalhada..." /></div>
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setAndModalOpen(false)}>Fechar</Button>
            <Button type="button" size="sm" onClick={saveAndamento} disabled={!andForm.tipo}>Salvar</Button>
          </div>
        </div>
      </div>,
      document.body,
    )}

    {certPdfOpen && certPdfData && typeof document !== 'undefined' && createPortal(
      <Dialog open={certPdfOpen} onOpenChange={setCertPdfOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeaderIcon icon={Shield} color="emerald"><DialogTitle>{certPdfLabel}</DialogTitle></DialogHeaderIcon>
          <DialogBody className="p-0"><iframe src={`data:application/pdf;base64,${certPdfData}`} className="w-full h-[70vh]" /></DialogBody>
          <DialogFooter><Button variant="outline" size="sm" type="button" onClick={() => setCertPdfOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>,
      document.body,
    )}

    {editSocioId && clienteId && (
      <EditSocioModal
        mode="edit"
        socioId={editSocioId}
        onClose={() => setEditSocioId(null)}
        onSaved={async () => {
          setEditSocioId(null)
          const data = await (trpc.socio as any).listByCliente.query({ clienteId }) as Socio[]
          setSocios(data)
        }}
      />
    )}

    {novoSocioOpen && clienteId && (
      <EditSocioModal
        mode="create"
        clienteId={clienteId}
        onClose={() => setNovoSocioOpen(false)}
        onSaved={async () => {
          setNovoSocioOpen(false)
          const data = await (trpc.socio as any).listByCliente.query({ clienteId }) as Socio[]
          setSocios(data)
        }}
      />
    )}

    {/* Progresso da importação OneClick (via Service Manager) */}
    {importSteps && (
      <ImportStatusModal
        open={importSteps !== null}
        done={importDone}
        steps={importSteps}
        onClose={() => { setImportSteps(null); setImportDone(false) }}
      />
    )}
    </>
  )
}

// ============================================================
// Modal de edição de sócio in-place (chamado da aba Legalização → Sócios)
// ============================================================

/**
 * Formata o valor de um campo de sócio pra exibir no histórico.
 * Tipo de sócio usa o label, datas viram dd/MM/yyyy, booleans Sim/Não,
 * null/'' viram '—'.
 */
function formatSocioFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'tipoSocio' && typeof value === 'string') return TIPO_SOCIO_LABELS[value] ?? value
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (['dataNascimento', 'dataEntrada', 'dataSaida'].includes(field) && typeof value === 'string') {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR')
  }
  return String(value)
}

/** Mapa de campo → rótulo amigável pra exibir mudanças no histórico */
const SOCIO_FIELD_LABELS: Record<string, string> = {
  nomeCompleto: 'Nome', cpf: 'CPF', rg: 'RG', orgaoEmissor: 'Órgão emissor',
  dataNascimento: 'Nascimento', nacionalidade: 'Nacionalidade', estadoCivil: 'Estado civil',
  profissao: 'Profissão', email: 'E-mail', telefone: 'Telefone', celular: 'Celular',
  cep: 'CEP', logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento',
  bairro: 'Bairro', cidade: 'Cidade', uf: 'UF',
  tipoSocio: 'Tipo de sócio', participacao: 'Participação (%)',
  valorQuotas: 'Valor quotas', dataEntrada: 'Data de entrada', dataSaida: 'Data de saída',
  assinaNaEmpresa: 'Assina pela empresa', responsavelLegal: 'Responsável legal',
  observacoes: 'Observações', clienteId: 'Cliente', isActive: 'Ativo',
}

interface SocioEventLog {
  id: string
  type: string
  version: number
  createdAt: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  user: { id: string; name: string } | null
}

interface SocioCompleto {
  id: string
  nomeCompleto: string
  cpf: string | null
  rg: string | null
  email: string | null
  telefone: string | null
  celular: string | null
  tipoSocio: string
  participacao: number | null
  valorQuotas: number | null
  dataEntrada: string | null
  dataSaida: string | null
  profissao: string | null
  nacionalidade: string | null
  estadoCivil: string | null
  assinaNaEmpresa: boolean
  responsavelLegal: boolean
  observacoes: string | null
  isActive: boolean
}

/**
 * Modal único pra criar/editar sócio in-place no contexto do cliente.
 *  - mode='edit' carrega via getById + getEvents e chama update
 *  - mode='create' começa com form vazio pré-vinculado ao clienteId e chama create
 */
function EditSocioModal(props: {
  mode: 'edit'
  socioId: string
  onClose: () => void
  onSaved: () => void
} | {
  mode: 'create'
  clienteId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { mode, onClose, onSaved } = props
  const emptySocio: SocioCompleto = {
    id: '', nomeCompleto: '', cpf: null, rg: null, email: null, telefone: null,
    celular: null, tipoSocio: 'SOCIO_QUOTISTA', participacao: null, valorQuotas: null,
    dataEntrada: null, dataSaida: null, profissao: null, nacionalidade: null,
    estadoCivil: null, assinaNaEmpresa: false, responsavelLegal: false,
    observacoes: null, isActive: true,
  }
  const [socio, setSocio] = useState<SocioCompleto | null>(mode === 'create' ? emptySocio : null)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [eventos, setEventos] = useState<SocioEventLog[]>([])
  const [historicoOpen, setHistoricoOpen] = useState(false)

  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    setLoading(true)
    // Carrega dados + histórico em paralelo
    Promise.all([
      (trpc.socio as any).getById.query({ id: props.socioId }) as Promise<SocioCompleto>,
      (trpc.socio as any).getEvents.query({ id: props.socioId }) as Promise<SocioEventLog[]>,
    ])
      .then(([s, evs]) => {
        if (cancelled) return
        setSocio(s)
        setEventos(evs)
      })
      .catch((e: Error) => { if (!cancelled) { alerts.error('Erro', e.message); onClose() } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mode === 'edit' ? props.socioId : null])

  function setField<K extends keyof SocioCompleto>(key: K, value: SocioCompleto[K]) {
    setSocio(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function salvar() {
    if (!socio) return
    if (!socio.nomeCompleto.trim()) {
      alerts.error('Erro', 'Nome é obrigatório.')
      return
    }
    if (!socio.cpf || socio.cpf.replace(/\D/g, '').length < 11) {
      alerts.error('Erro', 'CPF é obrigatório (11 dígitos).')
      return
    }
    setSaving(true)
    try {
      // Schema do create/update aceita os mesmos campos
      const data: Record<string, unknown> = {
        nomeCompleto: socio.nomeCompleto,
        cpf: socio.cpf ?? '',
        rg: socio.rg ?? '',
        email: socio.email ?? '',
        telefone: socio.telefone ?? '',
        celular: socio.celular ?? '',
        tipoSocio: socio.tipoSocio,
        participacao: socio.participacao,
        valorQuotas: socio.valorQuotas,
        dataEntrada: socio.dataEntrada ?? '',
        dataSaida: socio.dataSaida ?? '',
        profissao: socio.profissao ?? '',
        nacionalidade: socio.nacionalidade ?? '',
        estadoCivil: socio.estadoCivil ?? null,
        assinaNaEmpresa: socio.assinaNaEmpresa,
        responsavelLegal: socio.responsavelLegal,
        observacoes: socio.observacoes ?? '',
        isActive: socio.isActive,
      }
      if (mode === 'create') {
        await (trpc.socio as any).create.mutate({ ...data, clienteId: props.clienteId })
        alerts.success('Salvo', 'Sócio criado com sucesso.')
      } else {
        await (trpc.socio as any).update.mutate({ id: socio.id, data })
        alerts.success('Salvo', 'Sócio atualizado com sucesso.')
      }
      onSaved()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeaderIcon icon={mode === 'create' ? Plus : Pencil} color={mode === 'create' ? 'emerald' : 'sky'}>
          <DialogTitle>{mode === 'create' ? 'Novo Sócio' : 'Editar Sócio'}</DialogTitle>
        </DialogHeaderIcon>
        <DialogBody className="overflow-y-auto">
          {loading || !socio ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <div className="space-y-5">
              {/* Dados pessoais */}
              <div>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Dados pessoais</h4>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 space-y-1.5">
                    <Label htmlFor="nomeCompleto" className="text-[13px] font-semibold">Nome completo *</Label>
                    <Input id="nomeCompleto" className="h-9 text-sm" value={socio.nomeCompleto}
                      onChange={e => setField('nomeCompleto', e.target.value)} />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="cpf" className="text-[13px] font-semibold">CPF *</Label>
                    <Input id="cpf" className="h-9 text-sm" value={socio.cpf ?? ''}
                      onChange={e => setField('cpf', e.target.value)} />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="rg" className="text-[13px] font-semibold">RG</Label>
                    <Input id="rg" className="h-9 text-sm" value={socio.rg ?? ''}
                      onChange={e => setField('rg', e.target.value)} />
                  </div>
                  <div className="col-span-4 space-y-1.5">
                    <Label htmlFor="nacionalidade" className="text-[13px] font-semibold">Nacionalidade</Label>
                    <Input id="nacionalidade" className="h-9 text-sm" value={socio.nacionalidade ?? ''}
                      onChange={e => setField('nacionalidade', e.target.value)} />
                  </div>
                  <div className="col-span-4 space-y-1.5">
                    <Label htmlFor="estadoCivil" className="text-[13px] font-semibold">Estado civil</Label>
                    <Select value={socio.estadoCivil ?? '__none__'}
                      onValueChange={v => setField('estadoCivil', v === '__none__' ? null : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="SOLTEIRO">Solteiro(a)</SelectItem>
                        <SelectItem value="CASADO">Casado(a)</SelectItem>
                        <SelectItem value="DIVORCIADO">Divorciado(a)</SelectItem>
                        <SelectItem value="VIUVO">Viúvo(a)</SelectItem>
                        <SelectItem value="UNIAO_ESTAVEL">União estável</SelectItem>
                        <SelectItem value="SEPARADO">Separado(a)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 space-y-1.5">
                    <Label htmlFor="profissao" className="text-[13px] font-semibold">Profissão</Label>
                    <Input id="profissao" className="h-9 text-sm" value={socio.profissao ?? ''}
                      onChange={e => setField('profissao', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Contato */}
              <div>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contato</h4>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 space-y-1.5">
                    <Label htmlFor="email" className="text-[13px] font-semibold">E-mail</Label>
                    <Input id="email" type="email" className="h-9 text-sm" value={socio.email ?? ''}
                      onChange={e => setField('email', e.target.value)} />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="telefone" className="text-[13px] font-semibold">Telefone</Label>
                    <Input id="telefone" className="h-9 text-sm" value={socio.telefone ?? ''}
                      onChange={e => setField('telefone', e.target.value)} />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="celular" className="text-[13px] font-semibold">Celular</Label>
                    <Input id="celular" className="h-9 text-sm" value={socio.celular ?? ''}
                      onChange={e => setField('celular', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Societário */}
              <div>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Societário</h4>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="tipoSocio" className="text-[13px] font-semibold">Tipo *</Label>
                    <Select value={socio.tipoSocio} onValueChange={v => setField('tipoSocio', v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_SOCIO_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-1.5">
                    <Label htmlFor="participacao" className="text-[13px] font-semibold">Participação (%)</Label>
                    <Input id="participacao" type="number" step="0.01" min={0} max={100} className="h-9 text-sm"
                      value={socio.participacao ?? ''}
                      onChange={e => setField('participacao', e.target.value === '' ? null : Number(e.target.value))} />
                  </div>
                  <div className="col-span-3 space-y-1.5">
                    <Label htmlFor="valorQuotas" className="text-[13px] font-semibold">Valor quotas (R$)</Label>
                    <Input id="valorQuotas" type="number" step="0.01" min={0} className="h-9 text-sm"
                      value={socio.valorQuotas ?? ''}
                      onChange={e => setField('valorQuotas', e.target.value === '' ? null : Number(e.target.value))} />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="dataEntrada" className="text-[13px] font-semibold">Data de entrada</Label>
                    <Input id="dataEntrada" type="date" className="h-9 text-sm" value={socio.dataEntrada ? socio.dataEntrada.slice(0, 10) : ''}
                      onChange={e => setField('dataEntrada', e.target.value)} />
                  </div>
                  <div className="col-span-6 space-y-1.5">
                    <Label htmlFor="dataSaida" className="text-[13px] font-semibold">Data de saída</Label>
                    <Input id="dataSaida" type="date" className="h-9 text-sm" value={socio.dataSaida ? socio.dataSaida.slice(0, 10) : ''}
                      onChange={e => setField('dataSaida', e.target.value)} />
                  </div>
                  <div className="col-span-6 flex items-center gap-2 mt-1">
                    <input type="checkbox" id="assinaNaEmpresa" checked={socio.assinaNaEmpresa}
                      onChange={e => setField('assinaNaEmpresa', e.target.checked)} />
                    <Label htmlFor="assinaNaEmpresa" className="text-[13px] font-semibold cursor-pointer">Assina pela empresa</Label>
                  </div>
                  <div className="col-span-6 flex items-center gap-2 mt-1">
                    <input type="checkbox" id="responsavelLegal" checked={socio.responsavelLegal}
                      onChange={e => setField('responsavelLegal', e.target.checked)} />
                    <Label htmlFor="responsavelLegal" className="text-[13px] font-semibold cursor-pointer">Responsável legal</Label>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <Label htmlFor="observacoes" className="text-[13px] font-semibold">Observações</Label>
                <textarea id="observacoes" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={socio.observacoes ?? ''}
                  onChange={e => setField('observacoes', e.target.value)} />
              </div>

              {/* Histórico de alterações — só faz sentido no modo edição */}
              {mode === 'edit' && (
              <div>
                <button
                  type="button"
                  onClick={() => setHistoricoOpen(o => !o)}
                  className="flex items-center justify-between w-full text-left py-2 border-t border-border"
                >
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Histórico de alterações
                    <span className="text-muted-foreground/70 normal-case font-normal">({eventos.length})</span>
                  </h4>
                  <span className="text-[10px] text-muted-foreground">{historicoOpen ? '−' : '+'}</span>
                </button>
                {historicoOpen && (
                  eventos.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic py-2">Sem alterações registradas.</p>
                  ) : (
                    <ol className="space-y-3 mt-2 pl-2 border-l-2 border-border">
                      {eventos.map(ev => (
                        <li key={ev.id} className="relative pl-3">
                          <span className={cn(
                            'absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-card',
                            ev.type === 'created' ? 'bg-emerald-500'
                              : ev.type === 'deleted' ? 'bg-rose-500'
                              : 'bg-sky-500',
                          )} />
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold">
                              {ev.type === 'created' ? 'Sócio criado'
                                : ev.type === 'deleted' ? 'Sócio excluído'
                                : 'Sócio editado'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">v{ev.version}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(ev.createdAt).toLocaleString('pt-BR', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                              {ev.user?.name && ` · ${ev.user.name}`}
                            </span>
                          </div>
                          {ev.changes && Object.keys(ev.changes).length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-[11px]">
                              {Object.entries(ev.changes).map(([campo, diff]) => (
                                <li key={campo} className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{SOCIO_FIELD_LABELS[campo] ?? campo}:</span>{' '}
                                  <span className="line-through opacity-60">{formatSocioFieldValue(campo, diff.from)}</span>
                                  {' → '}
                                  <span className="text-foreground">{formatSocioFieldValue(campo, diff.to)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ol>
                  )
                )}
              </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="default" size="sm" type="button" onClick={salvar} disabled={saving || loading || !socio}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
    document.body,
  )
}
