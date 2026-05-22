import { Injectable } from '@nestjs/common'
import { Subject, type Observable } from 'rxjs'

export interface LoteEvent {
  loteId: string
  type: 'progress' | 'item' | 'done' | 'error'
  processados?: number
  totalXmls?: number
  sucesso?: number
  erros?: number
  itemStatus?: 'OK' | 'DUPLICADO' | 'INVALIDO' | 'ERRO_PDF'
  fileName?: string
  chave?: string
  mensagem?: string
}

@Injectable()
export class DanfeLoteEventsService {
  private subject = new Subject<LoteEvent>()
  events$: Observable<LoteEvent> = this.subject.asObservable()

  emit(ev: LoteEvent) { this.subject.next(ev) }
}
