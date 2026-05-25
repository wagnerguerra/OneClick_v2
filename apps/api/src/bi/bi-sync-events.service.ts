import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Eventos de sincronização BI — usado pelo SSE pra notificar o Launcher
 * em tempo real sobre mudanças em clientes (idSistema) ou progresso
 * de import.
 */
export interface BiSyncEvent {
  type: 'cliente-updated' | 'cliente-deleted' | 'sync-progress' | 'ping'
  clienteId?: string
  payload?: Record<string, unknown>
  timestamp: number
}

@Injectable()
export class BiSyncEventsService {
  private readonly subject = new Subject<BiSyncEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(event: Omit<BiSyncEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }

  /** Atalho específico — cliente teve idSistema alterado */
  emitClienteUpdated(clienteId: string, idSistemaAnterior: string | null, idSistemaNovo: string | null) {
    this.emit({
      type: 'cliente-updated',
      clienteId,
      payload: { idSistemaAnterior, idSistemaNovo },
    })
  }
}
