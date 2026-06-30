import { z } from 'zod'
import { router, readProcedure, readSubAnyProcedure, writeSubProcedure, publicProcedure } from '../trpc/trpc.service'
import { salvarFunilConfigSchema } from '@saas/types'
import { LeadService } from './lead.service'

const MODULE = 'crm' // sub-permissões acessar_funil_lead / gerir_funil_lead vivem no módulo CRM
// Acessar o funil exige a sub-permissão de acesso (quem pode configurar também acessa).
const ACESSO_FUNIL = ['acessar_funil_lead', 'gerir_funil_lead']

export function createLeadRouter(leadService: LeadService) {
  return router({
    getConfig: readSubAnyProcedure(MODULE, ACESSO_FUNIL, 'Acessar funil de captação')
      .input(z.object({ slug: z.string().nullable().optional() }).optional())
      .query(({ ctx, input }) => leadService.getConfig(ctx.empresaId, input?.slug ?? null)),

    listConfigs: readSubAnyProcedure(MODULE, ACESSO_FUNIL, 'Acessar funil de captação')
      .query(({ ctx }) => leadService.listConfigs(ctx.empresaId)),

    saveConfig: writeSubProcedure(MODULE, 'gerir_funil_lead', 'Configurar funil de leads')
      .input(salvarFunilConfigSchema)
      .mutation(({ input, ctx }) => leadService.saveConfig(input, ctx.empresaId)),

    deleteConfig: writeSubProcedure(MODULE, 'gerir_funil_lead', 'Configurar funil de leads')
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => leadService.deleteConfig(input.id, ctx.empresaId)),

    listSessoes: readSubAnyProcedure(MODULE, ACESSO_FUNIL, 'Acessar funil de captação')
      .query(({ ctx }) => leadService.listSessoes(ctx.empresaId)),

    conversaOportunidade: readProcedure(MODULE)
      .input(z.object({ oportunidadeId: z.string() }))
      .query(({ input, ctx }) => leadService.conversaPorOportunidade(input.oportunidadeId, ctx.empresaId)),

    reportFunil: readSubAnyProcedure(MODULE, ACESSO_FUNIL, 'Acessar funil de captação')
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
