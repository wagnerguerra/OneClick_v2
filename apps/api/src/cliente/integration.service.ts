import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CnpjService, type CnpjResult } from '../cnpj/cnpj.service'
import { SciService } from './sci.service'
import * as crypto from 'crypto'

// ============================================================
// Job Store (in-memory, mesma estratégia do legado)
// ============================================================

export interface JobProgress {
  processed: number
  total: number
  phase: 'queued' | 'running' | 'done' | 'error'
  step?: string
  documento?: string
  message?: string
  updated: number
  errors: number
  created?: number
  skipped?: number
  socios_importados?: number
  eta_human?: string
}

export interface JobLogEntry {
  documento: string
  razaoSocial: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  message?: string
}

interface Job {
  id: string
  progress: JobProgress
  logs: JobLogEntry[]
  result?: unknown
  createdAt: number
}

const jobs = new Map<string, Job>()

// Limpar jobs antigos (>30min)
setInterval(() => {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 30 * 60 * 1000) jobs.delete(id)
  }
}, 60_000)

function createJob(total: number): Job {
  const id = crypto.randomBytes(8).toString('hex')
  const job: Job = {
    id,
    progress: { processed: 0, total, phase: 'queued', updated: 0, errors: 0 },
    logs: [],
    createdAt: Date.now(),
  }
  jobs.set(id, job)
  return job
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ============================================================
// Service
// ============================================================

@Injectable()
export class IntegrationService {
  constructor(
    private readonly cnpjService: CnpjService,
    private readonly sciService: SciService,
  ) {}

  // [QA #36] Lock em memória por empresa: impede que 2 execuções simultâneas
  // (2 usuários / 2 abas) rodem o loop em paralelo e dobrem o custo SERPRO.
  private readonly serproRunning = new Set<string>()

  // ── Job polling ──────────────────────────────────────────

  getJobStatus(jobId: string): JobProgress | null {
    const job = jobs.get(jobId)
    return job?.progress ?? null
  }

  getJobResult(jobId: string): unknown {
    return jobs.get(jobId)?.result ?? null
  }

  getJobLogs(jobId: string, offset = 0): JobLogEntry[] {
    const job = jobs.get(jobId)
    if (!job) return []
    return job.logs.slice(offset)
  }

  // ── 1. Cadastrar das Consultas ───────────────────────────

  async cadastrarDasConsultas(empresaId?: string) {
    const lockKey = empresaId ?? '__global__'
    if (this.serproRunning.has(lockKey)) {
      throw new Error('Já existe uma importação de consultas em andamento para esta empresa. Aguarde a conclusão.')
    }
    this.serproRunning.add(lockKey)
    try {
    // Buscar documentos que têm consulta de situação fiscal mas não são clientes
    const consultas = await prisma.situacaoFiscal.findMany({
      where: empresaId ? { empresaId } : {},
      select: { documento: true, tipoDocumento: true },
      distinct: ['documento'],
    })

    const clientesExistentes = await prisma.cliente.findMany({
      where: { deletedAt: null, ...(empresaId ? { empresaId } : {}) },
      select: { documento: true },
    })
    const docsExistentes = new Set(clientesExistentes.map(c => c.documento.replace(/\D/g, '')))

    const novos = consultas.filter(c => !docsExistentes.has(c.documento.replace(/\D/g, '')))

    let cadastrados = 0
    let erros = 0

    for (const consulta of novos.slice(0, 100)) {
      const doc = consulta.documento.replace(/\D/g, '')
      try {
        // Para CNPJs, buscar dados completos
        let razaoSocial = doc
        let dadosCnpj: CnpjResult | null = null
        if (doc.length === 14) {
          try {
            dadosCnpj = await this.cnpjService.consultarCnpj(doc)
            razaoSocial = dadosCnpj.razaoSocial || doc
          } catch { /* usar apenas o documento */ }
          await sleep(500)
        }

        await prisma.cliente.create({
          data: {
            documento: doc,
            tipoDocumento: doc.length === 14 ? 'CNPJ' : 'CPF',
            razaoSocial,
            nomeFantasia: dadosCnpj?.nomeFantasia || null,
            situacao: 'MENSAL',
            status: 'ATIVA',
            isActive: true,
            cep: dadosCnpj?.cep || null,
            logradouro: dadosCnpj?.logradouro || null,
            numero: dadosCnpj?.numero || null,
            complemento: dadosCnpj?.complemento || null,
            bairro: dadosCnpj?.bairro || null,
            cidade: dadosCnpj?.municipio || null,
            uf: dadosCnpj?.uf || null,
            ...(empresaId ? { empresaId } : {}),
          },
        })
        cadastrados++
      } catch {
        erros++
      }
    }

    return { cadastrados, erros, total: novos.length }
    } finally {
      this.serproRunning.delete(lockKey)
    }
  }

  // ── 2. Cadastrar pelo CNPJ ──────────────────────────────

  async buscarDadosCnpj(cnpj: string) {
    return this.cnpjService.consultarCnpj(cnpj)
  }

  async cadastrarPeloCnpj(cnpj: string, empresaId?: string) {
    const doc = cnpj.replace(/\D/g, '')
    if (doc.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.')

    // Verificar se já existe
    const existente = await prisma.cliente.findFirst({
      where: { documento: doc, deletedAt: null },
    })
    if (existente) throw new Error(`Cliente com CNPJ ${doc} já cadastrado: ${existente.razaoSocial}`)

    const dados = await this.cnpjService.consultarCnpj(doc)

    const cliente = await prisma.cliente.create({
      data: {
        documento: doc,
        tipoDocumento: 'CNPJ',
        razaoSocial: dados.razaoSocial,
        nomeFantasia: dados.nomeFantasia || null,
        situacao: 'MENSAL',
        status: 'ATIVA',
        isActive: true,
        cep: dados.cep || null,
        logradouro: dados.logradouro || null,
        numero: dados.numero || null,
        complemento: dados.complemento || null,
        bairro: dados.bairro || null,
        cidade: dados.municipio || null,
        uf: dados.uf || null,
        ...(empresaId ? { empresaId } : {}),
      },
    })

    return { cliente, dados }
  }

  // ── 3. Importar clientes (texto/CSV) ─────────────────────

  async iniciarImportacaoJob(
    clientes: Array<{ documento: string; razao_social?: string; email?: string; telefone?: string; cidade?: string; estado?: string }>,
    opts: { atualizarExistentes?: boolean; preencherPorCnpj?: boolean },
    empresaId?: string,
  ) {
    const job = createJob(clientes.length)
    job.progress.phase = 'running'

    // Processar em background (fire-and-forget)
    this.processarImportacao(job, clientes, opts, empresaId).catch(() => {
      job.progress.phase = 'error'
      job.progress.message = 'Erro interno no processamento'
    })

    return { jobId: job.id, total: clientes.length }
  }

  private async processarImportacao(
    job: Job,
    clientes: Array<{ documento: string; razao_social?: string; email?: string; telefone?: string; cidade?: string; estado?: string }>,
    opts: { atualizarExistentes?: boolean; preencherPorCnpj?: boolean },
    empresaId?: string,
  ) {
    const p = job.progress
    let importados = 0, atualizados = 0, errosList: Array<{ documento: string; erro: string }> = []
    const duplicados = new Set<string>()

    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      const doc = c.documento.replace(/\D/g, '')
      p.processed = i + 1
      p.documento = doc
      p.step = `Processando ${i + 1}/${clientes.length}`

      if (!doc || (doc.length !== 11 && doc.length !== 14)) {
        errosList.push({ documento: c.documento, erro: 'Documento inválido' })
        p.errors++
        continue
      }

      if (duplicados.has(doc)) continue
      duplicados.add(doc)

      try {
        const existente = await prisma.cliente.findFirst({ where: { documento: doc, deletedAt: null } })

        let razaoSocial = c.razao_social || doc
        let dadosCnpj: CnpjResult | null = null

        if (opts.preencherPorCnpj && doc.length === 14) {
          try {
            dadosCnpj = await this.cnpjService.consultarCnpj(doc)
            razaoSocial = dadosCnpj.razaoSocial || razaoSocial
          } catch { /* ignorar */ }
          await sleep(500)
        }

        if (existente && opts.atualizarExistentes) {
          await prisma.cliente.update({
            where: { id: existente.id },
            data: {
              razaoSocial: razaoSocial || existente.razaoSocial,
              email: c.email || existente.email,
              telefone: c.telefone || existente.telefone,
              cidade: c.cidade || dadosCnpj?.municipio || existente.cidade,
              uf: c.estado || dadosCnpj?.uf || existente.uf,
            },
          })
          atualizados++
          p.updated++
        } else if (!existente) {
          await prisma.cliente.create({
            data: {
              documento: doc,
              tipoDocumento: doc.length === 14 ? 'CNPJ' : 'CPF',
              razaoSocial,
              situacao: 'MENSAL',
              status: 'ATIVA',
              isActive: true,
              email: c.email || null,
              telefone: c.telefone || null,
              cidade: c.cidade || dadosCnpj?.municipio || null,
              uf: c.estado || dadosCnpj?.uf || null,
              cep: dadosCnpj?.cep || null,
              logradouro: dadosCnpj?.logradouro || null,
              bairro: dadosCnpj?.bairro || null,
              ...(empresaId ? { empresaId } : {}),
            },
          })
          importados++
          p.updated++
        }
      } catch (e) {
        errosList.push({ documento: doc, erro: (e as Error).message })
        p.errors++
      }
    }

    p.phase = 'done'
    p.message = 'Importação concluída'
    job.result = { importados, atualizados, erros: errosList, total: clientes.length }
  }

  // ── 4. SCI fiscal lote ──────────────────────────────────

  async atualizarFiscalSciLote(
    opts: { limit: number; force: boolean; onlyMissing: boolean },
    empresaId?: string,
  ) {
    const where: Record<string, unknown> = {
      deletedAt: null,
      tipoDocumento: 'CNPJ',
      ...(empresaId ? { empresaId } : {}),
    }
    if (opts.onlyMissing) {
      where.OR = [
        { tributacao: null },
        { tributacao: '' },
        { regime: null },
        { regime: '' },
      ]
    }

    const clientes = await prisma.cliente.findMany({
      where: where as never,
      select: { id: true, documento: true, tributacao: true, regime: true },
      take: opts.limit,
    })

    let processed = 0, updated = 0, skipped = 0, failed = 0
    const resultados: Array<{ documento: string; status: string; fiscal_tributacao?: string; fiscal_regime?: string; erro?: string }> = []

    for (const cliente of clientes) {
      processed++
      const doc = cliente.documento.replace(/\D/g, '')

      if (!opts.force && cliente.tributacao && cliente.regime) {
        skipped++
        resultados.push({ documento: doc, status: 'skipped_already_filled', fiscal_tributacao: cliente.tributacao, fiscal_regime: cliente.regime || undefined })
        continue
      }

      try {
        const sci = await this.sciService.buscarIdSistemaPorCnpj(doc)
        if (!sci || !sci.idCliente) {
          skipped++
          resultados.push({ documento: doc, status: 'skipped_no_infer' })
          continue
        }

        // Tentar obter métricas do SCI para inferir tributação
        // Simplificação: apenas atualiza idSistema se encontrado, tributacao depende de dados SCI mais completos
        await prisma.cliente.update({
          where: { id: cliente.id },
          data: { idSistema: String(sci.idCliente) },
        })
        updated++
        resultados.push({ documento: doc, status: 'updated' })
      } catch (e) {
        failed++
        resultados.push({ documento: doc, status: 'failed', erro: (e as Error).message })
      }
    }

    return { processed, updated, skipped, failed, resultados: resultados.slice(0, 50) }
  }

  // ── 5. OneClick lote (importar do legado com opções) ─────

  async iniciarImportacaoOneClickJob(
    opts: {
      limit: number
      allClients: boolean
      force: boolean
      importFlags: {
        fiscal?: boolean; comercial?: boolean; grupo?: boolean; contato?: boolean
        endereco?: boolean; razao?: boolean; socios?: boolean; areasContratadas?: boolean
        status?: boolean; particularidades?: boolean; legalizacao?: boolean
        datas?: boolean; registros?: boolean
      }
      includeNewFromOneclick?: boolean
      onlyNewFromOneclick?: boolean
      skipLeads?: boolean
    },
    empresaId?: string,
  ) {
    // Contar total no legado para dimensionar o job
    const mysql = await import('mysql2/promise')
    let conn: Awaited<ReturnType<typeof mysql.createConnection>> | null = null
    try {
      conn = await mysql.createConnection({
        host: process.env.OCK_V1_DB_HOST || 'localhost',
        user: process.env.OCK_V1_DB_USER || 'root',
        password: process.env.OCK_V1_DB_PASSWORD || '',
        database: process.env.OCK_V1_DB_NAME || 'db_intranet',
        port: Number(process.env.OCK_V1_DB_PORT || 3306),
        charset: 'utf8mb4',
      })

      const limitSql = opts.allClients ? '' : `LIMIT ${opts.limit}`
      const [rows] = await conn.execute(`SELECT COUNT(*) as total FROM GER_CAD_CLI WHERE cad_cli_ativo = 1 ${limitSql}`) as [Array<{ total: number }>, unknown]
      const total = rows[0]?.total || 0

      const job = createJob(total)
      job.progress.phase = 'running'

      // Background process
      this.processarOneClick(job, conn, opts, empresaId).catch(() => {
        job.progress.phase = 'error'
        job.progress.message = 'Erro interno no processamento'
      })

      return { jobId: job.id, total }
    } catch (e) {
      conn?.end().catch(() => {})
      throw new Error(`Erro ao conectar ao banco legado: ${(e as Error).message}`)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async processarOneClick(
    job: Job,
    conn: any,
    opts: {
      limit: number; allClients: boolean; force: boolean
      importFlags: Record<string, boolean | undefined>
      includeNewFromOneclick?: boolean; onlyNewFromOneclick?: boolean
      skipLeads?: boolean; nomeFantasia?: string
    },
    empresaId?: string,
  ) {
    const p = job.progress
    const flags = opts.importFlags

    try {
      const limitSql = opts.allClients ? '' : `LIMIT ${opts.limit}`

      // Query principal: GER_CAD_CLI com lookups em tabelas auxiliares
      const [rows] = await conn.execute(
        `SELECT c.*,
                g.grupo AS grupo_nome,
                s.situacao AS situacao_nome,
                t.tributacao AS tributacao_nome,
                r.regime AS regime_nome
         FROM GER_CAD_CLI c
         LEFT JOIN cad_gru g ON c.cad_cli_grupo = g.id
         LEFT JOIN cad_cli_sit s ON c.cad_cli_situacao = s.id
         LEFT JOIN cad_tri t ON c.cad_cli_regime = t.id
         LEFT JOIN cad_cli_regime r ON c.cad_cli_regime2 = r.id
         WHERE c.cad_cli_ativo = 1
         ORDER BY c.cad_cli_razao ASC
         ${limitSql}`
      ) as [Array<Record<string, unknown>>, unknown]

      p.total = rows.length
      let created = 0, updated = 0, skippedCount = 0, failedCount = 0, sociosImportados = 0
      let leadsSkipped = 0, leadsCreated = 0, servicosImportados = 0

      // Cache de áreas do novo sistema para mapear serviços contratados
      let areasMap: Map<string, string> | null = null
      if (flags.servicosContratados) {
        const areas = await prisma.area.findMany({ where: { isActive: true }, select: { id: true, name: true } })
        areasMap = new Map<string, string>()
        for (const a of areas) {
          const normalized = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          areasMap.set(normalized, a.id)
          // Aliases comuns
          if (normalized.includes('contab')) areasMap.set('contabil', a.id)
          if (normalized.includes('fiscal')) areasMap.set('fiscal', a.id)
          if (normalized.includes('trabalh') || normalized.includes('pessoal') || normalized.includes('dp')) areasMap.set('trabalhista', a.id)
          if (normalized.includes('legal') || normalized.includes('societar')) areasMap.set('legalizacao', a.id)
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!
        p.processed = i + 1
        const doc = String(row.cad_cli_cnpj || row.cad_cli_cgc || '').replace(/\D/g, '')
        p.documento = doc
        p.step = `${i + 1}/${rows.length}`

        const razao = String(row.cad_cli_razao || doc)
        const situacaoLegado = String(row.situacao_nome || '').toUpperCase().trim()

        // Detectar LEADs: prefixo (LEAD) na razão social, ou situação PROSPECT/POTENCIAL sem doc válido
        const isLead = razao.toUpperCase().startsWith('(LEAD)')
          || (situacaoLegado === 'PROSPECT' && (!doc || doc.length < 11))

        if (isLead && opts.skipLeads) {
          leadsSkipped++; skippedCount++; p.skipped = skippedCount
          job.logs.push({ documento: doc || '(vazio)', razaoSocial: razao, status: 'skipped', message: 'Lead ignorado (skipLeads)' })
          continue
        }

        if (!doc || doc.length < 11) {
          if (isLead) {
            // Lead sem documento — criar com documento fake baseado no nome
            // Será tratado como lead para o futuro módulo CRM
            leadsSkipped++; skippedCount++; p.skipped = skippedCount
            job.logs.push({ documento: '(vazio)', razaoSocial: razao, status: 'skipped', message: 'Lead sem documento' })
            continue
          }
          failedCount++; p.errors++
          job.logs.push({ documento: doc || '(vazio)', razaoSocial: razao, status: 'error', message: 'Documento inválido' })
          continue
        }

        try {
          let existente = await prisma.cliente.findFirst({
            where: { documento: doc, deletedAt: null, ...(empresaId ? { empresaId } : {}) },
          })

          if (opts.onlyNewFromOneclick && existente) {
            skippedCount++; p.skipped = skippedCount
            job.logs.push({ documento: doc, razaoSocial: razao, status: 'skipped', message: 'Já existe no sistema' })
            continue
          }

          if (!existente && !opts.includeNewFromOneclick && !opts.onlyNewFromOneclick) {
            skippedCount++; p.skipped = skippedCount
            job.logs.push({ documento: doc, razaoSocial: razao, status: 'skipped', message: 'Novo cliente (não marcado para incluir)' })
            continue
          }

          // Construir data de atualização a partir dos campos GER_CAD_CLI
          const data: Record<string, unknown> = {}

          if (flags.razao) {
            if (row.cad_cli_razao) data.razaoSocial = String(row.cad_cli_razao).trim()
            const fantasia = row.cad_cli_fantasia || row.cad_cli_nome_fantasia
            if (fantasia) data.nomeFantasia = String(fantasia).trim()
          }
          if (flags.comercial) {
            if (row.situacao_nome) data.situacao = this.mapSituacao(String(row.situacao_nome))
            if (row.cad_cli_tipo) data.tipoCliente = String(row.cad_cli_tipo)
            if (row.cad_cli_origem) data.origem = String(row.cad_cli_origem)
          }
          if (flags.grupo && row.grupo_nome) data.grupo = String(row.grupo_nome)
          if (flags.contato) {
            if (row.cad_cli_email) data.email = String(row.cad_cli_email).trim()
            if (row.cad_cli_tel) data.telefone = String(row.cad_cli_tel).trim()
          }
          if (flags.endereco) {
            if (row.cad_cli_end) data.logradouro = String(row.cad_cli_end)
            if (row.cad_cli_num) data.numero = String(row.cad_cli_num)
            if (row.cad_cli_bairro) data.bairro = String(row.cad_cli_bairro)
            if (row.cad_cli_complemento) data.complemento = String(row.cad_cli_complemento)
            if (row.cad_cli_cidade) data.cidade = String(row.cad_cli_cidade)
            if (row.cad_cli_estado) data.uf = String(row.cad_cli_estado)
            if (row.cad_cli_cep) data.cep = String(row.cad_cli_cep).replace(/\D/g, '')
          }
          if (flags.fiscal) {
            if (row.tributacao_nome) {
              const mapped = this.mapTributacao(String(row.tributacao_nome))
              if (mapped) data.tributacao = mapped
            }
            if (row.regime_nome) {
              const mapped = this.mapRegime(String(row.regime_nome))
              if (mapped) data.regime = mapped
            }
          }
          if (flags.registros) {
            const ie = row.cad_cli_ie || row.cad_cli_IE
            const im = row.cad_cli_im || row.cad_cli_IM
            if (ie) data.inscricaoEstadual = String(ie).trim()
            if (im) data.inscricaoMunicipal = String(im).trim()
          }
          if (flags.datas) {
            const dtEntrada = row.cad_cli_data_entrada || row.cad_cli_data_inicio || row.created_at || row.cad_cli_criado
            if (dtEntrada) {
              const d = new Date(dtEntrada as string | number)
              if (!isNaN(d.getTime())) data.dataEntrada = d
            }
            const dtSaida = row.cad_cli_data_saida || row.cad_cli_data_encerramento
            if (dtSaida) {
              const d = new Date(dtSaida as string | number)
              if (!isNaN(d.getTime())) data.dataSaida = d
            }
          }
          if (flags.areasContratadas) {
            const areas: string[] = []
            if (Number(row.cad_cli_con_con || row.cad_cli_contabil_contratado || 0) === 1) areas.push('Contabil')
            if (Number(row.cad_cli_fis_con || row.cad_cli_fiscal_contratado || 0) === 1) areas.push('Fiscal')
            if (Number(row.cad_cli_trab_con || row.cad_cli_trabalhista_contratado || row.cad_cli_dp_con || 0) === 1) areas.push('Trabalhista')
            if (Number(row.cad_cli_legal_con || row.cad_cli_legal_contratado || 0) === 1) areas.push('Legalizacao')
            if (areas.length > 0) data.areasContratadas = areas.join(';')
          }
          if (flags.particularidades) {
            const parts: string[] = []
            const parFields = [
              ['Comercial', row.cad_cli_com_par],
              ['Contábil', row.cad_cli_con_par],
              ['Fiscal', row.cad_cli_fis_par],
              ['Trabalhista', row.cad_cli_trab_par],
              ['Legal', row.cad_cli_legal_par],
              ['Legalização', row.cad_cli_leg_par],
            ]
            for (const [area, val] of parFields) {
              if (val && String(val).trim()) parts.push(`[${area}] ${String(val).trim()}`)
            }
            if (parts.length > 0) data.observacoes = parts.join('\n')
          }
          if (flags.status) {
            const ativo = Number(row.cad_cli_ativo ?? 1)
            if (ativo === 0) data.isActive = false
          }

          // Marcar como lead se detectado
          if (isLead) data.isLead = true

          if (existente) {
            if (Object.keys(data).length === 0 && !opts.force) {
              skippedCount++; p.skipped = skippedCount
              job.logs.push({ documento: doc, razaoSocial: razao, status: 'skipped', message: 'Sem dados novos para atualizar' })
              continue
            }
            await prisma.cliente.update({ where: { id: existente.id }, data: data as never })
            updated++
            p.updated++
            const label = isLead ? ' [LEAD]' : ''
            job.logs.push({ documento: doc, razaoSocial: razao, status: 'updated', message: `Campos: ${Object.keys(data).join(', ')}${label}` })
          } else {
            const newCliente = await prisma.cliente.create({
              data: {
                documento: doc,
                tipoDocumento: doc.length === 14 ? 'CNPJ' : 'CPF',
                razaoSocial: String(row.cad_cli_razao || doc),
                situacao: isLead ? 'PROSPECT' as never : 'MENSAL',
                status: 'ATIVA',
                isActive: true,
                isLead,
                ...(empresaId ? { empresaId } : {}),
                ...data,
              } as never,
            })
            if (isLead) leadsCreated++
            created++
            p.created = created
            job.logs.push({ documento: doc, razaoSocial: razao, status: 'created' })
            // Usar o ID do cliente recém-criado para imports subsequentes
            existente = newCliente as unknown as typeof existente
          }

          const clienteIdResolvido = existente?.id

          // Importar sócios se flag ativa (tabelas cad_soc + cad_soc_vin)
          if (flags.socios && clienteIdResolvido) {
            try {
              const [sociosRows] = await conn.execute(
                `SELECT s.* FROM cad_soc s
                 INNER JOIN cad_soc_vin v ON s.id = v.id_socio
                 WHERE v.cnpj_cliente = ?`, [doc]
              ) as [Array<Record<string, unknown>>, unknown]
              for (const socioRow of sociosRows) {
                const cpfSocio = String(socioRow.cpf || socioRow.cad_soc_cpf || '').replace(/\D/g, '')
                if (!cpfSocio) continue
                const existe = await prisma.socio.findFirst({
                  where: { cpf: cpfSocio, clienteId: clienteIdResolvido },
                })
                if (!existe) {
                  await prisma.socio.create({
                    data: {
                      clienteId: clienteIdResolvido,
                      nomeCompleto: String(socioRow.nome || socioRow.cad_soc_nome || ''),
                      cpf: cpfSocio,
                      tipoSocio: 'SOCIO_QUOTISTA',
                      ...(empresaId ? { empresaId } : {}),
                    },
                  })
                  sociosImportados++
                  p.socios_importados = sociosImportados
                }
              }
            } catch (e) {
              // [QA #33] não engole silenciosamente: reporta qual cliente teve
              // falha nos sócios (o cliente em si já foi importado — best-effort).
              job.logs.push({ documento: doc, razaoSocial: razao, status: 'skipped', message: `Sócios não importados: ${(e as Error).message}` })
            }
          }

          // Importar serviços contratados (áreas + responsáveis)
          if (flags.servicosContratados && clienteIdResolvido && areasMap) {
            try {
              const areasDefs = [
                { nome: 'contabil', conFlag: row.cad_cli_con_con ?? row.cad_cli_contabil_contratado, respId: row.cad_cli_res_con ?? row.cad_cli_resp_contabil ?? row.cad_cli_con_res },
                { nome: 'fiscal', conFlag: row.cad_cli_fis_con ?? row.cad_cli_fiscal_contratado, respId: row.cad_cli_res_fis ?? row.cad_cli_resp_fiscal ?? row.cad_cli_fis_res },
                { nome: 'trabalhista', conFlag: row.cad_cli_trab_con ?? row.cad_cli_trabalhista_contratado ?? row.cad_cli_dp_con, respId: row.cad_cli_res_trab ?? row.cad_cli_resp_trabalhista ?? row.cad_cli_trab_res ?? row.cad_cli_pes_res },
                { nome: 'legalizacao', conFlag: row.cad_cli_legal_con ?? row.cad_cli_legal_contratado, respId: row.cad_cli_res_legal ?? row.cad_cli_resp_legal ?? row.cad_cli_legal_res },
              ]

              for (const areaDef of areasDefs) {
                const areaId = areasMap.get(areaDef.nome)
                if (!areaId) continue

                const contratado = Number(areaDef.conFlag || 0) === 1
                let responsavelId: string | null = null
                if (areaDef.respId && Number(areaDef.respId) > 0) {
                  const user = await prisma.user.findFirst({
                    where: { idOneClick: String(areaDef.respId) },
                    select: { id: true },
                  })
                  if (user) responsavelId = user.id
                }

                await prisma.$executeRawUnsafe(
                  `INSERT INTO cliente_areas_contratadas (id, cliente_id, area_id, contratado, responsavel_id, created_at, updated_at)
                   VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
                   ON CONFLICT (cliente_id, area_id) DO UPDATE SET contratado = $3, responsavel_id = COALESCE($4, cliente_areas_contratadas.responsavel_id), updated_at = NOW()`,
                  clienteIdResolvido, areaId, contratado, responsavelId,
                )
                servicosImportados++
              }
            } catch (e) {
              // [QA #33] reporta falha nos serviços contratados sem derrubar o cliente.
              job.logs.push({ documento: doc, razaoSocial: razao, status: 'skipped', message: `Serviços não importados: ${(e as Error).message}` })
            }
          }
        } catch (e) {
          failedCount++
          p.errors++
          job.logs.push({ documento: doc, razaoSocial: razao, status: 'error', message: (e as Error).message })
        }
      }

      p.phase = 'done'
      p.message = 'Importação concluída'
      job.result = { created, updated, skipped: skippedCount, failed: failedCount, socios_importados: sociosImportados, leads_skipped: leadsSkipped, leads_created: leadsCreated, servicos_importados: servicosImportados }
    } catch (e) {
      p.phase = 'error'
      p.message = (e as Error).message
    } finally {
      conn.end().catch(() => {})
    }
  }

  // ── 6. Atualizar ID Sistema SCI (lote) ──────────────────

  async atualizarIdSistemaSciLote(
    opts: { limit: number; force: boolean },
    empresaId?: string,
  ) {
    const where: Record<string, unknown> = {
      deletedAt: null,
      tipoDocumento: 'CNPJ',
      ...(empresaId ? { empresaId } : {}),
    }
    if (!opts.force) {
      where.OR = [{ idSistema: null }, { idSistema: '' }]
    }

    const clientes = await prisma.cliente.findMany({
      where: where as never,
      select: { id: true, documento: true, razaoSocial: true, idSistema: true },
      take: opts.limit,
      orderBy: { razaoSocial: 'asc' },
    })

    const job = createJob(clientes.length)
    job.progress.phase = 'running'

    // Background
    this.processarIdSistemaSci(job, clientes, opts).catch(() => {
      job.progress.phase = 'error'
    })

    return { jobId: job.id, total: clientes.length }
  }

  private async processarIdSistemaSci(
    job: Job,
    clientes: Array<{ id: string; documento: string; razaoSocial: string; idSistema: string | null }>,
    opts: { force: boolean },
  ) {
    const p = job.progress
    let updatedCount = 0, notFound = 0, ignoredCount = 0
    const detalhes: Array<{ documento: string; status: string; idSistema?: string; anterior?: string | null }> = []

    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      p.processed = i + 1
      const doc = c.documento.replace(/\D/g, '')
      p.documento = doc
      p.step = `${i + 1}/${clientes.length}`

      if (c.idSistema && !opts.force) {
        ignoredCount++
        p.skipped = ignoredCount
        detalhes.push({ documento: doc, status: 'ignored', idSistema: c.idSistema })
        continue
      }

      try {
        const sci = await this.sciService.buscarIdSistemaPorCnpj(doc)
        if (!sci || !sci.idCliente) {
          notFound++
          detalhes.push({ documento: doc, status: 'not_found' })
          continue
        }

        const anterior = c.idSistema
        await prisma.cliente.update({
          where: { id: c.id },
          data: { idSistema: String(sci.idCliente) },
        })
        updatedCount++
        p.updated++
        detalhes.push({ documento: doc, status: 'updated', idSistema: String(sci.idCliente), anterior })
      } catch (e) {
        p.errors++
        detalhes.push({ documento: doc, status: 'error', idSistema: (e as Error).message })
      }

      await sleep(100)
    }

    p.phase = 'done'
    p.message = 'Atualização concluída'
    job.result = { total: clientes.length, updated: updatedCount, notFound, ignored: ignoredCount, errors: p.errors, detalhes: detalhes.slice(0, 50) }
  }

  // ── 7. Atualizar ReceitaWS (lote com job) ───────────────

  async receitawsPreview(filtros: Record<string, string>, empresaId?: string) {
    const total = await prisma.cliente.count({
      where: {
        deletedAt: null,
        tipoDocumento: 'CNPJ',
        ...(empresaId ? { empresaId } : {}),
        ...this.buildFiltrosWhere(filtros),
      },
    })
    return { total }
  }

  async receitawsIniciarJob(filtros: Record<string, string>, empresaId?: string) {
    const clientes = await prisma.cliente.findMany({
      where: {
        deletedAt: null,
        tipoDocumento: 'CNPJ',
        ...(empresaId ? { empresaId } : {}),
        ...this.buildFiltrosWhere(filtros),
      },
      select: { id: true, documento: true, razaoSocial: true },
      orderBy: { razaoSocial: 'asc' },
    })

    const job = createJob(clientes.length)
    job.progress.phase = 'running'

    this.processarReceitaWs(job, clientes).catch(() => {
      job.progress.phase = 'error'
    })

    return { jobId: job.id, total: clientes.length, delaySeconds: 20 }
  }

  private async processarReceitaWs(
    job: Job,
    clientes: Array<{ id: string; documento: string; razaoSocial: string }>,
  ) {
    const p = job.progress

    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      p.processed = i + 1
      const doc = c.documento.replace(/\D/g, '')
      p.documento = doc
      p.step = `${i + 1}/${clientes.length}`

      const remaining = clientes.length - i - 1
      const etaSeconds = remaining * 20
      p.eta_human = etaSeconds > 60 ? `${Math.floor(etaSeconds / 60)}min ${etaSeconds % 60}s` : `${etaSeconds}s`

      try {
        // ReceitaWS consulta via BrasilAPI (gratuita, ~20s entre chamadas)
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, {
          headers: { 'User-Agent': 'OneClick-ERP/1.0' },
        })

        if (!res.ok) {
          p.errors++
          p.message = `Erro HTTP ${res.status} para ${doc}`
          if (i < clientes.length - 1) await sleep(20_000)
          continue
        }

        const dados = await res.json() as Record<string, unknown>

        // Atualizar cliente com dados da ReceitaWS
        const updateData: Record<string, unknown> = {}
        if (dados.razao_social) updateData.razaoSocial = String(dados.razao_social)
        if (dados.nome_fantasia) updateData.nomeFantasia = String(dados.nome_fantasia)
        if (dados.email && String(dados.email).includes('@')) updateData.email = String(dados.email)
        if (dados.ddd_telefone_1) updateData.telefone = String(dados.ddd_telefone_1)
        if (dados.cep) updateData.cep = String(dados.cep).replace(/\D/g, '')
        if (dados.logradouro) updateData.logradouro = String(dados.logradouro)
        if (dados.numero) updateData.numero = String(dados.numero)
        if (dados.complemento) updateData.complemento = String(dados.complemento)
        if (dados.bairro) updateData.bairro = String(dados.bairro)
        if (dados.municipio) updateData.cidade = String(dados.municipio)
        if (dados.uf) updateData.uf = String(dados.uf)

        if (Object.keys(updateData).length > 0) {
          await prisma.cliente.update({ where: { id: c.id }, data: updateData as never })
          p.updated++
        }
        p.message = `Atualizado: ${c.razaoSocial}`
      } catch {
        p.errors++
      }

      if (i < clientes.length - 1) await sleep(20_000)
    }

    p.phase = 'done'
    p.message = 'Atualização ReceitaWS concluída'
    job.result = { total: clientes.length, updated: p.updated, errors: p.errors }
  }

  // ── 8. Atualizar SERPRO CNPJ (lote com job) ─────────────

  async serproCnpjPreview(filtros: Record<string, string>, empresaId?: string) {
    const total = await prisma.cliente.count({
      where: {
        deletedAt: null,
        tipoDocumento: 'CNPJ',
        ...(empresaId ? { empresaId } : {}),
        ...this.buildFiltrosWhere(filtros),
      },
    })
    return { total }
  }

  async serproCnpjIniciarJob(
    filtros: Record<string, string>,
    optsJob: { atualizarSocios?: boolean; forceSocios?: boolean },
    empresaId?: string,
  ) {
    const clientes = await prisma.cliente.findMany({
      where: {
        deletedAt: null,
        tipoDocumento: 'CNPJ',
        ...(empresaId ? { empresaId } : {}),
        ...this.buildFiltrosWhere(filtros),
      },
      select: { id: true, documento: true, razaoSocial: true },
      orderBy: { razaoSocial: 'asc' },
    })

    const job = createJob(clientes.length)
    job.progress.phase = 'running'

    this.processarSerproCnpj(job, clientes, optsJob, empresaId).catch(() => {
      job.progress.phase = 'error'
    })

    return { jobId: job.id, total: clientes.length, delaySeconds: 1 }
  }

  private async processarSerproCnpj(
    job: Job,
    clientes: Array<{ id: string; documento: string; razaoSocial: string }>,
    optsJob: { atualizarSocios?: boolean; forceSocios?: boolean },
    empresaId?: string,
  ) {
    const p = job.progress

    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      p.processed = i + 1
      const doc = c.documento.replace(/\D/g, '')
      p.documento = doc
      p.step = `${i + 1}/${clientes.length}`

      const remaining = clientes.length - i - 1
      p.eta_human = `${remaining}s`

      try {
        const dados = await this.cnpjService.consultarCnpj(doc)

        // Atualizar dados cadastrais
        const updateData: Record<string, unknown> = {}
        if (dados.razaoSocial) updateData.razaoSocial = dados.razaoSocial
        if (dados.nomeFantasia) updateData.nomeFantasia = dados.nomeFantasia
        if (dados.cep) updateData.cep = dados.cep
        if (dados.logradouro) updateData.logradouro = dados.logradouro
        if (dados.numero) updateData.numero = dados.numero
        if (dados.complemento) updateData.complemento = dados.complemento
        if (dados.bairro) updateData.bairro = dados.bairro
        if (dados.municipio) updateData.cidade = dados.municipio
        if (dados.uf) updateData.uf = dados.uf

        if (Object.keys(updateData).length > 0) {
          await prisma.cliente.update({ where: { id: c.id }, data: updateData as never })
          p.updated++
        }

        // Importar sócios se configurado
        if (optsJob.atualizarSocios && dados.qsa?.length > 0) {
          for (const qsa of dados.qsa) {
            const cpfSocio = (qsa.cpfCnpj || '').replace(/\D/g, '')
            if (!cpfSocio) continue

            const existe = await prisma.socio.findFirst({
              where: { cpf: cpfSocio, clienteId: c.id },
            })

            if (optsJob.forceSocios && existe) {
              await prisma.socio.delete({ where: { id: existe.id } })
            }

            if (!existe || optsJob.forceSocios) {
              await prisma.socio.create({
                data: {
                  clienteId: c.id,
                  nomeCompleto: qsa.nome,
                  cpf: cpfSocio,
                  tipoSocio: this.mapQualificacaoSocio(qsa.codigoQualificacao),
                  dataEntrada: qsa.dataEntrada ? new Date(qsa.dataEntrada) : null,
                  ...(empresaId ? { empresaId } : {}),
                },
              })
              p.socios_importados = (p.socios_importados || 0) + 1
            }
          }
        }

        p.message = `Atualizado: ${c.razaoSocial}`
      } catch {
        p.errors++
      }

      if (i < clientes.length - 1) await sleep(1200)
    }

    p.phase = 'done'
    p.message = 'Atualização SERPRO CNPJ concluída'
    job.result = { total: clientes.length, updated: p.updated, errors: p.errors, socios_importados: p.socios_importados || 0 }
  }

  // ── Helpers ──────────────────────────────────────────────

  private buildFiltrosWhere(filtros: Record<string, string>): Record<string, unknown> {
    const where: Record<string, unknown> = {}
    if (filtros.situacao) where.situacao = filtros.situacao
    if (filtros.estado) where.uf = filtros.estado
    if (filtros.municipio) where.cidade = { contains: filtros.municipio, mode: 'insensitive' }
    if (filtros.tributacao) where.tributacao = filtros.tributacao
    if (filtros.numero) where.documento = { contains: filtros.numero.replace(/\D/g, '') }
    return where
  }

  private mapSituacao(s: string): string {
    const map: Record<string, string> = {
      'MENSAL': 'MENSAL', 'EM CONSTITUIÇÃO': 'EM_CONSTITUICAO', 'EM CONSTITUICAO': 'EM_CONSTITUICAO',
      'POTENCIAL': 'POTENCIAL', 'AVULSO': 'AVULSO', 'PARALIZADO': 'PARALIZADO',
      'PRÉ OPERACIONAL': 'PRE_OPERACIONAL', 'PRE OPERACIONAL': 'PRE_OPERACIONAL', 'PROSPECT': 'PROSPECT',
    }
    return map[s.toUpperCase()] || 'MENSAL'
  }

  private mapTributacao(t: string): string | null {
    const map: Record<string, string> = {
      'SIMPLES NACIONAL': 'SIMPLES_NACIONAL', 'LUCRO PRESUMIDO': 'LUCRO_PRESUMIDO',
      'LUCRO REAL': 'LUCRO_REAL', 'MEI': 'MEI',
      'IMUNE': 'IMUNE', 'ISENTA': 'ISENTA', 'ISENTO': 'ISENTA',
    }
    return map[t.toUpperCase()] || null
  }

  private mapRegime(r: string): string | null {
    const map: Record<string, string> = { 'CAIXA': 'CAIXA', 'COMPETÊNCIA': 'COMPETENCIA', 'COMPETENCIA': 'COMPETENCIA' }
    return map[r.toUpperCase()] || null
  }

  private mapQualificacaoSocio(codigo: number) {
    const map: Record<number, 'SOCIO_ADMINISTRADOR' | 'SOCIO_DIRETOR' | 'REPRESENTANTE_LEGAL' | 'SOCIO_QUOTISTA' | 'TITULAR'> = {
      5: 'SOCIO_ADMINISTRADOR', 10: 'SOCIO_DIRETOR', 16: 'REPRESENTANTE_LEGAL',
      22: 'SOCIO_QUOTISTA', 49: 'SOCIO_ADMINISTRADOR', 54: 'TITULAR',
    }
    return map[codigo] || ('SOCIO_QUOTISTA' as const)
  }
}
