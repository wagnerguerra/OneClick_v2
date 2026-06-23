'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Label, Checkbox,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

// Fase 1: o modal cobre só os campos de identificação/controle do Modelo.
// O CORPO (de/para de colunas, contrapartidas, etc.) é configurado no editor
// (wizard) — Fase 3.
const modalSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  contaCorrente: z.string().optional().or(z.literal('')),
  isActive: z.boolean(),
})
type ModalForm = z.infer<typeof modalSchema>

export interface TreatmentModelEditTarget {
  id: string
  nome: string
  contaCorrente: string | null
  isActive: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** Quando presente, o modal está em modo edição. */
  target?: TreatmentModelEditTarget | null
}

export function TreatmentModelModal({ open, onClose, onSuccess, target }: Props) {
  const isEdit = !!target
  const {
    register, handleSubmit, control, reset, formState: { errors, isSubmitting },
  } = useForm<ModalForm>({
    resolver: zodResolver(modalSchema),
    defaultValues: { nome: '', contaCorrente: '', isActive: true },
  })

  // Sincroniza os valores ao abrir (create = limpa; edit = preenche).
  useEffect(() => {
    if (!open) return
    reset({
      nome: target?.nome ?? '',
      contaCorrente: target?.contaCorrente ?? '',
      isActive: target?.isActive ?? true,
    })
  }, [open, target, reset])

  async function onSubmit(values: ModalForm) {
    try {
      if (isEdit && target) {
        await trpc.tratamentoLancamentos.update.mutate({
          id: target.id,
          data: { nome: values.nome, contaCorrente: values.contaCorrente, isActive: values.isActive },
        })
        await alerts.success('Modelo atualizado', `"${values.nome}" foi salvo com sucesso.`)
      } else {
        await trpc.tratamentoLancamentos.create.mutate({
          nome: values.nome,
          contaCorrente: values.contaCorrente,
          isActive: values.isActive,
        })
        await alerts.success('Modelo criado', `"${values.nome}" foi criado com sucesso.`)
      }
      onSuccess()
      onClose()
    } catch {
      alerts.error('Erro ao salvar', 'Não foi possível salvar o Modelo de Tratamento.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeaderIcon icon={isEdit ? Pencil : Plus} color={isEdit ? 'blue' : 'emerald'}>
          <DialogTitle>{isEdit ? 'Editar Modelo' : 'Novo Modelo de Tratamento'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados de identificação do Modelo.'
              : 'Crie o Modelo. A configuração de mapeamento é feita depois, no editor.'}
          </DialogDescription>
        </DialogHeaderIcon>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome do Modelo</Label>
              <Input
                className="h-9 text-sm bg-card"
                placeholder="Ex.: Banco do Brasil — Conta 12345"
                {...register('nome')}
              />
              {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Conta corrente</Label>
              <Input
                className="h-9 text-sm bg-card"
                placeholder="Número da conta corrente (opcional)"
                {...register('contaCorrente')}
              />
            </div>

            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                  <span className="text-[13px] font-semibold">Ativo</span>
                </label>
              )}
            />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="success" size="sm" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
