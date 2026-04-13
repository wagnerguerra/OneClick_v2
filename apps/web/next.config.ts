import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@saas/ui', '@saas/types'],
}

export default nextConfig
