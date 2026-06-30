'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Indicadores virou uma aba de /orcamentos/relatorios. Mantém a rota antiga
// funcionando redirecionando para a aba.
export default function IndicadoresRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/orcamentos/relatorios?tab=indicadores') }, [router])
  return null
}
