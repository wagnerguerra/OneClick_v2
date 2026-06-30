import { Module } from '@nestjs/common'
import { OnlineUsersService } from './online-users.service'
import { OnlineUsersController } from './online-users.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  providers: [OnlineUsersService],
  controllers: [OnlineUsersController],
  exports: [OnlineUsersService],
})
export class OnlineUsersModule {}
