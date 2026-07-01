import { z } from 'zod'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { NfseDistService } from './nfse-dist.service'

// Reaproveita permissão de cliente — quem edita cliente pode configurar NFS-e Dist.
const MODULE = 'cliente'

export function createNfseDistRouter(svc: NfseDistService) {
  return router({
    /**
     * Habilita/desabilita NFS-e Distribuição (ADN) para o cliente e opcionalmente
     * vincula um certificado digital. Se habilitando pela primeira vez (sem
     * ultimoNsu), marca status como 'aguardando' pra próxima rodada do scheduler.
     */
    configurar: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        enabled: z.boolean(),
        certificadoId: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const atual = await prisma.cliente.findUnique({
          where: { id: input.clienteId },
          select: { nfseDistUltimoNsu: true },
        })
        const setAguardando = input.enabled && !atual?.nfseDistUltimoNsu

        await prisma.cliente.update({
          where: { id: input.clienteId },
          data: {
            nfseDistEnabled: input.enabled,
            nfseDistCertificadoId: input.certificadoId ?? null,
            ...(setAguardando ? { nfseDistSyncStatus: 'aguardando' } : {}),
          },
        })
        return { ok: true }
      }),

    /** Solicita sync manual — scheduler detecta no próximo poll. */
    solicitarSync: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input }) => svc.solicitarSync(input.clienteId)),

    /** Re-sincroniza a partir de um NSU específico (0 = histórico completo). */
    resincronizarDesdeNsu: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), nsu: z.string() }))
      .mutation(({ input }) => svc.resincronizarDesdeNsu(input.clienteId, input.nsu)),

    /** Clientes com NFS-e Distribuição habilitada — pro seletor da busca sob demanda.
     *  Campos normalizados (ultimoNsu/syncStatus/…) iguais ao nfe-dist. */
    listEnabled: readProcedure(MODULE)
      .query(async ({ ctx }) => {
        const rows = await prisma.cliente.findMany({
          where: {
            nfseDistEnabled: true,
            deletedAt: null,
            ...(ctx.isMaster ? {} : { empresaId: ctx.empresaId }),
          },
          select: {
            id: true, razaoSocial: true, nomeFantasia: true, documento: true,
            nfseDistUltimoNsu: true, nfseDistSyncedAt: true, nfseDistSyncStatus: true, nfseDistSyncRequestedAt: true,
          },
          orderBy: { razaoSocial: 'asc' },
        })
        return rows.map((c) => ({
          id: c.id, razaoSocial: c.razaoSocial, nomeFantasia: c.nomeFantasia, documento: c.documento,
          ultimoNsu: c.nfseDistUltimoNsu != null ? c.nfseDistUltimoNsu.toString() : null,
          syncStatus: c.nfseDistSyncStatus, syncRequestedAt: c.nfseDistSyncRequestedAt, syncedAt: c.nfseDistSyncedAt,
        }))
      }),

    /** Progresso em tempo real (polling pela UI). */
    getProgressoAtual: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => svc.getProgressoAtual(input.clienteId)),

    /** Resultado da última execução de sync (pro modal mostrar quantas notas vieram). */
    ultimaExecucao: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        const log = await prisma.driveSyncLog.findFirst({
          where: { clienteId: input.clienteId, tipo: 'nfse-nacional' },
          orderBy: { iniciadoEm: 'desc' },
          select: { arquivosOk: true, arquivosIgnorados: true, arquivosErro: true, arquivosVistos: true, status: true, finalizadoEm: true, erroMensagem: true },
        })
        if (!log) return null
        return {
          novas: log.arquivosOk, ignoradas: log.arquivosIgnorados, erro: log.arquivosErro,
          vistos: log.arquivosVistos, status: log.status,
          em: log.finalizadoEm ? log.finalizadoEm.toISOString() : null, erroMensagem: log.erroMensagem,
        }
      }),

    /** Retorna estado atual da config NFS-e Dist do cliente. */
    status: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        const c = await prisma.cliente.findUnique({
          where: { id: input.clienteId },
          select: {
            id: true,
            nfseDistEnabled: true,
            nfseDistUltimoNsu: true,
            nfseDistSyncedAt: true,
            nfseDistSyncStatus: true,
            nfseDistSyncRequestedAt: true,
            nfseDistCertificadoId: true,
          },
        })
        if (!c) return null
        return {
          ...c,
          // BigInt → string pra serialização JSON
          nfseDistUltimoNsu: c.nfseDistUltimoNsu != null ? c.nfseDistUltimoNsu.toString() : null,
        }
      }),
  })
}
