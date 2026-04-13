import { Module } from '@nestjs/common'
import { TrpcService } from './trpc.service'
import { TrpcController } from './trpc.controller'
import { AreaModule } from '../area/area.module'
import { EmpresaModule } from '../empresa/empresa.module'
import { UserModule } from '../user/user.module'
import { CargoModule } from '../cargo/cargo.module'
import { OnboardingModule } from '../onboarding/onboarding.module'
import { AdminModule } from '../admin/admin.module'
import { ClienteModule } from '../cliente/cliente.module'
import { AuthModule } from '../auth/auth.module'
import { StripeModule } from '../stripe/stripe.module'
import { ColaboradorModule } from '../colaborador/colaborador.module'
import { FornecedorModule } from '../fornecedor/fornecedor.module'
import { SocioModule } from '../socio/socio.module'
import { CnpjModule } from '../cnpj/cnpj.module'
import { SitfisModule } from '../sitfis/sitfis.module'

@Module({
  imports: [AreaModule, EmpresaModule, UserModule, CargoModule, OnboardingModule, ClienteModule, AdminModule, AuthModule, StripeModule, ColaboradorModule, FornecedorModule, SocioModule, CnpjModule, SitfisModule],
  providers: [TrpcService],
  controllers: [TrpcController],
  exports: [TrpcService],
})
export class TrpcModule {}
