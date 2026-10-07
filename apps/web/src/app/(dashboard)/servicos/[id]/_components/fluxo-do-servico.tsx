'use client'

/**
 * Fluxo DO PRÓPRIO serviço (07/10/2026) — Início → etapas → Fim, com as
 * sub-etapas como agrupamento dentro da etapa e os passos na ordem real de
 * execução (diretos primeiro, depois cada sub-etapa — mesma regra do
 * `agruparPassos`). Só visualização: a edição continua na aba "Etapas e
 * passos". A cadeia completa de serviços (encadeamentos, perguntas, blocos)
 * saiu daqui e mora em /servicos/[id]/cadeia, aberta pelo ⋮ dos serviços que
 * são início de cadeia.
 *
 * Layout manual em colunas (uma coluna por etapa, da esquerda para a direita;
 * dentro da etapa os passos descem). Não usa dagre porque a estrutura já é
 * conhecida — etapa/sub-etapa/passo — e o agrupamento por caixa é o que
 * importa ler.
 */
import { useMemo } from 'react'
import {
  ReactFlow, Background, Controls, Handle, Position, MarkerType,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Clock, Flag, Layers, Pencil, PlayCircle } from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { BADGE } from '@/lib/color-styles'

export interface FluxoPasso {
  id?: string
  dndId: string
  nome: string
  obrigatorio: boolean
  slaText: string
  dependeDoPassoId: string | null
  subEtapaId: string | null
}
export interface FluxoEtapa {
  id?: string
  nome: string
  passos: FluxoPasso[]
  subEtapas: Array<{ id: string; nome: string; ordem: number }>
}

const PASSO_W = 220
const PASSO_H = 58
const GAP = 12
const SUB_PAD = 10
const SUB_HEADER = 26
const ETAPA_PAD = 12
const ETAPA_HEADER = 36
const COL_GAP = 90
const MARCO_W = 120

type DadosPasso = { nome: string; obrigatorio: boolean; sla: string; numero: number; onClick?: () => void }
type DadosGrupo = { titulo: string; qtd: number; tipo: 'etapa' | 'sub' }
type DadosMarco = { rotulo: string; tipo: 'inicio' | 'fim' }

function NoPasso({ data }: NodeProps<Node<DadosPasso>>) {
  return (
    <button
      type="button"
      onClick={data.onClick}
      className="nodrag flex h-full w-full flex-col justify-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left shadow-sm transition-colors hover:border-primary"
      title="Editar este passo na aba Etapas e passos"
    >
      <Handle type="target" position={Position.Top} id="t" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
      <Handle type="target" position={Position.Left} id="l" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
      <span className="line-clamp-2 text-[12px] font-medium leading-tight text-foreground">
        <span className="mr-1 tabular-nums text-muted-foreground">{data.numero}.</span>{data.nome || 'Passo sem nome'}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cn('rounded border px-1 py-0 text-[9px] font-semibold', data.obrigatorio ? BADGE.rose : BADGE.slate)}>
          {data.obrigatorio ? 'Obrigatório' : 'Opcional'}
        </span>
        {data.sla && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Clock className="h-2.5 w-2.5" />{data.sla}</span>
        )}
      </span>
      <Handle type="source" position={Position.Bottom} id="b" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
      <Handle type="source" position={Position.Right} id="r" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
    </button>
  )
}

function NoGrupo({ data }: NodeProps<Node<DadosGrupo>>) {
  const etapa = data.tipo === 'etapa'
  return (
    <div className={cn('h-full w-full rounded-xl border', etapa ? 'border-border bg-muted/30' : 'border-dashed border-border bg-background/60')}>
      <div
        className={cn('flex items-center gap-1.5 truncate px-3 font-semibold text-muted-foreground', etapa ? 'pt-2.5 text-[11px] uppercase tracking-wide' : 'pt-1.5 text-[10.5px]')}
        title={data.titulo}
      >
        {!etapa && <Layers className="h-3 w-3 shrink-0" />}
        <span className={cn('truncate', etapa && 'text-foreground')}>{data.titulo}</span>
        <span className="shrink-0 font-normal normal-case tabular-nums">· {data.qtd}</span>
      </div>
    </div>
  )
}

function NoMarco({ data }: NodeProps<Node<DadosMarco>>) {
  const inicio = data.tipo === 'inicio'
  return (
    <div className={cn('flex h-full w-full items-center justify-center gap-1.5 rounded-full border text-[12px] font-semibold', inicio ? BADGE.emerald : BADGE.slate)}>
      {inicio ? <PlayCircle className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
      {data.rotulo}
      {inicio
        ? <Handle type="source" position={Position.Right} id="r" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
        : <Handle type="target" position={Position.Left} id="l" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />}
    </div>
  )
}

const nodeTypes = { passo: NoPasso, grupo: NoGrupo, marco: NoMarco }

/** Ordem real: passos diretos, depois cada sub-etapa na ordem (espelha agruparPassos). */
function ordemReal(etapa: FluxoEtapa): Array<{ sub: { id: string; nome: string } | null; passos: FluxoPasso[] }> {
  const subs = etapa.subEtapas.slice().sort((a, b) => a.ordem - b.ordem)
  const ids = new Set(subs.map(s => s.id))
  const blocos: Array<{ sub: { id: string; nome: string } | null; passos: FluxoPasso[] }> = [
    { sub: null, passos: etapa.passos.filter(p => !p.subEtapaId || !ids.has(p.subEtapaId)) },
  ]
  for (const s of subs) blocos.push({ sub: s, passos: etapa.passos.filter(p => p.subEtapaId === s.id) })
  return blocos
}

function montar(etapas: FluxoEtapa[], onEditarPasso?: (dndId: string) => void): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const innerW = PASSO_W + SUB_PAD * 2
  const etapaW = innerW + ETAPA_PAD * 2
  const seq = (source: string, target: string, sh: string, th: string): Edge => ({
    id: `s-${source}-${target}`, source, target, sourceHandle: sh, targetHandle: th, type: 'smoothstep',
    style: { stroke: 'var(--color-muted-foreground)', strokeWidth: 1.25, opacity: 0.6 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-muted-foreground)' },
  })

  // Alturas das etapas (para centralizar Início/Fim).
  type Layout = { etapaId: string; h: number; passosOrdem: Array<{ p: FluxoPasso; nodeId: string }> }
  const layouts: Layout[] = []
  let x = MARCO_W + COL_GAP
  let numero = 0
  etapas.forEach((et, ei) => {
    const etapaId = `etapa-${et.id ?? ei}`
    let y = ETAPA_HEADER
    const passosOrdem: Layout['passosOrdem'] = []
    const filhos: Node[] = []
    for (const bloco of ordemReal(et)) {
      if (!bloco.sub) {
        for (const p of bloco.passos) {
          const nodeId = `p-${p.dndId}`
          numero++
          filhos.push({
            id: nodeId, type: 'passo', parentId: etapaId, extent: 'parent', draggable: false,
            position: { x: ETAPA_PAD + SUB_PAD, y }, style: { width: PASSO_W, height: PASSO_H },
            data: { nome: p.nome, obrigatorio: p.obrigatorio, sla: p.slaText, numero, onClick: onEditarPasso ? () => onEditarPasso(p.dndId) : undefined },
          })
          passosOrdem.push({ p, nodeId })
          y += PASSO_H + GAP
        }
        continue
      }
      const subId = `sub-${bloco.sub.id}`
      const subH = SUB_HEADER + Math.max(bloco.passos.length, 1) * (PASSO_H + GAP) - GAP + SUB_PAD
      filhos.push({
        id: subId, type: 'grupo', parentId: etapaId, extent: 'parent', draggable: false, selectable: false,
        position: { x: ETAPA_PAD, y }, style: { width: innerW, height: subH },
        data: { titulo: bloco.sub.nome, qtd: bloco.passos.length, tipo: 'sub' },
      })
      let sy = SUB_HEADER
      for (const p of bloco.passos) {
        const nodeId = `p-${p.dndId}`
        numero++
        filhos.push({
          id: nodeId, type: 'passo', parentId: subId, extent: 'parent', draggable: false,
          position: { x: SUB_PAD, y: sy }, style: { width: PASSO_W, height: PASSO_H },
          data: { nome: p.nome, obrigatorio: p.obrigatorio, sla: p.slaText, numero, onClick: onEditarPasso ? () => onEditarPasso(p.dndId) : undefined },
        })
        passosOrdem.push({ p, nodeId })
        sy += PASSO_H + GAP
      }
      y += subH + GAP
    }
    const h = Math.max(y - GAP + ETAPA_PAD, ETAPA_HEADER + PASSO_H)
    // O pai precisa vir antes dos filhos no array (exigência do React Flow).
    nodes.push({
      id: etapaId, type: 'grupo', draggable: false, selectable: false,
      position: { x, y: 0 }, style: { width: etapaW, height: h },
      data: { titulo: `${ei + 1}. ${et.nome || 'Etapa'}`, qtd: et.passos.length, tipo: 'etapa' },
    }, ...filhos)
    layouts.push({ etapaId, h, passosOrdem })
    x += etapaW + COL_GAP
  })

  const altura = Math.max(PASSO_H, ...layouts.map(l => l.h))
  nodes.push(
    { id: 'inicio', type: 'marco', draggable: false, position: { x: 0, y: altura / 2 - 18 }, style: { width: MARCO_W, height: 36 }, data: { rotulo: 'Início', tipo: 'inicio' } },
    { id: 'fim', type: 'marco', draggable: false, position: { x, y: altura / 2 - 18 }, style: { width: MARCO_W, height: 36 }, data: { rotulo: 'Fim', tipo: 'fim' } },
  )

  // Sequência: Início → 1º passo; dentro da etapa desce; última → 1º da próxima; → Fim.
  // Etapa sem passos é atravessada pela caixa dela.
  let anterior: { id: string; handle: string } = { id: 'inicio', handle: 'r' }
  for (const l of layouts) {
    if (l.passosOrdem.length === 0) continue
    l.passosOrdem.forEach((item, i) => {
      if (i === 0) edges.push(seq(anterior.id, item.nodeId, anterior.handle, 'l'))
      else edges.push(seq(l.passosOrdem[i - 1]!.nodeId, item.nodeId, 'b', 't'))
    })
    anterior = { id: l.passosOrdem[l.passosOrdem.length - 1]!.nodeId, handle: 'r' }
  }
  edges.push(seq(anterior.id, 'fim', anterior.handle, 'l'))

  // Dependências que NÃO são o passo imediatamente anterior: tracejadas.
  const nodePorPassoId = new Map<string, string>()
  const ordemGlobal: string[] = []
  for (const l of layouts) for (const it of l.passosOrdem) { if (it.p.id) nodePorPassoId.set(it.p.id, it.nodeId); ordemGlobal.push(it.nodeId) }
  for (const l of layouts) for (const it of l.passosOrdem) {
    const dep = it.p.dependeDoPassoId ? nodePorPassoId.get(it.p.dependeDoPassoId) : undefined
    if (!dep) continue
    const imediato = ordemGlobal[ordemGlobal.indexOf(it.nodeId) - 1] === dep
    if (imediato) continue
    edges.push({
      id: `d-${dep}-${it.nodeId}`, source: dep, target: it.nodeId, sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep',
      label: 'depende', labelStyle: { fontSize: 9, fill: 'var(--color-muted-foreground)' },
      style: { stroke: 'var(--color-primary)', strokeWidth: 1.25, strokeDasharray: '5 4' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-primary)' },
    })
  }
  return { nodes, edges }
}

export function FluxoDoServico({ etapas, onEditarEtapas, onEditarPasso }: {
  etapas: FluxoEtapa[]
  onEditarEtapas: () => void
  onEditarPasso?: (dndId: string) => void
}) {
  const { nodes, edges } = useMemo(() => montar(etapas, onEditarPasso), [etapas, onEditarPasso])
  const totalPassos = etapas.reduce((acc, e) => acc + e.passos.length, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          O caminho deste serviço: etapas, sub-etapas e passos na ordem em que são executados. Clique num passo para editá-lo.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onEditarEtapas}>
          <Pencil className="h-3.5 w-3.5" /> Editar etapas e passos
        </Button>
      </div>
      {etapas.length === 0 || totalPassos === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <Layers className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-semibold text-foreground">Este serviço ainda não tem passos</p>
          <p className="max-w-sm text-xs text-muted-foreground">Cadastre as etapas e os passos na aba “Etapas e passos” — o fluxo aparece aqui.</p>
        </div>
      ) : (
        <div className="h-[min(70vh,620px)] w-full overflow-hidden rounded-lg border border-border bg-background">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={1.5}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
