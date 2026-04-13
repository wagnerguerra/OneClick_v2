import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Dados de um sócio retornado pela consulta de QSA.
 */
export interface QsaSocio {
  nome: string
  cpfCnpj: string
  qualificacao: string
  codigoQualificacao: number
  dataEntrada: string | null
  percentualCapital: number | null
  faixaEtaria: string | null
}

/**
 * Resultado da consulta de CNPJ.
 */
export interface CnpjResult {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  situacao: string
  dataAbertura: string | null

  // Endereço
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null

  // Fiscal
  naturezaJuridica: string | null
  atividadePrincipal: string | null
  porte: string | null

  // QSA
  qsa: QsaSocio[]

  // Fonte da consulta
  fonte: 'serpro' | 'brasilapi'
}

/**
 * Mapa de código de qualificação SERPRO → TipoSocio do sistema.
 * Referência: tabela de qualificação de sócios da Receita Federal.
 */
const QUALIFICACAO_MAP: Record<number, string> = {
  5:  'SOCIO_ADMINISTRADOR',     // Administrador
  8:  'PROCURADOR',              // Conselheiro de Administração
  10: 'SOCIO_DIRETOR',           // Diretor
  16: 'REPRESENTANTE_LEGAL',     // Presidente
  22: 'SOCIO_QUOTISTA',          // Sócio
  49: 'SOCIO_ADMINISTRADOR',     // Sócio-Administrador
  50: 'SOCIO_QUOTISTA',          // Sócio Comanditado (sociedade em comandita)
  52: 'SOCIO_QUOTISTA',          // Sócio com Capital
  54: 'TITULAR',                 // Titular (Empresa Individual)
  55: 'SOCIO_QUOTISTA',          // Sócio Comanditário
  65: 'TITULAR',                 // Titular Pessoa Física Residente no Exterior
}

@Injectable()
export class CnpjService {
  /**
   * Consulta dados do CNPJ via BrasilAPI (gratuita) ou SERPRO (se configurado).
   * Retorna dados cadastrais + QSA (quadro de sócios e administradores).
   *
   * Futuramente: se CONSUMER_KEY do SERPRO estiver configurado,
   * usar a API do SERPRO diretamente para dados mais completos.
   */
  /**
   * Obtém o token OAuth do SERPRO usando Consumer Key/Secret.
   */
  private async getSerproToken(consumerKey: string, consumerSecret: string): Promise<string> {
    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    const res = await fetch('https://gateway.apiserpro.serpro.gov.br/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    if (!res.ok) throw new Error(`Falha na autenticação SERPRO: HTTP ${res.status}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    return data.access_token
  }

  /**
   * Consulta CNPJ via API do SERPRO (dados completos com CPF dos sócios).
   * Documentação: https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/
   *
   * Endpoint: /consulta-cnpj-df/v2/empresa/{cnpj}  (retorna dados completos + QSA com CPF)
   * Resposta: { ni, nomeEmpresarial, nomeFantasia, situacaoCadastral: { codigo, data, motivo },
   *   endereco: { logradouro, numero, cep, bairro, municipio: { descricao }, uf },
   *   socios: [{ tipoSocio, cpf, nome, qualificacao, dataInclusao, representanteLegal: { cpf, nome, qualificacao } }] }
   */
  private async consultarViaSerpro(cnpj: string, consumerKey: string, consumerSecret: string): Promise<CnpjResult> {
    const token = await this.getSerproToken(consumerKey, consumerSecret)

    const res = await fetch(`https://gateway.apiserpro.serpro.gov.br/consulta-cnpj-df/v2/empresa/${cnpj}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      if (res.status === 404) throw new Error('CNPJ não encontrado na base do SERPRO.')
      const body = await res.text().catch(() => '')
      throw new Error(`Erro na consulta SERPRO: HTTP ${res.status} — ${body.slice(0, 200)}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()

    // Campo de sócios no SERPRO v2 é "socios" (array)
    // Cada sócio: { tipoSocio, cpf, nome, qualificacao, dataInclusao, pais, representanteLegal }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socios: any[] = data.socios || []

    // Mapa de qualificação SERPRO (código → descrição)
    const qualificacaoMap: Record<string, string> = {
      '05': 'Administrador', '08': 'Conselheiro de Administração', '10': 'Diretor',
      '16': 'Presidente', '22': 'Sócio', '49': 'Sócio-Administrador',
      '50': 'Sócio Comanditado', '52': 'Sócio com Capital', '54': 'Titular',
      '55': 'Sócio Comanditário', '65': 'Titular Pessoa Física Residente no Exterior',
    }

    const qsa: QsaSocio[] = socios.map((s: any) => {
      const codigoQual = String(s.qualificacao || '0')
      const descricaoQual = qualificacaoMap[codigoQual] || `Qualificação ${codigoQual}`

      return {
        nome: String(s.nome || ''),
        cpfCnpj: String(s.cpf || ''),
        qualificacao: descricaoQual,
        codigoQualificacao: Number(codigoQual) || 0,
        dataEntrada: s.dataInclusao ? String(s.dataInclusao) : null,
        percentualCapital: null,
        faixaEtaria: null,
      }
    })

    // Endereço no SERPRO é um objeto aninhado
    const endereco = data.endereco || {}
    const municipio = endereco.municipio || {}
    const situacao = data.situacaoCadastral || {}
    const natureza = data.naturezaJuridica || {}
    const cnaePrincipal = data.cnaePrincipal || {}

    return {
      cnpj,
      razaoSocial: String(data.nomeEmpresarial || ''),
      nomeFantasia: data.nomeFantasia ? String(data.nomeFantasia) : null,
      situacao: situacao.motivo ? String(situacao.motivo) : (situacao.codigo ? String(situacao.codigo) : ''),
      dataAbertura: data.dataAbertura ? String(data.dataAbertura) : null,
      cep: endereco.cep ? String(endereco.cep) : null,
      logradouro: endereco.logradouro ? String(`${endereco.tipoLogradouro || ''} ${endereco.logradouro || ''}`.trim()) : null,
      numero: endereco.numero ? String(endereco.numero) : null,
      complemento: endereco.complemento ? String(endereco.complemento) : null,
      bairro: endereco.bairro ? String(endereco.bairro) : null,
      municipio: municipio.descricao ? String(municipio.descricao) : null,
      uf: endereco.uf ? String(endereco.uf) : null,
      naturezaJuridica: natureza.descricao ? String(`${natureza.codigo || ''} - ${natureza.descricao}`.trim()) : null,
      atividadePrincipal: cnaePrincipal.descricao ? String(cnaePrincipal.descricao) : null,
      porte: data.porte ? String(data.porte) : null,
      qsa,
      fonte: 'serpro',
    }
  }

  /**
   * Lê valores do .env file (mesmo padrão do AdminService).
   */
  private readEnvValues(): Map<string, string> {
    const envPaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '..', '..', '.env'),
    ]

    for (const envPath of envPaths) {
      if (!fs.existsSync(envPath)) continue
      const content = fs.readFileSync(envPath, 'utf8')
      const values = new Map<string, string>()
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx < 0) continue
        const key = trimmed.slice(0, eqIdx).trim()
        let val = trimmed.slice(eqIdx + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        values.set(key, val)
      }
      return values
    }
    return new Map()
  }

  /**
   * Verifica se as credenciais SERPRO estão configuradas.
   * Lê do .env file (atualizado pelo admin) e do process.env como fallback.
   */
  private getSerproCredentials(): { consumerKey: string; consumerSecret: string } | null {
    const envValues = this.readEnvValues()
    const consumerKey = envValues.get('CONSUMER_KEY') || process.env.CONSUMER_KEY
    const consumerSecret = envValues.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET
    if (consumerKey && consumerSecret) return { consumerKey, consumerSecret }
    return null
  }

  async consultarCnpj(cnpj: string): Promise<CnpjResult> {
    const doc = cnpj.replace(/\D/g, '')
    if (doc.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.')

    const start = Date.now()
    const serpro = this.getSerproCredentials()

    // Se SERPRO estiver configurado, usar preferencialmente
    if (serpro) {
      try {
        const result = await this.consultarViaSerpro(doc, serpro.consumerKey, serpro.consumerSecret)

        await prisma.apiLog.create({
          data: { source: 'serpro', endpoint: `/consulta-cnpj-df/v2/empresa/${doc}`, method: 'GET', status: 200, duration: Date.now() - start, documento: doc },
        }).catch(() => {})

        return result
      } catch (e) {
        await prisma.apiLog.create({
          data: { source: 'serpro', endpoint: `/consulta-cnpj-df/v2/empresa/${doc}`, method: 'GET', status: 500, duration: Date.now() - start, documento: doc },
        }).catch(() => {})

        // Fallback para BrasilAPI se SERPRO falhar
        console.warn(`[CnpjService] SERPRO falhou, tentando BrasilAPI: ${(e as Error).message}`)
      }
    }

    // Fallback: BrasilAPI
    try {
      const result = await this.consultarViaBrasilApi(doc)

      await prisma.apiLog.create({
        data: { source: 'brasilapi', endpoint: `/cnpj/v1/${doc}`, method: 'GET', status: 200, duration: Date.now() - start, documento: doc },
      }).catch(() => {})

      return result
    } catch (e) {
      await prisma.apiLog.create({
        data: { source: 'brasilapi', endpoint: `/cnpj/v1/${doc}`, method: 'GET', status: 500, duration: Date.now() - start, documento: doc },
      }).catch(() => {})

      throw e
    }
  }

  /**
   * Consulta via BrasilAPI (gratuita, sem autenticação).
   */
  private async consultarViaBrasilApi(cnpj: string): Promise<CnpjResult> {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: {
        'User-Agent': 'OneClick-ERP/1.0',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) {
      if (res.status === 404) throw new Error('CNPJ não encontrado na base da Receita Federal.')
      throw new Error(`Erro na consulta: HTTP ${res.status}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()

    // Mapear QSA
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qsa: QsaSocio[] = (data.qsa || []).map((s: any) => ({
      nome: String(s.nome_socio || ''),
      cpfCnpj: String(s.cnpj_cpf_do_socio || ''),
      qualificacao: String(s.qualificacao_socio || ''),
      codigoQualificacao: Number(s.codigo_qualificacao_socio) || 0,
      dataEntrada: s.data_entrada_sociedade ? String(s.data_entrada_sociedade) : null,
      percentualCapital: s.percentual_capital_social != null ? Number(s.percentual_capital_social) : null,
      faixaEtaria: s.faixa_etaria ? String(s.faixa_etaria) : null,
    }))

    return {
      cnpj,
      razaoSocial: String(data.razao_social || ''),
      nomeFantasia: data.nome_fantasia ? String(data.nome_fantasia) : null,
      situacao: String(data.descricao_situacao_cadastral || data.situacao_cadastral || ''),
      dataAbertura: data.data_inicio_atividade ? String(data.data_inicio_atividade) : null,
      cep: data.cep ? String(data.cep) : null,
      logradouro: data.logradouro ? String(data.logradouro) : null,
      numero: data.numero ? String(data.numero) : null,
      complemento: data.complemento ? String(data.complemento) : null,
      bairro: data.bairro ? String(data.bairro) : null,
      municipio: data.municipio ? String(data.municipio) : null,
      uf: data.uf ? String(data.uf) : null,
      naturezaJuridica: data.natureza_juridica ? String(data.natureza_juridica) : null,
      atividadePrincipal: data.cnae_fiscal_descricao ? String(data.cnae_fiscal_descricao) : null,
      porte: data.porte ? String(data.porte) : (data.descricao_porte ? String(data.descricao_porte) : null),
      qsa,
      fonte: 'brasilapi',
    }
  }

  /**
   * Mapeia o código de qualificação da Receita para o TipoSocio do sistema.
   */
  mapQualificacaoToTipoSocio(codigoQualificacao: number): string {
    return QUALIFICACAO_MAP[codigoQualificacao] || 'SOCIO_QUOTISTA'
  }
}
