'use client'

/**
 * FluxoEditor — visualização e edição de fluxos de serviço usando React Flow.
 *
 * Fase 1 (atual): renderiza usando React Flow com auto-layout dagre, replicando
 * o visual do SVG anterior (cor/ícone por position, popover de prévia). Read-only.
 *
 * Próximas fases adicionam:
 *  - Fase 2: drag pra reposicionar + persistência em ServicoFluxoLayout
 *  - Fase 3: criar/editar/excluir edges com handles
 *  - Fase 4: bloco DECISÃO (losango)
 *  - Fase 6: palette lateral, inspector, multi-select, undo/redo
 */

import { useEffect, useMemo, useCallback, useState, useRef, useLayoutEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeProps, type EdgeProps,
  type NodeChange, type Connection, applyNodeChanges,
  getBezierPath, BackgroundVariant, ReactFlowProvider, Panel,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import {
  Target, History, ChevronRight, ArrowRight, X, LayoutGrid, Loader2,
  Maximize2, Minimize2, Eye, EyeOff, Plus, Minus, Search, Workflow,
  PanelLeftOpen, PanelLeftClose, AlertTriangle, Link2, Grid3x3,
  // Ícones de marca d'água por tipo/categoria do bloco — espelham
  // exatamente os ícones de grupo da sidebar (lib/navigation.ts).
  Calculator, Users, Shield, ClipboardList, Settings,
  Store, Building2, Scale, Monitor, Award,
  GitBranch, FileText, PlayCircle, CheckCircle2, HelpCircle, Box,
} from 'lucide-react'
import { Badge, Button, Input, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'

// Tipos exportados (também usados pelo page.tsx pra montar o payload)

/** SLA total formatado em "1h 30m" / "45m" / "2h". Aceita minutos ou (fallback) horas. */
function formatNodeSla(slaMinutos: number | null | undefined, slaHoras: number | null | undefined): string {
  const min = slaMinutos ?? (slaHoras != null ? slaHoras * 60 : null)
  if (min == null || min <= 0) return ''
  const h = Math.floor(min / 60)
  const rest = min % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h ${rest}m`
}

export interface FluxoNode {
  id: string
  nome: string
  categoria: string | null
  prioridade: string
  slaHoras: number | null
  /** SLA total em minutos — soma exata dos passos. Fonte de verdade pro display. */
  slaMinutos: number | null
  ativo: boolean
  recorrenteMensal: boolean
  position: 'ANCESTRAL' | 'RAIZ' | 'SUCESSOR' | 'ORFAO'
  position_xy?: { x: number; y: number } | null
  /** Tipo do bloco — ATIVIDADE/DECISAO/DOCUMENTACAO/INICIO/FIM/PERGUNTA */
  tipo?: 'ATIVIDADE' | 'DECISAO' | 'DOCUMENTACAO' | 'INICIO' | 'FIM' | 'PERGUNTA'
  /** Texto da pergunta (só quando tipo='PERGUNTA') — mostrado no bloco em runtime. */
  perguntaTexto?: string | null
  /** Lista de opções de resposta (só quando tipo='PERGUNTA'). */
  perguntaOpcoes?: string[] | null
  /** Se true, gestor pode marcar várias opções (multi-seleção). */
  perguntaMulti?: boolean | null
  /** Rótulos das arestas vindas de blocos PERGUNTA cujo destino é este bloco.
   *  Renderizado como header amber sinalizando qual opção da pergunta leva
   *  a esse caminho do fluxo. */
  perguntaRotulos?: string[] | null
  /** Estratégia de atribuição de responsável (editável no popover do bloco). */
  atribuicaoResponsavel?: 'ORCAMENTO' | 'CLIENTE_AREA' | 'MANUAL_FIXO' | 'HERDA_PREDECESSOR'
  /** ID do user fixo quando atribuicaoResponsavel = MANUAL_FIXO. */
  responsavelFixoId?: string | null
  /** Categoria — usada pra decidir se renderiza obrigações Acessórias. */
  categoriaServico?: 'MENSAL' | 'EXTRA' | 'FLUXO'
  /** Nomes das obrigações Acessórias mapeadas ativas. Renderizados como
   *  chips dentro do bloco quando o serviço é MENSAL. */
  acessoriasObrigacoes?: string[]
  /** Resumo das execuções ativas (em andamento, aguardando, etc) deste bloco.
   *  Backend agrega por servicoId em getFluxo. Renderizado como pill no rodapé
   *  do bloco com cor do "pior caso" (atrasada > vencendo > em dia). */
  execucoesAtivas?: {
    total: number
    emDia: number
    vencendo: number
    atrasada: number
    aguardandoResposta: number
    aguardandoInicio: number
    pausada: number
    itens: Array<{
      id: string
      status: string
      situacao: 'em_dia' | 'vencendo' | 'atrasada' | 'aguardando_resposta' | 'aguardando_inicio' | 'pausada'
      prazoLimite: string | Date | null
      iniciadoEm: string | Date
      pausado: boolean
      responsavel: { id: string; name: string | null; image: string | null } | null
      cliente: { id: string; nome: string } | null
    }>
  } | null
  etapas: Array<{
    id: string
    nome: string
    ordem: number
    passos: Array<{ id: string; nome: string; ordem: number; obrigatorio: boolean }>
  }>
}

export interface FluxoEdge {
  id: string
  servicoOrigemId: string
  servicoDestinoId: string
  ordem: number
  obrigatorio: boolean
  iniciaAuto: boolean
  condicao: unknown
  observacao: string | null
  rotulo?: string | null
}

// ─────────────────────────────────────────────────────────────
// Auto-layout via dagre (LR — esquerda→direita)
// ─────────────────────────────────────────────────────────────
const NODE_WIDTH = 220
const NODE_HEIGHT = 92
/** Dimensão (largura = altura) dos blocos de Decisão (losango).
 *  Mais quadrado pra evitar o losango "espichado" da largura padrão. */
const DECISION_SIZE = 130

/** Retorna dimensões intrínsecas do nó conforme seu tipo. */
function dimsForTipo(tipo: string): { width: number; height: number } {
  if (tipo === 'DECISAO') return { width: DECISION_SIZE, height: DECISION_SIZE }
  if (tipo === 'INICIO' || tipo === 'FIM') return { width: 90, height: 90 }
  // PERGUNTA usa altura mínima compacta; o bloco cresce sozinho via CSS quando
  // o texto da pergunta ou número de chips de opção excede o mínimo.
  if (tipo === 'PERGUNTA') return { width: NODE_WIDTH, height: 72 }
  return { width: NODE_WIDTH, height: NODE_HEIGHT }
}

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR',
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: 70, nodesep: 24, marginx: 16, marginy: 16 })
  // Cada nó vai com sua dimensão intrínseca — Decisão/Evento são menores,
  // o que melhora o layout (evita overlap) e centraliza com os outros.
  const nodeDims = new Map<string, { width: number; height: number }>()
  nodes.forEach(n => {
    const tipo = (n.data as ServicoNodeData)?.node?.tipo ?? 'ATIVIDADE'
    const dim = dimsForTipo(tipo)
    nodeDims.set(n.id, dim)
    g.setNode(n.id, dim)
  })
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const p = g.node(n.id)
    const dim = nodeDims.get(n.id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT }
    return {
      ...n,
      position: { x: p.x - dim.width / 2, y: p.y - dim.height / 2 },
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
    } as Node
  })
}

// ─────────────────────────────────────────────────────────────
// Paleta por Área — espelha a sidebar pra dar consistência visual
// entre módulo e fluxo. Cada área tem 5 tons:
//   fillLight = fundo do bloco normal (50)
//   fillRoot  = fundo do bloco raiz (200) — mais saturado
//   border    = cor da borda (500)
//   borderRoot = borda do raiz (700)
//   text      = texto (700) e textRoot (900)
// ─────────────────────────────────────────────────────────────
type AreaPaletteEntry = {
  fillLight: string; fillRoot: string;
  border: string; borderRoot: string;
  text: string; textRoot: string;
}
const AREA_PALETTE: Record<string, AreaPaletteEntry> = {
  'Cadastros':      { fillLight: '#ecfdf5', fillRoot: '#a7f3d0', border: '#10b981', borderRoot: '#047857', text: '#047857', textRoot: '#064e3b' },
  'Comercial':      { fillLight: '#fff1f2', fillRoot: '#fecdd3', border: '#f43f5e', borderRoot: '#be123c', text: '#be123c', textRoot: '#881337' },
  'Administrativo': { fillLight: '#f0f9ff', fillRoot: '#bae6fd', border: '#0ea5e9', borderRoot: '#0369a1', text: '#0369a1', textRoot: '#0c4a6e' },
  'Legalização':    { fillLight: '#fdf4ff', fillRoot: '#f5d0fe', border: '#d946ef', borderRoot: '#a21caf', text: '#a21caf', textRoot: '#701a75' },
  'Trabalhista':    { fillLight: '#f7fee7', fillRoot: '#d9f99d', border: '#84cc16', borderRoot: '#4d7c0f', text: '#4d7c0f', textRoot: '#365314' },
  'Fiscal':         { fillLight: '#eef2ff', fillRoot: '#c7d2fe', border: '#6366f1', borderRoot: '#4338ca', text: '#4338ca', textRoot: '#312e81' },
  'Contábil':       { fillLight: '#f5f3ff', fillRoot: '#ddd6fe', border: '#8b5cf6', borderRoot: '#6d28d9', text: '#6d28d9', textRoot: '#4c1d95' },
  'TI':             { fillLight: '#ecfeff', fillRoot: '#a5f3fc', border: '#06b6d4', borderRoot: '#0e7490', text: '#0e7490', textRoot: '#164e63' },
  'Qualidade':      { fillLight: '#fffbeb', fillRoot: '#fde68a', border: '#f59e0b', borderRoot: '#b45309', text: '#b45309', textRoot: '#78350f' },
  'Configurações':  { fillLight: '#fff7ed', fillRoot: '#fed7aa', border: '#f97316', borderRoot: '#c2410c', text: '#c2410c', textRoot: '#7c2d12' },
}
/** Fallback (área não-mapeada ou nula) — usa o tom emerald padrão do módulo. */
const AREA_DEFAULT: AreaPaletteEntry = AREA_PALETTE['Cadastros']

function areaPalette(categoria: string | null | undefined): AreaPaletteEntry {
  if (!categoria) return AREA_DEFAULT
  return AREA_PALETTE[categoria] ?? AREA_DEFAULT
}

// ─────────────────────────────────────────────────────────────
// Marca d'água: ícone grande no canto inferior direito do bloco.
// Identifica visualmente o tipo (e a categoria, no caso de ATIVIDADE)
// sem competir com o conteúdo principal.
// ─────────────────────────────────────────────────────────────
function iconForNode(tipo: string | undefined, categoria: string | null | undefined): React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }> {
  if (tipo === 'DECISAO')      return GitBranch
  if (tipo === 'PERGUNTA')     return HelpCircle
  if (tipo === 'DOCUMENTACAO') return FileText
  if (tipo === 'INICIO')       return PlayCircle
  if (tipo === 'FIM')          return CheckCircle2
  // ATIVIDADE → ícone por categoria (espelha exatamente os grupos da sidebar)
  switch (categoria) {
    case 'Cadastros':      return ClipboardList
    case 'Comercial':      return Store
    case 'Administrativo': return Building2
    case 'Legalização':    return Scale
    case 'Trabalhista':    return Users
    case 'Fiscal':         return Shield
    case 'Contábil':       return Calculator
    case 'TI':             return Monitor
    case 'Qualidade':      return Award
    case 'Configurações':  return Settings
    default:               return Box
  }
}

function NodeWatermark({ tipo, categoria, color, size = 56, ancestral }: {
  tipo?: string
  categoria?: string | null
  color: string
  size?: number
  ancestral?: boolean
}) {
  const Icon = iconForNode(tipo, categoria)
  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        right: 4,
        bottom: 2,
        opacity: ancestral ? 0.07 : 0.13,
        color,
        lineHeight: 0,
      }}
      aria-hidden="true"
    >
      <Icon size={size} strokeWidth={1.4} />
    </div>
  )
}

/**
 * Pill discreto no rodapé do bloco mostrando o estado das execuções ativas
 * desse serviço/pergunta. Cor reflete o "pior caso":
 *   atrasada (rose) > vencendo (âmbar) > aguardando_resposta (violeta) >
 *   aguardando_inicio (cyan) > pausada (cinza) > em_dia (emerald).
 * Hover mostra breakdown completo via title HTML (sem popover próprio pra
 * não conflitar com o onClick do bloco que abre a PreviewPopover).
 */
function ExecucoesPill({ execucoes }: { execucoes: NonNullable<FluxoNode['execucoesAtivas']> }) {
  if (!execucoes || execucoes.total === 0) return null
  // Pior caso determina a cor principal
  const cor =
    execucoes.atrasada > 0      ? { bg: '#fecdd3', text: '#9f1239', border: '#fb7185', dot: '#e11d48' } :
    execucoes.vencendo > 0      ? { bg: '#fef3c7', text: '#92400e', border: '#fbbf24', dot: '#f59e0b' } :
    execucoes.aguardandoResposta > 0 ? { bg: '#ede9fe', text: '#5b21b6', border: '#a78bfa', dot: '#8b5cf6' } :
    execucoes.aguardandoInicio > 0   ? { bg: '#cffafe', text: '#155e75', border: '#67e8f9', dot: '#06b6d4' } :
    execucoes.pausada > 0       ? { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', dot: '#94a3b8' } :
                                  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', dot: '#10b981' }
  const partes: string[] = []
  if (execucoes.atrasada > 0)            partes.push(`${execucoes.atrasada} atrasada${execucoes.atrasada > 1 ? 's' : ''}`)
  if (execucoes.vencendo > 0)            partes.push(`${execucoes.vencendo} vencendo`)
  if (execucoes.aguardandoResposta > 0)  partes.push(`${execucoes.aguardandoResposta} aguardando resposta`)
  if (execucoes.aguardandoInicio > 0)    partes.push(`${execucoes.aguardandoInicio} aguardando início`)
  if (execucoes.pausada > 0)             partes.push(`${execucoes.pausada} pausada${execucoes.pausada > 1 ? 's' : ''}`)
  if (execucoes.emDia > 0)               partes.push(`${execucoes.emDia} em dia`)
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8.5px] font-bold leading-none shrink-0"
      style={{ background: cor.bg, color: cor.text, border: `1px solid ${cor.border}` }}
      title={`Execuções ativas:\n• ${partes.join('\n• ')}\n\nClique no bloco para ver detalhes.`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{ background: cor.dot, boxShadow: execucoes.atrasada > 0 ? `0 0 0 2px ${cor.dot}33` : undefined }}
      />
      {execucoes.total}
    </span>
  )
}

/**
 * Bloco expandido das execuções ativas — renderizado dentro da PreviewPopover.
 * Lista até 20 execuções com situação colorida, responsável (com iniciais ou
 * imagem), cliente e prazo formatado. Cada item é clicável e leva pra
 * /meus-servicos com a execução em foco.
 */
function ExecucoesSection({ execucoes }: { execucoes: NonNullable<FluxoNode['execucoesAtivas']> }) {
  const cores: Record<string, { dot: string; label: string; bg: string }> = {
    em_dia:              { dot: '#10b981', label: 'Em dia',              bg: 'rgba(16,185,129,0.08)' },
    vencendo:            { dot: '#f59e0b', label: 'Vencendo',            bg: 'rgba(245,158,11,0.10)' },
    atrasada:            { dot: '#e11d48', label: 'Atrasada',            bg: 'rgba(225,29,72,0.10)' },
    aguardando_resposta: { dot: '#8b5cf6', label: 'Aguarda resposta',    bg: 'rgba(139,92,246,0.10)' },
    aguardando_inicio:   { dot: '#06b6d4', label: 'Aguarda início',      bg: 'rgba(6,182,212,0.10)' },
    pausada:             { dot: '#94a3b8', label: 'Pausada',             bg: 'rgba(148,163,184,0.10)' },
  }
  const fmtPrazo = (v: string | Date | null, situacao: string) => {
    if (!v) return situacao === 'aguardando_inicio' ? 'sem prazo' : '—'
    const d = typeof v === 'string' ? new Date(v) : v
    const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `${dia} ${hora}`
  }
  const iniciais = (name: string | null) => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (
    <div className="px-3 py-2.5 border-t bg-emerald-50/30 dark:bg-emerald-950/15">
      <div className="flex items-center gap-1.5 mb-1.5">
        <PlayCircle className="h-3 w-3 text-emerald-700" />
        <span className="text-[10px] font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">
          Em execução — {execucoes.total}
        </span>
      </div>
      {/* Mini-breakdown chips */}
      <div className="flex flex-wrap gap-1 mb-2">
        {execucoes.atrasada > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: cores.atrasada.bg, color: cores.atrasada.dot }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cores.atrasada.dot }} /> {execucoes.atrasada} atrasada{execucoes.atrasada > 1 ? 's' : ''}
          </span>
        )}
        {execucoes.vencendo > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: cores.vencendo.bg, color: cores.vencendo.dot }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cores.vencendo.dot }} /> {execucoes.vencendo} vencendo
          </span>
        )}
        {execucoes.aguardandoResposta > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: cores.aguardando_resposta.bg, color: cores.aguardando_resposta.dot }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cores.aguardando_resposta.dot }} /> {execucoes.aguardandoResposta} aguarda resposta
          </span>
        )}
        {execucoes.aguardandoInicio > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: cores.aguardando_inicio.bg, color: cores.aguardando_inicio.dot }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cores.aguardando_inicio.dot }} /> {execucoes.aguardandoInicio} aguarda início
          </span>
        )}
        {execucoes.pausada > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: cores.pausada.bg, color: cores.pausada.dot }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cores.pausada.dot }} /> {execucoes.pausada} pausada{execucoes.pausada > 1 ? 's' : ''}
          </span>
        )}
        {execucoes.emDia > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: cores.em_dia.bg, color: cores.em_dia.dot }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cores.em_dia.dot }} /> {execucoes.emDia} em dia
          </span>
        )}
      </div>
      {/* Lista de execuções */}
      <ul className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
        {execucoes.itens.map(it => {
          const c = cores[it.situacao] ?? cores.em_dia
          const respImg = it.responsavel?.image ? resolveAssetUrl(it.responsavel.image) : ''
          return (
            <li key={it.id}>
              <a
                href={`/meus-servicos?focus=${it.id}`}
                className="block px-2 py-1.5 rounded border bg-card hover:bg-muted/40 transition-colors"
                style={{ borderColor: `${c.dot}40` }}
                title={`Ver detalhes da execução em /meus-servicos`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: c.dot }}>
                    {c.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                    {fmtPrazo(it.prazoLimite, it.situacao)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {/* Avatar do responsável */}
                  {it.responsavel ? (
                    respImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={respImg} alt={it.responsavel.name ?? ''} className="h-4 w-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="h-4 w-4 rounded-full inline-flex items-center justify-center text-[7.5px] font-bold text-white shrink-0" style={{ background: c.dot }}>
                        {iniciais(it.responsavel.name)}
                      </span>
                    )
                  ) : (
                    <span className="h-4 w-4 rounded-full inline-flex items-center justify-center text-[7.5px] font-bold text-muted-foreground shrink-0 border border-dashed">?</span>
                  )}
                  <span className="text-[11px] font-medium truncate flex-1">
                    {it.responsavel?.name ?? <em className="text-muted-foreground">Sem responsável</em>}
                  </span>
                </div>
                {it.cliente && (
                  <div className="text-[10px] text-muted-foreground truncate ml-5" title={it.cliente.nome}>
                    {it.cliente.nome}
                  </div>
                )}
              </a>
            </li>
          )
        })}
      </ul>
      {execucoes.total > execucoes.itens.length && (
        <p className="text-[9.5px] text-muted-foreground italic mt-1.5">
          +{execucoes.total - execucoes.itens.length} execuç{execucoes.total - execucoes.itens.length === 1 ? 'ão' : 'ões'} não listada{execucoes.total - execucoes.itens.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Custom Node — serviço (atividade)
// ─────────────────────────────────────────────────────────────
type ServicoNodeData = {
  node: FluxoNode
  rootId: string
  onExpand: (nodeId: string, rect: DOMRect) => void
  isExpanded: boolean
  /** Quantidade de conexões à esquerda (predecessores) e direita (sucessores).
   *  Usado pra mostrar/esconder o botão "−" nos cantos. */
  predCount?: number
  succCount?: number
  /** Callbacks pra +/- nos cantos (só presentes em modo edição). */
  onAddPred?: (nodeId: string) => void
  onAddSucc?: (nodeId: string) => void
  onRemovePred?: (nodeId: string) => void
  onRemoveSucc?: (nodeId: string) => void
}

/** Botões flutuantes +/- nos cantos do bloco. Aparecem no hover quando
 *  o nó é editável (não-ANCESTRAL) e o modo de edição está ativo. */
function NodeEdgeButtons({ data, hidden }: { data: ServicoNodeData; hidden?: boolean }) {
  if (hidden) return null
  if (!data.onAddSucc && !data.onAddPred) return null
  const { node: n, predCount = 0, succCount = 0 } = data
  // Botões afastados verticalmente do centro (onde fica o handle/aresta):
  // + vai pro terço superior, − pro terço inferior, deixando o meio livre
  // pra agarrar a ponta da aresta no React Flow.
  return (
    <>
      {/* Lado esquerdo — predecessor + (topo) */}
      {data.onAddPred && (
        <div className="absolute -left-3.5 top-[22%] -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-20">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onAddPred!(n.id) }}
            className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-emerald-600 text-white shadow-md hover:bg-emerald-700 hover:scale-110 transition-all"
            title="Adicionar predecessor (origem)"
            aria-label="Adicionar bloco antes"
          >
            <Plus className="h-3 w-3" strokeWidth={3} />
          </button>
        </div>
      )}
      {/* Lado esquerdo — predecessor − (base) */}
      {data.onRemovePred && predCount > 0 && (
        <div className="absolute -left-3.5 top-[78%] -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-20">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onRemovePred!(n.id) }}
            className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 hover:scale-110 transition-all"
            title={`Remover predecessor (${predCount} conex${predCount === 1 ? 'ão' : 'ões'})`}
            aria-label="Remover predecessor"
          >
            <Minus className="h-3 w-3" strokeWidth={3} />
          </button>
        </div>
      )}
      {/* Lado direito — sucessor + (topo) */}
      {data.onAddSucc && (
        <div className="absolute -right-3.5 top-[22%] -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-20">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onAddSucc!(n.id) }}
            className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-emerald-600 text-white shadow-md hover:bg-emerald-700 hover:scale-110 transition-all"
            title="Adicionar sucessor (destino)"
            aria-label="Adicionar bloco depois"
          >
            <Plus className="h-3 w-3" strokeWidth={3} />
          </button>
        </div>
      )}
      {/* Lado direito — sucessor − (base) */}
      {data.onRemoveSucc && succCount > 0 && (
        <div className="absolute -right-3.5 top-[78%] -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-20">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onRemoveSucc!(n.id) }}
            className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 hover:scale-110 transition-all"
            title={`Remover sucessor (${succCount} conex${succCount === 1 ? 'ão' : 'ões'})`}
            aria-label="Remover sucessor"
          >
            <Minus className="h-3 w-3" strokeWidth={3} />
          </button>
        </div>
      )}
    </>
  )
}

function ServicoNodeComp({ data }: NodeProps) {
  const d = data as ServicoNodeData
  const { node: n, rootId, onExpand, isExpanded } = d
  const isRoot = n.position === 'RAIZ'
  const isAncestral = n.position === 'ANCESTRAL'
  const ref = useRef<HTMLDivElement>(null)
  void rootId

  const pal = areaPalette(n.categoria)
  const fill = !n.ativo
    ? '#f3f4f6'
    : isAncestral
      ? '#f9fafb'
      : isRoot
        ? pal.fillRoot
        : pal.fillLight
  const borderColor = !n.ativo
    ? '#9ca3af'
    : isExpanded
      ? pal.borderRoot
      : isAncestral
        ? '#9ca3af'
        : isRoot
          ? pal.borderRoot
          : pal.border
  const textColor = !n.ativo
    ? '#6b7280'
    : isAncestral
      ? '#6b7280'
      : isRoot
        ? pal.textRoot
        : pal.text
  const totalPassos = n.etapas.reduce((acc, et) => acc + et.passos.length, 0)

  return (
    <div
      ref={ref}
      onClick={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) onExpand(n.id, r)
      }}
      className="group relative rounded-lg shadow-sm cursor-pointer select-none transition-shadow hover:shadow-md"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: fill,
        border: `${isExpanded || isRoot ? 2.5 : isAncestral ? 1 : 1.5}px ${isAncestral ? 'dashed' : 'solid'} ${borderColor}`,
        opacity: isAncestral ? 0.55 : 1,
      }}
    >
      <NodeEdgeButtons data={d} hidden={isAncestral} />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border !border-white"
        style={{ background: borderColor }}
      />
      {/* Wrapper interno com overflow:hidden — clipa header amber/marca d'água
          dentro do border-radius do bloco sem cortar os botões +/- externos. */}
      <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
        <NodeWatermark tipo={n.tipo} categoria={n.categoria} color={borderColor} ancestral={isAncestral} size={64} />
      </div>
      <div className="relative z-10 h-full flex flex-col gap-0.5 rounded-lg overflow-hidden">
        {/* Header de pergunta — só quando este bloco é sucessor de um PERGUNTA.
            Mostra qual opção do gestor leva a esse caminho do fluxo.
            Usa a cor da área do bloco (mesmo borderColor) pra manter
            consistência visual com o estilo do sucessor. */}
        {n.perguntaRotulos && n.perguntaRotulos.length > 0 && (
          <div
            className="flex items-center gap-1 px-2 py-1 border-b"
            style={{
              background: borderColor,
              borderColor: borderColor,
              color: '#fff',
            }}
            title={`Caminho ativado quando o gestor escolhe: ${n.perguntaRotulos.join(' ou ')}`}
          >
            <HelpCircle className="h-2.5 w-2.5 shrink-0" />
            <span className="text-[9px] uppercase tracking-wider font-bold leading-none truncate">
              {n.perguntaRotulos.join(' / ')}
            </span>
          </div>
        )}
        <div className={`flex items-center gap-1.5 ${n.perguntaRotulos?.length ? 'px-3 pt-1' : 'px-3 pt-2'}`}>
          {isRoot && <Target className="h-3.5 w-3.5 shrink-0" style={{ color: borderColor }} />}
          {isAncestral && <History className="h-3.5 w-3.5 shrink-0" style={{ color: borderColor }} />}
          <span
            className="text-[12px] font-bold truncate flex-1"
            style={{ color: textColor }}
            title={n.nome}
          >
            {n.nome}
          </span>
          <span
            className="inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-black text-white shrink-0"
            style={{ background: borderColor, opacity: 0.85 }}
            title={isExpanded ? 'Recolher' : 'Ver passos'}
          >
            {isExpanded ? '−' : '+'}
          </span>
        </div>
        <div className="text-[10px] truncate px-3" style={{ color: textColor, opacity: 0.75 }}>
          {n.categoria || 'Sem área'}
          {(() => {
            const sla = formatNodeSla(n.slaMinutos, n.slaHoras)
            return sla && ` · SLA ${sla}`
          })()}
        </div>
        <div className="text-[9px] truncate px-3 pb-2 flex items-center gap-1" style={{ color: textColor, opacity: 0.65 }}>
          <span className="truncate flex-1">
            {n.prioridade}
            {totalPassos > 0 && ` · ${totalPassos} passo${totalPassos > 1 ? 's' : ''}`}
            {n.recorrenteMensal && ' · Recorrente'}
          </span>
          {/* Pill de execuções ativas — total + cor do pior caso (atrasada > vencendo > em_dia). */}
          {n.execucoesAtivas && n.execucoesAtivas.total > 0 && <ExecucoesPill execucoes={n.execucoesAtivas} />}
          {/* Indicador de obrigações Acessórias — só em serviços MENSAL com mapeamentos. */}
          {n.categoriaServico === 'MENSAL' && (n.acessoriasObrigacoes?.length ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8.5px] font-bold leading-none shrink-0"
              style={{ background: `${borderColor}30`, color: textColor, border: `1px solid ${borderColor}55` }}
              title={`Obrigações Acessórias:\n• ${n.acessoriasObrigacoes!.join('\n• ')}`}
            >
              <svg className="h-2 w-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4 6c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6zm2 0v.01L12 11l6-4.99V6H6zm12 2.5l-5.4 4.5c-.35.3-.85.3-1.2 0L6 8.5V18h12V8.5z"/>
              </svg>
              {n.acessoriasObrigacoes!.length}
            </span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border !border-white"
        style={{ background: borderColor }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Custom Edge — encadeamento
// Cor por tipo:
//  - Manual: âmbar
//  - Opcional: ciano tracejado
//  - Condicional: bolinha violeta no meio
// Edges entre ancestrais ficam apagados (opacity 0.4) via data.atenuado
// ─────────────────────────────────────────────────────────────
type EncadeamentoEdgeData = {
  iniciaAuto: boolean
  obrigatorio: boolean
  condicao: unknown
  atenuado: boolean
  rotulo?: string | null
}

function EncadeamentoEdgeComp(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected } = props
  const d = data as EncadeamentoEdgeData
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })
  const stroke = selected
    ? '#0d9488'
    : !d.iniciaAuto ? '#f59e0b' : !d.obrigatorio ? '#0ea5e9' : '#94a3b8'
  return (
    <g opacity={d.atenuado ? 0.4 : 1}>
      {/* Hit area invisível ~20px de espessura — amplia a zona clicável pra
          facilitar acertar a aresta (especialmente perto de nós PERGUNTA que
          também capturam cliques pra expandir). O path visível abaixo é o que
          o usuário vê; este só serve pra o event handler do React Flow pegar. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={!d.obrigatorio ? '4 3' : undefined}
        markerEnd={markerEnd}
        style={{ pointerEvents: 'none' }}
      />
      {d.condicao != null && (
        <circle cx={labelX - (d.rotulo ? 28 : 0)} cy={labelY} r={5} fill="#a78bfa" stroke="#fff" strokeWidth={1.5}>
          <title>Encadeamento condicional</title>
        </circle>
      )}
      {d.rotulo && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-36} y={-9}
            width={72} height={18}
            rx={9} ry={9}
            fill="#fff"
            stroke={stroke}
            strokeWidth={1}
          />
          <text
            x={0} y={4}
            fontSize="10"
            fontWeight="600"
            fill={stroke}
            textAnchor="middle"
            style={{ pointerEvents: 'none' }}
          >
            {d.rotulo.length > 12 ? d.rotulo.slice(0, 11) + '…' : d.rotulo}
          </text>
        </g>
      )}
    </g>
  )
}

// ─────────────────────────────────────────────────────────────
// Custom Node — DECISÃO (losango)
// Renderiza um losango via clip-path. Conteúdo: nome curto da decisão.
// 2+ handles de saída (configurados nas arestas via condicao + rótulo).
// ─────────────────────────────────────────────────────────────
function DecisaoNodeComp({ data }: NodeProps) {
  const d = data as ServicoNodeData
  const { node: n, onExpand, isExpanded } = d
  const ref = useRef<HTMLDivElement>(null)
  const isRoot = n.position === 'RAIZ'
  const isAncestral = n.position === 'ANCESTRAL'
  // Decisões são neutras (cinza) por padrão — a forma de losango já carrega
  // toda a semântica do tipo. Cor reservada pras atividades (que diferenciam
  // áreas operacionais — Fiscal/Contábil/Trabalhista).
  const GRAY = {
    fillLight: '#f3f4f6',  // gray-100
    fillRoot:  '#e5e7eb',  // gray-200
    border:    '#9ca3af',  // gray-400
    borderRoot:'#4b5563',  // gray-600
    text:      '#374151',  // gray-700
    textRoot:  '#111827',  // gray-900
  }
  const borderColor = !n.ativo ? '#d1d5db' : isAncestral ? '#9ca3af' : isRoot ? GRAY.borderRoot : GRAY.border
  const fill = !n.ativo ? '#f9fafb' : isAncestral ? '#f9fafb' : isRoot ? GRAY.fillRoot : GRAY.fillLight
  const textColor = !n.ativo ? '#9ca3af' : isAncestral ? '#6b7280' : isRoot ? GRAY.textRoot : GRAY.text

  return (
    <div
      ref={ref}
      onClick={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) onExpand(n.id, r)
      }}
      className="group cursor-pointer select-none transition-all hover:opacity-95"
      style={{
        width: DECISION_SIZE,
        height: DECISION_SIZE,
        opacity: isAncestral ? 0.55 : 1,
        position: 'relative',
      }}
      title={n.nome}
    >
      <NodeEdgeButtons data={d} hidden={isAncestral} />
      {/* Handles posicionados nos vértices laterais do losango */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border !border-white"
        style={{ background: borderColor, top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border !border-white"
        style={{ background: borderColor, top: '50%' }}
      />
      {/* Losango quadrado — desenhado em SVG pra a borda renderizar corretamente. */}
      {(() => {
        const strokeW = isExpanded || isRoot ? 2.5 : isAncestral ? 1 : 1.75
        return (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={DECISION_SIZE}
            height={DECISION_SIZE}
            viewBox={`0 0 ${DECISION_SIZE} ${DECISION_SIZE}`}
          >
            <polygon
              points={`${DECISION_SIZE / 2},${strokeW} ${DECISION_SIZE - strokeW},${DECISION_SIZE / 2} ${DECISION_SIZE / 2},${DECISION_SIZE - strokeW} ${strokeW},${DECISION_SIZE / 2}`}
              fill={fill}
              stroke={borderColor}
              strokeWidth={strokeW}
              strokeDasharray={isAncestral ? '4 3' : undefined}
              strokeLinejoin="round"
            />
          </svg>
        )
      })()}
      {/* Conteúdo centralizado — texto pode ter até 2 linhas. */}
      <div className="absolute inset-0 flex items-center justify-center px-5 pointer-events-none">
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: textColor, opacity: 0.7 }}>
            Decisão
          </div>
          <div className="text-[11px] font-bold leading-tight line-clamp-2 max-w-[90px]" style={{ color: textColor }}>
            {n.nome}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Custom Node — PERGUNTA (decisão interativa)
// Retângulo arredondado, paleta âmbar/laranja. Cabeçalho com ícone
// e label "PERGUNTA"; corpo mostra o texto da pergunta e chips com as
// opções de resposta. Em runtime, ao chegar nesse bloco a execução
// fica AGUARDANDO_RESPOSTA até o gestor responder no painel.
// ─────────────────────────────────────────────────────────────
function PerguntaNodeComp({ data }: NodeProps) {
  const d = data as ServicoNodeData
  const { node: n, onExpand, isExpanded } = d
  const ref = useRef<HTMLDivElement>(null)
  const isRoot = n.position === 'RAIZ'
  const isAncestral = n.position === 'ANCESTRAL'

  // Paleta âmbar — destaca o bloco como ponto de interação humana.
  const AMBER = {
    fillLight: '#fffbeb', fillRoot: '#fde68a',
    border:    '#f59e0b', borderRoot: '#b45309',
    text:      '#92400e', textRoot:   '#78350f',
  }
  const borderColor = !n.ativo ? '#d1d5db' : isAncestral ? '#fcd34d' : isRoot ? AMBER.borderRoot : AMBER.border
  const fill = !n.ativo ? '#f9fafb' : isAncestral ? '#fffbeb' : isRoot ? AMBER.fillRoot : AMBER.fillLight
  const textColor = !n.ativo ? '#9ca3af' : isAncestral ? '#a16207' : isRoot ? AMBER.textRoot : AMBER.text

  const opcoes = (n.perguntaOpcoes ?? []) as string[]
  const pergunta = n.perguntaTexto?.trim() || n.nome

  return (
    <div
      ref={ref}
      onClick={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) onExpand(n.id, r)
      }}
      className="group cursor-pointer select-none rounded-lg transition-all hover:shadow-md"
      style={{
        width: NODE_WIDTH,
        minHeight: 72,
        background: fill,
        border: `${isExpanded || isRoot ? 2.5 : isAncestral ? 1 : 1.75}px solid ${borderColor}`,
        opacity: isAncestral ? 0.55 : 1,
        position: 'relative',
        // SEM overflow:hidden aqui — senão os botões +/- (posicionados em
        // -left-3.5/-right-3.5) ficam clipados. O clip dos cantos arredondados
        // do header/body fica no wrapper interno abaixo.
      }}
      title={pergunta}
    >
      <NodeEdgeButtons data={d} hidden={isAncestral} />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border !border-white"
        style={{ background: borderColor, top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border !border-white"
        style={{ background: borderColor, top: '50%' }}
      />
      {/* Wrapper interno com overflow:hidden — clipa só o conteúdo (header
          colorido vazaria do border-radius senão), deixando os botões +/- livres.
          Em fluxo normal (relative, não absolute) pra altura crescer com o conteúdo. */}
      <div className="relative rounded-lg overflow-hidden pointer-events-none">
        {/* Marca d'água: HelpCircle no canto inferior direito */}
        <NodeWatermark tipo="PERGUNTA" color={borderColor} ancestral={isAncestral} size={56} />
        {/* Header: ícone + label */}
        <div
          className="relative z-10 flex items-center gap-1.5 px-2 py-1 border-b"
          style={{ background: borderColor, borderColor: borderColor, color: '#fff' }}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider font-bold leading-none">
            {n.perguntaMulti ? 'Pergunta (multi)' : 'Pergunta'}
          </span>
        </div>
        {/* Corpo: texto da pergunta + chips das opções. Sem line-clamp — cresce com o texto. */}
        <div className="relative z-10 px-1.5 py-1 flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold leading-tight" style={{ color: textColor }}>
            {pergunta}
          </div>
          {opcoes.length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {opcoes.slice(0, 4).map((op, i) => (
                <span
                  key={i}
                  className="inline-block px-1 py-0.5 rounded text-[8.5px] leading-none font-medium"
                  style={{ background: `${borderColor}25`, color: textColor, border: `1px solid ${borderColor}55` }}
                >
                  {op}
                </span>
              ))}
              {opcoes.length > 4 && (
                <span className="text-[8.5px] text-muted-foreground">+{opcoes.length - 4}</span>
              )}
            </div>
          )}
          {/* Pill de execuções ativas — relevante quando AGUARDANDO_RESPOSTA. */}
          {n.execucoesAtivas && n.execucoesAtivas.total > 0 && (
            <div className="flex justify-end mt-0.5">
              <ExecucoesPill execucoes={n.execucoesAtivas} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Custom Node — DOCUMENTAÇÃO (forma de documento)
// Retângulo com base ondulada — usa clip-path SVG.
// ─────────────────────────────────────────────────────────────
function DocumentacaoNodeComp({ data }: NodeProps) {
  const d = data as ServicoNodeData
  const { node: n, onExpand, isExpanded } = d
  const ref = useRef<HTMLDivElement>(null)
  const isRoot = n.position === 'RAIZ'
  const isAncestral = n.position === 'ANCESTRAL'
  // Documentação também segue a área (forma de documento distingue o tipo).
  // Sem área, usa o azul legado como fallback semântico.
  const palBase = n.categoria ? areaPalette(n.categoria) : { fillLight: '#eff6ff', fillRoot: '#dbeafe', border: '#3b82f6', borderRoot: '#1d4ed8', text: '#1d4ed8', textRoot: '#1e3a8a' }
  const borderColor = !n.ativo ? '#9ca3af' : isAncestral ? '#9ca3af' : isRoot ? palBase.borderRoot : palBase.border
  const fill = !n.ativo ? '#f3f4f6' : isAncestral ? '#f9fafb' : isRoot ? palBase.fillRoot : palBase.fillLight
  const textColor = !n.ativo ? '#6b7280' : isAncestral ? '#6b7280' : isRoot ? palBase.textRoot : palBase.text

  return (
    <div
      ref={ref}
      onClick={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) onExpand(n.id, r)
      }}
      className="group cursor-pointer select-none transition-all hover:opacity-95"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        opacity: isAncestral ? 0.55 : 1,
        position: 'relative',
      }}
      title={n.nome}
    >
      <NodeEdgeButtons data={d} hidden={isAncestral} />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border !border-white" style={{ background: borderColor }} />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border !border-white" style={{ background: borderColor }} />
      <div
        className="absolute inset-0 flex items-center px-3"
        style={{
          background: fill,
          border: `${isExpanded || isRoot ? 2.5 : isAncestral ? 1 : 1.5}px ${isAncestral ? 'dashed' : 'solid'} ${borderColor}`,
          // Forma de documento — base ondulada via clip-path
          clipPath:
            'polygon(0 0, 100% 0, 100% 85%, 90% 100%, 75% 88%, 60% 100%, 45% 88%, 30% 100%, 15% 88%, 0 100%)',
          borderRadius: 4,
        }}
      >
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: textColor, opacity: 0.7 }}>
            Documentação
          </div>
          <div className="text-[12px] font-bold truncate" style={{ color: textColor }}>
            {n.nome}
          </div>
          {n.categoria && (
            <div className="text-[10px] truncate" style={{ color: textColor, opacity: 0.6 }}>
              {n.categoria}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Custom Node — EVENTO (INÍCIO ou FIM) — círculo
// ─────────────────────────────────────────────────────────────
function EventoNodeComp({ data }: NodeProps) {
  const d = data as ServicoNodeData
  const { node: n, onExpand } = d
  const ref = useRef<HTMLDivElement>(null)
  const isFim = n.tipo === 'FIM'
  const isAncestral = n.position === 'ANCESTRAL'
  const borderColor = !n.ativo
    ? '#9ca3af'
    : isAncestral
      ? '#9ca3af'
      : isFim
        ? '#dc2626' // red-600
        : '#16a34a' // green-600
  const fill = !n.ativo
    ? '#f3f4f6'
    : isAncestral
      ? '#f9fafb'
      : isFim
        ? '#fee2e2'
        : '#dcfce7'
  const textColor = !n.ativo
    ? '#6b7280'
    : isAncestral
      ? '#6b7280'
      : isFim
        ? '#7f1d1d'
        : '#14532d'
  const size = 90 // diâmetro

  return (
    <div
      ref={ref}
      onClick={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) onExpand(n.id, r)
      }}
      className="group cursor-pointer select-none transition-all hover:opacity-95"
      style={{
        width: size,
        height: size,
        opacity: isAncestral ? 0.55 : 1,
        position: 'relative',
      }}
      title={n.nome}
    >
      <NodeEdgeButtons data={d} hidden={isAncestral} />
      {/* Início só tem saída; Fim só tem entrada */}
      {isFim
        ? <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border !border-white" style={{ background: borderColor }} />
        : <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border !border-white" style={{ background: borderColor }} />}
      <div
        className="w-full h-full rounded-full flex items-center justify-center text-center px-2"
        style={{
          background: fill,
          border: `${isAncestral ? 1 : 2.5}px ${isAncestral ? 'dashed' : 'solid'} ${borderColor}`,
        }}
      >
        <div>
          <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: textColor, opacity: 0.7 }}>
            {isFim ? 'Fim' : 'Início'}
          </div>
          <div className="text-[10px] font-bold truncate max-w-[70px]" style={{ color: textColor }}>
            {n.nome}
          </div>
        </div>
      </div>
    </div>
  )
}

// Registro de tipos custom (precisa ser estável)
const nodeTypes = {
  servico: ServicoNodeComp,
  decisao: DecisaoNodeComp,
  documentacao: DocumentacaoNodeComp,
  evento: EventoNodeComp,
  pergunta: PerguntaNodeComp,
}
const edgeTypes = { encadeamento: EncadeamentoEdgeComp }

// Mapa tipo → componente do React Flow
function tipoToFlowType(tipo?: string): 'servico' | 'decisao' | 'documentacao' | 'evento' | 'pergunta' {
  if (tipo === 'DECISAO') return 'decisao'
  if (tipo === 'DOCUMENTACAO') return 'documentacao'
  if (tipo === 'INICIO' || tipo === 'FIM') return 'evento'
  if (tipo === 'PERGUNTA') return 'pergunta'
  return 'servico'
}

// ─────────────────────────────────────────────────────────────
// FluxoEditor — componente principal
// ─────────────────────────────────────────────────────────────
export function FluxoEditor({ rootId, nodes: rawNodes, edges: rawEdges, podeEditar = true, onChanged }: {
  rootId: string
  nodes: FluxoNode[]
  edges: FluxoEdge[]
  /** Habilita drag dos nós e auto-save de layout. Default true. */
  podeEditar?: boolean
  /** Callback chamado após mutations que mudam a topologia (add/remove
   *  encadeamento, novo bloco). Substitui `window.location.reload()` —
   *  permite re-fetch surgical do fluxo sem trocar de aba. */
  onChanged?: () => void
}) {
  const [expanded, setExpanded] = useState<{ nodeId: string; rect: DOMRect } | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [minimapOn, setMinimapOn] = useState(true)
  // Snap-to-grid — preferência por usuário, persistida no localStorage.
  // Quando ligado, o ReactFlow alinha o drag a uma grade de 16px (mesmo gap
  // do background dots). Quando desligado, posicionamento livre.
  const [snapToGrid, setSnapToGrid] = useState(false)
  useEffect(() => {
    setSnapToGrid(localStorage.getItem('oc-fluxo-snap-grid') === '1')
  }, [])
  const toggleSnapToGrid = useCallback(() => {
    setSnapToGrid(prev => {
      const next = !prev
      localStorage.setItem('oc-fluxo-snap-grid', next ? '1' : '0')
      return next
    })
  }, [])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteSearch, setPaletteSearch] = useState('')
  // Catálogo completo de serviços (carregado on-demand quando palette abre)
  const [todosServicos, setTodosServicos] = useState<Array<{
    id: string; nome: string; categoria: string | null; tipo?: string; ehObrigacaoAcessoria?: boolean
  }>>([])
  const [loadingTodos, setLoadingTodos] = useState(false)
  // Bloco origem selecionado pra conectar quando adicionar serviço da palette
  // (servicoId é o ID existente; quando vier do "novo bloco", criamos primeiro)
  const [addingDest, setAddingDest] = useState<{ servicoId: string; nome: string } | null>(null)
  const [origemSelect, setOrigemSelect] = useState<string>('')
  /** Quando o usuário clica no + de um bloco, fixamos quem é o nó âncora e
   *  a direção. Aí cada clique no catálogo da palette cria a conexão direta,
   *  sem precisar abrir o modal de origem. */
  const [addingFromNode, setAddingFromNode] = useState<{ nodeId: string; nome: string; direction: 'succ' | 'pred' } | null>(null)
  const [addingBusy, setAddingBusy] = useState(false)
  // Novo bloco — pra criar um Servico do tipo escolhido on-the-fly
  const [novoBlocoTipo, setNovoBlocoTipo] = useState<null | 'ATIVIDADE' | 'DECISAO' | 'DOCUMENTACAO' | 'INICIO' | 'FIM' | 'PERGUNTA'>(null)
  const [novoBlocoNome, setNovoBlocoNome] = useState('')
  // Campos extras de PERGUNTA — só usados quando novoBlocoTipo === 'PERGUNTA'.
  // Defaults sugeridos: 3 áreas principais. Usuário pode ajustar antes de criar.
  const [perguntaTexto, setPerguntaTexto] = useState('Serviço mensal em todas as áreas?')
  const [perguntaOpcoes, setPerguntaOpcoes] = useState<string[]>(['Contábil', 'Trabalhista', 'Fiscal'])
  const [perguntaOpcaoNova, setPerguntaOpcaoNova] = useState('')
  const [perguntaMulti, setPerguntaMulti] = useState(true)

  // ── Rótulo da aresta ─────────────────────────────────────────
  // Pode aparecer em 2 contextos:
  //  • origem DECISAO (modo 'decisao'): só Sim/Não/Sem rótulo.
  //  • origem qualquer outra (modo 'livre'): input livre até 80 chars.
  // Quando `edgeId` é null estamos criando — gravamos via resolveConnect().
  // Quando `edgeId` está setado estamos editando — gravamos via updateEncadeamento.
  type RotuloDialogState = {
    mode: 'decisao' | 'livre' | 'pergunta'
    edgeId: string | null
    pendingConnection: Connection | null
    currentValue: string | null
    /** Opções permitidas (só usado quando mode='pergunta') */
    opcoesPermitidas?: string[]
  }
  const [rotuloDialog, setRotuloDialog] = useState<RotuloDialogState | null>(null)
  const [rotuloLivreText, setRotuloLivreText] = useState('')

  // ── Substituir entradas existentes ───────────────────────────
  // Quando o usuário arrasta nova seta para um bloco que JÁ tem aresta(s) de
  // entrada (de outras origens), pergunta se quer substituir as existentes
  // (remove todas + cria a nova) ou adicionar a nova como entrada adicional.
  type SubstituirDialogState = {
    pendingConnection: Connection
    existentes: Array<{ id: string; sourceNome: string }>
  }
  const [substituirDialog, setSubstituirDialog] = useState<SubstituirDialogState | null>(null)
  const [substituirBusy, setSubstituirBusy] = useState(false)

  const onExpand = useCallback((nodeId: string, rect: DOMRect) => {
    setExpanded(prev => prev?.nodeId === nodeId ? null : { nodeId, rect })
  }, [])

  // Edges não dependem do estado controlado de nodes — derivam do raw
  const edges: Edge[] = useMemo(() => rawEdges.map(e => {
    const origemNode = rawNodes.find(n => n.id === e.servicoOrigemId)
    const destinoNode = rawNodes.find(n => n.id === e.servicoDestinoId)
    const atenuado = origemNode?.position === 'ANCESTRAL'
      && (destinoNode?.position === 'ANCESTRAL' || destinoNode?.position === 'RAIZ')
    return {
      id: e.id,
      source: e.servicoOrigemId,
      target: e.servicoDestinoId,
      type: 'encadeamento',
      data: {
        iniciaAuto: e.iniciaAuto,
        obrigatorio: e.obrigatorio,
        condicao: e.condicao,
        rotulo: e.rotulo ?? null,
        atenuado,
      } as EncadeamentoEdgeData,
      markerEnd: { type: 'arrowclosed' as const, color: !e.iniciaAuto ? '#f59e0b' : !e.obrigatorio ? '#0ea5e9' : '#94a3b8' },
    }
  }), [rawEdges, rawNodes])

  // Detecta se conectar source→target criaria um ciclo (já existe caminho
  // reverso de target→source nos edges atuais). Usado pra impedir loops.
  const criariaLoop = useCallback((source: string, target: string): boolean => {
    // BFS de target seguindo edges em sentido forward; se encontrar source, há loop
    const seen = new Set<string>([target])
    const queue = [target]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const e of edges) {
        if (e.source !== cur) continue
        if (e.target === source) return true
        if (!seen.has(e.target)) {
          seen.add(e.target)
          queue.push(e.target)
        }
      }
    }
    return false
  }, [edges])

  // Helper: cria a aresta no backend. Extraído porque a criação dispara em
  // dois fluxos — drag direto (onConnect) e drag a partir de DECISAO (depois
  // do dialog de Sim/Não/Sem rótulo).
  const persistNewEdge = useCallback(async (source: string, target: string, rotulo: string | null) => {
    try {
      await (trpc.servico as any).addEncadeamento.mutate({
        servicoOrigemId: source,
        servicoDestinoId: target,
        ordem: 0,
        iniciaAuto: true,
        obrigatorio: true,
        herdaResponsavel: true,
        rotulo,
      })
      await alerts.success('Conexão criada', 'Recarregando fluxo...')
      onChanged?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }, [onChanged])

  // Cria encadeamento ao arrastar de um handle de saída para um nó.
  // Defaults sensatos: iniciaAuto=true, obrigatorio=true, sem condição.
  // Se a origem for um bloco DECISAO, antes de gravar abrimos um dialog
  // perguntando qual saída essa aresta representa (Sim/Não/sem rótulo).
  const onConnect = useCallback(async (conn: { source: string | null; target: string | null }) => {
    if (!podeEditar) return
    if (!conn.source || !conn.target) return
    if (conn.source === conn.target) {
      alerts.error('Inválido', 'Um serviço não pode apontar para si mesmo.')
      return
    }
    // Não cria duplicata
    if (edges.some(e => e.source === conn.source && e.target === conn.target)) {
      alerts.error('Já existe', 'Esses dois serviços já estão encadeados.')
      return
    }
    // Detecção de ciclos
    if (criariaLoop(conn.source, conn.target)) {
      alerts.error(
        'Ciclo detectado',
        'Essa conexão criaria um loop (o destino já alcança a origem). Encadeamentos devem formar um DAG sem ciclos.',
      )
      return
    }
    // Se o destino já tem aresta(s) de entrada (de outras origens), abre dialog
    // perguntando se substitui as existentes ou adiciona como predecessor adicional.
    // Caso DAG normal (múltiplos pais legítimos), usuário escolhe "Adicionar".
    const entradasExistentes = edges
      .filter(e => e.target === conn.target)
      .map(e => ({
        id: e.id,
        sourceNome: rawNodes.find(n => n.id === e.source)?.nome ?? '(?)',
      }))
    if (entradasExistentes.length > 0) {
      setSubstituirDialog({
        pendingConnection: { source: conn.source, target: conn.target, sourceHandle: null, targetHandle: null },
        existentes: entradasExistentes,
      })
      return
    }
    // Se a origem é DECISAO/PERGUNTA, o rótulo da saída define a semântica do
    // roteamento. Em vez de gravar direto, abrimos o seletor — a gravação
    // acontece no handler do dialog (resolveConnect).
    const sourceNode = rawNodes.find(n => n.id === conn.source)
    if (sourceNode?.tipo === 'PERGUNTA') {
      setRotuloDialog({
        mode: 'pergunta',
        edgeId: null,
        pendingConnection: { source: conn.source, target: conn.target, sourceHandle: null, targetHandle: null },
        currentValue: null,
        opcoesPermitidas: sourceNode.perguntaOpcoes ?? [],
      })
      return
    }
    if (sourceNode?.tipo === 'DECISAO') {
      setRotuloDialog({
        mode: 'decisao',
        edgeId: null,
        pendingConnection: { source: conn.source, target: conn.target, sourceHandle: null, targetHandle: null },
        currentValue: null,
      })
      return
    }
    await persistNewEdge(conn.source, conn.target, null)
  }, [podeEditar, edges, criariaLoop, rawNodes, persistNewEdge])

  // Resolve o dialog "Substituir entradas": ação pode ser 'substituir' (remove
  // todas as arestas de entrada existentes antes de criar a nova) ou 'adicionar'
  // (apenas cria a nova, preservando as existentes — convergência DAG normal).
  const resolverSubstituicao = useCallback(async (acao: 'substituir' | 'adicionar') => {
    if (!substituirDialog) return
    const { pendingConnection, existentes } = substituirDialog
    const { source, target } = pendingConnection
    if (!source || !target) return
    setSubstituirBusy(true)
    try {
      if (acao === 'substituir') {
        // Remove todas as entradas existentes em paralelo
        await Promise.all(existentes.map(e =>
          (trpc.servico as any).removeEncadeamento.mutate({ id: e.id }),
        ))
      }
      // Continua pro fluxo normal: se origem é PERGUNTA/DECISAO, abre o seletor.
      const sourceNode = rawNodes.find(n => n.id === source)
      setSubstituirDialog(null)
      if (sourceNode?.tipo === 'PERGUNTA') {
        setRotuloDialog({
          mode: 'pergunta', edgeId: null,
          pendingConnection: { source, target, sourceHandle: null, targetHandle: null },
          currentValue: null,
          opcoesPermitidas: sourceNode.perguntaOpcoes ?? [],
        })
      } else if (sourceNode?.tipo === 'DECISAO') {
        setRotuloDialog({
          mode: 'decisao', edgeId: null,
          pendingConnection: { source, target, sourceHandle: null, targetHandle: null },
          currentValue: null,
        })
      } else {
        await persistNewEdge(source, target, null)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSubstituirBusy(false)
    }
  }, [substituirDialog, rawNodes, persistNewEdge])

  // Edição inline do rótulo: clique numa aresta abre o seletor.
  // Saídas de DECISAO usam o seletor Sim/Não/Sem rótulo; PERGUNTA usa as opções
  // configuradas no bloco; demais aceitam texto livre até 80 caracteres.
  const onEdgeClick = useCallback((_evt: ReactMouseEvent, edge: Edge) => {
    if (!podeEditar) return
    const sourceNode = rawNodes.find(n => n.id === edge.source)
    const current = (edge.data as EncadeamentoEdgeData | undefined)?.rotulo ?? null
    if (sourceNode?.tipo === 'PERGUNTA') {
      setRotuloDialog({
        mode: 'pergunta', edgeId: edge.id, pendingConnection: null, currentValue: current,
        opcoesPermitidas: sourceNode.perguntaOpcoes ?? [],
      })
    } else if (sourceNode?.tipo === 'DECISAO') {
      setRotuloDialog({ mode: 'decisao', edgeId: edge.id, pendingConnection: null, currentValue: current })
    } else {
      setRotuloLivreText(current ?? '')
      setRotuloDialog({ mode: 'livre', edgeId: edge.id, pendingConnection: null, currentValue: current })
    }
  }, [podeEditar, rawNodes])

  // Grava o rótulo escolhido — chamado pelos botões do dialog.
  // value=null limpa o rótulo no backend.
  const aplicarRotulo = useCallback(async (value: string | null) => {
    if (!rotuloDialog) return
    const { mode, edgeId, pendingConnection } = rotuloDialog
    // Validação extra do modo livre (max 80, vazio vira null)
    const normalized = mode === 'livre'
      ? (value && value.trim().length > 0 ? value.trim().slice(0, 80) : null)
      : value
    setRotuloDialog(null)
    setRotuloLivreText('')
    try {
      if (edgeId) {
        // Edição
        await (trpc.servico as any).updateEncadeamento.mutate({ id: edgeId, rotulo: normalized })
        await alerts.success('Rótulo atualizado', 'Aresta renomeada.')
        onChanged?.()
      } else if (pendingConnection?.source && pendingConnection?.target) {
        // Criação pendente vinda de DECISAO
        await persistNewEdge(pendingConnection.source, pendingConnection.target, normalized)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }, [rotuloDialog, onChanged, persistNewEdge])

  // ── Reconectar arestas (mover uma ponta sem perder os atributos) ────
  // React Flow v12: `onReconnect(oldEdge, newConnection)`. Estratégia:
  // remove o encadeamento antigo e cria um novo com os mesmos atributos
  // (o service não suporta update da origem/destino, então é remove+add).
  // Validações: source != target, sem duplicata, sem ciclo (considerando
  // que a aresta antiga será removida antes do check).
  const onReconnect = useCallback(async (oldEdge: Edge, newConnection: Connection) => {
    if (!podeEditar) return
    if (!newConnection.source || !newConnection.target) return
    if (newConnection.source === newConnection.target) {
      alerts.error('Inválido', 'Um serviço não pode apontar para si mesmo.')
      return
    }
    // Sem mudança real — só re-soltou no mesmo handle: ignora.
    if (oldEdge.source === newConnection.source && oldEdge.target === newConnection.target) return
    // Duplicata: outra aresta já liga a mesma dupla (ignora a própria oldEdge)
    if (edges.some(e => e.id !== oldEdge.id && e.source === newConnection.source && e.target === newConnection.target)) {
      alerts.error('Já existe', 'Esses dois serviços já estão encadeados.')
      return
    }
    // Ciclo: pra checar corretamente, simulamos a remoção da oldEdge.
    // criariaLoop usa o `edges` capturado, então fazemos BFS local aqui.
    const simulatedEdges = edges.filter(e => e.id !== oldEdge.id)
    const wouldLoop = (() => {
      const seen = new Set<string>([newConnection.target!])
      const queue = [newConnection.target!]
      while (queue.length > 0) {
        const cur = queue.shift()!
        for (const e of simulatedEdges) {
          if (e.source !== cur) continue
          if (e.target === newConnection.source) return true
          if (!seen.has(e.target)) { seen.add(e.target); queue.push(e.target) }
        }
      }
      return false
    })()
    if (wouldLoop) {
      alerts.error(
        'Ciclo detectado',
        'A nova conexão criaria um loop. Encadeamentos devem formar um DAG sem ciclos.',
      )
      return
    }
    // Recupera atributos da aresta antiga pra preservar no novo
    const oldData = oldEdge.data as EncadeamentoEdgeData | undefined
    const oldRaw = rawEdges.find(e => e.id === oldEdge.id)
    try {
      await (trpc.servico as any).removeEncadeamento.mutate({ id: oldEdge.id })
      try {
        await (trpc.servico as any).addEncadeamento.mutate({
          servicoOrigemId: newConnection.source,
          servicoDestinoId: newConnection.target,
          ordem: oldRaw?.ordem ?? 0,
          iniciaAuto: oldData?.iniciaAuto ?? true,
          obrigatorio: oldData?.obrigatorio ?? true,
          herdaResponsavel: true, // não exposto no data; assume true (default do template)
          condicao: oldData?.condicao ?? null,
          observacao: oldRaw?.observacao ?? null,
          rotulo: oldData?.rotulo ?? null,
        })
        await alerts.success('Conexão atualizada', 'Aresta reconectada.')
        onChanged?.()
      } catch (addErr) {
        // Falha no add depois do remove → tenta rollback recriando a aresta original
        try {
          await (trpc.servico as any).addEncadeamento.mutate({
            servicoOrigemId: oldEdge.source,
            servicoDestinoId: oldEdge.target,
            ordem: oldRaw?.ordem ?? 0,
            iniciaAuto: oldData?.iniciaAuto ?? true,
            obrigatorio: oldData?.obrigatorio ?? true,
            herdaResponsavel: true,
            condicao: oldData?.condicao ?? null,
            observacao: oldRaw?.observacao ?? null,
            rotulo: oldData?.rotulo ?? null,
          })
        } catch { /* rollback best-effort */ }
        throw addErr
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      onChanged?.()
    }
  }, [podeEditar, edges, rawEdges, onChanged])

  const onEdgesDelete = useCallback(async (toDelete: Edge[]) => {
    if (!podeEditar) return
    if (toDelete.length === 0) return
    const ok = await alerts.confirm({
      title: toDelete.length === 1 ? 'Remover conexão' : `Remover ${toDelete.length} conexões`,
      text: toDelete.length === 1
        ? 'O sucessor não será mais criado automaticamente.'
        : 'Os sucessores não serão mais criados automaticamente.',
      confirmText: 'Remover',
    })
    if (!ok) {
      // Aborta: força recarregar pra repintar
      onChanged?.()
      return
    }
    try {
      await Promise.all(toDelete.map(e =>
        (trpc.servico as any).removeEncadeamento.mutate({ id: e.id }),
      ))
      await alerts.success('Removido', `${toDelete.length} conexão(ões) removida(s).`)
      onChanged?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }, [podeEditar])

  // ── Handlers dos +/- nos cantos dos blocos ──────────────────
  //   + abre a palette em modo "adicionar a partir deste nó" — direção
  //     succ (à direita) ou pred (à esquerda). O clique no catálogo cria
  //     a conexão direta sem abrir o modal de origem/destino.
  //   - remove as conexões existentes desse lado (com confirm).

  const handleAddFromNode = useCallback((nodeId: string, direction: 'succ' | 'pred') => {
    const n = rawNodes.find(x => x.id === nodeId)
    if (!n) return
    setAddingFromNode({ nodeId, nome: n.nome, direction })
    setPaletteOpen(true)
  }, [rawNodes])

  const removeEdgesOfNode = useCallback(async (nodeId: string, direction: 'succ' | 'pred') => {
    if (!podeEditar) return
    const matchingEdges = rawEdges.filter(e =>
      direction === 'succ' ? e.servicoOrigemId === nodeId : e.servicoDestinoId === nodeId,
    )
    if (matchingEdges.length === 0) return
    const otherName = (e: typeof matchingEdges[number]) => {
      const otherId = direction === 'succ' ? e.servicoDestinoId : e.servicoOrigemId
      return rawNodes.find(x => x.id === otherId)?.nome ?? '(?)'
    }
    const label = direction === 'succ' ? 'sucessor' : 'predecessor'
    const lista = matchingEdges.map(otherName).join(', ')
    const ok = await alerts.confirm({
      title: matchingEdges.length === 1 ? `Remover ${label}` : `Remover ${matchingEdges.length} ${label}es`,
      text: matchingEdges.length === 1
        ? `Conexão com "${lista}" será removida.`
        : `Conexões com: ${lista}`,
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await Promise.all(matchingEdges.map(e =>
        (trpc.servico as any).removeEncadeamento.mutate({ id: e.id }),
      ))
      await alerts.success('Removido', `${matchingEdges.length} conexão(ões) removida(s).`)
      onChanged?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }, [podeEditar, rawEdges, rawNodes])

  // Mapa de contagem de edges por nó — usado pra mostrar/esconder o "−".
  const edgeCounts = useMemo(() => {
    const m = new Map<string, { pred: number; succ: number }>()
    for (const e of rawEdges) {
      const o = m.get(e.servicoOrigemId) ?? { pred: 0, succ: 0 }
      o.succ += 1
      m.set(e.servicoOrigemId, o)
      const d = m.get(e.servicoDestinoId) ?? { pred: 0, succ: 0 }
      d.pred += 1
      m.set(e.servicoDestinoId, d)
    }
    return m
  }, [rawEdges])

  // Estado controlado dos nodes (pra suportar drag persistente).
  // Posições iniciais: usa position_xy se houver; senão dagre auto-layout.
  const [nodes, setNodes] = useState<Node[]>(() => {
    console.log('[FluxoEditor] INIT rootId=', rootId, 'rawNodes com position_xy:',
      rawNodes.map(n => ({ id: n.id.slice(-6), pos_xy: n.position_xy })))
    const flow: Node[] = rawNodes.map(n => ({
      id: n.id,
      type: tipoToFlowType(n.tipo),
      position: n.position_xy ?? { x: 0, y: 0 },
      data: { node: n, rootId, onExpand, isExpanded: false } as ServicoNodeData,
      draggable: podeEditar && n.position !== 'ANCESTRAL', // ancestrais não move
      selectable: true,
      // Outline tracejado amber pra blocos órfãos — destaca que estão sem
      // conexão e precisam ser reconectados ou removidos.
      className: n.position === 'ORFAO' ? 'fluxo-node-orfao' : undefined,
    }))
    // Aplica dagre apenas em nodes sem layout salvo
    const semLayout = flow.filter(n => !(n.data as ServicoNodeData).node.position_xy)
    console.log('[FluxoEditor] INIT semLayout=', semLayout.length, 'total=', flow.length)
    if (semLayout.length === flow.length) {
      // Todos sem layout → aplica em tudo
      console.log('[FluxoEditor] INIT → dagre em tudo')
      return applyDagreLayout(flow, edges, 'LR')
    } else if (semLayout.length > 0) {
      // Misto: aplica dagre só nos sem layout, preserva os salvos
      console.log('[FluxoEditor] INIT → dagre misto')
      const laidOut = applyDagreLayout(flow, edges, 'LR')
      return flow.map(n => {
        const saved = (n.data as ServicoNodeData).node.position_xy
        if (saved) return n
        const fromLayout = laidOut.find(x => x.id === n.id)
        return fromLayout ?? n
      })
    }
    console.log('[FluxoEditor] INIT → usa positions salvas')
    return flow
  })

  // Auto-save com debounce: 600ms após última mudança de posição
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const persistPositions = useCallback(async (currentNodes: Node[]) => {
    if (!podeEditar) return
    setSaving(true)
    try {
      const positions = currentNodes
        .filter(n => (n.data as ServicoNodeData).node.position !== 'ANCESTRAL')
        .map(n => ({ nodeId: n.id, x: n.position.x, y: n.position.y }))
      console.log('[FluxoEditor] SAVE rootId=', rootId, 'positions=', positions)
      const result = await (trpc.servico as any).saveFluxoLayout.mutate({ rootId, positions })
      console.log('[FluxoEditor] SAVE ok →', result)
    } catch (e) {
      console.warn('[FluxoEditor] SAVE layout falhou:', (e as Error).message, e)
    } finally {
      setSaving(false)
    }
  }, [rootId, podeEditar])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(prev => {
      const next = applyNodeChanges(changes, prev)
      // Detecta mudança de posição (drag) — auto-save
      const moved = changes.some(c => c.type === 'position' && !c.dragging)
      if (moved && podeEditar) {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => { void persistPositions(next) }, 600)
      }
      return next
    })
  }, [persistPositions, podeEditar])

  // Carrega catálogo de todos os serviços quando a palette abre (1x)
  useEffect(() => {
    if (!paletteOpen || todosServicos.length > 0 || loadingTodos) return
    setLoadingTodos(true)
    ;(trpc.servico as any).listServicos.query()
      .then((data: Array<{ id: string; nome: string; categoria: string | null; tipo?: string; ehObrigacaoAcessoria?: boolean }>) => {
        setTodosServicos(data || [])
      })
      .catch(() => setTodosServicos([]))
      .finally(() => setLoadingTodos(false))
  }, [paletteOpen, todosServicos.length, loadingTodos])

  // Cria um Servico novo do tipo escolhido (não-ATIVIDADE) e o adiciona ao fluxo.
  // Reaproveita o mesmo modal de "origem" abrindo addingDest depois de criar.
  const criarNovoBloco = useCallback(async () => {
    if (!novoBlocoTipo) return
    const nome = novoBlocoNome.trim()
    if (!nome) { alerts.error('Erro', 'Informe o nome do bloco.'); return }
    // Validações extras pra PERGUNTA
    if (novoBlocoTipo === 'PERGUNTA') {
      if (!perguntaTexto.trim()) { alerts.error('Erro', 'Informe o texto da pergunta.'); return }
      if (perguntaOpcoes.length < 2) { alerts.error('Erro', 'Pergunta precisa de pelo menos 2 opções.'); return }
    }
    setAddingBusy(true)
    try {
      const payload: Record<string, unknown> = {
        nome,
        tipo: novoBlocoTipo,
        prioridadePadrao: 'MEDIA',
        disponivelOrcamento: false, // blocos do fluxograma não vão pro orçamento por padrão
        recorrenteMensal: false,
      }
      if (novoBlocoTipo === 'PERGUNTA') {
        payload.perguntaTexto = perguntaTexto.trim()
        payload.perguntaOpcoes = perguntaOpcoes
        payload.perguntaMulti = perguntaMulti
      }
      const created = await (trpc.servico as any).createServico.mutate(payload)
      // INICIO não precisa de origem (é o ponto de partida). Demais sim.
      if (novoBlocoTipo === 'INICIO') {
        // Cria conexão de INICIO → raiz (raiz vira sucessor do início)
        await (trpc.servico as any).addEncadeamento.mutate({
          servicoOrigemId: created.id,
          servicoDestinoId: rootId,
          ordem: 0,
          iniciaAuto: true,
          obrigatorio: true,
          herdaResponsavel: true,
        })
        await alerts.success('Início criado', 'Bloco adicionado. Recarregando…')
        onChanged?.()
        return
      }
      // Para demais tipos, abre o modal pra escolher origem
      setNovoBlocoTipo(null)
      setNovoBlocoNome('')
      setAddingDest({ servicoId: created.id, nome })
      setOrigemSelect(rootId)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setAddingBusy(false)
    }
  }, [novoBlocoTipo, novoBlocoNome, rootId])

  // Adiciona um serviço ao fluxo criando encadeamento com a origem escolhida
  const adicionarServicoAoFluxo = useCallback(async () => {
    if (!addingDest || !origemSelect) return
    if (criariaLoop(origemSelect, addingDest.servicoId)) {
      alerts.error('Ciclo', 'Essa conexão criaria um loop.')
      return
    }
    if (rawEdges.some(e => e.servicoOrigemId === origemSelect && e.servicoDestinoId === addingDest.servicoId)) {
      alerts.error('Já existe', 'Essa conexão já está cadastrada.')
      return
    }
    setAddingBusy(true)
    try {
      await (trpc.servico as any).addEncadeamento.mutate({
        servicoOrigemId: origemSelect,
        servicoDestinoId: addingDest.servicoId,
        ordem: 0,
        iniciaAuto: true,
        obrigatorio: true,
        herdaResponsavel: true,
      })
      setAddingDest(null)
      setOrigemSelect('')
      await alerts.success('Adicionado', 'Serviço incluído no fluxo. Recarregando…')
      onChanged?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setAddingBusy(false)
    }
  }, [addingDest, origemSelect, criariaLoop, rawEdges])

  // Serviços disponíveis na palette: todos menos os que já estão no fluxo
  const servicosDisponiveis = useMemo(() => {
    const noFluxo = new Set(rawNodes.map(n => n.id))
    const q = paletteSearch.trim().toLowerCase()
    return todosServicos
      // Catálogo do fluxo é só de serviços — obrigações acessórias têm engine própria
      .filter(s => !s.ehObrigacaoAcessoria)
      .filter(s => !noFluxo.has(s.id))
      .filter(s => !q || s.nome.toLowerCase().includes(q) || (s.categoria?.toLowerCase().includes(q) ?? false))
      .slice(0, 100)
  }, [todosServicos, rawNodes, paletteSearch])

  // Blocos do fluxo onde pode conectar (apenas raiz + sucessores, não ancestrais)
  const blocosConectaveis = useMemo(
    () => rawNodes.filter(n => n.position !== 'ANCESTRAL'),
    [rawNodes],
  )

  const reorganizar = useCallback(async () => {
    if (!podeEditar) return
    const ok = await alerts.confirm({
      title: 'Auto-organizar fluxo',
      text: 'Os blocos serão reposicionados pelo algoritmo dagre. O layout customizado salvo será sobrescrito.',
      confirmText: 'Reorganizar',
      icon: 'question',
    })
    if (!ok) return
    try {
      await (trpc.servico as any).resetFluxoLayout.mutate({ rootId })
      const flow: Node[] = rawNodes.map(n => ({
        id: n.id,
        type: tipoToFlowType(n.tipo),
        position: { x: 0, y: 0 },
        data: { node: n, rootId, onExpand, isExpanded: expanded?.nodeId === n.id } as ServicoNodeData,
        draggable: podeEditar && n.position !== 'ANCESTRAL',
        selectable: true,
        className: n.position === 'ORFAO' ? 'fluxo-node-orfao' : undefined,
      }))
      const laidOut = applyDagreLayout(flow, edges, 'LR')
      setNodes(laidOut)
      // Salva o novo layout calculado
      const positions = laidOut
        .filter(n => (n.data as ServicoNodeData).node.position !== 'ANCESTRAL')
        .map(n => ({ nodeId: n.id, x: n.position.x, y: n.position.y }))
      await (trpc.servico as any).saveFluxoLayout.mutate({ rootId, positions })
      await alerts.success('Reorganizado', 'Layout regenerado.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }, [rootId, rawNodes, edges, onExpand, expanded, podeEditar])

  // Sincroniza isExpanded no data (sem recalcular layout)
  const nodesWithExpanded = useMemo(
    () => nodes.map(n => {
      const counts = edgeCounts.get(n.id) ?? { pred: 0, succ: 0 }
      const baseData = n.data as ServicoNodeData
      const isAncestral = baseData.node.position === 'ANCESTRAL'
      return {
        ...n,
        data: {
          ...baseData,
          isExpanded: expanded?.nodeId === n.id,
          predCount: counts.pred,
          succCount: counts.succ,
          // Callbacks ficam undefined pra ancestrais/read-only — assim o
          // NodeEdgeButtons nem renderiza.
          onAddPred: (podeEditar && !isAncestral) ? (id: string) => handleAddFromNode(id, 'pred') : undefined,
          onAddSucc: (podeEditar && !isAncestral) ? (id: string) => handleAddFromNode(id, 'succ') : undefined,
          onRemovePred: (podeEditar && !isAncestral && counts.pred > 0) ? (id: string) => removeEdgesOfNode(id, 'pred') : undefined,
          onRemoveSucc: (podeEditar && !isAncestral && counts.succ > 0) ? (id: string) => removeEdgesOfNode(id, 'succ') : undefined,
        } as ServicoNodeData,
      }
    }),
    [nodes, expanded, edgeCounts, podeEditar, handleAddFromNode, removeEdgesOfNode],
  )

  if (rawNodes.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-12">Sem fluxo configurado.</p>
  }

  // Quantidade de blocos órfãos (sem aresta de entrada nem saída) — alerta no topo
  // pra orientar o usuário a reconectar ou remover.
  const totalOrfaos = rawNodes.filter(n => n.position === 'ORFAO').length

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[80] bg-background p-4' : 'relative'}
      style={fullscreen ? undefined : { height: 600 }}
    >
      {totalOrfaos > 0 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[5] flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs shadow-md">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="font-medium">
            {totalOrfaos} bloco{totalOrfaos > 1 ? 's' : ''} sem conexão
          </span>
          <span className="text-amber-800">— arraste uma seta a partir/para o bloco pra reconectá-lo</span>
        </div>
      )}
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodesWithExpanded}
          edges={edges}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onEdgeClick={onEdgeClick}
          onReconnect={onReconnect}
          edgesReconnectable={podeEditar}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={podeEditar}
          nodesConnectable={podeEditar}
          edgesFocusable={podeEditar}
          deleteKeyCode={podeEditar ? ['Delete', 'Backspace'] : null}
          elementsSelectable={true}
          connectionRadius={36}
          snapToGrid={snapToGrid}
          snapGrid={[16, 16]}
          // Box selection com botão esquerdo (igual Figma); pan no botão
          // do meio/direito (índices 1 e 2). Drag de bloco continua normal.
          selectionOnDrag
          panOnDrag={[1, 2]}
          selectNodesOnDrag
          // Quando o user arrasta um bloco próximo da borda do canvas,
          // a câmera acompanha automaticamente — sem precisar dar pan manual.
          autoPanOnNodeDrag
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e7eb" />
          {/* Atalho Ctrl/Cmd+F abre uma caixa de busca por nome de bloco */}
          <NodeSearchOverlay nodes={rawNodes} />
          <Controls showInteractive={false} />
          {minimapOn && (
            <MiniMap
              pannable
              zoomable
              nodeStrokeWidth={3}
              nodeColor={(n) => {
                const d = n.data as ServicoNodeData
                if (!d?.node) return '#94a3b8'
                if (d.node.position === 'RAIZ') return '#047857'
                if (d.node.position === 'ANCESTRAL') return '#d1d5db'
                return '#10b981'
              }}
              style={{ height: 80, width: 140 }}
            />
          )}
          {/* Toolbar esquerda — toggle da palette de serviços */}
          {podeEditar && (
            <Panel position="top-left" className="flex items-stretch gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPaletteOpen(v => !v)}
                className="gap-1.5 bg-white/80 dark:bg-black/40 backdrop-blur-sm"
                title={paletteOpen ? 'Fechar catálogo de serviços' : 'Abrir catálogo de serviços'}
              >
                {paletteOpen
                  ? <PanelLeftClose className="h-3.5 w-3.5" />
                  : <PanelLeftOpen className="h-3.5 w-3.5" />}
                Catálogo
              </Button>
              {paletteOpen && (
                <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-lg w-[300px] flex flex-col overflow-hidden" style={{ maxHeight: 'min(640px, calc(100vh - 12rem))' }}>
                  {/* Faixa de contexto — visível quando o usuário clicou no +/− de um bloco */}
                  {addingFromNode && (
                    <div className="px-3 py-2 border-b bg-emerald-50 dark:bg-emerald-950/30 text-[11px] flex items-start gap-2">
                      <div className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-600 text-white mt-0.5">
                        <Plus className="h-3 w-3" strokeWidth={3} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-emerald-800 dark:text-emerald-200">
                          Adicionar {addingFromNode.direction === 'succ' ? 'sucessor de' : 'predecessor de'}
                        </div>
                        <div className="truncate text-emerald-700 dark:text-emerald-300" title={addingFromNode.nome}>{addingFromNode.nome}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Clique num serviço abaixo pra conectar direto.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddingFromNode(null)}
                        className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Cancelar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {/* Seção: Novo bloco primitivo */}
                  <div className="px-3 py-2 border-b bg-muted/30">
                    <div className="text-[11px] font-semibold mb-1.5">Novo bloco</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { tipo: 'ATIVIDADE' as const, label: 'Ativ.', color: '#10b981', shape: 'rect' },
                        { tipo: 'DECISAO' as const, label: 'Decis.', color: '#a855f7', shape: 'diamond' },
                        { tipo: 'PERGUNTA' as const, label: 'Pergunta', color: '#f59e0b', shape: 'question' },
                        { tipo: 'DOCUMENTACAO' as const, label: 'Doc.', color: '#3b82f6', shape: 'document' },
                        { tipo: 'INICIO' as const, label: 'Início', color: '#16a34a', shape: 'circle' },
                        { tipo: 'FIM' as const, label: 'Fim', color: '#dc2626', shape: 'circle' },
                      ]).map(b => (
                        <button
                          key={b.tipo}
                          type="button"
                          onClick={() => {
                            setNovoBlocoTipo(b.tipo)
                            setNovoBlocoNome('')
                            // Reseta campos do PERGUNTA para os defaults toda vez que abre
                            // (caso contrário, o segundo bloco herdaria os valores do anterior)
                            if (b.tipo === 'PERGUNTA') {
                              setPerguntaTexto('Serviço mensal em todas as áreas?')
                              setPerguntaOpcoes(['Contábil', 'Trabalhista', 'Fiscal'])
                              setPerguntaOpcaoNova('')
                              setPerguntaMulti(true)
                            }
                          }}
                          className="flex flex-col items-center gap-0.5 p-1.5 rounded border bg-white dark:bg-gray-800 hover:border-emerald-400 transition-colors"
                          title={b.tipo}
                        >
                          {/* Mini-shape preview */}
                          {b.shape === 'rect' && (
                            <div className="h-4 w-7 rounded-sm" style={{ background: `${b.color}25`, border: `1.5px solid ${b.color}` }} />
                          )}
                          {b.shape === 'diamond' && (
                            <div className="h-4 w-4" style={{ background: `${b.color}25`, border: `1.5px solid ${b.color}`, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
                          )}
                          {b.shape === 'document' && (
                            <div className="h-4 w-7" style={{ background: `${b.color}25`, border: `1.5px solid ${b.color}`, clipPath: 'polygon(0 0, 100% 0, 100% 78%, 80% 100%, 60% 78%, 40% 100%, 20% 78%, 0 100%)' }} />
                          )}
                          {b.shape === 'circle' && (
                            <div className="h-4 w-4 rounded-full" style={{ background: `${b.color}25`, border: `1.5px solid ${b.color}` }} />
                          )}
                          {b.shape === 'question' && (
                            <div className="h-4 w-7 rounded-sm flex items-center justify-center" style={{ background: `${b.color}25`, border: `1.5px solid ${b.color}` }}>
                              <span className="text-[8px] font-bold leading-none" style={{ color: b.color }}>?</span>
                            </div>
                          )}
                          <span className="text-[9px] font-medium text-foreground">{b.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Seção: Catálogo de serviços existentes */}
                  <div className="px-3 py-2 border-b">
                    <div className="text-[11px] font-semibold mb-1.5">Catálogo de Serviços</div>
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={paletteSearch}
                        onChange={e => setPaletteSearch(e.target.value)}
                        placeholder="Buscar..."
                        className="h-7 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1">
                    {loadingTodos ? (
                      <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                      </div>
                    ) : servicosDisponiveis.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-6 italic">
                        {paletteSearch ? 'Nenhum serviço encontrado' : 'Todos os serviços já estão no fluxo'}
                      </div>
                    ) : servicosDisponiveis.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={async () => {
                          // Modo "vinculado a um nó" (clicou no +/− de um bloco):
                          // cria a aresta na direção certa direto, sem modal.
                          if (addingFromNode) {
                            const origemId  = addingFromNode.direction === 'succ' ? addingFromNode.nodeId : s.id
                            const destinoId = addingFromNode.direction === 'succ' ? s.id : addingFromNode.nodeId
                            if (criariaLoop(origemId, destinoId)) {
                              alerts.error('Ciclo', 'Essa conexão criaria um loop.')
                              return
                            }
                            if (rawEdges.some(e => e.servicoOrigemId === origemId && e.servicoDestinoId === destinoId)) {
                              alerts.error('Já existe', 'Essa conexão já está cadastrada.')
                              return
                            }
                            try {
                              await (trpc.servico as any).addEncadeamento.mutate({
                                servicoOrigemId: origemId,
                                servicoDestinoId: destinoId,
                                ordem: 0,
                                iniciaAuto: true,
                                obrigatorio: true,
                                herdaResponsavel: true,
                              })
                              setAddingFromNode(null)
                              setPaletteOpen(false)
                              await alerts.success('Adicionado', 'Conexão criada. Recarregando…')
                              onChanged?.()
                            } catch (e) {
                              alerts.error('Erro', (e as Error).message)
                            }
                            return
                          }
                          // Modo legado — palette aberta pelo botão "Catálogo":
                          // abre modal pra usuário escolher a origem.
                          setAddingDest({ servicoId: s.id, nome: s.nome })
                          // Pre-seleciona o serviço-raiz como origem padrão
                          setOrigemSelect(rootId)
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors group"
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: s.tipo === 'DECISAO' ? '#a855f7' : '#10b981' }}
                          />
                          <span className="text-[12px] font-medium truncate flex-1">{s.nome}</span>
                          <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 text-emerald-600 shrink-0" />
                        </div>
                        {s.categoria && (
                          <div className="text-[10px] text-muted-foreground ml-3 truncate">{s.categoria}</div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/30">
                    {servicosDisponiveis.length} disponível{servicosDisponiveis.length === 1 ? '' : 's'}
                    {' · '}
                    <span title="Para conectar dois serviços já no fluxo, arraste de um handle ao outro.">arraste handles pra conectar no canvas</span>
                  </div>
                </div>
              )}
            </Panel>
          )}

          <Panel position="top-right" className="flex items-center gap-2">
            {saving && (
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 bg-white/80 dark:bg-black/40 rounded px-2 py-1 backdrop-blur-sm">
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
              </span>
            )}
            <Button
              size="icon"
              variant="outline"
              onClick={() => setMinimapOn(v => !v)}
              className="h-8 w-8 bg-white/80 dark:bg-black/40 backdrop-blur-sm"
              title={minimapOn ? 'Ocultar minimap' : 'Mostrar minimap'}
            >
              {minimapOn ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={toggleSnapToGrid}
              className={cn(
                'h-8 w-8 backdrop-blur-sm',
                snapToGrid
                  ? 'bg-sky-100 dark:bg-sky-900/40 border-sky-400 text-sky-700 dark:text-sky-300'
                  : 'bg-white/80 dark:bg-black/40',
              )}
              title={snapToGrid ? 'Alinhamento à grade ativo (clique pra liberar)' : 'Alinhar à grade'}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setFullscreen(v => !v)}
              className="h-8 w-8 bg-white/80 dark:bg-black/40 backdrop-blur-sm"
              title={fullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            {podeEditar && (
              <Button
                size="sm"
                variant="outline"
                onClick={reorganizar}
                className="gap-1.5 bg-white/80 dark:bg-black/40 backdrop-blur-sm"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Auto-organizar
              </Button>
            )}
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>

      {/* Dialog: rotular aresta (Sim/Não/Sem rótulo pra DECISAO, texto livre pra demais).
          Aparece em 2 fluxos: criação (vinda de onConnect com origem DECISAO) e
          edição (duplo-clique numa aresta existente). */}
      {rotuloDialog && createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setRotuloDialog(null); setRotuloLivreText('') }}
        >
          <div
            className="bg-card border rounded-lg shadow-xl w-[420px] max-w-[90vw] p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  {rotuloDialog.mode === 'decisao'
                    ? 'Esta saída representa qual resposta?'
                    : rotuloDialog.mode === 'pergunta'
                      ? 'Qual opção da pergunta dispara esta aresta?'
                      : 'Rótulo da aresta'}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {rotuloDialog.mode === 'decisao' && 'Saídas de blocos DECISÃO usam rótulos pra deixar o roteamento claro no fluxo.'}
                  {rotuloDialog.mode === 'pergunta' && 'Esta aresta só dispara quando o gestor escolhe a opção selecionada abaixo. Configure no bloco PERGUNTA pra adicionar/editar as opções.'}
                  {rotuloDialog.mode === 'livre' && 'Texto curto (até 80 caracteres) exibido na aresta.'}
                  {rotuloDialog.edgeId && rotuloDialog.currentValue && (
                    <span className="block mt-1 text-foreground">
                      Atual: <strong>{rotuloDialog.currentValue}</strong>
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setRotuloDialog(null); setRotuloLivreText('') }}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {rotuloDialog.mode === 'decisao' ? (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => aplicarRotulo('Sim')}
                  className="text-white"
                  style={{ backgroundColor: '#16a34a' }}
                >
                  Sim
                </Button>
                <Button
                  size="sm"
                  onClick={() => aplicarRotulo('Não')}
                  className="text-white"
                  style={{ backgroundColor: '#dc2626' }}
                >
                  Não
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => aplicarRotulo(null)}
                >
                  Sem rótulo
                </Button>
              </div>
            ) : rotuloDialog.mode === 'pergunta' ? (
              <div className="space-y-2 pt-1">
                {(rotuloDialog.opcoesPermitidas ?? []).length === 0 ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                    O bloco PERGUNTA de origem não tem opções configuradas. Edite o bloco e adicione opções antes de rotular a aresta.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5">
                    {(rotuloDialog.opcoesPermitidas ?? []).map((op) => {
                      const isAtual = rotuloDialog.currentValue?.toLowerCase() === op.toLowerCase()
                      return (
                        <button
                          key={op}
                          type="button"
                          onClick={() => aplicarRotulo(op)}
                          className={cn(
                            'flex items-center justify-between gap-2 px-3 py-2 rounded border text-sm transition-colors',
                            isAtual
                              ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-semibold'
                              : 'border-border hover:bg-muted/50',
                          )}
                        >
                          <span>{op}</span>
                          {isAtual && <span className="text-[10px] uppercase tracking-wider">Atual</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="flex justify-between gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => aplicarRotulo(null)}>
                    Limpar rótulo
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setRotuloDialog(null); setRotuloLivreText('') }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  autoFocus
                  value={rotuloLivreText}
                  onChange={e => setRotuloLivreText(e.target.value.slice(0, 80))}
                  placeholder="Ex: Aprovado, Pendente, Reprovado…"
                  maxLength={80}
                  className="h-9 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') void aplicarRotulo(rotuloLivreText) }}
                />
                <div className="flex justify-between items-center gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => aplicarRotulo(null)}>
                    Limpar rótulo
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setRotuloDialog(null); setRotuloLivreText('') }}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => aplicarRotulo(rotuloLivreText)}
                      style={{ backgroundColor: '#10b981' }}
                      className="text-white"
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* Dialog: substituir entradas existentes (quando target já tem aresta(s) de entrada) */}
      {substituirDialog && createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !substituirBusy && setSubstituirDialog(null)}
        >
          <div
            className="bg-card border rounded-lg shadow-xl w-[460px] max-w-[90vw] p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Link2 className="h-4 w-4 text-amber-600" />
                  Bloco já recebe {substituirDialog.existentes.length === 1 ? 'uma seta' : `${substituirDialog.existentes.length} setas`}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {(() => {
                    const target = rawNodes.find(n => n.id === substituirDialog.pendingConnection.target)?.nome ?? 'destino'
                    const source = rawNodes.find(n => n.id === substituirDialog.pendingConnection.source)?.nome ?? 'origem'
                    const lista = substituirDialog.existentes.map(e => e.sourceNome).join(', ')
                    return (
                      <>O bloco <strong>{target}</strong> já tem entrada de <strong>{lista}</strong>. Você está criando nova seta de <strong>{source}</strong>.</>
                    )
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !substituirBusy && setSubstituirDialog(null)}
                disabled={substituirBusy}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button
                size="sm"
                onClick={() => resolverSubstituicao('substituir')}
                disabled={substituirBusy}
                className="gap-1.5 justify-start"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}
              >
                {substituirBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minus className="h-3.5 w-3.5" />}
                Substituir — remove a{substituirDialog.existentes.length > 1 ? 's' : ''} existente{substituirDialog.existentes.length > 1 ? 's' : ''} e cria a nova
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolverSubstituicao('adicionar')}
                disabled={substituirBusy}
                className="gap-1.5 justify-start"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar — mantém as existentes e cria a nova como entrada adicional
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSubstituirDialog(null)}
                disabled={substituirBusy}
                className="justify-start"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Dialog: criar novo bloco primitivo (pede nome, depois cai no fluxo de origem) */}
      {novoBlocoTipo && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setNovoBlocoTipo(null)}>
          <div
            className="bg-card border rounded-lg shadow-xl w-[420px] max-w-[90vw] p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-emerald-600" />
                  Novo bloco — {novoBlocoTipo === 'ATIVIDADE' ? 'Atividade'
                    : novoBlocoTipo === 'DECISAO' ? 'Decisão'
                    : novoBlocoTipo === 'DOCUMENTACAO' ? 'Documentação'
                    : novoBlocoTipo === 'INICIO' ? 'Início'
                    : novoBlocoTipo === 'PERGUNTA' ? 'Pergunta'
                    : 'Fim'}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {novoBlocoTipo === 'DECISAO' && 'Losango que roteia conforme condições nas saídas.'}
                  {novoBlocoTipo === 'DOCUMENTACAO' && 'Marco informativo no fluxo (sem etapas).'}
                  {novoBlocoTipo === 'INICIO' && 'Marcador de entrada — vai apontar para o serviço-raiz.'}
                  {novoBlocoTipo === 'FIM' && 'Marcador de saída — encerra um ramo do fluxo.'}
                  {novoBlocoTipo === 'ATIVIDADE' && 'Bloco executável com etapas/passos (configure depois).'}
                  {novoBlocoTipo === 'PERGUNTA' && 'Decisão interativa — execução pausa esperando o gestor escolher uma das opções.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNovoBlocoTipo(null)}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground">Nome *</label>
              <Input
                autoFocus
                value={novoBlocoNome}
                onChange={e => setNovoBlocoNome(e.target.value)}
                placeholder={
                  novoBlocoTipo === 'DECISAO' ? 'Ex: Cliente é PJ?'
                  : novoBlocoTipo === 'DOCUMENTACAO' ? 'Ex: Verificar documentação fiscal'
                  : novoBlocoTipo === 'INICIO' ? 'Ex: Início do processo'
                  : novoBlocoTipo === 'FIM' ? 'Ex: Processo concluído'
                  : novoBlocoTipo === 'PERGUNTA' ? 'Ex: Definir áreas contratadas'
                  : 'Ex: Nome da atividade'
                }
                className="h-9 text-sm"
                onKeyDown={e => { if (e.key === 'Enter' && novoBlocoNome.trim() && novoBlocoTipo !== 'PERGUNTA') void criarNovoBloco() }}
              />
            </div>

            {/* Campos específicos do PERGUNTA — pré-preenchidos com as 3 áreas */}
            {novoBlocoTipo === 'PERGUNTA' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-foreground">Pergunta exibida ao gestor *</label>
                  <textarea
                    value={perguntaTexto}
                    onChange={e => setPerguntaTexto(e.target.value)}
                    placeholder="Ex: Serviço mensal em todas as áreas?"
                    rows={2}
                    maxLength={500}
                    className="w-full text-sm border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-foreground">
                    Opções de resposta * <span className="text-muted-foreground font-normal">(viram rótulos das arestas)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {perguntaOpcoes.map((op, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b55' }}
                      >
                        {op}
                        <button
                          type="button"
                          onClick={() => setPerguntaOpcoes(prev => prev.filter((_, i) => i !== idx))}
                          className="hover:text-red-600"
                          title="Remover opção"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={perguntaOpcaoNova}
                      onChange={e => setPerguntaOpcaoNova(e.target.value)}
                      placeholder="Nova opção"
                      maxLength={80}
                      className="h-8 text-sm"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const v = perguntaOpcaoNova.trim()
                          if (v && !perguntaOpcoes.includes(v) && perguntaOpcoes.length < 20) {
                            setPerguntaOpcoes(prev => [...prev, v])
                            setPerguntaOpcaoNova('')
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const v = perguntaOpcaoNova.trim()
                        if (v && !perguntaOpcoes.includes(v) && perguntaOpcoes.length < 20) {
                          setPerguntaOpcoes(prev => [...prev, v])
                          setPerguntaOpcaoNova('')
                        }
                      }}
                      disabled={!perguntaOpcaoNova.trim() || perguntaOpcoes.length >= 20}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Cada opção deve casar com o rótulo de uma aresta de saída deste bloco.
                    Defina os rótulos por duplo-clique nas arestas após criar o bloco.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={perguntaMulti}
                    onChange={e => setPerguntaMulti(e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="font-medium">Permitir múltipla escolha</span>
                  <span className="text-muted-foreground font-normal">
                    (várias opções em paralelo)
                  </span>
                </label>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setNovoBlocoTipo(null)} disabled={addingBusy}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={criarNovoBloco}
                disabled={addingBusy || !novoBlocoNome.trim()}
                style={{ backgroundColor: '#10b981' }}
                className="text-white gap-1.5"
              >
                {addingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {novoBlocoTipo === 'INICIO' ? 'Criar e conectar à raiz' : 'Próximo: escolher origem'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Dialog: escolher bloco origem ao adicionar serviço da palette */}
      {addingDest && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAddingDest(null)}>
          <div
            className="bg-card border rounded-lg shadow-xl w-[440px] max-w-[90vw] p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-emerald-600" />
                  Adicionar serviço ao fluxo
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Vou adicionar <strong>{addingDest.nome}</strong> como sucessor de qual bloco?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddingDest(null)}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground">Bloco origem *</label>
              <select
                value={origemSelect}
                onChange={e => setOrigemSelect(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Selecione —</option>
                {blocosConectaveis.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.nome}{b.id === rootId ? ' (raiz)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                O sucessor será criado com defaults (auto-início, obrigatório, herda responsável).
                Você pode editar as flags depois clicando na aresta.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setAddingDest(null)} disabled={addingBusy}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={adicionarServicoAoFluxo}
                disabled={addingBusy || !origemSelect}
                style={{ backgroundColor: '#10b981' }}
                className="text-white gap-1.5"
              >
                {addingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Popover de prévia (mantido do FluxoGraph antigo) */}
      {expanded && (() => {
        const node = rawNodes.find(n => n.id === expanded.nodeId)
        if (!node) return null
        return (
          <PreviewPopover
            node={node}
            triggerRect={expanded.rect}
            onClose={() => setExpanded(null)}
            onOpenServico={() => {
              setExpanded(null)
              if (typeof window !== 'undefined') window.location.href = `/servicos/${node.id}`
            }}
            isRoot={node.position === 'RAIZ'}
            onChanged={onChanged}
            podeEditar={podeEditar}
          />
        )
      })()}

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border-2" style={{ borderColor: '#9ca3af', borderStyle: 'dashed' }} />
          Anterior (cadeia)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#047857' }} />
          Raiz (atual)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#10b981' }} />
          Sucessor
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: '#f59e0b' }} />
          Manual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: '#0ea5e9' }} />
          Opcional
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#a78bfa' }} />
          Condicional
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PreviewPopover (mantém o que estava em page.tsx)
// ─────────────────────────────────────────────────────────────
/**
 * Overlay de busca por nome de bloco. Atalho global Ctrl/Cmd+F dentro do
 * editor abre uma caixa flutuante; Enter ou clique vai pro bloco usando
 * `setCenter` com animação curta. Esc fecha.
 *
 * Vive dentro do <ReactFlowProvider>, então useReactFlow funciona.
 */
function NodeSearchOverlay({ nodes }: { nodes: FluxoNode[] }) {
  const { setCenter, getZoom } = useReactFlow()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Atalho Ctrl/Cmd+F — escuta no document
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isFind = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f'
      if (isFind) {
        e.preventDefault()
        setOpen(true)
        setQuery('')
        setActiveIdx(0)
        setTimeout(() => inputRef.current?.focus(), 30)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const resultados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return nodes
      .filter(n => n.nome.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, nodes])

  // Reseta seleção quando filtra
  useEffect(() => { setActiveIdx(0) }, [query])

  function irPara(n: FluxoNode) {
    const x = n.position_xy?.x
    const y = n.position_xy?.y
    if (x == null || y == null) return
    // Centro do canvas no nó, com zoom razoável; respeita zoom atual se já estiver maior que 0.6
    const zoom = Math.max(getZoom(), 0.7)
    setCenter(x + 130, y + 80, { zoom, duration: 500 })
    setOpen(false)
  }

  function onKeyInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (resultados.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % resultados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + resultados.length) % resultados.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const alvo = resultados[activeIdx]
      if (alvo) irPara(alvo)
    }
  }

  if (!open) return null

  return (
    <Panel position="top-center">
      <div className="w-[360px] rounded-lg border bg-popover shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyInput}
            placeholder="Buscar bloco… (Esc fecha)"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {query.trim() === '' ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
            Digite parte do nome do bloco
          </div>
        ) : resultados.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
            Nenhum bloco encontrado
          </div>
        ) : (
          <ul className="max-h-[280px] overflow-y-auto">
            {resultados.map((n, i) => (
              <li key={n.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); irPara(n) }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors',
                    i === activeIdx ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="truncate font-medium">{n.nome}</span>
                  {n.tipo && n.tipo !== 'ATIVIDADE' && (
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
                      {n.tipo}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="px-3 py-1.5 border-t bg-muted/30 text-[9.5px] text-muted-foreground flex justify-between">
          <span>↑↓ navegar</span>
          <span>Enter ir</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </Panel>
  )
}

function PreviewPopover({ node, triggerRect, onClose, onOpenServico, isRoot, onChanged, podeEditar }: {
  node: FluxoNode
  triggerRect: DOMRect
  onClose: () => void
  onOpenServico: () => void
  isRoot: boolean
  /** Chamado após edição bem-sucedida de bloco PERGUNTA pra recarregar o fluxo. */
  onChanged?: () => void
  /** Permite edição inline (PERGUNTA) — desativa se user sem permissão. */
  podeEditar?: boolean
}) {
  const W = 340
  const MAX_H = 480
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const recalc = useCallback(() => {
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = triggerRect.right + 8
    if (left + W + margin > vw) {
      left = triggerRect.left - W - 8
      if (left < margin) left = Math.max(margin, vw - W - margin)
    }
    let top = (triggerRect.top + triggerRect.bottom) / 2 - MAX_H / 2
    if (top + MAX_H + margin > vh) top = vh - MAX_H - margin
    if (top < margin) top = margin
    setPos({ top, left })
  }, [triggerRect.top, triggerRect.left, triggerRect.bottom, triggerRect.right])

  useLayoutEffect(() => {
    recalc()
    function onScroll() { recalc() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [recalc])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // ── Edição inline de bloco PERGUNTA ──
  // Quando o nó é PERGUNTA, o popover renderiza form de edição em vez do listing
  // de etapas (que não se aplica). Estado local pré-preenchido com o snapshot do
  // template; salva via updateServico e dispara onChanged pra recarregar o fluxo.
  const isPergunta = node.tipo === 'PERGUNTA'
  const [pergTexto, setPergTexto] = useState(node.perguntaTexto ?? '')
  const [pergOpcoes, setPergOpcoes] = useState<string[]>(node.perguntaOpcoes ?? [])
  const [pergMulti, setPergMulti] = useState(!!node.perguntaMulti)
  const [pergOpcaoNova, setPergOpcaoNova] = useState('')
  const [pergNome, setPergNome] = useState(node.nome)
  const [pergSalvando, setPergSalvando] = useState(false)
  // Estratégia "quem responde": ORCAMENTO (default), MANUAL_FIXO (user fixo),
  // CLIENTE_AREA (responsável do setor no cliente).
  const [pergAtribuicao, setPergAtribuicao] = useState<'ORCAMENTO' | 'MANUAL_FIXO' | 'CLIENTE_AREA'>(
    (node.atribuicaoResponsavel === 'MANUAL_FIXO' || node.atribuicaoResponsavel === 'CLIENTE_AREA')
      ? node.atribuicaoResponsavel
      : 'ORCAMENTO',
  )
  const [pergRespFixoId, setPergRespFixoId] = useState<string>(node.responsavelFixoId ?? '')
  const [pergArea, setPergArea] = useState<string>(node.categoria ?? '')
  // Carrega listas pra os selects (só quando o popover é de PERGUNTA)
  const [pergUsuarios, setPergUsuarios] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [pergAreas, setPergAreas] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    if (!isPergunta) return
    ;(trpc.user as any).listForSelect.query()
      .then((d: typeof pergUsuarios) => setPergUsuarios(d ?? []))
      .catch(() => setPergUsuarios([]))
    ;(trpc.area as any).listForSelect.query()
      .then((d: typeof pergAreas) => setPergAreas(d ?? []))
      .catch(() => setPergAreas([]))
  }, [isPergunta])

  const handleSalvarPergunta = useCallback(async () => {
    if (!pergTexto.trim()) { alerts.error('Erro', 'Informe o texto da pergunta.'); return }
    if (pergOpcoes.length < 2) { alerts.error('Erro', 'Pergunta precisa de pelo menos 2 opções.'); return }
    if (!pergNome.trim()) { alerts.error('Erro', 'Informe o nome do bloco.'); return }
    if (pergAtribuicao === 'MANUAL_FIXO' && !pergRespFixoId) {
      alerts.error('Erro', 'Selecione o usuário responsável pela resposta.'); return
    }
    if (pergAtribuicao === 'CLIENTE_AREA' && !pergArea) {
      alerts.error('Erro', 'Selecione a área que responde por esta decisão.'); return
    }
    setPergSalvando(true)
    try {
      await (trpc.servico as any).updateServico.mutate({
        id: node.id,
        data: {
          nome: pergNome.trim(),
          perguntaTexto: pergTexto.trim(),
          perguntaOpcoes: pergOpcoes,
          perguntaMulti: pergMulti,
          atribuicaoResponsavel: pergAtribuicao,
          // MANUAL_FIXO: user fixo; CLIENTE_AREA: nome da área em `categoria`
          responsavelFixoId: pergAtribuicao === 'MANUAL_FIXO' ? pergRespFixoId : null,
          categoria: pergAtribuicao === 'CLIENTE_AREA' ? pergArea : null,
        },
      })
      await alerts.success('Salvo', 'Bloco pergunta atualizado.')
      onChanged?.()
      onClose()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setPergSalvando(false)
    }
  }, [pergTexto, pergOpcoes, pergMulti, pergNome, pergAtribuicao, pergRespFixoId, pergArea, node.id, onChanged, onClose])

  if (!pos || typeof document === 'undefined') return null

  const totalPassos = node.etapas.reduce((acc, et) => acc + et.passos.length, 0)

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-[90] rounded-lg border bg-popover shadow-xl overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: W, maxHeight: MAX_H }}
    >
      <div
        className="px-3 py-2.5 border-b flex items-start justify-between gap-2"
        style={{ backgroundColor: isRoot ? '#d1fae5' : '#ecfdf5' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isRoot && <Badge className="text-[9px] h-4 bg-emerald-600 hover:bg-emerald-700 text-white">RAIZ</Badge>}
            <span className="text-sm font-semibold truncate text-emerald-900">{node.nome}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-emerald-700 mt-0.5">
            {node.categoria && <span>{node.categoria}</span>}
            {(() => {
              const sla = formatNodeSla(node.slaMinutos, node.slaHoras)
              return sla && <span>· SLA {sla}</span>
            })()}
            <span>· {node.prioridade}</span>
            {!node.ativo && <span className="font-semibold text-rose-600">· INATIVO</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-emerald-100 text-emerald-700 shrink-0"
          title="Fechar"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: MAX_H - 100 }}>
        {isPergunta ? (
          // Form de edição do bloco PERGUNTA — campos: nome, texto, opções, multi
          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-foreground">Nome do bloco</label>
              <Input
                value={pergNome}
                onChange={e => setPergNome(e.target.value)}
                disabled={!podeEditar || pergSalvando}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-foreground">Pergunta a ser exibida *</label>
              <textarea
                value={pergTexto}
                onChange={e => setPergTexto(e.target.value)}
                disabled={!podeEditar || pergSalvando}
                rows={2}
                maxLength={500}
                className="w-full text-xs border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-foreground">
                Opções * <span className="text-muted-foreground font-normal">(=rótulos das arestas)</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {pergOpcoes.map((op, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b55' }}
                  >
                    {op}
                    {podeEditar && (
                      <button
                        type="button"
                        onClick={() => setPergOpcoes(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-red-600"
                        title="Remover"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {podeEditar && (
                <div className="flex gap-1">
                  <Input
                    value={pergOpcaoNova}
                    onChange={e => setPergOpcaoNova(e.target.value)}
                    placeholder="Nova opção"
                    maxLength={80}
                    disabled={pergSalvando}
                    className="h-7 text-xs"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = pergOpcaoNova.trim()
                        if (v && !pergOpcoes.includes(v) && pergOpcoes.length < 20) {
                          setPergOpcoes(prev => [...prev, v])
                          setPergOpcaoNova('')
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const v = pergOpcaoNova.trim()
                      if (v && !pergOpcoes.includes(v) && pergOpcoes.length < 20) {
                        setPergOpcoes(prev => [...prev, v])
                        setPergOpcaoNova('')
                      }
                    }}
                    disabled={!pergOpcaoNova.trim() || pergOpcoes.length >= 20 || pergSalvando}
                    className="h-7 px-2"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-[10px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pergMulti}
                onChange={e => setPergMulti(e.target.checked)}
                disabled={!podeEditar || pergSalvando}
                className="h-3 w-3 cursor-pointer"
              />
              <span className="font-medium">Permitir múltipla escolha</span>
            </label>

            {/* Quem responde — usuário fixo, área (setor) ou herdado do orçamento */}
            <div className="space-y-1.5 border-t pt-2">
              <label className="text-[10px] font-semibold text-foreground">Quem responde *</label>
              <div className="grid grid-cols-3 gap-1">
                {([
                  { v: 'ORCAMENTO', label: 'Orçamento' },
                  { v: 'MANUAL_FIXO', label: 'Usuário' },
                  { v: 'CLIENTE_AREA', label: 'Setor' },
                ] as const).map(opt => {
                  const active = pergAtribuicao === opt.v
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPergAtribuicao(opt.v)}
                      disabled={!podeEditar || pergSalvando}
                      className={cn(
                        'rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                        active
                          ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {pergAtribuicao === 'ORCAMENTO' && (
                <p className="text-[9.5px] text-muted-foreground italic">
                  Usa o responsável definido no orçamento que originou a execução.
                </p>
              )}
              {pergAtribuicao === 'MANUAL_FIXO' && (
                <div className="space-y-1">
                  <select
                    value={pergRespFixoId}
                    onChange={e => setPergRespFixoId(e.target.value)}
                    disabled={!podeEditar || pergSalvando}
                    className="w-full h-8 text-xs leading-none border rounded px-2 py-0 bg-background appearance-auto focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— Selecione o usuário —</option>
                    {pergUsuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <p className="text-[9.5px] text-muted-foreground italic">
                    Toda execução desta pergunta vai sempre para este usuário.
                  </p>
                </div>
              )}
              {pergAtribuicao === 'CLIENTE_AREA' && (
                <div className="space-y-1">
                  <select
                    value={pergArea}
                    onChange={e => setPergArea(e.target.value)}
                    disabled={!podeEditar || pergSalvando}
                    className="w-full h-8 text-xs leading-none border rounded px-2 py-0 bg-background appearance-auto focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— Selecione a área —</option>
                    {pergAreas.map(a => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                  <p className="text-[9.5px] text-muted-foreground italic">
                    Resolve em runtime: pega o responsável desta área no cliente do processo.
                  </p>
                </div>
              )}
            </div>

            <p className="text-[9.5px] text-muted-foreground border-t pt-2">
              Cada opção precisa casar (case-insensitive) com o rótulo de uma aresta de saída. Edite o rótulo de uma aresta clicando duplamente nela.
            </p>
          </div>
        ) : node.etapas.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 italic">
            Sem etapas configuradas.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {node.etapas.map((et, ei) => (
              <div key={et.id} className="px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 rounded px-1.5 py-0.5">
                    {ei + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-foreground truncate">{et.nome}</span>
                  <span className="text-[9px] text-muted-foreground ml-auto">
                    {et.passos.length} passo{et.passos.length === 1 ? '' : 's'}
                  </span>
                </div>
                {et.passos.length > 0 && (
                  <ol className="ml-4 space-y-0.5">
                    {et.passos.map(p => (
                      <li key={p.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                        <span className="truncate">{p.nome}</span>
                        {!p.obrigatorio && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-auto shrink-0">Opc.</Badge>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Execuções ativas do bloco — agregado do backend, mostra responsável, cliente e prazo */}
        {node.execucoesAtivas && node.execucoesAtivas.total > 0 && (
          <ExecucoesSection execucoes={node.execucoesAtivas} />
        )}

        {/* Obrigações Acessórias mapeadas — só em serviços MENSAL com vínculos */}
        {!isPergunta && node.categoriaServico === 'MENSAL' && (node.acessoriasObrigacoes?.length ?? 0) > 0 && (
          <div className="px-3 py-2.5 border-t bg-amber-50/40 dark:bg-amber-950/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg className="h-3 w-3 text-amber-700" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4 6c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6zm2 0v.01L12 11l6-4.99V6H6zm12 2.5l-5.4 4.5c-.35.3-.85.3-1.2 0L6 8.5V18h12V8.5z"/>
              </svg>
              <span className="text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Acessórias — {node.acessoriasObrigacoes!.length} obrigaç{node.acessoriasObrigacoes!.length === 1 ? 'ão' : 'ões'}
              </span>
            </div>
            <ul className="space-y-0.5 ml-4">
              {node.acessoriasObrigacoes!.slice(0, 8).map((nome, i) => (
                <li key={i} className="text-[11px] text-amber-900/80 dark:text-amber-200/80 truncate" title={nome}>
                  • {nome}
                </li>
              ))}
              {node.acessoriasObrigacoes!.length > 8 && (
                <li className="text-[10px] text-amber-800/70 italic">
                  +{node.acessoriasObrigacoes!.length - 8} obrigação(ões)…
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t px-3 py-2 bg-muted/30 flex items-center justify-between gap-2">
        {isPergunta ? (
          <>
            <span className="text-[10px] text-muted-foreground">
              {pergOpcoes.length} {pergOpcoes.length === 1 ? 'opção' : 'opções'}
            </span>
            {podeEditar && (
              <Button
                size="sm"
                onClick={handleSalvarPergunta}
                disabled={pergSalvando}
                className="h-7 text-[11px] gap-1.5"
                style={{ backgroundColor: '#f59e0b' }}
              >
                {pergSalvando ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Salvar
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="text-[10px] text-muted-foreground">
              {node.etapas.length} etapa{node.etapas.length === 1 ? '' : 's'} · {totalPassos} passo{totalPassos === 1 ? '' : 's'}
            </span>
            {!isRoot && (
              <Button
                size="sm"
                onClick={onOpenServico}
                className="h-7 text-[11px] gap-1.5"
                style={{ backgroundColor: '#10b981' }}
              >
                Abrir serviço <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
