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

  // Contato (BrasilAPI tem; SERPRO retorna em campos próprios)
  email: string | null
  telefone: string | null

  // Fiscal
  naturezaJuridica: string | null
  atividadePrincipal: string | null
  porte: string | null

  // Capital Social
  capitalSocial: number | null

  // CNAEs
  cnaePrincipalCodigo: string | null
  cnaesSecundarios: Array<{ codigo: string; descricao: string }>

  // QSA
  qsa: QsaSocio[]

  // Fonte da consulta
  fonte: 'serpro' | 'brasilapi'

  // Preenchido quando o gate de custo bloqueou o Serpro e caiu na base gratuita.
  gateAviso?: string
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

    // Contato — SERPRO retorna `correioEletronico` (string) e `telefones` (array
    // de { ddd, numero }). Pegamos o primeiro disponível.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const telefones: any[] = Array.isArray(data.telefones) ? data.telefones : []
    const telefone0 = telefones[0]
    const telefoneStr = telefone0
      ? `${telefone0.ddd ? `(${telefone0.ddd}) ` : ''}${telefone0.numero || ''}`.trim()
      : null

    return {
      cnpj,
      razaoSocial: String(data.nomeEmpresarial || ''),
      nomeFantasia: data.nomeFantasia ? String(data.nomeFantasia) : null,
      situacao: (() => {
        const SITUACAO_MAP: Record<string, string> = { '1': 'NULA', '2': 'ATIVA', '3': 'SUSPENSA', '4': 'INAPTA', '8': 'BAIXADA' }
        const cod = String(situacao.codigo || '')
        const desc = situacao.motivo || SITUACAO_MAP[cod] || ''
        return desc || cod
      })(),
      dataAbertura: data.dataAbertura ? String(data.dataAbertura) : null,
      cep: endereco.cep ? String(endereco.cep) : null,
      logradouro: endereco.logradouro ? String(`${endereco.tipoLogradouro || ''} ${endereco.logradouro || ''}`.trim()) : null,
      numero: endereco.numero ? String(endereco.numero) : null,
      complemento: endereco.complemento ? String(endereco.complemento) : null,
      bairro: endereco.bairro ? String(endereco.bairro) : null,
      municipio: municipio.descricao ? String(municipio.descricao) : null,
      uf: endereco.uf ? String(endereco.uf) : null,
      email: data.correioEletronico ? String(data.correioEletronico).trim() : null,
      telefone: telefoneStr,
      naturezaJuridica: natureza.descricao ? String(`${natureza.codigo || ''} - ${natureza.descricao}`.trim()) : null,
      atividadePrincipal: cnaePrincipal.descricao ? String(cnaePrincipal.descricao) : null,
      porte: (() => {
        const PORTE_MAP: Record<string, string> = { '00': 'Não informado', '01': 'ME', '1': 'ME', '03': 'EPP', '3': 'EPP', '05': 'DEMAIS', '5': 'DEMAIS', '09': 'MEI', '9': 'MEI' }
        const raw = data.porte ? String(data.porte).trim() : ''
        return PORTE_MAP[raw] || raw || null
      })(),
      capitalSocial: data.capitalSocial != null ? Number(data.capitalSocial) / 100 : null, // SERPRO retorna em centavos
      cnaePrincipalCodigo: cnaePrincipal.codigo ? String(cnaePrincipal.codigo) : null,
      cnaesSecundarios: Array.isArray(data.cnaesSecundarios) ? data.cnaesSecundarios.map((c: { codigo: string; descricao: string }) => ({ codigo: String(c.codigo || ''), descricao: String(c.descricao || '') })) : [],
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

  /**
   * Consulta CPF via SERPRO — endpoint `/consulta-cpf-df/v2/cpf/{cpf}`.
   * Retorna Nome, Situação Cadastral, Data de Nascimento e Data de Inscrição.
   * Email/telefone do CPF NÃO existem na base da Receita.
   *
   * Resposta v2 típica:
   *   { ni, nome, situacao: { codigo, descricao }, nascimento: 'DDMMYYYY',
   *     dataInscricao: 'DDMMYYYY' }
   *
   * Custo: ~R$ 0,06-0,15 por consulta (mesmo plano do CNPJ).
   * Doc: https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cpf/
   */
  async consultarCpf(cpf: string): Promise<{ cpf: string; nome: string; situacao: string | null; nascimento: string | null; fonte: 'serpro' }> {
    const doc = cpf.replace(/\D/g, '')
    if (doc.length !== 11) throw new Error('CPF deve ter 11 dígitos.')

    const serpro = this.getSerproCredentials()
    if (!serpro) throw new Error('Consulta CPF requer credenciais SERPRO configuradas (CONSUMER_KEY/CONSUMER_SECRET).')

    const start = Date.now()
    const token = await this.getSerproToken(serpro.consumerKey, serpro.consumerSecret)
    const endpoint = `/consulta-cpf-df/v2/cpf/${doc}`
    const res = await fetch(`https://gateway.apiserpro.serpro.gov.br${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      await prisma.apiLog.create({
        data: { source: 'serpro', endpoint, method: 'GET', status: res.status, duration: Date.now() - start, documento: doc, error: body.slice(0, 500) },
      }).catch(() => {})
      if (res.status === 404) throw new Error('CPF não encontrado na base do SERPRO.')
      if (res.status === 403 && /subscription/i.test(body)) {
        throw new Error('SERPRO_CPF_NAO_HABILITADO: plano atual não cobre Consulta CPF v2.')
      }
      throw new Error(`Erro na consulta CPF SERPRO: HTTP ${res.status}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()

    await prisma.apiLog.create({
      data: { source: 'serpro', endpoint, method: 'GET', status: 200, duration: Date.now() - start, documento: doc },
    }).catch(() => {})

    // Data vem como 'DDMMYYYY' (string sem separadores) — formata pra dd/MM/yyyy
    const formatarData = (s: string | undefined | null) => {
      if (!s || s.length !== 8) return null
      return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4, 8)}`
    }

    return {
      cpf: doc,
      nome: String(data.nome || data.nomeSocial || '').trim(),
      situacao: data.situacao?.descricao ? String(data.situacao.descricao) : null,
      nascimento: formatarData(data.nascimento),
      fonte: 'serpro',
    }
  }

  // ── Gate de custo (por tenant) ────────────────────────────

  /** Preço de uma operação em R$ (unitPrice × multiplier). Preferência:
   *  (source, operation) → (source, null) → fallback hardcoded. */
  private async precoOperacao(source: string, operation: string): Promise<number> {
    const exato = await prisma.apiPricing.findFirst({ where: { source, operation } })
    const p = exato ?? await prisma.apiPricing.findFirst({ where: { source, operation: null } })
    if (p) return p.unitPrice * p.multiplier
    if (source === 'serpro' && operation === 'consulta-cnpj') return 1.1717 // fallback seed
    return 0
  }

  /** Gasto Serpro acumulado do tenant no mês-calendário corrente (R$). */
  private async gastoSerproMes(empresaId: string): Promise<number> {
    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)
    const agg = await prisma.apiLog.aggregate({
      _sum: { custo: true },
      where: { empresaId, source: 'serpro', createdAt: { gte: inicioMes } },
    })
    return agg._sum.custo ?? 0
  }

  /** Decide se a consulta usa Serpro (pago) ou cai na base gratuita.
   *  - sem credencial de plataforma → sempre grátis.
   *  - sem empresaId (chamada não-atribuível/legada) → mantém comportamento atual.
   *  - tenant com serproHabilitado=false → grátis (escolha do tenant).
   *  - teto mensal estourado → bloqueia Serpro, devolve aviso. */
  private async avaliarGateSerpro(
    empresaId: string | null,
    operation: string,
  ): Promise<{ usarSerpro: boolean; aviso?: string }> {
    if (!this.getSerproCredentials()) return { usarSerpro: false }
    if (!empresaId) return { usarSerpro: true } // legado: sem tenant resolvido
    const emp = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { serproHabilitado: true, serproOrcamentoMensal: true },
    })
    if (!emp?.serproHabilitado) return { usarSerpro: false }
    const teto = emp.serproOrcamentoMensal
    if (teto == null) return { usarSerpro: true } // sem teto definido
    const [preco, gasto] = await Promise.all([
      this.precoOperacao('serpro', operation),
      this.gastoSerproMes(empresaId),
    ])
    if (gasto + preco > teto) {
      return {
        usarSerpro: false,
        aviso: `Limite mensal de consultas Serpro atingido (R$ ${teto.toFixed(2)}). Exibindo dados da base gratuita.`,
      }
    }
    return { usarSerpro: true }
  }

  /** Registra uma chamada de API (com custo congelado + atribuição por tenant). */
  private async logApi(d: {
    source: string; operation: string; endpoint: string; status: number
    duration: number; documento: string; custo: number
    empresaId: string | null; userId: string | null
  }): Promise<void> {
    await prisma.apiLog.create({
      data: {
        source: d.source, operation: d.operation, endpoint: d.endpoint, method: 'GET',
        status: d.status, duration: d.duration, documento: d.documento, custo: d.custo,
        empresaId: d.empresaId, userId: d.userId,
      },
    }).catch(() => {})
  }

  async consultarCnpj(
    cnpj: string,
    opts?: { empresaId?: string | null; userId?: string | null },
  ): Promise<CnpjResult> {
    const doc = cnpj.replace(/\D/g, '')
    if (doc.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.')

    const empresaId = opts?.empresaId ?? null
    const userId = opts?.userId ?? null
    const OP = 'consulta-cnpj'
    const serpro = this.getSerproCredentials()

    // Gate de custo: decide Serpro (pago) vs base gratuita conforme tenant/orçamento.
    const gate = await this.avaliarGateSerpro(empresaId, OP)

    // Aviso de degradação: quando o SERPRO (fonte oficial, paga) falha, a consulta
    // cai na BrasilAPI, que espelha a Receita com atraso. Antes isso era silencioso
    // — o usuário recebia dado defasado achando que era oficial (#HLP0234, "ao
    // puxar a consulta do CNPJ ele não aparece atualizado"). Em produção, 276 de
    // 276 chamadas ao SERPRO falharam, então TODA consulta vinha da base gratuita
    // sem ninguém perceber. O aviso não conserta a credencial, mas para de mascarar.
    let avisoSerproFalhou: string | null = null

    if (gate.usarSerpro && serpro) {
      const start = Date.now()
      try {
        const result = await this.consultarViaSerpro(doc, serpro.consumerKey, serpro.consumerSecret)
        const custo = await this.precoOperacao('serpro', OP)
        await this.logApi({ source: 'serpro', operation: OP, endpoint: `/consulta-cnpj-df/v2/empresa/${doc}`, status: 200, duration: Date.now() - start, documento: doc, custo, empresaId, userId })
        return result
      } catch (e) {
        await this.logApi({ source: 'serpro', operation: OP, endpoint: `/consulta-cnpj-df/v2/empresa/${doc}`, status: 500, duration: Date.now() - start, documento: doc, custo: 0, empresaId, userId })
        // Serpro falhou (indisponível, credencial rotacionada, erro) → base gratuita.
        avisoSerproFalhou = 'Consulta oficial (SERPRO) indisponível. Os dados vieram da base pública, que espelha a Receita com atraso e pode estar desatualizada.'
        console.warn(`[CnpjService] SERPRO falhou, tentando BrasilAPI: ${(e as Error).message}`)
      }
    }

    // Base gratuita (BrasilAPI): tenant sem Serpro, gate bloqueou por orçamento, ou Serpro falhou.
    const startBr = Date.now()
    try {
      const result = await this.consultarViaBrasilApi(doc)
      await this.logApi({ source: 'brasilapi', operation: OP, endpoint: `/cnpj/v1/${doc}`, status: 200, duration: Date.now() - startBr, documento: doc, custo: 0, empresaId, userId })
      // A falha do SERPRO tem precedência sobre o aviso de gate: se ele foi
      // tentado e caiu, é isso que o usuário precisa saber sobre a procedência.
      const aviso = avisoSerproFalhou ?? gate.aviso
      return aviso ? { ...result, gateAviso: aviso } : result
    } catch (e) {
      await this.logApi({ source: 'brasilapi', operation: OP, endpoint: `/cnpj/v1/${doc}`, status: 500, duration: Date.now() - startBr, documento: doc, custo: 0, empresaId, userId })
      throw e
    }
  }

  /**
   * Variante de `consultarCnpj` que tenta BrasilAPI primeiro (gratuita) e cai
   * pra SERPRO (paga) só quando BrasilAPI falhar. Usado por rotinas em lote
   * que enriquecem N clientes — economiza créditos SERPRO.
   */
  async consultarPreferindoBrasilApi(cnpj: string): Promise<CnpjResult> {
    const doc = cnpj.replace(/\D/g, '')
    if (doc.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.')
    const start = Date.now()

    // 1ª tentativa: BrasilAPI
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
      console.warn(`[CnpjService] BrasilAPI falhou, tentando SERPRO: ${(e as Error).message}`)
    }

    // Fallback: SERPRO (se credenciais disponíveis)
    const serpro = this.getSerproCredentials()
    if (!serpro) {
      throw new Error('BrasilAPI indisponível e SERPRO não está configurado.')
    }
    const fallbackStart = Date.now()
    try {
      const result = await this.consultarViaSerpro(doc, serpro.consumerKey, serpro.consumerSecret)
      await prisma.apiLog.create({
        data: { source: 'serpro', endpoint: `/consulta-cnpj-df/v2/empresa/${doc}`, method: 'GET', status: 200, duration: Date.now() - fallbackStart, documento: doc },
      }).catch(() => {})
      return result
    } catch (e) {
      await prisma.apiLog.create({
        data: { source: 'serpro', endpoint: `/consulta-cnpj-df/v2/empresa/${doc}`, method: 'GET', status: 500, duration: Date.now() - fallbackStart, documento: doc },
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
      email: data.email ? String(data.email).trim() : null,
      telefone: data.ddd_telefone_1 ? String(data.ddd_telefone_1).trim() : (data.ddd_telefone_2 ? String(data.ddd_telefone_2).trim() : null),
      naturezaJuridica: data.natureza_juridica ? String(data.natureza_juridica) : null,
      atividadePrincipal: data.cnae_fiscal_descricao ? String(data.cnae_fiscal_descricao) : null,
      porte: data.porte ? String(data.porte) : (data.descricao_porte ? String(data.descricao_porte) : null),
      capitalSocial: data.capital_social != null ? Number(data.capital_social) : null,
      cnaePrincipalCodigo: data.cnae_fiscal ? String(data.cnae_fiscal) : null,
      cnaesSecundarios: Array.isArray(data.cnaes_secundarios) ? data.cnaes_secundarios.map((c: { codigo: number; descricao: string }) => ({ codigo: String(c.codigo || ''), descricao: String(c.descricao || '') })) : [],
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
