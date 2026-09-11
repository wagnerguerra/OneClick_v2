import { prisma } from '@saas/db'

/**
 * Quem enxerga quais clientes na Gestão de Arquivos.
 *
 * Isolado do serviço de propósito: é a regra que decide se uma pessoa vê a
 * folha de pagamento de um cliente que não é dela. Num arquivo separado ela
 * cabe na cabeça e dá para testar sem subir o módulo inteiro — o mesmo motivo
 * que levou `portal-escopo.ts` a existir do lado do cliente.
 */

/**
 * Cargos que enxergam todos os clientes do tenant.
 *
 * Difere de propósito do `CARGOS_VEEM_TUDO` de `orcamento.router.ts`, que traz
 * só DIRETOR e COORDENADOR: lá a regra existe porque o gestor deve focar no
 * serviço em execução. Aqui o pedido foi explícito — "gestores, diretores,
 * master têm acesso a todos os clientes" —, então GESTOR entra. São regras de
 * negócio diferentes para módulos diferentes; unificá-las quebraria uma das
 * duas.
 */
const CARGOS_VEEM_TUDO: ReadonlySet<string> = new Set(['GESTOR', 'COORDENADOR', 'DIRETOR'])

export interface ContextoInterno {
  userId: string
  role?: string | null
  isMaster?: boolean
  /** Dono do tenant. Manda na própria empresa, mas não nas outras. */
  isEmpresaMaster?: boolean
  empresaId?: string | null
}

export type EscopoGestaoArquivos =
  /** Vê todos os clientes da empresa (ou de todas, se master global). */
  | { tudo: true }
  /** Vê apenas estes clientes — os que a pessoa responde por alguma área. */
  | { tudo: false; clienteIds: string[] }

/**
 * Recorte por empresa, com o mesmo `__none__` fail-closed do resto do sistema:
 * sem empresa e sem master, a consulta não devolve NADA em vez de devolver tudo.
 */
export function clienteDaEmpresa(isMaster?: boolean, empresaId?: string | null) {
  if (empresaId) return { empresaId }
  return isMaster ? {} : { empresaId: '__none__' }
}

/**
 * Resolve o que a pessoa alcança.
 *
 * Para o colaborador comum, a chave é `ClienteAreaContratada`: ser responsável
 * (ou substituto — férias não podem cegar quem está cobrindo) por QUALQUER área
 * de um cliente dá acesso a TODOS os arquivos daquele cliente. Foi decisão
 * explícita do escritório: o recorte por área, que o portal usa do lado de fora
 * via `CATEGORIA_EXIGE_AREA`, esconderia da pessoa coisas que ela precisa ver
 * no dia a dia.
 *
 * Área encerrada não conta: `dataEncerramento` preenchida significa que o
 * escritório parou de prestar aquele serviço, e a responsabilidade morre junto.
 */
export async function resolverEscopo(ctx: ContextoInterno): Promise<EscopoGestaoArquivos> {
  // `isEmpresaMaster` entra junto: é o dono do tenant, e restringi-lo às áreas
  // em que ele por acaso é responsável o deixaria sem enxergar o próprio
  // escritório. O recorte por empresa continua valendo para ele (ver
  // `filtroDeCliente`) — "tudo" aqui significa "todos os clientes que ele já
  // podia ver", não "todos os tenants".
  if (ctx.isMaster || ctx.isEmpresaMaster) return { tudo: true }
  if (ctx.role && CARGOS_VEEM_TUDO.has(String(ctx.role))) return { tudo: true }

  const areas = await prisma.clienteAreaContratada.findMany({
    where: {
      contratado: true,
      dataEncerramento: null,
      OR: [{ responsavelId: ctx.userId }, { substitutoId: ctx.userId }],
      cliente: clienteDaEmpresa(ctx.isMaster, ctx.empresaId),
    },
    select: { clienteId: true },
    distinct: ['clienteId'],
  })

  return { tudo: false, clienteIds: areas.map(a => a.clienteId) }
}

/**
 * Traduz o escopo para um `where` de Prisma sobre `cliente`.
 *
 * O caso de lista vazia é o que merece atenção: um colaborador sem nenhuma área
 * atribuída precisa cair em "nenhum cliente", e não em "sem filtro". `{ id: {
 * in: [] } }` faz exatamente isso no Prisma — devolve zero linhas — enquanto
 * omitir o filtro devolveria a empresa inteira. É o mesmo erro de categoria que
 * o `__none__` evita do outro lado.
 */
export function filtroDeCliente(escopo: EscopoGestaoArquivos, ctx: ContextoInterno) {
  const daEmpresa = clienteDaEmpresa(ctx.isMaster, ctx.empresaId)
  if (escopo.tudo) return daEmpresa
  return { ...daEmpresa, id: { in: escopo.clienteIds } }
}

/**
 * O cliente está dentro do alcance desta pessoa?
 *
 * Usado antes de qualquer operação que receba `clienteId` do cliente HTTP.
 * Sem esta checagem, trocar o id na requisição daria acesso aos arquivos de
 * qualquer cliente do tenant — a listagem filtrada não protege nada sozinha.
 */
export function alcancaCliente(escopo: EscopoGestaoArquivos, clienteId: string): boolean {
  return escopo.tudo || escopo.clienteIds.includes(clienteId)
}
