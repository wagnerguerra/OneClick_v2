import { Module } from '@nestjs/common'
import { AdminService } from './admin.service'
import { EmailService } from '../common/email.service'

@Module({
  providers: [AdminService, EmailService],
  exports: [AdminService, EmailService],
})
export class AdminModule {}
