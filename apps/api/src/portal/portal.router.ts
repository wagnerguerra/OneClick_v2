import { z } from 'zod'

import { router, publicProcedure } from '../trpc/trpc.service'
import type { ConviteValido } from './portal-tipos'

/**
 * O router declara o que USA do serviço, em vez de importar a classe.
 *
 * Não é preciosismo: `portal-convite.service` importa `better-auth/crypto`, que
 * não resolve a partir de `apps/web`. O front tipa o cliente tRPC a partir
 * DESTE arquivo, e um import que ele não consegue resolver degradava o tipo de
 * retorno inteiro — a chave `portal` sumia do `AppRouter` e a página do convite
 * não compilava, com um erro que apontava para o lugar errado.
 *
 * Tipar estruturalmente mantém a fronteira: o front enxerga a forma, não o
 * módulo de servidor por trás dela.
 */
interface ConviteApi {
  validar(token: string): Promise<ConviteValido>
  definirSenha(token: string, senha: string): Promise<{ email: string }>
}

/**
 * Rotas do Portal do Cliente.
 *
 * Por ora só o convite — que é PÚBLICO por natureza: quem abre o link ainda não
 * tem senha, logo não tem sessão. A autenticação aqui é o próprio token, e por
 * isso ele é de 32 bytes, guardado só como hash, de uso único e com prazo.
 *
 * O resto do portal (Fase 1 em diante) entra neste mesmo namespace usando
 * `portalProcedure`, que exige sessão e resolve o cliente antes do handler.
 * A regra do namespace continua valendo: nada lê dado de cliente sem escopo.
 */
export function createPortalRouter(conviteService: ConviteApi) {
  return router({
    convite: router({
      /** Abre a tela do convite. Devolve o mínimo para a pessoa se reconhecer. */
      validar: publicProcedure
        .input(z.object({ token: z.string().min(10) }))
        .query(({ input }) => conviteService.validar(input.token)),

      /** Define a senha e queima o convite. */
      definirSenha: publicProcedure
        .input(z.object({
          token: z.string().min(10),
          senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
        }))
        .mutation(({ input }) => conviteService.definirSenha(input.token, input.senha)),
    }),
  })
}
