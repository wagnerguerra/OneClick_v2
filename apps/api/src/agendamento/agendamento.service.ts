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
  async getStatus(slug: SchedulerSlug, empresaId: string | null) {
    const meta = META[slug]
    if (!meta) throw new Error(`Scheduler desconhecido: ${slug}`)

    const cfg = await loadSchedulerConfig(slug)
    const proximaExecucao = cfg.enabled ? this.calcularProximaExecucao(cfg.cron) : null

    // Conta clientes ativos pra esse scheduler — escopado por empresa (ISO-003)
    const where: any = { deletedAt: null, empresaId: empresaId ?? null }
    where[meta.clienteEnabledField] = true
    const clientesAtivos = await prisma.cliente.count({ where })

    // Última rodada (independente de cron/manual) — só do tenant ativo
    const ultimaExecucao = await prisma.schedulerExecution.findFirst({
      where: { scheduler: slug, empresaId: empresaId ?? null },
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

    // Estatísticas dos últimos 30 dias — escopadas por empresa
    const desde30d = new Date(Date.now() - 30 * 86400_000)
    const stats30d = await prisma.schedulerExecution.groupBy({
      by: ['status'],
      where: { scheduler: slug, empresaId: empresaId ?? null, iniciadoEm: { gte: desde30d } },
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
  async dispararAgora(slug: SchedulerSlug, empresaId: string | null) {
    const meta = META[slug]
    if (!meta) throw new BadRequestException(`Scheduler desconhecido: ${slug}`)

    // Escopo por empresa (ISO-003) — antes marcava clientes de TODOS os tenants.
    const where: any = { deletedAt: null, empresaId: empresaId ?? null }
    where[meta.clienteEnabledField] = true

    const r = await prisma.cliente.updateMany({
      where,
      data: { [meta.clienteSyncRequestedField]: new Date() } as any,
    })
    return { ok: true, totalMarcados: r.count }
  }

  /** Lista as últimas execuções de um scheduler (escopado por empresa). */
  async listExecucoes(opts: {
    scheduler: SchedulerSlug
    empresaId: string | null
    limit?: number
    offset?: number
    statusFiltro?: 'OK' | 'ERRO' | 'PARCIAL' | 'RODANDO' | null
  }) {
    const limit = Math.min(opts.limit ?? 50, 100)
    const offset = opts.offset ?? 0
    const where: any = { scheduler: opts.scheduler, empresaId: opts.empresaId ?? null }
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

  /** Detalhe de uma execução (inclui o array de detalhes por cliente).
   *  Escopado por empresa (ISO-003) — default-deny se for de outro tenant. */
  async getExecucao(id: string, empresaId: string | null) {
    return prisma.schedulerExecution.findFirst({ where: { id, empresaId: empresaId ?? null } })
  }

  // ============================================================
  // Centro de agendamentos (observabilidade)
  // ============================================================

  /**
   * Lista TODOS os schedulers do sistema (não só os do agendamento module).
   * Lê o registry estático em `scheduler-registry.ts` e enriquece cada item
   * com: cron atual, ativo, próxima execução, última execução (data + status).
   */
  async listAll(empresaId: string | null) {
    const { SCHEDULER_REGISTRY } = await import('./scheduler-registry')

    // ── Pré-carrega fontes que serão consultadas em batch ──
    const systemConfigKeys = SCHEDULER_REGISTRY.flatMap(s =>
      s.cronSource.kind === 'systemConfig'
        ? [s.cronSource.cronKey, s.cronSource.enabledKey].filter((k): k is string => !!k)
        : [],
    )
    const systemConfigRows = systemConfigKeys.length > 0
      ? await prisma.systemConfig.findMany({ where: { key: { in: systemConfigKeys } } })
      : []
    const systemConfigMap = new Map(systemConfigRows.map(r => [r.key, r.value]))

    // AgendaDisparoConfig — carrega 1x se algum item depende dele
    const agendaDisparoCfg = SCHEDULER_REGISTRY.some(s => s.cronSource.kind === 'agendaDisparoConfig')
      ? await prisma.agendaDisparoConfig.findFirst()
      : null

    // Últimas execuções por slug (scheduler_executions)
    const slugsExec = SCHEDULER_REGISTRY
      .map(s => s.lastRunSource.kind === 'scheduler_executions' ? s.lastRunSource.slug : null)
      .filter((x): x is string => !!x)
    const ultimasExec = slugsExec.length > 0
      ? await prisma.$queryRaw<Array<{ scheduler: string; iniciado_em: Date; finalizado_em: Date | null; status: string; total_clientes: number; sucesso: number; erros: number }>>`
          SELECT DISTINCT ON (scheduler) scheduler, iniciado_em, finalizado_em, status, total_clientes, sucesso, erros
          FROM scheduler_executions
          WHERE scheduler = ANY(${slugsExec})
            AND empresa_id IS NOT DISTINCT FROM ${empresaId}
          ORDER BY scheduler, iniciado_em DESC
        `
      : []
    const ultimasExecMap = new Map(ultimasExec.map(r => [r.scheduler, r]))

    // Última do agenda_disparo_logs
    const ultimoDisparoAgenda = SCHEDULER_REGISTRY.some(s => s.lastRunSource.kind === 'agenda_disparo_logs')
      ? await prisma.agendaDisparoLog.findFirst({
          orderBy: { disparadoEm: 'desc' },
          select: { disparadoEm: true, enviados: true, falhas: true, modo: true },
        })
      : null

    // ── Monta resposta ──
    return SCHEDULER_REGISTRY.map(item => {
      // Resolve cron + ativo conforme a fonte
      let cron: string
      let ativo: boolean

      if (item.cronSource.kind === 'literal') {
        cron = item.cronSource.cron
        ativo = item.cronSource.ativo
      } else if (item.cronSource.kind === 'env') {
        cron = (item.cronSource.cronEnv ? process.env[item.cronSource.cronEnv] : null) ?? item.cronSource.defaultCron
        ativo = item.cronSource.enabledEnv ? process.env[item.cronSource.enabledEnv] === 'true' : true
      } else if (item.cronSource.kind === 'systemConfig') {
        cron = (item.cronSource.cronKey ? systemConfigMap.get(item.cronSource.cronKey) : null) ?? item.cronSource.defaultCron
        ativo = item.cronSource.enabledKey
          ? systemConfigMap.get(item.cronSource.enabledKey) === 'true'
          : true
      } else if (item.cronSource.kind === 'agendaDisparoConfig') {
        // Converte horario (HH:MM) + diasSemana (array de 0-6) em cron 5 campos
        // expressão "M H * * D1,D2,...". Cron usa 0=domingo, mesmo padrão.
        if (agendaDisparoCfg) {
          const [hh, mm] = agendaDisparoCfg.horario.split(':')
          const dias = (agendaDisparoCfg.diasSemana ?? []).join(',') || '*'
          cron = `${parseInt(mm ?? '0', 10)} ${parseInt(hh ?? '0', 10)} * * ${dias}`
          ativo = agendaDisparoCfg.ativo
        } else {
          cron = '—'
          ativo = false
        }
      } else {
        cron = '—'
        ativo = true
      }

      // Próxima execução (só se cron é parseável)
      const proximaExecucao = cron && cron !== '—' ? this.calcularProximaExecucao(cron) : null

      // Última execução
      let ultimaExecucao: {
        iniciadoEm: Date | null
        status: string | null
        info: string | null
      } = { iniciadoEm: null, status: null, info: null }

      if (item.lastRunSource.kind === 'scheduler_executions') {
        const r = ultimasExecMap.get(item.lastRunSource.slug)
        if (r) {
          ultimaExecucao = {
            iniciadoEm: r.iniciado_em,
            status: r.status,
            info: `${r.sucesso}/${r.total_clientes} OK${r.erros > 0 ? `, ${r.erros} erro(s)` : ''}`,
          }
        }
      } else if (item.lastRunSource.kind === 'agenda_disparo_logs' && ultimoDisparoAgenda) {
        ultimaExecucao = {
          iniciadoEm: ultimoDisparoAgenda.disparadoEm,
          status: ultimoDisparoAgenda.falhas > 0 ? 'PARCIAL' : 'OK',
          info: `${ultimoDisparoAgenda.enviados} enviado(s)${ultimoDisparoAgenda.falhas > 0 ? `, ${ultimoDisparoAgenda.falhas} falha(s)` : ''} · ${ultimoDisparoAgenda.modo}`,
        }
      }

      return {
        slug: item.slug,
        nome: item.nome,
        modulo: item.modulo,
        descricao: item.descricao,
        icon: item.icon,
        cron,
        ativo,
        proximaExecucao,
        ultimaExecucao,
        configHref: item.configHref,
      }
    })
  }

  private calcularProximaExecucao(cronExpr: string): Date | null {
    try {
      const ct = new CronTime(cronExpr, TZ)
      // cron@4 retorna luxon DateTime (não Date). Luxon v3+ usa .toJSDate();
      // versões antigas tinham .toDate(). Tentamos os dois pra robustez.
      const candidate = (ct as any).sendAt?.() ?? (ct as any).getNextDateFrom?.(new Date())
      if (!candidate) return null
      if (typeof candidate.toJSDate === 'function') return candidate.toJSDate()
      if (typeof candidate.toDate === 'function') return candidate.toDate()
      if (candidate instanceof Date) return candidate
      return null
    } catch {
      return null
    }
  }
}
