import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake, scoped, Prisma } from '@saas/db'
import type {
  CreateFornecedorInput, UpdateFornecedorInput, ListFornecedorInput,
  CreateFornecedorAnexoInput, UpdateFornecedorAnexoInput,
  CreateFornecedorCriterioInput, UpdateFornecedorCriterioInput,
  ResponderQualificacaoInput,
  CreateFornecedorMensagemInput, UpdateFornecedorMensagemInput,
} from '@saas/types'

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.FornecedorWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

@Injectable()
export class FornecedorService {
  async list(input: ListFornecedorInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, sortBy, sortDir, isActive, tipoFornecedor, tipoDocumento } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.FornecedorWhereInput = {
        ...empresaFilter(isMaster, empresaId),
        ...(search ? {
          OR: [
            { razaoSocial: { contains: search, mode: 'insensitive' as const } },
            { nomeFantasia: { contains: search, mode: 'insensitive' as const } },
            { documento: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(tipoFornecedor ? { tipoFornecedor: tipoFornecedor as Prisma.EnumTipoFornecedorFilter['equals'] } : {}),
        ...(tipoDocumento ? { tipoDocumento: tipoDocumento as Prisma.EnumTipoDocumentoFilter['equals'] } : {}),
      }

      const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

      const [data, total] = await Promise.all([
        db.fornecedor.findMany({ where, orderBy, skip, take }),
        db.fornecedor.count({ where }),
      ])

      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const fornecedor = await db.fornecedor.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && fornecedor.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      return fornecedor
    })
  }

  async create(input: CreateFornecedorInput, userId?: string, _isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const fornecedor = await db.fornecedor.create({
        data: {
          razaoSocial: input.razaoSocial,
          nomeFantasia: input.nomeFantasia || null,
          documento: input.documento.replace(/\D/g, ''),
          tipoDocumento: input.tipoDocumento,
          inscricaoEstadual: input.inscricaoEstadual || null,
          inscricaoMunicipal: input.inscricaoMunicipal || null,
          tipoFornecedor: input.tipoFornecedor,
          categoria: input.categoria || null,
          logoUrl: input.logoUrl || null,
          risco: input.risco,
          avaliacaoObrigatoria: input.avaliacaoObrigatoria,
          telefone: input.telefone || null,
          celular: input.celular || null,
          email: input.email || null,
          site: input.site || null,
          contatoPrincipal: input.contatoPrincipal || null,
          cargoContato: input.cargoContato || null,
          cep: input.cep || null,
          logradouro: input.logradouro || null,
          numero: input.numero || null,
          complemento: input.complemento || null,
          bairro: input.bairro || null,
          cidade: input.cidade || null,
          uf: input.uf || null,
          banco: input.banco || null,
          agencia: input.agencia || null,
          conta: input.conta || null,
          tipoConta: input.tipoConta || null,
          pixChave: input.pixChave || null,
          pixTipo: input.pixTipo || null,
          observacoes: input.observacoes || null,
          isActive: input.isActive,
          empresaId: empresaId || null,
        },
      })

      await db.fornecedorEvent.create({
        data: {
          fornecedorId: fornecedor.id,
          userId: userId || null,
          type: 'created',
          version: 1,
        },
      })

      return fornecedor
    })
  }

  async update(id: string, input: UpdateFornecedorInput, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.fornecedor.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {}
      const data: Prisma.FornecedorUpdateInput = {}

      function track(field: keyof UpdateFornecedorInput) {
        if (input[field] === undefined) return
        const oldVal = (existing as Record<string, unknown>)[field as string]
        let newVal: unknown = input[field]
        if (field === 'documento' && typeof newVal === 'string') newVal = newVal.replace(/\D/g, '')
        if (newVal === '') newVal = null
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes[field as string] = { from: oldVal, to: newVal }
        }
        ;(data as Record<string, unknown>)[field as string] = newVal
      }

      const fields: (keyof UpdateFornecedorInput)[] = [
        'razaoSocial', 'nomeFantasia', 'documento', 'tipoDocumento',
        'inscricaoEstadual', 'inscricaoMunicipal', 'tipoFornecedor', 'categoria', 'logoUrl',
        'risco', 'avaliacaoObrigatoria',
        'telefone', 'celular', 'email', 'site', 'contatoPrincipal', 'cargoContato',
        'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
        'banco', 'agencia', 'conta', 'tipoConta', 'pixChave', 'pixTipo',
        'observacoes', 'isActive',
      ]
      for (const f of fields) track(f)

      const newVersion = existing.version + 1
      data.version = newVersion

      const updated = await db.fornecedor.update({ where: { id }, data })

      if (Object.keys(changes).length > 0) {
        await db.fornecedorEvent.create({
          data: {
            fornecedorId: id,
            userId: userId || null,
            type: 'updated',
            version: newVersion,
            changes: changes as unknown as Prisma.InputJsonValue,
          },
        })
      }

      return updated
    })
  }

  async delete(id: string, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.fornecedor.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }

      await db.fornecedorEvent.create({
        data: {
          fornecedorId: id,
          userId: userId || null,
          type: 'deleted',
          version: existing.version,
        },
      })

      return db.fornecedor.delete({ where: { id } })
    })
  }

  async listForSelect(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedor.findMany({
        where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
        select: { id: true, razaoSocial: true, nomeFantasia: true, code: true, documento: true },
        orderBy: { razaoSocial: 'asc' },
      }),
    )
  }

  async getEvents(id: string) {
    return prisma.fornecedorEvent.findMany({
      where: { fornecedorId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async exportAll(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedor.findMany({
        where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
        orderBy: { code: 'asc' },
      }),
    )
  }

  async bulkCreate(items: CreateFornecedorInput[], userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, userId, isMaster, empresaId, tenantSchema)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }

  // ── Anexos (port v1 cad_for_arq) ────────────────────────────
  async listAnexos(fornecedorId: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const anexos = await db.fornecedorAnexo.findMany({
        where: { fornecedorId, isActive: true },
        orderBy: { createdAt: 'desc' },
      })
      const userIds = [...new Set(anexos.map((a) => a.uploadedById).filter(Boolean))] as string[]
      const users = userIds.length
        ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } })
        : []
      const umap = new Map(users.map((u) => [u.id, u]))
      return anexos.map((a) => ({ ...a, uploadedBy: a.uploadedById ? umap.get(a.uploadedById) ?? null : null }))
    })
  }

  async addAnexo(input: CreateFornecedorAnexoInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorAnexo.create({
        data: {
          fornecedorId: input.fornecedorId,
          descricao: input.descricao || null,
          fileUrl: input.fileUrl,
          fileName: input.fileName,
          mimeType: input.mimeType || null,
          tamanho: input.tamanho ?? null,
          uploadedById: userId || null,
        },
      }),
    )
  }

  async updateAnexo(input: UpdateFornecedorAnexoInput, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorAnexo.update({ where: { id: input.id }, data: { descricao: input.descricao || null } }),
    )
  }

  async removeAnexo(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorAnexo.update({ where: { id }, data: { isActive: false } }),
    )
  }

  // ── Critérios de seleção/homologação (port v1 cad_for_cri) ──
  async listCriterios(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorCriterio.findMany({
        where: {
          isActive: true,
          ...(!isMaster && empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
        },
        orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      }),
    )
  }

  async createCriterio(input: CreateFornecedorCriterioInput, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorCriterio.create({
        data: {
          tipoFornecedor: input.tipoFornecedor,
          criterio: input.criterio,
          ordem: input.ordem,
          empresaId: empresaId || null,
        },
      }),
    )
  }

  async updateCriterio(input: UpdateFornecedorCriterioInput, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorCriterio.update({
        where: { id: input.id },
        data: {
          ...(input.criterio !== undefined ? { criterio: input.criterio } : {}),
          ...(input.tipoFornecedor !== undefined ? { tipoFornecedor: input.tipoFornecedor } : {}),
          ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      }),
    )
  }

  async deleteCriterio(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorCriterio.update({ where: { id }, data: { isActive: false } }),
    )
  }

  /** Checklist de qualificação de um fornecedor: critérios aplicáveis ao tipo dele
   *  (ou AMBOS) + a resposta atual (atende Sim/Não), se houver. */
  async getQualificacoes(fornecedorId: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const forn = await db.fornecedor.findUniqueOrThrow({
        where: { id: fornecedorId },
        select: { tipoFornecedor: true },
      })
      const criterios = await db.fornecedorCriterio.findMany({
        where: {
          isActive: true,
          ...(!isMaster && empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
          ...(forn.tipoFornecedor !== 'AMBOS'
            ? { tipoFornecedor: { in: [forn.tipoFornecedor, 'AMBOS'] } }
            : {}),
        },
        orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      })
      const respostas = await db.fornecedorQualificacao.findMany({ where: { fornecedorId } })
      const mapa = new Map(respostas.map((r) => [r.criterioId, r]))
      return criterios.map((c) => {
        const r = mapa.get(c.id)
        return { id: c.id, criterio: c.criterio, tipoFornecedor: c.tipoFornecedor, ordem: c.ordem, atende: r?.atende ?? null, respondidoEm: r?.createdAt ?? null }
      })
    })
  }

  async responderQualificacao(input: ResponderQualificacaoInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorQualificacao.upsert({
        where: { fornecedorId_criterioId: { fornecedorId: input.fornecedorId, criterioId: input.criterioId } },
        create: { fornecedorId: input.fornecedorId, criterioId: input.criterioId, atende: input.atende, respondidoById: userId || null },
        update: { atende: input.atende, respondidoById: userId || null },
      }),
    )
  }

  // ── Mensagens/interações (port v1 cad_for_msg) ──────────────
  async listMensagens(fornecedorId: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const msgs = await db.fornecedorMensagem.findMany({
        where: { fornecedorId, isActive: true },
        orderBy: { createdAt: 'desc' },
      })
      const userIds = [...new Set(msgs.map((m) => m.autorId).filter(Boolean))] as string[]
      const users = userIds.length
        ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, image: true } })
        : []
      const umap = new Map(users.map((u) => [u.id, u]))
      return msgs.map((m) => ({ ...m, autor: m.autorId ? umap.get(m.autorId) ?? null : null }))
    })
  }

  async addMensagem(input: CreateFornecedorMensagemInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedorMensagem.create({ data: { fornecedorId: input.fornecedorId, texto: input.texto, autorId: userId || null } }),
    )
  }

  async updateMensagem(input: UpdateFornecedorMensagemInput, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const m = await db.fornecedorMensagem.findUniqueOrThrow({ where: { id: input.id } })
      if (userId && m.autorId && m.autorId !== userId) throw new Error('Só o autor pode editar a mensagem.')
      return db.fornecedorMensagem.update({ where: { id: input.id }, data: { texto: input.texto } })
    })
  }

  async removeMensagem(id: string, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const m = await db.fornecedorMensagem.findUniqueOrThrow({ where: { id } })
      if (userId && m.autorId && m.autorId !== userId) throw new Error('Só o autor pode excluir a mensagem.')
      return db.fornecedorMensagem.update({ where: { id }, data: { isActive: false } })
    })
  }

  // ── Avaliação de fornecimento (nota DERIVADA das compras) ────
  /**
   * Nota % do fornecedor derivada dos pedidos AVALIADOS nos últimos 365 dias
   * (port v1: cada critério "atende" pesa igual; % do pedido = atende/total×100;
   * nota = média das % dos pedidos). Faixas: >=90 verde, 60–89 amarelo, <60 vermelho.
   */
  async getAvaliacaoFornecimento(fornecedorId: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const limite = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
      const pedidos = await db.compra.findMany({
        where: { fornecedorId, status: 'AVALIADO', isActive: true, dataAvaliacao: { gte: limite } },
        select: { id: true, code: true, dataAvaliacao: true, nfNumero: true, avaliacoes: { select: { atende: true } } },
        orderBy: { dataAvaliacao: 'desc' },
      })
      const porPedido = pedidos.map((p) => {
        const total = p.avaliacoes.length
        const atende = p.avaliacoes.filter((a) => a.atende).length
        const pct = total > 0 ? Math.round((atende / total) * 10000) / 100 : null
        return { id: p.id, code: p.code, dataAvaliacao: p.dataAvaliacao, nfNumero: p.nfNumero, pct }
      })
      const comNota = porPedido.filter((p) => p.pct !== null) as Array<{ pct: number }>
      const nota = comNota.length ? Math.round((comNota.reduce((s, p) => s + p.pct, 0) / comNota.length) * 100) / 100 : null
      const faixa = nota === null ? null : nota >= 90 ? 'verde' : nota >= 60 ? 'amarelo' : 'vermelho'
      return { nota, faixa, totalPedidos: pedidos.length, pedidos: porPedido }
    })
  }
}
