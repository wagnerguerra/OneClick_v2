'use client'

import { cn } from '@saas/ui'
import { resolveAssetUrl } from '@/lib/api-url'

/**
 * Avatar de usuário: foto (resolvida via `resolveAssetUrl`) ou iniciais como
 * fallback. Componente reutilizável em todo o sistema (cards, listas, headers).
 *
 * O tamanho e o tamanho de fonte das iniciais vêm pelo `className`
 * (ex.: `"h-6 w-6 text-[10px]"`); `bg` é a cor de fundo do fallback de iniciais.
 * `user = null` renderiza um placeholder "?".
 */
export function UserAvatar({ user, className, bg = 'bg-slate-400', title }: {
  user: { name: string; image: string | null } | null | undefined
  className?: string
  bg?: string
  title?: string
}) {
  if (!user) {
    return (
      <span title={title} className={cn('rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold', className)}>
        ?
      </span>
    )
  }
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveAssetUrl(user.image)} alt={user.name} title={title ?? user.name} className={cn('rounded-full object-cover', className)} />
  }
  const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span title={title ?? user.name} className={cn('rounded-full text-white flex items-center justify-center font-bold', bg, className)}>
      {initials}
    </span>
  )
}
