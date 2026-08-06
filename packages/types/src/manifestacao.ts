import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Manifestações da Qualidade — elogio, reclamação e sugestão.
 *
 * Os três compartilham a estrutura e se distinguem pelo `tipo`. O que muda de
 * verdade é o fluxo: elogio e sugestão nascem e são respondidos; reclamação
 * passa por retorno ao cliente, análise de procedência e encerramento.
 */

export const manifestacaoTipoSchema = z.enum(['ELOGIO', 'RECLAMACAO', 'SUGESTAO'])
export type ManifestacaoTipo = z.infer<typeof manifestacaoTipoSchema>

/** De que lado partiu — a novidade em relação ao legado, onde cada tipo tinha um lado só. */
export const manifestacaoOrigemSchema = z.enum(['INTERNA', 'CLIENTE'])

export const manifestacaoCanalSchema = z.enum([
  'TELEFONE', 'EMAIL', 'WHATSAPP', 'PRESENCIAL', 'SITE', 'OUTRO',
])

/**
 * Situações possíveis.
 *
 * Elogio e sugestão usam RECEBIDA → RESPONDIDA → ENCERRADA. Reclamação usa os
 * cinco do legado, com NAO_PROCEDENTE como saída lateral.
 */
export const manifestacaoStatusSchema = z.enum([
  'RECEBIDA',
  'RESPONDIDA',
  'ENCERRADA',
  'AGUARDANDO_RETORNO',
  'AGUARDANDO_ANALISE',
  'REGISTRAR_EFICACIA',
  'NAO_PROCEDENTE',
  'FINALIZADA',
])

export const criarManifestacaoSchema = z.object({
  tipo: manifestacaoTipoSchema,
  origem: manifestacaoOrigemSchema.default('INTERNA'),
  /**
   * Anônima não guarda autor — nem para consulta interna. Quem registra leva o
   * protocolo e acompanha por ele.
   */
  anonima: z.boolean().default(false),

  clienteId: z.string().optional().nullable(),
  informanteNome: z.string().max(160).optional().nullable(),
  informanteEmail: z.string().email().optional().nullable().or(z.literal('')),
  informanteTelefone: z.string().max(40).optional().nullable(),
  canal: manifestacaoCanalSchema.optional().nullable(),

  areaId: z.string().optional().nullable(),
  elogiadosIds: z.array(z.string()).default([]),
  titulo: z.string().max(200).optional().nullable(),
  descricao: z.string().min(3, 'Descreva o que aconteceu.'),
  dataOcorrido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  /** Sugestão: pedir que apareça no mural para todos. */
  publica: z.boolean().default(false),
})

export const atualizarManifestacaoSchema = criarManifestacaoSchema.partial().extend({
  id: z.string().min(1),
})

export const listarManifestacoesSchema = paginationSchema.extend({
  tipo: manifestacaoTipoSchema.optional(),
  status: manifestacaoStatusSchema.optional(),
  origem: manifestacaoOrigemSchema.optional(),
  areaId: z.string().optional(),
  clienteId: z.string().optional(),
  /** Só as minhas — o padrão de quem não tem permissão de ver todas. */
  somenteMinhas: z.coerce.boolean().optional(),
})

/** Resposta da Qualidade (elogio e sugestão). */
export const responderManifestacaoSchema = z.object({
  id: z.string().min(1),
  resposta: z.string().min(1),
  encerrar: z.boolean().default(true),
})

export type CriarManifestacaoInput = z.infer<typeof criarManifestacaoSchema>
export type AtualizarManifestacaoInput = z.infer<typeof atualizarManifestacaoSchema>
export type ListarManifestacoesInput = z.infer<typeof listarManifestacoesSchema>
export type ResponderManifestacaoInput = z.infer<typeof responderManifestacaoSchema>
