import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { CronJob } from 'cron'
import { schedulersAtivos } from '../common/scheduler-guard'
import { ControleFeriasReportsService } from './controle-ferias-reports.service'

/**
 * Alerta diário de férias vencidas e a vencer, às 08:40 (BR) — logo depois
 * do de certificados, para os avisos do dia chegarem juntos. Roda em modo
 * sync: o próprio serviço limpa e recria, então período regularizado some do
 * sino sozinho. Só executa em produção (schedulersAtivos).
 */
@Injectable()
export class ControleFeriasSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null

  constructor(@Inject(ControleFeriasReportsService) private readonly reports: ControleFeriasReportsService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[ControleFerias Scheduler] desativado fora de produção'); return }
    this.cronJob = new CronJob('40 8 * * *', () => { void this.executar() }, null, true, 'America/Sao_Paulo')
    console.log('[ControleFerias Scheduler] Iniciado: 40 8 * * * (America/Sao_Paulo)')
  }

  onModuleDestroy() { this.cronJob?.stop() }

  private async executar() {
    try {
      const r = await this.reports.notificarVencimentos()
      if (r.vencidos || r.vencendo) {
        console.log(`[ControleFerias Scheduler] ${r.vencidos} vencida(s), ${r.vencendo} a vencer — ${r.notificados} aviso(s)`)
      }
    } catch (e) {
      console.error('[ControleFerias Scheduler] erro:', (e as Error).message)
    }
  }
}
