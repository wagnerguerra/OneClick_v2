import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Não Conformidades da Qualidade — port do `sgq_rnc` do OneClick v1.
 * Fluxo: registro → análise da causa → plano de ação → forma de avaliação →
 * avaliação de eficácia. Avaliação NÃO eficaz gera reincidência automática.
 */

export const NC_SITUACOES = [
  'AGUARDANDO_CAUSA', 'AGUARDANDO_ACOES', 'EM_TRATAMENTO',
  'AGUARDANDO_CONCLUSAO', 'FINALIZADA', 'CANCELADA',
] as const

export const NC_SITUACAO_LABEL: Record<string, string> = {
  AGUARDANDO_CAUSA: 'Aguardando Causa',
  AGUARDANDO_ACOES: 'Aguardando Ações',
  EM_TRATAMENTO: 'Em Tratamento',
  AGUARDANDO_CONCLUSAO: 'Aguardando Conclusão',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
}

export const NC_TIPO_LABEL: Record<string, string> = {
  NAO_CONFORMIDADE: 'Não Conformidade',
  OPORTUNIDADE_MELHORIA: 'Oportunidade de Melhoria',
}

export const NC_ACAO_TIPOS = ['IMEDIATA', 'CORRETIVA', 'AVALIACAO_EFICACIA'] as const
export const NC_ACAO_TIPO_LABEL: Record<string, string> = {
  IMEDIATA: 'Ação Imediata', CORRETIVA: 'Ação Corretiva', AVALIACAO_EFICACIA: 'Avaliação de Eficácia',
}

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

export const criarNaoConformidadeSchema = z.object({
  clienteId: z.string().optional().nullable(),
  areaId: z.string().optional().nullable(),
  processoId: z.string().optional().nullable(),
  origemId: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
  detalhamento: z.string().min(3, 'Descreva o fato gerador.'),
  /** Causa já na abertura (como o create do adm no v1) — opcional. */
  causa: z.string().optional().nullable(),
  ncSimilarId: z.string().optional().nullable(),
  ncSimilarTexto: z.string().optional().nullable(),
})

export const atualizarNaoConformidadeSchema = z.object({
  id: z.string().min(1),
  clienteId: z.string().optional().nullable(),
  areaId: z.string().optional().nullable(),
  processoId: z.string().optional().nullable(),
  origemId: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
  detalhamento: z.string().min(3).optional(),
  ncSimilarId: z.string().optional().nullable(),
  ncSimilarTexto: z.string().optional().nullable(),
})

export const registrarCausaNcSchema = z.object({
  id: z.string().min(1),
  causa: z.string().min(3, 'Descreva a análise da causa.'),
})

/** Forma de avaliação da eficácia (etapa intermediária do v1). */
export const registrarFormaAvaliacaoNcSchema = z.object({
  id: z.string().min(1),
  eficaciaDetalhes: z.string().min(3, 'Descreva como a eficácia será avaliada.'),
  eficaciaPrazo: dataISO.optional().nullable(),
})

export const avaliarNcSchema = z.object({
  id: z.string().min(1),
  avaliacao: z.string().min(3, 'Descreva a avaliação.'),
  eficaz: z.boolean(),
})

/** Pós-avaliação: o fechamento pede atualização do sistema da qualidade? */
export const atualizacaoSistemaNcSchema = z.object({
  id: z.string().min(1),
  atualizaSwot: z.boolean(),
  atualizaSwotDesc: z.string().optional().nullable(),
  atualizaRevisao: z.boolean(),
  atualizaRevisaoDesc: z.string().optional().nullable(),
})

export const cancelarNcSchema = z.object({
  id: z.string().min(1),
  motivo: z.string().min(3, 'Informe o motivo do cancelamento.'),
})

export const criarNcAcaoSchema = z.object({
  ncId: z.string().min(1),
  tipo: z.enum(NC_ACAO_TIPOS),
  descricao: z.string().min(3, 'Descreva a ação.'),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
})

export const atualizarNcAcaoSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(NC_ACAO_TIPOS).optional(),
  descricao: z.string().min(3).optional(),
  responsavelId: z.string().optional().nullable(),
  prazo: dataISO.optional().nullable(),
})

export const concluirNcAcaoSchema = z.object({
  id: z.string().min(1),
  concluida: z.boolean(),
  observacao: z.string().optional().nullable(),
})

export const criarNcMensagemSchema = z.object({
  ncId: z.string().min(1),
  texto: z.string().min(1, 'Escreva a mensagem.'),
})

export const criarNcOrigemSchema = z.object({
  nome: z.string().min(2).max(120),
})
export const atualizarNcOrigemSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(2).max(120).optional(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().optional(),
})

export const listarNaoConformidadesSchema = paginationSchema.extend({
  situacao: z.enum(NC_SITUACOES).optional(),
  origemId: z.string().optional(),
  areaId: z.string().optional(),
  clienteId: z.string().optional(),
  reincidencia: z.boolean().optional(),
})

export type CriarNaoConformidadeInput = z.infer<typeof criarNaoConformidadeSchema>
export type AtualizarNaoConformidadeInput = z.infer<typeof atualizarNaoConformidadeSchema>
export type RegistrarCausaNcInput = z.infer<typeof registrarCausaNcSchema>
export type RegistrarFormaAvaliacaoNcInput = z.infer<typeof registrarFormaAvaliacaoNcSchema>
export type AvaliarNcInput = z.infer<typeof avaliarNcSchema>
export type AtualizacaoSistemaNcInput = z.infer<typeof atualizacaoSistemaNcSchema>
export type CancelarNcInput = z.infer<typeof cancelarNcSchema>
export type CriarNcAcaoInput = z.infer<typeof criarNcAcaoSchema>
export type AtualizarNcAcaoInput = z.infer<typeof atualizarNcAcaoSchema>
export type ConcluirNcAcaoInput = z.infer<typeof concluirNcAcaoSchema>
export type CriarNcMensagemInput = z.infer<typeof criarNcMensagemSchema>
export type CriarNcOrigemInput = z.infer<typeof criarNcOrigemSchema>
export type AtualizarNcOrigemInput = z.infer<typeof atualizarNcOrigemSchema>
export type ListarNaoConformidadesInput = z.infer<typeof listarNaoConformidadesSchema>
