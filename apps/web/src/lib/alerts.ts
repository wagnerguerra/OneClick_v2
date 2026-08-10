import Swal from 'sweetalert2'

const themeColor = '#5ea3cb'

export const alerts = {
  success(title: string, text?: string, opts?: { timer?: number }) {
    return Swal.fire({
      icon: 'success',
      title,
      text,
      confirmButtonColor: themeColor,
      timer: opts?.timer ?? 2000,
      timerProgressBar: true,
      showConfirmButton: false,
    })
  },

  /**
   * Toast discreto no canto (top-end), não-bloqueante — centraliza o padrão que
   * já era usado inline (ex.: lembretes da agenda). Para feedback rápido que não
   * deve interromper o fluxo (ex.: "config salva", "senha copiada"). `timer` em
   * ms (default 4000).
   */
  toast(title: string, opts?: { text?: string; icon?: 'success' | 'error' | 'warning' | 'info'; timer?: number }) {
    return Swal.fire({
      toast: true,
      position: 'top-end',
      icon: opts?.icon ?? 'success',
      title,
      text: opts?.text,
      showConfirmButton: false,
      timer: opts?.timer ?? 4000,
      timerProgressBar: true,
      showCloseButton: true,
    })
  },

  warning(title: string, text?: string) {
    return Swal.fire({
      icon: 'warning',
      title,
      text,
      confirmButtonColor: themeColor,
    })
  },

  error(title: string, text?: string) {
    return Swal.fire({
      icon: 'error',
      title,
      text,
      confirmButtonColor: themeColor,
    })
  },

  info(title: string, text?: string) {
    return Swal.fire({
      icon: 'info',
      title,
      text,
      confirmButtonColor: themeColor,
    })
  },

  async confirm(opts: { title: string; text: string; confirmText?: string; icon?: 'warning' | 'question' | 'info' }) {
    const result = await Swal.fire({
      icon: opts.icon ?? 'warning',
      title: opts.title,
      text: opts.text,
      showCancelButton: true,
      confirmButtonColor: themeColor,
      cancelButtonColor: '#6b7280',
      confirmButtonText: opts.confirmText ?? 'Confirmar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    })
    return result.isConfirmed
  },

  async confirmDelete(itemName?: string) {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Excluir registro',
      text: itemName
        ? `Tem certeza que deseja excluir "${itemName}"? Esta ação não pode ser desfeita.`
        : 'Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sim, excluir',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    })
    return result.isConfirmed
  },

  /**
   * Prompt de texto. Retorna o valor digitado (string vazia se em branco) ou
   * `null` se o usuário cancelou. Distinguir cancelamento de "salvou em branco"
   * é importante pra fluxos onde o motivo é opcional mas a ação ainda precisa rodar.
   */
  async input(opts: {
    title: string
    text?: string
    inputLabel?: string
    inputPlaceholder?: string
    inputValue?: string
    confirmText?: string
    icon?: 'warning' | 'question' | 'info'
    inputType?: 'text' | 'textarea'
    required?: boolean
  }): Promise<string | null> {
    const result = await Swal.fire({
      icon: opts.icon ?? 'question',
      title: opts.title,
      text: opts.text,
      input: opts.inputType ?? 'text',
      inputLabel: opts.inputLabel,
      inputPlaceholder: opts.inputPlaceholder,
      inputValue: opts.inputValue,
      showCancelButton: true,
      confirmButtonColor: themeColor,
      cancelButtonColor: '#6b7280',
      confirmButtonText: opts.confirmText ?? 'Confirmar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      inputValidator: opts.required
        ? (v: string) => (!v?.trim() ? 'Campo obrigatório' : null)
        : undefined,
    })
    if (!result.isConfirmed) return null
    return (result.value as string) ?? ''
  },

  async custom(opts: {
    title: string; html: string
    confirmButtonText?: string; showCancelButton?: boolean; cancelButtonText?: string
    preConfirm?: () => unknown
    /** Ícone do SweetAlert: 'success' | 'error' | 'warning' | 'info' | 'question' */
    icon?: 'success' | 'error' | 'warning' | 'info' | 'question'
    /** Largura do modal (px ou %) — default da lib é 32em */
    width?: string | number
  }) {
    return Swal.fire({
      title: opts.title,
      html: opts.html,
      icon: opts.icon,
      width: opts.width,
      showCancelButton: opts.showCancelButton ?? true,
      confirmButtonColor: themeColor,
      cancelButtonColor: '#6b7280',
      confirmButtonText: opts.confirmButtonText ?? 'Confirmar',
      cancelButtonText: opts.cancelButtonText ?? 'Cancelar',
      reverseButtons: true,
      preConfirm: opts.preConfirm,
    })
  },
}
