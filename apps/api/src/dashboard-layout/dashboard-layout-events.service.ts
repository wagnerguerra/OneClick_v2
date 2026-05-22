import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Evento emitido quando o layout do dashboard de uma empresa muda.
 * Consumido pelo SSE controller, que repassa para os clientes conectados.
 * Frontend filtra por empresaId antes de recarregar.
 */
export interface DashboardLayoutEvent {
  type: 'save' | 'reset'
  empresaId: string
  // Quem fez a alteração — frontend ignora eventos do próprio user pra evitar
  // recarregar o layout no autor (que já tem o estado mais recente).
  actorUserId?: string | null
  timestamp: number
}

@Injectable()
export class DashboardLayoutEventsService {
  private readonly subject = new Subject<DashboardLayoutEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(event: Omit<DashboardLayoutEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }
}
