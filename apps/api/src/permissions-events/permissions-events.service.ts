import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Evento emitido quando as permissões de um usuário mudam (admin alterou via
 * /usuarios). Frontend filtra por userId — cada cliente só reage quando o
 * evento é do próprio usuário logado.
 */
export interface PermissionsEvent {
  type: 'updated'
  /** ID do usuário cujas permissões foram alteradas. */
  userId: string
  /** Quem fez a alteração — pode ser o próprio user (auto-edição) ou um admin. */
  actorUserId?: string | null
  timestamp: number
}

@Injectable()
export class PermissionsEventsService {
  private readonly subject = new Subject<PermissionsEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(event: Omit<PermissionsEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }
}
