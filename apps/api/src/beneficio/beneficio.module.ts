import { Module } from '@nestjs/common'
import { BeneficioService } from './beneficio.service'
import { BeneficioController } from './beneficio.controller'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [NotificationModule, AuthModule],
  controllers: [BeneficioController],
  providers: [BeneficioService, EmailService],
  exports: [BeneficioService],
})
export class BeneficioModule {}
