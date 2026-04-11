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

    exportDatabase: protectedProcedure
      .mutation(() => adminService.exportDatabase()),

    // === DEPLOY ===
    getGitStatus: protectedProcedure
      .query(() => adminService.getGitStatus()),

    getGitLog: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
      .query(({ input }) => adminService.getGitLog(input?.limit)),

    setGitRemote: protectedProcedure
      .input(z.object({ url: z.string().min(1), name: z.string().default('origin') }))
      .mutation(({ input }) => adminService.setGitRemote(input.url, input.name)),

    removeGitRemote: protectedProcedure
      .input(z.object({ name: z.string().default('origin') }))
      .mutation(({ input }) => adminService.removeGitRemote(input.name)),

    gitPush: protectedProcedure
      .input(z.object({ remote: z.string().default('origin'), branch: z.string().optional() }))
      .mutation(({ input }) => adminService.gitPush(input.remote, input.branch)),

    gitPull: protectedProcedure
      .input(z.object({ remote: z.string().default('origin'), branch: z.string().optional() }))
      .mutation(({ input }) => adminService.gitPull(input.remote, input.branch)),

    generateDeployPackage: protectedProcedure
      .input(z.object({ fromCommit: z.string().optional(), includeDb: z.boolean().default(false) }))
      .mutation(({ input }) => adminService.generateDeployPackage(input)),

    applyDeployPackage: protectedProcedure
      .input(z.object({ filename: z.string() }))
      .mutation(({ input }) => {
        const backupDir = require('path').resolve(process.cwd(), '..', '..', 'backups')
        const filepath = require('path').join(backupDir, input.filename)
        return adminService.applyDeployPackage(filepath)
      }),

    // === TESTES DE CONEXÃO ===
    testPostgresql: protectedProcedure
      .mutation(() => adminService.testPostgresql()),

    testMysql: protectedProcedure
      .mutation(() => adminService.testMysql()),

    testFirebird: protectedProcedure
      .mutation(() => adminService.testFirebird()),

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

    execSqlFirebird: protectedProcedure
      .input(z.object({ sql: z.string().min(1) }))
      .mutation(({ input }) => adminService.execSqlFirebird(input.sql)),
  })
}
