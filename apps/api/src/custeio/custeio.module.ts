import { Module } from '@nestjs/common'
import { CusteioService } from './custeio.service'

@Module({
  providers: [CusteioService],
  exports: [CusteioService],
})
export class CusteioModule {}
