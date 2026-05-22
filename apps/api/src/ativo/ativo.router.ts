import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  createAtivoSchema, updateAtivoSchema, listAtivoSchema,
  createAtivoTipoSchema, updateAtivoTipoSchema,
  createAtivoCategoriaSchema, updateAtivoCategoriaSchema,
  createAtivoManutencaoSchema, updateAtivoManutencaoSchema,
  createAtivoAnexoSchema,
} from '@saas/types'
import { AtivoService } from './ativo.service'

const MODULE = 'ativos'

export function createAtivoRouter(svc: AtivoService) {
  return router({
    // ── Ativo ───────────────────────────────────────────────────
    list: readProcedure(MODULE).input(listAtivoSchema)
      .query(({ input, ctx }) => svc.list(input, ctx.isMaster ?? false, ctx.empresaId)),
    getById: readProcedure(MODULE).input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => svc.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),
    create: writeProcedure(MODULE).input(createAtivoSchema)
      .mutation(({ input, ctx }) => svc.create(input, ctx.empresaId, ctx.userId)),
    update: writeProcedure(MODULE).input(z.object({ id: z.string(), data: updateAtivoSchema }))
      .mutation(({ input, ctx }) => svc.update(input.id, input.data, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    delete: deleteProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => svc.delete(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.userId)),
    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => svc.listForSelect(ctx.isMaster ?? false, ctx.empresaId)),

    // ── Tipos ───────────────────────────────────────────────────
    listTipos: readProcedure(MODULE)
      .query(({ ctx }) => svc.listTipos(ctx.isMaster ?? false, ctx.empresaId)),
    createTipo: writeProcedure(MODULE).input(createAtivoTipoSchema)
      .mutation(({ input, ctx }) => svc.createTipo(input, ctx.empresaId)),
    updateTipo: writeProcedure(MODULE).input(z.object({ id: z.string(), data: updateAtivoTipoSchema }))
      .mutation(({ input }) => svc.updateTipo(input.id, input.data)),
    deleteTipo: deleteProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteTipo(input.id)),

    // ── Categorias ──────────────────────────────────────────────
    listCategorias: readProcedure(MODULE).input(z.object({ tipoId: z.string().optional() }).optional())
      .query(({ input, ctx }) => svc.listCategorias(ctx.isMaster ?? false, ctx.empresaId, input?.tipoId)),
    createCategoria: writeProcedure(MODULE).input(createAtivoCategoriaSchema)
      .mutation(({ input, ctx }) => svc.createCategoria(input, ctx.empresaId)),
    updateCategoria: writeProcedure(MODULE).input(z.object({ id: z.string(), data: updateAtivoCategoriaSchema }))
      .mutation(({ input }) => svc.updateCategoria(input.id, input.data)),
    deleteCategoria: deleteProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteCategoria(input.id)),

    // ── Manutenções ─────────────────────────────────────────────
    createManutencao: writeProcedure(MODULE).input(createAtivoManutencaoSchema)
      .mutation(({ input, ctx }) => svc.createManutencao(input, ctx.userId)),
    updateManutencao: writeProcedure(MODULE).input(z.object({ id: z.string(), data: updateAtivoManutencaoSchema }))
      .mutation(({ input }) => svc.updateManutencao(input.id, input.data)),
    deleteManutencao: deleteProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteManutencao(input.id)),

    // ── Anexos ──────────────────────────────────────────────────
    createAnexo: writeProcedure(MODULE).input(createAtivoAnexoSchema)
      .mutation(({ input }) => svc.createAnexo(input)),
    deleteAnexo: deleteProcedure(MODULE).input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteAnexo(input.id)),

    // ── Alertas ─────────────────────────────────────────────────
    listGarantiasVencendo: readProcedure(MODULE)
      .input(z.object({ diasAntes: z.coerce.number().int().min(1).max(365).default(30) }).optional())
      .query(({ input, ctx }) => svc.listGarantiasVencendo(ctx.isMaster ?? false, ctx.empresaId, input?.diasAntes)),

    // ── Dashboard / Estatísticas ────────────────────────────────
    getEstatisticas: readProcedure(MODULE)
      .query(({ ctx }) => svc.getEstatisticas(ctx.isMaster ?? false, ctx.empresaId)),

    // ── Inventário em massa ─────────────────────────────────────
    marcarInventariadosEmMassa: writeProcedure(MODULE)
      .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
      .mutation(({ input, ctx }) => svc.marcarInventariadosEmMassa(input.ids, ctx.isMaster ?? false, ctx.empresaId)),

    // ── Por responsável (integração com Colaboradores) ──────────
    listByResponsavel: readProcedure(MODULE)
      .input(z.object({ responsavelId: z.string() }))
      .query(({ input, ctx }) => svc.listByResponsavel(input.responsavelId, ctx.isMaster ?? false, ctx.empresaId)),
  })
}
