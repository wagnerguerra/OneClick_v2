import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common'
import { CronJob } from 'cron'
import { OrcamentoService } from './orcamento.service'

/**
 * Cron diário que verifica orçamentos com tempo no status atual excedendo
 * a configuração da empresa e cria notificações no sino do responsável.
 *
 * Default: 08:00 todo dia (horário comercial).
 */
@Injectable()
export class OrcamentoScheduler implements OnModuleInit, OnModuleDestroy {
  private job: CronJob | null = null

  constructor(
    @Inject(forwardRef(() => OrcamentoService))
    private readonly orcamentoService: OrcamentoService,
  ) {}

  onModuleInit() {
    // Roda diariamente às 08:00 (horário do servidor)
    this.job = new CronJob('0 8 * * *', () => this.executar())
    this.job.start()
  }

  onModuleDestroy() {
    this.job?.stop()
    this.job = null
  }

  async executar() {
    try {
      const result = await this.orcamentoService.notificarOrcamentosAtrasados()
      console.log(`[OrcamentoScheduler] Verificados=${result.verificados} Notificados=${result.notificados}`)
    } catch (e) {
      console.error('[OrcamentoScheduler] Erro:', (e as Error).message)
    }
    // Áreas com detalhamento em atraso → marca ATRASADO e avisa o comercial.
    try {
      const r = await this.orcamentoService.verificarAtrasosAreas()
      if (r.processados > 0) console.log(`[OrcamentoScheduler] Áreas em atraso processadas=${r.processados}`)
    } catch (e) {
      console.error('[OrcamentoScheduler] Erro (atrasos de área):', (e as Error).message)
    }
  }
}
