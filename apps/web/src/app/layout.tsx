import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

// App é todo SSR autenticado — força dynamic em todas as rotas filhas.
// Sem isso, build de produção falha em páginas com useSearchParams() (Next 15
// exige <Suspense> boundary pra prerender estático). Pra um SaaS com auth
// não há benefício de SSG pra páginas internas.
export const dynamic = 'force-dynamic'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'OneClick', template: '%s · OneClick' },
  description: 'Sistema SaaS ERP/CRM para gestão empresarial',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
