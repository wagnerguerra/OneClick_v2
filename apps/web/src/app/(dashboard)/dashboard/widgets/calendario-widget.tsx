'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronLeft, ChevronRight, Sparkles, ListChecks, FileText, ClipboardCheck, CalendarDays, Cake, PartyPopper } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api-url'
import { Card, CardContent, CardHeader, CardTitle, Button, cn, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'

const DIAS_SEMANA_MINI = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const DIAS_SEMANA_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

type PrazoTipo = 'agenda' | 'servico' | 'orcamento' | 'obrigacao'

interface PrazoItem {
  id: string
  tipo: PrazoTipo
  titulo: string
  subtitulo?: string | null
  data: string             // YYYY-MM-DD
  horaInicio?: string | null
  link?: string | null
  cor?: string | null
  atrasado?: boolean
}

interface DataEspecial { data: string; nome: string; tipo: 'feriado' | 'comemorativa' }

interface Comemoracao {
  id: string
  tipo: 'aniversario' | 'admissao'
  nome: string
  image: string | null
  dia: number
  anos?: number
}

// Paleta por tipo de prazo
const TIPO_CONFIG: Record<PrazoTipo, {
  label: string
  icon: typeof Calendar
  dotClass: string
  bgClass: string
  textClass: string
  borderClass: string
}> = {
  agenda: {
    label: 'Agenda',
    icon: CalendarDays,
    dotClass: 'bg-sky-500',
    bgClass: 'bg-sky-50/80 dark:bg-sky-950/40',
    textClass: 'text-sky-800 dark:text-sky-200',
    borderClass: 'border-sky-500',
  },
  servico: {
    label: 'Serviço',
    icon: ListChecks,
    dotClass: 'bg-emerald-500',
    bgClass: 'bg-emerald-50/80 dark:bg-emerald-950/40',
    textClass: 'text-emerald-800 dark:text-emerald-200',
    borderClass: 'border-emerald-500',
  },
  orcamento: {
    label: 'Orçamento',
    icon: FileText,
    dotClass: 'bg-amber-500',
    bgClass: 'bg-amber-50/80 dark:bg-amber-950/40',
    textClass: 'text-amber-800 dark:text-amber-200',
    borderClass: 'border-amber-500',
  },
  obrigacao: {
    label: 'Obrigação',
    icon: ClipboardCheck,
    dotClass: 'bg-violet-500',
    bgClass: 'bg-violet-50/80 dark:bg-violet-950/40',
    textClass: 'text-violet-800 dark:text-violet-200',
    borderClass: 'border-violet-500',
  },
}

function calcularPascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function getDatasEspeciais(ano: number): DataEspecial[] {
  const pascoa = calcularPascoa(ano)
  const addDias = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
  const fmt = (d: Date) => `${ano}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return [
    { data: `${ano}-01-01`, nome: 'Confraternização Universal', tipo: 'feriado' },
    { data: fmt(addDias(pascoa, -47)), nome: 'Carnaval', tipo: 'feriado' },
    { data: fmt(addDias(pascoa, -46)), nome: 'Carnaval', tipo: 'feriado' },
    { data: fmt(addDias(pascoa, -2)), nome: 'Sexta-feira Santa', tipo: 'feriado' },
    { data: fmt(pascoa), nome: 'Páscoa', tipo: 'feriado' },
    { data: `${ano}-04-21`, nome: 'Tiradentes', tipo: 'feriado' },
    { data: `${ano}-05-01`, nome: 'Dia do Trabalho', tipo: 'feriado' },
    { data: fmt(addDias(pascoa, 60)), nome: 'Corpus Christi', tipo: 'feriado' },
    { data: `${ano}-09-07`, nome: 'Independência do Brasil', tipo: 'feriado' },
    { data: `${ano}-10-12`, nome: 'Nossa Sra. Aparecida', tipo: 'feriado' },
    { data: `${ano}-11-02`, nome: 'Finados', tipo: 'feriado' },
    { data: `${ano}-11-15`, nome: 'Proclamação da República', tipo: 'feriado' },
    { data: `${ano}-11-20`, nome: 'Consciência Negra', tipo: 'feriado' },
    { data: `${ano}-12-25`, nome: 'Natal', tipo: 'feriado' },
    { data: `${ano}-04-25`, nome: 'Dia do Contabilista', tipo: 'comemorativa' },
    { data: `${ano}-12-24`, nome: 'Véspera de Natal', tipo: 'comemorativa' },
    { data: `${ano}-12-31`, nome: 'Véspera de Ano Novo', tipo: 'comemorativa' },
  ]
}

function formatHora(h: string | null | undefined): string {
  if (!h) return ''
  return h.slice(0, 5)
}

export function CalendarioWidget({ title, expanded }: { canRead?: boolean; title?: string; expanded?: boolean; bloco?: string } = {}) {
  const router = useRouter()
  const today = new Date()
  const [calYear, setCalYear] = useState(() => today.getFullYear())
  const [calMonth, setCalMonth] = useState(() => today.getMonth())
  const [prazos, setPrazos] = useState<PrazoItem[]>([])
  const [comemoracoes, setComemoracoes] = useState<Comemoracao[]>([])
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [modalDay, setModalDay] = useState<number | null>(null)

  useEffect(() => {
    const inicio = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate()
    const fim = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    ;(trpc as any).dashboardCalendario.listPrazos
      .query({ inicio, fim })
      .then((r: PrazoItem[]) => setPrazos(r ?? []))
      .catch(() => setPrazos([]))
    // Aniversariantes e admissões do mês — independente dos prazos
    ;(trpc as any).dashboardCalendario.listComemoracoes
      .query({ ano: calYear, mes: calMonth + 1 })
      .then((r: Comemoracao[]) => setComemoracoes(r ?? []))
      .catch(() => setComemoracoes([]))
  }, [calYear, calMonth])

  // Agrupa comemorações por dia
  const comemoracoesPorDia = useMemo(() => {
    const map: Record<number, Comemoracao[]> = {}
    for (const c of comemoracoes) {
      if (!map[c.dia]) map[c.dia] = []
      map[c.dia]!.push(c)
    }
    return map
  }, [comemoracoes])

  const datasEspeciais = useMemo(() => getDatasEspeciais(calYear), [calYear])
  const feriadoMap = useMemo(() => {
    const m: Record<string, DataEspecial> = {}
    for (const f of datasEspeciais) if (!m[f.data]) m[f.data] = f
    return m
  }, [datasEspeciais])

  // Agrupa prazos por dia do mês corrente
  const prazosPorDia = useMemo(() => {
    const map: Record<number, PrazoItem[]> = {}
    for (const p of prazos) {
      const [yy, mm, dd] = p.data.split('-').map(Number)
      if (yy === calYear && (mm! - 1) === calMonth) {
        const d = dd!
        if (!map[d]) map[d] = []
        map[d]!.push(p)
      }
    }
    // #HLP0254: ordena cada dia por horário (HH:MM asc). Sem horário (dia inteiro/
    // obrigação/orçamento por data) vai pro fim.
    for (const d in map) {
      map[d]!.sort((a, b) => (a.horaInicio || '99:99').localeCompare(b.horaInicio || '99:99'))
    }
    return map
  }, [prazos, calMonth, calYear])

  // Contagem por tipo no mês (pra legenda)
  const totaisPorTipo = useMemo(() => {
    const c: Record<PrazoTipo, number> = { agenda: 0, servico: 0, orcamento: 0, obrigacao: 0 }
    for (const p of prazos) c[p.tipo]++
    return c
  }, [prazos])

  const calFirstDay = new Date(calYear, calMonth, 1).getDay()
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calTotalCells = Math.ceil((calFirstDay + calDaysInMonth) / 7) * 7

  function nav(dir: 1 | -1) {
    let m = calMonth + dir, y = calYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCalMonth(m); setCalYear(y); setSelectedDay(null)
  }

  const numRows = calTotalCells / 7
  const isCurrentMonth = today.getMonth() === calMonth && today.getFullYear() === calYear

  function irHoje() {
    setCalMonth(today.getMonth())
    setCalYear(today.getFullYear())
    setSelectedDay(today.getDate())
  }

  if (expanded) {
    return (
      <CalendarioExpandido
        year={calYear}
        month={calMonth}
        prazos={prazos}
        prazosPorDia={prazosPorDia}
        comemoracoesPorDia={comemoracoesPorDia}
        feriadoMap={feriadoMap}
        firstDayOffset={calFirstDay}
        daysInMonth={calDaysInMonth}
        totalCells={calTotalCells}
        today={today}
        isCurrentMonth={isCurrentMonth}
        onNav={nav}
        onHoje={irHoje}
        title={title}
      />
    )
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3 shrink-0 border-b border-border/50 bg-gradient-to-br from-sky-50/50 via-transparent to-transparent dark:from-sky-950/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <Calendar className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-bold leading-tight capitalize">{title ?? MESES_NOME[calMonth].toLowerCase()}</CardTitle>
              <p className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                {calYear}
                {isCurrentMonth && (
                  <span className="ml-1.5 inline-flex items-center rounded-sm bg-sky-100 dark:bg-sky-900/40 px-1 py-0 text-[9px] font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wider">
                    Atual
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!isCurrentMonth && (
              <Button variant="ghost" size="sm" onClick={irHoje} className="h-7 px-2 text-[11px] font-medium">
                Hoje
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" onClick={() => nav(-1)} title="Mês anterior" className="h-7 w-7">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => nav(1)} title="Próximo mês" className="h-7 w-7">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 pb-3 pt-3">
        <div className="grid grid-cols-7 mb-1.5 shrink-0">
          {DIAS_SEMANA_MINI.map((d, i) => (
            <div
              key={i}
              className={cn(
                'text-center text-[10px] font-bold uppercase tracking-wider py-1',
                (i === 0 || i === 6) ? 'text-rose-400/70' : 'text-muted-foreground',
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div
          className="grid grid-cols-7 flex-1 min-h-0 gap-1"
          style={{ gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: calTotalCells }, (_, i) => {
            const dayNum = i - calFirstDay + 1
            const isValid = dayNum >= 1 && dayNum <= calDaysInMonth
            const isToday = isValid && today.getDate() === dayNum && today.getMonth() === calMonth && today.getFullYear() === calYear
            const dateStr = isValid ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : ''
            const dayPrazos = isValid ? (prazosPorDia[dayNum] ?? []) : []
            const dayComemoracoes = isValid ? (comemoracoesPorDia[dayNum] ?? []) : []
            const especial = isValid ? feriadoMap[dateStr] : undefined
            const isSelected = selectedDay === dayNum
            const colIdx = i % 7
            const isFds = colIdx === 0 || colIdx === 6

            const tituloHover = [
              dayPrazos.length > 0 ? `${dayPrazos.length} pendência${dayPrazos.length > 1 ? 's' : ''}` : null,
              dayComemoracoes.length > 0 ? dayComemoracoes.map(c => `${c.tipo === 'aniversario' ? '🎂' : '🎉'} ${c.nome}`).join(', ') : null,
              especial?.nome,
            ].filter(Boolean).join(' · ')

            return (
              <button
                key={i}
                type="button"
                disabled={!isValid}
                onClick={() => {
                  if (!isValid) return
                  // Selection visual + abre modal se há conteúdo no dia
                  setSelectedDay(prev => prev === dayNum ? null : dayNum)
                  if (dayPrazos.length > 0 || dayComemoracoes.length > 0 || especial) {
                    setModalDay(dayNum)
                  }
                }}
                title={tituloHover || undefined}
                className={cn(
                  'relative rounded-sm text-xs transition-all overflow-hidden border border-border/40',
                  !isValid && 'invisible',
                  isValid && 'hover:bg-muted/60 hover:border-border cursor-pointer hover:scale-105 hover:z-10',
                  isToday && !isSelected && 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 font-bold ring-1 ring-sky-300/50 border-sky-200 dark:border-sky-800',
                  isSelected && 'bg-sky-500 text-white font-bold hover:bg-sky-600 shadow-md border-sky-500',
                  especial?.tipo === 'feriado' && !isSelected && !isToday && 'text-rose-600 dark:text-rose-400 font-semibold',
                  especial?.tipo === 'comemorativa' && !isSelected && !isToday && 'text-violet-500 dark:text-violet-400 font-medium',
                  !dayPrazos.length && !dayComemoracoes.length && !especial && !isToday && !isSelected && isFds && 'text-foreground/40',
                )}
              >
                {/* Número do dia — canto superior direito */}
                {isValid && (
                  <span className="absolute top-1 right-1.5 text-[13px] font-bold tabular-nums leading-none">
                    {dayNum}
                  </span>
                )}
                {/* Lista de eventos do dia + comemorações — chips empilhados
                    com truncate. Eventos primeiro, comemorações abaixo. */}
                {isValid && (dayPrazos.length > 0 || dayComemoracoes.length > 0 || especial) && (
                  <div className="absolute inset-x-1 top-7 bottom-1 flex flex-col gap-1 pointer-events-none overflow-hidden">
                    {especial && (
                      <span
                        className={cn(
                          'flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight truncate',
                          especial.tipo === 'feriado'
                            ? (isSelected ? 'bg-white/90 text-rose-700' : 'bg-rose-500 text-white')
                            : (isSelected ? 'bg-white/90 text-violet-700' : 'bg-violet-400 text-white'),
                        )}
                        title={especial.nome}
                      >
                        <span className="truncate">{especial.nome}</span>
                      </span>
                    )}
                    {/* Cada evento numa linha própria. Excedentes ficam cortados
                        pelo overflow-hidden — abrir o modal mostra a lista
                        completa. */}
                    {dayPrazos.map((p) => {
                      const cfg = TIPO_CONFIG[p.tipo]
                      return (
                        <span
                          key={p.id}
                          className={cn(
                            'block rounded px-1.5 py-0.5 text-[11px] font-medium truncate border-l-2 shrink-0',
                            isSelected
                              ? 'bg-white/90 text-foreground'
                              : cn(cfg.bgClass, cfg.textClass),
                            !isSelected && cfg.borderClass,
                          )}
                          title={`${cfg.label}: ${p.titulo}${p.subtitulo ? ` · ${p.subtitulo}` : ''}`}
                        >
                          {p.titulo}
                        </span>
                      )
                    })}
                    {/* Comemorações — abaixo dos eventos. Mesmo padrão visual,
                        cores específicas (pink/amber) + ícone de bolo/party. */}
                    {dayComemoracoes.map((c) => (
                      <span
                        key={c.id}
                        className={cn(
                          'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium truncate border-l-2 shrink-0',
                          isSelected
                            ? 'bg-white/90 text-foreground'
                            : c.tipo === 'aniversario'
                              ? 'bg-pink-50 dark:bg-pink-950/40 text-pink-800 dark:text-pink-200 border-pink-500'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-500',
                        )}
                        title={`${c.tipo === 'aniversario' ? 'Aniversário' : `${c.anos ?? '?'} ano${c.anos === 1 ? '' : 's'} de empresa`}: ${c.nome}`}
                      >
                        {c.tipo === 'aniversario'
                          ? <Cake className="h-3 w-3 shrink-0" />
                          : <PartyPopper className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{c.nome.split(' ')[0]}</span>
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {/* Legenda — só mostra os tipos com prazos no mês (compacto) */}
        <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-border/40 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            {(Object.entries(totaisPorTipo) as [PrazoTipo, number][])
              .filter(([, n]) => n > 0)
              .map(([tp, n]) => {
                const cfg = TIPO_CONFIG[tp]
                return (
                  <div key={tp} className="flex items-center gap-1" title={`${n} ${cfg.label}${n > 1 ? 's' : ''}`}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotClass)} />
                    <span className="text-[10px] text-muted-foreground tabular-nums">{cfg.label.slice(0, 4)} {n}</span>
                  </div>
                )
              })}
          </div>
          {prazos.length === 0 && (
            <span className="text-[10px] text-muted-foreground italic">Sem prazos no mês</span>
          )}
        </div>
      </CardContent>

      {/* Modal — exibe eventos do dia clicado */}
      <DiaDetalheModal
        open={modalDay !== null}
        onOpenChange={(o) => { if (!o) setModalDay(null) }}
        year={calYear}
        month={calMonth}
        day={modalDay}
        prazos={modalDay !== null ? (prazosPorDia[modalDay] ?? []) : []}
        comemoracoes={modalDay !== null ? (comemoracoesPorDia[modalDay] ?? []) : []}
        feriado={modalDay !== null ? feriadoMap[`${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(modalDay).padStart(2, '0')}`] : undefined}
        onNavigate={(link) => { setModalDay(null); router.push(link) }}
      />
    </Card>
  )
}

// ============================================================
// MODAL — detalhes do dia clicado no calendário simples
// ============================================================
function DiaDetalheModal(props: {
  open: boolean
  onOpenChange: (o: boolean) => void
  year: number
  month: number
  day: number | null
  prazos: PrazoItem[]
  comemoracoes: Comemoracao[]
  feriado?: DataEspecial
  onNavigate: (link: string) => void
}) {
  const { open, onOpenChange, year, month, day, prazos, comemoracoes, feriado, onNavigate } = props
  if (day === null) return null
  const dataObj = new Date(year, month, day)
  const diaSemana = DIAS_SEMANA_FULL[dataObj.getDay()]
  const dataLabel = `${diaSemana}, ${String(day).padStart(2, '0')} de ${MESES_NOME[month].toLowerCase()} de ${year}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeaderIcon icon={Calendar} color="sky">
          <DialogTitle className="capitalize">{dataLabel}</DialogTitle>
          <DialogDescription>
            {prazos.length} prazo{prazos.length === 1 ? '' : 's'}
            {comemoracoes.length > 0 && ` · ${comemoracoes.length} comemoraç${comemoracoes.length === 1 ? 'ão' : 'ões'}`}
            {feriado && ` · ${feriado.nome}`}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="overflow-y-auto space-y-4">
          {/* Feriado/data especial */}
          {feriado && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-md border p-2.5',
                feriado.tipo === 'feriado'
                  ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50'
                  : 'bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-900/50',
              )}
            >
              {feriado.tipo === 'comemorativa'
                ? <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
                : <Calendar className="h-4 w-4 text-rose-600 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{feriado.nome}</p>
                <p className="text-[10px] text-muted-foreground">
                  {feriado.tipo === 'feriado' ? 'Feriado nacional' : 'Data comemorativa'}
                </p>
              </div>
            </div>
          )}

          {/* Comemorações (aniversariantes) */}
          {comemoracoes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Comemorações
              </p>
              {comemoracoes.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-2',
                    c.tipo === 'aniversario'
                      ? 'bg-pink-50 border-pink-200 dark:bg-pink-950/30 dark:border-pink-900/50'
                      : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50',
                  )}
                >
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAssetUrl(c.image)}
                      alt={c.nome}
                      className="h-9 w-9 rounded-full object-cover border border-background shadow-sm shrink-0"
                    />
                  ) : (
                    <div className={cn(
                      'h-9 w-9 rounded-full flex items-center justify-center shrink-0 border border-background shadow-sm',
                      c.tipo === 'aniversario'
                        ? 'bg-pink-200 dark:bg-pink-900/60'
                        : 'bg-amber-200 dark:bg-amber-900/60',
                    )}>
                      {c.tipo === 'aniversario'
                        ? <Cake className="h-4 w-4 text-pink-700 dark:text-pink-300" />
                        : <PartyPopper className="h-4 w-4 text-amber-700 dark:text-amber-300" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{c.nome}</p>
                    <p className={cn(
                      'text-[10px] leading-tight mt-0.5',
                      c.tipo === 'aniversario'
                        ? 'text-pink-700 dark:text-pink-300'
                        : 'text-amber-700 dark:text-amber-300',
                    )}>
                      {c.tipo === 'aniversario'
                        ? (c.anos ? `${c.anos} anos 🎂` : 'Aniversário')
                        : `${c.anos ?? '?'} ano${c.anos === 1 ? '' : 's'} de empresa 🎉`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Prazos do dia */}
          {prazos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {prazos.length} prazo{prazos.length === 1 ? '' : 's'}
              </p>
              {prazos.map((p) => {
                const cfg = TIPO_CONFIG[p.tipo]
                const Icon = cfg.icon
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => p.link && onNavigate(p.link)}
                    disabled={!p.link}
                    className={cn(
                      'w-full text-left rounded-md border border-border/60 bg-muted/20 p-2.5 transition-colors',
                      p.link && 'hover:bg-muted/40 cursor-pointer',
                      p.atrasado && 'ring-1 ring-rose-300/40',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={cn('w-1 self-stretch rounded-full shrink-0', cfg.dotClass)}
                        style={p.cor ? { backgroundColor: p.cor } : undefined}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Icon className={cn('h-3 w-3 shrink-0', cfg.textClass)} />
                          <span className={cn('text-[9px] uppercase tracking-wider font-bold', cfg.textClass)}>
                            {cfg.label}
                          </span>
                          {p.atrasado && (
                            <span className="ml-auto text-[9px] uppercase tracking-wider font-bold text-rose-600 dark:text-rose-400">
                              Atrasado
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold leading-tight truncate">{p.titulo}</p>
                        {p.subtitulo && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{p.subtitulo}</p>
                        )}
                        {p.horaInicio && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                            {formatHora(p.horaInicio)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// VERSÃO EXPANDIDA — modal com células grandes mostrando títulos dos prazos
// ============================================================
function CalendarioExpandido(props: {
  year: number
  month: number
  prazos: PrazoItem[]
  prazosPorDia: Record<number, PrazoItem[]>
  comemoracoesPorDia: Record<number, Comemoracao[]>
  feriadoMap: Record<string, DataEspecial>
  firstDayOffset: number
  daysInMonth: number
  totalCells: number
  today: Date
  isCurrentMonth: boolean
  onNav: (dir: 1 | -1) => void
  onHoje: () => void
  title?: string
}) {
  const {
    year, month, prazos, prazosPorDia, comemoracoesPorDia, feriadoMap,
    firstDayOffset, daysInMonth, totalCells, today, isCurrentMonth,
    onNav, onHoje, title,
  } = props

  const router = useRouter()
  const numRows = totalCells / 7
  const [selectedDay, setSelectedDay] = useState<number | null>(
    isCurrentMonth ? today.getDate() : null,
  )
  const [filtroTipo, setFiltroTipo] = useState<PrazoTipo | 'todos'>('todos')

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedDay(isCurrentMonth ? today.getDate() : null)
  }, [year, month, isCurrentMonth, today])

  // Aplica filtro de tipo
  const prazosPorDiaFiltrados = useMemo(() => {
    if (filtroTipo === 'todos') return prazosPorDia
    const out: Record<number, PrazoItem[]> = {}
    for (const [d, arr] of Object.entries(prazosPorDia)) {
      const filtrados = arr.filter(p => p.tipo === filtroTipo)
      if (filtrados.length > 0) out[Number(d)] = filtrados
    }
    return out
  }, [prazosPorDia, filtroTipo])

  const totaisPorTipo = useMemo(() => {
    const c: Record<PrazoTipo, number> = { agenda: 0, servico: 0, orcamento: 0, obrigacao: 0 }
    for (const p of prazos) c[p.tipo]++
    return c
  }, [prazos])

  const prazosDoDiaSelecionado = selectedDay !== null ? (prazosPorDiaFiltrados[selectedDay] ?? []) : []
  const comemoracoesDoDiaSelecionado = selectedDay !== null ? (comemoracoesPorDia[selectedDay] ?? []) : []
  const dateStrSelecionado = selectedDay !== null
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null
  const feriadoSelecionado = dateStrSelecionado ? feriadoMap[dateStrSelecionado] : undefined

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header — navegação + filtros por tipo */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-md">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold leading-tight capitalize">
                {title ?? MESES_NOME[month].toLowerCase()}
              </h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {year}
                {isCurrentMonth && (
                  <span className="ml-2 inline-flex items-center rounded-md bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wider">
                    Mês atual
                  </span>
                )}
                {prazos.length > 0 && (
                  <span className="ml-2 text-muted-foreground/80">
                    · {prazos.length} prazo{prazos.length > 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!isCurrentMonth && (
              <Button variant="outline" size="sm" onClick={onHoje} className="text-xs">
                Hoje
              </Button>
            )}
            <Button variant="outline" size="icon-sm" onClick={() => onNav(-1)} title="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => onNav(1)} title="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filtros por tipo */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFiltroTipo('todos')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
              filtroTipo === 'todos'
                ? 'border-foreground/30 bg-foreground/5 text-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            Todos
            <span className="text-[10px] tabular-nums opacity-70">{prazos.length}</span>
          </button>
          {(Object.entries(totaisPorTipo) as [PrazoTipo, number][])
            .filter(([, n]) => n > 0)
            .map(([tp, n]) => {
              const cfg = TIPO_CONFIG[tp]
              const Icon = cfg.icon
              const active = filtroTipo === tp
              return (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setFiltroTipo(tp)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                    active
                      ? cn(cfg.bgClass, cfg.textClass, cfg.borderClass)
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                  <span className="text-[10px] tabular-nums opacity-70">{n}</span>
                </button>
              )
            })}
        </div>
      </div>

      {/* Container: grid + painel lateral */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 min-h-0 overflow-hidden">
        {/* GRID — células grandes */}
        <div className="flex flex-col min-h-0 overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm">
          <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30 shrink-0">
            {DIAS_SEMANA_FULL.map((d, i) => (
              <div
                key={i}
                className={cn(
                  'text-center text-[11px] font-bold uppercase tracking-wider py-2',
                  (i === 0 || i === 6) ? 'text-rose-400' : 'text-muted-foreground',
                )}
              >
                {d}
              </div>
            ))}
          </div>
          <div
            ref={scrollContainerRef}
            className="grid grid-cols-7 flex-1 min-h-0 overflow-y-auto"
            // Cada row com altura fixa (em vez de minmax(96px, 1fr)): garante
            // que TODAS as rows tenham o mesmo tamanho e que o overflow-y-auto
            // funcione previsivelmente. Com 1fr, uma row com muito conteúdo
            // intrínseco crescia e roubava espaço das outras.
            style={{ gridTemplateRows: `repeat(${numRows}, 120px)` }}
          >
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - firstDayOffset + 1
              const isValid = dayNum >= 1 && dayNum <= daysInMonth
              const isToday = isValid && today.getDate() === dayNum && today.getMonth() === month && today.getFullYear() === year
              const dateStr = isValid ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : ''
              const dayPrazos = isValid ? (prazosPorDiaFiltrados[dayNum] ?? []) : []
              const dayComemoracoes = isValid ? (comemoracoesPorDia[dayNum] ?? []) : []
              const especial = isValid ? feriadoMap[dateStr] : undefined
              const isSelected = selectedDay === dayNum
              const colIdx = i % 7
              const isFds = colIdx === 0 || colIdx === 6
              const isLastRow = Math.floor(i / 7) === numRows - 1

              return (
                <button
                  key={i}
                  type="button"
                  disabled={!isValid}
                  onClick={() => isValid && setSelectedDay(dayNum)}
                  className={cn(
                    // pt-9: deixa espaço pro número do dia (absolute top-right).
                    // Sem isso, o número se sobrepõe à primeira linha de conteúdo.
                    'relative flex flex-col items-stretch px-1.5 pt-9 pb-1.5 text-left border-r border-b border-border/40 transition-colors',
                    isLastRow && 'border-b-0',
                    colIdx === 6 && 'border-r-0',
                    !isValid && 'bg-muted/20 cursor-default',
                    isValid && 'hover:bg-muted/30 cursor-pointer',
                    isValid && isFds && !isSelected && !isToday && 'bg-muted/10',
                    isToday && !isSelected && 'bg-sky-50 dark:bg-sky-950/30',
                    isSelected && 'bg-sky-100 dark:bg-sky-900/40 ring-2 ring-sky-500 ring-inset z-10',
                  )}
                >
                  {isValid && (
                    <>
                      {/* Número do dia — absolute, canto superior direito */}
                      <span
                        className={cn(
                          'absolute top-1.5 right-1.5 z-[1] inline-flex items-center justify-center h-6 min-w-[24px] rounded-full text-[11px] font-bold tabular-nums px-1.5',
                          isToday && 'bg-sky-500 text-white shadow-sm',
                          !isToday && especial?.tipo === 'feriado' && 'text-rose-600 dark:text-rose-400',
                          !isToday && especial?.tipo === 'comemorativa' && 'text-violet-600 dark:text-violet-400',
                          !isToday && !especial && isFds && 'text-foreground/50',
                          !isToday && !especial && !isFds && 'text-foreground',
                        )}
                      >
                        {dayNum}
                      </span>

                      {/* Badge de feriado — abaixo do número, ocupa largura completa */}
                      {especial && (
                        <div className="flex items-start mb-1">
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 rounded text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 leading-none truncate max-w-full',
                              especial.tipo === 'feriado'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                : 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
                            )}
                            title={especial.nome}
                          >
                            {especial.tipo === 'comemorativa' && <Sparkles className="h-2 w-2 shrink-0" />}
                            <span className="truncate">{especial.nome}</span>
                          </span>
                        </div>
                      )}

                      {/* Comemorações — bolinho + nome do aniversariante / aniv. de admissão */}
                      {dayComemoracoes.length > 0 && (
                        <div className="flex flex-col gap-0.5 mb-0.5">
                          {dayComemoracoes.slice(0, 2).map((c) => (
                            <div
                              key={c.id}
                              className={cn(
                                'flex items-center gap-1 truncate',
                                c.tipo === 'aniversario'
                                  ? 'text-pink-700 dark:text-pink-300'
                                  : 'text-amber-700 dark:text-amber-300',
                              )}
                              title={`${c.tipo === 'aniversario' ? 'Aniversário' : `${c.anos ?? '?'} ano${c.anos === 1 ? '' : 's'} de empresa`}: ${c.nome}`}
                            >
                              {c.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={resolveAssetUrl(c.image)}
                                  alt=""
                                  className="h-4 w-4 rounded-full object-cover shrink-0 border border-pink-200 dark:border-pink-800"
                                />
                              ) : (
                                <div className={cn(
                                  'h-4 w-4 rounded-full flex items-center justify-center shrink-0',
                                  c.tipo === 'aniversario'
                                    ? 'bg-pink-100 dark:bg-pink-900/40'
                                    : 'bg-amber-100 dark:bg-amber-900/40',
                                )}>
                                  {c.tipo === 'aniversario'
                                    ? <Cake className="h-2.5 w-2.5 text-pink-600 dark:text-pink-400" />
                                    : <PartyPopper className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />}
                                </div>
                              )}
                              <span className="text-[10px] font-semibold truncate uppercase tracking-tight">
                                {c.nome.split(' ')[0]}
                              </span>
                            </div>
                          ))}
                          {dayComemoracoes.length > 2 && (
                            <span className="text-[9px] text-muted-foreground px-1">
                              +{dayComemoracoes.length - 2} comem.
                            </span>
                          )}
                        </div>
                      )}

                      {/* Prazos do dia — até 3 visíveis, depois "+N mais" */}
                      <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                        {dayPrazos.slice(0, 3).map((p) => {
                          const cfg = TIPO_CONFIG[p.tipo]
                          return (
                            <div
                              key={p.id}
                              className={cn(
                                'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] truncate border-l-2',
                                cfg.bgClass, cfg.textClass, cfg.borderClass,
                                p.atrasado && 'ring-1 ring-rose-300/50',
                              )}
                              style={p.cor ? { borderLeftColor: p.cor } : undefined}
                              title={`${cfg.label}: ${p.titulo}${p.subtitulo ? ` · ${p.subtitulo}` : ''}${p.horaInicio ? ` · ${formatHora(p.horaInicio)}` : ''}`}
                            >
                              {!p.horaInicio && p.tipo !== 'agenda' && (
                                <span className="font-bold tabular-nums shrink-0 opacity-70 text-[9px]">
                                  {cfg.label.slice(0, 3).toUpperCase()}
                                </span>
                              )}
                              {p.horaInicio && (
                                <span className="font-semibold tabular-nums shrink-0 opacity-80">
                                  {formatHora(p.horaInicio)}
                                </span>
                              )}
                              <span className="truncate">{p.titulo}</span>
                            </div>
                          )
                        })}
                        {dayPrazos.length > 3 && (
                          <span className="text-[10px] text-muted-foreground font-semibold px-1">
                            +{dayPrazos.length - 3} mais
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* PAINEL LATERAL — detalhes do dia selecionado */}
        <div className="hidden lg:flex flex-col min-h-0 rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border/60 px-4 py-3 bg-gradient-to-br from-sky-50/40 via-transparent to-transparent dark:from-sky-950/20 shrink-0">
            {selectedDay !== null ? (
              <>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {DIAS_SEMANA_FULL[new Date(year, month, selectedDay).getDay()]}
                </p>
                <h3 className="text-2xl font-bold tabular-nums leading-tight">
                  {String(selectedDay).padStart(2, '0')}
                </h3>
                <p className="text-xs text-muted-foreground capitalize">
                  {MESES_NOME[month].toLowerCase()} de {year}
                </p>
                {feriadoSelecionado && (
                  <div
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold',
                      feriadoSelecionado.tipo === 'feriado'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
                    )}
                  >
                    {feriadoSelecionado.tipo === 'comemorativa' && <Sparkles className="h-3 w-3" />}
                    {feriadoSelecionado.nome}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground py-1">Selecione um dia no calendário</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Comemorações do dia — sempre acima dos prazos */}
            {comemoracoesDoDiaSelecionado.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Comemorações
                </p>
                {comemoracoesDoDiaSelecionado.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md border p-2',
                      c.tipo === 'aniversario'
                        ? 'bg-pink-50 border-pink-200 dark:bg-pink-950/30 dark:border-pink-900/50'
                        : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50',
                    )}
                  >
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveAssetUrl(c.image)}
                        alt={c.nome}
                        className="h-8 w-8 rounded-full object-cover border border-background shadow-sm shrink-0"
                      />
                    ) : (
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0 border border-background shadow-sm',
                        c.tipo === 'aniversario'
                          ? 'bg-pink-200 dark:bg-pink-900/60'
                          : 'bg-amber-200 dark:bg-amber-900/60',
                      )}>
                        {c.tipo === 'aniversario'
                          ? <Cake className="h-4 w-4 text-pink-700 dark:text-pink-300" />
                          : <PartyPopper className="h-4 w-4 text-amber-700 dark:text-amber-300" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-tight truncate">{c.nome}</p>
                      <p className={cn(
                        'text-[10px] leading-tight mt-0.5',
                        c.tipo === 'aniversario'
                          ? 'text-pink-700 dark:text-pink-300'
                          : 'text-amber-700 dark:text-amber-300',
                      )}>
                        {c.tipo === 'aniversario'
                          ? (c.anos ? `${c.anos} anos 🎂` : 'Aniversário')
                          : `${c.anos ?? '?'} ano${c.anos === 1 ? '' : 's'} de empresa 🎉`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedDay === null ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground italic">
                Clique em uma data ao lado
              </div>
            ) : prazosDoDiaSelecionado.length === 0 && comemoracoesDoDiaSelecionado.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
                <Calendar className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Sem eventos neste dia</p>
              </div>
            ) : prazosDoDiaSelecionado.length === 0 ? null : (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  {prazosDoDiaSelecionado.length} prazo{prazosDoDiaSelecionado.length > 1 ? 's' : ''}
                </p>
                {prazosDoDiaSelecionado.map((p) => {
                  const cfg = TIPO_CONFIG[p.tipo]
                  const Icon = cfg.icon
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => p.link && router.push(p.link)}
                      disabled={!p.link}
                      className={cn(
                        'w-full text-left rounded-md border border-border/60 bg-muted/20 p-2.5 transition-colors',
                        p.link && 'hover:bg-muted/40 cursor-pointer',
                        p.atrasado && 'ring-1 ring-rose-300/40',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={cn('w-1 self-stretch rounded-full shrink-0', cfg.dotClass)}
                          style={p.cor ? { backgroundColor: p.cor } : undefined}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Icon className={cn('h-3 w-3 shrink-0', cfg.textClass)} />
                            <span className={cn('text-[9px] uppercase tracking-wider font-bold', cfg.textClass)}>
                              {cfg.label}
                            </span>
                            {p.atrasado && (
                              <span className="ml-auto text-[9px] uppercase tracking-wider font-bold text-rose-600 dark:text-rose-400">
                                Atrasado
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold leading-tight truncate">{p.titulo}</p>
                          {p.subtitulo && (
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{p.subtitulo}</p>
                          )}
                          {p.horaInicio && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                              {formatHora(p.horaInicio)}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
