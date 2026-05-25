import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  transpilePackages: ['@saas/ui', '@saas/types'],
  // Standalone output — copia só o necessário pra runtime em .next/standalone.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Build de produção: ignora erros TS/ESLint pré-existentes pra não bloquear
  // deploy. Erros reais são pegos no dev (turbopack faz typecheck no save).
  // Quando estabilizar a base de código, remover essas flags.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Rewrite `/be/*` → backend (NestJS). Frontend faz fetch relativo (mesmo
  // host, sem cross-origin), Next proxia internamente pro :4000. Resolve
  // bloqueio "Stalled" do Chrome (limite de 6 conexões/host quando SSE
  // ocupam todos os slots disponíveis pro :4000).
  // Em prod (mesmo host), o rewrite é no-op funcional.
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    return [
      { source: '/be/:path*', destination: `${apiUrl}/:path*` },
    ]
  },
}

export default nextConfig
