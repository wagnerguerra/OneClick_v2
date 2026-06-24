import { Module } from '@nestjs/common'
import { AdminTenantService } from './admin-tenant.service'

@Module({
  providers: [AdminTenantService],
  exports: [AdminTenantService],
})
export class AdminTenantModule {}
