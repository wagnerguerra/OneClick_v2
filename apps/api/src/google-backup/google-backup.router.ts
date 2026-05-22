import { z } from 'zod'
import { router, readProcedure, writeProcedure } from '../trpc/trpc.service'
import { GoogleBackupService } from './google-backup.service'

const MODULE = 'admin' // só master/empresaMaster (mesmo gate de outras configs)

export function createGoogleBackupRouter(svc: GoogleBackupService) {
  return router({
    /** Status: config atual + email da conta + arquivos da pasta. */
    getStatus: readProcedure(MODULE)
      .query(() => svc.getStatus()),

    /** Salva folder ID + toggle auto-upload. Valida acesso à pasta antes. */
    salvarConfig: writeProcedure(MODULE)
      .input(z.object({
        folderId: z.string().nullable(),
        enabled: z.boolean(),
      }))
      .mutation(({ input }) => svc.setConfig(input.folderId, input.enabled)),

    /** Envia o dump DB mais recente local pra pasta configurada. */
    enviarAgora: writeProcedure(MODULE)
      .mutation(() => svc.uploadUltimoBackup()),

    /** Envia o backup do SISTEMA (tar.gz cifrado) mais recente. */
    enviarSistemaAgora: writeProcedure(MODULE)
      .mutation(() => svc.uploadUltimoSystemBackup()),
  })
}
