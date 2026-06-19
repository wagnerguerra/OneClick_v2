import { z } from 'zod'
import { router, readProcedure, writeSubProcedure, publicProcedure } from '../trpc/trpc.service'
import { salvarFunilConfigSchema } from '@saas/types'
import { LeadService } from './lead.service'

const MODULE = 'crm' // sub-permissão gerir_funil_lead vive no módulo CRM

export function createLeadRouter(leadService: LeadService) {
  return router({
    getConfig: readProcedure(MODULE)
      .query(({ ctx }) => leadService.getConfig(ctx.empresaId)),

    saveConfig: writeSubProcedure(MODULE, 'gerir_funil_lead', 'Configurar funil de leads')
      .input(salvarFunilConfigSchema)
      .mutation(({ input, ctx }) => leadService.saveConfig(input, ctx.empresaId)),

    listSessoes: readProcedure(MODULE)
      .query(({ ctx }) => leadService.listSessoes(ctx.empresaId)),

    conversaOportunidade: readProcedure(MODULE)
      .input(z.object({ oportunidadeId: z.string() }))
      .query(({ input, ctx }) => leadService.conversaPorOportunidade(input.oportunidadeId, ctx.empresaId)),

    reportFunil: readProcedure(MODULE)
      .input(z.object({ dias: z.number().int().nullable().optional() }))
      .query(({ input, ctx }) => leadService.reportFunil(input.dias ?? null, ctx.empresaId)),

    // Público (página de atendimento)
    getConfigPublica: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => leadService.getConfigPublica(input.slug)),

    sugestoesHorario: publicProcedure
      .input(z.object({}).nullish())
      .query(() => leadService.sugestoesHorario()),
  })
}
