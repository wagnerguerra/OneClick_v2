/**
 * GoogleBackupScheduler — sobe o dump mais recente do DB pro Drive todo dia.
 *
 * Cron: 03:30 (15 min depois do backup-db.sh do host que roda às 03:15).
 * Só executa se system_config.google.backup.enabled = 'true'.
 *
 * Registra cada rodada em scheduler_executions (slug 'google-backup') —
 * mesmo padrão dos outros schedulers (nfe-dist, nfse-dist).
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import { GoogleBackupService } from './google-backup.service'
import {
  iniciarExecucao,
  finalizarExecucao,
  finalizarComErro,
} from '../agendamento/scheduler-execution.helper'

const TIMEZONE = 'America/Sao_Paulo'
const CRON_EXPRESSION = '30 3 * * *'
const KEY_ENABLED = 'google.backup.enabled'

@Injectable()
export class GoogleBackupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleBackupScheduler.name)
  private job: CronJob | null = null
  private running = false

  constructor(private readonly service: GoogleBackupService) {}

  onModuleInit() {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    this.job = new CronJob(
      CRON_EXPRESSION,
      () => { void this.executar() },
      null,
      true,
      TIMEZONE,
    )
    this.logger.log(`GoogleBackupScheduler iniciado — cron "${CRON_EXPRESSION}" (${TIMEZONE})`)
  }

  onModuleDestroy() {
    this.job?.stop()
    this.job = null
  }

  /**
   * Executa o upload. Pública pra permitir disparo manual via tRPC futuramente.
   * Retorna o status pra quem chamar (ex: testes).
   */
  async executar(trigger: 'CRON' | 'MANUAL' = 'CRON'): Promise<{ ok: boolean; skipped?: string; mensagem?: string }> {
    if (this.running) {
      this.logger.warn('Já em execução — pulando ciclo.')
      return { ok: false, skipped: 'já em execução' }
    }
    this.running = true

    try {
      const cfg = await prisma.systemConfig.findUnique({ where: { key: KEY_ENABLED } })
      if (cfg?.value !== 'true') {
        this.logger.log('Upload automático desligado (toggle off) — pulando.')
        return { ok: false, skipped: 'desligado' }
      }

      const execId = await iniciarExecucao('google-backup', trigger).catch(() => null)
      const inicio = Date.now()

      try {
        const result = await this.service.uploadDiario()
        const dur = Date.now() - inicio

        const detalhes = [
          this.formatDetalhe('db', result.db),
          this.formatDetalhe('system', result.system),
        ]
        const sucesso = detalhes.filter(d => d.status === 'OK').length
        const erros = detalhes.filter(d => d.status === 'ERRO').length

        this.logger.log(
          `Upload diário: db=${detalhes[0]!.mensagem} system=${detalhes[1]!.mensagem} duracaoMs=${dur}`,
        )

        if (execId) {
          await finalizarExecucao(execId, {
            totalClientes: 2,
            sucesso,
            erros,
            detalhes,
          })
        }
        return { ok: erros === 0, mensagem: detalhes.map(d => `${d.clienteId}:${d.status}`).join(' ') }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.logger.error(`Falha no upload: ${msg}`)
        if (execId) await finalizarComErro(execId, msg)
        return { ok: false, mensagem: msg }
      }
    } finally {
      this.running = false
    }
  }

  private formatDetalhe(
    tipo: 'db' | 'system',
    r: { uploaded?: { name: string; size: number } } | { skipped: string },
  ): { clienteId: string; razaoSocial: string; status: 'OK' | 'ERRO'; mensagem?: string } {
    if ('skipped' in r) {
      return { clienteId: tipo, razaoSocial: tipo, status: 'ERRO', mensagem: r.skipped }
    }
    return {
      clienteId: tipo,
      razaoSocial: r.uploaded?.name ?? tipo,
      status: 'OK',
      mensagem: `${r.uploaded?.name} (${r.uploaded?.size}B)`,
    }
  }
}
