'use client'
import { Factory } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

const COR = 'var(--mod-comercial, #fb7185)'

export default function FaqSegmentoIndustriaPage() {
  return (
    <SegmentoShell
      modulo="Indústria / Manufatura (Lucro Real + Bloco K)"
      moduloColor={COR}
      icon={Factory}
      titulo="Indústria / Manufatura — Lucro Real (com Bloco K)"
      descricao="Templates para indústrias com produção e estoque controlado — Bloco K, IPI e ICMS integrado, créditos amplos PIS/COFINS."
      glossario={[
        { termo: 'Bloco K', texto: 'Controle obrigatório de produção e estoque no SPED Fiscal — IN RFB 2.052/2021. Cliente deve fornecer fichas técnicas (BOM).' },
        { termo: 'IPI', texto: 'Imposto sobre Produtos Industrializados — alíquota varia por NCM (TIPI). Apuração mensal, recolhimento via DARF.' },
        { termo: 'TIPI', texto: 'Tabela de Incidência do IPI — Decreto 7.660/2011 atualizado periodicamente.' },
        { termo: 'Compete Industrial-ES', texto: 'Lei 10.567/2016 — benefício fiscal estadual para indústrias instaladas no ES.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Diagnóstico fiscal-industrial, mapeamento NCM/IPI, fichas técnicas, plano de contas industrial.',
          templates: ['Onboarding Indústria LR', 'Setup Tributário Industrial LR', 'Plano de Contas Industrial'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: 'Coleta + relatório de produção → lançamentos com estoque → ICMS/IPI → PIS/COFINS → folha → EFDs (com Bloco K).',
          templates: ['Mensal Indústria LR', 'Coleta e Lançamentos Mensal Indústria', 'Apuração ICMS + IPI Industrial', 'Apuração PIS/COFINS Não-cumulativo Industrial', 'IRPJ/CSLL e Folha Industrial', 'EFD-ICMS/IPI Industrial (com Bloco K)', 'EFD-Contribuições Industrial', 'Conciliação e Balancete Industrial'],
        },
        anual: {
          nome: 'Rotina Anual (1×)',
          descricao: 'Encerramento, ECD, ECF.',
          templates: ['Anual Indústria LR', 'Encerramento Anual Industrial', 'ECD + ECF Industrial'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Bloco K</strong> — obrigatório para indústrias com faturamento &gt; R$ 78 mi (cronograma SEFAZ). Exige fichas técnicas e movimentação produção/consumo.</li>
          <li><strong>IPI</strong> — alíquota por NCM. Indústria recolhe IPI sobre saídas; cliente pode ter créditos sobre matérias-primas.</li>
          <li><strong>Estoques</strong> — 3 níveis: matéria-prima, em elaboração, produtos acabados. Avaliação a custo médio recomendada.</li>
          <li><strong>Créditos PIS/COFINS</strong> — indústrias têm créditos amplos: matéria-prima, energia industrial, depreciação de máquinas.</li>
          <li><strong>EFDs</strong> — bloco K consome muitas horas no fechamento; planejar 2-3 dias úteis a mais que atacadista.</li>
        </ul>
      }
      casos={[
        { titulo: 'Cliente sem ficha técnica para Bloco K', resposta: <>Solicitar imediatamente. Sem BOM (Bill of Materials), Bloco K não pode ser preenchido com precisão. Marque <code className="text-[11px]">[CONFIRMAR CLIENTE]</code> nos passos relacionados até receber.</> },
        { titulo: 'Indústria pequena precisa do Bloco K?', resposta: <>Cronograma SEFAZ define obrigatoriedade por faixa de faturamento. Verificar a cada janeiro se o cliente passou para próxima faixa.</> },
        { titulo: 'Compete Industrial vs Lucro Real estimativa', resposta: <>Compete Industrial reduz ICMS, mas exige cumprimento de termo de acordo. Avalie no setup tributário se compensa frente à complexidade adicional.</> },
      ]}
    />
  )
}
