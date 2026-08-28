import type { ColorName } from '@/lib/color-styles'

/**
 * Cor (ColorName do color-styles) por área/categoria de cliente — FONTE ÚNICA.
 * Usada tanto nos badges de área da LISTAGEM `/clientes` quanto na aba
 * "Obrigações" de `/clientes/[id]` (obrigacoes-cliente-section), pra que batam.
 *
 * Chave NORMALIZADA (minúscula, sem acento). Consome via BADGE/TEXT/... do
 * color-styles (dark-correto). Área não mapeada -> `slate` (visível no dark, ao
 * contrário do cinza fixo `#6b7280` antigo, que sumia).
 */
export const AREA_TONE: Record<string, ColorName> = {
  fiscal: 'violet',
  trabalhista: 'lime',
  contabil: 'indigo',
  legalizacao: 'fuchsia',
  societario: 'blue',
  administrativo: 'sky',
  financeiro: 'cyan',
  pessoal: 'orange',
  dp: 'orange',
}

/** Normaliza o nome da área (minúscula, sem acento) e devolve a ColorName (default `slate`). */
export function areaTone(nome: string): ColorName {
  const key = nome.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return AREA_TONE[key] ?? 'slate'
}
