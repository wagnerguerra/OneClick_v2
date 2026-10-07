'use client'

import { useEffect, useState, useCallback, useRef, createContext, useContext, forwardRef } from 'react'
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
  Loader2, Save, Plus, Trash2, Edit, AlertCircle,
  Play, Pause, FileText, Layers, GitBranch, History, ListChecks,
  GripVertical, Clock, ChevronRight, ChevronDown, Network, Repeat, Zap, Type, Check, Search, Users,
  Bell, Mail, CircleDollarSign, AlignLeft, Info, Settings, CalendarDays, Lock, Unlock, ShieldCheck, Database, HelpCircle,
  StickyNote, Link as LinkIcon, Paperclip, Folder, FolderOpen, FolderPlus, Settings2, CheckSquare,
} from 'lucide-react'
import Link from 'next/link'
import {
  Button, Card, CardHeader, CardContent, Badge, Label, Input, cn,
  Tabs, TabsContent,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  RichEditor, Checkbox, Switch, Textarea,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BADGE, SURFACE, TEXT } from '@/lib/color-styles'
// Rótulos dos tipos de chamado — serviço interno declara quais atende, e o
// seletor de serviço do HelpDesk filtra por isso.
import { HELPDESK_TIPO_LABELS } from '@saas/types'
import { FluxoDoServico } from './_components/fluxo-do-servico'
import { PerguntaCondicaoDialog, SeloCondicaoCadastro, textoCondicao, type AlvoCondicao, type PerguntaDisponivel } from './_components/pergunta-condicao'
import { MateriaisSection, type Material } from './_components/materiais-section'
import { NotificacoesSection } from './_components/notificacoes-section'
import { PassoEmailsSection } from './_components/passo-emails-section'
import { PassoLembretesSection } from './_components/passo-lembretes-section'
import { PassoCamposClienteSection } from './_components/passo-campos-cliente-section'
import { FeixeDeLinhas } from '@/components/ui/feixe-de-linhas'
import { useTheme } from '@/hooks/use-theme'

const PRIMARY = 'var(--color-primary)'

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
  /** Sub-etapa (opcional) da mesma etapa. null = passo direto na etapa. */
  subEtapaId: string | null
  /** PERGUNTA = respondida na execução; decide o que vale adiante (condições "if"). */
  tipo?: 'PASSO' | 'PERGUNTA'
  perguntaTexto?: string | null
  perguntaOpcoes?: string[]
  perguntaMultipla?: boolean
  /** Condição: só vale se a pergunta `condicaoPassoId` = alguma de `condicaoOpcoes`. */
  condicaoPassoId?: string | null
  condicaoOpcoes?: string[]
}

/** Sub-etapa: agrupamento opcional de passos dentro da etapa (um nível). */
interface SubEtapa {
  id: string
  nome: string
  ordem: number
  condicaoPassoId?: string | null
  condicaoOpcoes?: string[]
}

/**
 * Ordem de exibição (e de execução) dos passos de uma etapa com sub-etapas:
 * passos diretos primeiro, depois cada sub-etapa na ordem dela. Estável dentro
 * de cada grupo — preserva a ordem atual do array. Espelha o servidor
 * (apps/api/src/servico/servico-sub-etapa.ts).
 */
function agruparPassos(passos: Passo[], subEtapas: SubEtapa[]): Passo[] {
  const pos = new Map(subEtapas.slice().sort((a, b) => a.ordem - b.ordem).map((s, i) => [s.id, i]))
  const grupo = (p: Passo) => (p.subEtapaId && pos.has(p.subEtapaId) ? pos.get(p.subEtapaId)! : -1)
  return passos.map((p, i) => ({ p, i })).sort((a, b) => grupo(a.p) - grupo(b.p) || a.i - b.i).map(x => x.p)
}

/** Prefixo dos ids de cabeçalho de grupo na lista arrastável de uma etapa. */
const GRP = 'grp:'
const GRP_DIRETO = `${GRP}__direto`

/**
 * Lista plana arrastável de UMA etapa: cabeçalhos de grupo + passos, na ordem
 * de exibição. Sem sub-etapas é só a lista de passos (como antes). Com
 * sub-etapas: "Direto na etapa" (alvo, não arrastável) + passos diretos, e para
 * cada sub-etapa o cabeçalho (arrastável — leva os passos junto) + os passos dela.
 */
function itensArrastaveis(passos: Passo[], subEtapas: SubEtapa[]): string[] {
  if (subEtapas.length === 0) return passos.map(p => p.dndId)
  const subs = subEtapas.slice().sort((a, b) => a.ordem - b.ordem)
  const ids = new Set(subs.map(x => x.id))
  const out = [GRP_DIRETO, ...passos.filter(p => !p.subEtapaId || !ids.has(p.subEtapaId)).map(p => p.dndId)]
  for (const se of subs) out.push(`${GRP}${se.id}`, ...passos.filter(p => p.subEtapaId === se.id).map(p => p.dndId))
  return out
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
// Decomposição do SLA e previsão de conclusão.
//
// Aqui se contava em JORNADA ÚTIL: 8h por dia, 5 dias por semana. Um SLA de
// 121h (1 + 48 + 48 + 24) virava "3 sem 1h", porque 121 ÷ 40 dá 3 e sobra 1 —
// e ninguém que digitou "48h" no passo lê isso como seis dias de expediente.
//
// Pior que a estranheza: o motor não conta assim. `createExecucao` grava
// `prazoLimite = iniciadoEm + slaHoras`, em horas CORRIDAS, e é esse prazo que
// o cron horário usa para marcar atraso. A tela prometia 22/09 enquanto a
// execução seria cobrada no dia 6. Contar em jornada útil aqui era descrever um
// sistema que não existe.
// ─────────────────────────────────────────────────────────────
const MIN_POR_HORA = 60
const MIN_POR_DIA  = 24 * MIN_POR_HORA

/** Decompõe minutos em { dias, horas, minutos } — dias de 24h, como o prazo. */
function decomporSlaRich(min: number): { dias: number; horas: number; minutos: number } {
  let resto = Math.max(0, Math.round(min))
  const dias    = Math.floor(resto / MIN_POR_DIA);  resto -= dias  * MIN_POR_DIA
  const horas   = Math.floor(resto / MIN_POR_HORA); resto -= horas * MIN_POR_HORA
  return { dias, horas, minutos: resto }
}

/** Formata "5d 1h" / "2h 30m". Omite as unidades zeradas. */
function formatSlaRich(min: number | null | undefined): string {
  if (min == null || min <= 0) return '0m'
  const { dias, horas, minutos } = decomporSlaRich(min)
  const parts: string[] = []
  if (dias > 0)    parts.push(`${dias}d`)
  if (horas > 0)   parts.push(`${horas}h`)
  if (minutos > 0) parts.push(`${minutos}m`)
  return parts.join(' ') || '0m'
}

/**
 * Data/hora prevista de conclusão: início + SLA, corrido.
 *
 * A versão anterior projetava por expediente (9h–17h, pulando fim de semana).
 * Era uma previsão mais humana, mas de outro sistema: o prazo que o backend
 * grava e cobra é corrido. Prever numa régua e cobrar noutra faz a tela mentir
 * — e mentir para mais, prometendo folga que a execução não tem.
 */
function calcularPrevisaoConclusao(slaMin: number, inicio: Date = new Date()): Date {
  if (slaMin <= 0) return new Date(inicio)
  return new Date(inicio.getTime() + slaMin * 60000)
}

interface Etapa {
  id?: string
  nome: string
  ordem: number
  passos: Passo[]
  /** Sub-etapas da etapa, em ordem. */
  subEtapas: SubEtapa[]
  /** Materiais de apoio anexados a esta etapa no template. */
  materiais?: Material[]
  condicaoPassoId?: string | null
  condicaoOpcoes?: string[]
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
  // `recorrencia` faz parte da união: a aba sempre existiu (tem TabsContent),
  // mas o tipo não a previa — o Radix aceitava string solta e escondia a falha.
  type AbaServico = 'visao' | 'etapas' | 'fluxo' | 'encadeamento' | 'variacoes' | 'texto' | 'recorrencia' | 'notificacoes'
  const [activeTab, setActiveTab] = useState<AbaServico>('visao')
  // No escuro a linha branca se dilui no véu; sobe um pouco o alfa para ela
  // continuar visível sem virar risco. `system` é resolvido na hora, como no
  // cabeçalho — o hook guarda a ESCOLHA, não o resultado dela.
  const { theme } = useTheme()
  const temaEscuro = theme === 'dark'
    || (theme === 'system' && typeof window !== 'undefined'
        && window.matchMedia('(prefers-color-scheme: dark)').matches)

  /**
   * Variações — o texto e o valor que o usuário escolhe ao lançar este serviço
   * num orçamento ("Plano Básico", "Plano Completo").
   */
  const [variacoes, setVariacoes] = useState<Array<{ id: string; titulo: string; descricao: string | null; valor: string | number | null }>>([])
  const [varModalOpen, setVarModalOpen] = useState(false)
  const [varEditando, setVarEditando] = useState<string | null>(null)
  const [varTitulo, setVarTitulo] = useState('')
  const [varDescricao, setVarDescricao] = useState('')
  const [varValor, setVarValor] = useState('')
  const [varSalvando, setVarSalvando] = useState(false)
  const [varBusca, setVarBusca] = useState('')
  // Pill ativa dentro da aba Visão geral
  const [visaoPill, setVisaoPill] = useState<'identificacao' | 'descricao' | 'comercial' | 'responsaveis' | 'avancado' | 'vencimentosMensais'>('identificacao')

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
  // Área do serviço — agora por ID (era `categoria`, nome livre).
  const [areaId, setAreaId] = useState('')
  const [prioridade, setPrioridade] = useState<'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'>('MEDIA')
  const [valorPadrao, setValorPadrao] = useState('')
  const [disponivelOrcamento, setDisponivelOrcamento] = useState(true)
  // Serviço de entrada de novo cliente: orçamento aprovado com ele conta como
  // "contrato assinado" no painel /comercial.
  const [entradaNovoCliente, setEntradaNovoCliente] = useState(false)
  /** MENSAL = recorrente; EXTRA = pontual; FLUXO = item interno de outro serviço. */
  const [categoriaServico, setCategoriaServico] = useState<'MENSAL' | 'EXTRA' | 'FLUXO'>('EXTRA')
  /**
   * Tipo do NÓ no fluxo — ATIVIDADE ou PERGUNTA. Vive em `Servico.tipo`, que já
   * existia e já é o que o editor visual usa para marcar o bloco de decisão.
   * Entrou no "Tipo de cadastro" porque um serviço-pergunta como "Qual a
   * tributação?" não é recorrente nem extraordinário — e, sem uma opção que o
   * descrevesse, aparecia rotulado como "Serviço Extraordinário".
   */
  const [tipoNo, setTipoNo] = useState<'ATIVIDADE' | 'PERGUNTA'>('ATIVIDADE')
  /** Serviço de execução exclusivamente interna — não aparece no catálogo do orçamento.
   *  Mutuamente exclusivo com Recorrente/Extra/Fluxo (no UI é a 4ª pill do "Tipo de cadastro"). */
  const [ehServicoInterno, setEhServicoInterno] = useState(false)
  /**
   * Tipos de chamado do HelpDesk que este serviço atende. No formulário de
   * abertura, escolher o tipo filtra o seletor de serviço por esta lista —
   * serviço sem nenhum tipo marcado não aparece em filtro de tipo algum.
   * Só faz sentido em serviço interno, que é o que classifica chamado.
   */
  const [helpdeskTipos, setHelpdeskTipos] = useState<string[]>([])
  /** Quando true, o registro é template de Obrigação Acessória — define o destino do botão "voltar". */
  const [ehObrigacaoAcessoria, setEhObrigacaoAcessoria] = useState(false)
  /** Quando categoriaServico=FLUXO, aponta pro serviço top-level dono do fluxo.
   *  Lista de pais reusada de `todosServicos` (já carregada via fetchTodosServicos). */
  const [servicoPaiId, setServicoPaiId] = useState<string>('')
  const [segmentoSlug, setSegmentoSlug] = useState<string | null>(null)
  // Atribuição legado (mantido só pra blocos PERGUNTA com estratégia explícita)
  const [atribuicaoResponsavel, setAtribuicaoResponsavel] = useState<'ORCAMENTO' | 'CLIENTE_AREA' | 'MANUAL_FIXO' | 'HERDA_PREDECESSOR'>('ORCAMENTO')
  const [responsavelFixoId, setResponsavelFixoId] = useState<string>('')

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
  // Nome da área selecionada (resolve o id para exibição).
  const areaNome = areas.find(a => a.id === areaId)?.name ?? ''

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
  /** Sub-etapas recolhidas na árvore (ids). */
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set())
  function alternarSub(subId: string) {
    setCollapsedSubs(prev => {
      const next = new Set(prev)
      if (next.has(subId)) next.delete(subId); else next.add(subId)
      return next
    })
  }
  const todasSubs = etapas.flatMap(et => et.subEtapas.map(se => se.id))
  const tudoRecolhido = etapas.length > 0 && collapsedEtapas.size >= etapas.length
  function recolherTudoArvore() { collapseAllEtapas(); setCollapsedSubs(new Set(todasSubs)) }
  function expandirTudoArvore() { expandAllEtapas(); setCollapsedSubs(new Set()) }
  // Abre/fecha da árvore lembrado por serviço (só conveniência do navegador).
  const chaveArvore = `servico-arvore:${id}`
  const arvoreCarregada = useRef(false)
  useEffect(() => {
    if (arvoreCarregada.current) return
    arvoreCarregada.current = true
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveArvore) ?? 'null') as { etapas?: string[]; subs?: string[] } | null
      if (salvo?.etapas) setCollapsedEtapas(new Set(salvo.etapas))
      if (salvo?.subs) setCollapsedSubs(new Set(salvo.subs))
    } catch { /* sem storage: tudo aberto */ }
  }, [chaveArvore])
  useEffect(() => {
    if (!arvoreCarregada.current) return
    try { localStorage.setItem(chaveArvore, JSON.stringify({ etapas: [...collapsedEtapas], subs: [...collapsedSubs] })) } catch { /* ignora */ }
  }, [chaveArvore, collapsedEtapas, collapsedSubs])

  /** Item cujo painel lateral de configuração está aberto. */
  const [painel, setPainel] = useState<
    | { tipo: 'passo'; dndId: string }
    | { tipo: 'etapa'; key: string }
    | { tipo: 'sub'; subId: string }
    | null
  >(null)

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
      setAreaId(s.areaId || '')
      setPrioridade((s.prioridadePadrao as typeof prioridade) || 'MEDIA')
      // valorPadrao no banco é decimal em reais; aqui guardamos centavos como string
      setValorPadrao(s.valorPadrao != null ? String(Math.round(Number(s.valorPadrao) * 100)) : '')
      setDisponivelOrcamento(s.disponivelOrcamento !== false)
      setEntradaNovoCliente(s.entradaNovoCliente === true)
      // Lê categoriaServico se presente; fallback derivando da flag legada recorrenteMensal
      const cat: 'MENSAL' | 'EXTRA' | 'FLUXO' = (s.categoriaServico as any)
        ?? (s.recorrenteMensal === true ? 'MENSAL' : 'EXTRA')
      setCategoriaServico(cat)
      setEhServicoInterno((s as any).ehServicoInterno === true)
      setHelpdeskTipos(Array.isArray((s as any).helpdeskTipos) ? (s as any).helpdeskTipos : [])
      setEhObrigacaoAcessoria((s as any).ehObrigacaoAcessoria === true)
      setTipoNo((s as any).tipo === 'PERGUNTA' ? 'PERGUNTA' : 'ATIVIDADE')
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
      const etapasFromServer = (s.etapas || []).map((et: { id: string; nome: string; ordem: number; materiais?: Material[]; subEtapas?: SubEtapa[]; condicaoPassoId?: string | null; condicaoOpcoes?: string[]; passos: Array<{ id: string; nome: string; ordem: number; obrigatorio: boolean; permiteIgnorar?: boolean; slaHoras: number | null; slaMinutos?: number | null; dependeDoPassoId?: string | null; subEtapaId?: string | null; materiais?: Material[]; _count?: { emailTemplates?: number; lembretes?: number; camposCliente?: number }; tipo?: string; perguntaTexto?: string | null; perguntaOpcoes?: string[]; perguntaMultipla?: boolean; condicaoPassoId?: string | null; condicaoOpcoes?: string[] }> }) => ({
        id: et.id,
        nome: et.nome,
        ordem: et.ordem,
        materiais: et.materiais ?? [],
        condicaoPassoId: et.condicaoPassoId ?? null,
        condicaoOpcoes: et.condicaoOpcoes ?? [],
        subEtapas: (et.subEtapas ?? []).map(se => ({ id: se.id, nome: se.nome, ordem: se.ordem, condicaoPassoId: se.condicaoPassoId ?? null, condicaoOpcoes: se.condicaoOpcoes ?? [] })),
        passos: agruparPassos((et.passos || []).map(p => {
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
            subEtapaId: p.subEtapaId ?? null,
            tipo: p.tipo === 'PERGUNTA' ? 'PERGUNTA' as const : 'PASSO' as const,
            perguntaTexto: p.perguntaTexto ?? null,
            perguntaOpcoes: p.perguntaOpcoes ?? [],
            perguntaMultipla: p.perguntaMultipla ?? false,
            condicaoPassoId: p.condicaoPassoId ?? null,
            condicaoOpcoes: p.condicaoOpcoes ?? [],
          }
        }), (et.subEtapas ?? []).map(se => ({ id: se.id, nome: se.nome, ordem: se.ordem }))),
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

  const fetchVariacoes = useCallback(async () => {
    try {
      const r = await (trpc.servico as any).listVariacoes.query({ servicoId: id })
      setVariacoes(r || [])
    } catch { setVariacoes([]) }
  }, [id])

  function abrirNovaVariacao() {
    setVarEditando(null); setVarTitulo(''); setVarDescricao(''); setVarValor('')
    setVarModalOpen(true)
  }

  function abrirEditarVariacao(v: { id: string; titulo: string; descricao: string | null; valor: string | number | null }) {
    setVarEditando(v.id)
    setVarTitulo(v.titulo)
    setVarDescricao(v.descricao ?? '')
    setVarValor(v.valor != null ? String(v.valor) : '')
    setVarModalOpen(true)
  }

  async function salvarVariacao() {
    if (!varTitulo.trim()) { await alerts.warning('Variação', 'Informe o título.'); return }
    setVarSalvando(true)
    try {
      // Valor em branco não é zero: é "usa o valor do serviço". Zerar aqui
      // faria a variação sobrescrever o preço com R$ 0,00.
      const valor = varValor.trim() === '' ? null : Number(varValor)
      if (varEditando) {
        await (trpc.servico as any).updateVariacao.mutate({ id: varEditando, titulo: varTitulo, descricao: varDescricao || null, valor })
      } else {
        await (trpc.servico as any).addVariacao.mutate({ servicoId: id, titulo: varTitulo, descricao: varDescricao || null, valor })
      }
      setVarModalOpen(false)
      await fetchVariacoes()
    } catch (e) {
      await alerts.error('Não foi possível salvar', (e as Error).message)
    } finally {
      setVarSalvando(false)
    }
  }

  const variacoesFiltradas = varBusca.trim()
    ? variacoes.filter(v => v.titulo.toLowerCase().includes(varBusca.trim().toLowerCase()))
    : variacoes

  async function excluirVariacao(v: { id: string; titulo: string }) {
    const ok = await alerts.confirm({
      title: 'Excluir a variação?',
      text: `"${v.titulo}" deixa de ser oferecida ao lançar este serviço num orçamento. Itens já lançados com ela não mudam.`,
      icon: 'warning',
      confirmText: 'Excluir',
      destructive: true,
    })
    if (!ok) return
    try {
      await (trpc.servico as any).removeVariacao.mutate({ id: v.id })
      await fetchVariacoes()
    } catch (e) {
      await alerts.error('Não foi possível excluir', (e as Error).message)
    }
  }

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


  useEffect(() => { fetchServico(); fetchEncadeamentos(); fetchTodosServicos(); fetchAreas(); fetchTodosGrupos(); fetchUsuariosForSelect(); fetchVariacoes() }, [fetchServico, fetchEncadeamentos, fetchTodosServicos, fetchAreas, fetchTodosGrupos, fetchUsuariosForSelect, fetchVariacoes])


  // Hand-off do wizard de cadastro: ?assistente=fluxo abre a aba Fluxo já com o
  // assistente guiado. Lê via window (evita exigir <Suspense> de useSearchParams).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    // O assistente monta a CADEIA, que agora mora em /servicos/[id]/cadeia.
    if (sp.get('assistente') === 'fluxo') {
      router.replace(`/servicos/${id}/cadeia?assistente=fluxo`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Do fluxo para a edição: abre "Etapas e passos" e foca o passo clicado. */
  const irParaPasso = useCallback((dndId: string) => {
    setActiveTab('etapas')
    const ei = etapas.findIndex(et => et.passos.some(pp => pp.dndId === dndId))
    const et = etapas[ei]
    if (et) {
      const key = et.id ?? (et as unknown as { __draftKey?: string }).__draftKey ?? `__none-${ei}`
      setCollapsedEtapas(prev => { const n = new Set(prev); n.delete(key); return n })
      const sub = et.passos.find(pp => pp.dndId === dndId)?.subEtapaId
      if (sub) setCollapsedSubs(prev => { const n = new Set(prev); n.delete(sub); return n })
    }
    setTimeout(() => {
      const el = passoInputRefs.current.get(dndId)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus() }
    }, 120)
  }, [etapas])

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
          areaId: areaId || null,
          prioridadePadrao: prioridade,
          valorPadrao: valorPadrao ? parseInt(valorPadrao, 10) / 100 : null,
          // Interno, Acessória e Fluxo forçam fora-do-catálogo; nas demais respeitam o toggle.
          disponivelOrcamento: ehServicoInterno || ehObrigacaoAcessoria || categoriaServico === 'FLUXO' ? false : disponivelOrcamento,
          ehServicoInterno,
          // Só serviço interno classifica chamado; nos demais vai vazio para
          // não deixar vínculo pendurado num serviço que saiu do HelpDesk.
          helpdeskTipos: ehServicoInterno ? helpdeskTipos : [],
          ehObrigacaoAcessoria,
          entradaNovoCliente,
          recorrenteMensal: tipoNo === 'PERGUNTA' ? false : categoriaServico === 'MENSAL',
          categoriaServico,
          tipo: tipoNo,
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
      subEtapas: [],
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
      destructive: true,
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

  /**
   * Arraste dentro de uma etapa — passos e sub-etapas na MESMA lista:
   * - cabeçalho de sub-etapa: move a sub-etapa inteira (com os passos);
   * - passo solto sobre um cabeçalho: entra naquele grupo (vale para sub-etapa
   *   vazia e para "Direto na etapa");
   * - passo entre passos: adota o grupo do cabeçalho mais próximo acima.
   */
  function handlePassosDragEnd(etapaIdx: number, e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const etapa = etapas[etapaIdx]
    if (!etapa) return
    const aId = String(active.id)
    const oId = String(over.id)
    const flat = itensArrastaveis(etapa.passos, etapa.subEtapas)
    const oldIdx = flat.indexOf(aId)
    const newIdx = flat.indexOf(oId)
    if (oldIdx === -1 || newIdx === -1) return

    // ── Sub-etapa arrastada: reordena os cabeçalhos (o "Direto" fica sempre no topo).
    if (aId.startsWith(GRP)) {
      const cabecalhos = flat.filter(x => x.startsWith(GRP) && x !== GRP_DIRETO)
      const de = cabecalhos.indexOf(aId)
      // Alvo: o cabeçalho do grupo onde caiu (passo → grupo dele; "Direto" → topo).
      let alvoCab = oId
      if (!oId.startsWith(GRP)) {
        for (let k = newIdx; k >= 0; k--) { if (flat[k]!.startsWith(GRP)) { alvoCab = flat[k]!; break } }
      }
      const para = alvoCab === GRP_DIRETO ? 0 : cabecalhos.indexOf(alvoCab)
      if (de === -1 || para === -1 || de === para) return
      const novaOrdem = arrayMove(cabecalhos, de, para).map(c => c.slice(GRP.length))
      const subEtapas = etapa.subEtapas.map(se => ({ ...se, ordem: novaOrdem.indexOf(se.id) }))
      const passos = agruparPassos(etapa.passos, subEtapas).map((p, i) => ({ ...p, ordem: i }))
      setEtapas(prev => prev.map((x, i) => i === etapaIdx ? { ...x, subEtapas, passos } : x))
      void Promise.all(subEtapas.map(se => (trpc.servico as any).updateSubEtapa.mutate({ id: se.id, ordem: se.ordem })))
        .then(() => reordenarPassos(etapaIdx, passos.map(p => p.id).filter((x): x is string => !!x)))
        .catch((err: Error) => { alerts.error('Erro ao reordenar sub-etapas', err.message); void fetchServico() })
      return
    }

    // ── Passo arrastado.
    const passoMovido = etapa.passos.find(p => p.dndId === aId)
    if (!passoMovido) return
    let novaLista: string[]
    let novoGrupo: string | null
    if (oId.startsWith(GRP)) {
      // Solto sobre um cabeçalho: vai para o começo daquele grupo.
      novoGrupo = oId === GRP_DIRETO ? null : oId.slice(GRP.length)
      const semEle = flat.filter(x => x !== aId)
      const pos = semEle.indexOf(oId) + 1
      novaLista = [...semEle.slice(0, pos), aId, ...semEle.slice(pos)]
    } else {
      novaLista = arrayMove(flat, oldIdx, newIdx)
      const i = novaLista.indexOf(aId)
      let cab: string | null = null
      for (let k = i - 1; k >= 0; k--) { if (novaLista[k]!.startsWith(GRP)) { cab = novaLista[k]!; break } }
      novoGrupo = !cab || cab === GRP_DIRETO ? null : cab.slice(GRP.length)
      if (etapa.subEtapas.length === 0) novoGrupo = passoMovido.subEtapaId
    }
    const porDnd = new Map(etapa.passos.map(p => [p.dndId, p]))
    const ordenados = novaLista.filter(x => !x.startsWith(GRP)).map(x => porDnd.get(x)!)
      .map(p => (p.dndId === aId ? { ...p, subEtapaId: novoGrupo } : p))
    const reordered = agruparPassos(ordenados, etapa.subEtapas).map((p, i) => ({ ...p, ordem: i }))
    setEtapas(prev => prev.map((x, i) => i === etapaIdx ? { ...x, passos: reordered } : x))
    const mudouGrupo = novoGrupo !== passoMovido.subEtapaId
    if (mudouGrupo && passoMovido.id) {
      void (trpc.servico as any).updatePasso.mutate({ id: passoMovido.id, data: { subEtapaId: novoGrupo } })
        .catch((err: Error) => { alerts.error('Erro ao mover passo', err.message); void fetchServico() })
    }
    void reordenarPassos(etapaIdx, reordered.map(p => p.id).filter((x): x is string => !!x))
  }

  // ── Sub-etapas ──────────────────────────────────────────────
  // Agrupamento OPCIONAL de passos dentro da etapa. Excluir a sub-etapa devolve
  // os passos para a etapa (o servidor faz SetNull) — nada é apagado.

  async function addSubEtapa(etapaIdx: number) {
    const etapa = etapas[etapaIdx]
    if (!etapa?.id) return
    const nome = await alerts.input({
      title: 'Nova sub-etapa',
      text: `Agrupa passos dentro de "${etapa.nome}". Ex.: Junta Comercial, Receita Federal.`,
      inputPlaceholder: 'Nome da sub-etapa',
      confirmText: 'Criar',
      required: true,
    })
    if (!nome?.trim()) return
    try {
      const nova = await (trpc.servico as any).addSubEtapa.mutate({ etapaId: etapa.id, nome: nome.trim(), ordem: etapa.subEtapas.length }) as SubEtapa
      setEtapas(prev => prev.map((x, i) => i === etapaIdx ? { ...x, subEtapas: [...x.subEtapas, { id: nova.id, nome: nova.nome, ordem: nova.ordem }] } : x))
    } catch (err) { alerts.error('Erro ao criar sub-etapa', (err as Error).message) }
  }

  async function renomearSubEtapa(etapaIdx: number, subId: string, nome: string) {
    const v = nome.trim()
    const atual = etapas[etapaIdx]?.subEtapas.find(x => x.id === subId)
    if (!v || !atual || atual.nome === v) return
    setEtapas(prev => prev.map((x, i) => i === etapaIdx ? { ...x, subEtapas: x.subEtapas.map(se => se.id === subId ? { ...se, nome: v } : se) } : x))
    try { await (trpc.servico as any).updateSubEtapa.mutate({ id: subId, nome: v }) }
    catch (err) { alerts.error('Erro ao renomear sub-etapa', (err as Error).message); void fetchServico() }
  }

  async function excluirSubEtapa(etapaIdx: number, sub: SubEtapa) {
    const qtd = etapas[etapaIdx]?.passos.filter(p => p.subEtapaId === sub.id).length ?? 0
    const ok = await alerts.confirm({
      title: 'Excluir sub-etapa',
      text: qtd > 0
        ? `"${sub.nome}" tem ${qtd} passo${qtd > 1 ? 's' : ''}. Eles NÃO serão apagados: voltam para a etapa, sem sub-etapa.`
        : `Excluir "${sub.nome}"?`,
      icon: 'warning',
      destructive: true,
    })
    if (!ok) return
    try {
      await (trpc.servico as any).deleteSubEtapa.mutate({ id: sub.id })
      setEtapas(prev => prev.map((x, i) => {
        if (i !== etapaIdx) return x
        const subEtapas = x.subEtapas.filter(se => se.id !== sub.id)
        return { ...x, subEtapas, passos: agruparPassos(x.passos.map(p => p.subEtapaId === sub.id ? { ...p, subEtapaId: null } : p), subEtapas) }
      }))
    } catch (err) { alerts.error('Erro ao excluir sub-etapa', (err as Error).message) }
  }

  async function definirSubEtapaDoPasso(etapaIdx: number, passoId: string, subEtapaId: string | null) {
    setEtapas(prev => prev.map((x, i) => i === etapaIdx
      ? { ...x, passos: agruparPassos(x.passos.map(p => p.id === passoId ? { ...p, subEtapaId } : p), x.subEtapas) }
      : x))
    try {
      await (trpc.servico as any).updatePasso.mutate({ id: passoId, data: { subEtapaId } })
      const etapa = etapas[etapaIdx]
      if (etapa) {
        const ids = agruparPassos(etapa.passos.map(p => p.id === passoId ? { ...p, subEtapaId } : p), etapa.subEtapas)
          .map(p => p.id).filter((x): x is string => !!x)
        await reordenarPassos(etapaIdx, ids)
      }
    } catch (err) { alerts.error('Erro ao mover passo', (err as Error).message); void fetchServico() }
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

  // ── Perguntas e condições ("if") ──
  const [alvoCondicao, setAlvoCondicao] = useState<AlvoCondicao | null>(null)
  /** Sequência real (etapas em ordem; dentro, diretos e depois sub-etapas — já agrupado). */
  const sequenciaPassos = etapas.flatMap((et, ei) => et.passos.map(p => ({ p, ei, et })))
  const perguntasPorId = new Map(
    sequenciaPassos
      .map((x, i) => ({ ...x, numero: i + 1 }))
      .filter(x => x.p.id && x.p.tipo === 'PERGUNTA')
      .map(x => [x.p.id!, { id: x.p.id!, texto: x.p.perguntaTexto || x.p.nome, opcoes: x.p.perguntaOpcoes ?? [], numero: x.numero }] as const),
  )
  /** Perguntas que vêm ANTES do alvo — as únicas que podem condicioná-lo (o servidor confere de novo). */
  function perguntasAntesDe(alvo: Pick<AlvoCondicao, 'tipo' | 'id'> | null): PerguntaDisponivel[] {
    if (!alvo) return []
    let limite: (x: { p: Passo; ei: number; et: Etapa }, i: number) => boolean
    if (alvo.tipo === 'etapa') {
      const ei = etapas.findIndex(e => e.id === alvo.id)
      limite = x => x.ei < ei
    } else if (alvo.tipo === 'sub') {
      const ei = etapas.findIndex(e => e.subEtapas.some(se => se.id === alvo.id))
      const ordemSub = etapas[ei]?.subEtapas.find(se => se.id === alvo.id)?.ordem ?? 0
      limite = x => x.ei < ei || (x.ei === ei && (!x.p.subEtapaId || (x.et.subEtapas.find(se => se.id === x.p.subEtapaId)?.ordem ?? 0) < ordemSub))
    } else {
      const pos = sequenciaPassos.findIndex(x => x.p.id === alvo.id)
      limite = (_x, i) => i < pos
    }
    return sequenciaPassos
      .filter((x, i) => limite(x, i) && x.p.id && perguntasPorId.has(x.p.id))
      .map(x => perguntasPorId.get(x.p.id!)!)
  }
  const seloDe = (c: { condicaoPassoId?: string | null; condicaoOpcoes?: string[] }) =>
    textoCondicao({ condicaoPassoId: c.condicaoPassoId ?? null, condicaoOpcoes: c.condicaoOpcoes ?? [] }, perguntasPorId)
  /**
   * A pergunta da condição ficou DEPOIS do item (alguém arrastou)? Nas execuções
   * novas a condição é ignorada — o cadastro avisa no selo (âmbar com ⚠).
   */
  function condicaoForaDeOrdem(alvo: Pick<AlvoCondicao, 'tipo' | 'id'>, condicaoPassoId: string | null | undefined): boolean {
    if (!condicaoPassoId) return false
    return !perguntasAntesDe(alvo).some(q => q.id === condicaoPassoId)
  }
  const condicaoDe = (c: { condicaoPassoId?: string | null; condicaoOpcoes?: string[] }) =>
    ({ condicaoPassoId: c.condicaoPassoId ?? null, condicaoOpcoes: c.condicaoOpcoes ?? [] })
  function abrirCondicaoPasso(p: Passo) {
    if (!p.id) return
    setAlvoCondicao({
      tipo: 'passo', id: p.id, nome: p.nome, condicao: condicaoDe(p),
      pergunta: { tipo: p.tipo ?? 'PASSO', perguntaTexto: p.perguntaTexto ?? null, perguntaOpcoes: p.perguntaOpcoes ?? [], perguntaMultipla: p.perguntaMultipla ?? false },
    })
  }

  const painelPasso = (() => {
    if (painel?.tipo !== 'passo') return null
    for (let ei = 0; ei < etapas.length; ei++) {
      const pi = etapas[ei]!.passos.findIndex(x => x.dndId === painel.dndId)
      if (pi !== -1) return { p: etapas[ei]!.passos[pi]!, pi, ei, et: etapas[ei]! }
    }
    return null
  })()
  const painelEtapa = (() => {
    if (painel?.tipo !== 'etapa') return null
    const ei = etapas.findIndex((et, i) => (et.id ?? (et as unknown as { __draftKey?: string }).__draftKey ?? `__none-${i}`) === painel.key)
    return ei === -1 ? null : { et: etapas[ei]!, ei }
  })()
  const painelSub = (() => {
    if (painel?.tipo !== 'sub') return null
    const ei = etapas.findIndex(et => et.subEtapas.some(se => se.id === painel.subId))
    if (ei === -1) return null
    return { se: etapas[ei]!.subEtapas.find(se => se.id === painel.subId)!, ei, et: etapas[ei]! }
  })()
  function alterarSlaPasso(ei: number, pi: number, p: Passo, v: string) {
    setEtapas(prev => prev.map((x, i) => i === ei
      ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, slaText: v } : pp) }
      : x))
    if (p.id) scheduleSave(`passo-${p.id}-sla`, () => {
      const min = parseSlaMin(v)
      if (v.trim() !== '' && min === null) return Promise.resolve()
      return updatePassoCampo(p.id, 'slaMinutos', min)
    })
  }
  /** Ao sair do campo: normaliza o texto pro formato canônico ("1h 30m"). */
  function normalizarSlaPasso(ei: number, pi: number, v: string) {
    const canonical = formatSlaMin(parseSlaMin(v))
    if (canonical !== v) {
      setEtapas(prev => prev.map((x, i) => i === ei
        ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, slaText: canonical } : pp) }
        : x))
    }
  }

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
            // id ausente = draft (entra direto na etapa, sem sub-etapa)
            dndId,
            subEtapaId: null,
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
      destructive: true,
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
      destructive: true,
    })
    if (!ok) return
    try {
      await (trpc.servico as any).removeEncadeamento.mutate({ id: enc.id })
      await fetchEncadeamentos()
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
        {/* Topo — PADRAO_PAGINAS §1.1 */}
        {/* ══ Barra de página — só título, trilha e ações (padrão /orcamentos) ══ */}
        <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
            <BackButton href="/servicos" title="Voltar para Serviços" />
        </>}>
          <h1 className="truncate">{nome || '—'}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
            <span className="text-muted-foreground/50">›</span>
            <span>Cadastros</span>
            <span className="text-muted-foreground/50">›</span>
            <Link href="/servicos" className="transition-colors hover:text-foreground">Serviços</Link>
          </p>
        </PageHeaderBar>

        {/* ══ Hero — capa em gradiente, identidade e abas na base ══
            Mesmo desenho de /orcamentos/[id] e /clientes/[id]. As badges que
            antes se espremiam sob a trilha (SLA, previsão, prioridade) viraram
            chips de vidro sobre a capa: é onde o olho já procura o estado do
            registro, e a trilha volta a ser só trilha. */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, var(--color-primary) 100%)` }} />
            {/* Feixe de linhas do modelo. Entra ENTRE o gradiente e o véu escuro:
                por cima do véu ele brigaria com o texto branco; por baixo do
                gradiente, não apareceria. As linhas são brancas porque o fundo
                aqui é colorido e escuro nos dois temas — o véu garante isso —,
                e branco é a única cor que se lê sobre os dois. */}
            <FeixeDeLinhas cor="255, 255, 255" intensidade={temaEscuro ? 1.35 : 1} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />

            <div className="relative z-10 px-5 pb-5 pt-24 text-white sm:px-6 sm:pt-28">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <div className="relative shrink-0">
                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-card shadow-lg ring-4 ring-white/50">
                      <ListChecks className="h-10 w-10" style={{ color: PRIMARY }} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-bold tracking-tight text-white drop-shadow">{nome || '—'}</p>
                      {(() => {
                        const cores: Record<string, string> = {
                          BAIXA: 'text-white/80', MEDIA: 'text-sky-200',
                          ALTA: 'text-amber-200', URGENTE: 'text-rose-200',
                        }
                        return (
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ring-white/25 backdrop-blur', cores[prioridade] ?? 'text-white')}>
                            {prioridade}
                          </span>
                        )
                      })()}
                      {categoriaServico === 'MENSAL' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                          <Repeat className="h-3 w-3" /> Mensal
                        </span>
                      )}
                      {categoriaServico === 'FLUXO' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                          <GitBranch className="h-3 w-3" /> Item de fluxo
                        </span>
                      )}
                      {disponivelOrcamento && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                          Em orçamentos
                        </span>
                      )}
                    </div>
                    {/* Meta do registro — área e segmento, o que ele É */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 opacity-80" />
                        {areaNome || 'Sem área'}
                      </span>
                      {segmentoSlug && (
                        <span className="inline-flex items-center gap-1.5">
                          <Type className="h-3.5 w-3.5 opacity-80" />
                          {segmentoSlug}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Números do serviço, à direita — o SLA e a previsão que dele decorre */}
                {/* Tooltip do Radix, não o `title` nativo: a capa tem
                    `overflow-hidden`, e o texto aqui precisa de mais de uma
                    linha para dizer em que régua a conta é feita. */}
                <TooltipProvider delayDuration={200}>
                <div className="flex items-end gap-6 sm:gap-8">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help text-center">
                        <p className="text-lg font-bold tracking-tight text-white drop-shadow">
                          {formatSlaRich(totalServicoMin)}
                        </p>
                        <p className="text-xs text-white/75">SLA total</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[300px]">
                      <p className="font-semibold">Soma do SLA de todos os passos.</p>
                      <p className="mt-1">
                        Contado em <b>horas corridas</b>: 48h são dois dias de calendário, e não
                        seis dias de expediente. É a mesma régua que o sistema usa para o prazo
                        da execução — {totalServicoMin > 0 && `${Math.round(totalServicoMin / 60)}h no total`}.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  {totalServicoMin > 0 && (() => {
                    const previsao = calcularPrevisaoConclusao(totalServicoMin)
                    const dia = previsao.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                    const hora = previsao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help border-l border-white/25 pl-6 text-center">
                            <p className="text-lg font-bold tracking-tight text-white drop-shadow">{dia}</p>
                            <p className="text-xs text-white/75">Previsão · {hora}</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[300px]">
                          <p className="font-semibold">Se a execução começasse agora.</p>
                          <p className="mt-1">
                            Agora mais o SLA total, corrido — 24h por dia, sem pular fim de semana
                            nem feriado. É o mesmo prazo que a execução recebe ao ser criada e que
                            dispara o alerta de atraso.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })()}
                  <div className="border-l border-white/25 pl-6 text-center">
                    <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{etapas.length}</p>
                    <p className="text-xs text-white/75">Etapa{etapas.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Tira de abas na base do hero — botões simples, fora do [role=tablist]
              global (que impõe borda inferior, raio 0 e cores antigas). O estado
              segue no <Tabs value={activeTab}>. */}
          <div className="border-t border-border px-3">
            <div className="nice-scrollbar flex gap-1.5 overflow-x-auto py-2">
              {([
                { value: 'visao', icon: FileText, label: 'Visão geral' },
                { value: 'etapas', icon: ListChecks, label: 'Etapas e passos', badge: etapas.length },
                { value: 'fluxo', icon: GitBranch, label: 'Fluxo' },
                { value: 'encadeamento', icon: History, label: 'Sucessores', badge: encadeamentos.length },
                { value: 'variacoes', icon: Layers, label: 'Variações', badge: variacoes.length },
                { value: 'texto', icon: Type, label: 'Texto padrão' },
                ...(categoriaServico === 'MENSAL' ? [{ value: 'recorrencia', icon: Repeat, label: 'Recorrência' }] : []),
                { value: 'notificacoes', icon: Bell, label: 'Notificações' },
              ] as Array<{ value: AbaServico; icon: typeof FileText; label: string; badge?: number }>).map(t => {
                const Icone = t.icon
                const ativa = activeTab === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setActiveTab(t.value)}
                    aria-current={ativa ? 'page' : undefined}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                      ativa ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icone className="h-4 w-4 shrink-0" />
                    {t.label}
                    {(t.badge ?? 0) > 0 && (
                      <span className={cn(
                        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                        ativa ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                      )}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {/* /hero */}

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
              <div className="w-[180px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto nice-scrollbar">
                <div className="space-y-1">
                  {([
                    { id: 'identificacao' as const, label: 'Identificação', icon: FileText },
                    { id: 'descricao'     as const, label: 'Descrição',     icon: AlignLeft },
                    { id: 'comercial'     as const, label: 'Comercial',     icon: CircleDollarSign },
                    // Atribuição saiu da Identificação e voltou a ter pill própria:
                    // ela tem regra de desempate, quatro fontes e um aviso de
                    // "sem fonte definida" — dentro do bloco de identificação
                    // roubava a atenção de quem só queria trocar o nome.
                    { id: 'responsaveis' as const, label: 'Responsáveis',   icon: Users },
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
                          active ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-white dark:hover:bg-accent hover:text-foreground',
                        )}
                        style={active ? { backgroundColor: PRIMARY } : undefined}
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
                className="flex-1 min-w-0 overflow-y-auto flex flex-col nice-scrollbar"
                style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
              >
                {/* ── PILL: Identificação ───────────────────── */}
                {visaoPill === 'identificacao' && (
                  <div>
                    <div className="px-5 py-3 border-b border-border">
                      <h4 className="text-[13px] font-semibold text-foreground">Identificação</h4>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 md:col-span-5 space-y-1.5">
                          <Label className="text-xs font-medium">Nome *</Label>
                          <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
                        </div>
                        <div className="col-span-12 md:col-span-4 space-y-1.5">
                          <Label className="text-xs font-medium">Área principal</Label>
                          <Select value={areaId || '__none__'} onValueChange={v => setAreaId(v === '__none__' ? '' : v)}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione uma área" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Sem área —</SelectItem>
                              {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
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


                      {/* Tipo de cadastro */}
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Tipo de cadastro</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          {([
                            { v: 'MENSAL' as const, key: 'MENSAL',     label: 'Serviço Recorrente',     desc: 'Serviço que precisa ser executado com uma determinada recorrência', tone: 'sky'    as const, Icon: Repeat },
                            { v: 'EXTRA'  as const, key: 'EXTRA',      label: 'Serviço Extraordinário', desc: 'Pontual — cobrança por execução',                                    tone: 'amber'  as const, Icon: Zap },
                            { v: 'FLUXO'  as const, key: 'FLUXO',      label: 'Parte do Fluxo',         desc: 'Item interno de outro serviço',                                      tone: 'violet' as const, Icon: Network },
                            { v: 'EXTRA'  as const, key: 'INTERNO',    label: 'Serviço Interno',        desc: 'Serviço de execução interna',                                        tone: 'slate'  as const, Icon: Lock },
                            { v: 'MENSAL' as const, key: 'ACESSORIA',  label: 'Obrigação Acessória',  desc: 'Obrigações que são entregues com uma certa recorrência',             tone: 'rose'   as const, Icon: ShieldCheck },
                            // Pergunta persiste em `Servico.tipo`, não em categoria.
                            { v: 'FLUXO'  as const, key: 'PERGUNTA',   label: 'Pergunta',               desc: 'Ponto de decisão que ramifica a cadeia',                             tone: 'fuchsia' as const, Icon: HelpCircle },
                          ]).map(opt => {
                            const active = opt.key === 'PERGUNTA'
                              ? tipoNo === 'PERGUNTA'
                              : tipoNo === 'PERGUNTA'
                                ? false
                                : opt.key === 'INTERNO'
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
                              fuchsia:{ border: 'border-fuchsia-500', bg: 'bg-fuchsia-50/60 dark:bg-fuchsia-950/30', hover: 'hover:border-fuchsia-300', icon: 'text-fuchsia-600 dark:text-fuchsia-300' },
                            }[opt.tone]
                            const Icon = opt.Icon
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => {
                                  if (opt.key === 'PERGUNTA') {
                                    // Pergunta não é vendida nem recorre: sai do
                                    // catálogo e assume a categoria de fluxo, que
                                    // é onde ela de fato vive.
                                    setTipoNo('PERGUNTA')
                                    setEhServicoInterno(false)
                                    setEhObrigacaoAcessoria(false)
                                    setCategoriaServico('FLUXO')
                                    setDisponivelOrcamento(false)
                                  } else if (opt.key === 'INTERNO') {
                                    setTipoNo('ATIVIDADE')
                                    setEhServicoInterno(true)
                                    setEhObrigacaoAcessoria(false)
                                    setCategoriaServico('EXTRA')
                                    setDisponivelOrcamento(false)
                                    setServicoPaiId('')
                                  } else if (opt.key === 'ACESSORIA') {
                                    setTipoNo('ATIVIDADE')
                                    setEhObrigacaoAcessoria(true)
                                    setEhServicoInterno(false)
                                    setCategoriaServico('MENSAL')
                                    setDisponivelOrcamento(false)
                                    setServicoPaiId('')
                                    setHelpdeskTipos([])
                                  } else {
                                    setTipoNo('ATIVIDADE')
                                    setEhServicoInterno(false)
                                    setEhObrigacaoAcessoria(false)
                                    setCategoriaServico(opt.v)
                                    // Deixou de ser interno: os tipos de chamado
                                    // não se aplicam mais.
                                    setHelpdeskTipos([])
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
                        {/* Tipos de chamado atendidos — só para serviço interno,
                            que é o que classifica chamado no HelpDesk. Ao abrir
                            um chamado, escolher o tipo filtra o seletor de
                            serviço por esta lista. Vazio = não aparece em
                            filtro de tipo nenhum. */}
                        {ehServicoInterno && (
                          <div className="pt-2">
                            <Label className="text-[13px] font-semibold mb-1.5 block">
                              Atende quais tipos de chamado?
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {(Object.entries(HELPDESK_TIPO_LABELS) as Array<[string, string]>).map(([valor, rotulo]) => {
                                const marcado = helpdeskTipos.includes(valor)
                                return (
                                  <button
                                    key={valor}
                                    type="button"
                                    onClick={() => setHelpdeskTipos(atual => (
                                      atual.includes(valor) ? atual.filter(t => t !== valor) : [...atual, valor]
                                    ))}
                                    className={cn(
                                      'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                                      marcado
                                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300'
                                        : 'border-border/60 text-muted-foreground hover:border-cyan-300',
                                    )}
                                  >
                                    {rotulo}
                                  </button>
                                )
                              })}
                            </div>
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              {helpdeskTipos.length === 0
                                ? 'Sem tipo marcado, este serviço não aparece no seletor do chamado.'
                                : 'O serviço aparece no seletor quando o chamado for de um destes tipos.'}
                            </p>
                          </div>
                        )}
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

                {/* ── PILL: Responsáveis ───────────────────── */}
                {visaoPill === 'responsaveis' && (
                  <div className="space-y-4 px-5 py-4" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
                    <div className="flex items-center justify-between border-b border-border pb-2 -mx-5 px-5">
                      <h4 className="text-[13px] font-semibold text-foreground">Responsáveis</h4>
                      <Button variant="success" onClick={salvarVisao} disabled={saving} size="sm" className="gap-1.5">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar
                      </Button>
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
                              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0', BADGE.rose)}>
                                ⚠ Sem fonte definida
                              </span>
                            ) : (
                              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0', BADGE.emerald)}>
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
                                    <span key={uid} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', BADGE.sky)}>
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
                                    <span key={aid} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', BADGE.emerald)}>
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
                          <label className="col-span-12 flex items-center gap-2 cursor-pointer select-none rounded-md border bg-card px-3 py-2 hover:bg-muted/40 transition-colors">
                            <Checkbox
                              checked={atribuicaoUsaClienteArea}
                              onCheckedChange={v => setAtribuicaoUsaClienteArea(v === true)}
                              className="cursor-pointer"
                            />
                            <span className="text-[12px] font-medium">Responsável pelo cliente na área</span>
                          </label>
                        </div>
                      </div>
                  </div>
                )}

                {/* ── PILL: Descrição ──────────────────────── */}
                {visaoPill === 'descricao' && (
                  <div>
                    <div className="px-5 py-3 border-b border-border">
                      <h4 className="text-[13px] font-semibold text-foreground">Descrição</h4>
                    </div>
                    <div className="p-5">
                      <Label className="text-xs font-medium mb-1.5 block">Descrição completa</Label>
                      <RichEditor
                        value={descricao}
                        onChange={(html) => setDescricao(html)}
                        placeholder="Descrição usada no orçamento e no contrato — o cliente verá esse texto."
                        className="min-h-[320px]"
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
                    <div className="px-5 py-3 border-b border-border">
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
                        <Switch
                          id="disp-orc"
                          checked={disponivelOrcamento}
                          onCheckedChange={setDisponivelOrcamento}
                          variant="success"
                        />
                        <Label htmlFor="disp-orc" className="text-[13px] font-medium cursor-pointer select-none">
                          Disponibilizar para inclusão em orçamentos
                        </Label>
                      </div>

                      <div className="flex items-start gap-3 pt-2 border-t">
                        <Switch
                          id="entrada-cliente"
                          checked={entradaNovoCliente}
                          onCheckedChange={setEntradaNovoCliente}
                          variant="success"
                          className="mt-0.5"
                        />
                        <Label htmlFor="entrada-cliente" className="text-[13px] font-medium cursor-pointer select-none leading-snug">
                          Serviço de entrada de novo cliente
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            Orçamento aprovado com este serviço conta como contrato assinado no Painel Comercial.
                          </span>
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
                                  {selected && <Check className={cn('h-3 w-3', TEXT.emerald)} />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* ── PILL: Avançado ──────────────────────────── */}
                {visaoPill === 'avancado' && (
                  <div>
                    <div className="px-5 py-3 border-b border-border">
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
                      <div className="col-span-12 border-t border-border -mx-5 mt-2" />
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
                      <div className="col-span-12 border-t border-border -mx-5 mt-2" />
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
                      <div className="col-span-12 border-t border-border -mx-5 mt-2" />
                      <div className="col-span-12 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Comentário padrão</Label>
                        <Textarea
                          value={comentarioPadrao}
                          onChange={(e) => setComentarioPadrao(e.target.value)}
                          placeholder="Texto pré-carregado no campo de comentário do anexo na entrega manual."
                          maxLength={300}
                          rows={2}
                          className="resize-none"
                        />
                        <p className="text-[11px] text-muted-foreground">{comentarioPadrao.length} / 300 caracteres</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PILL: Vencimentos por mês ──────────────── */}
                {visaoPill === 'vencimentosMensais' && (
                  <div>
                    <div className="px-5 py-3 border-b border-border">
                      <h4 className="text-[13px] font-semibold text-foreground">Vencimentos por mês</h4>
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <p className="text-[12px] text-muted-foreground flex-1 min-w-[260px]">
                          Quando preenchido, o vencimento do mês <strong>sobrescreve</strong> a regra padrão de
                          Recorrência. Deixe "Não tem" pra usar o padrão.
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
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
                      <div className={cn('rounded border p-3 text-[11px] text-sky-900 dark:text-sky-300', SURFACE.sky)}>
                        <strong>Encoding:</strong> 0 = "Não tem" · 1-31 = Dia fixo · 51-70 = 1º a 20º dia útil · 90 = Último dia útil.
                        Espelha exatamente os campos <code>ObrD01..ObrD12</code> do Acessórias.
                      </div>
                    </div>
                  </div>
                )}

                {/* Rodapé fixo com botão Salvar — vale pra qualquer pill */}
                <div className="mt-auto border-t border-border px-5 py-3 bg-card flex justify-end">
                  <Button variant="success" onClick={salvarVisao} disabled={saving} className="gap-1.5">
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
          {/* Árvore de etapas → sub-etapas → passos, como um explorador de arquivos
              (07/10/2026). Linhas compactas; o detalhe de cada item (SLA, condição,
              materiais, e-mails, lembretes, campos) abre no painel lateral. */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Etapas e passos do template</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Checklist replicado a cada execução. Clique num item para configurá-lo; arraste pela alça para reordenar.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {etapas.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => (tudoRecolhido ? expandirTudoArvore() : recolherTudoArvore())}
                      className="gap-1.5 text-xs text-muted-foreground"
                    >
                      {tudoRecolhido
                        ? <><ChevronDown className="h-3.5 w-3.5" /> Expandir tudo</>
                        : <><ChevronRight className="h-3.5 w-3.5" /> Recolher tudo</>}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={addEtapa} className="gap-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Adicionar etapa
                  </Button>
                </div>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEtapasDragEnd}>
                <SortableContext items={etapas.map(et => et.id || '__none')} strategy={verticalListSortingStrategy}>
                  <div className="rounded-lg border border-border py-1">
                    {etapas.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6 italic">
                        Nenhuma etapa cadastrada. Clique em &quot;Adicionar etapa&quot; para começar.
                      </p>
                    )}
                    {etapas.map((et, ei) => {
                      const draftKey = (et as unknown as { __draftKey?: string }).__draftKey
                      const sortKey = et.id ?? draftKey ?? `__none-${ei}`
                      const collapsed = collapsedEtapas.has(sortKey)
                      const seloEtapa = et.id ? seloDe(et) : null
                      const trilhos = countTrilhos(computePassoLayers(et.passos))
                      const flat = itensArrastaveis(et.passos, et.subEtapas)
                      // Passos de sub-etapa recolhida saem da lista visível (o
                      // handler de arraste continua usando a lista completa).
                      const visiveis = flat.filter(x => {
                        if (x.startsWith(GRP)) return true
                        const pp = et.passos.find(q => q.dndId === x)
                        return !(pp?.subEtapaId && collapsedSubs.has(pp.subEtapaId))
                      })
                      const selecionadaEtapa = painel?.tipo === 'etapa' && painel.key === sortKey
                      return (
                        <SortableEtapa key={sortKey} id={sortKey}>
                          {/* ── Linha da etapa (pasta) ── */}
                          <div
                            className={cn(
                              'group/linha flex items-start gap-1 rounded-md px-1.5 py-1 hover:bg-muted/50',
                              selecionadaEtapa && 'bg-primary/10 hover:bg-primary/10',
                            )}
                          >
                            <span className="mt-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100"><SortableEtapaHandle /></span>
                            <button
                              type="button"
                              onClick={() => toggleEtapaCollapse(sortKey)}
                              className="mt-0.5 inline-flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                              title={collapsed ? 'Abrir etapa' : 'Fechar etapa'}
                              aria-expanded={!collapsed}
                            >
                              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-150', !collapsed && 'rotate-90')} />
                            </button>
                            {collapsed
                              ? <Folder className={cn('mt-1 h-4 w-4 shrink-0', TEXT.amber)} />
                              : <FolderOpen className={cn('mt-1 h-4 w-4 shrink-0', TEXT.amber)} />}
                            <span className="mt-1 w-5 shrink-0 text-right text-[11px] font-bold tabular-nums text-muted-foreground">{ei + 1}.</span>
                            <div className="relative min-w-0 flex-1">
                              <NomeInline
                                ref={el => {
                                  const key = et.id ?? draftKey
                                  if (!key) return
                                  if (el) etapaInputRefs.current.set(key, el)
                                  else etapaInputRefs.current.delete(key)
                                }}
                                value={et.nome}
                                forte
                                ariaLabel="Nome da etapa"
                                placeholder={et.id ? 'Nome da etapa' : 'Digite o nome (vazio = descartar)'}
                                onChange={v => {
                                  setEtapas(prev => prev.map((x, i) => i === ei ? { ...x, nome: v } : x))
                                  if (et.id) scheduleSave(`etapa-${et.id}-nome`, () => updateEtapaNome(et.id, v))
                                }}
                                onBlur={v => { if (!et.id && draftKey) void flushEtapaDraft(draftKey, v) }}
                              />
                              {et.id && savingKeys.has(`etapa-${et.id}-nome`) && (
                                <Loader2 className="absolute right-1 top-1.5 h-3 w-3 animate-spin text-muted-foreground" />
                              )}
                            </div>
                            {/* Etiquetas curtas da etapa */}
                            <div className="mt-0.5 flex shrink-0 flex-wrap items-center justify-end gap-1">
                              {seloEtapa && (
                                <SeloCondicaoCadastro texto={seloEtapa} foraDeOrdem={condicaoForaDeOrdem({ tipo: 'etapa', id: et.id! }, et.condicaoPassoId)} onClick={() => setAlvoCondicao({ tipo: 'etapa', id: et.id!, nome: et.nome, condicao: condicaoDe(et) })} className="h-6 max-w-[200px] text-[10.5px]" />
                              )}
                              {trilhos > 1 && (
                                <span className={cn('inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[10.5px] font-medium', BADGE.emerald)} title={`${trilhos} trilhos paralelos — passos no mesmo trilho rodam simultaneamente`}>
                                  <GitBranch className="h-3 w-3" />{trilhos}
                                </span>
                              )}
                              <span className="inline-flex h-6 items-center gap-1 px-1 text-[10.5px] tabular-nums text-muted-foreground" title={`${et.passos.length} passo(s)`}>
                                <ListChecks className="h-3 w-3" />{et.passos.length}
                              </span>
                              <span className="inline-flex h-6 items-center gap-1 px-1 text-[10.5px] tabular-nums text-muted-foreground" title="SLA da etapa = soma dos passos (jornada 8h/dia × 5 dias/sem)">
                                <Clock className="h-3 w-3" />{formatSlaRich(calcEtapaMinutos(et)) || '—'}
                              </span>
                            </div>
                            {/* Ações: aparecem ao passar o mouse */}
                            <div className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/linha:opacity-100">
                              {et.id && (
                                <>
                                  <Button variant="ghost" size="icon-xs" className="h-6 w-6" onClick={() => { if (collapsed) toggleEtapaCollapse(sortKey); addPasso(et) }} title="Adicionar passo">
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon-xs" className="h-6 w-6" onClick={() => { void addSubEtapa(ei) }} title="Adicionar sub-etapa">
                                    <FolderPlus className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon-xs" className="h-6 w-6" onClick={() => setPainel({ tipo: 'etapa', key: sortKey })} title="Configurar etapa (condição, materiais)">
                                    <Settings2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-destructive" onClick={() => removeEtapa(et.id)} title="Remover etapa">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* ── Conteúdo da etapa (sub-etapas e passos), com linha-guia ── */}
                          {!collapsed && (
                            <div className="ml-[26px] border-l border-border pl-1.5">
                              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => handlePassosDragEnd(ei, ev)}>
                                <SortableContext items={visiveis} strategy={verticalListSortingStrategy}>
                                  {visiveis.map(item => {
                                    if (item.startsWith(GRP)) {
                                      const direto = item === GRP_DIRETO
                                      const subId = direto ? null : item.slice(GRP.length)
                                      const se = subId ? et.subEtapas.find(x => x.id === subId) : undefined
                                      return (
                                        <SortableGrupo
                                          key={item}
                                          id={item}
                                          nome={direto ? 'Direto na etapa' : (se?.nome ?? 'Sub-etapa')}
                                          qtd={et.passos.filter(pp => (direto ? !pp.subEtapaId : pp.subEtapaId === subId)).length}
                                          fixo={direto}
                                          recolhida={!!subId && collapsedSubs.has(subId)}
                                          selecionada={!!subId && painel?.tipo === 'sub' && painel.subId === subId}
                                          selo={se ? seloDe(se) : null}
                                          seloForaDeOrdem={se ? condicaoForaDeOrdem({ tipo: 'sub', id: se.id }, se.condicaoPassoId) : false}
                                          onAlternar={subId ? () => alternarSub(subId) : undefined}
                                          onRenomear={se ? (v => { void renomearSubEtapa(ei, se.id, v) }) : undefined}
                                          onConfigurar={se ? () => setPainel({ tipo: 'sub', subId: se.id }) : undefined}
                                          onCondicao={se ? () => setAlvoCondicao({ tipo: 'sub', id: se.id, nome: se.nome, condicao: condicaoDe(se) }) : undefined}
                                          onExcluir={se ? () => { void excluirSubEtapa(ei, se) } : undefined}
                                        />
                                      )
                                    }
                                    const pi = et.passos.findIndex(q => q.dndId === item)
                                    const p = et.passos[pi]
                                    if (!p) return null
                                    const dentroDeSub = !!p.subEtapaId && et.subEtapas.length > 0
                                    const seloPasso = p.id ? seloDe(p) : null
                                    const notas = (p.materiais ?? []).filter(m => m.tipo === 'NOTA').length
                                    const links = (p.materiais ?? []).filter(m => m.tipo === 'LINK').length
                                    const arquivos = (p.materiais ?? []).filter(m => m.tipo === 'ARQUIVO').length
                                    const selecionado = painel?.tipo === 'passo' && painel.dndId === p.dndId
                                    const abrirPainel = (extra?: () => void) => { if (p.id) { setPainel({ tipo: 'passo', dndId: p.dndId }); extra?.() } }
                                    const contador = (n: number, Icone: typeof Mail, titulo: string, onClick: () => void) => n > 0 && (
                                      <button
                                        type="button"
                                        onClick={onClick}
                                        className="inline-flex h-5 items-center gap-0.5 rounded px-1 text-[10px] tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title={`${titulo} · ${n}`}
                                      >
                                        <Icone className="h-3 w-3" />{n}
                                      </button>
                                    )
                                    return (
                                      <div key={p.dndId} data-passo={p.dndId} className={cn(dentroDeSub && 'ml-[22px] border-l border-border pl-1.5')}>
                                        <SortablePasso id={p.dndId} exiting={!!p.id && exitingPassoIds.has(p.id)} selecionado={selecionado}>
                                          <span className="mt-1 w-6 shrink-0 text-right"><SortablePassoHandle numero={pi + 1} /></span>
                                          {p.tipo === 'PERGUNTA'
                                            ? <HelpCircle className={cn('mt-1 h-4 w-4 shrink-0', TEXT.violet)} />
                                            : <CheckSquare className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
                                          <div className="relative min-w-0 flex-1">
                                            <NomeInline
                                              ref={el => {
                                                if (el) passoInputRefs.current.set(p.dndId, el)
                                                else passoInputRefs.current.delete(p.dndId)
                                              }}
                                              value={p.nome}
                                              ariaLabel="Nome do passo"
                                              placeholder={p.id ? 'Descrição do passo' : 'Digite o nome (vazio = descartar)'}
                                              onChange={v => {
                                                setEtapas(prev => prev.map((x, i) => i === ei
                                                  ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, nome: v } : pp) }
                                                  : x))
                                                if (p.id) scheduleSave(`passo-${p.id}-nome`, () => updatePassoCampo(p.id, 'nome', v))
                                              }}
                                              onBlur={v => {
                                                // Draft (sem id) → persiste se tem texto, descarta se vazio
                                                if (!p.id && et.id) void flushPassoDraft(et.id, p.dndId, v, pi, p.obrigatorio, p.permiteIgnorar, p.slaText)
                                              }}
                                            />
                                            {p.id && savingKeys.has(`passo-${p.id}-nome`) && (
                                              <Loader2 className="absolute right-1 top-1.5 h-3 w-3 animate-spin text-muted-foreground" />
                                            )}
                                          </div>
                                          {/* Etiquetas curtas */}
                                          <div className="mt-0.5 flex shrink-0 flex-wrap items-center justify-end gap-0.5">
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
                                                className={cn('inline-flex h-5 items-center gap-0.5 rounded border px-1 text-[10px] font-medium', p.obrigatorio ? BADGE.rose : BADGE.emerald)}
                                                title={p.obrigatorio ? 'Obrigatório — clique para tornar opcional' : 'Opcional — clique para tornar obrigatório'}
                                              >
                                                {p.obrigatorio ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                                                {p.obrigatorio ? 'Obrig.' : 'Opc.'}
                                              </button>
                                            )}
                                            {p.slaText && (
                                              <span className="inline-flex h-5 items-center gap-0.5 px-1 text-[10px] tabular-nums text-muted-foreground" title="SLA do passo">
                                                <Clock className="h-3 w-3" />{p.slaText}
                                              </span>
                                            )}
                                            {p.tipo === 'PERGUNTA' && (
                                              <button type="button" onClick={() => abrirCondicaoPasso(p)} className={cn('inline-flex h-5 items-center gap-0.5 rounded border px-1 text-[10px] font-medium', BADGE.violet)} title={`Pergunta: ${p.perguntaTexto ?? ''} — ${(p.perguntaOpcoes ?? []).join(' / ')}${p.perguntaMultipla ? ' (várias respostas)' : ''}`}>
                                                Pergunta · {(p.perguntaOpcoes ?? []).length}
                                              </button>
                                            )}
                                            {seloPasso && (
                                              <SeloCondicaoCadastro texto={seloPasso} foraDeOrdem={!!p.id && condicaoForaDeOrdem({ tipo: 'passo', id: p.id }, p.condicaoPassoId)} onClick={() => abrirCondicaoPasso(p)} className="h-5 max-w-[180px] text-[10px]" />
                                            )}
                                            {contador(notas, StickyNote, 'Notas / instruções', () => abrirPainel(() => setOpenMateriaisPasso({ passoId: p.id!, tipo: 'NOTA' })))}
                                            {contador(links, LinkIcon, 'Links externos', () => abrirPainel(() => setOpenMateriaisPasso({ passoId: p.id!, tipo: 'LINK' })))}
                                            {contador(arquivos, Paperclip, 'Arquivos', () => abrirPainel(() => setOpenMateriaisPasso({ passoId: p.id!, tipo: 'ARQUIVO' })))}
                                            {contador(p.emailsCount ?? 0, Mail, 'E-mails de conclusão', () => abrirPainel(() => setOpenEmailsPasso(p.id!)))}
                                            {contador(p.lembretesCount ?? 0, Bell, 'Lembretes na agenda', () => abrirPainel(() => setOpenLembretesPasso(p.id!)))}
                                            {contador(p.camposClienteCount ?? 0, Database, 'Campos do cliente', () => abrirPainel(() => setOpenCamposClientePasso(p.id!)))}
                                          </div>
                                          <div className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/linha:opacity-100">
                                            {p.id && (
                                              <Button variant="ghost" size="icon-xs" className="h-6 w-6" onClick={() => abrirPainel()} title="Configurar passo (SLA, condição, materiais, e-mails, lembretes, campos)">
                                                <Settings2 className="h-3.5 w-3.5" />
                                              </Button>
                                            )}
                                            <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-destructive" onClick={() => removePasso(p.id)} title="Remover passo">
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </SortablePasso>
                                      </div>
                                    )
                                  })}
                                </SortableContext>
                              </DndContext>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => addPasso(et)}
                                className="ml-7 h-6 gap-1 text-[11px] text-muted-foreground"
                                disabled={!et.id}
                              >
                                <Plus className="h-3 w-3" /> Adicionar passo
                              </Button>
                            </div>
                          )}
                        </SortableEtapa>
                      )
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          {/* ── Painel lateral de configuração do item selecionado ── */}
          <Sheet open={!!painel} onOpenChange={o => { if (!o) setPainel(null) }}>
            <SheetContent side="right" size="md" className="w-full sm:max-w-[460px]">
              {painelPasso && (() => {
                const { p, pi, ei, et } = painelPasso
                return (
                  <>
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2 text-[15px]">
                        {p.tipo === 'PERGUNTA' ? <HelpCircle className={cn('h-4 w-4', TEXT.violet)} /> : <CheckSquare className="h-4 w-4 text-muted-foreground" />}
                        Passo {sequenciaPassos.findIndex(x => x.p.dndId === p.dndId) + 1}
                      </SheetTitle>
                      <SheetDescription className="text-[11px]">{et.nome || 'Etapa'}{p.subEtapaId ? ` › ${et.subEtapas.find(s => s.id === p.subEtapaId)?.nome ?? ''}` : ''}</SheetDescription>
                    </SheetHeader>
                    <SheetBody className="nice-scrollbar space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Nome</Label>
                        <Textarea
                          value={p.nome}
                          rows={2}
                          onChange={e => {
                            const v = e.target.value
                            setEtapas(prev => prev.map((x, i) => i === ei ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, nome: v } : pp) } : x))
                            if (p.id) scheduleSave(`passo-${p.id}-nome`, () => updatePassoCampo(p.id, 'nome', v))
                          }}
                          className="text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold">SLA</Label>
                          <Input
                            value={p.slaText}
                            onChange={e => alterarSlaPasso(ei, pi, p, e.target.value)}
                            onBlur={e => normalizarSlaPasso(ei, pi, e.target.value)}
                            placeholder="1h 30m"
                            title="Formato aceito: 1h 30m, 45m, 2h, 1.5h ou 90 (minutos)"
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold">Obrigatório</Label>
                          <div className="flex h-9 items-center gap-2">
                            <Switch
                              checked={p.obrigatorio}
                              onCheckedChange={v => {
                                setEtapas(prev => prev.map((x, i) => i === ei ? { ...x, passos: x.passos.map((pp, j) => j === pi ? { ...pp, obrigatorio: v } : pp) } : x))
                                if (p.id) void updatePassoCampo(p.id, 'obrigatorio', v)
                              }}
                            />
                            <span className="text-xs text-muted-foreground">{p.obrigatorio ? 'Trava os passos seguintes' : 'Opcional'}</span>
                          </div>
                        </div>
                      </div>
                      {et.subEtapas.length > 0 && p.id && (
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold">Sub-etapa</Label>
                          <select
                            value={p.subEtapaId ?? ''}
                            onChange={e => { void definirSubEtapaDoPasso(ei, p.id!, e.target.value || null) }}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                          >
                            <option value="">Direto na etapa</option>
                            {et.subEtapas.slice().sort((a, b) => a.ordem - b.ordem).map(se => (
                              <option key={se.id} value={se.id}>{se.nome}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Pergunta e condição</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          {p.tipo === 'PERGUNTA' && (
                            <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium', BADGE.violet)}>
                              <HelpCircle className="h-3 w-3" /> {p.perguntaTexto || 'Pergunta'} · {(p.perguntaOpcoes ?? []).join(' / ')}
                            </span>
                          )}
                          {seloDe(p) && <SeloCondicaoCadastro texto={seloDe(p)!} foraDeOrdem={!!p.id && condicaoForaDeOrdem({ tipo: 'passo', id: p.id }, p.condicaoPassoId)} onClick={() => abrirCondicaoPasso(p)} className="h-6 text-[11px]" />}
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => abrirCondicaoPasso(p)}>
                            <GitBranch className="h-3.5 w-3.5" /> {p.tipo === 'PERGUNTA' || seloDe(p) ? 'Editar' : 'Definir pergunta ou condição'}
                          </Button>
                        </div>
                      </div>
                      {p.id && (
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold">Ao concluir o passo</Label>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpenEmailsPasso(p.id!)}>
                              <Mail className={cn('h-3.5 w-3.5', TEXT.indigo)} /> E-mails ({p.emailsCount ?? 0})
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpenLembretesPasso(p.id!)}>
                              <Bell className={cn('h-3.5 w-3.5', TEXT.amber)} /> Lembretes ({p.lembretesCount ?? 0})
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpenCamposClientePasso(p.id!)}>
                              <Database className={cn('h-3.5 w-3.5', TEXT.sky)} /> Campos do cliente ({p.camposClienteCount ?? 0})
                            </Button>
                          </div>
                        </div>
                      )}
                      {p.id && (
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold">Materiais de apoio</Label>
                          <MateriaisSection
                            materiais={p.materiais ?? []}
                            passoId={p.id}
                            density="compact"
                            openListTipo={openMateriaisPasso?.passoId === p.id ? openMateriaisPasso.tipo : null}
                            onCloseList={() => setOpenMateriaisPasso(null)}
                            onChange={() => { void fetchServico() }}
                          />
                        </div>
                      )}
                      {/* Dialogs do passo (controlados) */}
                      {p.id && (
                        <>
                          <PassoEmailsSection
                            passoId={p.id}
                            density="compact"
                            inline
                            controlled={{ open: openEmailsPasso === p.id, onOpenChange: (o) => setOpenEmailsPasso(o ? p.id! : null), hideTrigger: true }}
                            onCountChange={(count) => setEtapas(prev => prev.map(x => ({ ...x, passos: x.passos.map(pp => pp.id === p.id ? { ...pp, emailsCount: count } : pp) })))}
                          />
                          <PassoLembretesSection
                            passoId={p.id}
                            controlled={{ open: openLembretesPasso === p.id, onOpenChange: (o) => setOpenLembretesPasso(o ? p.id! : null) }}
                            onCountChange={(count) => setEtapas(prev => prev.map(x => ({ ...x, passos: x.passos.map(pp => pp.id === p.id ? { ...pp, lembretesCount: count } : pp) })))}
                          />
                          <PassoCamposClienteSection
                            passoId={p.id}
                            controlled={{ open: openCamposClientePasso === p.id, onOpenChange: (o) => setOpenCamposClientePasso(o ? p.id! : null) }}
                            onCountChange={(count) => setEtapas(prev => prev.map(x => ({ ...x, passos: x.passos.map(pp => pp.id === p.id ? { ...pp, camposClienteCount: count } : pp) })))}
                          />
                        </>
                      )}
                    </SheetBody>
                    <SheetFooter>
                      <Button variant="outline" size="sm" className="gap-1.5 text-destructive sm:mr-auto" onClick={() => { const id = p.id; setPainel(null); removePasso(id) }}>
                        <Trash2 className="h-3.5 w-3.5" /> Remover passo
                      </Button>
                      <Button size="sm" onClick={() => setPainel(null)}>Fechar</Button>
                    </SheetFooter>
                  </>
                )
              })()}

              {painelEtapa && (() => {
                const { et, ei } = painelEtapa
                return (
                  <>
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2 text-[15px]"><FolderOpen className={cn('h-4 w-4', TEXT.amber)} /> Etapa {ei + 1}</SheetTitle>
                      <SheetDescription className="text-[11px]">{et.passos.length} passo(s) · SLA {formatSlaRich(calcEtapaMinutos(et)) || '—'}</SheetDescription>
                    </SheetHeader>
                    <SheetBody className="nice-scrollbar space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Nome</Label>
                        <Input
                          value={et.nome}
                          onChange={e => {
                            const v = e.target.value
                            setEtapas(prev => prev.map((x, i) => i === ei ? { ...x, nome: v } : x))
                            if (et.id) scheduleSave(`etapa-${et.id}-nome`, () => updateEtapaNome(et.id, v))
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      {et.id && (
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold">Condição</Label>
                          <div className="flex flex-wrap items-center gap-2">
                            {seloDe(et) && <SeloCondicaoCadastro texto={seloDe(et)!} foraDeOrdem={!!et.id && condicaoForaDeOrdem({ tipo: 'etapa', id: et.id }, et.condicaoPassoId)} onClick={() => setAlvoCondicao({ tipo: 'etapa', id: et.id!, nome: et.nome, condicao: condicaoDe(et) })} className="h-6 text-[11px]" />}
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAlvoCondicao({ tipo: 'etapa', id: et.id!, nome: et.nome, condicao: condicaoDe(et) })}>
                              <GitBranch className="h-3.5 w-3.5" /> {seloDe(et) ? 'Editar condição' : 'Definir condição'}
                            </Button>
                          </div>
                        </div>
                      )}
                      {et.id && (
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-semibold">Materiais de apoio</Label>
                          <MateriaisSection materiais={et.materiais ?? []} etapaId={et.id} onChange={() => { void fetchServico() }} />
                        </div>
                      )}
                    </SheetBody>
                    <SheetFooter>
                      <Button variant="outline" size="sm" className="gap-1.5 text-destructive sm:mr-auto" onClick={() => { const id = et.id; setPainel(null); removeEtapa(id) }}>
                        <Trash2 className="h-3.5 w-3.5" /> Remover etapa
                      </Button>
                      <Button size="sm" onClick={() => setPainel(null)}>Fechar</Button>
                    </SheetFooter>
                  </>
                )
              })()}

              {painelSub && (() => {
                const { se, ei, et } = painelSub
                return (
                  <>
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2 text-[15px]"><Layers className={cn('h-4 w-4', TEXT.sky)} /> Sub-etapa</SheetTitle>
                      <SheetDescription className="text-[11px]">{et.nome || 'Etapa'} · {et.passos.filter(x => x.subEtapaId === se.id).length} passo(s)</SheetDescription>
                    </SheetHeader>
                    <SheetBody className="nice-scrollbar space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Nome</Label>
                        <Input key={se.id} defaultValue={se.nome} onBlur={e => { void renomearSubEtapa(ei, se.id, e.target.value) }} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Condição</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          {seloDe(se) && <SeloCondicaoCadastro texto={seloDe(se)!} foraDeOrdem={condicaoForaDeOrdem({ tipo: 'sub', id: se.id }, se.condicaoPassoId)} onClick={() => setAlvoCondicao({ tipo: 'sub', id: se.id, nome: se.nome, condicao: condicaoDe(se) })} className="h-6 text-[11px]" />}
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAlvoCondicao({ tipo: 'sub', id: se.id, nome: se.nome, condicao: condicaoDe(se) })}>
                            <GitBranch className="h-3.5 w-3.5" /> {seloDe(se) ? 'Editar condição' : 'Definir condição'}
                          </Button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Para colocar passos nesta sub-etapa, arraste-os para baixo do título dela na árvore ou escolha a sub-etapa no painel do passo.</p>
                    </SheetBody>
                    <SheetFooter>
                      <Button variant="outline" size="sm" className="gap-1.5 text-destructive sm:mr-auto" onClick={() => { setPainel(null); void excluirSubEtapa(ei, se) }}>
                        <Trash2 className="h-3.5 w-3.5" /> Excluir sub-etapa
                      </Button>
                      <Button size="sm" onClick={() => setPainel(null)}>Fechar</Button>
                    </SheetFooter>
                  </>
                )
              })()}
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* ── TAB: Fluxo (DAG) ── */}
        <TabsContent value="fluxo" className="mt-4">
          {/* Fluxo DO PRÓPRIO serviço. A cadeia completa (sucessores, perguntas,
              blocos) fica em /servicos/[id]/cadeia — ⋮ do /servicos, só em
              serviços que são início de cadeia. */}
          <Card>
            <CardContent className="p-4">
              <FluxoDoServico
                etapas={etapas}
                onEditarEtapas={() => setActiveTab('etapas')}
                onEditarPasso={irParaPasso}
              />
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
                      <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary-on-surface">
                        {enc.ordem + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => router.push(`/servicos/${enc.servicoDestinoId}`)}
                            className="text-sm font-semibold truncate hover:text-primary-on-surface hover:underline text-left"
                          >
                            {enc.servicoDestino.nome}
                          </button>
                          {enc.iniciaAuto && enc.obrigatorio && (
                            <Badge variant="outline" className={cn('text-[10px] h-5', BADGE.emerald)}>
                              <Play className="h-2.5 w-2.5 mr-0.5" /> Auto
                            </Badge>
                          )}
                          {!enc.iniciaAuto && (
                            <Badge variant="outline" className={cn('text-[10px] h-5', BADGE.amber)}>
                              <Pause className="h-2.5 w-2.5 mr-0.5" /> Manual
                            </Badge>
                          )}
                          {!enc.obrigatorio && (
                            <Badge variant="outline" className={cn('text-[10px] h-5', BADGE.sky)}>
                              Opcional
                            </Badge>
                          )}
                          {enc.herdaResponsavel && <Badge variant="outline" className="text-[10px] h-5">Herda resp.</Badge>}
                          {enc.condicao != null && (
                            <Badge variant="outline" className={cn('text-[10px] h-5', BADGE.violet)}>
                              <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Condicional
                            </Badge>
                          )}
                        </div>
                        {enc.observacao && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">{enc.observacao}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
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

        {/* ── TAB: Variações ── */}
        <TabsContent value="variacoes" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Variações</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Título, descrição e valor oferecidos ao lançar este serviço num orçamento —
                    &quot;Plano Básico&quot;, &quot;Plano Completo&quot;. Sem variação, o serviço entra com o
                    texto e o valor padrão dele.
                  </p>
                </div>
                <Button variant="success" onClick={abrirNovaVariacao} size="sm" className="gap-1.5 shrink-0">
                  <Plus className="h-3.5 w-3.5" /> Nova variação
                </Button>
              </div>

              {variacoes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-8 text-center">
                  Nenhuma variação cadastrada.
                </p>
              ) : (
                <>
                  {/* A busca só aparece quando há o que procurar — um campo de
                      filtro sobre três linhas é ruído. */}
                  {variacoes.length > 5 && (
                    <div className="relative max-w-sm">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={varBusca} onChange={e => setVarBusca(e.target.value)}
                        placeholder="Filtrar por título..." className="h-9 pl-8 text-sm" />
                    </div>
                  )}

                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs font-semibold uppercase tracking-wider">Título</TableHead>
                          <TableHead className="w-[140px] text-right text-xs font-semibold uppercase tracking-wider">Valor</TableHead>
                          <TableHead className="w-[90px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variacoesFiltradas.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-sm text-muted-foreground italic">
                              Nenhuma variação com esse título.
                            </TableCell>
                          </TableRow>
                        ) : variacoesFiltradas.map(v => (
                          <TableRow key={v.id} className="cursor-pointer" onClick={() => abrirEditarVariacao(v)}>
                            <TableCell className="text-[13px] truncate" title={v.titulo}>{v.titulo}</TableCell>
                            <TableCell className="text-[13px] text-right tabular-nums">
                              {v.valor != null
                                ? `R$ ${Number(v.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : <span className="text-muted-foreground">usa o do serviço</span>}
                            </TableCell>
                            {/* O clique da linha abre a edição — o da coluna de
                                ações não pode abrir junto. */}
                            <TableCell onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1 justify-end">
                                <Button variant="soft-info" size="icon-sm" onClick={() => abrirEditarVariacao(v)}>
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="soft-destructive" size="icon-sm" onClick={() => excluirVariacao(v)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
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
                <Button variant="success" onClick={salvarVisao} disabled={saving} size="sm" className="gap-1.5 shrink-0">
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
      {/* Pergunta (tipo do passo) e condição "if" de etapa / sub-etapa / passo */}
      <PerguntaCondicaoDialog
        alvo={alvoCondicao}
        perguntas={perguntasAntesDe(alvoCondicao)}
        onOpenChange={v => { if (!v) setAlvoCondicao(null) }}
        onSalvo={() => { void fetchServico() }}
      />

      <Dialog open={encModalOpen} onOpenChange={setEncModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeaderIcon icon={Network} color={editingEnc ? 'sky' : 'emerald'}>
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
                <Checkbox id="enc-auto" checked={encIniciaAuto} onCheckedChange={v => setEncIniciaAuto(v === true)} />
                <Label htmlFor="enc-auto" className="text-xs font-medium">Inicia automaticamente</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="enc-obr" checked={encObrigatorio} onCheckedChange={v => setEncObrigatorio(v === true)} />
                <Label htmlFor="enc-obr" className="text-xs font-medium">Obrigatório (não pode ser pulado)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="enc-herda" checked={encHerdaResponsavel} onCheckedChange={v => setEncHerdaResponsavel(v === true)} />
                <Label htmlFor="enc-herda" className="text-xs font-medium">Herda responsável do anterior</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Observação</Label>
              <Textarea
                value={encObservacao}
                onChange={e => setEncObservacao(e.target.value)}
                rows={2}
                className="text-xs resize-y"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncModalOpen(false)} disabled={encSaving}>Cancelar</Button>
            <Button onClick={salvarEncadeamento} disabled={encSaving} className="gap-1.5" variant="success">
              {encSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingEnc ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal da variação */}
      <Dialog open={varModalOpen} onOpenChange={o => { if (!o && !varSalvando) setVarModalOpen(false) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Layers} color={varEditando ? 'sky' : 'emerald'}>
            <DialogTitle>{varEditando ? 'Editar variação' : 'Nova variação'}</DialogTitle>
            <DialogDescription>
              O que aparece para quem lança este serviço num orçamento.
            </DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-8 space-y-1.5">
                <Label className="text-[13px] font-semibold">Título *</Label>
                <Input value={varTitulo} onChange={e => setVarTitulo(e.target.value)}
                  placeholder="Ex.: Plano Básico" className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Valor R$</Label>
                <Input type="number" step="0.01" min="0" value={varValor}
                  onChange={e => setVarValor(e.target.value)}
                  placeholder="usa o do serviço" className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <RichEditor value={varDescricao} onChange={setVarDescricao} />
              <p className="text-[11px] text-muted-foreground">
                Vira o texto do item na proposta enviada ao cliente.
              </p>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setVarModalOpen(false)} disabled={varSalvando}>
              Cancelar
            </Button>
            <Button variant="success" onClick={salvarVariacao} disabled={varSalvando} size="sm" className="gap-1.5">
              {varSalvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
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

/**
 * Linha de sub-etapa na árvore (subpasta). Arrastar pela alça move a sub-etapa
 * com os passos; soltar um passo sobre ela coloca o passo no grupo (também
 * quando está vazia). "Direto na etapa" (`fixo`) é só alvo — não se arrasta e
 * só aparece quando a etapa tem sub-etapas.
 */
function SortableGrupo({ id, nome, qtd, fixo, recolhida, selecionada, selo, seloForaDeOrdem, onAlternar, onRenomear, onConfigurar, onCondicao, onExcluir }: {
  seloForaDeOrdem?: boolean
  id: string; nome: string; qtd: number; fixo?: boolean; recolhida?: boolean; selecionada?: boolean; selo?: string | null
  onAlternar?: () => void; onRenomear?: (v: string) => void; onConfigurar?: () => void; onCondicao?: () => void; onExcluir?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id, disabled: fixo ? { draggable: true } : undefined,
  })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  if (fixo) {
    return (
      <div ref={setNodeRef} style={style} className={cn('flex items-center gap-1.5 rounded px-1.5 py-0.5 pl-8 text-[11px] text-muted-foreground', isOver && 'bg-muted/60')}>
        <span className="italic">Direto na etapa</span>
        <span className="tabular-nums text-muted-foreground/70">· {qtd}</span>
      </div>
    )
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/linha flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted/50',
        isOver && 'bg-muted/60',
        selecionada && 'bg-primary/10 hover:bg-primary/10',
      )}
    >
      <button
        type="button"
        {...(attributes as unknown as React.HTMLAttributes<HTMLButtonElement>)}
        {...(listeners as unknown as React.HTMLAttributes<HTMLButtonElement>)}
        className="cursor-grab text-muted-foreground/50 opacity-0 transition-opacity hover:text-muted-foreground active:cursor-grabbing group-hover/linha:opacity-100"
        title="Arrastar a sub-etapa (leva os passos junto)"
        aria-label={`Arrastar a sub-etapa ${nome}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onAlternar}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        title={recolhida ? 'Abrir sub-etapa' : 'Fechar sub-etapa'}
        aria-expanded={!recolhida}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-150', !recolhida && 'rotate-90')} />
      </button>
      {recolhida ? <Folder className={cn('h-4 w-4 shrink-0', TEXT.sky)} /> : <FolderOpen className={cn('h-4 w-4 shrink-0', TEXT.sky)} />}
      <input
        key={nome}
        defaultValue={nome}
        onBlur={e => { if (e.target.value !== nome) onRenomear?.(e.target.value) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        aria-label="Nome da sub-etapa"
        className="h-6 min-w-0 flex-1 rounded bg-transparent px-1 text-[13px] font-medium text-foreground hover:bg-background/60 focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {selo && <SeloCondicaoCadastro texto={selo} foraDeOrdem={seloForaDeOrdem} onClick={() => onCondicao?.()} className="h-5 max-w-[180px] text-[10px]" />}
      <span className="shrink-0 px-1 text-[10.5px] tabular-nums text-muted-foreground" title="Passos nesta sub-etapa">
        {qtd === 0 ? 'vazia — solte um passo aqui' : `${qtd} passo${qtd !== 1 ? 's' : ''}`}
      </span>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/linha:opacity-100">
        <Button variant="ghost" size="icon-xs" className="h-6 w-6" onClick={onConfigurar} title="Configurar sub-etapa (condição)">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-destructive" onClick={onExcluir} title="Excluir sub-etapa (os passos voltam para a etapa)">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/** Nome editável direto na linha da árvore: parece texto, vira campo ao focar. */
const NomeInline = forwardRef<HTMLInputElement, {
  value: string; placeholder?: string; ariaLabel: string; forte?: boolean
  onChange: (v: string) => void; onBlur?: (v: string) => void
}>(function NomeInline({ value, placeholder, ariaLabel, forte, onChange, onBlur }, ref) {
  return (
    <input
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onBlur?.(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={value}
      className={cn(
        'h-6 w-full min-w-0 rounded bg-transparent px-1 text-[13px] text-foreground placeholder:text-muted-foreground/70 hover:bg-background/60 focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring',
        forte && 'font-semibold',
      )}
    />
  )
})

/** Linha de passo drag-and-drop. Drag ativa apenas pelo número à esquerda
 * (via SortableHandleContext) — assim os inputs continuam clicáveis sem dispara drag. */
function SortablePasso({ id, children, exiting, selecionado }: { id: string; children: React.ReactNode; exiting?: boolean; selecionado?: boolean }) {
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
        'group/linha flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-muted/50',
        selecionado && 'bg-primary/10 hover:bg-primary/10',
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
