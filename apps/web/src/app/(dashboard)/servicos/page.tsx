'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ClipboardCheck, Search, Loader2, Plus, MoreVertical, Trash2, Edit, Pencil, Copy, ArrowLeft,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Clock, CheckCircle2, LayoutGrid, List, Play, XCircle, Eye,
  GripVertical, ToggleLeft, ToggleRight, Pause, MessageSquare, Paperclip, Send, ChevronDown, ChevronUp,
  AlertCircle, Check, SkipForward, Network, Repeat, Zap, FileText, Type, ListChecks, Layers, Lock, ShieldCheck, Wand2,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Tabs, TabsTrigger, TabsContent, SlidingTabsList,
  Checkbox, RichEditor,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { ServicoWizard } from './_components/servico-wizard'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { SEGMENTO_SLUGS, SEGMENTO_META, type SegmentoSlug } from '@saas/types'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ============================================================
// Tipos
// ============================================================

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // Emerald (Cadastros)
const PAGE_SIZES = [10, 20, 50]

/** Formata centavos em string BRL "1.234,56" (sem prefixo R$, que vem do adornment). */
function formatBRLFromCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
/** Extrai apenas dígitos do input e retorna o total de centavos. */
function parseCentsFromInput(s: string): number {
  const digits = s.replace(/\D/g, '')
  return digits ? parseInt(digits, 10) : 0
}

interface Passo {
  id: string
  nome: string
  ordem: number
  obrigatorio: boolean
  permiteIgnorar?: boolean
  slaHoras: number | null
  etapaId: string
  concluido?: boolean
  concluidoPor?: string | null
  concluidoPorUsuario?: { id: string; name: string; image: string | null } | null
  concluidoEm?: string | null
  ignorado?: boolean
  ignoradoPor?: string | null
  ignoradoPorUsuario?: { id: string; name: string; image: string | null } | null
  ignoradoEm?: string | null
  ignoradoMotivo?: string | null
  observacao?: string | null
}

interface Etapa {
  id: string
  nome: string
  ordem: number
  slaHoras: number | null
  servicoId: string
  passos: Passo[]
}

interface Servico {
  id: string
  nome: string
  descricao: string | null
  slaHoras: number | null
  categoria: string | null
  etapas: Etapa[]
  segmentoSlug?: string | null
  recorrenteMensal?: boolean
  tipo?: string
  /** MENSAL | EXTRA | FLUXO — papel do registro (default EXTRA pra serviços novos). */
  categoriaServico?: 'MENSAL' | 'EXTRA' | 'FLUXO'
  ehServicoInterno?: boolean
  ehObrigacaoAcessoria?: boolean
  servicoPaiId?: string | null
  servicoPai?: { id: string; nome: string } | null
  /** Grupos a que o serviço pertence (M→N) — pivot rows do listServicos. */
  grupos?: Array<{ grupo: { id: string; nome: string; cor: string | null } }>
  _count?: { execucoes: number; encadeamentosOrigem?: number; encadeamentosDestino?: number; itensDeFluxo?: number }
}

interface Execucao {
  id: string
  status: string
  iniciadoEm: string
  concluidoEm: string | null
  servicoId: string
  clienteId: string | null
  servico: { id: string; nome: string }
  cliente: { id: string; razaoSocial: string } | null
  passos: Passo[]
}

interface Stats {
  templates: number
  emAndamento: number
  concluidas: number
}

// ============================================================
// Helpers
// ============================================================

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  EM_ANDAMENTO: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  CONCLUIDO:    { bg: 'bg-emerald-600 dark:bg-emerald-700',   text: 'text-white',                            border: 'border-emerald-600 dark:border-emerald-700' },
  CANCELADO:    { bg: 'bg-red-50 dark:bg-red-900/20',         text: 'text-red-700 dark:text-red-400',        border: 'border-red-200 dark:border-red-800' },
}

const STATUS_LABELS: Record<string, string> = {
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

function StatusBadge({ status, pausado }: { status: string; pausado?: boolean }) {
  // "Pausado" tem precedência visual sobre "Em andamento" — usuário precisa
  // distinguir execucoes paradas das ativas relance na lista.
  if (pausado && status === 'EM_ANDAMENTO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800">
        <Pause className="h-3 w-3" /> Pausado
      </span>
    )
  }
  const c = STATUS_COLORS[status] || STATUS_COLORS.EM_ANDAMENTO!
  const label = STATUS_LABELS[status] || status
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold', c.bg, c.text, c.border)}>
      {status === 'EM_ANDAMENTO' && <Play className="h-3 w-3" />}
      {status === 'CONCLUIDO' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'CANCELADO' && <XCircle className="h-3 w-3" />}
      {label}
    </span>
  )
}

// Gera um ID estável só pra DnD (não persiste no banco). Server IDs persistidos
// também podem ser reusados como dndId — mas itens novos no form não têm.
function genDndId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `dnd-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function truncate(s: string | null, max: number) {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max) + '...' : s
}

// ============================================================
// Page
// ============================================================

export default function ServicosPage() {
  const router = useRouter()
  const [view, setView] = useState<'templates' | 'execucoes'>('templates')
  const [viewMode, setViewMode] = useState<'tabela' | 'kanban'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('servicos-view-mode') as 'tabela' | 'kanban') || 'tabela'
    return 'tabela'
  })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)

  // Templates
  const [servicos, setServicos] = useState<Servico[]>([])
  // Lista completa (sem paginação/filtros) — usada APENAS no Select do modal
  // de encadeamento, para garantir que o destino atual aparece mesmo se estiver
  // em outra página ou outra categoria filtrada.
  const [todosServicos, setTodosServicos] = useState<Array<{ id: string; nome: string }>>([])
  const [totalServicos, setTotalServicos] = useState(0)

  // Execucoes
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [totalExecucoes, setTotalExecucoes] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')

  // Áreas (vem de /areas) — usadas como source do campo "categoria" do serviço
  // tanto no formulário (Select) quanto no filtro da tabela.
  const [areas, setAreas] = useState<Array<{ id: string; name: string; code?: string | null }>>([])
  const [areaFilter, setAreaFilter] = useState<string>('') // filtro da tabela templates ('' = todas)
  const [cadeiaFilter, setCadeiaFilter] = useState<'' | 'unicos' | 'cadeia' | 'inicio' | 'meio' | 'final'>('') // filtro por encadeamento
  const [segmentoFilter, setSegmentoFilter] = useState<'' | 'avulsos' | SegmentoSlug>('') // filtro por segmento de cliente
  // Filtro de tipo de cadastro: vazio = todos os tipos; demais espelham as 5 pills do form.
  // 'interno' e 'acessoria' são marcações via flag (sobrepõem o tipoCadastroFilter).
  const [cobrancaFilter, setCobrancaFilter] = useState<'' | 'recorrente' | 'extra' | 'fluxo' | 'interno' | 'acessoria'>('')
  /** Natureza do cadastro — comerciais (entram no catálogo do orçamento) vs internos
   *  (execução exclusivamente interna, não aparecem em orçamentos). */
  const [tipoCadastroFilter, setTipoCadastroFilter] = useState<'comerciais' | 'internos'>('comerciais')

  // Wizard (assistente) de cadastro base — convive com o modal tradicional
  const [wizardOpen, setWizardOpen] = useState(false)

  // Create/Edit servico modal
  const [servicoModalOpen, setServicoModalOpen] = useState(false)
  const [editingServico, setEditingServico] = useState<Servico | null>(null)
  const [formTipo, setFormTipo] = useState<'ATIVIDADE' | 'DECISAO'>('ATIVIDADE')
  const [formNome, setFormNome] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formCategoria, setFormCategoria] = useState('')
  const [formPrioridade, setFormPrioridade] = useState<'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'>('MEDIA')
  const [formValorPadrao, setFormValorPadrao] = useState('')
  const [formDisponivelOrcamento, setFormDisponivelOrcamento] = useState(true)
  /** Serviço de execução exclusivamente interna — não aparece no catálogo do orçamento.
   *  Mutuamente exclusivo com disponivelOrcamento. */
  const [formEhServicoInterno, setFormEhServicoInterno] = useState(false)
  /** Marca o registro como obrigação acessória (entrega recorrente: mensal, anual, etc).
   *  Mutuamente exclusivo com as demais pills do "Tipo de cadastro". */
  const [formEhObrigacaoAcessoria, setFormEhObrigacaoAcessoria] = useState(false)
  /** MENSAL = recorrente (contratos); EXTRA = pontual; FLUXO = item interno de outro serviço. */
  const [formCategoriaServico, setFormCategoriaServico] = useState<'MENSAL' | 'EXTRA' | 'FLUXO'>('EXTRA')
  /** Quando categoriaServico=FLUXO, aponta pro serviço top-level dono do fluxo. */
  const [formServicoPaiId, setFormServicoPaiId] = useState<string>('')
  /** Lista carregada sob demanda quando o usuário escolhe FLUXO no form. */
  const [servicosTopLevel, setServicosTopLevel] = useState<Array<{ id: string; nome: string }>>([])
  /** Texto padrão (HTML do TipTap) — modelo de e-mail/notas associado ao serviço. */
  const [formTextoPadrao, setFormTextoPadrao] = useState<string>('')
  /** Aba ativa no modal de novo serviço. */
  const [modalTab, setModalTab] = useState<'geral' | 'etapas' | 'texto'>('geral')
  const [formEtapas, setFormEtapas] = useState<{ id?: string; nome: string; ordem: number; slaHoras: string; passos: { id?: string; dndId: string; nome: string; ordem: number; obrigatorio: boolean; permiteIgnorar: boolean; slaHoras: string }[] }[]>([])
  const [saving, setSaving] = useState(false)

  // Encadeamentos (Próximos serviços) — só carregados em modo edição
  const [encadeamentos, setEncadeamentos] = useState<Array<{
    id: string
    servicoOrigemId: string
    servicoDestinoId: string
    ordem: number
    iniciaAuto: boolean
    obrigatorio: boolean
    herdaResponsavel: boolean
    observacao: string | null
    condicao: unknown
    servicoDestino: { id: string; nome: string }
  }>>([])
  const [encModalOpen, setEncModalOpen] = useState(false)
  const [editingEnc, setEditingEnc] = useState<{ id: string } | null>(null)
  const [encDestinoId, setEncDestinoId] = useState('')
  const [encOrdem, setEncOrdem] = useState('0')
  const [encIniciaAuto, setEncIniciaAuto] = useState(true)
  const [encObrigatorio, setEncObrigatorio] = useState(true)
  const [encHerdaResponsavel, setEncHerdaResponsavel] = useState(true)
  const [encObservacao, setEncObservacao] = useState('')
  const [encSaving, setEncSaving] = useState(false)
  // Builder de condicionais (Fase 7)
  const [encCondicaoModo, setEncCondicaoModo] = useState<'sempre' | 'all' | 'any'>('sempre')
  const [encRegras, setEncRegras] = useState<Array<{ campo: string; op: string; valor: string }>>([])

  // Checklist modal
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [selectedExecucao, setSelectedExecucao] = useState<Execucao | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])

  // ── Fetch ──

  const fetchStats = useCallback(async () => {
    try {
      const s = await (trpc.servico as any).getStats.query()
      setStats(s)
    } catch { /* silent */ }
  }, [])

  const fetchServicos = useCallback(async () => {
    setLoading(true)
    try {
      // tipoCadastroFilter alterna entre Comerciais (catálogo de orçamento) e Internos.
      // cobrancaFilter='interno'/'acessoria' SOBREPÕE o tipoCadastroFilter (envia tipo
      // adequado pro backend pra não conflitar).
      const tipoEfetivo = cobrancaFilter === 'interno' ? 'internos'
        : cobrancaFilter === 'acessoria' ? 'comerciais'
        : tipoCadastroFilter
      const input: Record<string, unknown> = { tipo: tipoEfetivo }
      if (cobrancaFilter === 'fluxo') input.categoria = 'FLUXO'
      const result = await (trpc.servico as any).listServicos.query(input)
      const filtered = (result as Servico[]).filter(s => {
        if (debouncedSearch && !s.nome.toLowerCase().includes(debouncedSearch.toLowerCase())) return false
        if (areaFilter && s.categoria !== areaFilter) return false
        if (cadeiaFilter) {
          const ori = s._count?.encadeamentosOrigem ?? 0
          const dest = s._count?.encadeamentosDestino ?? 0
          if (cadeiaFilter === 'unicos' && (ori > 0 || dest > 0)) return false
          if (cadeiaFilter === 'cadeia' && ori === 0 && dest === 0) return false
          if (cadeiaFilter === 'inicio' && !(ori > 0 && dest === 0)) return false
          if (cadeiaFilter === 'meio'   && !(ori > 0 && dest > 0)) return false
          if (cadeiaFilter === 'final'  && !(ori === 0 && dest > 0)) return false
        }
        if (segmentoFilter) {
          if (segmentoFilter === 'avulsos' && s.segmentoSlug != null) return false
          if (segmentoFilter !== 'avulsos' && s.segmentoSlug !== segmentoFilter) return false
        }
        if (cobrancaFilter === 'recorrente' && s.categoriaServico !== 'MENSAL') return false
        if (cobrancaFilter === 'extra' && s.categoriaServico !== 'EXTRA') return false
        if (cobrancaFilter === 'interno' && s.ehServicoInterno !== true) return false
        if (cobrancaFilter === 'acessoria' && s.ehObrigacaoAcessoria !== true) return false
        return true
      })
      setTotalServicos(filtered.length)
      setServicos(filtered.slice((page - 1) * limit, page * limit))
    } catch { setServicos([]); setTotalServicos(0) }
    finally { setLoading(false) }
  }, [debouncedSearch, page, limit, areaFilter, cadeiaFilter, segmentoFilter, cobrancaFilter, tipoCadastroFilter])

  const fetchExecucoes = useCallback(async () => {
    setLoading(true)
    try {
      const input: Record<string, unknown> = {}
      if (statusFilter) input.status = statusFilter
      const result = await (trpc.servico as any).listExecucoes.query(input)
      const filtered = (result as Execucao[]).filter(e =>
        !debouncedSearch ||
        e.servico?.nome?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        e.cliente?.razaoSocial?.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
      setTotalExecucoes(filtered.length)
      setExecucoes(filtered.slice((page - 1) * limit, page * limit))
    } catch (e) {
      console.warn('[fetchExecucoes] erro:', (e as Error).message)
      setExecucoes([]); setTotalExecucoes(0)
    } finally { setLoading(false) }
  }, [debouncedSearch, page, limit, statusFilter])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => {
    if (view === 'templates') fetchServicos()
    else fetchExecucoes()
  }, [view, fetchServicos, fetchExecucoes])

  // Carrega áreas uma vez (usadas em filtro + form)
  useEffect(() => {
    (async () => {
      try {
        const result = await (trpc.area as any).listForSelect.query()
        setAreas(result || [])
      } catch { setAreas([]) }
    })()
  }, [])

  // ── Template actions ──

  function openCreateServico() {
    setEditingServico(null)
    setFormTipo('ATIVIDADE')
    setFormNome('')
    setFormDescricao('')
    setFormCategoria('')
    setFormPrioridade('MEDIA')
    setFormValorPadrao('')
    setFormDisponivelOrcamento(true)
    // Quando o usuário está navegando na aba "Internos", o novo cadastro já nasce
    // como interno (UX: criar onde está) e, automaticamente, fora do catálogo.
    setFormEhServicoInterno(tipoCadastroFilter === 'internos')
    setFormEhObrigacaoAcessoria(false)
    if (tipoCadastroFilter === 'internos') setFormDisponivelOrcamento(false)
    setFormCategoriaServico('EXTRA')
    setFormServicoPaiId('')
    setFormTextoPadrao('')
    setModalTab('geral')
    setFormEtapas([])
    setEncadeamentos([])
    setServicoModalOpen(true)
  }

  /** Carrega os serviços top-level (MENSAL+EXTRA) sob demanda — usado quando o
   *  usuário escolhe Fluxo no form e precisa apontar pro pai. */
  async function loadServicosTopLevel() {
    if (servicosTopLevel.length > 0) return
    try {
      const result = await (trpc.servico as any).listServicos.query()
      setServicosTopLevel((result as Array<{ id: string; nome: string }>).map(s => ({ id: s.id, nome: s.nome })))
    } catch { /* silent */ }
  }

  // Editar agora vai pra página de detalhe (/servicos/[id]). O modal antigo
  // continua disponível só pra "Novo Serviço".
  function openEditServico(id: string) {
    router.push(`/servicos/${id}`)
  }

  // ── Encadeamentos (Próximos serviços) ─────────────────────

  async function loadTodosServicos() {
    try {
      // Sem filtros/paginação — usado apenas no Select do modal de encadeamento
      const result = await (trpc.servico as any).listServicos.query() as Array<{ id: string; nome: string }>
      setTodosServicos(result.map(s => ({ id: s.id, nome: s.nome })))
    } catch (e) {
      console.warn('Falha ao carregar lista completa de serviços:', (e as Error).message)
      setTodosServicos([])
    }
  }

  async function loadEncadeamentos(servicoOrigemId: string) {
    try {
      const items = await (trpc.servico as any).listEncadeamentos.query({ servicoOrigemId })
      setEncadeamentos(items || [])
    } catch (e) {
      console.warn('Falha ao carregar encadeamentos:', (e as Error).message)
      setEncadeamentos([])
    }
  }

  function openAddEnc() {
    setEditingEnc(null)
    setEncDestinoId('')
    setEncOrdem(String(encadeamentos.length))
    setEncIniciaAuto(true)
    setEncObrigatorio(true)
    setEncHerdaResponsavel(true)
    setEncObservacao('')
    setEncCondicaoModo('sempre')
    setEncRegras([])
    setEncModalOpen(true)
  }

  function openEditEnc(enc: typeof encadeamentos[number]) {
    setEditingEnc({ id: enc.id })
    setEncDestinoId(enc.servicoDestinoId)
    setEncOrdem(String(enc.ordem))
    setEncIniciaAuto(enc.iniciaAuto)
    setEncObrigatorio(enc.obrigatorio)
    setEncHerdaResponsavel(enc.herdaResponsavel)
    setEncObservacao(enc.observacao || '')
    // Hidrata builder de condicional a partir do JSON salvo
    const c = enc.condicao as { all?: Array<{ campo: string; op: string; valor: unknown }>; any?: Array<{ campo: string; op: string; valor: unknown }> } | null
    if (c && c.all && c.all.length > 0) {
      setEncCondicaoModo('all')
      setEncRegras(c.all.map(r => ({
        campo: r.campo,
        op: r.op,
        valor: Array.isArray(r.valor) ? r.valor.join(', ') : (r.valor != null ? String(r.valor) : ''),
      })))
    } else if (c && c.any && c.any.length > 0) {
      setEncCondicaoModo('any')
      setEncRegras(c.any.map(r => ({
        campo: r.campo,
        op: r.op,
        valor: Array.isArray(r.valor) ? r.valor.join(', ') : (r.valor != null ? String(r.valor) : ''),
      })))
    } else {
      setEncCondicaoModo('sempre')
      setEncRegras([])
    }
    setEncModalOpen(true)
  }

  async function handleSaveEnc() {
    if (!editingServico) return
    if (!encDestinoId) { alerts.error('Validação', 'Selecione o serviço sucessor'); return }

    // Monta condição (Fase 7) — null se modo "sempre" ou sem regras
    let condicao: { all?: unknown[]; any?: unknown[] } | null = null
    if (encCondicaoModo !== 'sempre' && encRegras.length > 0) {
      const regras = encRegras
        .filter(r => r.campo && r.op)
        .map(r => {
          const reg: { campo: string; op: string; valor?: unknown } = { campo: r.campo, op: r.op }
          if (r.op === 'in' || r.op === 'not_in') {
            reg.valor = r.valor.split(',').map(s => s.trim()).filter(Boolean)
          } else if (r.op === 'is_null' || r.op === 'is_not_null') {
            // sem valor
          } else if (r.campo === 'orcamento.valorTotal') {
            // numérico
            const n = Number(r.valor)
            reg.valor = Number.isFinite(n) ? n : 0
          } else {
            reg.valor = r.valor
          }
          return reg
        })
      condicao = encCondicaoModo === 'all' ? { all: regras } : { any: regras }
    }

    setEncSaving(true)
    try {
      if (editingEnc) {
        await (trpc.servico as any).updateEncadeamento.mutate({
          id: editingEnc.id,
          ordem: Number(encOrdem) || 0,
          iniciaAuto: encIniciaAuto,
          obrigatorio: encObrigatorio,
          herdaResponsavel: encHerdaResponsavel,
          observacao: encObservacao.trim() || null,
          condicao,
        })
        alerts.success('Sucessor atualizado')
      } else {
        await (trpc.servico as any).addEncadeamento.mutate({
          servicoOrigemId: editingServico.id,
          servicoDestinoId: encDestinoId,
          ordem: Number(encOrdem) || 0,
          iniciaAuto: encIniciaAuto,
          obrigatorio: encObrigatorio,
          herdaResponsavel: encHerdaResponsavel,
          observacao: encObservacao.trim() || null,
          condicao,
        })
        alerts.success('Sucessor adicionado')
      }
      setEncModalOpen(false)
      loadEncadeamentos(editingServico.id)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEncSaving(false)
    }
  }

  async function handleRemoveEnc(id: string, nome: string) {
    if (!editingServico) return
    const ok = await alerts.confirm({
      title: 'Remover sucessor',
      text: `O sucessor "${nome}" será desvinculado deste serviço.`,
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await (trpc.servico as any).removeEncadeamento.mutate({ id })
      alerts.success('Sucessor removido')
      loadEncadeamentos(editingServico.id)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function handleSaveServico() {
    if (!formNome.trim()) { alerts.error('Erro', 'Nome é obrigatório'); return }
    setSaving(true)
    try {
      if (editingServico) {
        // slaHoras é derivado dos passos (backend faz recomputeSlaServico).
        await (trpc.servico as any).updateServico.mutate({
          id: editingServico.id,
          data: {
            nome: formNome,
            descricao: formDescricao || null,
            categoria: formCategoria || null,
            prioridadePadrao: formPrioridade,
            valorPadrao: formValorPadrao ? parseInt(formValorPadrao, 10) / 100 : null,
            // Interno, Fluxo e Obrigação Acessória bloqueiam catálogo independentemente do toggle.
            disponivelOrcamento: formEhServicoInterno || formEhObrigacaoAcessoria || formCategoriaServico === 'FLUXO' ? false : formDisponivelOrcamento,
            ehServicoInterno: formEhServicoInterno,
            ehObrigacaoAcessoria: formEhObrigacaoAcessoria,
            recorrenteMensal: formCategoriaServico === 'MENSAL',
            categoriaServico: formCategoriaServico,
            servicoPaiId: formCategoriaServico === 'FLUXO' ? (formServicoPaiId || null) : null,
            textoPadrao: formTextoPadrao || null,
          },
        })
        // Sync etapas + passos
        const existingEtapaIds = new Set(editingServico.etapas.map(e => e.id))
        for (const et of formEtapas) {
          if (et.id && existingEtapaIds.has(et.id)) {
            // existing etapa - just handle passos
            const existingPassoIds = new Set(editingServico.etapas.find(e => e.id === et.id)?.passos.map(p => p.id) || [])
            for (const p of et.passos) {
              if (!p.id || !existingPassoIds.has(p.id)) {
                await (trpc.servico as any).addPasso.mutate({
                  etapaId: et.id,
                  nome: p.nome,
                  ordem: p.ordem,
                  obrigatorio: p.obrigatorio,
                  permiteIgnorar: p.permiteIgnorar,
                  slaHoras: p.slaHoras ? Number(p.slaHoras) : undefined,
                })
              }
            }
            const keepPassoIds = new Set(et.passos.filter(p => p.id).map(p => p.id))
            for (const pid of existingPassoIds) {
              if (!keepPassoIds.has(pid)) {
                await (trpc.servico as any).deletePasso.mutate({ id: pid })
              }
            }
          } else {
            // new etapa
            const newEtapa = await (trpc.servico as any).addEtapa.mutate({
              servicoId: editingServico.id,
              nome: et.nome,
              ordem: et.ordem,
            })
            for (const p of et.passos) {
              await (trpc.servico as any).addPasso.mutate({
                etapaId: newEtapa.id,
                nome: p.nome,
                ordem: p.ordem,
                obrigatorio: p.obrigatorio,
                permiteIgnorar: p.permiteIgnorar,
                slaHoras: p.slaHoras ? Number(p.slaHoras) : undefined,
              })
            }
          }
        }
        // remove deleted etapas
        const keepEtapaIds = new Set(formEtapas.filter(e => e.id).map(e => e.id))
        for (const eid of existingEtapaIds) {
          if (!keepEtapaIds.has(eid)) {
            await (trpc.servico as any).deleteEtapa.mutate({ id: eid })
          }
        }
        await alerts.success('Atualizado', 'Serviço atualizado com sucesso.')
      } else {
        const created = await (trpc.servico as any).createServico.mutate({
          nome: formNome,
          descricao: formDescricao || undefined,
          categoria: formCategoria || undefined,
          prioridadePadrao: formPrioridade,
          tipo: formTipo,
          valorPadrao: formValorPadrao ? parseInt(formValorPadrao, 10) / 100 : undefined,
          disponivelOrcamento: formEhServicoInterno || formEhObrigacaoAcessoria || formCategoriaServico === 'FLUXO' ? false : formDisponivelOrcamento,
          ehServicoInterno: formEhServicoInterno,
          ehObrigacaoAcessoria: formEhObrigacaoAcessoria,
          recorrenteMensal: formCategoriaServico === 'MENSAL',
          categoriaServico: formCategoriaServico,
          servicoPaiId: formCategoriaServico === 'FLUXO' ? (formServicoPaiId || undefined) : undefined,
          textoPadrao: formTextoPadrao || undefined,
        })
        // Add etapas + passos (SLA de etapa e serviço são derivados no backend)
        for (const et of formEtapas) {
          const newEtapa = await (trpc.servico as any).addEtapa.mutate({
            servicoId: created.id,
            nome: et.nome,
            ordem: et.ordem,
          })
          for (const p of et.passos) {
            await (trpc.servico as any).addPasso.mutate({
              etapaId: newEtapa.id,
              nome: p.nome,
              ordem: p.ordem,
              obrigatorio: p.obrigatorio,
              slaHoras: p.slaHoras ? Number(p.slaHoras) : undefined,
            })
          }
        }
        await alerts.success('Criado', 'Serviço criado com sucesso.')
      }
      setServicoModalOpen(false)
      fetchServicos()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  async function handleDeleteServico(id: string) {
    if (!await alerts.confirmDelete('este serviço')) return
    try {
      await (trpc.servico as any).deleteServico.mutate({ id })
      fetchServicos()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  /** Clona um serviço inteiro (etapas/passos + blocos de fluxo + encadeamentos)
   *  e abre a cópia — base da biblioteca de "modelos": duplique um serviço
   *  pronto e ajuste. */
  async function handleDuplicarServico(id: string) {
    try {
      const novo = await (trpc.servico as any).duplicarServico.mutate({ id })
      await alerts.success('Duplicado', 'Cópia criada — ajuste o que precisar.')
      router.push(`/servicos/${novo.id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Selecao em lote — IDs marcados via checkbox na tabela/kanban
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === servicos.length && servicos.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(servicos.map(s => s.id)))
    }
  }

  // Limpa selecao quando muda de pagina/view/filtros
  useEffect(() => {
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, page, debouncedSearch, statusFilter])

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const ok = await alerts.confirm({
      title: `Excluir ${ids.length} ${ids.length === 1 ? 'serviço' : 'serviços'}?`,
      text: 'Esta ação não pode ser desfeita pelo fluxo normal.',
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.servico as any).bulkDeleteServicos.mutate({ ids })
      setSelectedIds(new Set())
      fetchServicos()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Etapa/Passo form helpers ──

  function addEtapa() {
    setFormEtapas(prev => [...prev, { nome: '', ordem: prev.length + 1, slaHoras: '', passos: [] }])
  }

  function removeEtapa(idx: number) {
    setFormEtapas(prev => prev.filter((_, i) => i !== idx).map((e, i) => ({ ...e, ordem: i + 1 })))
  }

  function updateEtapa(idx: number, field: string, value: string) {
    setFormEtapas(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  function addPasso(etapaIdx: number) {
    setFormEtapas(prev => prev.map((e, i) =>
      i === etapaIdx
        ? { ...e, passos: [...e.passos, { dndId: genDndId(), nome: '', ordem: e.passos.length + 1, obrigatorio: false, permiteIgnorar: false, slaHoras: '' }] }
        : e
    ))
  }

  /** Reordena passos via drag-and-drop dentro de uma etapa específica. */
  function reorderPassos(etapaIdx: number, fromDndId: string, toDndId: string) {
    setFormEtapas(prev => prev.map((e, i) => {
      if (i !== etapaIdx) return e
      const oldIdx = e.passos.findIndex(p => p.dndId === fromDndId)
      const newIdx = e.passos.findIndex(p => p.dndId === toDndId)
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return e
      const reordered = arrayMove(e.passos, oldIdx, newIdx).map((p, pi) => ({ ...p, ordem: pi + 1 }))
      return { ...e, passos: reordered }
    }))
  }

  function removePasso(etapaIdx: number, passoIdx: number) {
    setFormEtapas(prev => prev.map((e, i) =>
      i === etapaIdx ? { ...e, passos: e.passos.filter((_, pi) => pi !== passoIdx).map((p, pi) => ({ ...p, ordem: pi + 1 })) } : e
    ))
  }

  function updatePasso(etapaIdx: number, passoIdx: number, field: string, value: unknown) {
    setFormEtapas(prev => prev.map((e, i) =>
      i === etapaIdx ? { ...e, passos: e.passos.map((p, pi) => pi === passoIdx ? { ...p, [field]: value } : p) } : e
    ))
  }

  // ── Execucao actions ──

  async function openChecklist(id: string) {
    setChecklistLoading(true)
    setChecklistOpen(true)
    try {
      const exec = await (trpc.servico as any).getExecucao.query({ id })
      setSelectedExecucao(exec)
    } catch (e) { alerts.error('Erro', (e as Error).message); setChecklistOpen(false) }
    finally { setChecklistLoading(false) }
  }

  async function handleTogglePasso(passoId: string) {
    try {
      await (trpc.servico as any).togglePasso.mutate({ id: passoId })
      if (selectedExecucao) {
        const updated = await (trpc.servico as any).getExecucao.query({ id: selectedExecucao.id })
        setSelectedExecucao(updated)
      }
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handlePassoObs(passoId: string, obs: string) {
    try {
      await (trpc.servico as any).updatePassoObs.mutate({ id: passoId, observacao: obs })
    } catch { /* silent */ }
  }

  async function handleConcluirExecucao(id: string) {
    const ok = await alerts.confirm({ title: 'Concluir execução', text: 'Deseja marcar esta execução como concluída?', icon: 'question' })
    if (!ok) return
    try {
      await (trpc.servico as any).concluirExecucao.mutate({ id })
      await alerts.success('Concluída', 'Execução concluída com sucesso.')
      setChecklistOpen(false)
      fetchExecucoes()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleCancelarExecucao(id: string) {
    // Busca impacto pra avisar usuário sobre orçamento/CRM vinculados.
    let impacto: { orcamento: { numero: number } | null; oportunidade: { titulo: string } | null } | null = null
    try {
      impacto = await (trpc.servico as any).getCancelamentoImpacto.query({ id })
    } catch { /* segue mesmo sem impacto */ }
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
      await (trpc.servico as any).cancelarExecucao.mutate({ id })
      await alerts.success('Cancelada', 'Execução cancelada.')
      setChecklistOpen(false)
      fetchExecucoes()
      fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Modal pausar — controla visibilidade + motivo
  const [pausarModal, setPausarModal] = useState<{ open: boolean; id: string; motivo: string }>({ open: false, id: '', motivo: '' })

  function abrirPausarModal(id: string) {
    setPausarModal({ open: true, id, motivo: '' })
  }

  // Pausa a execucao com motivo (Fase 4) — recalcula prazoLimite ao retomar
  async function handlePausarExecucao() {
    const { id, motivo } = pausarModal
    if (!motivo.trim()) {
      alerts.warning('Atenção', 'Informe o motivo da pausa')
      return
    }
    try {
      await (trpc.servico as any).pausarExecucao.mutate({ id, motivo: motivo.trim() })
      setPausarModal({ open: false, id: '', motivo: '' })
      if (selectedExecucao && selectedExecucao.id === id) {
        const updated = await (trpc.servico as any).getExecucao.query({ id })
        setSelectedExecucao(updated)
      }
      fetchExecucoes()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRetomarExecucao(id: string) {
    try {
      await (trpc.servico as any).retomarExecucao.mutate({ id })
      if (selectedExecucao && selectedExecucao.id === id) {
        const updated = await (trpc.servico as any).getExecucao.query({ id })
        setSelectedExecucao(updated)
      }
      fetchExecucoes()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Pagination ──

  const total = view === 'templates' ? totalServicos : totalExecucoes
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const startRecord = total ? (page - 1) * limit + 1 : 0
  const endRecord = Math.min(page * limit, total)

  function getPageNumbers() {
    const p: number[] = []
    let s = Math.max(1, page - 2)
    const e = Math.min(totalPages, s + 4)
    s = Math.max(1, e - 4)
    for (let i = s; i <= e; i++) p.push(i)
    return p
  }

  // ── Checklist helpers ──

  const checklistPassos = selectedExecucao?.passos || []
  // ServicoExecucaoPasso tem snapshot do nome da etapa em `etapaNome`, não FK pro
  // template. Agrupamos pelo nome diretamente — passos da mesma etapa compartilham.
  const etapasAgrupadas = checklistPassos.reduce<Record<string, Passo[]>>((acc, p) => {
    const key = (p as any).etapaNome || (p as any).etapaId || 'Geral'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})
  const totalPassos = checklistPassos.length
  const concluidos = checklistPassos.filter(p => p.concluido).length
  const progressPct = totalPassos > 0 ? Math.round((concluidos / totalPassos) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {view === 'execucoes' && (
            <Button variant="ghost" size="icon-sm" onClick={() => { setView('templates'); setSearch(''); setPage(1) }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div>
            <h1>{view === 'templates' ? 'Serviços' : 'Execuções'}</h1>
            <p className="text-sm text-muted-foreground">
              {view === 'templates' ? 'Gerencie templates de serviço e execuções' : 'Acompanhe o andamento das execuções de serviços'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {view === 'templates' && (
            <>
              <div className="flex items-center border rounded-[2px] overflow-hidden">
                <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'tabela' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('tabela'); localStorage.setItem('servicos-view-mode', 'tabela') }} title="Tabela">
                  <List className="h-4 w-4" />
                </button>
                <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('kanban'); localStorage.setItem('servicos-view-mode', 'kanban') }} title="Kanban">
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setView('execucoes'); setSearch(''); setPage(1) }} className="gap-1.5">
                <Play className="h-4 w-4" />Execucoes
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push('/servicos/grupos')} className="gap-1.5">
                <Layers className="h-4 w-4" />Grupos
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5">
                <Wand2 className="h-4 w-4" />Assistente
              </Button>
              <Button variant="success" size="sm" onClick={openCreateServico} className="gap-1.5">
                <Plus className="h-4 w-4" />Novo Servico
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Indicadores compactos clicaveis — atuam como filtros rapidos da tabela.
          Cada KPI muda view + statusFilter e marca-se como ativo (ring + bg
          tinted). Em mobile: grid 2x2; em desktop: linha unica com dividers. */}
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
          {/* Helper: estado "ativo" de cada indicador para destaque visual */}
          {(() => {
            const isTemplatesActive = view === 'templates'
            const isAndamentoActive = view === 'execucoes' && statusFilter === 'EM_ANDAMENTO'
            const isConcluidasActive = view === 'execucoes' && statusFilter === 'CONCLUIDO'
            const isTotalActive = view === 'execucoes' && !statusFilter
            const baseBtnCls = 'flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:bg-muted/50 cursor-pointer'
            const activeBtnCls = 'bg-muted/60'
            return (
              <>
                <button
                  type="button"
                  onClick={() => { setView('templates'); setStatusFilter(''); setPage(1) }}
                  className={cn(baseBtnCls, isTemplatesActive && activeBtnCls)}
                  title="Filtrar por templates ativos"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 dark:bg-sky-900/20 shrink-0">
                    <ClipboardCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">Templates Ativos</p>
                    <p className="text-lg font-bold leading-none tabular-nums">{stats?.templates ?? 0}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setView('execucoes'); setStatusFilter('EM_ANDAMENTO'); setPage(1) }}
                  className={cn(baseBtnCls, isAndamentoActive && activeBtnCls)}
                  title="Filtrar execuções em andamento"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-900/20 shrink-0">
                    <Play className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">Em Andamento</p>
                    <p className="text-lg font-bold leading-none tabular-nums">{stats?.emAndamento ?? 0}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setView('execucoes'); setStatusFilter('CONCLUIDO'); setPage(1) }}
                  className={cn(baseBtnCls, isConcluidasActive && activeBtnCls)}
                  title="Filtrar execuções concluídas"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-900/20 shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">Concluídas</p>
                    <p className="text-lg font-bold leading-none tabular-nums">{stats?.concluidas ?? 0}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setView('execucoes'); setStatusFilter(''); setPage(1) }}
                  className={cn(baseBtnCls, isTotalActive && activeBtnCls)}
                  title="Mostrar todas as execuções"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-50 dark:bg-violet-900/20 shrink-0">
                    <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">Total Execuções</p>
                    <p className="text-lg font-bold leading-none tabular-nums">{(stats?.emAndamento ?? 0) + (stats?.concluidas ?? 0)}</p>
                  </div>
                </button>
              </>
            )
          })()}
        </div>
      </Card>

      {/* ══════════════════ VIEW: TEMPLATES ══════════════════ */}
      {view === 'templates' && (
        <Card>
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
                <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={tipoCadastroFilter} onValueChange={v => { setTipoCadastroFilter(v as 'comerciais' | 'internos'); setPage(1) }}>
                <SelectTrigger className="h-8 w-[170px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comerciais">Comerciais</SelectItem>
                  <SelectItem value="internos">Internos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={areaFilter || '__all__'} onValueChange={v => { setAreaFilter(v === '__all__' ? '' : v); setPage(1) }}>
                <SelectTrigger className="h-8 w-[180px] text-xs bg-card"><SelectValue placeholder="Filtrar por área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as áreas</SelectItem>
                  {areas.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cadeiaFilter || '__all__'} onValueChange={v => { setCadeiaFilter(v === '__all__' ? '' : v as typeof cadeiaFilter); setPage(1) }}>
                <SelectTrigger className="h-8 w-[180px] text-xs bg-card"><SelectValue placeholder="Cadeia" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Toda a cadeia</SelectItem>
                  <SelectItem value="unicos">Únicos (sem cadeia)</SelectItem>
                  <SelectItem value="cadeia">Em cadeia (qualquer)</SelectItem>
                  <SelectItem value="inicio">Início de cadeia (raiz)</SelectItem>
                  <SelectItem value="meio">Meio de cadeia</SelectItem>
                  <SelectItem value="final">Final de cadeia</SelectItem>
                </SelectContent>
              </Select>
              <Select value={segmentoFilter || '__all__'} onValueChange={v => { setSegmentoFilter(v === '__all__' ? '' : v as typeof segmentoFilter); setPage(1) }}>
                <SelectTrigger className="h-8 w-[200px] text-xs bg-card"><SelectValue placeholder="Segmento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os segmentos</SelectItem>
                  <SelectItem value="avulsos">Avulsos (sem segmento)</SelectItem>
                  {SEGMENTO_SLUGS.map(slug => (
                    <SelectItem key={slug} value={slug}>{SEGMENTO_META[slug].label} ({SEGMENTO_META[slug].regime})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={cobrancaFilter || '__all__'} onValueChange={v => { setCobrancaFilter(v === '__all__' ? '' : v as typeof cobrancaFilter); setPage(1) }}>
                <SelectTrigger className="h-8 w-[200px] text-xs bg-card"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os tipos</SelectItem>
                  <SelectItem value="recorrente">Serviço Recorrente</SelectItem>
                  <SelectItem value="extra">Serviço Extraordinário</SelectItem>
                  <SelectItem value="fluxo">Parte do Fluxo</SelectItem>
                  <SelectItem value="interno">Serviço Interno</SelectItem>
                  <SelectItem value="acessoria">Obrigação Acessória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="max-w-xs w-full sm:w-auto">
              <Input placeholder="Buscar serviço..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
            </div>
          </div>

          {/* Kanban */}
          {viewMode === 'kanban' && (
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              ) : !servicos.length ? (
                <div className="text-center py-10 text-muted-foreground"><ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />Nenhum serviço encontrado</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {servicos.map(s => (
                    <div
                      key={s.id}
                      className={cn(
                        'rounded-lg border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer group',
                        selectedIds.has(s.id) && 'ring-2 ring-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-900/10',
                      )}
                      onClick={() => openEditServico(s.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded cursor-pointer mt-0.5 shrink-0"
                          checked={selectedIds.has(s.id)}
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleSelected(s.id)}
                          aria-label={`Selecionar ${s.nome}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{s.nome}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{truncate(s.descricao, 60)}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-muted shrink-0">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => openEditServico(s.id)}><Edit className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicarServico(s.id)}><Copy className="h-3.5 w-3.5 mr-2" />Duplicar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteServico(s.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                        {s.slaHoras && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.slaHoras}h SLA</span>}
                        <span>{s.etapas.length} etapa{s.etapas.length !== 1 ? 's' : ''}</span>
                        <span>{s.etapas.reduce((acc, e) => acc + e.passos.length, 0)} passo{s.etapas.reduce((acc, e) => acc + e.passos.length, 0) !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">{s._count?.execucoes ?? 0} execuções</Badge>
                        {s.categoriaServico === 'FLUXO' ? (
                          <Badge variant="outline" className="text-[10px] bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" title={s.servicoPai ? `Item interno de "${s.servicoPai.nome}"` : 'Item de fluxo'}>
                            <Network className="h-2.5 w-2.5 mr-1" />Fluxo
                          </Badge>
                        ) : s.categoriaServico === 'MENSAL' || s.recorrenteMensal ? (
                          <Badge variant="outline" className="text-[10px] bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300" title="Cobrança mensal recorrente — entra em contratos">
                            <ToggleRight className="h-2.5 w-2.5 mr-1" />Mensal
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300" title="Cobrança pontual — uma cobrança por execução">
                            <ToggleLeft className="h-2.5 w-2.5 mr-1" />Extra
                          </Badge>
                        )}
                        {s.segmentoSlug && SEGMENTO_META[s.segmentoSlug as SegmentoSlug] && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-white"
                            style={{ backgroundColor: SEGMENTO_META[s.segmentoSlug as SegmentoSlug].cor, borderColor: SEGMENTO_META[s.segmentoSlug as SegmentoSlug].cor }}
                            title={`Segmento · ${SEGMENTO_META[s.segmentoSlug as SegmentoSlug].regime}`}
                          >
                            {SEGMENTO_META[s.segmentoSlug as SegmentoSlug].label}
                          </Badge>
                        )}
                        {(() => {
                          const ori = s._count?.encadeamentosOrigem ?? 0
                          const dest = s._count?.encadeamentosDestino ?? 0
                          if (ori === 0 && dest === 0) return null
                          return (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400"
                              title={`Cadeia de processos · ${ori} sucessor(es), ${dest} predecessor(es)`}
                            >
                              <Network className="h-2.5 w-2.5 mr-0.5" />
                              {ori > 0 && dest === 0 ? 'Início de cadeia' :
                               ori === 0 && dest > 0 ? 'Final de cadeia' :
                               'Cadeia'}
                            </Badge>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action bar — aparece quando ha selecao em lote */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-2">
              <span className="text-xs text-muted-foreground">
                <strong className="text-foreground">{selectedIds.size}</strong> {selectedIds.size === 1 ? 'serviço selecionado' : 'serviços selecionados'}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Limpar seleção
                </Button>
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleBulkDelete}>
                  <Trash2 className="h-3.5 w-3.5" /> Excluir selecionados
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          {viewMode === 'tabela' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] text-center">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded cursor-pointer align-middle"
                      checked={servicos.length > 0 && selectedIds.size === servicos.length}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < servicos.length }}
                      onChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead className="w-[140px] whitespace-nowrap">Área</TableHead>
                  <TableHead className="w-[170px] whitespace-nowrap">Tipo</TableHead>
                  <TableHead className="w-[180px] whitespace-nowrap">Grupo</TableHead>
                  <TableHead className="whitespace-nowrap">Nome</TableHead>
                  <TableHead className="w-[80px] text-center whitespace-nowrap">SLA (h)</TableHead>
                  <TableHead className="w-[80px] text-center whitespace-nowrap">Etapas</TableHead>
                  <TableHead className="w-[90px] text-center whitespace-nowrap">Execuções</TableHead>
                  <TableHead className="w-[50px] text-right whitespace-nowrap">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
                  </TableCell></TableRow>
                ) : !servicos.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />Nenhum serviço encontrado
                  </TableCell></TableRow>
                ) : servicos.map(s => (
                  <TableRow
                    key={s.id}
                    className={cn('cursor-pointer hover:bg-muted/40', selectedIds.has(s.id) && 'bg-muted/30')}
                    onClick={() => openEditServico(s.id)}
                  >
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded cursor-pointer align-middle"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelected(s.id)}
                        aria-label={`Selecionar ${s.nome}`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.categoria
                        ? <Badge variant="secondary" className="text-[10px]">{s.categoria}</Badge>
                        : <span className="text-xs text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.categoriaServico === 'FLUXO' ? (
                        <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" title={s.servicoPai ? `Item interno de "${s.servicoPai.nome}"` : 'Item de fluxo'}>
                          <Network className="h-2.5 w-2.5 mr-0.5" /> Fluxo{s.servicoPai ? ` · ${s.servicoPai.nome}` : ''}
                        </Badge>
                      ) : s.categoriaServico === 'MENSAL' || s.recorrenteMensal ? (
                        <Badge variant="outline" className="text-[10px] h-5 bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300" title="Cobrança mensal recorrente — entra em contratos">
                          <ToggleRight className="h-2.5 w-2.5 mr-0.5" /> Mensal
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300" title="Cobrança pontual — uma cobrança por execução">
                          <ToggleLeft className="h-2.5 w-2.5 mr-0.5" /> Extra
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.grupos && s.grupos.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1 max-w-[180px]">
                          {s.grupos.slice(0, 2).map(({ grupo }) => (
                            <Badge
                              key={grupo.id}
                              variant="outline"
                              className="text-[10px] h-5 gap-1 pl-1.5 pr-2"
                              title={`Grupo · ${grupo.nome}`}
                            >
                              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: grupo.cor || '#94a3b8' }} />
                              <span className="truncate max-w-[120px]">{grupo.nome}</span>
                            </Badge>
                          ))}
                          {s.grupos.length > 2 && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground" title={s.grupos.slice(2).map(g => g.grupo.nome).join(', ')}>
                              +{s.grupos.length - 2}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{s.nome}</span>
                        {s.segmentoSlug && SEGMENTO_META[s.segmentoSlug as SegmentoSlug] && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 text-white"
                            style={{ backgroundColor: SEGMENTO_META[s.segmentoSlug as SegmentoSlug].cor, borderColor: SEGMENTO_META[s.segmentoSlug as SegmentoSlug].cor }}
                            title={`Segmento · ${SEGMENTO_META[s.segmentoSlug as SegmentoSlug].regime}`}
                          >
                            {SEGMENTO_META[s.segmentoSlug as SegmentoSlug].label}
                          </Badge>
                        )}
                        {(() => {
                          const ori = s._count?.encadeamentosOrigem ?? 0
                          const dest = s._count?.encadeamentosDestino ?? 0
                          if (ori === 0 && dest === 0) return null
                          return (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400"
                              title={`${ori} sucessor(es), ${dest} predecessor(es)`}
                            >
                              <Network className="h-2.5 w-2.5 mr-0.5" />
                              {ori > 0 && dest === 0 ? 'Início' :
                               ori === 0 && dest > 0 ? 'Final' :
                               'Cadeia'}
                            </Badge>
                          )
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">{s.slaHoras ?? '—'}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">{s.etapas.length}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">{s._count?.execucoes ?? 0}</TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEditServico(s.id)}><Edit className="h-4 w-4" />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicarServico(s.id)}><Copy className="h-4 w-4" />Duplicar</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteServico(s.id)}><Trash2 className="h-4 w-4" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalServicos > 0 && (
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{total}</span> registros</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  {getPageNumbers().map(p => (
                    <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                  ))}
                  <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ══════════════════ VIEW: EXECUCOES ══════════════════ */}
      {view === 'execucoes' && (
        <Card>
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
                <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={statusFilter || '__all__'} onValueChange={v => { setStatusFilter(v === '__all__' ? '' : v); setPage(1) }}>
                <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-w-xs w-full sm:w-auto">
              <Input placeholder="Buscar por serviço ou cliente..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Serviço</TableHead>
                <TableHead className="whitespace-nowrap">Cliente</TableHead>
                <TableHead className="w-[120px] whitespace-nowrap">Status</TableHead>
                <TableHead className="w-[120px] text-center whitespace-nowrap">Progresso</TableHead>
                <TableHead className="w-[110px] whitespace-nowrap">Iniciado em</TableHead>
                <TableHead className="w-[50px] text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
                </TableCell></TableRow>
              ) : !execucoes.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <Play className="h-8 w-8 mx-auto mb-2 opacity-30" />Nenhuma execução encontrada
                </TableCell></TableRow>
              ) : execucoes.map(exec => {
                const tPassos = exec.passos?.length || 0
                const cPassos = exec.passos?.filter(p => p.concluido).length || 0
                return (
                  <TableRow key={exec.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openChecklist(exec.id)}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{exec.servico?.nome || '—'}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{exec.cliente?.razaoSocial || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap"><StatusBadge status={exec.status} pausado={(exec as any).pausado} /></TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${tPassos > 0 ? (cPassos / tPassos) * 100 : 0}%`,
                              backgroundColor: (exec as any).pausado ? '#f59e0b' : MODULE_COLOR,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium shrink-0">{cPassos}/{tPassos}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(exec.iniciadoEm)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openChecklist(exec.id)}><Eye className="h-4 w-4" />Ver checklist</DropdownMenuItem>
                          {exec.status === 'EM_ANDAMENTO' && (
                            <>
                              <DropdownMenuItem onClick={() => handleConcluirExecucao(exec.id)}><CheckCircle2 className="h-4 w-4" />Concluir</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleCancelarExecucao(exec.id)}><XCircle className="h-4 w-4" />Cancelar</DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {totalExecucoes > 0 && (
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{total}</span> registros</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  {getPageNumbers().map(p => (
                    <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                  ))}
                  <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ══════════════════ Assistente (wizard) de cadastro base ══════════════════ */}
      <ServicoWizard open={wizardOpen} onOpenChange={setWizardOpen} areas={areas} />

      {/* ══════════════════ MODAL: Create/Edit Servico ══════════════════ */}
      <Dialog open={servicoModalOpen} onOpenChange={setServicoModalOpen}>
        <DialogContent className="sm:max-w-[1100px] h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeaderIcon
            icon={editingServico ? Pencil : Plus}
            color={editingServico ? 'sky' : 'emerald'}
            className="px-6 pt-5 pb-3 shrink-0 border-b border-border/40"
          >
            <DialogTitle>{editingServico ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
            <DialogDescription>Configure o template de serviço com etapas e passos.</DialogDescription>
          </DialogHeaderIcon>
          {/* Body — altura controlada (flex-1), scroll interno por aba.
              Modal tem tamanho fixo independente do conteúdo da aba ativa. */}
          <DialogBody className="px-6 pt-3 pb-2 flex-1 min-h-0 overflow-hidden flex flex-col space-y-3">
            <Tabs value={modalTab} onValueChange={v => setModalTab(v as 'geral' | 'etapas' | 'texto')} className="flex flex-col flex-1 min-h-0">
              <div className="flex justify-center shrink-0">
                <SlidingTabsList
                  activeValue={modalTab}
                  indicatorInsetY={4}
                  className="!shadow-sm !border !border-emerald-200 dark:!border-emerald-900/50 gap-1 !p-1 !bg-emerald-50/70 dark:!bg-emerald-950/20 !rounded-full w-fit items-center"
                  indicatorClassName="!bg-white dark:!bg-emerald-900/60 !shadow-md"
                >
                  <TabsTrigger
                    value="geral"
                    className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/60 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-800 dark:data-[state=active]:!text-emerald-200 gap-1.5 leading-none"
                  >
                    <FileText className="h-3.5 w-3.5" /> Geral
                  </TabsTrigger>
                  <TabsTrigger
                    value="etapas"
                    className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/60 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-800 dark:data-[state=active]:!text-emerald-200 gap-1.5 leading-none"
                  >
                    <ListChecks className="h-3.5 w-3.5" /> Etapas
                    {formEtapas.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{formEtapas.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="texto"
                    className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/60 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-800 dark:data-[state=active]:!text-emerald-200 gap-1.5 leading-none"
                  >
                    <Type className="h-3.5 w-3.5" /> Texto padrão
                  </TabsTrigger>
                </SlidingTabsList>
              </div>
              {/* Conteúdo da aba — anima com fadeSlideIn ao trocar, scroll interno.
                  key={modalTab} força remount → animação dispara em cada mudança. */}
              <div
                key={modalTab}
                className="flex-1 min-h-0 overflow-y-auto mt-4 pr-1"
                style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
              >
              <TabsContent value="geral" forceMount className="mt-0 space-y-5 data-[state=inactive]:hidden">
            {/* Linha 1: Nome + Área (campos primários de identificação — acima de tudo) */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-xs font-medium">Nome *</Label>
                <Input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder={formTipo === 'DECISAO' ? 'Ex: Cliente é PJ?' : 'Ex: Abertura de empresa'} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-6 space-y-1.5">
                <Label className="text-xs font-medium">Área</Label>
                <Select value={formCategoria || '__none__'} onValueChange={v => setFormCategoria(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione uma área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem área —</SelectItem>
                    {areas.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Tipo de bloco — Atividade (default) ou Decisão (losango no fluxograma) */}
            {!editingServico && (
              <div className="rounded-lg border p-3 bg-muted/20">
                <Label className="text-xs font-medium mb-2 block">Tipo de bloco no fluxograma</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTipo('ATIVIDADE')}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-md border-2 p-2 text-left transition-colors',
                      formTipo === 'ATIVIDADE'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                        : 'border-border/50 hover:border-emerald-300',
                    )}
                  >
                    <span className="text-[11px] font-semibold">Atividade</span>
                    <span className="text-[10px] text-muted-foreground">Bloco normal com etapas/passos a executar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTipo('DECISAO')}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-md border-2 p-2 text-left transition-colors',
                      formTipo === 'DECISAO'
                        ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/30'
                        : 'border-border/50 hover:border-violet-300',
                    )}
                  >
                    <span className="text-[11px] font-semibold">Decisão</span>
                    <span className="text-[10px] text-muted-foreground">Losango que roteia conforme condições</span>
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-12 gap-3">
              {/* Linha 2: SLA total · Prioridade · Valor padrão */}
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  SLA total
                  <span className="text-[10px] font-normal text-muted-foreground">(soma dos passos)</span>
                </Label>
                {(() => {
                  // SLA do serviço = somatório das horas declaradas nos passos do form
                  const total = formEtapas.reduce(
                    (s, et) => s + et.passos.reduce(
                      (ps, p) => ps + (p.slaHoras ? Number(p.slaHoras) : 0), 0,
                    ), 0,
                  )
                  return (
                    <div className="h-9 px-3 flex items-center text-sm bg-muted/40 border border-input rounded-md text-foreground font-medium tabular-nums">
                      {total > 0 ? `${total}h` : <span className="text-muted-foreground font-normal">—</span>}
                    </div>
                  )
                })()}
              </div>
              <div className="col-span-6 sm:col-span-4 space-y-1.5">
                <Label className="text-xs font-medium">Prioridade</Label>
                <Select value={formPrioridade} onValueChange={v => setFormPrioridade(v as typeof formPrioridade)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                    <SelectItem value="MEDIA">Média</SelectItem>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="URGENTE">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Catalogo de orcamento — valor monetário com mask BRL (1.234,56).
                  Internamente guardamos os centavos como string (ex: '12345' = R$ 123,45);
                  a exibição é formatada via Intl, e o submit divide por 100. */}
              <div className="col-span-6 sm:col-span-4 space-y-1.5">
                <Label className="text-xs font-medium">Valor padrão</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">R$</span>
                  <Input
                    inputMode="numeric"
                    value={formValorPadrao ? formatBRLFromCents(parseInt(formValorPadrao, 10)) : ''}
                    onChange={e => {
                      const cents = parseCentsFromInput(e.target.value)
                      setFormValorPadrao(cents === 0 ? '' : String(cents))
                    }}
                    placeholder="0,00"
                    className="h-9 text-sm pl-9 text-right tabular-nums"
                  />
                </div>
              </div>
              <div className="col-span-12 space-y-1.5">
                <Label className="text-xs font-medium">Descrição</Label>
                <textarea
                  value={formDescricao}
                  onChange={e => setFormDescricao(e.target.value)}
                  placeholder="Descrição completa do serviço — pode ser usada como texto orientativo no orçamento e no contrato."
                  rows={4}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="col-span-12 sm:col-span-4 flex items-center gap-2 pt-6">
                <input
                  id="disponivel-orc"
                  type="checkbox"
                  checked={formDisponivelOrcamento}
                  disabled={formEhServicoInterno || formEhObrigacaoAcessoria}
                  onChange={e => setFormDisponivelOrcamento(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-emerald-600 disabled:opacity-40"
                />
                <Label htmlFor="disponivel-orc" className={cn('text-xs font-medium cursor-pointer', (formEhServicoInterno || formEhObrigacaoAcessoria) && 'opacity-50')}>
                  Disponível em orçamentos
                </Label>
              </div>
              <div className="col-span-12 space-y-1.5">
                <Label className="text-[13px] font-semibold">Tipo de cadastro</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {([
                    { v: 'MENSAL'  as const, key: 'MENSAL',     label: 'Serviço Recorrente',     desc: 'Serviço que precisa ser executado com uma determinada recorrência', tone: 'sky',    Icon: Repeat },
                    { v: 'EXTRA'   as const, key: 'EXTRA',      label: 'Serviço Extraordinário', desc: 'Pontual — cobrança por execução',                                    tone: 'amber',  Icon: Zap },
                    { v: 'FLUXO'   as const, key: 'FLUXO',      label: 'Parte do Fluxo',         desc: 'Item interno de outro serviço',                                      tone: 'violet', Icon: Network },
                    // INTERNO/ACESSORIA são "categorias virtuais": persistem em flags próprias.
                    { v: 'EXTRA'   as const, key: 'INTERNO',    label: 'Serviço Interno',        desc: 'Serviço de execução interna',                                        tone: 'slate',  Icon: Lock },
                    { v: 'MENSAL'  as const, key: 'ACESSORIA',  label: 'Obrigação Acessória',  desc: 'Obrigações que são entregues com uma certa recorrência',             tone: 'rose',   Icon: ShieldCheck },
                  ]).map(opt => {
                    const active = opt.key === 'INTERNO'
                      ? formEhServicoInterno
                      : opt.key === 'ACESSORIA'
                        ? formEhObrigacaoAcessoria
                        : !formEhServicoInterno && !formEhObrigacaoAcessoria && formCategoriaServico === opt.v
                    const palette = {
                      sky:    { border: 'border-sky-500',    bg: 'bg-sky-50/60 dark:bg-sky-950/30',     hover: 'hover:border-sky-300',    icon: 'text-sky-600    dark:text-sky-300' },
                      amber:  { border: 'border-amber-500',  bg: 'bg-amber-50/60 dark:bg-amber-950/30', hover: 'hover:border-amber-300',  icon: 'text-amber-600  dark:text-amber-300' },
                      violet: { border: 'border-violet-500', bg: 'bg-violet-50/60 dark:bg-violet-950/30', hover: 'hover:border-violet-300', icon: 'text-violet-600 dark:text-violet-300' },
                      slate:  { border: 'border-slate-500',  bg: 'bg-slate-50/60 dark:bg-slate-900/30', hover: 'hover:border-slate-300',  icon: 'text-slate-600  dark:text-slate-300' },
                      rose:   { border: 'border-rose-500',   bg: 'bg-rose-50/60 dark:bg-rose-950/30',   hover: 'hover:border-rose-300',   icon: 'text-rose-600   dark:text-rose-300' },
                    }[opt.tone]
                    const Icon = opt.Icon
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          if (opt.key === 'INTERNO') {
                            setFormEhServicoInterno(true)
                            setFormEhObrigacaoAcessoria(false)
                            setFormCategoriaServico('EXTRA')
                            setFormDisponivelOrcamento(false)
                            setFormServicoPaiId('')
                          } else if (opt.key === 'ACESSORIA') {
                            setFormEhObrigacaoAcessoria(true)
                            setFormEhServicoInterno(false)
                            // Obrigação acessória é por natureza recorrente (mensal/anual/etc).
                            setFormCategoriaServico('MENSAL')
                            setFormDisponivelOrcamento(false)
                            setFormServicoPaiId('')
                          } else {
                            setFormEhServicoInterno(false)
                            setFormEhObrigacaoAcessoria(false)
                            setFormCategoriaServico(opt.v)
                            if (opt.v === 'FLUXO') loadServicosTopLevel()
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 rounded-md border-2 p-2.5 text-left transition-colors',
                          active ? `${palette.border} ${palette.bg}` : `border-border/50 ${palette.hover}`,
                        )}
                      >
                        <Icon className={cn('h-8 w-8 shrink-0', active ? palette.icon : 'text-muted-foreground')} strokeWidth={1.75} />
                        <div className="flex flex-col items-start gap-0.5 min-w-0">
                          <span className="text-[12px] font-semibold">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {formCategoriaServico === 'FLUXO' && (
                  <div className="pt-2">
                    <Label className="text-[13px] font-semibold mb-1.5 block">
                      Pertence ao serviço <span className="text-red-500">*</span>
                    </Label>
                    <Select value={formServicoPaiId || '__none__'} onValueChange={v => setFormServicoPaiId(v === '__none__' ? '' : v)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Selecione o serviço dono do fluxo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— nenhum —</SelectItem>
                        {servicosTopLevel
                          .filter(t => t.id !== editingServico?.id)
                          .map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Itens de Fluxo não aparecem na listagem principal nem em orçamentos — eles ficam como nós dentro do fluxo do serviço-pai.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Próximos serviços (encadeamento) — só em modo edição */}
            {editingServico && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold">Próximos serviços</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Ao concluir este serviço, os sucessores abaixo são criados automaticamente como parte de um processo.
                    </p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={openAddEnc}
                    className="gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />Adicionar sucessor
                  </Button>
                </div>
                <div className="space-y-2">
                  {encadeamentos.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6 italic border rounded-lg bg-muted/20">
                      Nenhum sucessor configurado. Este serviço é finalizado isoladamente quando concluído.
                    </p>
                  )}
                  {encadeamentos.map(enc => (
                    <div
                      key={enc.id}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow"
                    >
                      <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-xs font-bold">
                        {enc.ordem + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold truncate">{enc.servicoDestino.nome}</span>
                          {enc.iniciaAuto && enc.obrigatorio && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                              <Play className="h-2.5 w-2.5 mr-0.5" />Auto
                            </Badge>
                          )}
                          {!enc.iniciaAuto && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                              <Pause className="h-2.5 w-2.5 mr-0.5" />Manual
                            </Badge>
                          )}
                          {!enc.obrigatorio && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400">
                              Opcional
                            </Badge>
                          )}
                          {enc.herdaResponsavel && (
                            <Badge variant="outline" className="text-[10px] h-5">
                              Herda responsável
                            </Badge>
                          )}
                          {enc.condicao != null && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">
                              <AlertCircle className="h-2.5 w-2.5 mr-0.5" />Condicional
                            </Badge>
                          )}
                        </div>
                        {enc.observacao && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate" title={enc.observacao}>
                            {enc.observacao}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon-xs" onClick={() => openEditEnc(enc)} title="Editar">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-xs"
                          onClick={() => handleRemoveEnc(enc.id, enc.servicoDestino.nome)}
                          className="text-destructive"
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
              </TabsContent>
              <TabsContent value="etapas" forceMount className="mt-0 space-y-3 data-[state=inactive]:hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Etapas e passos</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Sequência de etapas com os passos dentro de cada uma. Arraste pra reordenar.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addEtapa} className="gap-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" />Adicionar Etapa
                  </Button>
                </div>
                <div className="space-y-4">
                  {formEtapas.map((etapa, ei) => (
                    <div key={ei} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-[10px] font-bold text-muted-foreground shrink-0 w-5">{ei + 1}.</span>
                        <Input value={etapa.nome} onChange={e => updateEtapa(ei, 'nome', e.target.value)} placeholder="Nome da etapa" className="h-8 text-xs flex-1" />
                        {/* SLA da etapa — derivado dos passos (read-only) */}
                        {(() => {
                          const etapaTotal = etapa.passos.reduce((s, p) => s + (p.slaHoras ? Number(p.slaHoras) : 0), 0)
                          return (
                            <div
                              className="flex items-center justify-center gap-1 shrink-0 h-8 px-2 min-w-[72px] rounded-md bg-muted/40 border border-input text-[11px] font-medium text-foreground tabular-nums"
                              title="SLA da etapa = somatório dos SLAs dos passos"
                            >
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span>{etapaTotal > 0 ? `${etapaTotal}h` : '—'}</span>
                            </div>
                          )
                        })()}
                        <Button variant="ghost" size="icon-xs" onClick={() => removeEtapa(ei)} className="text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                      {/* Passos com drag-and-drop */}
                      <div className="ml-7 space-y-1.5">
                        <PassosSortableList
                          passos={etapa.passos}
                          etapaIdx={ei}
                          onUpdate={updatePasso}
                          onRemove={removePasso}
                          onReorder={(fromId, toId) => reorderPassos(ei, fromId, toId)}
                        />
                        <Button variant="ghost" size="sm" onClick={() => addPasso(ei)} className="gap-1 text-[10px] text-muted-foreground h-6">
                          <Plus className="h-3 w-3" />Adicionar passo
                        </Button>
                      </div>
                    </div>
                  ))}
                  {formEtapas.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-10 italic border rounded-lg bg-muted/20">
                      Nenhuma etapa adicionada. Clique em &quot;Adicionar Etapa&quot; para começar.
                    </p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="texto" forceMount className="mt-0 space-y-2 data-[state=inactive]:hidden">
                <Label className="text-[13px] font-semibold">Texto padrão</Label>
                <p className="text-[11px] text-muted-foreground">
                  Conteúdo HTML usado como modelo inicial — pode ser inserido em e-mails, notas
                  ou documentação automática quando este serviço for executado.
                </p>
                <RichEditor
                  value={formTextoPadrao}
                  onChange={(html) => setFormTextoPadrao(html)}
                  placeholder="Comece a digitar o texto padrão... use a barra de ferramentas pra formatar."
                  className="min-h-[400px]"
                />
              </TabsContent>
              </div>
            </Tabs>
          </DialogBody>
          <DialogFooter className="px-6 py-3 shrink-0 border-t border-border/40">
            <Button variant="outline" onClick={() => setServicoModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveServico} disabled={saving} className="gap-1.5" style={{ backgroundColor: MODULE_COLOR }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingServico ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════ MODAL: Adicionar/Editar Sucessor ══════════════════ */}
      <Dialog open={encModalOpen} onOpenChange={setEncModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeaderIcon icon={Network} color="violet">
            <DialogTitle>{editingEnc ? 'Editar sucessor' : 'Adicionar sucessor'}</DialogTitle>
            <DialogDescription>
              Define como este serviço se conecta ao próximo na cadeia de processos.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Serviço sucessor *</Label>
              <Select
                value={encDestinoId || '__none__'}
                onValueChange={v => setEncDestinoId(v === '__none__' ? '' : v)}
                disabled={!!editingEnc}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Escolha o próximo serviço..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Selecione —</SelectItem>
                  {todosServicos
                    .filter(s => s.id !== editingServico?.id)
                    .filter(s => editingEnc || !encadeamentos.some(e => e.servicoDestinoId === s.id))
                    .map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {editingEnc && (
                <p className="text-[11px] text-muted-foreground">
                  Para mudar o serviço sucessor, remova este e adicione um novo.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Ordem</Label>
                <Input
                  type="number"
                  value={encOrdem}
                  onChange={e => setEncOrdem(e.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Quando há múltiplos sucessores em paralelo.</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={encObrigatorio}
                  onChange={e => setEncObrigatorio(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-input accent-emerald-600"
                />
                <div>
                  <span className="text-[13px] font-medium">Obrigatório</span>
                  <p className="text-[11px] text-muted-foreground">
                    Quando desmarcado, o sucessor é criado em estado &quot;aguardando início&quot; — gestor pode iniciar ou pular.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={encIniciaAuto}
                  onChange={e => setEncIniciaAuto(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-input accent-emerald-600"
                />
                <div>
                  <span className="text-[13px] font-medium">Iniciar automaticamente</span>
                  <p className="text-[11px] text-muted-foreground">
                    Se desmarcado, o sucessor fica aguardando confirmação do gestor antes de começar.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={encHerdaResponsavel}
                  onChange={e => setEncHerdaResponsavel(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-input accent-emerald-600"
                />
                <div>
                  <span className="text-[13px] font-medium">Herdar responsável do predecessor</span>
                  <p className="text-[11px] text-muted-foreground">
                    Se desmarcado, o sucessor fica sem responsável atribuído inicialmente.
                  </p>
                </div>
              </label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Observação</Label>
              <textarea
                value={encObservacao}
                onChange={e => setEncObservacao(e.target.value)}
                rows={2}
                placeholder="Texto orientativo para o gestor (opcional)"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {/* Builder de condicionais (Fase 7) */}
            <div className="space-y-2 pt-3 border-t">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[13px] font-semibold">Condição</Label>
                <Select value={encCondicaoModo} onValueChange={v => setEncCondicaoModo(v as typeof encCondicaoModo)}>
                  <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sempre">Sempre criar sucessor</SelectItem>
                    <SelectItem value="all">Todas as regras (E)</SelectItem>
                    <SelectItem value="any">Pelo menos uma regra (OU)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Avalia em runtime contra o cliente e o orçamento de origem. Sem regras = sempre cria.
              </p>
              {encCondicaoModo !== 'sempre' && (
                <div className="space-y-2">
                  {encRegras.map((r, i) => {
                    const semValor = r.op === 'is_null' || r.op === 'is_not_null'
                    const placeholder = (r.op === 'in' || r.op === 'not_in')
                      ? 'Valores separados por vírgula'
                      : (r.campo === 'orcamento.valorTotal' ? 'Número' : 'Valor')
                    return (
                      <div key={i} className="flex items-start gap-1.5">
                        <Select
                          value={r.campo || '__none__'}
                          onValueChange={v => setEncRegras(arr => arr.map((x, j) => j === i ? { ...x, campo: v === '__none__' ? '' : v } : x))}
                        >
                          <SelectTrigger className="h-8 text-xs flex-[2]"><SelectValue placeholder="Campo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cliente.regime">Cliente: regime</SelectItem>
                            <SelectItem value="cliente.situacao">Cliente: situação</SelectItem>
                            <SelectItem value="cliente.tributacao">Cliente: tributação</SelectItem>
                            <SelectItem value="cliente.categoria">Cliente: categoria</SelectItem>
                            <SelectItem value="cliente.tipoCliente">Cliente: tipo</SelectItem>
                            <SelectItem value="orcamento.tipo">Orçamento: tipo</SelectItem>
                            <SelectItem value="orcamento.valorTotal">Orçamento: valor total</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={r.op || '__none__'}
                          onValueChange={v => setEncRegras(arr => arr.map((x, j) => j === i ? { ...x, op: v === '__none__' ? '' : v } : x))}
                        >
                          <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue placeholder="Op" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="eq">igual a</SelectItem>
                            <SelectItem value="ne">diferente de</SelectItem>
                            <SelectItem value="in">está em</SelectItem>
                            <SelectItem value="not_in">não está em</SelectItem>
                            <SelectItem value="is_null">é vazio</SelectItem>
                            <SelectItem value="is_not_null">não é vazio</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={r.valor}
                          onChange={e => setEncRegras(arr => arr.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                          placeholder={placeholder}
                          disabled={semValor}
                          className="h-8 text-xs flex-[2]"
                        />
                        <Button
                          variant="ghost" size="icon-xs"
                          onClick={() => setEncRegras(arr => arr.filter((_, j) => j !== i))}
                          className="text-destructive shrink-0 mt-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setEncRegras(arr => [...arr, { campo: '', op: 'eq', valor: '' }])}
                    className="gap-1.5 text-xs h-7"
                  >
                    <Plus className="h-3 w-3" />Adicionar regra
                  </Button>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEnc} disabled={encSaving} className="gap-1.5" style={{ backgroundColor: MODULE_COLOR }}>
              {encSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingEnc ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════ MODAL: Checklist ══════════════════ */}
      <Dialog open={checklistOpen} onOpenChange={setChecklistOpen}>
        <DialogContent className="sm:max-w-[750px] max-h-[85vh] overflow-y-auto">
          {checklistLoading ? (
            <>
              {/* DialogTitle visualmente oculto durante loading — Radix exige
                  sempre presente para acessibilidade (screen readers). */}
              <DialogHeaderIcon icon={Loader2} srOnly>
                <DialogTitle>Carregando checklist</DialogTitle>
              </DialogHeaderIcon>
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando checklist...</div>
            </>
          ) : selectedExecucao && (
            <>
              <DialogHeaderIcon icon={ListChecks} color="violet">
                <DialogTitle className="flex items-center gap-3">
                  <span>{selectedExecucao.servico?.nome}</span>
                  <StatusBadge status={selectedExecucao.status} />
                </DialogTitle>
                <DialogDescription>
                  {selectedExecucao.cliente?.razaoSocial || 'Sem cliente'} — Iniciado em {formatDate(selectedExecucao.iniciadoEm)}
                </DialogDescription>
              </DialogHeaderIcon>
              <DialogBody className="space-y-4">
                {/* Banner de pausa (Fase 4) */}
                {(selectedExecucao as any).pausado && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 p-3 flex items-start gap-2.5">
                    <Pause className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Execução pausada</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                        {(selectedExecucao as any).pausadoMotivo || '—'}
                      </p>
                    </div>
                    <Button size="xs" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => handleRetomarExecucao(selectedExecucao.id)}>
                      <Play className="h-3 w-3 mr-1" /> Retomar
                    </Button>
                  </div>
                )}

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-semibold" style={{ color: MODULE_COLOR }}>{progressPct}% ({concluidos}/{totalPassos})</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: MODULE_COLOR }} />
                  </div>
                </div>

                {/* Passos grouped by etapa */}
                {Object.entries(etapasAgrupadas).map(([etapaNome, passos]) => {
                  return (
                    <div key={etapaNome} className="space-y-2">
                      <div className="flex items-center gap-2 border-b border-border/60 pb-1.5">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: MODULE_COLOR }} />
                        <h5 className="text-xs font-semibold text-foreground">{etapaNome}</h5>
                        <span className="text-[10px] text-muted-foreground">({passos.filter(p => p.concluido).length}/{passos.length})</span>
                      </div>
                      {passos.sort((a, b) => a.ordem - b.ordem).map(passo => {
                        const passoNome = (passo as any).passoNome || (passo as any).nome || ''
                        return (
                        <div key={passo.id} className={cn('rounded-md border p-3 transition-colors', passo.concluido ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50' : 'bg-card')}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={!!passo.concluido}
                              onCheckedChange={() => selectedExecucao.status === 'EM_ANDAMENTO' && handleTogglePasso(passo.id)}
                              disabled={selectedExecucao.status !== 'EM_ANDAMENTO'}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn('text-sm font-medium', passo.concluido && 'line-through text-muted-foreground')}>{passoNome}</span>
                              </div>
                              {passo.concluido && (passo.concluidoPorUsuario || passo.concluidoPor) && (
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                  <span>Concluído por</span>
                                  {passo.concluidoPorUsuario?.image ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
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
                                  <span className="font-medium text-foreground/80">{passo.concluidoPorUsuario?.name ?? '—'}</span>
                                  {passo.concluidoEm && <span>em {formatDate(passo.concluidoEm)}</span>}
                                </div>
                              )}
                              {selectedExecucao.status === 'EM_ANDAMENTO' && (
                                <Input
                                  placeholder="Observação..."
                                  defaultValue={passo.observacao || ''}
                                  onBlur={e => handlePassoObs(passo.id, e.target.value)}
                                  className="h-7 text-xs mt-1.5"
                                />
                              )}
                              {/* Fase 4: comentarios + anexos inline */}
                              <PassoExtras
                                passoId={passo.id}
                                editavel={selectedExecucao.status === 'EM_ANDAMENTO' && !(selectedExecucao as any).pausado}
                              />
                            </div>
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  )
                })}
                {totalPassos === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhum passo encontrado nesta execução.</p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setChecklistOpen(false)}>Fechar</Button>
                {selectedExecucao.status === 'EM_ANDAMENTO' && (
                  <>
                    {!(selectedExecucao as any).pausado && (
                      <Button variant="outline" size="sm" onClick={() => abrirPausarModal(selectedExecucao.id)} className="gap-1.5">
                        <Pause className="h-4 w-4" />Pausar
                      </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={() => handleCancelarExecucao(selectedExecucao.id)} className="gap-1.5">
                      <XCircle className="h-4 w-4" />Cancelar
                    </Button>
                    <Button size="sm" onClick={() => handleConcluirExecucao(selectedExecucao.id)} className="gap-1.5" style={{ backgroundColor: '#10b981' }}>
                      <CheckCircle2 className="h-4 w-4" />Concluir
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Pausar — coleta motivo (Fase 4) */}
      <Dialog open={pausarModal.open} onOpenChange={(o) => !o && setPausarModal({ open: false, id: '', motivo: '' })}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeaderIcon icon={Pause} color="amber">
            <DialogTitle className="text-[15px]">Pausar execução</DialogTitle>
            <DialogDescription className="text-[11px]">
              O SLA não corre durante a pausa — ao retomar, o prazo é estendido pelo tempo pausado.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold mb-1.5">Motivo da pausa <span className="text-rose-500">*</span></Label>
            <textarea
              value={pausarModal.motivo}
              onChange={e => setPausarModal(p => ({ ...p, motivo: e.target.value }))}
              rows={3}
              placeholder="Ex: aguardando documentação do cliente..."
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPausarModal({ open: false, id: '', motivo: '' })}>Cancelar</Button>
            <Button size="sm" className="gap-1.5 text-white" style={{ backgroundColor: '#f59e0b' }} onClick={handlePausarExecucao} disabled={!pausarModal.motivo.trim()}>
              <Pause className="h-4 w-4" /> Pausar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// PassosSortableList — lista de passos drag-and-drop dentro de uma etapa
// ============================================================
type PassoForm = { id?: string; dndId: string; nome: string; ordem: number; obrigatorio: boolean; permiteIgnorar: boolean; slaHoras: string }

function PassosSortableList({ passos, etapaIdx, onUpdate, onRemove, onReorder }: {
  passos: PassoForm[]
  etapaIdx: number
  onUpdate: (etapaIdx: number, passoIdx: number, field: string, value: unknown) => void
  onRemove: (etapaIdx: number, passoIdx: number) => void
  onReorder: (fromDndId: string, toDndId: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    onReorder(String(active.id), String(over.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={passos.map(p => p.dndId)} strategy={verticalListSortingStrategy}>
        {passos.map((passo, pi) => (
          <SortablePasso
            key={passo.dndId}
            passo={passo}
            etapaIdx={etapaIdx}
            passoIdx={pi}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortablePasso({ passo, etapaIdx, passoIdx, onUpdate, onRemove }: {
  passo: PassoForm
  etapaIdx: number
  passoIdx: number
  onUpdate: (etapaIdx: number, passoIdx: number, field: string, value: unknown) => void
  onRemove: (etapaIdx: number, passoIdx: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: passo.dndId })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center gap-2', isDragging && 'shadow-lg rounded bg-card')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none p-0.5"
        title="Arraste para reordenar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-[9px] text-muted-foreground w-4 text-right shrink-0">{passoIdx + 1}</span>
      <Input value={passo.nome} onChange={e => onUpdate(etapaIdx, passoIdx, 'nome', e.target.value)} placeholder="Nome do passo" className="h-7 text-xs flex-1" />
      <div className="flex w-24 shrink-0">
        <Input
          type="number"
          value={passo.slaHoras}
          onChange={e => onUpdate(etapaIdx, passoIdx, 'slaHoras', e.target.value)}
          placeholder="SLA"
          className="h-7 text-xs rounded-r-none"
        />
        <span className="inline-flex items-center px-1.5 h-7 border border-l-0 border-input bg-muted text-[10px] text-muted-foreground rounded-r-md">Hs</span>
      </div>
      <button
        type="button"
        onClick={() => onUpdate(etapaIdx, passoIdx, 'obrigatorio', !passo.obrigatorio)}
        className={cn(
          'shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors font-medium',
          passo.obrigatorio
            ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
        )}
        title={passo.obrigatorio ? 'Obrigatório (clique para tornar opcional)' : 'Opcional (clique para tornar obrigatório)'}
      >
        {passo.obrigatorio
          ? <><AlertCircle className="h-3 w-3" />Obrigatório</>
          : <><Check className="h-3 w-3" />Opcional</>}
      </button>
      {/* Toggle "Ignorável" removido — passos opcionais bastam ter Obrigatório desligado. */}
      <Button variant="ghost" size="icon-xs" onClick={() => onRemove(etapaIdx, passoIdx)} className="text-destructive shrink-0"><Trash2 className="h-3 w-3" /></Button>
    </div>
  )
}

// ============================================================
// PassoExtras — comentarios + anexos colapsaveis por passo (Fase 4)
// ============================================================
function PassoExtras({ passoId, editavel }: { passoId: string; editavel: boolean }) {
  const [expandido, setExpandido] = useState<'none' | 'comentarios' | 'anexos'>('none')
  const [comentarios, setComentarios] = useState<Array<{ id: string; mensagem: string; createdAt: string; usuario: { name: string; image: string | null } | null }>>([])
  const [anexos, setAnexos] = useState<Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; createdAt: string }>>([])
  const [novoComentario, setNovoComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useState<HTMLInputElement | null>(null)

  // Conta totais (mesmo sem expandir, pra mostrar nos botoes)
  const [totais, setTotais] = useState<{ comentarios: number; anexos: number }>({ comentarios: 0, anexos: 0 })

  async function fetchTotais() {
    try {
      const [c, a] = await Promise.all([
        (trpc.servico as any).listComentariosPasso.query({ execPassoId: passoId }),
        (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId }),
      ])
      setTotais({ comentarios: c?.length ?? 0, anexos: a?.length ?? 0 })
    } catch { /* sem perm */ }
  }

  useEffect(() => { fetchTotais() }, [passoId])

  async function abrirComentarios() {
    setExpandido(expandido === 'comentarios' ? 'none' : 'comentarios')
    if (expandido !== 'comentarios') {
      try {
        const data = await (trpc.servico as any).listComentariosPasso.query({ execPassoId: passoId })
        setComentarios(data || [])
      } catch { /* */ }
    }
  }

  async function abrirAnexos() {
    setExpandido(expandido === 'anexos' ? 'none' : 'anexos')
    if (expandido !== 'anexos') {
      try {
        const data = await (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId })
        setAnexos(data || [])
      } catch { /* */ }
    }
  }

  async function enviarComentario() {
    if (!novoComentario.trim() || enviando) return
    setEnviando(true)
    try {
      await (trpc.servico as any).addComentarioPasso.mutate({ execPassoId: passoId, mensagem: novoComentario.trim() })
      setNovoComentario('')
      const data = await (trpc.servico as any).listComentariosPasso.query({ execPassoId: passoId })
      setComentarios(data || [])
      setTotais(t => ({ ...t, comentarios: (data || []).length }))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }

  async function uploadAnexo(file: File) {
    if (file.size > 10 * 1024 * 1024) { alerts.error('Arquivo muito grande', 'Máx 10MB'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error('Falha no upload')
      const uploaded = await res.json()
      await (trpc.servico as any).addAnexoPasso.mutate({
        execPassoId: passoId,
        fileName: file.name,
        fileUrl: uploaded.url,
        fileSize: file.size,
        mimeType: file.type,
      })
      const data = await (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId })
      setAnexos(data || [])
      setTotais(t => ({ ...t, anexos: (data || []).length }))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setUploading(false) }
  }

  async function removerAnexo(id: string) {
    if (!await alerts.confirmDelete('este anexo')) return
    try {
      await (trpc.servico as any).deleteAnexoPasso.mutate({ id })
      const data = await (trpc.servico as any).listAnexosPasso.query({ execPassoId: passoId })
      setAnexos(data || [])
      setTotais(t => ({ ...t, anexos: (data || []).length }))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="mt-2 space-y-2">
      {/* Botoes toggle dos extras */}
      <div className="flex items-center gap-1.5 text-[10px]">
        <button
          type="button"
          onClick={abrirComentarios}
          className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors', expandido === 'comentarios' && 'bg-muted text-foreground')}
        >
          <MessageSquare className="h-3 w-3" />
          {totais.comentarios > 0 ? `${totais.comentarios} comentário${totais.comentarios > 1 ? 's' : ''}` : 'Comentar'}
          {expandido === 'comentarios' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={abrirAnexos}
          className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors', expandido === 'anexos' && 'bg-muted text-foreground')}
        >
          <Paperclip className="h-3 w-3" />
          {totais.anexos > 0 ? `${totais.anexos} anexo${totais.anexos > 1 ? 's' : ''}` : 'Anexar'}
          {expandido === 'anexos' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Painel de comentarios */}
      {expandido === 'comentarios' && (
        <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-2">
          {comentarios.length > 0 ? (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {comentarios.map(c => (
                <div key={c.id} className="text-[11px] bg-card rounded p-1.5">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-semibold">{c.usuario?.name || 'Usuário'}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-[11px] whitespace-pre-wrap break-words">{c.mensagem}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">Nenhum comentário ainda.</p>
          )}
          {editavel && (
            <div className="flex items-end gap-1.5">
              <textarea
                value={novoComentario}
                onChange={e => setNovoComentario(e.target.value)}
                placeholder="Escreva um comentário..."
                rows={2}
                className="flex-1 text-[11px]"
              />
              <Button size="xs" onClick={enviarComentario} disabled={enviando || !novoComentario.trim()} className="gap-1 shrink-0" style={{ backgroundColor: '#10b981' }}>
                {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Painel de anexos */}
      {expandido === 'anexos' && (
        <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-2">
          {anexos.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {anexos.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-[11px] bg-card rounded px-2 py-1 group">
                  <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                  <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate flex-1 hover:underline" style={{ color: '#10b981' }}>
                    {a.fileName}
                  </a>
                  {a.fileSize && <span className="text-[10px] text-muted-foreground">{Math.round(a.fileSize / 1024)} KB</span>}
                  {editavel && (
                    <button type="button" onClick={() => removerAnexo(a.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">Nenhum anexo ainda.</p>
          )}
          {editavel && (
            <label className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 px-3 border border-dashed border-border/60 rounded hover:bg-muted/30 cursor-pointer transition-colors">
              {uploading ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Enviando...</>
              ) : (
                <><Plus className="h-3 w-3" /> Adicionar arquivo</>
              )}
              <input
                ref={el => { fileInputRef[0] = el }}
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) await uploadAnexo(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  )
}
