import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { criarMelhoriaSchema, atualizarMelhoriaSchema, listarMelhoriasSchema } from '@saas/types'
import { MelhoriaService } from './melhoria.service'

const MODULE = 'melhorias'

// Sem sub-permissoes de proposito: o v1 nao tinha niveis e o modulo e pequeno.
// Leitura/escrita/exclusao seguem as permissoes do proprio modulo.
export function createMelhoriaRouter(service: MelhoriaService) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarMelhoriasSchema)
      .query(({ input, ctx }) => service.listar(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    listarComprasMelhoria: readProcedure(MODULE)
      .query(({ ctx }) => service.listarComprasMelhoria(ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarMelhoriaSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarMelhoriaSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    listarAreas: readProcedure(MODULE)
      .query(({ ctx }) => service.listarAreas(ctx.empresaId)),
  })
}
