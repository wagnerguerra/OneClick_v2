'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Loader2, Calendar, Clock,
  MapPin, Users, Trash2, Edit2, X, Video, Monitor, Building2,
  Repeat, Lock, History, Settings, Palette, Check, Download, DoorOpen,
  Bell, Mail, CheckSquare, Square, ListTodo, Search, Target, ArrowRight, Link2, ExternalLink,
  StickyNote, Paperclip, Send, Upload,
} from 'lucide-react'
import {
  Button, Input, Label, Card,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Checkbox, RichEditor,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl, getApiUrl } from '@/lib/api-url'
import { TarefaModal } from './_components/tarefa-modal'
import { alerts } from '@/lib/alerts'
import Swal from 'sweetalert2'
import { useSession } from '@/lib/auth-client'
import { useUserPermissions } from '@/hooks/use-user-permissions'

// ============================================================
// Tipos
// ============================================================

interface AgendaTipo {
  id: string
  nome: string
  cor: string
  corBorda: string
  corTexto: string
  bloqueiaAgenda: boolean
}

interface AgendaEvento {
  id: string
  titulo: string
  descricao: string | null
  data: string
  dataFim: string | null
  horaInicio: string | null
  horaFim: string | null
  diaInteiro: boolean
  local: string | null
  contato: string | null
  link: string | null
  presenca: string
  particular: boolean
  editavel: boolean
  sala: string | null
  salaId: string | null
  isTarefa: boolean
  recorrencia: string
  lote: string | null
  tipoId: string
  criadorId: string
  oportunidadeId: string | null
  tipo: { id: string; nome: string; cor: string; corBorda: string; corTexto: string }
  criador: { id: string; name: string }
  participantes: Array<{
    id: string
    usuarioId: string | null
    nomeAvulso: string | null
    usuario: { id: string; name: string; image?: string | null } | null
  }>
  // Presente apenas no retorno do getById (detalhe) quando o evento está vinculado a um card do CRM
  oportunidade?: {
    id: string
    titulo: string
    descricao: string | null
    valor: string | number | null
    razaoSocial: string | null
    cpfCnpj: string | null
    atividade: string | null
    origem: string | null
    motivoPerda: string | null
    previsaoFechamento: string | null
    createdAt: string | null
    updatedAt: string | null
    clienteId: string | null
    contatoNome: string | null
    contatoCargo: string | null
    contatoTelefone: string | null
    contatoEmail: string | null
    etapa: { id: string; nome: string; cor: string } | null
    responsavel: { id: string; name: string } | null
    cliente: { id: string; razaoSocial: string; documento: string } | null
    tags: Array<{ tag: { id: string; nome: string; cor: string } }>
    _count: { tarefas: number; mensagens: number; arquivos: number }
  } | null
}

interface OportunidadeBusca {
  id: string
  titulo: string
  razaoSocial: string | null
  etapa: { nome: string; cor: string } | null
}

// ============================================================
// Helpers
// ============================================================

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatarMinutosAntes(min: number): string {
  if (min < 60) return `${min} min antes`
  if (min < 1440) {
    const h = min / 60
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h antes`
  }
  const d = min / 1440
  if (d >= 7 && Number.isInteger(d / 7)) return `${d / 7} sem antes`
  return `${Number.isInteger(d) ? d : d.toFixed(1)} dia${d > 1 ? 's' : ''} antes`
}

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/**
 * Recebe uma hora "HH:MM" e devolve a hora + 1h, sempre garantindo que o
 * resultado fica maior que a entrada. Faz clamp em "23:59" se passar de 24h
 * (não vira pro dia seguinte). Usado pra ajustar o "Fim" automaticamente
 * quando o usuário muda o "Início" do evento.
 */
function somarUmaHora(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const total = h * 60 + m + 60
  if (total >= 24 * 60) return '23:59'
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

/**
 * Renderiza HTML formatado da lista de conflitos de agenda pra mostrar no
 * SweetAlert. Agrupa por tipo (participante / sala), cada item vira um
 * card com avatar/ícone, badge do tipo, nome, evento conflitante e horário.
 */
function renderConflitosHtml(
  conflitos: Array<{ tipo: string; nome: string; evento: string; horario: string; image?: string | null }>,
  bloqueado: boolean,
): string {
  const esc = (s: string) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const initials = (n: string) => (n || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()

  const avatar = (nome: string, color: string, imageUrl?: string | null) => {
    if (imageUrl) {
      return `<img src="${esc(resolveAssetUrl(imageUrl))}" alt="${esc(nome)}" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0" />`
    }
    return `<div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${esc(initials(nome))}</div>`
  }

  const iconBox = (icon: string, color: string) => `
    <div style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:${color}1a;color:${color};display:flex;align-items:center;justify-content:center;font-size:16px">${icon}</div>`

  const participantes = conflitos.filter(c => c.tipo === 'participante')
  const salas = conflitos.filter(c => c.tipo === 'sala')

  const card = (visual: string, color: string, badge: string, nome: string, evento: string, horario: string) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;text-align:left">
      ${visual}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">
          <span style="display:inline-block;padding:1px 7px;border-radius:999px;background:${color}1a;color:${color};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">${badge}</span>
          <span style="font-weight:600;color:#0f172a;font-size:13px">${esc(nome)}</span>
        </div>
        <div style="font-size:12px;color:#64748b">
          Em <span style="color:#0f172a;font-weight:500">"${esc(evento)}"</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;font-variant-numeric:tabular-nums">⏰ ${esc(horario)}</div>
      </div>
    </div>
  `

  const sections: string[] = []
  if (participantes.length > 0) {
    sections.push(`
      <div style="margin-top:8px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Participantes ocupados (${participantes.length})</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${participantes.map(c => card(avatar(c.nome, '#0ea5e9', c.image), '#0ea5e9', 'Participante', c.nome, c.evento, c.horario)).join('')}
        </div>
      </div>`)
  }
  if (salas.length > 0) {
    sections.push(`
      <div style="margin-top:8px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Salas ocupadas (${salas.length})</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${salas.map(c => card(iconBox('🚪', '#a855f7'), '#a855f7', 'Sala', c.nome, c.evento, c.horario)).join('')}
        </div>
      </div>`)
  }

  const intro = bloqueado
    ? '<p style="font-size:13px;color:#475569;margin:0 0 4px 0">As regras da empresa <strong style="color:#dc2626">bloqueiam o salvamento</strong> enquanto houver estes conflitos:</p>'
    : '<p style="font-size:13px;color:#475569;margin:0 0 4px 0">Detectamos sobreposições com outros eventos. Você pode salvar mesmo assim ou revisar:</p>'

  return `<div style="text-align:left">${intro}${sections.join('')}</div>`
}

function isToday(year: number, month: number, day: number) {
  const t = new Date()
  return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day
}

const PRESENCA_LABELS: Record<string, { label: string; icon: typeof Monitor }> = {
  PRESENCIAL: { label: 'Presencial', icon: Building2 },
  ONLINE: { label: 'Online', icon: Video },
  HIBRIDO: { label: 'Híbrido', icon: Monitor },
}

const RECORRENCIA_LABELS: Record<string, string> = {
  NENHUMA: 'Não repete',
  DIARIA: 'Diariamente',
  SEMANAL: 'Semanalmente',
  MENSAL: 'Mensalmente',
  ANUAL: 'Anualmente',
}

// ============================================================
// Componente principal
// ============================================================

export default function AgendaPage() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''

  // Salas cadastradas (cadastro em /agenda/configuracoes → aba Salas) e config
  // de regras de conflito — usadas pra select de sala no form e pra decidir o
  // comportamento da verificação de conflitos antes de salvar.
  type SalaCad = { id: string; nome: string; ativo: boolean }
  type ConflitoModo = 'DESLIGADO' | 'AVISAR' | 'BLOQUEAR'
  const [salasCadastradas, setSalasCadastradas] = useState<SalaCad[]>([])
  const [agendaConfig, setAgendaConfig] = useState<{ conflitoParticipante: ConflitoModo; conflitoSala: ConflitoModo }>({
    conflitoParticipante: 'AVISAR',
    conflitoSala: 'AVISAR',
  })

  // Sub-permissões do módulo agenda
  const { isMaster, permissions } = useUserPermissions()
  const agendaPerm = permissions.find(p => p.moduleSlug === 'agenda')
  const subPerms = (agendaPerm?.subPermissions ?? {}) as Record<string, boolean>
  const canManageTipos = isMaster || subPerms.manage_tipos === true
  const canImportLegado = isMaster || subPerms.import_legado === true
  const canManageRecorrencia = isMaster || subPerms.manage_recorrencia === true
  // `manage_participantes` controla a edição avançada de participantes (em eventos
  // de outros usuários, por exemplo). O campo no formulário de criação fica
  // sempre disponível — quem cria evento naturalmente convida participantes.
  const canManageParticipantes = isMaster || subPerms.manage_participantes === true
  const canDeleteEventos = isMaster || subPerms.delete_eventos === true
  const canManageConfig = isMaster || subPerms.manage_config === true
  // `editar_todos_eventos` permite editar/excluir eventos de QUALQUER usuário,
  // mesmo os marcados como editavel=false (importados do legado).
  const canEditarTodosEventos = isMaster || subPerms.editar_todos_eventos === true
  // Editar/excluir anotações e anexos de OUTROS usuários (o dono sempre pode no próprio).
  const canGerenciarAnotacoesAnexos = isMaster || subPerms.gerenciar_anotacoes_anexos === true
  // Alterar o tipo do evento direto na prévia (clicando no badge).
  const canAlterarTipo = isMaster || subPerms.alterar_tipo_evento === true
  // Acesso ao módulo CRM — gateia o botão "Abrir no CRM" no painel da oportunidade.
  const canViewCrm = isMaster || permissions.some(p => p.moduleSlug === 'crm' && p.canRead)
  const showSettingsDropdown = canManageTipos || canImportLegado || canManageConfig

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [eventos, setEventos] = useState<AgendaEvento[]>([])
  const [tipos, setTipos] = useState<AgendaTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string; image?: string | null }>>([])

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  // Multi-seleção de participantes — casa eventos que tenham QUALQUER um dos
  // participantes selecionados (ou cujo criador esteja entre eles).
  const [filtroParticipantes, setFiltroParticipantes] = useState<string[]>([])
  const [filtroPartOpen, setFiltroPartOpen] = useState(false)
  const [filtroPartQuery, setFiltroPartQuery] = useState('')
  const filtroPartRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!filtroPartOpen) return
    function onClickOutside(e: MouseEvent) {
      if (filtroPartRef.current && !filtroPartRef.current.contains(e.target as Node)) {
        setFiltroPartOpen(false)
        setFiltroPartQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [filtroPartOpen])
  const [filtroBusca, setFiltroBusca] = useState<string>('')
  // Filtro de sala de reunião: '' = todas · '__any__' = qualquer sala ocupada · <id> = sala específica
  const [filtroSala, setFiltroSala] = useState<string>('')

  // Modal de evento
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedEvento, setSelectedEvento] = useState<AgendaEvento | null>(null)
  const [saving, setSaving] = useState(false)

  // Combobox filtrável do campo "Tipo" do modal
  const [tipoSearchOpen, setTipoSearchOpen] = useState(false)
  const [tipoSearchQuery, setTipoSearchQuery] = useState('')
  const tipoSearchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!tipoSearchOpen) return
    function onClickOutside(e: MouseEvent) {
      if (tipoSearchRef.current && !tipoSearchRef.current.contains(e.target as Node)) {
        setTipoSearchOpen(false)
        setTipoSearchQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [tipoSearchOpen])

  // Combobox filtrável de "Participantes" do modal
  const [partSearchOpen, setPartSearchOpen] = useState(false)
  const [partSearchQuery, setPartSearchQuery] = useState('')
  const partSearchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!partSearchOpen) return
    function onClickOutside(e: MouseEvent) {
      if (partSearchRef.current && !partSearchRef.current.contains(e.target as Node)) {
        setPartSearchOpen(false)
        setPartSearchQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [partSearchOpen])

  // Formulário
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    data: formatDate(new Date()),
    dataFim: '',
    horaInicio: '09:00',
    horaFim: '10:00',
    diaInteiro: false,
    local: '',
    contato: '',
    link: '',
    presenca: 'PRESENCIAL',
    particular: false,
    editavel: true,
    sala: '',
    salaId: '' as string,
    garagem: false,
    vagas: undefined as number | undefined,
    equipamentos: '',
    isTarefa: false,
    tipoId: '',
    recorrencia: 'NENHUMA',
    recorrenciaVezes: 1,
    participanteIds: [] as string[],
    participantesAvulsos: [] as string[],
    // Opt-in de notificação por e-mail (padrão DESMARCADO) e vínculo opcional com card do CRM
    notificar: false,
    oportunidadeId: '' as string,
  })
  const [avulsoInput, setAvulsoInput] = useState('')

  // Vínculo com card do CRM (Item 4). Guarda a oportunidade selecionada pra
  // exibir título/cliente nos chips do form sem precisar refetch.
  const [oportunidadeVinc, setOportunidadeVinc] = useState<OportunidadeBusca | null>(null)
  const [opBuscaOpen, setOpBuscaOpen] = useState(false)
  const [opBuscaQuery, setOpBuscaQuery] = useState('')
  const [opBuscaResults, setOpBuscaResults] = useState<OportunidadeBusca[]>([])
  const [opBuscaLoading, setOpBuscaLoading] = useState(false)
  const opBuscaRef = useRef<HTMLDivElement>(null)

  // ── Anotações & Anexos do evento (abas) ──────────────────────────────────
  // Gravam no evento OU na oportunidade vinculada (merge) — backend decide.
  type EventoAnotacao = { id: string; texto: string; user: { id: string; name: string; image: string | null } | null; createdAt: string }
  type EventoAnexo = { id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; user: { id: string; name: string; image: string | null } | null; createdAt: string }
  const [eventoAnotacoes, setEventoAnotacoes] = useState<EventoAnotacao[]>([])
  const [eventoAnexos, setEventoAnexos] = useState<EventoAnexo[]>([])
  const [eventoVinculado, setEventoVinculado] = useState(false)
  const [novaAnotacao, setNovaAnotacao] = useState('')
  const [uploadingAnexo, setUploadingAnexo] = useState(false)
  const anexoInputRef = useRef<HTMLInputElement>(null)
  // Edição inline de anotação (id em edição + texto temporário).
  const [editandoAnotacaoId, setEditandoAnotacaoId] = useState<string | null>(null)
  const [editandoAnotacaoTexto, setEditandoAnotacaoTexto] = useState('')
  // Aba ativa na PRÉVIA (modo view): Detalhes / Anotações / Anexos / Histórico.
  const [viewTab, setViewTab] = useState<'detalhes' | 'anotacoes' | 'anexos' | 'historico'>('detalhes')

  const carregarAnotacoesAnexos = useCallback(async (eventoId: string) => {
    try {
      const [a, x] = await Promise.all([
        (trpc.agenda as any).listAnotacoes.query({ eventoId }),
        (trpc.agenda as any).listAnexos.query({ eventoId }),
      ])
      setEventoAnotacoes(a.anotacoes ?? [])
      setEventoAnexos(x.anexos ?? [])
      setEventoVinculado(!!a.vinculado)
    } catch { /* silencioso */ }
  }, [])

  async function addAnotacaoEvento() {
    const id = selectedEvento?.id
    if (!id || !novaAnotacao.trim()) return
    try {
      await (trpc.agenda as any).addAnotacao.mutate({ eventoId: id, texto: novaAnotacao.trim() })
      setNovaAnotacao('')
      await carregarAnotacoesAnexos(id)
    } catch (e) { alert((e as Error).message) }
  }
  async function removeAnotacaoEvento(anotacaoId: string) {
    const id = selectedEvento?.id
    if (!id) return
    try {
      await (trpc.agenda as any).deleteAnotacao.mutate({ eventoId: id, anotacaoId })
      await carregarAnotacoesAnexos(id)
    } catch (e) { alert((e as Error).message) }
  }
  function iniciarEdicaoAnotacao(anotacaoId: string, texto: string) {
    setEditandoAnotacaoId(anotacaoId)
    setEditandoAnotacaoTexto(texto)
  }
  async function salvarEdicaoAnotacao() {
    const id = selectedEvento?.id
    if (!id || !editandoAnotacaoId || !editandoAnotacaoTexto.trim()) return
    try {
      await (trpc.agenda as any).editarAnotacao.mutate({ eventoId: id, anotacaoId: editandoAnotacaoId, texto: editandoAnotacaoTexto.trim() })
      setEditandoAnotacaoId(null); setEditandoAnotacaoTexto('')
      await carregarAnotacoesAnexos(id)
    } catch (e) { alert((e as Error).message) }
  }
  // Pode mexer (editar/excluir) num registro: dono OU master/sub-perm.
  const podeGerenciarRegistro = (recordUserId: string | null | undefined) =>
    (!!recordUserId && recordUserId === currentUserId) || canGerenciarAnotacoesAnexos

  // Troca o tipo do evento pela prévia (gate no backend: master/sub-perm).
  async function alterarTipoEvento(tipoId: string) {
    const id = selectedEvento?.id
    if (!id || !tipoId) return
    try {
      await (trpc.agenda as any).alterarTipo.mutate({ eventoId: id, tipoId })
      // Atualiza o evento visto (badge/cores), o histórico e o calendário.
      const [full] = await Promise.all([
        trpc.agenda.getById.query({ id }) as Promise<AgendaEvento>,
        trpc.agenda.listLogs.query({ eventoId: id }).then((r: unknown) => setEventLogs(r as typeof eventLogs)).catch(() => {}),
        fetchEventos(),
      ])
      setSelectedEvento(prev => (prev && prev.id === full.id ? { ...prev, ...full } : prev))
    } catch (e) { alert((e as Error).message) }
  }

  // Render compartilhado entre a aba (modo edição) e a prévia (modo view).
  const renderAnotacoesSection = () => (
    <>
      {eventoVinculado && (
        <div className="flex items-start gap-2 rounded-md border border-sky-200 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2 text-[11px] text-sky-700 dark:text-sky-300">
          <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Este evento está vinculado a um card do CRM — as anotações são compartilhadas com a oportunidade.</span>
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Escreva uma anotação..."
          value={novaAnotacao}
          onChange={e => setNovaAnotacao(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addAnotacaoEvento() } }}
          className="h-9 text-sm flex-1"
        />
        <Button size="sm" className="bg-sky-500 hover:bg-sky-600 text-white" onClick={addAnotacaoEvento} disabled={!novaAnotacao.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {eventoAnotacoes.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma anotação</p>
      )}
      <div className="space-y-2">
        {eventoAnotacoes.map(a => {
          const podeMexer = podeGerenciarRegistro(a.userId)
          const editando = editandoAnotacaoId === a.id
          return (
            <div key={a.id} className="group rounded-md bg-muted/40 p-3">
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {a.user?.image
                    ? <img src={resolveAssetUrl(a.user.image)} alt={a.user.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
                    : <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">{(a.user?.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</span>}
                  <span className="text-xs font-semibold truncate">{a.user?.name || 'Sistema'}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                  {podeMexer && !editando && (
                    <>
                      <button onClick={() => iniciarEdicaoAnotacao(a.id, a.texto)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-sky-600" title="Editar anotação">
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeAnotacaoEvento(a.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" title="Excluir anotação">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editando ? (
                <div className="space-y-1.5">
                  <textarea
                    value={editandoAnotacaoTexto}
                    onChange={e => setEditandoAnotacaoTexto(e.target.value)}
                    rows={2}
                    className="w-full text-sm rounded-md border border-border bg-background px-2 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditandoAnotacaoId(null); setEditandoAnotacaoTexto('') }}>Cancelar</Button>
                    <Button size="sm" className="h-7 text-xs bg-sky-500 hover:bg-sky-600 text-white" onClick={salvarEdicaoAnotacao} disabled={!editandoAnotacaoTexto.trim()}>Salvar</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">{a.texto}</p>
              )}
            </div>
          )
        })}
      </div>
    </>
  )

  const renderAnexosSection = () => (
    <>
      {eventoVinculado && (
        <div className="flex items-start gap-2 rounded-md border border-sky-200 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2 text-[11px] text-sky-700 dark:text-sky-300">
          <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Este evento está vinculado a um card do CRM — os anexos são compartilhados com a oportunidade.</span>
        </div>
      )}
      <input ref={anexoInputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) uploadAnexosEvento(e.target.files); e.target.value = '' }} />
      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => anexoInputRef.current?.click()} disabled={uploadingAnexo}>
        {uploadingAnexo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploadingAnexo ? 'Enviando...' : 'Anexar arquivo'}
      </Button>
      {eventoAnexos.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhum anexo</p>
      )}
      <div className="space-y-1.5">
        {eventoAnexos.map(x => {
          const podeMexer = podeGerenciarRegistro(x.userId)
          return (
            <div key={x.id} className="group flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
              <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={resolveAssetUrl(x.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-sm truncate flex-1 hover:underline" title={x.fileName}>
                {x.fileName}
              </a>
              {x.fileSize != null && <span className="text-[10px] text-muted-foreground shrink-0">{(x.fileSize / 1024).toFixed(0)} KB</span>}
              {podeMexer && (
                <button onClick={() => removeAnexoEvento(x.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0" title="Remover anexo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
  async function uploadAnexosEvento(files: FileList | File[]) {
    const id = selectedEvento?.id
    if (!id) return
    setUploadingAnexo(true)
    try {
      const apiUrl = getApiUrl()
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
        if (!res.ok) continue
        const data = await res.json()
        const fileUrl = data.url || `${apiUrl}/api/upload/${data.filename}`
        await (trpc.agenda as any).addAnexo.mutate({
          eventoId: id, fileName: file.name, fileUrl, fileSize: file.size, mimeType: file.type || undefined,
        })
      }
      await carregarAnotacoesAnexos(id)
    } catch (e) { alert((e as Error).message) }
    finally { setUploadingAnexo(false) }
  }
  async function removeAnexoEvento(anexoId: string) {
    const id = selectedEvento?.id
    if (!id) return
    await (trpc.agenda as any).removeAnexo.mutate({ eventoId: id, anexoId }).catch(() => {})
    await carregarAnotacoesAnexos(id)
  }

  useEffect(() => {
    if (!opBuscaOpen) return
    function onClickOutside(e: MouseEvent) {
      if (opBuscaRef.current && !opBuscaRef.current.contains(e.target as Node)) {
        setOpBuscaOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [opBuscaOpen])
  // Debounce da busca de oportunidades
  useEffect(() => {
    if (!opBuscaOpen) return
    let cancelled = false
    setOpBuscaLoading(true)
    const t = setTimeout(() => {
      ;(trpc.agenda as { buscarOportunidades: { query: (i: { search?: string }) => Promise<unknown> } })
        .buscarOportunidades.query({ search: opBuscaQuery.trim() || undefined })
        .then(r => { if (!cancelled) setOpBuscaResults(r as OportunidadeBusca[]) })
        .catch(() => { if (!cancelled) setOpBuscaResults([]) })
        .finally(() => { if (!cancelled) setOpBuscaLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [opBuscaOpen, opBuscaQuery])

  // === Tarefas (entidade separada de eventos) ===
  interface Tarefa {
    id: string
    titulo: string
    descricao: string | null
    prazo: string
    horaPrazo: string | null
    concluida: boolean
    concluidaEm: string | null
    prioridade: 'BAIXA' | 'NORMAL' | 'ALTA'
    criadorId: string
    criador?: { id: string; name: string; image: string | null }
    lembretes?: Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }>
  }
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [tarefaModalOpen, setTarefaModalOpen] = useState(false)
  const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null)
  const loadTarefas = useCallback(async () => {
    try {
      const r = await (trpc.agenda.tarefa as any).list.query({ apenasAbertas: false })
      setTarefas(r as Tarefa[])
    } catch { /* sem permissão ou offline */ }
  }, [])
  useEffect(() => { loadTarefas() }, [loadTarefas])
  async function toggleTarefaConcluida(t: Tarefa) {
    try {
      await (trpc.agenda.tarefa as any).toggleConcluida.mutate({ id: t.id, concluida: !t.concluida })
      loadTarefas()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Lembretes do evento (Google Calendar-like). Persistido em /agenda/lembrete.save
  // após criar/editar o evento.
  type LembreteForm = { canal: 'POPUP' | 'EMAIL'; minutosAntes: number }
  const [lembretesForm, setLembretesForm] = useState<LembreteForm[]>([])
  const [novoLembreteAntes, setNovoLembreteAntes] = useState<string>('10')
  const [novoLembreteCanal, setNovoLembreteCanal] = useState<'POPUP' | 'EMAIL'>('POPUP')

  // Logs do evento
  const [eventLogs, setEventLogs] = useState<Array<{
    id: string; acao: string; createdAt: string
    usuario: { id: string; name: string; image: string | null } | null
  }>>([])

  // Importação legado
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importProgress, setImportProgress] = useState<{
    status: string; total: number; current: number; importados: number; ignorados: number
    erros: number; participantes: number; currentEvento: string
    items: Array<{ nome: string; status: string; erro?: string }>
  } | null>(null)
  const importPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Modal de gerenciamento de tipos
  const [tiposModalOpen, setTiposModalOpen] = useState(false)
  const [tipoEditando, setTipoEditando] = useState<AgendaTipo | null>(null)
  const [tipoForm, setTipoForm] = useState({ nome: '', cor: '#3b82f6', corBorda: '#2563eb', corTexto: '#ffffff', bloqueiaAgenda: false })
  const [tipoSaving, setTipoSaving] = useState(false)

  // Drag and drop
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null)
  const [dropTargetDay, setDropTargetDay] = useState<string | null>(null)
  // Detecta tema dark pra ajustar cores dos cards de evento (#HLP0059).
  // Cores pastel claras do tipo do evento ficam destoantes no dark; usamos
  // versão com alpha 30% (sobre fundo escuro fica integrada) + texto claro.
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setIsDark(document.documentElement.classList.contains('dark'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Modal de detalhes do dia
  const [dayModalOpen, setDayModalOpen] = useState(false)
  const [dayModalDate, setDayModalDate] = useState<string>('')

  // ============================================================
  // Carregar dados
  // ============================================================

  const fetchEventos = useCallback(async () => {
    setLoading(true)
    try {
      // Range inclui os dias dos meses adjacentes visíveis na grade (4-6 semanas).
      // Assim a célula do dia 30/abril (visível na primeira linha da grade de maio)
      // também recebe os eventos do mês anterior.
      const firstWeekDay = getFirstDayOfMonth(year, month)        // 0=dom, 5=sex...
      const lastDayOfMonth = getDaysInMonth(year, month)
      const cellsCount = Math.ceil((firstWeekDay + lastDayOfMonth) / 7) * 7
      const gridStart = new Date(year, month, 1 - firstWeekDay)
      const gridEnd = new Date(year, month, cellsCount - firstWeekDay - 1)
      const dataInicio = formatDate(gridStart)
      const dataFim = formatDate(gridEnd)
      const result = await trpc.agenda.listEventos.query({ dataInicio, dataFim }) as AgendaEvento[]
      setEventos(result)
    } catch (e) {
      console.error('[Agenda] Erro ao buscar eventos:', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchEventos() }, [fetchEventos])

  // Pré-abre o modal de novo evento quando chegamos com `?novoEvento=1&data=...&...`
  // (uso típico: /agenda/disponibilidade redireciona pra cá ao clicar num slot livre)
  const router = useRouter()
  const searchParams = useSearchParams()
  const novoEventoFlag = searchParams.get('novoEvento')
  const verEventoId = searchParams.get('verEvento')
  useEffect(() => {
    if (novoEventoFlag !== '1') return
    if (tipos.length === 0) return  // espera os tipos carregarem pra pegar default
    const data = searchParams.get('data') || undefined
    const horaInicio = searchParams.get('horaInicio') || undefined
    const horaFim = searchParams.get('horaFim') || undefined
    const participantes = (searchParams.get('participantes') || '').split(',').filter(Boolean)
    openNewEvent(data, { horaInicio, horaFim, participanteIds: participantes })
    // Limpa os query params da URL pra não reabrir caso usuário recarregue
    router.replace('/agenda', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novoEventoFlag, tipos.length])

  // Abre o modal em modo visualização quando chegamos com `?verEvento=<id>`
  // (uso típico: /agenda/disponibilidade redireciona ao clicar num slot ocupado)
  useEffect(() => {
    if (!verEventoId) return
    let cancelled = false
    trpc.agenda.getById.query({ id: verEventoId })
      .then((ev: unknown) => {
        if (cancelled || !ev) return
        openViewEvent(ev as AgendaEvento)
        router.replace('/agenda', { scroll: false })
      })
      .catch(e => alerts.error('Erro', (e as Error).message))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verEventoId])

  useEffect(() => {
    trpc.agenda.listTipos.query()
      .then((r: unknown) => setTipos(r as AgendaTipo[]))
      .catch(() => {})
    // Carregar usuarios para o select de participantes
    trpc.agenda.listUsuarios.query()
      .then((r: unknown) => setUsuarios(r as Array<{ id: string; name: string; image?: string | null }>))
      .catch(() => {})
    // Salas cadastradas (só ativas) — usado no select do modal de evento
    trpc.agenda.sala.list.query({})
      .then((r: unknown) => setSalasCadastradas(r as SalaCad[]))
      .catch(() => {})
    // Config de regras de conflito — pra decidir como tratar conflitos no save
    trpc.agenda.config.get.query()
      .then((c: unknown) => {
        const cfg = c as { conflitoParticipante: ConflitoModo; conflitoSala: ConflitoModo }
        setAgendaConfig({ conflitoParticipante: cfg.conflitoParticipante, conflitoSala: cfg.conflitoSala })
      })
      .catch(() => {})
  }, [])

  // ============================================================
  // Navegação do calendário
  // ============================================================

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
  }

  // ============================================================
  // Eventos por dia
  // ============================================================

  // Eventos de hoje (para o painel lateral)
  const eventosHoje = useMemo(() => {
    const hoje = new Date()
    return eventos.filter(ev => {
      const d = new Date(ev.data)
      return d.getUTCDate() === hoje.getDate() && d.getUTCMonth() === hoje.getMonth() && d.getUTCFullYear() === hoje.getFullYear()
    }).sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''))
  }, [eventos])

  // Mapeia eventos por chave YYYY-MM-DD (não só dia número), assim dias de meses
  // adjacentes visíveis na grade (ex: 30/abril aparecendo na primeira linha de maio)
  // também recebem seus eventos próprios.
  // Tarefas por dia — agrupadas pela `prazo` (UTC date) pra renderizar no grid
  const tarefasPorDia = useMemo(() => {
    const map: Record<string, Tarefa[]> = {}
    for (const t of tarefas) {
      const d = new Date(t.prazo)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key]!.push(t)
    }
    // Ordena: não concluídas primeiro, depois por hora (se tiver), depois título
    for (const key of Object.keys(map)) {
      map[key]!.sort((a, b) => {
        if (a.concluida !== b.concluida) return a.concluida ? 1 : -1
        if (a.horaPrazo && b.horaPrazo) return a.horaPrazo.localeCompare(b.horaPrazo)
        if (a.horaPrazo) return -1
        if (b.horaPrazo) return 1
        return a.titulo.localeCompare(b.titulo)
      })
    }
    return map
  }, [tarefas])

  // Minhas tarefas pendentes (sidebar widget) — apenas do user logado, não concluídas
  const minhasTarefasPendentes = useMemo(() => {
    return tarefas
      .filter(t => !t.concluida && t.criadorId === currentUserId)
      .sort((a, b) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime())
  }, [tarefas, currentUserId])

  const eventosPorDia = useMemo(() => {
    const map: Record<string, AgendaEvento[]> = {}
    let filtered = filtroTipo ? eventos.filter(e => e.tipoId === filtroTipo) : eventos
    if (filtroParticipantes.length > 0) {
      // Casa se o evento tem QUALQUER um dos participantes selecionados,
      // ou se o criador é um deles.
      const sel = new Set(filtroParticipantes)
      filtered = filtered.filter(e =>
        sel.has(e.criadorId) ||
        e.participantes.some(p => p.usuarioId != null && sel.has(p.usuarioId))
      )
    }
    // Filtro de sala de reunião — "__any__" mostra eventos em qualquer sala
    // (= quando há sala ocupada); um id específico filtra só aquela sala
    // (casa pela FK salaId e, por compatibilidade, pelo nome em `sala`).
    if (filtroSala) {
      if (filtroSala === '__any__') {
        filtered = filtered.filter(e => !!(e.salaId || (e.sala && e.sala.trim())))
      } else {
        const salaNome = salasCadastradas.find(s => s.id === filtroSala)?.nome
        filtered = filtered.filter(e => e.salaId === filtroSala || (!!salaNome && e.sala === salaNome))
      }
    }
    const termo = filtroBusca
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    if (termo) {
      filtered = filtered.filter(e => {
        const texto = [
          e.titulo,
          e.descricao,
          e.local,
          e.sala,
          e.contato,
          e.tipo?.nome,
          e.criador?.name,
          ...e.participantes.map(p => p.usuario?.name ?? p.nomeAvulso),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
        return texto.includes(termo)
      })
    }
    for (const ev of filtered) {
      const startDate = new Date(ev.data)
      const endDate = ev.dataFim ? new Date(ev.dataFim) : startDate

      // Iterar por todos os dias que o evento cobre (em UTC pra bater com como o
      // backend retorna `data` — DateTime sem timezone do Postgres @db.Date).
      const cursor = new Date(startDate)
      while (cursor <= endDate) {
        const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
        if (!map[key]) map[key] = []
        if (!map[key]!.find(e => e.id === ev.id)) map[key]!.push(ev)
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }
    for (const key of Object.keys(map)) {
      map[key]!.sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''))
    }
    return map
  }, [eventos, filtroTipo, filtroParticipantes, filtroBusca, filtroSala, salasCadastradas])

  // ============================================================
  // Ações
  // ============================================================

  function openNewEvent(dateStr?: string, opts?: { horaInicio?: string; horaFim?: string; participanteIds?: string[] }) {
    setModalMode('create')
    setSelectedEvento(null)
    // Pré-seleciona o usuário logado como participante por padrão (#HLP0048).
    // Quem cria o evento naturalmente faz parte dele — economiza um clique.
    // Se vier via deep-link (opts.participanteIds), respeita o que foi
    // passado e adiciona o user atual se ainda não estiver na lista.
    const baseParticipantes = opts?.participanteIds ?? []
    const participanteIds = currentUserId && !baseParticipantes.includes(currentUserId)
      ? [currentUserId, ...baseParticipantes]
      : baseParticipantes
    setForm({
      titulo: '', descricao: '', data: dateStr || formatDate(new Date()), dataFim: '',
      horaInicio: opts?.horaInicio || '09:00',
      horaFim: opts?.horaFim || '10:00',
      diaInteiro: false,
      local: '', contato: '', link: '', presenca: 'PRESENCIAL',
      particular: false, editavel: true, sala: '', salaId: '', garagem: false, vagas: undefined,
      equipamentos: '', isTarefa: false,
      tipoId: tipos[0]?.id ?? '', recorrencia: 'NENHUMA', recorrenciaVezes: 2,
      participanteIds,
      participantesAvulsos: [],
      notificar: false,
      oportunidadeId: '',
    })
    setAvulsoInput('')
    setLembretesForm([])
    setOportunidadeVinc(null)
    // Evento novo ainda não existe — sem anotações/anexos até salvar.
    setEventoAnotacoes([]); setEventoAnexos([]); setEventoVinculado(false); setNovaAnotacao('')
    setModalOpen(true)
  }

  function openViewEvent(ev: AgendaEvento) {
    setModalMode('view')
    setSelectedEvento(ev)
    setEventLogs([])
    setModalOpen(true)
    // Anotações/anexos (do evento ou da oportunidade vinculada) — também na prévia.
    setViewTab('detalhes')
    setNovaAnotacao(''); setEditandoAnotacaoId(null); setEditandoAnotacaoTexto('')
    setEventoAnotacoes([]); setEventoAnexos([]); setEventoVinculado(false)
    void carregarAnotacoesAnexos(ev.id)
    // Carregar logs
    trpc.agenda.listLogs.query({ eventoId: ev.id })
      .then((r: unknown) => setEventLogs(r as typeof eventLogs))
      .catch(() => {})
    // Refetch completo do evento pra trazer a oportunidade vinculada (CRM) —
    // a listagem do calendário não inclui esse relacionamento.
    trpc.agenda.getById.query({ id: ev.id })
      .then((full: unknown) => {
        const f = full as AgendaEvento
        // Só atualiza se ainda estamos vendo o mesmo evento (evita corrida ao trocar rápido)
        setSelectedEvento(prev => (prev && prev.id === f.id ? { ...prev, ...f } : prev))
      })
      .catch(() => {})
  }

  function openEditEvent(ev: AgendaEvento) {
    setModalMode('edit')
    setSelectedEvento(ev)
    setForm({
      titulo: ev.titulo,
      descricao: ev.descricao ?? '',
      data: ev.data.slice(0, 10),
      dataFim: ev.dataFim ? ev.dataFim.slice(0, 10) : '',
      horaInicio: ev.horaInicio ?? '09:00',
      horaFim: ev.horaFim ?? '10:00',
      diaInteiro: ev.diaInteiro,
      local: ev.local ?? '',
      contato: ev.contato ?? '',
      link: ev.link ?? '',
      presenca: ev.presenca,
      particular: ev.particular,
      editavel: ev.editavel,
      sala: ev.sala ?? '',
      salaId: (ev as unknown as Record<string, unknown>).salaId as string ?? '',
      garagem: (ev as unknown as Record<string, unknown>).garagem as boolean ?? false,
      vagas: (ev as unknown as Record<string, unknown>).vagas as number | undefined,
      equipamentos: (ev as unknown as Record<string, unknown>).equipamentos as string ?? '',
      isTarefa: ev.isTarefa,
      tipoId: ev.tipoId,
      recorrencia: ev.recorrencia,
      recorrenciaVezes: 2,
      participanteIds: ev.participantes.filter(p => p.usuarioId).map(p => p.usuarioId!),
      participantesAvulsos: ev.participantes.filter(p => p.nomeAvulso).map(p => p.nomeAvulso!),
      notificar: false,
      oportunidadeId: ev.oportunidadeId ?? '',
    })
    setAvulsoInput('')
    setLembretesForm([])
    // Vínculo com card do CRM: usa a oportunidade já vinda do getById (se houver),
    // ou monta um chip mínimo a partir do oportunidadeId pra exibir enquanto edita.
    if (ev.oportunidade) {
      setOportunidadeVinc({
        id: ev.oportunidade.id,
        titulo: ev.oportunidade.titulo,
        razaoSocial: ev.oportunidade.razaoSocial,
        etapa: ev.oportunidade.etapa ? { nome: ev.oportunidade.etapa.nome, cor: ev.oportunidade.etapa.cor } : null,
      })
    } else if (ev.oportunidadeId) {
      setOportunidadeVinc({ id: ev.oportunidadeId, titulo: 'Card vinculado', razaoSocial: null, etapa: null })
    } else {
      setOportunidadeVinc(null)
    }
    trpc.agenda.lembrete.list.query({ eventoId: ev.id })
      .then((r: unknown) => {
        const arr = r as Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }>
        setLembretesForm(arr.map(l => ({ canal: l.canal, minutosAntes: l.minutosAntes })))
      })
      .catch(() => {})
    // Anotações/anexos do evento (do próprio evento ou da oportunidade vinculada).
    setNovaAnotacao('')
    void carregarAnotacoesAnexos(ev.id)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.titulo.trim()) { alerts.error('Erro', 'Título é obrigatório.'); return }
    if (!form.tipoId) { alerts.error('Erro', 'Selecione um tipo.'); return }
    // Bloqueio de data passada — só no create. Editar evento antigo continua permitido.
    if (modalMode === 'create' && form.data) {
      const hojeStr = formatDate(new Date())
      if (form.data < hojeStr) {
        alerts.error('Data inválida', 'Não é possível agendar eventos em dias que já passaram.')
        return
      }
    }
    setSaving(true)
    try {
      // Verificar conflitos conforme AgendaConfig — só roda se algum dos modos
      // (participante/sala) estiver em AVISAR ou BLOQUEAR, e se o evento tem horário.
      // Tipos não-bloqueadores (ex.: LEMBRETE CORPORATIVO) são pulados aqui:
      // não bloqueiam outros eventos nem disparam alerta pra o criador.
      const tipoSelecionado = tipos.find(t => t.id === form.tipoId)
      const tipoBloqueia = tipoSelecionado?.bloqueiaAgenda !== false
      const checaParticipante = tipoBloqueia && agendaConfig.conflitoParticipante !== 'DESLIGADO'
      const checaSala = tipoBloqueia && agendaConfig.conflitoSala !== 'DESLIGADO'
      if ((checaParticipante || checaSala) && !form.diaInteiro && form.horaInicio && form.horaFim) {
        const conflitos = await trpc.agenda.verificarConflitos.query({
          data: form.data,
          horaInicio: form.horaInicio,
          horaFim: form.horaFim,
          participanteIds: checaParticipante && form.participanteIds.length > 0 ? form.participanteIds : undefined,
          sala: checaSala ? (form.sala || undefined) : undefined,
          salaId: checaSala ? (form.salaId || undefined) : undefined,
          eventoIdExcluir: modalMode === 'edit' ? selectedEvento?.id : undefined,
          tipoId: form.tipoId || undefined,
        }) as Array<{ tipo: string; nome: string; evento: string; horario: string; image?: string | null }>

        // Filtra só os conflitos relevantes pra config atual (caso o backend retorne tudo)
        const relevantes = conflitos.filter(c =>
          (c.tipo === 'participante' && checaParticipante) ||
          (c.tipo === 'sala' && checaSala)
        )

        if (relevantes.length > 0) {
          const fatais = relevantes.filter(c =>
            (c.tipo === 'participante' && agendaConfig.conflitoParticipante === 'BLOQUEAR') ||
            (c.tipo === 'sala' && agendaConfig.conflitoSala === 'BLOQUEAR')
          )
          const html = renderConflitosHtml(relevantes, fatais.length > 0)

          if (fatais.length > 0) {
            // Modo BLOQUEAR — não permite salvar. Só OK pra fechar.
            await alerts.custom({
              icon: 'error',
              title: `${fatais.length} conflito${fatais.length > 1 ? 's' : ''} de agenda`,
              html,
              showCancelButton: false,
              confirmButtonText: 'Entendi',
              width: '32rem',
            })
            setSaving(false)
            return
          }
          // Modo AVISAR — pergunta se quer salvar mesmo assim
          const r = await alerts.custom({
            icon: 'warning',
            title: `${relevantes.length} conflito${relevantes.length > 1 ? 's' : ''} de agenda`,
            html,
            showCancelButton: true,
            cancelButtonText: 'Revisar',
            confirmButtonText: 'Salvar mesmo assim',
            width: '32rem',
          })
          if (!r.isConfirmed) { setSaving(false); return }
        }
      }

      if (modalMode === 'create') {
        const criado = await trpc.agenda.create.mutate({
          titulo: form.titulo,
          descricao: form.descricao || undefined,
          data: form.data,
          dataFim: form.dataFim || undefined,
          horaInicio: form.diaInteiro ? undefined : form.horaInicio,
          horaFim: form.diaInteiro ? undefined : form.horaFim,
          diaInteiro: form.diaInteiro,
          local: form.local || undefined,
          contato: form.contato || undefined,
          link: form.link || undefined,
          presenca: form.presenca as 'PRESENCIAL' | 'ONLINE' | 'HIBRIDO',
          particular: form.particular,
          editavel: form.editavel,
          sala: form.sala || undefined,
          salaId: form.salaId || undefined,
          isTarefa: form.isTarefa,
          tipoId: form.tipoId,
          oportunidadeId: form.oportunidadeId || null,
          recorrencia: form.recorrencia as 'NENHUMA' | 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'ANUAL',
          recorrenciaVezes: form.recorrencia !== 'NENHUMA' ? form.recorrenciaVezes : undefined,
          participanteIds: form.participanteIds,
          participantesAvulsos: form.participantesAvulsos,
          notificar: form.notificar,
        })
        // Salva lembretes (pode ser lista vazia — apaga tudo)
        const novoId = (criado as { id?: string } | undefined)?.id
          ?? (criado as Array<{ id: string }> | undefined)?.[0]?.id
        if (novoId) {
          await trpc.agenda.lembrete.save.mutate({ eventoId: novoId, lembretes: lembretesForm })
            .catch(e => console.error('[Agenda] save lembretes:', (e as Error).message))
        }
        alerts.success('Evento criado', '')
      } else if (modalMode === 'edit' && selectedEvento) {
        await trpc.agenda.update.mutate({
          id: selectedEvento.id,
          data: {
            titulo: form.titulo,
            descricao: form.descricao || undefined,
            data: form.data,
            dataFim: form.dataFim || undefined,
            horaInicio: form.diaInteiro ? undefined : form.horaInicio,
            horaFim: form.diaInteiro ? undefined : form.horaFim,
            diaInteiro: form.diaInteiro,
            local: form.local || undefined,
            contato: form.contato || undefined,
            link: form.link || undefined,
            presenca: form.presenca as 'PRESENCIAL' | 'ONLINE' | 'HIBRIDO',
            particular: form.particular,
            editavel: form.editavel,
            sala: form.sala || undefined,
            salaId: form.salaId || undefined,
            isTarefa: form.isTarefa,
            tipoId: form.tipoId,
            oportunidadeId: form.oportunidadeId || null,
            participanteIds: form.participanteIds,
            participantesAvulsos: form.participantesAvulsos,
            notificar: form.notificar,
          },
        })
        await trpc.agenda.lembrete.save.mutate({ eventoId: selectedEvento.id, lembretes: lembretesForm })
          .catch(e => console.error('[Agenda] save lembretes:', (e as Error).message))
        alerts.success('Evento atualizado', '')
      }
      setModalOpen(false)
      fetchEventos()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(ev: AgendaEvento) {
    const dataFmt = (() => { const d = new Date(ev.data); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` })()
    const horarioFmt = ev.diaInteiro ? 'Dia inteiro' : `${ev.horaInicio ?? ''} — ${ev.horaFim ?? ''}`

    const eventCard = `
      <div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:16px;border-left:4px solid ${ev.tipo.cor}">
        <p style="margin:0;font-weight:600;color:#111827">${ev.titulo}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280">${dataFmt} · ${horarioFmt}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#9ca3af">${ev.tipo.nome}${ev.recorrencia !== 'NENHUMA' ? ` · ${RECORRENCIA_LABELS[ev.recorrencia]}` : ''}</p>
        ${ev.participantes.length > 0 ? `<p style="margin:4px 0 0;font-size:11px;color:#9ca3af">👥 ${ev.participantes.length} participante(s)</p>` : ''}
      </div>
    `

    if (ev.lote && ev.recorrencia !== 'NENHUMA') {
      const result = await Swal.fire({
        iconHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
        title: 'Excluir evento recorrente',
        html: `<div style="text-align:left;font-size:14px">${eventCard}<p style="margin:0;color:#374151">O que deseja excluir?</p></div>`,
        input: 'checkbox',
        inputValue: 0,
        inputPlaceholder: 'Notificar participantes por e-mail',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '<span style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Apenas este</span>',
        denyButtonText: '<span style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> Toda a série</span>',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444',
        denyButtonColor: '#7f1d1d',
        cancelButtonColor: '#d1d5db',
        customClass: { icon: 'swal-icon-no-border', cancelButton: 'swal-cancel-dark' },
        reverseButtons: true,
      })
      if (result.isDismissed) return
      const notificar = !!result.value
      try {
        if (result.isDenied) {
          // Exclusão da série inteira — não há notificação granular (deleteLote não notifica).
          await trpc.agenda.deleteLote.mutate({ lote: ev.lote })
          alerts.success('Série excluída', 'Todos os eventos da série foram removidos.')
        } else {
          await trpc.agenda.delete.mutate({ id: ev.id, notificar })
          alerts.success('Evento excluído', '')
        }
        setModalOpen(false)
        setDayModalOpen(false)
        fetchEventos()
      } catch (e) { alerts.error('Erro', (e as Error).message) }
    } else {
      const result = await Swal.fire({
        iconHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
        title: 'Excluir evento',
        html: `<div style="text-align:left;font-size:14px">${eventCard}<p style="margin:0;color:#6b7280;font-size:13px">Esta ação não pode ser desfeita.</p></div>`,
        input: 'checkbox',
        inputValue: 0,
        inputPlaceholder: 'Notificar participantes por e-mail',
        showCancelButton: true,
        confirmButtonText: '<span style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg> Excluir</span>',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#d1d5db',
        customClass: { icon: 'swal-icon-no-border', cancelButton: 'swal-cancel-dark' },
        reverseButtons: true,
      })
      if (!result.isConfirmed) return
      const notificar = !!result.value
      try {
        await trpc.agenda.delete.mutate({ id: ev.id, notificar })
        alerts.success('Evento excluído', '')
        setModalOpen(false)
        setDayModalOpen(false)
        fetchEventos()
      } catch (e) { alerts.error('Erro', (e as Error).message) }
    }
  }

  function addAvulso() {
    const v = avulsoInput.trim()
    if (v && !form.participantesAvulsos.includes(v)) {
      setForm(prev => ({ ...prev, participantesAvulsos: [...prev.participantesAvulsos, v] }))
      setAvulsoInput('')
    }
  }

  // ============================================================
  // Drag and drop — mover evento para outra data
  // ============================================================

  async function handleDropEvent(eventoId: string, newDateStr: string) {
    try {
      await trpc.agenda.update.mutate({ id: eventoId, data: { data: newDateStr } })
      fetchEventos()
    } catch (e) {
      alerts.error('Erro ao mover', (e as Error).message)
    }
  }

  // ============================================================
  // Tipos — CRUD
  // ============================================================

  function openTipoNew() {
    setTipoEditando(null)
    setTipoForm({ nome: '', cor: '#3b82f6', corBorda: '#2563eb', corTexto: '#ffffff', bloqueiaAgenda: false })
    setTiposModalOpen(true)
  }

  function openTipoEdit(t: AgendaTipo) {
    setTipoEditando(t)
    setTipoForm({ nome: t.nome, cor: t.cor, corBorda: t.corBorda, corTexto: t.corTexto, bloqueiaAgenda: t.bloqueiaAgenda })
  }

  function cancelTipoEdit() {
    setTipoEditando(null)
    setTipoForm({ nome: '', cor: '#3b82f6', corBorda: '#2563eb', corTexto: '#ffffff', bloqueiaAgenda: false })
  }

  async function handleSaveTipo() {
    if (!tipoForm.nome.trim()) { alerts.error('Erro', 'Nome é obrigatório.'); return }
    setTipoSaving(true)
    try {
      if (tipoEditando) {
        await trpc.agenda.updateTipo.mutate({ id: tipoEditando.id, data: tipoForm })
        alerts.success('Tipo atualizado', '')
      } else {
        await trpc.agenda.createTipo.mutate(tipoForm)
        alerts.success('Tipo criado', '')
      }
      const r = await trpc.agenda.listTipos.query()
      setTipos(r as AgendaTipo[])
      cancelTipoEdit()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setTipoSaving(false) }
  }

  async function handleDeleteTipo(t: AgendaTipo) {
    const ok = await alerts.confirm({ title: 'Excluir tipo', text: `Excluir "${t.nome}"?`, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await trpc.agenda.deleteTipo.mutate({ id: t.id })
      const r = await trpc.agenda.listTipos.query()
      setTipos(r as AgendaTipo[])
      if (tipoEditando?.id === t.id) cancelTipoEdit()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ============================================================
  // Render: Calendário mensal
  // ============================================================

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7

  const dayModalEvents = useMemo(() => {
    if (!dayModalDate) return []
    return eventosPorDia[dayModalDate] ?? []
  }, [dayModalDate, eventosPorDia])

  return (
    <TooltipProvider delayDuration={250}>
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="administrativo" icon={Calendar} />
          <div>
            <h1>Agenda Corporativa</h1>
            <p className="text-sm text-muted-foreground">Gerencie eventos, reuniões e compromissos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          style={{ backgroundColor: 'var(--mod-administrativo, #38bdf8)' }}
          className="text-white gap-1.5"
          onClick={() => openNewEvent()}
        >
          <Plus className="h-4 w-4" /> Novo Evento
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => { setTarefaEditando(null); setTarefaModalOpen(true) }}
        >
          <CheckSquare className="h-4 w-4" /> Nova Tarefa
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/agenda/disponibilidade">
            <Users className="h-4 w-4" /> Verificar disponibilidade
          </Link>
        </Button>
        {showSettingsDropdown && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {canManageTipos && (
            <DropdownMenuItem onClick={openTipoNew} className="text-xs gap-2 cursor-pointer">
              <Palette className="h-3.5 w-3.5" />Gerenciar Tipos
            </DropdownMenuItem>
            )}
            {canImportLegado && (
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={async () => {
              const ok = await alerts.confirm({ title: 'Importar eventos do legado', text: 'Importar todos os eventos ativos do banco OneClick v1? Eventos já importados serão ignorados.', confirmText: 'Importar', icon: 'question' })
              if (!ok) return
              setImportModalOpen(true)
              setImportProgress(null)
              try {
                await trpc.agenda.importEventosLegado.mutate({ apenasAtivos: true })
                if (importPollRef.current) clearInterval(importPollRef.current)
                importPollRef.current = setInterval(async () => {
                  const p = await trpc.agenda.importProgress.query() as typeof importProgress
                  setImportProgress(p)
                  if (p?.status === 'done') {
                    if (importPollRef.current) { clearInterval(importPollRef.current); importPollRef.current = null }
                    fetchEventos()
                  }
                }, 1000)
                const p0 = await trpc.agenda.importProgress.query() as typeof importProgress
                setImportProgress(p0)
              } catch (e) { alerts.error('Erro', (e as Error).message) }
            }}>
              <Download className="h-3.5 w-3.5" />Importar Eventos Legado
            </DropdownMenuItem>
            )}
            {canManageConfig && (
            <DropdownMenuItem asChild className="text-xs gap-2 cursor-pointer">
              <Link href="/agenda/configuracoes">
                <Settings className="h-3.5 w-3.5" />Configurações da agenda
              </Link>
            </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        )}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* ============================================================ */}
        {/* PAINEL ESQUERDO — ações, filtros, eventos de hoje */}
        {/* ============================================================ */}
        <div className="hidden xl:block w-[280px] shrink-0 space-y-3">

          {/* Filtros */}
          <Card className="p-4 space-y-3">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros</h5>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filtroBusca}
                  onChange={e => setFiltroBusca(e.target.value)}
                  placeholder="Buscar eventos..."
                  className="h-8 pl-8 pr-7 text-xs"
                />
                {filtroBusca && (
                  <button
                    type="button"
                    onClick={() => setFiltroBusca('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Tipo de evento</Label>
              <Select value={filtroTipo || '__all__'} onValueChange={v => setFiltroTipo(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os tipos</SelectItem>
                  {tipos.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.cor }} />
                        {t.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Participantes</Label>
              {/* Chips dos participantes selecionados */}
              {filtroParticipantes.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {filtroParticipantes.map(id => {
                    const u = usuarios.find(x => x.id === id)
                    if (!u) return null
                    return (
                      <span key={id} className="flex items-center gap-1 text-[11px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 pl-1.5 pr-1 py-0.5 rounded-full">
                        <span className="truncate max-w-[120px]">{u.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiltroParticipantes(arr => arr.filter(x => x !== id))}
                          className="hover:text-red-500"
                          aria-label={`Remover ${u.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              {/* Combobox de busca pra adicionar participantes */}
              {(() => {
                const disponiveis = usuarios.filter(u => !filtroParticipantes.includes(u.id))
                const filtered = filtroPartQuery.trim()
                  ? disponiveis.filter(u => u.name.toLowerCase().includes(filtroPartQuery.toLowerCase()))
                  : disponiveis
                return (
                  <div ref={filtroPartRef} className="relative w-full">
                    <button
                      type="button"
                      onClick={() => setFiltroPartOpen(o => !o)}
                      className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <span className="text-muted-foreground truncate">
                        {filtroParticipantes.length === 0 ? 'Todos os participantes' : 'Adicionar participante...'}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                    </button>
                    {filtroPartOpen && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                        <div className="p-1.5 border-b bg-popover sticky top-0">
                          <Input
                            autoFocus
                            value={filtroPartQuery}
                            onChange={e => setFiltroPartQuery(e.target.value)}
                            placeholder="Buscar participante..."
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {filtered.length === 0 ? (
                            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                              {disponiveis.length === 0 ? 'Todos já selecionados' : 'Nenhum encontrado'}
                            </p>
                          ) : filtered.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setFiltroParticipantes(arr => [...arr, u.id])
                                setFiltroPartQuery('')
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                            >
                              {u.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={resolveAssetUrl(u.image)} alt={u.name} className="h-5 w-5 rounded-full object-cover shrink-0 border border-border" />
                              ) : (
                                <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 text-[8px] font-bold text-muted-foreground">
                                  {(u.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                </span>
                              )}
                              <span className="truncate">{u.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Sala de reunião</Label>
              <Select value={filtroSala || '__all__'} onValueChange={v => setFiltroSala(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as salas</SelectItem>
                  <SelectItem value="__any__">Qualquer sala (ocupadas)</SelectItem>
                  {salasCadastradas.filter(s => s.ativo).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(filtroTipo || filtroParticipantes.length > 0 || filtroBusca || filtroSala) && (
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { setFiltroTipo(''); setFiltroParticipantes([]); setFiltroBusca(''); setFiltroSala('') }}>
                <X className="h-3 w-3 mr-1" />Limpar filtros
              </Button>
            )}
          </Card>

          {/* Eventos de hoje */}
          <div>
            <h3 className="text-sm font-semibold">Eventos de Hoje</h3>
            <p className="text-xs text-muted-foreground mb-3">Não perca os próximos eventos</p>
            {eventosHoje.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum evento hoje</p>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto scrollbar-none pr-1">
                {(() => {
                  const hoje = new Date()
                  const dataHoje = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`
                  return eventosHoje.map(ev => {
                    const nomes = ev.participantes.map(p => p.usuario?.name ?? p.nomeAvulso).filter(Boolean) as string[]
                    return (
                      <Card
                        key={ev.id}
                        className="p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => openViewEvent(ev)}
                      >
                        {/* Linha superior: data (esq) | horário com ícone (dir) */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ev.tipo.corBorda || ev.tipo.cor }} />
                            <span className="text-[11px] text-muted-foreground">{dataHoje}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 shrink-0">
                            <Clock className="h-3 w-3" />
                            {ev.diaInteiro ? 'Dia inteiro' : `${ev.horaInicio} às ${ev.horaFim}`}
                          </div>
                        </div>
                        {/* Título do evento */}
                        <p className="text-xs font-semibold leading-snug line-clamp-2">{ev.titulo}</p>
                        {/* Participantes */}
                        {nomes.length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug line-clamp-2">
                            {nomes.join(', ')}
                          </p>
                        )}
                      </Card>
                    )
                  })
                })()}
              </div>
            )}
          </div>

          {/* Minhas tarefas pendentes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                Minhas tarefas
              </h3>
              <Link href="/agenda/tarefas" className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline">
                Ver todas
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {minhasTarefasPendentes.length === 0
                ? 'Nenhuma pendente — bom trabalho!'
                : `${minhasTarefasPendentes.length} pendente${minhasTarefasPendentes.length > 1 ? 's' : ''}`}
            </p>
            {minhasTarefasPendentes.length > 0 && (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto scrollbar-none pr-1">
                {minhasTarefasPendentes.slice(0, 10).map(t => {
                  const d = new Date(t.prazo)
                  const hoje = new Date()
                  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
                  const prazoDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
                  const diffDias = Math.floor((prazoDate.getTime() - inicioHoje.getTime()) / 86400000)
                  const corStatus = diffDias < 0 ? 'rose' : diffDias === 0 ? 'amber' : 'sky'
                  const labelStatus = diffDias < 0
                    ? `Atrasada ${Math.abs(diffDias)}d`
                    : diffDias === 0
                      ? 'Hoje'
                      : diffDias === 1
                        ? 'Amanhã'
                        : `${diffDias}d`
                  return (
                    <div
                      key={t.id}
                      className="group/tk flex items-start gap-2 p-2 rounded border border-border/60 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => { setTarefaEditando(t); setTarefaModalOpen(true) }}
                    >
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); toggleTarefaConcluida(t) }}
                        className="shrink-0 mt-0.5"
                        title="Concluir"
                      >
                        <Square className="h-3.5 w-3.5 text-muted-foreground group-hover/tk:text-sky-500" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate leading-tight">{t.titulo}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={cn(
                            'inline-block text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded',
                            corStatus === 'rose' && 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
                            corStatus === 'amber' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                            corStatus === 'sky' && 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
                          )}>
                            {labelStatus}
                          </span>
                          {t.horaPrazo && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">{t.horaPrazo}</span>
                          )}
                          {t.prioridade === 'ALTA' && (
                            <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-400">
                              Alta
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {minhasTarefasPendentes.length > 10 && (
                  <Link
                    href="/agenda/tarefas"
                    className="block text-center text-[11px] text-sky-600 dark:text-sky-400 hover:underline py-1"
                  >
                    +{minhasTarefasPendentes.length - 10} mais
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* CALENDÁRIO — painel principal */}
        {/* ============================================================ */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Botões mobile (visíveis apenas em telas menores) */}
          <div className="flex xl:hidden gap-2 mb-3">
            <Button size="sm" className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white" onClick={() => openNewEvent()}>
              <Plus className="h-4 w-4" />Novo Evento
            </Button>
            <Select value={filtroTipo || '__all__'} onValueChange={v => setFiltroTipo(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="flex flex-col">
            {/* Navegação mês — esq: ícone + "Agenda de <mês> de <ano>" · dir: Hoje + setas */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <h2 className="text-sm font-semibold truncate">
                  Agenda de {MESES[month]?.toLowerCase()} de {year}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm" className="h-8 text-xs px-3" onClick={goToday}>Hoje</Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>

            {/* Grid dos dias — sem scroll interno: o calendário cresce conforme as
                semanas e a rolagem fica por conta da página (scrollbar externa). */}
            <div>
            {/* Header dias da semana */}
            <div className="grid grid-cols-7 bg-background">
              {DIAS_SEMANA.map(d => (
                <div key={d} className="border-b border-r last:border-r-0 px-2 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${Math.ceil(totalCells / 7)}, minmax(140px, auto))` }}>
              {Array.from({ length: totalCells }, (_, i) => {
                // Data real da célula (pode ser do mês anterior, atual ou próximo)
                const cellDate = new Date(year, month, 1 - firstDay + i)
                const dayNum = cellDate.getDate()
                const isCurrentMonth = cellDate.getMonth() === month && cellDate.getFullYear() === year
                const dateStr = formatDate(cellDate)
                const dayEvents = eventosPorDia[dateStr] ?? []
                const today = isToday(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate())
                const isPast = cellDate < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

                return (
                  <div
                    key={i}
                    className={cn(
                      'border-b border-r last:border-r-0 p-1 transition-all cursor-pointer overflow-hidden flex flex-col min-h-0',
                      isCurrentMonth && !isPast && 'hover:bg-muted/20',
                      isCurrentMonth && isPast && 'bg-muted/30 dark:bg-muted/10',
                      today && 'bg-sky-50/50 dark:bg-sky-950/20',
                      dropTargetDay === dateStr && 'bg-sky-100 dark:bg-sky-900/30 ring-2 ring-inset ring-sky-400',
                    )}
                    // Listras diagonais discretas pra dias dos meses adjacentes — sinal
                    // visual de "fora do mês corrente". Mesmo padrão funciona em light/dark.
                    style={!isCurrentMonth ? {
                      backgroundImage: 'repeating-linear-gradient(135deg, transparent 0px, transparent 8px, rgba(0,0,0,0.05) 8px, rgba(0,0,0,0.05) 9px)',
                    } : undefined}
                    onClick={() => {
                      if (dayEvents.length > 0) {
                        setDayModalDate(dateStr)
                        setDayModalOpen(true)
                      } else if (!isPast) {
                        // Não permite criar evento em dias que já passaram
                        openNewEvent(dateStr)
                      }
                    }}
                    onDragOver={e => {
                      if (!draggingEventId) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDropTargetDay(dateStr)
                    }}
                    onDragLeave={() => setDropTargetDay(null)}
                    onDrop={e => {
                      e.preventDefault()
                      setDropTargetDay(null)
                      if (!draggingEventId) return
                      handleDropEvent(draggingEventId, dateStr)
                      setDraggingEventId(null)
                    }}
                  >
                    {(
                      <>
                        <div className={cn(
                          'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full shrink-0',
                          today && 'bg-sky-500 text-white',
                          isPast && !today && isCurrentMonth && 'text-muted-foreground/60',
                          !isCurrentMonth && 'text-muted-foreground/50',
                        )}>
                          {dayNum}
                        </div>
                        {/* Container dos eventos — sem flex-1 pra ficarem colados ao topo (sem gap antes do "+N mais") */}
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(ev => (
                            <Tooltip key={ev.id}>
                              <TooltipTrigger asChild>
                                <div
                                  draggable
                                  onDragStart={e => {
                                    e.stopPropagation()
                                    setDraggingEventId(ev.id)
                                    e.dataTransfer.effectAllowed = 'move'
                                    e.dataTransfer.setData('text/plain', ev.id)
                                  }}
                                  onDragEnd={() => { setDraggingEventId(null); setDropTargetDay(null) }}
                                  className={cn(
                                    'text-[11px] leading-snug px-2 py-1 rounded-[2px] truncate cursor-pointer active:cursor-grabbing transition-all duration-150 hover:brightness-110 hover:shadow-md hover:-translate-y-px',
                                    draggingEventId === ev.id && 'opacity-40',
                                  )}
                                  style={{
                                    // Eventos de meses adjacentes: bg apagado + sem borda lateral colorida
                                    // (sinal visual de "fora do mês corrente").
                                    // No dark mode, a `ev.tipo.cor` (pastel claro) destoaria sobre o
                                    // fundo escuro — usamos alpha 30% pra integrar visualmente + texto
                                    // claro fixo. Borda lateral mantém a saturação total.
                                    backgroundColor: !isCurrentMonth
                                      ? (isDark ? '#1e2028' : '#f3f4f6')
                                      : isPast
                                        ? (isDark ? '#252830' : '#e5e7eb')
                                        : (isDark ? `${ev.tipo.cor}33` : ev.tipo.cor),
                                    color: !isCurrentMonth
                                      ? (isDark ? '#6b7280' : '#9ca3af')
                                      : isPast
                                        ? (isDark ? '#9ca3af' : '#6b7280')
                                        : (isDark ? '#e5e7eb' : ev.tipo.corTexto),
                                    borderLeft: !isCurrentMonth ? 'none' : `3px solid ${ev.tipo.corBorda}`,
                                    paddingLeft: !isCurrentMonth ? '11px' : undefined,
                                  }}
                                  onClick={e => { e.stopPropagation(); openViewEvent(ev) }}
                                >
                                  {ev.horaInicio && <span className="font-semibold mr-1">{ev.horaInicio}</span>}
                                  {ev.particular && <Lock className="inline h-2.5 w-2.5 mr-0.5" />}
                                  {ev.titulo}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs p-0 overflow-hidden">
                                {(() => {
                                  const nomes = ev.participantes
                                    .map(p => p.usuario?.name ?? p.nomeAvulso)
                                    .filter(Boolean) as string[]
                                  // Limita exibição: até 4 nomes, resto vira "+N"
                                  const visiveis = nomes.slice(0, 4)
                                  const restante = nomes.length - visiveis.length
                                  const horaLinha = ev.diaInteiro
                                    ? 'Dia inteiro'
                                    : ev.horaInicio
                                      ? `${ev.horaInicio}${ev.horaFim ? ` – ${ev.horaFim}` : ''}`
                                      : null
                                  return (
                                    <>
                                      {/* Header — título + bolinha do tipo */}
                                      <div className="px-3 py-2 flex items-start gap-2 border-b border-background/20">
                                        <span
                                          className="h-2.5 w-2.5 rounded-full shrink-0 mt-1"
                                          style={{ backgroundColor: ev.tipo.corBorda || ev.tipo.cor }}
                                        />
                                        <div className="min-w-0">
                                          <p className="font-semibold leading-tight">{ev.titulo}</p>
                                          <p className="text-[10px] opacity-70 mt-0.5">{ev.tipo.nome}</p>
                                        </div>
                                      </div>

                                      {/* Corpo — meta info linha a linha com ícones */}
                                      <div className="px-3 py-2 space-y-1.5">
                                        {horaLinha && (
                                          <div className="flex items-center gap-1.5 text-[11px]">
                                            <Clock className="h-3 w-3 shrink-0 opacity-70" />
                                            <span>{horaLinha}</span>
                                          </div>
                                        )}
                                        {(ev.sala || ev.local) && (
                                          <div className="flex items-center gap-1.5 text-[11px]">
                                            <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                                            <span className="truncate">{ev.sala || ev.local}</span>
                                          </div>
                                        )}
                                        {nomes.length > 0 && (
                                          <div className="flex items-start gap-1.5 text-[11px]">
                                            <Users className="h-3 w-3 shrink-0 opacity-70 mt-0.5" />
                                            <span className="leading-snug">
                                              {visiveis.join(', ')}
                                              {restante > 0 && (
                                                <span className="opacity-70"> +{restante}</span>
                                              )}
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Rodapé — dica de uso */}
                                      <div className="px-3 py-1.5 border-t border-background/20 text-[10px] opacity-60 italic text-center">
                                        Clique pra abrir · arraste pra mover
                                      </div>
                                    </>
                                  )
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                        {/* "+N mais" fora do container com overflow — nunca é cortado */}
                        {dayEvents.length > 3 && (
                          <button
                            type="button"
                            className="shrink-0 mt-[10px] text-[10px] text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline pl-1.5 font-medium cursor-pointer w-full text-left leading-none"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDayModalDate(dateStr)
                              setDayModalOpen(true)
                            }}
                          >
                            +{dayEvents.length - 3} mais
                          </button>
                        )}
                        {/* TAREFAS — estilo Google Calendar: chip discreto com checkbox, sem slot horário */}
                        {(() => {
                          const dayTarefas = tarefasPorDia[dateStr] ?? []
                          if (dayTarefas.length === 0) return null
                          const visiveis = dayTarefas.slice(0, 2)
                          const ocultas = dayTarefas.length - visiveis.length
                          return (
                            <div className="mt-1 space-y-0.5">
                              {visiveis.map(t => (
                                <div
                                  key={t.id}
                                  onClick={e => { e.stopPropagation(); setTarefaEditando(t); setTarefaModalOpen(true) }}
                                  className={cn(
                                    'group/tk text-[11px] leading-snug flex items-center gap-1 rounded-[2px] px-1 py-0.5 cursor-pointer hover:bg-muted/60',
                                    t.concluida && 'opacity-60',
                                    !isCurrentMonth && 'opacity-50',
                                  )}
                                  title={`Tarefa: ${t.titulo}`}
                                >
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); toggleTarefaConcluida(t) }}
                                    className="shrink-0 inline-flex items-center justify-center"
                                    title={t.concluida ? 'Desmarcar' : 'Concluir tarefa'}
                                  >
                                    {t.concluida
                                      ? <CheckSquare className="h-3 w-3 text-emerald-600" />
                                      : <Square className="h-3 w-3 text-muted-foreground group-hover/tk:text-sky-500" />}
                                  </button>
                                  <span className={cn('truncate', t.concluida && 'line-through text-muted-foreground')}>
                                    {t.horaPrazo && <span className="text-[10px] text-muted-foreground mr-1 tabular-nums">{t.horaPrazo}</span>}
                                    {t.titulo}
                                  </span>
                                </div>
                              ))}
                              {ocultas > 0 && (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setDayModalDate(dateStr); setDayModalOpen(true) }}
                                  className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline pl-1 font-medium cursor-pointer w-full text-left leading-none"
                                >
                                  +{ocultas} tarefa{ocultas > 1 ? 's' : ''}
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modal resumo do dia */}
      {/* ============================================================ */}
      <Dialog open={dayModalOpen} onOpenChange={setDayModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Calendar} color="sky">
            <DialogTitle>
              {dayModalDate && (() => {
                const d = parseDate(dayModalDate)
                return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
              })()}
            </DialogTitle>
            <DialogDescription>{dayModalEvents.length} evento(s)</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3 max-h-[min(72vh,640px)] nice-scrollbar">
            {dayModalEvents.map(ev => {
              const parts = ev.participantes
                .map(p => ({ nome: (p.usuario?.name ?? p.nomeAvulso) ?? '', image: p.usuario?.image ?? null }))
                .filter(p => p.nome)
              const visiveis = parts.slice(0, 5)
              const restante = parts.length - visiveis.length
              const horario = ev.diaInteiro
                ? 'Dia inteiro'
                : ev.horaInicio
                  ? `${ev.horaInicio}${ev.horaFim ? ` — ${ev.horaFim}` : ''}`
                  : 'Sem horário'
              const localSala = ev.sala || ev.local
              const presencaDef = PRESENCA_LABELS[ev.presenca]
              const PresencaIcon = presencaDef?.icon ?? Building2
              return (
                <div
                  key={ev.id}
                  className="flex items-stretch gap-4 rounded-lg border border-border px-4 py-3.5 hover:bg-muted/30 cursor-pointer transition-colors"
                  // Mantém o modal do dia aberto por trás — ao fechar o detalhe
                  // do evento, o user volta pra lista do dia sem precisar reabrir.
                  onClick={() => openViewEvent(ev)}
                >
                  {/* Barra colorida do tipo */}
                  <div className="w-2 rounded-full shrink-0 self-stretch" style={{ backgroundColor: ev.tipo.corBorda || ev.tipo.cor }} />
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Título + badge do tipo */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-semibold leading-snug min-w-0 flex-1 truncate flex items-center gap-1.5">
                        {ev.particular && <Lock className="inline h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        {ev.titulo}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ev.oportunidadeId && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-1 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300"
                            title="Vinculado a um card do CRM"
                          >
                            <Link2 className="h-3 w-3" />CRM
                          </span>
                        )}
                        <span
                          className="text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap"
                          style={{
                            backgroundColor: isDark ? `${ev.tipo.cor}33` : ev.tipo.cor,
                            color: isDark ? '#e5e7eb' : ev.tipo.corTexto,
                          }}
                        >
                          {ev.tipo.nome}
                        </span>
                      </div>
                    </div>
                    {/* Meta: horário · presença · local/sala */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />{horario}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <PresencaIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />{presencaDef?.label ?? ev.presenca}
                      </span>
                      {localSala && (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="truncate max-w-[220px]">{localSala}</span>
                        </span>
                      )}
                    </div>
                    {/* Participantes — foto (usuário do sistema) ou iniciais + nome, com +N */}
                    {parts.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" />
                        {visiveis.map((p, i) => (
                          <span
                            key={`${ev.id}-p${i}`}
                            className="inline-flex items-center gap-1.5 text-[12px] bg-muted/60 border border-border/60 rounded-full pl-0.5 pr-2.5 py-0.5"
                            title={p.nome}
                          >
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolveAssetUrl(p.image)} alt={p.nome} className="h-6 w-6 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="h-6 w-6 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {p.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                              </span>
                            )}
                            <span className="truncate max-w-[140px]">{p.nome}</span>
                          </span>
                        ))}
                        {restante > 0 && (
                          <span className="text-[12px] text-muted-foreground font-medium">+{restante}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </DialogBody>
          {/* Footer só quando há ação possível — pra datas passadas, oculta inteiro */}
          {dayModalDate >= formatDate(new Date()) && (
            <DialogFooter>
              <Button size="sm" onClick={() => { setDayModalOpen(false); openNewEvent(dayModalDate) }} className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white">
                <Plus className="h-3.5 w-3.5" />Novo evento
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* Modal criar/editar/visualizar evento */}
      {/* ============================================================ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-7xl" hideClose={modalMode === 'view'}>
          <DialogHeaderIcon
            icon={modalMode === 'create' ? Plus : modalMode === 'edit' ? Edit2 : Calendar}
            color={modalMode === 'create' ? 'emerald' : 'sky'}
            bgImage={modalMode === 'view' ? '/materiais/bg_calendar.jpg' : undefined}
          >
            <DialogTitle>
              {modalMode === 'create'
                ? 'Novo evento'
                : modalMode === 'edit'
                  ? 'Editar evento'
                  : (selectedEvento?.titulo ?? 'Evento')}
            </DialogTitle>
            <DialogDescription>
              {modalMode === 'create'
                ? 'Crie um novo evento ou tarefa na agenda corporativa.'
                : modalMode === 'edit'
                  ? 'Atualize os dados do evento.'
                  : selectedEvento
                    ? `${selectedEvento.tipo.nome} · Criado por ${selectedEvento.criador.name}`
                    : ''}
            </DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="nice-scrollbar">
            {/* VIEW MODE */}
            {modalMode === 'view' && selectedEvento && (() => {
              const ev = selectedEvento
              const corTipo = ev.tipo.cor || '#0ea5e9'
              // corBorda é a cor mais saturada do tipo — mesma usada na borda
              // lateral do evento no calendário. Pills/labels do detalhe usam
              // essa cor pra consistência visual (pedido #HLP0046).
              const corBorda = ev.tipo.corBorda || corTipo
              const dataIni = new Date(ev.data)
              const dataFim = ev.dataFim ? new Date(ev.dataFim) : null
              const presencaDef = PRESENCA_LABELS[ev.presenca]
              const PresencaIcon = presencaDef?.icon ?? Building2
              const op = ev.oportunidade
              // Período / horário formatado
              const mesmoDia = !dataFim || dataFim.toISOString().slice(0, 10) === dataIni.toISOString().slice(0, 10)
              const dataIniStr = `${String(dataIni.getUTCDate()).padStart(2, '0')}/${String(dataIni.getUTCMonth() + 1).padStart(2, '0')}/${dataIni.getUTCFullYear()}`
              const dataFimStr = dataFim ? `${String(dataFim.getUTCDate()).padStart(2, '0')}/${String(dataFim.getUTCMonth() + 1).padStart(2, '0')}/${dataFim.getUTCFullYear()}` : ''
              const periodoData = mesmoDia ? dataIniStr : `${dataIniStr} → ${dataFimStr}`
              const periodoHora = ev.diaInteiro
                ? 'Dia inteiro'
                : (ev.horaInicio || ev.horaFim ? `${ev.horaInicio ?? ''} — ${ev.horaFim ?? ''}` : '')
              const fmtMoeda = (v: string | number) =>
                Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              const fmtData = (s: string) => {
                const d = new Date(s)
                return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
              }
              return (
                <div className="space-y-5">
                <div className={cn('grid gap-5', op ? 'grid-cols-1 lg:grid-cols-[1fr_340px]' : 'grid-cols-1')}>
                  {/* ============ COLUNA ESQUERDA (principal) ============ */}
                  <div className="min-w-0 space-y-4">
                    {/* Cabeçalho: título em destaque + badge do tipo + criado por */}
                    <div className="space-y-2 pb-3 border-b border-border">
                      <div className="flex items-start gap-2.5 flex-wrap">
                        {canAlterarTipo ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 mt-1 cursor-pointer transition hover:brightness-110 focus:outline-none"
                                style={{ backgroundColor: corBorda, color: '#fff' }}
                                title="Alterar tipo do evento"
                              >
                                {ev.tipo.nome}
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto nice-scrollbar">
                              {tipos.map(t => (
                                <DropdownMenuItem key={t.id} onClick={() => alterarTipoEvento(t.id)} className="gap-2 text-xs">
                                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.corBorda || t.cor }} />
                                  <span className="flex-1">{t.nome}</span>
                                  {t.id === ev.tipoId && <Check className="h-3.5 w-3.5 text-sky-500" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span
                            className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 mt-1"
                            style={{ backgroundColor: corBorda, color: '#fff' }}
                          >
                            {ev.tipo.nome}
                          </span>
                        )}
                        {ev.recorrencia !== 'NENHUMA' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 mt-1">
                            <Repeat className="h-2.5 w-2.5" />{RECORRENCIA_LABELS[ev.recorrencia]}
                          </span>
                        )}
                        {ev.isTarefa && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 mt-1">
                            Tarefa
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl font-bold text-foreground leading-tight break-words">{ev.titulo}</h2>
                      <p className="text-[12px] text-muted-foreground">
                        Criado por <span className="font-medium text-foreground/80">{ev.criador.name}</span>
                      </p>
                    </div>

                    {/* Abas da prévia: Detalhes / Anotações / Anexos */}
                    <div className="flex items-center gap-1 border-b border-border">
                      {[
                        { value: 'detalhes', label: 'Detalhes', icon: Calendar },
                        { value: 'anotacoes', label: `Anotações${eventoAnotacoes.length ? ` (${eventoAnotacoes.length})` : ''}`, icon: StickyNote },
                        { value: 'anexos', label: `Anexos${eventoAnexos.length ? ` (${eventoAnexos.length})` : ''}`, icon: Paperclip },
                        { value: 'historico', label: `Histórico${eventLogs.length ? ` (${eventLogs.length})` : ''}`, icon: History },
                      ].map(t => (
                        <button
                          key={t.value}
                          onClick={() => setViewTab(t.value as typeof viewTab)}
                          className={cn(
                            'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                            viewTab === t.value ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <t.icon className="h-3.5 w-3.5 shrink-0" />{t.label}
                        </button>
                      ))}
                    </div>

                    {/* ABA: DETALHES — tabela de campos + descrição do evento */}
                    {viewTab === 'detalhes' && (<div className="space-y-4 pt-3">
                    <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                      <FieldRow icon={Calendar} label="Período">
                        <span className="text-foreground">{periodoData}</span>
                        {periodoHora && (
                          <span className="ml-2 inline-flex items-center gap-1 text-foreground tabular-nums">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {periodoHora}
                          </span>
                        )}
                      </FieldRow>

                      <FieldRow icon={PresencaIcon} label="Presença">
                        <span className="text-foreground">{presencaDef?.label ?? ev.presenca}</span>
                      </FieldRow>

                      {(ev.local || ev.sala) && (
                        <FieldRow icon={MapPin} label="Local / Sala">
                          <span className="text-foreground">
                            {[ev.sala, ev.local].filter(Boolean).join(' · ')}
                          </span>
                        </FieldRow>
                      )}

                      {ev.contato && (
                        <FieldRow icon={Users} label="Contato">
                          <span className="text-foreground">{ev.contato}</span>
                        </FieldRow>
                      )}

                      {ev.link && (
                        <FieldRow icon={Video} label="Link">
                          <a
                            href={ev.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 hover:underline truncate max-w-full"
                          >
                            <span className="truncate">{ev.link}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        </FieldRow>
                      )}

                      {ev.participantes.length > 0 && (
                        <FieldRow icon={Users} label="Participantes" align="start">
                          <div className="flex flex-wrap gap-1.5">
                            {ev.participantes.slice(0, 8).map(p => {
                              const nome = p.usuario?.name ?? p.nomeAvulso ?? '?'
                              const iniciais = nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                              return (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full bg-muted/60 border border-border/60"
                                  title={nome}
                                >
                                  {p.usuario?.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={resolveAssetUrl(p.usuario.image)} alt={nome} className="h-5 w-5 rounded-full object-cover shrink-0" />
                                  ) : (
                                    <span className="h-5 w-5 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                      {iniciais}
                                    </span>
                                  )}
                                  <span className="text-[12px] font-medium truncate max-w-[160px] text-foreground">{nome}</span>
                                </span>
                              )
                            })}
                            {ev.participantes.length > 8 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-muted/60 border border-border/60 text-[12px] font-medium text-muted-foreground">
                                +{ev.participantes.length - 8}
                              </span>
                            )}
                          </div>
                        </FieldRow>
                      )}

                      {ev.particular && (
                        <FieldRow icon={Lock} label="Particular">
                          <span className="text-amber-700 dark:text-amber-300">Visível apenas para criador e participantes</span>
                        </FieldRow>
                      )}
                    </div>

                      {/* Descrição do evento — abaixo dos detalhes (não é aba) */}
                      {ev.descricao && (
                        <div className="rounded-lg border-l-4 bg-muted/30 px-4 py-3" style={{ borderLeftColor: corTipo }}>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Descrição</div>
                          <div
                            className="text-sm prose prose-sm dark:prose-invert max-w-none [&_*]:text-sm [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_a]:text-sky-600"
                            dangerouslySetInnerHTML={{ __html: ev.descricao }}
                          />
                        </div>
                      )}
                    </div>)}

                    {/* ABA: ANOTAÇÕES */}
                    {viewTab === 'anotacoes' && <div className="space-y-3 pt-3">{renderAnotacoesSection()}</div>}

                    {/* ABA: ANEXOS */}
                    {viewTab === 'anexos' && <div className="space-y-3 pt-3">{renderAnexosSection()}</div>}

                    {/* ABA: HISTÓRICO */}
                    {viewTab === 'historico' && (
                      <div className="pt-3">
                        {eventLogs.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-8 italic">Sem histórico</p>
                        ) : (
                          <div className="space-y-1.5">
                            {eventLogs.map(log => (
                              <div key={log.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                {log.usuario?.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={resolveAssetUrl(log.usuario.image)} alt={log.usuario.name} className="h-4 w-4 rounded-full object-cover shrink-0" />
                                ) : (
                                  <span className="h-4 w-4 rounded-full bg-muted text-muted-foreground text-[7px] font-bold flex items-center justify-center shrink-0">
                                    {(log.usuario?.name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                  </span>
                                )}
                                <span className="font-medium text-foreground/80 truncate">{log.usuario?.name ?? 'Sistema'}</span>
                                <span className="capitalize">{log.acao}</span>
                                <span className="ml-auto shrink-0">{new Date(log.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  {/* ============ COLUNA DIREITA (oportunidade do CRM) ============ */}
                  {op && (
                    <div className="lg:sticky lg:top-0 self-start">
                      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 dark:bg-violet-500/10 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-violet-500/20 flex items-center gap-2 bg-violet-500/10">
                          <Target className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                          <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                            Detalhes da oportunidade
                          </span>
                        </div>
                        <div className="px-4 py-3.5 space-y-3.5">
                          {/* Título + cliente */}
                          <div>
                            <p className="text-[15px] font-semibold text-foreground leading-tight break-words">{op.titulo}</p>
                            {(op.cliente?.razaoSocial || op.razaoSocial) && (
                              <p className="text-[12px] text-muted-foreground mt-1 break-words">
                                {op.cliente?.razaoSocial ?? op.razaoSocial}
                                {op.cliente?.documento && (
                                  <span className="text-muted-foreground/70"> · {op.cliente.documento}</span>
                                )}
                              </p>
                            )}
                          </div>

                          {/* Etapa + valor */}
                          <div className="flex flex-wrap items-center gap-2">
                            {op.etapa && (
                              <span
                                className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${op.etapa.cor}22`, color: op.etapa.cor }}
                              >
                                {op.etapa.nome}
                              </span>
                            )}
                            {op.valor != null && Number(op.valor) > 0 && (
                              <span className="inline-flex items-center text-[13px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {fmtMoeda(op.valor)}
                              </span>
                            )}
                          </div>

                          {/* Detalhes em mini-tabela */}
                          <div className="space-y-2 text-[12px]">
                            {op.responsavel && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">Responsável</span>
                                <span className="inline-flex items-center gap-1.5 text-foreground font-medium truncate">
                                  <span className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                    {op.responsavel.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                  </span>
                                  <span className="truncate">{op.responsavel.name}</span>
                                </span>
                              </div>
                            )}
                            {op.origem && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">Origem</span>
                                <span className="text-foreground font-medium truncate">{op.origem}</span>
                              </div>
                            )}
                            {op.previsaoFechamento && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">Previsão</span>
                                <span className="text-foreground font-medium tabular-nums">{fmtData(op.previsaoFechamento)}</span>
                              </div>
                            )}
                            {op.atividade && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">Atividade</span>
                                <span className="text-foreground font-medium truncate text-right">{op.atividade}</span>
                              </div>
                            )}
                            {op.contatoNome && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">Contato</span>
                                <span className="text-foreground font-medium truncate text-right">
                                  {op.contatoNome}{op.contatoCargo ? <span className="text-muted-foreground/70"> · {op.contatoCargo}</span> : null}
                                </span>
                              </div>
                            )}
                            {op.contatoTelefone && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">Telefone</span>
                                <a href={`tel:${op.contatoTelefone}`} className="text-foreground font-medium truncate hover:text-violet-600 dark:hover:text-violet-400">{op.contatoTelefone}</a>
                              </div>
                            )}
                            {op.contatoEmail && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">E-mail</span>
                                <a href={`mailto:${op.contatoEmail}`} className="text-foreground font-medium truncate hover:text-violet-600 dark:hover:text-violet-400">{op.contatoEmail}</a>
                              </div>
                            )}
                            {op.motivoPerda && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">Motivo da perda</span>
                                <span className="text-rose-600 dark:text-rose-400 font-medium truncate text-right">{op.motivoPerda}</span>
                              </div>
                            )}
                          </div>

                          {/* Tags */}
                          {op.tags && op.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {op.tags.map(({ tag }) => (
                                <span key={tag.id} className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${tag.cor}22`, color: tag.cor }}>
                                  {tag.nome}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Descrição da oportunidade */}
                          {op.descricao && op.descricao.trim() && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Descrição</span>
                              <div
                                className="rounded-md border border-border bg-background/40 p-2.5 max-h-44 overflow-y-auto nice-scrollbar prose prose-sm dark:prose-invert max-w-none break-words [&_*]:text-[12px] [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4 [&_li]:my-0.5 [&_a]:text-violet-600 dark:[&_a]:text-violet-400"
                                // eslint-disable-next-line react/no-danger
                                dangerouslySetInnerHTML={{ __html: op.descricao }}
                              />
                            </div>
                          )}

                          {/* Contadores do card */}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-t border-violet-500/15 pt-2.5">
                            <span className="tabular-nums">{op._count?.tarefas ?? 0} tarefa(s)</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="tabular-nums">{op._count?.mensagens ?? 0} msg</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="tabular-nums">{op._count?.arquivos ?? 0} arquivo(s)</span>
                          </div>

                          {/* Abrir no CRM — só pra quem tem acesso ao módulo CRM */}
                          {canViewCrm && (
                            <Link
                              href={`/crm?op=${op.id}`}
                              className="flex items-center justify-center gap-1.5 w-full text-[12px] font-semibold text-violet-700 dark:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
                            >
                              Abrir no CRM
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                </div>
              )
            })()}

            {/* CREATE / EDIT MODE */}
            {(modalMode === 'create' || modalMode === 'edit') && (() => {
              const tipoSelecionado = tipos.find(t => t.id === form.tipoId)
              const tipoNome = tipoSelecionado?.nome?.toLowerCase() ?? ''
              const isReuniao = tipoNome.includes('reunião interna') || tipoNome.includes('treinamento interno')
              const needsLink = form.presenca === 'ONLINE' || form.presenca === 'HIBRIDO'
              const needsGaragem = isReuniao && (form.presenca === 'PRESENCIAL' || form.presenca === 'HIBRIDO')

              // Resumo de recorrência estilo Google Calendar
              const recSummary = form.recorrencia !== 'NENHUMA' && form.recorrenciaVezes > 1 ? (() => {
                const d = form.data ? parseDate(form.data) : new Date()
                const diaSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()]
                switch (form.recorrencia) {
                  case 'DIARIA': return `Repete diariamente, ${form.recorrenciaVezes} vezes`
                  case 'SEMANAL': return `Repete toda ${diaSemana}, ${form.recorrenciaVezes} vezes`
                  case 'MENSAL': return `Repete todo dia ${d.getDate()}, ${form.recorrenciaVezes} meses`
                  case 'ANUAL': return `Repete anualmente em ${d.getDate()}/${d.getMonth() + 1}, ${form.recorrenciaVezes} vezes`
                  default: return ''
                }
              })() : ''

              return (
              <div className="flex gap-4">
                {/* COLUNA ESQUERDA — tipo, configurações, recorrência */}
                <div className="w-[220px] shrink-0 space-y-4 border-r pr-4">
                  {/* Tipo — combobox filtrável */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Tipo *</Label>
                    {(() => {
                      const selectedTipo = tipos.find(t => t.id === form.tipoId)
                      const filteredTipos = tipoSearchQuery.trim()
                        ? tipos.filter(t => t.nome.toLowerCase().includes(tipoSearchQuery.toLowerCase()))
                        : tipos
                      return (
                        <div ref={tipoSearchRef} className="relative w-full">
                          <button
                            type="button"
                            onClick={() => setTipoSearchOpen(o => !o)}
                            className={cn(
                              'flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-xs',
                              'focus:outline-none focus:ring-1 focus:ring-ring',
                            )}
                          >
                            {selectedTipo ? (
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedTipo.cor }} />
                                <span className="truncate">{selectedTipo.nome}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground truncate">Selecione</span>
                            )}
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                          </button>
                          {tipoSearchOpen && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                              <div className="p-1.5 border-b bg-popover sticky top-0">
                                <Input
                                  autoFocus
                                  value={tipoSearchQuery}
                                  onChange={e => setTipoSearchQuery(e.target.value)}
                                  placeholder="Buscar tipo..."
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="max-h-56 overflow-y-auto py-1">
                                {filteredTipos.length === 0 ? (
                                  <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum tipo encontrado</p>
                                ) : filteredTipos.map(t => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      setForm(f => ({ ...f, tipoId: t.id }))
                                      setTipoSearchOpen(false)
                                      setTipoSearchQuery('')
                                    }}
                                    className={cn(
                                      'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2',
                                      form.tipoId === t.id && 'bg-accent text-accent-foreground',
                                    )}
                                  >
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.cor }} />
                                    <span className="truncate">{t.nome}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Campos especiais: Reunião Interna / Treinamento */}
                  {isReuniao && (
                    <div className="space-y-3 rounded-lg border bg-sky-50/50 dark:bg-sky-950/10 p-3">
                      <p className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">Configurações da reunião</p>

                      {/* Modalidade */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Modalidade *</Label>
                        <div className="space-y-1">
                          {[
                            { v: 'PRESENCIAL', l: 'Presencial', i: Building2 },
                            { v: 'ONLINE', l: 'Online', i: Video },
                            { v: 'HIBRIDO', l: 'Híbrido', i: Monitor },
                          ].map(({ v, l, i: I }) => (
                            <label key={v} className={cn('flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-xs transition-colors', form.presenca === v ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'hover:bg-muted/50')}>
                              <input type="radio" name="presenca" checked={form.presenca === v} onChange={() => setForm(f => ({ ...f, presenca: v }))} className="accent-sky-500" />
                              <I className="h-3.5 w-3.5" />{l}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Sala — radios no mesmo estilo da Modalidade.
                          Lista vem de /agenda/configuracoes (aba Salas) + "Outro local". */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Sala *</Label>
                        <div className="space-y-1">
                          {salasCadastradas.filter(s => s.ativo).map(s => {
                            const active = form.salaId === s.id
                            return (
                              <label
                                key={s.id}
                                className={cn(
                                  'flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-xs transition-colors',
                                  active ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'hover:bg-muted/50',
                                )}
                              >
                                <input
                                  type="radio"
                                  name="sala-radio"
                                  checked={active}
                                  onChange={() => setForm(f => ({ ...f, salaId: s.id, sala: s.nome, local: '' }))}
                                  className="accent-sky-500"
                                />
                                <DoorOpen className="h-3.5 w-3.5" />{s.nome}
                              </label>
                            )
                          })}
                          {/* Opção "Outro local" — limpa salaId e habilita o campo "Local" na coluna da direita */}
                          <label
                            className={cn(
                              'flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-xs transition-colors',
                              form.sala === 'Outro' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'hover:bg-muted/50',
                            )}
                          >
                            <input
                              type="radio"
                              name="sala-radio"
                              checked={form.sala === 'Outro'}
                              onChange={() => setForm(f => ({ ...f, salaId: '', sala: 'Outro' }))}
                              className="accent-sky-500"
                            />
                            <MapPin className="h-3.5 w-3.5" />Outro local
                          </label>
                        </div>
                        {salasCadastradas.length === 0 && canManageConfig && (
                          <p className="text-[10px] text-muted-foreground">
                            Nenhuma sala cadastrada. <Link href="/agenda/configuracoes" className="text-sky-600 hover:underline">Cadastrar agora</Link>
                          </p>
                        )}
                      </div>

                      {/* Link (Online/Híbrido) */}
                      {needsLink && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Link da reunião *</Label>
                          <Input className="h-7 text-xs" placeholder="https://meet.google.com/..." value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} />
                        </div>
                      )}

                      {/* Garagem (Presencial/Híbrido) */}
                      {needsGaragem && (
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <Checkbox checked={form.garagem} onCheckedChange={v => setForm(f => ({ ...f, garagem: !!v }))} />
                          Reservar garagem
                        </label>
                      )}
                      {form.garagem && needsGaragem && (
                        <div className="space-y-1">
                          <Label className="text-[11px]">Vagas *</Label>
                          <Input type="number" min={1} className="h-7 text-xs w-20" value={form.vagas ?? ''} onChange={e => setForm(f => ({ ...f, vagas: Number(e.target.value) || undefined }))} />
                        </div>
                      )}

                      {/* Equipamentos */}
                      <label className="flex items-center gap-2 cursor-pointer text-xs">
                        <Checkbox checked={!!form.equipamentos} onCheckedChange={v => setForm(f => ({ ...f, equipamentos: v ? 'sim' : '' }))} />
                        Solicitar equipamentos
                      </label>
                    </div>
                  )}

                  {/* Modalidade (quando NÃO é reunião interna) */}
                  {!isReuniao && (
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Modalidade</Label>
                      <Select value={form.presenca} onValueChange={v => setForm(f => ({ ...f, presenca: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRESENCIAL">Presencial</SelectItem>
                          <SelectItem value="ONLINE">Online</SelectItem>
                          <SelectItem value="HIBRIDO">Híbrido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Recorrência (apenas criação) — opções contextualizadas pela data do evento,
                      estilo Google Calendar. Cada preset traz um default sensato de N° de
                      repetições; user pode ajustar livremente embaixo. */}
                  {modalMode === 'create' && canManageRecorrencia && (() => {
                    const d = form.data ? parseDate(form.data) : new Date()
                    const dia = d.getDate()
                    const mesNum = String(d.getMonth() + 1).padStart(2, '0')
                    const diaSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][d.getDay()]
                    const opcoes = [
                      { v: 'NENHUMA' as const, label: 'Não se repete',                              defaultVezes: 1 },
                      { v: 'DIARIA'  as const, label: 'Diariamente',                                defaultVezes: 14 },
                      { v: 'SEMANAL' as const, label: `Semanalmente, toda ${diaSemana}`,            defaultVezes: 12 },
                      { v: 'MENSAL'  as const, label: `Mensalmente no dia ${dia}`,                  defaultVezes: 12 },
                      { v: 'ANUAL'   as const, label: `Anualmente em ${String(dia).padStart(2, '0')}/${mesNum}`, defaultVezes: 5 },
                    ]
                    return (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Repetir</Label>
                      <Select
                        value={form.recorrencia}
                        onValueChange={v => {
                          const opt = opcoes.find(o => o.v === v)
                          setForm(f => ({
                            ...f,
                            recorrencia: v,
                            // Quando troca de frequência, recalcula o N° de repetições pro default
                            // da opção escolhida (se for NENHUMA, fica 1; senão usa o default).
                            recorrenciaVezes: opt ? opt.defaultVezes : f.recorrenciaVezes,
                          }))
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {opcoes.map(o => (
                            <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.recorrencia !== 'NENHUMA' && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Repete por</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number" min={2} max={52}
                              className="h-7 text-xs w-16"
                              value={form.recorrenciaVezes}
                              onChange={e => setForm(f => ({ ...f, recorrenciaVezes: Math.max(2, Number(e.target.value) || 2) }))}
                            />
                            <span className="text-[11px] text-muted-foreground">
                              {form.recorrencia === 'DIARIA'  && (form.recorrenciaVezes === 1 ? 'dia'    : 'dias')}
                              {form.recorrencia === 'SEMANAL' && (form.recorrenciaVezes === 1 ? 'semana' : 'semanas')}
                              {form.recorrencia === 'MENSAL'  && (form.recorrenciaVezes === 1 ? 'mês'    : 'meses')}
                              {form.recorrencia === 'ANUAL'   && (form.recorrenciaVezes === 1 ? 'ano'    : 'anos')}
                            </span>
                          </div>
                          {recSummary && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Repeat className="h-3 w-3 shrink-0" />{recSummary}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    )
                  })()}

                  {/* Opções extras */}
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold block mb-2.5">Opções</Label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <Checkbox checked={form.particular} onCheckedChange={v => setForm(f => ({ ...f, particular: !!v }))} />
                      <Lock className="h-3 w-3 text-muted-foreground" />Particular
                    </label>
                    {/* Notificar participantes por e-mail (opt-in — padrão DESMARCADO).
                        Movido da coluna direita pra cá; binding continua em form.notificar. */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label className="flex items-start gap-2 cursor-pointer text-xs">
                          <Checkbox
                            checked={form.notificar}
                            onCheckedChange={v => setForm(f => ({ ...f, notificar: !!v }))}
                            className="mt-0.5"
                          />
                          <span className="flex flex-col leading-tight">
                            <span className="flex items-center gap-1.5">
                              <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                              Notificar por e-mail
                            </span>
                            <span className="text-[10px] text-muted-foreground">Avisa os participantes</span>
                          </span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px] text-xs">
                        Envia um e-mail aos participantes avisando sobre {modalMode === 'create' ? 'a criação' : 'a alteração'} do evento.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* COLUNA DIREITA — dados principais, organizados em abas (Geral / Lembretes e CRM).
                    Apenas agrupamento visual: todos os campos seguem controlados pelo mesmo `form`/handlers.
                    O estado vive em `form`/`lembretesForm`/`oportunidadeVinc`, então o submit lê tudo
                    independentemente de qual aba está visível (Radix Tabs desmonta o conteúdo inativo,
                    mas como nada depende do DOM montado, não há perda de dados). */}
                <div className="flex-1 min-w-0">
                  {/* min-h fixa a altura do conteúdo pra o modal não encolher ao trocar de aba */}
                  {/* Abas verticais (pills laterais) — padrão de /configuracoes */}
                  <Tabs defaultValue="geral" orientation="vertical" className="w-full h-[62vh] flex gap-0 overflow-hidden">
                    <TabsList className="flex flex-col items-stretch justify-start gap-1 w-[180px] shrink-0 h-full bg-muted/40 border-b-0 border-r border-border rounded-none p-3 overflow-y-auto nice-scrollbar">
                      {[
                        { value: 'geral', label: 'Geral', icon: Calendar },
                        { value: 'lembretes', label: 'Lembretes', icon: Bell },
                        { value: 'vinculacoes', label: 'Vinculações', icon: Link2 },
                        { value: 'anotacoes', label: `Anotações${eventoAnotacoes.length > 0 ? ` (${eventoAnotacoes.length})` : ''}`, icon: StickyNote },
                        { value: 'anexos', label: `Anexos${eventoAnexos.length > 0 ? ` (${eventoAnexos.length})` : ''}`, icon: Paperclip },
                      ].map(t => (
                        <TabsTrigger
                          key={t.value}
                          value={t.value}
                          className="w-full justify-start gap-2 px-3 py-2 rounded text-xs font-medium text-muted-foreground transition-all hover:bg-white hover:text-foreground dark:hover:bg-white/5 data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
                        >
                          <t.icon className="h-3.5 w-3.5 shrink-0" />{t.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    <div className="flex-1 min-w-0 h-full flex flex-col pl-4 overflow-hidden">

                    {/* ABA: GERAL */}
                    <TabsContent value="geral" className="mt-0 flex-1 overflow-y-auto nice-scrollbar pr-1 space-y-3 focus-visible:outline-none">
                  {/* Título */}
                  <div className="space-y-1.5">
                    <Label>Título *</Label>
                    <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Nome do evento" />
                  </div>

                  {/* Data e horários */}
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Data início *</Label>
                      <Input
                        type="date"
                        className="h-9 text-sm"
                        value={form.data}
                        onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                        min={modalMode === 'create' ? formatDate(new Date()) : undefined}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Data término</Label>
                      <Input type="date" className="h-9 text-sm" value={form.dataFim} onChange={e => setForm(f => ({ ...f, dataFim: e.target.value }))} min={form.data} />
                    </div>
                    {!form.diaInteiro && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-[13px]">Início</Label>
                          <Input
                            type="time"
                            className="h-9 text-sm w-[110px]"
                            value={form.horaInicio}
                            onChange={e => {
                              const novoInicio = e.target.value
                              // Ao mudar o início, o fim acompanha automaticamente (+1h, clamp 23:59).
                              // Mantém o campo Fim editável manualmente depois — só recalcula no onChange do início.
                              setForm(f => ({
                                ...f,
                                horaInicio: novoInicio,
                                horaFim: novoInicio ? somarUmaHora(novoInicio) : f.horaFim,
                              }))
                            }}
                          />
                        </div>
                        <span className="pb-1.5 text-muted-foreground">—</span>
                        <div className="space-y-1.5">
                          <Label className="text-[13px]">Fim</Label>
                          <Input type="time" className="h-9 text-sm w-[110px]" value={form.horaFim} onChange={e => setForm(f => ({ ...f, horaFim: e.target.value }))} />
                        </div>
                      </>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer pb-1.5">
                      <Checkbox checked={form.diaInteiro} onCheckedChange={v => setForm(f => ({ ...f, diaInteiro: !!v }))} />
                      <span className="text-xs whitespace-nowrap">Dia inteiro</span>
                    </label>
                  </div>

                  {/* Local e Sala (quando NÃO é reunião interna) */}
                  {!isReuniao && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[13px]">Local</Label>
                        <Input className="h-9 text-sm" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} placeholder="Local do evento" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[13px]">Sala</Label>
                        <Input className="h-9 text-sm" value={form.sala} onChange={e => setForm(f => ({ ...f, sala: e.target.value }))} placeholder="Sala de reunião" />
                      </div>
                    </div>
                  )}

                  {/* Link (quando NÃO é reunião interna mas é online/híbrido) */}
                  {!isReuniao && needsLink && (
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Link da reunião</Label>
                      <Input className="h-9 text-sm" value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://meet.google.com/..." />
                    </div>
                  )}

                  {/* Local — só aparece quando "Outro local" foi escolhido na seção da sala */}
                  {form.sala === 'Outro' && (
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Local *</Label>
                      <Input className="h-9 text-sm" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} placeholder="Endereço, sala externa, etc." />
                    </div>
                  )}

                  {/* Contato */}
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Contato</Label>
                    <Input className="h-9 text-sm" value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} placeholder="Telefone ou e-mail de contato" />
                  </div>

                  {/* Participantes — sempre disponível ao criar/editar evento próprio */}
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Participantes</Label>
                    {(form.participanteIds.length > 0 || form.participantesAvulsos.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {form.participanteIds.map(id => {
                          const u = usuarios.find(u => u.id === id)
                          return u ? (
                            <span key={id} className="flex items-center gap-1.5 text-[11px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 pl-0.5 pr-2 py-0.5 rounded-full">
                              {u.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={resolveAssetUrl(u.image)} alt={u.name} className="h-5 w-5 rounded-full object-cover" />
                              ) : (
                                <span className="h-5 w-5 rounded-full bg-sky-200 dark:bg-sky-800 flex items-center justify-center text-[8px] font-bold">
                                  {(u.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                </span>
                              )}
                              {u.name}
                              <button type="button" onClick={() => setForm(f => ({ ...f, participanteIds: f.participanteIds.filter(p => p !== id) }))} className="hover:text-red-500"><X className="h-3 w-3" /></button>
                            </span>
                          ) : null
                        })}
                        {form.participantesAvulsos.map(nome => (
                          <span key={nome} className="flex items-center gap-1 text-[11px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                            {nome}
                            <button type="button" onClick={() => setForm(f => ({ ...f, participantesAvulsos: f.participantesAvulsos.filter(p => p !== nome) }))} className="hover:text-red-500"><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const usuariosDisponiveis = usuarios.filter(u => !form.participanteIds.includes(u.id))
                      const partFiltered = partSearchQuery.trim()
                        ? usuariosDisponiveis.filter(u => u.name.toLowerCase().includes(partSearchQuery.toLowerCase()))
                        : usuariosDisponiveis
                      return (
                        <div ref={partSearchRef} className="relative w-full">
                          <button
                            type="button"
                            onClick={() => setPartSearchOpen(o => !o)}
                            className={cn(
                              'flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-xs',
                              'focus:outline-none focus:ring-1 focus:ring-ring',
                            )}
                          >
                            <span className="text-muted-foreground truncate">Adicionar usuário...</span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                          </button>
                          {partSearchOpen && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                              <div className="p-1.5 border-b bg-popover sticky top-0">
                                <Input
                                  autoFocus
                                  value={partSearchQuery}
                                  onChange={e => setPartSearchQuery(e.target.value)}
                                  placeholder="Buscar usuário..."
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="max-h-56 overflow-y-auto py-1">
                                {partFiltered.length === 0 ? (
                                  <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                                    {usuariosDisponiveis.length === 0 ? 'Todos os usuários já estão adicionados' : 'Nenhum usuário encontrado'}
                                  </p>
                                ) : partFiltered.map(u => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => {
                                      setForm(f => ({ ...f, participanteIds: [...f.participanteIds, u.id] }))
                                      setPartSearchOpen(false)
                                      setPartSearchQuery('')
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                                  >
                                    {u.image ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={resolveAssetUrl(u.image)}
                                        alt={u.name}
                                        className="h-6 w-6 rounded-full object-cover shrink-0 border border-border"
                                      />
                                    ) : (
                                      <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <span className="text-[9px] font-bold text-muted-foreground">
                                          {(u.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                        </span>
                                      </span>
                                    )}
                                    <span className="truncate">{u.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    <div className="flex gap-2 mt-1">
                      <Input className="flex-1 h-8 text-xs" placeholder="Convidado externo..." value={avulsoInput} onChange={e => setAvulsoInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAvulso())} />
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addAvulso}>Adicionar</Button>
                    </div>
                  </div>

                  {/* Descrição */}
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Descrição</Label>
                    <RichEditor
                      value={form.descricao}
                      onChange={html => setForm(f => ({ ...f, descricao: html }))}
                      placeholder="Detalhes do evento..."
                      className="min-h-[100px]"
                    />
                  </div>
                    </TabsContent>

                    {/* ABA: LEMBRETES E CRM */}
                    {/* ABA: LEMBRETES */}
                    <TabsContent value="lembretes" className="mt-0 flex-1 overflow-y-auto nice-scrollbar pr-1 space-y-3 focus-visible:outline-none">
                  {/* Lembretes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      Lembretes
                      <span className="text-[10px] font-normal text-muted-foreground ml-auto">{lembretesForm.length}/10</span>
                    </Label>
                    {lembretesForm.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {lembretesForm.map((l, idx) => (
                          <span key={idx} className={cn(
                            'flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full',
                            l.canal === 'EMAIL'
                              ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                              : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
                          )}>
                            {l.canal === 'EMAIL' ? <Mail className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                            {formatarMinutosAntes(l.minutosAntes)}
                            <button
                              type="button"
                              onClick={() => setLembretesForm(arr => arr.filter((_, i) => i !== idx))}
                              className="hover:text-red-500"
                              aria-label="Remover lembrete"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Select value={novoLembreteAntes} onValueChange={setNovoLembreteAntes}>
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 minutos antes</SelectItem>
                          <SelectItem value="10">10 minutos antes</SelectItem>
                          <SelectItem value="15">15 minutos antes</SelectItem>
                          <SelectItem value="30">30 minutos antes</SelectItem>
                          <SelectItem value="60">1 hora antes</SelectItem>
                          <SelectItem value="120">2 horas antes</SelectItem>
                          <SelectItem value="1440">1 dia antes</SelectItem>
                          <SelectItem value="2880">2 dias antes</SelectItem>
                          <SelectItem value="10080">1 semana antes</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={novoLembreteCanal} onValueChange={v => setNovoLembreteCanal(v as 'POPUP' | 'EMAIL')}>
                        <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="POPUP">Notificação</SelectItem>
                          <SelectItem value="EMAIL">E-mail</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={lembretesForm.length >= 10}
                        onClick={() => {
                          const min = parseInt(novoLembreteAntes, 10)
                          if (!Number.isFinite(min) || min < 1) return
                          // Evita duplicar mesma combinação canal+minutos
                          if (lembretesForm.some(l => l.canal === novoLembreteCanal && l.minutosAntes === min)) return
                          setLembretesForm(arr => [...arr, { canal: novoLembreteCanal, minutosAntes: min }])
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />Adicionar
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Disparado pra todos os participantes. Notificação = popup do navegador + toast no app. E-mail = mensagem na caixa de entrada.
                    </p>
                  </div>
                    </TabsContent>

                    {/* ABA: VINCULAÇÕES — Card do CRM (e, no futuro, outros vínculos) */}
                    <TabsContent value="vinculacoes" className="mt-0 flex-1 overflow-y-auto nice-scrollbar pr-1 space-y-3 focus-visible:outline-none">
                  {/* Vincular card do CRM */}
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Card do CRM (opcional)
                    </Label>
                    {oportunidadeVinc ? (
                      <div className="flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 dark:bg-violet-500/10 px-2.5 py-1.5">
                        <Target className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate">{oportunidadeVinc.titulo}</p>
                          {(oportunidadeVinc.razaoSocial || oportunidadeVinc.etapa) && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {[oportunidadeVinc.razaoSocial, oportunidadeVinc.etapa?.nome].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setOportunidadeVinc(null); setForm(f => ({ ...f, oportunidadeId: '' })) }}
                          className="text-muted-foreground hover:text-red-500 shrink-0"
                          aria-label="Desvincular card do CRM"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div ref={opBuscaRef} className="relative w-full">
                        <button
                          type="button"
                          onClick={() => { setOpBuscaOpen(o => !o); setOpBuscaQuery('') }}
                          className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <span className="text-muted-foreground truncate">Vincular a uma oportunidade...</span>
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                        </button>
                        {opBuscaOpen && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                            <div className="p-1.5 border-b bg-popover sticky top-0">
                              <Input
                                autoFocus
                                value={opBuscaQuery}
                                onChange={e => setOpBuscaQuery(e.target.value)}
                                placeholder="Buscar por título ou cliente..."
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="max-h-56 overflow-y-auto py-1">
                              {opBuscaLoading ? (
                                <p className="px-3 py-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin" />Buscando...
                                </p>
                              ) : opBuscaResults.length === 0 ? (
                                <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhuma oportunidade encontrada</p>
                              ) : opBuscaResults.map(op => (
                                <button
                                  key={op.id}
                                  type="button"
                                  onClick={() => {
                                    setOportunidadeVinc(op)
                                    setForm(f => ({ ...f, oportunidadeId: op.id }))
                                    setOpBuscaOpen(false)
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                                >
                                  <Target className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{op.titulo}</span>
                                    {(op.razaoSocial || op.etapa) && (
                                      <span className="block truncate text-[10px] text-muted-foreground">
                                        {[op.razaoSocial, op.etapa?.nome].filter(Boolean).join(' · ')}
                                      </span>
                                    )}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                    </TabsContent>

                    {/* ABA: ANOTAÇÕES */}
                    <TabsContent value="anotacoes" className="mt-0 flex-1 overflow-y-auto nice-scrollbar pr-1 space-y-3 focus-visible:outline-none">
                      {modalMode === 'create' || !selectedEvento?.id ? (
                        <p className="text-xs text-muted-foreground text-center py-10 italic">
                          Salve o evento para adicionar anotações.
                        </p>
                      ) : renderAnotacoesSection()}
                    </TabsContent>

                    {/* ABA: ANEXOS */}
                    <TabsContent value="anexos" className="mt-0 flex-1 overflow-y-auto nice-scrollbar pr-1 space-y-3 focus-visible:outline-none">
                      {modalMode === 'create' || !selectedEvento?.id ? (
                        <p className="text-xs text-muted-foreground text-center py-10 italic">
                          Salve o evento para anexar arquivos.
                        </p>
                      ) : renderAnexosSection()}
                    </TabsContent>
                    </div>
                  </Tabs>
                </div>
              </div>
              )
            })()}
          </DialogBody>

          {(modalMode === 'create' || modalMode === 'edit') && (
            <DialogFooter>
              <Button variant="success" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                {modalMode === 'create' ? 'Criar Evento' : 'Salvar'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            </DialogFooter>
          )}
          {/* Rodapé do modo VIEW — Editar/Excluir fixos no rodapé do modal */}
          {modalMode === 'view' && selectedEvento && (() => {
            const isOwner = selectedEvento.criadorId === currentUserId
            // Editar: SÓ o dono do evento, master ou quem tem a sub-permissão
            // "editar_todos_eventos". `editavel` é flag do evento (legado), NÃO permissão.
            const podeEditar = isOwner || canEditarTodosEventos
            const podeExcluir = canDeleteEventos || isOwner || canEditarTodosEventos
            if (!podeEditar && !podeExcluir) return null
            return (
              <DialogFooter>
                {podeEditar && (
                  <Button size="sm" variant="outline" onClick={() => openEditEvent(selectedEvento)} className="gap-1.5">
                    <Edit2 className="h-3.5 w-3.5" />Editar
                  </Button>
                )}
                {podeExcluir && (
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedEvento)} className="gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />Excluir
                  </Button>
                )}
              </DialogFooter>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* Modal importação legado — progresso */}
      {/* ============================================================ */}
      <Dialog open={importModalOpen} onOpenChange={open => { if (!open && importProgress?.status !== 'running') { setImportModalOpen(false); if (importPollRef.current) { clearInterval(importPollRef.current); importPollRef.current = null } } }}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={History} color="sky">
            <DialogTitle>Importação do Legado</DialogTitle>
            <DialogDescription>
              {importProgress?.status === 'running' ? 'Importando eventos...' : importProgress?.status === 'done' ? 'Importação concluída' : 'Iniciando...'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {importProgress && (
              <div className="space-y-4">
                {/* Barra de progresso */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium">{importProgress.current} / {importProgress.total}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all duration-300"
                      style={{ width: importProgress.total > 0 ? `${(importProgress.current / importProgress.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>

                {/* Evento atual */}
                {importProgress.status === 'running' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    <span className="truncate">{importProgress.currentEvento}</span>
                  </div>
                )}

                {/* Resumo */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-2 text-center">
                    <p className="text-lg font-bold text-emerald-600">{importProgress.importados}</p>
                    <p className="text-[10px] text-muted-foreground">Importados</p>
                  </div>
                  <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-2 text-center">
                    <p className="text-lg font-bold text-amber-600">{importProgress.ignorados}</p>
                    <p className="text-[10px] text-muted-foreground">Ignorados</p>
                  </div>
                  <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-2 text-center">
                    <p className="text-lg font-bold text-red-600">{importProgress.erros}</p>
                    <p className="text-[10px] text-muted-foreground">Erros</p>
                  </div>
                  <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/20 p-2 text-center">
                    <p className="text-lg font-bold text-sky-600">{importProgress.participantes}</p>
                    <p className="text-[10px] text-muted-foreground">Participantes</p>
                  </div>
                </div>

                {/* Log de itens */}
                <div className="max-h-[250px] overflow-y-auto space-y-0.5 border rounded-lg p-2">
                  {importProgress.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Aguardando...</p>
                  ) : (
                    [...importProgress.items].reverse().map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px] py-0.5">
                        {item.status === 'importado' && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
                        {item.status === 'ignorado' && <span className="h-3 w-3 text-amber-400 shrink-0 text-center">—</span>}
                        {item.status === 'erro' && <X className="h-3 w-3 text-red-500 shrink-0" />}
                        <span className={cn('truncate', item.status === 'ignorado' && 'text-muted-foreground', item.status === 'erro' && 'text-red-600')}>
                          {item.nome}
                          {item.erro && <span className="ml-1 text-[10px] text-red-400">({item.erro})</span>}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </DialogBody>
          {importProgress?.status === 'done' && (
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* Modal gerenciar tipos de evento */}
      {/* ============================================================ */}
      <Dialog open={tiposModalOpen} onOpenChange={setTiposModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Palette} color="sky">
            <DialogTitle>Tipos de Evento</DialogTitle>
            <DialogDescription>Cadastre e edite as categorias de eventos da agenda</DialogDescription>
          </DialogHeaderIcon>
          {/* Botão importar legado no topo */}
          <div className="px-5 -mt-2 mb-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs w-full"
              onClick={async () => {
                const ok = await alerts.confirm({ title: 'Importar tipos do legado', text: 'Importar categorias de eventos do banco OneClick v1? Tipos já existentes serão ignorados.', confirmText: 'Importar', icon: 'question' })
                if (!ok) return
                try {
                  const r = await trpc.agenda.importTiposLegado.mutate() as { importados: number; ignorados: number; erros: number }
                  await alerts.success('Importação concluída', `${r.importados} importado(s), ${r.ignorados} já existente(s), ${r.erros} erro(s).`)
                  const tipos2 = await trpc.agenda.listTipos.query()
                  setTipos(tipos2 as AgendaTipo[])
                } catch (e) { alerts.error('Erro', (e as Error).message) }
              }}
            >
              <History className="h-3.5 w-3.5" />Importar do Legado (OneClick v1)
            </Button>
          </div>
          <DialogBody className="space-y-4">
            {/* Formulário novo/editar tipo */}
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {tipoEditando ? 'Editar tipo' : 'Novo tipo'}
              </h5>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 sm:col-span-5 space-y-1.5">
                  <Label className="text-[13px]">Nome *</Label>
                  <Input value={tipoForm.nome} onChange={e => setTipoForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Reunião Interna" className="h-9 text-sm" />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label className="text-[13px]">Fundo</Label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={tipoForm.cor} onChange={e => setTipoForm(f => ({ ...f, cor: e.target.value }))} className="h-8 w-10 rounded border cursor-pointer" />
                    <span className="text-[10px] text-muted-foreground font-mono">{tipoForm.cor}</span>
                  </div>
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label className="text-[13px]">Borda</Label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={tipoForm.corBorda} onChange={e => setTipoForm(f => ({ ...f, corBorda: e.target.value }))} className="h-8 w-10 rounded border cursor-pointer" />
                    <span className="text-[10px] text-muted-foreground font-mono">{tipoForm.corBorda}</span>
                  </div>
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label className="text-[13px]">Texto</Label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={tipoForm.corTexto} onChange={e => setTipoForm(f => ({ ...f, corTexto: e.target.value }))} className="h-8 w-10 rounded border cursor-pointer" />
                    <span className="text-[10px] text-muted-foreground font-mono">{tipoForm.corTexto}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={tipoForm.bloqueiaAgenda} onCheckedChange={v => setTipoForm(f => ({ ...f, bloqueiaAgenda: !!v }))} />
                  <span className="text-xs">Bloqueia agenda (detecta conflitos)</span>
                </label>
                <div className="flex items-center gap-2">
                  {tipoEditando && (
                    <Button variant="ghost" size="sm" onClick={cancelTipoEdit} className="text-xs">Cancelar</Button>
                  )}
                  <Button variant="success" size="sm" onClick={handleSaveTipo} disabled={tipoSaving} className="gap-1.5 text-sm">
                    {tipoSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    {tipoEditando ? 'Atualizar' : 'Criar'}
                  </Button>
                </div>
              </div>
              {/* Preview */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Preview:</span>
                <span
                  className="text-xs px-3 py-1 rounded"
                  style={{ backgroundColor: tipoForm.cor, color: tipoForm.corTexto, borderLeft: `3px solid ${tipoForm.corBorda}` }}
                >
                  {tipoForm.nome || 'Nome do tipo'}
                </span>
              </div>
            </div>

            {/* Lista de tipos existentes */}
            <div className="space-y-1">
              {tipos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum tipo cadastrado</p>
              ) : tipos.map(t => (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2 transition-colors',
                    tipoEditando?.id === t.id && 'ring-2 ring-sky-500 bg-sky-50/50 dark:bg-sky-950/20',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs px-3 py-1 rounded font-medium"
                      style={{ backgroundColor: t.cor, color: t.corTexto, borderLeft: `3px solid ${t.corBorda}` }}
                    >
                      {t.nome}
                    </span>
                    {t.bloqueiaAgenda && (
                      <span className="text-[9px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                        Bloqueia agenda
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openTipoEdit(t)}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDeleteTipo(t)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <TarefaModal
        open={tarefaModalOpen}
        onOpenChange={setTarefaModalOpen}
        tarefa={tarefaEditando}
        onSaved={loadTarefas}
      />
    </div>
    </TooltipProvider>
  )
}

/** Card compacto com ícone + label + valor — usado no grid da prévia de evento. */
/**
 * Linha da tabela de campos do MODO VIEW do evento.
 * Ícone + label (muted) à esquerda, valor à direita, divisórias sutis.
 */
function FieldRow({
  icon: Icon,
  label,
  align = 'center',
  children,
}: {
  icon: React.ElementType
  label: string
  align?: 'center' | 'start'
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex gap-3 px-3.5 py-2.5 bg-muted/20', align === 'start' ? 'items-start' : 'items-center')}>
      <div className={cn('flex items-center gap-2 shrink-0 w-[130px] text-muted-foreground', align === 'start' && 'pt-0.5')}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="flex-1 min-w-0 text-[13px] font-medium">{children}</div>
    </div>
  )
}
