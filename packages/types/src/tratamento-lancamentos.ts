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

// ---- Marcador de débito/crédito anexo ao valor -----------------------------
// Alguns bancos (BB, Sicoob) NÃO trazem o sinal, mas um marcador de letra colado
// ou próximo ao valor: "C"/"CD" = crédito (sinal +), "D"/"DB" = débito (sinal −).
// Pode vir como prefixo ("D 1.234,56") ou sufixo ("1.234,56 D", "14.933,35C").
// O "*" do Sicoob é marca de conciliação (não é direção) → descartado.
//
// Isso é compartilhado entre backend (parseValor, na conversão) e frontend
// (exibição da coluna Valor na prévia do De/Para), para o usuário ver o valor
// exatamente como será interpretado — e alimenta o modo D/C "SINAL".
export interface MarcadorDC {
  /** −1 = débito, 1 = crédito, null = sem marcador. */
  direcao: -1 | 1 | null
  /** Texto restante (sem o marcador nem o "*"), para o parse numérico. */
  texto: string
}

export function extrairMarcadorDC(raw: unknown): MarcadorDC {
  const t = String(raw ?? '').replace(/\*/g, '').trim()
  const sinal = (m: string): -1 | 1 => (/^(D|DB)$/i.test(m) ? -1 : 1)
  // Sufixo: "1.234,56 D", "14.933,35CD" (CD/DB antes de C/D na alternância).
  let m = t.match(/^(.*?\d)\s*(CD|DB|C|D)$/i)
  if (m) return { direcao: sinal(m[2]!), texto: m[1]! }
  // Prefixo: "D 1.234,56", "C1.234,56".
  m = t.match(/^(CD|DB|C|D)\s*(\d.*)$/i)
  if (m) return { direcao: sinal(m[1]!), texto: m[2]! }
  return { direcao: null, texto: t }
}

/**
 * Formata a coluna de Valor para EXIBIÇÃO (prévia do De/Para): quando há marcador
 * D/C anexo, reaplica o sinal ao número original (mantendo a formatação de
 * origem) — ex.: "1.000,00D" → "-1.000,00". Sem marcador, devolve o texto como
 * está (não mexe no que já vinha ok, inclusive valores já com sinal "-").
 */
export function formatValorExibicao(raw: unknown): string {
  const rawStr = String(raw ?? '')
  const { direcao, texto } = extrairMarcadorDC(rawStr)
  if (direcao === null) return rawStr
  const core = texto.trim().replace(/^[-+]\s*/, '')
  return (direcao < 0 ? '-' : '') + core
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
// Três modos:
//  - COLUNA:    uma coluna (com mapa de valor→direção via "SELECT DISTINCT").
//  - DESCRICAO: a direção é definida em cada item de contrapartida.
//  - SINAL:     pela sinalização do valor — negativo = débito, positivo = crédito
//               (o parser já converte marcadores C/CD/D/DB anexos, ex. BB/Sicoob,
//               em sinal; ver `extrairMarcadorDC`). Não usa coluna nem mapa.
// Guarda coluna+mapa SEMPRE (mesmo nos outros modos), para alternar o modo
// não perder o que foi preenchido por coluna. `tipo` define qual regra vale.
export const debitoCreditoSchema = z.object({
  tipo: z.enum(['COLUNA', 'DESCRICAO', 'SINAL']).default('COLUNA'),
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
// `pular`: quando true, as correspondências a este item NÃO viram lançamento —
// são puladas na geração (sem conta/direção; usado p/ linhas que não são
// lançamentos, ex.: "Saldo do dia"). Marcado → os demais campos ficam opcionais.
export const contrapartidaPalavraChaveItem = z.object({
  palavraChave: z.string(),
  conta: z.string(),
  historicoFixo: z.string().optional().or(z.literal('')),
  direcao: z.enum(['DEBITO', 'CREDITO']).optional(),
  pular: z.boolean().optional(),
})
export const contrapartidaDescricaoItem = z.object({
  descricao: z.string(),
  conta: z.string(),
  historicoFixo: z.string().optional().or(z.literal('')),
  direcao: z.enum(['DEBITO', 'CREDITO']).optional(),
  pular: z.boolean().optional(),
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

/**
 * Índice da 1ª palavra-chave que corresponde à descrição, ou -1. **Fonte única da
 * regra de correspondência por palavra-chave** — usada tanto na conversão
 * (`apply-model`) quanto no painel de correspondência do editor, para que o número
 * mostrado ao usuário seja SEMPRE igual ao da conversão real. Regra: substring
 * case-insensitive; vence a palavra-chave cuja ocorrência começa MAIS CEDO no texto;
 * empate de posição → a primeira na ordem da lista. Itens com palavra-chave em branco
 * são ignorados.
 */
export function matchPalavraChaveIndex(
  descricao: string,
  itens: ReadonlyArray<{ palavraChave: string }>,
): number {
  const lower = descricao.toLowerCase()
  let bestIdx = -1
  let bestPos = Number.POSITIVE_INFINITY
  for (let i = 0; i < itens.length; i++) {
    const kw = itens[i]!.palavraChave.trim().toLowerCase()
    if (!kw) continue
    const pos = lower.indexOf(kw)
    if (pos >= 0 && pos < bestPos) { bestPos = pos; bestIdx = i }
  }
  return bestIdx
}

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

// ---- Tabela já extraída (reuso do preview) ---------------------------------
// A extração roda UMA vez, no preview (pós-upload). O cliente guarda o resultado
// e reenvia aqui, para o convert aplicar o modelo SEM re-extrair o arquivo.
// Espelha o `ExtractedTable` do backend na parte que o `applyModel` consome
// (só `headers` + `rows`; `meta` é reconstruída no servidor).
const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const extractedTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.record(cellValueSchema)),
})
export type ExtractedTableInput = z.infer<typeof extractedTableSchema>

// ---- Conversão para o SCI ("Exportação para o SCI") ------------------------
export const convertSchema = z
  .object({
    modelId: z.string().min(1),
    filename: z.string().min(1),
    // Arquivo em base64. Opcional quando `table` já vem pronta (reuso do preview);
    // ainda usado como fallback quando a tabela não foi carregada (ex.: arquivo
    // acima do teto do preview, ou fluxo que não passou pelo preview).
    fileBase64: z.string().optional(),
    // Tabela já extraída no preview (o cliente carrega) → evita re-extração.
    table: extractedTableSchema.optional(),
    // Ano de competência p/ datas "dd/mm" sem ano (ex.: Sicoob). Se ausente e o
    // arquivo tiver datas sem ano, a conversão devolve `needsCompetenciaAno`.
    competenciaAno: z.coerce.number().int().min(1900).max(2200).optional(),
  })
  .refine((d) => !!d.table || !!(d.fileBase64 && d.fileBase64.length > 0), {
    message: 'Envie a tabela extraída ou o arquivo.',
    path: ['fileBase64'],
  })
export type ConvertInput = z.infer<typeof convertSchema>

// ---- Visualizador de debug (tabela extraída) -------------------------------
// Ferramenta escondida (via ?debug=1) para inspecionar como o arquivo foi
// tabelado e interpretado pelo modelo. `modelId` é OPCIONAL: sem ele, devolve só
// a tabela extraída crua; com ele, também o traço do de/para + pendências.
export const debugExtractSchema = z.object({
  fileBase64: z.string().min(1, 'Arquivo vazio'),
  filename: z.string().min(1),
  modelId: z.string().optional(),
  competenciaAno: z.coerce.number().int().min(1900).max(2200).optional(),
})
export type DebugExtractInput = z.infer<typeof debugExtractSchema>

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
