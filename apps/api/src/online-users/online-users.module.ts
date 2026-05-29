import { Module } from '@nestjs/common'
import { OnlineUsersService } from './online-users.service'
import { OnlineUsersController } from './online-users.controller'

@Module({
  providers: [OnlineUsersService],
  controllers: [OnlineUsersController],
  exports: [OnlineUsersService],
})
export class OnlineUsersModule {}
