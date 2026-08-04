import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, readProcedureAnyOf, readProcedure } from '../trpc/trpc.service'
import { listToolJobsSchema } from '@saas/types'
import { FerramentasService } from './ferramentas.service'
import { HtmlPdfService } from './html-pdf.service'

// tRPC SÓ-LEITURA do histórico de jobs (+ lixeira/restore). Upload/status/download
// ficam no controller REST (multipart). Gateado por qualquer área de ferramentas;
// o service ainda escopa por empresa/tenant. Ver docs/plano-ferramentas.md §Fase 1 passo 6.
const SLUGS = ['ferramentas-fiscal', 'ferramentas-contabil']

/**
 * Utilitários de uso geral (HTML → PDF), sob o módulo `ferramentas-gerais`.
 *
 * Não tocam em dado de cliente — o conteúdo vem do próprio usuário e some
 * depois da conversão —, mas consomem CPU do servidor, e por isso quem usa
 * precisa estar liberado como em qualquer outro módulo.
 *
 * Teto por requisição: converter é caro, e um envio absurdo derrubaria a API.
 */
const SLUG_GERAIS = 'ferramentas-gerais'

const LIMITE_ARQUIVOS = 30
const LIMITE_TOTAL_MB = 20

const arquivoHtmlSchema = z.object({
  nome: z.string().min(1).max(255),
  conteudo: z.string().min(1),
})

/** Recusa cedo o que não caberia — melhor um erro claro que um tempo esgotado. */
function validarLote(arquivos: Array<{ conteudo: string }>) {
  if (arquivos.length > LIMITE_ARQUIVOS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Envie no máximo ${LIMITE_ARQUIVOS} arquivos por vez.` })
  }
  const mb = arquivos.reduce((s, a) => s + a.conteudo.length, 0) / (1024 * 1024)
  if (mb > LIMITE_TOTAL_MB) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `O conjunto passa de ${LIMITE_TOTAL_MB} MB. Divida em lotes menores.` })
  }
}

export function createFerramentasRouter(service: FerramentasService, htmlPdf?: HtmlPdfService) {
  const pdf = () => {
    if (!htmlPdf) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
    return htmlPdf
  }

  return router({
    // ── HTML → PDF ──
    htmlParaPdf: readProcedure(SLUG_GERAIS)
      .input(z.object({ arquivos: z.array(arquivoHtmlSchema).min(1) }))
      .mutation(({ input }) => {
        validarLote(input.arquivos)
        return pdf().converter(input.arquivos)
      }),

    htmlParaPdfUnico: readProcedure(SLUG_GERAIS)
      .input(z.object({
        arquivos: z.array(arquivoHtmlSchema).min(1),
        nome: z.string().min(1).max(255).optional(),
      }))
      .mutation(({ input }) => {
        validarLote(input.arquivos)
        return pdf().consolidar(input.arquivos, input.nome ?? 'Consolidado')
      }),

    list: readProcedureAnyOf(...SLUGS)
      .input(listToolJobsSchema)
      .query(({ input, ctx }) => service.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedureAnyOf(...SLUGS)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listTrash: readProcedureAnyOf(...SLUGS)
      .input(listToolJobsSchema)
      .query(({ input, ctx }) => service.listTrash(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    restore: readProcedureAnyOf(...SLUGS)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        service.restore(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.userId, ctx.tenantSchema),
      ),

    remove: readProcedureAnyOf(...SLUGS)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        service.delete(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.userId, ctx.tenantSchema),
      ),
  })
}
