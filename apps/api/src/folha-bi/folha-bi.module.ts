import { Module } from '@nestjs/common'
import { FolhaBiService } from './folha-bi.service'
import { FolhaBiSyncController } from './folha-bi-sync.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule], // AuthService: valida sessao Better Auth no upload manual (Service Manager)
  controllers: [FolhaBiSyncController],
  providers: [FolhaBiService],
  exports: [FolhaBiService],
})
export class FolhaBiModule {}
