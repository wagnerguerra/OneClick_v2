import { z } from 'zod'
import { paginationSchema } from './pagination'

// ── Enums (espelham Prisma) ─────────────────────────────────

export const ProjetoStatusEnum = z.enum(['NOVO', 'ANDAMENTO', 'PENDENTE', 'CONCLUIDO'])
export type ProjetoStatus = z.infer<typeof ProjetoStatusEnum>

export const TarefaStatusEnum = z.enum([
  'BACKLOG',
  'A_FAZER',
  'EM_ANDAMENTO',
  'EM_REVISAO',
  'CONCLUIDO',
  'CANCELADO',
])
export type TarefaStatus = z.infer<typeof TarefaStatusEnum>

export const TarefaPrioridadeEnum = z.enum(['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'])
export type TarefaPrioridade = z.infer<typeof TarefaPrioridadeEnum>

// Labels pra UI
export const PROJETO_STATUS_LABELS: Record<ProjetoStatus, string> = {
  NOVO: 'Novo',
  ANDAMENTO: 'Andamento',
  PENDENTE: 'Pendente',
  CONCLUIDO: 'Concluído',
}

// Ordem das colunas no Kanban de projetos (esquerda → direita)
export const PROJETO_STATUS_ORDEM: ProjetoStatus[] = ['NOVO', 'ANDAMENTO', 'PENDENTE', 'CONCLUIDO']

export const TAREFA_STATUS_LABELS: Record<TarefaStatus, string> = {
  BACKLOG: 'Backlog',
  A_FAZER: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  EM_REVISAO: 'Em Revisão',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

export const TAREFA_PRIORIDADE_LABELS: Record<TarefaPrioridade, string> = {
  URGENTE: 'Urgente',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
}

// Ordem das colunas no Kanban (esquerda → direita)
export const TAREFA_STATUS_ORDEM: TarefaStatus[] = [
  'BACKLOG',
  'A_FAZER',
  'EM_ANDAMENTO',
  'EM_REVISAO',
  'CONCLUIDO',
  'CANCELADO',
]

/** Papel no projeto. O RESPONSÁVEL não está aqui: ele é campo do projeto. */
export const ProjetoPapelEnum = z.enum(['EXECUTANTE', 'COLABORADOR'])
export type ProjetoPapel = z.infer<typeof ProjetoPapelEnum>

// ── Projeto ─────────────────────────────────────────────────

export const createProjetoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  descricao: z.string().optional().nullable(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser hex').optional(),
  status: ProjetoStatusEnum.optional(),
  /** Quem responde pelo projeto. É UM só. */
  responsavelId: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataPrevisao: z.string().optional().nullable(),
})

export const updateProjetoSchema = createProjetoSchema.partial()

export const listProjetosSchema = paginationSchema.extend({
  status: ProjetoStatusEnum.optional(),
  responsavelId: z.string().optional(),
  clienteId: z.string().optional(),
})

// ── Envolvidos ──────────────────────────────────────────────


export const PROJETO_PAPEL_LABELS: Record<ProjetoPapel, string> = {
  EXECUTANTE: 'Executantes',
  COLABORADOR: 'Colaboradores',
}

// ── Execuções ───────────────────────────────────────────────
//
// Uma frente de trabalho do projeto, para um cliente. O mesmo projeto roda
// várias ao mesmo tempo.

export const createProjetoExecucaoSchema = z.object({
  projetoId: z.string().min(1),
  titulo: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  /** Responde por ESTA frente — outra pessoa que o responsável do projeto. */
  responsavelId: z.string().optional().nullable(),
})

export const updateProjetoExecucaoSchema = z.object({
  titulo: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  ativa: z.boolean().optional(),
  /** Percentual concluído, informado por quem conduz a frente. */
  progresso: z.number().int().min(0).max(100).optional(),
  /**
   * Cor do cabeçalho do card, em hex. Nulo volta a herdar a do projeto.
   * Só o master troca — a checagem é do backend, não da tela.
   */
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Informe uma cor em hex, como #10b981')
    .optional().nullable(),
  /** Time da execução. Lista completa: o que vier substitui. */
  participantes: z.array(z.object({
    userId: z.string(),
    papel: ProjetoPapelEnum.default('EXECUTANTE'),
  })).optional(),
})

export type CreateProjetoExecucaoInput = z.infer<typeof createProjetoExecucaoSchema>
export type UpdateProjetoExecucaoInput = z.infer<typeof updateProjetoExecucaoSchema>

// ── Rodadas e apontamentos ──────────────────────────────────

export const ProjetoApontamentoSituacaoEnum = z.enum(['ABERTO', 'RESOLVIDO', 'DESCARTADO'])
export type ProjetoApontamentoSituacao = z.infer<typeof ProjetoApontamentoSituacaoEnum>

export const APONTAMENTO_SITUACAO_LABELS: Record<ProjetoApontamentoSituacao, string> = {
  ABERTO: 'Aberto',
  RESOLVIDO: 'Resolvido',
  DESCARTADO: 'Descartado',
}

export const createRodadaSchema = z.object({
  execucaoId: z.string().min(1),
  titulo: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  entregueEm: z.string().optional().nullable(),
})

export const updateRodadaSchema = z.object({
  titulo: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  entregueEm: z.string().optional().nullable(),
})

export const createApontamentoSchema = z.object({
  rodadaId: z.string().min(1),
  texto: z.string().min(1, 'Escreva o apontamento'),
  /** Quem apontou: usuário do sistema OU nome livre (analista sem login). */
  autorId: z.string().optional().nullable(),
  autorNome: z.string().optional().nullable(),
  /** Travou a rodada, em vez de apenas pedir ajuste. */
  impeditivo: z.boolean().optional(),
})

export const updateApontamentoSchema = z.object({
  texto: z.string().min(1).optional(),
  situacao: ProjetoApontamentoSituacaoEnum.optional(),
  impeditivo: z.boolean().optional(),
})

// ── Conversa e arquivos de uma rodada ───────────────────────
//
// Ficam na RODADA, não no projeto: o assunto é aquela entrega. Quem procura
// "por que a rodada 3 travou" não deveria ter de garimpar o mural do projeto.

export const createRodadaMensagemSchema = z.object({
  rodadaId: z.string().min(1),
  texto: z.string().min(1, 'Escreva a mensagem'),
  /** Nome livre de quem não tem login — mesmo motivo do apontamento. */
  autorNome: z.string().optional().nullable(),
})

export const addRodadaArquivoSchema = z.object({
  rodadaId: z.string().min(1),
  nome: z.string().min(1),
  url: z.string().min(1),
  tamanho: z.number().int().min(0),
  mimeType: z.string().optional().nullable(),
})

export type CreateRodadaMensagemInput = z.infer<typeof createRodadaMensagemSchema>
export type AddRodadaArquivoInput = z.infer<typeof addRodadaArquivoSchema>

export type CreateRodadaInput = z.infer<typeof createRodadaSchema>
export type UpdateRodadaInput = z.infer<typeof updateRodadaSchema>
export type CreateApontamentoInput = z.infer<typeof createApontamentoSchema>
export type UpdateApontamentoInput = z.infer<typeof updateApontamentoSchema>

export type CreateProjetoInput = z.infer<typeof createProjetoSchema>
export type UpdateProjetoInput = z.infer<typeof updateProjetoSchema>
export type ListProjetosInput = z.infer<typeof listProjetosSchema>

// ── Tarefa ──────────────────────────────────────────────────

export const createTarefaSchema = z.object({
  projetoId: z.string().min(1),
  titulo: z.string().min(1, 'Título é obrigatório'),
  descricao: z.string().optional().nullable(),
  status: TarefaStatusEnum.optional(),
  prioridade: TarefaPrioridadeEnum.optional(),
  responsavelId: z.string().optional().nullable(),
  prazo: z.string().optional().nullable(),
  estimativa: z.number().int().min(0).optional().nullable(),
  parentId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
})

export const updateTarefaSchema = createTarefaSchema.omit({ projetoId: true }).partial()

export const listTarefasSchema = paginationSchema.extend({
  projetoId: z.string().min(1),
  status: TarefaStatusEnum.optional(),
  responsavelId: z.string().optional(),
  prioridade: TarefaPrioridadeEnum.optional(),
  tagId: z.string().optional(),
})

export const moverTarefaSchema = z.object({
  id: z.string().min(1),
  status: TarefaStatusEnum,
  ordem: z.number().int().optional(),
})

export const reordenarTarefasSchema = z.object({
  status: TarefaStatusEnum,
  projetoId: z.string().min(1),
  ids: z.array(z.string().min(1)),
})

export type CreateTarefaInput = z.infer<typeof createTarefaSchema>
export type UpdateTarefaInput = z.infer<typeof updateTarefaSchema>
export type ListTarefasInput = z.infer<typeof listTarefasSchema>
export type MoverTarefaInput = z.infer<typeof moverTarefaSchema>
export type ReordenarTarefasInput = z.infer<typeof reordenarTarefasSchema>

// ── Tag ─────────────────────────────────────────────────────

export const createProjetoTagSchema = z.object({
  projetoId: z.string().min(1),
  nome: z.string().min(1),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export const updateProjetoTagSchema = z.object({
  nome: z.string().min(1).optional(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export type CreateProjetoTagInput = z.infer<typeof createProjetoTagSchema>
export type UpdateProjetoTagInput = z.infer<typeof updateProjetoTagSchema>

// ── Comentário (evento tipo 'comentario') ───────────────────

export const addComentarioTarefaSchema = z.object({
  tarefaId: z.string().min(1),
  texto: z.string().min(1, 'Comentário não pode estar vazio'),
})

export type AddComentarioTarefaInput = z.infer<typeof addComentarioTarefaSchema>

// ── Anexo ───────────────────────────────────────────────────

export const addAnexoTarefaSchema = z.object({
  tarefaId: z.string().min(1),
  nome: z.string().min(1),
  url: z.string().min(1),
  mimeType: z.string().optional().nullable(),
  tamanho: z.number().int().min(0),
})

export type AddAnexoTarefaInput = z.infer<typeof addAnexoTarefaSchema>
