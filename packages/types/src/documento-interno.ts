import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Documentos Internos da Qualidade — port do `sgq_documentos` do OneClick v1.
 *
 * A ideia central: o documento é UM registro, e as revisões penduram nele. No
 * v1 cada revisão era uma linha nova que repetia nome, tipo e processo.
 * Ver docs/migracao-documentos-internos-v1.md.
 */

// O tipo do documento (Procedimento, Formulário, Doc Corporativo…) é CADASTRO,
// e não lista fixa: a relação cresce e o pessoal acrescenta sem passar por
// deploy. Por isso ele entra e sai daqui como `tipoId`.

/**
 * Situações do `sgq_doc_sit`. "Excluído" de lá não entra: no v1 ele convivia
 * com o `ativo = 0` para dizer a mesma coisa, e documento apagado aqui some.
 */
export const documentoSituacaoSchema = z.enum([
  'NOVO', 'EM_APROVACAO', 'APROVADO', 'SUBSTITUIDO', 'CANCELADO', 'REJEITADO',
])
export type DocumentoSituacao = z.infer<typeof documentoSituacaoSchema>

export const DOCUMENTO_SITUACAO_LABEL: Record<DocumentoSituacao, string> = {
  NOVO: 'Novo',
  EM_APROVACAO: 'Em Aprovação',
  APROVADO: 'Aprovado',
  SUBSTITUIDO: 'Substituído',
  CANCELADO: 'Cancelado',
  REJEITADO: 'Rejeitado',
}

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

/**
 * Elaborador: colaborador por ID; nome só quando não há usuário a apontar —
 * é o resíduo do `varchar` com nomes separados por vírgula do v1.
 */
export const documentoElaboradorSchema = z.object({
  usuarioId: z.string().optional().nullable(),
  nome: z.string().max(160).optional().nullable(),
}).refine(
  e => Boolean(e.usuarioId) || Boolean(e.nome?.trim()),
  { message: 'Informe o colaborador ou o nome.' },
)

/** Arquivo de uma revisão — vem do upload, que já devolve a URL. */
export const documentoArquivoSchema = z.object({
  arquivoPath: z.string().min(1, 'Envie o arquivo da revisão.'),
  arquivoNome: z.string().max(255).optional().nullable(),
  mime: z.string().max(160).optional().nullable(),
  bytes: z.number().int().nonnegative().optional().nullable(),
})

export const criarDocumentoSchema = z.object({
  nome: z.string().min(3, 'Dê um nome ao documento.').max(200),
  tipoId: z.string().optional().nullable(),
  processoId: z.string().optional().nullable(),

  // ── Primeira revisão, criada junto com o documento ──
  dataVersao: dataISO,
  alteracao: z.string().optional().nullable(),
  justificativa: z.string().optional().nullable(),
  elaboradores: z.array(documentoElaboradorSchema).default([]),
}).merge(documentoArquivoSchema)

/**
 * Edita só o CABEÇALHO do documento (nome, tipo, processo).
 *
 * O conteúdo de uma revisão não se reescreve: mudou o documento, publica-se uma
 * revisão nova. É a regra do Wagner e o que a ISO espera — corrigir por baixo
 * apagaria a rastreabilidade de quem aprovou o quê.
 */
export const atualizarDocumentoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(3).max(200).optional(),
  tipoId: z.string().optional().nullable(),
  processoId: z.string().optional().nullable(),
})

/**
 * Nova revisão: entra como vigente e empurra a anterior para "Substituído".
 * O número da revisão é do backend — deixar o cliente escolher abriria buraco
 * de numeração repetida.
 */
export const novaRevisaoSchema = z.object({
  documentoId: z.string().min(1),
  dataVersao: dataISO,
  alteracao: z.string().optional().nullable(),
  justificativa: z.string().optional().nullable(),
  elaboradores: z.array(documentoElaboradorSchema).default([]),
}).merge(documentoArquivoSchema)

export const listarDocumentosSchema = paginationSchema.extend({
  tipoId: z.string().optional(),
  processoId: z.string().optional(),
  situacao: documentoSituacaoSchema.optional(),
})

export const aprovarRevisaoSchema = z.object({
  versaoId: z.string().min(1),
  /** Rejeitar exige dizer por quê — sem isso quem elaborou não sabe o que corrigir. */
  aprovar: z.boolean(),
  observacao: z.string().max(4000).optional().nullable(),
}).refine(
  v => v.aprovar || Boolean(v.observacao?.trim()),
  { message: 'Diga o motivo da rejeição.', path: ['observacao'] },
)

/** Cadastro de tipo — mesmo formato do processo. */
export const documentoTipoInputSchema = z.object({
  nome: z.string().min(2).max(160),
  ordem: z.number().int().nonnegative().default(0),
  ativo: z.boolean().default(true),
})

export const documentoProcessoSchema = z.object({
  nome: z.string().min(2).max(160),
  ordem: z.number().int().nonnegative().default(0),
  ativo: z.boolean().default(true),
})

export type CriarDocumentoInput = z.infer<typeof criarDocumentoSchema>
export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>
export type NovaRevisaoInput = z.infer<typeof novaRevisaoSchema>
export type ListarDocumentosInput = z.infer<typeof listarDocumentosSchema>
export type AprovarRevisaoInput = z.infer<typeof aprovarRevisaoSchema>
export type DocumentoProcessoInput = z.infer<typeof documentoProcessoSchema>
export type DocumentoTipoInput = z.infer<typeof documentoTipoInputSchema>
