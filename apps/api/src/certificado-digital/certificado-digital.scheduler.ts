import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
import { CronJob } from 'cron'
import { CertificadoDigitalService } from './certificado-digital.service'

/**
 * Cron diário que:
 *  - Atualiza status ATIVO → EXPIRADO para certificados com expiraEm <= now
 *  - Cria notificações no sino para certificados em buckets 60d/30d/7d/vencido
 *
 * Default: 06:00 todo dia (antes do horário comercial).
 */
@Injectable()
export class CertificadoDigitalScheduler implements OnModuleInit, OnModuleDestroy {
  private job: CronJob | null = null

  constructor(private readonly service: CertificadoDigitalService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    // Roda diariamente às 06:00 (horário do servidor)
    this.job = new CronJob('0 6 * * *', () => this.executar())
    this.job.start()
  }

  onModuleDestroy() {
    this.job?.stop()
    this.job = null
  }

  async executar() {
    try {
      const result = await this.service.notificarVencimentos()
      console.log(`[CertificadoScheduler] Verificados=${result.verificados} Expirados=${result.expirados} Notificados=${result.notificados}`)
    } catch (e) {
      console.error('[CertificadoScheduler] Erro:', (e as Error).message)
    }
  }
}
