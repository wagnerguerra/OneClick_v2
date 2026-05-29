import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

export interface WidgetLayoutItem {
  i: string   // widgetId
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  customLabel?: string
  // Controle de acesso. Ausente ou scope='all' = qualquer usuário com permissão
  // de módulo. scope='users': só userIds listados. scope='areas': só users cuja
  // areaId está em areaIds. Master/EmpresaMaster são exceção (sempre veem tudo).
  visibility?: {
    scope: 'all' | 'users' | 'areas'
    userIds: string[]
    areaIds: string[]
  }
}

@Injectable()
export class DashboardLayoutService {
  /**
   * Carrega o layout da empresa. Retorna null se ainda não foi customizado.
   * Frontend usa o default hardcoded nesse caso.
   */
  async get(empresaId: string): Promise<{ layout: WidgetLayoutItem[]; updatedAt: Date } | null> {
    const row = await prisma.dashboardLayout.findUnique({
      where: { empresaId },
      select: { layout: true, updatedAt: true },
    })
    if (!row) return null
    return {
      layout: Array.isArray(row.layout) ? (row.layout as unknown as WidgetLayoutItem[]) : [],
      updatedAt: row.updatedAt,
    }
  }

  /** Master/empresa-master salva o layout. Restrição é aplicada no router. */
  async save(empresaId: string, layout: WidgetLayoutItem[], userId?: string) {
    return prisma.dashboardLayout.upsert({
      where: { empresaId },
      create: { empresaId, layout: layout as any, updatedBy: userId || null },
      update: { layout: layout as any, updatedBy: userId || null },
    })
  }

  /** Remove a customização — força o default global. */
  async reset(empresaId: string) {
    await prisma.dashboardLayout.deleteMany({ where: { empresaId } })
    return { ok: true }
  }

  // ============================================================
  // Layout pessoal por usuário (sobrepõe o empresarial quando existe)
  // ============================================================

  /** Carrega layout pessoal. Retorna null se ainda não foi customizado pelo user. */
  async getForUser(userId: string): Promise<{ layout: WidgetLayoutItem[]; updatedAt: Date } | null> {
    const row = await prisma.dashboardLayoutUser.findUnique({
      where: { userId },
      select: { layout: true, updatedAt: true },
    })
    if (!row) return null
    return {
      layout: Array.isArray(row.layout) ? (row.layout as unknown as WidgetLayoutItem[]) : [],
      updatedAt: row.updatedAt,
    }
  }

  /** Qualquer usuário autenticado pode salvar o próprio layout. */
  async saveForUser(userId: string, empresaId: string | null, layout: WidgetLayoutItem[]) {
    return prisma.dashboardLayoutUser.upsert({
      where: { userId },
      create: { userId, empresaId, layout: layout as any },
      update: { layout: layout as any, empresaId },
    })
  }

  /** Remove personalização do user — volta pro layout empresarial (ou default). */
  async resetForUser(userId: string) {
    await prisma.dashboardLayoutUser.deleteMany({ where: { userId } })
    return { ok: true }
  }
}
