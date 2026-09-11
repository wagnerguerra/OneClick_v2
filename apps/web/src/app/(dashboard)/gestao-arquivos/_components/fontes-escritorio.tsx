'use client'

import { useMemo } from 'react'
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

/** Só faz sentido buscar URL do que a pré-visualização consegue exibir. */
function previsualizavel(a: ArquivoItem): boolean {
  const t = tipoDoArquivo(a.nome, a.mimeType)
  return t === 'imagem' || t === 'pdf' || t === 'texto'
}

export function useFontesDoEscritorio(clienteId: string, podeExcluir: boolean): FonteExplorador[] {
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
          })),
        }
      },
      // O arquivo vem pela NOSSA API, não pelo link do Drive: o link só abriria
      // para quem tem a pasta compartilhada no Google.
      selecionar: async a => `${getApiUrl()}/api/gestao-arquivos/drive/${clienteId}/${a.id}`,
    },
  ], [clienteId, podeExcluir])
}

export { previsualizavel }
