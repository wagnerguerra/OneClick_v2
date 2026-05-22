import { Module, Global, OnModuleInit } from '@nestjs/common'
import { ThemeService } from './theme.service'

@Global()
@Module({
  providers: [ThemeService],
  exports: [ThemeService],
})
export class ThemeModule implements OnModuleInit {
  constructor(private readonly themeService: ThemeService) {}

  /** Garante que as cores padrão estão semeadas no boot da API. */
  async onModuleInit() {
    try {
      await this.themeService.ensureSeeded()
    } catch (e) {
      // Não bloqueia o boot — se a tabela ainda não existe (migration pendente),
      // o seed roda no próximo deploy. O frontend tem fallback pra defaults.
      console.warn('[theme] ensureSeeded falhou (provável migration pendente):', (e as Error).message)
    }
  }
}
