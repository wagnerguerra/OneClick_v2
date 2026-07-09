/**
 * NfseDistScheduler — agendador da sincronização diária de NFS-e Nacional.
 *
 * Wire-up concluído: NfseDistService implementado e provido pelo NfseDistModule
 * (token 'NfseDistService'); campos do Cliente e registro no AppModule feitos. [QA #43]
 *
 * Comportamento:
 *   - Cron diário (default 03:45 America/Sao_Paulo, configurável via `NFSE_DIST_CRON`).
 *   - Só roda se `NFSE_DIST_ENABLED=true`.
 *   - Poll separado a cada 1min para sync requests manuais
 *     (clientes com `nfseDistSyncRequestedAt != null`) — flag é limpa após processar.
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
import type { NfseDistService } from './nfse-dist.service'

const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
const MANUAL_POLL_INTERVAL_MS = 60_000
const CONFIG_POLL_INTERVAL_MS = 30_000

@Injectable()
export class NfseDistScheduler implements OnModuleInit, OnModuleDestroy {
  private cronJob: CronJob | null = null
  private manualPollTimer: NodeJS.Timeout | null = null
  private configPollTimer: NodeJS.Timeout | null = null
  private isRunningDaily = false
  private isRunningManual = false
  private configAtual: { cron: string; enabled: boolean } = { cron: '', enabled: false }

  constructor(
    // Token 'NfseDistService' (mesma classe) — import type evita ciclo de módulo.
    @Inject('NfseDistService')
    private readonly nfseDistService: NfseDistService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!schedulersAtivos()) { console.log('[Scheduler] desativado fora de produção (apenas a VPS executa)'); return }
    this.manualPollTimer = setInterval(() => {
      void this.processarSyncRequests()
    }, MANUAL_POLL_INTERVAL_MS)
    console.log(`[NfseDistScheduler] Poll manual iniciado: a cada ${MANUAL_POLL_INTERVAL_MS}ms`)

    await this.aplicarConfigAtual()
    this.configPollTimer = setInterval(() => {
      void this.aplicarConfigAtual()
    }, CONFIG_POLL_INTERVAL_MS)
  }

  private async aplicarConfigAtual(): Promise<void> {
    let cfg
    try {
      cfg = await loadSchedulerConfig('nfse-dist')
    } catch (e) {
      console.log(`[NfseDistScheduler] Falha ao carregar config: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    const mudouCron = cfg.cron !== this.configAtual.cron
    const mudouEnabled = cfg.enabled !== this.configAtual.enabled
    if (!mudouCron && !mudouEnabled && this.cronJob != null === cfg.enabled) return

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
        console.log(`[NfseDistScheduler] Cron aplicado: "${cfg.cron}" (${cfg.cronSource}) (${DEFAULT_TIMEZONE})`)
      } catch (error) {
        console.log(
          `[NfseDistScheduler] Falha ao iniciar cron com expressão "${cfg.cron}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        this.cronJob = null
        return
      }
    } else {
      console.log(`[NfseDistScheduler] Cron diário DESLIGADO (config=${cfg.enabledSource}).`)
    }

    this.configAtual = { cron: cfg.cron, enabled: cfg.enabled }
  }

  onModuleDestroy(): void {
    if (this.cronJob) {
      this.cronJob.stop()
      this.cronJob = null
      console.log('[NfseDistScheduler] Cron parado.')
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

  /** Empresa "home" (mais antiga) — alvo do cron automático (ISO-003).
   *  Mesma resolução determinística usada por cnd/caixapostal e pelos backfills. */
  private async resolverHomeEmpresaId(): Promise<string | null> {
    const emp = await prisma.empresa.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
    return emp?.id ?? null
  }

  /**
   * Execução diária: itera todos os clientes habilitados e dispara o service.
   */
  private async executarSyncDiario(): Promise<void> {
    if (this.isRunningDaily) {
      console.log(
        '[NfseDistScheduler] Sync diário já em execução — pulando ciclo.',
      )
      return
    }
    this.isRunningDaily = true
    const inicio = Date.now()
    console.log('[NfseDistScheduler] Sync diário INICIADO.')

    // Escopo multi-tenant (ISO-003): o cron do servidor processa a empresa "home".
    const empresaIdHome = await this.resolverHomeEmpresaId()
    const execId = await iniciarExecucao('nfse-dist', 'CRON', empresaIdHome).catch(() => null)
    const detalhes: ExecucaoClienteDetalhe[] = []
    let sucesso = 0
    let falha = 0
    let totalClientes = 0

    try {
      const clientes = await prisma.cliente.findMany({
        where: {
          // @ts-ignore — coluna `nfseDistEnabled` será adicionada no schema Prisma em paralelo.
          nfseDistEnabled: true,
          deletedAt: null,
          empresaId: empresaIdHome, // default-deny: null → IS NULL, nunca "todos"
        },
        select: { id: true, razaoSocial: true },
      })
      totalClientes = clientes.length

      console.log(
        `[NfseDistScheduler] ${clientes.length} cliente(s) habilitado(s) para NFS-e Dist.`,
      )

      for (const cliente of clientes) {
        const clienteInicio = Date.now()
        try {
          
          await this.nfseDistService.processarCliente(
            cliente.id,
          )
          sucesso++
          const dur = Date.now() - clienteInicio
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'OK', duracaoMs: dur })
          console.log(`[NfseDistScheduler] OK cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur}`)
        } catch (error) {
          falha++
          const dur = Date.now() - clienteInicio
          const msg = error instanceof Error ? error.message : String(error)
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'ERRO', mensagem: msg, duracaoMs: dur })
          console.log(`[NfseDistScheduler] FALHA cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur} erro="${msg}"`)
        }
      }

      console.log(
        `[NfseDistScheduler] Sync diário CONCLUÍDO. sucesso=${sucesso} falha=${falha} duracaoTotalMs=${Date.now() - inicio}`,
      )
      if (execId) await finalizarExecucao(execId, { totalClientes, sucesso, erros: falha, detalhes })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.log(`[NfseDistScheduler] Erro fatal no sync diário: ${msg}`)
      if (execId) await finalizarComErro(execId, msg)
    } finally {
      this.isRunningDaily = false
    }
  }

  /**
   * Processa sync requests manuais (clientes com `nfseDistSyncRequestedAt != null`).
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
      // Manual = ação explícita do usuário para um cliente específico (flag setada
      // via procedure autorizada por permissão/tenant). Diferente do cron diário
      // (varredura automática, escopada à empresa "home"/ISO-003), aqui processamos
      // TODAS as solicitações pendentes — senão clientes fora da empresa home nunca
      // sincronizam manualmente (ficam presos em "Aguardando o scheduler").
      const empresaIdHome = await this.resolverHomeEmpresaId()
      const clientes = await prisma.cliente.findMany({
        where: {
          // @ts-ignore — campos serão adicionados no schema Prisma em paralelo.
          nfseDistSyncRequestedAt: { not: null },
          deletedAt: null,
        },
        select: { id: true, razaoSocial: true },
      })

      if (clientes.length === 0) {
        this.isRunningManual = false
        return
      }
      totalClientes = clientes.length
      execId = await iniciarExecucao('nfse-dist', 'MANUAL', empresaIdHome).catch(() => null)

      console.log(
        `[NfseDistScheduler] ${clientes.length} sync request(s) manual(is) pendente(s).`,
      )

      for (const cliente of clientes) {
        const clienteInicio = Date.now()
        try {
          
          await this.nfseDistService.processarCliente(
            cliente.id,
          )
          sucesso++
          const dur = Date.now() - clienteInicio
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'OK', duracaoMs: dur })
          console.log(`[NfseDistScheduler] Manual OK cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur}`)
        } catch (error) {
          falha++
          const dur = Date.now() - clienteInicio
          const msg = error instanceof Error ? error.message : String(error)
          detalhes.push({ clienteId: cliente.id, razaoSocial: cliente.razaoSocial, status: 'ERRO', mensagem: msg, duracaoMs: dur })
          console.log(`[NfseDistScheduler] Manual FALHA cliente=${cliente.id} razao="${cliente.razaoSocial}" duracaoMs=${dur} erro="${msg}"`)
        } finally {
          // Limpa o flag sempre — pra não ficar em loop infinito com cliente quebrado.
          try {
            await prisma.cliente.update({
              where: { id: cliente.id },
              // @ts-ignore — campo será adicionado no schema Prisma em paralelo.
              data: { nfseDistSyncRequestedAt: null },
            })
          } catch (clearErr) {
            console.log(
              `[NfseDistScheduler] Falha ao limpar flag cliente=${cliente.id} erro="${
                clearErr instanceof Error ? clearErr.message : String(clearErr)
              }"`,
            )
          }
        }
      }

      if (execId) await finalizarExecucao(execId, { totalClientes, sucesso, erros: falha, detalhes })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.log(`[NfseDistScheduler] Erro fatal no poll manual: ${msg}`)
      if (execId) await finalizarComErro(execId, msg)
    } finally {
      this.isRunningManual = false
    }
  }
}
