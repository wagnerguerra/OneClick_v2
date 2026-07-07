import { z } from 'zod'
import { router, masterProcedure } from '../trpc/trpc.service'
import { SqlConsoleService } from './sql-console.service'

/** Console SQL — master-only (masterProcedure já barra não-master). */
export function createSqlConsoleRouter(service: SqlConsoleService) {
  return router({
    run: masterProcedure
      .input(z.object({ sql: z.string().min(1).max(50_000) }))
      .mutation(({ input }) => service.run(input.sql)),
    schema: masterProcedure
      .query(() => service.schema()),
  })
}
