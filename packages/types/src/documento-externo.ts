import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Documentos Externos da Qualidade — port do `sgq_externos` do OneClick v1.
 * Normas, leis e documentos de terceiros controlados pelo SGQ, versionados
 * como os Documentos Internos: mudou a norma, publica-se revisão nova.
 */

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

/** O conteúdo de cada revisão: de onde vem e onde mora o documento. */
export const documentoExternoCamposSchema = z.object({
  emissor: z.string().max(255).optional().nullable(),
  local: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
})

export const criarDocumentoExternoSchema = z.object({
  nome: z.string().min(3, 'Dê um nome ao documento.').max(255),
  processoId: z.string().optional().nullable(),
  dataRegistro: dataISO,
}).merge(documentoExternoCamposSchema)

/** Só o cabeçalho: o conteúdo de uma revisão não se reescreve. */
export const atualizarDocumentoExternoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(3).max(255).optional(),
  processoId: z.string().optional().nullable(),
})

/** Nova revisão — numera no backend (última + 1). */
export const novaRevisaoDocumentoExternoSchema = z.object({
  documentoId: z.string().min(1),
  dataRegistro: dataISO,
}).merge(documentoExternoCamposSchema)

export const listarDocumentosExternosSchema = paginationSchema.extend({
  processoId: z.string().optional(),
})

export type CriarDocumentoExternoInput = z.infer<typeof criarDocumentoExternoSchema>
export type AtualizarDocumentoExternoInput = z.infer<typeof atualizarDocumentoExternoSchema>
export type NovaRevisaoDocumentoExternoInput = z.infer<typeof novaRevisaoDocumentoExternoSchema>
export type ListarDocumentosExternosInput = z.infer<typeof listarDocumentosExternosSchema>
