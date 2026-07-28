import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  createCompraSchema, updateCompraSchema, listCompraSchema,
  createCompraItemSchema, updateCompraItemSchema,
  reprovarCompraSchema, avaliarCompraSchema,
  createCompraAnexoSchema, updateCompraAnexoSchema,
  createCompraMensagemSchema, updateCompraMensagemSchema,
  createCompraCriterioSchema, updateCompraCriterioSchema,
} from '@saas/types'
import { CompraService } from './compra.service'

const MODULE = 'compras'

export function createCompraRouter(compraService: CompraService) {
  return router({
    list: readProcedure(MODULE)
      .input(listCompraSchema)
      .query(({ input, ctx }) => compraService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => compraService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    create: writeProcedure(MODULE)
      .input(createCompraSchema)
      .mutation(({ input, ctx }) => compraService.create(input, ctx.userId, ctx.empresaId, ctx.tenantSchema)),
    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateCompraSchema }))
      .mutation(({ input, ctx }) => compraService.update(input.id, input.data, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.delete(input.id, ctx.tenantSchema)),

    fornecedoresSelect: readProcedure(MODULE)
      .query(({ ctx }) => compraService.listForSelectFornecedores(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // ── Workflow ──
    enviar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.enviar(input.id, ctx.tenantSchema)),
    aprovar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.aprovar(input.id, ctx.userId, ctx.tenantSchema)),
    reprovar: writeProcedure(MODULE)
      .input(reprovarCompraSchema)
      .mutation(({ input, ctx }) => compraService.reprovar(input, ctx.userId, ctx.tenantSchema)),
    receber: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => compraService.receber(input.id, ctx.userId, ctx.tenantSchema)),
    avaliar: writeProcedure(MODULE)
      .input(avaliarCompraSchema)
      .mutation(({ input, ctx }) => compraService.avaliar(input, ctx.tenantSchema)),
    getAvaliacao: readProcedure(MODULE)
      .input(z.object({ compraId: z.string() }))
      .query(({ input, ctx }) => compraService.getAvaliacao(input.compraId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // ── Itens ──
    addItem: writeProcedure(MODULE).input(createCompraItemSchema).mutation(({ input, ctx }) => compraService.addItem(input, ctx.tenantSchema)),
    updateItem: writeProcedure(MODULE).input(updateCompraItemSchema).mutation(({ input, ctx }) => compraService.updateItem(input, ctx.tenantSchema)),
    removeItem: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.removeItem(input.id, ctx.tenantSchema)),

    // ── Anexos ──
    listAnexos: readProcedure(MODULE).input(z.object({ compraId: z.string() })).query(({ input, ctx }) => compraService.listAnexos(input.compraId, ctx.tenantSchema)),
    addAnexo: writeProcedure(MODULE).input(createCompraAnexoSchema).mutation(({ input, ctx }) => compraService.addAnexo(input, ctx.userId, ctx.tenantSchema)),
    updateAnexo: writeProcedure(MODULE).input(updateCompraAnexoSchema).mutation(({ input, ctx }) => compraService.updateAnexo(input, ctx.tenantSchema)),
    removeAnexo: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.removeAnexo(input.id, ctx.tenantSchema)),

    // ── Mensagens ──
    listMensagens: readProcedure(MODULE).input(z.object({ compraId: z.string() })).query(({ input, ctx }) => compraService.listMensagens(input.compraId, ctx.tenantSchema)),
    addMensagem: writeProcedure(MODULE).input(createCompraMensagemSchema).mutation(({ input, ctx }) => compraService.addMensagem(input, ctx.userId, ctx.tenantSchema)),
    updateMensagem: writeProcedure(MODULE).input(updateCompraMensagemSchema).mutation(({ input, ctx }) => compraService.updateMensagem(input, ctx.userId, ctx.tenantSchema)),
    removeMensagem: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.removeMensagem(input.id, ctx.userId, ctx.tenantSchema)),

    // ── Critérios de avaliação ──
    listCriterios: readProcedure(MODULE).query(({ ctx }) => compraService.listCriterios(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),
    createCriterio: writeProcedure(MODULE).input(createCompraCriterioSchema).mutation(({ input, ctx }) => compraService.createCriterio(input, ctx.empresaId, ctx.tenantSchema)),
    updateCriterio: writeProcedure(MODULE).input(updateCompraCriterioSchema).mutation(({ input, ctx }) => compraService.updateCriterio(input, ctx.tenantSchema)),
    deleteCriterio: deleteProcedure(MODULE).input(z.object({ id: z.string() })).mutation(({ input, ctx }) => compraService.deleteCriterio(input.id, ctx.tenantSchema)),
  })
}
