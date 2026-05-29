import { Controller, Sse } from '@nestjs/common'
import { Observable, interval, map, merge } from 'rxjs'
import { CrmEventsService } from './crm-events.service'

@Controller('api/crm')
export class CrmSseController {
  constructor(private readonly events: CrmEventsService) {}

  @Sse('events')
  sse(): Observable<MessageEvent> {
    const ping$ = interval(30_000).pipe(
      map(() => ({ data: JSON.stringify({ type: 'ping', timestamp: Date.now() }) }) as MessageEvent),
    )
    const events$ = this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
    return merge(events$, ping$)
  }
}
