import { Injectable, Inject } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import { OrcamentoService } from '../orcamento/orcamento.service'
import { EmailService } from '../common/email.service'
import { NotificationService } from '../notification/notification.service'

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

function fmtDataBR(d: Date | string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

interface CatalogoInput {
  nome: string
  servicoId?: string | null
  notificaVencimentoDias?: number | null
  validadeMeses?: number | null
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
  constructor(
    @Inject(OrcamentoService) private readonly orcamentoService: OrcamentoService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
  ) {}

  // ============================================================
  // Catálogo
  // ============================================================
  async listCatalogo(empresaId?: string | null, incluirInativos = false) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c.id, c.nome, c.servico_id AS "servicoId",
              c.notifica_vencimento_dias AS "notificaVencimentoDias",
              c.validade_meses AS "validadeMeses",
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

  async createCatalogo(input: CatalogoInput, _empresaId?: string | null) {
    const id = randomUUID()
    // Catálogo é sempre GLOBAL (empresa_id = NULL) — dado de referência compartilhado,
    // visível a todas as empresas/usuários. Ignora o empresaId do contexto de propósito
    // (senão itens criados por não-master ficariam presos à empresa e sumiriam pros demais).
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_fiscal_catalogo (id, nome, servico_id, notifica_vencimento_dias, validade_meses, obs, ativo, empresa_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.nome, input.servicoId ?? null, input.notificaVencimentoDias ?? null,
      input.validadeMeses ?? null, input.obs ?? null, input.ativo ?? true,
    )
    return { id }
  }

  async updateCatalogo(id: string, input: Partial<CatalogoInput>) {
    await prisma.$executeRawUnsafe(
      `UPDATE beneficio_fiscal_catalogo SET
         nome = COALESCE($2, nome),
         servico_id = $3,
         notifica_vencimento_dias = $4,
         validade_meses = $5,
         obs = $6,
         ativo = COALESCE($7, ativo),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      id, input.nome ?? null, input.servicoId ?? null, input.notificaVencimentoDias ?? null,
      input.validadeMeses ?? null, input.obs ?? null, input.ativo ?? null,
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
              v.data_vencimento AS "dataVencimento", v.portaria, v.processo,
              cat.nome AS "beneficioNome", cat.servico_id AS "servicoId"
         FROM beneficio_fiscal_cliente v
         JOIN beneficio_fiscal_catalogo cat ON cat.id = v.catalogo_id
        WHERE v.id = $1`,
      vinculoId,
    )) as any[]
    const v = rows[0]
    if (!v) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado.' })
    if (v.orcamentoId) {
      // Só bloqueia se o orçamento vinculado ainda está VIVO. Se foi cancelado/encerrado,
      // o benefício ficaria preso pra sempre — nesse caso liberamos um novo.
      const ant = await prisma.orcamento.findUnique({ where: { id: v.orcamentoId }, select: { status: true, numero: true } }).catch(() => null)
      const morto = !ant || ant.status === 'CANCELADO' || ant.status === 'ENCERRADO'
      if (!morto) {
        throw new TRPCError({ code: 'CONFLICT', message: `Este benefício já tem o orçamento #${ant.numero} em andamento (${ant.status}).` })
      }
    }
    if (!v.servicoId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `O benefício "${v.beneficioNome}" não tem serviço vinculado no catálogo.` })
    }
    const servico = await prisma.servico.findUnique({
      where: { id: v.servicoId },
      select: { id: true, nome: true, valorPadrao: true, categoria: true, recorrenteMensal: true },
    })
    if (!servico) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Serviço do benefício não encontrado.' })

    // Observações do orçamento: deixa explícito que é RENOVAÇÃO e carrega os dados do
    // benefício (portaria/processo/vencimento) pra quem for atender não precisar voltar.
    const detalhes = [
      v.portaria ? `Portaria: ${v.portaria}` : null,
      v.processo ? `Processo: ${v.processo}` : null,
      v.dataVencimento ? `Vencimento atual: ${fmtDataBR(v.dataVencimento)}` : null,
    ].filter(Boolean)
    const observacoes = `Renovação de benefício fiscal: ${v.beneficioNome}`
      + (detalhes.length ? `\n${detalhes.join(' · ')}` : '')
      + '\n(orçamento gerado automaticamente pelo módulo de Benefícios Fiscais)'

    const orc = await this.orcamentoService.create(
      {
        clienteId: v.clienteId,
        tipo: servico.recorrenteMensal ? 'SERVICO_MENSAL' : 'SERVICO_EXTRA',
        area: servico.categoria ?? null,
        observacoes,
      },
      userId,
      empresaId ?? undefined,
    )
    await this.orcamentoService.addItem({
      orcamentoId: orc.id,
      tipo: 'SERVICO',
      descricao: `${servico.nome} — renovação (${v.beneficioNome})`,
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

  // ============================================================
  // Alerta proativo de vencimento (sino + e-mail)
  // ============================================================
  /**
   * Varre os benefícios ativos e avisa sobre os que estão VENCENDO/VENCIDO e ainda
   * NÃO têm orçamento gerado (quem já tem foi tratado). Um aviso consolidado por
   * empresa, para quem tem acesso de leitura ao módulo (+ masters da empresa).
   * Idempotente no dia: chamável à vontade (o scheduler roda 1x/dia).
   */
  async notificarVencimentos(empresaIdFiltro?: string | null) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT v.id, v.empresa_id AS "empresaId", v.data_vencimento AS "dataVencimento",
              cl.razao_social AS "clienteNome",
              cat.nome AS "beneficioNome", cat.notifica_vencimento_dias AS "notificaVencimentoDias"
         FROM beneficio_fiscal_cliente v
         JOIN clientes cl ON cl.id = v.cliente_id
         JOIN beneficio_fiscal_catalogo cat ON cat.id = v.catalogo_id
        WHERE v.ativo = true
          AND v.orcamento_id IS NULL
          AND v.data_vencimento IS NOT NULL
          AND ($1::text IS NULL OR v.empresa_id = $1)
        ORDER BY v.data_vencimento ASC`,
      empresaIdFiltro ?? null,
    )) as any[]

    // Só o que está vencendo/vencido (mesma regra do farol da tela).
    const alvos = rows
      .map(r => ({ ...r, status: calcStatus(r.dataVencimento, r.notificaVencimentoDias) }))
      .filter(r => r.status === 'VENCENDO' || r.status === 'VENCIDO')
    if (!alvos.length) return { empresas: 0, notificados: 0, itens: 0 }

    // Agrupa por empresa (aviso consolidado, não um por benefício).
    const porEmpresa = new Map<string, typeof alvos>()
    for (const a of alvos) {
      const k = a.empresaId ?? ''
      const arr = porEmpresa.get(k) ?? []
      arr.push(a)
      porEmpresa.set(k, arr)
    }

    let notificados = 0
    for (const [empresaId, itens] of porEmpresa) {
      const destinatarios = (await prisma.$queryRawUnsafe(
        `SELECT DISTINCT u.id, u.name AS nome, u.email
           FROM users u
           LEFT JOIN user_permissions p ON p.user_id = u.id AND p.module_slug = 'beneficios-fiscais'
          WHERE u.is_active = true
            AND ($1::text = '' OR u.empresa_id = $1)
            AND (p.can_read = true OR u.is_empresa_master = true)`,
        empresaId,
      ).catch(() => [])) as any[]
      if (!destinatarios.length) continue

      const vencidos = itens.filter(i => i.status === 'VENCIDO')
      const vencendo = itens.filter(i => i.status === 'VENCENDO')
      const resumo = [
        vencidos.length ? `${vencidos.length} vencido(s)` : null,
        vencendo.length ? `${vencendo.length} vencendo` : null,
      ].filter(Boolean).join(' e ')
      const link = '/beneficios-fiscais'

      await this.notificationService.criarParaUsers(destinatarios.map(d => d.id), {
        titulo: 'Benefícios fiscais a renovar',
        mensagem: `${resumo} sem orçamento de renovação. Gere o orçamento para não perder o prazo.`,
        tipo: vencidos.length ? 'warning' : 'info',
        link,
        origem: 'beneficios-fiscais',
        empresaId: empresaId || undefined,
      }).catch(() => {})
      notificados += destinatarios.length

      const linhas = itens.slice(0, 30).map(i =>
        `<tr><td style="padding:4px 10px 4px 0">${i.clienteNome}</td><td style="padding:4px 10px 4px 0">${i.beneficioNome}</td>`
        + `<td style="padding:4px 10px 4px 0">${fmtDataBR(i.dataVencimento)}</td>`
        + `<td style="padding:4px 0;color:${i.status === 'VENCIDO' ? '#dc2626' : '#d97706'};font-weight:600">${i.status === 'VENCIDO' ? 'Vencido' : 'Vencendo'}</td></tr>`,
      ).join('')
      const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
      const botao = base
        ? `<p style="margin-top:14px"><a href="${base}${link}" style="display:inline-block;background:#65a30d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Abrir Benefícios Fiscais</a></p>`
        : `<p>Acesse o sistema em <strong>Benefícios Fiscais</strong> para gerar os orçamentos.</p>`

      for (const d of destinatarios) {
        if (!d.email) continue
        await this.emailService.sendMail({
          to: d.email,
          subject: `Benefícios fiscais a renovar — ${resumo}`,
          html: `<p>Olá, ${d.nome?.split(' ')[0] || ''}!</p>
          <p>Existem benefícios fiscais que precisam de <strong>renovação</strong> e ainda não têm orçamento gerado:</p>
          <table style="border-collapse:collapse;font-size:14px">
            <tr style="text-align:left;color:#6b7280"><th style="padding:0 10px 6px 0">Cliente</th><th style="padding:0 10px 6px 0">Benefício</th><th style="padding:0 10px 6px 0">Vencimento</th><th style="padding:0 0 6px 0">Situação</th></tr>
            ${linhas}
          </table>
          ${itens.length > 30 ? `<p style="color:#6b7280;font-size:13px">…e mais ${itens.length - 30} benefício(s).</p>` : ''}
          ${botao}`,
        }).catch(() => {})
      }
    }
    return { empresas: porEmpresa.size, notificados, itens: alvos.length }
  }
}
