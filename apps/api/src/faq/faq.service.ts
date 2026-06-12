import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * FAQ editável pelo master. Os artigos no banco (faq_artigos) SOBRESCREVEM os
 * de código (componentes em apps/web/.../faq/_articles/<slug>.tsx) quando há
 * uma linha com o mesmo slug. `upsertOverride` é usado tanto para criar a 1ª
 * cópia ao editar um artigo de código quanto pela migração em lote.
 */
export interface FaqArtigoInput {
  slug: string
  titulo: string
  descricao: string
  modulo: string
  moduloColor: string
  icon: string
  categoria: string
  tags: string[]
  conteudoHtml: string
  publicado: boolean
  ordem: number
}

@Injectable()
export class FaqService {
  /** Lista artigos do banco. Master vê rascunhos; demais, só publicados. */
  async list(isMaster: boolean) {
    return prisma.faqArtigo.findMany({
      where: isMaster ? {} : { publicado: true },
      orderBy: [{ ordem: 'asc' }, { titulo: 'asc' }],
    })
  }

  async getBySlug(slug: string) {
    return prisma.faqArtigo.findUnique({ where: { slug } })
  }

  async create(data: FaqArtigoInput, userId?: string) {
    return prisma.faqArtigo.create({ data: { ...data, criadoPor: userId ?? null } })
  }

  async update(id: string, data: Partial<FaqArtigoInput>) {
    return prisma.faqArtigo.update({ where: { id }, data })
  }

  async delete(id: string) {
    await prisma.faqArtigo.delete({ where: { id } }).catch(() => {})
    return { ok: true }
  }

  async setPublicado(id: string, publicado: boolean) {
    return prisma.faqArtigo.update({ where: { id }, data: { publicado } })
  }

  async reordenar(items: Array<{ id: string; ordem: number }>) {
    await prisma.$transaction(
      items.map((i) => prisma.faqArtigo.update({ where: { id: i.id }, data: { ordem: i.ordem } })),
    )
    return { ok: true }
  }

  /**
   * Cria/atualiza por slug. Marca origemSistema=true (artigo migrado do código).
   * Não sobrescreve `publicado`/`ordem` num update pra não despublicar sem querer.
   */
  async upsertOverride(data: FaqArtigoInput, userId?: string) {
    return prisma.faqArtigo.upsert({
      where: { slug: data.slug },
      create: { ...data, origemSistema: true, criadoPor: userId ?? null },
      update: {
        titulo: data.titulo,
        descricao: data.descricao,
        modulo: data.modulo,
        moduloColor: data.moduloColor,
        icon: data.icon,
        categoria: data.categoria,
        tags: data.tags,
        conteudoHtml: data.conteudoHtml,
      },
    })
  }

  /** slugs + títulos dos artigos publicados — usado pela IA do helpdesk. */
  async listSlugsTitulos() {
    return prisma.faqArtigo.findMany({
      where: { publicado: true },
      select: { slug: true, titulo: true },
    })
  }
}
