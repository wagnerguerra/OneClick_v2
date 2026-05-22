import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

const CFG_MAX_TABS = 'tabs.max_tabs'
const DEFAULT_MAX = 10

/**
 * Extrai o module slug a partir de uma rota interna.
 * Ex: '/clientes' → 'clientes' · '/orcamentos/abc' → 'orcamentos'
 * Rotas como '/dashboard' são sempre acessíveis (não exigem permissão).
 */
function hrefToModuleSlug(href: string): string | null {
  const clean = href.split('?')[0]!.split('#')[0]
  const segments = clean.split('/').filter(Boolean)
  if (segments.length === 0) return null
  return segments[0] || null
}

// Rotas que não exigem permissão de módulo (acessíveis a qualquer logado)
const ROTAS_SEM_PERMISSAO = new Set(['dashboard', 'perfil', 'meus-servicos'])

@Injectable()
export class TabsService {
  // ── Listagem ──────────────────────────────────────────────

  async listarMinhas(userId: string) {
    return prisma.userTab.findMany({
      where: { userId },
      orderBy: [{ pinned: 'desc' }, { ordem: 'asc' }, { createdAt: 'asc' }],
    })
  }

  // ── Configuração ──────────────────────────────────────────

  async getMaxTabs(): Promise<number> {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: CFG_MAX_TABS } })
    const n = cfg?.value ? parseInt(cfg.value, 10) : DEFAULT_MAX
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX
  }

  async setMaxTabs(max: number) {
    const valor = Math.max(1, Math.min(50, Math.floor(max)))
    await prisma.systemConfig.upsert({
      where: { key: CFG_MAX_TABS },
      update: { value: String(valor), label: 'Número máximo de abas por usuário', group: 'tabs' },
      create: {
        key: CFG_MAX_TABS,
        value: String(valor),
        label: 'Número máximo de abas por usuário',
        group: 'tabs',
      },
    })
    return { maxTabs: valor }
  }

  // ── Permissões ────────────────────────────────────────────

  /**
   * Verifica se o user tem permissão de leitura no módulo correspondente
   * ao href. Master/EmpresaMaster sempre podem. Rotas em ROTAS_SEM_PERMISSAO
   * não exigem checagem (perfil, dashboard, meus-servicos).
   */
  async userPodeAcessarHref(userId: string, href: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isMaster: true, isEmpresaMaster: true },
    })
    if (!user) return false
    if (user.isMaster || user.isEmpresaMaster) return true

    const slug = hrefToModuleSlug(href)
    if (!slug) return true
    if (ROTAS_SEM_PERMISSAO.has(slug)) return true

    const perm = await prisma.userPermission.findFirst({
      where: { userId, moduleSlug: slug, canRead: true },
      select: { id: true },
    })
    return !!perm
  }

  // ── Operações ────────────────────────────────────────────

  /**
   * Adiciona uma aba ou retorna a existente (mesma href). Respeita o limite
   * configurado pelo master. Operação principal usada pela sidebar/route sync.
   */
  async addOrGet(userId: string, input: { href: string; label: string; icon?: string | null }) {
    // Já existe? retorna sem incrementar
    const existente = await prisma.userTab.findUnique({
      where: { userId_href: { userId, href: input.href } },
    })
    if (existente) return existente

    // Verifica limite
    const total = await prisma.userTab.count({ where: { userId } })
    const max = await this.getMaxTabs()
    if (total >= max) {
      throw new Error(`Limite de ${max} abas atingido. Feche alguma para abrir outra.`)
    }

    // Calcula próxima ordem (ao final da lista, depois de todas)
    const ultimaOrdem = await prisma.userTab.aggregate({
      where: { userId },
      _max: { ordem: true },
    })
    const ordem = (ultimaOrdem._max.ordem ?? -1) + 1

    return prisma.userTab.create({
      data: {
        userId,
        href: input.href,
        label: input.label,
        icon: input.icon ?? null,
        ordem,
      },
    })
  }

  /**
   * Atualiza o label de uma aba existente identificada pelo href. Usado por
   * páginas de detalhe (ex: /orcamentos/abc) para colocar o nome/número do
   * registro carregado no título da aba (ex: "Orçamento: #4489").
   * Silenciosamente no-op se não houver aba para esse href.
   */
  async updateLabel(userId: string, href: string, label: string) {
    const tab = await prisma.userTab.findUnique({
      where: { userId_href: { userId, href } },
    })
    if (!tab) return null
    if (tab.label === label) return tab
    return prisma.userTab.update({
      where: { id: tab.id },
      data: { label },
    })
  }

  async close(id: string, userId: string) {
    const t = await prisma.userTab.findUnique({ where: { id }, select: { userId: true } })
    if (!t || t.userId !== userId) throw new Error('Aba não encontrada')
    await prisma.userTab.delete({ where: { id } })
    return { ok: true }
  }

  async closeMultiple(ids: string[], userId: string) {
    const result = await prisma.userTab.deleteMany({
      where: { id: { in: ids }, userId },
    })
    return { count: result.count }
  }

  /**
   * Fixa/desafixa aba. Para fixar (pinned=true) o user precisa ter permissão
   * de acesso ao módulo correspondente — proteção pra evitar fixar atalhos
   * pra rotas que ele não pode acessar.
   */
  async setPinned(id: string, userId: string, pinned: boolean) {
    const tab = await prisma.userTab.findUnique({ where: { id } })
    if (!tab || tab.userId !== userId) throw new Error('Aba não encontrada')

    if (pinned) {
      const podeAcessar = await this.userPodeAcessarHref(userId, tab.href)
      if (!podeAcessar) {
        throw new Error('Você não pode fixar uma aba de um módulo ao qual não tem acesso.')
      }
    }

    return prisma.userTab.update({
      where: { id },
      data: { pinned },
    })
  }

  /**
   * Reordena as abas conforme a lista de IDs informada (na ordem desejada).
   * Aceita array misto pinned/não-pinned; não muda o status de pinned.
   * Validação: todos os IDs devem pertencer ao user.
   */
  async reorder(userId: string, orderedIds: string[]) {
    // Verifica ownership de todos os IDs
    const tabs = await prisma.userTab.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true },
    })
    if (tabs.length !== orderedIds.length) {
      throw new Error('Uma ou mais abas não pertencem ao usuário')
    }
    // Atualiza em paralelo — ordem = índice na lista
    await Promise.all(orderedIds.map((id, idx) =>
      prisma.userTab.update({ where: { id }, data: { ordem: idx } }),
    ))
    return { ok: true }
  }

  // ── Limpeza automática (opcional) ─────────────────────────

  /**
   * Remove abas duplicadas pelo mesmo href (defesa contra inconsistências).
   * Mantém a primeira ocorrência (menor ordem).
   */
  async deduplicar(userId: string) {
    const tabs = await prisma.userTab.findMany({
      where: { userId },
      orderBy: [{ ordem: 'asc' }],
    })
    const vistos = new Set<string>()
    const idsParaRemover: string[] = []
    for (const t of tabs) {
      if (vistos.has(t.href)) idsParaRemover.push(t.id)
      else vistos.add(t.href)
    }
    if (idsParaRemover.length > 0) {
      await prisma.userTab.deleteMany({ where: { id: { in: idsParaRemover } } })
    }
    return { removidas: idsParaRemover.length }
  }
}
