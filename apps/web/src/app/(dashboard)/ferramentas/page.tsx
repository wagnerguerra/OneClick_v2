'use client'

import { useState } from 'react'
import { Wrench, Lock } from 'lucide-react'
import { Card, cn } from '@saas/ui'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { FERRAMENTAS } from './_components/catalogo'
import { HtmlPdfModal } from './_components/html-pdf-modal'
import { JuntarPdfModal } from './_components/juntar-pdf-modal'
import { DividirPdfModal } from './_components/dividir-pdf-modal'
import { AssinarPdfModal } from './_components/assinar-pdf-modal'

const MODULE_COLOR = 'var(--mod-ti, #3b82f6)'

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
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
          <Wrench className="h-6 w-6" />
        </div>
        <div>
          <h1>Ferramentas</h1>
          <p className="text-sm text-muted-foreground">Utilitários de uso geral</p>
        </div>
      </div>

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
