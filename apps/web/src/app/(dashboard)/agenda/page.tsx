'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Loader2, Calendar, Clock,
  MapPin, Users, Trash2, Edit2, X, Video, Monitor, Building2,
  Repeat, Lock, History, Settings, Palette, Check, Download,
} from 'lucide-react'
import {
  Button, Input, Label, Card,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Checkbox, RichEditor,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
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
  isTarefa: boolean
  recorrencia: string
  lote: string | null
  tipoId: string
  criadorId: string
  tipo: { id: string; nome: string; cor: string; corBorda: string; corTexto: string }
  criador: { id: string; name: string }
  participantes: Array<{
    id: string
    usuarioId: string | null
    nomeAvulso: string | null
    usuario: { id: string; name: string } | null
  }>
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

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
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
  const showSettingsDropdown = canManageTipos || canImportLegado

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [eventos, setEventos] = useState<AgendaEvento[]>([])
  const [tipos, setTipos] = useState<AgendaTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string }>>([])

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const [filtroParticipante, setFiltroParticipante] = useState<string>('')

  // Modal de evento
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedEvento, setSelectedEvento] = useState<AgendaEvento | null>(null)
  const [saving, setSaving] = useState(false)

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
    garagem: false,
    vagas: undefined as number | undefined,
    equipamentos: '',
    isTarefa: false,
    tipoId: '',
    recorrencia: 'NENHUMA',
    recorrenciaVezes: 1,
    participanteIds: [] as string[],
    participantesAvulsos: [] as string[],
  })
  const [avulsoInput, setAvulsoInput] = useState('')

  // Logs do evento
  const [eventLogs, setEventLogs] = useState<Array<{ id: string; acao: string; createdAt: string }>>([])

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
  const [dropTargetDay, setDropTargetDay] = useState<number | null>(null)

  // Modal de detalhes do dia
  const [dayModalOpen, setDayModalOpen] = useState(false)
  const [dayModalDate, setDayModalDate] = useState<string>('')

  // ============================================================
  // Carregar dados
  // ============================================================

  const fetchEventos = useCallback(async () => {
    setLoading(true)
    try {
      const dataInicio = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = getDaysInMonth(year, month)
      const dataFim = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const result = await trpc.agenda.listEventos.query({ dataInicio, dataFim }) as AgendaEvento[]
      setEventos(result)
    } catch (e) {
      console.error('[Agenda] Erro ao buscar eventos:', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchEventos() }, [fetchEventos])

  useEffect(() => {
    trpc.agenda.listTipos.query()
      .then((r: unknown) => setTipos(r as AgendaTipo[]))
      .catch(() => {})
    // Carregar usuarios para o select de participantes
    trpc.agenda.listUsuarios.query()
      .then((r: unknown) => setUsuarios(r as Array<{ id: string; name: string }>))
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

  const eventosPorDia = useMemo(() => {
    const map: Record<number, AgendaEvento[]> = {}
    let filtered = filtroTipo ? eventos.filter(e => e.tipoId === filtroTipo) : eventos
    if (filtroParticipante) {
      filtered = filtered.filter(e =>
        e.criadorId === filtroParticipante ||
        e.participantes.some(p => p.usuarioId === filtroParticipante)
      )
    }
    for (const ev of filtered) {
      const startDate = new Date(ev.data)
      const endDate = ev.dataFim ? new Date(ev.dataFim) : startDate

      // Iterar por todos os dias que o evento cobre
      const cursor = new Date(startDate)
      while (cursor <= endDate) {
        const day = cursor.getUTCDate()
        const evMonth = cursor.getUTCMonth()
        const evYear = cursor.getUTCFullYear()
        if (evMonth === month && evYear === year) {
          if (!map[day]) map[day] = []
          if (!map[day]!.find(e => e.id === ev.id)) map[day]!.push(ev)
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }
    for (const day of Object.keys(map)) {
      map[Number(day)]!.sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''))
    }
    return map
  }, [eventos, month, year, filtroTipo, filtroParticipante])

  // ============================================================
  // Ações
  // ============================================================

  function openNewEvent(dateStr?: string) {
    setModalMode('create')
    setSelectedEvento(null)
    setForm({
      titulo: '', descricao: '', data: dateStr || formatDate(new Date()), dataFim: '',
      horaInicio: '09:00', horaFim: '10:00', diaInteiro: false,
      local: '', contato: '', link: '', presenca: 'PRESENCIAL',
      particular: false, editavel: true, sala: '', garagem: false, vagas: undefined,
      equipamentos: '', isTarefa: false,
      tipoId: tipos[0]?.id ?? '', recorrencia: 'NENHUMA', recorrenciaVezes: 2,
      participanteIds: [], participantesAvulsos: [],
    })
    setAvulsoInput('')
    setModalOpen(true)
  }

  function openViewEvent(ev: AgendaEvento) {
    setModalMode('view')
    setSelectedEvento(ev)
    setEventLogs([])
    setModalOpen(true)
    // Carregar logs
    trpc.agenda.listLogs.query({ eventoId: ev.id })
      .then((r: unknown) => setEventLogs(r as typeof eventLogs))
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
      garagem: (ev as unknown as Record<string, unknown>).garagem as boolean ?? false,
      vagas: (ev as unknown as Record<string, unknown>).vagas as number | undefined,
      equipamentos: (ev as unknown as Record<string, unknown>).equipamentos as string ?? '',
      isTarefa: ev.isTarefa,
      tipoId: ev.tipoId,
      recorrencia: ev.recorrencia,
      recorrenciaVezes: 2,
      participanteIds: ev.participantes.filter(p => p.usuarioId).map(p => p.usuarioId!),
      participantesAvulsos: ev.participantes.filter(p => p.nomeAvulso).map(p => p.nomeAvulso!),
    })
    setAvulsoInput('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.titulo.trim()) { alerts.error('Erro', 'Título é obrigatório.'); return }
    if (!form.tipoId) { alerts.error('Erro', 'Selecione um tipo.'); return }
    setSaving(true)
    try {
      // Verificar conflitos antes de salvar (se não for dia inteiro)
      if (!form.diaInteiro && form.horaInicio && form.horaFim) {
        const conflitos = await trpc.agenda.verificarConflitos.query({
          data: form.data,
          horaInicio: form.horaInicio,
          horaFim: form.horaFim,
          participanteIds: form.participanteIds.length > 0 ? form.participanteIds : undefined,
          sala: form.sala || undefined,
          eventoIdExcluir: modalMode === 'edit' ? selectedEvento?.id : undefined,
        }) as Array<{ tipo: string; nome: string; evento: string; horario: string }>

        if (conflitos.length > 0) {
          const msgs = conflitos.map(c =>
            c.tipo === 'participante'
              ? `• ${c.nome} já está em "${c.evento}" (${c.horario})`
              : `• Sala "${c.nome}" ocupada por "${c.evento}" (${c.horario})`
          )
          const ok = await alerts.confirm({
            title: `${conflitos.length} conflito(s) detectado(s)`,
            text: msgs.join('\n'),
            confirmText: 'Salvar mesmo assim',
            icon: 'warning',
          })
          if (!ok) { setSaving(false); return }
        }
      }

      if (modalMode === 'create') {
        await trpc.agenda.create.mutate({
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
          isTarefa: form.isTarefa,
          tipoId: form.tipoId,
          recorrencia: form.recorrencia as 'NENHUMA' | 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'ANUAL',
          recorrenciaVezes: form.recorrencia !== 'NENHUMA' ? form.recorrenciaVezes : undefined,
          participanteIds: form.participanteIds,
          participantesAvulsos: form.participantesAvulsos,
        })
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
            isTarefa: form.isTarefa,
            tipoId: form.tipoId,
            participanteIds: form.participanteIds,
            participantesAvulsos: form.participantesAvulsos,
          },
        })
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
      try {
        if (result.isDenied) {
          await trpc.agenda.deleteLote.mutate({ lote: ev.lote })
          alerts.success('Série excluída', 'Todos os eventos da série foram removidos.')
        } else {
          await trpc.agenda.delete.mutate({ id: ev.id })
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
        showCancelButton: true,
        confirmButtonText: '<span style="display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg> Excluir</span>',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#d1d5db',
        customClass: { icon: 'swal-icon-no-border', cancelButton: 'swal-cancel-dark' },
        reverseButtons: true,
      })
      if (!result.isConfirmed) return
      try {
        await trpc.agenda.delete.mutate({ id: ev.id })
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
    const d = parseDate(dayModalDate)
    return eventosPorDia[d.getDate()] ?? []
  }, [dayModalDate, eventosPorDia])

  return (
    <div className="space-y-3 flex flex-col" style={{ height: 'calc(100vh - 6rem)' }}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="administrativo" icon={Calendar} />
          <div>
            <h1>Agenda Corporativa</h1>
            <p className="text-sm text-muted-foreground">Gerencie eventos, reuniões e compromissos</p>
          </div>
        </div>
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
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ============================================================ */}
        {/* PAINEL ESQUERDO — ações, filtros, eventos de hoje */}
        {/* ============================================================ */}
        <div className="hidden xl:block w-[280px] shrink-0 space-y-3">
          {/* Botões */}
          <Card className="p-4 space-y-2">
            <Button className="w-full gap-2 bg-sky-500 hover:bg-sky-600 text-white" onClick={() => openNewEvent()}>
              <Calendar className="h-4 w-4" />Novo Evento
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={() => { setForm(f => ({ ...f, isTarefa: true })); openNewEvent() }}>
              <Clock className="h-4 w-4" />Nova Tarefa
            </Button>
          </Card>

          {/* Filtros */}
          <Card className="p-4 space-y-3">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros</h5>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de evento</Label>
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
              <Label className="text-xs">Participante</Label>
              <Select value={filtroParticipante || '__all__'} onValueChange={v => setFiltroParticipante(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(filtroTipo || filtroParticipante) && (
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { setFiltroTipo(''); setFiltroParticipante('') }}>
                <X className="h-3 w-3 mr-1" />Limpar filtros
              </Button>
            )}
          </Card>

          {/* Eventos de hoje */}
          <Card className="p-4">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Eventos de hoje</h5>
            {eventosHoje.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum evento hoje</p>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-none">
                {eventosHoje.map(ev => (
                  <div
                    key={ev.id}
                    className="rounded-lg border p-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => openViewEvent(ev)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ev.tipo.cor }} />
                      <span className="text-[11px] text-muted-foreground">
                        {ev.diaInteiro ? 'Dia inteiro' : `${ev.horaInicio} — ${ev.horaFim}`}
                      </span>
                    </div>
                    <p className="text-xs font-medium truncate">{ev.titulo}</p>
                    {ev.participantes.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">
                        {ev.participantes.map(p => p.usuario?.name ?? p.nomeAvulso).filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
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

          <Card className="flex-1 flex flex-col min-h-0">
            {/* Navegação mês */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <Button variant="ghost" size="icon-sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{MESES[month]} {year}</h2>
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={goToday}>Hoje</Button>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            {/* Header dias da semana (fixo) */}
            <div className="grid grid-cols-7">
              {DIAS_SEMANA.map(d => (
                <div key={d} className="border-b border-r last:border-r-0 px-2 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid dos dias (com scroll) */}
            <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-7 min-h-full" style={{ gridTemplateRows: `repeat(${Math.ceil(totalCells / 7)}, minmax(140px, 1fr))` }}>
              {Array.from({ length: totalCells }, (_, i) => {
                const dayNum = i - firstDay + 1
                const isValid = dayNum >= 1 && dayNum <= daysInMonth
                const dayEvents = isValid ? (eventosPorDia[dayNum] ?? []) : []
                const today = isValid && isToday(year, month, dayNum)
                const isPast = isValid && new Date(year, month, dayNum) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
                const dateStr = isValid ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : ''

                return (
                  <div
                    key={i}
                    className={cn(
                      'border-b border-r last:border-r-0 p-1 transition-all cursor-pointer overflow-hidden flex flex-col min-h-0',
                      !isValid && 'bg-muted/10',
                      isValid && !isPast && 'hover:bg-muted/20',
                      isPast && 'bg-muted/30 dark:bg-muted/10',
                      today && 'bg-sky-50/50 dark:bg-sky-950/20',
                      isValid && dropTargetDay === dayNum && 'bg-sky-100 dark:bg-sky-900/30 ring-2 ring-inset ring-sky-400',
                    )}
                    onClick={() => {
                      if (!isValid) return
                      if (dayEvents.length > 0) {
                        setDayModalDate(dateStr)
                        setDayModalOpen(true)
                      } else {
                        openNewEvent(dateStr)
                      }
                    }}
                    onDragOver={e => {
                      if (!isValid || !draggingEventId) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDropTargetDay(dayNum)
                    }}
                    onDragLeave={() => setDropTargetDay(null)}
                    onDrop={e => {
                      e.preventDefault()
                      setDropTargetDay(null)
                      if (!isValid || !draggingEventId) return
                      handleDropEvent(draggingEventId, dateStr)
                      setDraggingEventId(null)
                    }}
                  >
                    {isValid && (
                      <>
                        <div className={cn(
                          'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full shrink-0',
                          today && 'bg-sky-500 text-white',
                          isPast && !today && 'text-muted-foreground/60',
                        )}>
                          {dayNum}
                        </div>
                        {/* Container dos eventos — sem flex-1 pra ficarem colados ao topo (sem gap antes do "+N mais") */}
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(ev => (
                            <div
                              key={ev.id}
                              draggable
                              onDragStart={e => {
                                e.stopPropagation()
                                setDraggingEventId(ev.id)
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('text/plain', ev.id)
                              }}
                              onDragEnd={() => { setDraggingEventId(null); setDropTargetDay(null) }}
                              className={cn(
                                'text-[11px] leading-snug px-2 py-1 rounded-[2px] truncate cursor-grab active:cursor-grabbing',
                                draggingEventId === ev.id && 'opacity-40',
                              )}
                              style={{
                                backgroundColor: isPast ? '#e5e7eb' : ev.tipo.cor,
                                color: isPast ? '#6b7280' : ev.tipo.corTexto,
                                borderLeft: `3px solid ${ev.tipo.corBorda}`,
                              }}
                              onClick={e => { e.stopPropagation(); openViewEvent(ev) }}
                              title={`${ev.horaInicio ?? ''} ${ev.titulo} — arraste para mover`}
                            >
                              {ev.horaInicio && <span className="font-semibold mr-1">{ev.horaInicio}</span>}
                              {ev.particular && <Lock className="inline h-2.5 w-2.5 mr-0.5" />}
                              {ev.titulo}
                            </div>
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
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={Calendar} color="sky">
            <DialogTitle>
              {dayModalDate && (() => {
                const d = parseDate(dayModalDate)
                return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
              })()}
            </DialogTitle>
            <DialogDescription>{dayModalEvents.length} evento(s)</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-2 max-h-[400px]">
            {dayModalEvents.map(ev => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => { setDayModalOpen(false); openViewEvent(ev) }}
              >
                <div className="h-8 w-1.5 rounded-full shrink-0" style={{ backgroundColor: ev.tipo.cor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.titulo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ev.diaInteiro ? 'Dia inteiro' : `${ev.horaInicio} — ${ev.horaFim}`}
                    {ev.local && ` · ${ev.local}`}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: ev.tipo.cor, color: ev.tipo.corTexto }}>
                  {ev.tipo.nome}
                </span>
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button size="sm" onClick={() => { setDayModalOpen(false); openNewEvent(dayModalDate) }} className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white">
              <Plus className="h-3.5 w-3.5" />Novo evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* Modal criar/editar/visualizar evento */}
      {/* ============================================================ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeaderIcon icon={modalMode === 'create' ? Plus : modalMode === 'edit' ? Edit2 : Calendar} color={modalMode === 'create' ? 'emerald' : modalMode === 'edit' ? 'sky' : 'sky'}>
            <DialogTitle className="flex items-center gap-2">
              {modalMode === 'view' && selectedEvento && (
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedEvento.tipo.cor }} />
              )}
              {modalMode === 'create' ? 'Novo Evento' : modalMode === 'edit' ? 'Editar Evento' : selectedEvento?.titulo}
            </DialogTitle>
            {modalMode === 'view' && selectedEvento && (
              <DialogDescription>
                {selectedEvento.tipo.nome} · Criado por {selectedEvento.criador.name}
              </DialogDescription>
            )}
          </DialogHeaderIcon>

          <DialogBody>
            {/* VIEW MODE */}
            {modalMode === 'view' && selectedEvento && (
              <div className="space-y-4">
                {/* Data e hora */}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {(() => {
                    const d = new Date(selectedEvento.data)
                    const dataFmt = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
                    const dataFimFmt = selectedEvento.dataFim ? (() => { const df = new Date(selectedEvento.dataFim!); return `${String(df.getUTCDate()).padStart(2, '0')}/${String(df.getUTCMonth() + 1).padStart(2, '0')}/${df.getUTCFullYear()}` })() : null
                    if (selectedEvento.diaInteiro) {
                      return <span>{dataFimFmt ? `${dataFmt} — ${dataFimFmt}` : `Dia inteiro — ${dataFmt}`}</span>
                    }
                    return <span>{selectedEvento.horaInicio} — {selectedEvento.horaFim} · {dataFimFmt ? `${dataFmt} a ${dataFimFmt}` : dataFmt}</span>
                  })()}
                </div>
                {/* Local */}
                {selectedEvento.local && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEvento.local}</span>
                  </div>
                )}
                {/* Presença */}
                <div className="flex items-center gap-2 text-sm">
                  {(() => { const p = PRESENCA_LABELS[selectedEvento.presenca]; const I = p?.icon ?? Building2; return <><I className="h-4 w-4 text-muted-foreground" /><span>{p?.label ?? selectedEvento.presenca}</span></> })()}
                </div>
                {/* Link */}
                {selectedEvento.link && (
                  <div className="flex items-center gap-2 text-sm">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <a href={selectedEvento.link} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline truncate">{selectedEvento.link}</a>
                  </div>
                )}
                {/* Recorrência */}
                {selectedEvento.recorrencia !== 'NENHUMA' && (
                  <div className="flex items-center gap-2 text-sm">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <span>{RECORRENCIA_LABELS[selectedEvento.recorrencia]}</span>
                  </div>
                )}
                {/* Participantes */}
                {selectedEvento.participantes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm mb-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selectedEvento.participantes.length} participante(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {selectedEvento.participantes.map(p => (
                        <span key={p.id} className="text-xs bg-muted px-2 py-1 rounded-full">
                          {p.usuario?.name ?? p.nomeAvulso}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Descrição */}
                {selectedEvento.descricao && (
                  <div className="border-t pt-3 mt-3">
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&_*]:text-sm" dangerouslySetInnerHTML={{ __html: selectedEvento.descricao }} />
                  </div>
                )}
                {/* Histórico */}
                {eventLogs.length > 0 && (
                  <div className="border-t pt-3 mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <History className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Histórico</span>
                    </div>
                    <div className="space-y-1">
                      {eventLogs.map(log => (
                        <div key={log.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="shrink-0">{new Date(log.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>—</span>
                          <span className="capitalize">{log.acao}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ações */}
                {(() => {
                  const isOwner = selectedEvento.criadorId === currentUserId
                  return (
                <div className="flex items-center gap-2 border-t pt-3">
                  {(selectedEvento.editavel || isOwner) && (
                    <Button size="sm" variant="outline" onClick={() => openEditEvent(selectedEvento)} className="gap-1.5">
                      <Edit2 className="h-3.5 w-3.5" />Editar
                    </Button>
                  )}
                  {(canDeleteEventos || isOwner) && (
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedEvento)} className="gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />Excluir
                    </Button>
                  )}
                </div>
                  )
                })()}
              </div>
            )}

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
                  {/* Tipo */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Tipo *</Label>
                    <Select value={form.tipoId} onValueChange={v => setForm(f => ({ ...f, tipoId: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {tipos.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.cor }} />
                              {t.nome}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

                      {/* Sala */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Ambiente *</Label>
                        <div className="space-y-1">
                          {['Sala de reuniões', 'Sala de inovação', 'Outro'].map(s => (
                            <label key={s} className={cn('flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-xs transition-colors', form.sala === s ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'hover:bg-muted/50')}>
                              <input type="radio" name="sala" checked={form.sala === s} onChange={() => setForm(f => ({ ...f, sala: s }))} className="accent-sky-500" />
                              {s}
                            </label>
                          ))}
                        </div>
                        {form.sala === 'Outro' && (
                          <Input className="h-7 text-xs mt-1" placeholder="Local do evento *" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} />
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
                      <Label className="text-xs">Modalidade</Label>
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

                  {/* Recorrência (apenas criação) */}
                  {modalMode === 'create' && canManageRecorrencia && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Repetir</Label>
                      <Select value={form.recorrencia} onValueChange={v => setForm(f => ({ ...f, recorrencia: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(RECORRENCIA_LABELS).map(([k, l]) => (
                            <SelectItem key={k} value={k}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.recorrencia !== 'NENHUMA' && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Repetições</Label>
                          <Input type="number" min={2} max={52} className="h-7 text-xs w-20" value={form.recorrenciaVezes} onChange={e => setForm(f => ({ ...f, recorrenciaVezes: Math.max(2, Number(e.target.value) || 2) }))} />
                          {recSummary && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Repeat className="h-3 w-3 shrink-0" />{recSummary}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Opções extras */}
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold">Opções</Label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <Checkbox checked={form.particular} onCheckedChange={v => setForm(f => ({ ...f, particular: !!v }))} />
                      <Lock className="h-3 w-3 text-muted-foreground" />Particular
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <Checkbox checked={form.isTarefa} onCheckedChange={v => setForm(f => ({ ...f, isTarefa: !!v }))} />
                      <Check className="h-3 w-3 text-muted-foreground" />Tarefa
                    </label>
                  </div>
                </div>

                {/* COLUNA DIREITA — dados principais */}
                <div className="flex-1 space-y-3">
                  {/* Título */}
                  <div className="space-y-1.5">
                    <Label>Título *</Label>
                    <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Nome do evento" />
                  </div>

                  {/* Data e horários */}
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Data início *</Label>
                      <Input type="date" className="h-8 text-sm" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Data término</Label>
                      <Input type="date" className="h-8 text-sm" value={form.dataFim} onChange={e => setForm(f => ({ ...f, dataFim: e.target.value }))} min={form.data} />
                    </div>
                    {!form.diaInteiro && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Início</Label>
                          <Input type="time" className="h-8 text-sm w-[100px]" value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
                        </div>
                        <span className="pb-1.5 text-muted-foreground">—</span>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Fim</Label>
                          <Input type="time" className="h-8 text-sm w-[100px]" value={form.horaFim} onChange={e => setForm(f => ({ ...f, horaFim: e.target.value }))} />
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
                        <Label className="text-xs">Local</Label>
                        <Input className="h-8 text-sm" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} placeholder="Local do evento" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Sala</Label>
                        <Input className="h-8 text-sm" value={form.sala} onChange={e => setForm(f => ({ ...f, sala: e.target.value }))} placeholder="Sala de reunião" />
                      </div>
                    </div>
                  )}

                  {/* Link (quando NÃO é reunião interna mas é online/híbrido) */}
                  {!isReuniao && needsLink && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Link da reunião</Label>
                      <Input className="h-8 text-sm" value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://meet.google.com/..." />
                    </div>
                  )}

                  {/* Contato */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Contato</Label>
                    <Input className="h-8 text-sm" value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} placeholder="Telefone ou e-mail de contato" />
                  </div>

                  {/* Participantes — sempre disponível ao criar/editar evento próprio */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Participantes</Label>
                    {(form.participanteIds.length > 0 || form.participantesAvulsos.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {form.participanteIds.map(id => {
                          const u = usuarios.find(u => u.id === id)
                          return u ? (
                            <span key={id} className="flex items-center gap-1 text-[11px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded-full">
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
                    <div className="flex gap-2">
                      <Select value="" onValueChange={v => { if (v && !form.participanteIds.includes(v)) setForm(f => ({ ...f, participanteIds: [...f.participanteIds, v] })) }}>
                        <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Adicionar usuário..." /></SelectTrigger>
                        <SelectContent>
                          {usuarios.filter(u => !form.participanteIds.includes(u.id)).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <Input className="flex-1 h-8 text-xs" placeholder="Convidado externo..." value={avulsoInput} onChange={e => setAvulsoInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAvulso())} />
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addAvulso}>Adicionar</Button>
                    </div>
                  </div>

                  {/* Descrição */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <RichEditor
                      value={form.descricao}
                      onChange={html => setForm(f => ({ ...f, descricao: html }))}
                      placeholder="Detalhes do evento..."
                      className="min-h-[100px]"
                    />
                  </div>
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
                  <Label className="text-xs">Nome *</Label>
                  <Input value={tipoForm.nome} onChange={e => setTipoForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Reunião Interna" className="h-8 text-sm" />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Fundo</Label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={tipoForm.cor} onChange={e => setTipoForm(f => ({ ...f, cor: e.target.value }))} className="h-8 w-10 rounded border cursor-pointer" />
                    <span className="text-[10px] text-muted-foreground font-mono">{tipoForm.cor}</span>
                  </div>
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Borda</Label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={tipoForm.corBorda} onChange={e => setTipoForm(f => ({ ...f, corBorda: e.target.value }))} className="h-8 w-10 rounded border cursor-pointer" />
                    <span className="text-[10px] text-muted-foreground font-mono">{tipoForm.corBorda}</span>
                  </div>
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Texto</Label>
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
                  <Button variant="success" size="sm" onClick={handleSaveTipo} disabled={tipoSaving} className="gap-1.5 text-xs">
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
    </div>
  )
}
