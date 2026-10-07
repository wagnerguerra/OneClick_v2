import type { ReactNode } from 'react'

/**
 * Moldura de documento impresso com rodapé fixo em toda página.
 *
 * As impressões (proposta, oportunidade do CRM, resumo do dia da agenda) põem o
 * rodapé com `position: fixed` no `@media print`, que o navegador desenha no pé
 * de CADA folha. O problema é reservar o espaço dele: um `padding-bottom` no
 * container só existe uma vez, no fim do documento — nas páginas do meio o
 * texto corria por baixo do rodapé e o fundo branco dele engolia a última linha
 * (#HLP0407: "da Central Contábil" sumiu da proposta #4802).
 *
 * A saída é o `<tfoot>`: o navegador repete o rodapé da tabela em toda página
 * impressa (Chrome, Edge e Firefox). Um bloco vazio da altura do rodapé fixo,
 * ali dentro, reserva o espaço folha a folha e o texto quebra antes dele. Na
 * tela o `<tfoot>` some e a moldura é neutra.
 *
 * O rodapé fixo fica FORA da moldura, como irmão seguinte; `footerSpace` é a
 * altura que ele ocupa no papel, com folga.
 */
export function PrintFrame({ footerSpace, children }: { footerSpace: number; children: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .print-frame {
          width: 100%;
          /* fixed: conteúdo largo (tabela de itens, palavra longa) não estica a moldura */
          table-layout: fixed;
          border-collapse: collapse;
          border-spacing: 0;
        }
        .print-frame > tbody > tr > td,
        .print-frame > tfoot > tr > td {
          padding: 0;
          border: 0;
          vertical-align: top;
        }
        .print-frame > tfoot { display: none; }
        @media print {
          .print-frame > tfoot { display: table-footer-group; }
        }
      ` }} />
      <table className="print-frame" role="presentation">
        <tbody>
          <tr>
            <td>{children}</td>
          </tr>
        </tbody>
        <tfoot aria-hidden>
          <tr>
            <td><div style={{ height: footerSpace }} /></td>
          </tr>
        </tfoot>
      </table>
    </>
  )
}
