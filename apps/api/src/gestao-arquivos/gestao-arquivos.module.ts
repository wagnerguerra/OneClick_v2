import { Module } from '@nestjs/common'
import { GestaoArquivosService } from './gestao-arquivos.service'
import { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'

/**
 * Gestão de Arquivos (bloco Administrativo).
 *
 * `EmailService` não é importado aqui porque `EmailModule` é `@Global()` — vem
 * pelo container sem declaração. Os dois serviços são exportados porque o
 * `TrpcService` os injeta para montar o router.
 */
@Module({
  providers: [GestaoArquivosService, GestaoArquivosNotificacaoService],
  exports: [GestaoArquivosService, GestaoArquivosNotificacaoService],
})
export class GestaoArquivosModule {}
