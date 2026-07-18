'use client'

// ============================================================
// Painel de resultado do processamento (colapsável). Sempre aparece após a
// exportação; no sucesso vem retraído. Abas:
//  - "Pendências" (só existe se houver pendência): a lista (Linha · Campo ·
//    Valor · Motivo), origem color-codeada por bolinha. Expandir mostra a
//    linha da tabela ORIGINAL com as células causadoras destacadas.
//  - "Dados processados": como o modelo interpretou cada lançamento (Data,
//    Valor, Descrição, Direção, Contrapartida, Conta corrente, Status). Linhas
//    "Puladas" com strikethrough. Clicar numa linha de Pendência salta para a
//    aba Pendências, rola até a pendência e a pisca.
// ============================================================

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Pencil, ChevronRight, ChevronDown, FileWarning, CheckCircle2, Download } from 'lucide-react'
import {
  Button, Badge,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  cn,
} from '@saas/ui'

type CellValue = string | number | boolean | null
type Direcao = 'DEBITO' | 'CREDITO' | null
type TraceStatus = 'ok' | 'pulada-regra' | 'ignorada-zero' | 'pendencia'

export interface PendenciaItem {
  linha: number
  tipo: string
  campo: string
  mensagem: string
  valor?: string
}
export interface TraceItem {
  linha: number
  data: string
  valor: string
  descricao: string
  participante: string
  numeroNf: string
  documento: string
  direcao: Direcao
  contaContrapartida: string | null
  contaCorrente: string | null
  status: TraceStatus
}
/** Quais colunas opcionais do De/Para o modelo mapeou (viram colunas em "Dados processados"). */
export interface ColunasOpcionais { participante: boolean; numeroNf: boolean; documento: boolean }

interface Props {
  pendencias: PendenciaItem[]
  totalLancamentos: number
  headers: string[]
  rows: Array<Record<string, CellValue>>
  trace: TraceItem[]
  traceTotal: number
  okTotal: number
  colunasOpcionais: ColunasOpcionais
  canManage: boolean
  /** Abrir o editor em modo revisão (realça pendências de modelo e de arquivo). */
  onEditModel: () => void
  /** Baixar o arquivo gerado (só no sucesso). */
  onDownload?: () => void
}

const PENDENCIA_LABELS: Record<string, string> = {
  DC_NAO_MAPEADO: 'Débito/Crédito não mapeado',
  CONTA_NAO_MAPEADA: 'Conta de contrapartida não mapeada',
  CONTA_CORRENTE_NAO_MAPEADA: 'Conta corrente não mapeada',
  CAMPO_VAZIO: 'Campo vazio',
  DATA_INVALIDA: 'Data inválida',
  VALOR_INVALIDO: 'Valor não numérico',
  COLUNA_NAO_ENCONTRADA: 'Coluna não encontrada',
}

// Pendências de MODELO (mapeamento faltando → corrige no editor) x ARQUIVO
// (dado ruim → corrige no arquivo). Classifica por tipo + linha: linha 0 é
// pendência do próprio modelo (ex.: conta corrente não informada).
const MODELO_TIPOS = new Set(['CONTA_NAO_MAPEADA', 'DC_NAO_MAPEADO', 'CONTA_CORRENTE_NAO_MAPEADA'])
type Origem = 'modelo' | 'arquivo'
function origemDe(p: PendenciaItem): Origem {
  // Coluna ausente = arquivo não bate com o mapeamento → origem arquivo (mesmo
  // sendo linha 0). Precisa vir antes do check de linha 0.
  if (p.tipo === 'COLUNA_NAO_ENCONTRADA') return 'arquivo'
  if (p.linha === 0) return 'modelo'
  return MODELO_TIPOS.has(p.tipo) ? 'modelo' : 'arquivo'
}

// Teto de linhas RENDERIZADAS nas tabelas do painel (mesmo do debug viewer).
const MAX_RENDER = 500

const STATUS_LABEL: Record<TraceStatus, string> = {
  ok: 'OK', pendencia: 'Pendência', 'pulada-regra': 'Pulada (regra)', 'ignorada-zero': 'Ignorada',
}
const STATUS_CLASS: Record<TraceStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  pendencia: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  'pulada-regra': 'bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  'ignorada-zero': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
}

const cellText = (v: CellValue | undefined): string => (v === null || v === undefined || v === '' ? '' : String(v))
const dirLabel = (d: Direcao): string => (d === 'DEBITO' ? 'Débito' : d === 'CREDITO' ? 'Crédito' : '—')

// Bolinha de cor por origem (● rose = modelo, ● amber = arquivo).
const DOT: Record<Origem, string> = { modelo: 'bg-rose-500', arquivo: 'bg-amber-500' }
// Realce das células causadoras (na expansão) por origem, com contorno no hover.
const CELL_HL: Record<Origem, string> = {
  modelo: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 font-medium cursor-help hover:ring-2 hover:ring-inset hover:ring-rose-500 dark:hover:ring-rose-400',
  arquivo: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-medium cursor-help hover:ring-2 hover:ring-inset hover:ring-amber-500 dark:hover:ring-amber-400',
}

function Dot({ origem }: { origem: Origem }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT[origem])} />
}

function scrollToCenter(container: HTMLElement | null, el: HTMLElement) {
  if (container) {
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const top = container.scrollTop + (eRect.top - cRect.top) - container.clientHeight / 2 + eRect.height / 2
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

export function PendenciasPanel({ pendencias, totalLancamentos, headers, rows, trace, traceTotal, okTotal, colunasOpcionais, canManage, onEditModel, onDownload }: Props) {
  const temPendencias = pendencias.length > 0
  const [aberto, setAberto] = useState(temPendencias) // sucesso → retraído
  const [tab, setTab] = useState(temPendencias ? 'pend' : 'proc')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [flashPend, setFlashPend] = useState<number | null>(null)
  const [pendingPend, setPendingPend] = useState<number | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendScrollRef = useRef<HTMLDivElement>(null)

  const temModelo = pendencias.some((p) => origemDe(p) === 'modelo')
  const temArquivo = pendencias.some((p) => origemDe(p) === 'arquivo')

  const pendPorTipo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of pendencias) m[p.tipo] = (m[p.tipo] ?? 0) + 1
    return m
  }, [pendencias])

  // Índice (linha → campo → {motivo, origem}) p/ destacar células na expansão.
  const cellMap = useMemo(() => {
    const m = new Map<number, Map<string, { mensagem: string; origem: Origem }>>()
    for (const p of pendencias) {
      if (p.linha <= 0 || !p.campo) continue
      let inner = m.get(p.linha)
      if (!inner) { inner = new Map(); m.set(p.linha, inner) }
      if (!inner.has(p.campo)) inner.set(p.campo, { mensagem: p.mensagem, origem: origemDe(p) })
    }
    return m
  }, [pendencias])

  // linha → índice da 1ª pendência daquela linha (navegação Dados → Pendências).
  const linhaToPendIdx = useMemo(() => {
    const m = new Map<number, number>()
    pendencias.forEach((p, i) => { if (!m.has(p.linha)) m.set(p.linha, i) })
    return m
  }, [pendencias])

  const irParaPendencia = useCallback((linha: number) => {
    const idx = linhaToPendIdx.get(linha)
    if (idx == null) return
    setTab('pend')
    setPendingPend(idx)
  }, [linhaToPendIdx])

  // Depois de trocar p/ a aba Pendências: espera o layout, rola até a pendência
  // e pisca. Reset de `pendingPend` só DENTRO do rAF (senão o cleanup cancela o
  // próprio rAF); o timer do flash vive num ref p/ não ser cancelado.
  useEffect(() => {
    if (tab !== 'pend' || pendingPend == null) return
    const idx = pendingPend
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(`tl-pend-${idx}`)
        if (el) {
          scrollToCenter(pendScrollRef.current, el)
          setFlashPend(idx)
          if (flashTimer.current) clearTimeout(flashTimer.current)
          flashTimer.current = setTimeout(() => setFlashPend(null), 1600)
        }
        setPendingPend(null)
      }),
    )
    return () => cancelAnimationFrame(raf)
  }, [tab, pendingPend])

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // Sucesso: o painel É o card de "arquivo gerado", com uma barra recolhível que
  // revela os "Dados processados". Recolhido por padrão.
  if (!temPendencias) {
    return (
      <TooltipProvider delayDuration={120}>
        <div className="rounded-lg border border-border bg-card">
          {/* margin-inline alinha o conteúdo com os elementos do fluxo principal. */}
          <div className="flex items-center gap-3 p-5" style={{ marginInline: '15rem' }}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Arquivo de importação gerado</p>
              <p className="text-xs text-muted-foreground">
                {totalLancamentos} lançamento{totalLancamentos === 1 ? '' : 's'} · o download iniciou automaticamente.
              </p>
            </div>
            {onDownload && (
              <Button variant="success" size="sm" className="shrink-0" onClick={onDownload}>
                <Download className="h-4 w-4" /> Baixar
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAberto((a) => !a)}
            style={{ marginInline: '15rem', width: 'calc(100% - 30rem)' }}
            className="flex items-center gap-1.5 border-t border-border/60 px-5 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 cursor-pointer"
          >
            {aberto ? 'Ocultar detalhes do processamento' : 'Dados processados sem erros — clique para ver os detalhes'}
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', aberto && 'rotate-180')} />
          </button>
          {aberto && (
            <div className="px-5 pb-5 pt-1">
              <DadosProcessados trace={trace} traceTotal={traceTotal} colunasOpcionais={colunasOpcionais} temPendencias={false} onIrParaPendencia={() => { /* sem pendências */ }} />
            </div>
          )}
        </div>
      </TooltipProvider>
    )
  }

  // Falha: cabeçalho rose colapsável + abas (Pendências + Dados processados).
  return (
    <TooltipProvider delayDuration={120}>
      <div className="rounded-lg border border-border bg-card">
        {/* Cabeçalho colapsável */}
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="flex w-full items-center gap-3 p-5 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Não foi possível gerar o arquivo</p>
            <p className="text-xs text-muted-foreground">
              {pendencias.length} pendência{pendencias.length > 1 ? 's' : ''} em {totalLancamentos} lançamentos
            </p>
          </div>
          <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
        </button>

        {/* Corpo colapsável */}
        {aberto && (
          <div className="space-y-4 px-5 pb-5">
            {/* Badges por tipo (só quando há pendências) */}
            {temPendencias && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(pendPorTipo).map(([tipo, n]) => (
                  <Badge key={tipo} variant="secondary" className="gap-1.5 text-[11px] font-medium">
                    <Dot origem={MODELO_TIPOS.has(tipo) ? 'modelo' : 'arquivo'} />
                    {PENDENCIA_LABELS[tipo] ?? tipo}: {n}
                  </Badge>
                ))}
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                {temPendencias && <TabsTrigger value="pend">Pendências ({pendencias.length})</TabsTrigger>}
                <TabsTrigger value="proc">Dados processados ({okTotal} OK)</TabsTrigger>
              </TabsList>

              {/* ---- Aba: lista de pendências ---- */}
              {/* forceMount nas duas abas: mantém ambas montadas → a posição de
                  scroll de cada uma persiste ao alternar (navegação fluida). */}
              {temPendencias && (
                <TabsContent value="pend" forceMount className="mt-4 data-[state=inactive]:hidden">
                  <div className="rounded-[2px] border border-border/60 overflow-hidden">
                    <div ref={pendScrollRef} className="nice-scrollbar max-h-[440px] overflow-auto [&>div]:!overflow-visible">
                      <Table>
                        <TableHeader>
                          <TableRow className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                            <TableHead className="w-[36px]" />
                            <TableHead className="w-[64px]">Linha</TableHead>
                            <TableHead className="w-[96px]">Origem</TableHead>
                            <TableHead className="w-[180px]">Campo</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Motivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendencias.map((p, i) => (
                            <PendenciaRow
                              key={i}
                              idx={i}
                              p={p}
                              origem={origemDe(p)}
                              aberto={expanded.has(i)}
                              flash={flashPend === i}
                              headers={headers}
                              rows={rows}
                              cellMap={cellMap}
                              onToggle={() => toggle(i)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Ações + explicação */}
                  <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center">
                    {canManage && (
                      <Button variant="soft-info" size="sm" className="shrink-0" onClick={onEditModel}>
                        <Pencil className="h-4 w-4" /> Editar modelo
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {temModelo && (
                        <>Pendências <span className="font-medium text-rose-600 dark:text-rose-400">de modelo</span> (mapeamentos faltando){canManage ? ' são corrigidas no editor.' : ' — solicite a correção a quem gerencia os modelos.'} </>
                      )}
                      {temArquivo && (
                        <>Pendências <span className="font-medium text-amber-600 dark:text-amber-400">de arquivo</span> (campos em branco, datas ou valores inválidos) precisam ser corrigidas no próprio arquivo.</>
                      )}
                    </span>
                  </div>
                </TabsContent>
              )}

              {/* ---- Aba: dados processados ---- */}
              <TabsContent value="proc" forceMount className="mt-4 data-[state=inactive]:hidden">
                <DadosProcessados
                  trace={trace}
                  traceTotal={traceTotal}
                  colunasOpcionais={colunasOpcionais}
                  temPendencias={temPendencias}
                  onIrParaPendencia={irParaPendencia}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

// --- Uma pendência (linha + expansão da linha-fonte original) ---------------
function PendenciaRow({
  idx, p, origem, aberto, flash, headers, rows, cellMap, onToggle,
}: {
  idx: number
  p: PendenciaItem
  origem: Origem
  aberto: boolean
  flash: boolean
  headers: string[]
  rows: Array<Record<string, CellValue>>
  cellMap: Map<number, Map<string, { mensagem: string; origem: Origem }>>
  onToggle: () => void
}) {
  const temLinha = p.linha > 0
  const row = temLinha ? rows[p.linha - 1] : undefined
  const offend = cellMap.get(p.linha)
  return (
    <>
      <TableRow
        id={`tl-pend-${idx}`}
        className={cn('transition-colors duration-500', temLinha && 'cursor-pointer', flash && 'bg-sky-100/70 dark:bg-sky-950/40')}
        onClick={temLinha ? onToggle : undefined}
      >
        <TableCell className="py-2 align-middle">
          {temLinha && (
            <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
          )}
        </TableCell>
        <TableCell className="py-2 font-mono text-xs text-muted-foreground">{p.linha || '—'}</TableCell>
        <TableCell className="py-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Dot origem={origem} />
            {origem === 'modelo' ? 'Modelo' : 'Arquivo'}
          </span>
        </TableCell>
        <TableCell className="py-2 text-xs">{p.campo}</TableCell>
        <TableCell className="py-2 text-xs text-muted-foreground max-w-[260px] truncate" title={p.valor}>{p.valor || '—'}</TableCell>
        <TableCell className="py-2 text-xs">{p.mensagem}</TableCell>
      </TableRow>

      {aberto && temLinha && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={6} className="p-0">
            <div className="nice-scrollbar overflow-x-auto p-3">
              {row ? (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="whitespace-nowrap border-b border-border/60 px-2 py-1 text-left font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {headers.map((h) => {
                        const bad = offend?.get(h)
                        const v = cellText(row[h])
                        if (bad) {
                          return (
                            <Tooltip key={h}>
                              <TooltipTrigger asChild>
                                <td className={cn('whitespace-nowrap rounded-[3px] px-2 py-1', CELL_HL[bad.origem])}>{v || '∅'}</td>
                              </TooltipTrigger>
                              <TooltipContent>{bad.mensagem}</TooltipContent>
                            </Tooltip>
                          )
                        }
                        return (
                          <td key={h} className={cn('whitespace-nowrap px-2 py-1', !v && 'text-muted-foreground/50')}>{v || '∅'}</td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">Linha {p.linha} fora do intervalo carregado.</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// --- Dados processados (como o modelo interpretou cada lançamento) ----------
function DadosProcessados({
  trace, traceTotal, colunasOpcionais, temPendencias, onIrParaPendencia,
}: {
  trace: TraceItem[]
  traceTotal: number
  colunasOpcionais: ColunasOpcionais
  temPendencias: boolean
  onIrParaPendencia: (linha: number) => void
}) {
  // Tooltip que segue o mouse nas linhas de pendência (portal p/ escapar do
  // overflow da tabela; posição fixa no cursor).
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const shown = trace.slice(0, MAX_RENDER)
  if (shown.length === 0) {
    return (
      <div className="rounded-[2px] border border-border/60 bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
        Nenhum dado pôde ser processado.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {(traceTotal > MAX_RENDER || temPendencias) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {temPendencias && <span>Clique numa linha de <span className="font-medium text-rose-600 dark:text-rose-400">Pendência</span> para vê-la na aba Pendências.</span>}
          {traceTotal > MAX_RENDER && (
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <FileWarning className="h-3.5 w-3.5" /> Exibindo as primeiras {MAX_RENDER} de {traceTotal} linhas.
            </span>
          )}
        </div>
      )}

      <div className="rounded-[2px] border border-border/60 overflow-hidden">
        <div className="nice-scrollbar max-h-[460px] overflow-auto [&>div]:!overflow-visible">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted">
                <TableHead className="w-[54px] text-right">Linha</TableHead>
                <TableHead className="text-xs">Data</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="text-xs">Valor</TableHead>
                <TableHead className="text-xs">Direção</TableHead>
                {colunasOpcionais.numeroNf && <TableHead className="text-xs">Número NF</TableHead>}
                {colunasOpcionais.participante && <TableHead className="text-xs">Participante</TableHead>}
                {colunasOpcionais.documento && <TableHead className="text-xs">CNPJ/CPF</TableHead>}
                <TableHead className="text-xs">Contrapartida</TableHead>
                <TableHead className="text-xs">Conta corrente</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((t) => {
                const pulada = t.status === 'pulada-regra'
                const clicavel = t.status === 'pendencia'
                const txt = cn('py-2 text-xs whitespace-nowrap', pulada && 'text-muted-foreground/70 line-through')
                return (
                  <TableRow
                    key={t.linha}
                    className={cn(clicavel && 'cursor-pointer bg-rose-50/70 dark:bg-rose-950/20 hover:!bg-rose-100 dark:hover:!bg-rose-950/40')}
                    onClick={clicavel ? () => onIrParaPendencia(t.linha) : undefined}
                    onMouseMove={clicavel ? (e) => setTip({ x: e.clientX, y: e.clientY }) : undefined}
                    onMouseLeave={clicavel ? () => setTip(null) : undefined}
                  >
                    <TableCell className="py-2 text-right font-mono text-[11px] text-muted-foreground">{t.linha}</TableCell>
                    <TableCell className={txt}>{t.data || '∅'}</TableCell>
                    <TableCell className={cn(txt, 'max-w-[260px] truncate')} title={t.descricao}>{t.descricao || '∅'}</TableCell>
                    <TableCell className={txt}>{t.valor || '∅'}</TableCell>
                    <TableCell className={txt}>{dirLabel(t.direcao)}</TableCell>
                    {colunasOpcionais.numeroNf && <TableCell className={txt}>{t.numeroNf || '∅'}</TableCell>}
                    {colunasOpcionais.participante && <TableCell className={cn(txt, 'max-w-[200px] truncate')} title={t.participante}>{t.participante || '∅'}</TableCell>}
                    {colunasOpcionais.documento && <TableCell className={txt}>{t.documento || '∅'}</TableCell>}
                    <TableCell className={txt}>{t.contaContrapartida ?? '—'}</TableCell>
                    <TableCell className={txt}>{t.contaCorrente ?? '—'}</TableCell>
                    <TableCell className="py-2">
                      <Badge variant="secondary" className={cn('text-[10px] font-medium', STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {tip && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', left: tip.x + 14, top: tip.y + 16, zIndex: 60, pointerEvents: 'none' }}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-lg shadow-black/30"
        >
          Clique para visualizar a(s) pendência(s)
        </div>,
        document.body,
      )}
    </div>
  )
}
