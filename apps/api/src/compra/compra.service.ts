import { Injectable } from '@nestjs/common'
import { buildPaginatedResponse, getPrismaSkipTake, scoped, prisma, Prisma } from '@saas/db'
import { PermissionsEventsService } from '../permissions-events/permissions-events.service'
import { EmailService } from '../common/email.service'
import { NotificationService } from '../notification/notification.service'
import { invalidateUserPermissionsCache } from '../trpc/trpc.service'
import { CompraPdfService } from './compra-pdf.service'
import { STATUS_COMPRA_LABELS } from '@saas/types'
import type {
  CreateCompraInput, UpdateCompraInput, ListCompraInput,
  CreateCompraItemInput, UpdateCompraItemInput,
  ReprovarCompraInput, AvaliarCompraInput,
  CreateCompraAnexoInput, UpdateCompraAnexoInput,
  CreateCompraMensagemInput, UpdateCompraMensagemInput,
  CreateCompraCriterioInput, UpdateCompraCriterioInput,
} from '@saas/types'

function empresaFilter(_isMaster: boolean, empresaId?: string): Prisma.CompraWhereInput {
  return empresaId ? { empresaId } : {}
}
const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

type ScopedDb = Parameters<Parameters<typeof scoped>[1]>[0]

/** Nomes dos ids soltos (solicitante/aprovador/recebedor) resolvidos p/ exibição. */
async function resolverUsuarios(db: ScopedDb, ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter(Boolean))] as string[]
  if (!uniq.length) return new Map<string, { id: string; name: string; image: string | null }>()
  const us = await db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, image: true } })
  return new Map(us.map((u) => [u.id, u]))
}

/** Slug do módulo nas permissões — o mesmo do cadastro de usuários e do menu. */
const MODULE_SLUG = 'aquisicoes'

const brl = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** Escapa o que vai pro corpo do e-mail (descrição de item é texto do usuário). */
const escapeHtml = (v: string) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

@Injectable()
export class CompraService {
  constructor(
    private readonly permissionsEvents: PermissionsEventsService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
    private readonly pdfService: CompraPdfService,
  ) {}

  /**
   * PDF do pedido — o documento que se imprime, arquiva e manda ao fornecedor.
   *
   * Vale em qualquer situação, e não só depois de aprovado: quem monta o pedido
   * costuma imprimir para levar à aprovação no papel. O que muda com a situação
   * é o conteúdo — sem data de aprovação, o documento sai com as duas linhas de
   * assinatura; com ela, sai com quem aprovou e quando.
   */
  async pdf(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const c = await db.compra.findUniqueOrThrow({
        where: { id },
        include: {
          fornecedor: { select: { razaoSocial: true, documento: true, contatoPrincipal: true } },
          itens: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        },
      })
      // Mesma trava do getById: o PDF não pode ser uma porta lateral para ler
      // pedido de outra empresa.
      if (!isMaster && empresaId && c.empresaId !== empresaId) throw new Error('Acesso negado.')

      const uMap = await resolverUsuarios(db, [c.solicitanteId, c.aprovadorId, c.recebedorId])
      const empresa = c.empresaId
        ? await db.empresa.findUnique({
          where: { id: c.empresaId },
          select: { razaoSocial: true, nomeFantasia: true, logoUrl: true },
        })
        : null

      const buffer = await this.pdfService.gerar({
        compra: {
          code: c.code,
          status: c.status,
          statusLabel: STATUS_COMPRA_LABELS[c.status] ?? c.status,
          formaPagamento: c.formaPagamento,
          prazoEntrega: c.prazoEntrega,
          prazoPagamento: c.prazoPagamento,
          frete: dec(c.frete),
          observacoes: c.observacoes,
          dataSolicitacao: c.dataSolicitacao,
          dataAprovacao: c.dataAprovacao,
          dataRecebimento: c.dataRecebimento,
          motivoReprovacao: c.motivoReprovacao,
          criadoEm: c.createdAt,
        },
        itens: c.itens.map((i) => ({
          descricao: i.descricao,
          unidade: i.unidade,
          quantidade: i.quantidade,
          valorUnitario: Number(i.valorUnitario),
        })),
        fornecedor: c.fornecedor
          ? {
            razaoSocial: c.fornecedor.razaoSocial,
            documento: c.fornecedor.documento,
            contato: c.fornecedor.contatoPrincipal,
          }
          : null,
        solicitante: c.solicitanteId ? uMap.get(c.solicitanteId)?.name ?? null : null,
        aprovador: c.aprovadorId ? uMap.get(c.aprovadorId)?.name ?? null : null,
        recebedor: c.recebedorId ? uMap.get(c.recebedorId)?.name ?? null : null,
        empresa,
      })

      return { buffer, filename: `pedido-${c.code}.pdf` }
    })
  }

  private serializar(c: any) {
    return {
      ...c,
      frete: dec(c.frete),
      nfValor: dec(c.nfValor),
      itens: c.itens?.map((i: any) => ({ ...i, valorUnitario: dec(i.valorUnitario) })),
    }
  }

  /** Total do pedido = Σ(item.valorUnitario × quantidade) + frete. */
  private total(itens: Array<{ valorUnitario: unknown; quantidade: number }>, frete: unknown): number {
    const itensTotal = itens.reduce((s, i) => s + Number(i.valorUnitario) * i.quantidade, 0)
    return itensTotal + Number(frete ?? 0)
  }

  async list(input: ListCompraInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, sortBy, sortDir, status, fornecedorId, arquivadas } = input
    const { skip, take } = getPrismaSkipTake(page, limit)
    return scoped(tenantSchema, async (db) => {
      const where: Prisma.CompraWhereInput = {
        ...empresaFilter(isMaster, empresaId),
        isActive: !arquivadas,
        ...(status ? { status: status as Prisma.EnumStatusCompraFilter['equals'] } : {}),
        ...(fornecedorId ? { fornecedorId } : {}),
        ...(search
          ? {
              OR: [
                { observacoes: { contains: search, mode: 'insensitive' as const } },
                { fornecedor: { razaoSocial: { contains: search, mode: 'insensitive' as const } } },
                ...(Number.isFinite(Number(search)) ? [{ code: Number(search) }] : []),
              ],
            }
          : {}),
      }
      const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'desc' as const }
      const [rows, total] = await Promise.all([
        db.compra.findMany({
          where, orderBy, skip, take,
          include: {
            fornecedor: { select: { id: true, razaoSocial: true } },
            itens: { where: { isActive: true }, select: { valorUnitario: true, quantidade: true } },
            _count: { select: { anexos: true, mensagens: true } },
          },
        }),
        db.compra.count({ where }),
      ])
      const data = rows.map((c) => ({
        id: c.id, code: c.code, status: c.status, fornecedor: c.fornecedor,
        frete: dec(c.frete), total: this.total(c.itens, c.frete), qtdItens: c.itens.length,
        createdAt: c.createdAt, dataSolicitacao: c.dataSolicitacao,
        _count: c._count,
      }))
      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const c = await db.compra.findUniqueOrThrow({
        where: { id },
        include: {
          fornecedor: { select: { id: true, razaoSocial: true, documento: true } },
          itens: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        },
      })
      if (!isMaster && empresaId && c.empresaId !== empresaId) throw new Error('Acesso negado.')
      const uMap = await resolverUsuarios(db, [c.solicitanteId, c.aprovadorId, c.recebedorId])
      return {
        ...this.serializar(c),
        total: this.total(c.itens, c.frete),
        solicitante: c.solicitanteId ? uMap.get(c.solicitanteId) ?? null : null,
        aprovador: c.aprovadorId ? uMap.get(c.aprovadorId) ?? null : null,
        recebedor: c.recebedorId ? uMap.get(c.recebedorId) ?? null : null,
      }
    })
  }

  async create(input: CreateCompraInput, userId?: string, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.compra.create({
        data: {
          fornecedorId: input.fornecedorId,
          solicitanteId: input.solicitanteId || userId || null,
          formaPagamento: input.formaPagamento || null,
          prazoEntrega: input.prazoEntrega || null,
          prazoPagamento: input.prazoPagamento || null,
          frete: input.frete ?? null,
          observacoes: input.observacoes || null,
          empresaId: empresaId || null,
          itens: input.itens?.length
            ? { create: input.itens.map((i) => ({ descricao: i.descricao, unidade: i.unidade || null, quantidade: i.quantidade, valorUnitario: i.valorUnitario })) }
            : undefined,
        },
      }),
    )
  }

  async update(id: string, input: UpdateCompraInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const ex = await db.compra.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && ex.empresaId !== empresaId) throw new Error('Acesso negado.')
      return db.compra.update({
        where: { id },
        data: {
          ...(input.fornecedorId !== undefined ? { fornecedorId: input.fornecedorId } : {}),
          ...(input.solicitanteId !== undefined ? { solicitanteId: input.solicitanteId || null } : {}),
          ...(input.formaPagamento !== undefined ? { formaPagamento: input.formaPagamento || null } : {}),
          ...(input.prazoEntrega !== undefined ? { prazoEntrega: input.prazoEntrega || null } : {}),
          ...(input.prazoPagamento !== undefined ? { prazoPagamento: input.prazoPagamento || null } : {}),
          ...(input.frete !== undefined ? { frete: input.frete } : {}),
          ...(input.observacoes !== undefined ? { observacoes: input.observacoes || null } : {}),
        },
      })
    })
  }

  /** Exclusão = soft-delete (isActive=false). */
  async delete(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compra.update({ where: { id }, data: { isActive: false } }))
  }

  // ── Workflow ────────────────────────────────────────────────
  private async assertStatus(db: ScopedDb, id: string, esperado: string[]) {
    const c = await db.compra.findUniqueOrThrow({ where: { id }, select: { status: true } })
    if (!esperado.includes(c.status)) {
      throw new Error(`Ação inválida para o status atual (${c.status}).`)
    }
  }

  async enviar(id: string, tenantSchema?: string) {
    const atualizado = await scoped(tenantSchema, async (db) => {
      await this.assertStatus(db, id, ['NOVO', 'REPROVADO'])
      return db.compra.update({ where: { id }, data: { status: 'AGUARDANDO_APROVACAO', dataSolicitacao: new Date(), motivoReprovacao: null } })
    })
    // Avisa quem aprova. Falha de e-mail/notificação NÃO desfaz o envio do
    // pedido — o pedido já está aguardando aprovação de qualquer forma.
    await this.notificarAprovadores(id, tenantSchema).catch((e: Error) =>
      console.warn('[Aquisicoes] Falha ao notificar aprovadores:', e.message),
    )
    return atualizado
  }

  /**
   * Notificação (in-app + e-mail) aos aprovadores quando um pedido sai de
   * rascunho e entra na fila de aprovação. Destinatários = quem tem a marca
   * `aprovar_pedidos` no módulo + Empresa Master (que aprova por padrão).
   */
  private async notificarAprovadores(compraId: string, tenantSchema?: string) {
    const c = await scoped(tenantSchema, async (db) => {
      const compra = await db.compra.findUnique({
        where: { id: compraId },
        select: {
          id: true, code: true, frete: true, empresaId: true, solicitanteId: true,
          fornecedor: { select: { razaoSocial: true } },
          itens: { select: { descricao: true, quantidade: true, valorUnitario: true }, orderBy: { createdAt: 'asc' } },
        },
      })
      if (!compra) return null
      const solicitante = compra.solicitanteId
        ? await db.user.findUnique({ where: { id: compra.solicitanteId }, select: { name: true } })
        : null
      return { ...compra, solicitanteNome: solicitante?.name ?? null }
    })
    if (!c) return { notificados: 0 }

    const destinatarios = (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT u.id, u.name AS nome, u.email
         FROM users u
         LEFT JOIN user_permissions p ON p.user_id = u.id AND p.module_slug = $2
        WHERE u.is_active = true
          AND u.role <> 'COLABORADOR_CLIENTE'
          AND ($1::text = '' OR u.empresa_id = $1)
          AND (
            u.is_empresa_master = true
            OR (p.can_read = true AND COALESCE(p.sub_permissions->>'aprovar_pedidos', 'false') = 'true')
          )`,
      c.empresaId ?? '',
      MODULE_SLUG,
    ).catch(() => [])) as Array<{ id: string; nome: string | null; email: string | null }>

    // Quem enviou não precisa ser avisado do próprio pedido.
    const alvos = destinatarios.filter((d) => d.id !== c.solicitanteId)
    if (!alvos.length) return { notificados: 0 }

    const fornecedor = c.fornecedor?.razaoSocial ?? 'fornecedor não informado'
    // `total` não é coluna — é itens + frete, igual à listagem e ao detalhe.
    const total = brl(this.total(c.itens, c.frete))
    const link = `/aquisicoes/${c.id}`

    await this.notificationService.criarParaUsers(alvos.map((d) => d.id), {
      titulo: `Pedido #${c.code} aguardando aprovação`,
      mensagem: `${fornecedor} — ${total}`
        + (c.solicitanteNome ? ` · solicitado por ${c.solicitanteNome}` : ''),
      tipo: 'warning',
      link,
      origem: 'aquisicoes',
      empresaId: c.empresaId ?? undefined,
    }).catch(() => {})

    const linhas = c.itens.slice(0, 20).map((i) =>
      `<tr><td style="padding:4px 10px 4px 0">${escapeHtml(i.descricao)}</td>`
      + `<td style="padding:4px 10px 4px 0;text-align:right">${Number(i.quantidade ?? 0)}</td>`
      + `<td style="padding:4px 0;text-align:right">${brl(Number(i.valorUnitario ?? 0))}</td></tr>`,
    ).join('')
    const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const botao = base
      ? `<p style="margin-top:14px"><a href="${base}${link}" style="display:inline-block;background:#d97706;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Abrir o pedido</a></p>`
      : `<p>Acesse o sistema em <strong>Aquisições</strong> para aprovar o pedido.</p>`

    for (const d of alvos) {
      if (!d.email) continue
      await this.emailService.sendMail({
        to: d.email,
        subject: `Pedido de compra #${c.code} aguardando sua aprovação`,
        html: `<p>Olá, ${escapeHtml(d.nome?.split(' ')[0] ?? '')}!</p>
        <p>O pedido de compra <strong>#${c.code}</strong> foi enviado para aprovação e está aguardando você.</p>
        <table style="border-collapse:collapse;font-size:14px;margin-bottom:14px">
          <tr><td style="padding:2px 10px 2px 0;color:#6b7280">Fornecedor</td><td style="padding:2px 0"><strong>${escapeHtml(fornecedor)}</strong></td></tr>
          ${c.solicitanteNome ? `<tr><td style="padding:2px 10px 2px 0;color:#6b7280">Solicitante</td><td style="padding:2px 0">${escapeHtml(c.solicitanteNome)}</td></tr>` : ''}
          <tr><td style="padding:2px 10px 2px 0;color:#6b7280">Total</td><td style="padding:2px 0"><strong>${total}</strong></td></tr>
        </table>
        ${c.itens.length ? `<table style="border-collapse:collapse;font-size:14px">
          <tr style="text-align:left;color:#6b7280"><th style="padding:0 10px 6px 0">Item</th><th style="padding:0 10px 6px 0;text-align:right">Qtd.</th><th style="padding:0 0 6px 0;text-align:right">Valor un.</th></tr>
          ${linhas}
        </table>` : ''}
        ${c.itens.length > 20 ? `<p style="color:#6b7280;font-size:13px">…e mais ${c.itens.length - 20} item(ns).</p>` : ''}
        ${botao}`,
      }).catch(() => {})
    }

    return { notificados: alvos.length }
  }

  async aprovar(id: string, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      await this.assertStatus(db, id, ['AGUARDANDO_APROVACAO'])
      return db.compra.update({ where: { id }, data: { status: 'APROVADO', dataAprovacao: new Date(), aprovadorId: userId || null } })
    })
  }

  async reprovar(input: ReprovarCompraInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      await this.assertStatus(db, input.id, ['AGUARDANDO_APROVACAO'])
      return db.compra.update({ where: { id: input.id }, data: { status: 'REPROVADO', aprovadorId: userId || null, motivoReprovacao: input.motivo } })
    })
  }

  async receber(id: string, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      await this.assertStatus(db, id, ['APROVADO'])
      return db.compra.update({ where: { id }, data: { status: 'RECEBIDO', dataRecebimento: new Date(), recebedorId: userId || null } })
    })
  }

  async avaliar(input: AvaliarCompraInput, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      await this.assertStatus(db, input.id, ['RECEBIDO', 'AVALIADO'])
      await db.compra.update({
        where: { id: input.id },
        data: {
          status: 'AVALIADO', dataAvaliacao: new Date(),
          nfNumero: input.nfNumero || null, nfValor: input.nfValor ?? null,
          tipoFornecimento: input.tipoFornecimento, melhoria: input.melhoria,
          melhoriaObs: input.melhoriaObs || null, setor: input.setor || null,
        },
      })
      for (const r of input.respostas) {
        await db.compraAvaliacaoResposta.upsert({
          where: { compraId_criterioId: { compraId: input.id, criterioId: r.criterioId } },
          create: { compraId: input.id, criterioId: r.criterioId, atende: r.atende },
          update: { atende: r.atende },
        })
      }
      return { ok: true }
    })
  }

  /** Critérios de avaliação aplicáveis + a resposta atual do pedido (p/ o modal de avaliar). */
  async getAvaliacao(compraId: string, _isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const criterios = await db.compraCriterio.findMany({
        where: { isActive: true, ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}) },
        orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      })
      const respostas = await db.compraAvaliacaoResposta.findMany({ where: { compraId } })
      const mapa = new Map(respostas.map((r) => [r.criterioId, r.atende]))
      return criterios.map((c) => ({ id: c.id, criterio: c.criterio, ordem: c.ordem, atende: mapa.get(c.id) ?? null }))
    })
  }

  // ── Itens ───────────────────────────────────────────────────
  async addItem(input: CreateCompraItemInput, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.compraItem.create({ data: { compraId: input.compraId, descricao: input.descricao, unidade: input.unidade || null, quantidade: input.quantidade, valorUnitario: input.valorUnitario } }),
    )
  }
  async updateItem(input: UpdateCompraItemInput, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.compraItem.update({
        where: { id: input.id },
        data: {
          ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
          ...(input.unidade !== undefined ? { unidade: input.unidade || null } : {}),
          ...(input.quantidade !== undefined ? { quantidade: input.quantidade } : {}),
          ...(input.valorUnitario !== undefined ? { valorUnitario: input.valorUnitario } : {}),
        },
      }),
    )
  }
  async removeItem(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraItem.update({ where: { id }, data: { isActive: false } }))
  }

  // ── Anexos ──────────────────────────────────────────────────
  async listAnexos(compraId: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const anexos = await db.compraAnexo.findMany({ where: { compraId, isActive: true }, orderBy: { createdAt: 'desc' } })
      const uMap = await resolverUsuarios(db, anexos.map((a) => a.uploadedById))
      return anexos.map((a) => ({ ...a, uploadedBy: a.uploadedById ? uMap.get(a.uploadedById) ?? null : null }))
    })
  }
  async addAnexo(input: CreateCompraAnexoInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.compraAnexo.create({ data: { compraId: input.compraId, descricao: input.descricao || null, fileUrl: input.fileUrl, fileName: input.fileName, mimeType: input.mimeType || null, tamanho: input.tamanho ?? null, uploadedById: userId || null } }),
    )
  }
  async updateAnexo(input: UpdateCompraAnexoInput, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraAnexo.update({ where: { id: input.id }, data: { descricao: input.descricao || null } }))
  }
  async removeAnexo(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraAnexo.update({ where: { id }, data: { isActive: false } }))
  }

  // ── Mensagens ───────────────────────────────────────────────
  async listMensagens(compraId: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const msgs = await db.compraMensagem.findMany({ where: { compraId, isActive: true }, orderBy: { createdAt: 'desc' } })
      const uMap = await resolverUsuarios(db, msgs.map((m) => m.autorId))
      return msgs.map((m) => ({ ...m, autor: m.autorId ? uMap.get(m.autorId) ?? null : null }))
    })
  }
  async addMensagem(input: CreateCompraMensagemInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraMensagem.create({ data: { compraId: input.compraId, texto: input.texto, autorId: userId || null } }))
  }
  async updateMensagem(input: UpdateCompraMensagemInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const m = await db.compraMensagem.findUniqueOrThrow({ where: { id: input.id } })
      if (userId && m.autorId && m.autorId !== userId) throw new Error('Só o autor pode editar a mensagem.')
      return db.compraMensagem.update({ where: { id: input.id }, data: { texto: input.texto } })
    })
  }
  async removeMensagem(id: string, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const m = await db.compraMensagem.findUniqueOrThrow({ where: { id } })
      if (userId && m.autorId && m.autorId !== userId) throw new Error('Só o autor pode excluir a mensagem.')
      return db.compraMensagem.update({ where: { id }, data: { isActive: false } })
    })
  }

  // ── Critérios de avaliação (catálogo) ───────────────────────
  async listCriterios(_isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.compraCriterio.findMany({ where: { isActive: true, ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}) }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] }),
    )
  }
  async createCriterio(input: CreateCompraCriterioInput, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraCriterio.create({ data: { criterio: input.criterio, ordem: input.ordem, empresaId: empresaId || null } }))
  }
  async updateCriterio(input: UpdateCompraCriterioInput, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.compraCriterio.update({
        where: { id: input.id },
        data: {
          ...(input.criterio !== undefined ? { criterio: input.criterio } : {}),
          ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      }),
    )
  }
  async deleteCriterio(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraCriterio.update({ where: { id }, data: { isActive: false } }))
  }

  async listForSelectFornecedores(_isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedor.findMany({
        where: { isActive: true, ...(empresaId ? { empresaId } : {}) },
        select: { id: true, razaoSocial: true, documento: true },
        orderBy: { razaoSocial: 'asc' },
      }),
    )
  }

  async getEmpresaId(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compra.findUnique({ where: { id }, select: { empresaId: true } }))
  }

  // ── Configurações › Aprovadores ──────────────────────────────
  // "Quem aprova" é a sub-permissão `aprovar_pedidos` do módulo — mesma fonte
  // da verdade do cadastro do usuário. A tela do módulo é só um outro caminho
  // para a MESMA marca, para o gestor não precisar entrar em cada usuário.

  /**
   * Usuários da empresa com a marca de aprovador. Master e Empresa Master
   * entram como aprovadores implícitos (o guard os libera sempre), sinalizados
   * com `implicito` para a tela não oferecer um toggle que não faria nada.
   */
  async listAprovadores(_isMaster: boolean, empresaId?: string) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(empresaId ? { empresaId } : {}),
        // Colaborador de cliente não aprova compra interna.
        role: { not: 'COLABORADOR_CLIENTE' },
      },
      select: { id: true, name: true, email: true, image: true, role: true, isMaster: true, isEmpresaMaster: true },
      orderBy: { name: 'asc' },
    })
    const perms = await prisma.userPermission.findMany({
      where: { userId: { in: users.map((u) => u.id) }, moduleSlug: MODULE_SLUG },
      select: { userId: true, canRead: true, subPermissions: true },
    })
    const porUser = new Map(perms.map((p) => [p.userId, p]))

    return users.map((u) => {
      const p = porUser.get(u.id)
      const subs = (p?.subPermissions ?? {}) as Record<string, boolean>
      const implicito = u.isMaster || u.isEmpresaMaster
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: String(u.role),
        implicito,
        aprovador: implicito || subs.aprovar_pedidos === true,
        // Sem acesso de leitura ao módulo a marca não serve de nada — a tela
        // avisa, e o toggle concede o acesso junto.
        temAcesso: !!p?.canRead,
      }
    })
  }

  /**
   * Liga/desliga a marca de aprovador. Ao ligar, garante o acesso de leitura ao
   * módulo (sem ele o guard barraria antes de olhar a sub-permissão) — sem
   * conceder escrita: aprovar não deve dar o direito de criar/editar pedidos.
   */
  async setAprovador(userId: string, ativo: boolean, isMaster: boolean, empresaId?: string) {
    const alvo = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, empresaId: true, isActive: true, isMaster: true, isEmpresaMaster: true },
    })
    if (!alvo) throw new Error('Usuário não encontrado.')
    if (!isMaster && empresaId && alvo.empresaId !== empresaId) {
      throw new Error('Usuário fora da sua empresa.')
    }
    if (alvo.isMaster || alvo.isEmpresaMaster) {
      throw new Error('Master e Empresa Master já aprovam por padrão — não há o que marcar.')
    }

    const where = { userId_moduleSlug: { userId, moduleSlug: MODULE_SLUG } }
    const atual = await prisma.userPermission.findUnique({ where, select: { subPermissions: true } })
    const subs = { ...((atual?.subPermissions ?? {}) as Record<string, boolean>), aprovar_pedidos: ativo }

    if (atual) {
      await prisma.userPermission.update({
        where,
        data: { subPermissions: subs, ...(ativo ? { canRead: true } : {}) },
      })
    } else {
      await prisma.userPermission.create({
        data: { userId, moduleSlug: MODULE_SLUG, canRead: true, canWrite: false, canDelete: false, subPermissions: subs },
      })
    }

    // Sem isto o backend seguiria decidindo pelo cache (TTL 30s) e a sessão
    // aberta do usuário não veria a mudança.
    invalidateUserPermissionsCache(userId)
    this.permissionsEvents.emit({ type: 'updated', userId, actorUserId: null })
    return { success: true }
  }
}
