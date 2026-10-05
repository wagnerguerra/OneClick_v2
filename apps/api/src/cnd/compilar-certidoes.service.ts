import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { EmailService } from '../common/email.service'
import { CndService } from './cnd.service'
import { CndEstadualService } from './cnd-estadual.service'
import { CndMunicipalService } from './cnd-municipal.service'
import { CndtTrabalhistaService } from './cndt-trabalhista.service'
import { CrfFgtsService } from './crf-fgts.service'
import { CguCertidaoService } from './cgu-certidao.service'
import { AlvaraBombeirosService } from './alvara-bombeiros.service'
import { AlvaraFuncionamentoService } from './alvara-funcionamento.service'
import { cndLogger, exigirEmpresa, limparDoc, PorEmpresa, dataIso } from './cnd-comum'

export type CertidaoTipo = 'federal' | 'estadual' | 'municipal' | 'trabalhista' | 'fgts' | 'cgu' | 'alvara_bombeiros' | 'alvara_funcionamento'

export interface CompilarItem {
  tipo: CertidaoTipo
  label: string
  status: 'pendente' | 'processando' | 'sucesso' | 'falha' | 'sem_pdf'
  mensagem?: string
  situacao?: string | null
  pdfBase64?: string | null
}

export interface CompilarProgress {
  status: 'idle' | 'running' | 'done'
  items: CompilarItem[]
  current: number
  total: number
  razaoSocial?: string
  /** Documento compilado — o envio por e-mail só usa o progresso deste documento. */
  documento?: string
}

const LABELS: Record<CertidaoTipo, string> = {
  federal: 'CND Federal (PGFN/RFB)',
  estadual: 'CND Estadual (SEFAZ ES)',
  municipal: 'CND Municipal',
  trabalhista: 'CNDT Trabalhista (TST)',
  fgts: 'CRF/FGTS (Caixa)',
  cgu: 'CGU (Certidão Correcional)',
  alvara_bombeiros: 'Alvará de Licença (Bombeiros)',
  alvara_funcionamento: 'Alvará de Funcionamento',
}

const logger = cndLogger('Compilar')

/** Documento normalizado no SQL — mesma regra do `limparDoc` (mantém letras do CNPJ alfanumérico). */
const docSql = (col: string) => `UPPER(REGEXP_REPLACE(${col}, '[^0-9A-Za-z]', '', 'g'))`

/**
 * "Ainda vale" para quem não grava validade. Não há data no registro, então a
 * idade da emissão faz as vezes: estadual e CGU são reconsultadas depois de
 * 30 dias; alvará de funcionamento, depois de um ano.
 */
const IDADE_MAX_SEM_VALIDADE = { estadual: 30, cgu: 30, alvara_funcionamento: 365 } as const

/** Hoje em Brasília, "YYYY-MM-DD" — comparação de data sem fuso do servidor. */
const hojeBrasilia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

/** Escapa texto que entra no HTML do e-mail (razão social e mensagens vêm de fora). */
function esc(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Lê a falha devolvida por uma rotina que, pela regra nova, não lança quando a
 * consulta falha e há certidão válida anterior (devolve a falha na resposta).
 * Os formatos variam por rotina; aqui só se procura o que é comum a todos.
 */
function avisoDeFalha(r: unknown): string | undefined {
  if (!r || typeof r !== 'object') return undefined
  const o = r as Record<string, unknown>
  if (o.consultaFalhou === true) return String(o.mensagemFalha || 'a nova consulta falhou')
  if (o.sucesso === false) return String(o.mensagem || o.erro || o.mensagemApi || 'a nova consulta falhou')
  return undefined
}

interface ClienteDoc { id: string; razao_social: string; cidade: string | null }

@Injectable()
export class CompilarCertidoesService {
  constructor(
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(CndService) private readonly cndService: CndService,
    @Inject(CndEstadualService) private readonly estadualService: CndEstadualService,
    @Inject(CndMunicipalService) private readonly municipalService: CndMunicipalService,
    @Inject(CndtTrabalhistaService) private readonly trabalhistaService: CndtTrabalhistaService,
    @Inject(CrfFgtsService) private readonly fgtsService: CrfFgtsService,
    @Inject(CguCertidaoService) private readonly cguService: CguCertidaoService,
    @Inject(AlvaraBombeirosService) private readonly alvaraService: AlvaraBombeirosService,
    @Inject(AlvaraFuncionamentoService) private readonly alvaraFuncService: AlvaraFuncionamentoService,
  ) {}

  /**
   * Progresso por empresa + usuário (chave `${empresaId}:${userId}`). Era um
   * singleton: a tela de qualquer usuário, de qualquer escritório, recebia os
   * PDFs da última compilação de outro — e o e-mail anexava esses PDFs.
   */
  private readonly progress = new PorEmpresa<CompilarProgress>(() => ({ status: 'idle', items: [], current: 0, total: 0 }))

  private chave(empresaId: string, userId: string | undefined) { return `${empresaId}:${userId ?? ''}` }

  getProgress(empresaId: string, userId: string | undefined): CompilarProgress {
    const p = this.progress.get(this.chave(exigirEmpresa(empresaId), userId))
    return { ...p, items: p.items.map(i => ({ ...i })) }
  }

  private async buscarCliente(empresaId: string, doc: string): Promise<ClienteDoc | null> {
    const rows = await prisma.$queryRawUnsafe<ClienteDoc[]>(
      `SELECT id, razao_social, cidade FROM clientes
       WHERE status = 'ATIVO' AND empresa_id = $1 AND ${docSql('documento')} = $2 LIMIT 1`, empresaId, doc,
    )
    return rows[0] || null
  }

  /**
   * Compila as certidões de um documento.
   *
   * O router chama SEM await (a tela acompanha por `getProgress`). Por isso
   * este método NUNCA rejeita: todo o corpo, inclusive a primeira query, fica
   * dentro de try/catch — uma rejeição solta derrubaria o processo
   * (unhandledRejection) e deixaria o progresso preso em "running".
   */
  async compilar(empresaId: string, userId: string | undefined, documento: string, tipos: CertidaoTipo[], forcarNova: boolean): Promise<void> {
    const doc = limparDoc(documento)
    let progress: CompilarProgress | null = null
    try {
      exigirEmpresa(empresaId)
      const chave = this.chave(empresaId, userId)
      if (this.progress.get(chave).status === 'running') {
        logger.warn(`Compilação já em andamento para ${chave} — pedido ignorado`)
        return
      }
      // Estado montado antes do primeiro await: a tela já vê "running" na hora.
      progress = {
        status: 'running',
        items: tipos.map(t => ({ tipo: t, label: LABELS[t], status: 'pendente' as const })),
        current: 0,
        total: tipos.length,
        documento: doc,
      }
      this.progress.set(chave, progress)

      const cli = await this.buscarCliente(empresaId, doc)
      const clienteId = cli?.id
      const municipio = cli?.cidade || 'VITÓRIA'
      progress.razaoSocial = cli?.razao_social || doc

      for (let i = 0; i < tipos.length; i++) {
        const tipo = tipos[i]!
        const item = progress.items[i]!
        progress.current = i + 1
        item.status = 'processando'
        await this.processarItem(empresaId, item, tipo, doc, municipio, clienteId, userId, forcarNova)
      }
    } catch (e) {
      logger.error(`Falha ao compilar …${doc.slice(-4)}: ${(e as Error).message}`)
      if (progress) {
        for (const it of progress.items) {
          if (it.status === 'pendente' || it.status === 'processando') { it.status = 'falha'; it.mensagem = (e as Error).message }
        }
      }
    } finally {
      if (progress) progress.status = 'done'
    }
  }

  /**
   * Reprocessa um único item sem perder os demais do progresso.
   * Também chamado sem await pelo router: NUNCA rejeita (mesmo motivo de `compilar`).
   */
  async reprocessarItem(empresaId: string, userId: string | undefined, documento: string, tipo: CertidaoTipo, itemIndex: number): Promise<void> {
    const doc = limparDoc(documento)
    let progress: CompilarProgress | null = null
    try {
      exigirEmpresa(empresaId)
      progress = this.progress.get(this.chave(empresaId, userId))
      const item = progress.items[itemIndex]
      // Só reprocessa item do mesmo documento e do mesmo tipo da compilação desta pessoa.
      if (!item || item.tipo !== tipo || (progress.documento && progress.documento !== doc)) {
        logger.warn(`Reprocessamento ignorado: item ${itemIndex} não corresponde à compilação atual`)
        progress = null
        return
      }

      item.status = 'processando'
      item.mensagem = undefined
      item.pdfBase64 = undefined
      item.situacao = undefined
      progress.status = 'running'
      progress.current = itemIndex + 1

      const cli = await this.buscarCliente(empresaId, doc)
      await this.processarItem(empresaId, item, tipo, doc, cli?.cidade || 'VITÓRIA', cli?.id, userId, true)
    } catch (e) {
      logger.error(`Falha ao reprocessar ${tipo} de …${doc.slice(-4)}: ${(e as Error).message}`)
      const item = progress?.items[itemIndex]
      if (item && item.status === 'processando') { item.status = 'falha'; item.mensagem = (e as Error).message }
    } finally {
      if (progress) progress.status = 'done'
    }
  }

  /** Um item da compilação. Não lança: a falha vira status do item. */
  private async processarItem(
    empresaId: string, item: CompilarItem, tipo: CertidaoTipo, doc: string, municipio: string,
    clienteId: string | undefined, userId: string | undefined, forcarNova: boolean,
  ): Promise<void> {
    try {
      let pdfBase64: string | null = null
      let aviso: string | undefined

      if (!forcarNova) {
        // Reaproveita certidão existente — só se ainda estiver válida.
        pdfBase64 = await this.buscarExistente(empresaId, tipo, doc, municipio)
      }

      if (!pdfBase64) {
        const nova = await this.gerarNova(empresaId, tipo, doc, municipio, clienteId, userId)
        pdfBase64 = nova.pdf
        aviso = nova.aviso
      }

      const situacao = await this.buscarSituacao(empresaId, tipo, doc, municipio)
      item.situacao = situacao

      if (pdfBase64) {
        item.status = 'sucesso'
        item.pdfBase64 = pdfBase64
        item.mensagem = aviso
          ? `${situacao || 'Certidão anterior válida'} — a nova consulta falhou (${aviso}); mantida a certidão anterior`
          : (situacao || 'PDF obtido com sucesso')
      } else if (aviso) {
        item.status = 'falha'
        item.mensagem = aviso
      } else {
        item.status = 'sem_pdf'
        item.mensagem = situacao || 'Certidão emitida mas PDF não disponível'
      }
    } catch (e) {
      item.status = 'falha'
      item.mensagem = (e as Error).message
    }
  }

  private async buscarSituacao(empresaId: string, tipo: CertidaoTipo, doc: string, municipio: string): Promise<string | null> {
    try {
      switch (tipo) {
        case 'federal': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem_api: string | null }>>(
            `SELECT tipo_certidao, mensagem_api FROM certidoes_cnd WHERE empresa_id = $1 AND documento = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, empresaId, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem_api || null
        }
        case 'estadual': {
          const rows = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; mensagem: string | null }>>(
            `SELECT sucesso, mensagem FROM certidoes_cnd_estadual WHERE empresa_id = $1 AND documento = $2 ORDER BY created_at DESC LIMIT 1`, empresaId, doc,
          )
          return rows[0]?.sucesso ? 'Negativa' : (rows[0]?.mensagem || 'Não emitida')
        }
        case 'municipal': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem: string | null }>>(
            `SELECT tipo_certidao, mensagem FROM certidoes_cnd_municipal WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3) ORDER BY created_at DESC LIMIT 1`, empresaId, doc, municipio,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem || null
        }
        case 'trabalhista': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem: string | null }>>(
            `SELECT tipo_certidao, mensagem FROM certidoes_cndt WHERE empresa_id = $1 AND documento = $2 ORDER BY created_at DESC LIMIT 1`, empresaId, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem || null
        }
        case 'fgts': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem: string | null }>>(
            `SELECT tipo_certidao, mensagem FROM certidoes_crf_fgts WHERE empresa_id = $1 AND documento = $2 ORDER BY created_at DESC LIMIT 1`, empresaId, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem || null
        }
        case 'cgu': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; situacao: string | null }>>(
            `SELECT tipo_certidao, situacao FROM certidoes_cgu WHERE empresa_id = $1 AND documento = $2 ORDER BY created_at DESC LIMIT 1`, empresaId, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.situacao || null
        }
        case 'alvara_bombeiros': {
          const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
            `SELECT status FROM alvaras_bombeiros WHERE empresa_id = $1 AND ${docSql('documento')} = $2 ORDER BY created_at DESC LIMIT 1`, empresaId, doc,
          )
          return rows[0]?.status || null
        }
        case 'alvara_funcionamento': {
          const rows = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; mensagem: string | null }>>(
            `SELECT sucesso, mensagem FROM alvaras_funcionamento WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3) ORDER BY created_at DESC LIMIT 1`, empresaId, doc, municipio,
          )
          return rows[0]?.sucesso ? 'Emitido' : (rows[0]?.mensagem || 'Não emitido')
        }
        default: return null
      }
    } catch { return null }
  }

  /**
   * PDF da última certidão bem-sucedida DESTA empresa e AINDA VÁLIDA. Antes
   * devolvia a última com sucesso, mesmo vencida — e a compilação mandava ao
   * cliente uma certidão vencida como se fosse atual.
   */
  private async buscarExistente(empresaId: string, tipo: CertidaoTipo, doc: string, municipio: string): Promise<string | null> {
    const umPdf = async (sql: string, ...params: unknown[]) => {
      const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(sql, ...params).catch(() => [])
      return rows[0]?.pdf_base64 || null
    }
    switch (tipo) {
      case 'federal':
        // data_validade é TIMESTAMPTZ aqui: compara a DATA.
        return umPdf(
          `SELECT pdf_base64 FROM certidoes_cnd WHERE empresa_id = $1 AND documento = $2 AND sucesso = true AND deleted_at IS NULL
           AND (data_validade IS NULL OR data_validade::date >= CURRENT_DATE) ORDER BY created_at DESC LIMIT 1`, empresaId, doc)
      case 'estadual':
        return umPdf(
          `SELECT pdf_base64 FROM certidoes_cnd_estadual WHERE empresa_id = $1 AND documento = $2 AND sucesso = true
           AND created_at >= NOW() - INTERVAL '${IDADE_MAX_SEM_VALIDADE.estadual} days' ORDER BY created_at DESC LIMIT 1`, empresaId, doc)
      case 'municipal':
        return umPdf(
          `SELECT pdf_base64 FROM certidoes_cnd_municipal WHERE empresa_id = $1 AND documento = $2 AND sucesso = true AND UPPER(municipio) = UPPER($3)
           AND (data_validade IS NULL OR data_validade >= CURRENT_DATE) ORDER BY created_at DESC LIMIT 1`, empresaId, doc, municipio)
      case 'trabalhista':
        return umPdf(
          `SELECT pdf_base64 FROM certidoes_cndt WHERE empresa_id = $1 AND documento = $2 AND sucesso = true
           AND (data_validade IS NULL OR data_validade >= CURRENT_DATE) ORDER BY created_at DESC LIMIT 1`, empresaId, doc)
      case 'fgts':
        return umPdf(
          `SELECT pdf_base64 FROM certidoes_crf_fgts WHERE empresa_id = $1 AND documento = $2 AND sucesso = true
           AND (data_validade IS NULL OR data_validade >= CURRENT_DATE) ORDER BY created_at DESC LIMIT 1`, empresaId, doc)
      case 'cgu':
        return umPdf(
          `SELECT pdf_base64 FROM certidoes_cgu WHERE empresa_id = $1 AND documento = $2 AND sucesso = true
           AND COALESCE(data_consulta, created_at) >= NOW() - INTERVAL '${IDADE_MAX_SEM_VALIDADE.cgu} days' ORDER BY created_at DESC LIMIT 1`, empresaId, doc)
      case 'alvara_bombeiros': {
        // Validade gravada como texto: confere em código (data inválida/ausente = aceita, como antes).
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null; data_fim_validade: string | null }>>(
          `SELECT pdf_base64, data_fim_validade FROM alvaras_bombeiros WHERE empresa_id = $1 AND ${docSql('documento')} = $2 AND status = 'Regular'
           ORDER BY created_at DESC LIMIT 1`, empresaId, doc,
        ).catch(() => [])
        const r = rows[0]
        if (!r?.pdf_base64) return null
        const fim = dataIso(r.data_fim_validade)
        if (fim && fim < hojeBrasilia()) return null
        return r.pdf_base64
      }
      case 'alvara_funcionamento':
        return umPdf(
          `SELECT pdf_base64 FROM alvaras_funcionamento WHERE empresa_id = $1 AND documento = $2 AND sucesso = true AND UPPER(municipio) = UPPER($3)
           AND created_at >= NOW() - INTERVAL '${IDADE_MAX_SEM_VALIDADE.alvara_funcionamento} days' ORDER BY created_at DESC LIMIT 1`, empresaId, doc, municipio)
      default: return null
    }
  }

  private async gerarNova(
    empresaId: string, tipo: CertidaoTipo, doc: string, municipio: string, clienteId?: string, userId?: string,
  ): Promise<{ pdf: string | null; aviso?: string }> {
    let r: unknown
    switch (tipo) {
      case 'federal': {
        // Convenção do CndService (SERPRO): 1 = CNPJ, 2 = CPF. Antes ia sempre 1.
        r = await this.cndService.consultar(empresaId, doc, doc.length === 11 ? 2 : 1, { clienteId, userId })
        break
      }
      case 'estadual':
        r = await this.estadualService.consultar(empresaId, doc, clienteId, userId)
        break
      case 'municipal': {
        const mun = municipio.toUpperCase()
        if (mun === 'VITÓRIA' || mun === 'VITORIA') r = await this.municipalService.consultarVitoria(empresaId, doc, clienteId, userId)
        else if (mun === 'VILA VELHA') r = await this.municipalService.consultarVilaVelha(empresaId, doc, clienteId, userId)
        else if (mun === 'SERRA') r = await this.municipalService.consultarSerra(empresaId, doc, clienteId, userId)
        else if (mun === 'CARIACICA') r = await this.municipalService.consultarCariacica(empresaId, doc, clienteId, userId)
        else throw new Error(`Município "${municipio}" não suportado`)
        break
      }
      case 'trabalhista':
        r = await this.trabalhistaService.consultar(empresaId, doc, clienteId, userId)
        break
      case 'fgts':
        r = await this.fgtsService.consultar(empresaId, doc, clienteId, userId)
        break
      case 'cgu':
        r = await this.cguService.consultar(empresaId, doc, clienteId, userId)
        break
      case 'alvara_bombeiros': {
        // Alvará busca por razão social — precisamos do nome (cliente desta empresa)
        if (clienteId) {
          const cli = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId }, select: { razaoSocial: true } })
          if (cli?.razaoSocial) r = await this.alvaraService.consultar(empresaId, cli.razaoSocial, clienteId, userId)
        }
        break
      }
      case 'alvara_funcionamento':
        r = await this.alvaraFuncService.consultar(empresaId, doc, municipio, clienteId, userId)
        break
      default: return { pdf: null }
    }
    return { pdf: await this.buscarExistente(empresaId, tipo, doc, municipio), aviso: avisoDeFalha(r) }
  }

  /**
   * Envia por e-mail as certidões compiladas por ESTA pessoa para ESTE
   * documento. Os PDFs saem do banco, filtrados por empresa e documento —
   * nunca da memória (que era global e podia ser de outro escritório).
   */
  async enviarEmail(empresaId: string, userId: string | undefined, to: string, documento: string, razaoSocial: string): Promise<boolean> {
    exigirEmpresa(empresaId)
    const doc = limparDoc(documento)
    const progress = this.progress.get(this.chave(empresaId, userId))
    if (progress.documento !== doc || progress.items.length === 0) {
      throw new Error('Compile as certidões deste documento antes de enviar.')
    }

    const cli = await this.buscarCliente(empresaId, doc).catch(() => null)
    const municipio = cli?.cidade || 'VITÓRIA'
    // Nome do cadastro tem precedência sobre o digitado (o e-mail vai ao cliente).
    const nome = cli?.razao_social || razaoSocial

    const anexos: Array<{ item: CompilarItem; pdf: string }> = []
    for (const item of progress.items) {
      if (item.status !== 'sucesso') continue
      const pdf = await this.buscarExistente(empresaId, item.tipo, doc, municipio)
      if (pdf) anexos.push({ item, pdf })
    }
    if (anexos.length === 0) throw new Error('Nenhum PDF disponível para envio')

    const attachments = anexos.map(({ item, pdf }) => ({
      filename: `${item.label.replace(/[^a-zA-Z0-9]/g, '_')}_${doc}.pdf`,
      content: Buffer.from(pdf, 'base64'),
    }))

    const cnpjFormatado = doc.length === 14 ? `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12, 14)}` : doc // preserva letras
    const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    const totalAnexos = anexos.length

    const statusColor = (item: CompilarItem) => {
      if (item.status === 'falha') return '#ef4444'
      if (item.status === 'sem_pdf') return '#f59e0b'
      // Situação da certidão
      const sit = (item.situacao || '').toLowerCase()
      if (sit.includes('negativa') && !sit.includes('positiva')) return '#16a34a'
      if (sit.includes('nada consta')) return '#16a34a'
      if (sit.includes('regular')) return '#16a34a'
      if (sit.includes('positiva')) return '#f59e0b'
      if (sit.includes('irregular') || sit.includes('consta')) return '#ef4444'
      return '#16a34a'
    }

    const statusText = (item: CompilarItem) => {
      if (item.status === 'falha') return `✗ ${item.mensagem || 'Falha na emissão'}`
      if (item.status === 'sem_pdf') return `⚠ ${item.situacao || 'Sem PDF disponível'}`
      return item.situacao || 'Emitida'
    }

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">Certidões e Alvarás</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Documentos compilados automaticamente</p>
        </div>

        <!-- Body -->
        <div style="padding: 24px 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
            Prezado(a),
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
            Seguem em anexo as certidões e alvarás solicitados referentes à empresa abaixo identificada.
            Este e-mail contém <strong>${totalAnexos} documento(s)</strong> em formato PDF.
          </p>

          <!-- Dados do cliente -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 4px; font-size: 14px;"><strong style="color: #1e293b;">${esc(nome)}</strong></p>
            <p style="margin: 0; font-size: 13px; color: #64748b;">CNPJ: <strong>${esc(cnpjFormatado)}</strong></p>
          </div>

          <!-- Tabela de status -->
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="text-align: left; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 600;">Certidão / Alvará</th>
                <th style="text-align: left; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 600;">Situação</th>
              </tr>
            </thead>
            <tbody>
              ${progress.items.map(i => `
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155;">${esc(i.label)}</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: ${statusColor(i)}; font-weight: 500;">${esc(statusText(i))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <p style="font-size: 12px; color: #94a3b8; margin: 0 0 4px;">
            Data da consulta: ${esc(dataAtual)}
          </p>
          <p style="font-size: 11px; color: #cbd5e1; margin: 16px 0 0; padding-top: 16px; border-top: 1px solid #f1f5f9;">
            Este e-mail foi gerado automaticamente pelo <strong>OneClick ERP</strong>. Em caso de dúvidas, entre em contato com o responsável.
          </p>
        </div>
      </div>
    `

    return this.email.sendMail({
      to,
      // Assunto é cabeçalho: sem quebra de linha vinda do nome digitado.
      subject: `Certidões e Alvarás — ${nome.replace(/[\r\n]+/g, ' ')} — ${cnpjFormatado}`,
      html,
      from: `OneClick <${process.env.SMTP_USER || 'sistema@oneclick.com.br'}>`,
      attachments,
    })
  }
}
