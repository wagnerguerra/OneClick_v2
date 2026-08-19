import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
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
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
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
    // O aviso de atraso de detalhamento por área foi descontinuado junto com o
    // workflow de detalhamento pelos líderes (19/08/2026) — sem a ação de
    // detalhar, a cobrança só gerava e-mail sem resposta possível.
    // [QA #46a] Lembrete de validade vencendo → agenda + sino + e-mail.
    try {
      const v = await this.orcamentoService.notificarValidadeVencendo()
      if (v.notificados > 0) console.log(`[OrcamentoScheduler] Validade vencendo: verificados=${v.verificados} notificados=${v.notificados}`)
    } catch (e) {
      console.error('[OrcamentoScheduler] Erro (validade vencendo):', (e as Error).message)
    }
  }
}
