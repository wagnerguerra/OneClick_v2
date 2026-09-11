import { Module } from '@nestjs/common'
import { GestaoArquivosService } from './gestao-arquivos.service'
import { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'
import { GestaoArquivosDriveService } from './gestao-arquivos-drive.service'
import { GestaoArquivosController } from './gestao-arquivos.controller'
import { AuthModule } from '../auth/auth.module'

/**
 * Gestão de Arquivos (bloco Administrativo).
 *
 * `EmailService` não é importado aqui porque `EmailModule` é `@Global()` — vem
 * pelo container sem declaração. `AuthModule` entra porque o controller resolve
 * a sessão para servir arquivo do Drive. Os serviços são exportados porque o
 * `TrpcService` os injeta para montar o router.
 */
@Module({
  imports: [AuthModule],
  controllers: [GestaoArquivosController],
  providers: [GestaoArquivosService, GestaoArquivosNotificacaoService, GestaoArquivosDriveService],
  exports: [GestaoArquivosService, GestaoArquivosNotificacaoService, GestaoArquivosDriveService],
})
export class GestaoArquivosModule {}
