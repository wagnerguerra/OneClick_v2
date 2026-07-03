import { Injectable, Inject } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import { OrcamentoService } from '../orcamento/orcamento.service'

// Status derivado de data_vencimento (não persistido) — espelha o dashboard do legado.
export type BeneficioStatus = 'NO_PRAZO' | 'VENCENDO' | 'VENCIDO' | 'SEM_DATA'

const DEFAULT_NOTIFICA_DIAS = 30

function calcStatus(dataVencimento: Date | string | null, notificaDias: number | null): BeneficioStatus {
  if (!dataVencimento) return 'SEM_DATA'
  const venc = new Date(dataVencimento)
  if (isNaN(venc.getTime())) return 'SEM_DATA'
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  venc.setHours(0, 0, 0, 0)
  if (venc.getTime() < hoje.getTime()) return 'VENCIDO'
  const dias = notificaDias ?? DEFAULT_NOTIFICA_DIAS
  const limite = new Date(hoje)
  limite.setDate(limite.getDate() + dias)
  if (venc.getTime() <= limite.getTime()) return 'VENCENDO'
  return 'NO_PRAZO'
}

interface CatalogoInput {
  nome: string
  servicoId?: string | null
  notificaVencimentoDias?: number | null
  obs?: string | null
  ativo?: boolean
}
interface VinculoInput {
  clienteId: string
  catalogoId: string
  dataVencimento?: string | null
  portaria?: string | null
  processo?: string | null
  obs?: string | null
  ativo?: boolean
}

@Injectable()
export class BeneficioFiscalService {
  // Tabelas novas via raw SQL (client Prisma typado não regenera por lock de DLL no Windows;
  // os models existem no schema para o build do prod). OrcamentoService reusado no auto-orçamento.
  constructor(@Inject(OrcamentoService) private readonly orcamentoService: OrcamentoService) {}

  // ============================================================
  // Catálogo
  // ============================================================
  async listCatalogo(empresaId?: string | null, incluirInativos = false) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c.id, c.nome, c.servico_id AS "servicoId",
              c.notifica_vencimento_dias AS "notificaVencimentoDias",
              c.obs, c.ativo,
              s.nome AS "servicoNome", s.valor_padrao AS "servicoValor",
              (SELECT count(*)::int FROM beneficio_fiscal_cliente v WHERE v.catalogo_id = c.id AND v.ativo = true) AS "emUso"
         FROM beneficio_fiscal_catalogo c
         LEFT JOIN servicos s ON s.id = c.servico_id
        WHERE (c.empresa_id IS NULL OR $1::text IS NULL OR c.empresa_id = $1)
          ${incluirInativos ? '' : 'AND c.ativo = true'}
        ORDER BY c.nome ASC`,
      empresaId ?? null,
    )) as any[]
    return rows.map(r => ({ ...r, servicoValor: r.servicoValor != null ? Number(r.servicoValor) : null }))
  }

  /** Clientes ativos pro seletor do vínculo (id, razão, documento) — sem exigir módulo `clientes`. */
  async clienteOpcoes(empresaId?: string | null) {
    return (await prisma.$queryRawUnsafe(
      `SELECT id, razao_social AS "razaoSocial", documento
         FROM clientes
        WHERE deleted_at IS NULL AND status <> 'INATIVA'
          AND ($1::text IS NULL OR empresa_id = $1)
        ORDER BY razao_social ASC`,
      empresaId ?? null,
    )) as Array<{ id: string; razaoSocial: string; documento: string | null }>
  }

  /** Serviços disponíveis pra vincular no catálogo (id, nome, valor) — sem exigir módulo `servicos`. */
  async servicoOpcoes(empresaId?: string | null) {
    const rows = await prisma.servico.findMany({
      where: {
        ativo: true,
        disponivelOrcamento: true,
        ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
      },
      select: { id: true, nome: true, valorPadrao: true, categoria: true },
      orderBy: { nome: 'asc' },
    })
    return rows.map(r => ({ ...r, valorPadrao: r.valorPadrao != null ? Number(r.valorPadrao) : null }))
  }

  async createCatalogo(input: CatalogoInput, empresaId?: string | null) {
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_fiscal_catalogo (id, nome, servico_id, notifica_vencimento_dias, obs, ativo, empresa_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.nome, input.servicoId ?? null, input.notificaVencimentoDias ?? null,
      input.obs ?? null, input.ativo ?? true, empresaId ?? null,
    )
    return { id }
  }

  async updateCatalogo(id: string, input: Partial<CatalogoInput>) {
    await prisma.$executeRawUnsafe(
      `UPDATE beneficio_fiscal_catalogo SET
         nome = COALESCE($2, nome),
         servico_id = $3,
         notifica_vencimento_dias = $4,
         obs = $5,
         ativo = COALESCE($6, ativo),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      id, input.nome ?? null, input.servicoId ?? null, input.notificaVencimentoDias ?? null,
      input.obs ?? null, input.ativo ?? null,
    )
    return { id }
  }

  async removeCatalogo(id: string) {
    // Soft-delete: inativa (vínculos referenciam via RESTRICT). Mantém histórico.
    await prisma.$executeRawUnsafe(
      `UPDATE beneficio_fiscal_catalogo SET ativo = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      id,
    )
    return { id }
  }

  // ============================================================
  // Vínculos cliente↔benefício
  // ============================================================
  async list(
    filtros: { status?: BeneficioStatus; clienteId?: string; busca?: string; incluirInativos?: boolean },
    empresaId?: string | null,
  ) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT v.id, v.cliente_id AS "clienteId", v.catalogo_id AS "catalogoId",
              v.orcamento_id AS "orcamentoId", v.data_vencimento AS "dataVencimento",
              v.portaria, v.processo, v.obs, v.ativo,
              cl.razao_social AS "clienteNome", cl.documento AS "clienteDocumento",
              cat.nome AS "beneficioNome", cat.notifica_vencimento_dias AS "notificaVencimentoDias",
              cat.servico_id AS "catalogoServicoId", s.nome AS "servicoNome",
              o.numero AS "orcamentoNumero", o.status AS "orcamentoStatus",
              p.id AS "processoId"
         FROM beneficio_fiscal_cliente v
         JOIN clientes cl ON cl.id = v.cliente_id
         JOIN beneficio_fiscal_catalogo cat ON cat.id = v.catalogo_id
         LEFT JOIN servicos s ON s.id = cat.servico_id
         LEFT JOIN orcamentos o ON o.id = v.orcamento_id
         LEFT JOIN processos p ON p.orcamento_id = v.orcamento_id
        WHERE ($1::text IS NULL OR v.empresa_id = $1)
          ${filtros.incluirInativos ? '' : 'AND v.ativo = true'}
          AND ($2::text IS NULL OR v.cliente_id = $2)
          AND ($3::text IS NULL OR cl.razao_social ILIKE '%'||$3||'%' OR cat.nome ILIKE '%'||$3||'%')
        ORDER BY v.data_vencimento ASC NULLS LAST, cl.razao_social ASC`,
      empresaId ?? null, filtros.clienteId ?? null, filtros.busca?.trim() || null,
    )) as any[]
    const withStatus = rows.map(r => ({
      ...r,
      status: calcStatus(r.dataVencimento, r.notificaVencimentoDias),
    }))
    return filtros.status ? withStatus.filter(r => r.status === filtros.status) : withStatus
  }

  async dashboard(empresaId?: string | null) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT v.data_vencimento AS "dataVencimento", cat.notifica_vencimento_dias AS "notificaVencimentoDias"
         FROM beneficio_fiscal_cliente v
         JOIN beneficio_fiscal_catalogo cat ON cat.id = v.catalogo_id
        WHERE v.ativo = true AND ($1::text IS NULL OR v.empresa_id = $1)`,
      empresaId ?? null,
    )) as any[]
    const counts = { NO_PRAZO: 0, VENCENDO: 0, VENCIDO: 0, SEM_DATA: 0, TOTAL: rows.length }
    for (const r of rows) counts[calcStatus(r.dataVencimento, r.notificaVencimentoDias)]++
    return counts
  }

  async createVinculo(input: VinculoInput, empresaId?: string | null) {
    // Duplicidade (espelha o legado): mesmo cliente+benefício ativo.
    const dup = (await prisma.$queryRawUnsafe(
      `SELECT id FROM beneficio_fiscal_cliente WHERE cliente_id = $1 AND catalogo_id = $2 LIMIT 1`,
      input.clienteId, input.catalogoId,
    )) as any[]
    if (dup.length > 0) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Já existe um vínculo para este cliente e benefício.' })
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_fiscal_cliente
         (id, cliente_id, catalogo_id, data_vencimento, portaria, processo, obs, ativo, empresa_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.clienteId, input.catalogoId, input.dataVencimento || null,
      input.portaria ?? null, input.processo ?? null, input.obs ?? null,
      input.ativo ?? true, empresaId ?? null,
    )
    return { id }
  }

  async updateVinculo(id: string, input: Partial<VinculoInput>) {
    await prisma.$executeRawUnsafe(
      `UPDATE beneficio_fiscal_cliente SET
         data_vencimento = $2::date,
         portaria = $3,
         processo = $4,
         obs = $5,
         ativo = COALESCE($6, ativo),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      id, input.dataVencimento || null, input.portaria ?? null, input.processo ?? null,
      input.obs ?? null, input.ativo ?? null,
    )
    return { id }
  }

  async removeVinculo(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM beneficio_fiscal_cliente WHERE id = $1`, id)
    return { id }
  }

  /** Exclusão em massa de vínculos. Retorna quantos foram excluídos. */
  async removeMany(ids: string[]) {
    if (!ids || ids.length === 0) return { ok: 0, falhou: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const affected = await prisma.$executeRawUnsafe(
      `DELETE FROM beneficio_fiscal_cliente WHERE id IN (${placeholders})`, ...ids)
    const ok = Number(affected) || 0
    return { ok, falhou: ids.length - ok }
  }

  // ============================================================
  // Auto-orçamento (porta orc-auto-criar / orc-auto-criar-massa)
  // ============================================================
  /** Gera um orçamento pro cliente do vínculo, usando o serviço vinculado ao benefício no catálogo. */
  async gerarOrcamento(vinculoId: string, userId?: string, empresaId?: string | null) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT v.id, v.cliente_id AS "clienteId", v.orcamento_id AS "orcamentoId",
              cat.nome AS "beneficioNome", cat.servico_id AS "servicoId"
         FROM beneficio_fiscal_cliente v
         JOIN beneficio_fiscal_catalogo cat ON cat.id = v.catalogo_id
        WHERE v.id = $1`,
      vinculoId,
    )) as any[]
    const v = rows[0]
    if (!v) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado.' })
    if (v.orcamentoId) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Este benefício já tem um orçamento gerado.' })
    }
    if (!v.servicoId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `O benefício "${v.beneficioNome}" não tem serviço vinculado no catálogo.` })
    }
    const servico = await prisma.servico.findUnique({
      where: { id: v.servicoId },
      select: { id: true, nome: true, valorPadrao: true, categoria: true, recorrenteMensal: true },
    })
    if (!servico) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Serviço do benefício não encontrado.' })

    const orc = await this.orcamentoService.create(
      {
        clienteId: v.clienteId,
        tipo: servico.recorrenteMensal ? 'SERVICO_MENSAL' : 'SERVICO_EXTRA',
        area: servico.categoria ?? null,
        observacoes: `Gerado automaticamente a partir do benefício fiscal: ${v.beneficioNome}`,
      },
      userId,
      empresaId ?? undefined,
    )
    await this.orcamentoService.addItem({
      orcamentoId: orc.id,
      tipo: 'SERVICO',
      descricao: servico.nome,
      quantidade: 1,
      valorUnitario: servico.valorPadrao != null ? Number(servico.valorPadrao) : 0,
      catalogoId: servico.id,
    })
    await prisma.$executeRawUnsafe(
      `UPDATE beneficio_fiscal_cliente SET orcamento_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      vinculoId, orc.id,
    )
    return { orcamentoId: orc.id, numero: orc.numero }
  }

  /** Gera orçamento em massa; pula os que já têm orçamento ou sem serviço. */
  async gerarOrcamentoMassa(vinculoIds: string[], userId?: string, empresaId?: string | null) {
    const gerados: { vinculoId: string; orcamentoId: string; numero: number }[] = []
    const pulados: { vinculoId: string; motivo: string }[] = []
    for (const vid of vinculoIds) {
      try {
        const r = await this.gerarOrcamento(vid, userId, empresaId)
        gerados.push({ vinculoId: vid, ...r })
      } catch (e) {
        pulados.push({ vinculoId: vid, motivo: (e as Error).message })
      }
    }
    return { total: vinculoIds.length, gerados: gerados.length, pulados, itens: gerados }
  }
}
