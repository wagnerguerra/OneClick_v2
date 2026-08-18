import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  criarTabelaRegistroSchema, atualizarTabelaRegistroSchema,
  novaVersaoTabelaSchema, listarTabelasRegistroSchema,
} from '@saas/types'
import { TabelaRegistroService } from './tabela-registro.service'

const MODULE = 'tabelas-registros'

// Sem sub-permissões: o v1 não tinha níveis e não há fluxo a proteger.
export function createTabelaRegistroRouter(service: TabelaRegistroService) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarTabelasRegistroSchema)
      .query(({ input, ctx }) => service.listar(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarTabelaRegistroSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarTabelaRegistroSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.empresaId)),

    novaVersao: writeProcedure(MODULE)
      .input(novaVersaoTabelaSchema)
      .mutation(({ input, ctx }) => service.novaVersao(input, ctx.userId, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    listarProcessos: readProcedure(MODULE)
      .query(({ ctx }) => service.listarProcessos(ctx.empresaId)),
  })
}
