import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

// Eventos em tempo real do WhatsApp (espelha chat-events). Cada evento carrega
// `destinatarios` (userIds) — o SSE controller filtra por usuário.
export type WhatsappEvent =
  | { type: 'mensagem-nova'; conversaId: string; mensagem: unknown; destinatarios: string[] }
  | { type: 'conversa-atualizada'; conversaId: string; destinatarios: string[] }
  | { type: 'status-mensagem'; conversaId: string; waMessageId: string; status: string; destinatarios: string[] }
  | { type: 'atribuida'; conversaId: string; responsavelId: string | null; setorId: string | null; destinatarios: string[] }

@Injectable()
export class WhatsappEventsService {
  private readonly subject = new Subject<WhatsappEvent>()
  get events$() { return this.subject.asObservable() }
  emit(ev: WhatsappEvent) { this.subject.next(ev) }
}
