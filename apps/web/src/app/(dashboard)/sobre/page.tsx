'use client'

/**
 * Sobre — Página informativa do sistema OneClick.
 *
 * Descreve o que é o sistema, a versão atual e a stack de tecnologias usadas.
 * Acessível a QUALQUER usuário logado (não tem gating de master) — é puramente
 * informativa, diferente do Design System / App Mobile.
 */

import Link from 'next/link'
import {
  Info,
  Layers,
  Server,
  Database,
  Smartphone,
  Cloud,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, Badge } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'

// Cor de acento do bloco "Ajuda" (cyan), via token coerente com a sidebar.
const ACCENT = '#0891b2'

// Versão atual do sistema web — fonte: apps/web/package.json (campo "version").
const VERSAO_WEB = '0.1.0'
// Versão do app mobile — fonte: apps/mobile/app.json (expo.version).
const VERSAO_MOBILE = '1.2.0'
// Ano de copyright (fixo, conforme orientação).
const ANO = 2026

interface GrupoTec {
  titulo: string
  icon: LucideIcon
  itens: { nome: string; detalhe?: string }[]
}

const TECNOLOGIAS: GrupoTec[] = [
  {
    titulo: 'Frontend',
    icon: Layers,
    itens: [
      { nome: 'Next.js 15', detalhe: 'App Router · RSC' },
      { nome: 'React' },
      { nome: 'Tailwind CSS v4' },
      { nome: 'shadcn/ui' },
      { nome: 'TanStack Table v8', detalhe: 'server-side' },
      { nome: 'TanStack Query v5' },
      { nome: 'React Hook Form + Zod' },
      { nome: 'Recharts' },
    ],
  },
  {
    titulo: 'Backend',
    icon: Server,
    itens: [
      { nome: 'NestJS', detalhe: 'modular por domínio' },
      { nome: 'tRPC', detalhe: 'type-safe' },
      { nome: 'Better Auth', detalhe: 'MFA · OAuth · passkeys' },
      { nome: 'CASL', detalhe: 'RBAC por tenant' },
    ],
  },
  {
    titulo: 'Dados',
    icon: Database,
    itens: [
      { nome: 'PostgreSQL', detalhe: 'schema-per-tenant' },
      { nome: 'Prisma' },
      { nome: 'Redis + BullMQ', detalhe: 'cache · filas' },
    ],
  },
  {
    titulo: 'Mobile',
    icon: Smartphone,
    itens: [
      { nome: 'Expo', detalhe: 'SDK 56' },
      { nome: 'React Native' },
      { nome: 'NativeWind' },
    ],
  },
  {
    titulo: 'Serviços & Infra',
    icon: Cloud,
    itens: [
      { nome: 'Stripe', detalhe: 'billing recorrente' },
      { nome: 'Resend', detalhe: 'e-mail transacional' },
      { nome: 'S3 / MinIO', detalhe: 'documentos · assets' },
      { nome: 'Sentry + Pino', detalhe: 'observabilidade' },
      { nome: 'Docker' },
      { nome: 'Turborepo + pnpm' },
      { nome: 'TypeScript', detalhe: 'strict' },
    ],
  },
]

export default function SobrePage() {
  return (
    <>
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar>
        <h1 className="truncate">OneClick</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Ajuda</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Sobre</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge
            variant="outline"
            className="border-border font-mono text-xs"
            style={{ color: ACCENT, borderColor: ACCENT }}
          >
            v{VERSAO_WEB}
          </Badge>
        </div>
      </PageHeaderBar>

      <div className="mx-auto max-w-5xl space-y-6">

      {/* O que é */}
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4" style={{ color: ACCENT }} />
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
              O que é
            </h2>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              O OneClick é uma plataforma SaaS multi-tenant de ERP/CRM voltada a escritórios
              contábeis, reunindo os blocos de Cadastros, Corporativo/Administrativo, Fiscal e
              Qualidade em um único ambiente integrado. É a reconstrução modernizada do legado{' '}
              <span className="font-medium text-foreground">OneClick v1 (SERPRO2)</span>, com
              arquitetura, segurança e experiência de uso repensadas do zero.
            </p>
            <p>
              A isolação de dados é feita por{' '}
              <span className="font-medium text-foreground">schema-per-tenant</span>: cada cliente
              tem o seu próprio schema no PostgreSQL (<code className="rounded bg-muted px-1 py-0.5 text-xs">tenant_&lt;id&gt;</code>),
              enquanto o schema público guarda apenas tenants, planos e assinaturas. O tenant é
              resolvido por subdomínio ou header a cada requisição.
            </p>
            <p>
              Os módulos são organizados por bloco no menu lateral, com cobrança recorrente
              gerenciada via Stripe Billing e controle de acesso granular (RBAC) por tenant.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tecnologias */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" style={{ color: ACCENT }} />
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
              Tecnologias
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TECNOLOGIAS.map((grupo) => {
              const Icon = grupo.icon
              return (
                <div
                  key={grupo.titulo}
                  className="rounded-lg border border-border bg-muted/40 p-4"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">{grupo.titulo}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {grupo.itens.map((item) => (
                      <Badge
                        key={item.nome}
                        variant="secondary"
                        className="font-normal"
                        title={item.detalhe}
                      >
                        {item.nome}
                        {item.detalhe && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {item.detalhe}
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Versões + rodapé */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Web: <span className="font-medium text-foreground">v{VERSAO_WEB}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                App mobile: <span className="font-medium text-foreground">v{VERSAO_MOBILE}</span>
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">© {ANO} OneClick</p>
        </CardContent>
      </Card>
      </div>
    </>
  )
}
