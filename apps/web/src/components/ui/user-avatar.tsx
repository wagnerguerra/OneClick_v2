'use client'

import { cn } from '@saas/ui'
import { resolveAssetUrl } from '@/lib/api-url'

/**
 * Avatar de usuário: foto (resolvida via `resolveAssetUrl`) ou iniciais como
 * fallback. Componente reutilizável em todo o sistema (cards, listas, headers).
 *
 * O tamanho e o tamanho de fonte das iniciais vêm pelo `className`
 * (ex.: `"h-6 w-6 text-[10px]"`); `bg`/`fg` são as classes de cor de fundo e de
 * texto do fallback de iniciais (defaults `bg-slate-400`/`text-white`) — passe,
 * ex., `bg="bg-muted" fg="text-muted-foreground"` para o tom discreto.
 * Para a COR DO MÓDULO (editável no design-system), passe `bgColor` com a var/hook
 * (`bgColor="var(--mod-<slug>, #fallback)"` ou `useModuleColor('<slug>')`) — aplica
 * inline e ignora a classe `bg`, mantendo a forma canônica (não use `bg="bg-<c>-500"`
 * contando com o retint). `user = null` renderiza um placeholder "?".
 */
export function UserAvatar({ user, className, bg = 'bg-slate-400', fg = 'text-white', title, bgColor }: {
  user: { name: string; image?: string | null } | null | undefined
  className?: string
  bg?: string
  fg?: string
  title?: string
  bgColor?: string
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
    <span
      title={title ?? user.name}
      className={cn('rounded-full flex items-center justify-center font-bold', !bgColor && bg, fg, className)}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {initials}
    </span>
  )
}
