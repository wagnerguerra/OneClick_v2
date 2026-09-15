import { prisma } from '@saas/db'
import type { VinculoPortal } from './portal-escopo'

/**
 * Quem atende esta empresa no escritório — o "sua equipe" da home do portal.
 *
 * É o bloco que todo portal de cliente contábil acaba tendo: o cliente quer
 * saber com quem falar sem abrir o WhatsApp para perguntar. A informação já
 * existe no cadastro (responsável e substituto por área contratada); aqui ela
 * só é recortada para quem está do lado de fora.
 *
 * Recortes, todos de propósito:
 *  - SÓ as áreas do vínculo. O RH do cliente não precisa do contato do fiscal,
 *    e o recorte é o mesmo que decide o que essa pessoa enxerga no portal.
 *    Vínculo sem área nenhuma não vê equipe nenhuma (fail-closed, como nas
 *    obrigações).
 *  - Só área contratada e sem encerramento: área que o cliente não contrata
 *    mais não tem quem o atenda por ela.
 *  - Só usuário ATIVO. Quem saiu do escritório não pode continuar aparecendo
 *    como o contato — o e-mail iria para uma caixa que ninguém lê.
 *  - Só nome, e-mail e foto. Telefone, ramal, cargo e salário são dados
 *    internos do escritório e ficam fora do payload, não só da tela.
 */

export interface PessoaDaEquipe {
  nome: string
  email: string
  imagem: string | null
}

export interface AreaDaEquipe {
  areaId: string
  area: string
  responsavel: PessoaDaEquipe | null
  substituto: PessoaDaEquipe | null
}

type UsuarioBruto = { name: string; email: string; image: string | null; isActive: boolean } | null

function pessoa(u: UsuarioBruto): PessoaDaEquipe | null {
  if (!u || !u.isActive) return null
  return { nome: u.name, email: u.email, imagem: u.image }
}

export async function listarEquipe(vinculo: VinculoPortal): Promise<AreaDaEquipe[]> {
  if (vinculo.areas.length === 0) return []

  const usuario = { select: { name: true, email: true, image: true, isActive: true } } as const
  const linhas = await prisma.clienteAreaContratada.findMany({
    where: {
      clienteId: vinculo.clienteId,
      areaId: { in: vinculo.areas },
      contratado: true,
      dataEncerramento: null,
    },
    orderBy: { area: { name: 'asc' } },
    select: {
      areaId: true,
      area: { select: { name: true } },
      responsavel: usuario,
      substituto: usuario,
    },
  })

  return linhas.map((l) => ({
    areaId: l.areaId,
    area: l.area.name,
    responsavel: pessoa(l.responsavel),
    substituto: pessoa(l.substituto),
  }))
}
