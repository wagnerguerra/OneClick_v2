import type { Dispatch, SetStateAction } from 'react'
import type { TreatmentDefinition, Direcao } from '@saas/types'

export type CellValue = string | number | boolean | null
export interface PreviewData { headers: string[]; rows: Array<Record<string, CellValue>>; totalRows: number; truncated: boolean }

export interface Props {
  mode: 'create' | 'edit'
  modelId?: string
  /** Caminho de origem (?from=) — para "Voltar"/"Salvar" retornarem a ele. */
  backTo?: string
}

export const NONE = '__none__'

export const HISTORICO_FIXO_HINT =
  'Texto fixo que será gravado no campo Histórico do SCI para esses lançamentos. ' +
  'Se deixar em branco, o sistema monta o histórico automaticamente ' +
  '(ex.: "VR REF RECEB - NOME DO PARTICIPANTE"). ' +
  'Vírgulas são removidas automaticamente (quebrariam o layout do SCI).'

export const PULAR_LINHA_HINT =
  'Marque para IGNORAR as linhas que correspondem a este item: elas NÃO entram no ' +
  'arquivo SCI. Útil para linhas do extrato que não são lançamentos (ex.: "Saldo do ' +
  'dia", "Saldo anterior"). Quando marcado, os demais campos deste item são dispensados.'

// Campos do de/para. `req` marca os obrigatórios.
export const MAP_FIELDS: Array<{ key: keyof TreatmentDefinition['columnMapping']; label: string; req?: boolean; hint?: string }> = [
  { key: 'descricao', label: 'Descrição do lançamento', req: true },
  { key: 'valor', label: 'Valor', req: true },
  { key: 'data', label: 'Data', req: true },
  { key: 'participante', label: 'Nome do participante', hint: 'Opcional — usado no histórico do SCI' },
  { key: 'numeroNf', label: 'Número da NF', hint: 'Opcional' },
  // `documento` (CNPJ/CPF) é renderizado à parte (CampoDocumento) por ter o modo
  // "coluna vs. valor fixo"; não entra neste loop genérico.
]

// Cores de destaque do card ativo, por etapa (classes estáticas p/ o Tailwind enxergar).
export const MODE_ACCENT = {
  cyan: { border: 'border-cyan-500', ring: 'ring-cyan-500/25', bg: 'bg-cyan-500/5', dot: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300' },
  amber: { border: 'border-amber-500', ring: 'ring-amber-500/25', bg: 'bg-amber-500/5', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  rose: { border: 'border-rose-500', ring: 'ring-rose-500/25', bg: 'bg-rose-500/5', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  // D/C e Contrapartida usam orange/fuchsia para NÃO confundir com as cores de
  // pendência do editor (âmbar = pendência de arquivo, vermelho/rose = de modelo).
  orange: { border: 'border-orange-500', ring: 'ring-orange-500/25', bg: 'bg-orange-500/5', dot: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
  fuchsia: { border: 'border-fuchsia-500', ring: 'ring-fuchsia-500/25', bg: 'bg-fuchsia-500/5', dot: 'bg-fuchsia-500', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
} as const

export type SetDef = Dispatch<SetStateAction<TreatmentDefinition>>

// Campos comuns às duas modalidades de contrapartida. Só a coluna
// identificadora (palavra-chave editável vs descrição read-only) difere.
export type CpItemComum = { conta: string; historicoFixo?: string; direcao?: Direcao; pular?: boolean }
