import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

// App é todo SSR autenticado — força dynamic em todas as rotas filhas.
// Sem isso, build de produção falha em páginas com useSearchParams() (Next 15
// exige <Suspense> boundary pra prerender estático). Pra um SaaS com auth
// não há benefício de SSG pra páginas internas.
export const dynamic = 'force-dynamic'

// Tipografia padrão do sistema (20/08/2026): Plus Jakarta Sans — fonte variável,
// servida pelo next/font (self-hosted, sem request a CDN externo).
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' })

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
  // suppressHydrationWarning: extensões do navegador (ex.: Bry/assinador digital)
  // injetam atributos no <html> antes da hidratação → mismatch benigno.
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${jakarta.className}`} suppressHydrationWarning>
        {/* Aplica o tema (localStorage 'theme') ANTES da pintura, em TODA página —
            inclusive as de auth, cujo layout não monta o useTheme (que só roda no
            dashboard). Sem isso o dark nunca ativava fora do dashboard. Espelha o
            applyTheme do use-theme.ts (classe .dark + data-swal2-theme). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.dataset.swal2Theme=d?'dark':'light';}catch(_){}})();`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
