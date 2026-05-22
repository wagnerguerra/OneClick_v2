import { Module } from '@nestjs/common'
import { SignatureService } from './signature.service'
import { SignatureTemplateService } from './signature-template.service'
import { SignatureTemplateController, SignaturePhotoController } from './signature-template.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [SignatureTemplateController, SignaturePhotoController],
  providers: [SignatureService, SignatureTemplateService],
  exports: [SignatureService, SignatureTemplateService],
})
export class SignatureModule {}
