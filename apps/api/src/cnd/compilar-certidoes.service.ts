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

  private progress: CompilarProgress = { status: 'idle', items: [], current: 0, total: 0 }

  getProgress(): CompilarProgress { return { ...this.progress, items: [...this.progress.items] } }

  async compilar(documento: string, tipos: CertidaoTipo[], forcarNova: boolean, userId?: string): Promise<void> {
    const doc = documento.replace(/\D/g, '')
    this.progress = {
      status: 'running',
      items: tipos.map(t => ({ tipo: t, label: LABELS[t], status: 'pendente' as const })),
      current: 0,
      total: tipos.length,
    }

    // Resolver cliente
    const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string; cidade: string | null }>>(
      `SELECT id, razao_social, cidade FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
    ).then(rows => rows[0] || null)

    const clienteId = cli?.id
    const municipio = cli?.cidade || 'VITÓRIA'
    this.progress.razaoSocial = cli?.razao_social || doc

    for (let i = 0; i < tipos.length; i++) {
      const tipo = tipos[i]!
      this.progress.current = i + 1
      this.progress.items[i]!.status = 'processando'

      try {
        let pdfBase64: string | null = null

        if (!forcarNova) {
          // Tentar buscar existente
          pdfBase64 = await this.buscarExistente(tipo, doc, municipio)
        }

        if (!pdfBase64) {
          // Gerar nova
          pdfBase64 = await this.gerarNova(tipo, doc, municipio, clienteId, userId)
        }

        // Buscar situação da certidão no banco
        const situacao = await this.buscarSituacao(tipo, doc, municipio)
        this.progress.items[i]!.situacao = situacao

        if (pdfBase64) {
          this.progress.items[i]!.status = 'sucesso'
          this.progress.items[i]!.pdfBase64 = pdfBase64
          this.progress.items[i]!.mensagem = situacao || 'PDF obtido com sucesso'
        } else {
          this.progress.items[i]!.status = 'sem_pdf'
          this.progress.items[i]!.mensagem = situacao || 'Certidão emitida mas PDF não disponível'
        }
      } catch (e) {
        this.progress.items[i]!.status = 'falha'
        this.progress.items[i]!.mensagem = (e as Error).message
      }
    }

    this.progress.status = 'done'
  }

  /** Reprocessa um único item sem perder os demais do progresso */
  async reprocessarItem(documento: string, tipo: CertidaoTipo, itemIndex: number, userId?: string): Promise<void> {
    const doc = documento.replace(/\D/g, '')

    // Marcar item como processando
    if (this.progress.items[itemIndex]) {
      this.progress.items[itemIndex]!.status = 'processando'
      this.progress.items[itemIndex]!.mensagem = undefined
      this.progress.items[itemIndex]!.pdfBase64 = undefined
      this.progress.items[itemIndex]!.situacao = undefined
    }
    this.progress.status = 'running'
    this.progress.current = itemIndex + 1

    const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string; cidade: string | null }>>(
      `SELECT id, razao_social, cidade FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
    ).then(rows => rows[0] || null)

    const clienteId = cli?.id
    const municipio = cli?.cidade || 'VITÓRIA'

    try {
      const pdfBase64 = await this.gerarNova(tipo, doc, municipio, clienteId, userId)
      const situacao = await this.buscarSituacao(tipo, doc, municipio)

      if (this.progress.items[itemIndex]) {
        this.progress.items[itemIndex]!.situacao = situacao
        if (pdfBase64) {
          this.progress.items[itemIndex]!.status = 'sucesso'
          this.progress.items[itemIndex]!.pdfBase64 = pdfBase64
          this.progress.items[itemIndex]!.mensagem = situacao || 'PDF obtido com sucesso'
        } else {
          this.progress.items[itemIndex]!.status = 'sem_pdf'
          this.progress.items[itemIndex]!.mensagem = situacao || 'Certidão emitida mas PDF não disponível'
        }
      }
    } catch (e) {
      if (this.progress.items[itemIndex]) {
        this.progress.items[itemIndex]!.status = 'falha'
        this.progress.items[itemIndex]!.mensagem = (e as Error).message
      }
    }

    this.progress.status = 'done'
  }

  private async buscarSituacao(tipo: CertidaoTipo, doc: string, municipio: string): Promise<string | null> {
    try {
      switch (tipo) {
        case 'federal': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem_api: string | null }>>(
            `SELECT tipo_certidao, mensagem_api FROM certidoes_cnd WHERE documento = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem_api || null
        }
        case 'estadual': {
          const rows = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; mensagem: string | null }>>(
            `SELECT sucesso, mensagem FROM certidoes_cnd_estadual WHERE documento = $1 ORDER BY created_at DESC LIMIT 1`, doc,
          )
          return rows[0]?.sucesso ? 'Negativa' : (rows[0]?.mensagem || 'Não emitida')
        }
        case 'municipal': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem: string | null }>>(
            `SELECT tipo_certidao, mensagem FROM certidoes_cnd_municipal WHERE documento = $1 AND UPPER(municipio) = UPPER($2) ORDER BY created_at DESC LIMIT 1`, doc, municipio,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem || null
        }
        case 'trabalhista': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem: string | null }>>(
            `SELECT tipo_certidao, mensagem FROM certidoes_cndt WHERE documento = $1 ORDER BY created_at DESC LIMIT 1`, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem || null
        }
        case 'fgts': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; mensagem: string | null }>>(
            `SELECT tipo_certidao, mensagem FROM certidoes_crf_fgts WHERE documento = $1 ORDER BY created_at DESC LIMIT 1`, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.mensagem || null
        }
        case 'cgu': {
          const rows = await prisma.$queryRawUnsafe<Array<{ tipo_certidao: string | null; situacao: string | null }>>(
            `SELECT tipo_certidao, situacao FROM certidoes_cgu WHERE documento = $1 ORDER BY created_at DESC LIMIT 1`, doc,
          )
          return rows[0]?.tipo_certidao || rows[0]?.situacao || null
        }
        case 'alvara_bombeiros': {
          const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
            `SELECT status FROM alvaras_bombeiros WHERE REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 ORDER BY created_at DESC LIMIT 1`, doc,
          )
          return rows[0]?.status || null
        }
        case 'alvara_funcionamento': {
          const rows = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; mensagem: string | null }>>(
            `SELECT sucesso, mensagem FROM alvaras_funcionamento WHERE documento = $1 AND UPPER(municipio) = UPPER($2) ORDER BY created_at DESC LIMIT 1`, doc, municipio,
          )
          return rows[0]?.sucesso ? 'Emitido' : (rows[0]?.mensagem || 'Não emitido')
        }
        default: return null
      }
    } catch { return null }
  }

  private async buscarExistente(tipo: CertidaoTipo, doc: string, municipio: string): Promise<string | null> {
    switch (tipo) {
      case 'federal': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM certidoes_cnd WHERE documento = $1 AND sucesso = true AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, doc,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      case 'estadual': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM certidoes_cnd_estadual WHERE documento = $1 AND sucesso = true ORDER BY created_at DESC LIMIT 1`, doc,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      case 'municipal': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM certidoes_cnd_municipal WHERE documento = $1 AND sucesso = true AND UPPER(municipio) = UPPER($2) ORDER BY created_at DESC LIMIT 1`, doc, municipio,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      case 'trabalhista': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM certidoes_cndt WHERE documento = $1 AND sucesso = true ORDER BY created_at DESC LIMIT 1`, doc,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      case 'fgts': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM certidoes_crf_fgts WHERE documento = $1 AND sucesso = true ORDER BY created_at DESC LIMIT 1`, doc,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      case 'cgu': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM certidoes_cgu WHERE documento = $1 AND sucesso = true ORDER BY created_at DESC LIMIT 1`, doc,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      case 'alvara_bombeiros': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM alvaras_bombeiros WHERE REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 AND status = 'Regular' ORDER BY created_at DESC LIMIT 1`, doc,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      case 'alvara_funcionamento': {
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM alvaras_funcionamento WHERE documento = $1 AND sucesso = true AND UPPER(municipio) = UPPER($2) ORDER BY created_at DESC LIMIT 1`, doc, municipio,
        ).catch(() => [])
        return rows[0]?.pdf_base64 || null
      }
      default: return null
    }
  }

  private async gerarNova(tipo: CertidaoTipo, doc: string, municipio: string, clienteId?: string, userId?: string): Promise<string | null> {
    switch (tipo) {
      case 'federal': {
        await this.cndService.consultar(doc, 1, { clienteId, userId })
        return this.buscarExistente('federal', doc, municipio)
      }
      case 'estadual': {
        await this.estadualService.consultar(doc, clienteId, userId)
        return this.buscarExistente('estadual', doc, municipio)
      }
      case 'municipal': {
        const mun = municipio.toUpperCase()
        if (mun === 'VITÓRIA' || mun === 'VITORIA') await this.municipalService.consultarVitoria(doc, clienteId, userId)
        else if (mun === 'VILA VELHA') await this.municipalService.consultarVilaVelha(doc, clienteId, userId)
        else if (mun === 'SERRA') await this.municipalService.consultarSerra(doc, clienteId, userId)
        else if (mun === 'CARIACICA') await this.municipalService.consultarCariacica(doc, clienteId, userId)
        else throw new Error(`Município "${municipio}" não suportado`)
        return this.buscarExistente('municipal', doc, municipio)
      }
      case 'trabalhista': {
        await this.trabalhistaService.consultar(doc, clienteId, userId)
        return this.buscarExistente('trabalhista', doc, municipio)
      }
      case 'fgts': {
        await this.fgtsService.consultar(doc, clienteId, userId)
        return this.buscarExistente('fgts', doc, municipio)
      }
      case 'cgu': {
        await this.cguService.consultar(doc, clienteId, userId)
        return this.buscarExistente('cgu', doc, municipio)
      }
      case 'alvara_bombeiros': {
        // Alvará busca por razão social — precisamos do nome
        if (clienteId) {
          const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } })
          if (cli?.razaoSocial) await this.alvaraService.consultar(cli.razaoSocial, clienteId, userId)
        }
        return this.buscarExistente('alvara_bombeiros', doc, municipio)
      }
      case 'alvara_funcionamento': {
        await this.alvaraFuncService.consultar(doc, municipio, clienteId, userId)
        return this.buscarExistente('alvara_funcionamento', doc, municipio)
      }
      default: return null
    }
  }

  async enviarEmail(to: string, documento: string, razaoSocial: string): Promise<boolean> {
    const doc = documento.replace(/\D/g, '')

    // Buscar PDFs do banco para os itens com sucesso (mais confiável que manter em memória)
    const cli = await prisma.$queryRawUnsafe<Array<{ cidade: string | null }>>(
      `SELECT cidade FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
    ).catch(() => [])
    const municipio = cli[0]?.cidade || 'VITÓRIA'

    for (const item of this.progress.items) {
      if (item.status === 'sucesso' && !item.pdfBase64) {
        item.pdfBase64 = await this.buscarExistente(item.tipo, doc, municipio)
      }
    }

    const items = this.progress.items.filter(i => i.status === 'sucesso' && i.pdfBase64)
    if (items.length === 0) throw new Error('Nenhum PDF disponível para envio')

    const attachments = items.map(item => ({
      filename: `${item.label.replace(/[^a-zA-Z0-9]/g, '_')}_${documento}.pdf`,
      content: Buffer.from(item.pdfBase64!, 'base64'),
    }))

    const _cd = (documento || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); const cnpjFormatado = _cd.length === 14 ? `${_cd.slice(0,2)}.${_cd.slice(2,5)}.${_cd.slice(5,8)}/${_cd.slice(8,12)}-${_cd.slice(12,14)}` : documento // preserva letras
    const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const totalAnexos = items.length

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
            <p style="margin: 0 0 4px; font-size: 14px;"><strong style="color: #1e293b;">${razaoSocial}</strong></p>
            <p style="margin: 0; font-size: 13px; color: #64748b;">CNPJ: <strong>${cnpjFormatado}</strong></p>
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
              ${this.progress.items.map(i => `
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155;">${i.label}</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: ${statusColor(i)}; font-weight: 500;">${statusText(i)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <p style="font-size: 12px; color: #94a3b8; margin: 0 0 4px;">
            Data da consulta: ${dataAtual}
          </p>
          <p style="font-size: 11px; color: #cbd5e1; margin: 16px 0 0; padding-top: 16px; border-top: 1px solid #f1f5f9;">
            Este e-mail foi gerado automaticamente pelo <strong>OneClick ERP</strong>. Em caso de dúvidas, entre em contato com o responsável.
          </p>
        </div>
      </div>
    `

    return this.email.sendMail({
      to,
      subject: `Certidões e Alvarás — ${razaoSocial} — ${cnpjFormatado}`,
      html,
      from: `OneClick <${process.env.SMTP_USER || 'sistema@oneclick.com.br'}>`,
      attachments,
    })
  }
}
