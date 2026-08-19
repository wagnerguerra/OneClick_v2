'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquarePlus, SearchCheck } from 'lucide-react'

/**
 * Porta de entrada do portal público de manifestações: registrar uma nova
 * (elogio, reclamação ou sugestão) ou acompanhar pelo protocolo. Página
 * pública — sem sessão, sem dados de terceiros.
 */
export default function ManifestacaoHomePage() {
  const router = useRouter()
  const [protocolo, setProtocolo] = useState('')

  function acompanhar() {
    const p = protocolo.trim().toUpperCase()
    if (p) router.push(`/manifestacao/${encodeURIComponent(p)}`)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Fale com a Qualidade</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Registre um elogio, uma reclamação ou uma sugestão — identificado ou anônimo.
          Você recebe um protocolo para acompanhar a tratativa.
        </p>
      </div>

      <div className="space-y-4">
        <Link href="/manifestacao/nova"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <MessageSquarePlus className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Registrar manifestação</span>
            <span className="block text-xs text-muted-foreground">Elogio, reclamação ou sugestão</span>
          </span>
        </Link>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <SearchCheck className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Acompanhar pelo protocolo</span>
              <span className="block text-xs text-muted-foreground">O código que você recebeu ao registrar</span>
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={protocolo}
              onChange={(e) => setProtocolo(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') acompanhar() }}
              placeholder="ELO-XXXX-XXXX"
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <button type="button" onClick={acompanhar} disabled={!protocolo.trim()}
              className="h-10 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
              Consultar
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground mt-8">OneClick · Central Contábil</p>
    </div>
  )
}
