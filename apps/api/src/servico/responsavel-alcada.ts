/**
 * Quem pode definir o responsável pela execução de um serviço — a DECISÃO,
 * separada das consultas.
 *
 * Mora fora do `servico.service` por um motivo prático: aquele arquivo arrasta
 * meio backend na importação, e o ts-jest typecheca o grafo inteiro — um teste
 * desta regra levaria minutos e ninguém o rodaria. Aqui a função é pura (não
 * toca prisma), então o spec ao lado roda em milissegundos. O serviço continua
 * dono das consultas: busca o usuário e a área do serviço, e chama isto.
 *
 * A regra: a alçada de uma chefia é a ÁREA pela qual ela responde
 * (`Area.leaderId`). Master, diretoria e coordenação enxergam todas.
 */

export type AlcadaCaller = {
  /** Enxerga todas as áreas (master, empresa-master, diretoria, coordenação). */
  isGlobal: boolean
  /** Áreas que o usuário LIDERA (`Area.leaderId` → `user.ledAreas`). */
  ledAreaIds: string[]
}

export type AreaDoServico = { id: string; name: string; isActive: boolean } | null | undefined

export type Alcada = { podeDefinir: boolean; motivo: string | null }

export function decidirAlcadaResponsavel(
  caller: AlcadaCaller | null,
  servicoId: string | null,
  area: AreaDoServico,
): Alcada {
  if (!caller) return { podeDefinir: false, motivo: 'Usuário não encontrado.' }
  if (caller.isGlobal) return { podeDefinir: true, motivo: null }

  if (caller.ledAreaIds.length === 0) {
    return {
      podeDefinir: false,
      motivo: 'Você não lidera nenhuma área. Só o líder da área do serviço pode definir quem executa.',
    }
  }
  if (!servicoId) {
    return { podeDefinir: false, motivo: 'Serviço não identificado — sem área, não há alçada a verificar.' }
  }
  // Serviço sem área não pertence a área nenhuma, logo não pertence à do líder.
  // Recusar com o motivo explícito aponta o conserto (configurar a área do
  // serviço); liberar por falta de dado abriria a exceção mais larga que a regra.
  if (!area || !area.isActive) {
    return {
      podeDefinir: false,
      motivo: 'Este serviço não tem área configurada. Defina a área do serviço no catálogo para poder atribuir.',
    }
  }
  if (!caller.ledAreaIds.includes(area.id)) {
    return { podeDefinir: false, motivo: `Este serviço é da área ${area.name}, que você não lidera.` }
  }
  return { podeDefinir: true, motivo: null }
}
