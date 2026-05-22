import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Eventos de mudança no log de erros do cliente — usado pelo SSE pra notificar
 * a UI em tempo real (badge contador, lista live).
 */
export interface ClientErrorEvent {
  type: 'new' | 'occurrence' | 'resolved' | 'reopened' | 'bulk_resolved'
  hash: string
  level: string
  timestamp: number
}

@Injectable()
export class ClientErrorEventsService {
  private readonly subject = new Subject<ClientErrorEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(event: Omit<ClientErrorEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }
}
