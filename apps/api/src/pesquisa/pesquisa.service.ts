import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import type { CreatePesquisaInput, ResponderPesquisaInput, SalvarModeloPesquisaInput, ResponderEnvioInput } from '@saas/types'
import { EmailService } from '../common/email.service'
import { NotificationService } from '../notification/notification.service'

const PESQ_TIPOS = ['ESTRELAS', 'NPS', 'SIM_NAO', 'TEXTO']

@Injectable()
export class PesquisaService {
  constructor(
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
  ) {}

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

  // ══════════════════════════════════════════════════════════════════
  // NOVO — Pesquisa configurável e versionada (pesquisa_modelo/pergunta/envio)
  // ══════════════════════════════════════════════════════════════════

  private async modeloAtivoRow(empresaId?: string | null): Promise<{ id: string; titulo: string; versao: number } | null> {
    const r = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, titulo, versao FROM pesquisa_modelo WHERE ativo = true AND empresa_id IS NOT DISTINCT FROM $1 ORDER BY versao DESC LIMIT 1`,
      empresaId ?? null,
    )
    return r[0] ?? null
  }

  private async contarRespondidos(modeloId: string): Promise<number> {
    const r = await prisma.$queryRawUnsafe<any[]>(
      `SELECT count(*)::int n FROM pesquisa_envio WHERE modelo_id = $1 AND respondida_em IS NOT NULL`, modeloId,
    )
    return r[0]?.n ?? 0
  }

  private async inserirPerguntas(modeloId: string, perguntas: { tipo: string; enunciado: string; obrigatoria?: boolean }[]) {
    const validas = perguntas.filter(p => p.enunciado?.trim() && PESQ_TIPOS.includes(p.tipo))
    for (let i = 0; i < validas.length; i++) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO pesquisa_pergunta (id, modelo_id, ordem, tipo, enunciado, obrigatoria) VALUES ($1,$2,$3,$4,$5,$6)`,
        randomUUID(), modeloId, i, validas[i].tipo, validas[i].enunciado.trim(), validas[i].obrigatoria !== false,
      )
    }
  }

  /** Cria o modelo default (perguntas equivalentes às fixas antigas). */
  private async criarModeloDefault(empresaId?: string | null) {
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO pesquisa_modelo (id, titulo, versao, ativo, empresa_id) VALUES ($1,$2,1,true,$3)`,
      id, 'Pesquisa de Satisfação', empresaId ?? null,
    )
    await this.inserirPerguntas(id, [
      { tipo: 'SIM_NAO', enunciado: 'O serviço atendeu suas expectativas?' },
      { tipo: 'ESTRELAS', enunciado: 'Como você avalia a qualidade do nosso atendimento?' },
      { tipo: 'SIM_NAO', enunciado: 'Você recomendaria nossos serviços?' },
      { tipo: 'NPS', enunciado: 'De 0 a 10, o quanto você nos recomendaria?' },
      { tipo: 'TEXTO', enunciado: 'Comentários e sugestões', obrigatoria: false },
    ])
    return { id, titulo: 'Pesquisa de Satisfação', versao: 1 }
  }

  private async perguntasDoModelo(modeloId: string) {
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT id, ordem, tipo, enunciado, obrigatoria FROM pesquisa_pergunta WHERE modelo_id = $1 ORDER BY ordem ASC`, modeloId,
    )
  }

  /** Modelo ativo + perguntas (cria default se não existir). Usado na config. */
  async getModeloAtivo(empresaId?: string | null) {
    const modelo = (await this.modeloAtivoRow(empresaId)) ?? (await this.criarModeloDefault(empresaId))
    const [perguntas, respondidos] = await Promise.all([
      this.perguntasDoModelo(modelo.id),
      this.contarRespondidos(modelo.id),
    ])
    return { ...modelo, perguntas, temRespostas: respondidos > 0 }
  }

  async listVersoes(empresaId?: string | null) {
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id, m.titulo, m.versao, m.ativo, m.created_at AS "createdAt",
              (SELECT count(*)::int FROM pesquisa_pergunta p WHERE p.modelo_id = m.id) AS "qtdPerguntas",
              (SELECT count(*)::int FROM pesquisa_envio e WHERE e.modelo_id = m.id AND e.respondida_em IS NOT NULL) AS "qtdRespostas"
         FROM pesquisa_modelo m WHERE m.empresa_id IS NOT DISTINCT FROM $1 ORDER BY m.versao DESC`, empresaId ?? null,
    )
  }

  /**
   * Salva o modelo. Se a versão ativa já tem respostas → cria NOVA versão
   * (preserva respostas antigas na versão delas). Senão, edita in-place.
   */
  async salvarModelo(input: SalvarModeloPesquisaInput, userId?: string, empresaId?: string | null) {
    const ativo = await this.modeloAtivoRow(empresaId)
    if (!ativo) {
      const id = randomUUID()
      await prisma.$executeRawUnsafe(`INSERT INTO pesquisa_modelo (id, titulo, versao, ativo, empresa_id, created_by) VALUES ($1,$2,1,true,$3,$4)`, id, input.titulo, empresaId ?? null, userId ?? null)
      await this.inserirPerguntas(id, input.perguntas)
      return { id, versao: 1, novaVersao: false }
    }
    const respondidos = await this.contarRespondidos(ativo.id)
    if (respondidos > 0) {
      await prisma.$executeRawUnsafe(`UPDATE pesquisa_modelo SET ativo = false WHERE id = $1`, ativo.id)
      const id = randomUUID()
      const versao = ativo.versao + 1
      await prisma.$executeRawUnsafe(`INSERT INTO pesquisa_modelo (id, titulo, versao, ativo, empresa_id, created_by) VALUES ($1,$2,$3,true,$4,$5)`, id, input.titulo, versao, empresaId ?? null, userId ?? null)
      await this.inserirPerguntas(id, input.perguntas)
      return { id, versao, novaVersao: true }
    }
    // edita in-place
    await prisma.$executeRawUnsafe(`UPDATE pesquisa_modelo SET titulo = $2 WHERE id = $1`, ativo.id, input.titulo)
    await prisma.$executeRawUnsafe(`DELETE FROM pesquisa_pergunta WHERE modelo_id = $1`, ativo.id)
    await this.inserirPerguntas(ativo.id, input.perguntas)
    return { id: ativo.id, versao: ativo.versao, novaVersao: false }
  }

  // ── Envio (manual pelo comercial) ─────────────────────────────────
  private linkPublico(token: string) {
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
    return `${base}/pesquisa/${token}`
  }

  /** Garante um envio (não-respondido) para o orçamento e retorna {id, token, link}. */
  async prepararEnvio(orcamentoId: string, userId?: string, empresaId?: string | null) {
    const ex = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, token FROM pesquisa_envio WHERE orcamento_id = $1 AND respondida_em IS NULL ORDER BY created_at DESC LIMIT 1`, orcamentoId,
    )
    if (ex[0]) return { id: ex[0].id, token: ex[0].token, link: this.linkPublico(ex[0].token) }
    const orc = await prisma.orcamento.findUnique({ where: { id: orcamentoId }, select: { clienteId: true, empresaId: true } })
    const emp = empresaId ?? orc?.empresaId ?? null
    const modelo = (await this.modeloAtivoRow(emp)) ?? (await this.criarModeloDefault(emp))
    const id = randomUUID()
    const token = randomUUID().replace(/-/g, '')
    await prisma.$executeRawUnsafe(
      `INSERT INTO pesquisa_envio (id, token, modelo_id, orcamento_id, cliente_id, empresa_id, enviada_por) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      id, token, modelo.id, orcamentoId, orc?.clienteId ?? null, emp, userId ?? null,
    )
    return { id, token, link: this.linkPublico(token) }
  }

  /** Envia o link por e-mail (cria/usa o envio do orçamento). Reusa o template atual. */
  async enviarPesquisaPorEmail(orcamentoId: string, destinatarios: string[] | undefined, userId?: string, empresaId?: string | null) {
    const envio = await this.prepararEnvio(orcamentoId, userId, empresaId)
    const orc = await prisma.orcamento.findUnique({ where: { id: orcamentoId }, select: { numero: true, clienteId: true, empresaId: true } })
    const cliente = orc?.clienteId ? await prisma.cliente.findUnique({ where: { id: orc.clienteId }, select: { razaoSocial: true, email: true } }).catch(() => null) : null
    const empresa = (empresaId ?? orc?.empresaId) ? await prisma.empresa.findUnique({ where: { id: (empresaId ?? orc?.empresaId)! }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null) : null

    const emails = new Set<string>()
    if (destinatarios?.length) for (const e of destinatarios) { if (e.trim()) emails.add(e.trim()) }
    else if (cliente?.email) emails.add(cliente.email)
    if (emails.size === 0) throw new Error('Nenhum destinatário informado')

    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || 'Empresa'
    const clienteNome = cliente?.razaoSocial || 'Cliente'
    const numeroOrc = orc?.numero ? `#${String(orc.numero).padStart(4, '0')}` : ''
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8" /></head>
      <body style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
        <div style="background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
          ${empresa?.logoUrl ? `<div style="text-align:center;margin-bottom:24px;"><img src="${empresa.logoUrl}" alt="${empresaNome}" style="max-height:60px;" /></div>` : ''}
          <h2 style="color:#fb7185;margin:0 0 16px 0;font-size:22px;">Sua opinião é muito importante</h2>
          <p style="color:#444;line-height:1.6;">Prezado(a) <strong>${clienteNome}</strong>,</p>
          <p style="color:#444;line-height:1.6;">Concluímos o atendimento da proposta ${numeroOrc} e gostaríamos de saber sua experiência. A pesquisa leva menos de 1 minuto.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${envio.link}" style="display:inline-block;background:#fb7185;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;">Responder pesquisa</a>
          </div>
          <p style="color:#777;font-size:13px;line-height:1.6;">Obrigado por confiar na <strong>${empresaNome}</strong>.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#999;font-size:12px;text-align:center;">${empresaNome} &middot; ${new Date().getFullYear()}</p>
        </div>
      </body></html>`
    await this.emailService.sendMail({ to: [...emails], subject: `Pesquisa de Satisfação ${numeroOrc} - ${empresaNome}`, html })
    await prisma.$executeRawUnsafe(`UPDATE pesquisa_envio SET enviada_em = CURRENT_TIMESTAMP WHERE id = $1`, envio.id)
    return { ok: true, link: envio.link, destinatarios: [...emails] }
  }

  // ── Público: carregar e responder ─────────────────────────────────
  async getEnvioPorToken(token: string) {
    const er = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, token, modelo_id AS "modeloId", orcamento_id AS "orcamentoId", cliente_id AS "clienteId", empresa_id AS "empresaId", respondida_em AS "respondidaEm" FROM pesquisa_envio WHERE token = $1`, token,
    )
    const envio = er[0]
    if (!envio) throw new Error('Pesquisa não encontrada')
    const modeloRow = await prisma.$queryRawUnsafe<any[]>(`SELECT titulo FROM pesquisa_modelo WHERE id = $1`, envio.modeloId)
    const perguntas = await this.perguntasDoModelo(envio.modeloId)
    const cliente = envio.clienteId ? await prisma.cliente.findUnique({ where: { id: envio.clienteId }, select: { razaoSocial: true, nomeFantasia: true } }).catch(() => null) : null
    const empresa = envio.empresaId ? await prisma.empresa.findUnique({ where: { id: envio.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } }).catch(() => null) : null
    return {
      token: envio.token,
      titulo: modeloRow[0]?.titulo ?? 'Pesquisa de Satisfação',
      respondida: !!envio.respondidaEm,
      perguntas,
      cliente,
      empresa,
    }
  }

  async responderEnvio(input: ResponderEnvioInput) {
    const er = await prisma.$queryRawUnsafe<any[]>(`SELECT id, respondida_em AS "respondidaEm" FROM pesquisa_envio WHERE token = $1`, input.token)
    const envio = er[0]
    if (!envio) throw new Error('Pesquisa não encontrada')
    if (envio.respondidaEm) throw new Error('Esta pesquisa já foi respondida')

    for (const r of input.respostas) {
      if (!r.perguntaId) continue
      const temValor = r.valorNumero != null || r.valorBooleano != null || (r.valorTexto != null && r.valorTexto.trim() !== '')
      if (!temValor) continue
      await prisma.$executeRawUnsafe(
        `INSERT INTO pesquisa_resposta_item (id, envio_id, pergunta_id, valor_numero, valor_booleano, valor_texto) VALUES ($1,$2,$3,$4,$5,$6)`,
        randomUUID(), envio.id, r.perguntaId,
        r.valorNumero ?? null, r.valorBooleano ?? null, (r.valorTexto && r.valorTexto.trim()) || null,
      )
    }
    await prisma.$executeRawUnsafe(
      `UPDATE pesquisa_envio SET respondida_em = CURRENT_TIMESTAMP, respondente_nome = $2, respondente_email = $3 WHERE id = $1`,
      envio.id, input.respondenteNome?.trim() || null, input.respondenteEmail?.trim() || null,
    )
    await this.notificarRespostaComercial(envio.id).catch(() => {})
    return { ok: true }
  }

  /** Resolve userIds + emails do comercial (área comercial: líder + membros ativos). */
  private async resolverComercial(empresaId?: string | null): Promise<{ ids: string[]; emails: string[] }> {
    const cfg = await prisma.orcamentoConfig.findFirst({ where: { empresaId: empresaId ?? null }, select: { areaComercialId: true } }).catch(() => null)
    const areaId = cfg?.areaComercialId
    if (!areaId) return { ids: [], emails: [] }
    const [area, membros] = await Promise.all([
      prisma.area.findUnique({ where: { id: areaId }, select: { leaderId: true } }).catch(() => null),
      prisma.user.findMany({ where: { areaId, isActive: true }, select: { id: true, email: true } }).catch(() => []),
    ])
    const idSet = new Set<string>()
    if (area?.leaderId) idSet.add(area.leaderId)
    for (const m of membros) idSet.add(m.id)
    const ids = [...idSet]
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { email: true } }).catch(() => [])
    const emails = users.map(u => u.email).filter(Boolean) as string[]
    return { ids, emails }
  }

  private async notificarRespostaComercial(envioId: string) {
    const er = await prisma.$queryRawUnsafe<any[]>(
      `SELECT orcamento_id AS "orcamentoId", empresa_id AS "empresaId", respondente_nome AS "respondenteNome" FROM pesquisa_envio WHERE id = $1`, envioId,
    )
    const envio = er[0]
    if (!envio?.orcamentoId) return
    const orc = await prisma.orcamento.findUnique({ where: { id: envio.orcamentoId }, select: { numero: true } }).catch(() => null)
    const numero = orc?.numero ?? ''
    const { ids, emails } = await this.resolverComercial(envio.empresaId)
    const titulo = `Pesquisa respondida — Orçamento #${numero}`
    const mensagem = `${envio.respondenteNome || 'O cliente'} respondeu a pesquisa de satisfação.`
    const link = `/orcamentos/${envio.orcamentoId}`
    if (ids.length) {
      await this.notificationService.criarParaUsers(ids, { titulo, mensagem, tipo: 'success', link, origem: 'pesquisa-satisfacao', empresaId: envio.empresaId }).catch(() => {})
    }
    if (emails.length) {
      const html = `<div style="font-family:'Segoe UI',Arial,sans-serif"><h2 style="color:#fb7185">${titulo}</h2><p>${mensagem}</p><p><a href="${(process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')}${link}">Ver no sistema</a></p></div>`
      await this.emailService.sendMail({ to: emails, subject: titulo, html }).catch(() => {})
    }
    await prisma.$executeRawUnsafe(`UPDATE pesquisa_envio SET notificado_em = CURRENT_TIMESTAMP WHERE id = $1`, envioId)
  }

  // ── Indicador / detalhe ───────────────────────────────────────────
  /** Resumo da pesquisa de um orçamento (a mais recente, preferindo respondida). */
  async getResumoPorOrcamento(orcamentoId: string) {
    const er = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, modelo_id AS "modeloId", enviada_em AS "enviadaEm", respondida_em AS "respondidaEm", respondente_nome AS "respondenteNome", respondente_email AS "respondenteEmail"
         FROM pesquisa_envio WHERE orcamento_id = $1 ORDER BY (respondida_em IS NOT NULL) DESC, created_at DESC LIMIT 1`, orcamentoId,
    )
    const envio = er[0]
    if (!envio) return { enviada: false, respondida: false, itens: [] }
    if (!envio.respondidaEm) {
      return { enviada: !!envio.enviadaEm, respondida: false, itens: [] }
    }
    const itens = await prisma.$queryRawUnsafe<any[]>(
      `SELECT p.enunciado, p.tipo, p.ordem, i.valor_numero AS "valorNumero", i.valor_booleano AS "valorBooleano", i.valor_texto AS "valorTexto"
         FROM pesquisa_resposta_item i JOIN pesquisa_pergunta p ON p.id = i.pergunta_id
        WHERE i.envio_id = $1 ORDER BY p.ordem ASC`, envio.id,
    )
    return {
      enviada: true,
      respondida: true,
      respondidaEm: envio.respondidaEm,
      respondenteNome: envio.respondenteNome,
      respondenteEmail: envio.respondenteEmail,
      itens,
    }
  }

  // ── Relatório por período ─────────────────────────────────────────
  async reportPesquisa(dias: number | null, empresaId?: string | null) {
    const desde = dias ? new Date(Date.now() - dias * 86400000) : null
    const whereEmp = `empresa_id IS NOT DISTINCT FROM $1`
    const enviadasRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT count(*)::int n FROM pesquisa_envio WHERE ${whereEmp} ${desde ? 'AND created_at >= $2' : ''}`,
      ...(desde ? [empresaId ?? null, desde] : [empresaId ?? null]),
    )
    const respRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, respondida_em AS "respondidaEm", respondente_nome AS "respondenteNome", orcamento_id AS "orcamentoId", enviada_por AS "enviadaPor"
         FROM pesquisa_envio WHERE ${whereEmp} AND respondida_em IS NOT NULL ${desde ? 'AND respondida_em >= $2' : ''} ORDER BY respondida_em DESC`,
      ...(desde ? [empresaId ?? null, desde] : [empresaId ?? null]),
    )
    const enviadas = enviadasRows[0]?.n ?? 0
    const respondidas = respRows.length
    const ids = respRows.map(r => r.id)
    let nps = 0, mediaEstrelas = 0, percentSim = 0
    const comentarios: any[] = []
    let distribuicaoNps: { nota: number; count: number }[] = []
    if (ids.length) {
      const inList = ids.map((_, i) => `$${i + 1}`).join(',')
      const itens = await prisma.$queryRawUnsafe<any[]>(
        `SELECT p.tipo, i.valor_numero AS "valorNumero", i.valor_booleano AS "valorBooleano", i.valor_texto AS "valorTexto"
           FROM pesquisa_resposta_item i JOIN pesquisa_pergunta p ON p.id = i.pergunta_id WHERE i.envio_id IN (${inList})`,
        ...ids,
      )
      const npsVals = itens.filter(i => i.tipo === 'NPS' && i.valorNumero != null).map(i => i.valorNumero as number)
      if (npsVals.length) {
        const prom = npsVals.filter(v => v >= 9).length
        const det = npsVals.filter(v => v <= 6).length
        nps = Math.round(((prom - det) / npsVals.length) * 100)
        const dist = new Map<number, number>()
        for (const v of npsVals) dist.set(v, (dist.get(v) ?? 0) + 1)
        distribuicaoNps = [...dist.entries()].map(([nota, count]) => ({ nota, count })).sort((a, b) => a.nota - b.nota)
      }
      const estrelas = itens.filter(i => i.tipo === 'ESTRELAS' && i.valorNumero != null).map(i => i.valorNumero as number)
      if (estrelas.length) mediaEstrelas = Math.round((estrelas.reduce((s, v) => s + v, 0) / estrelas.length) * 10) / 10
      const sims = itens.filter(i => i.tipo === 'SIM_NAO' && i.valorBooleano != null)
      if (sims.length) percentSim = Math.round((sims.filter(i => i.valorBooleano === true).length / sims.length) * 100)
      for (const i of itens) if (i.tipo === 'TEXTO' && i.valorTexto?.trim()) comentarios.push({ texto: i.valorTexto.trim() })
    }
    return {
      enviadas,
      respondidas,
      taxaResposta: enviadas > 0 ? Math.round((respondidas / enviadas) * 100) : 0,
      nps,
      mediaEstrelas,
      percentSim,
      distribuicaoNps,
      comentarios: comentarios.slice(0, 50),
      recentes: respRows.slice(0, 30).map(r => ({ orcamentoId: r.orcamentoId, respondenteNome: r.respondenteNome, respondidaEm: r.respondidaEm })),
    }
  }
}
