'use client'
import { GraduationCap } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

export default function FaqSegmentoEducacaoPage() {
  return (
    <SegmentoShell
      modulo="Educação (Lucro Presumido)"
      moduloColor="#d946ef"
      icon={GraduationCap}
      titulo="Educação — Lucro Presumido"
      descricao="Templates para escolas, idiomas e instituições educacionais. ISS reduzido, possível imunidade tributária, alta carga de folha (corpo docente)."
      glossario={[
        { termo: 'Imunidade tributária', texto: 'Art. 150 VI "c" CF — instituições educacionais sem fins lucrativos podem ser imunes a IRPJ/CSLL/COFINS. Exige cumprir requisitos do art. 14 CTN.' },
        { termo: 'ISS reduzido', texto: 'Vitória cobra 2% para serviços educacionais (vs 5% padrão). Outros municípios capixabas variam — verificar lei municipal.' },
        { termo: 'Mensalidade', texto: 'Receita principal — geralmente NFS-e individual por aluno/contrato.' },
        { termo: 'Folha alta', texto: 'Educação tem grande proporção de funcionários (professores) — folha pode representar 50%+ do faturamento.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Diagnóstico educacional, avaliação imunidade, configuração.',
          templates: ['Onboarding Educação Presumido'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: 'Coleta mensalidades → ISS reduzido → federais + folha.',
          templates: ['Mensal Educação Presumido', 'Coleta + ISS Educação', 'Federais e Folha Educação'],
        },
        anual: {
          nome: 'Rotina Anual (1×)',
          descricao: 'Encerramento, ECD, ECF, avaliação manutenção da imunidade.',
          templates: ['Anual Educação Presumido', 'Encerramento + ECD + ECF Educação'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Imunidade tributária</strong> — só para entidades sem fins lucrativos cumprindo art. 14 CTN (não distribuir lucros, manter escrituração, etc). Avaliar caso a caso.</li>
          <li><strong>ISS reduzido</strong> — Vitória 2%. Outros municípios variam de 2% a 5%. Códigos LC 116/2003 itens 8.x (educação).</li>
          <li><strong>Folha alta</strong> — corpo docente é geralmente o maior custo. Atenção a regimes mistos (CLT + autônomo via RPA).</li>
          <li><strong>Bolsas e descontos</strong> — devem reduzir receita bruta (não despesa) — afeta base de cálculo de ISS, PIS, COFINS.</li>
          <li><strong>FIES e ProUni</strong> — para faculdades, há repasse governo que entra como receita. Tratamento contábil específico.</li>
        </ul>
      }
      casos={[
        { titulo: 'Escola sem fins lucrativos — manter imunidade', resposta: <>Verificar anualmente cumprimento do art. 14 CTN: não distribui lucros, mantém escrituração contábil, aplica recursos integralmente nos objetivos. Falha em qualquer requisito = perda da imunidade retroativa.</> },
        { titulo: 'Mensalidade com bolsa de 50% — como lançar?', resposta: <>Receita = mensalidade efetivamente recebida (após desconto). Bolsa concedida não é receita nem despesa, é redução de preço. ISS sobre o valor líquido pago pelo aluno.</> },
        { titulo: 'Curso de idiomas com franquias — tributação', resposta: <>Royalties pagos à franqueadora são despesa dedutível. Receita do franqueado é integral (mensalidade do aluno). Verificar contrato de franquia para reter ISS sobre royalties (LC 116 item 17.08).</> },
      ]}
    />
  )
}
