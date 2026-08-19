import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  criarDocumentoExternoSchema, atualizarDocumentoExternoSchema,
  novaRevisaoDocumentoExternoSchema, listarDocumentosExternosSchema,
} from '@saas/types'
import { DocumentoExternoService } from './documento-externo.service'

const MODULE = 'documentos-externos'

// Sem sub-permissões: o v1 não tinha níveis neste módulo.
export function createDocumentoExternoRouter(service: DocumentoExternoService) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarDocumentosExternosSchema)
      .query(({ input, ctx }) => service.listar(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarDocumentoExternoSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarDocumentoExternoSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.empresaId)),

    novaRevisao: writeProcedure(MODULE)
      .input(novaRevisaoDocumentoExternoSchema)
      .mutation(({ input, ctx }) => service.novaRevisao(input, ctx.userId, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.empresaId)),

    listarProcessos: readProcedure(MODULE)
      .query(({ ctx }) => service.listarProcessos(ctx.empresaId)),

    listarUsuarios: readProcedure(MODULE)
      .query(({ ctx }) => service.listarUsuarios(ctx.empresaId)),
  })
}
