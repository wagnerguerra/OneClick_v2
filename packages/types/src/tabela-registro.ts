import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Tabelas de Registros da Qualidade — port do `sgq_tabelas` do OneClick v1.
 *
 * O controle de registros da ISO: para cada registro, como é armazenado,
 * protegido, recuperado, por quanto tempo retido e o que se faz ao descartar.
 * Versionado como Documentos Internos: mudou o controle, publica-se versão.
 */

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

/** Os cinco campos clássicos do controle — HTML do RichEditor. */
export const tabelaCamposSchema = z.object({
  armazenamento: z.string().optional().nullable(),
  protecao: z.string().optional().nullable(),
  recuperacao: z.string().optional().nullable(),
  retencao: z.string().optional().nullable(),
  disposicao: z.string().optional().nullable(),
})

export const criarTabelaRegistroSchema = z.object({
  nome: z.string().min(3, 'Dê um nome ao registro.').max(200),
  processoId: z.string().optional().nullable(),
  dataVersao: dataISO,
}).merge(tabelaCamposSchema)

/** Só o cabeçalho: o conteúdo de uma versão não se reescreve. */
export const atualizarTabelaRegistroSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(3).max(200).optional(),
  processoId: z.string().optional().nullable(),
})

/** Nova versão do controle — numera no backend (última + 1). */
export const novaVersaoTabelaSchema = z.object({
  tabelaId: z.string().min(1),
  dataVersao: dataISO,
}).merge(tabelaCamposSchema)

export const listarTabelasRegistroSchema = paginationSchema.extend({
  processoId: z.string().optional(),
})

export type CriarTabelaRegistroInput = z.infer<typeof criarTabelaRegistroSchema>
export type AtualizarTabelaRegistroInput = z.infer<typeof atualizarTabelaRegistroSchema>
export type NovaVersaoTabelaInput = z.infer<typeof novaVersaoTabelaSchema>
export type ListarTabelasRegistroInput = z.infer<typeof listarTabelasRegistroSchema>
