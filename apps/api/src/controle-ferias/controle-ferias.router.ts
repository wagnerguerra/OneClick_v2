import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  criarFeriasPeriodoSchema, atualizarFeriasPeriodoSchema, criarFeriasEventoSchema,
  listarFeriasPeriodosSchema,
} from '@saas/types'
import { ControleFeriasService } from './controle-ferias.service'

const MODULE = 'controle-ferias'

// Sem sub-permissões: o v1 não tinha níveis neste módulo.
export function createControleFeriasRouter(service: ControleFeriasService) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarFeriasPeriodosSchema)
      .query(({ input, ctx }) => service.listar(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarFeriasPeriodoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarFeriasPeriodoSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    criarEvento: writeProcedure(MODULE)
      .input(criarFeriasEventoSchema)
      .mutation(({ input, ctx }) => service.criarEvento(input, ctx.userId, ctx.empresaId)),

    excluirEvento: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.excluirEvento(input.id)),

    criarArquivo: writeProcedure(MODULE)
      .input(z.object({ periodoId: z.string(), nome: z.string().min(1), path: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.criarArquivo(input, ctx.userId, ctx.empresaId)),

    excluirArquivo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.excluirArquivo(input.id)),

    listarColaboradores: readProcedure(MODULE)
      .query(({ ctx }) => service.listarColaboradores(ctx.empresaId)),
  })
}
