'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { DollarSign, FileText, Flame, Landmark, Mail, MapPin, Shield } from 'lucide-react'
import { Button, Tabs, TabsTrigger, SlidingTabsList } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { AbaFederal } from './_components/aba-federal'
import { AbaEstadual } from './_components/aba-estadual'
import { AbaMunicipal } from './_components/aba-municipal'
import { AbaTrabalhista } from './_components/aba-trabalhista'
import { AbaFgts } from './_components/aba-fgts'
import { AbaCgu } from './_components/aba-cgu'
import { AbaAlvara } from './_components/aba-alvara'
import { CompilarDialog } from './_components/compilar-dialog'

const ABAS = [
  { v: 'federal', label: 'Federais', Icon: Shield },
  { v: 'estadual', label: 'Estaduais', Icon: MapPin },
  { v: 'municipal', label: 'Municipais', Icon: Landmark },
  { v: 'trabalhista', label: 'Trabalhista', Icon: FileText },
  { v: 'fgts', label: 'FGTS', Icon: DollarSign },
  { v: 'cgu', label: 'CGU', Icon: Shield },
  { v: 'alvara', label: 'Alvarás', Icon: Flame },
] as const
type Aba = typeof ABAS[number]['v']

/**
 * Certidões e Alvarás. Cada aba vive em `_components/` com o próprio estado
 * (a página tinha ~4 mil linhas num componente só); aqui ficam só o
 * cabeçalho, as abas e o "Compilar e enviar", que atravessa todas.
 */
export default function CertidoesCndPage() {
  const searchParams = useSearchParams()
  const abaParam = searchParams.get('aba')
  const [aba, setAba] = useState<Aba>(ABAS.some(a => a.v === abaParam) ? abaParam as Aba : 'federal')
  const [compilarOpen, setCompilarOpen] = useState(false)
  // Sobe quando o compilado gera certidões novas: a aba aberta recarrega.
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="flex h-[calc(100vh-98px)] flex-col gap-4">
      <PageHeaderBar className="mb-0 sm:mb-0" actions={(
        <Button size="sm" className="gap-1.5" onClick={() => setCompilarOpen(true)}>
          <Mail className="h-4 w-4" />Compilar e enviar
        </Button>
      )}>
        <h1 className="truncate">Certidões e Alvarás</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Legalização</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Certidões e Alvarás</span>
        </p>
      </PageHeaderBar>

      <Tabs value={aba} onValueChange={v => setAba(v as Aba)} className="shrink-0">
        <SlidingTabsList
          activeValue={aba}
          indicatorInsetY={4}
          className="!shadow-sm !border !border-border gap-1 !p-1 !bg-muted/40 !rounded-full w-fit max-w-full items-center overflow-x-auto scrollbar-none"
          indicatorClassName="!bg-card !shadow-md"
        >
          {ABAS.map(({ v, Icon, label }) => (
            <TabsTrigger key={v} value={v}
              className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-2 !text-xs !font-semibold !text-foreground/60 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-foreground gap-1.5 leading-none !items-center whitespace-nowrap">
              <Icon className="h-3.5 w-3.5" />{label}
            </TabsTrigger>
          ))}
        </SlidingTabsList>
      </Tabs>

      {/* `key`: cada aba monta do zero ao ser aberta — dados sempre frescos. */}
      <div key={aba} className="flex min-h-0 flex-1 flex-col" style={{ animation: 'fadeSlideIn 0.25s' }}>
        {aba === 'federal' && <AbaFederal refreshKey={refreshKey} filtroInicial={searchParams.get('filtro') || ''} />}
        {aba === 'estadual' && <AbaEstadual refreshKey={refreshKey} />}
        {aba === 'municipal' && <AbaMunicipal refreshKey={refreshKey} />}
        {aba === 'trabalhista' && <AbaTrabalhista refreshKey={refreshKey} />}
        {aba === 'fgts' && <AbaFgts refreshKey={refreshKey} />}
        {aba === 'cgu' && <AbaCgu refreshKey={refreshKey} />}
        {aba === 'alvara' && <AbaAlvara refreshKey={refreshKey} />}
      </div>

      <CompilarDialog open={compilarOpen} onOpenChange={setCompilarOpen} onConcluido={() => setRefreshKey(k => k + 1)} />
    </div>
  )
}
