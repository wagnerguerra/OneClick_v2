import { Module } from '@nestjs/common'
import { SqlConsoleService } from './sql-console.service'

@Module({
  providers: [SqlConsoleService],
  exports: [SqlConsoleService],
})
export class SqlConsoleModule {}
