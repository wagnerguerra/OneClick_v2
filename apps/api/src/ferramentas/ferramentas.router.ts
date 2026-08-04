import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, readProcedureAnyOf, readProcedure } from '../trpc/trpc.service'
import { listToolJobsSchema } from '@saas/types'
import { FerramentasService } from './ferramentas.service'
import { HtmlPdfService } from './html-pdf.service'
import { JuntarPdfService } from './juntar-pdf.service'
import { AssinaturaPdfService } from './assinatura-pdf.service'

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
/** PDF pesa mais que HTML; o teto acompanha. */
const LIMITE_PDF_MB = 60

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

export function createFerramentasRouter(
  service: FerramentasService,
  htmlPdf?: HtmlPdfService,
  juntarPdf?: JuntarPdfService,
  assinatura?: AssinaturaPdfService,
) {
  const pdf = () => {
    if (!htmlPdf) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
    return htmlPdf
  }
  const assinar = () => {
    if (!assinatura) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
    return assinatura
  }
  const merge = () => {
    if (!juntarPdf) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Serviço indisponível.' })
    return juntarPdf
  }

  return router({
    // ── HTML → PDF ──
    htmlParaPdf: readProcedure(SLUG_GERAIS)
      .input(z.object({ arquivos: z.array(arquivoHtmlSchema).min(1) }))
      .mutation(({ input }) => {
        validarLote(input.arquivos)
        return pdf().converter(input.arquivos)
      }),

    /** Certificados A1 disponíveis para assinar. */
    certificadosParaAssinar: readProcedure(SLUG_GERAIS)
      .query(({ ctx }) => assinar().listarCertificados(ctx.empresaId ?? null)),

    /**
     * Assina um PDF com o certificado escolhido, carimbando a área indicada.
     * A área vem em pontos PDF, com origem no canto inferior esquerdo — a
     * conversão da tela para essa medida é feita no navegador, onde se sabe a
     * escala em que a página foi desenhada.
     */
    assinarPdf: readProcedure(SLUG_GERAIS)
      .input(z.object({
        nome: z.string().min(1).max(255),
        pdfBase64: z.string().min(1),
        certificadoId: z.string().min(1),
        area: z.object({
          pagina: z.number().int().min(1),
          x: z.number(),
          y: z.number(),
          largura: z.number().positive(),
          altura: z.number().positive(),
        }).optional(),
        motivo: z.string().max(200).optional(),
        local: z.string().max(120).optional(),
      }))
      .mutation(({ input, ctx }) => {
        const mb = input.pdfBase64.length / (1024 * 1024)
        if (mb > LIMITE_PDF_MB) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `O arquivo passa de ${LIMITE_PDF_MB} MB.` })
        }
        return assinar().assinar({ ...input, empresaId: ctx.empresaId ?? null })
      }),

    /** Junta PDFs na ORDEM recebida — quem ordena é a tela. */
    juntarPdf: readProcedure(SLUG_GERAIS)
      .input(z.object({
        arquivos: z.array(z.object({
          nome: z.string().min(1).max(255),
          base64: z.string().min(1),
        })).min(2),
        nome: z.string().min(1).max(255).optional(),
      }))
      .mutation(({ input }) => {
        // Base64 infla ~33%: o teto olha o tamanho real, não o do arquivo.
        const mb = input.arquivos.reduce((s, a) => s + a.base64.length, 0) / (1024 * 1024)
        if (input.arquivos.length > LIMITE_ARQUIVOS) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Envie no máximo ${LIMITE_ARQUIVOS} arquivos por vez.` })
        }
        if (mb > LIMITE_PDF_MB) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `O conjunto passa de ${LIMITE_PDF_MB} MB. Divida em lotes menores.` })
        }
        return merge().juntar(input.arquivos, input.nome ?? 'Documento unificado')
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
