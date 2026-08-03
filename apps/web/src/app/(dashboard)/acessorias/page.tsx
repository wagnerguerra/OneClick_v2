'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'
import { useAbasPermitidas } from './_components/abas'

/**
 * `/acessorias` não tem tela própria: manda o usuário para a primeira aba que
 * ele pode ver.
 *
 * Existe porque o menu tem um item só. Sem isso, quem só acompanha entregas
 * cairia na tela de integração e tomaria um bloqueio de permissão logo na
 * entrada do módulo.
 */
export default function AcessoriasIndexPage() {
  const router = useRouter()
  const { abas, loading } = useAbasPermitidas()

  useEffect(() => {
    if (loading) return
    const primeira = abas[0]
    if (primeira) router.replace(primeira.href)
  }, [loading, abas, router])

  if (!loading && abas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <Lock className="mb-3 h-10 w-10 opacity-20" />
        <p className="text-sm">Você não tem acesso a nenhuma tela do Acessórias.</p>
        <p className="text-[13px]">Peça a liberação nas permissões do seu usuário.</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}
