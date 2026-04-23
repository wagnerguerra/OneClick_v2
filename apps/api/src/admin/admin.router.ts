import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { AdminService } from './admin.service'

export function createAdminRouter(adminService: AdminService) {
  return router({
    // === CONFIGURAÇÕES ===
    getCampos: protectedProcedure
      .query(() => adminService.getCampos()),

    getConfigs: protectedProcedure
      .query(() => adminService.getConfigs()),

    saveConfigs: protectedProcedure
      .input(z.object({ group: z.string(), items: z.record(z.string()) }))
      .mutation(({ input }) => adminService.saveConfigs(input.items)),

    // === MÉTRICAS ===
    getMetrics: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        source: z.string().optional(),
      }))
      .query(({ input }) => adminService.getMetrics(input)),

    savePricing: protectedProcedure
      .input(z.object({
        source: z.string(),
        unitPrice: z.number(),
        multiplier: z.number().default(1),
        currency: z.string().default('BRL'),
      }))
      .mutation(({ input }) => adminService.savePricing(input.source, input.unitPrice, input.multiplier, input.currency)),

    // === BACKUP ===
    generateBackup: protectedProcedure
      .input(z.object({ includeEnv: z.boolean().default(false) }))
      .mutation(({ input }) => adminService.generateBackup(input)),

    listBackups: protectedProcedure
      .query(() => adminService.listBackups()),

    deleteBackup: protectedProcedure
      .input(z.object({ filename: z.string() }))
      .mutation(({ input }) => adminService.deleteBackup(input.filename)),

    // === TESTES DE CONEXÃO ===
    testPostgresql: protectedProcedure
      .mutation(() => adminService.testPostgresql()),

    testMysql: protectedProcedure
      .mutation(() => adminService.testMysql()),

    testOneclickV1: protectedProcedure
      .mutation(() => adminService.testOneclickV1()),

    testFirebird: protectedProcedure
      .mutation(() => adminService.testFirebird()),

    testStripe: protectedProcedure
      .mutation(() => adminService.testStripe()),

    // === CERTIFICADO DIGITAL ===
    getCertificadoInfo: protectedProcedure
      .query(() => adminService.getCertificadoInfo()),

    deleteCertificado: protectedProcedure
      .mutation(() => adminService.deleteCertificado()),

    // === CONSULTAS SALVAS ===
    listSavedQueries: protectedProcedure
      .input(z.object({ dbType: z.string().optional() }).optional())
      .query(({ input }) => adminService.listSavedQueries(input?.dbType)),

    saveQuery: protectedProcedure
      .input(z.object({ name: z.string().min(1), sql: z.string().min(1), dbType: z.string().min(1) }))
      .mutation(({ input }) => adminService.saveQuery(input)),

    updateSavedQuery: protectedProcedure
      .input(z.object({ id: z.string(), name: z.string().optional(), sql: z.string().optional() }))
      .mutation(({ input }) => adminService.updateSavedQuery(input.id, input)),

    deleteSavedQuery: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => adminService.deleteSavedQuery(input.id)),

    // === EXECUÇÃO SQL ===
    execSqlPostgresql: protectedProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlPostgresql(input.sql)),

    execSqlMysql: protectedProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlMysql(input.sql)),

    execSqlOneclickV1: protectedProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlOneclickV1(input.sql)),

    execSqlFirebird: protectedProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlFirebird(input.sql)),
  })
}
