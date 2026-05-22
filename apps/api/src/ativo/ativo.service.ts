import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type {
  CreateAtivoInput, UpdateAtivoInput, ListAtivoInput,
  CreateAtivoTipoInput, UpdateAtivoTipoInput,
  CreateAtivoCategoriaInput, UpdateAtivoCategoriaInput,
  CreateAtivoManutencaoInput, UpdateAtivoManutencaoInput,
  CreateAtivoAnexoInput,
} from '@saas/types'

/**
 * Service do módulo Gestão de Ativos (TI / Patrimônio).
 *
 * Responsabilidades:
 *  - CRUD de Ativo + filtros + paginação + soft delete
 *  - CRUD de AtivoTipo e AtivoCategoria
 *  - Log automático de movimentações (CADASTRO no create; demais ficam na F2)
 *  - Multi-tenancy via empresaId (master vê tudo)
 *
 * Movimentações, manutenções e anexos têm seus próprios métodos auxiliares,
 * mas só os essenciais ficam aqui na F1. F2 expande o log automático.
 */
@Injectable()
export class AtivoService {
  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  /** Filtro base de tenancy: master vê tudo; demais só veem da própria empresa
   *  + registros globais (empresaId=null). */
  private tenantWhere(isMaster: boolean, empresaId?: string) {
    if (isMaster) return {}
    return empresaId
      ? { OR: [{ empresaId }, { empresaId: null }] }
      : { empresaId: null }
  }

  /** Gera tag sequencial baseada no maior `code` da empresa: AT-0001, AT-0002... */
  private async gerarTag(empresaId?: string): Promise<string> {
    const last = await prisma.ativo.findFirst({
      where: empresaId ? { empresaId } : {},
      orderBy: { code: 'desc' },
      select: { code: true },
    })
    const next = (last?.code ?? 0) + 1
    return `AT-${String(next).padStart(4, '0')}`
  }

  // ─────────────────────────────────────────────────────────────
  // CRUD: AtivoTipo
  // ─────────────────────────────────────────────────────────────

  async listTipos(isMaster: boolean, empresaId?: string) {
    return prisma.ativoTipo.findMany({
      where: { ativo: true, ...this.tenantWhere(isMaster, empresaId) },
      include: { _count: { select: { ativos: true, categorias: true } } },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
  }

  async createTipo(data: CreateAtivoTipoInput, empresaId?: string) {
    return prisma.ativoTipo.create({ data: { ...data, empresaId: empresaId ?? null } })
  }

  async updateTipo(id: string, data: UpdateAtivoTipoInput) {
    return prisma.ativoTipo.update({ where: { id }, data })
  }

  async deleteTipo(id: string) {
    // Soft delete — preserva FKs em ativos existentes
    return prisma.ativoTipo.update({ where: { id }, data: { ativo: false } })
  }

  // ─────────────────────────────────────────────────────────────
  // CRUD: AtivoCategoria
  // ─────────────────────────────────────────────────────────────

  async listCategorias(isMaster: boolean, empresaId?: string, tipoId?: string) {
    return prisma.ativoCategoria.findMany({
      where: {
        ativo: true,
        ...this.tenantWhere(isMaster, empresaId),
        ...(tipoId ? { tipoId } : {}),
      },
      include: { tipo: { select: { id: true, nome: true, cor: true, icone: true } } },
      orderBy: [{ tipo: { ordem: 'asc' } }, { ordem: 'asc' }, { nome: 'asc' }],
    })
  }

  async createCategoria(data: CreateAtivoCategoriaInput, empresaId?: string) {
    return prisma.ativoCategoria.create({ data: { ...data, empresaId: empresaId ?? null } })
  }

  async updateCategoria(id: string, data: UpdateAtivoCategoriaInput) {
    return prisma.ativoCategoria.update({ where: { id }, data })
  }

  async deleteCategoria(id: string) {
    return prisma.ativoCategoria.update({ where: { id }, data: { ativo: false } })
  }

  // ─────────────────────────────────────────────────────────────
  // Ativo: list / paginação
  // ─────────────────────────────────────────────────────────────

  async list(input: ListAtivoInput, isMaster: boolean, empresaId?: string) {
    const {
      page, limit, search, status, tipoId, categoriaId,
      responsavelId, areaId, clienteId, incluirInativos,
      sortBy, sortDir,
    } = input

    const where: any = {
      ...this.tenantWhere(isMaster, empresaId),
      ...(incluirInativos ? {} : { isActive: true }),
      ...(status ? { status } : {}),
      ...(tipoId ? { tipoId } : {}),
      ...(categoriaId ? { categoriaId } : {}),
      ...(responsavelId ? { responsavelId } : {}),
      ...(areaId ? { areaId } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(search
        ? {
            OR: [
              { tag:        { contains: search, mode: 'insensitive' } },
              { nome:       { contains: search, mode: 'insensitive' } },
              { fabricante: { contains: search, mode: 'insensitive' } },
              { modelo:     { contains: search, mode: 'insensitive' } },
              { serial:     { contains: search, mode: 'insensitive' } },
              { patrimonio: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, data] = await Promise.all([
      prisma.ativo.count({ where }),
      prisma.ativo.findMany({
        where,
        include: {
          tipo:        { select: { id: true, nome: true, cor: true, icone: true } },
          categoria:   { select: { id: true, nome: true, depreciacaoMeses: true } },
          responsavel: { select: { id: true, name: true, image: true } },
          area:        { select: { id: true, name: true } },
          cliente:     { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          fornecedor:  { select: { id: true, razaoSocial: true } },
        },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const totalPages = Math.max(1, Math.ceil(total / limit))
    return {
      data, total, page, limit, totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Ativo: detalhe completo
  // ─────────────────────────────────────────────────────────────

  async getById(id: string, isMaster: boolean, empresaId?: string) {
    return prisma.ativo.findFirst({
      where: { id, ...this.tenantWhere(isMaster, empresaId) },
      include: {
        tipo:        true,
        categoria:   true,
        responsavel: { select: { id: true, name: true, email: true, image: true } },
        area:        { select: { id: true, name: true } },
        cliente:     { select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true } },
        fornecedor:  { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        movimentacoes: {
          include: { registradoPor: { select: { id: true, name: true, image: true } } },
          orderBy: { createdAt: 'desc' },
        },
        manutencoes: {
          include: {
            fornecedor:  { select: { id: true, razaoSocial: true } },
            responsavel: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        anexos: { orderBy: { createdAt: 'desc' } },
        // Tickets de Helpdesk vinculados a este ativo (back-ref via ticket.ativoId)
        helpdeskTickets: {
          where: { ativo: true, arquivado: false },
          select: {
            id: true, numero: true, titulo: true, tipo: true, prioridade: true, status: true,
            createdAt: true, resolvidoEm: true,
            responsavel: { select: { id: true, name: true, image: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })
  }

  /** Lista ativos atribuídos a um usuário — usado no detalhe do colaborador. */
  async listByResponsavel(responsavelId: string, isMaster: boolean, empresaId?: string) {
    return prisma.ativo.findMany({
      where: {
        isActive: true,
        responsavelId,
        ...this.tenantWhere(isMaster, empresaId),
      },
      include: {
        tipo:      { select: { nome: true, cor: true } },
        categoria: { select: { nome: true } },
      },
      orderBy: { tag: 'asc' },
    })
  }

  // ─────────────────────────────────────────────────────────────
  // Ativo: create / update / delete
  // ─────────────────────────────────────────────────────────────

  async create(input: CreateAtivoInput, empresaId?: string, userId?: string) {
    const tag = input.tag?.trim() || await this.gerarTag(empresaId)
    const ativo = await prisma.ativo.create({
      data: {
        tag,
        nome:       input.nome,
        descricao:  input.descricao ?? null,
        tipoId:     input.tipoId,
        categoriaId: input.categoriaId,
        fabricante: input.fabricante ?? null,
        modelo:     input.modelo ?? null,
        serial:     input.serial ?? null,
        patrimonio: input.patrimonio ?? null,
        fornecedorId:   input.fornecedorId ?? null,
        notaFiscal:     input.notaFiscal ?? null,
        dataAquisicao:  input.dataAquisicao ?? null,
        valorAquisicao: input.valorAquisicao ?? null,
        garantiaInicio: input.garantiaInicio ?? null,
        garantiaFim:    input.garantiaFim ?? null,
        status:         input.status ?? 'ESTOQUE',
        localizacao:    input.localizacao ?? null,
        responsavelId:  input.responsavelId ?? null,
        areaId:         input.areaId ?? null,
        clienteId:      input.clienteId ?? null,
        observacoes:    input.observacoes ?? null,
        empresaId: empresaId ?? null,
      },
    })

    // Log inicial de CADASTRO (snapshot dos campos atribuídos no momento da criação)
    await prisma.ativoMovimentacao.create({
      data: {
        ativoId: ativo.id,
        tipo:    'CADASTRO',
        paraResponsavelId: ativo.responsavelId,
        paraAreaId:        ativo.areaId,
        paraClienteId:     ativo.clienteId,
        statusNovo:        ativo.status,
        motivo:            'Cadastro inicial',
        registradoPorId:   userId ?? null,
      },
    })

    return ativo
  }

  async update(id: string, data: UpdateAtivoInput, isMaster: boolean, empresaId?: string, userId?: string) {
    // Carrega snapshot atual pra detectar diffs (responsavel/area/cliente/status)
    const atual = await prisma.ativo.findFirst({
      where: { id, ...this.tenantWhere(isMaster, empresaId) },
    })
    if (!atual) throw new Error('Ativo não encontrado.')

    const updated = await prisma.ativo.update({
      where: { id },
      data: {
        ...(data.tag        !== undefined ? { tag: data.tag } : {}),
        ...(data.nome       !== undefined ? { nome: data.nome } : {}),
        ...(data.descricao  !== undefined ? { descricao: data.descricao } : {}),
        ...(data.tipoId     !== undefined ? { tipoId: data.tipoId } : {}),
        ...(data.categoriaId !== undefined ? { categoriaId: data.categoriaId } : {}),
        ...(data.fabricante !== undefined ? { fabricante: data.fabricante } : {}),
        ...(data.modelo     !== undefined ? { modelo: data.modelo } : {}),
        ...(data.serial     !== undefined ? { serial: data.serial } : {}),
        ...(data.patrimonio !== undefined ? { patrimonio: data.patrimonio } : {}),
        ...(data.fornecedorId   !== undefined ? { fornecedorId: data.fornecedorId } : {}),
        ...(data.notaFiscal     !== undefined ? { notaFiscal: data.notaFiscal } : {}),
        ...(data.dataAquisicao  !== undefined ? { dataAquisicao: data.dataAquisicao } : {}),
        ...(data.valorAquisicao !== undefined ? { valorAquisicao: data.valorAquisicao } : {}),
        ...(data.garantiaInicio !== undefined ? { garantiaInicio: data.garantiaInicio } : {}),
        ...(data.garantiaFim    !== undefined ? { garantiaFim: data.garantiaFim } : {}),
        ...(data.status         !== undefined ? { status: data.status } : {}),
        ...(data.localizacao    !== undefined ? { localizacao: data.localizacao } : {}),
        ...(data.responsavelId  !== undefined ? { responsavelId: data.responsavelId } : {}),
        ...(data.areaId         !== undefined ? { areaId: data.areaId } : {}),
        ...(data.clienteId      !== undefined ? { clienteId: data.clienteId } : {}),
        ...(data.observacoes    !== undefined ? { observacoes: data.observacoes } : {}),
        ...(data.isActive       !== undefined ? { isActive: data.isActive } : {}),
      },
    })

    // Detecta mudanças relevantes e cria log de movimentação automático (F2 plano).
    const mudouResp     = data.responsavelId !== undefined && data.responsavelId !== atual.responsavelId
    const mudouArea     = data.areaId        !== undefined && data.areaId !== atual.areaId
    const mudouCliente  = data.clienteId     !== undefined && data.clienteId !== atual.clienteId
    const mudouStatus   = data.status        !== undefined && data.status !== atual.status

    if (mudouResp || mudouArea || mudouCliente || mudouStatus) {
      // Determina tipo lógico da movimentação:
      // - clienteId definido = EMPRESTIMO (ou DEVOLUCAO se zerou)
      // - status virou DESCARTADO/PERDIDO = BAIXA
      // - status mudou (qualquer outro) = STATUS_CHANGE
      // - responsável/área mudaram = TRANSFERENCIA
      let tipo: 'TRANSFERENCIA' | 'STATUS_CHANGE' | 'EMPRESTIMO' | 'DEVOLUCAO' | 'BAIXA' = 'TRANSFERENCIA'
      if (mudouCliente) {
        tipo = data.clienteId ? 'EMPRESTIMO' : 'DEVOLUCAO'
      } else if (mudouStatus) {
        tipo = (data.status === 'DESCARTADO' || data.status === 'PERDIDO') ? 'BAIXA' : 'STATUS_CHANGE'
      }

      await prisma.ativoMovimentacao.create({
        data: {
          ativoId: id,
          tipo,
          deResponsavelId:   mudouResp     ? atual.responsavelId : null,
          paraResponsavelId: mudouResp     ? updated.responsavelId : null,
          deAreaId:          mudouArea     ? atual.areaId : null,
          paraAreaId:        mudouArea     ? updated.areaId : null,
          deClienteId:       mudouCliente  ? atual.clienteId : null,
          paraClienteId:     mudouCliente  ? updated.clienteId : null,
          statusAnterior:    mudouStatus   ? atual.status : null,
          statusNovo:        mudouStatus   ? updated.status : null,
          registradoPorId:   userId ?? null,
        },
      })
    }

    return updated
  }

  /** Soft delete + log BAIXA. */
  async delete(id: string, isMaster: boolean, empresaId?: string, userId?: string) {
    const atual = await prisma.ativo.findFirst({
      where: { id, ...this.tenantWhere(isMaster, empresaId) },
    })
    if (!atual) throw new Error('Ativo não encontrado.')
    await prisma.ativo.update({ where: { id }, data: { isActive: false, status: 'DESCARTADO' } })
    await prisma.ativoMovimentacao.create({
      data: {
        ativoId: id,
        tipo: 'BAIXA',
        statusAnterior: atual.status,
        statusNovo: 'DESCARTADO',
        motivo: 'Soft delete',
        registradoPorId: userId ?? null,
      },
    })
    return { ok: true }
  }

  /** Lista enxuta pra Selects (combo). */
  async listForSelect(isMaster: boolean, empresaId?: string) {
    return prisma.ativo.findMany({
      where: { isActive: true, ...this.tenantWhere(isMaster, empresaId) },
      select: { id: true, tag: true, nome: true },
      orderBy: { tag: 'asc' },
    })
  }

  // ─────────────────────────────────────────────────────────────
  // Manutenções (CRUD + log de movimentação automático)
  // ─────────────────────────────────────────────────────────────

  async createManutencao(data: CreateAtivoManutencaoInput, userId?: string) {
    const m = await prisma.ativoManutencao.create({
      data: {
        ativoId:           data.ativoId,
        tipo:              data.tipo,
        descricao:         data.descricao,
        fornecedorId:      data.fornecedorId ?? null,
        custoMaoObra:      data.custoMaoObra ?? null,
        custoPecas:        data.custoPecas ?? null,
        dataInicio:        data.dataInicio ?? null,
        dataFim:           data.dataFim ?? null,
        proximaPreventiva: data.proximaPreventiva ?? null,
        responsavelId:     data.responsavelId ?? null,
        observacoes:       data.observacoes ?? null,
      },
    })
    // Log no histórico do ativo
    await prisma.ativoMovimentacao.create({
      data: {
        ativoId: data.ativoId,
        tipo: 'MANUTENCAO',
        motivo: `Manutenção ${data.tipo.toLowerCase()} registrada: ${data.descricao.slice(0, 100)}`,
        registradoPorId: userId ?? null,
      },
    })
    return m
  }

  async updateManutencao(id: string, data: UpdateAtivoManutencaoInput) {
    return prisma.ativoManutencao.update({
      where: { id },
      data: {
        ...(data.tipo              !== undefined ? { tipo: data.tipo } : {}),
        ...(data.descricao         !== undefined ? { descricao: data.descricao } : {}),
        ...(data.fornecedorId      !== undefined ? { fornecedorId: data.fornecedorId } : {}),
        ...(data.custoMaoObra      !== undefined ? { custoMaoObra: data.custoMaoObra } : {}),
        ...(data.custoPecas        !== undefined ? { custoPecas: data.custoPecas } : {}),
        ...(data.dataInicio        !== undefined ? { dataInicio: data.dataInicio } : {}),
        ...(data.dataFim           !== undefined ? { dataFim: data.dataFim } : {}),
        ...(data.proximaPreventiva !== undefined ? { proximaPreventiva: data.proximaPreventiva } : {}),
        ...(data.responsavelId     !== undefined ? { responsavelId: data.responsavelId } : {}),
        ...(data.observacoes       !== undefined ? { observacoes: data.observacoes } : {}),
      },
    })
  }

  async deleteManutencao(id: string) {
    return prisma.ativoManutencao.delete({ where: { id } })
  }

  // ─────────────────────────────────────────────────────────────
  // Anexos (F4)
  // ─────────────────────────────────────────────────────────────

  async createAnexo(data: CreateAtivoAnexoInput) {
    return prisma.ativoAnexo.create({
      data: {
        ativoId:    data.ativoId,
        tipo:       data.tipo,
        fileName:   data.fileName,
        storageKey: data.storageKey,
        fileSize:   data.fileSize ?? null,
        mimeType:   data.mimeType ?? null,
        descricao:  data.descricao ?? null,
      },
    })
  }

  async deleteAnexo(id: string) {
    return prisma.ativoAnexo.delete({ where: { id } })
  }

  // ─────────────────────────────────────────────────────────────
  // Alertas (F3): garantia vencendo
  // ─────────────────────────────────────────────────────────────

  /**
   * Estatísticas agregadas pra dashboard topo: contagem por status, valor
   * patrimonial total, garantias vencendo, manutenções em aberto, ativos sem
   * inventário há >= 6 meses.
   */
  async getEstatisticas(isMaster: boolean, empresaId?: string) {
    const tw = this.tenantWhere(isMaster, empresaId)
    const seisMesesAtras = new Date()
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6)
    const trintaDiasFrente = new Date()
    trintaDiasFrente.setDate(trintaDiasFrente.getDate() + 30)

    const [
      total, ativos, manutencao, estoque, emprestado, descartado, perdido,
      valorAgg, garantiasVencendo, semInventario,
      manutencoesAbertas, custoManutTotal,
    ] = await Promise.all([
      prisma.ativo.count({ where: { isActive: true, ...tw } }),
      prisma.ativo.count({ where: { isActive: true, status: 'ATIVO',      ...tw } }),
      prisma.ativo.count({ where: { isActive: true, status: 'MANUTENCAO', ...tw } }),
      prisma.ativo.count({ where: { isActive: true, status: 'ESTOQUE',    ...tw } }),
      prisma.ativo.count({ where: { isActive: true, status: 'EMPRESTADO', ...tw } }),
      prisma.ativo.count({ where: { isActive: true, status: 'DESCARTADO', ...tw } }),
      prisma.ativo.count({ where: { isActive: true, status: 'PERDIDO',    ...tw } }),
      prisma.ativo.aggregate({
        _sum: { valorAquisicao: true },
        where: { isActive: true, ...tw },
      }),
      prisma.ativo.count({
        where: {
          isActive: true, ...tw,
          garantiaFim: { gte: new Date(), lte: trintaDiasFrente },
          status: { notIn: ['DESCARTADO', 'PERDIDO'] },
        },
      }),
      prisma.ativo.count({
        where: {
          isActive: true, ...tw,
          OR: [
            { ultimoInventarioEm: null },
            { ultimoInventarioEm: { lt: seisMesesAtras } },
          ],
        },
      }),
      prisma.ativoManutencao.count({
        where: { ativo: { isActive: true, ...tw }, dataFim: null },
      }),
      prisma.ativoManutencao.aggregate({
        _sum: { custoMaoObra: true, custoPecas: true },
        where: { ativo: { isActive: true, ...tw } },
      }),
    ])

    return {
      total,
      porStatus: { ativos, manutencao, estoque, emprestado, descartado, perdido },
      valorPatrimonial: Number(valorAgg._sum.valorAquisicao ?? 0),
      garantiasVencendo,
      semInventarioSeis: semInventario,
      manutencoesAbertas,
      custoManutencoesTotal:
        Number(custoManutTotal._sum.custoMaoObra ?? 0) +
        Number(custoManutTotal._sum.custoPecas ?? 0),
    }
  }

  /**
   * Marca uma lista de ativos como inventariados agora (ultimoInventarioEm =
   * NOW). Usado pelo modal "Inventário em massa" — confirma que o operador
   * verificou fisicamente os ativos.
   */
  async marcarInventariadosEmMassa(ids: string[], isMaster: boolean, empresaId?: string) {
    if (ids.length === 0) return { atualizados: 0 }
    const result = await prisma.ativo.updateMany({
      where: { id: { in: ids }, ...this.tenantWhere(isMaster, empresaId) },
      data: { ultimoInventarioEm: new Date() },
    })
    return { atualizados: result.count }
  }

  /**
   * Lista ativos cuja garantia vence em <= `diasAntes` dias. Usado em dashboards
   * e (futuramente) no notification scheduler pra alertar TI.
   */
  async listGarantiasVencendo(isMaster: boolean, empresaId?: string, diasAntes = 30) {
    const limite = new Date()
    limite.setDate(limite.getDate() + diasAntes)
    return prisma.ativo.findMany({
      where: {
        isActive: true,
        ...this.tenantWhere(isMaster, empresaId),
        garantiaFim: { lte: limite, gte: new Date() },
        status: { notIn: ['DESCARTADO', 'PERDIDO'] },
      },
      include: {
        tipo:        { select: { nome: true, cor: true } },
        categoria:   { select: { nome: true } },
        responsavel: { select: { id: true, name: true } },
      },
      orderBy: { garantiaFim: 'asc' },
    })
  }
}
