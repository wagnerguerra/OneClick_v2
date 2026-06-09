'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Users, ChevronLeft, ChevronRight, Loader2, X, ChevronDown, Calendar, Search,
  Clock, MapPin, FileText, ExternalLink,
} from 'lucide-react'
import {
  Button, Input, Label, Card, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

// Configuração do grid
const HORA_INICIO = 8     // 8h
const HORA_FIM = 18       // 18h
const SLOT_MINUTOS = 30   // slots de 30 minutos
const DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']

interface Usuario {
  id: string
  name: string
}

interface EventoOcupacao {
  id: string
  data: string          // YYYY-MM-DD
  horaInicio: string    // HH:MM
  horaFim: string       // HH:MM
  titulo: string
  tipoNome: string
  tipoCor: string
  usuariosOcupados: string[]
  nomesOcupados: string[]
}

interface EventoDetalhe {
  id: string
  titulo: string
  descricao: string | null
  data: string
  dataFim: string | null
  horaInicio: string | null
  horaFim: string | null
  diaInteiro: boolean
  local: string | null
  sala: string | null
  link: string | null
  presenca: string
  tipo: { id: string; nome: string; cor: string }
  criador: { id: string; name: string }
  participantes: Array<{ usuario?: { id: string; name: string } | null; nomeAvulso?: string | null }>
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(d: Date): Date {
  // Segunda-feira da semana de `d` (ajusta domingo pra 7 = sex+2)
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayOfWeek = date.getDay()  // 0=dom, 1=seg, ..., 6=sáb
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  date.setDate(date.getDate() + diff)
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function minutesFromMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export default function AgendaDisponibilidadePage() {
  const router = useRouter()

  // ============================ Estado ============================
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [selecionadosIds, setSelecionadosIds] = useState<string[]>([])
  const [semanaBase, setSemanaBase] = useState<Date>(() => startOfWeek(new Date()))
  const [eventos, setEventos] = useState<EventoOcupacao[]>([])
  const [loading, setLoading] = useState(false)

  // Modal de detalhamento de evento — abre ao clicar em slot ocupado
  // (sem sair da página de disponibilidade)
  const [viewEventoOpen, setViewEventoOpen] = useState(false)
  const [viewEvento, setViewEvento] = useState<EventoDetalhe | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  // Combobox de busca de participantes
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!searchOpen) return
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [searchOpen])

  // ============================ Loaders ============================
  useEffect(() => {
    trpc.agenda.listUsuarios.query()
      .then((r: unknown) => setUsuarios(r as Usuario[]))
      .catch(() => {})
  }, [])

  const diasDaSemana = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(semanaBase, i))
  }, [semanaBase])

  // Slots de horário (chave HH:MM)
  const slots = useMemo(() => {
    const arr: string[] = []
    for (let h = HORA_INICIO; h < HORA_FIM; h++) {
      for (let m = 0; m < 60; m += SLOT_MINUTOS) {
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    return arr
  }, [])

  // Busca eventos quando muda participantes ou semana
  useEffect(() => {
    if (selecionadosIds.length === 0) { setEventos([]); return }
    const dataInicio = formatDateKey(diasDaSemana[0]!)
    const dataFim = formatDateKey(diasDaSemana[4]!)
    setLoading(true)
    trpc.agenda.disponibilidadeRange.query({ dataInicio, dataFim, usuarioIds: selecionadosIds })
      .then((r: unknown) => setEventos(r as EventoOcupacao[]))
      .catch(e => alerts.error('Erro', (e as Error).message))
      .finally(() => setLoading(false))
  }, [selecionadosIds, diasDaSemana])

  // Indexa eventos por dia (YYYY-MM-DD) pra lookup rápido na renderização
  const eventosPorDia = useMemo(() => {
    const map: Record<string, EventoOcupacao[]> = {}
    for (const ev of eventos) {
      if (!map[ev.data]) map[ev.data] = []
      map[ev.data]!.push(ev)
    }
    return map
  }, [eventos])

  // Layout de cada coluna (dia): em vez de repetir o evento em cada slot de
  // 30min, calculamos blocos mesclados (rowSpan). Cada célula vira:
  //   'free'              → slot livre (clicável pra agendar)
  //   'skip'              → coberto por um rowSpan acima (não renderiza <td>)
  //   { ev, span }        → início de um bloco ocupado, abrange `span` slots
  // Eventos sobrepostos: o que começa antes "reserva" os slots; o seguinte
  // ocupa os slots livres restantes (mantém o comportamento de 1 evento por
  // bloco que já existia, mas sem repetição).
  type Cell = 'free' | 'skip' | { ev: EventoOcupacao; span: number }
  const baseMin = HORA_INICIO * 60
  const layouts = useMemo(() => {
    return diasDaSemana.map(dia => {
      const dataKey = formatDateKey(dia)
      const evs = (eventosPorDia[dataKey] ?? []).slice()
        .sort((a, b) => minutesFromMidnight(a.horaInicio) - minutesFromMidnight(b.horaInicio))
      const cells: Cell[] = new Array(slots.length).fill('free')
      const claimed: boolean[] = new Array(slots.length).fill(false)
      for (const ev of evs) {
        const evIni = minutesFromMidnight(ev.horaInicio)
        const evFim = minutesFromMidnight(ev.horaFim)
        // Faixa de slots [first, last] que o evento sobrepõe dentro do grid
        let first = -1, last = -1
        for (let i = 0; i < slots.length; i++) {
          const sIni = baseMin + i * SLOT_MINUTOS
          if (evIni < sIni + SLOT_MINUTOS && evFim > sIni) { if (first < 0) first = i; last = i }
        }
        if (first < 0) continue  // fora da janela 8h–18h
        // Começa no 1º slot livre da faixa e estende enquanto houver slots livres
        let s = first
        while (s <= last && claimed[s]) s++
        if (s > last) continue  // já totalmente coberto por evento anterior
        let e = s
        while (e + 1 <= last && !claimed[e + 1]) e++
        for (let k = s; k <= e; k++) claimed[k] = true
        cells[s] = { ev, span: e - s + 1 }
      }
      for (let i = 0; i < slots.length; i++) {
        if (claimed[i] && cells[i] === 'free') cells[i] = 'skip'
      }
      return cells
    })
  }, [diasDaSemana, eventosPorDia, slots, baseMin])

  // ============================ Ações ============================
  function toggleParticipante(uid: string) {
    setSelecionadosIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  }
  function semanaAnterior() { setSemanaBase(addDays(semanaBase, -7)) }
  function proximaSemana() { setSemanaBase(addDays(semanaBase, 7)) }
  function semanaAtual() { setSemanaBase(startOfWeek(new Date())) }

  async function clickEventoOcupado(eventoId: string) {
    // Abre modal local com os detalhes do evento — sem sair da página de
    // disponibilidade pra não perder a consulta atual.
    setViewEventoOpen(true)
    setViewEvento(null)
    setViewLoading(true)
    try {
      const ev = await trpc.agenda.getById.query({ id: eventoId }) as EventoDetalhe
      setViewEvento(ev)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setViewEventoOpen(false)
    } finally {
      setViewLoading(false)
    }
  }

  function clickSlotLivre(dia: Date, hhmm: string) {
    // Bloquear data passada
    const hojeKey = formatDateKey(new Date())
    const diaKey = formatDateKey(dia)
    if (diaKey < hojeKey) {
      alerts.error('Data inválida', 'Não é possível agendar eventos em dias que já passaram.')
      return
    }
    const horaFim = (() => {
      const ini = minutesFromMidnight(hhmm)
      const fim = ini + SLOT_MINUTOS * 2  // default: 1h
      const h = Math.floor(fim / 60)
      const m = fim % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    })()
    const params = new URLSearchParams({
      novoEvento: '1',
      data: diaKey,
      horaInicio: hhmm,
      horaFim,
      participantes: selecionadosIds.join(','),
    })
    router.push(`/agenda?${params.toString()}`)
  }

  // ============================ Combobox helpers ============================
  const usuariosFiltrados = useMemo(() => {
    const disp = usuarios.filter(u => !selecionadosIds.includes(u.id))
    if (!searchQuery.trim()) return disp
    return disp.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [usuarios, selecionadosIds, searchQuery])

  const labelSemana = useMemo(() => {
    const ini = diasDaSemana[0]!
    const fim = diasDaSemana[4]!
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    return `${fmt(ini)} a ${fmt(fim)}/${fim.getFullYear()}`
  }, [diasDaSemana])

  const hojeKey = formatDateKey(new Date())

  // ============================ Render ============================
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="administrativo" icon={Users} />
          <div>
            <h1>Disponibilidade combinada</h1>
            <p className="text-sm text-muted-foreground">Veja em quais horários os participantes selecionados estão livres ou ocupados</p>
          </div>
        </div>
        <Button
          variant="outline" size="icon"
          onClick={() => router.push('/agenda')}
          title="Voltar pra Agenda"
          className="h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar: participantes + navegação de semana */}
      <Card className="p-4 space-y-3">
        {/* Seleção de participantes */}
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Participantes ({selecionadosIds.length})</Label>
          {selecionadosIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selecionadosIds.map(id => {
                const u = usuarios.find(x => x.id === id)
                if (!u) return null
                return (
                  <span key={id} className="flex items-center gap-1 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-2.5 py-1 rounded-full">
                    {u.name}
                    <button
                      type="button"
                      onClick={() => toggleParticipante(id)}
                      className="hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <div ref={searchRef} className="relative max-w-md">
            <button
              type="button"
              onClick={() => setSearchOpen(o => !o)}
              className={cn(
                'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            >
              <span className="text-muted-foreground flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                Adicionar participante…
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {searchOpen && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                <div className="p-1.5 border-b bg-popover sticky top-0">
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar usuário..."
                    className="h-7 text-xs"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {usuariosFiltrados.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                      {usuarios.length === selecionadosIds.length
                        ? 'Todos os usuários já foram adicionados'
                        : 'Nenhum usuário encontrado'}
                    </p>
                  ) : usuariosFiltrados.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        toggleParticipante(u.id)
                        setSearchOpen(false)
                        setSearchQuery('')
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                    >
                      <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-muted-foreground">
                          {(u.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                      </span>
                      <span className="truncate">{u.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navegação semana */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Semana de {labelSemana}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={semanaAtual}>Hoje</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={semanaAnterior}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={proximaSemana}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      {/* Grid */}
      <Card className="overflow-hidden">
        {selecionadosIds.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            Selecione ao menos um participante pra ver a disponibilidade.
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute right-4 top-4 z-10 bg-background/80 backdrop-blur rounded-md px-2 py-1 flex items-center gap-1.5 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Atualizando…
              </div>
            )}
            {/* Grid bidimensional usando <table> — mais previsível que grid + display:contents */}
            <table className="w-full border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-muted/30">
                <tr>
                  <th className="w-[64px] px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center border-b border-r border-border">
                    Hora
                  </th>
                  {diasDaSemana.map((d, i) => {
                    const isHoje = formatDateKey(d) === hojeKey
                    return (
                      <th
                        key={i}
                        className={cn(
                          'px-2 py-2 text-center border-b border-r border-border last:border-r-0',
                          isHoje && 'bg-sky-50 dark:bg-sky-950/30',
                        )}
                      >
                        <div className={cn('text-[10px] font-semibold uppercase tracking-wider', isHoje ? 'text-sky-700 dark:text-sky-400' : 'text-muted-foreground')}>
                          {DIAS_LABEL[i]}
                        </div>
                        <div className={cn('text-sm font-semibold mt-0.5', isHoje && 'text-sky-700 dark:text-sky-400')}>
                          {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot, si) => (
                  <tr key={slot}>
                    <td className="w-[64px] px-2 py-1 text-[11px] text-muted-foreground border-b border-r border-border bg-muted/20 text-right tabular-nums align-middle">
                      {slot}
                    </td>
                    {diasDaSemana.map((dia, di) => {
                      const cell = layouts[di]![si]!
                      // Slot coberto por um rowSpan acima — não renderiza <td>.
                      if (cell === 'skip') return null
                      const diaKey = formatDateKey(dia)
                      const isPast = diaKey < hojeKey
                      // Slot livre
                      if (cell === 'free') {
                        return (
                          <td
                            key={di}
                            className={cn(
                              'border-b border-r last:border-r-0 border-border h-[28px] transition-colors align-middle',
                              isPast
                                ? 'bg-muted/30 dark:bg-muted/10'
                                : 'bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 cursor-pointer',
                            )}
                            onClick={() => { if (!isPast) clickSlotLivre(dia, slot) }}
                            title={isPast ? 'Data passada' : 'Disponível — clique pra agendar'}
                          />
                        )
                      }
                      // Início de um bloco ocupado — mescla `span` slots num único <td>
                      const ev = cell.ev
                      return (
                        <td
                          key={di}
                          rowSpan={cell.span}
                          className="border-b border-r last:border-r-0 border-border transition-colors relative align-top cursor-pointer hover:bg-muted/40"
                          // Zebrado diagonal vermelho suave reforçando "ocupado".
                          style={{
                            backgroundImage: 'repeating-linear-gradient(135deg, transparent 0px, transparent 6px, rgba(244,63,94,0.05) 6px, rgba(244,63,94,0.05) 12px)',
                          }}
                          onClick={() => clickEventoOcupado(ev.id)}
                          title={`${ev.horaInicio}–${ev.horaFim} ${ev.titulo} (${ev.nomesOcupados.join(', ')})\n\nClique pra ver detalhes do evento`}
                        >
                          <div className="flex items-start gap-1.5 px-1.5 py-1 min-w-0">
                            <span
                              className="h-2 w-2 rounded-full shrink-0 mt-1"
                              style={{ backgroundColor: ev.tipoCor }}
                            />
                            <span className="text-[10px] text-foreground leading-tight min-w-0">
                              <span className="font-semibold">{ev.nomesOcupados.join(', ')}</span>
                              <span className="text-muted-foreground"> — {ev.titulo}</span>
                              <span className="block text-[9px] text-muted-foreground tabular-nums mt-0.5">
                                {ev.horaInicio}–{ev.horaFim}
                              </span>
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legenda */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800" /> Todos livres
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded border border-border"
                  style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0px, transparent 3px, rgba(244,63,94,0.3) 3px, rgba(244,63,94,0.3) 6px)' }}
                />
                Participante ocupado (cor da bolinha = tipo)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-muted" /> Passado
              </span>
              <span className="ml-auto">Clique num slot livre pra agendar evento com os participantes selecionados</span>
            </div>
          </>
        )}
      </Card>

      {/* ============================================================
          Modal de detalhamento de evento — abre ao clicar em slot ocupado
      ============================================================ */}
      <Dialog open={viewEventoOpen} onOpenChange={setViewEventoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={Calendar} color="sky">
            <DialogTitle>{viewEvento?.titulo ?? 'Carregando…'}</DialogTitle>
            <DialogDescription>
              {viewEvento
                ? `${viewEvento.tipo.nome} · Criado por ${viewEvento.criador.name}`
                : 'Buscando detalhes do evento…'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            {viewLoading || !viewEvento ? (
              <div className="py-6 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Data e hora */}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  {(() => {
                    const d = new Date(viewEvento.data)
                    const dataFmt = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
                    if (viewEvento.diaInteiro) return <span>{dataFmt} · Dia inteiro</span>
                    return <span>{dataFmt} · {viewEvento.horaInicio} às {viewEvento.horaFim}</span>
                  })()}
                </div>
                {/* Local/Sala */}
                {(viewEvento.sala || viewEvento.local) && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{viewEvento.sala || viewEvento.local}</span>
                  </div>
                )}
                {/* Link */}
                {viewEvento.link && (
                  <div className="flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={viewEvento.link} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline truncate">
                      {viewEvento.link}
                    </a>
                  </div>
                )}
                {/* Participantes */}
                {viewEvento.participantes.length > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1.5">
                      {viewEvento.participantes.map((p, idx) => (
                        <span key={idx} className="text-[11px] bg-muted px-2 py-0.5 rounded-full">
                          {p.usuario?.name ?? p.nomeAvulso}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Descrição */}
                {viewEvento.descricao && (
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" /> Descrição
                    </div>
                    <div
                      className="text-sm prose prose-sm dark:prose-invert max-w-none"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: viewEvento.descricao }}
                    />
                  </div>
                )}
              </>
            )}
          </DialogBody>
          {viewEvento && (
            <DialogFooter>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={`/agenda?verEvento=${encodeURIComponent(viewEvento.id)}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir na agenda
                </Link>
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
