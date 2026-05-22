import { prisma } from '@saas/db'

/** Limite de logs ativos por cliente — os mais antigos viram arquivado=true. */
const LIMITE_ATIVOS = 10

export interface SyncLogResultado {
  status: 'completed' | 'error'
  arquivosVistos: number
  arquivosOk: number
  arquivosIgnorados: number
  arquivosErro: number
  erroMensagem?: string | null
}

/**
 * Cria uma entrada em `drive_sync_logs` para registrar uma sincronização
 * (Drive, Pasta local, NFe SEFAZ ou NFS-e Nacional) e, em seguida, arquiva
 * logs antigos para manter no máximo LIMITE_ATIVOS ativos por cliente.
 *
 * Falha silenciosa: nunca interrompe a sync principal por erro de log.
 */
export async function registrarSyncLog(opts: {
  clienteId: string
  tipo: 'nfe-sefaz' | 'nfse-nacional' | string
  iniciadoEm: Date
  resultado: SyncLogResultado
}): Promise<void> {
  try {
    await prisma.driveSyncLog.create({
      data: {
        clienteId: opts.clienteId,
        tipo: opts.tipo,
        iniciadoEm: opts.iniciadoEm,
        finalizadoEm: new Date(),
        status: opts.resultado.status,
        arquivosVistos: opts.resultado.arquivosVistos,
        arquivosNovos: opts.resultado.arquivosOk,
        arquivosOk: opts.resultado.arquivosOk,
        arquivosErro: opts.resultado.arquivosErro,
        arquivosIgnorados: opts.resultado.arquivosIgnorados,
        erroMensagem: opts.resultado.erroMensagem ?? null,
      },
    })
    await arquivarLogsAntigos(opts.clienteId)
  } catch (e) {
    console.error(`[sync-log] falha ao registrar log ${opts.tipo} cliente=${opts.clienteId}: ${(e as Error).message}`)
  }
}

/**
 * Mantém apenas os LIMITE_ATIVOS logs mais recentes não arquivados.
 * Os demais recebem arquivado=true em batch.
 */
async function arquivarLogsAntigos(clienteId: string): Promise<void> {
  // Pega IDs dos N mais recentes ativos. Tudo fora desse conjunto vira arquivado.
  const recentes = await prisma.driveSyncLog.findMany({
    where: { clienteId, arquivado: false },
    orderBy: { iniciadoEm: 'desc' },
    take: LIMITE_ATIVOS,
    select: { id: true },
  })
  if (recentes.length < LIMITE_ATIVOS) return

  const idsRecentes = recentes.map((l) => l.id)
  await prisma.driveSyncLog.updateMany({
    where: {
      clienteId,
      arquivado: false,
      id: { notIn: idsRecentes },
    },
    data: { arquivado: true },
  })
}
