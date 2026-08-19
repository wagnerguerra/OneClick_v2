'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCircle2, Circle, Lock, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, cn } from '@saas/ui'
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

const PRIORIDADE_CLS: Record<string, string> = {
  ALTA: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
  NORMAL: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
  BAIXA: 'bg-muted text-muted-foreground',
}

/**
 * Eventos e tarefas de HOJE, da /agenda. A visibilidade é a do próprio módulo,
 * aplicada no backend: `listEventos` não devolve evento particular a quem não
 * é criador/participante (#HLP0270) e `tarefa.list` só devolve tarefas em que
 * o usuário logado é membro (criador ou participante) — o widget não refaz a
 * regra, só exibe o que a API já filtrou para a sessão.
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

  const vazio = eventos.length === 0 && tarefas.length === 0

  return (
    <Card className="h-full flex flex-col overflow-hidden @container/widget">
      <CardHeader className="pb-2 shrink-0 border-b-0">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          <CardTitle className="text-base font-bold leading-tight">{title ?? 'Meu dia'}</CardTitle>
        </div>
        <p className="text-[11px] text-muted-foreground">Eventos e tarefas de hoje, da agenda</p>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto nice-scrollbar pt-1 pb-3 space-y-3 widget-no-drag">
        {!loaded ? null : vazio ? (
          <p className="text-xs text-muted-foreground italic py-6 text-center">Nada agendado para hoje. Dia livre!</p>
        ) : (
          <>
            {eventos.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Eventos</p>
                {eventos.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => router.push(`/agenda?verEvento=${e.id}`)}
                    className="w-full flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.tipo?.cor || '#0ea5e9' }} />
                    <span className="text-[11px] font-semibold tabular-nums shrink-0 w-[38px]">
                      {e.diaInteiro ? 'Dia' : hora(e.horaInicio) ?? '—'}
                    </span>
                    <span className="text-xs truncate flex-1">{e.titulo}</span>
                    {e.particular && <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Evento particular" />}
                    {(e.participantes?.length ?? 0) > 1 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                        <Users className="h-3 w-3" />{e.participantes!.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {tarefas.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tarefas</p>
                {tarefas.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => router.push('/agenda/tarefas')}
                    className="w-full flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    {t.concluida
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    {hora(t.horaPrazo) && (
                      <span className="text-[11px] font-semibold tabular-nums shrink-0">{hora(t.horaPrazo)}</span>
                    )}
                    <span className={cn('text-xs truncate flex-1', t.concluida && 'line-through text-muted-foreground')}>{t.titulo}</span>
                    {t.prioridade && t.prioridade !== 'NORMAL' && !t.concluida && (
                      <span className={cn('rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase shrink-0', PRIORIDADE_CLS[t.prioridade])}>
                        {t.prioridade === 'ALTA' ? 'Alta' : 'Baixa'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
