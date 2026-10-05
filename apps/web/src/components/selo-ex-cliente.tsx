/**
 * Marca de ex-cliente (status INATIVO).
 *
 * Ex-cliente aparece em listas e quadros porque é assim que ele volta — e
 * porque orçamento antigo dele continua existindo (a própria baixa da empresa,
 * por exemplo). Mas aparece IDENTIFICADO: sem a marca, orçar ou cobrar uma
 * conta encerrada passava despercebido.
 */
export function SeloExCliente({ className }: { className?: string }) {
  return (
    <span
      title="Ex-cliente — o cadastro está inativo"
      className={`shrink-0 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold leading-none text-amber-600 dark:text-amber-400 ${className ?? ''}`}
    >
      Ex-cliente
    </span>
  )
}

/** Cliente com status INATIVO (o campo vem de `cliente.listForSelect`). */
export const ehExCliente = (c: { status?: string | null } | null | undefined) => c?.status === 'INATIVO'
