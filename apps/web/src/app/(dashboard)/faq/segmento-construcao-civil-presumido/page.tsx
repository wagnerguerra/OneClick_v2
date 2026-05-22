'use client'
import { HardHat } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

export default function FaqSegmentoConstrucaoPage() {
  return (
    <SegmentoShell
      modulo="Construção Civil (Lucro Presumido)"
      moduloColor="#f59e0b"
      icon={HardHat}
      titulo="Construção Civil — Lucro Presumido"
      descricao="Templates para construtoras e incorporadoras. Particularidades: presunção 8%, RET, retenção INSS 3,5%, ISS por município de obra."
      glossario={[
        { termo: 'POC', texto: 'Percentage of Completion (NBC TG 17) — método de reconhecimento de receita conforme % de conclusão da obra.' },
        { termo: 'CEI por obra', texto: 'Cadastro Específico do INSS — cada obra tem seu CEI, exigência para folha e retenções específicas.' },
        { termo: 'RET', texto: 'Regime Especial de Tributação (Lei 10.931/2004) — para incorporações imobiliárias. 4% unificado em vez de IRPJ+CSLL+PIS+COFINS.' },
        { termo: 'Retenção INSS 3,5%', texto: 'Lei 9.711/1998 — cessão de mão de obra na construção tem retenção de 3,5% pelo tomador, compensável no INSS patronal.' },
        { termo: 'Presunção 8%', texto: 'Construção civil tem presunção reduzida (8% IRPJ, 12% CSLL) vs serviços normais (32%). Vantagem fiscal significativa.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Diagnóstico construção, RET, CEI por obra, plano de contas POC.',
          templates: ['Onboarding Construção Civil Presumido'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: 'Coleta NFs por obra → ISS por obra → IRPJ/CSLL trimestral → folha por CEI.',
          templates: ['Mensal Construção Civil Presumido', 'Coleta + Lançamentos Mensal Construção', 'ISS por Obra + PIS/COFINS Construção', 'IRPJ/CSLL + Folha + eSocial Construção'],
        },
        anual: {
          nome: 'Rotina Anual (1×)',
          descricao: 'Encerramento, ECD, ECF (com particularidades RET).',
          templates: ['Anual Construção Civil Presumido', 'Encerramento + ECD + ECF Construção'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>POC</strong> — receita reconhecida proporcionalmente ao avanço da obra. Exige medições mensais assinadas.</li>
          <li><strong>RET</strong> — para incorporações, tributação unificada de 4%. Patrimônio de afetação obrigatório por obra.</li>
          <li><strong>ISS por município</strong> — cada obra é tributada no município de prestação. Múltiplas guias por mês se construtora atua em vários municípios.</li>
          <li><strong>Retenção INSS 3,5%</strong> — quando construtora presta serviço a outra empresa (cessão de mão de obra), tomador retém 3,5% e construtora compensa no INSS patronal.</li>
          <li><strong>CEI por obra</strong> — cada obra tem matrícula INSS própria. Folha de operários da obra usa CEI da obra (não da construtora).</li>
        </ul>
      }
      casos={[
        { titulo: 'Cliente vai começar nova incorporação — RET?', resposta: <>Avaliar formalmente. RET reduz tributação para 4% unificado mas exige patrimônio de afetação (registro em cartório) e a opção é irretratável por obra.</> },
        { titulo: 'Obra em múltiplos municípios — como apurar ISS?', resposta: <>Cada município tem alíquota e prazo próprios. Sistema gera guia por município no template <code className="text-[11px]">ISS por Obra + PIS/COFINS Construção</code>. Manter cadastro municipal atualizado.</> },
        { titulo: 'Tomador reteve INSS — como compensar?', resposta: <>Compensação automática no DCTFWeb / GFIP. Construtora desconta a retenção do INSS-patronal devido. Documentar com nota fiscal de retenção do tomador.</> },
      ]}
    />
  )
}
