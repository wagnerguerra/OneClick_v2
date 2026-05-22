'use client'

import { useEffect, useState, useCallback, useRef, createContext, useContext, Fragment } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Workflow, Loader2, ArrowLeft, Save, Plus, Trash2, Edit, AlertCircle,
  Play, Pause, FileText, Layers, GitBranch, History, ListChecks,
  GripVertical, Tag, Clock, ArrowRight, X, ChevronRight, ChevronDown, Network, Repeat, Zap, Type, Check,
  Bell, Mail, UserCog, CircleDollarSign, AlignLeft, Info, Settings, CalendarDays, Lock, Unlock, ShieldCheck, Database,
  StickyNote, Link as LinkIcon, Paperclip,
} from 'lucide-react'
import {
  Button, Card, CardHeader, CardContent, Badge, Label, Input, cn,
  Tabs, TabsTrigger, TabsContent, SlidingTabsList,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  RichEditor, Checkbox,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FluxoEditor, type FluxoNode, type FluxoEdge } from './_components/fluxo-editor'
import { MateriaisSection, type Material } from './_components/materiais-section'
import { NotificacoesSection } from './_components/notificacoes-section'
import { PassoEmailsSection } from './_components/passo-emails-section'
import { PassoLembretesSection } from './_components/passo-lembretes-section'
import { PassoCamposClienteSection } from './_components/passo-campos-cliente-section'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // Emerald (Cadastros / Serviços)

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
  id?: string
  dndId: string
  nome: string
  ordem: number
  obrigatorio: boolean
  permiteIgnorar: boolean
  /** Texto exibido no input — pode estar em qualquer formato: "1h 30m", "45m", "2h", "90".
   *  É parseado para minutos totais ao salvar via parseSlaMin(). */
  slaText: string
  /** Dependência opcional — o passo só pode iniciar após este. Passos sem
   *  dependência rodam em paralelo a outros que também não dependem deles. */
  dependeDoPassoId: string | null
  /** Materiais de apoio anexados a este passo no template. */
  materiais?: Material[]
  /** Contagem agregada de e-mails de conclusão / lembretes ativos / campos
   *  do cliente vinculados ao passo — vem do `_count` incluído no getServico.
   *  Usado pra mostrar os mini-chips indicadores na linha do passo. */
  emailsCount?: number
  lembretesCount?: number
  camposClienteCount?: number
}

/** Parseia formatos amigáveis ("1h 30m", "45m", "2h", "1.5h", "90") em minutos totais.
 *  Retorna null se vazio ou inválido. */
function parseSlaMin(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  // "1h 30m" / "1h30m" / "1h" / "30m" / "1.5h"
  const m = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/)
  if (m && (m[1] || m[2])) {
    const h = m[1] ? parseFloat(m[1].replace(',', '.')) : 0
    const min = m[2] ? parseInt(m[2], 10) : 0
    return Math.round(h * 60 + min)
  }
  // "90" — número puro = minutos
  const n = parseFloat(s.replace(',', '.'))
  if (!Number.isNaN(n) && n >= 0) return Math.round(n)
  return null
}

/** Formata minutos totais em string amigável: 90 → "1h 30m", 45 → "45m", 120 → "2h" */
function formatSlaMin(min: number | null | undefined): string {
  if (min == null || min < 0) return ''
  if (min === 0) return '0m'
  const h = Math.floor(min / 60)
  const rest = min % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h ${rest}m`
}

// ─────────────────────────────────────────────────────────────
// Decomposição rica + previsão de conclusão em dias úteis.
// Jornada padrão: 8h/dia (480 min), 5 dias/semana (2400 min).
// ─────────────────────────────────────────────────────────────
const MIN_POR_HORA    = 60
const MIN_POR_DIA     = 8 * 60         // 480
const MIN_POR_SEMANA  = 5 * MIN_POR_DIA // 2400
const HORA_INICIO_DIA = 9              // 09:00
const HORA_FIM_DIA    = 17             // 17:00 (8h corridas; intervalo de almoço fora da conta)

/** Decompõe minutos totais em { semanas, dias, horas, minutos } usando jornada útil. */
function decomporSlaRich(min: number): { semanas: number; dias: number; horas: number; minutos: number } {
  let resto = Math.max(0, Math.round(min))
  const semanas = Math.floor(resto / MIN_POR_SEMANA);  resto -= semanas * MIN_POR_SEMANA
  const dias    = Math.floor(resto / MIN_POR_DIA);     resto -= dias    * MIN_POR_DIA
  const horas   = Math.floor(resto / MIN_POR_HORA);    resto -= horas   * MIN_POR_HORA
  const minutos = resto
  return { semanas, dias, horas, minutos }
}

/** Formata bonito: "1 sem 2d 3h 15m". Omite zeros do início. */
function formatSlaRich(min: number | null | undefined): string {
  if (min == null || min <= 0) return '0m'
  const { semanas, dias, horas, minutos } = decomporSlaRich(min)
  const parts: string[] = []
  if (semanas > 0) parts.push(`${semanas} sem`)
  if (dias > 0)    parts.push(`${dias}d`)
  if (horas > 0)   parts.push(`${horas}h`)
  if (minutos > 0) parts.push(`${minutos}m`)
  return parts.join(' ') || '0m'
}

/** Calcula a data/hora de conclusão prevista a partir de `inicio`, somando `slaMin`
 *  e respeitando jornada de 8h em dias úteis (seg-sex). Pula sábado e domingo;
 *  feriados não são considerados (não temos calendário). */
function calcularPrevisaoConclusao(slaMin: number, inicio: Date = new Date()): Date {
  if (slaMin <= 0) return new Date(inicio)
  let cursor = new Date(inicio)

  // Helper: avança para o próximo início de expediente útil
  const proximoExpediente = (d: Date): Date => {
    const r = new Date(d)
    const hr = r.getHours()
    const dia = r.getDay()
    // Sáb (6) ou Dom (0) → segue até segunda 9h
    if (dia === 0)        { r.setDate(r.getDate() + 1); r.setHours(HORA_INICIO_DIA, 0, 0, 0); return r }
    if (dia === 6)        { r.setDate(r.getDate() + 2); r.setHours(HORA_INICIO_DIA, 0, 0, 0); return r }
    // Dia útil mas fora do horário
    if (hr < HORA_INICIO_DIA)      { r.setHours(HORA_INICIO_DIA, 0, 0, 0); return r }
    if (hr >= HORA_FIM_DIA)        {
      r.setDate(r.getDate() + 1)
      r.setHours(HORA_INICIO_DIA, 0, 0, 0)
      return proximoExpediente(r)
    }
    return r
  }

  cursor = proximoExpediente(cursor)
  let restanteMin = slaMin

  while (restanteMin > 0) {
    // Calcula quanto tempo sobra no expediente atual
    const fimExpediente = new Date(cursor)
    fimExpediente.setHours(HORA_FIM_DIA, 0, 0, 0)
    const sobraExpedienteMs = fimExpediente.getTime() - cursor.getTime()
    const sobraExpedienteMin = Math.floor(sobraExpedienteMs / 60000)

    if (restanteMin <= sobraExpedienteMin) {
      // Cabe no dia atual — termina aqui
      cursor = new Date(cursor.getTime() + restanteMin * 60000)
      restanteMin = 0
    } else {
      // Consome o que sobra e pula pro próximo expediente útil
      restanteMin -= sobraExpedienteMin
      const proxDia = new Date(cursor)
      proxDia.setDate(proxDia.getDate() + 1)
      proxDia.setHours(HORA_INICIO_DIA, 0, 0, 0)
      cursor = proximoExpediente(proxDia)
    }
  }

  return cursor
}

interface Etapa {
  id?: string
  nome: string
  ordem: number
  passos: Passo[]
  /** Materiais de apoio anexados a esta etapa no template. */
  materiais?: Material[]
}

/** SLA total da etapa em minutos = SOMA do tempo de todos os passos.
 *  Modelo operacional típico: o operador executa os passos em sequência
 *  (uma pessoa não roda 2 ao mesmo tempo). A `dependeDoPassoId` continua
 *  controlando o gating em runtime (não permite concluir antes do anterior),
 *  mas não afeta a contagem do tempo total. */
function calcEtapaMinutos(et: Etapa): number {
  return et.passos.reduce((sum, p) => sum + (parseSlaMin(p.slaText) ?? 0), 0)
}

/** SLA total do serviço em minutos = soma das etapas (etapas ainda são sequenciais). */
function calcServicoMinutos(etapas: Etapa[]): number {
  return etapas.reduce((sum, et) => sum + calcEtapaMinutos(et), 0)
}

/** Retorna true se `candidate` está na cadeia de descendentes de `target`
 *  (i.e. depende, direta ou indiretamente, de `target`). Usado pra evitar
 *  ciclos no picker de dependências. */
function isDescendantOf(candidateId: string, targetId: string, byId: Map<string, Passo>): boolean {
  const seen = new Set<string>()
  let cur: string | null = byId.get(candidateId)?.dependeDoPassoId ?? null
  while (cur && !seen.has(cur)) {
    if (cur === targetId) return true
    seen.add(cur)
    cur = byId.get(cur)?.dependeDoPassoId ?? null
  }
  return false
}

/** Index global de todos os passos persistidos do template, com sua etapa-pai
 *  pra renderizar como "Passo X · Etapa Y" no select. */
function buildPassoIndex(etapas: Etapa[]): Map<string, { passo: Passo; etapaNome: string }> {
  const m = new Map<string, { passo: Passo; etapaNome: string }>()
  for (const et of etapas) {
    for (const p of et.passos) {
      if (p.id) m.set(p.id, { passo: p, etapaNome: et.nome })
    }
  }
  return m
}

/** Calcula o "trilho" (depth da cadeia de dependência) de cada passo na etapa.
 *  Passos sem dependência ficam no trilho 0; quem depende de um L0 vira L1, etc.
 *  Passos no mesmo trilho são paralelos. Drafts ficam no trilho 0. */
function computePassoLayers(passos: Passo[]): Map<string, number> {
  const byId = new Map<string, Passo>()
  for (const p of passos) {
    if (p.id) byId.set(p.id, p)
  }
  const layer = new Map<string, number>()
  const inFlight = new Set<string>()
  function calc(id: string): number {
    const cached = layer.get(id)
    if (cached !== undefined) return cached
    if (inFlight.has(id)) return 0
    const p = byId.get(id)
    if (!p) return 0
    inFlight.add(id)
    const dep = p.dependeDoPassoId
    const result = dep && byId.has(dep) ? calc(dep) + 1 : 0
    inFlight.delete(id)
    layer.set(id, result)
    return result
  }
  for (const p of passos) {
    if (p.id) calc(p.id)
  }
  return layer
}

/** Paleta de cores cíclica para trilhos. L0 = sem cor (estado neutro padrão).
 *  As demais cores dão um leve tint pra agrupar visualmente. */
const LAYER_BG_CLASSES = [
  '', // L0 — nenhum tint, mantém a cor padrão da linha
  'bg-emerald-50/60 dark:bg-emerald-950/20',
  'bg-sky-50/60 dark:bg-sky-950/20',
  'bg-amber-50/60 dark:bg-amber-950/20',
  'bg-rose-50/60 dark:bg-rose-950/20',
  'bg-violet-50/60 dark:bg-violet-950/20',
]
function getLayerBgClass(layer: number): string {
  if (layer <= 0) return LAYER_BG_CLASSES[0]
  return LAYER_BG_CLASSES[((layer - 1) % (LAYER_BG_CLASSES.length - 1)) + 1]
}

/** Conta quantos trilhos distintos existem (qtd. de níveis com pelo menos 1 passo). */
function countTrilhos(layers: Map<string, number>): number {
  const set = new Set<number>()
  for (const v of layers.values()) set.add(v)
  return set.size
}

interface Encadeamento {
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
}

// FluxoNode e FluxoEdge importados do componente fluxo-editor (mesma forma do payload backend)

const genDndId = () => `dnd-${Math.random().toString(36).slice(2, 10)}`

export default function ServicoDetailPage() {
  const router = useRouter()
  const params = useParams() as { id: string }
  const id = params.id

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'visao' | 'etapas' | 'fluxo' | 'encadeamento' | 'texto' | 'notificacoes'>('visao')
  // Pill ativa dentro da aba Visão geral
  const [visaoPill, setVisaoPill] = useState<'identificacao' | 'descricao' | 'comercial' | 'atribuicao' | 'avancado' | 'vencimentosMensais'>('identificacao')

  // Overrides de vencimento por mês (Fase B Acessórias) — map mes 1-12 → valor encoded
  const [vencimentosMensais, setVencimentosMensais] = useState<Record<number, number>>({})

  // ── Configurações avançadas (espelha campos do Acessórias) ──
  const [mininome, setMininome] = useState<string>('')
  const [tempoPrevistoMinutos, setTempoPrevistoMinutos] = useState<string>('')
  const [lembrarDiasAntes, setLembrarDiasAntes] = useState<number>(0)
  const [tipoDiasAntes, setTipoDiasAntes] = useState<'CORRIDOS' | 'UTEIS'>('CORRIDOS')
  const [sabadoEhUtil, setSabadoEhUtil] = useState<boolean>(false)
  const [exigirRobo, setExigirRobo] = useState<boolean>(false)
  const [passivelDeMulta, setPassivelDeMulta] = useState<boolean>(true)
  const [alertaGuiaNaoLida, setAlertaGuiaNaoLida] = useState<boolean>(true)
  const [comentarioPadrao, setComentarioPadrao] = useState<string>('')
  /** Texto padrão (HTML do TipTap) — modelo para e-mails, notas, documentação. */
  const [textoPadrao, setTextoPadrao] = useState<string>('')
  /** IDs dos grupos a que o serviço pertence — M→N. Editado na Visão Geral. */
  const [gruposIds, setGruposIds] = useState<string[]>([])
  /** Catálogo de grupos ativos carregado sob demanda na primeira interação. */
  const [todosGrupos, setTodosGrupos] = useState<Array<{ id: string; nome: string; cor: string | null }>>([])

  // Sensors @dnd-kit — distance ativa o drag após 6px de movimento (evita
  // disparar drag em cliques rápidos nos campos editáveis).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Form fields (Visão geral)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [prioridade, setPrioridade] = useState<'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'>('MEDIA')
  const [valorPadrao, setValorPadrao] = useState('')
  const [disponivelOrcamento, setDisponivelOrcamento] = useState(true)
  /** MENSAL = recorrente; EXTRA = pontual; FLUXO = item interno de outro serviço. */
  const [categoriaServico, setCategoriaServico] = useState<'MENSAL' | 'EXTRA' | 'FLUXO'>('EXTRA')
  /** Serviço de execução exclusivamente interna — não aparece no catálogo do orçamento.
   *  Mutuamente exclusivo com Recorrente/Extra/Fluxo (no UI é a 4ª pill do "Tipo de cadastro"). */
  const [ehServicoInterno, setEhServicoInterno] = useState(false)
  /** Quando true, o registro é template de Obrigação Acessória — define o destino do botão "voltar". */
  const [ehObrigacaoAcessoria, setEhObrigacaoAcessoria] = useState(false)
  /** Quando categoriaServico=FLUXO, aponta pro serviço top-level dono do fluxo.
   *  Lista de pais reusada de `todosServicos` (já carregada via fetchTodosServicos). */
  const [servicoPaiId, setServicoPaiId] = useState<string>('')
  const [segmentoSlug, setSegmentoSlug] = useState<string | null>(null)
  // Atribuição legado (mantido só pra blocos PERGUNTA com estratégia explícita)
  const [atribuicaoResponsavel, setAtribuicaoResponsavel] = useState<'ORCAMENTO' | 'CLIENTE_AREA' | 'MANUAL_FIXO' | 'HERDA_PREDECESSOR'>('ORCAMENTO')
  const [responsavelFixoId, setResponsavelFixoId] = useState<string>('')
  const [responsaveisAtribuiveis, setResponsaveisAtribuiveis] = useState<Array<{ id: string; name: string; email: string | null }>>([])

  // Atribuição multi-valor (novo modelo — fonte da verdade). União das 4 fontes
  // resolve os candidatos quando a execução é criada. 1 candidato → responsavelId
  // direto; 0 ou >1 → claim-first (todos veem em /meus-servicos, primeiro a
  // marcar passo reivindica).
  const [atribuicaoColaboradores, setAtribuicaoColaboradores] = useState<string[]>([])
  const [atribuicaoAreas, setAtribuicaoAreas] = useState<string[]>([])
  const [atribuicaoUsaOrcamento, setAtribuicaoUsaOrcamento] = useState(false)
  const [atribuicaoUsaClienteArea, setAtribuicaoUsaClienteArea] = useState(false)
  /** Lista universal de users com area pra popular o select de colaboradores. */
  const [usuariosForSelect, setUsuariosForSelect] = useState<Array<{ id: string; name: string; areaName: string | null }>>([])
  const [saving, setSaving] = useState(false)

  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])

  // Etapas
  const [etapas, setEtapas] = useState<Etapa[]>([])
  /** Etapas colapsadas — guarda IDs (ou draftKeys) das etapas que estão minimizadas.
   *  Vazio = todas expandidas (default). */
  const [collapsedEtapas, setCollapsedEtapas] = useState<Set<string>>(new Set())
  // ID do passo cujo dialog de "E-mails de conclusão" está aberto. Disparado
  // pelo item "E-mail" do dropdown do MateriaisSection inline.
  const [openEmailsPasso, setOpenEmailsPasso] = useState<string | null>(null)
  // ID do passo cujo dialog de "Lembretes" está aberto. Disparado pelo item "Lembrete"
  // do dropdown do MateriaisSection.
  const [openLembretesPasso, setOpenLembretesPasso] = useState<string | null>(null)
  // ID do passo cujo dialog de "Campos do cliente" está aberto.
  const [openCamposClientePasso, setOpenCamposClientePasso] = useState<string | null>(null)
  // Quando setado, abre o dialog do MateriaisSection filtrado por tipo (NOTA/LINK/ARQUIVO)
  // pro passo correspondente. Disparado pelos chips agregados no input group.
  const [openMateriaisPasso, setOpenMateriaisPasso] = useState<{ passoId: string; tipo: 'NOTA' | 'LINK' | 'ARQUIVO' } | null>(null)
  // IDs de passos em animação de saída — durante o fade-out a linha continua no
  // DOM, mas com opacity:0 + max-height:0. Removida do state ao fim da transição.
  const [exitingPassoIds, setExitingPassoIds] = useState<Set<string>>(new Set())
  function toggleEtapaCollapse(key: string) {
    setCollapsedEtapas(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function collapseAllEtapas() {
    setCollapsedEtapas(new Set(etapas.map(et => et.id ?? (et as unknown as { __draftKey?: string }).__draftKey ?? '').filter(Boolean)))
  }
  function expandAllEtapas() {
    setCollapsedEtapas(new Set())
  }

  // Encadeamentos
  const [encadeamentos, setEncadeamentos] = useState<Encadeamento[]>([])
  const [todosServicos, setTodosServicos] = useState<Array<{ id: string; nome: string }>>([])
  const [encModalOpen, setEncModalOpen] = useState(false)
  const [editingEnc, setEditingEnc] = useState<{ id: string } | null>(null)
  const [encDestinoId, setEncDestinoId] = useState('')
  const [encOrdem, setEncOrdem] = useState('0')
  const [encIniciaAuto, setEncIniciaAuto] = useState(true)
  const [encObrigatorio, setEncObrigatorio] = useState(true)
  const [encHerdaResponsavel, setEncHerdaResponsavel] = useState(true)
  const [encObservacao, setEncObservacao] = useState('')
  const [encSaving, setEncSaving] = useState(false)

  // Fluxo (DAG)
  const [fluxoData, setFluxoData] = useState<{ nodes: FluxoNode[]; edges: FluxoEdge[] } | null>(null)
  /** Bumpa a cada refetch — força o FluxoEditor a re-montar com os novos dados
   *  via `key={fluxoVersion}`. Evita full page reload ao adicionar/remover
   *  blocos, mantendo o usuário na aba Fluxo. */
  const [fluxoVersion, setFluxoVersion] = useState(0)
  const [fluxoLoading, setFluxoLoading] = useState(false)

  // ── Loaders ────────────────────────────────────────────────

  const fetchServico = useCallback(async () => {
    setLoading(true)
    try {
      const s = await (trpc.servico as any).getServico.query({ id })
      if (!s) {
        alerts.error('Erro', 'Serviço não encontrado')
        return
      }
      setNome(s.nome)
      setDescricao(s.descricao || '')
      setCategoria(s.categoria || '')
      setPrioridade((s.prioridadePadrao as typeof prioridade) || 'MEDIA')
      // valorPadrao no banco é decimal em reais; aqui guardamos centavos como string
      setValorPadrao(s.valorPadrao != null ? String(Math.round(Number(s.valorPadrao) * 100)) : '')
      setDisponivelOrcamento(s.disponivelOrcamento !== false)
      // Lê categoriaServico se presente; fallback derivando da flag legada recorrenteMensal
      const cat: 'MENSAL' | 'EXTRA' | 'FLUXO' = (s.categoriaServico as any)
        ?? (s.recorrenteMensal === true ? 'MENSAL' : 'EXTRA')
      setCategoriaServico(cat)
      setEhServicoInterno((s as any).ehServicoInterno === true)
      setEhObrigacaoAcessoria((s as any).ehObrigacaoAcessoria === true)
      setServicoPaiId(s.servicoPaiId ?? '')
      setSegmentoSlug(s.segmentoSlug ?? null)
      setTextoPadrao(s.textoPadrao ?? '')
      setGruposIds(((s.grupos ?? []) as Array<{ grupo: { id: string } }>).map(g => g.grupo.id))
      // Atribuição de responsável — default conforme categoria do registro
      setAtribuicaoResponsavel(
        (s.atribuicaoResponsavel as typeof atribuicaoResponsavel)
          ?? (cat === 'MENSAL' ? 'CLIENTE_AREA' : cat === 'FLUXO' ? 'HERDA_PREDECESSOR' : 'ORCAMENTO'),
      )
      setResponsavelFixoId(s.responsavelFixoId ?? '')
      // Novo modelo multi-valor
      setAtribuicaoColaboradores(((s as any).atribuicaoColaboradores as string[]) ?? [])
      setAtribuicaoAreas(((s as any).atribuicaoAreas as string[]) ?? [])
      setAtribuicaoUsaOrcamento(((s as any).atribuicaoUsaOrcamento as boolean) ?? false)
      setAtribuicaoUsaClienteArea(((s as any).atribuicaoUsaClienteArea as boolean) ?? false)
      // Configurações avançadas
      setMininome((s as any).mininome ?? '')
      setTempoPrevistoMinutos((s as any).tempoPrevistoMinutos != null ? String((s as any).tempoPrevistoMinutos) : '')
      setLembrarDiasAntes((s as any).lembrarDiasAntes ?? 0)
      setTipoDiasAntes(((s as any).tipoDiasAntes as 'CORRIDOS' | 'UTEIS') ?? 'CORRIDOS')
      setSabadoEhUtil((s as any).sabadoEhUtil ?? false)
      setExigirRobo((s as any).exigirRobo ?? false)
      setPassivelDeMulta((s as any).passivelDeMulta ?? true)
      setAlertaGuiaNaoLida((s as any).alertaGuiaNaoLida ?? true)
      setComentarioPadrao((s as any).comentarioPadrao ?? '')
      // Vencimentos por mês — fetch separado (não vem no getServico)
      ;(trpc as any).servico.getVencimentosMensais.query({ servicoId: id })
        .then((rows: Array<{ mes: number; valor: number }>) => {
          const mapa: Record<number, number> = {}
          for (const r of rows) mapa[r.mes] = r.valor
          setVencimentosMensais(mapa)
        })
        .catch(() => {})
      const etapasFromServer = (s.etapas || []).map((et: { id: string; nome: string; ordem: number; materiais?: Material[]; passos: Array<{ id: string; nome: string; ordem: number; obrigatorio: boolean; permiteIgnorar?: boolean; slaHoras: number | null; slaMinutos?: number | null; dependeDoPassoId?: string | null; materiais?: Material[]; _count?: { emailTemplates?: number; lembretes?: number; camposCliente?: number } }> }) => ({
        id: et.id,
        nome: et.nome,
        ordem: et.ordem,
        materiais: et.materiais ?? [],
        passos: (et.passos || []).map(p => {
          // slaMinutos é a fonte canônica; fallback pra slaHoras * 60 em registros antigos
          const min = p.slaMinutos ?? (p.slaHoras != null ? p.slaHoras * 60 : null)
          return {
            id: p.id,
            dndId: p.id || genDndId(),
            nome: p.nome,
            ordem: p.ordem,
            obrigatorio: p.obrigatorio,
            permiteIgnorar: p.permiteIgnorar ?? false,
            slaText: formatSlaMin(min),
            dependeDoPassoId: p.dependeDoPassoId ?? null,
            materiais: p.materiais ?? [],
            emailsCount: p._count?.emailTemplates ?? 0,
            lembretesCount: p._count?.lembretes ?? 0,
            camposClienteCount: p._count?.camposCliente ?? 0,
          }
        }),
      }))
      setEtapas(etapasFromServer)
      // Inicia todas as etapas existentes colapsadas — usuário expande quando quiser editar.
      setCollapsedEtapas(new Set(etapasFromServer.map((et: Etapa) => et.id).filter(Boolean) as string[]))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  const fetchEncadeamentos = useCallback(async () => {
    try {
      const items = await (trpc.servico as any).listEncadeamentos.query({ servicoOrigemId: id })
      setEncadeamentos(items || [])
    } catch (e) {
      console.warn('Falha ao carregar encadeamentos:', (e as Error).message)
    }
  }, [id])

  const fetchTodosGrupos = useCallback(async () => {
    try {
      const result = await (trpc.servico as any).listGrupos.query() as Array<{ id: string; nome: string; cor: string | null }>
      setTodosGrupos(result || [])
    } catch { setTodosGrupos([]) }
  }, [])

  const fetchTodosServicos = useCallback(async () => {
    try {
      const result = await (trpc.servico as any).listServicos.query() as Array<{ id: string; nome: string }>
      setTodosServicos(result.map(s => ({ id: s.id, nome: s.nome })))
    } catch { /* silent */ }
  }, [])

  const fetchAreas = useCallback(async () => {
    try {
      // listForSelect retorna array direto; list retorna paginado { data, total, ... }
      const result = await (trpc.area as any).listForSelect.query() as Array<{ id: string; name: string }>
      setAreas(result || [])
    } catch (e) {
      console.warn('[ServicoDetail] Falha ao carregar áreas:', (e as Error).message)
      setAreas([])
    }
  }, [])

  /** Universo de usuários ativos com a área de cada um — alimenta o select
   *  "Colaboradores" da nova pill Identificação (atribuição multi-valor). */
  const fetchUsuariosForSelect = useCallback(async () => {
    try {
      const result = await (trpc.user as any).listForSelect.query() as Array<{ id: string; name: string; areaName: string | null }>
      setUsuariosForSelect(result || [])
    } catch (e) {
      console.warn('[ServicoDetail] Falha ao carregar usuários:', (e as Error).message)
      setUsuariosForSelect([])
    }
  }, [])

  /** Lista de usuários atribuíveis (todos os colaboradores acessíveis ao gestor).
   *  Reusa o endpoint já existente que filtra por permissão de hierarquia. */
  const fetchResponsaveisAtribuiveis = useCallback(async () => {
    try {
      const result = await (trpc.servico as any).listResponsaveisAtribuiveis.query() as Array<{ id: string; name: string; email: string | null }>
      setResponsaveisAtribuiveis(result || [])
    } catch (e) {
      console.warn('[ServicoDetail] Falha ao carregar responsáveis:', (e as Error).message)
      setResponsaveisAtribuiveis([])
    }
  }, [])

  const fetchFluxo = useCallback(async (opts?: { silent?: boolean }) => {
    // silent=true → refetch sem mostrar spinner (usado após add/remove de bloco
    // pra não tirar o canvas da tela e dar a impressão de page reload)
    if (!opts?.silent) setFluxoLoading(true)
    try {
      const data = await (trpc.servico as any).getFluxo.query({ id })
      setFluxoData(data)
    } catch (e) {
      console.warn('Falha ao carregar fluxo:', (e as Error).message)
    } finally {
      if (!opts?.silent) setFluxoLoading(false)
    }
  }, [id])

  useEffect(() => { fetchServico(); fetchEncadeamentos(); fetchTodosServicos(); fetchAreas(); fetchTodosGrupos(); fetchResponsaveisAtribuiveis(); fetchUsuariosForSelect() }, [fetchServico, fetchEncadeamentos, fetchTodosServicos, fetchAreas, fetchTodosGrupos, fetchResponsaveisAtribuiveis, fetchUsuariosForSelect])

  useEffect(() => {
    // Lazy-load Fluxo ao abrir a aba
    if (activeTab === 'fluxo' && !fluxoData && !fluxoLoading) {
      fetchFluxo()
    }
  }, [activeTab, fluxoData, fluxoLoading, fetchFluxo])

  // ── Salvar Visão geral ────────────────────────────────────

  async function salvarVisao() {
    setSaving(true)
    try {
      // SLA do serviço é derivado da soma dos passos — backend recalcula no recomputeSLAs.
      await (trpc.servico as any).updateServico.mutate({
        id,
        data: {
          nome,
          descricao: descricao || null,
          categoria: categoria || null,
          prioridadePadrao: prioridade,
          valorPadrao: valorPadrao ? parseInt(valorPadrao, 10) / 100 : null,
          // Interno, Acessória e Fluxo forçam fora-do-catálogo; nas demais respeitam o toggle.
          disponivelOrcamento: ehServicoInterno || ehObrigacaoAcessoria || categoriaServico === 'FLUXO' ? false : disponivelOrcamento,
          ehServicoInterno,
          ehObrigacaoAcessoria,
          recorrenteMensal: categoriaServico === 'MENSAL',
          categoriaServico,
          servicoPaiId: categoriaServico === 'FLUXO' ? (servicoPaiId || null) : null,
          textoPadrao: textoPadrao || null,
          atribuicaoResponsavel,
          responsavelFixoId: atribuicaoResponsavel === 'MANUAL_FIXO' ? (responsavelFixoId || null) : null,
          // Atribuição multi-valor (novo modelo)
          atribuicaoColaboradores,
          atribuicaoAreas,
          atribuicaoUsaOrcamento,
          atribuicaoUsaClienteArea,
          // Configurações avançadas
          mininome: mininome.trim() || null,
          tempoPrevistoMinutos: tempoPrevistoMinutos.trim() ? parseInt(tempoPrevistoMinutos, 10) : null,
          lembrarDiasAntes,
          tipoDiasAntes,
          sabadoEhUtil,
          exigirRobo,
          passivelDeMulta,
          alertaGuiaNaoLida,
          comentarioPadrao: comentarioPadrao.trim() || null,
        },
      })
      // Atualiza vínculos com grupos (M→N) — chamada separada porque mexe na
      // tabela junção ServicoGrupoItem, não em campos diretos do Servico.
      await (trpc.servico as any).setServicoGrupos.mutate({
        servicoId: id,
        grupoIds: gruposIds,
      })
      // Vencimentos por mês (Fase B) — tabela separada, payload com chaves string '1'..'12'
      const vencPayload: Record<string, number> = {}
      for (const [k, v] of Object.entries(vencimentosMensais)) {
        if (v !== 0) vencPayload[k] = v
      }
      await (trpc.servico as any).setVencimentosMensais.mutate({
        servicoId: id,
        vencimentos: vencPayload,
      })
      await alerts.success('Salvo', 'Alterações gravadas.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Etapas: CRUD persistente direto (sem buffer local) ────

  // Etapas usam um dndId local pra rastrear drafts (id pode estar ausente
  // até flush). Como Etapa.dndId não existe na interface, uso um Map
  // por "chave estável" — pra drafts uso uma key efêmera no state.
  const etapaInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const [focusEtapaKey, setFocusEtapaKey] = useState<string | null>(null)
  useEffect(() => {
    if (!focusEtapaKey) return
    const el = etapaInputRefs.current.get(focusEtapaKey)
    if (el) {
      el.focus()
      el.select()
      setFocusEtapaKey(null)
    }
  }, [etapas, focusEtapaKey])

  // Adiciona etapa apenas LOCALMENTE. Persiste no onBlur do nome quando
  // o user digita algo. Vazio = descarta.
  // A chave do draft é guardada em `__draftKey` (campo extra apenas em memória).
  function addEtapa() {
    const draftKey = `draft-etapa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setEtapas(prev => [...prev, {
      // id ausente = draft
      nome: '',
      ordem: prev.length,
      passos: [],
      // armazena chave local pra ref de foco
      ...({ __draftKey: draftKey } as unknown as object),
    } as Etapa])
    setFocusEtapaKey(draftKey)
  }

  // Persiste o draft de etapa quando o user sai do input. Vazio = descarta.
  async function flushEtapaDraft(draftKey: string, nome: string) {
    const trimmed = nome.trim()
    if (!trimmed) {
      setEtapas(prev => prev.filter(e => (e as unknown as { __draftKey?: string }).__draftKey !== draftKey))
      return
    }
    try {
      const novo = await (trpc.servico as any).addEtapa.mutate({
        servicoId: id,
        nome: trimmed,
        ordem: etapas.findIndex(e => (e as unknown as { __draftKey?: string }).__draftKey === draftKey),
      })
      setEtapas(prev => prev.map(e => (e as unknown as { __draftKey?: string }).__draftKey === draftKey
        ? { ...e, id: novo.id, nome: trimmed }
        : e))
    } catch (err) {
      alerts.error('Erro', (err as Error).message)
    }
  }

  async function removeEtapa(etapaId: string | undefined) {
    if (!etapaId) return
    const ok = await alerts.confirm({
      title: 'Remover etapa',
      text: 'Todos os passos desta etapa serão removidos junto.',
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await (trpc.servico as any).deleteEtapa.mutate({ id: etapaId })
      await fetchServico()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function updateEtapaNome(etapaId: string | undefined, novoNome: string) {
    if (!etapaId) return
    try {
      await (trpc.servico as any).updateEtapa.mutate({ id: etapaId, nome: novoNome })
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function updatePassoCampo(
    passoId: string | undefined,
    campo: 'nome' | 'obrigatorio' | 'permiteIgnorar' | 'slaHoras' | 'slaMinutos' | 'dependeDoPassoId',
    valor: unknown,
  ) {
    if (!passoId) return
    try {
      await (trpc.servico as any).updatePasso.mutate({
        id: passoId,
        data: { [campo]: valor },
      })
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  // ── Auto-save com debounce — para inputs de texto (digitando) ──
  // Cada (chave única) tem seu próprio timer; ao começar a digitar novamente
  // o timer anterior é cancelado e reagendado.
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  function scheduleSave(key: string, fn: () => Promise<void>, delay = 500) {
    const prev = saveTimersRef.current.get(key)
    if (prev) clearTimeout(prev)
    const t = setTimeout(async () => {
      setSavingKeys(s => new Set(s).add(key))
      try { await fn() } finally {
        setSavingKeys(s => { const n = new Set(s); n.delete(key); return n })
        saveTimersRef.current.delete(key)
      }
    }, delay)
    saveTimersRef.current.set(key, t)
  }

  // ── Reordenação (drag-and-drop) ──
  async function reordenarEtapas(novaOrdemIds: string[]) {
    // Atualização em lote — chama updateEtapa pra cada uma, ordem = índice
    try {
      await Promise.all(novaOrdemIds.map((id, idx) =>
        (trpc.servico as any).updateEtapa.mutate({ id, ordem: idx }),
      ))
    } catch (e) {
      alerts.error('Erro ao reordenar', (e as Error).message)
      await fetchServico()
    }
  }

  function handleEtapasDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = etapas.findIndex(et => (et.id || '__none') === active.id)
    const newIdx = etapas.findIndex(et => (et.id || '__none') === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(etapas, oldIdx, newIdx).map((et, i) => ({ ...et, ordem: i }))
    setEtapas(reordered)
    const ids = reordered.map(et => et.id).filter((x): x is string => !!x)
    void reordenarEtapas(ids)
  }

  async function reordenarPassos(etapaIdx: number, novaOrdemIds: string[]) {
    try {
      await Promise.all(novaOrdemIds.map((id, idx) =>
        (trpc.servico as any).updatePasso.mutate({ id, data: { ordem: idx } }),
      ))
    } catch (err) {
      alerts.error('Erro ao reordenar', (err as Error).message)
      await fetchServico()
    }
    void etapaIdx
  }

  function handlePassosDragEnd(etapaIdx: number, e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const etapa = etapas[etapaIdx]
    if (!etapa) return
    const oldIdx = etapa.passos.findIndex(p => p.dndId === active.id)
    const newIdx = etapa.passos.findIndex(p => p.dndId === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(etapa.passos, oldIdx, newIdx).map((p, i) => ({ ...p, ordem: i }))
    setEtapas(prev => prev.map((x, i) => i === etapaIdx ? { ...x, passos: reordered } : x))
    const ids = reordered.map(p => p.id).filter((x): x is string => !!x)
    void reordenarPassos(etapaIdx, ids)
  }

  // Refs dos inputs de nome dos passos — chaveado por dndId (sempre presente,
  // mesmo em drafts que ainda não foram persistidos no backend).
  const passoInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const [focusPassoDndId, setFocusPassoDndId] = useState<string | null>(null)
  useEffect(() => {
    if (!focusPassoDndId) return
    const el = passoInputRefs.current.get(focusPassoDndId)
    if (el) {
      el.focus()
      el.select()
      setFocusPassoDndId(null)
    }
  }, [etapas, focusPassoDndId])

  // Adiciona um passo apenas LOCALMENTE (draft = sem id). O servidor é
  // chamado só no onBlur, quando o user terminar de digitar. Se sair em
  // branco, o draft é descartado.
  function addPasso(etapa: Etapa) {
    if (!etapa.id) return
    const dndId = genDndId()
    setEtapas(prev => prev.map(e => e.id === etapa.id
      ? {
          ...e,
          passos: [...e.passos, {
            // id ausente = draft
            dndId,
            nome: '',
            ordem: e.passos.length,
            obrigatorio: true,
            permiteIgnorar: false,
            slaText: '',
            dependeDoPassoId: null,
          }],
        }
      : e))
    setFocusPassoDndId(dndId)
  }

  // Chamado no onBlur do input de nome do passo quando é draft.
  // Texto vazio → descarta. Com texto → persiste e atualiza o item local com o ID real.
  async function flushPassoDraft(etapaId: string, dndId: string, nome: string, ordem: number, obrigatorio: boolean, permiteIgnorar: boolean, slaText: string) {
    const trimmed = nome.trim()
    if (!trimmed) {
      // Descarta o draft sem chamar a API
      setEtapas(prev => prev.map(e => e.id === etapaId
        ? { ...e, passos: e.passos.filter(p => p.dndId !== dndId) }
        : e))
      return
    }
    try {
      const slaMin = parseSlaMin(slaText)
      const novo = await (trpc.servico as any).addPasso.mutate({
        etapaId,
        nome: trimmed,
        ordem,
        obrigatorio,
        permiteIgnorar,
        slaMinutos: slaMin,
      })
      // Substitui o draft no state local pelos campos persistidos (ID real)
      setEtapas(prev => prev.map(e => e.id === etapaId
        ? { ...e, passos: e.passos.map(p => p.dndId === dndId
            ? { ...p, id: novo.id, dndId: novo.id, nome: trimmed, slaText: formatSlaMin(slaMin) }
            : p) }
        : e))
    } catch (err) {
      alerts.error('Erro', (err as Error).message)
    }
  }

  async function removePasso(passoId: string | undefined) {
    if (!passoId) return
    const ok = await alerts.confirm({
      title: 'Remover passo',
      text: 'Este passo será excluído da etapa.',
      confirmText: 'Remover',
    })
    if (!ok) return
    // 1) Marca o passo como "em saída" — CSS faz fade + collapse.
    setExitingPassoIds(prev => { const s = new Set(prev); s.add(passoId); return s })
    try {
      // 2) Dispara mutation em paralelo à animação (otimista — não espera).
      await (trpc.servico as any).deletePasso.mutate({ id: passoId })
      // 3) Após a duração da transição (~220ms), remove do state local — só a
      //    linha some, sem refetch da etapa. SLA do serviço é recomputado pelo
      //    backend; se quisermos refletir, podemos fazer fetchServico em segundo
      //    plano, mas evitamos por simplicidade.
      setTimeout(() => {
        setEtapas(prev => prev.map(et => ({ ...et, passos: et.passos.filter(p => p.id !== passoId) })))
        setExitingPassoIds(prev => { const s = new Set(prev); s.delete(passoId); return s })
      }, 220)
    } catch (e) {
      // Em caso de erro no backend, desfaz a animação.
      setExitingPassoIds(prev => { const s = new Set(prev); s.delete(passoId); return s })
      alerts.error('Erro', (e as Error).message)
    }
  }

  // ── Encadeamentos ──────────────────────────────────────────

  function openAddEnc() {
    setEditingEnc(null)
    setEncDestinoId('')
    setEncOrdem(String(encadeamentos.length))
    setEncIniciaAuto(true)
    setEncObrigatorio(true)
    setEncHerdaResponsavel(true)
    setEncObservacao('')
    setEncModalOpen(true)
  }

  function openEditEnc(enc: Encadeamento) {
    setEditingEnc({ id: enc.id })
    setEncDestinoId(enc.servicoDestinoId)
    setEncOrdem(String(enc.ordem))
    setEncIniciaAuto(enc.iniciaAuto)
    setEncObrigatorio(enc.obrigatorio)
    setEncHerdaResponsavel(enc.herdaResponsavel)
    setEncObservacao(enc.observacao || '')
    setEncModalOpen(true)
  }

  async function salvarEncadeamento() {
    if (!encDestinoId) { alerts.error('Erro', 'Selecione o serviço sucessor'); return }
    setEncSaving(true)
    try {
      if (editingEnc) {
        await (trpc.servico as any).updateEncadeamento.mutate({
          id: editingEnc.id,
          ordem: Number(encOrdem) || 0,
          iniciaAuto: encIniciaAuto,
          obrigatorio: encObrigatorio,
          herdaResponsavel: encHerdaResponsavel,
          observacao: encObservacao || null,
        })
      } else {
        await (trpc.servico as any).addEncadeamento.mutate({
          servicoOrigemId: id,
          servicoDestinoId: encDestinoId,
          ordem: Number(encOrdem) || 0,
          iniciaAuto: encIniciaAuto,
          obrigatorio: encObrigatorio,
          herdaResponsavel: encHerdaResponsavel,
          observacao: encObservacao || null,
        })
      }
      setEncModalOpen(false)
      await fetchEncadeamentos()
      setFluxoData(null) // força refetch do fluxo na próxima abertura
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEncSaving(false)
    }
  }

  async function removerEnc(enc: Encadeamento) {
    const ok = await alerts.confirm({
      title: 'Remover sucessor',
      text: `O sucessor "${enc.servicoDestino.nome}" será desvinculado deste serviço.`,
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await (trpc.servico as any).removeEncadeamento.mutate({ id: enc.id })
      await fetchEncadeamentos()
      setFluxoData(null)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  // ── Render ────────────────────────────────────────────────

  // SLA total do serviço = soma dos passos. Read-only — sempre derivado.
  const totalServicoMin = calcServicoMinutos(etapas)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-0 pb-6">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="space-y-0">
        {/* Header bleed-edge */}
        <div
          className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden"
          style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 12%, transparent)` }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `linear-gradient(to right, color-mix(in srgb, ${MODULE_COLOR} 0%, transparent) 0%, color-mix(in srgb, ${MODULE_COLOR} 80%, transparent) 100%)` }}
          />
          <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg"
                  style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}
                >
                  <Workflow className="h-10 w-10" style={{ color: MODULE_COLOR }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-muted-foreground">Template de serviço</p>
                  <h1 className="text-xl font-semibold truncate">{nome || '—'}</h1>
                  {/* Linha única: área + segmento + badges (SLA / Previsão / Prioridade / etc) */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2">
                    <span className="text-sm text-muted-foreground">
                      {categoria || 'Sem área'}
                      {segmentoSlug && ` · ${segmentoSlug}`}
                      {categoriaServico === 'FLUXO' && ' · Item de fluxo'}
                    </span>
                    <span className="text-muted-foreground/40">|</span>
                    <Badge
                      className="text-[11px] h-6 px-2.5 gap-1.5 bg-white/90 hover:bg-white text-emerald-800 border border-emerald-200/80 shadow-sm font-medium"
                      title="SLA total = soma dos passos"
                    >
                      <Clock className="h-3 w-3" /> SLA {formatSlaRich(totalServicoMin)}
                    </Badge>
                    {totalServicoMin > 0 && (() => {
                      const previsao = calcularPrevisaoConclusao(totalServicoMin)
                      const fmt = previsao.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                      const hr = previsao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      return (
                        <Badge
                          className="text-[11px] h-6 px-2.5 gap-1.5 bg-white/90 hover:bg-white text-sky-800 border border-sky-200/80 shadow-sm font-medium"
                          title="Considerando jornada útil 8h × 5d/sem (seg-sex, 09h-17h), iniciando agora"
                        >
                          Previsão {fmt} · {hr}
                        </Badge>
                      )
                    })()}
                    {(() => {
                      const pri: Record<string, { bg: string; text: string; border: string }> = {
                        BAIXA:    { bg: 'bg-slate-100',   text: 'text-slate-700',  border: 'border-slate-200' },
                        MEDIA:    { bg: 'bg-blue-100',    text: 'text-blue-800',   border: 'border-blue-200' },
                        ALTA:     { bg: 'bg-amber-100',   text: 'text-amber-800',  border: 'border-amber-300' },
                        URGENTE:  { bg: 'bg-rose-100',    text: 'text-rose-800',   border: 'border-rose-300' },
                      }
                      const p = pri[prioridade] ?? pri.MEDIA
                      return (
                        <Badge className={cn('text-[11px] h-6 px-2.5 border shadow-sm font-medium', p.bg, p.text, p.border)}>
                          Prioridade {prioridade}
                        </Badge>
                      )
                    })()}
                    {disponivelOrcamento && (
                      <Badge className="text-[11px] h-6 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm font-medium">
                        Em orçamentos
                      </Badge>
                    )}
                    {categoriaServico === 'MENSAL' && (
                      <Badge className="text-[11px] h-6 px-2.5 bg-violet-100 text-violet-800 border border-violet-200 shadow-sm font-medium">
                        Mensal
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="outline" size="icon"
                onClick={() => router.push(ehObrigacaoAcessoria ? '/obrigacoes' : '/servicos')}
                title={ehObrigacaoAcessoria ? 'Voltar para Obrigações' : 'Voltar para Serviços'}
                className="h-8 w-8 bg-white/70 hover:bg-white shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Tabs */}
          <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
            <SlidingTabsList activeValue={activeTab} className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit">
              <TabsTrigger value="visao" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-700 dark:data-[state=active]:!text-emerald-300 gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Visão geral
              </TabsTrigger>
              <TabsTrigger value="etapas" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-700 dark:data-[state=active]:!text-emerald-300 gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Etapas e passos
                {etapas.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1.5 h-4 px-1.5">{etapas.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="fluxo" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-700 dark:data-[state=active]:!text-emerald-300 gap-1.5">
                <GitBranch className="h-3.5 w-3.5" /> Fluxo
              </TabsTrigger>
              <TabsTrigger value="encadeamento" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-700 dark:data-[state=active]:!text-emerald-300 gap-1.5">
                <History className="h-3.5 w-3.5" /> Sucessores
                {encadeamentos.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1.5 h-4 px-1.5">{encadeamentos.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="texto" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-700 dark:data-[state=active]:!text-emerald-300 gap-1.5">
                <Type className="h-3.5 w-3.5" /> Texto padrão
              </TabsTrigger>
              {categoriaServico === 'MENSAL' && (
                <TabsTrigger value="recorrencia" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-700 dark:data-[state=active]:!text-emerald-300 gap-1.5">
                  <Repeat className="h-3.5 w-3.5" /> Recorrência
                </TabsTrigger>
              )}
              <TabsTrigger value="notificacoes" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-emerald-700 dark:data-[state=active]:!text-emerald-300 gap-1.5">
                <Bell className="h-3.5 w-3.5" /> Notificações
              </TabsTrigger>
            </SlidingTabsList>
          </div>
        </div>

        {/* ── TAB: Visão geral ── */}
        <TabsContent value="visao" className="mt-4">
          <Card>
            <CardHeader>
              <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" /> Visão geral do serviço
              </h5>
            </CardHeader>
            <div className="flex min-h-[500px]">
              {/* Pills verticais à esquerda */}
              <div className="w-[180px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
                <div className="space-y-1">
                  {([
                    { id: 'identificacao' as const, label: 'Identificação', icon: FileText },
                    { id: 'descricao'     as const, label: 'Descrição',     icon: AlignLeft },
                    { id: 'comercial'     as const, label: 'Comercial',     icon: CircleDollarSign },
                    // Pill "Atribuição" foi consolidada na Identificação (modelo multi-valor).
                    // O bloco PERGUNTA continua usando atribuicaoResponsavel internamente.
                    { id: 'avancado'     as const, label: 'Avançado',       icon: Settings },
                    { id: 'vencimentosMensais' as const, label: 'Vencim. por mês', icon: CalendarDays },
                  ]).map(p => {
                    const Icon = p.icon
                    const active = visaoPill === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setVisaoPill(p.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                          active ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-white hover:text-foreground',
                        )}
                        style={active ? { backgroundColor: MODULE_COLOR } : undefined}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Conteúdo da pill */}
              <div
                key={visaoPill}
                className="flex-1 overflow-y-auto flex flex-col"
                style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
              >
                {/* ── PILL: Identificação ───────────────────── */}
                {visaoPill === 'identificacao' && (
                  <div>
                    <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                      <h4 className="text-[13px] font-semibold text-foreground">Identificação</h4>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 md:col-span-5 space-y-1.5">
                          <Label className="text-xs font-medium">Nome *</Label>
                          <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
                        </div>
                        <div className="col-span-12 md:col-span-4 space-y-1.5">
                          <Label className="text-xs font-medium">Área</Label>
                          <Select value={categoria || '__none__'} onValueChange={v => setCategoria(v === '__none__' ? '' : v)}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione uma área" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Sem área —</SelectItem>
                              {areas.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-12 md:col-span-3 space-y-1.5">
                          <Label className="text-xs font-medium">Prioridade</Label>
                          <Select value={prioridade} onValueChange={v => setPrioridade(v as typeof prioridade)}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BAIXA">Baixa</SelectItem>
                              <SelectItem value="MEDIA">Média</SelectItem>
                              <SelectItem value="ALTA">Alta</SelectItem>
                              <SelectItem value="URGENTE">Urgente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* ── Atribuição de responsáveis (multi-valor) ── */}
                      <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Label className="text-[13px] font-semibold">Atribuição de responsáveis</Label>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              União de todas as fontes abaixo. Um candidato → vira responsável direto. Vários ou nenhum → claim-first: todos veem em <strong>Meus Serviços</strong>; primeiro a iniciar um passo reivindica.
                            </p>
                          </div>
                          {(() => {
                            const totalFontes =
                              (atribuicaoColaboradores.length > 0 ? 1 : 0) +
                              (atribuicaoAreas.length > 0 ? 1 : 0) +
                              (atribuicaoUsaOrcamento ? 1 : 0) +
                              (atribuicaoUsaClienteArea ? 1 : 0)
                            return totalFontes === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 shrink-0">
                                ⚠ Sem fonte definida
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 shrink-0">
                                {totalFontes} fonte{totalFontes > 1 ? 's' : ''}
                              </span>
                            )
                          })()}
                        </div>

                        <div className="grid grid-cols-12 gap-3">
                          {/* Colaboradores — multi-select */}
                          <div className="col-span-12 md:col-span-6 space-y-1.5">
                            <Label className="text-xs font-medium">Colaboradores</Label>
                            <Select
                              value="__add__"
                              onValueChange={v => {
                                if (v && v !== '__add__' && !atribuicaoColaboradores.includes(v)) {
                                  setAtribuicaoColaboradores(prev => [...prev, v])
                                }
                              }}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Adicionar colaborador..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__add__">Adicionar colaborador...</SelectItem>
                                {usuariosForSelect
                                  .filter(u => !atribuicaoColaboradores.includes(u.id))
                                  .map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                      {u.name}{u.areaName ? ` · ${u.areaName}` : ''}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {atribuicaoColaboradores.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {atribuicaoColaboradores.map(uid => {
                                  const u = usuariosForSelect.find(x => x.id === uid)
                                  return (
                                    <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900">
                                      {u?.name ?? uid}
                                      <button
                                        type="button"
                                        onClick={() => setAtribuicaoColaboradores(prev => prev.filter(x => x !== uid))}
                                        className="hover:text-rose-600 ml-0.5"
                                        title="Remover"
                                      >×</button>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* Áreas — multi-select */}
                          <div className="col-span-12 md:col-span-6 space-y-1.5">
                            <Label className="text-xs font-medium">Setores</Label>
                            <Select
                              value="__add__"
                              onValueChange={v => {
                                if (v && v !== '__add__' && !atribuicaoAreas.includes(v)) {
                                  setAtribuicaoAreas(prev => [...prev, v])
                                }
                              }}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Adicionar setor..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__add__">Adicionar setor...</SelectItem>
                                {areas
                                  .filter(a => !atribuicaoAreas.includes(a.id))
                                  .map(a => (
                                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {atribuicaoAreas.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {atribuicaoAreas.map(aid => {
                                  const a = areas.find(x => x.id === aid)
                                  return (
                                    <span key={aid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                                      {a?.name ?? aid}
                                      <button
                                        type="button"
                                        onClick={() => setAtribuicaoAreas(prev => prev.filter(x => x !== aid))}
                                        className="hover:text-rose-600 ml-0.5"
                                        title="Remover"
                                      >×</button>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Flags */}
                        <div className="grid grid-cols-12 gap-3">
                          <label className="col-span-12 md:col-span-6 flex items-center gap-2 cursor-pointer select-none rounded-md border bg-card px-3 py-2 hover:bg-muted/40 transition-colors">
                            <input
                              type="checkbox"
                              checked={atribuicaoUsaOrcamento}
                              onChange={e => setAtribuicaoUsaOrcamento(e.target.checked)}
                              className="h-3.5 w-3.5 cursor-pointer"
                            />
                            <span className="text-[12px] font-medium">Responsável pelo orçamento</span>
                          </label>
                          <label className="col-span-12 md:col-span-6 flex items-center gap-2 cursor-pointer select-none rounded-md border bg-card px-3 py-2 hover:bg-muted/40 transition-colors">
                            <input
                              type="checkbox"
                              checked={atribuicaoUsaClienteArea}
                              onChange={e => setAtribuicaoUsaClienteArea(e.target.checked)}
                              className="h-3.5 w-3.5 cursor-pointer"
                            />
                            <span className="text-[12px] font-medium">Responsável pelo cliente na área</span>
                          </label>
                        </div>
                      </div>

                      {/* Tipo de cadastro */}
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Tipo de cadastro</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                          {([
                            { v: 'MENSAL' as const, key: 'MENSAL',     label: 'Serviço Recorrente',     desc: 'Serviço que precisa ser executado com uma determinada recorrência', tone: 'sky',    Icon: Repeat },
                            { v: 'EXTRA'  as const, key: 'EXTRA',      label: 'Serviço Extraordinário', desc: 'Pontual — cobrança por execução',                                    tone: 'amber',  Icon: Zap },
                            { v: 'FLUXO'  as const, key: 'FLUXO',      label: 'Parte do Fluxo',         desc: 'Item interno de outro serviço',                                      tone: 'violet', Icon: Network },
                            { v: 'EXTRA'  as const, key: 'INTERNO',    label: 'Serviço Interno',        desc: 'Serviço de execução interna',                                        tone: 'slate',  Icon: Lock },
                            { v: 'MENSAL' as const, key: 'ACESSORIA',  label: 'Obrigação Acessória',  desc: 'Obrigações que são entregues com uma certa recorrência',             tone: 'rose',   Icon: ShieldCheck },
                          ]).map(opt => {
                            const active = opt.key === 'INTERNO'
                              ? ehServicoInterno
                              : opt.key === 'ACESSORIA'
                                ? ehObrigacaoAcessoria
                                : !ehServicoInterno && !ehObrigacaoAcessoria && categoriaServico === opt.v
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
                                    setEhServicoInterno(true)
                                    setEhObrigacaoAcessoria(false)
                                    setCategoriaServico('EXTRA')
                                    setDisponivelOrcamento(false)
                                    setServicoPaiId('')
                                  } else if (opt.key === 'ACESSORIA') {
                                    setEhObrigacaoAcessoria(true)
                                    setEhServicoInterno(false)
                                    setCategoriaServico('MENSAL')
                                    setDisponivelOrcamento(false)
                                    setServicoPaiId('')
                                  } else {
                                    setEhServicoInterno(false)
                                    setEhObrigacaoAcessoria(false)
                                    setCategoriaServico(opt.v)
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
                        {categoriaServico === 'FLUXO' && (
                          <div className="pt-2">
                            <Label className="text-[13px] font-semibold mb-1.5 block">
                              Pertence ao serviço <span className="text-red-500">*</span>
                            </Label>
                            <Select value={servicoPaiId || '__none__'} onValueChange={v => setServicoPaiId(v === '__none__' ? '' : v)}>
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Selecione o serviço dono do fluxo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— nenhum —</SelectItem>
                                {todosServicos
                                  .filter(t => t.id !== id)
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
                  </div>
                )}

                {/* ── PILL: Descrição ──────────────────────── */}
                {visaoPill === 'descricao' && (
                  <div>
                    <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                      <h4 className="text-[13px] font-semibold text-foreground">Descrição</h4>
                    </div>
                    <div className="p-5">
                      <Label className="text-xs font-medium mb-1.5 block">Descrição completa</Label>
                      <textarea
                        value={descricao}
                        onChange={e => setDescricao(e.target.value)}
                        rows={14}
                        placeholder="Descrição usada no orçamento e no contrato — o cliente verá esse texto."
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Esta descrição aparece em propostas comerciais (orçamentos) e na minuta do contrato gerado.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── PILL: Comercial ──────────────────────── */}
                {visaoPill === 'comercial' && (
                  <div>
                    <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                      <h4 className="text-[13px] font-semibold text-foreground">Comercial &amp; Operacional</h4>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 md:col-span-8 space-y-1.5">
                          <Label className="text-xs font-medium flex items-center gap-1.5">
                            SLA total
                            <span
                              className="text-[10px] font-normal text-muted-foreground"
                              title="Soma do tempo de todos os passos. Jornada útil: 8h/dia, 5 dias/semana (seg-sex, 09h-17h)."
                            >
                              (jornada 8h × 5d/sem)
                            </span>
                          </Label>
                          {totalServicoMin > 0 ? (
                            <div className="h-9 px-3 flex items-center justify-between gap-3 text-sm bg-muted/40 border border-input rounded-md text-foreground font-medium tabular-nums">
                              <span>{formatSlaRich(totalServicoMin)}</span>
                              <span className="text-[11px] font-normal text-muted-foreground">
                                Previsão: {(() => {
                                  const p = calcularPrevisaoConclusao(totalServicoMin)
                                  return `${p.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${p.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                                })()}
                              </span>
                            </div>
                          ) : (
                            <div className="h-9 px-3 flex items-center text-sm bg-muted/40 border border-input rounded-md text-muted-foreground font-normal">—</div>
                          )}
                        </div>
                        <div className="col-span-12 md:col-span-4 space-y-1.5">
                          <Label className="text-xs font-medium">Valor padrão</Label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">R$</span>
                            <Input
                              inputMode="numeric"
                              value={valorPadrao ? formatBRLFromCents(parseInt(valorPadrao, 10)) : ''}
                              onChange={e => {
                                const cents = parseCentsFromInput(e.target.value)
                                setValorPadrao(cents === 0 ? '' : String(cents))
                              }}
                              placeholder="0,00"
                              className="h-9 text-sm pl-9 text-right tabular-nums"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2 border-t">
                        <button
                          id="disp-orc"
                          type="button"
                          role="switch"
                          aria-checked={disponivelOrcamento}
                          onClick={() => setDisponivelOrcamento(!disponivelOrcamento)}
                          className={cn(
                            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
                            disponivelOrcamento ? 'bg-emerald-600' : 'bg-muted-foreground/30',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                              disponivelOrcamento ? 'translate-x-5' : 'translate-x-0',
                            )}
                          />
                        </button>
                        <Label htmlFor="disp-orc" className="text-[13px] font-medium cursor-pointer select-none">
                          Disponibilizar para inclusão em orçamentos
                        </Label>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t">
                        <Label className="text-[13px] font-semibold">
                          Grupos
                          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">opcional · um serviço pode pertencer a vários grupos</span>
                        </Label>
                        {todosGrupos.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic py-2">
                            Nenhum grupo cadastrado.{' '}
                            <button type="button" className="underline hover:text-foreground" onClick={() => router.push('/servicos/grupos')}>
                              Crie um grupo
                            </button>.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/10 p-2 min-h-[44px]">
                            {todosGrupos.map(g => {
                              const selected = gruposIds.includes(g.id)
                              return (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => setGruposIds(prev =>
                                    prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id],
                                  )}
                                  className={cn(
                                    'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border text-[11px] font-medium transition-all',
                                    selected
                                      ? 'bg-card border-emerald-400 shadow-sm text-foreground'
                                      : 'bg-card/40 border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                                  )}
                                  title={selected ? 'Click para remover do grupo' : 'Click para adicionar ao grupo'}
                                >
                                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.cor || '#94a3b8' }} />
                                  <span className="truncate max-w-[200px]">{g.nome}</span>
                                  {selected && <Check className="h-3 w-3 text-emerald-600" />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PILL: Atribuição ─────────────────────── */}
                {visaoPill === 'atribuicao' && (
                  <div>
                    <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                      <h4 className="text-[13px] font-semibold text-foreground">Atribuição de responsável</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Define quem recebe a execução quando o serviço é disparado (orçamento, recorrência mensal, encadeamento ou processo).
                      </p>
                    </div>
                    <div className="p-5 grid grid-cols-12 gap-3">
                      <div className="col-span-12 md:col-span-6 space-y-1.5">
                        <Label className="text-xs font-medium">Estratégia</Label>
                        <Select value={atribuicaoResponsavel} onValueChange={v => setAtribuicaoResponsavel(v as typeof atribuicaoResponsavel)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ORCAMENTO">Do orçamento</SelectItem>
                            <SelectItem value="CLIENTE_AREA">Do cliente (responsável da área)</SelectItem>
                            <SelectItem value="MANUAL_FIXO">Manual fixo</SelectItem>
                            <SelectItem value="HERDA_PREDECESSOR">Herda do passo anterior</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          {atribuicaoResponsavel === 'ORCAMENTO' && 'Cascata por área: Legalização → execução vai para o painel de todos os usuários do setor (primeiro a iniciar um passo reivindica). Fiscal/Contábil/Trabalhista → responsável da área no cadastro do cliente. Outras áreas → responsável do orçamento.'}
                          {atribuicaoResponsavel === 'CLIENTE_AREA' && (
                            <>Busca o responsável vinculado à área <strong>{categoria || '(defina a área na pill Identificação)'}</strong> no cadastro do cliente. Fallback automático para o substituto.</>
                          )}
                          {atribuicaoResponsavel === 'MANUAL_FIXO' && 'Toda execução é atribuída ao mesmo usuário, independente de orçamento/cliente.'}
                          {atribuicaoResponsavel === 'HERDA_PREDECESSOR' && 'Mantém o responsável do passo anterior na cadeia. Útil para itens internos de fluxo.'}
                        </p>
                        {atribuicaoResponsavel === 'CLIENTE_AREA' && !categoria && (
                          <div className="text-[11px] rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                            ⚠ O campo <strong>Área</strong> está vazio — o engine não conseguirá fazer o match. Preencha em Identificação antes de salvar.
                          </div>
                        )}
                      </div>
                      <div className="col-span-12 md:col-span-6 space-y-1.5">
                        {atribuicaoResponsavel === 'MANUAL_FIXO' ? (
                          <>
                            <Label className="text-xs font-medium">Usuário responsável *</Label>
                            <Select value={responsavelFixoId || '__none__'} onValueChange={v => setResponsavelFixoId(v === '__none__' ? '' : v)}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Selecione —</SelectItem>
                                {responsaveisAtribuiveis.map(u => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.name}{u.email && ` (${u.email})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!responsavelFixoId && (
                              <p className="text-[11px] text-amber-700">Sem usuário selecionado — execuções ficarão sem responsável.</p>
                            )}
                          </>
                        ) : (
                          <>
                            <Label className="text-xs font-medium text-muted-foreground">Override em runtime</Label>
                            <div className="h-9 px-3 flex items-center text-[12px] bg-muted/20 border border-dashed rounded-md text-muted-foreground">
                              Gestor sempre pode reatribuir manualmente após criada
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PILL: Avançado ──────────────────────────── */}
                {visaoPill === 'avancado' && (
                  <div>
                    <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                      <h4 className="text-[13px] font-semibold text-foreground">Configurações avançadas</h4>
                    </div>
                    <div className="p-5 grid grid-cols-12 gap-3">
                      {/* Linha 1: Mininome + Tempo previsto */}
                      <div className="col-span-12 sm:col-span-4 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Mininome</Label>
                        <Input
                          value={mininome}
                          onChange={(e) => setMininome(e.target.value)}
                          placeholder="Ex.: EFD ICMS"
                          maxLength={10}
                          className="h-9 text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">Apelido curto (max 10) usado em colunas/relatórios.</p>
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Tempo previsto (minutos)</Label>
                        <Input
                          type="number" min={0}
                          value={tempoPrevistoMinutos}
                          onChange={(e) => setTempoPrevistoMinutos(e.target.value)}
                          placeholder="20"
                          className="h-9 text-sm tabular-nums"
                        />
                        <p className="text-[11px] text-muted-foreground">Estimativa de execução por entrega.</p>
                      </div>

                      {/* Linha 2: Lembrete (dias + tipo) */}
                      <div className="col-span-12 border-t border-[rgba(0,0,0,0.08)] -mx-5 mt-2" />
                      <div className="col-span-12">
                        <h6 className="text-[12px] uppercase tracking-wider font-semibold text-muted-foreground">Lembrete antes do vencimento</h6>
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Quantos dias antes?</Label>
                        <Input
                          type="number" min={0} max={180}
                          value={lembrarDiasAntes}
                          onChange={(e) => setLembrarDiasAntes(Math.max(0, Math.min(180, Number(e.target.value) || 0)))}
                          className="h-9 text-sm tabular-nums"
                        />
                        <p className="text-[11px] text-muted-foreground">0 = sem lembrete. Máximo 180 dias.</p>
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Tipo dos dias</Label>
                        <Select value={tipoDiasAntes} onValueChange={(v) => setTipoDiasAntes(v as any)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CORRIDOS">Dias corridos</SelectItem>
                            <SelectItem value="UTEIS">Dias úteis</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">Úteis exclui FDS e feriados.</p>
                      </div>

                      {/* Linha 3: Flags booleanos */}
                      <div className="col-span-12 border-t border-[rgba(0,0,0,0.08)] -mx-5 mt-2" />
                      <div className="col-span-12">
                        <h6 className="text-[12px] uppercase tracking-wider font-semibold text-muted-foreground">Comportamento</h6>
                      </div>
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                          <Checkbox checked={sabadoEhUtil} onCheckedChange={(v) => setSabadoEhUtil(!!v)} className="mt-0.5" />
                          <div>
                            <span className="font-medium">Sábado é útil?</span>
                            <p className="text-[11px] text-muted-foreground">Considera sábado como dia útil pro prazo legal.</p>
                          </div>
                        </label>
                      </div>
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                          <Checkbox checked={exigirRobo} onCheckedChange={(v) => setExigirRobo(!!v)} className="mt-0.5" />
                          <div>
                            <span className="font-medium">Exigir robô</span>
                            <p className="text-[11px] text-muted-foreground">Bloqueia upload manual — entregas só pelo robô.</p>
                          </div>
                        </label>
                      </div>
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                          <Checkbox checked={passivelDeMulta} onCheckedChange={(v) => setPassivelDeMulta(!!v)} className="mt-0.5" />
                          <div>
                            <span className="font-medium">Passível de multa</span>
                            <p className="text-[11px] text-muted-foreground">Atraso pode gerar multa — sinaliza em dashboards.</p>
                          </div>
                        </label>
                      </div>
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                          <Checkbox checked={alertaGuiaNaoLida} onCheckedChange={(v) => setAlertaGuiaNaoLida(!!v)} className="mt-0.5" />
                          <div>
                            <span className="font-medium">Alerta guia não-lida</span>
                            <p className="text-[11px] text-muted-foreground">Alerta nos dashboards quando guia ainda não foi lida.</p>
                          </div>
                        </label>
                      </div>

                      {/* Comentário padrão */}
                      <div className="col-span-12 border-t border-[rgba(0,0,0,0.08)] -mx-5 mt-2" />
                      <div className="col-span-12 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Comentário padrão</Label>
                        <textarea
                          value={comentarioPadrao}
                          onChange={(e) => setComentarioPadrao(e.target.value)}
                          placeholder="Texto pré-carregado no campo de comentário do anexo na entrega manual."
                          maxLength={300}
                          rows={2}
                          className="w-full rounded-[4px] border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                        />
                        <p className="text-[11px] text-muted-foreground">{comentarioPadrao.length} / 300 caracteres</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PILL: Vencimentos por mês ──────────────── */}
                {visaoPill === 'vencimentosMensais' && (
                  <div>
                    <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                      <h4 className="text-[13px] font-semibold text-foreground">Vencimentos por mês</h4>
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <p className="text-[12px] text-muted-foreground flex-1 min-w-[260px]">
                          Quando preenchido, o vencimento do mês <strong>sobrescreve</strong> a regra padrão de
                          Recorrência. Deixe "Não tem" pra usar o padrão.
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const meses = Object.keys(vencimentosMensais)
                              const primeiroMes = meses.find((m) => vencimentosMensais[Number(m)] !== 0)
                              if (!primeiroMes) {
                                alerts.error('Vazio', 'Preencha pelo menos um mês antes de copiar.')
                                return
                              }
                              const v = vencimentosMensais[Number(primeiroMes)]
                              const next: Record<number, number> = {}
                              for (let m = 1; m <= 12; m++) next[m] = v!
                              setVencimentosMensais(next)
                            }}
                            className="text-xs"
                          >
                            Copiar 1º mês pra todos
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVencimentosMensais({})}
                            className="text-xs"
                          >
                            Limpar
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {(['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] as const).map((nome, idx) => {
                          const mes = idx + 1
                          const valor = vencimentosMensais[mes] ?? 0
                          return (
                            <div key={mes} className="space-y-1.5">
                              <Label className="text-[12px] font-semibold">{nome}</Label>
                              <Select
                                value={String(valor)}
                                onValueChange={(v) => setVencimentosMensais({ ...vencimentosMensais, [mes]: Number(v) })}
                              >
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                  <SelectItem value="0">Não tem (usa padrão)</SelectItem>
                                  {/* N-ésimo dia útil (51..70 → 1..20) */}
                                  {Array.from({ length: 20 }, (_, i) => 51 + i).map((v) => (
                                    <SelectItem key={v} value={String(v)}>{v - 50}º dia útil</SelectItem>
                                  ))}
                                  <SelectItem value="90">Último dia útil</SelectItem>
                                  {/* Dia fixo (1..31) */}
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map((v) => (
                                    <SelectItem key={v} value={String(v)}>Todo dia {String(v).padStart(2, '0')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )
                        })}
                      </div>
                      <div className="rounded border border-sky-200 bg-sky-50 p-3 text-[11px] text-sky-900">
                        <strong>Encoding:</strong> 0 = "Não tem" · 1-31 = Dia fixo · 51-70 = 1º a 20º dia útil · 90 = Último dia útil.
                        Espelha exatamente os campos <code>ObrD01..ObrD12</code> do Acessórias.
                      </div>
                    </div>
                  </div>
                )}

                {/* Rodapé fixo com botão Salvar — vale pra qualquer pill */}
                <div className="mt-auto border-t border-[rgba(0,0,0,0.08)] px-5 py-3 bg-card flex justify-end">
                  <Button onClick={salvarVisao} disabled={saving} className="gap-1.5" style={{ backgroundColor: MODULE_COLOR }}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar alterações
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ── TAB: Etapas e Passos ── */}
        <TabsContent value="etapas" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Etapas e passos do template</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Checklist replicado a cada execução. Alterações são salvas automaticamente.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {etapas.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => collapsedEtapas.size === etapas.length ? expandAllEtapas() : collapseAllEtapas()}
                      className="gap-1.5 text-xs text-muted-foreground"
                      title={collapsedEtapas.size === etapas.length ? 'Expandir todas as etapas' : 'Recolher todas as etapas'}
                    >
                      {collapsedEtapas.size === etapas.length ? (
                        <><ChevronDown className="h-3.5 w-3.5" /> Expandir tudo</>
                      ) : (
                        <><ChevronRight className="h-3.5 w-3.5" /> Recolher tudo</>
                      )}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={addEtapa} className="gap-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Adicionar etapa
                  </Button>
                </div>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEtapasDragEnd}>
                <SortableContext items={etapas.map(et => et.id || '__none')} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {etapas.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6 italic border rounded-lg bg-muted/20">
                        Nenhuma etapa cadastrada. Clique em &quot;Adicionar etapa&quot; pra começar.
                      </p>
                    )}
                    {etapas.map((et, ei) => {
                      const draftKey = (et as unknown as { __draftKey?: string }).__draftKey
                      const sortKey = et.id ?? draftKey ?? `__none-${ei}`
                      const collapsed = collapsedEtapas.has(sortKey)
                      return (
                      <SortableEtapa key={sortKey} id={sortKey}>
                        {/* Cabeçalho da etapa */}
                        <div className={cn('flex items-center gap-2', collapsed ? 'mb-0' : 'mb-3')}>
                          <SortableEtapaHandle />
                          <button
                            type="button"
                            onClick={() => toggleEtapaCollapse(sortKey)}
                            className="shrink-0 inline-flex items-center justify-center h-9 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title={collapsed ? 'Expandir etapa' : 'Recolher etapa'}
                            aria-expanded={!collapsed}
                          >
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform duration-200 ease-out',
                                collapsed && '-rotate-90',
                              )}
                            />
                          </button>
                          <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0">{ei + 1}.</span>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <div className="relative flex-1 min-w-0">
                              <Input
                                ref={el => {
                                  const key = et.id ?? (et as unknown as { __draftKey?: string }).__draftKey
                                  if (!key) return
                                  if (el) etapaInputRefs.current.set(key, el)
                                  else etapaInputRefs.current.delete(key)
                                }}
                                value={et.nome}
                                onChange={e => {
                                  const v = e.target.value
                                  setEtapas(prev => prev.map((x, i) => i === ei ? { ...x, nome: v } : x))
                                  if (et.id) scheduleSave(`etapa-${et.id}-nome`, () => updateEtapaNome(et.id, v))
                                }}
                                onBlur={e => {
                                  const draftKey = (et as unknown as { __draftKey?: string }).__draftKey
                                  // Só faz flush se for draft (sem id ainda)
                                  if (!et.id && draftKey) {
                                    void flushEtapaDraft(draftKey, e.target.value)
                                  }
                                }}
                                placeholder={et.id ? 'Nome da etapa' : 'Digite o nome (vazio = descartar)'}
                                className="h-9 text-sm"
                              />
                              {et.id && savingKeys.has(`etapa-${et.id}-nome`) && (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground absolute right-2 top-3" />
                              )}
                            </div>
                            {/* Materiais de apoio inline — chips + botão "+ Material" à direita do input da etapa.
                                Só pra etapas salvas (com id). */}
                            {et.id && (
                              <MateriaisSection
                                materiais={et.materiais ?? []}
                                etapaId={et.id}
                                inline
                                onChange={() => { void fetchServico() }}
                              />
                            )}
                          </div>
                          {/* Contagem de passos — visível quando colapsada */}
                          {collapsed && (
                            <div
                              className="flex items-center justify-center gap-1 shrink-0 h-9 px-2 rounded-md bg-muted/40 border border-input text-[11px] font-medium text-muted-foreground tabular-nums"
                              title={`${et.passos.length} passo${et.passos.length === 1 ? '' : 's'} nesta etapa`}
                            >
                              <ListChecks className="h-3 w-3" />
                              <span>{et.passos.length}</span>
                            </div>
                          )}
                          {/* Indicador de trilhos — visível só quando há mais de 1 */}
                          {(() => {
                            const trilhos = countTrilhos(computePassoLayers(et.passos))
                            if (trilhos <= 1) return null
                            return (
                              <div
                                className="flex items-center justify-center gap-1 shrink-0 h-9 px-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                                title={`${trilhos} trilhos paralelos — passos no mesmo trilho rodam simultaneamente`}
                              >
                                <GitBranch className="h-3 w-3" />
                                <span>{trilhos} trilhos</span>
                              </div>
                            )
                          })()}
                          {/* SLA da etapa — soma dos passos (não editável) */}
                          <div
                            className="flex items-center justify-center gap-1 shrink-0 h-9 px-2 min-w-[72px] rounded-md bg-muted/40 border border-input text-[11px] font-medium text-foreground tabular-nums"
                            title="SLA da etapa = soma do tempo de todos os passos (jornada 8h/dia × 5 dias/sem)"
                          >
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>{formatSlaRich(calcEtapaMinutos(et)) || '—'}</span>
                          </div>
                          <Button variant="ghost" size="icon-xs" onClick={() => removeEtapa(et.id)} className="text-destructive shrink-0" title="Remover etapa">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {/* Conteúdo da etapa (header da grade + lista de passos) — animação smooth
                            de expand/collapse via grid-template-rows 1fr↔0fr (técnica moderna
                            que evita medir altura). O wrapper interno usa overflow-hidden pra
                            cortar o vazamento enquanto a transição roda. */}
                        <div
                          className={cn(
                            'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                            collapsed ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100',
                          )}
                        >
                          <div className="overflow-hidden">

                    {/* Header da grade de passos — larguras fixas. Coluna "Obr." virou append
                        (botão cadeado) dentro do input do passo; "Pula?" e "Dependência" foram
                        removidas. */}
                    {et.passos.length > 0 && (
                      <div className="ml-7 grid grid-cols-[24px_1fr_80px_28px] gap-2 items-center text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
                        <span></span>
                        <span>Passo</span>
                        <span className="text-center" title="Aceita horas e minutos: '1h 30m', '45m', '2h' ou número puro em minutos">SLA</span>
                        <span></span>
                      </div>
                    )}

                    {/* Linhas de passos — mesmas larguras do header.
                        Cada passo recebe uma classe de fundo baseada no "trilho"
                        (nível na cadeia de dependência). Passos no mesmo trilho
                        rodam em paralelo e compartilham a cor. */}
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => handlePassosDragEnd(ei, ev)}>
                      <SortableContext items={et.passos.map(p => p.dndId)} strategy={verticalListSortingStrategy}>
                    <div className="ml-7 space-y-1.5">
                      {(() => {
                        const passoLayers = computePassoLayers(et.passos)
                        return et.passos.map((p, pi) => {
                          const layer = p.id ? (passoLayers.get(p.id) ?? 0) : 0
                          const layerCls = getLayerBgClass(layer)
                          return (
                        <Fragment key={p.dndId}>
                        <SortablePasso id={p.dndId} layerClass={layerCls} exiting={!!p.id && exitingPassoIds.has(p.id)}>
                          <SortablePassoHandle numero={pi + 1} />
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative flex-1 min-w-0 flex items-stretch">
                              <Input
                                ref={el => {
                                  if (el) passoInputRefs.current.set(p.dndId, el)
                                  else passoInputRefs.current.delete(p.dndId)
                                }}
                                value={p.nome}
                                onChange={e => {
                                  const v = e.target.value
                                  setEtapas(prev => prev.map((x, i) => i === ei
                                    ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, nome: v } : pp) }
                                    : x))
                                  if (p.id) scheduleSave(`passo-${p.id}-nome`, () => updatePassoCampo(p.id, 'nome', v))
                                }}
                                onBlur={e => {
                                  // Draft (sem id) → persiste se tem texto, descarta se vazio
                                  if (!p.id && et.id) {
                                    void flushPassoDraft(
                                      et.id,
                                      p.dndId,
                                      e.target.value,
                                      pi,
                                      p.obrigatorio,
                                      p.permiteIgnorar,
                                      p.slaText,
                                    )
                                  }
                                }}
                                placeholder={p.id ? 'Descrição do passo' : 'Digite o nome (vazio = descartar)'}
                                className="h-8 text-sm flex-1 rounded-r-none border-r-0"
                              />
                              {p.id && savingKeys.has(`passo-${p.id}-nome`) && (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground absolute right-10 top-2.5" />
                              )}
                              {/* Indicadores visuais (notas / links / arquivos / e-mails / lembretes /
                                  campos do cliente) — chips coloridos entre o input e o botão lock,
                                  formando um único "input group". Cada chip só renderiza se count > 0;
                                  clique abre o dialog correspondente. Border-l ausente nos chips
                                  internos pra formar fila contínua. */}
                              {p.id && (() => {
                                const notas = (p.materiais ?? []).filter(m => m.tipo === 'NOTA').length
                                return notas > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setOpenMateriaisPasso({ passoId: p.id!, tipo: 'NOTA' })}
                                    className="h-8 inline-flex items-center gap-1 px-2 text-[10px] font-medium tabular-nums border-y border-r border-input bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50 transition-colors shrink-0"
                                    title={`Notas / instruções · ${notas}`}
                                  >
                                    <StickyNote className="h-3 w-3" />
                                    <span>{notas}</span>
                                  </button>
                                ) : null
                              })()}
                              {p.id && (() => {
                                const links = (p.materiais ?? []).filter(m => m.tipo === 'LINK').length
                                return links > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setOpenMateriaisPasso({ passoId: p.id!, tipo: 'LINK' })}
                                    className="h-8 inline-flex items-center gap-1 px-2 text-[10px] font-medium tabular-nums border-y border-r border-input bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-950/50 transition-colors shrink-0"
                                    title={`Links externos · ${links}`}
                                  >
                                    <LinkIcon className="h-3 w-3" />
                                    <span>{links}</span>
                                  </button>
                                ) : null
                              })()}
                              {p.id && (() => {
                                const arquivos = (p.materiais ?? []).filter(m => m.tipo === 'ARQUIVO').length
                                return arquivos > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setOpenMateriaisPasso({ passoId: p.id!, tipo: 'ARQUIVO' })}
                                    className="h-8 inline-flex items-center gap-1 px-2 text-[10px] font-medium tabular-nums border-y border-r border-input bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50 transition-colors shrink-0"
                                    title={`Arquivos · ${arquivos}`}
                                  >
                                    <Paperclip className="h-3 w-3" />
                                    <span>{arquivos}</span>
                                  </button>
                                ) : null
                              })()}
                              {p.id && (p.emailsCount ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setOpenEmailsPasso(p.id!)}
                                  className="h-8 inline-flex items-center gap-1 px-2 text-[10px] font-medium tabular-nums border-y border-r border-input bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50 transition-colors shrink-0"
                                  title={`E-mails de conclusão · ${p.emailsCount}`}
                                >
                                  <Mail className="h-3 w-3" />
                                  <span>{p.emailsCount}</span>
                                </button>
                              )}
                              {p.id && (p.lembretesCount ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setOpenLembretesPasso(p.id!)}
                                  className="h-8 inline-flex items-center gap-1 px-2 text-[10px] font-medium tabular-nums border-y border-r border-input bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50 transition-colors shrink-0"
                                  title={`Lembretes na agenda · ${p.lembretesCount}`}
                                >
                                  <Bell className="h-3 w-3" />
                                  <span>{p.lembretesCount}</span>
                                </button>
                              )}
                              {p.id && (p.camposClienteCount ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setOpenCamposClientePasso(p.id!)}
                                  className="h-8 inline-flex items-center gap-1 px-2 text-[10px] font-medium tabular-nums border-y border-r border-input bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-950/50 transition-colors shrink-0"
                                  title={`Campos do cliente · ${p.camposClienteCount}`}
                                >
                                  <Database className="h-3 w-3" />
                                  <span>{p.camposClienteCount}</span>
                                </button>
                              )}
                              {/* Append final: toggle de obrigatoriedade. Lock = obrigatório (vermelho),
                                  Unlock = opcional (verde). SEMPRE à direita — depois dos indicadores. */}
                              {p.id && (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={p.obrigatorio}
                                  onClick={() => {
                                    const v = !p.obrigatorio
                                    setEtapas(prev => prev.map((x, i) => i === ei
                                      ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, obrigatorio: v } : pp) }
                                      : x))
                                    void updatePassoCampo(p.id, 'obrigatorio', v)
                                  }}
                                  title={p.obrigatorio
                                    ? 'Obrigatório — clique para tornar opcional'
                                    : 'Opcional — clique para tornar obrigatório'}
                                  className={cn(
                                    'h-8 w-8 inline-flex items-center justify-center rounded-r-md border border-input border-l-0 transition-colors shrink-0',
                                    p.obrigatorio
                                      ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60'
                                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60',
                                  )}
                                >
                                  {p.obrigatorio ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </div>
                            {/* Materiais de apoio inline — chips + botão "+ Material" à direita do input.
                                Só pra passos salvos (com id) — drafts precisam ser persistidos primeiro.
                                Item "E-mail" é injetado no dropdown via extraDropdownItems; abre o dialog
                                de PassoEmailsSection (renderizado abaixo em modo controlado). */}
                            {p.id && (
                              <MateriaisSection
                                materiais={p.materiais ?? []}
                                passoId={p.id}
                                density="compact"
                                inline
                                hideChips
                                openListTipo={openMateriaisPasso?.passoId === p.id ? openMateriaisPasso.tipo : null}
                                onCloseList={() => setOpenMateriaisPasso(null)}
                                onChange={() => { void fetchServico() }}
                                extraDropdownItems={[
                                  {
                                    key: 'email',
                                    icon: Mail,
                                    label: 'E-mail de conclusão',
                                    iconClassName: 'text-indigo-600',
                                    onSelect: () => setOpenEmailsPasso(p.id!),
                                  },
                                  {
                                    key: 'lembrete',
                                    icon: Bell,
                                    label: 'Agendar lembrete',
                                    iconClassName: 'text-amber-600',
                                    onSelect: () => setOpenLembretesPasso(p.id!),
                                  },
                                  {
                                    key: 'campo-cliente',
                                    icon: Database,
                                    label: 'Vincular campo',
                                    iconClassName: 'text-sky-600',
                                    onSelect: () => setOpenCamposClientePasso(p.id!),
                                  },
                                ]}
                              />
                            )}
                            {/* Dialog de e-mails do passo controlado pelo state externo.
                                onCountChange atualiza só o passo específico no estado local —
                                evita refetch global (que causava flicker da tab inteira). */}
                            {p.id && (
                              <PassoEmailsSection
                                passoId={p.id}
                                density="compact"
                                inline
                                controlled={{
                                  open: openEmailsPasso === p.id,
                                  onOpenChange: (o) => setOpenEmailsPasso(o ? p.id! : null),
                                  hideTrigger: true,
                                }}
                                onCountChange={(count) => setEtapas(prev => prev.map(et => ({
                                  ...et,
                                  passos: et.passos.map(pp => pp.id === p.id ? { ...pp, emailsCount: count } : pp),
                                })))}
                              />
                            )}
                            {/* Dialog de lembretes (agenda corporativa) controlado. */}
                            {p.id && (
                              <PassoLembretesSection
                                passoId={p.id}
                                controlled={{
                                  open: openLembretesPasso === p.id,
                                  onOpenChange: (o) => setOpenLembretesPasso(o ? p.id! : null),
                                }}
                                onCountChange={(count) => setEtapas(prev => prev.map(et => ({
                                  ...et,
                                  passos: et.passos.map(pp => pp.id === p.id ? { ...pp, lembretesCount: count } : pp),
                                })))}
                              />
                            )}
                            {/* Dialog de vínculos de campos do cliente controlado. */}
                            {p.id && (
                              <PassoCamposClienteSection
                                passoId={p.id}
                                controlled={{
                                  open: openCamposClientePasso === p.id,
                                  onOpenChange: (o) => setOpenCamposClientePasso(o ? p.id! : null),
                                }}
                                onCountChange={(count) => setEtapas(prev => prev.map(et => ({
                                  ...et,
                                  passos: et.passos.map(pp => pp.id === p.id ? { ...pp, camposClienteCount: count } : pp),
                                })))}
                              />
                            )}
                          </div>
                          <Input
                            type="text"
                            value={p.slaText}
                            onChange={e => {
                              const v = e.target.value
                              setEtapas(prev => prev.map((x, i) => i === ei
                                ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, slaText: v } : pp) }
                                : x))
                              if (p.id) scheduleSave(`passo-${p.id}-sla`, () => {
                                const min = parseSlaMin(v)
                                if (v.trim() !== '' && min === null) return Promise.resolve()
                                return updatePassoCampo(p.id, 'slaMinutos', min)
                              })
                            }}
                            onBlur={e => {
                              // Ao sair: normaliza o texto pro formato canônico ("1h 30m")
                              const min = parseSlaMin(e.target.value)
                              const canonical = formatSlaMin(min)
                              if (canonical !== e.target.value) {
                                setEtapas(prev => prev.map((x, i) => i === ei
                                  ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, slaText: canonical } : pp) }
                                  : x))
                              }
                            }}
                            placeholder="1h 30m"
                            title="Formato aceito: 1h 30m, 45m, 2h, 1.5h ou 90 (minutos)"
                            className="h-8 text-sm text-center px-1"
                          />
                          <Button
                            variant="ghost" size="icon-xs"
                            onClick={() => removePasso(p.id)}
                            className="text-destructive opacity-50 hover:opacity-100"
                            title="Remover passo"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </SortablePasso>
                      </Fragment>
                          )
                        })
                      })()}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => addPasso(et)}
                        className="gap-1 text-[10px] text-muted-foreground h-6 mt-1"
                      >
                        <Plus className="h-3 w-3" /> Adicionar passo
                      </Button>
                    </div>
                      </SortableContext>
                    </DndContext>
                          </div>
                        </div>
                  </SortableEtapa>
                  )
                })}
              </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Fluxo (DAG) ── */}
        <TabsContent value="fluxo" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {fluxoLoading || !fluxoData ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculando fluxo...
                </div>
              ) : (
                <FluxoEditor
                  key={fluxoVersion}
                  rootId={id}
                  nodes={fluxoData.nodes}
                  edges={fluxoData.edges}
                  onChanged={async () => {
                    // Re-busca fluxo silenciosamente; mantém aba ativa e estado
                    // do resto da página. Bumpar a versão força o editor a
                    // re-montar com os nodes/edges atualizados.
                    await fetchFluxo({ silent: true })
                    setFluxoVersion(v => v + 1)
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Sucessores ── */}
        <TabsContent value="encadeamento" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Próximos serviços (sucessores)</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Ao concluir este serviço, os sucessores abaixo são criados automaticamente.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={openAddEnc} className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Adicionar sucessor
                </Button>
              </div>
              {encadeamentos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6 italic border rounded-lg bg-muted/20">
                  Nenhum sucessor — este serviço é finalizado isoladamente.
                </p>
              ) : (
                <div className="space-y-2">
                  {encadeamentos.map(enc => (
                    <div key={enc.id} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow">
                      <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-xs font-bold">
                        {enc.ordem + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => router.push(`/servicos/${enc.servicoDestinoId}`)}
                            className="text-sm font-semibold truncate hover:text-emerald-600 hover:underline text-left"
                          >
                            {enc.servicoDestino.nome}
                          </button>
                          {enc.iniciaAuto && enc.obrigatorio && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 border-emerald-200 text-emerald-700">
                              <Play className="h-2.5 w-2.5 mr-0.5" /> Auto
                            </Badge>
                          )}
                          {!enc.iniciaAuto && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">
                              <Pause className="h-2.5 w-2.5 mr-0.5" /> Manual
                            </Badge>
                          )}
                          {!enc.obrigatorio && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-sky-50 border-sky-200 text-sky-700">
                              Opcional
                            </Badge>
                          )}
                          {enc.herdaResponsavel && <Badge variant="outline" className="text-[10px] h-5">Herda resp.</Badge>}
                          {enc.condicao != null && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-violet-50 border-violet-200 text-violet-700">
                              <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Condicional
                            </Badge>
                          )}
                        </div>
                        {enc.observacao && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">{enc.observacao}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon-xs" onClick={() => openEditEnc(enc)} title="Editar">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => removerEnc(enc)} className="text-destructive" title="Remover">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Texto padrão ── */}
        <TabsContent value="texto" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Texto padrão</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Conteúdo HTML usado como modelo inicial — pode ser inserido em e-mails,
                    notas ou documentação automática quando este serviço for executado.
                  </p>
                </div>
                <Button onClick={salvarVisao} disabled={saving} size="sm" className="gap-1.5 shrink-0" style={{ backgroundColor: MODULE_COLOR }}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar alterações
                </Button>
              </div>
              <RichEditor
                value={textoPadrao}
                onChange={(html) => setTextoPadrao(html)}
                placeholder="Comece a digitar o texto padrão... use a barra de ferramentas pra formatar."
                className="min-h-[420px]"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Recorrência (só MENSAL) ── */}
        {categoriaServico === 'MENSAL' && (
          <TabsContent value="recorrencia" className="mt-4">
            <NotificacoesSection servicoId={id} categoriaServico={categoriaServico} modo="recorrencia" />
          </TabsContent>
        )}

        {/* ── TAB: Notificações ── */}
        <TabsContent value="notificacoes" className="mt-4">
          <NotificacoesSection servicoId={id} categoriaServico={categoriaServico} modo="regras" />
        </TabsContent>
      </Tabs>

      {/* Modal de Encadeamento (Adicionar/Editar) */}
      <Dialog open={encModalOpen} onOpenChange={setEncModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeaderIcon icon={Network} color="violet">
            <DialogTitle>{editingEnc ? 'Editar sucessor' : 'Adicionar sucessor'}</DialogTitle>
            <DialogDescription>Configure o serviço que será criado após este.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            {!editingEnc && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Serviço sucessor *</Label>
                <Select value={encDestinoId} onValueChange={setEncDestinoId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {todosServicos.filter(s => s.id !== id).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Ordem</Label>
                <Input type="number" value={encOrdem} onChange={e => setEncOrdem(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input id="enc-auto" type="checkbox" checked={encIniciaAuto} onChange={e => setEncIniciaAuto(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                <Label htmlFor="enc-auto" className="text-xs font-medium">Inicia automaticamente</Label>
              </div>
              <div className="flex items-center gap-2">
                <input id="enc-obr" type="checkbox" checked={encObrigatorio} onChange={e => setEncObrigatorio(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                <Label htmlFor="enc-obr" className="text-xs font-medium">Obrigatório (não pode ser pulado)</Label>
              </div>
              <div className="flex items-center gap-2">
                <input id="enc-herda" type="checkbox" checked={encHerdaResponsavel} onChange={e => setEncHerdaResponsavel(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                <Label htmlFor="enc-herda" className="text-xs font-medium">Herda responsável do anterior</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Observação</Label>
              <textarea
                value={encObservacao}
                onChange={e => setEncObservacao(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-y"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncModalOpen(false)} disabled={encSaving}>Cancelar</Button>
            <Button onClick={salvarEncadeamento} disabled={encSaving} className="gap-1.5" style={{ backgroundColor: MODULE_COLOR }}>
              {encSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingEnc ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Componentes Sortable (DnD) — usados na aba Etapas e passos
// ─────────────────────────────────────────────────────────────

// Contexto declarado antes dos componentes que usam (const não é hoisted)
const SortableHandleContext = createContext<{
  attributes: Record<string, unknown>
  listeners: Record<string, unknown>
} | null>(null)

/** Wrapper de etapa drag-and-drop. O drag só ativa via SortableEtapaHandle. */
function SortableEtapa({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.12)' : undefined,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-muted/10 p-3">
      <SortableHandleContext.Provider
        value={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: (listeners ?? {}) as Record<string, unknown>,
        }}
      >
        {children}
      </SortableHandleContext.Provider>
    </div>
  )
}

/** Handle de passo — número clicável com cursor grab que ativa o drag. */
function SortablePassoHandle({ numero }: { numero: number }) {
  const ctx = useContext(SortableHandleContext)
  if (!ctx) return <span className="text-muted-foreground text-[10px] text-right">{numero}.</span>
  return (
    <button
      type="button"
      {...(ctx.attributes as React.HTMLAttributes<HTMLButtonElement>)}
      {...(ctx.listeners as React.HTMLAttributes<HTMLButtonElement>)}
      className="cursor-grab active:cursor-grabbing text-muted-foreground text-[10px] text-right hover:text-foreground transition-colors"
      title="Arrastar para reordenar"
      aria-label={`Arrastar passo ${numero}`}
    >
      {numero}.
    </button>
  )
}

/** Handle ⋮⋮ que ativa o drag (precisa estar dentro de SortableEtapa). */
function SortableEtapaHandle() {
  const ctx = useContext(SortableHandleContext)
  if (!ctx) return null
  return (
    <button
      type="button"
      {...(ctx.attributes as React.HTMLAttributes<HTMLButtonElement>)}
      {...(ctx.listeners as React.HTMLAttributes<HTMLButtonElement>)}
      className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 -ml-1"
      title="Arrastar para reordenar"
      aria-label="Arrastar etapa"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

/** Linha de passo drag-and-drop. Drag ativa apenas pelo número à esquerda
 * (via SortableHandleContext) — assim os inputs continuam clicáveis sem dispara drag. */
function SortablePasso({ id, children, layerClass, exiting }: { id: string; children: React.ReactNode; layerClass?: string; exiting?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  // Quando `exiting=true`, anima fade + colapso vertical pra dar feedback de
  // remoção sem precisar refetch da etapa inteira.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: exiting
      ? 'opacity 200ms ease-out, max-height 220ms ease-out, padding 220ms ease-out, margin 220ms ease-out, transform 220ms ease-out'
      : transition,
    opacity: exiting ? 0 : (isDragging ? 0.5 : 1),
    background: isDragging ? 'rgba(16,185,129,0.05)' : undefined,
    maxHeight: exiting ? 0 : undefined,
    paddingTop: exiting ? 0 : undefined,
    paddingBottom: exiting ? 0 : undefined,
    marginTop: exiting ? 0 : undefined,
    marginBottom: exiting ? 0 : undefined,
    overflow: exiting ? 'hidden' : undefined,
    pointerEvents: exiting ? 'none' : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'grid grid-cols-[24px_1fr_80px_28px] gap-2 items-center py-0.5 px-1 rounded',
        layerClass,
      )}
    >
      <SortableHandleContext.Provider
        value={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: (listeners ?? {}) as Record<string, unknown>,
        }}
      >
        {children}
      </SortableHandleContext.Provider>
    </div>
  )
}
