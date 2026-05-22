import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { CronJob } from 'cron'
import { HelpdeskService } from './helpdesk.service'

/**
 * Cron horário pro HelpDesk:
 *  - 75% do SLA consumido → notifica responsável + líder (slaAlertadoEm)
 *  - SLA estourado          → notifica + marca slaEstouradoEm
 *  - RESOLVIDO sem CSAT por 3 dias → auto-fecha como CONCLUIDO (CSAT neutro 3/5)
 *
 * Roda no minuto 7 de cada hora — fora dos minutos 0/5/etc pra evitar
 * concorrência com outros schedulers (CND, Servico, etc).
 */
@Injectable()
export class HelpdeskScheduler implements OnModuleInit, OnModuleDestroy {
  private job: CronJob | null = null

  constructor(private readonly helpdeskService: HelpdeskService) {}

  onModuleInit() {
    this.job = new CronJob('7 * * * *', () => this.executar())
    this.job.start()
  }

  onModuleDestroy() {
    this.job?.stop()
    this.job = null
  }

  async executar() {
    try {
      const r = await this.helpdeskService.checkSlaERollover()
      if (r.alertados > 0 || r.estourados > 0 || r.auto_fechados > 0) {
        console.log(`[HelpdeskScheduler] SLA: alertados=${r.alertados} estourados=${r.estourados} auto_fechados=${r.auto_fechados}`)
      }
    } catch (e) {
      console.error('[HelpdeskScheduler] Erro:', (e as Error).message)
    }
  }
}
