import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  router, readProcedure, writeProcedure, deleteSubProcedure, writeSubProcedure,
} from '../trpc/trpc.service'
import { GestaoArquivosService } from './gestao-arquivos.service'
import { GestaoArquivosDriveService } from './gestao-arquivos-drive.service'
import {
  GestaoArquivosNotificacaoService,
  EVENTOS_NOTIFICAVEIS,
} from './gestao-arquivos-notificacao.service'
import type { ContextoInterno } from './gestao-arquivos-escopo'

const MODULE = 'gestao-arquivos'

/**
 * O "ler" versus "ler e excluir" do lado do escritório sai do `UserPermission`
 * que já existe: `canRead` abre o módulo, `canDelete` libera a exclusão. Não
 * criamos sub-permissão nova porque a coluna certa já estava lá — uma chave em
 * `subPermissions` seria um segundo lugar para dizer a mesma coisa, e dois
 * lugares divergem.
 */
const eventoSchema = z.enum(EVENTOS_NOTIFICAVEIS)

/**
 * Exclusão e configuração são SUB-permissões, não `canDelete`/`canWrite`.
 *
 * A intenção original era usar as colunas que `UserPermission` já tem. O modelo
 * suportava, mas a TELA não: o interruptor do módulo liga canRead, canWrite e
 * canDelete de uma vez, então "ler" e "ler e excluir" ficariam indistinguíveis
 * na mão de quem concede — a promessa do módulo existiria só no banco.
 *
 * A sub-permissão é o mecanismo que a tela de permissões oferece para separar
 * os dois, e é assim que a Agenda já faz com `delete_eventos`.
 */
const SUB_EXCLUIR = 'excluir_arquivos'
const SUB_CONFIGURAR = 'configurar'

/** O contexto tRPC recortado para o que o escopo do módulo precisa. */
function contexto(ctx: {
  userId?: string
  role?: string
  isMaster?: boolean
  isEmpresaMaster?: boolean
  empresaId?: string
}): ContextoInterno {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
  return {
    userId: ctx.userId,
    role: ctx.role,
    isMaster: ctx.isMaster,
    isEmpresaMaster: ctx.isEmpresaMaster,
    empresaId: ctx.empresaId,
  }
}

/**
 * Quem administra o módulo.
 *
 * `masterProcedure` não serve: ela é do master GLOBAL da plataforma, e a pasta
 * do Drive é configuração DO TENANT — usá-la deixaria o dono do escritório sem
 * poder apontar a própria pasta. Então é o master global OU o dono do tenant.
 */
function exigirAdmin(ctx: { isMaster?: boolean; isEmpresaMaster?: boolean }) {
  if (!ctx.isMaster && !ctx.isEmpresaMaster) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Só o administrador do escritório configura a pasta do Drive.',
    })
  }
}

export function createGestaoArquivosRouter(
  service: GestaoArquivosService,
  notificacao: GestaoArquivosNotificacaoService,
  driveService: GestaoArquivosDriveService,
) {
  return router({
    /** Clientes com usuário no portal, já recortados por responsabilidade. */
    listarClientes: readProcedure(MODULE).query(({ ctx }) => service.listarClientes(contexto(ctx))),

    /** Nome do cliente, para o cabeçalho da tela de detalhe. */
    resumoCliente: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => service.resumoCliente(input.clienteId, contexto(ctx))),

    listar: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), pastaId: z.string().nullish() }))
      .query(({ input, ctx }) => service.listar(input, contexto(ctx))),

    /**
     * Abrir é `readProcedure` embora escreva (marca o visto e loga): a ação do
     * usuário é ler o arquivo, e exigir `canWrite` para isso impediria de ler
     * quem só tem leitura — exatamente o nível que o módulo promete.
     */
    abrir: readProcedure(MODULE)
      .input(z.object({ arquivoId: z.string() }))
      .mutation(({ input, ctx }) => service.abrir(input.arquivoId, contexto(ctx))),

    excluir: deleteSubProcedure(MODULE, SUB_EXCLUIR, 'excluir arquivos')
      .input(z.object({ arquivoId: z.string(), motivo: z.string().max(500).nullish() }))
      .mutation(({ input, ctx }) => service.excluir(input, contexto(ctx))),

    restaurar: deleteSubProcedure(MODULE, SUB_EXCLUIR, 'restaurar arquivos')
      .input(z.object({ arquivoId: z.string() }))
      .mutation(({ input, ctx }) => service.restaurar(input.arquivoId, contexto(ctx))),

    listarExcluidos: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => service.listarExcluidos(input.clienteId, contexto(ctx))),

    listarLog: readProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        evento: z.string().nullish(),
        limite: z.number().min(1).max(500).optional(),
      }))
      .query(({ input, ctx }) => service.listarLog(input, contexto(ctx))),

    // ── Administração do módulo ────────────────────────────────────────────

    listarRegras: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string().nullish() }))
      .query(({ input, ctx }) => {
        const c = contexto(ctx)
        if (!c.empresaId) return []
        return notificacao.listarRegras(c.empresaId, input.clienteId ?? null)
      }),

    salvarRegra: writeSubProcedure(MODULE, SUB_CONFIGURAR, 'configurar notificações')
      .input(z.object({
        clienteId: z.string().nullish(),
        evento: eventoSchema,
        ativo: z.boolean(),
        notificaResponsavel: z.boolean(),
        notificaSubstituto: z.boolean(),
        notificaCoordenador: z.boolean(),
        notificaDiretor: z.boolean(),
        emailsExtras: z.string().max(2000).nullish(),
      }))
      .mutation(({ input, ctx }) => {
        const c = contexto(ctx)
        if (!c.empresaId) {
          // Sem empresa não há a quem aplicar a regra. Falha explícita em vez
          // de gravar numa empresa arbitrária.
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário sem empresa vinculada.' })
        }
        return notificacao.salvarRegra({ ...input, empresaId: c.empresaId })
      }),

    // ── Google Drive ───────────────────────────────────────────────────────

    driveConfig: readProcedure(MODULE).query(({ ctx }) => {
      const c = contexto(ctx)
      if (!c.empresaId) return null
      return driveService.obterConfig(c.empresaId)
    }),

    driveSalvarConfig: writeSubProcedure(MODULE, SUB_CONFIGURAR, 'configurar a pasta do Drive')
      .input(z.object({ pasta: z.string().min(10).max(500) }))
      .mutation(({ input, ctx }) => {
        exigirAdmin(ctx)
        const c = contexto(ctx)
        if (!c.empresaId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário sem empresa vinculada.' })
        }
        return driveService.salvarConfig(c.empresaId, input.pasta)
      }),

    /** Subpastas da raiz, com o de-para de cliente já resolvido. */
    driveListarSubpastas: readProcedure(MODULE).query(({ ctx }) => {
      exigirAdmin(ctx)
      const c = contexto(ctx)
      if (!c.empresaId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário sem empresa vinculada.' })
      }
      return driveService.listarSubpastas(c.empresaId)
    }),

    driveVincularCliente: writeSubProcedure(MODULE, SUB_CONFIGURAR, 'vincular pasta do Drive')
      .input(z.object({ clienteId: z.string(), folderId: z.string().nullable() }))
      .mutation(({ input, ctx }) => {
        exigirAdmin(ctx)
        return driveService.vincularCliente(input, contexto(ctx))
      }),

    /**
     * O mapa de pasta → área deste cliente.
     *
     * É o que faz o aviso de arquivo novo ter endereço: sem mapa, o envio do
     * cliente acorda o responsável de TODAS as áreas contratadas, e em pouco
     * tempo ninguém lê nenhum.
     *
     * `readProcedure` e não admin, como a listagem: quem enxerga o cliente no
     * módulo enxerga como ele está configurado. Já ESCREVER o mapa exige a
     * sub-permissão de configuração — é decisão que muda para quem o e-mail
     * vai, e não deve estar na mão de quem só opera arquivos. Não exige admin
     * porque o mapa é por cliente: o gestor que responde por uma carteira sabe
     * melhor que o master qual pasta é de qual área.
     */
    driveMapaAreas: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => driveService.listarMapaDeAreas(input.clienteId, contexto(ctx))),

    driveDefinirAreaDaPasta: writeSubProcedure(MODULE, SUB_CONFIGURAR, 'mapear a área de uma pasta')
      .input(z.object({ clienteId: z.string(), pastaId: z.string(), areaId: z.string() }))
      .mutation(({ input, ctx }) => driveService.definirAreaDaPasta(input, contexto(ctx))),

    driveRemoverAreaDaPasta: writeSubProcedure(MODULE, SUB_CONFIGURAR, 'remover a área de uma pasta')
      .input(z.object({ clienteId: z.string(), pastaId: z.string() }))
      .mutation(({ input, ctx }) => driveService.removerAreaDaPasta(input, contexto(ctx))),

    /**
     * Conteúdo da pasta do cliente. `readProcedure`, e não admin: quem enxerga
     * o cliente no módulo enxerga os arquivos dele — o recorte é o do escopo,
     * conferido dentro do serviço.
     */
    driveListar: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), subPastaId: z.string().nullish() }))
      .query(({ input, ctx }) => driveService.listarDoCliente(input, contexto(ctx))),

    /**
      * Contagem de arquivos no Drive, por cliente.
      *
      * Separada da listagem porque caminha a árvore do Drive: a lista aparece
      * na hora e estes números chegam depois.
      */
    driveContagem: readProcedure(MODULE)
      .input(z.object({ clienteIds: z.array(z.string()).max(300) }))
      .query(({ input, ctx }) => driveService.contarNoDrive(input.clienteIds, contexto(ctx))),

    /** O que foi excluído de dentro da pasta deste cliente no Drive. */
    driveLixeira: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input, ctx }) => driveService.lixeiraParaEscritorio(input.clienteId, contexto(ctx))),

    driveRestaurar: deleteSubProcedure(MODULE, SUB_EXCLUIR, 'restaurar da lixeira do Drive')
      .input(z.object({ clienteId: z.string(), itemId: z.string() }))
      .mutation(({ input, ctx }) => driveService.restaurarParaEscritorio(input, contexto(ctx))),

    /**
     * Apaga de vez. Exige a sub-permissão de exclusão e só existe do lado do
     * escritório: não tem volta nem por suporte do Google, e o guardião do
     * documento é quem responde por isso.
     */
    driveExcluirDefinitivo: deleteSubProcedure(MODULE, SUB_EXCLUIR, 'apagar arquivo em definitivo')
      .input(z.object({ clienteId: z.string(), itemId: z.string() }))
      .mutation(({ input, ctx }) => driveService.excluirDefinitivo(input, contexto(ctx))),

    /** Arrastar e soltar no Drive. `destinoId` nulo leva para a raiz. */
    driveMover: writeProcedure(MODULE)
      .input(z.object({
        clienteId: z.string(),
        itemId: z.string(),
        destinoId: z.string().nullable(),
      }))
      .mutation(({ input, ctx }) => driveService.moverParaEscritorio(input, contexto(ctx))),

    removerExcecao: writeSubProcedure(MODULE, SUB_CONFIGURAR, 'configurar notificações')
      .input(z.object({ clienteId: z.string(), evento: eventoSchema }))
      .mutation(({ input, ctx }) => {
        const c = contexto(ctx)
        if (!c.empresaId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário sem empresa vinculada.' })
        }
        return notificacao.removerExcecao(c.empresaId, input.clienteId, input.evento)
      }),
  })
}
