import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'

/**
 * Relatório de QA — registro de achados de auditoria/QA para tratamento
 * (/configuracoes → Relatório de QA). Tabela criada via SQL cirúrgico
 * (add_qa_itens.sql); acesso raw pelo lock de DLL do client no Windows.
 */
export interface QaItem {
  id: string
  modulo: string
  severidade: 'ALTA' | 'MEDIA' | 'BAIXA'
  titulo: string
  descricao: string | null
  arquivo: string | null
  fixProposto: string | null
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'CORRIGIDO' | 'DESCARTADO'
  notas: string | null
  origem: string | null
  createdAt: Date
  updatedAt: Date
  resolvidoEm: Date | null
}

const COLS = `id, modulo, severidade, titulo, descricao, arquivo,
              fix_proposto AS "fixProposto", status, notas, origem,
              created_at AS "createdAt", updated_at AS "updatedAt", resolvido_em AS "resolvidoEm"`

@Injectable()
export class QaService {
  async list(filtros?: { status?: string; modulo?: string; severidade?: string }): Promise<QaItem[]> {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${COLS} FROM qa_itens
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR modulo = $2)
          AND ($3::text IS NULL OR severidade = $3)
        ORDER BY CASE severidade WHEN 'ALTA' THEN 0 WHEN 'MEDIA' THEN 1 ELSE 2 END,
                 CASE status WHEN 'PENDENTE' THEN 0 WHEN 'EM_ANDAMENTO' THEN 1 WHEN 'CORRIGIDO' THEN 2 ELSE 3 END,
                 created_at ASC`,
      filtros?.status ?? null, filtros?.modulo ?? null, filtros?.severidade ?? null,
    )) as QaItem[]
    return rows
  }

  /** Contadores para o resumo (por status e severidade). */
  async resumo() {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT status, severidade, COUNT(*)::int AS n FROM qa_itens GROUP BY status, severidade`,
    )) as Array<{ status: string; severidade: string; n: number }>
    return rows
  }

  async update(id: string, patch: { status?: string; notas?: string | null; severidade?: string; titulo?: string; descricao?: string | null; fixProposto?: string | null }) {
    // resolvido_em acompanha o status: seta ao entrar em CORRIGIDO/DESCARTADO, limpa ao reabrir.
    await prisma.$executeRawUnsafe(
      `UPDATE qa_itens SET
         status       = COALESCE($2, status),
         notas        = CASE WHEN $3::text IS NOT NULL THEN NULLIF($3, '') ELSE notas END,
         severidade   = COALESCE($4, severidade),
         titulo       = COALESCE($5, titulo),
         descricao    = COALESCE($6, descricao),
         fix_proposto = COALESCE($7, fix_proposto),
         resolvido_em = CASE
           WHEN $2 IN ('CORRIGIDO','DESCARTADO') THEN COALESCE(resolvido_em, now())
           WHEN $2 IN ('PENDENTE','EM_ANDAMENTO') THEN NULL
           ELSE resolvido_em END,
         updated_at   = now()
       WHERE id = $1`,
      id, patch.status ?? null, patch.notas ?? null, patch.severidade ?? null,
      patch.titulo ?? null, patch.descricao ?? null, patch.fixProposto ?? null,
    )
    return { id }
  }

  async create(input: { modulo: string; severidade: string; titulo: string; descricao?: string | null; arquivo?: string | null; fixProposto?: string | null; origem?: string | null }) {
    const id = `qa_${randomUUID().slice(0, 8)}`
    await prisma.$executeRawUnsafe(
      `INSERT INTO qa_itens (id, modulo, severidade, titulo, descricao, arquivo, fix_proposto, origem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      id, input.modulo, input.severidade, input.titulo,
      input.descricao ?? null, input.arquivo ?? null, input.fixProposto ?? null,
      input.origem ?? 'Manual',
    )
    return { id }
  }

  async remove(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM qa_itens WHERE id = $1`, id)
    return { id }
  }
}
