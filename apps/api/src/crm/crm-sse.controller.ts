import { Controller, Sse } from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { CrmEventsService } from './crm-events.service'

@Controller('api/crm')
export class CrmSseController {
  constructor(private readonly events: CrmEventsService) {}

  @Sse('events')
  sse(): Observable<MessageEvent> {
    return this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
  }
}
