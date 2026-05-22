/**
 * Helper de configuração de schedulers com persistência em SystemConfig.
 *
 * Convenções de chave em system_config:
 *   - scheduler.<slug>.cron     → expressão cron (ex: '30 3 * * *')
 *   - scheduler.<slug>.enabled  → 'true' | 'false'
 *
 * Resolução de valor (ordem de prioridade):
 *   1. system_config (editado pela UI)
 *   2. variável de ambiente (NFE_DIST_CRON, NFE_DIST_ENABLED, etc.)
 *   3. default hardcoded
 *
 * Sem DI — usa prisma direto. Tanto AgendamentoService quanto os schedulers
 * (NfeDistScheduler, NfseDistScheduler) chamam essas funções.
 */

import { prisma } from '@saas/db'

export type SchedulerSlug = 'nfe-dist' | 'nfse-dist'
export type ConfigSource = 'db' | 'env' | 'default'

interface SchedulerMeta {
  envCronKey: string
  envEnabledKey: string
  defaultCron: string
}

const META: Record<SchedulerSlug, SchedulerMeta> = {
  'nfe-dist': {
    envCronKey: 'NFE_DIST_CRON',
    envEnabledKey: 'NFE_DIST_ENABLED',
    defaultCron: '30 3 * * *',
  },
  'nfse-dist': {
    envCronKey: 'NFSE_DIST_CRON',
    envEnabledKey: 'NFSE_DIST_ENABLED',
    defaultCron: '45 3 * * *',
  },
}

export interface ResolvedSchedulerConfig {
  cron: string
  cronSource: ConfigSource
  enabled: boolean
  enabledSource: ConfigSource
}

/** Lê config efetiva. Cai pra env → default se DB não tem. */
export async function loadSchedulerConfig(slug: SchedulerSlug): Promise<ResolvedSchedulerConfig> {
  const meta = META[slug]
  if (!meta) throw new Error(`Scheduler desconhecido: ${slug}`)

  const [cronRow, enabledRow] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: `scheduler.${slug}.cron` } }),
    prisma.systemConfig.findUnique({ where: { key: `scheduler.${slug}.enabled` } }),
  ])

  let cron: string
  let cronSource: ConfigSource
  if (cronRow?.value) {
    cron = cronRow.value
    cronSource = 'db'
  } else if (process.env[meta.envCronKey]) {
    cron = process.env[meta.envCronKey]!
    cronSource = 'env'
  } else {
    cron = meta.defaultCron
    cronSource = 'default'
  }

  let enabled: boolean
  let enabledSource: ConfigSource
  if (enabledRow?.value) {
    enabled = enabledRow.value === 'true'
    enabledSource = 'db'
  } else if (process.env[meta.envEnabledKey] != null) {
    enabled = process.env[meta.envEnabledKey] === 'true'
    enabledSource = 'env'
  } else {
    enabled = false
    enabledSource = 'default'
  }

  return { cron, cronSource, enabled, enabledSource }
}

/** Salva uma ou ambas as configs no DB. */
export async function saveSchedulerConfig(
  slug: SchedulerSlug,
  opts: { cron?: string; enabled?: boolean },
  updatedBy?: string | null,
): Promise<void> {
  if (opts.cron != null) {
    const key = `scheduler.${slug}.cron`
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value: opts.cron },
      create: {
        key,
        value: opts.cron,
        label: `Cron ${slug}`,
        group: 'scheduler',
      },
    })
  }
  if (opts.enabled != null) {
    const key = `scheduler.${slug}.enabled`
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value: String(opts.enabled) },
      create: {
        key,
        value: String(opts.enabled),
        label: `Enabled ${slug}`,
        group: 'scheduler',
      },
    })
  }
  // updatedBy não está no modelo (já tem só updatedAt) — placeholder se quiser auditoria futura.
  void updatedBy
}

/** Valida expressão cron — retorna mensagem de erro ou null. */
export function validarCronExpressao(expr: string): string | null {
  try {
    // Lazy import pra evitar peso no boot
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CronTime } = require('cron') as typeof import('cron')
    new CronTime(expr, 'America/Sao_Paulo')
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Expressão cron inválida'
  }
}
