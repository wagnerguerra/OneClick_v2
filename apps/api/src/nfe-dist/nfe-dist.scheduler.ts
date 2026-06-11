/**
 * NfeDistScheduler — agendador da sincronização diária de NFe via SEFAZ.
 *
 * Pendências de wire-up (ainda não feitas — outro agente está implementando):
 *   1. Criar `NfeDistService` em `apps/api/src/nfe-dist/nfe-dist.service.ts`
 *      com método público `processarCliente(clienteId: string): Promise<void>`.
 *   2. Criar `NfeDistModule` em `apps/api/src/nfe-dist/nfe-dist.module.ts`
 *      exportando o service via provider com token `'NfeDistService'`
 *      (ex.: `{ provide: 'NfeDistService', useClass: NfeDistService }`).
 *   3. Registrar `NfeDistModule` no `AppModule`.
 *   4. Adicionar campos `nfeDistEnabled` (Boolean) e `nfeDistSyncRequestedAt`
 *      (DateTime?) no model `Cliente` do schema Prisma.
 *
 * Comportamento:
 *   - Cron diário (default 03:30 America/Sao_Paulo, configurável via `NFE_DIST_CRON`).
 *   - Só roda se `NFE_DIST_ENABLED=true`.
 *   - Poll separado a cada 1min para sync requests manuais
 *     (clientes com `nfeDistSyncRequestedAt != null`) — flag é limpa após processar.
 *   - Tolera falhas individuais (try/catch por cliente).
 */

import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { schedulersAtivos } from '../common/scheduler-guard'
import { CronJob } from 'cron'
import { prisma } from '@saas/db'
import {
  iniciarExecucao,
  finalizarExecucao,
  finalizarComErro,
  type ExecucaoClienteDetalhe,
} from '../agendamento/scheduler-execution.helper'
import { loadSchedulerConfig } from '../agendamento/scheduler-config.helper'

const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
const MANUAL_POLL_INTERVAL_MS = 60_000
const CONFIG_POLL_INTERVAL_MS = 30_000

// TODO: trocar `unknown` pela interface real quando NfeDistService existir.
interface NfeDistServiceLike {
  processarCliente(clienteId: string): Promise<void>
}

@Injectable()
export class NfeDistScheduler implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null
  private manualPollTimer: NodeJS.Timeout | null = null
  private configPollTimer: NodeJS.Timeout | null = null
  private isRunningDaily = false
  private isRunningManual = false
  /** Última config aplicada — usada pra detectar mudanças no poll. */
  private configAtual: { cron: string; enabled: boolean } = { cron: '', enabled: false }

  constructor(
    // TODO: NfeDistService será implementado em paralelo e injetado por token.
    @Inject('NfeDistService')
    private readonly nfeDistService: unknown,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    // Poll manual SEMPRE roda — usuário pode disparar sync via UI mesmo sem cron diário.
    this.manualPollTimer = setInterval(() => {
      void this.processarSyncRequests()
    }, MANUAL_POLL_INTERVAL_MS)
    console.log(`[NfeDistScheduler] Poll manual iniciado: a cada ${MANUAL_POLL_INTERVAL_MS}ms`)

    // Carrega config inicial do DB (com fallback pra env)
    await this.aplicarConfigAtual()

    // Polling pra detectar mudanças feitas via UI (saveSchedulerConfig)
    this.configPollTimer = setInterval(() => {
      void this.aplicarConfigAtual()
    }, CONFIG_POLL_INTERVAL_MS)
  }

  /**
   * Lê config atual do DB+env e reconcilia com o estado em memória.
   * Se cron ou enabled mudou, para/recria/atualiza o CronJob.
   */
  private async aplicarConfigAtual(): Promise<void> {
    let cfg
    try {
      cfg = await loadSchedulerConfig('nfe-dist')
    } catch (e) {
      console.log(`[NfeDistScheduler] Falha ao carregar config: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    const mudouCron = cfg.cron !== this.configAtual.cron
    const mudouEnabled = cfg.enabled !== this.configAtual.enabled
    if (!mudouCron && !mudouEnabled && this.cronJob != null === cfg.enabled) return

    // Para CronJob existente (se houver)
    if (this.cronJob) {
      this.cronJob.stop()
      this.cronJob = null
    }

    if (cfg.enabled) {
      try {
        this.cronJob = new CronJob(
          cfg.cron,
          () => { void this.executarSyncDiario() },
          null,
          true,
          DEFAULT_TIMEZONE,
        )
        console.log(`[NfeDistScheduler] Cron aplicado: "${cfg.cron}" (${cfg.cronSource}) (${DEFAULT_TIMEZONE})`)
      } catch (error) {
        console.log(
          `[NfeDistScheduler] Falha ao iniciar cron com expressão "${cfg.cron}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        this.cronJob = null
        return
      }
    } else {
      console.log(`[NfeDistScheduler] Cron diário DESLIGADO (config=${cfg.enabledSource}).`)
    }

    this.configAtual = { cron: cfg.cron, enabled: cfg.enabled }
  }

  onModuleDestroy(): void {
    if (this.cronJob) {
      this.cronJob.stop()
      this.cronJob = null
      console.log('[NfeDistScheduler] Cron parado.')
    }
    if (this.manualPollTimer) {
      clearInterval(this.manualPollTimer)
      this.manualPollTimer = null
    }
    if (this.configPollTimer) {
      clearInterval(this.configPollTimer)
      this.configPollTimer = null
    }
  }

  /**
   * Execução diária: itera todos os clientes habilitados e dispara o service.
   */
  private async executarSyncDiario(): Promise<void> {
    if (this.isRunningDaily) {
      console.log(
        '[NfeDistScheduler] Sync diário já em execução — pulando ciclo.',
      )
      return
    }
    this.isRunningDaily = true
    const inicio = Date.now()
    console.log('[NfeDistScheduler] Sync diário INICIADO.')

    const execId = await iniciarExecucao('nfe-dist', 'CRON').catch(() => null)
    const detalhes: ExecucaoClienteDetalhe[] = []
    let sucesso = 0
    let falha = 0
    let totalClientes = 0

    try {
      const clientes = await prisma.cliente.findMany({
        where: {
          // @ts-ignore — coluna `nfeDistEnabled` será adicionada no schema Prisma em paralelo.
          nfeDistEnabled: true,
          deletedAt: null,
        },
        select: { id: true, razaoSocial: true },
      })
      totalClientes = clientes.length

      console.log(
        `[NfeDistScheduler] ${clientes.length} cliente(s) habilitado(s) para NFe Dist.`,
      )

      for (const cliente of clientes) {
        const clienteInicio = Date.now()
        try {
          // TODO: NfeDistService.processarCliente será implementado em paralelo.
          await (this.nfeDistService as NfeDistServiceLike).processarCliente(
            cliente.id,
          )
          sucesso++
          const dur = Date.now() - clienteInicio
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'OK', duracaoMs: dur })
          console.log(
            `[NfeDistScheduler] OK cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur}`,
          )
        } catch (error) {
          falha++
          const dur = Date.now() - clienteInicio
          const msg = error instanceof Error ? error.message : String(error)
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'ERRO', mensagem: msg, duracaoMs: dur })
          console.log(
            `[NfeDistScheduler] FALHA cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur} erro="${msg}"`,
          )
        }
      }

      console.log(
        `[NfeDistScheduler] Sync diário CONCLUÍDO. sucesso=${sucesso} falha=${falha} duracaoTotalMs=${Date.now() - inicio}`,
      )
      if (execId) {
        await finalizarExecucao(execId, { totalClientes, sucesso, erros: falha, detalhes })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.log(`[NfeDistScheduler] Erro fatal no sync diário: ${msg}`)
      if (execId) await finalizarComErro(execId, msg)
    } finally {
      this.isRunningDaily = false
    }
  }

  /**
   * Processa sync requests manuais (clientes com `nfeDistSyncRequestedAt != null`).
   * Limpa a flag após processar, mesmo em caso de falha.
   */
  private async processarSyncRequests(): Promise<void> {
    if (this.isRunningManual) return
    this.isRunningManual = true

    let execId: string | null = null
    const detalhes: ExecucaoClienteDetalhe[] = []
    let sucesso = 0
    let falha = 0
    let totalClientes = 0

    try {
      const clientes = await prisma.cliente.findMany({
        where: {
          // @ts-ignore — campos serão adicionados no schema Prisma em paralelo.
          nfeDistSyncRequestedAt: { not: null },
          deletedAt: null,
        },
        select: { id: true, razaoSocial: true },
      })

      if (clientes.length === 0) {
        this.isRunningManual = false
        return
      }
      totalClientes = clientes.length
      execId = await iniciarExecucao('nfe-dist', 'MANUAL').catch(() => null)

      console.log(
        `[NfeDistScheduler] ${clientes.length} sync request(s) manual(is) pendente(s).`,
      )

      for (const cliente of clientes) {
        const clienteInicio = Date.now()
        try {
          // TODO: NfeDistService.processarCliente será implementado em paralelo.
          await (this.nfeDistService as NfeDistServiceLike).processarCliente(
            cliente.id,
          )
          sucesso++
          const dur = Date.now() - clienteInicio
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'OK', duracaoMs: dur })
          console.log(`[NfeDistScheduler] Manual OK cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur}`)
        } catch (error) {
          falha++
          const dur = Date.now() - clienteInicio
          const msg = error instanceof Error ? error.message : String(error)
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'ERRO', mensagem: msg, duracaoMs: dur })
          console.log(`[NfeDistScheduler] Manual FALHA cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur} erro="${msg}"`)
        } finally {
          // Limpa o flag sempre — pra não ficar em loop infinito com cliente quebrado.
          try {
            await prisma.cliente.update({
              where: { id: cliente.id },
              // @ts-ignore — campo será adicionado no schema Prisma em paralelo.
              data: { nfeDistSyncRequestedAt: null },
            })
          } catch (clearErr) {
            console.log(
              `[NfeDistScheduler] Falha ao limpar flag cliente=${cliente.id} erro="${
                clearErr instanceof Error ? clearErr.message : String(clearErr)
              }"`,
            )
          }
        }
      }

      if (execId) {
        await finalizarExecucao(execId, { totalClientes, sucesso, erros: falha, detalhes })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.log(`[NfeDistScheduler] Erro fatal no poll manual: ${msg}`)
      if (execId) await finalizarComErro(execId, msg)
    } finally {
      this.isRunningManual = false
    }
  }
}
