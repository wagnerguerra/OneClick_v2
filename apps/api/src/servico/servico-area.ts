import { TRPCError } from '@trpc/server'
import { prisma, type Prisma } from '@saas/db'
import { getUserPermissions } from '../trpc/trpc.service'

/**
 * Recorte do catálogo de Serviços pela área do usuário (05/10/2026).
 *
 * Sub-permissão `somente_minha_area` do módulo `servicos`: marcada, o usuário
 * lista e edita APENAS os serviços da própria área (`User.areaId` ×
 * `Servico.areaId`). Vale para o catálogo — serviço, etapas, passos, modelos de
 * e-mail, lembretes, campos, variações, materiais, encadeamentos. As execuções
 * (Meus Serviços, andamento) seguem as regras delas, fora daqui.
 *
 * Item de fluxo (bloco) costuma não ter área própria: herda a do serviço-pai.
 * Master e dono da empresa nunca são recortados.
 */

export interface CtxArea {
  userId?: string
  isMaster?: boolean
  isEmpresaMaster?: boolean
}

/** Área a que o usuário está preso; `null` = sem recorte. '' = recortado, mas sem área. */
export async function areaRestrita(ctx: CtxArea): Promise<string | null> {
  if (!ctx.userId || ctx.isMaster || ctx.isEmpresaMaster) return null
  const perms = await getUserPermissions(ctx.userId)
  const sub = (perms.find((p) => p.moduleSlug === 'servicos')?.subPermissions ?? {}) as Record<string, unknown>
  if (sub.somente_minha_area !== true) return null
  const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { areaId: true } })
  return u?.areaId ?? ''
}

/** Filtro de listagem: a área do serviço, ou a do pai quando o item não tem a sua. */
export function whereDaArea(areaId: string): Prisma.ServicoWhereInput {
  return { OR: [{ areaId }, { areaId: null, servicoPai: { is: { areaId } } }] }
}

/** Área efetiva do serviço: a dele, senão a do pai (até 5 níveis). */
async function areaDoServico(servicoId: string): Promise<string | null> {
  let id: string | null = servicoId
  for (let i = 0; i < 5 && id; i++) {
    const s: { areaId: string | null; servicoPaiId: string | null } | null =
      await prisma.servico.findUnique({ where: { id }, select: { areaId: true, servicoPaiId: true } })
    if (!s) return null
    if (s.areaId) return s.areaId
    id = s.servicoPaiId
  }
  return null
}

const negar = (msg: string) => new TRPCError({ code: 'FORBIDDEN', message: msg })

/** Barra o acesso a um serviço fora da área do usuário (quando recortado). */
export async function exigirServicoDaArea(ctx: CtxArea, servicoId: string | null | undefined) {
  const area = await areaRestrita(ctx)
  if (area === null || !servicoId) return
  if (!area) throw negar('Sua área não está definida no cadastro — peça para definirem antes de editar serviços.')
  const doServico = await areaDoServico(servicoId)
  if (doServico !== area) throw negar('Você só pode ver e editar os serviços da sua área.')
}

/** Vários serviços de uma vez (exclusão em lote, grupos). */
export async function exigirServicosDaArea(ctx: CtxArea, ids: string[]) {
  if ((await areaRestrita(ctx)) === null) return
  for (const id of ids) await exigirServicoDaArea(ctx, id)
}

// ── De qual serviço é este registro? ───────────────────────────

export const servicoDa = {
  async etapa(id: string) {
    return (await prisma.servicoEtapa.findUnique({ where: { id }, select: { servicoId: true } }))?.servicoId ?? null
  },
  async passo(id: string) {
    return (await prisma.servicoPasso.findUnique({ where: { id }, select: { etapa: { select: { servicoId: true } } } }))?.etapa.servicoId ?? null
  },
  async templateEmail(id: string) {
    const t = await prisma.servicoPassoEmailTemplate.findUnique({ where: { id }, select: { passoId: true } })
    return t ? servicoDa.passo(t.passoId) : null
  },
  async anexoTemplate(id: string) {
    const a = await prisma.servicoPassoEmailTemplateAnexo.findUnique({ where: { id }, select: { templateId: true } })
    return a ? servicoDa.templateEmail(a.templateId) : null
  },
  async lembrete(id: string) {
    const l = await prisma.servicoPassoLembrete.findUnique({ where: { id }, select: { passoId: true } })
    return l ? servicoDa.passo(l.passoId) : null
  },
  async campoCliente(id: string) {
    const c = await prisma.servicoPassoCampoCliente.findUnique({ where: { id }, select: { passoId: true } })
    return c ? servicoDa.passo(c.passoId) : null
  },
  async variacao(id: string) {
    return (await prisma.orcamentoCatalogoTexto.findUnique({ where: { id }, select: { catalogoId: true } }))?.catalogoId ?? null
  },
  async encadeamento(id: string) {
    return (await prisma.servicoEncadeamento.findUnique({ where: { id }, select: { servicoOrigemId: true } }))?.servicoOrigemId ?? null
  },
  async material(id: string) {
    const m = await prisma.servicoMaterial.findUnique({ where: { id }, select: { etapaId: true, passoId: true } })
    if (!m) return null
    return m.passoId ? servicoDa.passo(m.passoId) : m.etapaId ? servicoDa.etapa(m.etapaId) : null
  },
}
