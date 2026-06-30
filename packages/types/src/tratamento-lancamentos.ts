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

// ---- Direção do lançamento (débito x crédito) ------------------------------
export const DIRECAO = { DEBITO: 'DEBITO', CREDITO: 'CREDITO' } as const
export type Direcao = (typeof DIRECAO)[keyof typeof DIRECAO]
export const DIRECAO_LABELS: Record<Direcao, string> = {
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
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

// ---- Regra de Débito/Crédito -----------------------------------------------
// Ou por uma COLUNA (com mapa de valor→direção via "SELECT DISTINCT"),
// ou pela DESCRIÇÃO (a direção é definida em cada item de contrapartida).
// Guarda coluna+mapa SEMPRE (mesmo no modo DESCRICAO), para alternar o modo
// não perder o que foi preenchido por coluna. `tipo` define qual regra vale.
export const debitoCreditoSchema = z.object({
  tipo: z.enum(['COLUNA', 'DESCRICAO']).default('COLUNA'),
  coluna: z.string().default(''),
  mapa: z
    .array(
      z.object({
        valor: z.string(),
        direcao: z.enum(['DEBITO', 'CREDITO']),
      }),
    )
    .default([]),
})
export type DebitoCreditoRule = z.infer<typeof debitoCreditoSchema>

// ---- Mapeamentos de contrapartida ------------------------------------------
// Modo PALAVRA_CHAVE: 1ª palavra-chave encontrada na descrição (esq→dir).
// Modo DESCRICAO: mapeia cada descrição distinta para uma conta.
// `direcao` só é usada quando debitoCredito.tipo === 'DESCRICAO'.
// Campos SEM min(1): a definição é um snapshot que guarda OS DOIS modos; o modo
// inativo pode ter itens incompletos (ex.: descrições auto-listadas sem conta).
// A completude do modo ATIVO é validada no editor (probContrapartida) e a
// conversão gera pendências para o que faltar — não cabe ao schema barrar.
export const contrapartidaPalavraChaveItem = z.object({
  palavraChave: z.string(),
  conta: z.string(),
  historicoFixo: z.string().optional().or(z.literal('')),
  direcao: z.enum(['DEBITO', 'CREDITO']).optional(),
})
export const contrapartidaDescricaoItem = z.object({
  descricao: z.string(),
  conta: z.string(),
  historicoFixo: z.string().optional().or(z.literal('')),
  direcao: z.enum(['DEBITO', 'CREDITO']).optional(),
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

// ---- Conta(s) corrente(s) --------------------------------------------------
// UNICA: uma conta para todos os lançamentos (comportamento padrão).
// MULTIPLAS: o arquivo traz lançamentos de vários bancos → uma COLUNA identifica
// a conta e cada valor distinto dela (SELECT DISTINCT) mapeia para um número de
// conta. Guarda os dois modos para não perder o preenchimento ao alternar.
export const contasCorrentesSchema = z.object({
  modo: z.enum(['UNICA', 'MULTIPLAS']).default('UNICA'),
  unica: z.string().default(''),
  coluna: z.string().default(''),
  mapa: z
    .array(z.object({ valor: z.string(), conta: z.string() }))
    .default([]),
})
export type ContasCorrentesRule = z.infer<typeof contasCorrentesSchema>

// ---- Definição completa (corpo do Modelo — snapshot em JSON) ---------------
export const treatmentDefinitionSchema = z.object({
  contasCorrentes: contasCorrentesSchema,
  columnMapping: columnMappingSchema,
  debitoCredito: debitoCreditoSchema,
  contrapartida: contrapartidaSchema,
})
export type TreatmentDefinition = z.infer<typeof treatmentDefinitionSchema>

/** Definição "vazia" usada ao criar um Modelo antes de configurar o wizard. */
export const EMPTY_TREATMENT_DEFINITION: TreatmentDefinition = {
  contasCorrentes: { modo: 'UNICA', unica: '', coluna: '', mapa: [] },
  columnMapping: { descricao: '', participante: '', valor: '', data: '', numeroNf: '', documento: '' },
  debitoCredito: { tipo: 'COLUNA', coluna: '', mapa: [] },
  contrapartida: { modo: 'DESCRICAO', palavraChave: [], descricao: [] },
}

// ---- CRUD do Modelo de Tratamento ------------------------------------------
export const createTreatmentModelSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
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
