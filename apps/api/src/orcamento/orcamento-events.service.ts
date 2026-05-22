import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Evento emitido quando algo do orçamento muda. Os clientes filtram por:
 *  - `empresaId` (kanban / listagem) — escutam tudo da empresa
 *  - `orcamentoId` (página de detalhe) — escutam só o registro aberto
 *
 * Tipos de evento:
 *  - `kanban` — mudança que afeta a posição/visibilidade no Kanban: criar,
 *               trocar status, paralisar/retomar/arquivar, deletar, reabrir.
 *  - `dados-gerais` — update de campos do bloco "Dados Gerais" (cliente,
 *               solicitante, responsável, validade, contatos, e-mails, obs).
 *  - `itens` — adicionar, atualizar ou remover item; recalcular totais.
 *  - `evento` — entrada na timeline (mensagem/anexo) — opcional pra UI viva.
 */
export interface OrcamentoEvent {
  type: 'kanban' | 'dados-gerais' | 'itens' | 'evento'
  orcamentoId: string
  empresaId: string | null
  actorUserId?: string | null
  timestamp: number
}

@Injectable()
export class OrcamentoEventsService {
  private readonly subject = new Subject<OrcamentoEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(event: Omit<OrcamentoEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }
}
