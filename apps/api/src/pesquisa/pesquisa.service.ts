import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { CreatePesquisaInput, ResponderPesquisaInput } from '@saas/types'
import { EmailService } from '../common/email.service'

@Injectable()
export class PesquisaService {
  constructor(private readonly emailService: EmailService) {}

  async list(empresaId?: string) {
    return prisma.pesquisaSatisfacao.findMany({
      where: empresaId ? { empresaId } : {},
      orderBy: { createdAt: 'desc' },
    })
  }

  async getByToken(token: string) {
    const pesquisa = await prisma.pesquisaSatisfacao.findUnique({ where: { token } })
    if (!pesquisa) throw new Error('Pesquisa nao encontrada')

    // Enriquecer com dados de cliente, orcamento e empresa para a pagina publica
    const cliente = pesquisa.clienteId
      ? await prisma.cliente.findUnique({
          where: { id: pesquisa.clienteId },
          select: { id: true, razaoSocial: true, nomeFantasia: true, email: true },
        }).catch(() => null)
      : null

    const orcamento = pesquisa.orcamentoId
      ? await prisma.orcamento.findUnique({
          where: { id: pesquisa.orcamentoId },
          select: { id: true, numero: true, contatos: true },
        }).catch(() => null)
      : null

    const empresa = pesquisa.empresaId
      ? await prisma.empresa.findUnique({
          where: { id: pesquisa.empresaId },
          select: { id: true, razaoSocial: true, nomeFantasia: true, logoUrl: true },
        }).catch(() => null)
      : null

    return { ...pesquisa, cliente, orcamento, empresa }
  }

  async getByOrcamento(orcamentoId: string) {
    return prisma.pesquisaSatisfacao.findFirst({
      where: { orcamentoId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(input: CreatePesquisaInput, empresaId?: string) {
    return prisma.pesquisaSatisfacao.create({
      data: {
        clienteId: input.clienteId || null,
        orcamentoId: input.orcamentoId || null,
        execucaoId: input.execucaoId || null,
        empresaId: empresaId || null,
      },
    })
  }

  async enviar(id: string) {
    return prisma.pesquisaSatisfacao.update({
      where: { id },
      data: { enviadaEm: new Date() },
    })
  }

  async responder(input: ResponderPesquisaInput) {
    const pesquisa = await prisma.pesquisaSatisfacao.findUnique({ where: { token: input.token } })
    if (!pesquisa) throw new Error('Pesquisa nao encontrada')
    if (pesquisa.respondidaEm) throw new Error('Esta pesquisa ja foi respondida')

    return prisma.pesquisaSatisfacao.update({
      where: { token: input.token },
      data: {
        respondenteNome: input.respondenteNome || null,
        respondenteArea: input.respondenteArea || null,
        respondenteEmail: input.respondenteEmail || null,
        q1Atendeu: input.q1Atendeu ?? null,
        q2Qualidade: input.q2Qualidade ?? null,
        q3Recomendaria: input.q3Recomendaria ?? null,
        nota: input.nota ?? null,
        comentario: input.comentario || null,
        respondidaEm: new Date(),
      },
    })
  }

  async delete(id: string) {
    return prisma.pesquisaSatisfacao.delete({ where: { id } })
  }

  // ── Fluxo automatico para orcamentos finalizados ──────────

  async criarParaOrcamento(orcamentoId: string, empresaId?: string) {
    // Evita duplicar
    const existente = await this.getByOrcamento(orcamentoId)
    if (existente) return existente

    const orc = await prisma.orcamento.findUnique({
      where: { id: orcamentoId },
      select: { id: true, clienteId: true, empresaId: true },
    })
    if (!orc) throw new Error('Orcamento nao encontrado')

    return prisma.pesquisaSatisfacao.create({
      data: {
        clienteId: orc.clienteId,
        orcamentoId: orc.id,
        empresaId: empresaId || orc.empresaId || null,
      },
    })
  }

  async enviarPorEmail(id: string, destinatarios?: string[]) {
    const pesquisa = await prisma.pesquisaSatisfacao.findUnique({ where: { id } })
    if (!pesquisa) throw new Error('Pesquisa nao encontrada')

    const cliente = pesquisa.clienteId
      ? await prisma.cliente.findUnique({ where: { id: pesquisa.clienteId }, select: { razaoSocial: true, email: true } }).catch(() => null)
      : null

    const empresa = pesquisa.empresaId
      ? await prisma.empresa.findUnique({ where: { id: pesquisa.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null)
      : null

    const orcamento = pesquisa.orcamentoId
      ? await prisma.orcamento.findUnique({ where: { id: pesquisa.orcamentoId }, select: { numero: true } }).catch(() => null)
      : null

    const emails = new Set<string>()
    if (destinatarios?.length) {
      for (const e of destinatarios) if (e.trim()) emails.add(e.trim())
    } else if (cliente?.email) {
      emails.add(cliente.email)
    }
    if (emails.size === 0) throw new Error('Nenhum destinatario informado')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const link = `${baseUrl}/pesquisa/${pesquisa.token}`
    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || 'Empresa'
    const clienteNome = cliente?.razaoSocial || 'Cliente'
    const numeroOrc = orcamento?.numero ? `#${String(orcamento.numero).padStart(4, '0')}` : ''

    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8" /></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          ${empresa?.logoUrl ? `<div style="text-align:center; margin-bottom: 24px;"><img src="${empresa.logoUrl}" alt="${empresaNome}" style="max-height: 60px;" /></div>` : ''}
          <h2 style="color: #fb7185; margin: 0 0 16px 0; font-size: 22px;">Sua opiniao e muito importante</h2>
          <p style="color: #444; line-height: 1.6;">Prezado(a) <strong>${clienteNome}</strong>,</p>
          <p style="color: #444; line-height: 1.6;">Concluimos o atendimento da proposta ${numeroOrc} e gostariamos de saber sua experiencia. A pesquisa leva menos de 1 minuto e e fundamental para melhorarmos continuamente nossos servicos.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${link}" style="display: inline-block; background: #fb7185; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Responder pesquisa</a>
          </div>
          <p style="color: #777; font-size: 13px; line-height: 1.6;">Obrigado por confiar na <strong>${empresaNome}</strong>.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">${empresaNome} &middot; ${new Date().getFullYear()}</p>
        </div>
      </body></html>
    `

    await this.emailService.sendMail({
      to: [...emails],
      subject: `Pesquisa de Satisfacao ${numeroOrc} - ${empresaNome}`,
      html,
    })

    await prisma.pesquisaSatisfacao.update({
      where: { id },
      data: { enviadaEm: new Date() },
    })

    return { ok: true, link, destinatarios: [...emails] }
  }

  // ── Estatisticas / NPS ────────────────────────────────────

  async getStats(empresaId?: string) {
    const where: any = empresaId ? { empresaId } : {}
    const [total, respondidas, notas] = await Promise.all([
      prisma.pesquisaSatisfacao.count({ where }),
      prisma.pesquisaSatisfacao.count({ where: { ...where, respondidaEm: { not: null } } }),
      prisma.pesquisaSatisfacao.aggregate({ where: { ...where, nota: { not: null } }, _avg: { nota: true }, _count: { nota: true } }),
    ])

    // NPS classico (0-10): promotores 9-10, neutros 7-8, detratores 0-6
    const distribuicao = await prisma.pesquisaSatisfacao.groupBy({
      by: ['nota'],
      where: { ...where, nota: { not: null } },
      _count: true,
    })

    const promotores = distribuicao.filter(d => (d.nota ?? 0) >= 9).reduce((s, d) => s + d._count, 0)
    const detratores = distribuicao.filter(d => (d.nota ?? 0) <= 6).reduce((s, d) => s + d._count, 0)
    const totalResp = respondidas || 1
    const nps = Math.round(((promotores - detratores) / totalResp) * 100)

    return {
      total,
      respondidas,
      pendentes: total - respondidas,
      taxaResposta: total > 0 ? Math.round((respondidas / total) * 100) : 0,
      mediaNotas: Number(notas._avg.nota || 0),
      nps,
      distribuicao: distribuicao.map(d => ({ nota: d.nota, count: d._count })),
    }
  }
}
