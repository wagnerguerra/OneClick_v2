import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { encryptPassword, serializeCipher, sha256Hex } from './crypto.helper'
import { parsePfx, type PfxInfo } from './pfx-parser'
import { CertificadoDigitalService } from './certificado-digital.service'

const STORAGE_ROOT = path.resolve(process.cwd(), 'uploads', 'certificados')

export interface BulkFileInput {
  nome: string         // nome original do arquivo (com .pfx/.p12)
  base64: string       // conteúdo do PFX em base64
}

export interface BulkResultFile {
  nome: string
  status: 'ok' | 'cliente_nao_encontrado' | 'senha_invalida' | 'pfx_invalido' | 'ja_importado' | 'vencido'
  pfxInfo?: PfxInfo
  vincularA: 'cliente' | 'empresa' | null
  alvoId?: string
  alvoRazao?: string
  mensagem: string
}

interface InternalFile extends BulkResultFile {
  base64: string                 // mantido só em memória pra confirmação
  senhaUsada?: string            // mantido só em memória pra confirmação
}

interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

interface JobState {
  empresaId: string
  fase: 'processando' | 'importando' | 'done' | 'error'
  total: number
  processed: number
  logs: LogEntry[]
  files?: BulkResultFile[]                 // expostos pro frontend (sem base64/senha)
  internalFiles?: InternalFile[]           // só backend
  importResult?: { total: number; importados: number; pulados: number }
  error?: string
  createdAt: number
}

@Injectable()
export class BulkImportCertService {
  private jobs = new Map<string, JobState>()
  private static readonly TTL_MS = 30 * 60 * 1000

  constructor(private readonly certService: CertificadoDigitalService) {}

  private cleanup() {
    const now = Date.now()
    for (const [id, job] of this.jobs.entries()) {
      if ((job.fase === 'done' || job.fase === 'error') && now - job.createdAt > BulkImportCertService.TTL_MS) {
        this.jobs.delete(id)
      }
    }
  }

  private log(jobId: string, level: LogEntry['level'], message: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.logs.push({ ts: Date.now(), level, message })
    if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500)
  }

  /** Cria job e dispara processamento em background. */
  startPreview(empresaId: string, files: BulkFileInput[], senhaPadrao?: string): { jobId: string } {
    this.cleanup()
    const jobId = randomUUID()
    this.jobs.set(jobId, {
      empresaId,
      fase: 'processando',
      total: files.length,
      processed: 0,
      logs: [],
      createdAt: Date.now(),
    })
    this.executarPreview(jobId, files, senhaPadrao).catch((e: Error) => {
      const job = this.jobs.get(jobId)
      if (job) {
        job.fase = 'error'
        job.error = e.message
        this.log(jobId, 'error', `Erro fatal: ${e.message}`)
      }
    })
    return { jobId }
  }

  /** Polled pelo frontend pra logs/progresso. Não retorna base64/senhas. */
  getProgress(jobId: string): Omit<JobState, 'internalFiles'> | null {
    const job = this.jobs.get(jobId)
    if (!job) return null
    const { internalFiles, ...rest } = job
    return rest
  }

  startImport(jobId: string, userId?: string): { jobId: string } {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('Job não encontrado.')
    if (job.fase !== 'done' || !job.internalFiles) throw new Error('Preview ainda não concluído.')
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

  // ── Preview em background ──────────────────────────────

  private async executarPreview(jobId: string, files: BulkFileInput[], senhaPadrao?: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    const { empresaId } = job

    this.log(jobId, 'info', `Iniciando análise de ${files.length} arquivo(s)...`)

    // Pre-carrega clientes + empresa
    this.log(jobId, 'info', 'Carregando clientes da empresa...')
    const clientesNovos = await prisma.cliente.findMany({
      where: { empresaId, deletedAt: null },
      select: { id: true, documento: true, razaoSocial: true },
    })
    const byCnpj = new Map<string, { id: string; razaoSocial: string | null }>()
    for (const c of clientesNovos) {
      if (c.documento) byCnpj.set(c.documento.replace(/\D/g, ''), { id: c.id, razaoSocial: c.razaoSocial })
    }
    this.log(jobId, 'success', `${clientesNovos.length} cliente(s) carregado(s).`)

    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, cnpj: true, razaoSocial: true },
    })
    const empresaPorCnpj = new Map<string, { id: string; razaoSocial: string | null }>()
    if (empresa?.cnpj) {
      empresaPorCnpj.set(empresa.cnpj.replace(/\D/g, ''), { id: empresa.id, razaoSocial: empresa.razaoSocial })
      this.log(jobId, 'info', `Empresa "${empresa.razaoSocial}" (${empresa.cnpj}) carregada.`)
    }

    // Pre-carrega séries existentes pra dedupe
    const certsExistentes = await prisma.certificadoDigital.findMany({
      where: { empresaId },
      select: { numeroSerie: true },
    })
    const seriesExistentes = new Set(certsExistentes.map(c => c.numeroSerie).filter((s): s is string => !!s))
    if (seriesExistentes.size > 0) {
      this.log(jobId, 'info', `${seriesExistentes.size} certificado(s) já presente(s) (serão ignorados se mesma série).`)
    }

    const internalFiles: InternalFile[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!
      this.log(jobId, 'info', `[${i + 1}/${files.length}] ${f.nome}`)

      let item: InternalFile
      try {
        item = await this.processarArquivo(f, senhaPadrao, byCnpj, empresaPorCnpj, seriesExistentes)
      } catch (e) {
        this.log(jobId, 'error', `  ✗ Erro inesperado: ${(e as Error).message}`)
        item = {
          nome: f.nome,
          base64: f.base64,
          status: 'pfx_invalido',
          vincularA: null,
          mensagem: `Erro inesperado: ${(e as Error).message}`,
        }
      }
      internalFiles.push(item)
      job.processed = i + 1

      if (item.status === 'ok') {
        const tipo = item.vincularA === 'empresa' ? 'EMPRESA' : 'cliente'
        const expirado = item.pfxInfo && item.pfxInfo.expiraEm < new Date()
        const sufixo = expirado ? ` ⏰ VENCIDO em ${item.pfxInfo!.expiraEm.toLocaleDateString('pt-BR')}` : ''
        this.log(jobId, 'success', `  ✓ ${item.pfxInfo?.titular} → ${tipo} ${item.alvoRazao}${sufixo}`)
      } else if (item.status === 'cliente_nao_encontrado') {
        this.log(jobId, 'warn', `  ⚠ Sem cliente/empresa para ${item.pfxInfo?.documento || '(sem CNPJ)'}`)
      } else if (item.status === 'senha_invalida') {
        this.log(jobId, 'warn', `  ⚠ Senha não funcionou`)
      } else if (item.status === 'ja_importado') {
        this.log(jobId, 'info', `  → Já importado (mesma série)`)
      } else if (item.status === 'vencido') {
        this.log(jobId, 'warn', `  ⏰ Vencido — ${item.pfxInfo?.expiraEm.toLocaleDateString('pt-BR')}`)
      } else if (item.status === 'pfx_invalido') {
        this.log(jobId, 'error', `  ✗ ${item.mensagem}`)
      }
    }

    // Expõe versão pública (sem base64/senha)
    job.files = internalFiles.map(({ base64, senhaUsada, ...pub }) => pub)
    job.internalFiles = internalFiles
    job.fase = 'done'
    const ok = internalFiles.filter(i => i.status === 'ok').length
    const erros = internalFiles.length - ok
    this.log(jobId, 'success', `Análise concluída: ${ok} prontos, ${erros} com problemas.`)
  }

  private async processarArquivo(
    f: BulkFileInput,
    senhaPadrao: string | undefined,
    byCnpj: Map<string, { id: string; razaoSocial: string | null }>,
    empresaPorCnpj: Map<string, { id: string; razaoSocial: string | null }>,
    seriesExistentes: Set<string>,
  ): Promise<InternalFile> {
    const base: InternalFile = {
      nome: f.nome,
      base64: f.base64,
      status: 'ok',
      vincularA: null,
      mensagem: '',
    }

    let pfxBuffer: Buffer
    try {
      pfxBuffer = Buffer.from(f.base64, 'base64')
      if (pfxBuffer.length < 50) throw new Error('Buffer muito pequeno — base64 inválido?')
    } catch (e) {
      return { ...base, status: 'pfx_invalido', mensagem: `Falha ao decodificar base64: ${(e as Error).message}` }
    }

    // Tenta abrir o PFX com senhas candidatas
    const candidatos = this.gerarCandidatosSenha(f.nome, senhaPadrao)
    let pfxInfo: PfxInfo | null = null
    let senhaUsada: string | null = null
    let ultimoErro = ''
    for (const senha of candidatos) {
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
        mensagem: `Nenhuma senha funcionou (${candidatos.length} tentativas). ${ultimoErro}`,
      }
    }

    // Match: CNPJ do certificado → cliente, fallback → empresa
    const cnpjCert = (pfxInfo.documento || '').replace(/\D/g, '')
    let alvoId: string | undefined
    let alvoRazao: string | null = null
    let vincularA: 'cliente' | 'empresa' | null = null
    if (cnpjCert) {
      const cli = byCnpj.get(cnpjCert)
      if (cli) { alvoId = cli.id; alvoRazao = cli.razaoSocial; vincularA = 'cliente' }
      if (!alvoId) {
        const emp = empresaPorCnpj.get(cnpjCert)
        if (emp) { alvoId = emp.id; alvoRazao = emp.razaoSocial; vincularA = 'empresa' }
      }
    }
    // Cria cliente automaticamente se não existir
    if ((!alvoId || !vincularA) && cnpjCert && pfxInfo.titular) {
      try {
        const novoCli = await prisma.cliente.create({
          data: {
            documento: cnpjCert,
            tipoDocumento: cnpjCert.length === 11 ? 'CPF' : 'CNPJ',
            razaoSocial: pfxInfo.titular.trim(),
            empresaId,
            situacao: 'MENSAL',
            status: 'ATIVA',
            observacoes: 'Cadastrado automaticamente durante importação em lote de certificado.',
          },
          select: { id: true, razaoSocial: true },
        })
        byCnpj.set(cnpjCert, { id: novoCli.id, razaoSocial: novoCli.razaoSocial })
        alvoId = novoCli.id; alvoRazao = novoCli.razaoSocial; vincularA = 'cliente'
      } catch (e) {
        // Tenta recuperar caso já exista globalmente
        const existente = await prisma.cliente.findFirst({
          where: { documento: cnpjCert, empresaId, deletedAt: null },
          select: { id: true, razaoSocial: true },
        })
        if (existente) {
          byCnpj.set(cnpjCert, { id: existente.id, razaoSocial: existente.razaoSocial })
          alvoId = existente.id; alvoRazao = existente.razaoSocial; vincularA = 'cliente'
        }
      }
    }
    if (!alvoId || !vincularA) {
      return {
        ...base,
        status: 'cliente_nao_encontrado',
        mensagem: `CNPJ do certificado "${pfxInfo.documento}" não corresponde a nenhum cliente, à empresa selecionada, e não foi possível criar automaticamente.`,
        pfxInfo,
      }
    }

    // Dedupe
    if (pfxInfo.numeroSerie && seriesExistentes.has(pfxInfo.numeroSerie)) {
      return {
        ...base,
        status: 'ja_importado',
        mensagem: 'Certificado com mesmo número de série já existe.',
        pfxInfo,
        alvoId,
        alvoRazao: alvoRazao ?? '',
        vincularA,
      }
    }

    return {
      ...base,
      status: 'ok',
      mensagem: `Pronto pra importar (${pfxInfo.titular}).`,
      pfxInfo,
      alvoId,
      alvoRazao: alvoRazao ?? '',
      vincularA,
      senhaUsada,
    }
  }

  /** Senhas candidatas: senhaPadrao → CNPJ do nome → tokens do nome. */
  private gerarCandidatosSenha(nomeArquivo: string, senhaPadrao?: string): string[] {
    const candidatos = new Set<string>()
    const add = (s: string | null | undefined) => {
      if (!s) return
      const t = s.trim()
      if (t.length >= 1 && t.length <= 100) candidatos.add(t)
    }
    if (senhaPadrao) add(senhaPadrao)

    const nomeBase = nomeArquivo.replace(/\.[^.]+$/, '')
    add(nomeBase)
    nomeBase.split(/[_\-\s.]/).forEach(t => {
      add(t)
      const onlyDigits = t.replace(/\D/g, '')
      if (onlyDigits.length >= 4) add(onlyDigits)
    })

    // CNPJ no nome: extrai sequência de 14 dígitos
    const m = nomeArquivo.match(/\d{14}/)
    if (m) {
      add(m[0])
      add(m[0].slice(0, 8))
      add(m[0].slice(0, 6))
    }

    return [...candidatos]
  }

  // ── Importação efetiva em background ────────────────────

  private async executarImportacao(jobId: string, userId?: string) {
    const job = this.jobs.get(jobId)
    if (!job?.internalFiles) return
    const validos = job.internalFiles.filter(i => i.status === 'ok')
    job.total = validos.length
    job.processed = 0
    let importados = 0

    for (const item of validos) {
      this.log(jobId, 'info', `Importando ${item.pfxInfo?.titular}...`)
      try {
        if (!item.pfxInfo || !item.alvoId || !item.senhaUsada) continue
        const pfxBuffer = Buffer.from(item.base64, 'base64')
        const arquivoHash = sha256Hex(pfxBuffer)

        const cipher = encryptPassword(item.senhaUsada)
        const senhaCifrada = serializeCipher(cipher)

        const created = await prisma.certificadoDigital.create({
          data: {
            clienteId: item.vincularA === 'cliente' ? item.alvoId : null,
            empresaId: item.vincularA === 'empresa' ? item.alvoId : job.empresaId,
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
            observacoes: `Importado via upload em lote (${item.nome}).`,
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
            detalhes: `Importado em lote (${item.nome})`,
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
    this.log(jobId, 'success', `Importação concluída: ${importados} de ${validos.length}.`)

    // Atualiza sino de notificações em background (não bloqueia o retorno)
    if (importados > 0) {
      this.certService.notificarVencimentos()
        .then(r => this.log(jobId, 'info', `Sino atualizado: ${r.notificados} notificação(ões) criada(s).`))
        .catch(e => console.error('[BulkImport] notificarVencimentos:', e.message))
    }
  }
}
