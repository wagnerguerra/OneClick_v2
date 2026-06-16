import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'

// Notas rápidas pessoais (Google Keep style). Tudo escopo por userId.
// Raw SQL (client Prisma não regenera por lock de DLL no Windows; model está no schema p/ prod).
interface NotaPatch {
  titulo?: string | null
  conteudo?: string | null
  cor?: string | null
  fixado?: boolean | null
  arquivado?: boolean | null
}

@Injectable()
export class NotaService {
  async list(userId: string, incluirArquivadas = false) {
    return prisma.$queryRawUnsafe(
      `SELECT id, titulo, conteudo, cor, fixado, arquivado, ordem,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM notas
        WHERE user_id = $1 ${incluirArquivadas ? '' : 'AND arquivado = false'}
        ORDER BY fixado DESC, updated_at DESC`,
      userId,
    )
  }

  async create(userId: string, p: { titulo?: string | null; conteudo?: string | null; cor?: string | null; fixado?: boolean | null }) {
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO notas (id, user_id, titulo, conteudo, cor, fixado, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, userId, p.titulo ?? null, p.conteudo ?? '', p.cor ?? 'default', p.fixado ?? false,
    )
    return { id }
  }

  async update(userId: string, id: string, p: NotaPatch) {
    await prisma.$executeRawUnsafe(
      `UPDATE notas SET
         titulo = COALESCE($3, titulo),
         conteudo = COALESCE($4, conteudo),
         cor = COALESCE($5, cor),
         fixado = COALESCE($6, fixado),
         arquivado = COALESCE($7, arquivado),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      id, userId, p.titulo ?? null, p.conteudo ?? null, p.cor ?? null, p.fixado ?? null, p.arquivado ?? null,
    )
    return { id }
  }

  async remove(userId: string, id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM notas WHERE id = $1 AND user_id = $2`, id, userId)
    return { id }
  }
}
