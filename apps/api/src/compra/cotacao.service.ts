import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { buildPaginatedResponse, getPrismaSkipTake, scoped } from '@saas/db'
import type {
  CreateCotacaoInput, UpdateCotacaoInput, ListCotacaoInput,
  CreateCotacaoItemInput, UpdateCotacaoItemInput,
  AddCotacaoFornecedorInput, UpdateCotacaoFornecedorInput,
  SetCotacaoPrecoInput, PremiarItemInput, PremiarLoteInput, EnviarCotacaoInput,
} from '@saas/types'
import { EmailService } from '../common/email.service'
import { CotacaoPdfService } from './cotacao-pdf.service'

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const brl = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const escapeHtml = (v: string) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type ScopedDb = Parameters<Parameters<typeof scoped>[1]>[0]

/** Linha da matriz de apuração, já com os preços de cada fornecedor. */
export interface ItemApurado {
  id: string
  descricao: string
  unidade: string | null
  quantidade: number
  ordem: number
  vencedorId: string | null
  precos: Array<{
    cotacaoFornecedorId: string
    valorUnitario: number | null
    disponivel: boolean
    observacoes: string | null
  }>
}

@Injectable()
export class CotacaoService {
  constructor(
    private readonly emailService: EmailService,
    private readonly pdfService: CotacaoPdfService,
  ) {}

  // ── Leitura ────────────────────────────────────────────────

  async list(input: ListCotacaoInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, status } = input
    const { skip, take } = getPrismaSkipTake(page, limit)
    const where = {
      isActive: true,
      ...(!isMaster && empresaId ? { empresaId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { titulo: { contains: search, mode: 'insensitive' as const } },
              ...(Number.isFinite(Number(search)) ? [{ code: Number(search) }] : []),
            ],
          }
        : {}),
    }

    return scoped(tenantSchema, async (db) => {
      const [rows, total] = await Promise.all([
        db.compraCotacao.findMany({
          where,
          skip,
          take,
          orderBy: { code: 'desc' },
          include: {
            itens: { where: { isActive: true }, select: { id: true, vencedorId: true } },
            fornecedores: { select: { id: true, respondidoEm: true, fornecedor: { select: { razaoSocial: true } } } },
            compras: { select: { id: true, code: true } },
          },
        }),
        db.compraCotacao.count({ where }),
      ])

      const data = rows.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        titulo: c.titulo,
        prazoResposta: c.prazoResposta,
        createdAt: c.createdAt,
        qtdItens: c.itens.length,
        qtdItensPremiados: c.itens.filter((i) => i.vencedorId).length,
        qtdFornecedores: c.fornecedores.length,
        qtdRespostas: c.fornecedores.filter((f) => f.respondidoEm).length,
        fornecedores: c.fornecedores.map((f) => f.fornecedor.razaoSocial),
        pedidosGerados: c.compras.map((p) => ({ id: p.id, code: p.code })),
      }))
      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const c = await db.compraCotacao.findUnique({
        where: { id },
        include: {
          itens: { where: { isActive: true }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }], include: { precos: true } },
          fornecedores: {
            orderBy: { createdAt: 'asc' },
            include: { fornecedor: { select: { id: true, razaoSocial: true, documento: true, email: true, contatoPrincipal: true } } },
          },
          compras: { select: { id: true, code: true, status: true, fornecedor: { select: { razaoSocial: true } } } },
        },
      })
      if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cotação não encontrada.' })
      if (!isMaster && empresaId && c.empresaId && c.empresaId !== empresaId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cotação de outra empresa.' })
      }

      const solicitante = c.solicitanteId
        ? await db.user.findUnique({ where: { id: c.solicitanteId }, select: { name: true } })
        : null

      const itens: ItemApurado[] = c.itens.map((i) => ({
        id: i.id,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: i.quantidade,
        ordem: i.ordem,
        vencedorId: i.vencedorId,
        precos: i.precos.map((p) => ({
          cotacaoFornecedorId: p.cotacaoFornecedorId,
          valorUnitario: dec(p.valorUnitario),
          disponivel: p.disponivel,
          observacoes: p.observacoes,
        })),
      }))

      const fornecedores = c.fornecedores.map((f) => ({
        id: f.id,
        fornecedorId: f.fornecedorId,
        razaoSocial: f.fornecedor.razaoSocial,
        documento: f.fornecedor.documento,
        email: f.fornecedor.email,
        contato: f.fornecedor.contatoPrincipal,
        enviadoEm: f.enviadoEm,
        respondidoEm: f.respondidoEm,
        frete: dec(f.frete),
        prazoEntrega: f.prazoEntrega,
        prazoPagamento: f.prazoPagamento,
        formaPagamento: f.formaPagamento,
        validadeProposta: f.validadeProposta,
        observacoes: f.observacoes,
      }))

      return {
        id: c.id,
        code: c.code,
        status: c.status,
        titulo: c.titulo,
        observacoes: c.observacoes,
        prazoResposta: c.prazoResposta,
        solicitanteNome: solicitante?.name ?? null,
        createdAt: c.createdAt,
        itens,
        fornecedores,
        pedidosGerados: c.compras.map((p) => ({
          id: p.id, code: p.code, status: p.status, fornecedor: p.fornecedor?.razaoSocial ?? null,
        })),
        comparativo: this.comparar(itens, fornecedores),
      }
    })
  }

  // ── O núcleo: comparar dividir × concentrar ────────────────

  /**
   * Monta os dois cenários que a decisão exige.
   *
   * O menor preço item a item NÃO é automaticamente o melhor negócio: dividir
   * entre 3 fornecedores paga 3 fretes. Por isso devolvemos, lado a lado, o
   * total do cenário dividido (premiação atual) e o total de concentrar tudo em
   * cada fornecedor — aí a diferença fica explícita antes de gerar os pedidos.
   */
  private comparar(itens: ItemApurado[], fornecedores: Array<{ id: string; razaoSocial: string; frete: number | null }>) {
    const preco = (item: ItemApurado, fornId: string) => {
      const p = item.precos.find((x) => x.cotacaoFornecedorId === fornId)
      if (!p || !p.disponivel || p.valorUnitario == null) return null
      return p.valorUnitario
    }

    // Cenário atual (o que está premiado hoje — pode estar dividido).
    const premiados = itens.filter((i) => i.vencedorId)
    const porFornecedorPremiado = new Map<string, { subtotal: number; itens: number }>()
    for (const i of premiados) {
      const v = preco(i, i.vencedorId!) ?? 0
      const acc = porFornecedorPremiado.get(i.vencedorId!) ?? { subtotal: 0, itens: 0 }
      acc.subtotal += v * i.quantidade
      acc.itens += 1
      porFornecedorPremiado.set(i.vencedorId!, acc)
    }
    const fretesDivididos = [...porFornecedorPremiado.keys()]
      .reduce((s, id) => s + (fornecedores.find((f) => f.id === id)?.frete ?? 0), 0)
    const subtotalDividido = [...porFornecedorPremiado.values()].reduce((s, v) => s + v.subtotal, 0)

    const atual = {
      itensPremiados: premiados.length,
      itensTotal: itens.length,
      qtdPedidos: porFornecedorPremiado.size,
      subtotal: subtotalDividido,
      frete: fretesDivididos,
      total: subtotalDividido + fretesDivididos,
      porFornecedor: [...porFornecedorPremiado.entries()].map(([id, v]) => ({
        cotacaoFornecedorId: id,
        razaoSocial: fornecedores.find((f) => f.id === id)?.razaoSocial ?? '—',
        itens: v.itens,
        subtotal: v.subtotal,
        frete: fornecedores.find((f) => f.id === id)?.frete ?? 0,
        total: v.subtotal + (fornecedores.find((f) => f.id === id)?.frete ?? 0),
      })),
    }

    // Cenário "tudo em um só", por fornecedor. `itensNaoAtendidos` é decisivo:
    // um fornecedor mais barato que não atende tudo não é comparável de fato.
    const unicos = fornecedores.map((f) => {
      let subtotal = 0
      let atendidos = 0
      const naoAtendidos: string[] = []
      for (const i of itens) {
        const v = preco(i, f.id)
        if (v == null) { naoAtendidos.push(i.descricao); continue }
        subtotal += v * i.quantidade
        atendidos += 1
      }
      const frete = f.frete ?? 0
      return {
        cotacaoFornecedorId: f.id,
        razaoSocial: f.razaoSocial,
        itensAtendidos: atendidos,
        itensNaoAtendidos: naoAtendidos,
        completo: naoAtendidos.length === 0,
        subtotal,
        frete,
        total: subtotal + frete,
      }
    })

    // Melhor único = o mais barato ENTRE OS QUE ATENDEM TUDO. Comparar com quem
    // atende metade da lista daria uma economia falsa.
    const completos = unicos.filter((u) => u.completo)
    const melhorUnico = completos.length
      ? completos.reduce((a, b) => (b.total < a.total ? b : a))
      : null

    return {
      atual,
      unicos,
      melhorUnico,
      /** > 0 = dividir sai mais barato; < 0 = concentrar sai mais barato. */
      economiaDividindo: melhorUnico && atual.itensPremiados === itens.length && itens.length > 0
        ? melhorUnico.total - atual.total
        : null,
    }
  }

  // ── Escrita: cotação ───────────────────────────────────────

  async create(input: CreateCotacaoInput, userId?: string, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.compraCotacao.create({
        data: {
          titulo: input.titulo || null,
          observacoes: input.observacoes || null,
          prazoResposta: input.prazoResposta ? new Date(`${input.prazoResposta}T00:00:00`) : null,
          solicitanteId: userId || null,
          empresaId: empresaId || null,
        },
        select: { id: true, code: true },
      }),
    )
  }

  async update(input: UpdateCotacaoInput, tenantSchema?: string) {
    const { id, ...rest } = input
    return scoped(tenantSchema, (db) =>
      db.compraCotacao.update({
        where: { id },
        data: {
          ...(rest.titulo !== undefined ? { titulo: rest.titulo || null } : {}),
          ...(rest.observacoes !== undefined ? { observacoes: rest.observacoes || null } : {}),
          ...(rest.prazoResposta !== undefined
            ? { prazoResposta: rest.prazoResposta ? new Date(`${rest.prazoResposta}T00:00:00`) : null }
            : {}),
          ...(rest.status !== undefined ? { status: rest.status as never } : {}),
        },
      }),
    )
  }

  async delete(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraCotacao.update({ where: { id }, data: { isActive: false } }))
  }

  // ── Escrita: itens ─────────────────────────────────────────

  async addItem(input: CreateCotacaoItemInput, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const ultima = await db.compraCotacaoItem.findFirst({
        where: { cotacaoId: input.cotacaoId }, orderBy: { ordem: 'desc' }, select: { ordem: true },
      })
      return db.compraCotacaoItem.create({
        data: {
          cotacaoId: input.cotacaoId,
          descricao: input.descricao,
          unidade: input.unidade || null,
          quantidade: input.quantidade,
          ordem: (ultima?.ordem ?? 0) + 1,
        },
      })
    })
  }

  async updateItem(input: UpdateCotacaoItemInput, tenantSchema?: string) {
    const { id, ...rest } = input
    return scoped(tenantSchema, (db) =>
      db.compraCotacaoItem.update({
        where: { id },
        data: {
          ...(rest.descricao !== undefined ? { descricao: rest.descricao } : {}),
          ...(rest.unidade !== undefined ? { unidade: rest.unidade || null } : {}),
          ...(rest.quantidade !== undefined ? { quantidade: rest.quantidade } : {}),
          ...(rest.ordem !== undefined ? { ordem: rest.ordem } : {}),
        },
      }),
    )
  }

  async removeItem(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) => db.compraCotacaoItem.update({ where: { id }, data: { isActive: false } }))
  }

  /**
   * Divide um item em dois — é assim que se reparte a quantidade do MESMO
   * material entre fornecedores (ex.: 20 resmas → 12 + 8), mantendo a premiação
   * no nível do item.
   */
  async dividirItem(id: string, quantidadeNova: number, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const item = await db.compraCotacaoItem.findUnique({ where: { id } })
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado.' })
      if (quantidadeNova < 1 || quantidadeNova >= item.quantidade) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A quantidade separada precisa ficar entre 1 e ${item.quantidade - 1}.`,
        })
      }
      await db.compraCotacaoItem.update({
        where: { id }, data: { quantidade: item.quantidade - quantidadeNova },
      })
      const novo = await db.compraCotacaoItem.create({
        data: {
          cotacaoId: item.cotacaoId,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: quantidadeNova,
          ordem: item.ordem,
        },
      })
      // Copia os preços já lançados — o material é o mesmo, o preço unitário também.
      const precos = await db.compraCotacaoPreco.findMany({ where: { cotacaoItemId: id } })
      if (precos.length) {
        await db.compraCotacaoPreco.createMany({
          data: precos.map((p) => ({
            cotacaoItemId: novo.id,
            cotacaoFornecedorId: p.cotacaoFornecedorId,
            valorUnitario: p.valorUnitario,
            disponivel: p.disponivel,
            observacoes: p.observacoes,
          })),
        })
      }
      return novo
    })
  }

  // ── Escrita: fornecedores convidados ───────────────────────

  async addFornecedor(input: AddCotacaoFornecedorInput, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existe = await db.compraCotacaoFornecedor.findUnique({
        where: { cotacaoId_fornecedorId: { cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId } },
        select: { id: true },
      })
      if (existe) throw new TRPCError({ code: 'CONFLICT', message: 'Este fornecedor já está na cotação.' })
      return db.compraCotacaoFornecedor.create({
        data: { cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId },
      })
    })
  }

  async updateFornecedor(input: UpdateCotacaoFornecedorInput, tenantSchema?: string) {
    const { id, respondido, ...rest } = input
    return scoped(tenantSchema, async (db) => {
      const atualizado = await db.compraCotacaoFornecedor.update({
        where: { id },
        data: {
          ...(rest.frete !== undefined ? { frete: rest.frete } : {}),
          ...(rest.prazoEntrega !== undefined ? { prazoEntrega: rest.prazoEntrega || null } : {}),
          ...(rest.prazoPagamento !== undefined ? { prazoPagamento: rest.prazoPagamento || null } : {}),
          ...(rest.formaPagamento !== undefined ? { formaPagamento: rest.formaPagamento || null } : {}),
          ...(rest.validadeProposta !== undefined ? { validadeProposta: rest.validadeProposta || null } : {}),
          ...(rest.observacoes !== undefined ? { observacoes: rest.observacoes || null } : {}),
          ...(respondido !== undefined ? { respondidoEm: respondido ? new Date() : null } : {}),
        },
      })
      if (respondido) await this.marcarApuracao(db, atualizado.cotacaoId)
      return atualizado
    })
  }

  async removeFornecedor(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      // Tira a premiação de quem apontava para este fornecedor, senão sobra
      // item "premiado" para alguém que não está mais na cotação.
      const f = await db.compraCotacaoFornecedor.findUnique({ where: { id }, select: { cotacaoId: true } })
      if (f) {
        await db.compraCotacaoItem.updateMany({
          where: { cotacaoId: f.cotacaoId, vencedorId: id }, data: { vencedorId: null },
        })
      }
      return db.compraCotacaoFornecedor.delete({ where: { id } })
    })
  }

  // ── Escrita: preços e premiação ────────────────────────────

  async setPreco(input: SetCotacaoPrecoInput, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const preco = await db.compraCotacaoPreco.upsert({
        where: {
          cotacaoItemId_cotacaoFornecedorId: {
            cotacaoItemId: input.cotacaoItemId,
            cotacaoFornecedorId: input.cotacaoFornecedorId,
          },
        },
        create: {
          cotacaoItemId: input.cotacaoItemId,
          cotacaoFornecedorId: input.cotacaoFornecedorId,
          valorUnitario: input.valorUnitario ?? null,
          disponivel: input.disponivel ?? true,
          observacoes: input.observacoes || null,
        },
        update: {
          ...(input.valorUnitario !== undefined ? { valorUnitario: input.valorUnitario } : {}),
          ...(input.disponivel !== undefined ? { disponivel: input.disponivel } : {}),
          ...(input.observacoes !== undefined ? { observacoes: input.observacoes || null } : {}),
        },
      })
      // Item que virou indisponível não pode continuar premiado nesse fornecedor.
      if (input.disponivel === false) {
        await db.compraCotacaoItem.updateMany({
          where: { id: input.cotacaoItemId, vencedorId: input.cotacaoFornecedorId },
          data: { vencedorId: null },
        })
      }
      const item = await db.compraCotacaoItem.findUnique({
        where: { id: input.cotacaoItemId }, select: { cotacaoId: true },
      })
      if (item) await this.marcarApuracao(db, item.cotacaoId)
      return preco
    })
  }

  async premiarItem(input: PremiarItemInput, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      if (input.cotacaoFornecedorId) {
        const p = await db.compraCotacaoPreco.findUnique({
          where: {
            cotacaoItemId_cotacaoFornecedorId: {
              cotacaoItemId: input.cotacaoItemId,
              cotacaoFornecedorId: input.cotacaoFornecedorId,
            },
          },
          select: { valorUnitario: true, disponivel: true },
        })
        if (!p || !p.disponivel || p.valorUnitario == null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Não é possível premiar: este fornecedor não tem preço lançado para o item.',
          })
        }
      }
      return db.compraCotacaoItem.update({
        where: { id: input.cotacaoItemId }, data: { vencedorId: input.cotacaoFornecedorId },
      })
    })
  }

  async premiarLote(input: PremiarLoteInput, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const itens = await db.compraCotacaoItem.findMany({
        where: { cotacaoId: input.cotacaoId, isActive: true }, include: { precos: true },
      })

      let premiados = 0
      for (const i of itens) {
        const validos = i.precos.filter((p) => p.disponivel && p.valorUnitario != null)
        let escolhido: string | null = null

        if (input.modo === 'MENOR_PRECO') {
          if (validos.length) {
            escolhido = validos.reduce((a, b) => (Number(b.valorUnitario) < Number(a.valorUnitario) ? b : a))
              .cotacaoFornecedorId
          }
        } else {
          // Fornecedor único: só premia o que esse fornecedor de fato atende.
          const alvo = validos.find((p) => p.cotacaoFornecedorId === input.cotacaoFornecedorId)
          escolhido = alvo ? alvo.cotacaoFornecedorId : null
        }

        await db.compraCotacaoItem.update({ where: { id: i.id }, data: { vencedorId: escolhido } })
        if (escolhido) premiados += 1
      }
      return { premiados, itens: itens.length }
    })
  }

  /** RASCUNHO/ENVIADA → APURACAO no primeiro sinal de retorno. */
  private async marcarApuracao(db: ScopedDb, cotacaoId: string) {
    await db.compraCotacao.updateMany({
      where: { id: cotacaoId, status: { in: ['RASCUNHO', 'ENVIADA'] } },
      data: { status: 'APURACAO' },
    })
  }

  // ── Envio aos fornecedores (PDF + e-mail) ──────────────────

  async enviar(input: EnviarCotacaoInput, tenantSchema?: string) {
    const dados = await scoped(tenantSchema, async (db) => {
      const c = await db.compraCotacao.findUnique({
        where: { id: input.cotacaoId },
        include: {
          itens: { where: { isActive: true }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] },
          fornecedores: { include: { fornecedor: { select: { razaoSocial: true, email: true, contatoPrincipal: true } } } },
        },
      })
      if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cotação não encontrada.' })
      if (!c.itens.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Adicione itens antes de enviar a cotação.' })
      }
      const empresa = c.empresaId
        ? await db.empresa.findUnique({ where: { id: c.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } })
        : null
      return { c, empresa }
    })

    const { c, empresa } = dados
    const alvos = input.cotacaoFornecedorIds?.length
      ? c.fornecedores.filter((f) => input.cotacaoFornecedorIds!.includes(f.id))
      : c.fornecedores
    if (!alvos.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum fornecedor selecionado para envio.' })
    }

    const semEmail: string[] = []
    const enviados: string[] = []

    for (const f of alvos) {
      const pdf = await this.pdfService.gerar({
        cotacao: { code: c.code, titulo: c.titulo, observacoes: c.observacoes, prazoResposta: c.prazoResposta },
        itens: c.itens.map((i) => ({ descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade })),
        fornecedor: { razaoSocial: f.fornecedor.razaoSocial, contato: f.fornecedor.contatoPrincipal },
        empresa,
      }).catch(() => null)

      if (!f.fornecedor.email) { semEmail.push(f.fornecedor.razaoSocial); continue }

      const prazoTxt = c.prazoResposta
        ? ` até <strong>${new Date(c.prazoResposta).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong>`
        : ''
      const ok = await this.emailService.sendMail({
        to: f.fornecedor.email,
        subject: `Pedido de cotação #${c.code}${c.titulo ? ` — ${c.titulo}` : ''}`,
        html: `<p>Olá${f.fornecedor.contatoPrincipal ? `, ${escapeHtml(f.fornecedor.contatoPrincipal.split(' ')[0] ?? '')}` : ''}!</p>
        <p>Gostaríamos de receber sua proposta${prazoTxt} para os itens do pedido de cotação
        <strong>#${c.code}</strong>, em anexo.</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr style="text-align:left;color:#6b7280">
            <th style="padding:0 10px 6px 0">Item</th>
            <th style="padding:0 10px 6px 0">Unid.</th>
            <th style="padding:0 0 6px 0;text-align:right">Qtd.</th>
          </tr>
          ${c.itens.map((i) =>
            `<tr><td style="padding:4px 10px 4px 0">${escapeHtml(i.descricao)}</td>`
            + `<td style="padding:4px 10px 4px 0">${escapeHtml(i.unidade ?? '—')}</td>`
            + `<td style="padding:4px 0;text-align:right">${i.quantidade}</td></tr>`,
          ).join('')}
        </table>
        ${c.observacoes ? `<p style="margin-top:12px">${escapeHtml(c.observacoes)}</p>` : ''}
        <p style="margin-top:14px;color:#6b7280;font-size:13px">
          Basta responder este e-mail com o preço unitário de cada item, o frete, o prazo de entrega e a forma de pagamento.
        </p>
        <p style="color:#6b7280;font-size:13px">${escapeHtml(empresa?.nomeFantasia || empresa?.razaoSocial || '')}</p>`,
        ...(pdf ? { attachments: [{ filename: `cotacao-${c.code}.pdf`, content: pdf }] } : {}),
      }).catch(() => false)

      if (ok) enviados.push(f.id)
    }

    if (enviados.length) {
      await scoped(tenantSchema, async (db) => {
        await db.compraCotacaoFornecedor.updateMany({
          where: { id: { in: enviados } }, data: { enviadoEm: new Date() },
        })
        // Não rebaixa uma cotação que já está sendo apurada.
        await db.compraCotacao.updateMany({
          where: { id: c.id, status: 'RASCUNHO' }, data: { status: 'ENVIADA' },
        })
      })
    }

    return { enviados: enviados.length, semEmail }
  }

  /** PDF de um fornecedor específico — usado no download pela tela. */
  async pdf(cotacaoId: string, cotacaoFornecedorId: string | null, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const c = await db.compraCotacao.findUnique({
        where: { id: cotacaoId },
        include: {
          itens: { where: { isActive: true }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] },
          fornecedores: { include: { fornecedor: { select: { razaoSocial: true, contatoPrincipal: true } } } },
        },
      })
      if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cotação não encontrada.' })
      const f = cotacaoFornecedorId ? c.fornecedores.find((x) => x.id === cotacaoFornecedorId) : null
      const empresa = c.empresaId
        ? await db.empresa.findUnique({ where: { id: c.empresaId }, select: { razaoSocial: true, nomeFantasia: true, logoUrl: true } })
        : null
      const buffer = await this.pdfService.gerar({
        cotacao: { code: c.code, titulo: c.titulo, observacoes: c.observacoes, prazoResposta: c.prazoResposta },
        itens: c.itens.map((i) => ({ descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade })),
        fornecedor: f ? { razaoSocial: f.fornecedor.razaoSocial, contato: f.fornecedor.contatoPrincipal } : null,
        empresa,
      })
      return { buffer, filename: `cotacao-${c.code}${f ? `-${f.fornecedor.razaoSocial.slice(0, 20).replace(/[^\w]+/g, '-')}` : ''}.pdf` }
    })
  }

  // ── Conversão em pedidos ───────────────────────────────────

  /**
   * Gera UM pedido de compra por fornecedor premiado, cada um só com os itens
   * que ganhou, no preço cotado e com as condições comerciais daquele
   * fornecedor. É aqui que o split award se materializa.
   */
  async gerarPedidos(cotacaoId: string, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const c = await db.compraCotacao.findUnique({
        where: { id: cotacaoId },
        include: {
          itens: { where: { isActive: true }, include: { precos: true } },
          fornecedores: true,
          compras: { select: { id: true } },
        },
      })
      if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cotação não encontrada.' })
      if (c.compras.length) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Esta cotação já gerou ${c.compras.length} pedido(s). Cancele-os antes de gerar de novo.`,
        })
      }

      const premiados = c.itens.filter((i) => i.vencedorId)
      if (!premiados.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Premie ao menos um item antes de gerar os pedidos.' })
      }

      // Agrupa os itens premiados por fornecedor — cada grupo é um pedido.
      const porFornecedor = new Map<string, typeof premiados>()
      for (const i of premiados) {
        const arr = porFornecedor.get(i.vencedorId!) ?? []
        arr.push(i)
        porFornecedor.set(i.vencedorId!, arr)
      }

      const criados: Array<{ id: string; code: number; fornecedor: string; itens: number }> = []
      for (const [cotFornId, itens] of porFornecedor) {
        const cf = c.fornecedores.find((f) => f.id === cotFornId)
        if (!cf) continue

        const pedido = await db.compra.create({
          data: {
            fornecedorId: cf.fornecedorId,
            solicitanteId: userId || c.solicitanteId || null,
            empresaId: c.empresaId,
            cotacaoId: c.id,
            status: 'NOVO',
            frete: cf.frete,
            prazoEntrega: cf.prazoEntrega,
            prazoPagamento: cf.prazoPagamento,
            formaPagamento: cf.formaPagamento,
            observacoes: [
              `Gerado da cotação #${c.code}${c.titulo ? ` — ${c.titulo}` : ''}.`,
              cf.observacoes || null,
            ].filter(Boolean).join('\n'),
            itens: {
              create: itens.map((i) => ({
                descricao: i.descricao,
                unidade: i.unidade,
                quantidade: i.quantidade,
                valorUnitario: i.precos.find((p) => p.cotacaoFornecedorId === cotFornId)?.valorUnitario ?? 0,
              })),
            },
          },
          select: { id: true, code: true },
        })
        criados.push({ id: pedido.id, code: pedido.code, fornecedor: cotFornId, itens: itens.length })
      }

      await db.compraCotacao.update({ where: { id: c.id }, data: { status: 'CONVERTIDA' } })
      return { pedidos: criados }
    })
  }

  /** Resumo textual usado nas mensagens de confirmação da tela. */
  resumoBrl(v: number) {
    return brl(v)
  }
}
