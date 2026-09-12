import { z } from 'zod'

import { router, publicProcedure, portalSessaoProcedure, portalProcedure } from '../trpc/trpc.service'
import type { PortalArquivosService } from './portal-arquivos.service'
import type { GestaoArquivosDriveService } from '../gestao-arquivos/gestao-arquivos-drive.service'
import type { ConviteValido } from './portal-tipos'
import { listarVinculos } from './portal-escopo'

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
export function createPortalRouter(
  conviteService: ConviteApi,
  arquivosService: PortalArquivosService,
  driveService: GestaoArquivosDriveService,
) {
  return router({
    /**
     * As empresas que este usuário enxerga.
     *
     * É a primeira chamada do portal e a única sem `clienteId` — alimenta o
     * seletor de empresa. Devolve só nome, nível e áreas: nenhum dado do
     * cliente sai daqui, isso é papel das rotas com escopo.
     */
    meusClientes: portalSessaoProcedure.query(({ ctx }) => listarVinculos(ctx.userId)),

    /**
     * Porta-arquivos — Fase 1.
     *
     * Todas com `portalProcedure`: o `clienteId` vem do input, e o vínculo é
     * resolvido ANTES do handler. O serviço recebe o vínculo pronto e nunca
     * monta consulta sem ele.
     */
    arquivos: router({
      /**
       * Abre uma pasta: subpastas, arquivos e o caminho até a raiz.
       *
       * `pastaId` ausente = raiz. Uma chamada só porque a tela precisa das três
       * coisas juntas — e porque validar a pasta antes de listar é o que impede
       * navegar para a pasta de outro cliente por id adivinhado.
       */
      abrirPasta: portalProcedure
        .input(z.object({ clienteId: z.string(), pastaId: z.string().nullish() }))
        .query(({ input, ctx }) => arquivosService.abrirPasta(ctx.portal, input.pastaId)),

      /**
       * A pasta do cliente no Google Drive do escritório.
       *
       * Só ADMINISTRADOR enxerga — ver `podeVerDriveNoPortal`. Não é excesso
       * de zelo: os arquivos do Drive não têm categoria, e é a categoria que o
       * portal usa para separar por área. Para quem não pode, devolve
       * `vinculada: false` com o motivo, em vez de erro — a aba simplesmente
       * explica que não está disponível.
       */
      drive: portalProcedure
        .input(z.object({ clienteId: z.string(), subPastaId: z.string().nullish() }))
        .query(({ input, ctx }) => driveService.listarParaPortal(ctx.portal, input.subPastaId)),

      /**
       * Escrita no Drive do cliente.
       *
       * Cada uma confere a própria permissão dentro do serviço, e não aqui: a
       * `portalProcedure` resolve o vínculo, mas quem sabe o que "editar"
       * significa para arquivo é o serviço. Deixar a checagem no router
       * significaria repeti-la em toda rota nova e esquecê-la em uma delas.
       */
      driveCriarPasta: portalProcedure
        .input(z.object({
          clienteId: z.string(),
          nome: z.string().min(1).max(120),
          paiId: z.string().nullish(),
        }))
        .mutation(({ input, ctx }) =>
          driveService.criarPastaParaPortal(ctx.portal, input.nome, input.paiId)),

      driveEnviar: portalProcedure
        .input(z.object({
          clienteId: z.string(),
          fileName: z.string().min(1).max(255),
          fileUrl: z.string().min(1),
          pastaId: z.string().nullish(),
          mimeType: z.string().nullish(),
        }))
        .mutation(({ input, ctx }) => driveService.enviarParaPortal(ctx.portal, input, ctx.userId)),

      driveExcluir: portalProcedure
        .input(z.object({ clienteId: z.string(), itemId: z.string() }))
        .mutation(({ input, ctx }) => driveService.excluirParaPortal(ctx.portal, input.itemId)),

      /**
       * A lixeira do cliente.
       *
       * Não é a lixeira do Google inteira — aquela é da conta do escritório e
       * mistura todos os clientes. É o que foi excluído de dentro da pasta
       * DESTE cliente, que o Drive permite perguntar porque o item excluído
       * mantém os pais.
       */
      driveLixeira: portalProcedure
        .input(z.object({ clienteId: z.string() }))
        .query(({ ctx }) => driveService.lixeiraParaPortal(ctx.portal)),

      driveRestaurar: portalProcedure
        .input(z.object({ clienteId: z.string(), itemId: z.string() }))
        .mutation(({ input, ctx }) => driveService.restaurarParaPortal(ctx.portal, input.itemId)),

      /** Arrastar e soltar: `destinoId` nulo leva para a raiz do cliente. */
      driveMover: portalProcedure
        .input(z.object({
          clienteId: z.string(),
          itemId: z.string(),
          destinoId: z.string().nullable(),
        }))
        .mutation(({ input, ctx }) =>
          driveService.moverParaPortal(ctx.portal, input.itemId, input.destinoId)),

      criarPasta: portalProcedure
        .input(z.object({
          clienteId: z.string(),
          nome: z.string().min(1).max(80),
          paiId: z.string().nullish(),
        }))
        .mutation(({ input, ctx }) => arquivosService.criarPasta(ctx.portal, input, ctx.userId)),

      excluirPasta: portalProcedure
        .input(z.object({ clienteId: z.string(), pastaId: z.string() }))
        .mutation(({ input, ctx }) => arquivosService.excluirPasta(ctx.portal, input.pastaId)),

      /** Devolve a URL e marca o recibo de leitura. */
      abrir: portalProcedure
        .input(z.object({ clienteId: z.string(), arquivoId: z.string() }))
        .mutation(({ input, ctx }) => arquivosService.abrir(ctx.portal, input.arquivoId, ctx.userId)),

      enviar: portalProcedure
        .input(z.object({
          clienteId: z.string(),
          fileName: z.string().min(1),
          fileUrl: z.string().min(1),
          fileSize: z.number().nullish(),
          mimeType: z.string().nullish(),
          competencia: z.string().length(6).nullish(),
          categoria: z.string().nullish(),
          descricao: z.string().nullish(),
          solicitacaoId: z.string().nullish(),
          pastaId: z.string().nullish(),
        }))
        .mutation(({ input, ctx }) => arquivosService.enviar(ctx.portal, input, ctx.userId)),
    }),

    /** O que o escritório está esperando deste cliente. */
    solicitacoes: router({
      pendentes: portalProcedure
        .input(z.object({ clienteId: z.string() }))
        .query(({ ctx }) => arquivosService.solicitacoesPendentes(ctx.portal)),

      marcarAtendida: portalProcedure
        .input(z.object({ clienteId: z.string(), solicitacaoId: z.string() }))
        .mutation(({ input, ctx }) =>
          arquivosService.marcarSolicitacaoAtendida(ctx.portal, input.solicitacaoId, ctx.userId)),
    }),

    /**
     * O que a pessoa pode ver NESTE cliente.
     *
     * A tela usa para montar o menu: sem isto ela ofereceria itens que a API
     * recusaria depois, e o cliente descobriria a permissão pelo erro.
     */
    meuAcesso: portalProcedure
      .input(z.object({ clienteId: z.string() }))
      .query(({ ctx }) => ctx.portal),

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
