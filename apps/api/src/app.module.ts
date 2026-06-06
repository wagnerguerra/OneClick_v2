import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { AuthModule } from './auth/auth.module'
import { TenantMiddleware } from './tenant/tenant.middleware'
import { TrpcModule } from './trpc/trpc.module'
import { UploadModule } from './upload/upload.module'
import { StripeModule } from './stripe/stripe.module'
import { ColaboradorModule } from './colaborador/colaborador.module'
import { FornecedorModule } from './fornecedor/fornecedor.module'
import { SocioModule } from './socio/socio.module'
import { CnpjModule } from './cnpj/cnpj.module'
import { SitfisModule } from './sitfis/sitfis.module'
import { CaixaPostalModule } from './caixapostal/caixapostal.module'
import { CndModule } from './cnd/cnd.module'
import { DctfwebModule } from './dctfweb/dctfweb.module'
import { EmailModule } from './common/email.module'
import { BiModule } from './bi/bi.module'
import { FolhaModule } from './folha/folha.module'
import { HelpdeskModule } from './helpdesk/helpdesk.module'
import { DriveSyncModule } from './drive-sync/drive-sync.module'
import { LauncherModule } from './launcher/launcher.module'
import { ChatDesktopModule } from './chat-desktop/chat-desktop.module'
import { MobileAppModule } from './mobile-app/mobile-app.module'
import { NfeDistModule } from './nfe-dist/nfe-dist.module'
import { NfseDistModule } from './nfse-dist/nfse-dist.module'
import { AgendamentoModule } from './agendamento/agendamento.module'
import { GoogleBackupModule } from './google-backup/google-backup.module'
import { SignatureModule } from './signature/signature.module'
import { OnlineUsersModule } from './online-users/online-users.module'
import { ChatModule } from './chat/chat.module'

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),
    AuthModule,
    TrpcModule,
    UploadModule,
    StripeModule,
    ColaboradorModule,
    FornecedorModule,
    SocioModule,
    CnpjModule,
    SitfisModule,
    CaixaPostalModule,
    CndModule,
    DctfwebModule,
    EmailModule,
    BiModule,
    FolhaModule,
    HelpdeskModule,
    DriveSyncModule,
    LauncherModule,
    ChatDesktopModule,
    MobileAppModule,
    NfeDistModule,
    NfseDistModule,
    AgendamentoModule,
    GoogleBackupModule,
    OnlineUsersModule,
    ChatModule,
    SignatureModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*')
  }
}
