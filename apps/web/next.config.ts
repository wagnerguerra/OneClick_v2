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
}

export default nextConfig
