import { z } from 'zod'
import { router, readProcedure, writeSubProcedure, deleteSubProcedure } from '../trpc/trpc.service'
import { createTreatmentModelSchema, updateTreatmentModelSchema, listTreatmentModelSchema, previewArquivoSchema, convertSchema } from '@saas/types'
import { TratamentoLancamentosService } from './tratamento-lancamentos.service'

const MODULE = 'tratamento-lancamentos'
// Sub-permissão que libera criar/editar/duplicar/excluir Modelos de Tratamento.
const MANAGE = 'gerenciar_modelos'
const MANAGE_LABEL = 'Gerenciar modelos de tratamento'

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

    // Conversão para o SCI (aplica o modelo ao arquivo). Só leitura.
    convert: readProcedure(MODULE)
      .input(convertSchema)
      .mutation(({ input, ctx }) => service.convert(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    create: writeSubProcedure(MODULE, MANAGE, MANAGE_LABEL)
      .input(createTreatmentModelSchema)
      .mutation(({ input, ctx }) => service.create(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    update: writeSubProcedure(MODULE, MANAGE, MANAGE_LABEL)
      .input(z.object({ id: z.string(), data: updateTreatmentModelSchema }))
      .mutation(({ input, ctx }) => service.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    delete: deleteSubProcedure(MODULE, MANAGE, MANAGE_LABEL)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.remove(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    restore: writeSubProcedure(MODULE, MANAGE, MANAGE_LABEL)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.restore(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    duplicate: writeSubProcedure(MODULE, MANAGE, MANAGE_LABEL)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.duplicate(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
  })
}
