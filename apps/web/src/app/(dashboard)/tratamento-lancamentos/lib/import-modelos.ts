import {
  EXPORT_FORMATO,
  EXPORT_VERSAO_FORMATO,
  normalizeDefinition,
  treatmentDefinitionSchema,
  treatmentModelExportSchema,
  type TreatmentModelExport,
} from '@saas/types'

// Importação de Modelos de Tratamento — o caminho de volta da exportação
// (export-modelos.ts): lê `.json` (um modelo) e `.zip` (vários, como o "Exportar N"
// gera) e valida cada arquivo contra o MESMO contrato `treatmentModelExportSchema`.
// Tudo no navegador; a criação é o `create` comum da API. Aqui só a parte pura.

export type ModeloLido =
  | { arquivo: string; ok: true; modelo: TreatmentModelExport }
  | { arquivo: string; ok: false; erro: string }

/**
 * Valida o conteúdo (texto) de UM arquivo de modelo. A definição passa pelo
 * `normalizeDefinition` antes do schema: um arquivo exportado antes de um bloco
 * novo existir (ex.: sem `aceitaVazio`) entra com o default, como no banco.
 */
export function lerModeloJson(arquivo: string, texto: string): ModeloLido {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return { arquivo, ok: false, erro: 'Não é um JSON válido.' }
  }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { arquivo, ok: false, erro: 'Não é um arquivo de modelo de tratamento.' }
  }
  const b = bruto as Record<string, unknown>
  if (b.formato !== EXPORT_FORMATO) {
    return { arquivo, ok: false, erro: 'Não é um arquivo de modelo de tratamento (formato desconhecido).' }
  }
  if (b.versaoFormato !== EXPORT_VERSAO_FORMATO) {
    return { arquivo, ok: false, erro: `Versão do formato não suportada (${String(b.versaoFormato)}).` }
  }
  const def = treatmentDefinitionSchema.safeParse(normalizeDefinition(b.definition))
  if (!def.success) return { arquivo, ok: false, erro: `Definição inválida — ${motivos(def.error.issues)}` }
  const r = treatmentModelExportSchema.safeParse({ ...b, definition: def.data })
  if (!r.success) return { arquivo, ok: false, erro: motivos(r.error.issues) }
  return { arquivo, ok: true, modelo: { ...r.data, nome: r.data.nome.trim() } }
}

function motivos(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ')
}

/**
 * Lê os arquivos escolhidos: cada `.json` vira um modelo; cada `.zip` vira um
 * modelo por `.json` de dentro (o resto do zip é ignorado). Arquivo de outro tipo
 * ou ilegível entra como erro, sem derrubar os demais.
 */
export async function lerArquivosDeModelo(arquivos: ReadonlyArray<File>): Promise<ModeloLido[]> {
  const out: ModeloLido[] = []
  for (const f of arquivos) {
    const nome = f.name.toLowerCase()
    if (nome.endsWith('.json')) {
      out.push(lerModeloJson(f.name, await f.text()))
    } else if (nome.endsWith('.zip')) {
      try {
        const { default: JSZip } = await import('jszip')
        const zip = await JSZip.loadAsync(f)
        const jsons = Object.values(zip.files)
          .filter((e) => !e.dir && e.name.toLowerCase().endsWith('.json'))
          .sort((a, b) => a.name.localeCompare(b.name))
        if (!jsons.length) out.push({ arquivo: f.name, ok: false, erro: 'O .zip não contém nenhum .json.' })
        for (const e of jsons) out.push(lerModeloJson(`${f.name} › ${e.name}`, await e.async('string')))
      } catch {
        out.push({ arquivo: f.name, ok: false, erro: 'Não foi possível abrir o .zip.' })
      }
    } else {
      out.push({ arquivo: f.name, ok: false, erro: 'Formato não suportado (envie .json ou .zip).' })
    }
  }
  return out
}
