'use client'

import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Card } from '@saas/ui'
import { FERRAMENTAS } from './_components/catalogo'
import { HtmlPdfModal } from './_components/html-pdf-modal'

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
          return (
            <button key={f.slug} type="button" onClick={() => setAberta(f.slug)} className="group text-left">
              <Card className="flex h-full min-h-[212px] flex-col rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                {/* Selo em cor cheia com o ícone branco — é o que dá a cada
                    ferramenta uma identidade reconhecível de longe. */}
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: f.cor }}>
                  <Icone className="h-[22px] w-[22px]" />
                </div>
                <p className="text-[15px] font-semibold leading-tight tracking-tight">{f.titulo}</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{f.descricao}</p>
              </Card>
            </button>
          )
        })}
      </div>

      {aberta === 'html-pdf' && <HtmlPdfModal onClose={() => setAberta(null)} />}
    </div>
  )
}
