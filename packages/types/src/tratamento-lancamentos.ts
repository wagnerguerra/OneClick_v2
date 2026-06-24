import { z } from 'zod'
import { paginationSchema } from './pagination'

// ============================================================
// Módulo Contábil — Tratamento de Lançamentos (exportação SCI)
//
// Duas entidades persistidas:
//  - TreatmentModel  → "Modelo de Tratamento" (identificação + controle)
//  - TreatmentModelVersion → snapshot COMPLETO da definição (JSON) por versão
//
// O CORPO do modelo (de/para de colunas, regra entrada/saída, contrapartidas,
// conta corrente) é estrutura variável/aninhada → vive no JSON `definition`.
// ============================================================

// ---- Direção do lançamento (entrada x saída) -------------------------------
export const DIRECAO = { ENTRADA: 'ENTRADA', SAIDA: 'SAIDA' } as const
export type Direcao = (typeof DIRECAO)[keyof typeof DIRECAO]
export const DIRECAO_LABELS: Record<Direcao, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
}

// ---- De/Para de colunas ----------------------------------------------------
// Nomes (cabeçalhos) das colunas do arquivo de entrada que correspondem a cada
// campo usado na geração do SCI. `participante`, `numeroNf` e `documento` são
// opcionais (ver decisão: participante ausente → omitido do histórico).
export const columnMappingSchema = z.object({
  descricao: z.string().min(1, 'Selecione a coluna de descrição'),
  participante: z.string().optional().or(z.literal('')),
  valor: z.string().min(1, 'Selecione a coluna de valor'),
  data: z.string().min(1, 'Selecione a coluna de data'),
  numeroNf: z.string().optional().or(z.literal('')),
  documento: z.string().optional().or(z.literal('')),
})
export type ColumnMapping = z.infer<typeof columnMappingSchema>

// ---- Regra de Entrada/Saída ------------------------------------------------
// Ou por uma COLUNA (com mapa de valor→direção via "SELECT DISTINCT"),
// ou pela DESCRIÇÃO (a direção é definida em cada item de contrapartida).
// Guarda coluna+mapa SEMPRE (mesmo no modo DESCRICAO), para alternar o modo
// não perder o que foi preenchido por coluna. `tipo` define qual regra vale.
export const entradaSaidaSchema = z.object({
  tipo: z.enum(['COLUNA', 'DESCRICAO']).default('COLUNA'),
  coluna: z.string().default(''),
  mapa: z
    .array(
      z.object({
        valor: z.string(),
        direcao: z.enum(['ENTRADA', 'SAIDA']),
      }),
    )
    .default([]),
})
export type EntradaSaidaRule = z.infer<typeof entradaSaidaSchema>

// ---- Mapeamentos de contrapartida ------------------------------------------
// Modo PALAVRA_CHAVE: 1ª palavra-chave encontrada na descrição (esq→dir).
// Modo DESCRICAO: mapeia cada descrição distinta para uma conta.
// `direcao` só é usada quando entradaSaida.tipo === 'DESCRICAO'.
export const contrapartidaPalavraChaveItem = z.object({
  palavraChave: z.string().min(1, 'Informe a palavra-chave'),
  conta: z.string().min(1, 'Informe a conta de contrapartida'),
  historicoFixo: z.string().optional().or(z.literal('')),
  direcao: z.enum(['ENTRADA', 'SAIDA']).optional(),
})
export const contrapartidaDescricaoItem = z.object({
  descricao: z.string().min(1, 'Informe a descrição'),
  conta: z.string().min(1, 'Informe a conta de contrapartida'),
  historicoFixo: z.string().optional().or(z.literal('')),
  direcao: z.enum(['ENTRADA', 'SAIDA']).optional(),
})
// Guarda AMBOS os modos (palavraChave + descricao) + o modo ativo, para que
// alternar o modo NÃO perca o que foi preenchido no outro — persistido na
// definição (sobrevive a salvar/fechar/reabrir o modelo).
export const contrapartidaSchema = z.object({
  modo: z.enum(['PALAVRA_CHAVE', 'DESCRICAO']).default('DESCRICAO'),
  palavraChave: z.array(contrapartidaPalavraChaveItem).default([]),
  descricao: z.array(contrapartidaDescricaoItem).default([]),
})
export type ContrapartidaRule = z.infer<typeof contrapartidaSchema>

// ---- Definição completa (corpo do Modelo — snapshot em JSON) ---------------
export const treatmentDefinitionSchema = z.object({
  contaCorrente: z.string().default(''),
  columnMapping: columnMappingSchema,
  entradaSaida: entradaSaidaSchema,
  contrapartida: contrapartidaSchema,
})
export type TreatmentDefinition = z.infer<typeof treatmentDefinitionSchema>

/** Definição "vazia" usada ao criar um Modelo antes de configurar o wizard. */
export const EMPTY_TREATMENT_DEFINITION: TreatmentDefinition = {
  contaCorrente: '',
  columnMapping: { descricao: '', participante: '', valor: '', data: '', numeroNf: '', documento: '' },
  entradaSaida: { tipo: 'COLUNA', coluna: '', mapa: [] },
  contrapartida: { modo: 'DESCRICAO', palavraChave: [], descricao: [] },
}

// ---- CRUD do Modelo de Tratamento ------------------------------------------
export const createTreatmentModelSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  contaCorrente: z.string().optional().or(z.literal('')),
  clienteId: z.string().optional().or(z.literal('')),
  // Opcional na criação: na Fase 1 o Modelo pode nascer sem configuração e ser
  // configurado depois no editor (wizard). Quando ausente → EMPTY_TREATMENT_DEFINITION.
  definition: treatmentDefinitionSchema.optional(),
  // Nota descritiva da alteração — registrada na versão gerada.
  note: z.string().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
})
export const updateTreatmentModelSchema = createTreatmentModelSchema.partial()
export const listTreatmentModelSchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
  clienteId: z.string().optional(),
})

export type CreateTreatmentModelInput = z.infer<typeof createTreatmentModelSchema>
export type UpdateTreatmentModelInput = z.infer<typeof updateTreatmentModelSchema>
export type ListTreatmentModelInput = z.infer<typeof listTreatmentModelSchema>

// ---- Preview de arquivo (wizard) -------------------------------------------
// Recebe o arquivo-exemplo em base64 → backend extrai a tabela e devolve
// colunas + linhas (o wizard monta de/para e SELECT DISTINCT no cliente).
export const previewArquivoSchema = z.object({
  fileBase64: z.string().min(1, 'Arquivo vazio'),
  filename: z.string().min(1),
})
export type PreviewArquivoInput = z.infer<typeof previewArquivoSchema>

// ---- Conversão para o SCI ("Exportação para o SCI") ------------------------
export const convertSchema = z.object({
  modelId: z.string().min(1),
  fileBase64: z.string().min(1, 'Arquivo vazio'),
  filename: z.string().min(1),
})
export type ConvertInput = z.infer<typeof convertSchema>

/**
 * Stringify estável (chaves ordenadas recursivamente). Usado para comparar
 * definições/estados — o `jsonb` do Postgres não preserva a ordem das chaves,
 * então um JSON.stringify direto daria "diferente" para objetos iguais.
 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const obj = v as Record<string, unknown>
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}
