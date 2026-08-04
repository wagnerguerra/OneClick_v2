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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {FERRAMENTAS.map((f) => {
          const Icone = f.icone
          return (
            <Link key={f.slug} href={f.href} className="group">
              <Card className="h-full p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in srgb, ${f.cor} 14%, transparent)`, color: f.cor }}>
                  <Icone className="h-6 w-6" />
                </div>
                <p className="text-[15px] font-semibold group-hover:underline">{f.titulo}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{f.descricao}</p>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
