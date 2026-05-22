import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

export interface CrmEvent {
  type: 'create' | 'update' | 'move' | 'delete' | 'reorder' | 'tarefa' | 'mensagem' | 'arquivo' | 'tag'
  oportunidadeId?: string
  etapaId?: string
  userId?: string
  timestamp: number
}

@Injectable()
export class CrmEventsService {
  private readonly subject = new Subject<CrmEvent>()

  /** Observable que os controllers SSE assinam */
  get events$() {
    return this.subject.asObservable()
  }

  /** Emitir evento para todos os clientes conectados */
  emit(event: Omit<CrmEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }
}
