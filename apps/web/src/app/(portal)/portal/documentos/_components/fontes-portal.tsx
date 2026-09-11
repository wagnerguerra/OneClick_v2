'use client'

import { useMemo } from 'react'
import { FolderOpen, HardDrive } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl, getApiUrl } from '@/lib/api-url'
import type { FonteExplorador, Conteudo } from '@/app/(dashboard)/gestao-arquivos/_components/explorador'

/**
 * As "unidades" do explorador no PORTAL DO CLIENTE.
 *
 * Mesma forma das do escritório, rotas e permissões diferentes: aqui tudo passa
 * por `portalProcedure`, que resolve o vínculo do usuário externo antes do
 * handler. O componente do explorador é o mesmo — o que muda é só o adaptador.
 */
export function useFontesDoPortal(clienteId: string): FonteExplorador[] {
  return useMemo(() => [
    {
      chave: 'documentos',
      nome: 'Meus documentos',
      icone: FolderOpen,
      buscar: async (id): Promise<Conteudo> => {
        const d = await (trpc.portal as any).arquivos.abrirPasta.query({ clienteId, pastaId: id })
        return {
          pastas: (d.pastas ?? []).map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome })),
          arquivos: (d.arquivos ?? []).map((a: any) => ({
            id: a.id,
            nome: a.fileName,
            tamanho: a.fileSize ?? null,
            mimeType: a.mimeType ?? null,
            modificadoEm: a.criadoEm ?? null,
            origem: a.origem ?? null,
            novo: false,
            link: null,
          })),
        }
      },
      selecionar: async a => {
        const r = await (trpc.portal as any).arquivos.abrir.mutate({ clienteId, arquivoId: a.id })
        return resolveAssetUrl(r.fileUrl)
      },
    },
    {
      chave: 'drive',
      nome: 'Google Drive',
      icone: HardDrive,
      buscar: async (id): Promise<Conteudo> => {
        const d = await (trpc.portal as any).arquivos.drive.query({ clienteId, subPastaId: id })
        if (!d.vinculada) {
          return {
            pastas: [],
            arquivos: [],
            // `motivo` explica quando o acesso existe mas o nível não alcança;
            // sem ele, a mensagem genérica diria "não há pasta" para quem na
            // verdade só não tem permissão, o que confunde quem for perguntar.
            indisponivel: d.motivo
              ?? 'O escritório ainda não vinculou uma pasta do Google Drive a esta empresa.',
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
  ], [clienteId])
}
