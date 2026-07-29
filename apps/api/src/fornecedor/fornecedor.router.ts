import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  createFornecedorSchema, updateFornecedorSchema, listFornecedorSchema,
  createFornecedorAnexoSchema, updateFornecedorAnexoSchema,
  createFornecedorCriterioSchema, updateFornecedorCriterioSchema,
  responderQualificacaoSchema,
  createFornecedorMensagemSchema, updateFornecedorMensagemSchema,
  createFornecedorCategoriaSchema, updateFornecedorCategoriaSchema,
} from '@saas/types'
import { FornecedorService } from './fornecedor.service'

const MODULE = 'fornecedores'

export function createFornecedorRouter(fornecedorService: FornecedorService) {
  return router({
    list: readProcedure(MODULE)
      .input(listFornecedorSchema)
      .query(({ input, ctx }) => fornecedorService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => fornecedorService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    create: writeProcedure(MODULE)
      .input(createFornecedorSchema)
      .mutation(({ input, ctx }) => fornecedorService.create(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateFornecedorSchema }))
      .mutation(({ input, ctx }) => fornecedorService.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => fornecedorService.delete(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    restore: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => fornecedorService.restore(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // Categorias (tags)
    listCategorias: readProcedure(MODULE)
      .query(({ ctx }) => fornecedorService.listCategorias(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    createCategoria: writeProcedure(MODULE)
      .input(createFornecedorCategoriaSchema)
      .mutation(({ input, ctx }) => fornecedorService.createCategoria(input.nome, ctx.empresaId, ctx.tenantSchema)),
    updateCategoria: writeProcedure(MODULE)
      .input(updateFornecedorCategoriaSchema)
      .mutation(({ input, ctx }) => fornecedorService.updateCategoria(input.id, input.nome, ctx.tenantSchema)),
    deleteCategoria: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => fornecedorService.deleteCategoria(input.id, ctx.tenantSchema)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => fornecedorService.listForSelect(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getEvents: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => fornecedorService.getEvents(input.id)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => fornecedorService.exportAll(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createFornecedorSchema) }))
      .mutation(({ input, ctx }) => fornecedorService.bulkCreate(input.items, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // ── Anexos ──
    listAnexos: readProcedure(MODULE)
      .input(z.object({ fornecedorId: z.string() }))
      .query(({ input, ctx }) => fornecedorService.listAnexos(input.fornecedorId, ctx.tenantSchema)),
    addAnexo: writeProcedure(MODULE)
      .input(createFornecedorAnexoSchema)
      .mutation(({ input, ctx }) => fornecedorService.addAnexo(input, ctx.userId, ctx.tenantSchema)),
    updateAnexo: writeProcedure(MODULE)
      .input(updateFornecedorAnexoSchema)
      .mutation(({ input, ctx }) => fornecedorService.updateAnexo(input, ctx.tenantSchema)),
    removeAnexo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => fornecedorService.removeAnexo(input.id, ctx.tenantSchema)),

    // ── Critérios de seleção ──
    listCriterios: readProcedure(MODULE)
      .query(({ ctx }) => fornecedorService.listCriterios(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    createCriterio: writeProcedure(MODULE)
      .input(createFornecedorCriterioSchema)
      .mutation(({ input, ctx }) => fornecedorService.createCriterio(input, ctx.empresaId, ctx.tenantSchema)),
    updateCriterio: writeProcedure(MODULE)
      .input(updateFornecedorCriterioSchema)
      .mutation(({ input, ctx }) => fornecedorService.updateCriterio(input, ctx.tenantSchema)),
    deleteCriterio: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => fornecedorService.deleteCriterio(input.id, ctx.tenantSchema)),

    // ── Qualificação (checklist do fornecedor) ──
    getQualificacoes: readProcedure(MODULE)
      .input(z.object({ fornecedorId: z.string() }))
      .query(({ input, ctx }) => fornecedorService.getQualificacoes(input.fornecedorId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // ── Avaliação de fornecimento (nota derivada das compras) ──
    getAvaliacaoFornecimento: readProcedure(MODULE)
      .input(z.object({ fornecedorId: z.string() }))
      .query(({ input, ctx }) => fornecedorService.getAvaliacaoFornecimento(input.fornecedorId, ctx.tenantSchema)),
    responderQualificacao: writeProcedure(MODULE)
      .input(responderQualificacaoSchema)
      .mutation(({ input, ctx }) => fornecedorService.responderQualificacao(input, ctx.userId, ctx.tenantSchema)),

    // ── Mensagens ──
    listMensagens: readProcedure(MODULE)
      .input(z.object({ fornecedorId: z.string() }))
      .query(({ input, ctx }) => fornecedorService.listMensagens(input.fornecedorId, ctx.tenantSchema)),
    addMensagem: writeProcedure(MODULE)
      .input(createFornecedorMensagemSchema)
      .mutation(({ input, ctx }) => fornecedorService.addMensagem(input, ctx.userId, ctx.tenantSchema)),
    updateMensagem: writeProcedure(MODULE)
      .input(updateFornecedorMensagemSchema)
      .mutation(({ input, ctx }) => fornecedorService.updateMensagem(input, ctx.userId, ctx.tenantSchema)),
    removeMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => fornecedorService.removeMensagem(input.id, ctx.userId, ctx.tenantSchema)),
  })
}
