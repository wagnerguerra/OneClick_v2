import { prisma } from '@saas/db'

/**
 * Filtro Prisma das NFS-e "da pasta de um cliente": inclui as notas fisicamente
 * vinculadas (`clienteId`) E as do MESMO CNPJ como prestador OU tomador.
 *
 * Motivo: uma NFS-e entre dois clientes da própria empresa (ex.: a contabilidade
 * emite p/ um cliente — prestador e tomador ambos cadastrados) é gravada UMA vez
 * (dedup por chave única) e fica presa a um só `cliente_id` (quem sincronizou
 * primeiro). Ela é relevante para os DOIS — então a pasta de cada cliente resolve
 * também por CNPJ, não só pelo vínculo físico.
 *
 * `documento` é normalizado (só dígitos), igual ao formato gravado em
 * `prestador_cnpj`/`tomador_cnpj_cpf` (via `digits()` no parser, ambos indexados).
 * `__null__` = notas sem cliente (mantém o comportamento das telas de galeria).
 */
export async function resolverCnpjDoCliente(clienteId: string): Promise<string> {
  if (clienteId === '__null__') return ''
  const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { documento: true } })
  return (cli?.documento ?? '').replace(/\D/g, '')
}

/** Monta o where a partir do CNPJ já resolvido (evita novo lookup no banco). */
export function nfseWhereFromCnpj(clienteId: string, cnpj: string): Record<string, unknown> {
  if (clienteId === '__null__') return { clienteId: null }
  if (!cnpj) return { clienteId }
  return { OR: [{ clienteId }, { prestadorCnpj: cnpj }, { tomadorCnpjCpf: cnpj }] }
}

export async function nfseWhereDoCliente(clienteId: string): Promise<Record<string, unknown>> {
  const cnpj = await resolverCnpjDoCliente(clienteId)
  return nfseWhereFromCnpj(clienteId, cnpj)
}
