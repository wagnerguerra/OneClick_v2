import { Module } from '@nestjs/common'
import { PesquisaService } from './pesquisa.service'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [NotificationModule],
  providers: [PesquisaService],
  exports: [PesquisaService],
})
export class PesquisaModule {}

