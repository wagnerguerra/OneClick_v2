'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Card, Button } from '@saas/ui'
import { cn } from '@saas/ui'

interface ItemMin {
  id: string
  status: string
  atrasada: boolean
  prazoEfetivo: string | null
  servico: { nome: string; mininome: string | null; categoria: string | null }
  cliente: { razaoSocial: string } | null
}

interface CalendarioMinhasObrigacoesProps {
  items: ItemMin[]
  loading: boolean
  onSelecionar: (item: ItemMin) => void
}

const MES_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIA_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export function CalendarioMinhasObrigacoes({ items, loading, onSelecionar }: CalendarioMinhasObrigacoesProps) {
  const [ano, setAno] = useState(() => new Date().getFullYear())
  const [mes, setMes] = useState(() => new Date().getMonth())

  function prevMes() {
    if (mes === 0) { setMes(11); setAno(ano - 1) } else { setMes(mes - 1) }
  }
  function nextMes() {
    if (mes === 11) { setMes(0); setAno(ano + 1) } else { setMes(mes + 1) }
  }

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, ItemMin[]>()
    for (const it of items) {
      if (!it.prazoEfetivo) continue
      const d = new Date(it.prazoEfetivo)
      if (d.getFullYear() !== ano || d.getMonth() !== mes) continue
      const dia = d.getDate()
      const key = String(dia)
      const arr = mapa.get(key) ?? []
      arr.push(it)
      mapa.set(key, arr)
    }
    return mapa
  }, [items, ano, mes])

  const grid = useMemo(() => {
    const primeiroDia = new Date(ano, mes, 1).getDay()
    const diasNoMes = new Date(ano, mes + 1, 0).getDate()
    const celulas: Array<{ dia: number | null }> = []
    for (let i = 0; i < primeiroDia; i++) celulas.push({ dia: null })
    for (let d = 1; d <= diasNoMes; d++) celulas.push({ dia: d })
    while (celulas.length % 7 !== 0) celulas.push({ dia: null })
    return celulas
  }, [ano, mes])

  const hoje = new Date()
  const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === mes
  const diaAtual = hoje.getDate()

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={prevMes}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold min-w-[160px] text-center">{MES_LABELS[mes]} {ano}</span>
          <Button variant="ghost" size="icon-sm" onClick={nextMes}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { const n = new Date(); setAno(n.getFullYear()); setMes(n.getMonth()) }}
          className="text-xs"
        >
          Hoje
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-sky-500" />Carregando calendário...
        </div>
      ) : (
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIA_LABELS.map((d) => (
              <div key={d} className="text-[11px] font-semibold text-muted-foreground text-center py-1 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cel, idx) => {
              const eventos = cel.dia ? eventosPorDia.get(String(cel.dia)) ?? [] : []
              const ehHoje = cel.dia !== null && ehMesAtual && cel.dia === diaAtual
              return (
                <div
                  key={idx}
                  className={cn(
                    'min-h-[88px] rounded border border-border/40 bg-card p-1.5 text-[11px] flex flex-col',
                    cel.dia === null && 'bg-muted/20 border-transparent',
                    ehHoje && 'ring-2 ring-sky-400 ring-inset',
                  )}
                >
                  {cel.dia !== null && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('font-semibold', ehHoje ? 'text-sky-700' : 'text-foreground/80')}>
                          {cel.dia}
                        </span>
                        {eventos.length > 0 && (
                          <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-sky-100 text-sky-700 tabular-nums">
                            {eventos.length}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 space-y-0.5 overflow-hidden">
                        {eventos.slice(0, 3).map((ev) => {
                          const corBg = ev.status === 'CONCLUIDO'
                            ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                            : ev.atrasada
                              ? 'bg-red-50 hover:bg-red-100 border-red-200'
                              : 'bg-sky-50 hover:bg-sky-100 border-sky-200'
                          const Icon = ev.status === 'CONCLUIDO' ? CheckCircle2 : ev.atrasada ? AlertCircle : Clock
                          const corIcon = ev.status === 'CONCLUIDO' ? 'text-emerald-600' : ev.atrasada ? 'text-red-600' : 'text-sky-600'
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => onSelecionar(ev)}
                              title={`${ev.servico.nome}${ev.cliente ? ` · ${ev.cliente.razaoSocial}` : ''}`}
                              className={cn(
                                'w-full text-left rounded border px-1 py-0.5 truncate transition-colors flex items-center gap-1',
                                corBg,
                              )}
                            >
                              <Icon className={cn('h-2.5 w-2.5 shrink-0', corIcon)} />
                              <span className="truncate text-[10px]">
                                {ev.servico.mininome ?? ev.servico.nome}
                              </span>
                            </button>
                          )
                        })}
                        {eventos.length > 3 && (
                          <span className="text-[9px] text-muted-foreground px-1">+{eventos.length - 3} mais</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
