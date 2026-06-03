import { z } from 'zod'
import { router, protectedProcedure, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createUserSchema, updateUserSchema, listUserSchema, permissionSchema } from '@saas/types'
import { UserService } from './user.service'

const MODULE = 'usuarios'

export function createUserRouter(userService: UserService) {
  return router({
    list: readProcedure(MODULE)
      .input(listUserSchema)
      .query(({ input, ctx }) =>
        userService.list(input, ctx.isMaster ?? false, ctx.empresaId),
      ),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => userService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId)),

    create: writeProcedure(MODULE)
      .input(createUserSchema)
      .mutation(({ input }) => userService.create(input)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateUserSchema }))
      .mutation(({ input, ctx }) =>
        userService.update(input.id, input.data, ctx.isMaster ?? false),
      ),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        userService.delete(input.id, ctx.userId),
      ),

    deleteBulk: deleteProcedure(MODULE)
      .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
      .mutation(({ input, ctx }) =>
        userService.deleteBulk(input.ids, ctx.userId),
      ),

    toggleMaster: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) =>
        userService.toggleMaster(input.id, ctx.userId, ctx.isMaster ?? false),
      ),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) =>
        userService.listForSelect(ctx.isMaster ?? false, ctx.empresaId),
      ),

    // Clientes vinculados ao usuário (responsável/substituto)
    getAssignedClients: readProcedure(MODULE)
      .input(z.object({ userId: z.string() }))
      .query(({ input }) => userService.getAssignedClients(input.userId)),

    // Historico de login (sessoes Better Auth) — espelha legado sis_log
    getLoginHistory: readProcedure(MODULE)
      .input(z.object({ userId: z.string(), limit: z.number().min(1).max(50).optional() }))
      .query(({ input }) => userService.getLoginHistory(input.userId, input.limit)),

    // Importar carteira de clientes do OneClick v1
    importarCarteiraOneClick: writeProcedure(MODULE)
      .input(z.object({
        userId: z.string(),
        dryRun: z.boolean().default(false),
        somenteAreaUsuario: z.boolean().default(false),
      }))
      .mutation(({ input }) => userService.importarCarteiraOneClick(input.userId, input)),

    // Sincronizar usuários com o db_intranet.ger_cad_usu — atualiza dados de
    // RH, desativa quem virou inativo no v1 e cria os ativos ainda ausentes.
    importarDoIntranetV1: writeProcedure(MODULE)
      .input(z.object({
        dryRun: z.boolean().default(false),
        sobrescrever: z.boolean().default(false),
        campos: z.array(z.enum(['dataNascimento', 'dataAdmissao', 'ramal', 'idOneClick', 'salario'])).optional(),
        desativarAusentes: z.boolean().default(true),
        criarNovos: z.boolean().default(true),
      }))
      .mutation(({ input, ctx }) => userService.importarDoIntranetV1(ctx.userId, input)),

    // getMyPermissions permanece como protectedProcedure — todo usuário pode consultar suas próprias permissões
    getMyPermissions: protectedProcedure
      .query(({ ctx }) => userService.getMyPermissions(ctx.userId)),

    // Carteira de clientes do próprio usuário logado — não exige permissão "usuarios"
    getMyAssignedClients: protectedProcedure
      .query(({ ctx }) => userService.getAssignedClients(ctx.userId)),

    // ── Perfil pessoal — todo usuário acessa o proprio (espelha legado cad_profile/index.asp) ──
    getMyProfile: protectedProcedure
      .query(({ ctx }) => userService.getMyProfile(ctx.userId)),

    /** Dados resolvidos pra montar a assinatura de email (user + empresa). */
    getMySignatureData: protectedProcedure
      .query(({ ctx }) => userService.getMySignatureData(ctx.userId)),

    updateMyProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(2).max(120).optional(),
        image: z.string().max(500).optional().nullable(),
        coverImage: z.string().max(500).optional().nullable(),

        // Pessoal
        dataNascimento: z.string().optional().nullable(), // ISO date
        sexo: z.enum(['MASCULINO', 'FEMININO', 'OUTRO', 'PREFIRO_NAO_DIZER']).optional().nullable(),
        estadoCivil: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']).optional().nullable(),
        nacionalidade: z.string().max(60).optional().nullable(),
        naturalidade: z.string().max(120).optional().nullable(),
        bio: z.string().max(500).optional().nullable(),

        // Contato
        telefone: z.string().max(40).optional().nullable(),
        celular: z.string().max(40).optional().nullable(),
        whatsapp: z.string().max(40).optional().nullable(),
        // Aumentado pra 40 — usuários costumam colocar mais de um ramal
        // separado por "/" no mesmo campo (#HLP0082).
        ramal: z.string().max(40).optional().nullable(),

        // Endereço
        cep: z.string().max(10).optional().nullable(),
        logradouro: z.string().max(200).optional().nullable(),
        numero: z.string().max(20).optional().nullable(),
        complemento: z.string().max(120).optional().nullable(),
        bairro: z.string().max(120).optional().nullable(),
        cidade: z.string().max(120).optional().nullable(),
        uf: z.string().length(2).optional().nullable(),
        pais: z.string().max(60).optional().nullable(),

        // Sociais — validamos só comprimento; o usuário pode colar URL ou handle.
        siteUrl: z.string().max(300).optional().nullable(),
        linkedinUrl: z.string().max(300).optional().nullable(),
        githubUrl: z.string().max(300).optional().nullable(),
        instagramUrl: z.string().max(300).optional().nullable(),
        facebookUrl: z.string().max(300).optional().nullable(),

        // Assinatura de email
        signatureImageUrl: z.string().max(500).optional().nullable(),
      }))
      .mutation(({ input, ctx }) => userService.updateMyProfile(ctx.userId, input)),

    changeMyPassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1, 'Senha atual obrigatória'),
        newPassword: z.string().min(8, 'A nova senha deve ter no mínimo 8 caracteres').max(128),
      }))
      .mutation(({ input, ctx }) => userService.changeMyPassword(ctx.userId, input.currentPassword, input.newPassword)),

    // ── Dispositivos confiaveis (MFA "lembrar este equipamento") ──
    listMyTrustedDevices: protectedProcedure
      .query(({ ctx }) => userService.listTrustedDevices(ctx.userId)),

    registerMyTrustedDevice: protectedProcedure
      .input(z.object({ label: z.string().max(100).optional(), userAgent: z.string().max(500).optional() }))
      .mutation(({ input, ctx }) => userService.registerTrustedDevice(ctx.userId, input)),

    revokeMyTrustedDevice: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => userService.revokeTrustedDevice(ctx.userId, input.id)),

    revokeAllMyTrustedDevices: protectedProcedure
      .mutation(({ ctx }) => userService.revokeAllTrustedDevices(ctx.userId)),

    updatePermissions: writeProcedure(MODULE)
      .input(z.object({ userId: z.string(), permissions: z.array(permissionSchema) }))
      .mutation(({ input }) => userService.updatePermissions(input.userId, input.permissions)),

    copyPermissions: writeProcedure(MODULE)
      .input(z.object({
        sourceUserId: z.string(),
        targetUserIds: z.array(z.string()).min(1),
      }))
      .mutation(({ input }) => userService.copyPermissions(input.sourceUserId, input.targetUserIds)),

    // Buscar dados do usuário nos bancos legados (SERPRO2 + OneClick v1)
    buscarDadosLegado: readProcedure(MODULE)
      .input(z.object({ email: z.string().email() }))
      .query(({ input }) => userService.buscarDadosLegado(input.email)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => userService.exportAll(ctx.isMaster ?? false, ctx.empresaId)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createUserSchema) }))
      .mutation(({ input }) => userService.bulkCreate(input.items)),
  })
}
