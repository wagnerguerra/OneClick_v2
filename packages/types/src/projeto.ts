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

// ── Projeto ─────────────────────────────────────────────────

export const createProjetoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  descricao: z.string().optional().nullable(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser hex').optional(),
  status: ProjetoStatusEnum.optional(),
  responsavelId: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataPrevisao: z.string().optional().nullable(),
})

export const updateProjetoSchema = createProjetoSchema.partial()

export const listProjetosSchema = paginationSchema.extend({
  status: ProjetoStatusEnum.optional(),
  responsavelId: z.string().optional(),
})

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
