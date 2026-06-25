import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Controle de acesso de PLATAFORMA no SERVIDOR (F-009).
 *
 * As rotas de configuração de SISTEMA (integrações Stripe/SMTP/Banco/SERPRO/
 * OpenAI/S3, métricas, backup, gestão de tenants/planos) afetam TODOS os tenants
 * e são exclusivas do MASTER global. Antes o bloqueio era só client-side
 * (redirect no React), contornável por GET direto à rota (HTTP 200). Aqui o
 * Next valida a sessão NA API e devolve um redirect 307 server-side para quem
 * não for master — a página nem chega a renderizar.
 *
 * Defesa em profundidade: os dados em si já são protegidos por `masterProcedure`
 * no tRPC (cada query/mutation rejeita não-master com FORBIDDEN).
 *
 * Importante: `/configuracoes/assinatura` (cobrança do tenant), `.../agendamentos`,
 * `.../chat` e `/admin/design-system` NÃO entram aqui — são do escopo do tenant.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export async function middleware(req: NextRequest) {
  const dashboard = new URL('/dashboard', req.url)
  try {
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      headers: { cookie: req.headers.get('cookie') ?? '' },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.redirect(dashboard)
    const data = (await res.json().catch(() => null)) as { user?: { isMaster?: boolean } } | null
    if (data?.user?.isMaster === true) return NextResponse.next()
    // Sem sessão, sem master ou resposta inesperada → bloqueia (fail-closed).
    return NextResponse.redirect(dashboard)
  } catch {
    // Falha ao verificar a sessão → fail-closed: não expõe config de plataforma.
    return NextResponse.redirect(dashboard)
  }
}

// Apenas rotas de administração de PLATAFORMA (master-only). Caminhos exatos —
// não captura subrotas de tenant como /configuracoes/assinatura.
export const config = {
  matcher: [
    '/configuracoes',
    '/configuracoes/stripe',
    '/configuracoes/certificado',
    '/metricas',
    '/backup-restore',
    '/admin/empresas',
    '/admin/planos',
  ],
}
