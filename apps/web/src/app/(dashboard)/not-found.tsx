import { NotFoundView } from '@/components/not-found-view'

/**
 * 404 das rotas inexistentes do app autenticado. Renderiza DENTRO do layout do
 * dashboard (sidebar + header preservados), então o usuário mantém o contexto e
 * a navegação — não cai numa tela "deslogada". F-004.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <NotFoundView />
    </div>
  )
}
