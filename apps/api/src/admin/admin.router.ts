import { z } from 'zod'
import { router, masterProcedure } from '../trpc/trpc.service'
import { AdminService } from './admin.service'

// ⚠️ Administração de PLATAFORMA (config de sistema): integrações globais
// (Stripe/SMTP/Banco/SERPRO/OpenAI/S3), execução de SQL nos bancos, backups e
// testes de conexão. Afeta TODOS os tenants → restrito ao MASTER GLOBAL.
// masterProcedure exige ctx.isMaster (NÃO libera isEmpresaMaster). Antes era
// protectedProcedure (qualquer sessão autenticada) — F-009 (broken access control).

export function createAdminRouter(adminService: AdminService) {
  return router({
    // === CONFIGURAÇÕES ===
    getCampos: masterProcedure
      .query(() => adminService.getCampos()),

    getConfigs: masterProcedure
      .query(() => adminService.getConfigs()),

    saveConfigs: masterProcedure
      .input(z.object({ group: z.string(), items: z.record(z.string()) }))
      .mutation(({ input }) => adminService.saveConfigs(input.items)),

    // === MÉTRICAS ===
    getMetrics: masterProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        source: z.string().optional(),
      }))
      .query(({ input }) => adminService.getMetrics(input)),

    savePricing: masterProcedure
      .input(z.object({
        source: z.string(),
        unitPrice: z.number(),
        multiplier: z.number().default(1),
        currency: z.string().default('BRL'),
      }))
      .mutation(({ input }) => adminService.savePricing(input.source, input.unitPrice, input.multiplier, input.currency)),

    // === BACKUP ===
    generateBackup: masterProcedure
      .input(z.object({ includeEnv: z.boolean().default(false) }))
      .mutation(({ input }) => adminService.generateBackup(input)),

    listBackups: masterProcedure
      .query(() => adminService.listBackups()),

    deleteBackup: masterProcedure
      .input(z.object({ filename: z.string() }))
      .mutation(({ input }) => adminService.deleteBackup(input.filename)),

    // === TESTES DE CONEXÃO ===
    testPostgresql: masterProcedure
      .mutation(() => adminService.testPostgresql()),

    testMysql: masterProcedure
      .mutation(() => adminService.testMysql()),

    testOneclickV1: masterProcedure
      .mutation(() => adminService.testOneclickV1()),

    testFirebird: masterProcedure
      .mutation(() => adminService.testFirebird()),

    testStripe: masterProcedure
      .mutation(() => adminService.testStripe()),

    testSmtp: masterProcedure
      .input(z.object({ destinatario: z.string().email() }))
      .mutation(({ input }) => adminService.testSmtp(input.destinatario)),

    // === CERTIFICADO DIGITAL ===
    getCertificadoInfo: masterProcedure
      .query(() => adminService.getCertificadoInfo()),

    deleteCertificado: masterProcedure
      .mutation(() => adminService.deleteCertificado()),

    // Certificado PF (Pessoa Física do Contador)
    getCertificadoPfInfo: masterProcedure
      .query(() => adminService.getCertificadoPfInfo()),

    deleteCertificadoPf: masterProcedure
      .mutation(() => adminService.deleteCertificadoPf()),

    // === CONSULTAS SALVAS ===
    listSavedQueries: masterProcedure
      .input(z.object({ dbType: z.string().optional() }).optional())
      .query(({ input }) => adminService.listSavedQueries(input?.dbType)),

    saveQuery: masterProcedure
      .input(z.object({ name: z.string().min(1), sql: z.string().min(1), dbType: z.string().min(1) }))
      .mutation(({ input }) => adminService.saveQuery(input)),

    updateSavedQuery: masterProcedure
      .input(z.object({ id: z.string(), name: z.string().optional(), sql: z.string().optional() }))
      .mutation(({ input }) => adminService.updateSavedQuery(input.id, input)),

    deleteSavedQuery: masterProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => adminService.deleteSavedQuery(input.id)),

    // === EXECUÇÃO SQL ===
    execSqlPostgresql: masterProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlPostgresql(input.sql)),

    execSqlMysql: masterProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlMysql(input.sql)),

    execSqlOneclickV1: masterProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlOneclickV1(input.sql)),

    execSqlFirebird: masterProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlFirebird(input.sql)),
  })
}
