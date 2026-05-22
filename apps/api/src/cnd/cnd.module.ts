import { Module } from '@nestjs/common'
import { CndService } from './cnd.service'
import { CndController } from './cnd.controller'
import { CndSchedulerService } from './cnd.scheduler'
import { CndEstadualService } from './cnd-estadual.service'
import { AlvaraBombeirosService } from './alvara-bombeiros.service'
import { CndMunicipalService } from './cnd-municipal.service'
import { CndtTrabalhistaService } from './cndt-trabalhista.service'
import { CrfFgtsService } from './crf-fgts.service'
import { CguCertidaoService } from './cgu-certidao.service'
import { AlvaraFuncionamentoService } from './alvara-funcionamento.service'
import { CompilarCertidoesService } from './compilar-certidoes.service'
import { CaptchaService } from '../common/captcha.service'
import { EmailService } from '../common/email.service'

@Module({
  controllers: [CndController],
  providers: [CndService, CndSchedulerService, CndEstadualService, AlvaraBombeirosService, CndMunicipalService, CndtTrabalhistaService, CrfFgtsService, CguCertidaoService, AlvaraFuncionamentoService, CompilarCertidoesService, CaptchaService, EmailService],
  exports: [CndService, CndSchedulerService, CndEstadualService, AlvaraBombeirosService, CndMunicipalService, CndtTrabalhistaService, CrfFgtsService, CguCertidaoService, AlvaraFuncionamentoService, CompilarCertidoesService],
})
export class CndModule {}
