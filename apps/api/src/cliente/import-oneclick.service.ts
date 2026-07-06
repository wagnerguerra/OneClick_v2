import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Importação do cadastro de Legalização do OneClick v1 (MySQL db_intranet /
 * oneclick_fiscal_serpro): POP/Registros, Acessos, Vencimentos, Andamentos e
 * Sócios.
 *
 * Arquitetura: a LEITURA do MySQL só funciona na LAN do escritório. Por isso o
 * fluxo separa `lerLegado` (leitura) de `aplicar` (grava no v2):
 *  - Em dev/LAN: `importar` = lerLegado + aplicar (tudo na API).
 *  - Em produção: o Service Manager (na LAN) lê o legado e devolve `ImportLegadoDados`
 *    via callback; a API só chama `aplicar` (ver cliente.router: importOneclickViaLauncher).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mysql = require('mysql2/promise')

export interface ImportResult {
  pop: boolean
  acessos: number
  vencimentos: number
  andamentos: number
  socios: number
  message: string
}

/** Linhas cruas do legado — mesmas colunas do MySQL, lidas pela API OU pelo SM. */
export interface ImportLegadoDados {
  found: boolean
  pop?: Record<string, unknown> | null
  acessos?: Record<string, unknown>[]
  vencimentos?: Record<string, unknown>[]
  andamentos?: Record<string, unknown>[]
  socios?: Record<string, unknown>[]
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

  /** Lê o cadastro legado direto no MySQL (só funciona na LAN). */
  async lerLegado(documento: string): Promise<ImportLegadoDados> {
    const cnpj = documento.replace(/\D/g, '')
    if (cnpj.length !== 14) throw new Error('CNPJ inválido — importação apenas para 14 dígitos')

    const conn = await this.getConnection()
    try {
      const [cliRows] = await conn.query(
        `SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = ? LIMIT 1`,
        [cnpj],
      )
      const serpro2Id = cliRows?.[0]?.id
      if (!serpro2Id) return { found: false }

      const [popRows] = await conn.query(
        `SELECT inscricao_estadual, inscricao_municipal, nire, rg_edificacao, codigo_simples,
                bombeiros_tipo, bombeiros_metragem, bombeiros_rota, bombeiros_projeto,
                bombeiros_capacidade, bombeiros_referencia, latitude, longitude, cnae, acesso_siat
         FROM cliente_legalizacao_pop WHERE cliente_id = ? LIMIT 1`, [serpro2Id],
      )
      const [aceRows] = await conn.query(
        `SELECT tipo, link, usuario, senha FROM cliente_legalizacao_acessos WHERE cliente_id = ?`, [serpro2Id],
      )
      const [vncRows] = await conn.query(
        `SELECT tipo_alvara, vencimento, observacoes FROM cliente_legalizacao_vencimentos WHERE cliente_id = ?`, [serpro2Id],
      )
      const [andRows] = await conn.query(
        `SELECT tipo, titulo, vencimento, descricao_html FROM cliente_legalizacao_andamentos WHERE cliente_id = ?`, [serpro2Id],
      )
      const [socRows] = await conn.query(
        `SELECT nome, documento, qualificacao, percentual_participacao, valor_participacao, representante_nome, representante_qualificacao
         FROM clientes_socios WHERE cliente_id = ? AND ativo = 1`, [serpro2Id],
      )

      return {
        found: true,
        pop: popRows?.[0] ?? null,
        acessos: aceRows ?? [],
        vencimentos: vncRows ?? [],
        andamentos: andRows ?? [],
        socios: socRows ?? [],
      }
    } finally {
      try { await conn.end() } catch { /* */ }
    }
  }

  /** Grava as linhas do legado no cadastro v2. Idempotente (não duplica). */
  async aplicar(clienteId: string, dados: ImportLegadoDados): Promise<ImportResult> {
    if (!dados?.found) throw new Error('Cliente não encontrado no banco OneClick (legado)')

    let popOk = false, acessosCount = 0, vencimentosCount = 0, andamentosCount = 0, sociosCount = 0

    // --- POP (Registros Gerais) ---
    if (dados.pop) {
      const r = dados.pop as Record<string, unknown>
      const updates: Record<string, string> = {}
      if (r.inscricao_estadual) updates.inscricaoEstadual = String(r.inscricao_estadual).trim()
      if (r.inscricao_municipal) updates.inscricaoMunicipal = String(r.inscricao_municipal).trim()
      if (r.nire) updates.nire = String(r.nire).trim()
      if (Object.keys(updates).length > 0) {
        await prisma.cliente.update({ where: { id: clienteId }, data: updates as never }).catch(() => {})
        popOk = true
      }
    }

    // --- Acessos ---
    for (const row of dados.acessos ?? []) {
      const portal = String(row.tipo || '').trim()
      if (!portal) continue
      const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM cliente_acessos WHERE cliente_id = $1 AND LOWER(portal) = LOWER($2) LIMIT 1`, clienteId, portal,
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
    for (const row of dados.vencimentos ?? []) {
      const desc = String(row.tipo_alvara || '').trim()
      if (!desc) continue
      const dtVenc = row.vencimento ? new Date(row.vencimento as string) : null
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
    for (const row of dados.andamentos ?? []) {
      const tipo = String(row.tipo || '').trim()
      if (!tipo) continue
      const titulo = row.titulo ? String(row.titulo).trim() : tipo
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

    // --- Sócios (incorporado ao Importar OneClick) ---
    for (const s of dados.socios ?? []) {
      const nome = String(s.nome || '').trim()
      if (!nome) continue
      const exists = await prisma.socio.findFirst({ where: { clienteId, nomeCompleto: { equals: nome, mode: 'insensitive' } }, select: { id: true } }).catch(() => null)
      if (exists) continue
      const qualStr = String(s.qualificacao || '').toLowerCase()
      let tipoSocio: 'SOCIO_ADMINISTRADOR' | 'SOCIO_DIRETOR' | 'REPRESENTANTE_LEGAL' | 'SOCIO_QUOTISTA' | 'TITULAR' = 'SOCIO_QUOTISTA'
      if (qualStr.includes('administrador')) tipoSocio = 'SOCIO_ADMINISTRADOR'
      else if (qualStr.includes('diretor') || qualStr.includes('presidente')) tipoSocio = 'SOCIO_DIRETOR'
      else if (qualStr.includes('titular')) tipoSocio = 'TITULAR'
      else if (qualStr.includes('representante') || qualStr.includes('procurador')) tipoSocio = 'REPRESENTANTE_LEGAL'
      await prisma.socio.create({
        data: {
          nomeCompleto: nome,
          cpf: s.documento ? String(s.documento).replace(/\D/g, '') : '',
          tipoSocio,
          participacao: s.percentual_participacao != null ? Number(s.percentual_participacao) : undefined,
          valorQuotas: s.valor_participacao != null ? Number(s.valor_participacao) : undefined,
          clienteId,
          observacoes: `Importado do OneClick — ${s.qualificacao || ''}${s.representante_nome ? ' | Rep: ' + s.representante_nome : ''}`,
        },
      }).then(() => { sociosCount++ }).catch((e) => { console.error('[ImportOneClick] Erro sócio:', nome, (e as Error).message) })
    }

    const parts: string[] = []
    if (popOk) parts.push('POP atualizado')
    if (acessosCount > 0) parts.push(`${acessosCount} acesso(s)`)
    if (vencimentosCount > 0) parts.push(`${vencimentosCount} vencimento(s)`)
    if (andamentosCount > 0) parts.push(`${andamentosCount} andamento(s)`)
    if (sociosCount > 0) parts.push(`${sociosCount} sócio(s)`)
    const message = parts.length > 0 ? `Importado: ${parts.join(', ')}` : 'Nenhum dado novo — registros já existentes ou sem dados no legado'

    return { pop: popOk, acessos: acessosCount, vencimentos: vencimentosCount, andamentos: andamentosCount, socios: sociosCount, message }
  }

  /** Import direto (LAN): lê o MySQL + aplica. */
  async importar(clienteId: string, documento: string): Promise<ImportResult> {
    const dados = await this.lerLegado(documento)
    return this.aplicar(clienteId, dados)
  }
}
