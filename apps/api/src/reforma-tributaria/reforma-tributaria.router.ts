import {
  reformaDiagnosticoSchema,
  reformaListClientesSchema,
  reformaSimulacaoSchema,
} from '@saas/types'
import { z } from 'zod'
import { deleteProcedure, readProcedure, router, writeProcedure } from '../trpc/trpc.service'
import { ReformaTributariaService } from './reforma-tributaria.service'

const MODULE = 'reforma-tributaria'

export function createReformaTributariaRouter(service: ReformaTributariaService) {
  return router({
    dashboard: readProcedure(MODULE)
      .query(({ ctx }) => service.dashboard(ctx.empresaId)),

    clientes: readProcedure(MODULE)
      .input(reformaListClientesSchema.optional())
      .query(({ input, ctx }) => service.listarClientes(input ?? {}, ctx.empresaId)),

    diagnostico: readProcedure(MODULE)
      .input(reformaDiagnosticoSchema)
      .query(({ input, ctx }) => service.diagnostico(input, ctx.empresaId)),

    simular: readProcedure(MODULE)
      .input(reformaSimulacaoSchema)
      .query(({ input, ctx }) => service.simular(input, ctx.empresaId)),

    historico: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string().min(1) }))
      .query(({ input, ctx }) => service.historico(input.clienteId, ctx.empresaId)),

    salvar: writeProcedure(MODULE)
      .input(reformaSimulacaoSchema)
      .mutation(({ input, ctx }) => service.salvar(input, ctx.userId ?? null, ctx.empresaId)),

    remover: deleteProcedure(MODULE)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(({ input, ctx }) => service.remover(input.id, ctx.empresaId)),
  })
}
