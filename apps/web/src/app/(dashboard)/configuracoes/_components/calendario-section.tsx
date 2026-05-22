'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Search, Loader2, MoreVertical, Pencil, Calendar, Save, X,
  Filter, List, LayoutGrid,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  FERIADO_TIPO, FERIADO_TIPO_LABELS, FERIADO_TIPO_CORES,
  UFS_BRASIL,
  type FeriadoTipo,
} from '@saas/types'

const MODULE_COLOR = 'var(--mod-configuracoes, #f97316)' // Orange — Configurações

interface Feriado {
  id: string
  nome: string
  tipo: FeriadoTipo
  data: string
  recorrente: boolean
  uf: string | null
  cidade: string | null
  observacao: string | null
  empresaId: string | null
}

interface Stats {
  total: number
  porTipo: Record<string, number>
}

const ANO_ATUAL = new Date().getFullYear()
const ANOS_DISPONIVEIS = Array.from({ length: 7 }, (_, i) => ANO_ATUAL - 3 + i)

function formatDataBR(iso: string, recorrente: boolean): string {
  const d = new Date(iso)
  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  if (recorrente) return `${dia}/${mes}`
  return `${dia}/${mes}/${d.getUTCFullYear()}`
}

function isoFromDate(iso: string): string {
  // Postgres @db.Date vem como ISO datetime — pegamos só yyyy-mm-dd
  return iso.slice(0, 10)
}

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Letra-marcador por tipo — destaca o tipo do feriado mesmo em viewport pequena. */
const FERIADO_TIPO_SIGLA: Record<FeriadoTipo, string> = {
  NACIONAL: 'N',
  ESTADUAL: 'E',
  MUNICIPAL: 'M',
  PONTO_FACULTATIVO: 'F',
}
/** Borda esquerda mais escura que o fundo — efeito "fita" lateral por tipo. */
const FERIADO_TIPO_BORDA_FORTE: Record<FeriadoTipo, string> = {
  NACIONAL: 'border-l-rose-500',
  ESTADUAL: 'border-l-sky-500',
  MUNICIPAL: 'border-l-emerald-500',
  PONTO_FACULTATIVO: 'border-l-amber-500',
}

/**
 * Tooltip estilizado CSS-only — usa `group-hover` do botão pai pra aparecer.
 * Posicionado em cima do dia, com seta apontando pra baixo, lista os feriados.
 */
function DiaTooltip({ feriados, posicaoTopo }: { feriados: Feriado[]; posicaoTopo: boolean }) {
  return (
    <div
      className={cn(
        'invisible opacity-0 group-hover:visible group-hover:opacity-100',
        'absolute left-1/2 -translate-x-1/2 z-50 w-[240px] pointer-events-none',
        'transition-opacity duration-150',
        posicaoTopo ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      <div className="rounded-md bg-popover text-popover-foreground shadow-lg ring-1 ring-black/10 dark:ring-white/10 p-2.5 space-y-2 text-left">
        {feriados.map((f) => {
          const cores = FERIADO_TIPO_CORES[f.tipo]
          return (
            <div key={f.id} className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold leading-tight">{f.nome}</p>
                <Badge
                  variant="outline"
                  className={cn('h-4 px-1.5 text-[9px] font-medium border shrink-0', cores.bg, cores.text, cores.border)}
                >
                  {FERIADO_TIPO_LABELS[f.tipo]}
                </Badge>
              </div>
              {(f.cidade || f.uf) && (
                <p className="text-[10px] text-muted-foreground">
                  {f.cidade ? `${f.cidade} · ${f.uf}` : f.uf}
                </p>
              )}
              {f.observacao && (
                <p className="text-[10px] text-muted-foreground line-clamp-2 italic">
                  {f.observacao}
                </p>
              )}
              {!f.recorrente && (
                <p className="text-[9px] text-amber-700 dark:text-amber-400">⚠ Apenas neste ano</p>
              )}
            </div>
          )
        })}
        {feriados.length > 1 && (
          <p className="text-[9px] text-muted-foreground border-t pt-1.5">
            Clique abre o primeiro registro
          </p>
        )}
      </div>
      {/* Seta */}
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-popover rotate-45 ring-1 ring-black/10 dark:ring-white/10',
          posicaoTopo ? 'top-full -mt-1' : 'bottom-full -mb-1',
        )}
      />
    </div>
  )
}

/**
 * Mini-calendário de um mês — pinta o fundo do dia quando há feriado na
 * data, com a cor do tipo (Nacional/Estadual/Municipal/PF). Múltiplos
 * feriados no mesmo dia ganham um "+N" no badge.
 */
function MesCalendario({
  ano,
  mes, // 0-indexed
  feriadosPorDia,
  onClickFeriado,
}: {
  ano: number
  mes: number
  feriadosPorDia: Map<number, Feriado[]>
  onClickFeriado: (f: Feriado) => void
}) {
  const primeiroDia = new Date(ano, mes, 1).getDay() // 0=dom
  const totalDias = new Date(ano, mes + 1, 0).getDate()
  const hoje = new Date()
  const isMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === mes

  // Total de feriados no mês — exibido no header pra dar contexto rápido
  let totalFeriadosNoMes = 0
  feriadosPorDia.forEach((arr) => { totalFeriadosNoMes += arr.length })

  // Gera células: vazios + dias do mês
  const celulas: Array<{ dia: number | null; feriados: Feriado[] }> = []
  for (let i = 0; i < primeiroDia; i++) celulas.push({ dia: null, feriados: [] })
  for (let d = 1; d <= totalDias; d++) {
    celulas.push({ dia: d, feriados: feriadosPorDia.get(d) ?? [] })
  }
  // Total de linhas (sempre múltiplo de 7) — usado pra decidir posição do tooltip
  const totalLinhas = Math.ceil(celulas.length / 7)

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md',
        isMesAtual ? 'border-orange-300 ring-1 ring-orange-200/50' : 'border-border/60',
      )}
    >
      {/* Header do mês */}
      <div className="flex items-baseline justify-between mb-2.5 pb-2 border-b border-border/40">
        <h5
          className={cn(
            'text-[13px] font-bold tracking-tight',
            isMesAtual ? 'text-orange-600' : 'text-foreground',
          )}
        >
          {MESES_PT[mes]}
        </h5>
        {totalFeriadosNoMes > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {totalFeriadosNoMes} feriado{totalFeriadosNoMes > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Header de dias da semana */}
      <div className="grid grid-cols-7 gap-1 text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {DIAS_SEMANA.map((d, i) => (
          <div
            key={i}
            className={cn(
              'text-center font-semibold py-0.5',
              (i === 0 || i === 6) && 'text-rose-400/70',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((c, i) => {
          if (c.dia === null) return <div key={i} className="h-8" />
          const tem = c.feriados.length > 0
          const isToday = isMesAtual && hoje.getDate() === c.dia
          const colIdx = i % 7
          const isFds = colIdx === 0 || colIdx === 6
          const rowIdx = Math.floor(i / 7)
          // Tooltip aparece pra cima quando o dia está na metade inferior
          const tooltipNoTopo = rowIdx >= totalLinhas - 2
          const cores = tem ? FERIADO_TIPO_CORES[c.feriados[0]!.tipo] : null

          // Tipo dominante (primeiro feriado da data) — define sigla + borda forte
          const tipoDominante = tem ? c.feriados[0]!.tipo : null
          const sigla = tipoDominante ? FERIADO_TIPO_SIGLA[tipoDominante] : null
          const bordaForte = tipoDominante ? FERIADO_TIPO_BORDA_FORTE[tipoDominante] : null
          const multi = c.feriados.length > 1

          // O conteúdo visual do botão é igual independente de ter 1 ou N feriados
          const conteudoBotao = (
            <>
              <span>{c.dia}</span>
              {sigla && (
                <span
                  className={cn(
                    'absolute bottom-0 right-0.5 text-[7px] font-extrabold leading-none opacity-70',
                    cores?.text,
                  )}
                >
                  {sigla}
                </span>
              )}
              {multi && (
                <span className="absolute -top-1 -right-1 z-20 h-4 w-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow ring-2 ring-white pointer-events-none">
                  {c.feriados.length}
                </span>
              )}
            </>
          )
          const classesBotao = cn(
            'relative w-full h-8 rounded-md text-[11px] tabular-nums transition-all',
            'flex items-center justify-center',
            tem
              ? cn(
                  cores!.bg, cores!.text,
                  'border border-l-[3px]', cores!.border, bordaForte,
                  'font-bold shadow-sm cursor-pointer',
                  'hover:scale-110 hover:shadow-md hover:z-10',
                )
              : cn(
                  'border border-transparent font-medium',
                  isFds ? 'text-foreground/40' : 'text-foreground/80',
                  'hover:bg-muted hover:border-border/60',
                ),
            isToday && !tem && 'bg-orange-500 text-white font-bold shadow-sm border-orange-500',
            isToday && tem && 'ring-2 ring-orange-500 ring-offset-1 z-10',
          )

          return (
            <div key={i} className="relative group">
              {/* Dia com 1 feriado → click direto. Dia com N → dropdown lista cada um. */}
              {multi ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={classesBotao}>{conteudoBotao}</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-[260px]">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {c.feriados.length} feriados em {String(c.dia).padStart(2, '0')}/{String(mes + 1).padStart(2, '0')}
                    </div>
                    <DropdownMenuSeparator />
                    {c.feriados.map((f) => {
                      const fcores = FERIADO_TIPO_CORES[f.tipo]
                      return (
                        <DropdownMenuItem
                          key={f.id}
                          onClick={() => onClickFeriado(f)}
                          className="flex flex-col items-start gap-0.5 py-2"
                        >
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="text-xs font-semibold truncate">{f.nome}</span>
                            <Badge
                              variant="outline"
                              className={cn('h-4 px-1.5 text-[9px] font-medium border shrink-0', fcores.bg, fcores.text, fcores.border)}
                            >
                              {FERIADO_TIPO_LABELS[f.tipo]}
                            </Badge>
                          </div>
                          {(f.cidade || f.uf) && (
                            <span className="text-[10px] text-muted-foreground">
                              {f.cidade ? `${f.cidade} · ${f.uf}` : f.uf}
                            </span>
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  onClick={() => tem && onClickFeriado(c.feriados[0]!)}
                  className={classesBotao}
                >
                  {conteudoBotao}
                </button>
              )}
              {/* Tooltip — visível só quando dropdown não está aberto (Radix esconde via group-hover natural) */}
              {tem && <DiaTooltip feriados={c.feriados} posicaoTopo={tooltipNoTopo} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarioSection() {
  const [items, setItems] = useState<Feriado[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroAno, setFiltroAno] = useState<number | 'TODOS'>(ANO_ATUAL)
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | FeriadoTipo>('TODOS')
  const [filtroUf, setFiltroUf] = useState<string>('TODAS')
  const [view, setView] = useState<'tabela' | 'calendario'>('tabela')

  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Dialog de criar/editar
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Feriado | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formTipo, setFormTipo] = useState<FeriadoTipo>('MUNICIPAL')
  const [formData, setFormData] = useState('')
  const [formRecorrente, setFormRecorrente] = useState(true)
  const [formUf, setFormUf] = useState<string>('ES')
  const [formCidade, setFormCidade] = useState('')
  const [formObservacao, setFormObservacao] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t) }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [list, st] = await Promise.all([
        (trpc as any).feriado.list.query({
          ano: filtroAno === 'TODOS' ? undefined : filtroAno,
          tipo: filtroTipo === 'TODOS' ? undefined : filtroTipo,
          uf: filtroUf === 'TODAS' ? undefined : filtroUf,
          search: debouncedSearch || undefined,
        }),
        (trpc as any).feriado.stats.query(),
      ])
      setItems(list as Feriado[])
      setStats(st)
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao carregar feriados.')
    } finally { setLoading(false) }
  }, [debouncedSearch, filtroAno, filtroTipo, filtroUf])

  useEffect(() => { void fetchData() }, [fetchData])

  function abrirNovo() {
    setEditing(null)
    setFormNome('')
    setFormTipo('MUNICIPAL')
    setFormData(`${ANO_ATUAL}-01-01`)
    setFormRecorrente(true)
    setFormUf('ES')
    setFormCidade('')
    setFormObservacao('')
    setDialogOpen(true)
  }

  function abrirEdicao(f: Feriado) {
    setEditing(f)
    setFormNome(f.nome)
    setFormTipo(f.tipo)
    setFormData(isoFromDate(f.data))
    setFormRecorrente(f.recorrente)
    setFormUf(f.uf ?? '')
    setFormCidade(f.cidade ?? '')
    setFormObservacao(f.observacao ?? '')
    setDialogOpen(true)
  }

  async function salvar() {
    if (!formNome.trim()) {
      alerts.error('Nome obrigatório', 'Informe o nome do feriado.')
      return
    }
    if (formTipo === 'ESTADUAL' && !formUf) {
      alerts.error('UF obrigatória', 'Feriados estaduais precisam de UF.')
      return
    }
    if (formTipo === 'MUNICIPAL' && (!formUf || !formCidade.trim())) {
      alerts.error('UF e cidade obrigatórias', 'Feriados municipais precisam de UF e cidade.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nome: formNome.trim(),
        tipo: formTipo,
        data: formData,
        recorrente: formRecorrente,
        uf: ['ESTADUAL', 'MUNICIPAL'].includes(formTipo) ? formUf : null,
        cidade: formTipo === 'MUNICIPAL' ? formCidade.trim() : null,
        observacao: formObservacao.trim() || null,
      }
      if (editing) {
        await (trpc as any).feriado.update.mutate({ id: editing.id, data: payload })
        await alerts.success('Atualizado', `"${formNome}" foi atualizado.`)
      } else {
        await (trpc as any).feriado.create.mutate(payload)
        await alerts.success('Cadastrado', `"${formNome}" foi adicionado ao calendário.`)
      }
      setDialogOpen(false)
      fetchData()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao salvar feriado.')
    } finally { setSaving(false) }
  }

  async function excluir(id: string, nome: string) {
    if (!await alerts.confirmDelete(nome)) return
    try {
      await (trpc as any).feriado.delete.mutate({ id })
      await alerts.success('Excluído', `"${nome}" foi removido.`)
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao excluir.') }
  }

  async function bulkDelete() {
    const ok = await alerts.confirm({
      title: `Excluir ${selected.size} feriado(s)?`,
      text: 'Os registros serão removidos do calendário. Essa ação não pode ser desfeita.',
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc as any).feriado.bulkDelete.mutate({ ids: Array.from(selected) })
      setSelected(new Set())
      await alerts.success('Excluídos', `${selected.size} feriado(s) removido(s).`)
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao excluir em lote.') }
  }

  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id))

  return (
    <div className="flex flex-col h-full">
      {/* Header com título + ações */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" /> Calendário de feriados
        </h4>
        <div className="flex items-center gap-2">
          {/* Toggle de visualização */}
          <div className="flex items-center rounded border border-border/60 bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setView('tabela')}
              title="Visualização em tabela"
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors',
                view === 'tabela' ? 'text-white' : 'text-muted-foreground hover:text-foreground',
              )}
              style={view === 'tabela' ? { backgroundColor: MODULE_COLOR } : undefined}
            >
              <List className="h-3.5 w-3.5" />Tabela
            </button>
            <button
              type="button"
              onClick={() => setView('calendario')}
              title="Visualização em calendário (12 meses)"
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border/60',
                view === 'calendario' ? 'text-white' : 'text-muted-foreground hover:text-foreground',
              )}
              style={view === 'calendario' ? { backgroundColor: MODULE_COLOR } : undefined}
            >
              <LayoutGrid className="h-3.5 w-3.5" />Calendário
            </button>
          </div>
          <Button size="sm" onClick={abrirNovo} style={{ backgroundColor: MODULE_COLOR, color: 'white' }}>
            <Plus className="h-4 w-4" />Novo feriado
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Stats compactos */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Card className="p-2.5">
              <div className="text-[10px] uppercase text-muted-foreground">Total</div>
              <div className="text-xl font-semibold tabular-nums">{stats.total}</div>
            </Card>
            {FERIADO_TIPO.map((t) => {
              const cores = FERIADO_TIPO_CORES[t]
              return (
                <Card key={t} className={cn('p-2.5 border-l-2', cores.border)}>
                  <div className={cn('text-[10px] uppercase', cores.text)}>{FERIADO_TIPO_LABELS[t]}</div>
                  <div className="text-xl font-semibold tabular-nums">{stats.porTipo[t] ?? 0}</div>
                </Card>
              )
            })}
          </div>
        )}

        <Card>
          {/* Toolbar com filtros */}
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filtros</span>
              </div>
              <Select value={String(filtroAno)} onValueChange={(v) => setFiltroAno(v === 'TODOS' ? 'TODOS' : Number(v))}>
                <SelectTrigger className="h-8 w-[110px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos anos</SelectItem>
                  {ANOS_DISPONIVEIS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
                <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos os tipos</SelectItem>
                  {FERIADO_TIPO.map((t) => <SelectItem key={t} value={t}>{FERIADO_TIPO_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroUf} onValueChange={setFiltroUf}>
                <SelectTrigger className="h-8 w-[100px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas UFs</SelectItem>
                  {UFS_BRASIL.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="relative max-w-xs w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar feriado..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-card"
              />
            </div>
          </div>

          {/* Barra de bulk delete */}
          {selected.size > 0 && (
            <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
              <span className="text-xs font-medium text-amber-900">
                {selected.size} item{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
                <Button variant="destructive" size="sm" onClick={bulkDelete}>
                  <Trash2 className="h-3.5 w-3.5" />Excluir selecionados
                </Button>
              </div>
            </div>
          )}

          {/* Tabela */}
          {view === 'tabela' && (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(v) => {
                      if (v) setSelected(new Set(items.map((i) => i.id)))
                      else setSelected(new Set())
                    }}
                  />
                </TableHead>
                <TableHead className="w-[90px] whitespace-nowrap">Data</TableHead>
                <TableHead className="w-auto whitespace-nowrap">Nome</TableHead>
                <TableHead className="hidden sm:table-cell w-[130px] whitespace-nowrap">Tipo</TableHead>
                <TableHead className="hidden md:table-cell w-[60px] text-center whitespace-nowrap">UF</TableHead>
                <TableHead className="hidden md:table-cell w-[160px] whitespace-nowrap">Município</TableHead>
                <TableHead className="hidden lg:table-cell w-[70px] text-center whitespace-nowrap">Anual</TableHead>
                <TableHead className="w-[70px] text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                      Carregando feriados...
                    </div>
                  </TableCell>
                </TableRow>
              ) : !items.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    Nenhum feriado cadastrado nesses filtros
                  </TableCell>
                </TableRow>
              ) : (
                items.map((f) => {
                  const cores = FERIADO_TIPO_CORES[f.tipo]
                  return (
                    <TableRow key={f.id} className="hover:bg-muted/30">
                      <TableCell className="w-[36px]" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(f.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selected)
                            if (v) next.add(f.id); else next.delete(f.id)
                            setSelected(next)
                          }}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-xs">
                        {formatDataBR(f.data, f.recorrente)}
                      </TableCell>
                      <TableCell className="truncate" title={f.nome}>
                        <span className="font-medium text-sm">{f.nome}</span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-nowrap">
                        <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium border', cores.bg, cores.text, cores.border)}>
                          {FERIADO_TIPO_LABELS[f.tipo]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-center text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {f.uf ?? '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell truncate text-xs text-muted-foreground" title={f.cidade ?? undefined}>
                        {f.cidade ?? '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-center whitespace-nowrap">
                        {f.recorrente ? (
                          <Badge variant="outline" className="h-5 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            Anual
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Único</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => abrirEdicao(f)}>
                                <Pencil className="h-4 w-4" />Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => excluir(f.id, f.nome)} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4" />Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          )}

          {/* Visualização calendário (12 meses) */}
          {view === 'calendario' && (() => {
            // Em modo calendário, usa o ano filtrado (ou ano atual quando "TODOS")
            const anoView = filtroAno === 'TODOS' ? ANO_ATUAL : filtroAno
            // Indexa por mês (0-11) → Map<dia, Feriado[]> considerando recorrentes
            const porMes: Record<number, Map<number, Feriado[]>> = {}
            for (let m = 0; m < 12; m++) porMes[m] = new Map()
            for (const f of items) {
              const d = new Date(f.data)
              const dia = d.getUTCDate()
              const mes = d.getUTCMonth()
              const anoF = d.getUTCFullYear()
              // Não-recorrentes só aparecem se o ano bater
              if (!f.recorrente && anoF !== anoView) continue
              const arr = porMes[mes]!.get(dia) ?? []
              arr.push(f)
              porMes[mes]!.set(dia, arr)
            }
            return (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Ano <span className="tabular-nums text-foreground">{anoView}</span>
                    {filtroAno === 'TODOS' && (
                      <span className="ml-1 text-[10px] text-amber-700">
                        (visualização sempre mostra um ano por vez)
                      </span>
                    )}
                  </div>
                  {/* Legenda compacta com sigla */}
                  <div className="flex flex-wrap items-center gap-2.5 text-[10px] text-muted-foreground">
                    {FERIADO_TIPO.map((t) => {
                      const c = FERIADO_TIPO_CORES[t]
                      return (
                        <span key={t} className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center justify-center h-4 w-4 rounded text-[8px] font-extrabold border border-l-[3px]',
                              c.bg, c.text, c.border, FERIADO_TIPO_BORDA_FORTE[t],
                            )}
                          >
                            {FERIADO_TIPO_SIGLA[t]}
                          </span>
                          <span>{FERIADO_TIPO_LABELS[t]}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array.from({ length: 12 }, (_, m) => (
                    <MesCalendario
                      key={m}
                      ano={anoView}
                      mes={m}
                      feriadosPorDia={porMes[m]!}
                      onClickFeriado={abrirEdicao}
                    />
                  ))}
                </div>
              </div>
            )
          })()}

          <div className="border-t border-border/60 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            Exibindo <span className="font-medium text-foreground">{items.length}</span> feriado{items.length === 1 ? '' : 's'}
            {filtroAno !== 'TODOS' && <> em {filtroAno}</>}
          </div>
        </Card>
      </div>

      {/* Dialog de criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeaderIcon icon={editing ? Pencil : Plus} color={editing ? 'sky' : 'emerald'}>
            <DialogTitle>{editing ? 'Editar feriado' : 'Novo feriado'}</DialogTitle>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome <span className="text-red-500">*</span></Label>
              <Input
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex.: Nossa Senhora da Penha"
                className="h-9 text-sm"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-5 space-y-1.5">
                <Label className="text-[13px] font-semibold">Tipo</Label>
                <Select value={formTipo} onValueChange={(v) => setFormTipo(v as FeriadoTipo)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FERIADO_TIPO.map((t) => <SelectItem key={t} value={t}>{FERIADO_TIPO_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Data <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={formData}
                  onChange={(e) => setFormData(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="col-span-12 sm:col-span-3 flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={formRecorrente}
                    onCheckedChange={(v) => setFormRecorrente(!!v)}
                  />
                  Repetir todo ano
                </label>
              </div>
            </div>

            {['ESTADUAL', 'MUNICIPAL'].includes(formTipo) && (
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4 sm:col-span-3 space-y-1.5">
                  <Label className="text-[13px] font-semibold">UF <span className="text-red-500">*</span></Label>
                  <Select value={formUf} onValueChange={setFormUf}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UFS_BRASIL.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {formTipo === 'MUNICIPAL' && (
                  <div className="col-span-8 sm:col-span-9 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Município <span className="text-red-500">*</span></Label>
                    <Input
                      value={formCidade}
                      onChange={(e) => setFormCidade(e.target.value)}
                      placeholder="Ex.: Vitória"
                      className="h-9 text-sm"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Observação</Label>
              <textarea
                value={formObservacao}
                onChange={(e) => setFormObservacao(e.target.value)}
                placeholder="Lei municipal, decreto estadual, fonte oficial..."
                className="w-full min-h-[70px] rounded-[4px] border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="h-4 w-4" />Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving} style={{ backgroundColor: MODULE_COLOR, color: 'white' }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
