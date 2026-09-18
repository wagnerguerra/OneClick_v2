'use client'

import { useEffect, useState } from 'react'
import { cn } from '@saas/ui'
import { resolveAssetUrl } from '@/lib/api-url'

/**
 * Avatar de usuário: foto (resolvida via `resolveAssetUrl`) ou iniciais como
 * fallback. Componente reutilizável em todo o sistema (cards, listas, headers).
 *
 * Iniciais (padrão do sistema): **1ª letra da primeira + da última palavra**
 * (ex.: "Ana Paula Souza" → "AS"; "Ana" → "A").
 *
 * Fallback de imagem robusto: se a foto falhar ao carregar (URL quebrada/404),
 * cai automaticamente nas iniciais — não fica com o ícone de imagem quebrada.
 *
 * `phone` é usado como fonte das iniciais quando não há nome (contatos só com
 * telefone, ex.: WhatsApp). Sem nome e sem telefone → placeholder "?".
 *
 * O tamanho e o tamanho de fonte das iniciais vêm pelo `className`
 * (ex.: `"h-6 w-6 text-[10px]"`); `bg`/`fg` são as classes de cor de fundo e de
 * texto do fallback de iniciais (defaults `bg-slate-400`/`text-white`) — passe,
 * ex., `bg="bg-muted" fg="text-muted-foreground"` para o tom discreto.
 * Para a COR DO MÓDULO (editável no design-system), passe `bgColor` com a var/hook
 * (`bgColor="var(--mod-<slug>, #fallback)"` ou `useModuleColor('<slug>')`) — aplica
 * inline e ignora a classe `bg`, mantendo a forma canônica (não use `bg="bg-<c>-500"`
 * contando com o retint). `user = null` (sem `phone`) renderiza um placeholder "?".
 */
function iniciaisDe(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const primeira = parts[0]?.[0] ?? ''
  const ultima = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

export function UserAvatar({ user, phone, className, bg = 'bg-slate-400', fg = 'text-white', title, bgColor }: {
  user: { name: string; image?: string | null } | null | undefined
  phone?: string | null
  className?: string
  bg?: string
  fg?: string
  title?: string
  bgColor?: string
}) {
  const image = user?.image
  const [imgError, setImgError] = useState(false)
  // Reseta o estado de erro quando a foto muda (usuário diferente no mesmo nó).
  useEffect(() => { setImgError(false) }, [image])

  if (image && !imgError) {
    // A CAIXA (span) carrega tamanho/forma via `className` e recorta em círculo —
    // idêntica à do fallback de iniciais, que renderiza redonda. O <img> apenas
    // preenche 100% da caixa (object-cover), com o tamanho FORÇADO por style
    // inline (vence qualquer folha de estilo). Isso é imune ao quirk do Next em
    // DEV, onde o Preflight do Tailwind (`img { height:auto; max-width:100% }`)
    // pode vencer o utilitário `h-7` na cascata e a foto assumir a proporção
    // natural (vira "pílula"); em prod as layers ficam certas e nunca acontece.
    return (
      <span
        title={title ?? user?.name ?? undefined}
        className={cn('rounded-full overflow-hidden shrink-0 inline-block', className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveAssetUrl(image)}
          alt={user?.name ?? ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setImgError(true)}
        />
      </span>
    )
  }

  // Iniciais — nome; sem nome, cai no telefone; sem os dois, "?".
  const base = (user?.name?.trim() || phone?.trim() || '')
  const initials = iniciaisDe(base)
  if (!initials) {
    return (
      <span title={title} className={cn('rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold', className)}>
        ?
      </span>
    )
  }
  return (
    <span
      title={title ?? user?.name ?? undefined}
      className={cn('rounded-full flex items-center justify-center font-bold', !bgColor && bg, fg, className)}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {initials}
    </span>
  )
}
