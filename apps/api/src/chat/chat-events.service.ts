import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Tipos de eventos emitidos pelo chat. Cada evento carrega `destinatarios`
 * (lista de userIds que devem receber) pra filtrar no SSE controller —
 * evita expor mensagens de conversas que o user não participa.
 */
export type ChatEvent =
  | { type: 'mensagem-nova'; conversaId: string; mensagem: unknown; destinatarios: string[] }
  | { type: 'anexo-adicionado'; conversaId: string; mensagemId: string; anexo: unknown; destinatarios: string[] }
  | { type: 'lido'; conversaId: string; usuarioId: string; lidoEm: Date; destinatarios: string[] }
  | { type: 'typing'; conversaId: string; usuarioId: string; nome: string; destinatarios: string[] }
  | { type: 'conversa-criada'; conversaId: string; destinatarios: string[] }

@Injectable()
export class ChatEventsService {
  private readonly subject = new Subject<ChatEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit<T extends ChatEvent['type']>(type: T, payload: Omit<Extract<ChatEvent, { type: T }>, 'type'>) {
    this.subject.next({ type, ...payload } as ChatEvent)
  }
}
