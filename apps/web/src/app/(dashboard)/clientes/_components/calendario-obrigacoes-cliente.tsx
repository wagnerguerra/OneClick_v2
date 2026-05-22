'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Button, Badge,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  cn,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { OBRIGACAO_CATEGORIA_CORES, type ObrigacaoCategoria } from '@saas/types'

interface Evento {
  obrigacaoId: string
  nome: string
  categoria: string | null
  frequencia: string
  data: string
}

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const CATEGORIA_SIGLA: Record<string, string> = {
  Fiscal: 'F', Trabalhista: 'T', Contábil: 'C',
}
const CATEGORIA_BORDA_FORTE: Record<string, string> = {
  Fiscal: 'border-l-indigo-500',
  Trabalhista: 'border-l-lime-500',
  Contábil: 'border-l-violet-500',
}

const ANO_ATUAL = new Date().getFullYear()

function coresParaEvento(categoria: string | null) {
  if (categoria && categoria in OBRIGACAO_CATEGORIA_CORES) {
    return OBRIGACAO_CATEGORIA_CORES[categoria as ObrigacaoCategoria]
  }
  return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' }
}

function DiaTooltip({ eventos, posicaoTopo }: { eventos: Evento[]; posicaoTopo: boolean }) {
  return (
    <div
      className={cn(
        'invisible opacity-0 group-hover:visible group-hover:opacity-100',
        'absolute left-1/2 -translate-x-1/2 z-50 w-[260px] pointer-events-none',
        'transition-opacity duration-150',
        posicaoTopo ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      <div className="rounded-md bg-popover text-popover-foreground shadow-lg ring-1 ring-black/10 dark:ring-white/10 p-2.5 space-y-2 text-left">
        {eventos.map((e, idx) => {
          const cores = coresParaEvento(e.categoria)
          return (
            <div key={`${e.obrigacaoId}-${idx}`} className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold leading-tight">{e.nome}</p>
                {e.categoria && (
                  <Badge variant="outline" className={cn('h-4 px-1.5 text-[9px] font-medium border shrink-0', cores.bg, cores.text, cores.border)}>
                    {e.categoria}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Frequência: {e.frequencia.toLowerCase()}
              </p>
            </div>
          )
        })}
        {eventos.length > 1 && (
          <p className="text-[9px] text-muted-foreground border-t pt-1.5">Clique abre a lista</p>
        )}
      </div>
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-popover rotate-45 ring-1 ring-black/10 dark:ring-white/10',
          posicaoTopo ? 'top-full -mt-1' : 'bottom-full -mb-1',
        )}
      />
    </div>
  )
}

function MesCalendario({
  ano, mes, eventosPorDia, onClickEvento,
}: {
  ano: number; mes: number
  eventosPorDia: Map<number, Evento[]>
  onClickEvento: (e: Evento) => void
}) {
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const totalDias = new Date(ano, mes + 1, 0).getDate()
  const hoje = new Date()
  const isMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === mes

  let totalNoMes = 0
  eventosPorDia.forEach((arr) => { totalNoMes += arr.length })

  const celulas: Array<{ dia: number | null; eventos: Evento[] }> = []
  for (let i = 0; i < primeiroDia; i++) celulas.push({ dia: null, eventos: [] })
  for (let d = 1; d <= totalDias; d++) {
    celulas.push({ dia: d, eventos: eventosPorDia.get(d) ?? [] })
  }
  const totalLinhas = Math.ceil(celulas.length / 7)

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md',
        isMesAtual ? 'border-emerald-300 ring-1 ring-emerald-200/50' : 'border-border/60',
      )}
    >
      <div className="flex items-baseline justify-between mb-2.5 pb-2 border-b border-border/40">
        <h5 className={cn('text-[13px] font-bold tracking-tight', isMesAtual ? 'text-emerald-600' : 'text-foreground')}>
          {MESES_PT[mes]}
        </h5>
        {totalNoMes > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {totalNoMes} venc.
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className={cn('text-center font-semibold py-0.5', (i === 0 || i === 6) && 'text-rose-400/70')}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celulas.map((c, i) => {
          if (c.dia === null) return <div key={i} className="h-8" />
          const tem = c.eventos.length > 0
          const isToday = isMesAtual && hoje.getDate() === c.dia
          const colIdx = i % 7
          const isFds = colIdx === 0 || colIdx === 6
          const rowIdx = Math.floor(i / 7)
          const tooltipNoTopo = rowIdx >= totalLinhas - 2

          const catDominante = tem ? c.eventos[0]!.categoria : null
          const cores = tem ? coresParaEvento(catDominante) : null
          const sigla = catDominante && catDominante in CATEGORIA_SIGLA ? CATEGORIA_SIGLA[catDominante] : null
          const bordaForte = catDominante && catDominante in CATEGORIA_BORDA_FORTE ? CATEGORIA_BORDA_FORTE[catDominante] : null
          const multi = c.eventos.length > 1

          const conteudo = (
            <>
              <span>{c.dia}</span>
              {sigla && (
                <span className={cn('absolute bottom-0 right-0.5 text-[7px] font-extrabold leading-none opacity-70', cores!.text)}>
                  {sigla}
                </span>
              )}
              {multi && (
                <span className="absolute -top-1 -right-1 z-20 h-4 w-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow ring-2 ring-white pointer-events-none">
                  {c.eventos.length}
                </span>
              )}
            </>
          )

          const classesBotao = cn(
            'relative w-full h-8 rounded-md text-[11px] tabular-nums transition-all flex items-center justify-center',
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
            isToday && !tem && 'bg-emerald-500 text-white font-bold shadow-sm border-emerald-500',
            isToday && tem && 'ring-2 ring-emerald-500 ring-offset-1 z-10',
          )

          return (
            <div key={i} className="relative group">
              {multi ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={classesBotao}>{conteudo}</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-[280px]">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {c.eventos.length} vencimentos em {String(c.dia).padStart(2, '0')}/{String(mes + 1).padStart(2, '0')}
                    </div>
                    <DropdownMenuSeparator />
                    {c.eventos.map((e, idx) => {
                      const ec = coresParaEvento(e.categoria)
                      return (
                        <DropdownMenuItem
                          key={`${e.obrigacaoId}-${idx}`}
                          onClick={() => onClickEvento(e)}
                          className="flex flex-col items-start gap-0.5 py-2"
                        >
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="text-xs font-semibold truncate">{e.nome}</span>
                            {e.categoria && (
                              <Badge variant="outline" className={cn('h-4 px-1.5 text-[9px] font-medium border shrink-0', ec.bg, ec.text, ec.border)}>
                                {e.categoria}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            Frequência: {e.frequencia.toLowerCase()}
                          </span>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  onClick={() => tem && onClickEvento(c.eventos[0]!)}
                  className={classesBotao}
                >
                  {conteudo}
                </button>
              )}
              {tem && <DiaTooltip eventos={c.eventos} posicaoTopo={tooltipNoTopo} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarioObrigacoesCliente({ clienteId }: { clienteId: string }) {
  const router = useRouter()
  const [ano, setAno] = useState(ANO_ATUAL)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(trpc as any).grupoObrigacao.calendarioDoCliente.query({ clienteId, ano })
      .then((res: Evento[]) => setEventos(res))
      .catch(() => setEventos([]))
      .finally(() => setLoading(false))
  }, [clienteId, ano])

  const porMes: Record<number, Map<number, Evento[]>> = {}
  for (let m = 0; m < 12; m++) porMes[m] = new Map()
  for (const e of eventos) {
    const d = new Date(e.data)
    const mes = d.getMonth()
    const dia = d.getDate()
    const arr = porMes[mes]!.get(dia) ?? []
    arr.push(e)
    porMes[mes]!.set(dia, arr)
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setAno(ano - 1)} title="Ano anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-bold tabular-nums px-2 min-w-[60px] text-center">{ano}</span>
          <Button variant="outline" size="icon-sm" onClick={() => setAno(ano + 1)} title="Próximo ano">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {ano !== ANO_ATUAL && (
            <Button variant="ghost" size="sm" onClick={() => setAno(ANO_ATUAL)} className="text-xs">
              Hoje
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            {loading ? 'Calculando...' : `${eventos.length} vencimento${eventos.length === 1 ? '' : 's'} no ano`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[10px] text-muted-foreground">
          {(['Fiscal', 'Trabalhista', 'Contábil'] as const).map((cat) => {
            const c = OBRIGACAO_CATEGORIA_CORES[cat]
            return (
              <span key={cat} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center justify-center h-4 w-4 rounded text-[8px] font-extrabold border border-l-[3px]',
                    c.bg, c.text, c.border, CATEGORIA_BORDA_FORTE[cat],
                  )}
                >
                  {CATEGORIA_SIGLA[cat]}
                </span>
                <span>{cat}</span>
              </span>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
        </div>
      ) : eventos.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Este cliente não tem obrigações ativas com recorrência configurada no ano de {ano}.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }, (_, m) => (
            <MesCalendario
              key={m}
              ano={ano}
              mes={m}
              eventosPorDia={porMes[m]!}
              onClickEvento={(e) => router.push(`/servicos/${e.obrigacaoId}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
