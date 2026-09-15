'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HardDrive } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import type { FonteExplorador, Conteudo } from './explorador'

/**
 * A "unidade" do explorador no lado do ESCRITÓRIO: a pasta do cliente no Drive.
 *
 * Eram duas. A outra era o acervo local (`ClienteArquivo`), de quando o
 * escritório publicava arquivos por aqui — e ela parou de fazer sentido quando
 * o portal passou a listar SÓ o Drive: o que fosse publicado ali o cliente não
 * via mais. Manter a unidade na tela do escritório prometia um canal que não
 * chegava a lugar nenhum.
 *
 * Os 51 arquivos que sobraram lá (todos de junho e julho de 2026, nenhum depois
 * disso) continuam no banco e nas rotas — o que saiu foi a unidade da tela, e
 * isso volta com um `git revert` se alguém precisar deles.
 *
 * Separado da página porque o portal do cliente tem a sua, com a mesma forma e
 * rotas diferentes — deixar o adaptador junto da tela obrigaria a duplicar a
 * tela.
 */

type MapaDeAreas = NonNullable<FonteExplorador['areas']>

/**
 * O mapa de pasta → área deste cliente.
 *
 * Carregado UMA vez por cliente e mantido em memória enquanto a tela vive: o
 * explorador consulta o mapa a cada pasta listada, e uma ida ao servidor por
 * consulta faria a área piscar em cada navegação.
 *
 * `'__raiz__'` é a chave da raiz da unidade, onde o explorador usa `null` e o
 * servidor usa o id da pasta do cliente no Drive. A tradução mora aqui porque
 * é o único ponto que conhece os dois lados.
 */
function useMapaDeAreas(clienteId: string, podeConfigurar: boolean): MapaDeAreas | undefined {
  const [dados, setDados] = useState<{
    raizId: string | null
    areas: Array<{ id: string; nome: string }>
    mapa: Map<string, string>
  } | null>(null)

  const carregar = useCallback(async () => {
    try {
      const d = await (trpc as any).gestaoArquivos.driveMapaAreas.query({ clienteId })
      setDados({
        raizId: d.raizId ?? null,
        areas: d.areas ?? [],
        mapa: new Map<string, string>(
          (d.mapa ?? []).map((m: { pastaId: string; areaId: string }) => [
            m.pastaId === d.raizId ? '__raiz__' : m.pastaId,
            m.areaId,
          ]),
        ),
      })
    } catch {
      // Sem mapa a tela continua servindo arquivos — a coluna some, que é
      // melhor do que a listagem inteira falhar por causa dela.
      setDados(null)
    }
  }, [clienteId])

  useEffect(() => { void carregar() }, [carregar])

  return useMemo(() => {
    if (!dados) return undefined
    return {
      opcoes: dados.areas,
      mapa: dados.mapa,
      editavel: podeConfigurar,
      definir: async (pastaId, areaId) => {
        // `null` do explorador é a raiz; o servidor a conhece pelo id do Drive.
        const alvo = pastaId ?? dados.raizId
        if (!alvo) return
        if (areaId) {
          await (trpc as any).gestaoArquivos.driveDefinirAreaDaPasta.mutate({ clienteId, pastaId: alvo, areaId })
        } else {
          await (trpc as any).gestaoArquivos.driveRemoverAreaDaPasta.mutate({ clienteId, pastaId: alvo })
        }
        await carregar()
      },
    }
  }, [dados, podeConfigurar, clienteId, carregar])
}

export function useFontesDoEscritorio(
  clienteId: string,
  podeConfigurar = false,
): FonteExplorador[] {
  const areas = useMapaDeAreas(clienteId, podeConfigurar)

  return useMemo(() => [
    {
      chave: 'drive',
      nome: 'Google Drive',
      icone: HardDrive,
      buscar: async (id): Promise<Conteudo> => {
        const d = await (trpc as any).gestaoArquivos.driveListar.query({ clienteId, subPastaId: id })
        if (!d.vinculada) {
          return {
            pastas: [],
            arquivos: [],
            indisponivel: 'Este cliente ainda não tem pasta do Drive vinculada. O vínculo é feito nas configurações do módulo.',
          }
        }
        return {
          pastas: d.itens.filter((i: any) => i.isPasta).map((i: any) => ({ id: i.id, nome: i.nome })),
          arquivos: d.itens.filter((i: any) => !i.isPasta).map((i: any) => ({
            id: i.id,
            nome: i.nome,
            tamanho: i.tamanho,
            mimeType: null,
            modificadoEm: i.modificadoEm,
            origem: 'DRIVE',
            novo: false,
            link: i.link || null,
            enviadoPor: i.enviadoPor ?? null,
            enviadoEm: i.enviadoEm ?? null,
          })),
        }
      },
      // O arquivo vem pela NOSSA API, não pelo link do Drive: o link só abriria
      // para quem tem a pasta compartilhada no Google.
      selecionar: async a => `${getApiUrl()}/api/gestao-arquivos/drive/${clienteId}/${a.id}`,
      mover: async (itemId, destinoId) => {
        await (trpc as any).gestaoArquivos.driveMover.mutate({ clienteId, itemId, destinoId })
      },
      // Só o Drive rotea aviso: é para onde o cliente envia. Os arquivos do
      // sistema são publicação do escritório para o cliente, o sentido
      // contrário, e não têm a quem avisar lá dentro.
      areas,
    },
  ], [clienteId, areas])
}
