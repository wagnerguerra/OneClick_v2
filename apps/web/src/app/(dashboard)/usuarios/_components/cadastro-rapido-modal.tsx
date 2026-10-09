'use client'

/**
 * Cadastro rápido de usuário (#HLP0188).
 *
 * O cadastro completo (/usuarios/new) tem sete abas — bom para editar, lento
 * para o caso mais comum, que é dar acesso a um colaborador que acabou de
 * entrar. Aqui só o essencial; o resto se completa depois no cadastro completo.
 *
 * Usa as mesmas operações do cadastro completo: `user.create` e, se escolhido,
 * `user.copyPermissions` logo em seguida. A cópia vai por ela (e não pelo
 * `permissions` do create) porque leva também as sub-permissões.
 */

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus } from 'lucide-react'
import Link from 'next/link'
import {
  Button, Input, Label, Checkbox,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription, DialogFooter,
} from '@saas/ui'
import { USER_ROLE_LABELS_ESCRITORIO } from '@saas/types'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { UserCombobox } from '@/app/(dashboard)/orcamentos/_components/user-combobox'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { masks, dataParaISO } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/** Colaborador interno é funcionário do escritório: entra no controle de férias
 *  e no módulo Colaboradores sempre, e precisa de área, cargo e admissão. */
const ROLE_INTERNO = 'COLABORADOR_INTERNO'

const schema = z.object({
  role: z.string().min(1, 'Escolha o tipo de usuário'),
  name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  areaId: z.string(),
  cargoId: z.string(),
  dataAdmissao: z.string().refine(v => !v || v.length === 10, 'Data incompleta'),
  incluirFerias: z.boolean(),
  exibirComoColaborador: z.boolean(),
  copiarPermissoesDe: z.string(),
}).superRefine((f, ctx) => {
  if (f.role !== ROLE_INTERNO) return
  if (!f.areaId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areaId'], message: 'Obrigatório para colaborador interno' })
  if (!f.cargoId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cargoId'], message: 'Obrigatório para colaborador interno' })
  if (!f.dataAdmissao) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dataAdmissao'], message: 'Obrigatória para colaborador interno' })
})
type Form = z.infer<typeof schema>

/** Indicador de campo obrigatório — mesmo do cadastro completo (user-form). */
function RequiredMark() { return <span className="text-destructive ml-0.5">*</span> }

const VALORES_INICIAIS: Form = {
  role: ROLE_INTERNO,
  name: '', email: '', password: '',
  areaId: '', cargoId: '', dataAdmissao: '',
  incluirFerias: true,
  exibirComoColaborador: true,
  copiarPermissoesDe: '',
}

type Opcao = { id: string; name: string }

export function CadastroRapidoModal({ open, onClose, onSuccess }: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { empresa } = useEmpresaAtiva()
  const [areas, setAreas] = useState<Opcao[]>([])
  const [cargos, setCargos] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Opcao[]>([])
  const [salvando, setSalvando] = useState(false)

  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: VALORES_INICIAIS,
  })
  const interno = watch('role') === ROLE_INTERNO

  useEffect(() => {
    if (!open) return
    reset(VALORES_INICIAIS)
    trpc.area.listForSelect.query().then(setAreas).catch(() => {})
    trpc.cargo.listForSelect.query().then(setCargos).catch(() => {})
    trpc.user.listForSelect.query().then(lista => setUsuarios(lista.map(u => ({ id: u.id, name: u.name })))).catch(() => {})
  }, [open, reset])

  async function onSubmit(form: Form) {
    setSalvando(true)
    try {
      const criado = await trpc.user.create.mutate({
        role: form.role,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        // Padrões do cadastro rápido: perfil Operador, empresa em que se está.
        profile: 'OPERADOR',
        empresaId: empresa?.id,
        areaId: form.areaId || undefined,
        cargoId: form.cargoId || undefined,
        dataAdmissao: form.dataAdmissao ? dataParaISO(form.dataAdmissao) : undefined,
        // Interno: sempre nos dois (os checkboxes nem aparecem).
        incluirFerias: form.role === ROLE_INTERNO ? true : form.incluirFerias,
        exibirComoColaborador: form.role === ROLE_INTERNO ? true : form.exibirComoColaborador,
        isActive: true,
      })

      if (form.copiarPermissoesDe) {
        try {
          await trpc.user.copyPermissions.mutate({ sourceUserId: form.copiarPermissoesDe, targetUserIds: [criado.id] })
        } catch (e) {
          // O usuário já existe — não desfaz; só avisa que as permissões ficaram por fazer.
          onSuccess()
          onClose()
          await alerts.error('Usuário criado, permissões não copiadas', `${(e as Error).message ?? 'Falha ao copiar.'} Ajuste as permissões no cadastro completo.`)
          return
        }
      }

      onSuccess()
      onClose()
      await alerts.success('Usuário criado', form.copiarPermissoesDe ? 'Cadastro e permissões salvos.' : 'Cadastro salvo. As permissões podem ser definidas no cadastro completo.')
    } catch (e) {
      alerts.error('Não foi possível criar', (e as Error).message ?? 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeaderIcon icon={UserPlus} color="emerald">
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>Só o essencial para liberar o acesso. O restante se completa depois no cadastro completo.</DialogDescription>
        </DialogHeaderIcon>

        <form id="cadastro-rapido" onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="grid grid-cols-12 gap-x-4 gap-y-4">
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Tipo de usuário<RequiredMark /></Label>
              <Controller control={control} name="role" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(USER_ROLE_LABELS_ESCRITORIO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
              {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
            </div>
            <div className="col-span-12 sm:col-span-8 space-y-1.5">
              <Label htmlFor="cr-nome" className="text-[13px] font-semibold">Nome<RequiredMark /></Label>
              <Input id="cr-nome" className="h-9 text-sm" autoFocus {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="col-span-12 sm:col-span-7 space-y-1.5">
              <Label htmlFor="cr-email" className="text-[13px] font-semibold">E-mail<RequiredMark /></Label>
              <Input id="cr-email" type="email" className="h-9 text-sm" autoComplete="off" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="col-span-12 sm:col-span-5 space-y-1.5">
              <Label htmlFor="cr-senha" className="text-[13px] font-semibold">Senha<RequiredMark /></Label>
              <Input id="cr-senha" type="password" className="h-9 text-sm" placeholder="Mínimo 8 caracteres" autoComplete="new-password" {...register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Área{interno && <RequiredMark />}</Label>
              <Controller control={control} name="areaId" render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
              {errors.areaId && <p className="text-xs text-destructive">{errors.areaId.message}</p>}
            </div>
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Cargo{interno && <RequiredMark />}</Label>
              <Controller control={control} name="cargoId" render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {cargos.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
              {errors.cargoId && <p className="text-xs text-destructive">{errors.cargoId.message}</p>}
            </div>
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label htmlFor="cr-admissao" className="text-[13px] font-semibold">Data de admissão{interno && <RequiredMark />}</Label>
              <Input id="cr-admissao" className="h-9 text-sm" placeholder="00/00/0000" inputMode="numeric"
                {...register('dataAdmissao')}
                onChange={e => { e.target.value = masks.data(e.target.value); register('dataAdmissao').onChange(e) }} />
              {errors.dataAdmissao && <p className="text-xs text-destructive">{errors.dataAdmissao.message}</p>}
            </div>

            {/* Colaborador interno entra sempre nos dois — não há o que escolher. */}
            {!interno && <div className="col-span-12 flex flex-wrap gap-x-6 gap-y-2">
              <Controller control={control} name="incluirFerias" render={({ field }) => (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={field.value} onCheckedChange={c => field.onChange(c === true)} />
                  <span className="text-sm">Incluir no controle de férias</span>
                </label>
              )} />
              <Controller control={control} name="exibirComoColaborador" render={({ field }) => (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={field.value} onCheckedChange={c => field.onChange(c === true)} />
                  <span className="text-sm">Exibir no módulo Colaboradores</span>
                </label>
              )} />
            </div>}

            <div className="col-span-12 space-y-1.5 border-t border-border pt-4">
              <Label className="text-[13px] font-semibold">Permissões</Label>
              <Controller control={control} name="copiarPermissoesDe" render={({ field }) => (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <UserCombobox
                      users={usuarios}
                      value={field.value}
                      onSelect={field.onChange}
                      placeholder="Copiar permissões de… (opcional)"
                    />
                  </div>
                  {/* O combobox não tem "limpar" — a escolha é opcional, então desfazer fica aqui. */}
                  {field.value && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange('')}>Não copiar</Button>
                  )}
                </div>
              )} />
              <p className="text-xs text-muted-foreground">
                Copia todas as permissões do usuário escolhido, inclusive as específicas de cada módulo. Sem escolha, o usuário nasce sem acesso a módulos.
              </p>
            </div>
          </DialogBody>
        </form>

        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="link" size="sm" asChild className="px-0 text-muted-foreground">
            <Link href="/usuarios/new">Abrir cadastro completo</Link>
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button type="submit" form="cadastro-rapido" variant="success" size="sm" disabled={salvando}>
              {salvando ? 'Criando…' : 'Criar usuário'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
