import { trpc } from '@/lib/trpc'
import type { ClienteOpcao } from '../_components/dialogs'

/** Clientes mensais ativos da empresa (referência estável para os modais). */
export const carregarClientesMensais = () => trpc.cnd.clientesMensais.query() as Promise<ClienteOpcao[]>

/** Documentos de todos os clientes mensais, no formato que os lotes esperam. */
export async function documentosMensais() {
  const lista = await carregarClientesMensais()
  return lista.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial }))
}
