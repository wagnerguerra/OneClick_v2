/**
 * Server wrapper que envolve o conteúdo cliente em <Suspense>.
 * Necessário pra Next 15 build de produção: páginas com useSearchParams()
 * precisam estar dentro de boundary Suspense, senão o prerender estático
 * falha com "useSearchParams() should be wrapped in a suspense boundary".
 */
import { Suspense } from 'react'
import BiPublicContent from './_content'

export default function BiPublicPage() {
  return (
    <Suspense fallback={null}>
      <BiPublicContent />
    </Suspense>
  )
}
