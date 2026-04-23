import { Module } from '@nestjs/common'
import { CndService } from './cnd.service'
import { CndController } from './cnd.controller'
import { CndSchedulerService } from './cnd.scheduler'

@Module({
  controllers: [CndController],
  providers: [CndService, CndSchedulerService],
  exports: [CndService, CndSchedulerService],
})
export class CndModule {}
