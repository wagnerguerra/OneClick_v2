import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

/**
 * Evento emitido quando uma execução de serviço muda de estado de uma forma
 * que afeta inboxes / dashboards: criação, reivindicação (claim-first),
 * conclusão/cancelamento de execução, conclusão/reabertura de passo.
 *
 * Clientes (widget Serviços em Andamento, /meus-servicos, fluxo-editor com
 * `execucoesAtivas`) escutam e refetcham silenciosamente.
 *
 * Filtros típicos:
 *  - `empresaId` (widget dashboard): só reage a eventos da própria empresa.
 *  - `candidatos`: lista de userIds que podem ter visibilidade da execução
 *    (claim-first do setor + responsável direto). Cliente filtra
 *    `candidatos.includes(myUserId)` antes de refetchar.
 */
export interface ServicoExecucaoEvent {
  type: 'created' | 'claimed' | 'concluida' | 'cancelada' | 'passo_concluido' | 'passo_reaberto'
  execucaoId: string
  servicoId: string
  empresaId: string | null
  /** Usuários potencialmente interessados — claim-first inclui todos os
   *  candidatos do setor. Frontend filtra por userId logado. */
  candidatos: string[]
  /** Quem disparou a ação. UI ignora pra não recarregar pra si mesmo. */
  actorUserId?: string | null
  timestamp: number
}

@Injectable()
export class ServicoExecucaoEventsService {
  private readonly subject = new Subject<ServicoExecucaoEvent>()

  get events$() {
    return this.subject.asObservable()
  }

  emit(event: Omit<ServicoExecucaoEvent, 'timestamp'>) {
    this.subject.next({ ...event, timestamp: Date.now() })
  }
}
