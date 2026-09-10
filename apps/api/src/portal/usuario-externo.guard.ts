import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import type { Request } from 'express'

import { AuthService } from '../auth/auth.service'

/**
 * Barra o usuário EXTERNO (Portal do Cliente) em toda rota HTTP interna.
 *
 * Existe porque a guarda que eu havia posto nas procedures do tRPC não cobria
 * a superfície REST — e o sistema tem 40+ controllers. O sintoma apareceu no
 * chat: `GET /api/admin/online-users` devolve a presença escopada por
 * `empresaId` a QUALQUER sessão autenticada, e o usuário externo herda o
 * `empresaId` do escritório. Resultado: o cliente enxergava o diretório inteiro
 * da equipe interna.
 *
 * Corrigir só aquele endpoint deixaria os outros 40 esperando a vez. A regra
 * vive aqui, em UM lugar, e vale para tudo que entra por HTTP.
 *
 * A regra é estreita de propósito: só bloqueia quando HÁ sessão e ela é de um
 * usuário externo. Requisição sem sessão segue o caminho de sempre — rota
 * pública continua pública, e a autenticação continua sendo problema de quem
 * já cuidava dela.
 */

/**
 * Prefixos que o usuário externo PODE acessar.
 *
 * `/api/auth` porque ele precisa entrar, sair e trocar a senha. `/api/portal`
 * é onde o portal vai morar — o namespace tRPC `portal.*` chega por
 * `/api/trpc`, e o escopo por cliente lá dentro é quem manda; esta guarda não
 * tem como distinguir procedure por procedure dentro de um POST /api/trpc.
 */
const LIBERADOS = ['/api/auth', '/api/portal']

/**
 * Leitura de asset — logo do escritório, avatar, anexo já publicado.
 *
 * Só GET/HEAD. O `GET /api/upload/:filename` NÃO exige sessão (confirmado no
 * controller: quem exige é o POST), então já está aberto a quem tiver a URL.
 * Bloqueá-lo para o usuário logado, enquanto segue aberto para a internet,
 * seria prejuízo puro — e foi o que quebrou a logo no topo do portal: o
 * navegador manda o cookie, a guarda via um externo e devolvia 403. Com `curl`
 * sem cookie a mesma URL respondia 200, o que despistou o diagnóstico.
 *
 * O POST continua barrado: enviar arquivo pelo portal é assunto da Fase 1, e
 * vai ter rota própria com escopo por cliente.
 */
const ASSETS_LEITURA = '/api/upload/'
const METODOS_LEITURA = new Set(['GET', 'HEAD'])

/**
 * O tRPC é liberado aqui e gateado LÁ DENTRO.
 *
 * Uma única rota (`/trpc/<procedure>`) atende procedure interna e procedure de
 * portal. Bloquear no caminho mataria o portal junto; por isso o gate do tRPC
 * continua sendo o `assertUsuarioInterno`, chamado em toda permission-procedure
 * e no `protectedProcedure`.
 *
 * ATENÇÃO ao prefixo: o controller do tRPC é `@Controller()` com
 * `@All('trpc/*path')`, e a API não tem `setGlobalPrefix` — a rota real é
 * `/trpc`, e NÃO `/api/trpc` como o resto dos controllers. Liberar só o
 * `/api/trpc` bloqueava toda chamada do portal e derrubava a área do cliente
 * inteira, com a tela dizendo "nenhuma empresa vinculada". Os dois ficam na
 * lista para o dia em que a API ganhar prefixo global ou um proxy o adicionar.
 */
const TRPC = ['/trpc', '/api/trpc']

@Injectable()
export class UsuarioExternoGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const caminho = (req.originalUrl || req.url || '').split('?')[0] ?? ''

    if (TRPC.some(p => caminho.startsWith(p))) return true
    if (LIBERADOS.some(p => caminho.startsWith(p))) return true
    if (caminho.startsWith(ASSETS_LEITURA) && METODOS_LEITURA.has(req.method)) return true

    // Sem cookie não há sessão a resolver — evita uma consulta por requisição
    // em tudo que é público (assets, webhooks, health).
    if (!req.headers.cookie) return true

    let role: string | undefined
    try {
      const headers = new Headers()
      for (const [chave, valor] of Object.entries(req.headers)) {
        if (valor) headers.set(chave, Array.isArray(valor) ? valor.join(', ') : valor)
      }
      const sessao = await this.authService.auth.api.getSession({ headers })
      role = (sessao?.user as Record<string, unknown> | undefined)?.role as string | undefined
    } catch {
      // Sessão ilegível não é problema desta guarda: quem cuida de autenticar
      // é a rota. Aqui só interessa NEGAR quem é comprovadamente externo.
      return true
    }

    if (role === 'COLABORADOR_CLIENTE') {
      throw new ForbiddenException('Esta área é do escritório. Usuários de cliente acessam pelo portal.')
    }
    return true
  }
}
