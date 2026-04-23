import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateUserInput, UpdateUserInput, ListUserInput } from '@saas/types'
import { hashPassword } from 'better-auth/crypto'

@Injectable()
export class UserService {
  async list(input: ListUserInput, callerIsMaster: boolean, callerEmpresaId?: string) {
    const { page, limit, search, sortBy, sortDir, role, empresaId } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(role ? { role } : {}),
      ...(empresaId ? { empresaId } : {}),
      // Non-MASTER users can only see users from their empresa
      ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { name: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          profile: true,
          isMaster: true,
          isActive: true,
          empresaId: true,
          createdAt: true,
          empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          area: { select: { id: true, name: true } },
          _count: { select: { permissions: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, callerIsMaster = false, callerEmpresaId?: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        telefone: true,
        role: true,
        profile: true,
        isMaster: true,
        isActive: true,
        empresaId: true,
        areaId: true,
        cargoId: true,
        salario: true,
        dataAdmissao: true,
        idOneClick: true,
        incluirFerias: true,
        image: true,
        createdAt: true,
        empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        area: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
        permissions: {
          select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true, subPermissions: true },
        },
      },
    })
    if (!callerIsMaster && callerEmpresaId && user.empresaId !== callerEmpresaId) {
      throw new Error('Acesso negado.')
    }
    return user
  }

  async create(input: CreateUserInput) {
    const { permissions, password, empresaId, areaId, cargoId, dataAdmissao, salario, role, profile, ...userData } = input
    const hashedPassword = await hashPassword(password || 'Acesso@123')

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...userData,
          role: (role ?? 'COLABORADOR_INTERNO') as never,
          profile: (profile ?? 'OPERADOR') as never,
          empresaId: empresaId || null,
          areaId: areaId || null,
          cargoId: cargoId || null,
          salario: salario != null && salario !== '' ? Number(salario) : null,
          dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null,
          emailVerified: false,
        },
      })

      // Create credential account (Better Auth compatible)
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: hashedPassword,
        },
      })

      // Create permissions
      if (permissions?.length) {
        await tx.userPermission.createMany({
          data: permissions.map((p) => ({
            userId: user.id,
            moduleSlug: p.moduleSlug,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
        })
      }

      return user
    })
  }

  async update(id: string, input: UpdateUserInput, callerIsMaster = false) {
    const { permissions, password, empresaId, areaId, cargoId, dataAdmissao, salario, ...userData } = input

    return prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUniqueOrThrow({ where: { id } })
      if (existing.isMaster && !callerIsMaster) {
        throw new Error('Apenas um usuário MASTER pode editar outro MASTER.')
      }
      if (existing.isMaster && callerIsMaster) {
        // Mesmo MASTER não pode alterar role/isActive de outro MASTER
        delete (userData as Record<string, unknown>).role
        delete (userData as Record<string, unknown>).isActive
      }

      const data: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(userData)) {
        if (value !== undefined) {
          data[key] = typeof value === 'string' && value === '' ? null : value
        }
      }
      if (empresaId !== undefined) data.empresaId = empresaId || null
      if (areaId !== undefined) data.areaId = areaId || null
      if (cargoId !== undefined) data.cargoId = cargoId || null
      if (salario !== undefined) data.salario = salario != null && salario !== '' ? Number(salario) : null
      if (dataAdmissao !== undefined) data.dataAdmissao = dataAdmissao ? new Date(dataAdmissao) : null

      const user = await tx.user.update({ where: { id }, data })

      // Update password if provided
      if (password) {
        const hashedPassword = await hashPassword(password)
        await tx.account.updateMany({
          where: { userId: id, providerId: 'credential' },
          data: { password: hashedPassword },
        })
      }

      // Replace permissions if provided
      if (permissions !== undefined) {
        await tx.userPermission.deleteMany({ where: { userId: id } })
        if (permissions.length) {
          await tx.userPermission.createMany({
            data: permissions.map((p) => ({
              userId: id,
              moduleSlug: p.moduleSlug,
              canRead: p.canRead,
              canWrite: p.canWrite,
              canDelete: p.canDelete,
              subPermissions: p.subPermissions ?? undefined,
            })),
          })
        }
      }

      return user
    })
  }

  async updatePermissions(userId: string, permissions: Array<{ moduleSlug: string; canRead: boolean; canWrite: boolean; canDelete: boolean; subPermissions?: Record<string, boolean> }>) {
    await prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } })
      if (permissions.length) {
        await tx.userPermission.createMany({
          data: permissions.map((p) => ({
            userId,
            moduleSlug: p.moduleSlug,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
            subPermissions: p.subPermissions ?? undefined,
          })),
        })
      }
    })
    return { success: true, total: permissions.length }
  }

  async delete(id: string, callerUserId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } })
    if (user.isMaster) {
      throw new Error('Rebaixe o usuário MASTER antes de excluí-lo.')
    }
    if (id === callerUserId) {
      throw new Error('Você não pode excluir a si mesmo.')
    }
    return prisma.user.delete({ where: { id } })
  }

  async toggleMaster(targetId: string, callerUserId: string, callerIsMaster: boolean) {
    if (!callerIsMaster) {
      throw new Error('Apenas um usuário MASTER pode promover ou rebaixar outro MASTER.')
    }
    if (targetId === callerUserId) {
      throw new Error('Você não pode rebaixar a si mesmo.')
    }
    const target = await prisma.user.findUniqueOrThrow({ where: { id: targetId } })
    return prisma.user.update({
      where: { id: targetId },
      data: { isMaster: !target.isMaster },
    })
  }

  async listForSelect(callerIsMaster: boolean, callerEmpresaId?: string) {
    return prisma.user.findMany({
      where: {
        isActive: true,
        ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    })
  }

  async getMyPermissions(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        isMaster: true,
        role: true,
        empresaId: true,
        permissions: {
          select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true },
        },
      },
    })

    return {
      isMaster: user.isMaster,
      role: user.role,
      empresaId: user.empresaId,
      permissions: user.permissions,
    }
  }

  async copyPermissions(sourceUserId: string, targetUserIds: string[]) {
    const sourcePerms = await prisma.userPermission.findMany({
      where: { userId: sourceUserId },
      select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true, subPermissions: true },
    })

    if (!sourcePerms.length) {
      throw new Error('O usuário de origem não possui permissões configuradas.')
    }

    let updated = 0
    for (const targetId of targetUserIds) {
      if (targetId === sourceUserId) continue
      await prisma.$transaction(async (tx) => {
        await tx.userPermission.deleteMany({ where: { userId: targetId } })
        await tx.userPermission.createMany({
          data: sourcePerms.map((p) => ({
            userId: targetId,
            moduleSlug: p.moduleSlug,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
            subPermissions: p.subPermissions ?? undefined,
          })),
        })
      })
      updated++
    }

    return { updated, permissionsCopied: sourcePerms.length }
  }

  async exportAll(callerIsMaster: boolean, callerEmpresaId?: string) {
    return prisma.user.findMany({
      where: {
        ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        name: true, email: true, telefone: true,
        role: true, profile: true, isMaster: true, isActive: true,
        salario: true, dataAdmissao: true, idOneClick: true, incluirFerias: true,
        empresa: { select: { razaoSocial: true } },
        area: { select: { name: true } },
        cargo: { select: { name: true } },
      },
    })
  }

  // ============================================================
  // Clientes vinculados (responsável/substituto em áreas contratadas)
  // ============================================================
  async getAssignedClients(userId: string) {
    type Row = {
      cliente_id: string; razao_social: string; documento: string
      area_nome: string; role: string; contratado: boolean
      data_encerramento: Date | null
    }
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT c.id AS cliente_id, c.razao_social, c.documento,
              a.name AS area_nome,
              CASE WHEN ca.responsavel_id = $1 THEN 'Responsável'
                   WHEN ca.substituto_id = $1 THEN 'Substituto(a)'
              END AS role,
              ca.contratado, ca.data_encerramento
       FROM cliente_areas_contratadas ca
       INNER JOIN clientes c ON c.id = ca.cliente_id AND c.deleted_at IS NULL
       INNER JOIN areas a ON a.id = ca.area_id
       WHERE (ca.responsavel_id = $1 OR ca.substituto_id = $1)
         AND ca.contratado = true
       ORDER BY c.razao_social, a.name`, userId,
    )
    return rows.map(r => ({
      clienteId: r.cliente_id,
      razaoSocial: r.razao_social,
      documento: r.documento,
      areaNome: r.area_nome,
      role: r.role,
      encerrado: !!r.data_encerramento,
    }))
  }

  // ============================================================
  // Importar carteira de clientes do OneClick v1
  // ============================================================
  async importarCarteiraOneClick(userId: string, opts: { dryRun?: boolean; somenteAreaUsuario?: boolean } = {}) {
    // 1. Buscar o usuario e seu idOneClick
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, idOneClick: true, areaId: true },
    })
    if (!user.idOneClick) throw new Error('Preencha o campo "ID OneClick" no cadastro do usuário antes de importar.')

    const ocUserId = Number(user.idOneClick)
    if (isNaN(ocUserId) || ocUserId <= 0) throw new Error('ID OneClick inválido. Deve ser um número positivo.')

    // 2. Conectar ao OneClick v1
    const mysql = await import('mysql2/promise')
    const conn = await mysql.createConnection({
      host: process.env.OCK_V1_DB_HOST || process.env.ONECLICK_DB_HOST || 'localhost',
      user: process.env.OCK_V1_DB_USER || process.env.ONECLICK_DB_USER || 'root',
      password: process.env.OCK_V1_DB_PASSWORD || process.env.ONECLICK_DB_PASSWORD || '',
      database: process.env.OCK_V1_DB_NAME || process.env.ONECLICK_DB_NAME || 'db_intranet',
      port: Number(process.env.OCK_V1_DB_PORT || process.env.ONECLICK_DB_PORT || 3306),
      charset: 'utf8mb4',
    })

    try {
      // 3. Detectar colunas existentes na tabela ger_cad_cli
      const [colRows] = await conn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ger_cad_cli'`,
      ) as [Array<{ COLUMN_NAME: string }>, unknown]
      const existingCols = new Set(colRows.map(r => r.COLUMN_NAME.toLowerCase()))

      function detectCol(candidates: string[]): string | null {
        for (const c of candidates) { if (existingCols.has(c.toLowerCase())) return c }
        return null
      }

      // Detectar coluna de CNPJ
      const cnpjCol = detectCol(['cad_cli_cnpj', 'cad_cli_cgc', 'cnpj', 'cgc', 'documento']) || 'cad_cli_cnpj'

      // Detectar colunas de responsavel por area
      const areaDefs = [
        { slug: 'contabil', respCandidates: ['cad_cli_res_con', 'cad_cli_resp_contabil', 'cad_cli_con_res', 'cad_cli_contabil_res'], flagCandidates: ['cad_cli_con_con', 'cad_cli_contabil_contratado'] },
        { slug: 'fiscal', respCandidates: ['cad_cli_res_fis', 'cad_cli_resp_fiscal', 'cad_cli_fis_res', 'cad_cli_fiscal_res'], flagCandidates: ['cad_cli_fis_con', 'cad_cli_fiscal_contratado'] },
        { slug: 'trabalhista', respCandidates: ['cad_cli_res_trab', 'cad_cli_resp_trabalhista', 'cad_cli_trab_res', 'cad_cli_pes_res'], flagCandidates: ['cad_cli_trab_con', 'cad_cli_trabalhista_contratado', 'cad_cli_dp_con', 'cad_cli_pes_con'] },
        { slug: 'legalizacao', respCandidates: ['cad_cli_res_legal', 'cad_cli_resp_legal', 'cad_cli_legal_res', 'cad_cli_leg_res'], flagCandidates: ['cad_cli_legal_con', 'cad_cli_legal_contratado'] },
      ]

      const respCols: Array<{ slug: string; col: string; flagCol: string | null }> = []
      for (const ad of areaDefs) {
        const col = detectCol(ad.respCandidates)
        if (col) respCols.push({ slug: ad.slug, col, flagCol: detectCol(ad.flagCandidates) })
      }

      if (respCols.length === 0) throw new Error('Nenhuma coluna de responsável encontrada na tabela ger_cad_cli.')

      // Construir query dinamica
      const selectCols = [cnpjCol + ' AS cnpj_raw']
      for (const rc of respCols) {
        selectCols.push(`${rc.col} AS resp_${rc.slug}`)
        if (rc.flagCol) selectCols.push(`${rc.flagCol} AS flag_${rc.slug}`)
      }

      const whereOr = respCols.map(r => `${r.col} = ?`).join(' OR ')
      const params = respCols.map(() => ocUserId)

      const ativoCol = detectCol(['cad_cli_ativo', 'ativo']) || 'cad_cli_ativo'

      const [rows] = await conn.execute(
        `SELECT ${selectCols.join(', ')} FROM ger_cad_cli WHERE ${ativoCol} = 1 AND (${whereOr})`,
        params,
      ) as [Array<Record<string, unknown>>, unknown]

      // 4. Mapear areas do novo sistema
      const areasDb = await prisma.area.findMany({
        where: { isActive: true, availableForHiring: true },
        select: { id: true, name: true },
      })
      const areaMap = new Map<string, string>()
      for (const a of areasDb) {
        const n = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        if (n.includes('contab')) areaMap.set('contabil', a.id)
        if (n.includes('fiscal')) areaMap.set('fiscal', a.id)
        if (n.includes('trabalh') || n.includes('pessoal') || n.includes('dp')) areaMap.set('trabalhista', a.id)
        if (n.includes('legal') || n.includes('societar')) areaMap.set('legalizacao', a.id)
      }

      // 5. Filtrar por area do usuario se solicitado
      let activeSlugs = respCols.map(r => r.slug)
      if (opts.somenteAreaUsuario && user.areaId) {
        const userArea = areasDb.find(a => a.id === user.areaId)
        if (userArea) {
          const n = userArea.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          const matchSlug = activeSlugs.find(s => n.includes(s.replace('legalizacao', 'legal')))
          if (matchSlug) activeSlugs = [matchSlug]
        }
      }

      // 6. Processar resultados
      let vinculados = 0, ignoradosSemCliente = 0, ignoradosSemArea = 0

      for (const row of rows) {
        const doc = String(row.cnpj_raw || '').replace(/\D/g, '')
        if (!doc || doc.length < 11) { ignoradosSemCliente++; continue }

        const cliente = await prisma.cliente.findFirst({
          where: { documento: doc, deletedAt: null },
          select: { id: true },
        })
        if (!cliente) { ignoradosSemCliente++; continue }

        for (const rc of respCols) {
          if (!activeSlugs.includes(rc.slug)) continue
          if (Number(row[`resp_${rc.slug}`] || 0) !== ocUserId) continue

          const areaId = areaMap.get(rc.slug)
          if (!areaId) { ignoradosSemArea++; continue }

          if (!opts.dryRun) {
            await prisma.clienteAreaContratada.upsert({
              where: { clienteId_areaId: { clienteId: cliente.id, areaId } },
              create: { clienteId: cliente.id, areaId, contratado: true, responsavelId: userId },
              update: { responsavelId: userId, contratado: true },
            })
          }
          vinculados++
        }
      }

      return {
        ocUserId,
        totalLinhasOneClick: rows.length,
        vinculados,
        ignoradosSemCliente,
        ignoradosSemArea,
        areasMapeadas: Object.fromEntries([...areaMap.entries()].filter(([k]) => activeSlugs.includes(k))),
        dryRun: !!opts.dryRun,
      }
    } finally {
      conn.end().catch(() => {})
    }
  }

  // ============================================================
  // Buscar dados do usuário nos bancos legados (SERPRO2 + v1)
  // ============================================================
  async buscarDadosLegado(email: string) {
    const mysql = await import('mysql2/promise')
    const result: {
      encontrado: boolean
      fonte: string | null
      dados: Record<string, unknown> | null
    } = { encontrado: false, fonte: null, dados: null }

    // 1. Tentar SERPRO2 (oneclick_fiscal_serpro) — tem dados mais completos
    try {
      const conn = await mysql.createConnection({
        host: process.env.LEGACY_DB_HOST || 'localhost',
        user: process.env.LEGACY_DB_USER || 'root',
        password: process.env.LEGACY_DB_PASSWORD || '',
        database: process.env.LEGACY_DB_NAME || 'oneclick_fiscal_serpro',
        port: Number(process.env.LEGACY_DB_PORT || 3306),
        charset: 'utf8mb4',
        connectTimeout: 5000,
      })
      try {
        const [rows] = await conn.execute(
          `SELECT u.id, u.nome, u.email, u.telefone,
                  u.tipo_usuario, u.perfil, u.ativo,
                  u.data_admissao, u.controle_ferias,
                  u.oneclick_usuario_id, u.salario,
                  a.nome AS area_nome, c.nome AS cargo_nome
           FROM usuarios u
           LEFT JOIN areas a ON a.id = u.area_id
           LEFT JOIN cargos c ON c.id = u.cargo_id
           WHERE u.email = ?
           LIMIT 1`,
          [email.trim().toLowerCase()],
        ) as [Array<Record<string, unknown>>, unknown]

        if (rows.length > 0) {
          const row = rows[0]!
          result.encontrado = true
          result.fonte = 'SERPRO2'
          result.dados = {
            idLegado: row.id,
            nome: row.nome,
            email: row.email,
            telefone: row.telefone,
            tipoUsuario: row.tipo_usuario,
            perfil: row.perfil,
            ativo: row.ativo,
            dataAdmissao: row.data_admissao,
            controleFerias: !!row.controle_ferias,
            oneclickUsuarioId: row.oneclick_usuario_id,
            salario: row.salario,
            areaNome: row.area_nome,
            cargoNome: row.cargo_nome,
          }
        }
      } finally {
        conn.end().catch(() => {})
      }
    } catch {
      // SERPRO2 indisponível, segue para v1
    }

    // 2. Se não encontrou no SERPRO2, tentar OneClick v1 (db_intranet)
    if (!result.encontrado) {
      try {
        const conn = await mysql.createConnection({
          host: process.env.OCK_V1_DB_HOST || process.env.ONECLICK_DB_HOST || 'localhost',
          user: process.env.OCK_V1_DB_USER || process.env.ONECLICK_DB_USER || 'root',
          password: process.env.OCK_V1_DB_PASSWORD || process.env.ONECLICK_DB_PASSWORD || '',
          database: process.env.OCK_V1_DB_NAME || process.env.ONECLICK_DB_NAME || 'db_intranet',
          port: Number(process.env.OCK_V1_DB_PORT || process.env.ONECLICK_DB_PORT || 3306),
          charset: 'utf8mb4',
          connectTimeout: 5000,
        })
        try {
          // Descobrir tabela e colunas dinamicamente
          const [tables] = await conn.execute(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ('crp_usuarios','ger_usuarios','cad_usuarios','usuarios')
             LIMIT 1`,
          ) as [Array<{ TABLE_NAME: string }>, unknown]

          if (tables.length > 0) {
            const tbl = tables[0]!.TABLE_NAME
            const [cols] = await conn.execute(
              `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
              [tbl],
            ) as [Array<{ COLUMN_NAME: string }>, unknown]
            const colSet = new Set(cols.map(c => c.COLUMN_NAME.toLowerCase()))

            const idCol = ['id', 'id_usuario', 'codigo', 'cd_usuario'].find(c => colSet.has(c)) || 'id'
            const nomeCol = ['nome', 'nome_completo', 'nm_usuario'].find(c => colSet.has(c)) || 'nome'
            const emailCol = colSet.has('email') ? 'email' : null

            if (emailCol) {
              const [rows] = await conn.execute(
                `SELECT ${idCol} AS id, ${nomeCol} AS nome, ${emailCol} AS email FROM ${tbl} WHERE ${emailCol} = ? LIMIT 1`,
                [email.trim().toLowerCase()],
              ) as [Array<Record<string, unknown>>, unknown]

              if (rows.length > 0) {
                const row = rows[0]!
                result.encontrado = true
                result.fonte = 'OneClick v1'
                result.dados = {
                  idLegado: row.id,
                  nome: row.nome,
                  email: row.email,
                  oneclickUsuarioId: row.id,
                }
              }
            }
          }
        } finally {
          conn.end().catch(() => {})
        }
      } catch {
        // v1 também indisponível
      }
    }

    return result
  }

  async bulkCreate(items: CreateUserInput[]) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }
}
