'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Target, Search, Loader2, Plus, MoreVertical, ArrowRight,
  CheckCircle2, Clock, TrendingUp, Calendar,
  CheckSquare, MessageSquare, Trash2, Send, X, LayoutGrid, List,
  Download, FileText, Settings2, GripVertical, Save, Paperclip, UploadCloud, File, History, Archive, SlidersHorizontal, Tag, Layers,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, RichEditor,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { DndContext, closestCenter, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DragOverEvent, useDroppable } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { numeroParaMoeda, moedaParaNumero, masks } from '@/lib/masks'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

// ============================================================
// Tipos
// ============================================================

interface Etapa { id: string; nome: string; ordem: number; cor: string; probabilidade: number; ehGanho: boolean; ehPerda: boolean; slaDias: number | null; _count: { oportunidades: number } }

interface Oportunidade { id: string; titulo: string; descricao: string | null; valor: number | null; origem: string | null; previsaoFechamento: string | null; createdAt: string; updatedAt: string; etapaId: string; clienteId: string | null; responsavelId: string | null; etapa: Etapa; cliente?: { id: string; razaoSocial: string } | null; responsavel?: { id: string; name: string } | null; _count?: { tarefas: number; mensagens: number; arquivos: number } }

interface OportunidadeDetail extends Oportunidade { tarefas: Tarefa[]; mensagens: Mensagem[]; arquivos: Arquivo[]; eventos: Evento[] }

interface Tarefa { id: string; titulo: string; concluida: boolean; prazo: string | null; responsavel?: { id: string; name: string } | null }

interface Mensagem { id: string; mensagem: string; createdAt: string; user?: { id: string; name: string; image?: string | null } | null }

interface Arquivo { id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; createdAt: string }

interface Evento { id: string; tipo: string; descricao: string; de: string | null; para: string | null; createdAt: string; user?: { id: string; name: string; image?: string | null } | null }

interface Stats {
  total: number
  valorTotal: number
  porEtapa: { etapaId: string; nome: string; count: number; valor: number; ehGanho: boolean; ehPerda: boolean }[]
}

interface ClienteSelect { id: string; razaoSocial: string }

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

// ============================================================
// Helpers
// ============================================================

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return 'R$ 0,00'
  return `R$ ${numeroParaMoeda(v)}`
}

function diasDesde(dateStr: string): number {
  const d = new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

/** Calcula status do SLA: 'ok' | 'warning' | 'expired' | null (sem SLA) */
function getSlaStatus(updatedAt: string, slaDias: number | null | undefined): { status: 'ok' | 'warning' | 'expired'; dias: number; limite: number } | null {
  if (!slaDias) return null
  const dias = diasDesde(updatedAt)
  const limiteWarning = Math.max(1, Math.floor(slaDias * 0.7))
  if (dias >= slaDias) return { status: 'expired', dias, limite: slaDias }
  if (dias >= limiteWarning) return { status: 'warning', dias, limite: slaDias }
  return { status: 'ok', dias, limite: slaDias }
}

function formatDate(d: string | null): string {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('pt-BR')
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-lg font-bold leading-tight mt-0.5">{value}</p>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: color }} />
    </Card>
  )
}

// ============================================================
// Main Page
// ============================================================

export default function CrmPage() {
  const router = useRouter()
  // Configurações (Etapas/Tags/Configurações) são restritas a master/empresa-master
  const { profile } = useCurrentUserProfile()
  const canManageConfig = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [tags, setTags] = useState<Array<{ id: string; nome: string; cor: string; _count: { oportunidades: number } }>>([])
  const [opcoesAtividade, setOpcoesAtividade] = useState<Array<{ id: string; valor: string }>>([])
  const [opcoesOrigem, setOpcoesOrigem] = useState<Array<{ id: string; valor: string }>>([])

  // Tags modal
  const [tagsModal, setTagsModal] = useState(false)
  const [novaTagNome, setNovaTagNome] = useState('')
  const [novaTagCor, setNovaTagCor] = useState('#94a3b8')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'kanban' | 'tabela'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('crm-view-mode') as 'kanban' | 'tabela') || 'kanban'
    return 'kanban'
  })

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', valor: '', etapaId: '', clienteId: '', responsavelId: '', previsaoFechamento: '', origem: '', atividade: '', cpfCnpj: '', razaoSocial: '', contatoNome: '', contatoCargo: '', contatoTelefone: '', contatoEmail: '', tagId: '' })
  const [clientes, setClientes] = useState<ClienteSelect[]>([])

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<OportunidadeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<'detalhes' | 'tarefas' | 'mensagens' | 'arquivos' | 'historico'>('detalhes')
  const [novaTarefa, setNovaTarefa] = useState('')
  const [novaMensagem, setNovaMensagem] = useState('')
  const [saving, setSaving] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)

  /**
   * Auto-completa dados ao digitar/colar um documento válido.
   *  - CNPJ (14 dígitos): consulta Receita Federal via SERPRO/BrasilAPI →
   *    razão, email, telefone e nome do contato (primeiro sócio admin do QSA).
   *  - CPF (11 dígitos): busca interna em Cliente PF + Sócio cadastrado →
   *    nome (como razão), email e telefone. Não consulta APIs externas
   *    (CPF é dado pessoal protegido pela LGPD).
   * Cada campo só é preenchido se estiver vazio — não pisa edição manual.
   */
  async function buscarCnpjAuto(raw: string) {
    const doc = raw.replace(/\D/g, '')
    if (doc.length !== 11 && doc.length !== 14) return
    setBuscandoCnpj(true)
    try {
      if (doc.length === 14) {
        const data = await (trpc.socio as any).consultarCnpj.query({ cnpj: doc }) as {
          razaoSocial?: string
          email?: string | null
          telefone?: string | null
          qsa?: Array<{ nome: string; qualificacao?: string; codigoQualificacao?: number }>
        }
        // Heurística pra "nome do contato": prioriza Administrador → Titular →
        // primeiro do QSA. Códigos SERPRO: 5/49 admin, 54/65 titular.
        const contatoCodigosPrioritarios = [49, 5, 10, 16, 54, 65]
        const contatoSocio = data.qsa?.find(s => s.codigoQualificacao && contatoCodigosPrioritarios.includes(s.codigoQualificacao))
          ?? data.qsa?.find(s => /administ|titular|presidente|diretor/i.test(s.qualificacao ?? ''))
          ?? data.qsa?.[0]

        setForm(f => ({
          ...f,
          razaoSocial: f.razaoSocial.trim() || data.razaoSocial || f.razaoSocial,
          contatoEmail: f.contatoEmail.trim() || (data.email ?? '') || f.contatoEmail,
          contatoTelefone: f.contatoTelefone.trim() || (data.telefone ?? '') || f.contatoTelefone,
          contatoNome: f.contatoNome.trim() || (contatoSocio?.nome ?? '') || f.contatoNome,
        }))
      } else {
        // CPF — busca interna em Cliente PF + Socio
        const data = await (trpc.crm as any).lookupPorCpf.query({ cpf: doc }) as {
          found: boolean
          nome?: string
          email?: string | null
          telefone?: string | null
        }
        if (data?.found) {
          setForm(f => ({
            ...f,
            razaoSocial: f.razaoSocial.trim() || (data.nome ?? '') || f.razaoSocial,
            contatoNome: f.contatoNome.trim() || (data.nome ?? '') || f.contatoNome,
            contatoEmail: f.contatoEmail.trim() || (data.email ?? '') || f.contatoEmail,
            contatoTelefone: f.contatoTelefone.trim() || (data.telefone ?? '') || f.contatoTelefone,
          }))
        }
      }
    } catch { /* silencioso — auto-complete não bloqueia o fluxo */ }
    finally { setBuscandoCnpj(false) }
  }
  const [editingTitle, setEditingTitle] = useState(false)

  // Config modal
  const [configModal, setConfigModal] = useState(false)
  const [declinioDias, setDeclinioDias] = useState(30)

  // Drag and drop kanban
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const lastDragXRef = useRef(0)
  const kanbanSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activeCard = activeCardId ? oportunidades.find(o => o.id === activeCardId) || null : null

  const handleKanbanDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string)
    // Captura a largura real do card no momento do drag pra evitar que ele
    // "encolha" ao virar overlay (colunas usam flex-1, largura nao e fixa).
    const initial = (event.active as any).rect?.current?.initial
    setActiveCardWidth(initial?.width ?? null)
    setDragDeltaX(0)
    lastDragXRef.current = 0
  }

  const handleKanbanDragMove = (event: { delta: { x: number; y: number } }) => {
    const dx = event.delta.x - lastDragXRef.current
    lastDragXRef.current = event.delta.x
    setDragDeltaX(dx)
  }

  const handleKanbanDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | null
    if (!overId) { setOverColumnId(null); return }
    // overId pode ser uma etapaId (coluna) ou oportunidadeId (card)
    const isColumn = etapas.some(e => e.id === overId)
    if (isColumn) { setOverColumnId(overId); return }
    // Se é um card, encontrar a coluna dele
    const overOp = oportunidades.find(o => o.id === overId)
    setOverColumnId(overOp?.etapaId || null)
  }

  const handleKanbanDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCardId(null)
    setOverColumnId(null)
    if (!over) return

    const cardId = active.id as string
    const overId = over.id as string

    // Determinar etapa destino
    const isColumn = etapas.some(e => e.id === overId)
    let targetEtapaId: string
    if (isColumn) {
      targetEtapaId = overId
    } else {
      const overOp = oportunidades.find(o => o.id === overId)
      if (!overOp) return
      targetEtapaId = overOp.etapaId
    }

    const card = oportunidades.find(o => o.id === cardId)
    if (!card) return

    const sameColumn = card.etapaId === targetEtapaId

    if (sameColumn) {
      // ── Reordenar dentro da mesma coluna ──
      const columnOps = oportunidades.filter(o => o.etapaId === targetEtapaId)
      const oldIndex = columnOps.findIndex(o => o.id === cardId)
      const newIndex = isColumn ? columnOps.length - 1 : columnOps.findIndex(o => o.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(columnOps, oldIndex, newIndex)
      // Atualizar local imediatamente
      setOportunidades(prev => {
        const others = prev.filter(o => o.etapaId !== targetEtapaId)
        return [...others, ...reordered]
      })
      // Persistir ordem no backend
      try {
        await (trpc.crm as any).reordenar.mutate({ ids: reordered.map(o => o.id) })
      } catch {
        fetchAll(true)
      }
    } else {
      // ── Mover para outra coluna ──
      const etapaDestino = etapas.find(e => e.id === targetEtapaId)
      const isDecl = etapaDestino?.nome.toLowerCase().includes('decl')

      // Confirmacao ao mover para Declinio
      if (isDecl) {
        const ok = await alerts.confirm({
          title: 'Mover para Declinio',
          text: `Esta oportunidade ficara em Declinio por ${declinioDias} dias e sera arquivada automaticamente apos este periodo.`,
          confirmText: 'Confirmar',
          icon: 'warning',
        })
        if (!ok) return
      }

      setOportunidades(prev => prev.map(o => o.id === cardId ? { ...o, etapaId: targetEtapaId, etapa: etapaDestino! } : o))
      try {
        const result = await (trpc.crm as any).moverEtapa.mutate({ id: cardId, etapaId: targetEtapaId }) as { orcamentoCriado?: { id: string; numero: number } | null }
        await fetchAll(true)
        if (result.orcamentoCriado) {
          alerts.success('Orcamento criado', `Orcamento #${result.orcamentoCriado.numero} gerado automaticamente`)
        }
      } catch {
        fetchAll(true)
      }
    }
  }

  const handleKanbanDragCancel = () => {
    setActiveCardId(null)
    setOverColumnId(null)
  }

  // Gerenciar etapas
  const [etapasModal, setEtapasModal] = useState(false)
  const [editEtapas, setEditEtapas] = useState<Etapa[]>([])
  const [novaEtapaNome, setNovaEtapaNome] = useState('')
  const [savingEtapas, setSavingEtapas] = useState(false)

  // ── Fetch data ──
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [et, kanban, st, tg, opAtiv, opOrig, cfg] = await Promise.all([
        (trpc.crm as any).listEtapas.query(),
        (trpc.crm as any).listKanban.query(),
        (trpc.crm as any).getStats.query(),
        (trpc.crm as any).listTags.query().catch(() => []),
        (trpc.cliente as any).listOpcoes.query({ tipo: 'ATIVIDADE' }).catch(() => []),
        (trpc.cliente as any).listOpcoes.query({ tipo: 'ORIGEM' }).catch(() => []),
        (trpc.crm as any).getConfig.query().catch(() => ({ declinioDias: 30 })),
      ])
      setEtapas(et)
      setOportunidades(kanban)
      setStats(st)
      setTags(tg)
      setOpcoesAtividade(opAtiv)
      setOpcoesOrigem(opOrig)
      if (cfg?.declinioDias) setDeclinioDias(cfg.declinioDias)
    } catch {
      if (!silent) alerts.error('Erro', 'Falha ao carregar dados do CRM')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Carregamento inicial
  useEffect(() => { fetchAll() }, [fetchAll])

  // Deep-link: abre o detalhe da oportunidade quando chega com `?op=<id>`
  // (usado pelo botão "Abrir no CRM" do detalhe de um evento da agenda).
  const searchParams = useSearchParams()
  const opParam = searchParams.get('op')
  useEffect(() => {
    if (!opParam) return
    openDetail(opParam)
    router.replace('/crm', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opParam])

  // SSE — atualizacao em tempo real quando outros usuarios fazem alteracoes
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let closed = false

    const connect = () => {
      if (closed) return
      try {
        const apiUrl = getApiUrl()
        es = new EventSource(`${apiUrl}/api/crm/events`)
        es.onmessage = () => {
          if (!activeCardId) fetchAll(true)
        }
        es.onerror = () => {
          es?.close()
          // Reconectar apos 15s em caso de falha
          if (!closed) retryTimeout = setTimeout(connect, 15000)
        }
      } catch {
        // EventSource nao suportado ou erro de rede
        if (!closed) retryTimeout = setTimeout(connect, 15000)
      }
    }

    connect()
    return () => { closed = true; es?.close(); clearTimeout(retryTimeout) }
  }, [fetchAll, activeCardId])

  // ── Computed ──
  const filteredOps = useMemo(() => {
    if (!search.trim()) return oportunidades
    const q = search.toLowerCase()
    return oportunidades.filter(o =>
      o.titulo.toLowerCase().includes(q) ||
      o.cliente?.razaoSocial?.toLowerCase().includes(q)
    )
  }, [oportunidades, search])

  const opsByEtapa = useMemo(() => {
    const map: Record<string, Oportunidade[]> = {}
    etapas.forEach(e => { map[e.id] = [] })
    filteredOps.forEach(o => {
      if (map[o.etapaId]) map[o.etapaId]!.push(o)
    })
    return map
  }, [filteredOps, etapas])

  const emNegociacao = useMemo(() => {
    return oportunidades.filter(o => {
      const et = etapas.find(e => e.id === o.etapaId)
      return et && !et.ehGanho && !et.ehPerda
    }).length
  }, [oportunidades, etapas])

  const taxaConversao = useMemo(() => {
    if (!stats || stats.total === 0) return '0%'
    const ganhos = stats.porEtapa.filter(e => e.ehGanho).reduce((s, e) => s + e.count, 0)
    return `${((ganhos / stats.total) * 100).toFixed(1)}%`
  }, [stats])

  // ── Create ──
  const openCreate = async () => {
    setForm({ titulo: '', descricao: '', valor: '', etapaId: etapas[0]?.id || '', clienteId: '', responsavelId: '', previsaoFechamento: '', origem: '', atividade: '', cpfCnpj: '', razaoSocial: '', contatoNome: '', contatoCargo: '', contatoTelefone: '', contatoEmail: '', tagId: '' })
    setCreateOpen(true)
    try {
      const c = await (trpc.cliente as any).listForSelect.query()
      setClientes(c)
    } catch { /* ignore */ }
  }

  const handleCreate = async () => {
    if (!form.titulo.trim()) { alerts.warning('Campo obrigatorio', 'Informe o titulo da oportunidade'); return }

    // Verificar se cliente ja existe
    try {
      const nomeCheck = form.razaoSocial.trim() || form.titulo.trim()
      const check = await (trpc.crm as any).checkCliente.query({ cpfCnpj: form.cpfCnpj.trim() || undefined, razaoSocial: nomeCheck || undefined }) as { exists: boolean; cliente?: { id: string; razaoSocial: string; documento: string; situacao: string; isLead: boolean } }
      if (check.exists && check.cliente) {
        const ok = await alerts.confirm({
          title: 'Cliente ja cadastrado',
          text: `"${check.cliente.razaoSocial}" (${check.cliente.documento || 'sem documento'}) ja esta cadastrado com situacao "${check.cliente.situacao}". Deseja vincular esta oportunidade ao cliente existente?`,
          confirmText: 'Sim, vincular',
          icon: 'info',
        })
        if (!ok) return
        // Vincular ao existente
        form.clienteId = check.cliente.id
      }
    } catch { /* continuar sem verificacao */ }

    setCreating(true)
    try {
      const created = await (trpc.crm as any).create.mutate({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || undefined,
        valor: form.valor ? moedaParaNumero(form.valor) : undefined,
        etapaId: form.etapaId || undefined,
        clienteId: form.clienteId || undefined,
        responsavelId: form.responsavelId || undefined,
        previsaoFechamento: form.previsaoFechamento || undefined,
        origem: form.origem || undefined,
        atividade: form.atividade || undefined,
        cpfCnpj: form.cpfCnpj.trim() || undefined,
        razaoSocial: form.razaoSocial.trim() || undefined,
        contatoNome: form.contatoNome.trim() || undefined,
        contatoCargo: form.contatoCargo.trim() || undefined,
        contatoTelefone: form.contatoTelefone.trim() || undefined,
        contatoEmail: form.contatoEmail.trim() || undefined,
      })
      // Vincular tag selecionada
      if (form.tagId && created?.id) {
        await (trpc.crm as any).addTag.mutate({ oportunidadeId: created.id, tagId: form.tagId }).catch(() => {})
      }
      setCreateOpen(false)
      alerts.success('Oportunidade criada')
      fetchAll()
    } catch {
      alerts.error('Erro', 'Falha ao criar oportunidade')
    } finally {
      setCreating(false)
    }
  }

  // ── Detail ──
  const openDetail = async (id: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailTab('detalhes')
    try {
      const d = await (trpc.crm as any).getById.query({ id })
      setDetail(d)
    } catch {
      alerts.error('Erro', 'Falha ao carregar oportunidade')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Move etapa ──
  const moverPara = async (opId: string, etapaId: string) => {
    try {
      const result = await (trpc.crm as any).moverEtapa.mutate({ id: opId, etapaId }) as { orcamentoCriado?: { id: string; numero: number } | null }
      fetchAll(true)
      if (detail?.id === opId) {
        const d = await (trpc.crm as any).getById.query({ id: opId })
        setDetail(d)
      }
      // Notificar se orcamento foi criado automaticamente
      if (result.orcamentoCriado) {
        alerts.success('Orcamento criado', `Orcamento #${result.orcamentoCriado.numero} gerado automaticamente`)
      }
    } catch {
      alerts.error('Erro', 'Falha ao mover oportunidade')
    }
  }

  // ── Delete ──
  // ── Gerenciar Etapas ──
  const openEtapasModal = () => {
    setEditEtapas(etapas.map(e => ({ ...e })))
    setNovaEtapaNome('')
    setEtapasModal(true)
  }

  const handleAddEtapa = async () => {
    if (!novaEtapaNome.trim()) return
    setSavingEtapas(true)
    try {
      await (trpc.crm as any).createEtapa.mutate({ nome: novaEtapaNome.trim() })
      setNovaEtapaNome('')
      const fresh = await (trpc.crm as any).listEtapas.query() as Etapa[]
      setEditEtapas(fresh)
      setEtapas(fresh)
    } catch (err) { alerts.error('Erro', (err as Error).message) }
    finally { setSavingEtapas(false) }
  }

  const handleDeleteEtapa = async (id: string, nome: string) => {
    const ok = await alerts.confirmDelete(nome)
    if (!ok) return
    try {
      await (trpc.crm as any).deleteEtapa.mutate({ id })
      const fresh = await (trpc.crm as any).listEtapas.query() as Etapa[]
      setEditEtapas(fresh)
      setEtapas(fresh)
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = editEtapas.findIndex(e => e.id === active.id)
    const newIndex = editEtapas.findIndex(e => e.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(editEtapas, oldIndex, newIndex)
    // Atualizar ordem local imediatamente
    const withNewOrder = reordered.map((e, i) => ({ ...e, ordem: i + 1 }))
    setEditEtapas(withNewOrder)
    // Salvar todas as ordens no backend
    for (const e of withNewOrder) {
      await (trpc.crm as any).updateEtapa.mutate({ id: e.id, data: { ordem: e.ordem } }).catch(() => {})
    }
    setEtapas(withNewOrder)
  }

  const handleSaveEtapa = async (id: string, data: { nome?: string; cor?: string; probabilidade?: number; ordem?: number; slaDias?: number | null }) => {
    try {
      await (trpc.crm as any).updateEtapa.mutate({ id, data })
      setEditEtapas(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  // ── Tags ──
  const handleCreateTag = async () => {
    if (!novaTagNome.trim()) return
    try {
      await (trpc.crm as any).createTag.mutate({ nome: novaTagNome.trim(), cor: novaTagCor })
      setNovaTagNome('')
      setNovaTagCor('#94a3b8')
      const fresh = await (trpc.crm as any).listTags.query()
      setTags(fresh)
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const handleUpdateTag = async (id: string, data: { nome?: string; cor?: string }) => {
    try {
      await (trpc.crm as any).updateTag.mutate({ id, ...data })
      setTags(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const handleDeleteTag = async (id: string, nome: string) => {
    const ok = await alerts.confirmDelete(nome)
    if (!ok) return
    try {
      await (trpc.crm as any).deleteTag.mutate({ id })
      setTags(prev => prev.filter(t => t.id !== id))
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const handleDelete = async (id: string, titulo: string) => {
    const ok = await alerts.confirmDelete(titulo)
    if (!ok) return
    try {
      await (trpc.crm as any).delete.mutate({ id })
      alerts.success('Oportunidade excluida')
      setDetailOpen(false)
      fetchAll()
    } catch {
      alerts.error('Erro', 'Falha ao excluir')
    }
  }

  // ── Tarefas ──
  const addTarefa = async () => {
    if (!novaTarefa.trim() || !detail) return
    setSaving(true)
    try {
      await (trpc.crm as any).addTarefa.mutate({ oportunidadeId: detail.id, titulo: novaTarefa.trim() })
      const d = await (trpc.crm as any).getById.query({ id: detail.id })
      setDetail(d)
      setNovaTarefa('')
    } catch {
      alerts.error('Erro', 'Falha ao adicionar tarefa')
    } finally {
      setSaving(false)
    }
  }

  const toggleTarefa = async (tarefaId: string) => {
    if (!detail) return
    try {
      await (trpc.crm as any).toggleTarefa.mutate({ id: tarefaId })
      const d = await (trpc.crm as any).getById.query({ id: detail.id })
      setDetail(d)
    } catch { /* ignore */ }
  }

  const deleteTarefa = async (tarefaId: string) => {
    if (!detail) return
    try {
      await (trpc.crm as any).deleteTarefa.mutate({ id: tarefaId })
      const d = await (trpc.crm as any).getById.query({ id: detail.id })
      setDetail(d)
    } catch { /* ignore */ }
  }

  // ── Mensagens ──
  const addMensagem = async () => {
    if (!novaMensagem.trim() || !detail) return
    setSaving(true)
    try {
      await (trpc.crm as any).addMensagem.mutate({ oportunidadeId: detail.id, mensagem: novaMensagem.trim() })
      const d = await (trpc.crm as any).getById.query({ id: detail.id })
      setDetail(d)
      setNovaMensagem('')
    } catch {
      alerts.error('Erro', 'Falha ao enviar mensagem')
    } finally {
      setSaving(false)
    }
  }

  // ── Arquivos ──
  const uploadArquivos = async (files: FileList | File[]) => {
    if (!detail) return
    setSaving(true)
    const apiUrl = getApiUrl()
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
        if (!res.ok) throw new Error('Falha no upload')
        const data = await res.json()
        const fileUrl = data.url || `${apiUrl}/api/upload/${data.filename}`
        await (trpc.crm as any).addArquivo.mutate({
          oportunidadeId: detail.id,
          fileName: file.name,
          fileUrl,
          fileSize: file.size,
          mimeType: file.type,
        })
      }
      const d = await (trpc.crm as any).getById.query({ id: detail.id })
      setDetail(d)
    } catch {
      alerts.error('Erro', 'Falha ao enviar arquivo')
    } finally {
      setSaving(false)
    }
  }

  const removeArquivo = async (arquivoId: string, fileName: string) => {
    if (!detail) return
    const ok = await alerts.confirm({ title: 'Excluir arquivo', text: `Remover "${fileName}"?`, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.crm as any).removeArquivo.mutate({ id: arquivoId })
      const d = await (trpc.crm as any).getById.query({ id: detail.id })
      setDetail(d)
    } catch { /* ignore */ }
  }

  // ── Save detail inline ──
  const saveDetail = async (data: Record<string, unknown>) => {
    if (!detail) return
    setSaving(true)
    try {
      await (trpc.crm as any).update.mutate({ id: detail.id, data })
      const d = await (trpc.crm as any).getById.query({ id: detail.id })
      setDetail(d)
      fetchAll()
    } catch {
      alerts.error('Erro', 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-90px)]" suppressHydrationWarning>
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Target className="h-6 w-6" />
          </div>
          <div>
            <h1>CRM — Oportunidades</h1>
            <p className="text-sm text-muted-foreground">Gerencie oportunidades de negocio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar oportunidade..."
            className="h-9 w-56 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex items-center border rounded-[2px] overflow-hidden">
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('kanban'); localStorage.setItem('crm-view-mode', 'kanban') }} title="Kanban">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'tabela' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('tabela'); localStorage.setItem('crm-view-mode', 'tabela') }} title="Tabela">
              <List className="h-4 w-4" />
            </button>
          </div>
          {canManageConfig && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openEtapasModal}>
                  <Layers className="h-4 w-4 mr-2" /> Gerenciar Etapas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTagsModal(true)}>
                  <Tag className="h-4 w-4 mr-2" /> Gerenciar Tags
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setConfigModal(true)}>
                  <SlidersHorizontal className="h-4 w-4 mr-2" /> Configurações
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <FileText className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push('/crm/relatorios?tab=funil')}>
                <TrendingUp className="h-4 w-4 mr-2" /> Funil de Vendas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/crm/relatorios?tab=desempenho')}>
                <Target className="h-4 w-4 mr-2" /> Desempenho por Responsavel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/crm/relatorios?tab=origem')}>
                <ArrowRight className="h-4 w-4 mr-2" /> Oportunidades por Origem
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/crm/relatorios?tab=tempo')}>
                <Clock className="h-4 w-4 mr-2" /> Tempo Medio por Etapa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova Oportunidade
          </Button>
        </div>
      </div>

      {/* ── Board / Table ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && viewMode === 'tabela' ? (
        /* ── Visao Tabela ── */
        <Card>
          {filteredOps.length === 0 ? (
            <div className="text-center py-16"><p className="text-sm text-muted-foreground">Nenhuma oportunidade encontrada.</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="whitespace-nowrap">
                  <TableHead>Titulo</TableHead>
                  <TableHead className="w-[140px]">Etapa</TableHead>
                  <TableHead className="w-[180px]">Cliente</TableHead>
                  <TableHead className="w-[100px]">Criado</TableHead>
                  <TableHead className="w-[44px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOps.map(op => (
                  <TableRow key={op.id} className="cursor-pointer whitespace-nowrap hover:bg-muted/50" onClick={() => openDetail(op.id)}>
                    <TableCell className="font-medium text-sm truncate max-w-[300px]">{op.titulo}</TableCell>
                    <TableCell>
                      <Badge className="text-[10px] px-1.5 py-0.5 text-white" style={{ backgroundColor: op.etapa.cor }}>{op.etapa.nome}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs truncate max-w-[180px]">{(op as any).cliente?.razaoSocial || '--'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(op.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {etapas.filter(e => e.id !== op.etapaId).map(e => (
                            <DropdownMenuItem key={e.id} onClick={() => moverPara(op.id, e.id)}>
                              <ArrowRight className="h-3.5 w-3.5 mr-2" style={{ color: e.cor }} /> Mover para {e.nome}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(op.id, op.titulo)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : (
        /* ── Visao Kanban ── */
        <DndContext sensors={kanbanSensors} collisionDetection={closestCenter} onDragStart={handleKanbanDragStart} onDragMove={handleKanbanDragMove} onDragOver={handleKanbanDragOver} onDragEnd={handleKanbanDragEnd} onDragCancel={handleKanbanDragCancel}>
        <div className="overflow-x-auto pb-4 -mx-1 flex-1">
          <div className="flex gap-3 px-1 h-full" style={{ minWidth: etapas.length > 0 ? `${etapas.length * 220}px` : undefined, width: '100%' }}>
            {etapas.map(etapa => {
              const ops = opsByEtapa[etapa.id] || []
              return <KanbanColumn key={etapa.id} etapa={etapa} ops={ops} isOver={overColumnId === etapa.id} activeCardId={activeCardId} etapas={etapas} onOpenDetail={openDetail} onMover={moverPara} onDelete={handleDelete} diasDesde={diasDesde} declinioDias={declinioDias} />
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeCard && <KanbanCardOverlay op={activeCard} diasDesde={diasDesde} velocityX={dragDeltaX} width={activeCardWidth} />}
        </DragOverlay>
        </DndContext>
      )}

      {/* ── Create Sheet ── */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" size="xl" className="w-[75vw] max-w-[1200px]">
          <SheetHeader className="border-b-0 bg-transparent">
            <div className="absolute right-14 top-4 z-10">
              <button className="flex h-7 w-7 items-center justify-center rounded-md opacity-60 transition-all hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10" disabled={creating} onClick={handleCreate} title="Salvar">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </button>
            </div>
            <SheetTitle className="text-base pr-24">Nova Oportunidade</SheetTitle>
          </SheetHeader>

          <SheetBody className="px-6 py-5 space-y-5">
            {/* Pipeline */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Pipeline</label>
              <div className="flex items-stretch overflow-hidden rounded" style={{ gap: '0.5px' }}>
                {etapas.filter(e => !e.ehPerda && !e.ehGanho && !e.nome.toLowerCase().includes('decl')).map((e, idx, arr) => {
                  const isActive = form.etapaId === e.id
                  const activeIdx = arr.findIndex(et => et.id === form.etapaId)
                  const isPast = activeIdx >= 0 && activeIdx > idx
                  return (
                    <button key={e.id} onClick={() => setForm(f => ({ ...f, etapaId: e.id }))}
                      className={cn('relative flex items-center justify-center text-[11px] font-medium py-2 transition-all flex-1 min-w-0', idx > 0 && 'pl-3', isActive || isPast ? 'text-white' : 'text-muted-foreground hover:text-foreground', !isActive && 'cursor-pointer')}
                      style={{ backgroundColor: isActive || isPast ? MODULE_COLOR : '#e2e5ea', opacity: isActive ? 1 : isPast ? 0.7 : 1, clipPath: idx === 0 ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)' : idx < arr.length - 1 ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)' : 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)' }}
                    >
                      <span className="truncate px-1">{e.nome.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Titulo */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Oportunidade *</label>
              <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Titulo da oportunidade" className="h-9 text-sm" />
            </div>
            {/* CPF/CNPJ + Empresa/Cliente — CNPJ válido dispara auto-complete da razão via Receita */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CPF / CNPJ</label>
                <div className="relative">
                  <Input
                    value={form.cpfCnpj}
                    onChange={e => setForm(f => ({ ...f, cpfCnpj: masks.cpfCnpj(e.target.value) }))}
                    onBlur={e => buscarCnpjAuto(e.target.value)}
                    onPaste={e => {
                      // Busca direto se o user colar um documento completo (CPF=11, CNPJ=14)
                      const len = e.clipboardData.getData('text').replace(/\D/g, '').length
                      if (len === 11 || len === 14) {
                        const pasted = e.clipboardData.getData('text')
                        setTimeout(() => buscarCnpjAuto(pasted), 0)
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                    className="h-9 text-sm pr-8"
                  />
                  {buscandoCnpj && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="col-span-9">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Empresa / Cliente *</label>
                <Input value={form.razaoSocial} onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value }))} placeholder="Nome da empresa ou cliente" className="h-9 text-sm" />
              </div>
            </div>
            {/* Atividade + Origem */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Atividade</label>
                <Select value={form.atividade} onValueChange={v => setForm(f => ({ ...f, atividade: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{opcoesAtividade.map(a => <SelectItem key={a.id} value={a.valor}>{a.valor}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-6">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Origem</label>
                <Select value={form.origem} onValueChange={v => setForm(f => ({ ...f, origem: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{opcoesOrigem.map(o => <SelectItem key={o.id} value={o.valor}>{o.valor}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {/* Contato: nome + cargo */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-8">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do contato</label>
                <Input value={form.contatoNome} onChange={e => setForm(f => ({ ...f, contatoNome: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="col-span-4">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Cargo</label>
                <Input value={form.contatoCargo} onChange={e => setForm(f => ({ ...f, contatoCargo: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            {/* Contato: telefone + email */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Telefones</label>
                <Input value={form.contatoTelefone} onChange={e => setForm(f => ({ ...f, contatoTelefone: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="col-span-6">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">E-mail</label>
                <Input value={form.contatoEmail} onChange={e => setForm(f => ({ ...f, contatoEmail: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            {/* Tag */}
            {tags.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tag</label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => {
                    const selected = (form as any).tagId === tag.id
                    return (
                      <button key={tag.id} type="button"
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer border transition-all hover:shadow-sm"
                        style={selected ? { backgroundColor: tag.cor, color: '#fff', borderColor: tag.cor } : { backgroundColor: `${tag.cor}15`, color: tag.cor, borderColor: `${tag.cor}30` }}
                        onClick={() => setForm(f => ({ ...f, tagId: selected ? '' : tag.id } as any))}
                      >{tag.nome}</button>
                    )
                  })}
                </div>
              </div>
            )}
            {/* Descricao */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Detalhes da oportunidade</label>
              <RichEditor value={form.descricao} onChange={v => setForm(f => ({ ...f, descricao: v }))} placeholder="Informe abaixo os detalhes da oportunidade..." />
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* ── Detail Sheet (slide-over) ── */}
      <Sheet open={detailOpen} onOpenChange={open => { setDetailOpen(open); if (!open) fetchAll(true) }}>
        <SheetContent side="right" size="xl" className="w-[75vw] max-w-[1200px]">
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-16 flex-1">
              <SheetTitle className="sr-only">Carregando</SheetTitle>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <SheetHeader className="border-b-0 bg-transparent">
                <div className="absolute right-14 top-4 z-10">
                  <button className="flex h-7 w-7 items-center justify-center rounded-md opacity-60 transition-all hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10" disabled={saving} onClick={() => {
                    const btn = document.getElementById('detail-save-btn') as HTMLButtonElement
                    if (btn) btn.click()
                  }} title="Salvar">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-3 pr-24">
                  {(detail as any).responsavel ? (
                    (detail as any).responsavel.image ? (
                      <img src={resolveAssetUrl((detail as any).responsavel.image)} alt={(detail as any).responsavel.name} title={(detail as any).responsavel.name} className="h-10 w-10 rounded-full object-cover shrink-0 border-2 border-background shadow-sm" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 border-2 border-background shadow-sm" title={(detail as any).responsavel.name}>
                        <span className="text-sm font-bold text-muted-foreground">{((detail as any).responsavel.name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
                      </div>
                    )
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-base">
                      {editingTitle ? (
                        <input
                          type="text"
                          autoFocus
                          defaultValue={detail.titulo}
                          className="w-full bg-background text-base font-semibold outline-none border border-border rounded px-2 py-1 -mx-2"
                          onBlur={e => {
                            const newTitle = e.target.value.trim()
                            if (newTitle && newTitle !== detail.titulo) saveDetail({ titulo: newTitle })
                            setEditingTitle(false)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
                            if (e.key === 'Escape') { setEditingTitle(false) }
                          }}
                        />
                      ) : (
                        <span className="block truncate cursor-text hover:text-muted-foreground transition-colors" onClick={() => setEditingTitle(true)}>
                          {detail.titulo}
                        </span>
                      )}
                    </SheetTitle>
                    {((detail as any).razaoSocial || (detail as any).cliente?.razaoSocial) && (
                      <SheetDescription className="mt-0.5">
                        {(detail as any).razaoSocial || (detail as any).cliente?.razaoSocial}
                      </SheetDescription>
                    )}
                  </div>
                </div>
              </SheetHeader>

              {/* Tabs */}
              <div className="flex gap-4 px-6 shrink-0 border-b border-border/40">
                {([
                  { key: 'detalhes' as const, label: 'Detalhes', icon: Target },
                  { key: 'tarefas' as const, label: `Tarefas (${detail.tarefas.length})`, icon: CheckSquare },
                  { key: 'mensagens' as const, label: `Mensagens (${detail.mensagens.length})`, icon: MessageSquare },
                  { key: 'arquivos' as const, label: `Arquivos (${detail.arquivos.length})`, icon: Paperclip },
                  { key: 'historico' as const, label: 'Historico', icon: History },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className={cn(
                      'px-1 py-2.5 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
                      detailTab === tab.key
                        ? 'text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                    style={detailTab === tab.key ? { borderBottomColor: MODULE_COLOR } : undefined}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <SheetBody key={detailTab} className="px-6 py-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
                {/* ── Detalhes Tab ── */}
                {detailTab === 'detalhes' && (
                  <DetailTab detail={detail} etapas={etapas} clientes={clientes} onSave={saveDetail} onMove={moverPara} saving={saving} tags={tags} opcoesAtividade={opcoesAtividade} opcoesOrigem={opcoesOrigem} loadClientes={async () => {
                    try { const c = await (trpc.cliente as any).listForSelect.query(); setClientes(c) } catch { /* ignore */ }
                  }} />
                )}

                {/* ── Tarefas Tab ── */}
                {detailTab === 'tarefas' && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Adicionar tarefa..."
                        value={novaTarefa}
                        onChange={e => setNovaTarefa(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addTarefa()}
                        className="h-9 text-sm flex-1"
                      />
                      <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={addTarefa} disabled={saving || !novaTarefa.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {detail.tarefas.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma tarefa cadastrada</p>
                    )}
                    <div className="space-y-1">
                      {detail.tarefas.map(t => (
                        <div key={t.id} className="flex items-center gap-2 rounded-md border px-3 py-2 group hover:bg-muted/30 transition-colors">
                          <button onClick={() => toggleTarefa(t.id)} className="shrink-0">
                            <CheckCircle2 className={cn('h-4 w-4', t.concluida ? 'text-emerald-500' : 'text-muted-foreground/40')} />
                          </button>
                          <span className={cn('text-sm flex-1', t.concluida && 'line-through text-muted-foreground')}>{t.titulo}</span>
                          {t.prazo && <span className="text-[10px] text-muted-foreground">{formatDate(t.prazo)}</span>}
                          <button onClick={() => deleteTarefa(t.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Mensagens Tab ── */}
                {detailTab === 'mensagens' && (
                  <div className="space-y-3">
                    {/* Campo no topo (igual às Tarefas) — evita colidir com o widget de ajuda. */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Escreva uma mensagem..."
                        value={novaMensagem}
                        onChange={e => setNovaMensagem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addMensagem()}
                        className="h-9 text-sm flex-1"
                      />
                      <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={addMensagem} disabled={saving || !novaMensagem.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    {detail.mensagens.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma mensagem</p>
                    )}
                    <div className="space-y-3">
                      {detail.mensagens.map(m => (
                        <div key={m.id} className="rounded-md bg-muted/40 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold">{m.user?.name || 'Sistema'}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleString('pt-BR')}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{m.mensagem}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Arquivos Tab ── */}
                {detailTab === 'arquivos' && (
                  <ArquivosTab
                    arquivos={detail.arquivos}
                    uploading={saving}
                    onUpload={uploadArquivos}
                    onRemove={removeArquivo}
                  />
                )}

                {/* ── Historico Tab ── */}
                {detailTab === 'historico' && (
                  <HistoricoTab eventos={detail.eventos || []} />
                )}
              </SheetBody>

            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Gerenciar Tags Modal ── */}
      <Dialog open={tagsModal} onOpenChange={setTagsModal}>
        <DialogContent className="max-w-[450px]">
          <DialogHeaderIcon icon={Tag} color="amber">
            <DialogTitle className="text-[15px]">Gerenciar Tags</DialogTitle>
            <DialogDescription className="text-[11px]">Crie tags para categorizar oportunidades</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-2 max-h-[50vh] overflow-y-auto">
            {tags.map(tag => (
              <div key={tag.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30">
                <input type="color" value={tag.cor} onChange={e => handleUpdateTag(tag.id, { cor: e.target.value })} className="h-7 w-7 rounded border cursor-pointer shrink-0" />
                <Input
                  value={tag.nome}
                  onChange={e => setTags(prev => prev.map(t => t.id === tag.id ? { ...t, nome: e.target.value } : t))}
                  onBlur={() => handleUpdateTag(tag.id, { nome: tag.nome })}
                  className="h-8 text-sm flex-1"
                />
                <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDeleteTag(tag.id, tag.nome)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {tags.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tag criada</p>}
            <div className="flex items-center gap-2 pt-2 border-t">
              <input type="color" value={novaTagCor} onChange={e => setNovaTagCor(e.target.value)} className="h-7 w-7 rounded border cursor-pointer shrink-0" />
              <Input placeholder="Nome da nova tag..." value={novaTagNome} onChange={e => setNovaTagNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateTag() }} className="h-8 text-sm flex-1" />
              <Button size="sm" variant="outline" className="h-8 gap-1 shrink-0" onClick={handleCreateTag} disabled={!novaTagNome.trim()}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTagsModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Gerenciar Etapas Modal ── */}
      <Dialog open={etapasModal} onOpenChange={setEtapasModal}>
        <DialogContent className="max-w-[550px]">
          <DialogHeaderIcon icon={Settings2} color="slate">
            <DialogTitle className="text-[15px]">Gerenciar Etapas do Pipeline</DialogTitle>
            <DialogDescription className="text-[11px]">Edite nome, cor, probabilidade e ordem das etapas</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3 max-h-[60vh] overflow-y-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={editEtapas.sort((a, b) => a.ordem - b.ordem).map(e => e.id)} strategy={verticalListSortingStrategy}>
                {editEtapas.sort((a, b) => a.ordem - b.ordem).map((etapa, idx) => (
                  <SortableEtapaRow
                    key={etapa.id}
                    etapa={etapa}
                    idx={idx}
                    onSave={handleSaveEtapa}
                    onChangeName={(id, nome) => setEditEtapas(prev => prev.map(et => et.id === id ? { ...et, nome } : et))}
                    onChangeProb={(id, prob) => setEditEtapas(prev => prev.map(et => et.id === id ? { ...et, probabilidade: prob } : et))}
                    onChangeSla={(id, sla) => setEditEtapas(prev => prev.map(et => et.id === id ? { ...et, slaDias: sla } : et))}
                    onDelete={handleDeleteEtapa}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Adicionar nova etapa */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                placeholder="Nome da nova etapa..."
                value={novaEtapaNome}
                onChange={e => setNovaEtapaNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddEtapa() }}
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" variant="outline" className="h-8 gap-1 shrink-0" onClick={handleAddEtapa} disabled={!novaEtapaNome.trim() || savingEtapas}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setEtapasModal(false); fetchAll() }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Config Modal ── */}
      <Dialog open={configModal} onOpenChange={setConfigModal}>
        <DialogContent className="max-w-[400px]">
          <DialogHeaderIcon icon={Settings2} color="slate">
            <DialogTitle className="text-[15px]">Configuracoes do CRM</DialogTitle>
            <DialogDescription className="text-[11px]">Ajuste o comportamento do pipeline</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Dias em Declinio antes de arquivar</label>
              <p className="text-[11px] text-muted-foreground mb-2">Oportunidades movidas para Declinio serao arquivadas automaticamente apos este periodo.</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={declinioDias}
                  onChange={e => setDeclinioDias(parseInt(e.target.value) || 30)}
                  className="h-9 text-sm w-24"
                />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigModal(false)}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={async () => {
              try {
                await (trpc.crm as any).saveConfig.mutate({ key: 'declinio_dias', value: String(declinioDias) })
                alerts.success('Salvo', 'Configuracao atualizada')
                setConfigModal(false)
              } catch {
                alerts.error('Erro', 'Falha ao salvar configuracao')
              }
            }}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ============================================================
// Detail Tab (inline edit)
// ============================================================

function DetailTab({ detail, etapas, clientes, onSave, onMove, saving, loadClientes, tags, opcoesAtividade, opcoesOrigem }: {
  detail: OportunidadeDetail
  etapas: Etapa[]
  clientes: ClienteSelect[]
  onSave: (data: Record<string, unknown>) => Promise<void>
  onMove: (opId: string, etapaId: string) => Promise<void>
  saving: boolean
  loadClientes: () => Promise<void>
  tags: Array<{ id: string; nome: string; cor: string }>
  opcoesAtividade: Array<{ id: string; valor: string }>
  opcoesOrigem: Array<{ id: string; valor: string }>
}) {
  const [titulo, setTitulo] = useState(detail.titulo)
  const [descricao, setDescricao] = useState(detail.descricao || '')
  const [cpfCnpj, setCpfCnpj] = useState((detail as any).cpfCnpj || '')
  const [razaoSocial, setRazaoSocial] = useState((detail as any).razaoSocial || '')
  const [atividade, setAtividade] = useState((detail as any).atividade || '')
  const [origem, setOrigem] = useState(detail.origem || '')
  const [contatoNome, setContatoNome] = useState((detail as any).contatoNome || '')
  const [contatoCargo, setContatoCargo] = useState((detail as any).contatoCargo || '')
  const [contatoTelefone, setContatoTelefone] = useState((detail as any).contatoTelefone || '')
  const [contatoEmail, setContatoEmail] = useState((detail as any).contatoEmail || '')
  const [dirty, setDirty] = useState(false)
  const [activeTagId, setActiveTagId] = useState((detail as any).tags?.[0]?.tagId || '')

  useEffect(() => { loadClientes() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTitulo(detail.titulo)
    setDescricao(detail.descricao || '')
    setCpfCnpj((detail as any).cpfCnpj || '')
    setRazaoSocial((detail as any).razaoSocial || '')
    setAtividade((detail as any).atividade || '')
    setOrigem(detail.origem || '')
    setContatoNome((detail as any).contatoNome || '')
    setContatoCargo((detail as any).contatoCargo || '')
    setContatoTelefone((detail as any).contatoTelefone || '')
    setContatoEmail((detail as any).contatoEmail || '')
    setActiveTagId((detail as any).tags?.[0]?.tagId || '')
    setDirty(false)
  }, [detail])

  const handleSave = () => {
    onSave({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      cpfCnpj: cpfCnpj.trim() || null,
      razaoSocial: razaoSocial.trim() || null,
      atividade: atividade || null,
      origem: origem || null,
      contatoNome: contatoNome.trim() || null,
      contatoCargo: contatoCargo.trim() || null,
      contatoTelefone: contatoTelefone.trim() || null,
      contatoEmail: contatoEmail.trim() || null,
    })
    setDirty(false)
  }

  const markDirty = () => setDirty(true)

  return (
    <div className="space-y-5">
      {/* Pipeline (chevron arrows) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Pipeline</label>
        <div className="flex items-stretch overflow-hidden rounded" style={{ gap: '0.5px' }}>
          {etapas.filter(e => !e.ehPerda && !e.ehGanho && !e.nome.toLowerCase().includes('decl')).map((e, idx, arr) => {
            const isActive = e.id === detail.etapaId
            const activeIdx = arr.findIndex(et => et.id === detail.etapaId)
            const isPast = activeIdx >= 0 && activeIdx > idx
            return (
              <button
                key={e.id}
                onClick={() => { if (!isActive) onMove(detail.id, e.id) }}
                className={cn(
                  'relative flex items-center justify-center text-[11px] font-medium py-2 transition-all flex-1 min-w-0',
                  idx > 0 && 'pl-3',
                  isActive ? 'text-white' : isPast ? 'text-white/90' : 'text-muted-foreground hover:text-foreground',
                  !isActive && 'cursor-pointer',
                )}
                style={{
                  backgroundColor: isActive || isPast ? MODULE_COLOR : '#e2e5ea',
                  opacity: isActive ? 1 : isPast ? 0.7 : 1,
                  clipPath: idx === 0
                    ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)'
                    : idx < arr.length - 1
                      ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)'
                      : 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)',
                }}
              >
                <span className="truncate px-1">{e.nome.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* CPF/CNPJ + Empresa */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">CPF / CNPJ</label>
          <Input value={cpfCnpj} onChange={e => { setCpfCnpj(e.target.value); markDirty() }} className="h-9 text-sm" />
        </div>
        <div className="col-span-9">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Empresa / Cliente *</label>
          <Input value={razaoSocial} onChange={e => { setRazaoSocial(e.target.value); markDirty() }} className="h-9 text-sm" />
        </div>
      </div>

      {/* Atividade + Origem */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Atividade</label>
          <Select value={atividade} onValueChange={v => { setAtividade(v); markDirty() }}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{opcoesAtividade.map(a => <SelectItem key={a.id} value={a.valor}>{a.valor}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-6">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Origem</label>
          <Select value={origem} onValueChange={v => { setOrigem(v); markDirty() }}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{opcoesOrigem.map(o => <SelectItem key={o.id} value={o.valor}>{o.valor}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Contato: nome + cargo */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-8">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do contato</label>
          <Input value={contatoNome} onChange={e => { setContatoNome(e.target.value); markDirty() }} className="h-9 text-sm" />
        </div>
        <div className="col-span-4">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Cargo</label>
          <Input value={contatoCargo} onChange={e => { setContatoCargo(e.target.value); markDirty() }} className="h-9 text-sm" />
        </div>
      </div>

      {/* Contato: telefone + email */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Telefones</label>
          <Input value={contatoTelefone} onChange={e => { setContatoTelefone(e.target.value); markDirty() }} className="h-9 text-sm" />
        </div>
        <div className="col-span-6">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">E-mail</label>
          <Input value={contatoEmail} onChange={e => { setContatoEmail(e.target.value); markDirty() }} className="h-9 text-sm" />
        </div>
      </div>

      {/* Tag (selecao unica) */}
      {tags.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tag</label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(tag => {
              const isActive = activeTagId === tag.id
              return (
                <button key={tag.id} type="button"
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer border transition-all hover:shadow-sm"
                  style={isActive
                    ? { backgroundColor: tag.cor, color: '#fff', borderColor: tag.cor }
                    : { backgroundColor: `${tag.cor}15`, color: tag.cor, borderColor: `${tag.cor}30` }
                  }
                  onClick={async () => {
                    if (isActive) {
                      setActiveTagId('')
                      await (trpc.crm as any).removeTag.mutate({ oportunidadeId: detail.id, tagId: tag.id }).catch(() => {})
                    } else {
                      const prevTagId = activeTagId
                      setActiveTagId(tag.id)
                      if (prevTagId) await (trpc.crm as any).removeTag.mutate({ oportunidadeId: detail.id, tagId: prevTagId }).catch(() => {})
                      await (trpc.crm as any).addTag.mutate({ oportunidadeId: detail.id, tagId: tag.id }).catch(() => {})
                    }
                  }}
                >{tag.nome}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* Eventos da agenda vinculados (vínculo bidirecional com a Agenda) */}
      {(() => {
        const agendaEventos = (detail as unknown as { agendaEventos?: Array<{
          id: string; titulo: string; data: string; horaInicio: string | null; diaInteiro: boolean
          tipo: { nome: string; cor: string } | null
        }> }).agendaEventos ?? []
        if (agendaEventos.length === 0) return null
        return (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Eventos da agenda vinculados ({agendaEventos.length})
            </label>
            <div className="space-y-1.5">
              {agendaEventos.map(ev => {
                const d = new Date(ev.data)
                const dataFmt = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
                const horaFmt = ev.diaInteiro ? 'Dia inteiro' : (ev.horaInicio ?? '')
                return (
                  <Link
                    key={ev.id}
                    href={`/agenda?verEvento=${ev.id}`}
                    className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <span className="h-7 w-1.5 rounded-full shrink-0" style={{ backgroundColor: ev.tipo?.cor || '#818cf8' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{ev.titulo}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {dataFmt}{horaFmt && ` · ${horaFmt}`}{ev.tipo?.nome && ` · ${ev.tipo.nome}`}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Descricao (editor) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Detalhes da oportunidade</label>
        <RichEditor value={descricao} onChange={v => { setDescricao(v); markDirty() }} placeholder="Informe os detalhes..." />
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        Criado em {new Date(detail.createdAt).toLocaleDateString('pt-BR')} ({diasDesde(detail.createdAt)} dias atras)
      </div>

      {/* Hidden trigger for footer save button */}
      <button id="detail-save-btn" type="button" className="hidden" onClick={handleSave} />
    </div>
  )
}

// ============================================================
// Sortable Etapa Row (drag-and-drop)
// ============================================================

// ============================================================
// Kanban DnD Components
// ============================================================

function KanbanColumn({ etapa, ops, isOver, activeCardId, etapas, onOpenDetail, onMover, onDelete, diasDesde, declinioDias }: {
  etapa: Etapa; ops: Oportunidade[]; isOver: boolean; activeCardId: string | null; etapas: Etapa[]
  onOpenDetail: (id: string) => void; onMover: (id: string, etapaId: string) => void; onDelete: (id: string, titulo: string) => void; diasDesde: (d: string) => number; declinioDias: number
}) {
  const { setNodeRef } = useDroppable({ id: etapa.id })
  return (
    <div ref={setNodeRef} className={cn('flex-1 min-w-[180px] flex flex-col border border-border/40 overflow-hidden transition-colors duration-200 rounded', isOver && 'crm-column-over')}>
      <div className="px-3 py-2.5 border-b flex items-center justify-between" style={{ backgroundColor: `${etapa.cor}12` }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: etapa.cor }} />
          <span className="text-sm font-semibold truncate">{etapa.nome}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">{ops.length}</Badge>
      </div>
      <SortableContext items={ops.map(o => o.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px]">
          {ops.length === 0 && <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma oportunidade</p>}
          {ops.map(op => (
            <KanbanCard key={op.id} op={op} isDraggingAny={!!activeCardId} etapas={etapas} onOpenDetail={onOpenDetail} onMover={onMover} onDelete={onDelete} diasDesde={diasDesde} declinioDias={declinioDias} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function KanbanCard({ op, isDraggingAny, etapas, onOpenDetail, onMover, onDelete, diasDesde, declinioDias }: {
  op: Oportunidade; isDraggingAny: boolean; etapas: Etapa[]
  onOpenDetail: (id: string) => void; onMover: (id: string, etapaId: string) => void; onDelete: (id: string, titulo: string) => void; diasDesde: (d: string) => number; declinioDias: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: op.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }

  const etapaCor = op.etapa?.cor || '#818cf8'

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={cn('rounded-sm bg-white dark:bg-card cursor-grab active:cursor-grabbing group touch-none overflow-hidden', isDragging ? 'border border-transparent opacity-30' : 'border border-border/50', !isDragging && !isDraggingAny && 'hover:shadow-md transition-shadow')}
      onClick={() => { if (!isDraggingAny) onOpenDetail(op.id) }}
    >
      <div className="flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: etapaCor }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent op={op} etapas={etapas} onMover={onMover} onDelete={onDelete} diasDesde={diasDesde} showMenu={!isDraggingAny} declinioDias={declinioDias} />
        </div>
      </div>
    </div>
  )
}

function KanbanCardOverlay({ op, diasDesde, velocityX, width }: { op: Oportunidade; diasDesde: (d: string) => number; velocityX: number; width?: number | null }) {
  const [rotation, setRotation] = useState(0)
  const rotRef = useRef(0)
  const angVelRef = useRef(0)
  const rafRef = useRef(0)
  const inputVelRef = useRef(0)

  useEffect(() => { inputVelRef.current = velocityX * 0.3 }, [velocityX])

  useEffect(() => {
    const tick = () => {
      angVelRef.current += inputVelRef.current * 0.06
      inputVelRef.current *= 0.3

      angVelRef.current += -rotRef.current * 0.04
      // Damping forte (0.82, antes 0.95) — perto do critico: card balanca uma
      // vez na direcao do drag e volta sem multiplas oscilacoes.
      angVelRef.current *= 0.82

      rotRef.current += angVelRef.current
      rotRef.current = Math.max(-8, Math.min(8, rotRef.current))

      if (Math.abs(rotRef.current) < 0.02 && Math.abs(angVelRef.current) < 0.02) {
        rotRef.current = 0
        angVelRef.current = 0
      }

      setRotation(rotRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const etapaCor = op.etapa?.cor || '#818cf8'

  return (
    <div
      // Largura dinamica capturada do card de origem (colunas usam flex-1).
      // Fallback 260px caso o measurement falhe.
      className="rounded-sm bg-white dark:bg-card overflow-hidden"
      style={{
        width: width ?? 260,
        transform: `rotate(${rotation.toFixed(2)}deg) scale(1.02)`,
        transformOrigin: 'top center',
        boxShadow: `0 10px 25px rgba(0,0,0,0.15)`,
      }}
    >
      <div className="flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: etapaCor }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent op={op} etapas={[]} onMover={() => {}} onDelete={() => {}} diasDesde={diasDesde} showMenu={false} />
        </div>
      </div>
    </div>
  )
}

function KanbanCardContent({ op, etapas, onMover, onDelete, diasDesde, showMenu, declinioDias = 30 }: {
  op: Oportunidade; etapas: Etapa[]
  onMover: (id: string, etapaId: string) => void; onDelete: (id: string, titulo: string) => void; diasDesde: (d: string) => number; showMenu: boolean; declinioDias?: number
}) {
  // Empresa/Cliente da oportunidade: prioriza o cliente cadastrado (FK),
  // cai pro nome avulso (razaoSocial digitada). Quando existe, vai ACIMA do título.
  const empresaCliente = (op as any).cliente?.razaoSocial || (op as any).razaoSocial || null
  return (
    <div className="flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-1 px-3 pt-2.5 pb-1">
        <div className="min-w-0 flex-1">
          {empresaCliente && (
            <p className="text-[10px] font-semibold uppercase tracking-wide truncate mb-0.5" style={{ color: MODULE_COLOR }}>
              {empresaCliente}
            </p>
          )}
          <h4 className="text-[13px] font-semibold leading-tight line-clamp-2">{op.titulo}</h4>
        </div>
        <div className="h-6 w-6 shrink-0 -mr-1 -mt-0.5">
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-muted">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(op.id, op.titulo)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-3 pb-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(op as any).orcamento && (
            <Link
              href={`/orcamentos/${(op as any).orcamento.id}`}
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400 rounded-sm px-1.5 py-0.5 hover:bg-sky-100 dark:hover:bg-sky-900/50 hover:underline transition-colors"
              title={`Abrir orçamento #${(op as any).orcamento.numero}`}
            >
              <FileText className="h-3 w-3" /> Orc. #{(op as any).orcamento.numero}
            </Link>
          )}
          {(op as any).tags?.map((t: any) => (
            <span key={t.id} className="inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium text-white" style={{ backgroundColor: t.tag?.cor || '#94a3b8' }}>
              {t.tag?.nome}
            </span>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <div className="flex items-center gap-2">
          {(op as any).responsavel ? (
            (op as any).responsavel.image ? (
              <img src={resolveAssetUrl((op as any).responsavel.image)} alt={(op as any).responsavel.name} title={(op as any).responsavel.name} className="h-6 w-6 rounded-full object-cover shrink-0 border border-background shadow-sm" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 border border-background shadow-sm" title={(op as any).responsavel.name}>
                <span className="text-[8px] font-bold text-muted-foreground">{((op as any).responsavel.name || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
              </div>
            )
          ) : null}
          <SlaIndicator op={op} etapas={etapas} declinioDias={declinioDias} />
        </div>
        <div className="flex items-center gap-2">
          {(op._count?.tarefas ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title="Tarefas">
              <CheckSquare className="h-3 w-3" /> {op._count!.tarefas}
            </span>
          )}
          {(op._count?.mensagens ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title="Mensagens">
              <MessageSquare className="h-3 w-3" /> {op._count!.mensagens}
            </span>
          )}
          {(op._count?.arquivos ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title="Arquivos">
              <Paperclip className="h-3 w-3" /> {op._count!.arquivos}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Arquivos Tab (com drag-and-drop)
// ============================================================

const FILE_ICONS: Record<string, string> = {
  pdf: '#ef4444', doc: '#2563eb', docx: '#2563eb', xls: '#16a34a', xlsx: '#16a34a',
  png: '#8b5cf6', jpg: '#8b5cf6', jpeg: '#8b5cf6', gif: '#8b5cf6', svg: '#8b5cf6',
  zip: '#f59e0b', rar: '#f59e0b', '7z': '#f59e0b',
}

function getFileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ArquivosTab({ arquivos, uploading, onUpload, onRemove }: {
  arquivos: Arquivo[]
  uploading: boolean
  onUpload: (files: FileList | File[]) => Promise<void>
  onRemove: (id: string, fileName: string) => Promise<void>
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files?.length > 0) onUpload(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false) }

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-all',
          isDragOver
            ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-900/10'
            : 'border-border/60 hover:border-muted-foreground/40 hover:bg-muted/30',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) { onUpload(e.target.files); e.target.value = '' } }}
        />
        {uploading ? (
          <Loader2 className="h-8 w-8 mx-auto text-muted-foreground animate-spin" />
        ) : (
          <>
            <UploadCloud className={cn('h-8 w-8 mx-auto mb-2', isDragOver ? 'text-rose-400' : 'text-muted-foreground/50')} />
            <p className="text-xs text-muted-foreground">
              {isDragOver ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
            </p>
          </>
        )}
      </div>

      {/* Lista de arquivos */}
      {arquivos.length === 0 && !uploading && (
        <p className="text-xs text-muted-foreground text-center py-4 italic">Nenhum arquivo anexado</p>
      )}
      <div className="space-y-1">
        {arquivos.map(arq => {
          const ext = getFileExt(arq.fileName)
          const color = FILE_ICONS[ext] || '#94a3b8'
          return (
            <div key={arq.id} className="flex items-center gap-3 rounded-md border px-3 py-2 group hover:bg-muted/30 transition-colors">
              <div className="h-8 w-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
                <File className="h-4 w-4" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={arq.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium truncate block hover:underline"
                  onClick={e => e.stopPropagation()}
                >
                  {arq.fileName}
                </a>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {arq.fileSize && <span>{formatFileSize(arq.fileSize)}</span>}
                  <span>{new Date(arq.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={arq.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                  onClick={e => e.stopPropagation()}
                  title="Baixar"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => onRemove(arq.id, arq.fileName)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Historico Tab (timeline de eventos)
// ============================================================

const EVENTO_ICONS: Record<string, { icon: typeof Target; color: string }> = {
  criacao: { icon: Plus, color: '#10b981' },
  etapa: { icon: ArrowRight, color: '#3b82f6' },
  edicao: { icon: Save, color: '#f59e0b' },
  tarefa: { icon: CheckSquare, color: '#8b5cf6' },
  mensagem: { icon: MessageSquare, color: '#06b6d4' },
  arquivo: { icon: Paperclip, color: '#f97316' },
  tag: { icon: FileText, color: '#ec4899' },
  orcamento: { icon: FileText, color: '#0ea5e9' },
}

function HistoricoTab({ eventos }: { eventos: Evento[] }) {
  if (eventos.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8 italic">Nenhum evento registrado</p>
  }

  return (
    <div className="relative">
      {/* Linha vertical da timeline */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/60" />

      <div className="space-y-0">
        {eventos.map((ev, idx) => {
          const config = EVENTO_ICONS[ev.tipo] || { icon: History, color: '#94a3b8' }
          const Icon = config.icon
          const isFirst = idx === 0

          return (
            <div key={ev.id} className="relative flex gap-3 py-2.5 pl-0">
              {/* Icone na timeline */}
              <div
                className={cn('relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 border-background', isFirst && 'ring-2 ring-offset-1')}
                style={{ backgroundColor: `${config.color}18`, ringColor: isFirst ? config.color : undefined }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
              </div>

              {/* Conteudo */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm leading-tight">{ev.descricao}</p>
                {ev.de && ev.para && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <span className="line-through opacity-60">{ev.de}</span>
                    <ArrowRight className="inline h-3 w-3 mx-1 opacity-40" />
                    <span className="font-medium">{ev.para}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {ev.user && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {ev.user.image ? (
                        <img src={resolveAssetUrl(ev.user.image)} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-[8px] font-bold text-muted-foreground">{(ev.user.name || '?')[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      {ev.user.name}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(ev.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// SLA Indicator (no card do kanban)
// ============================================================

function SlaIndicator({ op, etapas, declinioDias = 30 }: { op: Oportunidade; etapas: Etapa[]; declinioDias?: number }) {
  const etapa = etapas.find(e => e.id === op.etapaId)
  const nomeEtapa = (etapa?.nome || '').toLowerCase()

  // Declinio — contagem regressiva ate arquivamento
  if (nomeEtapa.includes('decl')) {
    const dias = diasDesde(op.updatedAt)
    const restantes = Math.max(0, declinioDias - dias)
    if (restantes === 0) {
      return (
        <span className="text-[10px] font-medium flex items-center gap-0.5 rounded px-1.5 py-0.5 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20" title="Arquivamento automatico iminente">
          <Archive className="h-3 w-3 animate-pulse" /> Expirando
        </span>
      )
    }
    return (
      <span className="text-[10px] font-medium flex items-center gap-0.5 rounded px-1.5 py-0.5 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20" title={`Arquivamento automatico em ${restantes} dia(s)`}>
        <Archive className="h-3 w-3" /> {restantes}d
      </span>
    )
  }

  // Etapas finais (orçamento, ganho, perdido) — exibir tempo de vida total
  if (nomeEtapa.includes('orçamento') || nomeEtapa.includes('orcamento') || etapa?.ehGanho || etapa?.ehPerda) {
    const dias = diasDesde(op.createdAt)
    return (
      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`Tempo de vida: ${dias} dias`}>
        <Clock className="h-3 w-3" /> {dias}d
      </span>
    )
  }

  const sla = getSlaStatus(op.updatedAt, etapa?.slaDias)
  const dias = diasDesde(op.updatedAt)

  if (!sla) {
    return (
      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`${dias}d nesta etapa`}>
        <Clock className="h-3 w-3" /> {dias}d
      </span>
    )
  }

  const config = {
    ok: { label: 'No prazo', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', pulse: false },
    warning: { label: 'Vencendo', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', pulse: false },
    expired: { label: 'Vencido', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', pulse: true },
  }
  const c = config[sla.status]

  return (
    <span className={cn('text-[10px] font-medium flex items-center gap-0.5 rounded px-1.5 py-0.5', c.text, c.bg)} title={`${sla.dias}d / ${sla.limite}d`}>
      <Clock className={cn('h-3 w-3', c.pulse && 'animate-pulse')} />
      {c.label}
    </span>
  )
}

function SortableEtapaRow({ etapa, idx, onSave, onChangeName, onChangeProb, onChangeSla, onDelete }: {
  etapa: Etapa; idx: number
  onSave: (id: string, data: { nome?: string; cor?: string; probabilidade?: number; slaDias?: number | null }) => void
  onChangeName: (id: string, nome: string) => void
  onChangeProb: (id: string, prob: number) => void
  onChangeSla: (id: string, sla: number | null) => void
  onDelete: (id: string, nome: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: etapa.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined }

  return (
    <div ref={setNodeRef} style={style} className={cn('flex items-center gap-2 p-2 rounded-lg border bg-card', isDragging && 'shadow-lg')}>
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <input type="color" value={etapa.cor} onChange={e => onSave(etapa.id, { cor: e.target.value })} className="h-7 w-7 rounded border cursor-pointer shrink-0" />
      <Input value={etapa.nome} onChange={e => onChangeName(etapa.id, e.target.value)} onBlur={() => onSave(etapa.id, { nome: etapa.nome })} className="h-8 text-sm flex-1" />
      <div className="flex items-center gap-1 shrink-0" title="SLA em dias">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <Input
          type="number"
          min={1}
          placeholder="—"
          value={etapa.slaDias ?? ''}
          onChange={e => onChangeSla(etapa.id, e.target.value ? parseInt(e.target.value) : null)}
          onBlur={() => onSave(etapa.id, { slaDias: etapa.slaDias })}
          className="h-8 text-sm w-14 text-center"
        />
      </div>
      {etapa.ehGanho && <Badge className="bg-emerald-100 text-emerald-700 text-[9px] shrink-0">Ganho</Badge>}
      {etapa.ehPerda && <Badge className="bg-red-100 text-red-700 text-[9px] shrink-0">Perdido</Badge>}
      <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => onDelete(etapa.id, etapa.nome)}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
