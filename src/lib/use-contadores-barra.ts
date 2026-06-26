// Contadores para os badges da barra inferior: eventos de HOJE, tarefas ABERTAS e
// chamados EM ABERTO. Reusa as MESMAS queries (mesma chave de input) do dashboard,
// então o react-query compartilha o cache — não dispara chamadas duplicadas.
import { HELPDESK_STATUS_FINAIS, type HelpdeskStatus } from '@saas/types'

import { trpc } from '@/lib/trpc'
import { usePermissions } from '@/lib/use-permissions'
import { toISODate } from '@/features/agenda/date'

export type ContadoresBarra = {
  /** Eventos de hoje. */
  eventos: number
  /** Tarefas em aberto do usuário. */
  tarefas: number
  /** Chamados em aberto (status não-final) no escopo do usuário. */
  chamados: number
}

export function useContadoresBarra(): ContadoresBarra {
  const { podeVer } = usePermissions()
  const hoje = toISODate(new Date())

  // Mesmas chaves do dashboard → cache compartilhado.
  const eventosQuery = trpc.agenda.listEventos.useQuery({ dataInicio: hoje, dataFim: hoje })
  const tarefasQuery = trpc.agenda.tarefa.list.useQuery({ apenasAbertas: true })

  const temHelpdesk = podeVer('helpdesk')
  const chamadosQuery = trpc.helpdesk.list.useQuery(
    { scope: 'MEUS', arquivado: false, page: 1, limit: 100 },
    { enabled: temHelpdesk },
  )

  // helpdesk.list é paginado { data, total }; estreitamos o tipo (o inferido pelo
  // tRPC é profundo demais e dispara TS2589) e contamos só os abertos.
  const chamados =
    (chamadosQuery.data as { data?: Array<{ status: HelpdeskStatus }> } | undefined)?.data ?? []

  return {
    eventos: eventosQuery.data?.length ?? 0,
    tarefas: tarefasQuery.data?.length ?? 0,
    chamados: chamados.filter((t) => !HELPDESK_STATUS_FINAIS.includes(t.status)).length,
  }
}
