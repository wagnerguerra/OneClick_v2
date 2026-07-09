import {
  reformaDiagnosticoSchema,
  reformaListClientesSchema,
  reformaSimulacaoSchema,
} from '@saas/types'
import { readProcedure, router } from '../trpc/trpc.service'
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
  })
}
