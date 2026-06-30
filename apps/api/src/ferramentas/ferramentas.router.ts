import { z } from 'zod'
import { router, readProcedureAnyOf } from '../trpc/trpc.service'
import { listToolJobsSchema } from '@saas/types'
import { FerramentasService } from './ferramentas.service'

// tRPC SÓ-LEITURA do histórico de jobs (+ lixeira/restore). Upload/status/download
// ficam no controller REST (multipart). Gateado por qualquer área de ferramentas;
// o service ainda escopa por empresa/tenant. Ver docs/plano-ferramentas.md §Fase 1 passo 6.
const SLUGS = ['ferramentas-fiscal', 'ferramentas-contabil']

export function createFerramentasRouter(service: FerramentasService) {
  return router({
    list: readProcedureAnyOf(...SLUGS)
      .input(listToolJobsSchema)
      .query(({ input, ctx }) => service.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedureAnyOf(...SLUGS)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listTrash: readProcedureAnyOf(...SLUGS)
      .input(listToolJobsSchema)
      .query(({ input, ctx }) => service.listTrash(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    restore: readProcedureAnyOf(...SLUGS)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        service.restore(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.userId, ctx.tenantSchema),
      ),

    remove: readProcedureAnyOf(...SLUGS)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        service.delete(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.userId, ctx.tenantSchema),
      ),
  })
}
