import { getApiUrl } from '@/lib/api-url'

// Cliente do front para as rotas REST das ferramentas (proxy do OneClick → webapp).
// Upload/status/download/inspect. Sempre com credentials (cookie de sessão).
// Ver docs/plano-ferramentas.md §Fase 1 passo 8.

export type ToolJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'not_found'

export interface ToolJobView {
  id: string
  code?: number
  tool: string
  status: ToolJobStatus
  progress?: number
  fileNameIn?: string
  fileNameOut?: string | null
  errorMessage?: string | null
  createdAt?: string
}

export interface CreateToolJobResult {
  id: string
  status: ToolJobStatus
}

async function extractError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string; error?: string }
    return j.message ?? j.error ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

/** Parte de upload: um campo multipart com 1+ arquivos (ex.: sefaz[], sci[]). */
export interface ToolFilePart {
  field: string
  files: File[]
}

/** Cria um job genérico: N campos de arquivo + campos de texto → `/api/tools/:tool/jobs`. */
export async function submitToolJob(
  tool: string,
  parts: ToolFilePart[],
  textFields: Record<string, string> = {},
): Promise<CreateToolJobResult> {
  const form = new FormData()
  for (const part of parts) for (const f of part.files) form.append(part.field, f)
  for (const [key, value] of Object.entries(textFields)) form.append(key, value)

  const res = await fetch(`${getApiUrl()}/api/tools/${tool}/jobs`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json() as Promise<CreateToolJobResult>
}

/** Atalho 1-arquivo (campo `file`) — usado pelas ferramentas de entrada única. */
export async function createToolJob(
  tool: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<CreateToolJobResult> {
  return submitToolJob(tool, [{ field: 'file', files: [file] }], fields)
}

/** Consulta o status atual de um job (o OneClick sincroniza com o webapp). */
export async function getToolJobStatus(tool: string, id: string): Promise<ToolJobView> {
  const res = await fetch(`${getApiUrl()}/api/tools/${tool}/jobs/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json() as Promise<ToolJobView>
}

/** URL de download (o navegador navega direto; o OneClick faz o stream do arquivo). */
export function toolJobDownloadUrl(tool: string, id: string): string {
  return `${getApiUrl()}/api/tools/${tool}/jobs/${id}/download`
}

/** Pré-passo do SPED: valida os REGs presentes no `.txt` (para escolher abas). */
export async function inspectSped(file: File): Promise<{ presentRegs: string[] }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${getApiUrl()}/api/tools/sped/inspect`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json() as Promise<{ presentRegs: string[] }>
}
