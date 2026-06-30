/**
 * Cliente HTTP do cadastro de clientes/fornecedores. No OneClick, o browser fala
 * com a própria API (`/api/tools/extrato-edit/*`), que proxia para o webapp.
 */
import type { RegistryRow } from './parseRegistry'
import { getApiUrl } from '@/lib/api-url'

const API_PREFIX = '/api'
const base = () => getApiUrl()

export type EntidadeTipo = 'cliente' | 'fornecedor'

export type Entidade = {
  tipo: EntidadeTipo
  codigo: string
  nome: string
  cnpj: string
  updatedAt: string
}

export type Counts = { cliente: number; fornecedor: number }

export type ImportResult = {
  inserted: number
  updated: number
  ignored: number
  counts: Counts
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
  return body.error ?? body.message ?? res.statusText
}

const CREDS: RequestInit = { credentials: 'include' }

/** Grava o cadastro no banco. `replace` apaga o tipo antes de inserir (recarga do zero). */
export async function importEntidades(tipo: EntidadeTipo, rows: RegistryRow[], replace = false): Promise<ImportResult> {
  const res = await fetch(`${base()}${API_PREFIX}/tools/extrato-edit/entidades/import`, {
    ...CREDS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, rows, replace }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<ImportResult>
}

/** Busca CNPJ/nome por código (só os que casaram entram no mapa de retorno). */
export async function lookupCnpj(
  tipo: EntidadeTipo,
  codigos: string[],
): Promise<Record<string, { cnpj: string; nome: string }>> {
  const res = await fetch(`${base()}${API_PREFIX}/tools/extrato-edit/lookup`, {
    ...CREDS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, codigos }),
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { matches: Record<string, { cnpj: string; nome: string }> }
  return data.matches ?? {}
}

export async function fetchCounts(): Promise<Counts> {
  const res = await fetch(`${base()}${API_PREFIX}/tools/extrato-edit/entidades/counts`, CREDS)
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { counts: Counts }
  return data.counts ?? { cliente: 0, fornecedor: 0 }
}

export type ListResult = { items: Entidade[]; total: number; counts: Counts }

export async function listEntidades(opts: {
  tipo?: EntidadeTipo
  q?: string
  limit?: number
  offset?: number
}): Promise<ListResult> {
  const qs = new URLSearchParams()
  if (opts.tipo) qs.set('tipo', opts.tipo)
  if (opts.q) qs.set('q', opts.q)
  if (opts.limit != null) qs.set('limit', String(opts.limit))
  if (opts.offset != null) qs.set('offset', String(opts.offset))
  const res = await fetch(`${base()}${API_PREFIX}/tools/extrato-edit/entidades?${qs.toString()}`, CREDS)
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<ListResult>
}

export async function deleteEntidade(tipo: EntidadeTipo, codigo: string): Promise<Counts> {
  const qs = new URLSearchParams({ tipo, codigo })
  const res = await fetch(`${base()}${API_PREFIX}/tools/extrato-edit/entidades/item?${qs.toString()}`, {
    ...CREDS,
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { counts: Counts }
  return data.counts
}

export async function clearTipo(tipo: EntidadeTipo): Promise<Counts> {
  const res = await fetch(`${base()}${API_PREFIX}/tools/extrato-edit/entidades?tipo=${tipo}`, {
    ...CREDS,
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { counts: Counts }
  return data.counts
}
