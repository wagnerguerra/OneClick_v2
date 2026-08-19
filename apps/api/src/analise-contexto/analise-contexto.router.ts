import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  criarAnaliseContextoSchema, atualizarAnaliseContextoSchema, avaliarAnaliseContextoSchema,
  criarAnaliseContextoAcaoSchema, atualizarAnaliseContextoAcaoSchema, concluirAnaliseContextoAcaoSchema,
  listarAnaliseContextoSchema,
} from '@saas/types'
import { AnaliseContextoService } from './analise-contexto.service'

const MODULE = 'analise-contexto'

// Sem sub-permissões: o v1 só tinha o nível adm (o usu/ ficou vazio).
export function createAnaliseContextoRouter(service: AnaliseContextoService) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarAnaliseContextoSchema)
      .query(({ input, ctx }) => service.listar(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarAnaliseContextoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarAnaliseContextoSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.empresaId)),

    avaliar: writeProcedure(MODULE)
      .input(avaliarAnaliseContextoSchema)
      .mutation(({ input, ctx }) => service.avaliar(input, ctx.userId, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    criarAcao: writeProcedure(MODULE)
      .input(criarAnaliseContextoAcaoSchema)
      .mutation(({ input, ctx }) => service.criarAcao(input, ctx.empresaId)),

    atualizarAcao: writeProcedure(MODULE)
      .input(atualizarAnaliseContextoAcaoSchema)
      .mutation(({ input }) => service.atualizarAcao(input)),

    concluirAcao: writeProcedure(MODULE)
      .input(concluirAnaliseContextoAcaoSchema)
      .mutation(({ input, ctx }) => service.concluirAcao(input, ctx.userId)),

    excluirAcao: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.excluirAcao(input.id)),

    listarUsuarios: readProcedure(MODULE)
      .query(({ ctx }) => service.listarUsuarios(ctx.empresaId)),
  })
}
