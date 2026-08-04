'use client'

import Link from 'next/link'
import { Wrench } from 'lucide-react'
import { Card } from '@saas/ui'
import { FERRAMENTAS } from './_components/catalogo'

const MODULE_COLOR = 'var(--mod-ti, #3b82f6)'

/**
 * Vitrine das ferramentas de uso geral — um cartão por utilitário.
 *
 * Só entra aqui o que existe: cartão de "em breve" ocuparia a grade prometendo
 * o que ninguém pode usar. A grade cresce conforme o catálogo.
 */
export default function FerramentasPage() {
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
          mantém a proporção quadrada em qualquer tela, e a grade se adapta
          sozinha conforme o catálogo cresce. */}
      <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(248px,1fr))]">
        {FERRAMENTAS.map((f) => {
          const Icone = f.icone
          return (
            <Link key={f.slug} href={f.href} className="group">
              <Card className="flex h-full min-h-[248px] flex-col rounded-2xl p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                {/* Selo em cor cheia com o ícone branco — é o que dá a cada
                    ferramenta uma identidade reconhecível de longe. */}
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: f.cor }}>
                  <Icone className="h-[26px] w-[26px]" />
                </div>
                <p className="text-[19px] font-semibold leading-tight tracking-tight">{f.titulo}</p>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">{f.descricao}</p>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
