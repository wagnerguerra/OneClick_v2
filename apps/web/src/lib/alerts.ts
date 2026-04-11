import Swal from 'sweetalert2'

const themeColor = '#5ea3cb'

export const alerts = {
  success(title: string, text?: string) {
    return Swal.fire({
      icon: 'success',
      title,
      text,
      confirmButtonColor: themeColor,
      timer: 2000,
      timerProgressBar: true,
      showConfirmButton: false,
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
}
