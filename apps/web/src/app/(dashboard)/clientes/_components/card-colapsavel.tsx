'use client'

/**
 * Card de aba que contrai pelo cabeçalho.
 *
 * O cadastro do cliente tem treze abas, e a maioria abre um card alto. Contrair
 * o que não interessa agora encurta a rolagem sem tirar nada do lugar.
 *
 * O conteúdo é ESCONDIDO, não desmontado. São formulários do react-hook-form:
 * desmontar um card levaria junto os campos registrados, e um cliente salvo
 * logo depois sairia sem o que estava ali dentro. Esconder custa a mesma
 * rolagem e não mexe no formulário.
 *
 * `headerClassName` existe para cada aba manter o cabeçalho que já tinha (umas
 * com faixa `bg-muted/20`, outras lisas): o pedido foi contrair, não repintar.
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardHeader, cn } from '@saas/ui'

export function CardColapsavel({
  titulo, subtitulo, icone: Icone, corIcone, acoes, children,
  className, headerClassName, comecaAberto = true,
}: {
  titulo: string
  subtitulo?: string
  icone?: React.ComponentType<{ className?: string }>
  /** Classe de cor do ícone, quando a aba usa uma própria (ex.: text-emerald-600). */
  corIcone?: string
  /** Botões à direita do cabeçalho — ficam fora do gatilho de contrair. */
  acoes?: ReactNode
  children: ReactNode
  className?: string
  headerClassName?: string
  comecaAberto?: boolean
}) {
  const [aberto, setAberto] = useState(comecaAberto)

  return (
    <Card className={className}>
      <CardHeader className={cn('flex flex-row items-center gap-2 space-y-0', headerClassName)}>
        {/* O título todo é gatilho, mas o chevron mora na ponta direita: é onde
            o olho procura o "abre e fecha" de um painel. */}
        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          aria-expanded={aberto}
          title={aberto ? 'Recolher' : 'Expandir'}
          className="group/colapsa flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {Icone && <Icone className={cn('h-4 w-4 shrink-0', corIcone ?? 'text-muted-foreground')} />}
          <div className="min-w-0">
            <h5 className="mb-0 truncate text-sm font-semibold transition-colors group-hover/colapsa:text-foreground">
              {titulo}
            </h5>
            {subtitulo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitulo}</p>}
          </div>
        </button>
        {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          aria-expanded={aberto}
          title={aberto ? 'Recolher' : 'Expandir'}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', !aberto && '-rotate-90')}
          />
        </button>
      </CardHeader>
      <div className={cn(!aberto && 'hidden')}>{children}</div>
    </Card>
  )
}
