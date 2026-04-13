import { z } from 'zod'
import { paginationSchema } from './pagination'

export const TipoContrato = {
  CLT: 'CLT',
  PJ: 'PJ',
  ESTAGIARIO: 'ESTAGIARIO',
  TEMPORARIO: 'TEMPORARIO',
  AUTONOMO: 'AUTONOMO',
  TERCEIRIZADO: 'TERCEIRIZADO',
} as const

export type TipoContrato = (typeof TipoContrato)[keyof typeof TipoContrato]

export const EstadoCivil = {
  SOLTEIRO: 'SOLTEIRO',
  CASADO: 'CASADO',
  DIVORCIADO: 'DIVORCIADO',
  VIUVO: 'VIUVO',
  UNIAO_ESTAVEL: 'UNIAO_ESTAVEL',
  SEPARADO: 'SEPARADO',
} as const

export type EstadoCivil = (typeof EstadoCivil)[keyof typeof EstadoCivil]

export const Sexo = {
  MASCULINO: 'MASCULINO',
  FEMININO: 'FEMININO',
  OUTRO: 'OUTRO',
} as const

export type Sexo = (typeof Sexo)[keyof typeof Sexo]

export const TIPO_CONTRATO_LABELS: Record<string, string> = {
  CLT: 'CLT',
  PJ: 'PJ',
  ESTAGIARIO: 'Estagiário',
  TEMPORARIO: 'Temporário',
  AUTONOMO: 'Autônomo',
  TERCEIRIZADO: 'Terceirizado',
}

export const ESTADO_CIVIL_LABELS: Record<string, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União Estável',
  SEPARADO: 'Separado(a)',
}

export const SEXO_LABELS: Record<string, string> = {
  MASCULINO: 'Masculino',
  FEMININO: 'Feminino',
  OUTRO: 'Outro',
}

export const createColaboradorSchema = z.object({
  // Dados Pessoais
  nomeCompleto: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  cpf: z.string().min(11, 'CPF inválido').max(14),
  rg: z.string().optional().or(z.literal('')),
  orgaoEmissor: z.string().optional().or(z.literal('')),
  dataNascimento: z.string().optional().or(z.literal('')),
  sexo: z.enum(['MASCULINO', 'FEMININO', 'OUTRO']).optional().nullable(),
  estadoCivil: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL', 'SEPARADO']).optional().nullable(),
  nacionalidade: z.string().optional().or(z.literal('')),
  naturalidade: z.string().optional().or(z.literal('')),
  fotoUrl: z.string().optional().or(z.literal('')),

  // Documentos
  pis: z.string().optional().or(z.literal('')),
  ctps: z.string().optional().or(z.literal('')),
  ctpsSerie: z.string().optional().or(z.literal('')),
  tituloEleitor: z.string().optional().or(z.literal('')),
  reservista: z.string().optional().or(z.literal('')),

  // Contato
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional().or(z.literal('')),
  celular: z.string().optional().or(z.literal('')),

  // Endereço
  cep: z.string().optional().or(z.literal('')),
  logradouro: z.string().optional().or(z.literal('')),
  numero: z.string().optional().or(z.literal('')),
  complemento: z.string().optional().or(z.literal('')),
  bairro: z.string().optional().or(z.literal('')),
  cidade: z.string().optional().or(z.literal('')),
  uf: z.string().max(2).optional().or(z.literal('')),

  // Contrato / RH
  tipoContrato: z.enum(['CLT', 'PJ', 'ESTAGIARIO', 'TEMPORARIO', 'AUTONOMO', 'TERCEIRIZADO']).default('CLT'),
  dataAdmissao: z.string().optional().or(z.literal('')),
  dataDemissao: z.string().optional().or(z.literal('')),
  salario: z.coerce.number().min(0).optional().nullable(),
  cargaHoraria: z.coerce.number().min(0).max(168).optional().nullable(),
  incluirFerias: z.boolean().default(true),
  observacoes: z.string().optional().or(z.literal('')),

  // Vínculos
  areaId: z.string().optional().or(z.literal('')),
  cargoId: z.string().optional().or(z.literal('')),
  userId: z.string().optional().or(z.literal('')),

  // Controle
  isActive: z.boolean().default(true),
})

export const updateColaboradorSchema = createColaboradorSchema.partial()

export const listColaboradorSchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
  tipoContrato: z.string().optional(),
  areaId: z.string().optional(),
  cargoId: z.string().optional(),
})

export type CreateColaboradorInput = z.infer<typeof createColaboradorSchema>
export type UpdateColaboradorInput = z.infer<typeof updateColaboradorSchema>
export type ListColaboradorInput = z.infer<typeof listColaboradorSchema>
