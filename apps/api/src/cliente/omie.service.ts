import { Injectable, Logger } from '@nestjs/common'
import { limparDocumento } from '@saas/types'

/**
 * Integração com o Omie ERP (API REST v1) — port do `omieService.js` do SERPRO2.
 * Foco no cadastro de clientes: localizar o cliente no Omie pelo CNPJ e obter o
 * `codigo_cliente_omie`, detectando em qual empresa (CENTRAL ou L&L) ele está.
 *
 * Credenciais por empresa via env:
 *   OMIE_APP_KEY_CENTRAL / OMIE_APP_SECRET_CENTRAL
 *   OMIE_APP_KEY_LL      / OMIE_APP_SECRET_LL
 * Degrada com erro claro quando não configurado.
 */
export type OmieEmpresa = 'CENTRAL' | 'LL'

export interface OmieBuscaResult {
  encontrado: boolean
  idOmie: string | null
  omieEmpresa: OmieEmpresa | null
  razaoSocialOmie: string | null
  nomeFantasiaOmie: string | null
}

const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

@Injectable()
export class OmieService {
  private readonly logger = new Logger(OmieService.name)

  normalizeEmpresa(v: string | null | undefined): OmieEmpresa | null {
    const s = String(v || '').trim().toUpperCase()
    if (['CENTRAL', 'CENTRAL_CONTABIL', 'CENTRALCONTABIL'].includes(s)) return 'CENTRAL'
    if (['L&L', 'LL', 'L_L'].includes(s)) return 'LL'
    return null
  }

  private getCreds(empresa: OmieEmpresa): { app_key: string; app_secret: string } | null {
    if (empresa === 'CENTRAL') {
      return { app_key: process.env.OMIE_APP_KEY_CENTRAL || '', app_secret: process.env.OMIE_APP_SECRET_CENTRAL || '' }
    }
    return { app_key: process.env.OMIE_APP_KEY_LL || '', app_secret: process.env.OMIE_APP_SECRET_LL || '' }
  }

  /** True se ao menos uma empresa Omie está configurada por env. */
  configurado(): boolean {
    return (['CENTRAL', 'LL'] as OmieEmpresa[]).some(e => {
      const c = this.getCreds(e)
      return !!(c && c.app_key && c.app_secret)
    })
  }

  private async omieCall(app_key: string, app_secret: string, call: string, param: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!app_key || !app_secret) {
      throw new Error('Omie não configurado. Informe APP_KEY/APP_SECRET nas variáveis de ambiente.')
    }
    const body = JSON.stringify({ call, app_key, app_secret, param: [param] })
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    let resp: Response
    try {
      resp = await fetch(OMIE_CLIENTES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      })
    } catch (e) {
      throw new Error(`Falha de conexão com o Omie: ${(e as Error).message}`)
    } finally {
      clearTimeout(timer)
    }
    const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    const status = resp.status
    const statusErro = String((data?.status as string) || '').toLowerCase() === 'error'
    if (status >= 400 || statusErro) {
      const msg = (data?.faultstring as string) || (data?.message as string) || `Erro Omie (HTTP ${status})`
      throw new Error(String(msg))
    }
    return data
  }

  private extractCodigo(cliente: Record<string, unknown>): string | null {
    const keys = ['codigo_cliente_omie', 'codigoClienteOmie', 'nCodCliente', 'codigo_cliente', 'codigoCliente', 'cod_cliente', 'codigo']
    for (const k of keys) {
      const v = cliente[k]
      if (v !== null && v !== undefined && v !== '') return String(v).trim()
    }
    return null
  }

  /** Busca o cliente no Omie de UMA empresa específica pelo CNPJ/CPF. */
  async buscarNaEmpresa(empresa: OmieEmpresa, documento: string): Promise<OmieBuscaResult> {
    const creds = this.getCreds(empresa)
    if (!creds || !creds.app_key || !creds.app_secret) {
      throw new Error(`Omie (${empresa}) não configurado nas variáveis de ambiente.`)
    }
    const doc = limparDocumento(documento)
    if (!doc) throw new Error('Documento (CNPJ/CPF) do cliente é obrigatório.')

    const param = {
      pagina: 1,
      registros_por_pagina: 50,
      apenas_importado_api: 'N',
      clientesFiltro: { cnpj_cpf: doc },
    }
    // Alguns ambientes expõem só um dos calls — tenta ambos.
    let data: Record<string, unknown> | null = null
    for (const call of ['ListarClientes', 'ListarClientesResumido']) {
      try {
        data = await this.omieCall(creds.app_key, creds.app_secret, call, param)
        break
      } catch (e) {
        if (/Method\s+".+"\s+not\s+exists/i.test((e as Error).message)) continue
        throw e
      }
    }
    const listaRaw = (data?.clientes_cadastro ?? data?.clientesCadastro ?? data?.clientes_cadastro_resumido ?? []) as unknown
    const lista = Array.isArray(listaRaw) ? (listaRaw as Array<Record<string, unknown>>) : []
    if (!lista.length) {
      return { encontrado: false, idOmie: null, omieEmpresa: null, razaoSocialOmie: null, nomeFantasiaOmie: null }
    }
    const primeiro = lista[0]!
    const cod = this.extractCodigo(primeiro)
    if (!cod) {
      return { encontrado: false, idOmie: null, omieEmpresa: null, razaoSocialOmie: null, nomeFantasiaOmie: null }
    }
    return {
      encontrado: true,
      idOmie: cod,
      omieEmpresa: empresa,
      razaoSocialOmie: (primeiro.razao_social as string) || (primeiro.nome_fantasia as string) || null,
      nomeFantasiaOmie: (primeiro.nome_fantasia as string) || null,
    }
  }

  /**
   * Detecta o cliente no Omie pelo CNPJ. Se `empresaPreferida` vier, tenta só
   * ela; senão varre CENTRAL e depois L&L, retornando a primeira que tiver o
   * cliente. Ignora empresas não configuradas.
   */
  async detectar(documento: string, empresaPreferida?: string | null): Promise<OmieBuscaResult> {
    const doc = limparDocumento(documento)
    if (!doc) throw new Error('Documento (CNPJ/CPF) do cliente é obrigatório.')

    const pref = this.normalizeEmpresa(empresaPreferida)
    const ordem: OmieEmpresa[] = pref ? [pref] : ['CENTRAL', 'LL']

    const naoConfiguradas: OmieEmpresa[] = []
    let ultimoErro: Error | null = null
    for (const empresa of ordem) {
      const creds = this.getCreds(empresa)
      if (!creds || !creds.app_key || !creds.app_secret) { naoConfiguradas.push(empresa); continue }
      try {
        const r = await this.buscarNaEmpresa(empresa, doc)
        if (r.encontrado) return r
      } catch (e) {
        ultimoErro = e as Error
        this.logger.warn(`Omie detectar (${empresa}): ${(e as Error).message}`)
      }
    }
    if (naoConfiguradas.length === ordem.length) {
      throw new Error('Nenhuma empresa Omie está configurada nas variáveis de ambiente.')
    }
    if (ultimoErro) throw ultimoErro
    return { encontrado: false, idOmie: null, omieEmpresa: null, razaoSocialOmie: null, nomeFantasiaOmie: null }
  }
}
