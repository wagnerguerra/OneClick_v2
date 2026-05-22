/**
 * Helpers compartilhados pra persistir cada rodada de scheduler na tabela
 * scheduler_executions. Usados por NfeDistScheduler, NfseDistScheduler e
 * futuros (caixapostal, cnd, etc).
 *
 * Padrão de uso:
 *   const execId = await iniciarExecucao('nfe-dist', 'CRON')
 *   const detalhes: ExecucaoClienteDetalhe[] = []
 *   for (const cli of clientes) {
 *     try { ...; detalhes.push({ clienteId: cli.id, ..., status: 'OK' }) }
 *     catch (e) { detalhes.push({ clienteId: cli.id, ..., status: 'ERRO', mensagem: ... }) }
 *   }
 *   await finalizarExecucao(execId, { totalClientes, sucesso, erros, detalhes })
 *
 * Em caso de erro fatal (antes do loop), usar finalizarComErro(execId, msg).
 */

import { prisma, Prisma } from '@saas/db'

export type SchedulerSlug = 'nfe-dist' | 'nfse-dist' | string
export type TriggerType = 'CRON' | 'MANUAL'

export interface ExecucaoClienteDetalhe {
  clienteId: string
  razaoSocial?: string
  status: 'OK' | 'ERRO'
  mensagem?: string
  duracaoMs?: number
}

export interface FinalizarResultado {
  totalClientes: number
  sucesso: number
  erros: number
  detalhes?: ExecucaoClienteDetalhe[]
}

/** Cria row RODANDO e retorna o id pra ser usado no finalizar. */
export async function iniciarExecucao(
  scheduler: SchedulerSlug,
  trigger: TriggerType,
): Promise<string> {
  const exec = await prisma.schedulerExecution.create({
    data: { scheduler, trigger, status: 'RODANDO' },
    select: { id: true },
  })
  return exec.id
}

/** Marca execução como OK / PARCIAL / ERRO baseado nos contadores. */
export async function finalizarExecucao(
  execId: string,
  result: FinalizarResultado,
): Promise<void> {
  const { totalClientes, sucesso, erros, detalhes } = result
  const status =
    erros === 0
      ? 'OK'
      : sucesso === 0
        ? 'ERRO'
        : 'PARCIAL'

  const inicio = await prisma.schedulerExecution
    .findUnique({ where: { id: execId }, select: { iniciadoEm: true } })

  const duracaoMs = inicio?.iniciadoEm
    ? Date.now() - inicio.iniciadoEm.getTime()
    : null

  await prisma.schedulerExecution.update({
    where: { id: execId },
    data: {
      status,
      totalClientes,
      sucesso,
      erros,
      duracaoMs,
      finalizadoEm: new Date(),
      // Detalhes ficam null se for execução grande (>200 clientes) pra não
      // explodir o tamanho da row. Prisma.JsonNull pra campos Json nullable.
      detalhes: detalhes && detalhes.length <= 200
        ? (detalhes as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  }).catch(() => {
    // Log silencioso — não queremos que falha de log derrube o scheduler
  })
}

/** Marca execução como ERRO global (falha antes/durante o loop). */
export async function finalizarComErro(
  execId: string,
  erroGeral: string,
): Promise<void> {
  const inicio = await prisma.schedulerExecution
    .findUnique({ where: { id: execId }, select: { iniciadoEm: true } })

  const duracaoMs = inicio?.iniciadoEm
    ? Date.now() - inicio.iniciadoEm.getTime()
    : null

  await prisma.schedulerExecution.update({
    where: { id: execId },
    data: {
      status: 'ERRO',
      duracaoMs,
      finalizadoEm: new Date(),
      erroGeral: erroGeral.slice(0, 5000),
    },
  }).catch(() => { /* silencioso */ })
}
