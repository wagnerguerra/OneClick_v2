'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Check, Calendar, User as UserIcon, Flag, Palette } from 'lucide-react'
import {
  Input, Label, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { type ProjetoStatus } from '@saas/types'

interface ProjetoDetalhe {
  id: string
  nome: string
  descricao: string | null
  cor: string
  status: ProjetoStatus
  dataInicio: Date | string | null
  dataPrevisao: Date | string | null
  responsavel: { id: string; name: string; image: string | null } | null
}

interface Props {
  projeto: ProjetoDetalhe
  canWrite: boolean
  onSaved: () => void
}

type Patch = Partial<{
  nome: string
  descricao: string | null
  cor: string
  status: ProjetoStatus
  dataInicio: string | null
  dataPrevisao: string | null
}>

export function ProjetoTabDetalhes({ projeto, canWrite, onSaved }: Props) {
  // Estado local controlado por campo
  const [nome, setNome] = useState(projeto.nome)
  const [descricao, setDescricao] = useState(projeto.descricao ?? '')
  const [cor, setCor] = useState(projeto.cor)
  const [status, setStatus] = useState<ProjetoStatus>(projeto.status)
  const [dataInicio, setDataInicio] = useState(
    projeto.dataInicio ? new Date(projeto.dataInicio).toISOString().slice(0, 10) : '',
  )
  const [dataPrevisao, setDataPrevisao] = useState(
    projeto.dataPrevisao ? new Date(projeto.dataPrevisao).toISOString().slice(0, 10) : '',
  )

  // Sincroniza quando o projeto recarrega (mas não enquanto o user digita)
  const focusedFieldRef = useRef<string | null>(null)
  useEffect(() => {
    if (focusedFieldRef.current === null) {
      setNome(projeto.nome)
      setDescricao(projeto.descricao ?? '')
      descricaoUltimaSalvaRef.current = projeto.descricao ?? ''
      setCor(projeto.cor)
      setStatus(projeto.status)
      setDataInicio(projeto.dataInicio ? new Date(projeto.dataInicio).toISOString().slice(0, 10) : '')
      setDataPrevisao(projeto.dataPrevisao ? new Date(projeto.dataPrevisao).toISOString().slice(0, 10) : '')
    }
  }, [projeto])

  // Save state — "idle" | "saving" | "saved" | "error"
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Debounce pra descrição HTML (RichEditor dispara onChange a cada tecla)
  const descricaoDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const descricaoUltimaSalvaRef = useRef<string>(projeto.descricao ?? '')

  const save = useCallback(async (patch: Patch) => {
    setSaveState('saving')
    try {
      await trpc.projetos.update.mutate({ id: projeto.id, data: patch })
      setSaveState('saved')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaveState('idle'), 1500)
      onSaved()
    } catch (e) {
      setSaveState('error')
      alerts.error('Erro ao salvar: ' + (e as Error).message)
    }
  }, [projeto.id, onSaved])

  // Helpers de onBlur — só salvam se houve mudança
  function blurField(field: string) {
    focusedFieldRef.current = null
  }
  function focusField(field: string) {
    focusedFieldRef.current = field
  }

  function handleBlurNome() {
    blurField('nome')
    const novo = nome.trim()
    if (!novo) {
      // Não permite nome vazio — restaura
      setNome(projeto.nome)
      return
    }
    if (novo !== projeto.nome) save({ nome: novo })
  }

  // Descrição é HTML (RichEditor) — auto-save com debounce de 1.2s
  function handleChangeDescricao(html: string) {
    setDescricao(html)
    focusedFieldRef.current = 'descricao'
    if (descricaoDebounceRef.current) clearTimeout(descricaoDebounceRef.current)
    descricaoDebounceRef.current = setTimeout(() => {
      if (html !== descricaoUltimaSalvaRef.current) {
        descricaoUltimaSalvaRef.current = html
        // Editor vazio gera `<p></p>` — normaliza pra null
        const limpo = html.replace(/<p>\s*<\/p>/g, '').trim()
        save({ descricao: limpo || null })
      }
      focusedFieldRef.current = null
    }, 1200)
  }

  function handleChangeStatus(novo: ProjetoStatus) {
    setStatus(novo)
    if (novo !== projeto.status) save({ status: novo })
  }

  function handleChangeCor(novaCor: string) {
    setCor(novaCor)
    // Cor: salva no onBlur do color picker, não a cada movimento de mouse
  }
  function handleBlurCor() {
    blurField('cor')
    if (cor !== projeto.cor) save({ cor })
  }

  function handleChangeDataInicio(v: string) {
    setDataInicio(v)
    const atual = projeto.dataInicio ? new Date(projeto.dataInicio).toISOString().slice(0, 10) : ''
    if (v !== atual) save({ dataInicio: v || null })
  }

  function handleChangeDataPrevisao(v: string) {
    setDataPrevisao(v)
    const atual = projeto.dataPrevisao ? new Date(projeto.dataPrevisao).toISOString().slice(0, 10) : ''
    if (v !== atual) save({ dataPrevisao: v || null })
  }

  const readonlyClass = !canWrite ? 'pointer-events-none opacity-70' : ''

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Informações</h3>
        <SaveIndicator state={saveState} />
      </div>

      <div className={`p-4 space-y-4 ${readonlyClass}`}>
        {/* Nome (linha cheia) */}
        <FieldRow label="Nome *" icon={null}>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onFocus={() => focusField('nome')}
            onBlur={handleBlurNome}
            className="h-9 text-sm font-medium"
            placeholder="Ex: Módulo Fiscal v2"
          />
        </FieldRow>

        {/* Descrição (HTML via TipTap) — auto-save com debounce */}
        <FieldRow label="Descrição" icon={null}>
          <RichEditor
            value={descricao}
            onChange={handleChangeDescricao}
            placeholder="Objetivo do projeto, escopo, links relevantes..."
          />
        </FieldRow>

        {/* Grid de 4 campos compactos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="Status" icon={<Flag className="h-3 w-3" />}>
            <Select value={status} onValueChange={(v) => handleChangeStatus(v as ProjetoStatus)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NOVO">Novo</SelectItem>
                <SelectItem value="ANDAMENTO">Em andamento</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="CONCLUIDO">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Cor" icon={<Palette className="h-3 w-3" />}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={cor}
                onChange={(e) => handleChangeCor(e.target.value)}
                onFocus={() => focusField('cor')}
                onBlur={handleBlurCor}
                className="h-9 w-16 rounded-md border border-border cursor-pointer"
              />
              <code className="text-[11px] text-muted-foreground font-mono">{cor}</code>
            </div>
          </FieldRow>

          <FieldRow label="Início" icon={<Calendar className="h-3 w-3" />}>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => handleChangeDataInicio(e.target.value)}
              className="h-9 text-sm"
            />
          </FieldRow>

          <FieldRow label="Previsão" icon={<Calendar className="h-3 w-3" />}>
            <Input
              type="date"
              value={dataPrevisao}
              onChange={(e) => handleChangeDataPrevisao(e.target.value)}
              className="h-9 text-sm"
            />
          </FieldRow>

          {/* Responsável — readonly por enquanto (não tem combobox) */}
          <FieldRow label="Responsável" icon={<UserIcon className="h-3 w-3" />}>
            <div className="h-9 flex items-center gap-2 px-3 rounded-md border border-border bg-muted/40">
              {projeto.responsavel ? (
                <>
                  {projeto.responsavel.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={projeto.responsavel.image} alt={projeto.responsavel.name} className="h-5 w-5 rounded-full" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center text-[9px] font-semibold">
                      {projeto.responsavel.name.split(' ').slice(0, 2).map((s) => s[0]).join('')}
                    </div>
                  )}
                  <span className="text-sm">{projeto.responsavel.name}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground italic">Sem responsável</span>
              )}
            </div>
          </FieldRow>
        </div>
      </div>
    </Card>
  )
}

function FieldRow({ label, icon, children }: { label: string; icon: React.ReactNode | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-[13px] font-semibold">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  )
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" /> Salvo
      </span>
    )
  }
  return <span className="text-[11px] text-destructive">Erro ao salvar</span>
}
