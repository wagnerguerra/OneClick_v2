import { z } from 'zod'
import { paginationSchema } from './pagination'

// ── Etapas do Pipeline ──────────────────────────────────────

export const updateCrmEtapaSchema = z.object({
  nome: z.string().min(1).optional(),
  cor: z.string().optional(),
  probabilidade: z.number().min(0).max(100).optional(),
  ordem: z.number().optional(),
  slaDias: z.number().min(1).nullable().optional(),
})

export type UpdateCrmEtapaInput = z.infer<typeof updateCrmEtapaSchema>

// ── Oportunidades ───────────────────────────────────────────

export const createOportunidadeSchema = z.object({
  titulo: z.string().min(1, 'Titulo e obrigatorio'),
  /** Na tela: "Perfil do Lead". O nome da coluna ficou por compatibilidade. */
  descricao: z.string().optional().nullable(),
  /** Na tela: "Dores / Oportunidades". */
  doresOportunidades: z.string().optional().nullable(),
  valor: z.coerce.number().min(0).optional().nullable(),
  etapaId: z.string().min(1, 'Etapa e obrigatoria'),
  clienteId: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  previsaoFechamento: z.string().optional().nullable(),
  origem: z.string().optional().nullable(),
  atividade: z.string().optional().nullable(),
  cpfCnpj: z.string().optional().nullable(),
  razaoSocial: z.string().optional().nullable(),
  nomeFantasia: z.string().optional().nullable(),
  cnaeCodigo: z.string().optional().nullable(),
  cnaeDescricao: z.string().optional().nullable(),
  contatoNome: z.string().optional().nullable(),
  contatoCargo: z.string().optional().nullable(),
  contatoTelefone: z.string().optional().nullable(),
  contatoEmail: z.string().optional().nullable(),
  campanhaSlug: z.string().optional().nullable(), // campanha (funil) que gerou o lead
})

export const updateOportunidadeSchema = createOportunidadeSchema.partial().extend({
  motivoPerda: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export const listOportunidadeSchema = paginationSchema.extend({
  etapaId: z.string().optional(),
  clienteId: z.string().optional(),
  responsavelId: z.string().optional(),
  isActive: z.boolean().optional(),
})

/**
 * Cards que sairam do funil ativo — a tela /crm/arquivados.
 *
 * Duas situacoes no mesmo lugar porque, para quem procura, sao a mesma
 * pergunta ("o card sumiu do quadro, onde esta?"):
 *   - arquivados: isActive = false (o automatico, apos o prazo de declinio)
 *   - declinio:   ainda ativos, na etapa de Declinio, aguardando o prazo
 */
export const listForaDoFunilSchema = paginationSchema.extend({
  situacao: z.enum(['todos', 'arquivados', 'declinio']).default('todos'),
  responsavelId: z.string().optional(),
})
export type ListForaDoFunilInput = z.infer<typeof listForaDoFunilSchema>

export type CreateOportunidadeInput = z.infer<typeof createOportunidadeSchema>
export type UpdateOportunidadeInput = z.infer<typeof updateOportunidadeSchema>
export type ListOportunidadeInput = z.infer<typeof listOportunidadeSchema>
