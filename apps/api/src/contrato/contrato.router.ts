import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure, protectedProcedure, publicProcedure } from '../trpc/trpc.service'
import {
  createClausulaSchema,
  updateClausulaSchema,
  createContratoTemplateSchema,
  updateContratoTemplateSchema,
  setTemplateClausulasSchema,
  setServicoClausulasSchema,
  createContratoSchema,
  updateContratoSchema,
  assinarWebPkiSchema,
  aceitarPropostaSchema,
  contratoStatusSchema,
} from '@saas/types'
import { ContratoService } from './contrato.service'

const MODULE = 'contratos'

export function createContratoRouter(svc: ContratoService) {
  return router({
    // ── Cláusulas ──────────────────────────────────────────
    listClausulas: readProcedure(MODULE)
      .input(z.object({ includeAllVersions: z.boolean().optional(), categoria: z.string().optional() }).optional())
      .query(({ input, ctx }) => svc.listClausulas({ ...input, empresaId: ctx.empresaId })),

    listClausulaVersoes: readProcedure(MODULE)
      .input(z.object({ codigo: z.string() }))
      .query(({ input }) => svc.listClausulaVersoes(input.codigo)),

    getClausula: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getClausula(input.id)),

    createClausula: writeProcedure(MODULE)
      .input(createClausulaSchema)
      .mutation(({ input, ctx }) => svc.createClausula(input, ctx.empresaId)),

    updateClausula: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateClausulaSchema }))
      .mutation(({ input }) => svc.updateClausula(input.id, input.data)),

    publicarClausula: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.publicarClausula(input.id)),

    deleteClausula: deleteProcedure(MODULE)
      .input(z.object({ codigo: z.string() }))
      .mutation(({ input }) => svc.deleteClausula(input.codigo)),

    // ── Templates ──────────────────────────────────────────
    listTemplates: readProcedure(MODULE)
      .query(({ ctx }) => svc.listTemplates(ctx.empresaId)),

    getTemplate: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getTemplate(input.id)),

    createTemplate: writeProcedure(MODULE)
      .input(createContratoTemplateSchema)
      .mutation(({ input, ctx }) => svc.createTemplate(input, ctx.empresaId)),

    updateTemplate: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateContratoTemplateSchema }))
      .mutation(({ input }) => svc.updateTemplate(input.id, input.data)),

    deleteTemplate: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.deleteTemplate(input.id)),

    duplicateTemplate: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), nome: z.string().optional() }))
      .mutation(({ input, ctx }) => svc.duplicateTemplate(input.id, { nome: input.nome, empresaId: ctx.empresaId })),

    setTemplateClausulas: writeProcedure(MODULE)
      .input(setTemplateClausulasSchema)
      .mutation(({ input }) => svc.setTemplateClausulas(input.templateId, input.clausulas)),

    // ── Servico ↔ Cláusulas ────────────────────────────────
    getServicoClausulas: readProcedure(MODULE)
      .input(z.object({ servicoId: z.string() }))
      .query(({ input }) => svc.getServicoClausulas(input.servicoId)),

    setServicoClausulas: writeProcedure(MODULE)
      .input(setServicoClausulasSchema)
      .mutation(({ input }) => svc.setServicoClausulas(input.servicoId, input.codigos)),

    // ── Contratos ──────────────────────────────────────────
    listContratos: readProcedure(MODULE)
      .input(z.object({ status: z.string().optional(), clienteId: z.string().optional() }).optional())
      .query(({ input, ctx }) => svc.listContratos({ ...input, empresaId: ctx.empresaId })),

    // Relatorio consolidado p/ o Painel de Gestao a Vista (comercial)
    reportComercial: readProcedure(MODULE)
      .query(({ ctx }) => svc.reportComercial(ctx.empresaId)),

    getContrato: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => svc.getContrato(input.id)),

    createContrato: writeProcedure(MODULE)
      .input(createContratoSchema)
      .mutation(({ input, ctx }) => svc.createContrato(input, ctx.empresaId)),

    updateContrato: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateContratoSchema }))
      .mutation(({ input }) => svc.updateContrato(input.id, input.data)),

    changeStatus: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), status: contratoStatusSchema, motivo: z.string().optional() }))
      .mutation(({ input, ctx }) => svc.changeContratoStatus(input.id, input.status, { userId: ctx.userId, motivo: input.motivo })),

    // ── PDF ────────────────────────────────────────────────
    gerarPdf: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => svc.gerarPdf(input.id)),

    // ── Assinaturas ────────────────────────────────────────
    // Server-side (recomendada para CONTRATADA): backend assina com cert
    // da empresa cadastrado em CERTIFICADO_PATH/CERTIFICADO_SENHA.
    assinarServerSide: writeProcedure(MODULE)
      .input(z.object({ contratoId: z.string(), parte: z.enum(['CONTRATADA', 'CONTRATANTE']) }))
      .mutation(({ input, ctx }) => svc.assinarServerSide(input.contratoId, input.parte, { ip: (ctx as any).ip, userAgent: (ctx as any).userAgent })),

    assinarWebPki: writeProcedure(MODULE)
      .input(assinarWebPkiSchema)
      .mutation(({ input, ctx }) => svc.assinarWebPki(input, { ip: (ctx as any).ip, userAgent: (ctx as any).userAgent })),

    // Versão pública (cliente assinando via token — sem login)
    assinarWebPkiPublico: publicProcedure
      .input(assinarWebPkiSchema.extend({ contratoToken: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const c = await svc.getContratoByToken(input.contratoToken)
        if (c.id !== input.contratoId) {
          throw new Error('Token não confere com contrato')
        }
        // Força parte = CONTRATANTE (cliente assinando)
        return svc.assinarWebPki({ ...input, parte: 'CONTRATANTE' }, { ip: (ctx as any).ip, userAgent: (ctx as any).userAgent })
      }),

    // gov.br: gera URL de autorização (frontend redireciona usuário pra ela).
    iniciarAssinaturaGovbr: protectedProcedure
      .input(z.object({ contratoId: z.string(), parte: z.enum(['CONTRATADA', 'CONTRATANTE']) }))
      .mutation(({ input }) => svc.iniciarAssinaturaGovbr(input.contratoId, input.parte)),

    // Versão pública (cliente assinando via token — sem login)
    iniciarAssinaturaGovbrPublico: publicProcedure
      .input(z.object({ contratoToken: z.string() }))
      .mutation(async ({ input }) => {
        const c = await svc.getContratoByToken(input.contratoToken)
        return svc.iniciarAssinaturaGovbr(c.id, 'CONTRATANTE')
      }),

    // Callback do gov.br após autorização (controller HTTP processa o redirect
    // e este endpoint valida o code).
    processarCallbackGovbr: publicProcedure
      .input(z.object({ code: z.string(), state: z.string() }))
      .mutation(({ input, ctx }) => svc.callbackAssinaturaGovbr(input.code, input.state, { ip: (ctx as any).ip, userAgent: (ctx as any).userAgent })),

    // SerproID: gera URL de autorização (CONTRATADA, dashboard).
    iniciarAssinaturaSerproId: protectedProcedure
      .input(z.object({ contratoId: z.string(), parte: z.enum(['CONTRATADA', 'CONTRATANTE']) }))
      .mutation(({ input }) => svc.iniciarAssinaturaSerproId(input.contratoId, input.parte)),

    // SerproID: gera URL de autorização (CONTRATANTE, página pública).
    iniciarAssinaturaSerproIdPublico: publicProcedure
      .input(z.object({ contratoToken: z.string() }))
      .mutation(async ({ input }) => {
        const c = await svc.getContratoByToken(input.contratoToken)
        return svc.iniciarAssinaturaSerproId(c.id, 'CONTRATANTE')
      }),

    // SerproID: processa o callback após autorização.
    processarCallbackSerproId: publicProcedure
      .input(z.object({ code: z.string(), state: z.string() }))
      .mutation(({ input, ctx }) => svc.callbackAssinaturaSerproId(input.code, input.state, { ip: (ctx as any).ip, userAgent: (ctx as any).userAgent })),

    // Endpoint público (cliente acessa via token, sem login)
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => svc.getContratoByToken(input.token)),

    aceitarProposta: publicProcedure
      .input(aceitarPropostaSchema)
      .mutation(({ input, ctx }) =>
        svc.aceitarProposta(input.contratoToken, input.signatarioNome, input.signatarioDoc, {
          email: input.signatarioEmail || undefined,
          ip: (ctx as any).ip,
          userAgent: (ctx as any).userAgent,
        }),
      ),

    // Validação pública por hash de PDF
    validarPorHash: publicProcedure
      .input(z.object({ hashPdf: z.string() }))
      .query(({ input }) => svc.validarPorHash(input.hashPdf)),
  })
}
