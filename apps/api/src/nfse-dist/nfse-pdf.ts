/**
 * Gerador local do DANFSe v1.0 — Documento Auxiliar da NFS-e.
 *
 * Layout fiel ao modelo de referência (Município de Vitória/ES) seguindo a NT 008/2026,
 * mas com posicionamento ADAPTATIVO: cada linha mede a altura real do conteúdo e
 * empurra a próxima pra baixo se necessário, evitando que textos longos invadam
 * a linha de baixo.
 *
 * Page: A4 (595 x 842 pt). Borda externa 1pt; linhas internas 0.5pt.
 *
 * Imagens em `apps/api/assets/nfse/`:
 *   - logo_nfe_horizontal.png   (canto superior esquerdo)
 *   - prefeitura-de-vitoria-logo.png  (canto superior direito)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { buffer as readableToBuffer } from 'node:stream/consumers'
import type { Readable } from 'node:stream'
import * as QRCode from 'qrcode'
import type { ParsedNFSe } from './nfse.parser'

interface PdfDoc extends Readable {
  fontSize(size: number): PdfDoc
  font(name: string): PdfDoc
  fillColor(color: string, opacity?: number): PdfDoc
  strokeColor(color: string): PdfDoc
  lineWidth(width: number): PdfDoc
  text(text: string, x?: number, y?: number, options?: Record<string, unknown>): PdfDoc
  text(text: string, options?: Record<string, unknown>): PdfDoc
  moveTo(x: number, y: number): PdfDoc
  lineTo(x: number, y: number): PdfDoc
  rect(x: number, y: number, w: number, h: number): PdfDoc
  stroke(): PdfDoc
  fill(color?: string): PdfDoc
  fillAndStroke(fill?: string, stroke?: string): PdfDoc
  image(src: Buffer | string, x: number, y: number, opts?: Record<string, unknown>): PdfDoc
  save(): PdfDoc
  restore(): PdfDoc
  end(): void
  y: number
  x: number
  widthOfString(s: string, opts?: Record<string, unknown>): number
  heightOfString(s: string, opts?: Record<string, unknown>): number
  page: { width: number; height: number; margins: { top: number; bottom: number; left: number; right: number } }
}

interface PdfDocCtor { new (opts?: Record<string, unknown>): PdfDoc }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument: PdfDocCtor = require('pdfkit') as PdfDocCtor

// ─── Helpers de formatação ──────────────────────────────────────────────────
function fmtBRL(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtCnpjCpf(s: string | null | undefined): string {
  if (!s) return '-'
  const d = s.toUpperCase().replace(/[^0-9A-Z]/g, '') // preserva letras (CNPJ alfanumérico)
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
  return s
}

function fmtCompetencia(d: Date | null | undefined): string {
  if (!d) return '-'
  return d.toLocaleDateString('pt-BR')
}

function fmtDataHora(d: Date | null | undefined): string {
  if (!d) return '-'
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}`
}

function fmtAliquota(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-'
  return `${(v * 100).toFixed(2)}%`
}

function fmtTelefone(t: string | null | undefined): string {
  if (!t) return '-'
  const d = t.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  if (d.length === 8)  return d.replace(/(\d{4})(\d{4})/, '$1-$2')
  return t
}

function fmtCep(c: string | null | undefined): string {
  if (!c) return '-'
  const d = c.replace(/\D/g, '')
  if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, '$1-$2')
  return c
}

function fmtOpcaoSN(c: string | null | undefined): string {
  if (!c) return '-'
  const map: Record<string, string> = {
    '1': 'Não optante',
    '2': 'Optante - MEI',
    '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
  }
  return map[c] ?? c
}

function fmtRegimeApSN(c: string | null | undefined): string {
  if (!c) return '-'
  const map: Record<string, string> = {
    '0': 'Não aplicável',
    '1': 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional',
  }
  return map[c] ?? c
}

function fmtTribISSQN(c: string | null | undefined): string {
  if (!c) return '-'
  const map: Record<string, string> = {
    '1': 'Operação Tributável',
    '2': 'Operação Imune',
    '3': 'Suspensa por Decisão Judicial',
    '4': 'Exportação de Serviço',
    '5': 'Operação Não Tributável',
    '6': 'Exigibilidade Suspensa por Processo Administrativo',
  }
  return map[c] ?? c
}

function fmtRetencaoISSQN(c: string | null | undefined): string {
  if (!c) return '-'
  return c === '2' ? 'Retido' : 'Não Retido'
}

function fmtEnderecoLinha(e: { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null } | null | undefined): string {
  if (!e) return '-'
  const partes: string[] = []
  if (e.logradouro) partes.push(e.logradouro)
  if (e.numero && e.numero !== '0' && e.numero.toUpperCase() !== 'S/N') partes.push(e.numero)
  else if (e.numero === '0' || e.numero?.toUpperCase() === 'S/N') partes.push('S/N')
  if (e.complemento) partes.push(e.complemento)
  if (e.bairro) partes.push(e.bairro)
  return partes.length > 0 ? partes.join(', ') : '-'
}

function fmtMunicipioUF(e: { municipioNome: string | null; municipioIbge: string | null; uf: string | null } | null | undefined, fallbackIbge?: string | null): string {
  if (!e) {
    if (fallbackIbge) return `IBGE ${fallbackIbge}`
    return '-'
  }
  const nome = e.municipioNome
  const uf = e.uf
  if (nome && uf) return `${nome} - ${uf}`
  if (nome) return nome
  if (e.municipioIbge && uf) return `IBGE ${e.municipioIbge} - ${uf}`
  if (e.municipioIbge) return `IBGE ${e.municipioIbge}`
  return '-'
}

// ─── Estilos ────────────────────────────────────────────────────────────────
const PT_PRETO = '#000000'
const FONT_B = 'Helvetica-Bold'
const FONT_R = 'Helvetica'

const ASSETS_DIR = path.resolve(process.cwd(), 'assets', 'nfse')
const MUNICIPIOS_DIR = path.join(ASSETS_DIR, 'municipios')
let LOGO_NFSE: Buffer | null = null
try { LOGO_NFSE = fs.readFileSync(path.join(ASSETS_DIR, 'logo_nfe_horizontal.png')) } catch { /* sem logo */ }

/**
 * Cabeçalho dinâmico do município emissor (Secretaria de Fazenda + email + logo).
 * Cada município brasileiro tem dados próprios. Pra municípios não mapeados,
 * mostramos apenas "Município de XYZ" + "Secretaria Municipal de Fazenda" sem
 * logo e sem email — o user pode adicionar manualmente em
 * `apps/api/assets/nfse/municipios/{IBGE}.png` e estender o mapa abaixo.
 */
interface DadosMunicipio {
  /** Nome do município (já formatado pra exibição). */
  nome: string
  uf: string
  /** Email institucional da secretaria de fazenda, se conhecido. */
  email?: string
  /** Nome do arquivo PNG do brasão dentro de `assets/nfse/municipios/`. */
  logoFile?: string
}

/** Mapa de municípios conhecidos por código IBGE. Estender conforme necessário. */
const MUNICIPIOS_CONHECIDOS: Record<string, DadosMunicipio> = {
  // Espírito Santo
  '3205309': { nome: 'Vitória', uf: 'ES', email: 'tributomobiliario@vitoria.es.gov.br', logoFile: '3205309.png' },
  '3201308': { nome: 'Cariacica', uf: 'ES' },
  '3205002': { nome: 'Serra', uf: 'ES' },
  '3205200': { nome: 'Vila Velha', uf: 'ES' },
  '3204203': { nome: 'Linhares', uf: 'ES' },
  '3201407': { nome: 'Colatina', uf: 'ES' },
  // Adicione mais municípios aqui conforme necessário, copiando o brasão pra
  // `apps/api/assets/nfse/municipios/{IBGE}.png` e incluindo no mapa.
}

/** Normaliza nome de município de "CARIACICA" → "Cariacica". */
function normalizaNomeMunicipio(s: string): string {
  // Palavras de ligação que ficam minúsculas no Title Case brasileiro
  const ligacoes = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
  return s.toLowerCase().split(/\s+/).map((w, i) => {
    if (i > 0 && ligacoes.has(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}

/**
 * Resolve dados do município emissor a partir do XML parseado.
 * Prefere xLocEmi (nome explícito do XML) e cMun (IBGE) do prestador.
 */
function resolveMunicipio(parsed: ParsedNFSe): DadosMunicipio {
  const ibge = parsed.prestador?.endereco?.municipioIbge ?? parsed.prestadorMunicipio
  const conhecido = ibge ? MUNICIPIOS_CONHECIDOS[ibge] : undefined

  // Se conhecemos o IBGE, retornamos os dados completos
  if (conhecido) return conhecido

  // Senão, monta com o que temos do XML
  const nomeRaw =
    parsed.localEmissaoNome
    ?? parsed.prestador?.endereco?.municipioNome
    ?? parsed.localPrestacaoNome
    ?? ''
  return {
    nome: nomeRaw ? normalizaNomeMunicipio(nomeRaw) : 'Não informado',
    uf: parsed.prestador?.endereco?.uf ?? '',
  }
}

/** Carrega o logo do município (cache simples por arquivo). */
const logoCache = new Map<string, Buffer | null>()
function carregarLogoMunicipio(logoFile: string | undefined): Buffer | null {
  if (!logoFile) return null
  if (logoCache.has(logoFile)) return logoCache.get(logoFile)!
  try {
    const buf = fs.readFileSync(path.join(MUNICIPIOS_DIR, logoFile))
    logoCache.set(logoFile, buf)
    return buf
  } catch {
    logoCache.set(logoFile, null)
    return null
  }
}

// ─── Constantes geométricas ────────────────────────────────────────────────
// Colunas (x fixos, baseados no modelo de Vitória)
const X_C1 = 14.173          // coluna 1
const X_C2 = 155.906         // coluna 2
const X_C3 = 297.638         // coluna 3
const X_C4 = 439.370         // coluna 4

// Largura de cada coluna (até a próxima ou até a borda direita)
const W_LBL_VAL = 138        // largura padrão de label/value em coluna de 4 cols
const W_NOME = 280           // largura "Nome / Nome Empresarial" (até col 3)
const W_END = 280            // largura "Endereço"
const W_MUN = 140            // largura "Município"

// Linhas divisórias horizontais (extremidade)
const LINE_FULL_X = 10.772
const LINE_FULL_W = 566.929

// Espaços
const ROW_PADDING_TOP = 3     // respiro acima do título do bloco (após divisória)
const LBL_VAL_GAP = 1         // gap entre label (em cima) e value (embaixo)
const ROW_GAP = 5             // gap entre uma linha de campos e a próxima
const LBL_HEIGHT = 7          // altura visual aproximada do label (font 7pt)

// ─── Gerador principal ──────────────────────────────────────────────────────
export async function gerarPdfNFSe(parsed: ParsedNFSe): Promise<Buffer> {
  const doc: PdfDoc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: `DANFSe ${parsed.numero}`,
      Author: 'OneClick ERP',
      Subject: 'Documento Auxiliar da NFS-e — NT 008/2026',
    },
  })

  // ─── Helpers locais (dentro do escopo pra acessar `doc`) ────────────────
  function drawLineH(x: number, y: number, w: number): void {
    doc.save().lineWidth(0.5).strokeColor(PT_PRETO)
      .moveTo(x, y).lineTo(x + w, y).stroke().restore()
  }

  /** Linha cheia divisória entre blocos (full-width). */
  function drawFullLine(y: number): void {
    drawLineH(LINE_FULL_X, y, LINE_FULL_W)
  }

  /** Label (font Helvetica-Bold, padrão 7pt). */
  function lbl(s: string, x: number, y: number, size = 7): void {
    doc.save().font(FONT_B).fontSize(size).fillColor(PT_PRETO)
      .text(s, x, y, { lineBreak: false }).restore()
  }

  /** Valor sem quebra (uma linha apenas). */
  function val(s: string, x: number, y: number, opts: { size?: number; bold?: boolean; w?: number; align?: 'left' | 'center' | 'right' } = {}): void {
    doc.save()
      .font(opts.bold ? FONT_B : FONT_R)
      .fontSize(opts.size ?? 8)
      .fillColor(PT_PRETO)
      .text(s, x, y, { width: opts.w, align: opts.align ?? 'left', lineBreak: false })
      .restore()
  }

  /** Mede a altura do texto pra largura dada na fonte atual. */
  function measureH(s: string, w: number, size = 8): number {
    return doc.font(FONT_R).fontSize(size).heightOfString(s, { width: w })
  }

  /**
   * Desenha um campo (label em cima + value embaixo) numa posição.
   * Retorna a altura total ocupada (label + value).
   */
  function drawField(x: number, y: number, w: number, label: string, value: string, opts: { bold?: boolean; size?: number } = {}): number {
    lbl(label, x, y, 7)
    const size = opts.size ?? 8
    const valY = y + LBL_HEIGHT + LBL_VAL_GAP
    const text = value || '-'
    doc.save()
      .font(opts.bold ? FONT_B : FONT_R)
      .fontSize(size)
      .fillColor(PT_PRETO)
      .text(text, x, valY, { width: w, lineBreak: true })
      .restore()
    const valH = measureH(text, w, size)
    return LBL_HEIGHT + LBL_VAL_GAP + valH
  }

  /**
   * Desenha uma linha com vários campos lado a lado. Retorna a nova Y após
   * a linha (já com gap pra próxima). Cada campo pode quebrar; a altura da
   * linha = max das alturas dos campos individuais.
   */
  function drawRow(y: number, fields: Array<{
    x: number
    w: number
    label: string
    value: string
    bold?: boolean
    size?: number
  }>): number {
    let maxH = 0
    for (const f of fields) {
      const h = drawField(f.x, y, f.w, f.label, f.value, { bold: f.bold, size: f.size })
      if (h > maxH) maxH = h
    }
    return y + maxH + ROW_GAP
  }

  /** Desenha banner centralizado (ex: "INTERMEDIÁRIO NÃO IDENTIFICADO"). */
  function drawBanner(yTop: number, yBottom: number, text: string): void {
    const mid = (yTop + yBottom) / 2
    const textH = 7  // Helvetica 8pt ≈ 7pt alto
    const yText = mid - textH / 2
    val(text, 178.074, yText, { size: 8, w: 420 })
  }

  // ─── 1. Borda externa + cabeçalho ─────────────────────────────────────────
  doc.save().lineWidth(1).strokeColor(PT_PRETO)
    .rect(5, 5, 585, 832).stroke().restore()

  // Logo NFS-e (esquerda)
  if (LOGO_NFSE) doc.image(LOGO_NFSE, 14.173, 12.492, { width: 113.386, height: 22.677 })

  // Logo do município emissor (direita) — dinâmico baseado no IBGE do prestador
  const muni = resolveMunicipio(parsed)
  const logoMuni = carregarLogoMunicipio(muni.logoFile)
  if (logoMuni) doc.image(logoMuni, 402.567, 8.831, { width: 30, height: 30 })

  // Título centro
  lbl('DANFSe v1.0', 223.272, 14.539, 9)
  lbl('Documento Auxiliar da NFS-e', 189.848, 24.726, 9)

  // Município (direita) — dinâmico
  const tituloMuni = muni.uf ? `Município de ${muni.nome} - ${muni.uf}` : `Município de ${muni.nome}`
  lbl(tituloMuni, 439.370, 8.503, 8)
  val('Secretaria Municipal de Fazenda', 439.370, 17.558, { size: 6 })
  if (muni.email) val(muni.email, 439.370, 24.349, { size: 6 })

  // Divisória abaixo do cabeçalho
  drawLineH(10.772, 41.200, 425.197)
  drawLineH(435.969, 41.200, 141.732)

  // ─── 2. Bloco IDENTIFICAÇÃO NFS-e ─────────────────────────────────────────
  // Mantemos coordenadas fixas: identificação raramente quebra.
  // Chave de Acesso
  lbl('Chave de Acesso da NFS-e', 14.173, 45.701, 7)
  val(parsed.chave || '-', 14.173, 53.624, { size: 8 })

  // QR + texto autenticidade
  let qrDataUrl: string | null = null
  if (parsed.chave) {
    const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${parsed.chave}`
    try { qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 200, margin: 0, errorCorrectionLevel: 'M' }) } catch { /* */ }
  }
  if (qrDataUrl) {
    const qrBuf = Buffer.from(qrDataUrl.split(',')[1]!, 'base64')
    doc.image(qrBuf, 481.835, 46.029, { width: 50, height: 50 })
  }
  val('A autenticidade desta NFS-e pode ser verificada', 439.370, 101.148, { size: 6 })
  val('pela leitura deste código QR ou pela consulta da', 439.370, 107.939, { size: 6 })
  val('chave de acesso no portal nacional da NFS-e', 439.370, 114.730, { size: 6 })

  // Linha 1: Número | Competência | Data NFS-e
  lbl('Número da NFS-e', X_C1, 66.931, 7)
  val(parsed.numero || '-', X_C1, 74.854, { size: 8 })
  lbl('Competência da NFS-e', X_C2, 66.931, 7)
  val(fmtCompetencia(parsed.competencia ?? parsed.dataEmissao), X_C2, 74.854, { size: 8 })
  lbl('Data e Hora da emissão da NFS-e', X_C3, 66.931, 7)
  val(fmtDataHora(parsed.dataProcessamento ?? parsed.dataEmissao), X_C3, 74.854, { size: 8 })

  // Linha 2: DPS
  lbl('Número da DPS', X_C1, 88.160, 7)
  val(parsed.numeroDPS ?? parsed.numero ?? '-', X_C1, 96.083, { size: 8 })
  lbl('Série da DPS', X_C2, 88.160, 7)
  val(parsed.serieDPS ?? parsed.serie ?? '-', X_C2, 96.083, { size: 8 })
  lbl('Data e Hora da emissão da DPS', X_C3, 88.160, 7)
  val(fmtDataHora(parsed.dataEmissaoDPS ?? parsed.dataEmissao), X_C3, 96.083, { size: 8 })

  // Divisórias verticais separando colunas (entre identificação e emitente)
  drawLineH(10.772, 123.023, 141.732)
  drawLineH(152.504, 123.023, 141.732)
  drawLineH(294.236, 123.023, 141.732)
  drawLineH(435.969, 123.023, 141.732)

  // ─── 3. Bloco EMITENTE DA NFS-e (adaptativo) ──────────────────────────────
  // Começa logo após a divisória 123.023, com respiro de 3pt.
  let y = 123.023 + ROW_PADDING_TOP

  // Linha do título: "EMITENTE DA NFS-e" + "Prestador do Serviço" (2 linhas) à esquerda
  // e CNPJ/IM/Telefone à direita.
  lbl('EMITENTE DA NFS-e', X_C1, y, 8)
  val('Prestador do Serviço', X_C1, y + 9, { size: 8 })
  // Primeira linha de campos da direita (CNPJ/IM/Telefone)
  y = drawRow(y, [
    { x: X_C2, w: W_LBL_VAL, label: 'CNPJ / CPF / NIF', value: fmtCnpjCpf(parsed.prestadorCnpj), bold: true },
    { x: X_C3, w: W_LBL_VAL, label: 'Inscrição Municipal', value: parsed.prestador?.inscricaoMunicipal ?? '-' },
    { x: X_C4, w: W_LBL_VAL, label: 'Telefone', value: fmtTelefone(parsed.prestador?.telefone) },
  ])

  // Linha: Nome | E-mail
  y = drawRow(y, [
    { x: X_C1, w: W_NOME, label: 'Nome / Nome Empresarial', value: parsed.prestadorRazao || '-', bold: true },
    { x: X_C3, w: W_NOME, label: 'E-mail', value: parsed.prestador?.email ?? '-' },
  ])

  // Linha: Endereço | Município | CEP
  y = drawRow(y, [
    { x: X_C1, w: W_END, label: 'Endereço', value: fmtEnderecoLinha(parsed.prestador?.endereco) },
    { x: X_C3, w: W_MUN, label: 'Município', value: fmtMunicipioUF(parsed.prestador?.endereco, parsed.prestadorMunicipio) },
    { x: X_C4, w: W_LBL_VAL, label: 'CEP', value: fmtCep(parsed.prestador?.endereco?.cep) },
  ])

  // Linha: Simples Nacional | Regime Apuração
  y = drawRow(y, [
    { x: X_C1, w: W_NOME, label: 'Simples Nacional na Data de Competência', value: fmtOpcaoSN(parsed.prestador?.opcaoSimplesNacional) },
    { x: X_C3, w: W_NOME, label: 'Regime de Apuração Tributária pelo SN', value: fmtRegimeApSN(parsed.prestador?.regimeApuracaoSN) },
  ])

  // Divisória após EMITENTE (full-width pra simplificar — não temos divisórias verticais visíveis no modelo)
  drawFullLine(y)
  y += ROW_PADDING_TOP

  // ─── 4. Bloco TOMADOR DO SERVIÇO (adaptativo) ─────────────────────────────
  lbl('TOMADOR DO SERVIÇO', X_C1, y, 8)
  const semTomador = !parsed.tomadorCnpjCpf && !parsed.tomadorRazao
  if (semTomador) {
    // Centraliza texto na faixa entre yPosEmitente e a próxima divisória
    val('TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
      X_C2, y + 2, { size: 7, w: 420 })
    y += 16
  } else {
    // Linha do título com CNPJ/IM/Telefone
    y = drawRow(y, [
      { x: X_C2, w: W_LBL_VAL, label: 'CNPJ / CPF / NIF', value: fmtCnpjCpf(parsed.tomadorCnpjCpf), bold: true },
      { x: X_C3, w: W_LBL_VAL, label: 'Inscrição Municipal', value: parsed.tomador?.inscricaoMunicipal ?? '-' },
      { x: X_C4, w: W_LBL_VAL, label: 'Telefone', value: fmtTelefone(parsed.tomador?.telefone) },
    ])

    y = drawRow(y, [
      { x: X_C1, w: W_NOME, label: 'Nome / Nome Empresarial', value: parsed.tomadorRazao || '-', bold: true },
      { x: X_C3, w: W_NOME, label: 'E-mail', value: parsed.tomador?.email ?? '-' },
    ])

    y = drawRow(y, [
      { x: X_C1, w: W_END, label: 'Endereço', value: fmtEnderecoLinha(parsed.tomador?.endereco) },
      { x: X_C3, w: W_MUN, label: 'Município', value: fmtMunicipioUF(parsed.tomador?.endereco) },
      { x: X_C4, w: W_LBL_VAL, label: 'CEP', value: fmtCep(parsed.tomador?.endereco?.cep) },
    ])
  }

  // Divisória após TOMADOR
  const yPosTomador = y
  drawFullLine(yPosTomador)

  // ─── 5. Banner INTERMEDIÁRIO NÃO IDENTIFICADO ─────────────────────────────
  // Banner fica numa faixa fixa (~10pt). Margem superior = inferior.
  const bannerH = 10
  const yBannerTop = yPosTomador
  const yBannerBottom = yBannerTop + bannerH
  drawBanner(yBannerTop, yBannerBottom, 'INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e')
  drawFullLine(yBannerBottom)
  y = yBannerBottom + ROW_PADDING_TOP

  // ─── 6. Bloco SERVIÇO PRESTADO ────────────────────────────────────────────
  lbl('SERVIÇO PRESTADO', X_C1, y, 8)
  y += 13  // respiro após título

  // Linha de códigos
  const codTrib = parsed.itemListaServico || '-'
  const descTrib = parsed.descTributacaoNacional ? `${codTrib} - ${parsed.descTributacaoNacional}` : codTrib
  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'Código de Tributação Nacional', value: descTrib },
    { x: X_C2, w: W_LBL_VAL, label: 'Código de Tributação Municipal', value: parsed.codigoTributacaoMunicipal ?? '-' },
    { x: X_C3, w: W_LBL_VAL, label: 'Local da Prestação', value: parsed.localPrestacaoNome ?? parsed.prestadorMunicipio ?? '-' },
    { x: X_C4, w: W_LBL_VAL, label: 'País da Prestação', value: parsed.prestador?.endereco?.pais ?? 'Brasil' },
  ])

  // Descrição do serviço (faixa cheia)
  y = drawRow(y, [
    { x: X_C1, w: LINE_FULL_W - 8, label: 'Descrição do Serviço', value: parsed.discriminacao || '-' },
  ])

  // Divisória após SERVIÇO PRESTADO
  drawFullLine(y)
  y += ROW_PADDING_TOP

  // ─── 7. Bloco TRIBUTAÇÃO MUNICIPAL ────────────────────────────────────────
  lbl('TRIBUTAÇÃO MUNICIPAL', X_C1, y, 8)
  y += 13

  const muniIncid = parsed.localIncidenciaNome
    ? `${parsed.localIncidenciaNome}${parsed.prestador?.endereco?.uf ? ' - ' + parsed.prestador.endereco.uf : ''}`
    : (parsed.localIncidenciaIbge ? `IBGE ${parsed.localIncidenciaIbge}` : (parsed.municipio || '-'))

  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'Tributação do ISSQN', value: fmtTribISSQN(parsed.tributacaoISSQN) },
    { x: X_C2, w: W_LBL_VAL, label: 'País Resultado da Prestação do Serviço', value: '-' },
    { x: X_C3, w: W_LBL_VAL, label: 'Município de Incidência do ISSQN', value: muniIncid },
    { x: X_C4, w: W_LBL_VAL, label: 'Regime Especial de Tributação',
      value: parsed.prestador?.regimeEspecialTributacao === '0' ? 'Nenhum' : (parsed.prestador?.regimeEspecialTributacao ?? 'Nenhum') },
  ])

  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'Tipo de Imunidade', value: parsed.tipoImunidadeISSQN ?? '-' },
    { x: X_C2, w: W_LBL_VAL, label: 'Suspensão da Exigibilidade do ISSQN', value: parsed.tributacaoISSQN === '3' ? 'Sim' : 'Não' },
    { x: X_C3, w: W_LBL_VAL, label: 'Número Processo Suspensão', value: '-' },
    { x: X_C4, w: W_LBL_VAL, label: 'Benefício Municipal', value: '-' },
  ])

  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'Valor do Serviço', value: fmtBRL(parsed.valorServicos), bold: true },
    { x: X_C2, w: W_LBL_VAL, label: 'Desconto Incondicionado', value: '-' },
    { x: X_C3, w: W_LBL_VAL, label: 'Total Deduções/Reduções', value: '-' },
    { x: X_C4, w: W_LBL_VAL, label: 'Cálculo do BM', value: '-' },
  ])

  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'BC ISSQN', value: parsed.baseCalculo != null ? fmtBRL(parsed.baseCalculo) : '-' },
    { x: X_C2, w: W_LBL_VAL, label: 'Alíquota Aplicada', value: fmtAliquota(parsed.aliquotaIss) },
    { x: X_C3, w: W_LBL_VAL, label: 'Retenção do ISSQN', value: fmtRetencaoISSQN(parsed.retencaoISSQN) },
    { x: X_C4, w: W_LBL_VAL, label: 'ISSQN Apurado', value: fmtBRL(parsed.valorIss) },
  ])

  drawFullLine(y)
  y += ROW_PADDING_TOP

  // ─── 8. Bloco TRIBUTAÇÃO FEDERAL ──────────────────────────────────────────
  lbl('TRIBUTAÇÃO FEDERAL', X_C1, y, 8)
  y += 13

  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'IRRF', value: '-' },
    { x: X_C2, w: W_LBL_VAL, label: 'Contribuição Previdenciária - Retida', value: '-' },
    { x: X_C3, w: W_LBL_VAL, label: 'Contribuições Sociais - Retidas', value: '-' },
    { x: X_C4, w: W_LBL_VAL, label: 'Descrição Contrib. Sociais - Retidas',
      value: parsed.pisCofinsCST === '00' ? '2 - PIS/COFINS Não Retidos' : '-' },
  ])

  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'PIS - Débito Apuração Própria', value: '-' },
    { x: X_C2, w: W_LBL_VAL, label: 'COFINS - Débito Apuração Própria', value: '-' },
  ])

  drawFullLine(y)
  y += ROW_PADDING_TOP

  // ─── 9. Bloco VALOR TOTAL DA NFS-E ────────────────────────────────────────
  lbl('VALOR TOTAL DA NFS-E', X_C1, y, 8)
  y += 13

  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'Valor do Serviço', value: fmtBRL(parsed.valorServicos), bold: true },
    { x: X_C2, w: W_LBL_VAL, label: 'Desconto Condicionado', value: '-' },
    { x: X_C3, w: W_LBL_VAL, label: 'Desconto Incondicionado', value: '-' },
    { x: X_C4, w: W_LBL_VAL, label: 'ISSQN Retido',
      value: parsed.retencaoISSQN === '2' ? fmtBRL(parsed.valorIss) : '-' },
  ])

  // Última linha: 3 campos + Valor Líquido em destaque
  y = drawRow(y, [
    { x: X_C1, w: W_LBL_VAL, label: 'Total das Retenções Federais', value: '-' },
    { x: X_C2, w: W_LBL_VAL, label: 'PIS/COFINS - Débito Apur. Própria', value: '-' },
    { x: X_C4, w: W_LBL_VAL, label: 'Valor Líquido da NFS-e',
      value: fmtBRL(parsed.valorLiquido ?? parsed.valorServicos), bold: true },
  ])

  drawFullLine(y)
  y += ROW_PADDING_TOP

  // ─── 10. Bloco TOTAIS APROXIMADOS DOS TRIBUTOS ────────────────────────────
  lbl('TOTAIS APROXIMADOS DOS TRIBUTOS', X_C1, y, 8)
  y += 13

  // 3 colunas centralizadas
  const yLabel = y
  const yVal = y + LBL_HEIGHT + LBL_VAL_GAP
  lbl('Federais', 91.062, yLabel, 7)
  val(parsed.totalTribFed != null ? fmtBRL(parsed.totalTribFed) : '-', 103.928, yVal, { size: 8 })
  lbl('Estaduais', 278.215, yLabel, 7)
  val(parsed.totalTribEst != null ? fmtBRL(parsed.totalTribEst) : '-', 292.904, yVal, { size: 8 })
  lbl('Municipais', 465.917, yLabel, 7)
  val(parsed.totalTribMun != null ? fmtBRL(parsed.totalTribMun) : '-', 481.881, yVal, { size: 8 })
  y = yVal + 8 + ROW_GAP

  drawFullLine(y)
  y += ROW_PADDING_TOP

  // ─── 11. Bloco INFORMAÇÕES COMPLEMENTARES ─────────────────────────────────
  lbl('INFORMAÇÕES COMPLEMENTARES', X_C1, y, 8)
  y += 13

  function infoLine(label: string, value: string): void {
    lbl(label, X_C1, y, 7)
    const labelW = doc.font(FONT_B).fontSize(7).widthOfString(label)
    val(` ${value}`, X_C1 + labelW + 1, y - 0.9, { size: 8 })
    y += 11
  }
  if (parsed.codigoNBS) infoLine('NBS:', parsed.codigoNBS)
  if (parsed.cnae) infoLine('CNAE:', parsed.cnae)
  if (parsed.numeroDFSe) infoLine('Número DFS-e:', parsed.numeroDFSe)
  if (parsed.codigoVerificacao) infoLine('Código de Verificação:', parsed.codigoVerificacao)

  doc.end()
  return readableToBuffer(doc as unknown as Readable)
}
