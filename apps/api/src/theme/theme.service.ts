import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Service do tema global do sistema — cores por módulo.
 * Editável pelo Design System (/admin/design-system) por master/empresaMaster.
 * Carregada uma vez por sessão pelo ThemeProvider do frontend, que injeta
 * as cores como CSS variables em :root (--mod-<slug>).
 */
@Injectable()
export class ThemeService {
  async list() {
    return prisma.moduleColor.findMany({ orderBy: { label: 'asc' } })
  }

  async upsert(slug: string, label: string, color: string, userId?: string) {
    const normalizedColor = color.trim().toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(normalizedColor)) {
      throw new Error('Cor inválida — use formato hex #RRGGBB (ex: #10b981)')
    }
    return prisma.moduleColor.upsert({
      where: { slug },
      update: { color: normalizedColor, label, updatedBy: userId ?? null },
      create: { slug, label, color: normalizedColor, updatedBy: userId ?? null },
    })
  }

  async reset(slug: string) {
    const defaults = await this.defaults()
    const def = defaults.find(d => d.slug === slug)
    if (!def) throw new Error(`Slug desconhecido: ${slug}`)
    return prisma.moduleColor.upsert({
      where: { slug },
      update: { color: def.color, label: def.label, updatedBy: null },
      create: { slug, label: def.label, color: def.color },
    })
  }

  /** Cores padrão — semeadas no primeiro acesso e usadas como referência pelo "Resetar". */
  async defaults() {
    return DEFAULT_MODULE_COLORS
  }

  /** Seed inicial: garante que todas as entradas padrão existem no banco. */
  async ensureSeeded() {
    const existing = await prisma.moduleColor.findMany({ select: { slug: true } })
    const existingSlugs = new Set(existing.map(e => e.slug))
    const toCreate = DEFAULT_MODULE_COLORS.filter(d => !existingSlugs.has(d.slug))
    if (toCreate.length > 0) {
      await prisma.moduleColor.createMany({ data: toCreate, skipDuplicates: true })
    }
  }
}

/** Cores padrão dos módulos — match com sidebar groups e MODULE_COLOR consts do frontend. */
export const DEFAULT_MODULE_COLORS = [
  { slug: 'cadastros',     label: 'Cadastros',     color: '#10b981' },
  { slug: 'comercial',     label: 'Comercial',     color: '#fb7185' },
  { slug: 'corporativo',   label: 'Corporativo',   color: '#0ea5e9' },
  { slug: 'administrativo', label: 'Administrativo', color: '#38bdf8' },
  { slug: 'legalizacao',   label: 'Legalização',   color: '#e879f9' },
  { slug: 'trabalhista',   label: 'Trabalhista',   color: '#a3e635' },
  { slug: 'fiscal',        label: 'Fiscal',        color: '#0369a1' },
  { slug: 'contabil',      label: 'Contábil',      color: '#a78bfa' },
  { slug: 'ferramentas',   label: 'Ferramentas',   color: '#8b5cf6' },
  { slug: 'ti',            label: 'TI',            color: '#22d3ee' },
  { slug: 'qualidade',     label: 'Qualidade',     color: '#f59e0b' },
  { slug: 'configuracoes', label: 'Configurações', color: '#f97316' },
  { slug: 'processos',     label: 'Processos',     color: '#8b5cf6' },
  { slug: 'faq',           label: 'FAQ',           color: '#0891b2' },
  { slug: 'perfil',        label: 'Perfil',        color: '#5ea3cb' },
] as const
