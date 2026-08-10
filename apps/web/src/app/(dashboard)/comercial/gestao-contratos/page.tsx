'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Users, CheckCircle2, TrendingUp, Info, Search,
  FileDown, ArrowUpRight, ArrowDownRight, Loader2, CalendarClock,
  SlidersHorizontal, Database, Paperclip, RefreshCcw, FileSignature, Activity, Check, X, ChevronRight, Percent,
} from 'lucide-react'
import {
  Button, Card, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { StatCard } from '@/components/stat-card'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
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

type Resumo = { total: number; emDia: number; defasados: number; semParametro: number; vencidos: number; vencendo: number }

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

const VIGENCIA_INFO: Record<Registro['vigencia'], { label: string; cls: string }> = {
  permanente: { label: 'Permanente', cls: 'text-muted-foreground' },
  sem_vigencia: { label: 'Sem vigência', cls: 'text-muted-foreground' },
  vigente: { label: 'Vigente', cls: 'text-emerald-600 dark:text-emerald-400' },
  vence_atencao: { label: 'A vencer', cls: 'text-amber-600 dark:text-amber-400' },
  vence_critico: { label: 'Vence em breve', cls: 'text-amber-600 dark:text-amber-400 font-medium' },
  vencido: { label: 'Vencido', cls: 'text-rose-600 dark:text-rose-400 font-medium' },
}

const fmtMoeda = (v: number | null) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

function fmtCnpj(doc: string | null) {
  if (!doc) return '—'
  const s = String(doc)
  if (s.length !== 14) return s
  return s.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
}

/** Indicador de variação (percentual + seta) ao lado do valor. Vermelho se o
 * ERP superou o parâmetro (defasado), verde se está abaixo. */
function VariacaoBadge({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) return null
  const up = pct > 0
  const down = pct < 0
  return (
    <span className={cn('ml-1 inline-flex items-center gap-0.5 text-[11px] font-medium',
      up ? 'text-rose-600 dark:text-rose-400' : down ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
      {up ? '+' : ''}{pct}%
      {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : null}
    </span>
  )
}

/** Ícone de status na faixa "Status": verde/vivo quando presente, apagado quando ausente.
 * Reproduz os indicadores da tabela do legado (contrato, parâmetros, ERP, anexos, renegociação). */
function StatusIcon({ icon: Icon, active, title, count, tone = 'ok' }: {
  icon: typeof FileText; active: boolean; title: string; count?: number; tone?: 'ok' | 'alert'
}) {
  const onCls = tone === 'alert'
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-emerald-600 dark:text-emerald-400'
  return (
    <span className="relative inline-flex" title={title}>
      <Icon className={cn('h-4 w-4', active ? onCls : 'text-muted-foreground/30')} />
      {active && count != null && count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-muted px-0.5 text-[8px] font-semibold text-foreground">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </span>
  )
}

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
  const [resumo, setResumo] = useState<Resumo>({ total: 0, emDia: 0, defasados: 0, semParametro: 0, vencidos: 0, vencendo: 0 })
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
      const res = await trpc.cliente.gestaoContratos.query({ page, limit: PAGE_SIZE, search: debounced || undefined })
      setRegistros(res.registros as Registro[])
      setResumo(res.resumo)
      setTotal(res.total)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
      setRegistros([])
    } finally {
      setLoading(false)
    }
  }, [page, debounced])

  useEffect(() => { carregar() }, [carregar])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function exportarCsv() {
    const res = await trpc.cliente.gestaoContratos.query({ page: 1, limit: 100, search: debounced || undefined })
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
      {/* Header inline padrão (subpágina de Comercial) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1>Gestão de Contratos</h1>
            <p className="text-sm text-muted-foreground">Variação dos parâmetros contratados × movimento atual no ERP</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportarCsv} disabled={loading || total === 0}>
            <FileDown className="h-4 w-4" /> CSV
          </Button>
          <BackButton href="/comercial" label="Voltar" />
        </div>
      </div>

      {/* Cards de indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Users} label="Total de clientes" value={resumo.total} color={MODULE_COLOR} loading={loading} />
        <StatCard icon={CheckCircle2} label="Em dia" value={resumo.emDia} color="#10b981" loading={loading} />
        <StatCard icon={TrendingUp} label="Com variação defasada" value={resumo.defasados} color="#f43f5e" loading={loading} />
        <StatCard icon={CalendarClock} label="Contratos a vencer" value={resumo.vencendo} color="#f59e0b"
          sub={resumo.vencidos > 0 ? `${resumo.vencidos} já vencido${resumo.vencidos === 1 ? '' : 's'}` : undefined} loading={loading} />
        <StatCard icon={Info} label="Sem parâmetro" value={resumo.semParametro} color="#94a3b8" loading={loading} />
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <span className="text-sm font-semibold">Indicações de variação dos contratos</span>
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
                    <TableHead className="w-12 text-center text-xs font-semibold uppercase tracking-wider">#</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">CNPJ</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Cliente</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Situação</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider" title="Sugestão de renegociação — acende antes do farol">Recomendação</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Vigência</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Faturamento</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Honorários</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Lançamentos</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Notas</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Vidas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-10 text-center text-sm text-muted-foreground">
                        Nenhum cliente com contrato ou parâmetros. Use &quot;Verificar no ERP&quot; no detalhe do cliente para alimentar os dados.
                      </TableCell>
                    </TableRow>
                  ) : registros.map(r => {
                    const sit = SITUACAO_BADGE[r.situacao]
                    const vig = VIGENCIA_INFO[r.vigencia]
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
                        <TableCell className="text-center text-xs text-muted-foreground">{r.numero}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">{fmtCnpj(r.documento)}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-sm font-medium">{r.cliente || '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn('font-normal', sit.cls)}>{sit.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <StatusIcon icon={FileSignature} active={r.temContrato}
                              title={r.temContrato ? 'Contrato vinculado' : 'Sem contrato cadastrado'} />
                            <StatusIcon icon={SlidersHorizontal} active={r.temParametro}
                              title={r.temParametro ? 'Parâmetros iniciais cadastrados' : 'Sem parâmetros iniciais'} />
                            <StatusIcon icon={Database} active={r.erpMeses > 0} count={r.erpMeses}
                              title={r.erpMeses > 0 ? `${r.erpMeses} período(s) importado(s) do ERP (SCI)` : 'Nenhum período importado do ERP'} />
                            <StatusIcon icon={Paperclip} active={r.anexosCount > 0} count={r.anexosCount}
                              title={r.anexosCount > 0 ? `${r.anexosCount} arquivo(s) anexado(s)` : 'Sem anexos'} />
                            <StatusIcon icon={RefreshCcw} active={r.situacao === 'defasado'} tone="alert"
                              title={r.situacao === 'defasado' ? 'Cliente cresceu além do contratado — reavaliar honorário' : 'Sem sinal de renegociação'} />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
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
                        <TableCell className="whitespace-nowrap text-xs">
                          {!r.temContrato ? (
                            <span className="text-muted-foreground">Sem contrato</span>
                          ) : (
                            <span className={vig.cls} title={r.dataFim ? `Vence em ${r.dataFim.split('-').reverse().join('/')}` : undefined}>
                              {vig.label}
                              {r.diasParaVencer != null && r.vigencia !== 'vigente' && (
                                <span className="ml-1 text-muted-foreground">
                                  ({r.diasParaVencer < 0 ? `há ${Math.abs(r.diasParaVencer)}d` : `${r.diasParaVencer}d`})
                                </span>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmtMoeda(r.faturamento)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmtMoeda(r.honorarios)}</TableCell>
                        <TableCell className="text-center text-sm tabular-nums">
                          {r.lancamentos == null ? '—' : r.lancamentos}
                          <VariacaoBadge pct={r.variacao_lancamentos_pct} />
                        </TableCell>
                        <TableCell className="text-center text-sm tabular-nums">
                          {r.notas == null ? '—' : r.notas}
                          <VariacaoBadge pct={r.variacao_notas_pct} />
                        </TableCell>
                        <TableCell className="text-center text-sm tabular-nums">
                          {r.vidas == null ? '—' : r.vidas}
                          <VariacaoBadge pct={r.variacao_vidas_pct} />
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
    </div>
  )
}
