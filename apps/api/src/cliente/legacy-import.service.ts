import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Prisma } from '@saas/db'
import * as mysql from 'mysql2/promise'

// Mapeamento de situação comercial do legado → enum Prisma
const SITUACAO_MAP: Record<string, string> = {
  'MENSAL': 'MENSAL',
  'EM CONSTITUIÇÃO': 'EM_CONSTITUICAO',
  'EM CONSTITUICAO': 'EM_CONSTITUICAO',
  'POTENCIAL': 'POTENCIAL',
  'AVULSO': 'AVULSO',
  'PARALIZADO': 'PARALIZADO',
  'PRÉ OPERACIONAL': 'PRE_OPERACIONAL',
  'PRE OPERACIONAL': 'PRE_OPERACIONAL',
  'PROSPECT': 'PROSPECT',
  'NÃO INFORMADO': 'MENSAL',
  'NAO INFORMADO': 'MENSAL',
}

const TRIBUTACAO_MAP: Record<string, string> = {
  'SIMPLES NACIONAL': 'SIMPLES_NACIONAL',
  'LUCRO PRESUMIDO': 'LUCRO_PRESUMIDO',
  'LUCRO REAL': 'LUCRO_REAL',
  'MEI': 'MEI',
}

const REGIME_MAP: Record<string, string> = {
  'CAIXA': 'CAIXA',
  'COMPETÊNCIA': 'COMPETENCIA',
  'COMPETENCIA': 'COMPETENCIA',
}

interface LegacyCliente {
  id: number
  documento: string
  tipo_documento: number // 1=CPF, 2=CNPJ
  tipo_cliente: string | null
  comercial_grupo: string | null
  comercial_categoria: string | null
  comercial_situacao: string | null
  comercial_origem: string | null
  comercial_data_entrada: string | null
  comercial_data_saida: string | null
  comercial_observacoes: string | null
  razao_social: string | null
  nome_fantasia: string | null
  email: string | null
  telefone: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  situacao: string | null
  fiscal_tributacao: string | null
  fiscal_regime: string | null
  deleted_at: string | null
  criado_em: string | null
  atualizado_em: string | null
  // Campos da query com JOIN
  grupo_empresarial_nome?: string | null
  servicos_lista?: string | null
}

@Injectable()
export class LegacyImportService {
  private async getLegacyConnection() {
    return mysql.createConnection({
      host: process.env.LEGACY_DB_HOST || 'localhost',
      user: process.env.LEGACY_DB_USER || 'root',
      password: process.env.LEGACY_DB_PASSWORD || '',
      database: process.env.LEGACY_DB_NAME || 'oneclick_fiscal_serpro',
      port: Number(process.env.LEGACY_DB_PORT || 3306),
      charset: 'utf8mb4',
    })
  }

  async importFromLegacy(empresaId?: string, userId?: string) {
    const conn = await this.getLegacyConnection()
    const results = { total: 0, imported: 0, updated: 0, skipped: 0, errors: [] as string[] }

    try {
      // Buscar clientes ativos do legado com áreas contratadas
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
        SELECT
          c.*,
          ge.nome AS grupo_empresarial_nome,
          (
            SELECT GROUP_CONCAT(a.nome SEPARATOR ';')
            FROM clientes_areas ca
            JOIN areas a ON a.id = ca.area_id
            WHERE ca.cliente_id = c.id AND ca.ativo = 1
          ) AS servicos_lista
        FROM clientes c
        LEFT JOIN grupos_empresariais ge ON ge.id = c.grupo_empresarial_id
        WHERE c.deleted_at IS NULL
        ORDER BY c.id ASC
      `)

      results.total = rows.length

      for (const row of rows as unknown as LegacyCliente[]) {
        try {
          const documento = String(row.documento || '').replace(/\D/g, '')
          if (!documento || documento.length < 11) {
            results.errors.push(`ID ${row.id}: documento inválido "${row.documento}"`)
            continue
          }

          const razaoSocial = row.razao_social?.trim()
          if (!razaoSocial) {
            results.errors.push(`ID ${row.id}: razão social vazia`)
            continue
          }

          // Verificar se já existe no novo sistema
          const existing = await prisma.cliente.findFirst({
            where: { documento: { contains: documento } },
          })

          const situacao = SITUACAO_MAP[String(row.comercial_situacao || '').toUpperCase().trim()] || 'MENSAL'
          const tributacao = TRIBUTACAO_MAP[String(row.fiscal_tributacao || '').toUpperCase().trim()] || null
          const regime = REGIME_MAP[String(row.fiscal_regime || '').toUpperCase().trim()] || null
          const grupo = row.grupo_empresarial_nome || row.comercial_grupo || null
          const areasContratadas = row.servicos_lista || null

          const data: Prisma.ClienteCreateInput = {
            razaoSocial,
            nomeFantasia: row.nome_fantasia || null,
            documento,
            tipoDocumento: row.tipo_documento === 1 ? 'CPF' as never : 'CNPJ' as never,
            tipoCliente: row.tipo_cliente || 'A DEFINIR',
            situacao: situacao as never,
            status: 'ATIVA' as never,
            grupo: grupo !== 'NÃO INFORMADO' ? grupo : null,
            categoria: row.comercial_categoria !== 'NÃO INFORMADO' ? row.comercial_categoria : null,
            origem: row.comercial_origem !== 'NÃO INFORMADO' ? row.comercial_origem : null,
            dataEntrada: row.comercial_data_entrada ? new Date(row.comercial_data_entrada) : null,
            dataSaida: row.comercial_data_saida ? new Date(row.comercial_data_saida) : null,
            observacoes: row.comercial_observacoes || null,
            tributacao: tributacao as never,
            regime: regime as never,
            areasContratadas,
            cep: row.cep || null,
            logradouro: row.endereco || null,
            cidade: row.cidade || null,
            uf: row.estado || null,
            telefone: row.telefone || null,
            email: row.email || null,
            isActive: true,
            idSistema: String(row.id),
            empresa: empresaId ? { connect: { id: empresaId } } : undefined,
            version: 1,
          }

          if (existing) {
            // Atualizar
            await prisma.cliente.update({
              where: { id: existing.id },
              data: {
                ...data,
                empresa: undefined, // não alterar empresa em update
                version: existing.version + 1,
              },
            })
            results.updated++
          } else {
            // Criar
            const cliente = await prisma.cliente.create({ data })
            await prisma.clienteEvent.create({
              data: { clienteId: cliente.id, userId: userId || null, type: 'imported', version: 1 },
            })
            results.imported++
          }
        } catch (e) {
          results.errors.push(`ID ${row.id} (${row.razao_social}): ${(e as Error).message}`)
        }
      }
    } finally {
      await conn.end()
    }

    return results
  }

  async previewLegacy() {
    const conn = await this.getLegacyConnection()
    try {
      const [countResult] = await conn.execute<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) as total FROM clientes WHERE deleted_at IS NULL'
      )
      const total = (countResult as Array<{ total: number }>)[0]?.total || 0

      const [preview] = await conn.execute<mysql.RowDataPacket[]>(`
        SELECT c.id, c.documento, c.tipo_documento, c.razao_social, c.comercial_situacao,
               c.fiscal_tributacao, c.cidade, c.estado
        FROM clientes c
        WHERE c.deleted_at IS NULL
        ORDER BY c.id ASC
        LIMIT 10
      `)

      return { total, preview }
    } finally {
      await conn.end()
    }
  }
}
