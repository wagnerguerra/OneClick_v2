// Permissões de Editar/Excluir um evento da Agenda — espelha o gating do backend
// (agenda.service: update/delete) e do sistema web:
//   - editar:  MASTER, o CRIADOR do evento, ou sub-perm `editar_todos_eventos`.
//   - excluir: MASTER, o CRIADOR, ou sub-perm `delete_eventos`/`editar_todos_eventos`.
//
// Usado tanto no swipe do dashboard quanto nos botões do detalhe, pra mostrar as
// ações só pra quem realmente pode (o backend ainda valida de novo).

import { useSession } from '@/lib/auth-client'
import { usePermissions } from '@/lib/use-permissions'

export interface EventoPermissoes {
  /** Pode editar este evento. */
  canEdit: boolean
  /** Pode excluir este evento. */
  canDelete: boolean
  /** É o criador (dono) do evento. */
  ehDono: boolean
}

export function useEventoPermissoes(criadorId: string | null | undefined): EventoPermissoes {
  const { data: session } = useSession()
  const { isMaster, temSubPermissao } = usePermissions()

  const userId = (session?.user as { id?: string } | undefined)?.id
  const ehDono = !!userId && !!criadorId && criadorId === userId

  const editarTodos = temSubPermissao('agenda', 'editar_todos_eventos')
  const canEdit = isMaster || ehDono || editarTodos
  const canDelete =
    isMaster || ehDono || editarTodos || temSubPermissao('agenda', 'delete_eventos')

  return { canEdit, canDelete, ehDono }
}
