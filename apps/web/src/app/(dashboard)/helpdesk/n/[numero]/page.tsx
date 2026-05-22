'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button, Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'

/**
 * Redirect amigável de `#HLP1234` para `/helpdesk/{id}`.
 * Resolve o número via `helpdesk.findByNumero` (que valida visibilidade).
 */
export default function HelpdeskByNumeroPage() {
  const router = useRouter()
  const params = useParams() as { numero: string }
  const numero = parseInt(params.numero, 10)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!numero || Number.isNaN(numero)) {
      setErro('Número de ticket inválido.')
      return
    }
    ;(trpc.helpdesk as any).findByNumero.query({ numero })
      .then((r: { id: string } | null) => {
        if (r?.id) router.replace(`/helpdesk/${r.id}`)
        else setErro(`Ticket #HLP${String(numero).padStart(4, '0')} não encontrado ou sem acesso.`)
      })
      .catch(() => setErro(`Ticket #HLP${String(numero).padStart(4, '0')} não encontrado ou sem acesso.`))
  }, [numero, router])

  if (erro) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm text-muted-foreground">{erro}</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/helpdesk/meus')}>
            Ver meus tickets
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Abrindo ticket #HLP{String(numero || 0).padStart(4, '0')}…</span>
    </div>
  )
}
