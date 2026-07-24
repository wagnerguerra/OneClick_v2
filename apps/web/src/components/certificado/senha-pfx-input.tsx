'use client'

import type { ChangeEvent } from 'react'
import { Input } from '@saas/ui'

/**
 * Campo de senha do PFX (cadastro / renovação de certificado) — #HLP0301.
 *
 * Não usa type="password": o Chrome trataria como credencial e ofereceria
 * salvar / autocompletar, o que não faz sentido para a senha de um arquivo
 * PFX (é senha nova, não a do usuário). Usa type="text" mascarado por CSS
 * (`-webkit-text-security`), que mostra bolinhas mas o browser não reconhece
 * como senha. O botão de exibir é controlado pelo pai via `show`.
 */
export function SenhaPfxInput({ show, value, onChange, placeholder, className }: {
  show: boolean
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Input
      type="text"
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      style={show ? undefined : ({ WebkitTextSecurity: 'disc' } as any)}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
    />
  )
}
