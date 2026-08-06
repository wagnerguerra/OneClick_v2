'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Building2, Check } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { masks } from '@/lib/masks'

interface Filial {
  id: string
  documento: string
  razaoSocial: string
  nomeFantasia: string | null
  ehMatriz: boolean | null
  status: string | null
}

function ehMatriz(f: Filial) {
  return f.ehMatriz === true || (f.ehMatriz == null && f.documento.replace(/\D/g, '').slice(8, 12) === '0001')
}

/**
 * Exibe o CNPJ do cliente no header. Se houver outros CNPJs da mesma raiz (matriz +
 * filiais), vira um seletor: ao passar o mouse aparece a seta e, ao clicar, lista os
 * demais CNPJs vinculados para navegar. Sem filiais, é só texto.
 */
export function CnpjFilialSelect({ clienteId, documento, tipoDocumento }: {
  clienteId: string; documento: string; tipoDocumento: string
}) {
  const router = useRouter()
  const [filiais, setFiliais] = useState<Filial[]>([])
  const fmt = tipoDocumento === 'CPF' ? masks.cpf(documento || '') : masks.cnpj(documento || '')

  useEffect(() => {
    if (tipoDocumento !== 'CNPJ' || !documento || !clienteId) return
    // Aqui NÃO se filtra por status: com a listagem escondendo filial inativa,
    // este seletor é o caminho de volta para ela. Some da lista, mas continua
    // alcançável a partir das irmãs — marcada como inativa.
    ;(trpc.cliente as { listMesmaRaiz: { query: (i: { clienteId: string; documento: string }) => Promise<Filial[]> } })
      .listMesmaRaiz.query({ clienteId, documento })
      .then((d) => setFiliais(d || []))
      .catch(() => setFiliais([]))
  }, [clienteId, documento, tipoDocumento])

  // Sem CNPJs vinculados → texto puro (comportamento atual).
  if (!filiais.length) return <>CNPJ: {fmt}</>

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1 rounded px-1 -mx-1 align-baseline transition-colors hover:bg-foreground/5 hover:text-foreground"
          title="Este cliente tem filiais — clique para alternar entre os CNPJs"
        >
          CNPJ: {fmt}
          <ChevronDown className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-90" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">CNPJ atual</DropdownMenuLabel>
        <DropdownMenuItem disabled className="opacity-100">
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          <span className="font-mono text-xs">{fmt}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          Outros CNPJs vinculados ({filiais.length})
        </DropdownMenuLabel>
        {filiais.map((f) => (
          <DropdownMenuItem key={f.id} onClick={() => router.push(`/clientes/${f.id}`)} className="flex cursor-pointer items-center gap-2">
            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span>{masks.cnpj(f.documento)}</span>
                {ehMatriz(f) && <span className="rounded border border-current px-1 text-[9px] font-semibold uppercase tracking-wide opacity-70">matriz</span>}
                {f.status === 'INATIVA' && <span className="rounded border border-current px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">inativa</span>}
              </div>
              <div className="truncate text-[11px] opacity-70">{f.nomeFantasia || f.razaoSocial}</div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
