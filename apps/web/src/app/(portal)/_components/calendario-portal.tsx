'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, PartyPopper } from 'lucide-react'
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogTitle,
} from '@saas/ui'

import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'

/**
 * Calendário do mês do Portal do Cliente.
 *
 * Espelha o calendário do dashboard do escritório — grade limpa só com os
 * números, pontinhos por tipo sob o dia, feriado em vermelho e o detalhe do
 * dia num modal — na paleta do portal.
 *
 * O que ele mostra é o que o cliente tem no mês: o vencimento das obrigações,
 * os feriados que valem para a cidade dele e os eventos da agenda em que ele
 * aparece. Quem decide isso é o servidor (`portal.calendario`); aqui só se
 * pinta o que veio.
 */

export type TipoDoItem = 'obrigacao' | 'feriado' | 'evento'

export interface ItemDoCalendario {
  id: string
  tipo: TipoDoItem
  titulo: string
  /** AAAA-MM-DD. */
  data: string
  hora: string | null
  detalhe: string | null
  /** Só para obrigação. */
  situacao: string | null
}

interface ApiCalendario {
  calendario: { query(i: { clienteId: string; ano: number; mes: number }): Promise<ItemDoCalendario[]> }
}

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const VISUAL: Record<TipoDoItem, { rotulo: string; ponto: string; chip: string; icone: typeof CalendarDays }> = {
  obrigacao: {
    rotulo: 'Vencimento',
    ponto: 'bg-[#d97b34]',
    chip: 'bg-[#fdf0e6] text-[#c2510f] dark:bg-[#2a1a10] dark:text-[#e09a6a]',
    icone: ClipboardCheck,
  },
  evento: {
    rotulo: 'Evento',
    ponto: 'bg-[#1a6dff]',
    chip: 'bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]',
    icone: CalendarClock,
  },
  feriado: {
    rotulo: 'Feriado',
    ponto: 'bg-[#c2362f]',
    chip: 'bg-[#fdeceb] text-[#c2362f] dark:bg-[#2a1413] dark:text-[#f08a84]',
    icone: PartyPopper,
  },
}

/** Situação da obrigação, no vocabulário do cliente. */
const SITUACAO: Record<string, { texto: string; classe: string }> = {
  ENTREGUE: { texto: 'Entregue', classe: 'bg-[#e9f6ee] text-[#1f9254] dark:bg-[#122019] dark:text-[#6fcf97]' },
  ATRASADA: { texto: 'Atrasada', classe: 'bg-[#fdeceb] text-[#c2362f] dark:bg-[#2a1413] dark:text-[#f08a84]' },
  EM_ANDAMENTO: { texto: 'A entregar', classe: 'bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]' },
  DISPENSADA: { texto: 'Dispensada', classe: 'bg-slate-100 text-slate-500 dark:bg-[#16233a] dark:text-slate-400' },
}

export function CalendarioPortal({ clienteId, className }: { clienteId: string; className?: string }) {
  // "Hoje" só depois de montar: no servidor sairia no fuso dele.
  const [hoje, setHoje] = useState<Date | null>(null)
  const [ano, setAno] = useState(() => new Date().getFullYear())
  const [mes, setMes] = useState(() => new Date().getMonth() + 1)
  const [itens, setItens] = useState<ItemDoCalendario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [falhou, setFalhou] = useState(false)
  const [diaAberto, setDiaAberto] = useState<number | null>(null)

  useEffect(() => { setHoje(new Date()) }, [])

  useEffect(() => {
    if (!clienteId) return
    let vivo = true
    setCarregando(true)
    setFalhou(false)
    const api = trpc.portal as unknown as ApiCalendario
    api.calendario.query({ clienteId, ano, mes })
      .then((r) => { if (vivo) setItens(r) })
      .catch(() => { if (vivo) { setItens([]); setFalhou(true) } })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [clienteId, ano, mes])

  const porDia = useMemo(() => {
    const mapa = new Map<number, ItemDoCalendario[]>()
    for (const item of itens) {
      const dia = Number(item.data.slice(8, 10))
      if (!dia) continue
      const lista = mapa.get(dia) ?? []
      lista.push(item)
      mapa.set(dia, lista)
    }
    // Dentro do dia: hora primeiro, depois o que não tem hora.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99'))
    }
    return mapa
  }, [itens])

  const navegar = useCallback((passo: 1 | -1) => {
    setDiaAberto(null)
    setMes((m) => {
      const novo = m + passo
      if (novo < 1) { setAno((a) => a - 1); return 12 }
      if (novo > 12) { setAno((a) => a + 1); return 1 }
      return novo
    })
  }, [])

  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay()
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const celulas = Math.ceil((primeiroDiaSemana + diasNoMes) / 7) * 7
  const mesAtual = !!hoje && hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes

  const doDiaAberto = diaAberto ? (porDia.get(diaAberto) ?? []) : []

  return (
    <section className={`anim-subir overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white shadow-sm dark:border-[#1b2739] dark:bg-[#0e1726] ${className ?? ''}`}>
      <header className="flex items-center gap-3 border-b border-[#eef2f7] px-5 py-3.5 dark:border-[#1b2739]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#1a6dff] dark:bg-[#16233a] dark:text-[#7db0ff]">
          <CalendarDays className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-slate-900 dark:text-slate-100">Calendário</h2>
          <p className="truncate text-[12px] capitalize text-slate-500 dark:text-slate-400">{MESES[mes - 1]} de {ano}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => navegar(-1)}
            aria-label="Mês anterior"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#f2f7ff] hover:text-[#1a6dff] dark:hover:bg-[#16233a]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navegar(1)}
            aria-label="Próximo mês"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#f2f7ff] hover:text-[#1a6dff] dark:hover:bg-[#16233a]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="px-4 pb-4 pt-3">
        {!mesAtual && hoje && (
          <button
            type="button"
            onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth() + 1); setDiaAberto(null) }}
            className="mb-2 text-[12px] font-semibold text-[#1a6dff] hover:underline dark:text-[#7db0ff]"
          >
            Voltar para hoje
          </button>
        )}

        <div className="grid grid-cols-7">
          {DIAS.map((d, i) => (
            <div key={i} className="py-1 text-center text-[11px] font-semibold text-slate-400">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: celulas }, (_, i) => {
            const dia = i - primeiroDiaSemana + 1
            const valido = dia >= 1 && dia <= diasNoMes
            const doDia = valido ? (porDia.get(dia) ?? []) : []
            const ehHoje = valido && mesAtual && hoje!.getDate() === dia
            const ehFeriado = doDia.some((it) => it.tipo === 'feriado')
            const tipos = [...new Set(doDia.map((it) => it.tipo))].filter((t) => t !== 'feriado')
            const rotulo = doDia.length > 0
              ? `${doDia.length} ${doDia.length === 1 ? 'item' : 'itens'}: ${doDia.map((it) => it.titulo).join(', ')}`
              : undefined

            return (
              <button
                key={i}
                type="button"
                disabled={!valido || doDia.length === 0}
                onClick={() => setDiaAberto(dia)}
                title={rotulo}
                className={[
                  'relative flex h-9 flex-col items-center justify-center rounded-lg text-[12.5px] tabular-nums transition-colors',
                  !valido ? 'text-transparent' : '',
                  valido && doDia.length > 0 ? 'cursor-pointer hover:bg-[#f2f7ff] dark:hover:bg-[#16233a]' : 'cursor-default',
                  ehHoje ? 'font-bold text-[#1a6dff] ring-2 ring-[#1a6dff] dark:text-[#7db0ff]' : '',
                  !ehHoje && ehFeriado ? 'font-semibold text-[#c2362f] dark:text-[#f08a84]' : '',
                  !ehHoje && !ehFeriado && valido ? 'text-slate-700 dark:text-slate-300' : '',
                ].join(' ')}
              >
                <span className="leading-none">{valido ? dia : ''}</span>
                {tipos.length > 0 && (
                  <span className="mt-1 flex items-center gap-0.5">
                    {tipos.map((t) => <span key={t} className={`h-1.5 w-1.5 rounded-full ${VISUAL[t].ponto}`} />)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#eef2f7] pt-2.5 dark:border-[#1b2739]">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${VISUAL.obrigacao.ponto}`} />
            <span className="text-[11px] text-slate-600 dark:text-slate-400">Vencimento</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${VISUAL.evento.ponto}`} />
            <span className="text-[11px] text-slate-600 dark:text-slate-400">Evento</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold tabular-nums leading-none text-[#c2362f] dark:text-[#f08a84]">7</span>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">Feriado</span>
          </span>
        </div>

        {carregando && <p className="mt-2 text-[11.5px] text-slate-400">Carregando o mês…</p>}
        {falhou && <p className="mt-2 text-[11.5px] text-slate-500 dark:text-slate-400">Não foi possível carregar o calendário agora.</p>}
        {!carregando && !falhou && itens.length === 0 && (
          <p className="mt-2 text-[11.5px] text-slate-500 dark:text-slate-400">Nada marcado neste mês.</p>
        )}
      </div>

      <Dialog open={diaAberto !== null} onOpenChange={(aberto) => { if (!aberto) setDiaAberto(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeaderIcon icon={CalendarDays} color="blue">
            <DialogTitle className="capitalize">
              {diaAberto ? `${String(diaAberto).padStart(2, '0')} de ${MESES[mes - 1]} de ${ano}` : ''}
            </DialogTitle>
            <DialogDescription>
              {doDiaAberto.length === 1 ? '1 item neste dia' : `${doDiaAberto.length} itens neste dia`}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <ul className="flex flex-col gap-2 py-1">
              {doDiaAberto.map((item) => {
                const visual = VISUAL[item.tipo]
                const Icone = visual.icone
                const situacao = item.situacao ? SITUACAO[item.situacao] : null
                return (
                  <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${visual.chip}`}>
                      <Icone className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground">{item.titulo}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {[visual.rotulo, item.hora, item.detalhe].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {situacao && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${situacao.classe}`}>
                        {situacao.texto}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  )
}
