import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as mysql from 'mysql2/promise'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { encryptPassword, serializeCipher, sha256Hex } from './crypto.helper'
import { parsePfx, type PfxInfo } from './pfx-parser'
import { CertificadoDigitalService } from './certificado-digital.service'

const STORAGE_ROOT = path.resolve(process.cwd(), 'uploads', 'certificados')

// Base UNC dos uploads do legado (servidor SMB).
const LEGACY_UPLOADS_BASE = process.env.LEGACY_UPLOADS_BASE || '\\\\192.168.0.7\\wwwroot\\files'

/** Lista candidatos de caminhos absolutos a tentar, em ordem de prioridade. */
function resolveLegacyPathCandidates(caminho: string, nomeArquivo: string, nomeOriginal: string): string[] {
  const candidates: string[] = []
  // 1. V1 simples: \\192.168.0.7\wwwroot\files\clientes\<nome_original>
  if (nomeOriginal) candidates.push(path.join(LEGACY_UPLOADS_BASE, 'clientes', nomeOriginal))
  // 2. V1 simples com nome_arquivo
  if (nomeArquivo && nomeArquivo !== nomeOriginal) candidates.push(path.join(LEGACY_UPLOADS_BASE, 'clientes', nomeArquivo))
  // 3. SERPRO2 estrutura: caminho da DB sem o "/uploads/" inicial
  const rel = (caminho || '').replace(/^\/+/, '').replace(/^uploads\//, '')
  if (rel) candidates.push(path.join(LEGACY_UPLOADS_BASE, rel.replace(/\//g, '\\')))
  return candidates
}

/** Tenta ler o PFX testando vários caminhos candidatos. Retorna {buffer, path} ou lança erro. */
async function tryReadLegacyPfx(candidates: string[]): Promise<{ buffer: Buffer; path: string }> {
  const errors: string[] = []
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p)
      return { buffer: buf, path: p }
    } catch (e) {
      errors.push(`  - "${p}": ${(e as Error).message}`)
    }
  }
  throw new Error(`Nenhum caminho funcionou. Tentados:\n${errors.join('\n')}`)
}

/**
 * Strip HTML e entities da descricao do CKEditor.
 * O legado salva senhas em HTML (ex: "<p>290212</p>"). Extrai o texto puro.
 */
function stripHtmlSenha(raw: string | null): string | null {
  if (!raw) return null
  let txt = String(raw)
  // Remove tags HTML
  txt = txt.replace(/<[^>]+>/g, ' ')
  // Decodifica entities comuns
  txt = txt.replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
  return txt.trim() || null
}

interface LegacyCertRow {
  id: number
  id_cliente: number
  id_empresa: number | null
  arquivo: string         // nome físico no disk
  nomeOriginal: string    // nome original do upload
  caminho: string         // path tipo "/uploads/xxx/yyy.pfx"
  descricao: string | null  // notas
  senha: string | null    // notas duplicado (pode conter senha)
  dt_vencimento: string | null
  dt_registro: string | null
  cnpj: string | null
  razao: string | null
}

export interface PreviewItem {
  legacyId: number
  arquivoNome: string
  caminhoLegado: string  // path absoluto SMB resolvido
  cnpjLegado: string | null
  razaoLegado: string | null
  dtVencimento: string | null
  status: 'ok' | 'cliente_nao_encontrado' | 'senha_invalida' | 'arquivo_nao_encontrado' | 'ja_importado' | 'pfx_invalido' | 'vencido'
  vincularA: 'cliente' | 'empresa' | null  // tipo do vínculo quando ok
  mensagem: string
  // Dados resolvidos quando status = ok
  clienteIdNovo?: string
  clienteRazao?: string
  pfxInfo?: PfxInfo
  senhaUsada?: string  // só pra debug — não retornado em produção
  // Detalhes do arquivo no legado — levados pras observações do certificado no v2
  descricaoLegado?: string   // notas/descrição (ex: "SENHA: wiz314181")
  nomeArquivoLegado?: string // nome original do arquivo no legado
}

interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

interface JobState {
  empresaId: string
  fase: 'conectando' | 'lendo_legado' | 'processando' | 'importando' | 'done' | 'error'
  total: number
  processed: number
  logs: LogEntry[]
  result?: { items: PreviewItem[]; total: number; ok: number; erros: number }
  importResult?: { total: number; importados: number; pulados: number }
  error?: string
  createdAt: number
}

@Injectable()
export class LegacyImportCertService {
  // Store em memória por jobId — limpo após X minutos de done/error
  private jobs = new Map<string, JobState>()
  private static readonly TTL_MS = 30 * 60 * 1000  // 30 min após conclusão

  constructor(private readonly certService: CertificadoDigitalService) {}

  private cleanup() {
    const now = Date.now()
    for (const [id, job] of this.jobs.entries()) {
      if ((job.fase === 'done' || job.fase === 'error') && now - job.createdAt > LegacyImportCertService.TTL_MS) {
        this.jobs.delete(id)
      }
    }
  }

  private log(jobId: string, level: LogEntry['level'], message: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.logs.push({ ts: Date.now(), level, message })
    // Trunca histórico se passar de 500 entradas (proteção)
    if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500)
  }

  // ── API pública: progress ──────────────────────────────

  /** Cria um job de preview e dispara processamento em background. Retorna jobId. */
  startPreview(empresaId: string): { jobId: string } {
    this.cleanup()
    const jobId = randomUUID()
    this.jobs.set(jobId, {
      empresaId,
      fase: 'conectando',
      total: 0,
      processed: 0,
      logs: [],
      createdAt: Date.now(),
    })
    // Fire-and-forget — frontend acompanha via getProgress
    this.executarPreview(jobId).catch((e: Error) => {
      const job = this.jobs.get(jobId)
      if (job) {
        job.fase = 'error'
        job.error = e.message
        this.log(jobId, 'error', `Erro fatal: ${e.message}`)
      }
    })
    return { jobId }
  }

  /** Polled pelo frontend pra exibir progresso e logs em tempo real. */
  getProgress(jobId: string): JobState | null {
    return this.jobs.get(jobId) ?? null
  }

  /** Após preview pronto, executa importação efetiva (mesmo job). */
  startImport(jobId: string, userId?: string): { jobId: string } {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('Job não encontrado.')
    if (job.fase !== 'done' || !job.result) throw new Error('Preview ainda não concluído.')
    job.fase = 'importando'
    job.processed = 0
    this.log(jobId, 'info', 'Iniciando importação efetiva...')
    this.executarImportacao(jobId, userId).catch((e: Error) => {
      job.fase = 'error'
      job.error = e.message
      this.log(jobId, 'error', `Erro na importação: ${e.message}`)
    })
    return { jobId }
  }

  // ── Execução em background (preview) ───────────────────

  private async executarPreview(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    const { empresaId } = job

    this.log(jobId, 'info', 'Conectando ao MySQL legado...')
    let conn: mysql.Connection
    try {
      conn = await this.getLegacyConnection()
      this.log(jobId, 'success', 'Conectado.')
    } catch (e) {
      job.fase = 'error'
      job.error = (e as Error).message
      this.log(jobId, 'error', `Falha ao conectar no legado: ${(e as Error).message}`)
      return
    }

    try {
      job.fase = 'lendo_legado'

      // Diagnóstico: lista tabelas da base que parecem conter arquivos/certs
      try {
        const [tabelasRows] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT table_name AS t, table_rows AS rows
           FROM information_schema.tables
           WHERE table_schema = DATABASE()
             AND (table_name LIKE '%arquiv%' OR table_name LIKE '%cli_files%' OR table_name LIKE '%cert%' OR table_name LIKE '%file%')
           ORDER BY table_rows DESC`,
        )
        if (tabelasRows.length > 0) {
          this.log(jobId, 'info', `Tabelas candidatas: ${tabelasRows.map((r: any) => `${r.t}(~${r.rows})`).join(', ')}`)
        }
      } catch { /* ignore */ }

      // Conta totais separados pra cada filtro candidato
      try {
        const [c1] = await conn.execute<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM clientes_arquivos`)
        const [c2] = await conn.execute<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM clientes_arquivos WHERE is_certificado = 1`)
        this.log(jobId, 'info', `clientes_arquivos: ${(c1[0] as any).n} total, ${(c2[0] as any).n} com is_certificado=1`)
      } catch (e) {
        this.log(jobId, 'warn', `clientes_arquivos: ${(e as Error).message}`)
      }
      try {
        const [c3] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) AS n FROM cad_cli_files a INNER JOIN ger_cad_cli b ON a.id_cliente = b.id WHERE a.tipo = '6' AND a.ativo = 1 AND b.cad_cli_ativo = 1`
        )
        this.log(jobId, 'info', `cad_cli_files com tipo=6, ativo=1 e cliente ativo: ${(c3[0] as any).n}`)
      } catch (e) {
        this.log(jobId, 'info', `cad_cli_files: tabela não existe ou erro (${(e as Error).message.substring(0, 60)})`)
      }

      // Detecta qual schema está disponível
      let schemaUsado: 'v1' | 'serpro2' | null = null
      try {
        await conn.execute('SELECT 1 FROM cad_cli_files LIMIT 1')
        schemaUsado = 'v1'
      } catch {
        try {
          await conn.execute('SELECT 1 FROM clientes_arquivos LIMIT 1')
          schemaUsado = 'serpro2'
        } catch {
          throw new Error('Nem cad_cli_files (V1) nem clientes_arquivos (SERPRO2) foram encontradas no banco conectado.')
        }
      }

      let certs: LegacyCertRow[] = []
      if (schemaUsado === 'v1') {
        this.log(jobId, 'info', 'Schema detectado: OneClick V1 (cad_cli_files + ger_cad_cli)')
        this.log(jobId, 'info', 'Lendo cad_cli_files (tipo=6, ativo=1) com cliente ativo (cad_cli_ativo=1)...')
        const [rows] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT a.id,
                  a.id_cliente      AS id_cliente,
                  a.id_empresa      AS id_empresa,
                  a.arquivo         AS arquivo,
                  a.arquivo         AS nomeOriginal,
                  ''                AS caminho,
                  a.descricao       AS descricao,
                  a.descricao       AS senha,
                  a.dt_vencimento   AS dt_vencimento,
                  a.dt_registro     AS dt_registro,
                  b.cad_cli_cnpj    AS cnpj,
                  b.cad_cli_razao   AS razao
           FROM cad_cli_files a
           INNER JOIN ger_cad_cli b ON a.id_cliente = b.id
           WHERE a.tipo = '6' AND a.ativo = 1 AND b.cad_cli_ativo = 1`,
        )
        certs = rows as unknown as LegacyCertRow[]
      } else {
        this.log(jobId, 'info', 'Schema detectado: SERPRO2 (clientes_arquivos + clientes)')
        this.log(jobId, 'info', 'Lendo clientes_arquivos com is_certificado=1...')
        const [rows] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT a.id,
                  a.cliente_id      AS id_cliente,
                  a.empresa_id      AS id_empresa,
                  a.nome_arquivo    AS arquivo,
                  a.nome_original   AS nomeOriginal,
                  a.caminho         AS caminho,
                  a.notas           AS descricao,
                  a.notas           AS senha,
                  a.cert_not_after  AS dt_vencimento,
                  a.criado_em       AS dt_registro,
                  b.documento       AS cnpj,
                  b.razao_social    AS razao
           FROM clientes_arquivos a
           INNER JOIN clientes b ON a.cliente_id = b.id
           WHERE a.is_certificado = 1`,
        )
        certs = rows as unknown as LegacyCertRow[]
      }

      // Limpa HTML da senha (CKEditor salva em <p>...</p>)
      for (const c of certs) {
        c.senha = stripHtmlSenha(c.senha)
        c.descricao = stripHtmlSenha(c.descricao)
      }

      job.total = certs.length
      this.log(jobId, 'success', `${certs.length} certificado(s) encontrado(s) no legado.`)

      // Pre-carrega clientes do novo sistema
      this.log(jobId, 'info', 'Carregando clientes da empresa selecionada...')
      const clientesNovos = await prisma.cliente.findMany({
        where: { empresaId, deletedAt: null },
        select: { id: true, documento: true, razaoSocial: true },
      })
      const byCnpj = new Map<string, typeof clientesNovos[0]>()
      const byRazao = new Map<string, typeof clientesNovos[0]>()
      for (const c of clientesNovos) {
        if (c.documento) byCnpj.set(c.documento.replace(/\D/g, ''), c)
        if (c.razaoSocial) byRazao.set(c.razaoSocial.toLowerCase().trim(), c)
      }
      this.log(jobId, 'success', `${clientesNovos.length} cliente(s) carregado(s).`)

      // Pre-carrega a própria empresa (cert pode ser da empresa-mãe, não de um cliente)
      this.log(jobId, 'info', 'Carregando empresa selecionada...')
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { id: true, cnpj: true, razaoSocial: true },
      })
      const empresaPorCnpj = new Map<string, { id: string; razaoSocial: string | null }>()
      if (empresa?.cnpj) {
        empresaPorCnpj.set(empresa.cnpj.replace(/\D/g, ''), {
          id: empresa.id,
          razaoSocial: empresa.razaoSocial,
        })
        this.log(jobId, 'success', `Empresa "${empresa.razaoSocial}" (${empresa.cnpj}) carregada.`)
      } else {
        this.log(jobId, 'warn', 'Empresa selecionada sem CNPJ cadastrado.')
      }

      const certsExistentes = await prisma.certificadoDigital.findMany({
        where: { empresaId },
        select: { numeroSerie: true },
      })
      const seriesExistentes = new Set(certsExistentes.map(c => c.numeroSerie).filter((s): s is string => !!s))
      if (seriesExistentes.size > 0) {
        this.log(jobId, 'info', `${seriesExistentes.size} certificado(s) já presentes no novo sistema (serão ignorados).`)
      }

      job.fase = 'processando'
      const items: PreviewItem[] = []
      for (let i = 0; i < certs.length; i++) {
        const row = certs[i]!
        this.log(jobId, 'info', `[${i + 1}/${certs.length}] ${row.razao || row.cnpj || row.arquivo}`)
        this.log(jobId, 'info', `    DB.caminho: "${row.caminho}" | DB.arquivo: "${row.arquivo}"`)

        // Blinda contra exceções inesperadas em processarItem — o erro num item NUNCA pode parar o lote
        let item: PreviewItem
        try {
          item = await this.processarItem(row, byCnpj, byRazao, empresaPorCnpj, seriesExistentes, empresaId, jobId)
        } catch (e) {
          this.log(jobId, 'error', `  ✗ Erro inesperado processando item: ${(e as Error).message}`)
          item = {
            legacyId: row.id,
            arquivoNome: row.arquivo,
            caminhoLegado: '',
            cnpjLegado: row.cnpj,
            razaoLegado: row.razao,
            dtVencimento: row.dt_vencimento,
            status: 'pfx_invalido',
            vincularA: null,
            mensagem: `Erro inesperado: ${(e as Error).message}`,
          }
        }
        items.push(item)
        job.processed = i + 1

        // Log do resultado
        if (item.status === 'ok') {
          const tipo = item.vincularA === 'empresa' ? 'EMPRESA' : 'cliente'
          const expirado = item.pfxInfo && item.pfxInfo.expiraEm < new Date()
          const sufixo = expirado ? ` ⏰ VENCIDO em ${item.pfxInfo!.expiraEm.toLocaleDateString('pt-BR')}` : ''
          this.log(jobId, 'success', `  ✓ ${item.pfxInfo?.titular} → ${tipo} ${item.clienteRazao}${sufixo}`)
        } else if (item.status === 'cliente_nao_encontrado') {
          this.log(jobId, 'warn', `  ⚠ Cliente não encontrado: ${item.cnpjLegado || item.razaoLegado}`)
        } else if (item.status === 'senha_invalida') {
          this.log(jobId, 'warn', `  ⚠ Senha não funcionou (tentadas ${this.gerarCandidatosSenha(row).length} variações)`)
        } else if (item.status === 'arquivo_nao_encontrado') {
          this.log(jobId, 'error', `  ✗ Arquivo não acessível: ${item.caminhoLegado}`)
          this.log(jobId, 'error', `    Detalhe: ${item.mensagem}`)
        } else if (item.status === 'ja_importado') {
          this.log(jobId, 'info', `  → Já importado (mesmo número de série)`)
        } else if (item.status === 'vencido') {
          this.log(jobId, 'warn', `  ⏰ Vencido — ${item.pfxInfo?.expiraEm.toLocaleDateString('pt-BR')}`)
        } else if (item.status === 'pfx_invalido') {
          this.log(jobId, 'error', `  ✗ ${item.mensagem}`)
        }
      }

      const ok = items.filter(i => i.status === 'ok').length
      const erros = items.length - ok
      job.result = { items, total: items.length, ok, erros }
      job.fase = 'done'
      this.log(jobId, 'success', `Análise concluída: ${ok} prontos para importar, ${erros} com problemas.`)
    } finally {
      await conn.end().catch(() => null)
    }
  }

  // ── Execução em background (import) ────────────────────

  private async executarImportacao(jobId: string, userId?: string) {
    const job = this.jobs.get(jobId)
    if (!job?.result) return
    const items = job.result.items
    const validos = items.filter(i => i.status === 'ok')
    job.total = validos.length
    job.processed = 0
    let importados = 0

    for (const item of validos) {
      this.log(jobId, 'info', `Importando ${item.pfxInfo?.titular}...`)
      try {
        if (!item.pfxInfo || !item.clienteIdNovo || !item.senhaUsada) continue
        const pfxBuffer = await fs.readFile(item.caminhoLegado)
        const arquivoHash = sha256Hex(pfxBuffer)

        const cipher = encryptPassword(item.senhaUsada)
        const senhaCifrada = serializeCipher(cipher)

        const created = await prisma.certificadoDigital.create({
          data: {
            clienteId: item.vincularA === 'cliente' ? item.clienteIdNovo : null,
            empresaId: item.vincularA === 'empresa' ? item.clienteIdNovo : job.empresaId,
            tipo: 'A1',
            titular: item.pfxInfo.titular,
            documento: item.pfxInfo.documento,
            numeroSerie: item.pfxInfo.numeroSerie,
            emissor: item.pfxInfo.emissor,
            emitidoEm: item.pfxInfo.emitidoEm,
            expiraEm: item.pfxInfo.expiraEm,
            status: item.pfxInfo.expiraEm < new Date() ? 'EXPIRADO' : 'ATIVO',
            senhaCifrada,
            arquivoHash,
            observacoes: this.montarObservacoesImport(item),
            createdBy: userId || null,
          },
        })

        const dir = path.join(STORAGE_ROOT, job.empresaId.replace(/[^a-z0-9_-]/gi, '_'))
        await fs.mkdir(dir, { recursive: true })
        const destPath = path.join(dir, `${created.id}.pfx`)
        await fs.writeFile(destPath, pfxBuffer, { mode: 0o600 })
        const arquivoPath = path.relative(STORAGE_ROOT, destPath).replace(/\\/g, '/')

        await prisma.certificadoDigital.update({
          where: { id: created.id },
          data: { arquivoPath },
        })

        await prisma.certificadoDigitalAcesso.create({
          data: {
            certificadoId: created.id,
            userId: userId || null,
            acao: 'cadastrado',
            detalhes: `Importado do OneClick V1 (legacyId=${item.legacyId})`,
          },
        }).catch(() => null)

        importados++
        this.log(jobId, 'success', `  ✓ ${item.pfxInfo.titular} importado.`)
      } catch (e) {
        this.log(jobId, 'error', `  ✗ Erro: ${(e as Error).message}`)
      }
      job.processed++
    }

    job.importResult = { total: validos.length, importados, pulados: validos.length - importados }
    job.fase = 'done'
    this.log(jobId, 'success', `Importação concluída: ${importados} de ${validos.length} importado(s).`)

    // Atualiza sino de notificações em background
    if (importados > 0) {
      this.certService.notificarVencimentos()
        .then(r => this.log(jobId, 'info', `Sino atualizado: ${r.notificados} notificação(ões) criada(s).`))
        .catch(e => console.error('[LegacyImport] notificarVencimentos:', e.message))
    }
  }

  // ── Conexão MySQL ──────────────────────────────────────

  /**
   * Lê credenciais do OneClick V1 de Configurações → Banco de Dados → OneClick v1
   * (keys OCK_V1_DB_*). Fallback pras env vars OCK_V1_DB_* e por último as
   * antigas LEGACY_DB_* (compat com setup local SERPRO2).
   */
  private async getLegacyConnection() {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['OCK_V1_DB_HOST', 'OCK_V1_DB_PORT', 'OCK_V1_DB_USER', 'OCK_V1_DB_PASSWORD', 'OCK_V1_DB_NAME'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const host = map.get('OCK_V1_DB_HOST') || process.env.OCK_V1_DB_HOST || process.env.LEGACY_DB_HOST
    const port = Number(map.get('OCK_V1_DB_PORT') || process.env.OCK_V1_DB_PORT || process.env.LEGACY_DB_PORT || 3306)
    const user = map.get('OCK_V1_DB_USER') || process.env.OCK_V1_DB_USER || process.env.LEGACY_DB_USER
    const password = map.get('OCK_V1_DB_PASSWORD') || process.env.OCK_V1_DB_PASSWORD || process.env.LEGACY_DB_PASSWORD || ''
    const database = map.get('OCK_V1_DB_NAME') || process.env.OCK_V1_DB_NAME || process.env.LEGACY_DB_NAME

    if (!host || !user || !database) {
      throw new Error('Conexão com o banco OneClick V1 não configurada. Configure em Configurações → Banco de Dados → OneClick v1.')
    }

    return mysql.createConnection({
      host, user, password, database, port,
      charset: 'utf8mb4',
      connectTimeout: 10000,
    })
  }

  /**
   * Lista os certificados do legado com status de cada um. NÃO grava nada.
   * Master decide quais importar baseado no preview.
   */
  async preview(empresaId: string): Promise<{ items: PreviewItem[]; total: number; ok: number; erros: number }> {
    const conn = await this.getLegacyConnection()
    const items: PreviewItem[] = []

    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT a.id,
                a.cliente_id      AS id_cliente,
                a.empresa_id      AS id_empresa,
                a.nome_arquivo    AS arquivo,
                a.nome_original   AS nomeOriginal,
                a.caminho         AS caminho,
                a.notas           AS descricao,
                a.notas           AS senha,
                a.cert_not_after  AS dt_vencimento,
                a.criado_em       AS dt_registro,
                b.documento       AS cnpj,
                b.razao_social    AS razao
         FROM clientes_arquivos a
         INNER JOIN clientes b ON a.cliente_id = b.id
         WHERE a.is_certificado = 1`,
      )
      const certs = rows as unknown as LegacyCertRow[]

      // Pre-carrega clientes do novo sistema da empresa
      const clientesNovos = await prisma.cliente.findMany({
        where: { empresaId, deletedAt: null },
        select: { id: true, documento: true, razaoSocial: true },
      })
      const byCnpj = new Map<string, typeof clientesNovos[0]>()
      const byRazao = new Map<string, typeof clientesNovos[0]>()
      for (const c of clientesNovos) {
        if (c.documento) byCnpj.set(c.documento.replace(/\D/g, ''), c)
        if (c.razaoSocial) byRazao.set(c.razaoSocial.toLowerCase().trim(), c)
      }

      // Pre-carrega numerosSerie já importados pra dedupe
      const certsExistentes = await prisma.certificadoDigital.findMany({
        where: { empresaId },
        select: { numeroSerie: true },
      })
      const seriesExistentes = new Set(certsExistentes.map(c => c.numeroSerie).filter((s): s is string => !!s))

      // Pre-carrega a própria empresa (cert pode ser do escritório)
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { id: true, cnpj: true, razaoSocial: true },
      })
      const empresaPorCnpj = new Map<string, { id: string; razaoSocial: string | null }>()
      if (empresa?.cnpj) {
        empresaPorCnpj.set(empresa.cnpj.replace(/\D/g, ''), { id: empresa.id, razaoSocial: empresa.razaoSocial })
      }

      for (const row of certs) {
        const item = await this.processarItem(row, byCnpj, byRazao, empresaPorCnpj, seriesExistentes, empresaId, '')
        items.push(item)
      }

      const ok = items.filter(i => i.status === 'ok').length
      const erros = items.length - ok
      return { items, total: items.length, ok, erros }
    } finally {
      await conn.end()
    }
  }

  /**
   * Faz a importação efetiva — só processa items com status 'ok' do preview.
   */
  async importar(empresaId: string, userId?: string): Promise<{
    total: number
    importados: number
    pulados: number
    log: PreviewItem[]
  }> {
    const { items } = await this.preview(empresaId)
    let importados = 0

    for (const item of items) {
      if (item.status !== 'ok' || !item.pfxInfo || !item.clienteIdNovo || !item.senhaUsada) continue
      try {
        // Lê o arquivo PFX novamente (o preview já validou)
        const pfxBuffer = await fs.readFile(item.caminhoLegado)
        const arquivoHash = sha256Hex(pfxBuffer)

        // Cifra a senha com nossa KEK
        const cipher = encryptPassword(item.senhaUsada)
        const senhaCifrada = serializeCipher(cipher)

        // Cria registro
        const created = await prisma.certificadoDigital.create({
          data: {
            clienteId: item.vincularA === 'cliente' ? item.clienteIdNovo : null,
            empresaId: item.vincularA === 'empresa' ? item.clienteIdNovo : empresaId,
            tipo: 'A1',
            titular: item.pfxInfo.titular,
            documento: item.pfxInfo.documento,
            numeroSerie: item.pfxInfo.numeroSerie,
            emissor: item.pfxInfo.emissor,
            emitidoEm: item.pfxInfo.emitidoEm,
            expiraEm: item.pfxInfo.expiraEm,
            status: item.pfxInfo.expiraEm < new Date() ? 'EXPIRADO' : 'ATIVO',
            senhaCifrada,
            arquivoHash,
            observacoes: this.montarObservacoesImport(item),
            createdBy: userId || null,
          },
        })

        // Copia arquivo pra storage do novo sistema
        const dir = path.join(STORAGE_ROOT, empresaId.replace(/[^a-z0-9_-]/gi, '_'))
        await fs.mkdir(dir, { recursive: true })
        const destPath = path.join(dir, `${created.id}.pfx`)
        await fs.writeFile(destPath, pfxBuffer, { mode: 0o600 })
        const arquivoPath = path.relative(STORAGE_ROOT, destPath).replace(/\\/g, '/')

        await prisma.certificadoDigital.update({
          where: { id: created.id },
          data: { arquivoPath },
        })

        // Audit
        await prisma.certificadoDigitalAcesso.create({
          data: {
            certificadoId: created.id,
            userId: userId || null,
            acao: 'cadastrado',
            detalhes: `Importado do OneClick V1 (legacyId=${item.legacyId})`,
          },
        }).catch(() => null)

        importados++
      } catch (e) {
        item.status = 'pfx_invalido'
        item.mensagem = `Falha na importação: ${(e as Error).message}`
      }
    }

    return {
      total: items.length,
      importados,
      pulados: items.length - importados,
      log: items,
    }
  }

  // ── Processamento de um item (preview) ────────────────────

  private async processarItem(
    row: LegacyCertRow,
    byCnpj: Map<string, { id: string; documento: string | null; razaoSocial: string | null }>,
    byRazao: Map<string, { id: string; documento: string | null; razaoSocial: string | null }>,
    empresaPorCnpj: Map<string, { id: string; razaoSocial: string | null }>,
    seriesExistentes: Set<string>,
    empresaId: string,
    jobId: string,
  ): Promise<PreviewItem> {
    const candidates = resolveLegacyPathCandidates(row.caminho, row.arquivo, row.nomeOriginal)
    const base: PreviewItem = {
      legacyId: row.id,
      arquivoNome: row.arquivo,
      caminhoLegado: candidates[0] ?? '',
      cnpjLegado: row.cnpj,
      razaoLegado: row.razao,
      dtVencimento: row.dt_vencimento,
      status: 'ok',
      vincularA: null,
      mensagem: '',
      descricaoLegado: row.descricao ? String(row.descricao).trim() : undefined,
      nomeArquivoLegado: (row.nomeOriginal || row.arquivo) ? String(row.nomeOriginal || row.arquivo).trim() : undefined,
    }

    // 1. Tenta match: primeiro como cliente, depois como própria empresa
    let alvoId: string | undefined
    let alvoRazao: string | null = null
    let vincularA: 'cliente' | 'empresa' | null = null

    const cnpjLimpo = row.cnpj ? row.cnpj.replace(/\D/g, '') : ''

    if (cnpjLimpo) {
      const cli = byCnpj.get(cnpjLimpo)
      if (cli) { alvoId = cli.id; alvoRazao = cli.razaoSocial; vincularA = 'cliente' }
    }
    if (!alvoId && row.razao) {
      const cli = byRazao.get(row.razao.toLowerCase().trim())
      if (cli) { alvoId = cli.id; alvoRazao = cli.razaoSocial; vincularA = 'cliente' }
    }
    // Fallback: a própria empresa (cert pode ser do escritório contábil)
    if (!alvoId && cnpjLimpo) {
      const emp = empresaPorCnpj.get(cnpjLimpo)
      if (emp) { alvoId = emp.id; alvoRazao = emp.razaoSocial; vincularA = 'empresa' }
    }
    // Se ainda não tem match, cria o cliente automaticamente
    if (!alvoId || !vincularA) {
      if (!cnpjLimpo || !row.razao) {
        return {
          ...base,
          status: 'cliente_nao_encontrado',
          mensagem: `Sem CNPJ ou razão social — não foi possível criar o cliente automaticamente.`,
        }
      }
      try {
        const novoCli = await prisma.cliente.create({
          data: {
            documento: cnpjLimpo,
            tipoDocumento: cnpjLimpo.length === 11 ? 'CPF' : 'CNPJ',
            razaoSocial: row.razao.trim(),
            empresaId,
            situacao: 'MENSAL',
            status: 'ATIVA',
            idOneClick: String(row.id_cliente),
            observacoes: 'Cadastrado automaticamente durante importação de certificado do OneClick V1.',
          },
          select: { id: true, documento: true, razaoSocial: true },
        })
        // Atualiza maps pra evitar duplicação no mesmo job (caso 2 certs do mesmo cliente)
        byCnpj.set(cnpjLimpo, novoCli)
        if (novoCli.razaoSocial) byRazao.set(novoCli.razaoSocial.toLowerCase().trim(), novoCli)
        alvoId = novoCli.id
        alvoRazao = novoCli.razaoSocial
        vincularA = 'cliente'
        this.log(jobId, 'success', `  + Cliente criado automaticamente: ${row.razao} (${cnpjLimpo})`)
      } catch (e) {
        // Se falhou por unique constraint (CNPJ já existe globalmente), tenta buscar
        const existente = await prisma.cliente.findFirst({
          where: { documento: cnpjLimpo, deletedAt: null },
          select: { id: true, documento: true, razaoSocial: true, empresaId: true },
        })
        if (existente) {
          if (existente.empresaId === empresaId) {
            byCnpj.set(cnpjLimpo, existente)
            alvoId = existente.id; alvoRazao = existente.razaoSocial; vincularA = 'cliente'
            this.log(jobId, 'info', `  → Cliente já existia (recuperado): ${existente.razaoSocial}`)
          } else {
            return {
              ...base,
              status: 'cliente_nao_encontrado',
              mensagem: `Cliente "${row.razao}" (${cnpjLimpo}) existe em outra empresa. Ignorado.`,
            }
          }
        } else {
          return {
            ...base,
            status: 'cliente_nao_encontrado',
            mensagem: `Falha ao criar cliente "${row.razao}": ${(e as Error).message}`,
          }
        }
      }
    }

    // 2. Tenta ler o arquivo PFX (testando todos os caminhos candidatos)
    let pfxBuffer: Buffer
    let caminhoEncontrado: string = candidates[0] ?? ''
    try {
      const result = await tryReadLegacyPfx(candidates)
      pfxBuffer = result.buffer
      caminhoEncontrado = result.path
    } catch (e) {
      return {
        ...base,
        status: 'arquivo_nao_encontrado',
        mensagem: (e as Error).message,
        clienteIdNovo: alvoId,
        clienteRazao: alvoRazao ?? '',
        vincularA,
      }
    }
    base.caminhoLegado = caminhoEncontrado

    // 3. Tenta abrir o PFX com várias fontes de senha
    const candidatosSenha = this.gerarCandidatosSenha(row)
    let pfxInfo: PfxInfo | null = null
    let senhaUsada: string | null = null
    let ultimoErro = ''
    for (const senha of candidatosSenha) {
      try {
        pfxInfo = parsePfx(pfxBuffer, senha)
        senhaUsada = senha
        break
      } catch (e) {
        ultimoErro = (e as Error).message
      }
    }
    if (!pfxInfo || !senhaUsada) {
      return {
        ...base,
        status: 'senha_invalida',
        mensagem: `Nenhuma senha funcionou. Tentadas: ${candidatosSenha.length}. Último erro: ${ultimoErro}`,
        clienteIdNovo: alvoId,
        clienteRazao: alvoRazao ?? '',
        vincularA,
      }
    }

    // 4. Dedupe por numeroSerie
    if (pfxInfo.numeroSerie && seriesExistentes.has(pfxInfo.numeroSerie)) {
      return {
        ...base,
        status: 'ja_importado',
        mensagem: `Certificado com mesmo número de série já existe.`,
        clienteIdNovo: alvoId,
        clienteRazao: alvoRazao ?? '',
        vincularA,
      }
    }

    const tipoLabel = vincularA === 'empresa' ? 'empresa' : 'cliente'
    return {
      ...base,
      status: 'ok',
      mensagem: `Pronto pra importar como ${tipoLabel} (${pfxInfo.titular}).`,
      clienteIdNovo: alvoId,
      clienteRazao: alvoRazao ?? '',
      vincularA,
      pfxInfo,
      senhaUsada,
    }
  }

  /** Monta as observações do certificado importado, levando os detalhes do arquivo
   *  do legado (nome original + descrição/notas — ex: "SENHA: wiz314181") pro v2. */
  private montarObservacoesImport(item: PreviewItem): string {
    const partes: string[] = [`Importado do OneClick V1 (legacyId=${item.legacyId}).`]
    if (item.nomeArquivoLegado) partes.push(`Arquivo original: ${item.nomeArquivoLegado}`)
    if (item.descricaoLegado) partes.push(item.descricaoLegado)
    return partes.join('\n')
  }

  /**
   * Lista de senhas candidatas, em ordem de prioridade:
   *   1. Campo `senha` da tabela
   *   2. Tokens extraídos do nome do arquivo (separados por _)
   *   3. Tokens extraídos da `descricao`
   *   4. Variantes (CNPJ digits, primeiros 6/8 dígitos do CNPJ)
   */
  private gerarCandidatosSenha(row: LegacyCertRow): string[] {
    const candidatos = new Set<string>()
    const add = (s: string | null | undefined) => {
      if (!s) return
      const t = s.trim()
      if (t.length >= 1 && t.length <= 100) candidatos.add(t)
    }

    // 1. Campo senha
    add(row.senha)

    // 2. Tokens do nome do arquivo (sem extensão)
    const nomeBase = row.arquivo.replace(/\.[^.]+$/, '')  // remove extensão
    nomeBase.split(/[_\-\s.]/).forEach(t => add(t))
    add(nomeBase)

    // 3. Tokens da descrição
    if (row.descricao) {
      add(row.descricao)
      row.descricao.split(/\s+/).forEach(t => {
        // Tenta cada palavra inteira e versões só com dígitos
        add(t)
        const onlyDigits = t.replace(/\D/g, '')
        if (onlyDigits.length >= 4) add(onlyDigits)
      })
    }

    // 4. Variantes do CNPJ
    if (row.cnpj) {
      const cnpjDigits = row.cnpj.replace(/\D/g, '')
      add(cnpjDigits)
      if (cnpjDigits.length >= 8) add(cnpjDigits.slice(0, 8))
      if (cnpjDigits.length >= 6) add(cnpjDigits.slice(0, 6))
    }

    return [...candidatos]
  }
}
