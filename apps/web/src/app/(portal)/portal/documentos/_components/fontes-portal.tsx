'use client'

import { useMemo } from 'react'
import { HardDrive } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { enviarComProgresso } from '@/lib/enviar-com-progresso'
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
export function useFontesDoPortal(
  clienteId: string,
  // As três permissões viajam juntas porque decidem coisas diferentes, e
  // amarrar uma na outra foi exatamente o erro que fez a exclusão sumir da
  // tela mesmo concedida: `permiteExcluir` estava lendo `podeEditar`.
  perms: { podeEditar: boolean; podeExcluir: boolean },
): FonteExplorador[] {
  const { podeEditar, podeExcluir } = perms
  return useMemo(() => [
    {
      chave: 'drive',
      nome: 'Meus arquivos',
      icone: HardDrive,
      permiteExcluir: podeExcluir,
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
            enviadoPor: i.enviadoPor ?? null,
            enviadoEm: i.enviadoEm ?? null,
          })),
        }
      },
      // Pela NOSSA API: o cliente não precisa de conta Google, e o acesso morre
      // junto com o vínculo no cadastro.
      selecionar: async a => `${getApiUrl()}/api/portal/drive/${clienteId}/${a.id}`,
      // Só quem pode editar reorganiza e envia. Sem as funções, o arrastar nem
      // começa e a área não se oferece como destino — melhor do que deixar
      // arrastar e recusar no fim.
      ...(podeEditar
        ? {
            mover: async (itemId: string, destinoId: string | null) => {
              await (trpc.portal as any).arquivos.driveMover.mutate({ clienteId, itemId, destinoId })
            },
            enviar: async (
              file: File,
              pastaId: string | null,
              onProgresso: (pct: number) => void,
            ) => {
              // O upload até o nosso servidor é o trecho longo e é o que a
              // barra acompanha. O empurrão para o Drive vem depois e é rápido
              // — os 100% só aparecem quando o arquivo está LÁ, não quando
              // chegou aqui. Barra cheia com arquivo ainda a caminho é mentira.
              const { url } = await enviarComProgresso(file, onProgresso)

              await (trpc.portal as any).arquivos.driveEnviar.mutate({
                clienteId,
                fileName: file.name,
                fileUrl: url,
                pastaId,
                mimeType: file.type || null,
              })
              onProgresso(100)
            },
          }
        : {}),
    },
  ], [clienteId, podeEditar, podeExcluir])
}
