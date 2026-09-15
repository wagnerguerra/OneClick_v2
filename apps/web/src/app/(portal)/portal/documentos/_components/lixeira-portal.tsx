'use client'

import { useCallback, useEffect, useState } from 'react'
import { Folder, FileText, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

/**
 * A lixeira do cliente.
 *
 * Existe porque a mensagem de exclusão prometia algo que o sistema não
 * entregava: o arquivo ia para a lixeira do Google Drive da conta do
 * ESCRITÓRIO, onde nem o cliente nem o escritório conseguiam alcançá-lo. A
 * única forma de restaurar era alguém entrar no Gmail; passados 30 dias, o
 * Google apagava sozinho.
 *
 * A lixeira do Google é uma só, da conta inteira, misturando todos os
 * clientes. O recorte que torna esta tela possível vem de o Drive manter os
 * pais do item excluído — dá para perguntar "o que foi jogado fora de dentro
 * da pasta deste cliente".
 */

interface ItemNaLixeira {
  id: string
  nome: string
  isPasta: boolean
  tamanho: number
  excluidoEm: string
  caminho: string
}

function tamanhoLegivel(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Quantos dias faltam para o Google apagar sozinho. */
function diasRestantes(excluidoEm: string): number | null {
  if (!excluidoEm) return null
  const saiuEm = new Date(excluidoEm)
  if (Number.isNaN(saiuEm.getTime())) return null
  const limite = new Date(saiuEm.getTime() + 30 * 86_400_000)
  return Math.max(0, Math.ceil((limite.getTime() - Date.now()) / 86_400_000))
}

export function LixeiraDoPortal({
  clienteId, altura, onRestaurado, onErro,
}: {
  clienteId: string
  altura: string
  onRestaurado: (nome: string) => void
  onErro: (msg: string) => void
}) {
  const [itens, setItens] = useState<ItemNaLixeira[]>([])
  const [carregando, setCarregando] = useState(true)
  const [restaurando, setRestaurando] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setCarregando(true)
    ;(trpc.portal as any).arquivos.driveLixeira.query({ clienteId })
      .then((d: ItemNaLixeira[]) => setItens(d))
      .catch((e: unknown) => {
        setItens([])
        onErro(e instanceof Error ? e.message : 'Não foi possível abrir a lixeira.')
      })
      .finally(() => setCarregando(false))
  }, [clienteId, onErro])

  useEffect(() => { carregar() }, [carregar])

  async function restaurar(item: ItemNaLixeira) {
    setRestaurando(item.id)
    try {
      await (trpc.portal as any).arquivos.driveRestaurar.mutate({ clienteId, itemId: item.id })
      onRestaurado(item.nome)
      setItens(l => l.filter(x => x.id !== item.id))
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Não foi possível restaurar.')
    } finally {
      setRestaurando(null)
    }
  }

  return (
    <div className={`anim-entrar flex flex-col overflow-hidden rounded-xl border border-[#e6ebf2] bg-white dark:border-[#1b2739] dark:bg-[#0e1726] ${altura}`}>
      <div className="flex items-center gap-2 border-b border-[#e6ebf2] px-4 py-3 dark:border-[#1b2739]">
        <Trash2 className="h-4 w-4 shrink-0 text-slate-500" />
        <p className="min-w-0 flex-1 text-[13px] text-slate-600 dark:text-slate-400">
          Arquivos excluídos ficam aqui por <strong>30 dias</strong> e depois são apagados
          automaticamente. Restaurar devolve o item à pasta de onde saiu.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto nice-scrollbar">
        {carregando && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}

        {!carregando && itens.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center gap-1.5 text-center">
            <Trash2 className="h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="text-[13px] text-slate-600 dark:text-slate-400">A lixeira está vazia.</p>
          </div>
        )}

        {!carregando && itens.map(i => {
          const dias = diasRestantes(i.excluidoEm)
          return (
            <div
              key={i.id}
              className="flex items-center gap-3 border-b border-[#eef2f7] px-4 py-2.5 last:border-b-0 dark:border-[#16233a]"
            >
              {i.isPasta
                ? <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                : <FileText className="h-4 w-4 shrink-0 text-slate-400" />}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-slate-900 dark:text-slate-100">{i.nome}</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  estava em {i.caminho}
                  {!i.isPasta && ` · ${tamanhoLegivel(i.tamanho)}`}
                  {/* O prazo é o que decide se dá para deixar para depois. */}
                  {dias !== null && (
                    <span className={dias <= 5 ? ' font-semibold text-[#c2510f] dark:text-[#e09a6a]' : ''}>
                      {' · '}
                      {dias === 0 ? 'some hoje' : `some em ${dias} dia(s)`}
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => restaurar(i)}
                disabled={restaurando !== null}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#1a6dff] px-3 py-1.5 text-[12px] font-semibold text-[#1a6dff] hover:bg-[#eaf1ff] disabled:opacity-60 dark:hover:bg-[#16233a]"
              >
                {restaurando === i.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5" />}
                Restaurar
              </button>
            </div>
          )
        })}
      </div>

      <p className="border-t border-[#e6ebf2] px-4 py-2.5 text-[11px] text-slate-500 dark:border-[#1b2739] dark:text-slate-400">
        Para apagar um arquivo em definitivo antes dos 30 dias, fale com o seu escritório
        contábil.
      </p>
    </div>
  )
}
