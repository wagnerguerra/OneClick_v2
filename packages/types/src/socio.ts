import { z } from 'zod'
import { paginationSchema } from './pagination'

export const TipoSocio = {
  SOCIO_ADMINISTRADOR: 'SOCIO_ADMINISTRADOR',
  SOCIO_QUOTISTA: 'SOCIO_QUOTISTA',
  SOCIO_DIRETOR: 'SOCIO_DIRETOR',
  ACIONISTA: 'ACIONISTA',
  TITULAR: 'TITULAR',
  PROCURADOR: 'PROCURADOR',
  REPRESENTANTE_LEGAL: 'REPRESENTANTE_LEGAL',
} as const

export type TipoSocio = (typeof TipoSocio)[keyof typeof TipoSocio]

export const TIPO_SOCIO_LABELS: Record<string, string> = {
  SOCIO_ADMINISTRADOR: 'Sócio Administrador',
  SOCIO_QUOTISTA: 'Sócio Quotista',
  SOCIO_DIRETOR: 'Sócio Diretor',
  ACIONISTA: 'Acionista',
  TITULAR: 'Titular',
  PROCURADOR: 'Procurador',
  REPRESENTANTE_LEGAL: 'Representante Legal',
}

export const createSocioSchema = z.object({
  nomeCompleto: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  cpf: z.string().min(11, 'CPF inválido').max(14),
  rg: z.string().optional().or(z.literal('')),
  orgaoEmissor: z.string().optional().or(z.literal('')),
  dataNascimento: z.string().optional().or(z.literal('')),
  nacionalidade: z.string().optional().or(z.literal('')),
  estadoCivil: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL', 'SEPARADO']).optional().nullable(),
  profissao: z.string().optional().or(z.literal('')),

  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional().or(z.literal('')),
  celular: z.string().optional().or(z.literal('')),

  cep: z.string().optional().or(z.literal('')),
  logradouro: z.string().optional().or(z.literal('')),
  numero: z.string().optional().or(z.literal('')),
  complemento: z.string().optional().or(z.literal('')),
  bairro: z.string().optional().or(z.literal('')),
  cidade: z.string().optional().or(z.literal('')),
  uf: z.string().max(2).optional().or(z.literal('')),

  tipoSocio: z.enum(['SOCIO_ADMINISTRADOR', 'SOCIO_QUOTISTA', 'SOCIO_DIRETOR', 'ACIONISTA', 'TITULAR', 'PROCURADOR', 'REPRESENTANTE_LEGAL']).default('SOCIO_QUOTISTA'),
  participacao: z.coerce.number().min(0).max(100).optional().nullable(),
  valorQuotas: z.coerce.number().min(0).optional().nullable(),
  dataEntrada: z.string().optional().or(z.literal('')),
  dataSaida: z.string().optional().or(z.literal('')),
  assinaNaEmpresa: z.boolean().default(false),
  responsavelLegal: z.boolean().default(false),
  observacoes: z.string().optional().or(z.literal('')),

  clienteId: z.string().optional().or(z.literal('')),

  isActive: z.boolean().default(true),
})

export const updateSocioSchema = createSocioSchema.partial()

export const listSocioSchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
  tipoSocio: z.string().optional(),
  clienteId: z.string().optional(),
})

export type CreateSocioInput = z.infer<typeof createSocioSchema>
export type UpdateSocioInput = z.infer<typeof updateSocioSchema>
export type ListSocioInput = z.infer<typeof listSocioSchema>
