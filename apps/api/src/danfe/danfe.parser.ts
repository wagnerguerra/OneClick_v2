/**
 * Parser de XML de NFe — extrai metadata (chave, número, emitente, valor, etc)
 * antes de jogar o XML pra lib de geração de PDF.
 *
 * Aceita os 2 formatos comuns:
 *  - <nfeProc> ... </nfeProc>  (NFe autorizada, com protocolo) — formato esperado
 *  - <NFe> ... </NFe>           (NFe sem protocolo) — recusada (não tem autorização SEFAZ)
 *
 * Detecta modelo (55 = NFe, 65 = NFCe) pelo campo <mod>.
 */

import { XMLParser } from 'fast-xml-parser'

export interface ParsedNFe {
  chave: string                 // 44 dígitos
  modelo: string                // "55" | "65"
  numero: number
  serie: number
  emitenteCnpj: string
  emitenteRazao: string
  destCnpjCpf: string | null
  destRazao: string | null
  valorTotal: number
  dataEmissao: Date
  dataAutorizacao: Date | null
  status: 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | 'INUTILIZADA'
  protocolo: string | null
}

export class XmlInvalidoError extends Error {
  constructor(msg: string) { super(msg); this.name = 'XmlInvalidoError' }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,  // mantém strings (importante pra chave que tem leading zeros)
  parseTagValue: false,
})

function pick<T = any>(obj: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj?.[k] !== undefined) return obj[k] as T
  }
  return undefined
}

export function parseNFeXml(xmlString: string): ParsedNFe {
  let root: any
  try {
    root = parser.parse(xmlString)
  } catch (e) {
    throw new XmlInvalidoError(`XML mal-formado: ${(e as Error).message}`)
  }

  // Aceita <nfeProc> (com protocolo) OU <NFe> direto. Recusa o último — sem
  // protocolo a NFe não é juridicamente válida.
  const nfeProc = root?.nfeProc
  const nfeDireta = root?.NFe
  if (!nfeProc && !nfeDireta) {
    throw new XmlInvalidoError('XML não é uma NFe (esperava <nfeProc> ou <NFe> como raiz).')
  }
  if (!nfeProc) {
    throw new XmlInvalidoError('NFe sem protocolo de autorização (<protNFe>). Só aceitamos NFes autorizadas pela SEFAZ.')
  }

  const NFe = nfeProc.NFe
  const protNFe = nfeProc.protNFe
  if (!NFe || !protNFe) {
    throw new XmlInvalidoError('Estrutura <nfeProc> incompleta: faltando <NFe> ou <protNFe>.')
  }

  const infNFe = NFe.infNFe
  const infProt = protNFe.infProt
  if (!infNFe?.Id) {
    throw new XmlInvalidoError('infNFe sem atributo Id (chave de acesso ausente).')
  }

  // Chave: vem como "NFe35200111111111111111550010000000011000000010" — tira o prefixo.
  const chaveBruta = String(infNFe.Id)
  const chave = chaveBruta.replace(/^NFe/i, '')
  if (chave.length !== 44 || !/^\d{44}$/.test(chave)) {
    throw new XmlInvalidoError(`Chave de acesso inválida: "${chave}" (esperava 44 dígitos).`)
  }

  const ide = infNFe.ide
  const emit = infNFe.emit
  const dest = infNFe.dest
  const total = infNFe.total?.ICMSTot

  const modelo = String(ide?.mod ?? '')
  if (modelo !== '55' && modelo !== '65') {
    throw new XmlInvalidoError(`Modelo ${modelo} não suportado. Apenas NFe (55) e NFCe (65).`)
  }

  const numero  = Number(ide?.nNF ?? 0)
  const serie   = Number(ide?.serie ?? 0)
  const dhEmi   = String(ide?.dhEmi ?? ide?.dEmi ?? '')
  const dataEmissao = dhEmi ? new Date(dhEmi) : new Date()

  const emitenteCnpj  = String(pick<string>(emit, 'CNPJ', 'CPF') ?? '')
  const emitenteRazao = String(emit?.xNome ?? '(sem razão social)')

  const destCnpjCpf = dest ? String(pick<string>(dest, 'CNPJ', 'CPF', 'idEstrangeiro') ?? '') : null
  const destRazao   = dest?.xNome ? String(dest.xNome) : null

  const valorTotal = Number(total?.vNF ?? 0)

  // Status pelo cStat do protocolo (100 = autorizada, 101 = cancelada, etc)
  const cStat = String(infProt.cStat ?? '')
  let status: ParsedNFe['status'] = 'AUTORIZADA'
  if (cStat === '101' || cStat === '151' || cStat === '155') status = 'CANCELADA'
  else if (cStat === '110' || cStat === '301' || cStat === '302') status = 'DENEGADA'
  else if (cStat === '102') status = 'INUTILIZADA'

  const protocolo = infProt.nProt ? String(infProt.nProt) : null
  const dhRecbto  = infProt.dhRecbto ? String(infProt.dhRecbto) : null
  const dataAutorizacao = dhRecbto ? new Date(dhRecbto) : null

  return {
    chave, modelo, numero, serie,
    emitenteCnpj, emitenteRazao,
    destCnpjCpf, destRazao,
    valorTotal, dataEmissao, dataAutorizacao,
    status, protocolo,
  }
}
