import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Eventos de lembrete da agenda. Cada evento carrega `destinatarios` (userIds
 * dos participantes do evento, incluindo o criador) pra o SSE controller filtrar
 * — cada user só recebe lembretes dos eventos em que está envolvido.
 */
export type AgendaLembreteEvent = {
  type: 'lembrete'
  eventoId: string
  titulo: string
  data: string                // ISO yyyy-MM-dd
  horaInicio: string | null
  diaInteiro: boolean
  local: string | null
  minutosAntes: number
  destinatarios: string[]
}

@Injectable()
export class AgendaLembreteEventsService {
  private readonly subject = new Subject<AgendaLembreteEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(payload: Omit<AgendaLembreteEvent, 'type'>) {
    this.subject.next({ type: 'lembrete', ...payload })
  }
}
