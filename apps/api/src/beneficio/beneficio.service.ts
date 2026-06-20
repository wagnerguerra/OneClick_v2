import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import * as XLSX from 'xlsx'
import { EmailService } from '../common/email.service'
import { NotificationService } from '../notification/notification.service'
import type {
  SalvarBeneficioConfigInput, SalvarFichaBeneficioInput, AbrirCompetenciaInput,
  SalvarApontamentoInput, SalvarSaldoVtInput, SalvarCartaoAvulsoInput,
} from '@saas/types'

type Ctx = { userId?: string; isMaster?: boolean; isEmpresaMaster?: boolean }

/**
 * Módulo Benefícios (Trabalhista): controle mensal de Vale-Transporte (VT),
 * Vale-Alimentação (VA) e Mobilidade por empresa (CENTRAL / L&L).
 * Tabelas beneficio_* via SQL raw (models no schema.prisma p/ o build da VPS);
 * INSERT/UPDATE sempre setam created_at/updated_at.
 */
@Injectable()
export class BeneficioService {
  private readonly DIARIA_VT_PADRAO = 10.2
  private readonly VT_DIAS_DESCONTO_PADRAO = 7

  constructor(
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
  ) {}

  // ── Helpers de escopo/permissão ────────────────────────────────────
  private async podeGerir(ctx: Ctx): Promise<boolean> {
    if (ctx.isMaster || ctx.isEmpresaMaster) return true
    if (!ctx.userId) return false
    const p = await prisma.userPermission.findFirst({
      where: { userId: ctx.userId, moduleSlug: 'beneficios' }, select: { subPermissions: true },
    }).catch(() => null)
    return !!(p?.subPermissions as any)?.gerir_beneficios
  }

  private async areasLideradas(userId?: string): Promise<string[]> {
    if (!userId) return []
    const areas = await prisma.area.findMany({ where: { leaderId: userId, isActive: true }, select: { id: true } }).catch(() => [])
    return areas.map(a => a.id)
  }

  // ── Empresas (seletor CENTRAL / L&L) ───────────────────────────────
  async listEmpresas(empresaId?: string | null, isMaster?: boolean) {
    return prisma.empresa.findMany({
      where: { isActive: true, ...(isMaster ? {} : empresaId ? { id: empresaId } : {}) },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
      orderBy: { razaoSocial: 'asc' },
    }).catch(() => [] as Array<{ id: string; razaoSocial: string; nomeFantasia: string | null }>)
  }

  // ── Config por empresa ─────────────────────────────────────────────
  async getConfig(empresaId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, empresa_id AS "empresaId", diaria_va AS "diariaVA", diaria_vt AS "diariaVT",
              vt_dias_desconto_saldo AS "vtDiasDescontoSaldo", notificar_auto AS "notificarAuto", dia_notificacao AS "diaNotificacao", ativo
         FROM beneficio_config WHERE empresa_id=$1 LIMIT 1`, empresaId,
    ).catch(() => [] as any[])
    if (rows[0]) return { ...rows[0], diariaVA: Number(rows[0].diariaVA), diariaVT: Number(rows[0].diariaVT) }
    return { id: null, empresaId, diariaVA: 0, diariaVT: this.DIARIA_VT_PADRAO, vtDiasDescontoSaldo: this.VT_DIAS_DESCONTO_PADRAO, notificarAuto: false, diaNotificacao: null, ativo: true }
  }

  async saveConfig(input: SalvarBeneficioConfigInput) {
    const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM beneficio_config WHERE empresa_id=$1 LIMIT 1`, input.empresaId)
    if (existing[0]) {
      await prisma.$executeRawUnsafe(
        `UPDATE beneficio_config SET diaria_va=$2, diaria_vt=$3, vt_dias_desconto_saldo=$4, notificar_auto=$5, dia_notificacao=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        existing[0].id, input.diariaVA, input.diariaVT, input.vtDiasDescontoSaldo, input.notificarAuto ?? false, input.diaNotificacao ?? null)
      return { id: existing[0].id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_config (id, empresa_id, diaria_va, diaria_vt, vt_dias_desconto_saldo, notificar_auto, dia_notificacao, ativo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.empresaId, input.diariaVA, input.diariaVT, input.vtDiasDescontoSaldo, input.notificarAuto ?? false, input.diaNotificacao ?? null)
    return { id }
  }

  // ── Fichas de benefício por colaborador ────────────────────────────
  /** Lista todos os colaboradores ativos da empresa + a ficha (ou defaults). */
  async listFichas(empresaId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id AS "colaboradorId", u.name AS nome, a.name AS setor, u.data_admissao AS "dataAdmissao",
              f.id AS "fichaId", f.recebe_va AS "recebeVA", f.recebe_vt AS "recebeVT",
              f.recebe_mobilidade AS "recebeMobilidade", f.valor_mobilidade AS "valorMobilidade", f.observacao, f.ativo
         FROM users u
         LEFT JOIN areas a ON a.id = u.area_id
         LEFT JOIN beneficio_colaborador f ON f.colaborador_id = u.id
        WHERE u.empresa_id=$1 AND u.is_active=true AND u.exibir_como_colaborador=true
        ORDER BY u.name ASC`, empresaId,
    ).catch(() => [] as any[])
    return rows.map(r => ({
      colaboradorId: r.colaboradorId, nome: r.nome, setor: r.setor ?? null, dataAdmissao: r.dataAdmissao,
      fichaId: r.fichaId ?? null,
      recebeVA: r.fichaId ? !!r.recebeVA : true,        // default: todos recebem VA
      recebeVT: r.fichaId ? !!r.recebeVT : false,
      recebeMobilidade: r.fichaId ? !!r.recebeMobilidade : false,
      valorMobilidade: Number(r.valorMobilidade ?? 0),
      observacao: r.observacao ?? null,
      ativo: r.fichaId ? !!r.ativo : true,
    }))
  }

  async saveFicha(input: SalvarFichaBeneficioInput) {
    const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM beneficio_colaborador WHERE colaborador_id=$1 LIMIT 1`, input.colaboradorId)
    if (existing[0]) {
      await prisma.$executeRawUnsafe(
        `UPDATE beneficio_colaborador SET empresa_id=$2, recebe_va=$3, recebe_vt=$4, recebe_mobilidade=$5, valor_mobilidade=$6, observacao=$7, ativo=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        existing[0].id, input.empresaId ?? null, input.recebeVA, input.recebeVT, input.recebeMobilidade, input.valorMobilidade, input.observacao ?? null, input.ativo ?? true)
      return { id: existing[0].id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_colaborador (id, colaborador_id, empresa_id, recebe_va, recebe_vt, recebe_mobilidade, valor_mobilidade, observacao, ativo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.colaboradorId, input.empresaId ?? null, input.recebeVA, input.recebeVT, input.recebeMobilidade, input.valorMobilidade, input.observacao ?? null, input.ativo ?? true)
    return { id }
  }

  // ── Competências ───────────────────────────────────────────────────
  async listCompetencias(empresaId: string) {
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id, c.empresa_id AS "empresaId", c.ano, c.mes, c.dias_uteis AS "diasUteis",
              c.diaria_va AS "diariaVA", c.diaria_vt AS "diariaVT", c.vt_dias_desconto_saldo AS "vtDiasDescontoSaldo",
              c.status, c.fechado_em AS "fechadoEm", c.created_at AS "createdAt"
         FROM beneficio_competencia c WHERE c.empresa_id=$1 ORDER BY c.ano DESC, c.mes DESC`, empresaId,
    ).catch(() => [] as any[])
  }

  async getCompetencia(id: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, empresa_id AS "empresaId", ano, mes, dias_uteis AS "diasUteis", diaria_va AS "diariaVA",
              diaria_vt AS "diariaVT", vt_dias_desconto_saldo AS "vtDiasDescontoSaldo", status, fechado_em AS "fechadoEm"
         FROM beneficio_competencia WHERE id=$1 LIMIT 1`, id)
    const c = rows[0]
    if (!c) return null
    return { ...c, diariaVA: Number(c.diariaVA), diariaVT: Number(c.diariaVT) }
  }

  async abrirCompetencia(input: AbrirCompetenciaInput, userId?: string) {
    const dup = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM beneficio_competencia WHERE empresa_id=$1 AND ano=$2 AND mes=$3 LIMIT 1`, input.empresaId, input.ano, input.mes)
    if (dup[0]) throw new Error('Já existe uma competência para este mês/empresa.')
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_competencia (id, empresa_id, ano, mes, dias_uteis, diaria_va, diaria_vt, vt_dias_desconto_saldo, status, aberto_por_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ABERTA',$9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.empresaId, input.ano, input.mes, input.diasUteis, input.diariaVA, input.diariaVT, input.vtDiasDescontoSaldo, userId ?? null)
    return { id }
  }

  async reabrirCompetencia(id: string) {
    await prisma.$executeRawUnsafe(`UPDATE beneficio_competencia SET status='ABERTA', fechado_em=NULL, fechado_por_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id)
    await prisma.$executeRawUnsafe(`DELETE FROM beneficio_recarga WHERE competencia_id=$1`, id)
    return { ok: true }
  }

  // ── Apontamentos (líder lança do seu setor) ────────────────────────
  /** Colaboradores da competência + ficha + apontamento. Escopo por setor se não puder gerir. */
  async listApontamentos(competenciaId: string, ctx: Ctx) {
    const comp = await this.getCompetencia(competenciaId)
    if (!comp) return { competencia: null, itens: [] as any[] }
    const gerir = await this.podeGerir(ctx)
    const ledAreas = gerir ? [] : await this.areasLideradas(ctx.userId)
    if (!gerir && ledAreas.length === 0) return { competencia: comp, itens: [] }
    const filtroArea = gerir ? '' : `AND u.area_id = ANY($2::text[])`
    const params: any[] = gerir ? [comp.empresaId] : [comp.empresaId, ledAreas]
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id AS "colaboradorId", u.name AS nome, a.name AS setor, u.area_id AS "areaId",
              COALESCE(f.recebe_va, true) AS "recebeVA", COALESCE(f.recebe_vt, false) AS "recebeVT",
              ap.dias_ferias AS "diasFerias", ap.dias_licenca AS "diasLicenca", ap.dias_ausencia AS "diasAusencia",
              ap.faltas, ap.plantoes, ap.vt_saldo_cartao AS "vtSaldoCartao", ap.observacao
         FROM users u
         LEFT JOIN areas a ON a.id = u.area_id
         LEFT JOIN beneficio_colaborador f ON f.colaborador_id = u.id
         LEFT JOIN beneficio_apontamento ap ON ap.colaborador_id = u.id AND ap.competencia_id = $${gerir ? 2 : 3}
        WHERE u.empresa_id=$1 AND u.is_active=true AND u.exibir_como_colaborador=true ${filtroArea}
        ORDER BY a.name ASC, u.name ASC`,
      ...params, competenciaId,
    ).catch(() => [] as any[])
    const itens = rows.map(r => ({
      colaboradorId: r.colaboradorId, nome: r.nome, setor: r.setor ?? null, areaId: r.areaId ?? null,
      recebeVA: !!r.recebeVA, recebeVT: !!r.recebeVT,
      diasFerias: r.diasFerias ?? 0, diasLicenca: r.diasLicenca ?? 0, diasAusencia: r.diasAusencia ?? 0,
      faltas: r.faltas ?? 0, plantoes: r.plantoes ?? 0,
      vtSaldoCartao: Number(r.vtSaldoCartao ?? 0), observacao: r.observacao ?? null,
    }))
    return { competencia: comp, itens }
  }

  private async verificarEscopo(competenciaId: string, colaboradorId: string, ctx: Ctx) {
    if (await this.podeGerir(ctx)) return
    const led = await this.areasLideradas(ctx.userId)
    if (led.length === 0) throw new Error('Sem permissão para lançar apontamentos.')
    const u = await prisma.user.findUnique({ where: { id: colaboradorId }, select: { areaId: true } })
    if (!u?.areaId || !led.includes(u.areaId)) throw new Error('Você só pode lançar apontamentos do seu setor.')
  }

  async upsertApontamento(input: SalvarApontamentoInput, ctx: Ctx) {
    const comp = await this.getCompetencia(input.competenciaId)
    if (!comp) throw new Error('Competência inválida.')
    if (comp.status === 'FECHADA') throw new Error('Competência fechada — reabra para editar.')
    await this.verificarEscopo(input.competenciaId, input.colaboradorId, ctx)
    const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM beneficio_apontamento WHERE competencia_id=$1 AND colaborador_id=$2 LIMIT 1`, input.competenciaId, input.colaboradorId)
    if (existing[0]) {
      await prisma.$executeRawUnsafe(
        `UPDATE beneficio_apontamento SET dias_ferias=$2, dias_licenca=$3, dias_ausencia=$4, faltas=$5, plantoes=$6, observacao=$7, lancado_por_id=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        existing[0].id, input.diasFerias, input.diasLicenca, input.diasAusencia, input.faltas, input.plantoes, input.observacao ?? null, ctx.userId ?? null)
      return { id: existing[0].id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_apontamento (id, competencia_id, colaborador_id, dias_ferias, dias_licenca, dias_ausencia, faltas, plantoes, vt_saldo_cartao, observacao, lancado_por_id, lancado_em, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.competenciaId, input.colaboradorId, input.diasFerias, input.diasLicenca, input.diasAusencia, input.faltas, input.plantoes, input.observacao ?? null, ctx.userId ?? null)
    return { id }
  }

  /** Saldo do cartão de VT (responsável). Cria a linha de apontamento se faltar. */
  async setVtSaldo(input: SalvarSaldoVtInput) {
    const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM beneficio_apontamento WHERE competencia_id=$1 AND colaborador_id=$2 LIMIT 1`, input.competenciaId, input.colaboradorId)
    if (existing[0]) {
      await prisma.$executeRawUnsafe(`UPDATE beneficio_apontamento SET vt_saldo_cartao=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, existing[0].id, input.vtSaldoCartao)
      return { id: existing[0].id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_apontamento (id, competencia_id, colaborador_id, vt_saldo_cartao, lancado_em, updated_at)
       VALUES ($1,$2,$3,$4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.competenciaId, input.colaboradorId, input.vtSaldoCartao)
    return { id }
  }

  // ── Cartões avulsos (ESCRITÓRIO / RESERVA) ─────────────────────────
  async listCartoes(empresaId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome, valor_va AS "valorVA", valor_vt AS "valorVT", valor_mobilidade AS "valorMobilidade", ativo
         FROM beneficio_cartao_avulso WHERE empresa_id=$1 AND ativo=true ORDER BY nome ASC`, empresaId,
    ).catch(() => [] as any[])
    return rows.map(r => ({ ...r, valorVA: Number(r.valorVA), valorVT: Number(r.valorVT), valorMobilidade: Number(r.valorMobilidade) }))
  }

  async saveCartao(input: SalvarCartaoAvulsoInput) {
    if (input.id) {
      await prisma.$executeRawUnsafe(
        `UPDATE beneficio_cartao_avulso SET nome=$2, valor_va=$3, valor_vt=$4, valor_mobilidade=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        input.id, input.nome, input.valorVA, input.valorVT, input.valorMobilidade)
      return { id: input.id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_cartao_avulso (id, empresa_id, nome, valor_va, valor_vt, valor_mobilidade, ativo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.empresaId, input.nome, input.valorVA, input.valorVT, input.valorMobilidade)
    return { id }
  }

  async deleteCartao(id: string) {
    await prisma.$executeRawUnsafe(`UPDATE beneficio_cartao_avulso SET ativo=false, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id)
    return { ok: true }
  }

  // ── Motor de cálculo ───────────────────────────────────────────────
  private weekdaysInRange(start: Date, end: Date): number {
    if (end < start) return 0
    let n = 0
    const d = new Date(start)
    while (d <= end) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) n++; d.setDate(d.getDate() + 1) }
    return n
  }

  /** Calcula as recargas de todos os colaboradores elegíveis da competência. */
  async calcularRecargas(competenciaId: string) {
    const comp = await this.getCompetencia(competenciaId)
    if (!comp) return { competencia: null, itens: [] as any[] }
    const diariaVA = Number(comp.diariaVA), diariaVT = Number(comp.diariaVT)
    const diasUteis = comp.diasUteis, vtDias = comp.vtDiasDescontoSaldo

    const colaboradores = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id AS "colaboradorId", u.name AS nome, a.name AS setor, u.data_admissao AS "dataAdmissao", u.data_demissao AS "dataDemissao",
              COALESCE(f.recebe_va, true) AS "recebeVA", COALESCE(f.recebe_vt, false) AS "recebeVT",
              COALESCE(f.recebe_mobilidade, false) AS "recebeMobilidade", COALESCE(f.valor_mobilidade, 0) AS "valorMobilidade",
              ap.dias_ferias AS "diasFerias", ap.dias_licenca AS "diasLicenca", ap.dias_ausencia AS "diasAusencia",
              ap.faltas, ap.plantoes, ap.vt_saldo_cartao AS "vtSaldoCartao"
         FROM users u
         LEFT JOIN areas a ON a.id = u.area_id
         LEFT JOIN beneficio_colaborador f ON f.colaborador_id = u.id
         LEFT JOIN beneficio_apontamento ap ON ap.colaborador_id = u.id AND ap.competencia_id = $2
        WHERE u.empresa_id=$1 AND u.is_active=true AND u.exibir_como_colaborador=true
        ORDER BY a.name ASC, u.name ASC`, comp.empresaId, competenciaId,
    ).catch(() => [] as any[])

    const inicioMes = new Date(comp.ano, comp.mes - 1, 1)
    const fimMes = new Date(comp.ano, comp.mes, 0)
    const weekdaysMes = this.weekdaysInRange(inicioMes, fimMes) || 1

    const itens = colaboradores.map(r => {
      // Proporcional por admissão/demissão dentro do mês.
      let fator = 1
      const adm = r.dataAdmissao ? new Date(r.dataAdmissao) : null
      const dem = r.dataDemissao ? new Date(r.dataDemissao) : null
      const ini = adm && adm > inicioMes ? adm : inicioMes
      const fim = dem && dem < fimMes ? dem : fimMes
      if ((adm && adm > fimMes) || (dem && dem < inicioMes)) fator = 0
      else if ((adm && adm > inicioMes) || (dem && dem < fimMes)) fator = this.weekdaysInRange(ini, fim) / weekdaysMes
      const diasUteisEf = Math.round(diasUteis * fator)

      const ferias = r.diasFerias ?? 0, licenca = r.diasLicenca ?? 0, ausencia = r.diasAusencia ?? 0
      const faltas = r.faltas ?? 0, plantoes = r.plantoes ?? 0
      const vtSaldo = Number(r.vtSaldoCartao ?? 0)
      const descontoVA = ferias + licenca + ausencia

      const valorVA = r.recebeVA ? diariaVA * Math.max(0, diasUteisEf - descontoVA) : 0
      let valorVT = 0
      let sobra = 0
      if (r.recebeVT) {
        const cheio = diariaVT * diasUteisEf
        sobra = vtSaldo - diariaVT * vtDias
        valorVT = (sobra < 0 ? cheio : cheio - sobra) + plantoes * diariaVT - faltas * diariaVT
        if (valorVT < 0) valorVT = 0
      }
      const valorMobilidade = r.recebeMobilidade ? Number(r.valorMobilidade ?? 0) : 0
      const round2 = (n: number) => Math.round(n * 100) / 100
      return {
        colaboradorId: r.colaboradorId, nome: r.nome, setor: r.setor ?? null,
        valorVA: round2(valorVA), valorVT: round2(valorVT), valorMobilidade: round2(valorMobilidade),
        total: round2(valorVA + valorVT + valorMobilidade),
        breakdown: { diasUteisEf, fator: round2(fator), descontoVA, faltas, plantoes, sobra: round2(sobra), recebeVA: !!r.recebeVA, recebeVT: !!r.recebeVT },
      }
    })
    // Cartões avulsos (ESCRITÓRIO/RESERVA) — valores fixos somados ao total.
    const cartoes = await this.listCartoes(comp.empresaId)
    for (const c of cartoes) {
      const round2 = (n: number) => Math.round(n * 100) / 100
      itens.push({
        colaboradorId: `avulso:${c.id}`, nome: c.nome, setor: 'Cartão avulso',
        valorVA: round2(c.valorVA), valorVT: round2(c.valorVT), valorMobilidade: round2(c.valorMobilidade),
        total: round2(c.valorVA + c.valorVT + c.valorMobilidade),
        breakdown: { avulso: true, recebeVA: c.valorVA > 0, recebeVT: c.valorVT > 0 },
      })
    }
    return { competencia: comp, itens }
  }

  // ── Fechamento (snapshot) ──────────────────────────────────────────
  async fecharCompetencia(id: string, userId?: string) {
    const { competencia, itens } = await this.calcularRecargas(id)
    if (!competencia) throw new Error('Competência inválida.')
    await prisma.$executeRawUnsafe(`DELETE FROM beneficio_recarga WHERE competencia_id=$1`, id)
    for (const it of itens) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO beneficio_recarga (id, competencia_id, colaborador_id, valor_va, valor_vt, valor_mobilidade, total, breakdown, gerado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, CURRENT_TIMESTAMP)`,
        randomUUID(), id, it.colaboradorId, it.valorVA, it.valorVT, it.valorMobilidade, it.total, JSON.stringify(it.breakdown))
    }
    await prisma.$executeRawUnsafe(`UPDATE beneficio_competencia SET status='FECHADA', fechado_por_id=$2, fechado_em=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, userId ?? null)
    // E-mail de resumo (best-effort) com a planilha anexa.
    this.emailResumoFechamento(id).catch(() => {})
    return { ok: true, total: itens.reduce((s, i) => s + i.total, 0) }
  }

  // ── Notificar líderes ──────────────────────────────────────────────
  async notificarLideres(competenciaId: string) {
    const comp = await this.getCompetencia(competenciaId)
    if (!comp) throw new Error('Competência inválida.')
    // Setores com colaboradores ativos + líder definido.
    const lideres = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT a.id AS "areaId", a.name AS setor, l.id AS "leaderId", l.name AS "leaderNome", l.email AS "leaderEmail"
         FROM areas a
         JOIN users u ON u.area_id = a.id AND u.is_active=true AND u.exibir_como_colaborador=true
         JOIN users l ON l.id = a.leader_id AND l.is_active=true
        WHERE a.empresa_id=$1`, comp.empresaId,
    ).catch(() => [] as any[])
    if (comp.status === 'ABERTA') await prisma.$executeRawUnsafe(`UPDATE beneficio_competencia SET status='EM_APONTAMENTO', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, competenciaId)
    const mesRef = `${String(comp.mes).padStart(2, '0')}/${comp.ano}`
    const userIds = [...new Set(lideres.map(l => l.leaderId))]
    if (userIds.length) {
      await this.notificationService.criarParaUsers(userIds, {
        titulo: 'Apontamentos de benefícios', mensagem: `Informe os apontamentos do seu setor para a competência ${mesRef}.`,
        tipo: 'info', link: '/beneficios', origem: 'beneficios', empresaId: comp.empresaId,
      }).catch(() => {})
    }
    for (const l of lideres) {
      if (!l.leaderEmail) continue
      await this.emailService.sendMail({
        to: l.leaderEmail,
        subject: `Apontamentos de benefícios — ${l.setor} — ${mesRef}`,
        html: `<p>Olá, ${l.leaderNome?.split(' ')[0] || ''}!</p>
        <p>Chegou a hora de informar os apontamentos de benefícios (férias, licenças, ausências, faltas e plantões) do setor <strong>${l.setor}</strong> para a competência <strong>${mesRef}</strong>.</p>
        <p>Acesse o sistema em <strong>Trabalhista &rsaquo; Benefícios</strong> e lance os apontamentos do seu setor.</p>`,
      }).catch(() => {})
    }
    return { notificados: userIds.length }
  }

  private async emailResumoFechamento(competenciaId: string) {
    const comp = await this.getCompetencia(competenciaId)
    if (!comp) return
    const buf = await this.exportarXlsx(competenciaId)
    const empresa = await prisma.empresa.findUnique({ where: { id: comp.empresaId }, select: { razaoSocial: true, nomeFantasia: true, email: true } }).catch(() => null)
    const dest = empresa?.email
    if (!dest) return
    const mesRef = `${String(comp.mes).padStart(2, '0')}/${comp.ano}`
    await this.emailService.sendMail({
      to: dest, subject: `Fechamento de benefícios — ${empresa?.nomeFantasia || empresa?.razaoSocial} — ${mesRef}`,
      html: `<p>Segue em anexo o fechamento de benefícios (VT/VA/Mobilidade) da competência <strong>${mesRef}</strong>.</p>`,
      attachments: [{ filename: `beneficios-${mesRef.replace('/', '-')}.xlsx`, content: buf }],
    }).catch(() => {})
  }

  // ── Exportação XLSX ────────────────────────────────────────────────
  async exportarXlsx(competenciaId: string): Promise<Buffer> {
    const { competencia, itens } = await this.calcularRecargas(competenciaId)
    const wb = XLSX.utils.book_new()
    const mesRef = competencia ? `${String(competencia.mes).padStart(2, '0')}/${competencia.ano}` : ''
    // Aba Alimentação
    const va = [['NOME', 'SETOR', `ALIMENTAÇÃO ${mesRef}`, 'MOBILIDADE'],
      ...itens.map(i => [i.nome, i.setor ?? '', i.valorVA, i.valorMobilidade]),
      ['', 'TOTAL', itens.reduce((s, i) => s + i.valorVA, 0), itens.reduce((s, i) => s + i.valorMobilidade, 0)]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(va), 'Alimentação')
    // Aba Transporte
    const vt = [['NOME', 'SETOR', `TRANSPORTE ${mesRef}`],
      ...itens.filter(i => i.breakdown?.recebeVT).map(i => [i.nome, i.setor ?? '', i.valorVT]),
      ['', 'TOTAL', itens.reduce((s, i) => s + i.valorVT, 0)]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vt), 'Transporte')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
}
