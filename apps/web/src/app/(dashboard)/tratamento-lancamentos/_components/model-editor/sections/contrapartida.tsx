import { useCallback, useEffect, type ReactNode } from 'react'
import {
  Button, Input, Checkbox,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { Trash2, Plus } from 'lucide-react'
import type { TreatmentDefinition, Direcao } from '@saas/types'
import type { SetDef, CpItemComum } from '../types'
import { HISTORICO_FIXO_HINT, PULAR_LINHA_HINT } from '../types'
import { HelpTip } from '../ui'
import { soDigitos, semSeparador } from '../utils'

/**
 * Tabela compartilhada pelas duas modalidades de contrapartida (por descrição e
 * por palavra-chave). As colunas Conta / Histórico fixo / Direção / Pular — e
 * toda a lógica de validação (borda vermelha), disabled e line-through quando
 * "pular" está marcado — vivem SÓ aqui. O que muda entre os modos é a 1ª coluna
 * (`primeiraColuna`) e a existência de Adicionar/Remover (`onAdd`/`onRemove`).
 * Assim, alterar um comportamento dessas colunas passa a ser 1 edição, não 2.
 */
function ContrapartidaTabela<T extends CpItemComum>({
  itens, onUpdate, onRemove, onAdd, addLabel, dcByDescricao, primeiraColuna,
}: {
  itens: T[]
  onUpdate: (i: number, patch: Partial<T>) => void
  onRemove?: (i: number) => void
  onAdd?: () => void
  addLabel?: string
  dcByDescricao: boolean
  primeiraColuna: { header: string; className?: string; cellClassName?: string; render: (it: T, i: number) => ReactNode }
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-[2px] border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={primeiraColuna.className}>{primeiraColuna.header}</TableHead>
              <TableHead className="w-[130px]">Conta</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Histórico fixo (opcional)
                  <HelpTip text={HISTORICO_FIXO_HINT} />
                </span>
              </TableHead>
              {dcByDescricao && <TableHead className="w-[120px]">Direção</TableHead>}
              <TableHead className="w-[90px]">
                <span className="inline-flex items-center gap-1">Pular <HelpTip text={PULAR_LINHA_HINT} /></span>
              </TableHead>
              {onRemove && <TableHead className="w-[52px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((it, i) => {
              const pular = !!it.pular
              return (
              <TableRow key={i}>
                <TableCell className={primeiraColuna.cellClassName}>{primeiraColuna.render(it, i)}</TableCell>
                <TableCell><Input disabled={pular} className={cn('h-8 text-xs bg-card', !pular && !it.conta.trim() && 'border-r-2 border-r-destructive', pular && 'line-through placeholder:line-through')} placeholder="Conta" inputMode="numeric" value={it.conta} onChange={(e) => onUpdate(i, { conta: soDigitos(e.target.value) } as Partial<T>)} /></TableCell>
                <TableCell><Input disabled={pular} className={cn('h-8 text-xs bg-card', pular && 'line-through placeholder:line-through')} placeholder="Histórico fixo (opcional)" value={it.historicoFixo ?? ''} onChange={(e) => onUpdate(i, { historicoFixo: semSeparador(e.target.value) } as Partial<T>)} /></TableCell>
                {dcByDescricao && (
                  <TableCell>
                    <Select value={it.direcao ?? ''} onValueChange={(v) => onUpdate(i, { direcao: v as Direcao } as Partial<T>)} disabled={pular}>
                      <SelectTrigger className={cn('h-8 text-xs bg-card', !pular && !it.direcao && 'border-r-2 border-r-destructive', pular && 'line-through')}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="DEBITO">Débito</SelectItem><SelectItem value="CREDITO">Crédito</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell><div className="flex justify-center"><Checkbox checked={pular} onCheckedChange={(v) => onUpdate(i, { pular: !!v } as Partial<T>)} /></div></TableCell>
                {onRemove && <TableCell><Button variant="soft-destructive" size="icon-sm" onClick={() => onRemove(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>}
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {onAdd && (
        <Button variant="soft" size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> {addLabel ?? 'Adicionar'}</Button>
      )}
    </div>
  )
}

export function ContrapartidaPalavraChave({ def, setDef, dcByDescricao }: { def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean }) {
  const itens = def.contrapartida.palavraChave

  const update = useCallback((i: number, patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const next = d.contrapartida.palavraChave.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, palavraChave: next } }
    })
  }, [setDef])
  const add = useCallback(() => {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: [...d.contrapartida.palavraChave, { palavraChave: '', conta: '', historicoFixo: '' }] } }))
  }, [setDef])
  const remove = useCallback((i: number) => {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: d.contrapartida.palavraChave.filter((_, idx) => idx !== i) } }))
  }, [setDef])

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Adicione palavras-chave abaixo, a serem detectadas nas descrições dos lançamentos.</p>
      <ContrapartidaTabela
        itens={itens} onUpdate={update} onRemove={remove} onAdd={add} addLabel="Adicionar palavra-chave"
        dcByDescricao={dcByDescricao}
        primeiraColuna={{
          header: 'Palavra-chave', className: 'min-w-[160px]',
          render: (it, i) => (
            <Input className="h-8 text-xs bg-card" placeholder="Palavra-chave" value={it.palavraChave} onChange={(e) => update(i, { palavraChave: e.target.value })} />
          ),
        }}
      />
    </div>
  )
}

export function ContrapartidaDescricao({ def, setDef, dcByDescricao, descricaoColuna, getDistinct }: {
  def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean; descricaoColuna: string; getDistinct: (c: string) => string[]
}) {
  const itens = def.contrapartida.descricao

  // Reconstrói a lista a partir das descrições distintas da COLUNA atual,
  // reaproveitando conta/histórico/direção já preenchidos para descrições iguais.
  // Trocar a coluna de descrição SUBSTITUI os itens (não acumula com a anterior).
  useEffect(() => {
    const distinct = getDistinct(descricaoColuna)
    if (!distinct.length) return
    setDef((d) => {
      const existing = new Map(d.contrapartida.descricao.map((it) => [it.descricao, it]))
      const novos = distinct.map((desc) => existing.get(desc) ?? { descricao: desc, conta: '', historicoFixo: '' })
      return { ...d, contrapartida: { ...d.contrapartida, descricao: novos } }
    })
  }, [descricaoColuna, getDistinct, setDef])

  const update = useCallback((i: number, patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const next = d.contrapartida.descricao.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, descricao: next } }
    })
  }, [setDef])

  if (!itens.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Cada descrição distinta recebe uma conta de contrapartida.</p>
      <ContrapartidaTabela
        itens={itens} onUpdate={update} dcByDescricao={dcByDescricao}
        primeiraColuna={{
          header: 'Descrição', cellClassName: 'text-sm max-w-[280px] truncate',
          render: (it) => (
            <span className={cn(it.pular && 'line-through text-muted-foreground')} title={it.descricao}>{it.descricao}</span>
          ),
        }}
      />
    </div>
  )
}
