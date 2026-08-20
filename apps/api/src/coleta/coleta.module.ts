import { Module } from '@nestjs/common'
import { ColetaService } from './coleta.service'

@Module({
  providers: [ColetaService],
  exports: [ColetaService],
})
export class ColetaModule {}
