import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Agenda de Contatos — port do `ger_age` do v1 (módulo crp_contatos).
 * Uma entrada tem nome + 1..N pessoas (o v1 tinha 3 blocos fixos de
 * nome/telefone/e-mail) e pode ser privada (só o dono e o master veem).
 */
export const contatoPessoaSchema = z.object({
  id: z.string().optional(),
  nome: z.string().max(160).nullable().optional(),
  telefone: z.string().max(60).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
})

export const criarContatoSchema = z.object({
  nome: z.string().min(1, 'Informe o nome').max(200),
  observacoes: z.string().max(4000).nullable().optional(),
  privado: z.boolean().optional(),
  pessoas: z.array(contatoPessoaSchema).max(20).optional(),
})

export const atualizarContatoSchema = criarContatoSchema.partial().extend({
  id: z.string().min(1),
})

export const excluirContatoSchema = z.object({ id: z.string().min(1) })

export const listarContatosSchema = paginationSchema.extend({
  /** Só os meus contatos privados. */
  somentePrivados: z.boolean().optional(),
  /** Inclui os excluídos (ativo = false). */
  incluirInativos: z.boolean().optional(),
})

export type ContatoPessoaInput = z.infer<typeof contatoPessoaSchema>
export type CriarContatoInput = z.infer<typeof criarContatoSchema>
export type AtualizarContatoInput = z.infer<typeof atualizarContatoSchema>
export type ExcluirContatoInput = z.infer<typeof excluirContatoSchema>
export type ListarContatosInput = z.infer<typeof listarContatosSchema>
