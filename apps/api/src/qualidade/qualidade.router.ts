import { router, readProcedure } from '../trpc/trpc.service'
import { QualidadeService } from './qualidade.service'

const MODULE = 'qualidade'

export function createQualidadeRouter(service: QualidadeService) {
  return router({
    painel: readProcedure(MODULE)
      .query(({ ctx }) => service.painel(ctx.empresaId)),
  })
}
