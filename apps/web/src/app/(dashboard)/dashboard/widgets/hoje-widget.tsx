'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCircle2, Circle, Lock, MoreVertical, Users, CalendarDays, ListChecks } from 'lucide-react'
import { cn, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@saas/ui'
import { trpc } from '@/lib/trpc'

interface EventoHoje {
  id: string
  titulo: string
  particular: boolean
  diaInteiro?: boolean
  horaInicio?: string | null
  horaFim?: string | null
  tipo?: { nome: string; cor: string | null } | null
  participantes?: Array<{ usuario: { id: string; name: string } | null }>
}
interface TarefaHoje {
  id: string
  titulo: string
  concluida: boolean
  prazo: string
  horaPrazo?: string | null
  prioridade?: 'BAIXA' | 'NORMAL' | 'ALTA'
  membros?: Array<{ usuarioId: string }>
}

const hora = (h: string | null | undefined) => (h ? h.slice(0, 5) : null)

/** Linha única da lista — evento ou tarefa, já com tudo resolvido pra desenhar. */
interface Linha {
  key: string
  ordem: string            // "HH:MM" pra ordenar; "99:99" = sem hora (fim)
  icone: typeof CalendarClock
  cor: string              // cor base do ícone/pill (hex ou CSS var)
  titulo: string
  pill: string
  sub: string
  riscado?: boolean
  particular?: boolean
  href: string
}

const PRIORIDADE_COR: Record<string, string> = { ALTA: '#e11d48', NORMAL: 'var(--color-primary)', BAIXA: '#64748b' }

/**
 * Eventos e tarefas de HOJE, da /agenda — visual do card "Atividades recentes"
 * do modelo LuminAux (21/08). A visibilidade é a do próprio módulo, aplicada
 * no backend: `listEventos` não devolve evento particular a quem não é
 * criador/participante (#HLP0270) e `tarefa.list` só devolve tarefas em que
 * o usuário logado é membro — o widget não refaz a regra, só exibe.
 */
export function HojeWidget({ title }: { canRead?: boolean; title?: string; expanded?: boolean; bloco?: string } = {}) {
  const router = useRouter()
  const [eventos, setEventos] = useState<EventoHoje[]>([])
  const [tarefas, setTarefas] = useState<TarefaHoje[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const hoje = new Date()
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    Promise.allSettled([
      (trpc.agenda as any).listEventos.query({ dataInicio: `${iso}T00:00:00`, dataFim: `${iso}T23:59:59` })
        .then((r: EventoHoje[]) => setEventos(r ?? [])),
      (trpc.agenda as any).tarefa.list.query({ dataInicio: iso, dataFim: iso })
        .then((r: TarefaHoje[]) => setTarefas(r ?? [])),
    ]).finally(() => setLoaded(true))
  }, [])

  const linhas: Linha[] = [
    ...eventos.map((e): Linha => {
      const ini = hora(e.horaInicio); const fim = hora(e.horaFim)
      const n = e.participantes?.length ?? 0
      const horario = e.diaInteiro || !ini ? 'Dia inteiro' : fim ? `${ini} – ${fim}` : ini
      return {
        key: `e-${e.id}`,
        ordem: e.diaInteiro || !ini ? '99:99' : ini,
        icone: CalendarClock,
        cor: e.tipo?.cor || 'var(--color-primary)',
        titulo: e.titulo,
        pill: e.tipo?.nome || 'Evento',
        sub: n > 1 ? `${horario} · ${n} participantes` : horario,
        particular: e.particular,
        href: '/agenda',
      }
    }),
    ...tarefas.map((t): Linha => {
      const h = hora(t.horaPrazo)
      const prio = t.prioridade ?? 'NORMAL'
      return {
        key: `t-${t.id}`,
        ordem: h ?? '99:98',
        icone: t.concluida ? CheckCircle2 : Circle,
        cor: t.concluida ? '#10b981' : PRIORIDADE_COR[prio]!,
        titulo: t.titulo,
        pill: t.concluida ? 'Concluída' : prio === 'ALTA' ? 'Prioridade alta' : prio === 'BAIXA' ? 'Prioridade baixa' : 'Tarefa',
        sub: h ? `Tarefa · prazo ${h}` : 'Tarefa · hoje',
        riscado: t.concluida,
        href: '/agenda/tarefas',
      }
    }),
  ].sort((a, b) => a.ordem.localeCompare(b.ordem))

  return (
    <div className="h-full rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md @container/widget">
      <div className="flex h-full flex-col p-5">
        {/* Cabeçalho do modelo: título + descrição à esquerda, menu ⋮ à direita */}
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">{title ?? 'Eventos do dia'}</h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">Eventos e tarefas de hoje, da agenda</p>
            </div>
          </div>
          <div className="-mr-1.5 -mt-1 flex shrink-0 items-center gap-1 widget-no-drag">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Opções" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push('/agenda')}><CalendarDays className="mr-2 h-4 w-4" /> Abrir agenda</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/agenda/tarefas')}><ListChecks className="mr-2 h-4 w-4" /> Ver tarefas</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Lista: uma linha por evento/tarefa, ordenada pelo horário */}
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 nice-scrollbar widget-no-drag">
          {!loaded ? null : linhas.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nada agendado para hoje. Dia livre!</p>
          ) : (
            <ul className="divide-y divide-border">
              {linhas.map(l => {
                const Icon = l.icone
                return (
                  <li
                    key={l.key}
                    onClick={() => router.push(l.href)}
                    className="flex cursor-pointer gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-current/15"
                      style={{ backgroundColor: `color-mix(in srgb, ${l.cor} 18%, transparent)`, color: `color-mix(in srgb, ${l.cor} 70%, #0f172a)` }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('truncate text-sm font-semibold text-foreground', l.riscado && 'line-through text-muted-foreground')}>
                          {l.titulo}
                        </p>
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold"
                          style={{ backgroundColor: `color-mix(in srgb, ${l.cor} 18%, transparent)`, color: `color-mix(in srgb, ${l.cor} 70%, #0f172a)` }}
                        >
                          {l.pill}
                        </span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {l.particular && <Lock className="h-3 w-3 shrink-0" aria-label="Evento particular" />}
                        {l.sub.includes('participantes') && <Users className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{l.sub}</span>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
