import { z } from 'zod'
import { router, readProcedure, writeSubProcedure, deleteSubProcedure } from '../trpc/trpc.service'
import { createTreatmentModelSchema, updateTreatmentModelSchema, listTreatmentModelSchema, convertSchema, debugExtractSchema } from '@saas/types'
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

    // Versão específica COM a definição completa (para o diff do histórico).
    getVersion: readProcedure(MODULE)
      .input(z.object({ versionId: z.string() }))
      .query(({ input, ctx }) => service.getVersion(input.versionId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => service.listForSelect(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // Conversão para o SCI (aplica o modelo à tabela extraída no cliente). Só leitura.
    convert: readProcedure(MODULE)
      .input(convertSchema)
      .mutation(({ input, ctx }) => service.convert(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // Visualizador de debug (ferramenta interna, via atalho de teclado): recebe a
    // tabela extraída no cliente e devolve o traço do de/para. Só leitura.
    debugExtract: readProcedure(MODULE)
      .input(debugExtractSchema)
      .mutation(({ input, ctx }) => service.debugExtract(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

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

    // Restaurar uma versão anterior gera uma nova versão → exige gerenciar modelos.
    restoreVersion: writeSubProcedure(MODULE, MANAGE, MANAGE_LABEL)
      .input(z.object({ versionId: z.string() }))
      .mutation(({ input, ctx }) => service.restoreVersion(input.versionId, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
  })
}
