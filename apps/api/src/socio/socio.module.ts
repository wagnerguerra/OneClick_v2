import { Module } from '@nestjs/common'
import { SocioService } from './socio.service'

@Module({
  providers: [SocioService],
  exports: [SocioService],
})
export class SocioModule {}
