import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Importação de dados de Legalização do banco SERPRO2 (MySQL oneclick_fiscal_serpro).
 * Importa POP, Acessos, Vencimentos e Andamentos.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mysql = require('mysql2/promise')

export interface ImportResult {
  pop: boolean
  acessos: number
  vencimentos: number
  andamentos: number
  message: string
}

@Injectable()
export class ImportOneclickService {

  private async getConnection() {
    return mysql.createConnection({
      host: process.env.LEGACY_DB_HOST || 'localhost',
      port: Number(process.env.LEGACY_DB_PORT || 3306),
      user: process.env.LEGACY_DB_USER || 'root',
      password: process.env.LEGACY_DB_PASSWORD || '',
      database: process.env.LEGACY_DB_NAME || 'oneclick_fiscal_serpro',
      connectTimeout: 8000,
    })
  }

  async importar(clienteId: string, documento: string): Promise<ImportResult> {
    const cnpj = documento.replace(/\D/g, '')
    if (cnpj.length !== 14) throw new Error('CNPJ inválido — importação apenas para 14 dígitos')

    const conn = await this.getConnection()

    try {
      // Resolver id do cliente no SERPRO2 pelo CNPJ
      const [cliRows] = await conn.query(
        `SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = ? LIMIT 1`,
        [cnpj],
      )
      const serpro2Id = cliRows?.[0]?.id
      if (!serpro2Id) throw new Error('Cliente não encontrado no banco SERPRO2')

      let popOk = false
      let acessosCount = 0
      let vencimentosCount = 0
      let andamentosCount = 0

      // --- POP (Registros Gerais) ---
      const [popRows] = await conn.query(
        `SELECT inscricao_estadual, inscricao_municipal, nire, rg_edificacao, codigo_simples,
                bombeiros_tipo, bombeiros_metragem, bombeiros_rota, bombeiros_projeto,
                bombeiros_capacidade, bombeiros_referencia, latitude, longitude, cnae, acesso_siat
         FROM cliente_legalizacao_pop WHERE cliente_id = ? LIMIT 1`,
        [serpro2Id],
      )
      if (popRows?.[0]) {
        const r = popRows[0]
        const updates: Record<string, string> = {}
        if (r.inscricao_estadual) updates.inscricaoEstadual = String(r.inscricao_estadual).trim()
        if (r.inscricao_municipal) updates.inscricaoMunicipal = String(r.inscricao_municipal).trim()
        if (r.nire) updates.nire = String(r.nire).trim()
        if (Object.keys(updates).length > 0) {
          await prisma.cliente.update({ where: { id: clienteId }, data: updates as any }).catch(() => {})
          popOk = true
        }
      }

      // --- Acessos ---
      const [aceRows] = await conn.query(
        `SELECT tipo, link, usuario, senha FROM cliente_legalizacao_acessos WHERE cliente_id = ?`,
        [serpro2Id],
      )
      for (const row of aceRows || []) {
        const portal = String(row.tipo || '').trim()
        if (!portal) continue
        // Verificar se já existe
        const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM cliente_acessos WHERE cliente_id = $1 AND LOWER(portal) = LOWER($2) LIMIT 1`,
          clienteId, portal,
        ).catch(() => [])
        if (exists.length > 0) continue

        await prisma.$executeRawUnsafe(
          `INSERT INTO cliente_acessos (id, cliente_id, portal, usuario, senha, observacoes, created_at, updated_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())`,
          clienteId, portal,
          row.usuario ? String(row.usuario).trim() : null,
          row.senha ? String(row.senha) : null,
          row.link ? String(row.link).trim() : null,
        ).catch(() => {})
        acessosCount++
      }

      // --- Vencimentos ---
      const [vncRows] = await conn.query(
        `SELECT tipo_alvara, vencimento, observacoes FROM cliente_legalizacao_vencimentos WHERE cliente_id = ?`,
        [serpro2Id],
      )
      for (const row of vncRows || []) {
        const desc = String(row.tipo_alvara || '').trim()
        if (!desc) continue
        const dtVenc = row.vencimento ? new Date(row.vencimento) : null

        // Verificar duplicado
        const existsVnc = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM cliente_vencimentos WHERE cliente_id = $1 AND LOWER(descricao) = LOWER($2) LIMIT 1`, clienteId, desc,
        ).catch(() => [])
        if (existsVnc.length > 0) continue

        try {
          const dtStr = dtVenc && !isNaN(dtVenc.getTime()) ? dtVenc.toISOString().slice(0, 10) : null
          const obsStr = row.observacoes ? String(row.observacoes).trim() || null : null
          if (dtStr) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO cliente_vencimentos (id, cliente_id, descricao, data_vencimento, observacoes, concluido, created_at, updated_at)
               VALUES (gen_random_uuid()::text, $1, $2, $3::date, $4, false, NOW(), NOW())`,
              clienteId, desc, dtStr, obsStr,
            )
          } else {
            await prisma.$executeRawUnsafe(
              `INSERT INTO cliente_vencimentos (id, cliente_id, descricao, observacoes, concluido, created_at, updated_at)
               VALUES (gen_random_uuid()::text, $1, $2, $3, false, NOW(), NOW())`,
              clienteId, desc, obsStr,
            )
          }
          vencimentosCount++
        } catch (e) { console.error('[ImportOneClick] Erro vencimento:', desc, (e as Error).message) }
      }

      // --- Andamentos ---
      const [andRows] = await conn.query(
        `SELECT tipo, titulo, vencimento, descricao_html FROM cliente_legalizacao_andamentos WHERE cliente_id = ?`,
        [serpro2Id],
      )
      for (const row of andRows || []) {
        const tipo = String(row.tipo || '').trim()
        if (!tipo) continue
        const titulo = row.titulo ? String(row.titulo).trim() : tipo

        // Verificar duplicado
        const existsAnd = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM cliente_andamentos WHERE cliente_id = $1 AND LOWER(tipo) = LOWER($2) AND LOWER(descricao) = LOWER($3) LIMIT 1`, clienteId, tipo, titulo,
        ).catch(() => [])
        if (existsAnd.length > 0) continue

        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO cliente_andamentos (id, cliente_id, descricao, tipo, status, observacoes, created_at, updated_at)
             VALUES (gen_random_uuid()::text, $1, $2, $3, 'Importado', $4, NOW(), NOW())`,
            clienteId, titulo, tipo,
            row.descricao_html ? String(row.descricao_html) : null,
          )
          andamentosCount++
        } catch (e) { console.error('[ImportOneClick] Erro andamento:', (e as Error).message) }
      }

      const parts = []
      if (popOk) parts.push('POP atualizado')
      if (acessosCount > 0) parts.push(`${acessosCount} acesso(s)`)
      if (vencimentosCount > 0) parts.push(`${vencimentosCount} vencimento(s)`)
      if (andamentosCount > 0) parts.push(`${andamentosCount} andamento(s)`)
      const msg = parts.length > 0 ? `Importado: ${parts.join(', ')}` : 'Nenhum dado novo — registros já existentes ou sem dados no legado'

      return { pop: popOk, acessos: acessosCount, vencimentos: vencimentosCount, andamentos: andamentosCount, message: msg }
    } finally {
      try { await conn.end() } catch { /* */ }
    }
  }
}
