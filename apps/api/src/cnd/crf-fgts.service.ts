import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Page } from 'puppeteer'
import { cndLogger, comNavegador, dataIso, limparDoc, naFilaDoNavegador, PorEmpresa, precisaReconsultar } from './cnd-comum'

const CRF_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

const logger = cndLogger('CrfFgts')
/** Só os 4 últimos caracteres do documento vão para o log (LGPD). */
const fimDoc = (doc: string) => `…${doc.slice(-4)}`
const espera = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Origem do PDF gravado. 'oficial' = o PDF que a Caixa gera no "Visualizar";
 * 'captura_tela' = impressão da página do portal (page.pdf) quando o oficial
 * não pôde ser capturado — NÃO é o certificado, só o registro da consulta.
 */
export type CrfOrigemPdf = 'oficial' | 'captura_tela' | null

export interface CrfResult {
  sucesso: boolean
  mensagem: string
  tipo: string | null
  /** Novo (05/10/2026): de onde veio o PDF gravado. */
  origemPdf: CrfOrigemPdf
}

export interface CrfLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  /** Pulados por já terem certificado ainda válido. */
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando' | 'pulada'; erro?: string }>
}

const loteVazio = (): CrfLoteProgress => ({
  status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, pulados: 0,
  currentCliente: '', items: [],
})

const AVISO_CAPTURA = 'ATENÇÃO: o PDF anexado é uma captura da tela do portal, não o certificado oficial da Caixa — emita o CRF no portal se precisar do documento.'

/** Impressão da página atual — só registro da consulta, não o certificado. */
async function capturaTela(page: Page): Promise<string> {
  const pdfRaw = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
  return Buffer.from(pdfRaw).toString('base64')
}

@Injectable()
export class CrfFgtsService {
  // Estado por EMPRESA: antes era único e um escritório via a etapa/lote do outro.
  private readonly consultaEtapa = new PorEmpresa<string>(() => '')
  private readonly loteProgress = new PorEmpresa<CrfLoteProgress>(loteVazio)

  getConsultaEtapa(empresaId: string): string { return this.consultaEtapa.get(empresaId) }
  getLoteProgress(empresaId: string): CrfLoteProgress {
    const p = this.loteProgress.get(empresaId)
    return { ...p, items: [...p.items] }
  }

  /** Cliente da MESMA empresa — pelo id informado ou pelo documento. */
  private async resolverCliente(empresaId: string, doc: string, clienteId?: string): Promise<{ clienteId: string | null; razaoSocial: string | null }> {
    if (clienteId) {
      // findFirst com empresaId: um id de cliente de outra empresa não é vinculado.
      const cli = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId }, select: { razaoSocial: true } })
      return cli ? { clienteId, razaoSocial: cli.razaoSocial } : { clienteId: null, razaoSocial: null }
    }
    // Compara só letras e dígitos (CNPJ alfanumérico), com ou sem máscara gravada.
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
      `SELECT id, razao_social FROM clientes
        WHERE empresa_id = $1 AND status = 'ATIVO'
          AND regexp_replace(upper(documento), '[^0-9A-Z]', '', 'g') = $2
        LIMIT 1`,
      empresaId, doc,
    )
    return rows[0] ? { clienteId: rows[0].id, razaoSocial: rows[0].razao_social } : { clienteId: null, razaoSocial: null }
  }

  // ── Consulta individual ──────────────────────────────

  /** Um Chromium por vez no processo (fila global), com teto de tempo. */
  consultar(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CrfResult> {
    return naFilaDoNavegador(() => this.executarConsulta(empresaId, documento, clienteId, userId))
  }

  private async executarConsulta(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CrfResult> {
    const doc = limparDoc(documento)
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    const etapa = (e: string) => this.consultaEtapa.set(empresaId, e)
    etapa('Iniciando consulta...')
    logger.log(`Consultando CRF/FGTS para ${fimDoc(doc)}...`)

    const r = await comNavegador(async (browser) => {
      const page = await browser.newPage()
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36')
      await page.setViewport({ width: 1200, height: 800 })

      etapa('Acessando portal da Caixa...')
      await page.goto(CRF_URL, { waitUntil: 'networkidle2', timeout: 30000 })
      etapa('Página carregada, consultando...')

      // Espera o form JSF terminar de renderizar (em rede lenta da VPS o
      // networkidle2 dispara antes do JSF compor os campos)
      await page.waitForSelector('#mainForm\\:txtInscricao1', { timeout: 20000 })
      await page.waitForSelector('#mainForm\\:btnConsultar', { timeout: 5000 })

      // Documento vai como ARGUMENTO do evaluate — nunca interpolado no código.
      await page.evaluate((v: string) => {
        const campo = document.getElementById('mainForm:txtInscricao1') as HTMLInputElement | null
        if (campo) campo.value = v
        ;(document.getElementById('mainForm:btnConsultar') as HTMLElement | null)?.click()
      }, doc)
      etapa('Aguardando resposta da Caixa...')
      await espera(8000)

      const textoRes = await page.evaluate(() => document.body.innerText)
      // Ancorado em palavra: "IRREGULAR" contém "REGULAR". Maiúsculas de
      // propósito (é como o portal destaca a situação), para não casar texto de ajuda.
      const isIrregular = /\bIRREGULAR\b/.test(textoRes)
      const isRegular = !isIrregular && /\bREGULAR\b/.test(textoRes)

      let numeroCertificado: string | null = null
      let dataValidade: string | null = null
      let pdfBase64: string | null = null
      let origemPdf: CrfOrigemPdf = null

      if (isRegular) {
        etapa('Empresa regular, obtendo certificado...')

        // Clica no link do certificado (pelo texto) direto no DOM.
        const clicouCrf = await page.evaluate(() => {
          const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
            .find(a => (a.innerText || '').includes('Certificado') || (a.innerText || '').includes('CRF'))
          if (link) { link.click(); return true }
          return false
        })

        if (clicouCrf) {
          await espera(5000)
          const textoCrf = await page.evaluate(() => document.body.innerText)

          // "Validade: DD/MM/YYYY a DD/MM/YYYY" — fim da vigência é a 2ª data,
          // aceita só se posterior ao início (evita gravar data trocada).
          const validadeMatch = textoCrf.match(/Validade:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/)
          if (validadeMatch) {
            const ini = dataIso(validadeMatch[1])
            const fim = dataIso(validadeMatch[2])
            if (ini && fim && fim > ini) dataValidade = fim
          }

          // A Caixa escreve "Certificação Número" (a regex antiga procurava
          // "Certificado Número" e o número nunca era gravado).
          const lerNumero = (t: string) => t.match(/Certifica(?:do|[çc][ãa]o)\s*N[úu]mero:\s*(\d+)/)?.[1] ?? null
          numeroCertificado = lerNumero(textoCrf)

          // "Visualizar" NÃO gera PDF: é um postback AJAX que redesenha a página
          // com o certificado, e o "Imprimir" da Caixa só chama window.print().
          // O documento oficial é a impressão dessa página — feita aqui com
          // page.pdf(). (Antes se interceptava um PDF via CDP Fetch que nunca
          // existiu, e o resultado era sempre a "captura da tela"; o Fetch.enable
          // também quebra o proxy do escritório — ver cndt-trabalhista.)
          etapa('Gerando PDF do certificado...')
          if (await page.$('[id="mainForm:btnVisualizar"]')) {
            await page.evaluate(() => { (document.getElementById('mainForm:btnVisualizar') as HTMLElement | null)?.click() })
            // A versão de impressão é a que tem o botão "Imprimir" — a página
            // anterior já contém "Certificado de Regularidade" e "Validade:", então
            // esperar pelo texto imprimia a página errada (com o cabeçalho do site).
            const abriu = await page.waitForFunction(
              () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="button"], input[type="submit"]')).some(b => /imprimir/i.test(b.value || '')),
              { timeout: 15000 },
            ).then(() => true).catch(() => false)
            if (abriu) {
              const textoCert = await page.evaluate(() => document.body.innerText)
              numeroCertificado = lerNumero(textoCert) ?? numeroCertificado
              const v = textoCert.match(/Validade:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/)
              if (v) { const ini = dataIso(v[1]); const fim = dataIso(v[2]); if (ini && fim && fim > ini) dataValidade = fim }
              // Sem os botões "Voltar"/"Imprimir" da página no documento.
              await page.evaluate(() => {
                document.querySelectorAll<HTMLElement>('input[type="button"], input[type="submit"], button').forEach(b => { b.style.display = 'none' })
              })
              const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
              pdfBase64 = Buffer.from(pdf).toString('base64')
              origemPdf = 'oficial'
              logger.log(`Certificado impresso em PDF: ${pdf.length} bytes`)
            }
          }

          // Fallback: impressão da tela. Fica marcada como captura para o usuário
          // não tomá-la pelo certificado oficial.
          if (!pdfBase64) {
            logger.warn(`PDF oficial não capturado para ${fimDoc(doc)} — gravando captura da tela`)
            pdfBase64 = await capturaTela(page)
            origemPdf = 'captura_tela'
          }
        }
      }

      return { textoRes, isRegular, isIrregular, numeroCertificado, dataValidade, pdfBase64: pdfBase64 as string | null, origemPdf: origemPdf as CrfOrigemPdf }
    }, {
      timeoutMs: 120_000,
      // O portal da Caixa já exigia --ignore-certificate-errors (cadeia TLS incompleta vista da VPS).
      ignorarTls: true,
      // A Caixa devolve 403 ao IP do servidor (Hostinger): sai pelo escritório.
      viaEscritorio: true,
    })

    let sucesso = false
    let tipo: string | null = null
    let mensagem: string
    // "Definitivo" = a Caixa respondeu a situação (não é falha técnica).
    let definitivo = false

    if (r.isRegular) {
      sucesso = true
      tipo = 'Regular'
      mensagem = 'CRF emitido — empresa regular perante o FGTS'
      if (r.origemPdf === 'captura_tela') mensagem = `${mensagem}. ${AVISO_CAPTURA}`
      else if (!r.pdfBase64) mensagem = `${mensagem} (certificado não baixado)`
    } else if (r.isIrregular) {
      tipo = 'Irregular'
      definitivo = true
      mensagem = 'Empresa IRREGULAR perante o FGTS'
    } else if (/n[aã]o encontrad|inv[aá]lid/i.test(r.textoRes)) {
      mensagem = 'Inscrição não encontrada'
    } else {
      mensagem = 'Não foi possível consultar o CRF'
    }

    logger.log(`${fimDoc(doc)}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${tipo ?? mensagem}`)

    const razaoMatch = r.textoRes.match(/Raz[aã]o\s*[Ss]ocial\s*[:.]?\s*(.+)/i)
    const cli = await this.resolverCliente(empresaId, doc, clienteId)
    const gravado = await this.gravar(empresaId, doc, {
      razaoSocial: cli.razaoSocial ?? (razaoMatch ? razaoMatch[1]!.trim() : null),
      sucesso, tipo, mensagem,
      numeroCertificado: r.numeroCertificado, dataValidade: r.dataValidade,
      pdfBase64: r.pdfBase64, clienteId: cli.clienteId, userId: userId ?? null, definitivo,
    })
    if (!gravado) mensagem = `${mensagem} (o certificado anterior, ainda válido, foi mantido)`

    return { sucesso, mensagem, tipo, origemPdf: r.origemPdf }
  }

  /**
   * Grava sem perder certificado válido:
   * - sucesso: insere o novo e apaga os anteriores do documento (na empresa), em transação;
   * - "Irregular" (resposta definitiva da Caixa): substitui os não-regulares e MANTÉM o
   *   último regular (o certificado vale até a validade), mas o registro mais recente
   *   — o que a tela do cliente mostra — passa a ser o "Irregular";
   * - falha técnica com certificado regular anterior: não toca em nada;
   * - falha sem nenhum regular: substitui as falhas anteriores.
   * Devolve se gravou.
   */
  private async gravar(empresaId: string, doc: string, d: {
    razaoSocial: string | null; sucesso: boolean; tipo: string | null; mensagem: string
    numeroCertificado: string | null; dataValidade: string | null; pdfBase64: string | null
    clienteId: string | null; userId: string | null; definitivo: boolean
  }): Promise<boolean> {
    const insert = () => prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_crf_fgts (documento, razao_social, sucesso, tipo_certidao, mensagem, numero_certificado, data_validade, pdf_base64, cliente_id, user_id, empresa_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)`,
      doc, d.razaoSocial, d.sucesso, d.tipo, d.mensagem, d.numeroCertificado, d.dataValidade, d.pdfBase64, d.clienteId, d.userId, empresaId,
    )
    if (d.sucesso) {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(`DELETE FROM certidoes_crf_fgts WHERE empresa_id = $1 AND documento = $2`, empresaId, doc),
        insert(),
      ])
      return true
    }
    if (!d.definitivo) {
      const validas = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM certidoes_crf_fgts WHERE empresa_id = $1 AND documento = $2 AND sucesso = true LIMIT 1`, empresaId, doc,
      )
      if (validas.length > 0) {
        logger.warn(`Falha na consulta de ${fimDoc(doc)} — certificado anterior mantido: ${d.mensagem}`)
        return false
      }
    }
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`DELETE FROM certidoes_crf_fgts WHERE empresa_id = $1 AND documento = $2 AND sucesso = false`, empresaId, doc),
      insert(),
    ])
    return true
  }

  // ── Lote ─────────────────────────────────────────────

  async consultarLote(
    empresaId: string,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId?: string,
    forcarNova = false,
  ): Promise<{ message: string }> {
    if (this.loteProgress.get(empresaId).status === 'running') throw new Error('Consulta em lote já em andamento.')

    const progresso: CrfLoteProgress = {
      ...loteVazio(),
      status: 'running', total: documentos.length, currentCliente: 'Iniciando...',
      items: documentos.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }
    this.loteProgress.set(empresaId, progresso)

    // Segundo plano: o erro inesperado é logado e o lote sempre termina como 'done'.
    this.runLote(empresaId, progresso, documentos, userId, forcarNova)
      .catch(e => {
        logger.error(`Lote interrompido: ${(e as Error).message}`)
        progresso.currentCliente = `Erro: ${(e as Error).message}`
      })
      .finally(() => {
        progresso.status = 'done'
        if (!progresso.currentCliente.startsWith('Erro')) progresso.currentCliente = 'Concluído'
      })

    return { message: `Consulta em lote iniciada para ${documentos.length} documento(s)` }
  }

  private async runLote(
    empresaId: string,
    progresso: CrfLoteProgress,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId: string | undefined,
    forcarNova: boolean,
  ) {
    for (let i = 0; i < documentos.length; i++) {
      const c = documentos[i]!
      const doc = limparDoc(c.documento)
      const nome = c.razaoSocial || c.documento
      progresso.current = i + 1
      progresso.currentCliente = nome
      progresso.items[i] = { razaoSocial: nome, status: 'processando' }

      try {
        if (!forcarNova) {
          // Olha o ÚLTIMO registro (qualquer resultado): um "Irregular" posterior
          // ao regular faz precisaReconsultar devolver true.
          const ultima = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; data_validade: Date | null; created_at: Date }>>(
            `SELECT sucesso, data_validade, created_at FROM certidoes_crf_fgts WHERE empresa_id = $1 AND documento = $2 ORDER BY created_at DESC LIMIT 1`,
            empresaId, doc,
          )
          const u = ultima[0]
          // Coluna DATE chega como meia-noite UTC: compara pelo 'YYYY-MM-DD' (sem fuso).
          const validade = u?.data_validade ? u.data_validade.toISOString().slice(0, 10) : null
          if (u && !precisaReconsultar({ sucesso: u.sucesso, dataValidade: validade ? `${validade}T00:00:00` : null, criadoEm: u.created_at })) {
            progresso.pulados++
            progresso.items[i] = { razaoSocial: nome, status: 'pulada', erro: 'Certificado ainda válido — não reemitido' }
            continue
          }
        }

        const result = await this.consultar(empresaId, c.documento, c.clienteId, userId)
        if (result.sucesso) { progresso.emitidas++; progresso.items[i] = { razaoSocial: nome, status: 'emitida' } }
        else { progresso.naoEmitidas++; progresso.items[i] = { razaoSocial: nome, status: 'nao_emitida', erro: result.mensagem } }
      } catch (e) {
        progresso.erros++
        progresso.items[i] = { razaoSocial: nome, status: 'erro', erro: (e as Error).message }
        logger.warn(`Lote: erro em ${fimDoc(doc)}: ${(e as Error).message}`)
      }

      if (i < documentos.length - 1) await espera(2000)
    }
  }

  // ── Listagem ────────────────────────────────────────

  async list(empresaId: string, input: { page: number; limit: number; search?: string; filtroStatus?: string }) {
    const { page, limit, search, filtroStatus } = input
    const offset = (page - 1) * limit
    const conditions: string[] = ['empresa_id = $1']
    const params: unknown[] = [empresaId]
    let idx = 2

    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    if (filtroStatus === 'regular') conditions.push(`sucesso = true AND tipo_certidao = 'Regular'`)
    else if (filtroStatus === 'irregular') conditions.push(`sucesso = false AND tipo_certidao = 'Irregular'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false AND (tipo_certidao IS NULL OR tipo_certidao != 'Irregular')`)
    else if (filtroStatus === 'vigente') conditions.push(`data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencendo') conditions.push(`data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencida') conditions.push(`data_validade IS NOT NULL AND data_validade < CURRENT_DATE`)

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM certidoes_crf_fgts ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, sucesso, tipo_certidao, mensagem, numero_certificado, data_validade, created_at FROM certidoes_crf_fgts ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        documento: r.documento as string,
        razaoSocial: r.razao_social as string | null,
        sucesso: r.sucesso as boolean,
        tipoCertidao: r.tipo_certidao as string | null,
        mensagem: r.mensagem as string | null,
        numeroCertificado: r.numero_certificado as string | null,
        dataValidade: r.data_validade ? (r.data_validade as Date).toISOString().split('T')[0] : null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  async totalizadores(empresaId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true)::int as regulares,
        COUNT(*) FILTER (WHERE sucesso = false AND tipo_certidao = 'Irregular')::int as irregulares,
        COUNT(*) FILTER (WHERE sucesso = false AND (tipo_certidao IS NULL OR tipo_certidao != 'Irregular'))::int as nao_emitidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade < CURRENT_DATE)::int as vencidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days')::int as vencendo,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days')::int as vigentes
      FROM certidoes_crf_fgts
      WHERE empresa_id = $1
    `, empresaId)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0), regulares: Number(r.regulares ?? 0), irregulares: Number(r.irregulares ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0), vencidas: Number(r.vencidas ?? 0),
      vencendo: Number(r.vencendo ?? 0), vigentes: Number(r.vigentes ?? 0),
    }
  }

  async getPdf(empresaId: string, id: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_crf_fgts WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteCrf(empresaId: string, id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_crf_fgts WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    return { ok: true }
  }

  async deleteLote(empresaId: string, ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM certidoes_crf_fgts WHERE empresa_id = $1 AND id IN (${placeholders})`, empresaId, ...ids,
    )
    return { deleted }
  }
}
