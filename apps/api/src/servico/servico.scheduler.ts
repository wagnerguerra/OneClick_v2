import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
import { CronJob } from 'cron'
import { ServicoService } from './servico.service'

/**
 * Cron horário que verifica execuções com prazoLimite vencido e ainda
 * não notificadas — cria notificação no sino do responsável.
 *
 * Roda no minuto 5 de cada hora (sair do horário em ponto pra evitar
 * pico simultâneo com outros schedulers).
 */
@Injectable()
export class ServicoScheduler implements OnModuleInit, OnModuleDestroy {
  private job: CronJob | null = null

  constructor(private readonly servicoService: ServicoService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    // A cada hora no minuto 5
    this.job = new CronJob('5 * * * *', () => this.executar())
    this.job.start()
  }

  onModuleDestroy() {
    this.job?.stop()
    this.job = null
  }

  async executar() {
    try {
      const r = await this.servicoService.notificarExecucoesAtrasadas()
      if (r.verificados > 0) {
        console.log(`[ServicoScheduler] Atrasos: verificados=${r.verificados} notificados=${r.notificados}`)
      }
    } catch (e) {
      console.error('[ServicoScheduler] Erro:', (e as Error).message)
    }
  }
}
