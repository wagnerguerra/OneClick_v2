import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createTreatmentModelSchema, updateTreatmentModelSchema, listTreatmentModelSchema, previewArquivoSchema } from '@saas/types'
import { TratamentoLancamentosService } from './tratamento-lancamentos.service'

const MODULE = 'tratamento-lancamentos'

export function createTratamentoLancamentosRouter(service: TratamentoLancamentosService) {
  return router({
    list: readProcedure(MODULE)
      .input(listTreatmentModelSchema)
      .query(({ input, ctx }) => service.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listTrash: readProcedure(MODULE)
      .input(listTreatmentModelSchema)
      .query(({ input, ctx }) => service.listTrash(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getVersions: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getVersions(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => service.listForSelect(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // Preview do arquivo-exemplo (base64 no corpo → mutation). Só leitura.
    preview: readProcedure(MODULE)
      .input(previewArquivoSchema)
      .mutation(({ input }) => service.preview(input)),

    create: writeProcedure(MODULE)
      .input(createTreatmentModelSchema)
      .mutation(({ input, ctx }) => service.create(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateTreatmentModelSchema }))
      .mutation(({ input, ctx }) => service.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.remove(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    restore: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.restore(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    duplicate: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.duplicate(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
  })
}
