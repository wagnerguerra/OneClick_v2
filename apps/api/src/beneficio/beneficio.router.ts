import { z } from 'zod'
import { router, readProcedure, writeSubProcedure } from '../trpc/trpc.service'
import { salvarBeneficioConfigSchema } from '@saas/types'
import { BeneficioService } from './beneficio.service'

const MODULE = 'beneficios'

export function createBeneficioRouter(beneficioService: BeneficioService) {
  return router({
    listEmpresas: readProcedure(MODULE)
      .query(({ ctx }) => beneficioService.listEmpresas(ctx.empresaId, ctx.isMaster)),

    getConfig: readProcedure(MODULE)
      .input(z.object({ empresaId: z.string() }))
      .query(({ input }) => beneficioService.getConfig(input.empresaId)),

    saveConfig: writeSubProcedure(MODULE, 'gerir_beneficios', 'Gerir benefícios')
      .input(salvarBeneficioConfigSchema)
      .mutation(({ input }) => beneficioService.saveConfig(input)),
  })
}
