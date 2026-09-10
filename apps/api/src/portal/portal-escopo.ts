import { prisma } from '@saas/db'

/**
 * Escopo do usuário externo — a peça que impede um cliente de ler o outro.
 *
 * Todo o resto do sistema isola por EMPRESA e por TENANT, porque todo
 * procedimento foi escrito supondo um usuário interno do escritório. O portal
 * quebra essa premissa: quem chama é de fora, e o isolamento que importa passa
 * a ser por CLIENTE.
 *
 * Por isso este arquivo não é um helper opcional. É o único ponto onde se
 * decide se uma pessoa pode ver um cliente, e nenhum procedimento do portal
 * deve consultar `cliente_usuarios` por conta própria — a regra vive aqui para
 * poder ser lida, testada e auditada num lugar só.
 *
 * Regra de ouro do namespace `portal.*`: nada consulta um cliente sem antes
 * passar por `resolverVinculo`. Um `where` sem `clienteId` no portal não é bug
 * de listagem, é vazamento entre clientes.
 */

export type PortalNivel = 'ADMINISTRADOR' | 'OPERACIONAL' | 'CONSULTA'

/**
 * Ordem de força dos níveis. Existe para `atendeNivel` poder comparar sem
 * espalhar `if` por todo procedimento.
 */
const FORCA: Record<PortalNivel, number> = {
  CONSULTA: 0,
  OPERACIONAL: 1,
  ADMINISTRADOR: 2,
}

export interface VinculoPortal {
  clienteId: string
  nivel: PortalNivel
  /**
   * Áreas em que a pessoa pode operar — JÁ interseccionadas com as que o
   * cliente contratou. Ver `intersecaoAreas`.
   */
  areas: string[]
}

/** O usuário atende ao nível mínimo exigido? */
export function atendeNivel(vinculo: VinculoPortal, minimo: PortalNivel): boolean {
  return FORCA[vinculo.nivel] >= FORCA[minimo]
}

/**
 * Áreas efetivas: o que foi concedido ao usuário, limitado ao que o cliente
 * contratou.
 *
 * A ordem importa e não é simétrica no efeito prático: conceder ao usuário uma
 * área que o cliente não contrata não deve abrir nada. Sem esta interseção, um
 * cliente que encerrou a folha continuaria expondo folha ao usuário que ficou
 * marcado nela — e o encerramento do serviço não fecharia o acesso.
 *
 * Administrador NÃO é exceção aqui: ele vê tudo do portal, mas "tudo" continua
 * sendo o que o cliente contratou.
 */
export function intersecaoAreas(concedidas: string[], contratadas: string[]): string[] {
  const contratadasSet = new Set(contratadas)
  return concedidas.filter(a => contratadasSet.has(a))
}

/** A pessoa pode operar nesta área? */
export function podeNaArea(vinculo: VinculoPortal, areaId: string): boolean {
  return vinculo.areas.includes(areaId)
}

/**
 * Vínculo do usuário com UM cliente, ou `null` se não houver.
 *
 * `null` cobre os quatro casos com a mesma resposta, de propósito: sem vínculo,
 * vínculo desativado, cliente inativo e cliente inexistente. Distingui-los na
 * resposta diria a um curioso se determinado id de cliente existe — e a
 * diferença não muda nada para quem tem acesso legítimo.
 */
export async function resolverVinculo(userId: string, clienteId: string): Promise<VinculoPortal | null> {
  const vinculo = await prisma.clienteUsuario.findUnique({
    where: { userId_clienteId: { userId, clienteId } },
    select: {
      clienteId: true,
      nivel: true,
      areas: true,
      ativo: true,
      cliente: {
        select: {
          status: true,
          servicosContratados: {
            where: { contratado: true },
            select: { areaId: true },
          },
        },
      },
    },
  })

  if (!vinculo || !vinculo.ativo) return null
  // Cliente inativado no escritório perde o portal junto. Manter o acesso de
  // um ex-cliente aos próprios documentos é decisão comercial, não default.
  if (vinculo.cliente.status !== 'ATIVO') return null

  return {
    clienteId: vinculo.clienteId,
    nivel: vinculo.nivel as PortalNivel,
    areas: intersecaoAreas(
      vinculo.areas,
      vinculo.cliente.servicosContratados.map(a => a.areaId),
    ),
  }
}

/** Marca do escritório que atende o cliente — a logo do topo do portal. */
export interface MarcaDoEscritorio {
  nome: string
  logoUrl: string | null
  logoDarkUrl: string | null
}

/**
 * Todos os clientes que este usuário enxerga.
 *
 * É o que alimenta o seletor de empresa do portal — o caso do diretor de grupo
 * com matriz e filiais, que foi a razão de o vínculo ser tabela e não campo.
 *
 * Traz junto a marca do ESCRITÓRIO que atende cada cliente. O portal não pode
 * usar `empresa.getMyEmpresa`, que é interna e o usuário externo não alcança —
 * e a marca precisa acompanhar o cliente ativo, não a sessão: numa instalação
 * com mais de um escritório, trocar de empresa troca de logo.
 */
export async function listarVinculos(
  userId: string,
): Promise<Array<VinculoPortal & { razaoSocial: string; escritorio: MarcaDoEscritorio | null }>> {
  const vinculos = await prisma.clienteUsuario.findMany({
    where: { userId, ativo: true, cliente: { status: 'ATIVO' } },
    select: {
      clienteId: true,
      nivel: true,
      areas: true,
      cliente: {
        select: {
          razaoSocial: true,
          servicosContratados: { where: { contratado: true }, select: { areaId: true } },
          empresa: {
            select: { razaoSocial: true, nomeFantasia: true, logoUrl: true, logoDarkUrl: true },
          },
        },
      },
    },
    orderBy: { cliente: { razaoSocial: 'asc' } },
  })

  return vinculos.map(v => ({
    clienteId: v.clienteId,
    nivel: v.nivel as PortalNivel,
    areas: intersecaoAreas(v.areas, v.cliente.servicosContratados.map(a => a.areaId)),
    razaoSocial: v.cliente.razaoSocial,
    escritorio: v.cliente.empresa
      ? {
          nome: v.cliente.empresa.nomeFantasia ?? v.cliente.empresa.razaoSocial,
          logoUrl: v.cliente.empresa.logoUrl,
          logoDarkUrl: v.cliente.empresa.logoDarkUrl,
        }
      : null,
  }))
}

/** Este usuário é externo (tem algum vínculo de portal)? */
export async function ehUsuarioDePortal(userId: string): Promise<boolean> {
  const n = await prisma.clienteUsuario.count({ where: { userId, ativo: true } })
  return n > 0
}
