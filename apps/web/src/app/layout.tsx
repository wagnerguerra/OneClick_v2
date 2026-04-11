import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OneClick ERP',
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
        {process.env.NODE_ENV === 'development' && (
          <script src="http://localhost:9000/api/console-hook.js" defer />
        )}
      </body>
    </html>
  )
}
