'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, CheckCircle2, Search,
  FileDown, Loader2, CalendarClock,
  SlidersHorizontal, Database, Paperclip, RefreshCcw, FileSignature, Activity, Check, X, ChevronRight, Percent,
  MoreVertical, Pencil, EyeOff, FileX2,
} from 'lucide-react'
import {
  Button, Card, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@saas/ui'
import { alerts } from '@/lib/alerts'
import { cn } from '@saas/ui'
import { StatCard } from '@/components/stat-card'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { ParametrosContratoModal } from '@/components/contrato/parametros-contrato-modal'
import { VerificarErpModal } from '@/components/contrato/verificar-erp-modal'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'
const PAGE_SIZE = 20

type Registro = {
  id: string
  numero: number
  documento: string | null
  cliente: string | null
  temParametro: boolean
  temContrato: boolean
  erpMeses: number
  anexosCount: number
  contratoNumero: string | null
  contratoTipo: string | null
  dataInicio: string | null
  dataFim: string | null
  permanente: boolean
  vigencia: 'permanente' | 'sem_vigencia' | 'vigente' | 'vence_atencao' | 'vence_critico' | 'vencido'
  diasParaVencer: number | null
  farol: 'verde' | 'amarelo' | 'vermelho'
  /** 0 a 100. Nasce em 100 e cada critério que falha desconta o peso dele. */
  score: number
  farolItens: Array<{ id: string; titulo: string; ok: boolean; desconto: number }>
  recomendacao: 'forte' | 'moderada' | null
  comparativo: {
    /** Competências do SCI, da mais antiga para a mais recente (até 3). */
    meses: string[]
    linhas: Array<{
      titulo: string
      parametro: number | null
      valores: Array<number | null>
      media: number | null
      status: 'ok' | 'defasado' | 'sem_erp' | 'sem_parametro'
      variacaoPct: number | null
    }>
  }
  ultimaConsulta: string | null
  dataEntrada: string | null
  situacao: 'sem_parametro' | 'sem_consulta' | 'defasado' | 'em_dia'
  faturamento: number | null
  honorarios: number | null
  lancamentos: number | null
  lancamentos_status: CellStatus
  variacao_lancamentos_pct: number | null
  notas: number | null
  notas_status: CellStatus
  variacao_notas_pct: number | null
  vidas: number | null
  vidas_status: CellStatus
  variacao_vidas_pct: number | null
}

type CellStatus = 'ok' | 'defasado' | 'sem_parametro' | 'sem_erp'

/** Rótulo da cor, para o cabeçalho do detalhamento. */
/** Inteiro sem casas; decimal com duas — faturamento e contagem na mesma tabela. */
const fmtNum = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FAROL_LABEL: Record<Registro['farol'], string> = {
  verde: 'Em ordem', amarelo: 'Atenção', vermelho: 'Requer ação',
}

const FAROL_COR: Record<Registro['farol'], string> = {
  verde: '#10b981', amarelo: '#f59e0b', vermelho: '#f43f5e',
}

function fmtCnpj(doc: string | null) {
  if (!doc) return '—'
  const s = String(doc)
  if (s.length !== 14) return s
  return s.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
}

/** Ícone de status na faixa "Status": verde/vivo quando presente, apagado quando ausente.
 * Reproduz os indicadores da tabela do legado (contrato, parâmetros, ERP, anexos, renegociação).
 *
 * Cada ícone é também o atalho para resolver aquela pendência, como no SERPRO2:
 * ver o que falta e ter de caçar onde se resolve são duas coisas diferentes. */
function StatusIcon({ icon: Icon, active, title, count, tone = 'ok', onClick }: {
  icon: typeof FileText; active: boolean; title: string; count?: number
  tone?: 'ok' | 'alert'; onClick?: () => void
}) {
  const onCls = tone === 'alert'
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-emerald-600 dark:text-emerald-400'
  const conteudo = (
    <>
      <Icon className={cn('h-4 w-4', active ? onCls : 'text-muted-foreground/30')} />
      {active && count != null && count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-muted px-0.5 text-[8px] font-semibold text-foreground">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </>
  )
  if (!onClick) return <span className="relative inline-flex" title={title}>{conteudo}</span>
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="relative inline-flex rounded p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {conteudo}
    </button>
  )
}

type FiltroCard = 'ok' | 'sem_contrato' | 'reavaliacao' | 'sem_entrada' | 'sem_parametros' | 'indicadores' | 'erp' | 'ignorados'

/**
 * Os oito recortes da legenda do SERPRO2, na mesma ordem e com a mesma regra.
 * Os rótulos dizem o que o número conta: no legado, "Parâmetros" contava quem
 * NÃO tinha, e a leitura natural era a oposta.
 */
const CARDS: Array<{ key: FiltroCard; label: string; icon: typeof FileText; cor: string; dica: string }> = [
  { key: 'ok', label: 'Contrato em dia', icon: CheckCircle2, cor: '#10b981',
    dica: 'Com contrato, data de entrada, parâmetros e indicadores dentro da margem.' },
  { key: 'sem_contrato', label: 'Sem contrato', icon: FileX2, cor: '#f43f5e',
    dica: 'Nenhuma informação de contrato cadastrada (número, tipo ou vigência).' },
  { key: 'reavaliacao', label: 'Reavaliação', icon: RefreshCcw, cor: '#f43f5e',
    dica: 'Ao menos um indicador do ERP acima do contratado — sugere renegociar.' },
  { key: 'sem_entrada', label: 'Sem data de entrada', icon: CalendarClock, cor: '#f59e0b',
    dica: 'Cliente sem a data de entrada comercial preenchida.' },
  { key: 'sem_parametros', label: 'Sem parâmetros', icon: SlidersHorizontal, cor: '#f59e0b',
    dica: 'Sem os valores de referência do contrato — sem eles não há o que comparar.' },
  { key: 'indicadores', label: 'Fora da margem', icon: Percent, cor: '#f59e0b',
    dica: 'Tem parâmetros e dados do ERP, mas os indicadores não alcançam a margem de 70%.' },
  { key: 'erp', label: 'Períodos importados', icon: Database, cor: '#3b82f6',
    dica: 'Com ao menos um período do SCI importado nos três meses anteriores ao atual.' },
  { key: 'ignorados', label: 'Ignorados', icon: EyeOff, cor: '#94a3b8',
    dica: 'Retirados da gestão pelo menu de ações. Clique para vê-los.' },
]

const SITUACAO_BADGE: Record<Registro['situacao'], { label: string; cls: string }> = {
  em_dia: { label: 'Em dia', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  defasado: { label: 'Defasado', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  sem_consulta: { label: 'Sem consulta ERP', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  sem_parametro: { label: 'Sem parâmetro', cls: 'bg-muted text-muted-foreground border-border' },
}

export default function GestaoContratosPage() {
  const router = useRouter()
  const [detalheFarol, setDetalheFarol] = useState<Registro | null>(null)
  const [comparativo, setComparativo] = useState<Registro | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loading, setLoading] = useState(true)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [contadores, setContadores] = useState<Record<string, number>>({})
  const [filtro, setFiltro] = useState<FiltroCard | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  // debounce da busca (400ms, padrão da casa)
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const res = await trpc.cliente.gestaoContratos.query({
        page, limit: PAGE_SIZE, search: debounced || undefined, filtro: filtro ?? undefined,
      })
      setRegistros(res.registros as Registro[])
      setContadores(res.contadores)
      setTotal(res.total)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
      setRegistros([])
    } finally {
      setLoading(false)
    }
  }, [page, debounced, filtro])

  useEffect(() => { carregar() }, [carregar])

  // ── Atalhos da coluna Situação ──
  // Cada pendência se resolve sem sair da lista, como no legado. Sair para o
  // cadastro e voltar por 8 números faria a varredura da carteira — que é o
  // trabalho desta tela — custar uma navegação por cliente.
  const [paramsDe, setParamsDe] = useState<Registro | null>(null)
  const [sincronizarDe, setSincronizarDe] = useState<Registro | null>(null)
  const [editandoEntrada, setEditandoEntrada] = useState<{ registro: Registro; valor: string } | null>(null)
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)

  async function salvarDataEntrada() {
    if (!editandoEntrada?.valor) return
    setSalvandoEntrada(true)
    try {
      await trpc.cliente.update.mutate({ id: editandoEntrada.registro.id, data: { dataEntrada: editandoEntrada.valor } })
      setEditandoEntrada(null)
      await carregar()
      alerts.toast('Data de entrada definida')
    } catch (e) {
      alerts.error('Erro', e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally { setSalvandoEntrada(false) }
  }

  // ── Faixa de indicadores: arrastar para os lados ──
  // São oito cards e eles vazam para fora da tela de propósito (é o que mostra
  // que há mais). Sem o arraste, só sobraria a barra de rolagem — que no toque
  // nem aparece. Ponteiro em vez de mouse: cobre dedo, caneta e mouse de uma vez.
  const faixaRef = useRef<HTMLDivElement>(null)
  const arraste = useRef({ ativo: false, x0: 0, scroll0: 0, arrastou: false })

  function arrastarInicio(e: React.PointerEvent<HTMLDivElement>) {
    const el = faixaRef.current
    if (!el) return
    arraste.current = { ativo: true, x0: e.clientX, scroll0: el.scrollLeft, arrastou: false }
  }
  function arrastarMover(e: React.PointerEvent<HTMLDivElement>) {
    const el = faixaRef.current
    if (!el || !arraste.current.ativo) return
    const dx = e.clientX - arraste.current.x0
    // Folga de 4px: um clique comum treme alguns pixels e não é arraste.
    if (Math.abs(dx) > 4) arraste.current.arrastou = true
    el.scrollLeft = arraste.current.scroll0 - dx
  }
  function arrastarFim() {
    arraste.current.ativo = false
    // O flag de "arrastou" só zera no próximo quadro: o clique dispara depois
    // do pointerup, e é ele que precisa enxergar que houve arraste.
    requestAnimationFrame(() => { arraste.current.arrastou = false })
  }

  /**
   * Tira o cliente do painel — a listagem já filtra `gestao_ignorar`.
   *
   * Confirma antes porque a saída é silenciosa: a linha some e não há nada aqui
   * que a traga de volta; o caminho é o card de contrato no cadastro do cliente.
   */
  async function ignorarNaGestao(r: Registro) {
    const ok = await alerts.confirm({
      title: 'Ignorar na gestão?',
      text: `${r.cliente || 'Este cliente'} sai deste painel e deixa de ser cobrado pelo farol. Para trazê-lo de volta, use os parâmetros de contrato no cadastro do cliente.`,
      confirmText: 'Ignorar',
    })
    if (!ok) return
    try {
      await trpc.cliente.setGestaoIgnorar.mutate({ clienteId: r.id, ignorar: true })
      await carregar()
      alerts.toast('Cliente removido da gestão')
    } catch (e) {
      alerts.error('Erro', e instanceof Error ? e.message : 'Não foi possível atualizar.')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const cardAtivo = CARDS.find(c => c.key === filtro) ?? null

  async function exportarCsv() {
    // Exporta o que está na tela: com um card ativo, o CSV segue o mesmo recorte.
    const res = await trpc.cliente.gestaoContratos.query({
      page: 1, limit: 100, search: debounced || undefined, filtro: filtro ?? undefined,
    })
    const list = res.registros as Registro[]
    const headers = ['#', 'CNPJ', 'Cliente', 'Situação', 'Faturamento', 'Honorários', 'Lançamentos', 'Notas', 'Vidas']
    const rows = list.map(r => [
      r.numero, fmtCnpj(r.documento), (r.cliente || '').replace(/;/g, ','),
      SITUACAO_BADGE[r.situacao].label,
      r.faturamento ?? '', r.honorarios ?? '', r.lancamentos, r.notas, r.vidas,
    ])
    const csv = '﻿' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'gestao-contratos-' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportarCsv} disabled={loading || total === 0}>
            <FileDown className="h-4 w-4" /> CSV
          </Button>
          <BackButton href="/comercial" label="Voltar" />
        </>}
      >
        <h1 className="truncate">Gestão de Contratos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Contratos</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Gestão de Contratos</span>
        </p>
      </PageHeaderBar>

      {/* Legenda: cada card é um recorte da carteira e filtra a tabela ao ser
          clicado. Um cliente entra em vários — são pendências, não estados
          exclusivos —, então a soma passa do total de propósito. */}
      <div
        ref={faixaRef}
        onPointerDown={arrastarInicio}
        onPointerMove={arrastarMover}
        onPointerUp={arrastarFim}
        onPointerCancel={arrastarFim}
        className="nice-scrollbar -mx-1 flex cursor-grab gap-3 overflow-x-auto px-1 pb-1 active:cursor-grabbing"
      >
        {CARDS.map(c => (
          <div key={c.key} className="w-[200px] shrink-0 select-none">
            <StatCard
              icon={c.icon}
              label={c.label}
              value={contadores[c.key] ?? 0}
              color={c.cor}
              title={c.dica}
              loading={loading}
              active={filtro === c.key}
              onClick={() => {
                // Arrastar a faixa não pode valer como clique no card que ficou
                // sob o dedo — senão a rolagem troca o filtro sem querer.
                if (arraste.current.arrastou) return
                setFiltro(filtro === c.key ? null : c.key)
                setPage(1)
              }}
            />
          </div>
        ))}
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <span className="text-sm font-semibold">Indicações de variação dos contratos</span>
            {/* Com o card destacado lá em cima o recorte já se vê, mas a faixa
                rola: se o card ativo saiu da vista, some a única pista de que a
                lista está filtrada. Este chip fica. */}
            {cardAtivo && (
              <Badge variant="outline" className="gap-1 font-normal" style={{ borderColor: `${cardAtivo.cor}66`, color: cardAtivo.cor }}>
                {cardAtivo.label}
                <button type="button" onClick={() => { setFiltro(null); setPage(1) }} title="Limpar filtro" className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar por cliente ou CNPJ…" className="h-9 pl-8 text-sm" />
          </div>
        </div>

        {erro ? (
          <div className="p-8 text-center text-sm text-rose-600 dark:text-rose-400">{erro}</div>
        ) : (
          <div className="relative">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-8 text-center text-xs font-semibold uppercase tracking-wider" title="Farol"> </TableHead>
                    <TableHead className="hidden sm:table-cell w-12 text-center text-xs font-semibold uppercase tracking-wider">#</TableHead>
                    <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">CNPJ</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Cliente</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="hidden lg:table-cell text-center text-xs font-semibold uppercase tracking-wider" title="Sugestão de renegociação — acende antes do farol">Recomendação</TableHead>
                    <TableHead className="w-16 text-center text-xs font-semibold uppercase tracking-wider">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        {cardAtivo
                          ? `Nenhum cliente em "${cardAtivo.label}"${debounced ? ' com essa busca' : ''}.`
                          : 'Nenhum cliente com contrato ou parâmetros. Use "Verificar no ERP" no detalhe do cliente para alimentar os dados.'}
                      </TableCell>
                    </TableRow>
                  ) : registros.map(r => {
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/clientes/${r.id}`)}>
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDetalheFarol(r) }}
                            title={`${FAROL_LABEL[r.farol]} · ${r.score}% — clique para ver os indicadores`}
                            className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 hover:bg-muted/60"
                          >
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FAROL_COR[r.farol] }} />
                            <span className="text-[11px] font-semibold tabular-nums" style={{ color: FAROL_COR[r.farol] }}>{r.score}%</span>
                          </button>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-center text-xs text-muted-foreground">{r.numero}</TableCell>
                        <TableCell className="hidden md:table-cell whitespace-nowrap text-sm tabular-nums">{fmtCnpj(r.documento)}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-sm font-medium">{r.cliente || '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <StatusIcon icon={FileSignature} active={r.temContrato}
                              title={r.temContrato ? 'Contrato vinculado — abrir o cadastro' : 'Sem contrato cadastrado — clique para cadastrar'}
                              onClick={() => router.push(`/clientes/${r.id}`)} />
                            {/* Só aparece quando falta: um ícone permanentemente
                                apagado vira ruído, e a data de entrada é a única
                                pendência aqui que se resolve com um campo só. */}
                            {!r.dataEntrada && (
                              <StatusIcon icon={CalendarClock} active tone="alert"
                                title="Sem data de entrada — clique para definir"
                                onClick={() => setEditandoEntrada({ registro: r, valor: '' })} />
                            )}
                            <StatusIcon icon={SlidersHorizontal} active={r.temParametro}
                              title={r.temParametro ? 'Parâmetros iniciais cadastrados — clique para editar' : 'Sem parâmetros iniciais — clique para cadastrar'}
                              onClick={() => setParamsDe(r)} />
                            <StatusIcon icon={Database} active={r.erpMeses > 0} count={r.erpMeses}
                              title={r.erpMeses > 0
                                ? `${r.erpMeses} período(s) do ERP (SCI) — clique para sincronizar mais`
                                : 'Nenhum período importado — clique para buscar no ERP'}
                              onClick={() => setSincronizarDe(r)} />
                            <StatusIcon icon={Paperclip} active={r.anexosCount > 0} count={r.anexosCount}
                              title={r.anexosCount > 0 ? `${r.anexosCount} arquivo(s) anexado(s) — clique para abrir` : 'Sem anexos — clique para anexar'}
                              onClick={() => router.push(`/clientes/${r.id}#arquivos`)} />
                            <StatusIcon icon={RefreshCcw} active={r.situacao === 'defasado'} tone="alert"
                              title={r.situacao === 'defasado' ? 'Cresceu além do contratado — clique para ver o comparativo' : 'Sem sinal de renegociação'}
                              onClick={r.situacao === 'defasado' ? () => setComparativo(r) : undefined} />
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-center">
                          {/* Abre o comparativo: a recomendação nasce dele, e
                              ver a pill sem poder olhar o porquê obrigaria a
                              refazer o caminho pelo farol. */}
                          {r.recomendacao ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setComparativo(r) }}>
                              <Badge variant="outline" className={cn('font-medium cursor-pointer',
                                r.recomendacao === 'forte'
                                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                  : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                                Reavaliar
                              </Badge>
                            </button>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        {/* Ações do farol do SERPRO2: ver/editar, anexar e tirar
                            da gestão. O stopPropagation impede que abrir o menu
                            conte como clique na linha (que navega). */}
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" title="Ações">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => router.push(`/clientes/${r.id}`)}>
                                <Pencil className="h-4 w-4" /> Ver / Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/clientes/${r.id}#arquivos`)}>
                                <Paperclip className="h-4 w-4" /> Anexar arquivos
                                {r.anexosCount > 0 && (
                                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{r.anexosCount}</span>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => ignorarNaGestao(r)}>
                                <EyeOff className="h-4 w-4" /> Ignorar na gestão
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Rodapé / paginação */}
            {/* Legenda dos ícones da coluna Status */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">Status:</span>
              <span className="inline-flex items-center gap-1"><FileSignature className="h-3.5 w-3.5" /> Contrato vinculado</span>
              <span className="inline-flex items-center gap-1"><SlidersHorizontal className="h-3.5 w-3.5" /> Parâmetros</span>
              <span className="inline-flex items-center gap-1"><Database className="h-3.5 w-3.5" /> ERP (SCI)</span>
              <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Anexos</span>
              <span className="inline-flex items-center gap-1"><RefreshCcw className="h-3.5 w-3.5" /> Reavaliar honorário</span>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">{total} registro{total === 1 ? '' : 's'}</span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</Button>
                  <span className="px-2 text-xs text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="icon-xs" disabled={page >= totalPages || loading} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Detalhamento do farol — o mesmo do SERPRO2: pontuação no topo e, abaixo,
          cada critério com OK ou o quanto descontou. Sem isto o farol é uma cor
          sem argumento, e ninguém sabe o que fazer para melhorá-la. */}
      <Dialog open={!!detalheFarol} onOpenChange={(o) => { if (!o) setDetalheFarol(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Activity} color="sky">
            <DialogTitle className="text-[15px]">Indicadores do farol</DialogTitle>
            <DialogDescription className="text-[11px]">{detalheFarol?.cliente ?? ''}</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {detalheFarol && (
              <>
                <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {FAROL_LABEL[detalheFarol.farol]}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Pontuação{' '}
                    <b className="text-2xl tabular-nums" style={{ color: FAROL_COR[detalheFarol.farol] }}>
                      {detalheFarol.score}%
                    </b>
                  </span>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 text-left font-semibold">Critério</th>
                      <th className="py-1.5 text-right font-semibold">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalheFarol.farolItens.map(it => (
                      <tr key={it.id} className="border-b border-border/40">
                        <td className="py-2 pr-3 text-foreground">
                          {/* Só o critério de margem abre segundo nível: é o
                              único cujo resultado vem de uma conta, e não de um
                              campo preenchido ou vazio. */}
                          {it.id === 'indicadores' ? (
                            <button
                              type="button"
                              onClick={() => { setComparativo(detalheFarol); setDetalheFarol(null) }}
                              className="inline-flex items-center gap-1 text-left text-sky-600 hover:underline dark:text-sky-400"
                            >
                              {it.titulo}
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          ) : it.titulo}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {it.ok
                            ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />OK</span>
                            : <span className="inline-flex items-center gap-1 text-rose-500"><X className="h-3.5 w-3.5" />−{it.desconto} pts</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  A pontuação começa em 100 e cada critério pendente desconta o próprio peso.
                  Acima de 80 o farol fica verde; até 80, amarelo; até 60, vermelho.
                </p>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDetalheFarol(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Segundo nível: a composição do indicador, competência a competência.
          O farol diz "fora da margem"; aqui se vê QUAL indicador e por quanto —
          sem isso a única saída era abrir o ERP e conferir na mão. */}
      <Dialog open={!!comparativo} onOpenChange={(o) => { if (!o) setComparativo(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeaderIcon icon={Percent} color="amber">
            <DialogTitle className="text-[15px]">Comparativo — margem de indicadores</DialogTitle>
            <DialogDescription className="text-[11px]">
              {comparativo ? `${comparativo.documento ?? ''} · ${comparativo.cliente}` : ''}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {comparativo && (
              <div className="nice-scrollbar overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 text-left font-semibold">Indicador</th>
                      <th className="py-1.5 text-right font-semibold">Contrato</th>
                      {comparativo.comparativo.meses.map(m => (
                        <th key={m} className="py-1.5 text-right font-semibold tabular-nums">{m}</th>
                      ))}
                      <th className="py-1.5 pl-4 text-left font-semibold">Situação</th>
                      <th className="py-1.5 text-right font-semibold">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparativo.comparativo.linhas.map(l => (
                      <tr key={l.titulo} className="border-b border-border/40">
                        <td className="py-2 pr-3 text-foreground">{l.titulo}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {l.parametro == null ? '—' : fmtNum(l.parametro)}
                        </td>
                        {l.valores.map((v, i) => (
                          <td key={i} className="py-2 text-right tabular-nums text-muted-foreground">
                            {v == null ? '—' : fmtNum(v)}
                          </td>
                        ))}
                        <td className={cn('py-2 pl-4 whitespace-nowrap',
                          l.status === 'defasado' ? 'text-rose-500'
                            : l.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-muted-foreground')}>
                          {l.status === 'defasado' ? 'Acima do contrato'
                            : l.status === 'ok' ? 'Dentro da referência'
                              : l.status === 'sem_erp' ? 'Sem dados do ERP'
                                : 'Sem parâmetro'}
                        </td>
                        <td className={cn('py-2 text-right tabular-nums',
                          l.variacaoPct == null ? 'text-muted-foreground'
                            : l.variacaoPct > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>
                          {l.variacaoPct == null ? '—' : `${l.variacaoPct > 0 ? '+' : ''}${l.variacaoPct.toString().replace('.', ',')} %`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  A variação compara a <b>média das competências</b> acima com o valor do contrato.
                  Indicador com parâmetro e sem dado do ERP não conta como dentro nem como fora — mas
                  entra na conta dos 70%.
                </p>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { const r = comparativo; setComparativo(null); setDetalheFarol(r) }}>
              Voltar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setComparativo(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mesmo modal da aba Comercial do cliente: metadata do contrato, a
          baseline e o "Obter parametros iniciais", que puxa a média do SCI. */}
      {paramsDe && (
        <ParametrosContratoModal
          clienteId={paramsDe.id}
          open
          onOpenChange={(o) => { if (!o) setParamsDe(null) }}
          subtitulo={`${fmtCnpj(paramsDe.documento)} · ${paramsDe.cliente ?? ''}`}
          onSaved={carregar}
        />
      )}

      {/* Mesma rotina do "Verificar no ERP" do cadastro: escolhe o período,
          consulta o SCI e grava os snapshots. É o que alimenta o farol —
          por isso a lista recarrega ao terminar. */}
      {sincronizarDe && (
        <VerificarErpModal
          clienteId={sincronizarDe.id}
          open
          onOpenChange={(o) => { if (!o) setSincronizarDe(null) }}
          subtitulo={`${fmtCnpj(sincronizarDe.documento)} · ${sincronizarDe.cliente ?? ''}`}
          onSincronizado={carregar}
        />
      )}

      {/* Data de entrada — um campo só, resolvido sem trocar de tela. */}
      <Dialog open={!!editandoEntrada} onOpenChange={(o) => { if (!o) setEditandoEntrada(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeaderIcon icon={CalendarClock} color="amber">
            <DialogTitle className="text-[15px]">Data de entrada</DialogTitle>
            <DialogDescription className="text-[11px]">
              {editandoEntrada ? editandoEntrada.registro.cliente ?? '' : ''}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {editandoEntrada && (
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold" htmlFor="data-entrada">Início do atendimento</label>
                <Input
                  id="data-entrada"
                  type="date"
                  className="h-9 text-sm"
                  value={editandoEntrada.valor}
                  onChange={e => setEditandoEntrada({ ...editandoEntrada, valor: e.target.value })}
                />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditandoEntrada(null)}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarDataEntrada} disabled={salvandoEntrada || !editandoEntrada?.valor}>
              {salvandoEntrada ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
