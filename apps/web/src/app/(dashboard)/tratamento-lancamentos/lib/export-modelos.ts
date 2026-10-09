import {
  EXPORT_FORMATO,
  EXPORT_VERSAO_FORMATO,
  normalizeDefinition,
  treatmentDefinitionSchema,
  treatmentModelExportSchema,
  type TipoArquivoModelo,
  type TreatmentModelExport,
} from '@saas/types'

// Exportação de Modelos de Tratamento em JSON — contrato `treatmentModelExportSchema`
// (@saas/types), importado pelo Centria. Montado todo no navegador a partir do que
// `getById`/`getVersion` já devolvem; aqui só a parte pura (montar + validar) e o
// download.

export type BuildModeloResult =
  | { ok: true; fileName: string; json: string }
  | { ok: false; error: string }

/**
 * Monta o arquivo de exportação de UM modelo: normaliza o snapshot (formatos
 * antigos saem no schema corrente), valida a definição e devolve o JSON (UTF-8,
 * indentado em 2 espaços). Definição que não valida NÃO é exportada → `ok: false`
 * com o motivo, para a UI avisar qual modelo falhou.
 */
export function buildModeloJson(
  nome: string,
  tipoArquivo: TipoArquivoModelo | null,
  definition: unknown,
): BuildModeloResult {
  const def = treatmentDefinitionSchema.safeParse(normalizeDefinition(definition))
  if (!def.success) {
    const motivo = def.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ')
    return { ok: false, error: `Definição inválida — ${motivo}` }
  }
  const arquivo: TreatmentModelExport = {
    formato: EXPORT_FORMATO,
    versaoFormato: EXPORT_VERSAO_FORMATO,
    nome: nome.trim(),
    tipoArquivo,
    // Saída do parse do zod: só as chaves do schema (descarta lixo de snapshots antigos).
    definition: def.data,
  }
  // Rede de segurança do contrato (ex.: nome vazio, chave a mais).
  const check = treatmentModelExportSchema.safeParse(arquivo)
  if (!check.success) return { ok: false, error: check.error.issues.map((i) => i.message).join('; ') }
  return { ok: true, fileName: nomeArquivoModelo(nome), json: JSON.stringify(check.data, null, 2) + '\n' }
}

/** Nome do arquivo de um modelo: `modelo-<slug-do-nome>.json`. */
export function nomeArquivoModelo(nome: string): string {
  const slug = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `modelo-${slug || 'sem-nome'}.json`
}

/**
 * Garante nomes únicos dentro de um mesmo `.zip`: o 2º "modelo-x.json" vira
 * "modelo-x-2.json", o 3º "modelo-x-3.json"… (pulando sufixos já tomados, ex.: um
 * modelo chamado "x 2"). `usados` acumula entre chamadas.
 */
export function nomeUnico(fileName: string, usados: Set<string>): string {
  let candidato = fileName
  for (let n = 2; usados.has(candidato); n++) candidato = fileName.replace(/\.json$/, `-${n}.json`)
  usados.add(candidato)
  return candidato
}

export interface ModeloParaExportar {
  nome: string
  tipoArquivo: TipoArquivoModelo | null
  definition: unknown
}

export interface ExportacaoZipResult {
  /** null quando nenhum modelo pôde ser exportado. */
  zip: Blob | null
  exportados: number
  falhas: Array<{ nome: string; motivo: string }>
}

/**
 * "Exportar todos": busca cada modelo (sequencialmente — progresso real e sem
 * rajada no backend), monta o `.json` de cada um e empacota num `.zip`. Um modelo
 * que falha (busca ou validação) não derruba os outros: vai para `falhas`.
 */
export async function exportarModelosZip(
  modelos: ReadonlyArray<{ id: string; nome: string }>,
  buscar: (id: string) => Promise<ModeloParaExportar>,
  onProgress?: (feitos: number, total: number) => void,
): Promise<ExportacaoZipResult> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const usados = new Set<string>()
  const falhas: ExportacaoZipResult['falhas'] = []
  let exportados = 0
  for (let i = 0; i < modelos.length; i++) {
    const m = modelos[i]!
    try {
      const dados = await buscar(m.id)
      const r = buildModeloJson(dados.nome, dados.tipoArquivo, dados.definition)
      if (r.ok) {
        zip.file(nomeUnico(r.fileName, usados), r.json)
        exportados++
      } else {
        falhas.push({ nome: m.nome, motivo: r.error })
      }
    } catch {
      falhas.push({ nome: m.nome, motivo: 'Não foi possível carregar o modelo.' })
    }
    onProgress?.(i + 1, modelos.length)
  }
  return {
    zip: exportados ? await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }) : null,
    exportados,
    falhas,
  }
}

/** Nome do `.zip` do "Exportar todos": `modelos-tratamento-AAAA-MM-DD.zip` (data local). */
export function nomeZipModelos(hoje = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `modelos-tratamento-${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}.zip`
}

/** Dispara o download de um arquivo gerado no navegador. */
export function downloadArquivo(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** Baixa o `.json` de um modelo já montado por `buildModeloJson`. */
export function downloadModeloJson(fileName: string, json: string) {
  downloadArquivo(fileName, new Blob([json], { type: 'application/json;charset=utf-8' }))
}
