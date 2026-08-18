import { z } from 'zod'
import { paginationSchema } from './pagination'

/**
 * Reuniões da Qualidade — port do módulo `sgq_reunioes` do OneClick v1.
 *
 * Não é agenda: a reunião é lançada DEPOIS de acontecer, com pauta, ata e o
 * plano de ação que saiu dela. Ver docs/migracao-reunioes-v1.md.
 */

// O tipo da reunião (Análise Crítica, Setorial, Outros…) é CADASTRO, e não
// lista fixa — mesma decisão dos tipos de documento e dos métodos de
// capacitação. Por isso entra e sai daqui como `tipoId`.

/** Cadastro de tipo — mesmo formato dos outros módulos da Qualidade. */
export const reuniaoTipoInputSchema = z.object({
  nome: z.string().min(2).max(160),
  ordem: z.number().int().nonnegative().default(0),
  ativo: z.boolean().default(true),
})

export const reuniaoAcaoStatusSchema = z.enum(['PENDENTE', 'CONCLUIDA'])
export type ReuniaoAcaoStatus = z.infer<typeof reuniaoAcaoStatusSchema>

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const hora = z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida.')

/**
 * Participante. Colaborador vira vínculo por ID; convidado externo fica no
 * nome, porque não existe usuário para apontar — e 264 das 281 reuniões do v1
 * têm cliente, então gente de fora é caso corriqueiro, não exceção.
 */
export const reuniaoParticipanteSchema = z.object({
  usuarioId: z.string().optional().nullable(),
  nome: z.string().max(160).optional().nullable(),
  presente: z.boolean().default(true),
}).refine(
  p => Boolean(p.usuarioId) || Boolean(p.nome?.trim()),
  { message: 'Informe o colaborador ou o nome do convidado.' },
)

export const criarReuniaoSchema = z.object({
  tipoId: z.string().optional().nullable(),
  titulo: z.string().min(3, 'Dê um título à reunião.').max(200),
  clienteId: z.string().optional().nullable(),
  areaId: z.string().optional().nullable(),

  data: dataISO,
  horaInicio: hora.optional().nullable().or(z.literal('')),
  horaFim: hora.optional().nullable().or(z.literal('')),
  local: z.string().max(200).optional().nullable(),

  /** HTML do RichEditor. */
  pauta: z.string().optional().nullable(),
  ata: z.string().optional().nullable(),

  participantes: z.array(reuniaoParticipanteSchema).default([]),
})

export const atualizarReuniaoSchema = criarReuniaoSchema.partial().extend({
  id: z.string().min(1),
})

export const listarReunioesSchema = paginationSchema.extend({
  tipoId: z.string().optional(),
  clienteId: z.string().optional(),
  areaId: z.string().optional(),
  /** Recorte por período da reunião — o filtro que o v1 não tinha. */
  de: dataISO.optional(),
  ate: dataISO.optional(),
  /** Só as minhas: as que registrei ou de que participei. */
  somenteMinhas: z.coerce.boolean().optional(),
  /** Só as que ainda têm ação pendente. */
  comAcaoPendente: z.coerce.boolean().optional(),
})

export const criarReuniaoAcaoSchema = z.object({
  reuniaoId: z.string().min(1),
  descricao: z.string().min(3, 'Descreva a ação.'),
  responsavelId: z.string().optional().nullable(),
  /** Só quando não há usuário para apontar. */
  responsavelNome: z.string().max(160).optional().nullable(),
  prazo: dataISO.optional().nullable(),
  observacao: z.string().optional().nullable(),
})

export const atualizarReuniaoAcaoSchema = criarReuniaoAcaoSchema
  .omit({ reuniaoId: true })
  .partial()
  .extend({ id: z.string().min(1) })

export const concluirReuniaoAcaoSchema = z.object({
  id: z.string().min(1),
  /** Reabrir devolve a ação para PENDENTE e limpa a conclusão. */
  concluida: z.boolean().default(true),
  observacao: z.string().max(4000).optional().nullable(),
})

/** Ações que caíram no colo de alguém — a pergunta que o v1 não respondia. */
export const listarMinhasAcoesSchema = paginationSchema.extend({
  status: reuniaoAcaoStatusSchema.optional(),
  /** Só as vencidas. É o número que o menu do v1 mostrava como badge. */
  somenteVencidas: z.coerce.boolean().optional(),
  /** Sem isto, traz só as do próprio usuário. */
  todosResponsaveis: z.coerce.boolean().optional(),
})

export type CriarReuniaoInput = z.infer<typeof criarReuniaoSchema>
export type AtualizarReuniaoInput = z.infer<typeof atualizarReuniaoSchema>
export type ListarReunioesInput = z.infer<typeof listarReunioesSchema>
export type ReuniaoTipoInput = z.infer<typeof reuniaoTipoInputSchema>
export type CriarReuniaoAcaoInput = z.infer<typeof criarReuniaoAcaoSchema>
export type AtualizarReuniaoAcaoInput = z.infer<typeof atualizarReuniaoAcaoSchema>
export type ConcluirReuniaoAcaoInput = z.infer<typeof concluirReuniaoAcaoSchema>
export type ListarMinhasAcoesInput = z.infer<typeof listarMinhasAcoesSchema>
