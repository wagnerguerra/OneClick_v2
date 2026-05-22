import { Module } from '@nestjs/common'
import { TabsService } from './tabs.service'

@Module({
  providers: [TabsService],
  exports: [TabsService],
})
export class TabsModule {}
