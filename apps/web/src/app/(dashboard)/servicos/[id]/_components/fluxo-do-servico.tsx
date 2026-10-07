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
  permiteIgnorar?: boolean
  materiais?: unknown[]
  _count?: { emailTemplates?: number; lembretes?: number; camposCliente?: number }
}
export interface FluxoEtapa {
  id?: string
  nome: string
  passos: FluxoPasso[]
  subEtapas: Array<{ id: string; nome: string; ordem: number }>
}

const PASSO_W = 260
/** Altura mínima de um passo (o real é calculado pelo texto — ver alturaPasso). */
const PASSO_H = 58
const GAP = 12
const SUB_PAD = 10
const SUB_HEADER = 26
const ETAPA_PAD = 12
const ETAPA_HEADER = 36
const COL_GAP = 90
const MARCO_W = 120

/**
 * O React Flow posiciona por coordenada: cada card precisa da altura que o
 * conteúdo vai ocupar, senão o texto é cortado (era o caso: 58px fixos e
 * line-clamp-2). Estimativa por caracteres na fonte usada (12px ≈ 6.4px/char).
 */
const linhas = (texto: string, larguraPx: number, pxPorChar: number) =>
  Math.max(1, Math.ceil((texto.length * pxPorChar) / Math.max(larguraPx, 40)))

/** Etiquetas (características) do passo, na ordem em que aparecem no card. */
function etiquetasDoPasso(p: FluxoPasso, numeroDependencia: number | null): Array<{ texto: string; tom: 'rose' | 'slate' | 'amber' | 'sky' | 'violet' }> {
  const out: Array<{ texto: string; tom: 'rose' | 'slate' | 'amber' | 'sky' | 'violet' }> = []
  out.push(p.obrigatorio ? { texto: 'Obrigatório', tom: 'rose' } : { texto: 'Opcional', tom: 'slate' })
  if (p.slaText) out.push({ texto: `SLA ${p.slaText}`, tom: 'slate' })
  if (p.permiteIgnorar) out.push({ texto: 'Pode ser ignorado', tom: 'amber' })
  if (numeroDependencia) out.push({ texto: `Depende do passo ${numeroDependencia}`, tom: 'violet' })
  const n = p._count ?? {}
  if (n.emailTemplates) out.push({ texto: `${n.emailTemplates} e-mail${n.emailTemplates > 1 ? 's' : ''}`, tom: 'sky' })
  if (n.lembretes) out.push({ texto: `${n.lembretes} lembrete${n.lembretes > 1 ? 's' : ''}`, tom: 'sky' })
  if (n.camposCliente) out.push({ texto: `${n.camposCliente} campo${n.camposCliente > 1 ? 's' : ''} do cliente`, tom: 'sky' })
  if (p.materiais?.length) out.push({ texto: `${p.materiais.length} material${p.materiais.length > 1 ? 'is' : ''}`, tom: 'slate' })
  return out
}

/** Altura do card: nome inteiro (quebrando linha) + linhas de etiquetas. */
function alturaPasso(nome: string, numero: number, etiquetas: Array<{ texto: string }>): number {
  const util = PASSO_W - 22
  const lNome = linhas(`${numero}. ${nome || 'Passo sem nome'}`, util, 6.4)
  // Etiquetas quebram em linhas: soma larguras (texto 9.5px ≈ 5.3px/char + 12px de borda/padding + 4 de gap).
  let linhasEtq = 1
  let larg = 0
  for (const e of etiquetas) {
    const w = e.texto.length * 5.3 + 16
    if (larg > 0 && larg + w > util) { linhasEtq++; larg = 0 }
    larg += w
  }
  return Math.max(PASSO_H, 14 + lNome * 15 + 6 + linhasEtq * 18)
}

/** Altura do cabeçalho de grupo (etapa/sub-etapa) para o título caber inteiro. */
const alturaCabecalho = (titulo: string, largura: number, etapa: boolean) =>
  (etapa ? 14 : 10) + linhas(titulo, largura - 40, etapa ? 7.2 : 6.6) * (etapa ? 15 : 14) + 8

type DadosPasso = { nome: string; numero: number; etiquetas: ReturnType<typeof etiquetasDoPasso>; onClick?: () => void }
type DadosGrupo = { titulo: string; qtd: number; tipo: 'etapa' | 'sub' }
type DadosMarco = { rotulo: string; tipo: 'inicio' | 'fim' }

function NoPasso({ data }: NodeProps<Node<DadosPasso>>) {
  const TOM_ETQ = { rose: BADGE.rose, slate: BADGE.slate, amber: BADGE.amber, sky: BADGE.sky, violet: BADGE.violet } as const
  return (
    <button
      type="button"
      onClick={data.onClick}
      className="nodrag flex h-full w-full flex-col justify-start gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left shadow-sm transition-colors hover:border-primary"
      title="Editar este passo na aba Etapas e passos"
    >
      <Handle type="target" position={Position.Top} id="t" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
      <Handle type="target" position={Position.Left} id="l" className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
      {/* Nome inteiro — quebra linha em vez de cortar; o card tem a altura calculada para ele. */}
      <span className="whitespace-normal break-words text-[12px] font-medium leading-[15px] text-foreground">
        <span className="mr-1 tabular-nums text-muted-foreground">{data.numero}.</span>{data.nome || 'Passo sem nome'}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {data.etiquetas.map(e => (
          <span key={e.texto} className={cn('inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[9.5px] font-semibold leading-[14px]', TOM_ETQ[e.tom])}>
            {e.texto.startsWith('SLA ') && <Clock className="h-2.5 w-2.5" />}
            {e.texto}
          </span>
        ))}
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
        className={cn('flex items-start gap-1.5 px-3 font-semibold text-muted-foreground', etapa ? 'pt-2.5 text-[11px] uppercase leading-[15px] tracking-wide' : 'pt-1.5 text-[10.5px] leading-[14px]')}
        title={data.titulo}
      >
        {!etapa && <Layers className="mt-0.5 h-3 w-3 shrink-0" />}
        <span className={cn('min-w-0 whitespace-normal break-words', etapa && 'text-foreground')}>{data.titulo}</span>
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
  // Número de cada passo na ordem real (para "Depende do passo N").
  const numeroPorId = new Map<string, number>()
  {
    let n = 0
    for (const et of etapas) for (const b of ordemReal(et)) for (const pp of b.passos) { n++; if (pp.id) numeroPorId.set(pp.id, n) }
  }
  const dadosPasso = (pp: FluxoPasso, n: number) => {
    const etiquetas = etiquetasDoPasso(pp, pp.dependeDoPassoId ? numeroPorId.get(pp.dependeDoPassoId) ?? null : null)
    return { etiquetas, altura: alturaPasso(pp.nome, n, etiquetas) }
  }
  etapas.forEach((et, ei) => {
    const etapaId = `etapa-${et.id ?? ei}`
    const tituloEtapa = `${ei + 1}. ${et.nome || 'Etapa'}`
    const cabEtapa = Math.max(ETAPA_HEADER, alturaCabecalho(tituloEtapa, etapaW, true))
    let y = cabEtapa
    const passosOrdem: Layout['passosOrdem'] = []
    const filhos: Node[] = []
    for (const bloco of ordemReal(et)) {
      if (!bloco.sub) {
        for (const p of bloco.passos) {
          const nodeId = `p-${p.dndId}`
          numero++
          const d = dadosPasso(p, numero)
          filhos.push({
            id: nodeId, type: 'passo', parentId: etapaId, extent: 'parent', draggable: false,
            position: { x: ETAPA_PAD + SUB_PAD, y }, style: { width: PASSO_W, height: d.altura },
            data: { nome: p.nome, numero, etiquetas: d.etiquetas, onClick: onEditarPasso ? () => onEditarPasso(p.dndId) : undefined },
          })
          passosOrdem.push({ p, nodeId })
          y += d.altura + GAP
        }
        continue
      }
      const subId = `sub-${bloco.sub.id}`
      const cabSub = Math.max(SUB_HEADER, alturaCabecalho(bloco.sub.nome, innerW, false))
      const nBase = numero
      const alturas = bloco.passos.map((pp, k) => dadosPasso(pp, nBase + k + 1).altura)
      const subH = cabSub + (alturas.length ? alturas.reduce((a, b) => a + b + GAP, 0) - GAP : PASSO_H) + SUB_PAD
      filhos.push({
        id: subId, type: 'grupo', parentId: etapaId, extent: 'parent', draggable: false, selectable: false,
        position: { x: ETAPA_PAD, y }, style: { width: innerW, height: subH },
        data: { titulo: bloco.sub.nome, qtd: bloco.passos.length, tipo: 'sub' },
      })
      let sy = cabSub
      for (const p of bloco.passos) {
        const nodeId = `p-${p.dndId}`
        numero++
        const d = dadosPasso(p, numero)
        filhos.push({
          id: nodeId, type: 'passo', parentId: subId, extent: 'parent', draggable: false,
          position: { x: SUB_PAD, y: sy }, style: { width: PASSO_W, height: d.altura },
          data: { nome: p.nome, numero, etiquetas: d.etiquetas, onClick: onEditarPasso ? () => onEditarPasso(p.dndId) : undefined },
        })
        passosOrdem.push({ p, nodeId })
        sy += d.altura + GAP
      }
      y += subH + GAP
    }
    const h = Math.max(y - GAP + ETAPA_PAD, cabEtapa + PASSO_H)
    // O pai precisa vir antes dos filhos no array (exigência do React Flow).
    nodes.push({
      id: etapaId, type: 'grupo', draggable: false, selectable: false,
      position: { x, y: 0 }, style: { width: etapaW, height: h },
      data: { titulo: tituloEtapa, qtd: et.passos.length, tipo: 'etapa' },
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
