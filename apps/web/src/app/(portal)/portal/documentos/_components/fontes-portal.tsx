'use client'

import { useMemo } from 'react'
import { HardDrive } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import type { FonteExplorador, Conteudo } from '@/app/(dashboard)/gestao-arquivos/_components/explorador'

/**
 * A "unidade" do explorador no PORTAL DO CLIENTE: a pasta dele no Google Drive.
 *
 * Uma só, de propósito. O acervo local (`cliente_arquivos`) saiu da vista do
 * cliente: com o Drive como destino dos envios, manter as duas origens lado a
 * lado deixaria o cliente escolhendo entre dois lugares para a mesma coisa — e
 * a metade que o escritório não usa apareceria sempre vazia.
 *
 * O que o escritório publica pelo módulo interno continua existindo e continua
 * chegando ao cliente; o que mudou é onde os bytes ficam.
 */
export function useFontesDoPortal(clienteId: string, podeEditar: boolean): FonteExplorador[] {
  return useMemo(() => [
    {
      chave: 'drive',
      nome: 'Meus arquivos',
      icone: HardDrive,
      permiteExcluir: podeEditar,
      buscar: async (id): Promise<Conteudo> => {
        const d = await (trpc.portal as any).arquivos.drive.query({ clienteId, subPastaId: id })
        if (!d.vinculada) {
          return {
            pastas: [],
            arquivos: [],
            // `motivo` explica quando o acesso existe mas a permissão não
            // alcança; sem ele, a mensagem genérica diria "não há pasta" para
            // quem na verdade só não foi autorizado, o que confunde quem for
            // perguntar ao escritório.
            indisponivel: d.motivo
              ?? 'O escritório ainda não vinculou uma pasta de arquivos a esta empresa.',
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
            link: null,
          })),
        }
      },
      // Pela NOSSA API: o cliente não precisa de conta Google, e o acesso morre
      // junto com o vínculo no cadastro.
      selecionar: async a => `${getApiUrl()}/api/portal/drive/${clienteId}/${a.id}`,
    },
  ], [clienteId, podeEditar])
}
