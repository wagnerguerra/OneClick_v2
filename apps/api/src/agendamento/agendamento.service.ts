/**
 * AgendamentoService — leitura do estado dos schedulers de busca fiscal.
 *
 * Read-only por enquanto (Entrega 1). Edição de cron/enabled e dispatch
 * manual em lote ficam pra Entrega 2.
 */

import { Injectable, BadRequestException } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CronTime } from 'cron'
import {
  loadSchedulerConfig,
  saveSchedulerConfig,
  validarCronExpressao,
  type SchedulerSlug,
} from './scheduler-config.helper'

export type { SchedulerSlug }

interface SchedulerMeta {
  slug: SchedulerSlug
  clienteEnabledField: 'nfeDistEnabled' | 'nfseDistEnabled'
  clienteSyncRequestedField: 'nfeDistSyncRequestedAt' | 'nfseDistSyncRequestedAt'
  nome: string
}

const META: Record<SchedulerSlug, SchedulerMeta> = {
  'nfe-dist': {
    slug: 'nfe-dist',
    clienteEnabledField: 'nfeDistEnabled',
    clienteSyncRequestedField: 'nfeDistSyncRequestedAt',
    nome: 'NFe SEFAZ (entradas)',
  },
  'nfse-dist': {
    slug: 'nfse-dist',
    clienteEnabledField: 'nfseDistEnabled',
    clienteSyncRequestedField: 'nfseDistSyncRequestedAt',
    nome: 'NFS-e Nacional (serviços tomados)',
  },
}

const TZ = 'America/Sao_Paulo'

@Injectable()
export class AgendamentoService {
  /**
   * Status atual de um scheduler: config (cron, enabled), próxima execução,
   * qtd clientes ativos, última rodada.
   */
  async getStatus(slug: SchedulerSlug) {
    const meta = META[slug]
    if (!meta) throw new Error(`Scheduler desconhecido: ${slug}`)

    const cfg = await loadSchedulerConfig(slug)
    const proximaExecucao = cfg.enabled ? this.calcularProximaExecucao(cfg.cron) : null

    // Conta clientes ativos pra esse scheduler
    const where: any = { deletedAt: null }
    where[meta.clienteEnabledField] = true
    const clientesAtivos = await prisma.cliente.count({ where })

    // Última rodada (independente de cron/manual)
    const ultimaExecucao = await prisma.schedulerExecution.findFirst({
      where: { scheduler: slug },
      orderBy: { iniciadoEm: 'desc' },
      select: {
        id: true,
        iniciadoEm: true,
        finalizadoEm: true,
        status: true,
        trigger: true,
        totalClientes: true,
        sucesso: true,
        erros: true,
        duracaoMs: true,
      },
    })

    // Estatísticas dos últimos 30 dias
    const desde30d = new Date(Date.now() - 30 * 86400_000)
    const stats30d = await prisma.schedulerExecution.groupBy({
      by: ['status'],
      where: { scheduler: slug, iniciadoEm: { gte: desde30d } },
      _count: true,
    })
    const contagens = {
      total: 0,
      ok: 0,
      erro: 0,
      parcial: 0,
      rodando: 0,
    }
    for (const row of stats30d) {
      contagens.total += row._count
      if (row.status === 'OK') contagens.ok = row._count
      else if (row.status === 'ERRO') contagens.erro = row._count
      else if (row.status === 'PARCIAL') contagens.parcial = row._count
      else if (row.status === 'RODANDO') contagens.rodando = row._count
    }

    return {
      slug,
      nome: meta.nome,
      cronExpressao: cfg.cron,
      cronSource: cfg.cronSource,
      timezone: TZ,
      enabled: cfg.enabled,
      enabledSource: cfg.enabledSource,
      proximaExecucao,
      clientesAtivos,
      ultimaExecucao,
      stats30d: contagens,
    }
  }

  /** Atualiza o cron expression de um scheduler. Persiste em SystemConfig. */
  async setCron(slug: SchedulerSlug, cron: string, updatedBy?: string) {
    if (!META[slug]) throw new BadRequestException(`Scheduler desconhecido: ${slug}`)
    const erro = validarCronExpressao(cron)
    if (erro) throw new BadRequestException(`Cron inválido: ${erro}`)
    await saveSchedulerConfig(slug, { cron }, updatedBy)
    return { ok: true, cron }
  }

  /** Liga/desliga o cron diário de um scheduler. */
  async setEnabled(slug: SchedulerSlug, enabled: boolean, updatedBy?: string) {
    if (!META[slug]) throw new BadRequestException(`Scheduler desconhecido: ${slug}`)
    await saveSchedulerConfig(slug, { enabled }, updatedBy)
    return { ok: true, enabled }
  }

  /**
   * Dispara sync MANUAL pra TODOS os clientes ativos do scheduler.
   * Marca *SyncRequestedAt = now() — o poll de 60s do scheduler consome.
   */
  async dispararAgora(slug: SchedulerSlug) {
    const meta = META[slug]
    if (!meta) throw new BadRequestException(`Scheduler desconhecido: ${slug}`)

    const where: any = { deletedAt: null }
    where[meta.clienteEnabledField] = true

    const r = await prisma.cliente.updateMany({
      where,
      data: { [meta.clienteSyncRequestedField]: new Date() } as any,
    })
    return { ok: true, totalMarcados: r.count }
  }

  /** Lista as últimas execuções de um scheduler. */
  async listExecucoes(opts: {
    scheduler: SchedulerSlug
    limit?: number
    offset?: number
    statusFiltro?: 'OK' | 'ERRO' | 'PARCIAL' | 'RODANDO' | null
  }) {
    const limit = Math.min(opts.limit ?? 50, 100)
    const offset = opts.offset ?? 0
    const where: any = { scheduler: opts.scheduler }
    if (opts.statusFiltro) where.status = opts.statusFiltro

    const [items, total] = await Promise.all([
      prisma.schedulerExecution.findMany({
        where,
        orderBy: { iniciadoEm: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          scheduler: true,
          iniciadoEm: true,
          finalizadoEm: true,
          status: true,
          trigger: true,
          totalClientes: true,
          sucesso: true,
          erros: true,
          duracaoMs: true,
          erroGeral: true,
        },
      }),
      prisma.schedulerExecution.count({ where }),
    ])
    return { items, total, limit, offset }
  }

  /** Detalhe de uma execução (inclui o array de detalhes por cliente). */
  async getExecucao(id: string) {
    return prisma.schedulerExecution.findUnique({ where: { id } })
  }

  private calcularProximaExecucao(cronExpr: string): Date | null {
    try {
      const ct = new CronTime(cronExpr, TZ)
      // A API de CronTime varia conforme versão. Tentamos dois caminhos:
      const candidate = (ct as any).sendAt?.() ?? (ct as any).getNextDateFrom?.(new Date())
      if (candidate?.toDate) return candidate.toDate()
      if (candidate instanceof Date) return candidate
      return null
    } catch {
      return null
    }
  }
}
