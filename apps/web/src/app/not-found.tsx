import { NotFoundView } from '@/components/not-found-view'

/**
 * 404 global (rotas fora do dashboard / sem sessão). Renderizada dentro do
 * layout raiz (tema + lang pt-BR), full-screen e com a marca. F-004.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <NotFoundView withLogo />
    </div>
  )
}
