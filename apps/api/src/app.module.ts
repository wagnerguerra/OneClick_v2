import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { AuthModule } from './auth/auth.module'
import { TenantMiddleware } from './tenant/tenant.middleware'
import { TrpcModule } from './trpc/trpc.module'
import { UploadModule } from './upload/upload.module'

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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*')
  }
}
