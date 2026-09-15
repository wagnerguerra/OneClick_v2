import { Module } from '@nestjs/common'
import { GestaoArquivosService } from './gestao-arquivos.service'
import { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'
import { GestaoArquivosDriveService } from './gestao-arquivos-drive.service'
import { GestaoArquivosLoteService } from './gestao-arquivos-lote.service'
import { GestaoArquivosController } from './gestao-arquivos.controller'
import { AuthModule } from '../auth/auth.module'
import { NotificationModule } from '../notification/notification.module'

/**
 * Gestão de Arquivos (bloco Administrativo).
 *
 * `EmailService` não é importado aqui porque `EmailModule` é `@Global()` — vem
 * pelo container sem declaração. `AuthModule` entra porque o controller resolve
 * a sessão para servir arquivo do Drive. `NotificationModule` entra porque o
 * aviso de arquivo novo também acende o sino, e esse módulo NÃO é global — sem
 * o import o Nest recusa a injeção no boot, que é onde esse erro aparece (o
 * typecheck passa liso).
 *
 * Os serviços são exportados porque o `TrpcService` os injeta para montar o
 * router.
 */
@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [GestaoArquivosController],
  providers: [
    GestaoArquivosService, GestaoArquivosNotificacaoService,
    GestaoArquivosDriveService, GestaoArquivosLoteService,
  ],
  exports: [GestaoArquivosService, GestaoArquivosNotificacaoService, GestaoArquivosDriveService],
})
export class GestaoArquivosModule {}
