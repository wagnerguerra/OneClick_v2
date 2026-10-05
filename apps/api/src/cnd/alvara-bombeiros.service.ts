import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type { Page, Target } from 'puppeteer'
import {
  PorEmpresa, cndLogger, comNavegador, dataIso, exigirEmpresa, limparDoc, naFilaDoNavegador, precisaReconsultar,
} from './cnd-comum'

const SIAT_GRID_URL = 'https://siat.cb.es.gov.br/siat/soa/service/grid.alvarapublico'
const log = cndLogger('AlvaraBombeiros')

export interface AlvaraLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  encontrados: number
  naoEncontrados: number
  erros: number
  /** Pulados por já terem alvará com validade folgada. */
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'encontrado' | 'nao_encontrado' | 'erro' | 'pendente' | 'processando' | 'pulado'; erro?: string }>
}

const loteVazio = (): AlvaraLoteProgress => ({
  status: 'idle', total: 0, current: 0, encontrados: 0, naoEncontrados: 0, erros: 0, pulados: 0, currentCliente: '', items: [],
})

export interface AlvaraResult {
  id: number
  razaoSocial: string
  nomeFantasia: string | null
  endereco: string | null
  municipio: string | null
  bairro: string | null
  status: string
  codigoValidacao: string | null
  dataInicioValidade: string | null
  dataFimValidade: string | null
  ocupacao: string | null
}

export interface AlvaraConsultaResult {
  sucesso: boolean
  total: number
  alvaras: AlvaraResult[]
  mensagem: string
}

type Linha = Record<string, unknown>
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)

/**
 * CPF/CNPJ do estabelecimento, se o grid do SIAT devolver. O nome do campo não
 * é documentado — tenta os usuais na linha e no `estabelecimento`.
 */
function documentoDaLinha(r: Linha): string | null {
  const est = (r.estabelecimento || {}) as Linha
  for (const fonte of [r, est]) {
    for (const k of ['cnpj', 'cpfCnpj', 'cnpjCpf', 'documento', 'cpf', 'numeroDocumento']) {
      const d = limparDoc(texto(fonte[k]))
      if (d.length === 14 || d.length === 11) return d
    }
  }
  return null
}

/** Escapa curingas do ILIKE: a razão social é texto livre. */
const escaparLike = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`)

@Injectable()
export class AlvaraBombeirosService {
  /** Lote POR EMPRESA — o de um escritório não bloqueia nem aparece no outro. */
  private readonly loteProgress = new PorEmpresa<AlvaraLoteProgress>(loteVazio)

  getLoteProgress(empresaId: string): AlvaraLoteProgress {
    const p = this.loteProgress.get(exigirEmpresa(empresaId))
    return { ...p, items: p.items.map(i => ({ ...i })) }
  }

  async consultarLote(
    empresaId: string,
    clientes: Array<{ razaoSocial: string; clienteId?: string }>,
    userId?: string,
    forcarNova = false,
  ): Promise<{ message: string }> {
    exigirEmpresa(empresaId)
    if (this.loteProgress.get(empresaId).status === 'running') throw new Error('Consulta em lote já em andamento.')

    const prog: AlvaraLoteProgress = {
      ...loteVazio(), status: 'running', total: clientes.length, currentCliente: 'Iniciando...',
      items: clientes.map(c => ({ razaoSocial: c.razaoSocial, status: 'pendente' as const })),
    }
    this.loteProgress.set(empresaId, prog)

    this.runLote(empresaId, prog, clientes, userId, forcarNova)
      .catch(e => log.error(`Lote interrompido: ${(e as Error).message}`))
      .finally(() => { prog.status = 'done'; prog.currentCliente = 'Concluído' })

    return { message: 'Consulta em lote iniciada' }
  }

  private async runLote(
    empresaId: string, prog: AlvaraLoteProgress,
    clientes: Array<{ razaoSocial: string; clienteId?: string }>,
    userId: string | undefined, forcarNova: boolean,
  ) {
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      prog.current = i + 1
      prog.currentCliente = c.razaoSocial
      prog.items[i] = { razaoSocial: c.razaoSocial, status: 'processando' }

      try {
        if (!forcarNova && !(await this.precisaConsultar(empresaId, c))) {
          prog.pulados++
          prog.items[i] = { razaoSocial: c.razaoSocial, status: 'pulado', erro: 'Alvará ainda válido' }
          continue
        }
        const result = await this.consultar(empresaId, c.razaoSocial, c.clienteId, userId)
        if (result.sucesso) {
          prog.encontrados++
          prog.items[i] = { razaoSocial: c.razaoSocial, status: 'encontrado' }
        } else {
          prog.naoEncontrados++
          prog.items[i] = { razaoSocial: c.razaoSocial, status: 'nao_encontrado' }
        }
      } catch (e) {
        prog.erros++
        prog.items[i] = { razaoSocial: c.razaoSocial, status: 'erro', erro: (e as Error).message }
        log.error(`Lote, item ${i + 1}/${clientes.length}: ${(e as Error).message}`)
      }

      if (i < clientes.length - 1) await new Promise(r => setTimeout(r, 1000))
    }
  }

  /** Último alvará salvo (por cliente ou, sem cliente, pela razão social) ainda folgado? */
  private async precisaConsultar(empresaId: string, c: { razaoSocial: string; clienteId?: string }): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ status: string | null; data_fim_validade: string | null; created_at: Date | null }>>(
      c.clienteId
        ? `SELECT status, data_fim_validade, created_at FROM alvaras_bombeiros WHERE empresa_id = $1 AND cliente_id = $2 ORDER BY created_at DESC LIMIT 1`
        : `SELECT status, data_fim_validade, created_at FROM alvaras_bombeiros WHERE empresa_id = $1 AND razao_social = $2 ORDER BY created_at DESC LIMIT 1`,
      empresaId, c.clienteId ?? c.razaoSocial,
    )
    const u = rows[0]
    if (!u) return true
    // Só 'Regular' conta como alvará em dia (mesma regra dos totalizadores).
    return precisaReconsultar({ sucesso: u.status === 'Regular', dataValidade: dataIso(u.data_fim_validade), criadoEm: u.created_at })
  }

  async consultar(empresaId: string, razaoSocial: string, clienteId?: string, userId?: string): Promise<AlvaraConsultaResult> {
    exigirEmpresa(empresaId)
    log.log(`Consultando: ${razaoSocial}`)

    const url = `${SIAT_GRID_URL}?razaoSocial=${encodeURIComponent(razaoSocial)}`
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`SIAT retornou HTTP ${res.status}`)

    const data = await res.json() as { records: string; rows: Linha[] }

    const total = Number(data.records || 0)
    const linhas = (data.rows || []).map(r => {
      const est = (r.estabelecimento || {}) as Linha
      const mun = (r.municipio || {}) as Linha
      const bairro = (r.bairro || {}) as Linha
      const alvara: AlvaraResult = {
        id: Number(r.id),
        razaoSocial: texto(r.razaoSocial) || texto(r.lookup) || '',
        nomeFantasia: texto(est.nomeFantasia) || texto(r.nomeFantasia),
        endereco: texto(r.endereco),
        municipio: texto(mun.nome),
        bairro: texto(bairro.nome),
        status: texto(r.alvaraStr) || 'Desconhecido',
        codigoValidacao: texto(r.codigoValidacao),
        dataInicioValidade: texto(r.dataIniValidade),
        dataFimValidade: texto(r.dataFimValidade) || texto(r.dataFimValidadeAux),
        ocupacao: texto(r.ocupacao),
      }
      return { alvara, documento: documentoDaLinha(r) }
    })

    log.log(`${total} resultado(s) para "${razaoSocial}"`)

    // O mais recente pela validade em ISO. Antes comparava a string crua: com
    // "DD/MM/YYYY", "31/01/2020" vencia "01/06/2026".
    let maisRecente: { alvara: AlvaraResult; documento: string | null } | null = null
    for (const l of linhas) {
      if (!maisRecente) { maisRecente = l; continue }
      const atual = dataIso(l.alvara.dataFimValidade) ?? ''
      const melhor = dataIso(maisRecente.alvara.dataFimValidade) ?? ''
      if (atual > melhor) maisRecente = l
    }

    // Vínculo ao cliente, sempre dentro da empresa.
    let documento: string | null = maisRecente?.documento ?? null
    let clienteVinculado: string | null = null
    if (clienteId) {
      const cli = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId }, select: { documento: true } })
      if (!cli) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado nesta empresa.' })
      clienteVinculado = clienteId
      documento = documento ?? (limparDoc(cli.documento) || null)
    } else if (maisRecente) {
      clienteVinculado = await this.vincularCliente(empresaId, razaoSocial, maisRecente.documento)
      if (clienteVinculado && !documento) {
        const cli = await prisma.cliente.findFirst({ where: { id: clienteVinculado, empresaId }, select: { documento: true } })
        documento = limparDoc(cli?.documento) || null
      }
    }

    // "Não encontrado" não apaga nada: só grava quando há alvará.
    if (maisRecente) {
      const a = maisRecente.alvara
      await prisma.$transaction([
        // Remove o registro anterior deste cliente (ou deste alvará) DESTA empresa.
        clienteVinculado
          ? prisma.$executeRawUnsafe(`DELETE FROM alvaras_bombeiros WHERE cliente_id = $1 AND empresa_id = $2`, clienteVinculado, empresaId)
          : prisma.$executeRawUnsafe(`DELETE FROM alvaras_bombeiros WHERE alvara_id = $1 AND empresa_id = $2`, a.id, empresaId),
        prisma.$executeRawUnsafe(
          `INSERT INTO alvaras_bombeiros (alvara_id, documento, razao_social, nome_fantasia, endereco, municipio, bairro, status, codigo_validacao, data_inicio_validade, data_fim_validade, ocupacao, cliente_id, user_id, empresa_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          a.id, documento, a.razaoSocial, a.nomeFantasia, a.endereco,
          a.municipio, a.bairro, a.status, a.codigoValidacao,
          a.dataInicioValidade, a.dataFimValidade, a.ocupacao,
          clienteVinculado, userId || null, empresaId,
        ),
      ])
    }

    return {
      sucesso: total > 0,
      total,
      alvaras: maisRecente ? [maisRecente.alvara] : [],
      mensagem: total > 0
        ? `${total} alvará(s) encontrado(s)${total > 1 ? ' — salvo o mais recente' : ''}`
        : 'Nenhum alvará encontrado para esta razão social',
    }
  }

  /**
   * Cliente do alvará: pelo CNPJ/CPF quando o SIAT devolve; senão pelo nome,
   * mas só com UM candidato na empresa. Antes era ILIKE nas 3 primeiras
   * palavras com LIMIT 1 em todos os tenants — "COMERCIO DE ALIMENTOS ..."
   * vinculava o alvará ao primeiro cliente qualquer com esse começo.
   */
  private async vincularCliente(empresaId: string, razaoSocial: string, doc: string | null): Promise<string | null> {
    if (doc) {
      const porDoc = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM clientes
          WHERE status = 'ATIVO' AND empresa_id = $2
            AND UPPER(REGEXP_REPLACE(documento, '[^0-9A-Za-z]', '', 'g')) = $1
          LIMIT 2`, doc, empresaId,
      )
      if (porDoc.length === 1) return porDoc[0]!.id
      if (porDoc.length > 1) { log.warn(`Documento …${doc.slice(-4)} com mais de um cliente ativo — alvará sem vínculo`); return null }
    }
    const termo = razaoSocial.split('/')[0]!.trim().split(/\s+/).slice(0, 3).join(' ')
    if (termo.length < 3) return null
    const semAcento = termo.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const porNome = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM clientes
        WHERE status = 'ATIVO' AND empresa_id = $1
          AND (razao_social ILIKE $2 OR razao_social ILIKE $3)
        LIMIT 2`,
      empresaId, `%${escaparLike(termo)}%`, `%${escaparLike(semAcento)}%`,
    )
    if (porNome.length === 1) return porNome[0]!.id
    if (porNome.length > 1) log.warn(`"${termo}" casa com mais de um cliente — alvará sem vínculo`)
    return null
  }

  async list(empresaId: string, input: { page: number; limit: number; search?: string }) {
    exigirEmpresa(empresaId)
    const { page, limit, search } = input
    const offset = (page - 1) * limit

    const conditions: string[] = ['empresa_id = $1']
    const params: unknown[] = [empresaId]
    let paramIdx = 2

    if (search) {
      conditions.push(`(razao_social ILIKE $${paramIdx} OR documento ILIKE $${paramIdx} OR municipio ILIKE $${paramIdx})`)
      params.push(`%${search}%`); paramIdx++
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM alvaras_bombeiros ${where}`, ...params,
    )
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM alvaras_bombeiros ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        alvaraId: r.alvara_id as number,
        documento: r.documento as string | null,
        razaoSocial: r.razao_social as string,
        nomeFantasia: r.nome_fantasia as string | null,
        endereco: r.endereco as string | null,
        municipio: r.municipio as string | null,
        bairro: r.bairro as string | null,
        status: r.status as string,
        codigoValidacao: r.codigo_validacao as string | null,
        dataInicioValidade: r.data_inicio_validade as string | null,
        dataFimValidade: r.data_fim_validade as string | null,
        ocupacao: r.ocupacao as string | null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  /** Baixa o PDF do alvará via SIAT autenticado */
  async getPdf(empresaId: string, alvaraId: number): Promise<{ pdfBase64: string | null }> {
    exigirEmpresa(empresaId)
    // Cache e razão social: só de alvará desta empresa.
    const row = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null; razao_social: string | null }>>(
      `SELECT pdf_base64, razao_social FROM alvaras_bombeiros WHERE alvara_id = $1 AND empresa_id = $2 LIMIT 1`, alvaraId, empresaId,
    )
    if (!row[0]) return { pdfBase64: null }
    if (row[0].pdf_base64) return { pdfBase64: row[0].pdf_base64 }
    const razao = row[0].razao_social
    if (!razao) return { pdfBase64: null }

    // Credencial do SIAT só pelo system_config — sem valor padrão no código.
    const creds = await prisma.systemConfig.findMany({ where: { key: { in: ['SIAT_USER', 'SIAT_PASS'] } } })
    const siatUser = creds.find(c => c.key === 'SIAT_USER')?.value?.trim()
    const siatPass = creds.find(c => c.key === 'SIAT_PASS')?.value
    if (!siatUser || !siatPass) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure o usuário e a senha do SIAT em Configurações.' })
    }

    log.log(`Buscando PDF do alvará ${alvaraId} via SIAT...`)
    try {
      const pdfBase64 = await naFilaDoNavegador(() => comNavegador(
        browser => this.baixarPdf(browser, alvaraId, razao, siatUser, siatPass),
        // O SIAT (siat.cb.es.gov.br) serve cadeia de certificado incompleta — a rotina já ignorava TLS.
        { timeoutMs: 120_000, ignorarTls: true },
      ))
      if (pdfBase64) {
        await prisma.$executeRawUnsafe(
          `UPDATE alvaras_bombeiros SET pdf_base64 = $1 WHERE alvara_id = $2 AND empresa_id = $3`, pdfBase64, alvaraId, empresaId,
        )
      }
      return { pdfBase64 }
    } catch (e) {
      log.error(`Erro ao baixar PDF do alvará ${alvaraId}: ${(e as Error).message}`)
      return { pdfBase64: null }
    }
  }

  private async baixarPdf(
    browser: import('puppeteer').Browser, alvaraId: number, razao: string, siatUser: string, siatPass: string,
  ): Promise<string | null> {
    const espera = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    const page = await browser.newPage()

    // Login
    await page.goto('https://siat.cb.es.gov.br/', { waitUntil: 'networkidle2', timeout: 30000 })
    await page.type('#id_j_username', siatUser)
    await page.type('input[name=j_password]', siatPass)
    await page.evaluate(() => { document.querySelector('form')?.submit() })
    await espera(5000)

    // Navegar para Imprimir Alvará — a razão social vai como ARGUMENTO do
    // evaluate (antes era interpolada no código: uma aspa no nome quebrava).
    await page.goto('https://siat.cb.es.gov.br/siat/f/n/alvarapublico', { waitUntil: 'networkidle2', timeout: 30000 })
    const termo = razao.split('/')[0]!.trim().slice(0, 40)
    await page.evaluate((v: string) => {
      (document.getElementById('corpo:formulario:razaoSocial') as HTMLInputElement).value = v
      ;(document.getElementById('corpo:formulario:botaoAcaoPesquisar') as HTMLElement).click()
    }, termo)
    await espera(8000)

    log.log(`Gerando PDF para alvará ${alvaraId}...`)
    const novaAba = new Promise<Page | null>(resolve => browser.once('targetcreated', (t: Target) => { t.page().then(resolve, () => resolve(null)) }))
    await page.evaluate((id: number) => {
      (window as unknown as { chamarImprimirAlvara: (tipo: string, id: number) => void }).chamarImprimirAlvara('ALVARA_LICENCA', id)
    }, alvaraId)

    const pdfPage = await Promise.race([
      novaAba,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('A aba do PDF não abriu')), 15000)),
    ])
    if (!pdfPage) return null
    await espera(3000)

    // CDP Fetch + reload para capturar o PDF
    const client = await pdfPage.createCDPSession()
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*alvarapublico*', requestStage: 'Response' }] })

    const captura: { pdf: string | null } = { pdf: null }
    client.on('Fetch.requestPaused', async (event) => {
      const ct = (event.responseHeaders || []).find(h => h.name.toLowerCase() === 'content-type')
      if (ct && ct.value.includes('pdf') && !captura.pdf) {
        try {
          const body = await client.send('Fetch.getResponseBody', { requestId: event.requestId })
          const buf = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8')
          if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
            captura.pdf = buf.toString('base64')
            log.log(`PDF capturado: ${buf.length} bytes`)
          }
        } catch { /* resposta sem corpo — segue */ }
      }
      await client.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
    })

    await pdfPage.reload({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
    await espera(5000)
    return captura.pdf
  }

  async totalizadores(empresaId: string) {
    exigirEmpresa(empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'Regular')::int as regulares,
        COUNT(*) FILTER (WHERE status != 'Regular')::int as irregulares
      FROM alvaras_bombeiros
      WHERE empresa_id = $1
    `, empresaId)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      regulares: Number(r.regulares ?? 0),
      irregulares: Number(r.irregulares ?? 0),
    }
  }

  async deleteAlvara(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    await prisma.$executeRawUnsafe(`DELETE FROM alvaras_bombeiros WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    return { ok: true }
  }

  async deleteLote(empresaId: string, ids: string[]) {
    exigirEmpresa(empresaId)
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM alvaras_bombeiros WHERE empresa_id = $1 AND id IN (${placeholders})`, empresaId, ...ids,
    )
    return { deleted }
  }
}
