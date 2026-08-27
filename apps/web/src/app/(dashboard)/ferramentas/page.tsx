'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Card, cn } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { FERRAMENTAS } from './_components/catalogo'
import { HtmlPdfModal } from './_components/html-pdf-modal'
import { JuntarPdfModal } from './_components/juntar-pdf-modal'
import { DividirPdfModal } from './_components/dividir-pdf-modal'
import { AssinarPdfModal } from './_components/assinar-pdf-modal'

/**
 * Vitrine das ferramentas de uso geral — um cartão por utilitário.
 *
 * Cada uma abre em modal, sobre a própria vitrine: são operações curtas e de
 * ida e volta, e mandar o usuário para outra página só para ele voltar em
 * seguida somava navegação sem ganho.
 *
 * Só entra na grade o que existe. Cartão de "em breve" ocuparia espaço
 * prometendo o que ninguém pode usar.
 */
export default function FerramentasPage() {
  const { permissions, isMaster, isEmpresaMaster } = useUserPermissions()
  const subsGerais = (permissions.find((p) => p.moduleSlug === 'ferramentas-gerais')?.subPermissions ?? {}) as Record<string, boolean>
  const podeAssinar = isMaster || isEmpresaMaster || subsGerais.assinar === true
  const [aberta, setAberta] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar>
        <h1 className="truncate">Ferramentas</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Ferramentas</span>
        </p>
      </PageHeaderBar>

      {/* Colunas por largura disponível, não por breakpoint: assim o cartão
          mantém a proporção em qualquer tela, e a grade se adapta sozinha
          conforme o catálogo cresce. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-4">
        {FERRAMENTAS.map((f) => {
          const Icone = f.icone
          // Assinar usa o certificado A1 da empresa: sem a liberação nominal o
          // cartão fica visível, mas apagado e sem clique — sumir com ele faria
          // a pessoa procurar uma ferramenta que existe.
          const bloqueada = f.slug === 'assinar-pdf' && !podeAssinar
          return (
            <button
              key={f.slug}
              type="button"
              disabled={bloqueada}
              title={bloqueada ? 'Assinatura não liberada no seu perfil — fale com o administrador.' : undefined}
              onClick={() => setAberta(f.slug)}
              className={cn('group text-left', bloqueada ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}
            >
              <Card className={cn('flex h-full min-h-[212px] flex-col rounded-2xl p-6 transition-all duration-200',
                !bloqueada && 'hover:-translate-y-1 hover:shadow-lg')}>
                {/* Selo em cor cheia com o ícone branco — é o que dá a cada
                    ferramenta uma identidade reconhecível de longe. */}
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: f.cor }}>
                  <Icone className="h-[22px] w-[22px]" />
                </div>
                <p className="text-[15px] font-semibold leading-tight tracking-tight">{f.titulo}</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{f.descricao}</p>
                {bloqueada && (
                  <p className="mt-auto flex items-center gap-1 pt-3 text-[11px] font-medium text-muted-foreground">
                    <Lock className="h-3 w-3" />Não liberado no seu perfil
                  </p>
                )}
              </Card>
            </button>
          )
        })}
      </div>

      {aberta === 'html-pdf' && <HtmlPdfModal onClose={() => setAberta(null)} />}
      {aberta === 'juntar-pdf' && <JuntarPdfModal onClose={() => setAberta(null)} />}
      {aberta === 'dividir-pdf' && <DividirPdfModal onClose={() => setAberta(null)} />}
      {aberta === 'assinar-pdf' && <AssinarPdfModal onClose={() => setAberta(null)} />}
    </div>
  )
}
