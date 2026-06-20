import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import type { SalvarBeneficioConfigInput } from '@saas/types'

/**
 * Módulo Benefícios (Trabalhista): controle mensal de Vale-Transporte (VT),
 * Vale-Alimentação (VA) e Mobilidade por empresa (CENTRAL / L&L).
 *
 * Tabelas novas (beneficio_*) acessadas via SQL raw — o Prisma client local
 * fica travado p/ generate no Windows; os models existem no schema.prisma para
 * o build da VPS. INSERT/UPDATE sempre setam created_at/updated_at.
 */
@Injectable()
export class BeneficioService {
  private readonly DIARIA_VT_PADRAO = 10.2
  private readonly VT_DIAS_DESCONTO_PADRAO = 7

  // ── Config por empresa ──────────────────────────────────────────────
  async getConfig(empresaId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, empresa_id AS "empresaId", diaria_va AS "diariaVA", diaria_vt AS "diariaVT",
              vt_dias_desconto_saldo AS "vtDiasDescontoSaldo", ativo
         FROM beneficio_config WHERE empresa_id=$1 LIMIT 1`, empresaId,
    ).catch(() => [] as any[])
    if (rows[0]) {
      return {
        ...rows[0],
        diariaVA: Number(rows[0].diariaVA),
        diariaVT: Number(rows[0].diariaVT),
      }
    }
    return {
      id: null, empresaId,
      diariaVA: 0, diariaVT: this.DIARIA_VT_PADRAO,
      vtDiasDescontoSaldo: this.VT_DIAS_DESCONTO_PADRAO, ativo: true,
    }
  }

  async saveConfig(input: SalvarBeneficioConfigInput) {
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM beneficio_config WHERE empresa_id=$1 LIMIT 1`, input.empresaId)
    if (existing[0]) {
      await prisma.$executeRawUnsafe(
        `UPDATE beneficio_config SET diaria_va=$2, diaria_vt=$3, vt_dias_desconto_saldo=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        existing[0].id, input.diariaVA, input.diariaVT, input.vtDiasDescontoSaldo,
      )
      return { id: existing[0].id }
    }
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO beneficio_config (id, empresa_id, diaria_va, diaria_vt, vt_dias_desconto_saldo, ativo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, input.empresaId, input.diariaVA, input.diariaVT, input.vtDiasDescontoSaldo,
    )
    return { id }
  }

  /** Empresas disponíveis para o seletor (CENTRAL / L&L). Master vê todas. */
  async listEmpresas(empresaId?: string | null, isMaster?: boolean) {
    return prisma.empresa.findMany({
      where: { isActive: true, ...(isMaster ? {} : empresaId ? { id: empresaId } : {}) },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
      orderBy: { razaoSocial: 'asc' },
    }).catch(() => [] as Array<{ id: string; razaoSocial: string; nomeFantasia: string | null }>)
  }
}
