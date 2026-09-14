'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Server, HardDrive } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl, getApiUrl } from '@/lib/api-url'
import type { FonteExplorador, Conteudo, ArquivoItem } from './explorador'
import { tipoDoArquivo } from './explorador'

/**
 * As duas "unidades" do explorador no lado do ESCRITÓRIO.
 *
 * Separado da página porque o portal do cliente tem as suas, com as mesmas
 * formas e rotas diferentes — deixar os adaptadores junto da tela obrigaria a
 * duplicar a tela.
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

/** Só faz sentido buscar URL do que a pré-visualização consegue exibir. */
function previsualizavel(a: ArquivoItem): boolean {
  const t = tipoDoArquivo(a.nome, a.mimeType)
  // `codigo` (xml, json) e texto para efeito de previa — ver explorador.
  return t === 'imagem' || t === 'pdf' || t === 'texto' || t === 'codigo'
}

export function useFontesDoEscritorio(
  clienteId: string,
  podeExcluir: boolean,
  podeConfigurar = false,
): FonteExplorador[] {
  const areas = useMapaDeAreas(clienteId, podeConfigurar)

  return useMemo(() => [
    {
      chave: 'local',
      nome: 'Arquivos do sistema',
      icone: Server,
      permiteExcluir: podeExcluir,
      buscar: async (id): Promise<Conteudo> => {
        const d = await (trpc as any).gestaoArquivos.listar.query({ clienteId, pastaId: id })
        return {
          pastas: d.pastas.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome })),
          arquivos: d.arquivos.map((a: any) => ({
            id: a.id,
            nome: a.fileName,
            tamanho: a.fileSize,
            mimeType: a.mimeType,
            modificadoEm: a.criadoEm,
            origem: a.origem,
            novo: Boolean(a.novo),
            link: null,
            enviadoPor: a.enviadoPor ?? null,
            enviadoEm: a.criadoEm ?? null,
          })),
        }
      },
      // `abrir` grava o visto e a trilha, e devolve a URL. Chamado mesmo quando
      // o arquivo não é previsualizável: a URL alimenta o botão "Abrir", e o
      // registro de que a pessoa acessou vale igual.
      selecionar: async a => {
        const r = await (trpc as any).gestaoArquivos.abrir.mutate({ arquivoId: a.id })
        return resolveAssetUrl(r.url)
      },
    },
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
  ], [clienteId, podeExcluir, areas])
}

export { previsualizavel }
