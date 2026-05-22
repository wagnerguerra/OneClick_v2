import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Evento emitido sempre que a inbox de notificações de um usuário muda:
 * criação, remoção, marcação como lida. Frontend filtra por userId — cada
 * cliente só reage quando o evento é do próprio usuário logado.
 */
export interface NotificationsEvent {
  type: 'new' | 'removed' | 'updated' | 'cleared'
  /** ID do usuário cuja inbox foi alterada. */
  userId: string
  /** IDs envolvidos no evento (criados, removidos, etc) — opcional. */
  notificationIds?: string[]
  timestamp: number
}

@Injectable()
export class NotificationsEventsService {
  private readonly subject = new Subject<NotificationsEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(event: Omit<NotificationsEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }

  /** Emite o mesmo evento para uma lista de usuários (broadcast por destinatário). */
  emitBatch(userIds: string[], event: Omit<NotificationsEvent, 'userId' | 'timestamp'>) {
    const ts = Date.now()
    for (const userId of userIds) {
      this.subject.next({ ...event, userId, timestamp: ts })
    }
  }
}
