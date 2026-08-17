import { Module } from '@nestjs/common'
import { ReuniaoService } from './reuniao.service'

// Sem controller: tudo passa por tRPC. Os anexos entram na fase de UI, pelo
// mesmo caminho de upload que os demais módulos já usam.
@Module({
  providers: [ReuniaoService],
  exports: [ReuniaoService],
})
export class ReuniaoModule {}
