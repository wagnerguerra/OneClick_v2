import type { ColorName } from '@/lib/color-styles'
import {
  Calculator, FileText, Users, Briefcase, Building2,
  ClipboardList, Wallet, UserCog, type LucideIcon,
} from 'lucide-react'

/**
 * Cor (ColorName do color-styles → BADGE/TEXT/…, dark-correto) + ícone por
 * área/categoria de cliente — FONTE ÚNICA. Usada nos badges de área e na
 * legenda de filtro da LISTAGEM `/clientes` E na aba "Obrigações" de
 * `/clientes/[id]` (obrigacoes-cliente-section), pra que tudo bata. Mudar a cor
 * de uma área AQUI reflete em todas as telas.
 *
 * Chave NORMALIZADA (minúscula, sem acento). Área não mapeada → `slate`
 * (visível no dark, ao contrário do cinza fixo antigo que sumia).
 */
export const AREA_BADGE_MAP: Record<string, { tone: ColorName; Icon: LucideIcon }> = {
  contabil:       { tone: 'indigo',  Icon: Calculator },
  fiscal:         { tone: 'violet',  Icon: FileText },
  trabalhista:    { tone: 'lime',    Icon: Users },
  societario:     { tone: 'blue',    Icon: Briefcase },
  legalizacao:    { tone: 'rose',    Icon: Building2 },
  administrativo: { tone: 'sky',     Icon: ClipboardList },
  financeiro:     { tone: 'cyan',    Icon: Wallet },
  pessoal:        { tone: 'orange',  Icon: UserCog },
  dp:             { tone: 'orange',  Icon: UserCog },
}

/** Normaliza o nome da área: minúscula, sem acento. */
export function normalizeArea(nome: string): string {
  return nome.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Devolve a ColorName da área (default `slate`). */
export function areaTone(nome: string): ColorName {
  return AREA_BADGE_MAP[normalizeArea(nome)]?.tone ?? 'slate'
}
