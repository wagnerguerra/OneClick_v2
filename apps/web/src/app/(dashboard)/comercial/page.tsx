import { redirect } from 'next/navigation'

/**
 * O Painel Comercial mudou para /comercial-relatorios (08/10/2026): a rota
 * passou a ter o mesmo slug da permissão que dá acesso a ele, como as demais
 * telas. Esta rota fica só para não quebrar links e favoritos antigos —
 * repassa os parâmetros (aba, período).
 */
export default async function ComercialRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams()
  for (const [chave, valor] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(valor) ? valor : valor != null ? [valor] : []) params.append(chave, v)
  }
  const qs = params.toString()
  redirect(`/comercial-relatorios${qs ? `?${qs}` : ''}`)
}
