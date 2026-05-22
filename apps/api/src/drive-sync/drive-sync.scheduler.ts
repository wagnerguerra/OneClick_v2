import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common'
import { CronJob } from 'cron'
import { DriveSyncService } from './drive-sync.service'

/**
 * Cron de sincronização automática do Google Drive.
 *
 * Configuração via env:
 *  - GOOGLE_DRIVE_SYNC_ENABLED=true      → liga o cron (default: false)
 *  - GOOGLE_DRIVE_SYNC_CRON='*\/15 * * * *' → expressão cron (default: a cada 15min)
 *
 * Mesmo desligado, o cron pode ser disparado manualmente via tRPC
 * (`drive.sincronizarTodos`) ou por cliente individual.
 */
@Injectable()
export class DriveSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null
  private isRunning = false

  constructor(
    @Inject(DriveSyncService) private readonly svc: DriveSyncService,
  ) {}

  onModuleInit() {
    if (process.env.GOOGLE_DRIVE_SYNC_ENABLED !== 'true') {
      console.log('[DriveSync Scheduler] Desabilitado (GOOGLE_DRIVE_SYNC_ENABLED != true)')
      return
    }
    const cronExpr = process.env.GOOGLE_DRIVE_SYNC_CRON || '*/15 * * * *'
    try {
      this.cronJob = CronJob.from({
        cronTime: cronExpr,
        onTick: () => this.run(),
        timeZone: 'America/Sao_Paulo',
        start: true,
      })
      console.log(`[DriveSync Scheduler] Iniciado: ${cronExpr}`)
    } catch (e) {
      console.error('[DriveSync Scheduler] Cron inválido:', cronExpr, (e as Error).message)
    }
  }

  onModuleDestroy() {
    if (this.cronJob) {
      this.cronJob.stop()
      this.cronJob = null
    }
  }

  private async run() {
    if (this.isRunning) {
      console.warn('[DriveSync Scheduler] Skip: execução anterior ainda em andamento')
      return
    }
    this.isRunning = true
    const t0 = Date.now()
    try {
      const r = await this.svc.sincronizarTodos({ tipo: 'automatico' })
      console.log(
        `[DriveSync Scheduler] Concluído em ${Math.round((Date.now() - t0) / 1000)}s — clientes=${r.totalClientes} ok=${r.sucesso} falhas=${r.falhas}`,
      )
    } catch (e) {
      console.error('[DriveSync Scheduler] Erro geral:', (e as Error).message)
    } finally {
      this.isRunning = false
    }
  }
}
