// Seed: catalogo de clausulas para contratos de servicos contabeis.
// Baseado nos modelos da Central Contabil (D:\PROJETOS\OneClick_Code\materiais\modelos):
//   - "MODELO DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTABEIS 2024 (PRESUMIDO E REAL COM IE)"
//
// Cria:
//   1) ~50 Clausulas (codigo + versao 1, publicada)
//   2) Hierarquia (1.1 filho de 1, 2.1 filho de 2, etc.)
//   3) Um ContratoTemplate "Presumido/Real COM IE" com todas as clausulas vinculadas
//      em ordem (versao flutuante para sempre usar a publicada mais recente)
//
// Executar:
//   pnpm --filter @saas/db exec tsx prisma/seed-clausulas-contrato.ts
//
// Idempotente: rerodando atualiza textos existentes (busca por codigo).

import { PrismaClient } from '../src/generated/client'

const prisma = new PrismaClient()

type SeedClausula = {
  codigo: string
  titulo: string
  conteudo: string
  categoria: string
  parentCodigo?: string  // referencia outro codigo (resolvido em runtime)
  ordem: number
}

const html = (s: string) => s.trim()

const clausulas: SeedClausula[] = [
  // ════════════════════════════════════════════════════════════
  // CLAUSULA 1ª — DO OBJETO DO CONTRATO
  // ════════════════════════════════════════════════════════════
  {
    codigo: 'OBJ',
    titulo: 'Do Objeto do Contrato',
    categoria: 'OBJETO',
    ordem: 0,
    conteudo: html(`
      <p>É objeto do presente contrato a prestação de serviços nas seguintes áreas conforme descrições abaixo:</p>
      <ul>
        <li>Área Contábil</li>
        <li>Área Fiscal-Tributária (Federal e Estadual do E.S/Municipal local)</li>
        <li>Área Trabalhista</li>
        <li>Área de Legalização</li>
        <li>Consultoria nas Áreas Contratadas</li>
      </ul>
    `),
  },
  {
    codigo: 'OBJ.CONTABIL',
    titulo: '1.1 — Área Contábil',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ',
    ordem: 1,
    conteudo: html(`
      <ul>
        <li>Classificação e Escrituração da Contabilidade de acordo com as Normas e Princípios Contábeis vigentes;</li>
        <li>Apuração de Balancetes;</li>
        <li>Elaboração do Balanço Anual com Demonstrativo de Resultados e demais Demonstrações;</li>
        <li>SPED contábil ou ECD (Escrituração Contábil Digital);</li>
        <li>ECF (Escrituração Contábil e Fiscal) quando obrigatório.</li>
      </ul>
    `),
  },
  {
    codigo: 'OBJ.FISCAL',
    titulo: '1.2 — Área Fiscal-Tributária',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ',
    ordem: 2,
    conteudo: html(`
      <ul>
        <li>Orientação e consultoria na aplicação dos dispositivos legais vigentes, sejam Federais, Estadual ES e Municipal ES;</li>
        <li>Elaboração das guias de informação e de recolhimento dos tributos devidos pela CONTRATANTE de acordo com suas características e forma de tributação, compreendendo: IRPJ, CSLL, COFINS, PIS, ISSQN, ICMS, IPI e SIMPLES;</li>
        <li>Elaboração e entrega da Declaração de Débitos e Créditos Tributários Federais (DCTF);</li>
        <li>Apuração, elaboração e entrega do ISS — Imposto sobre Serviços, de acordo com suas características e forma de tributação (caso incida);</li>
        <li>Transmissão mensal dos arquivos SPED Contribuições, SPED Fiscal, sempre com base nos arquivos magnéticos enviados pela CONTRATANTE (gerados pelo sistema de gestão da empresa contratante); devendo a CONTRATADA submeter o arquivo a um software de auditoria eletrônica e reportar à empresa as inconsistências e necessidades de ajustes com base na Lei antes da entrega aos órgãos competentes;</li>
        <li>Transmissão mensal dos eventos da EFD-Reinf.</li>
      </ul>
      <p><strong>Observações:</strong></p>
      <ul>
        <li>Não incluso a geração dos arquivos SPEDs (Fiscal e Contribuições) por parte da Contratada. O arquivo deverá ser gerado no sistema de gestão da Contratante.</li>
        <li>Os serviços fiscais contemplados neste contrato serão prestados com base na Legislação do Estado do ES e seus municípios.</li>
        <li>Não está incluída no rol de serviços contratados a geração e impressão do livro fiscal "Registro e Controle da Produção e do Estoque" (Blocos K e H), que ficarão a cargo da CONTRATANTE.</li>
      </ul>
    `),
  },
  {
    codigo: 'OBJ.TRABALHISTA',
    titulo: '1.3 — Área Trabalhista e Previdenciária',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ',
    ordem: 3,
    conteudo: html(`
      <ul>
        <li>Acompanhar a aplicação dos preceitos da Consolidação das Leis do Trabalho, bem como aqueles atinentes à Previdência Social, PIS, FGTS e outros aplicáveis às relações de emprego mantidas pela CONTRATANTE;</li>
        <li>Manutenção dos registros de empregados e demais serviços pertinentes à folha de pagamento de acordo com as informações recebidas pela CONTRATANTE;</li>
        <li>Emissão de relatório de rendimentos anuais para Declaração de Imposto de Renda;</li>
        <li>Elaboração da folha de pagamento dos empregados e pró-labore, com a emissão das respectivas guias dos encargos sociais e tributos afins a serem recolhidas pela CONTRATANTE;</li>
        <li>Elaboração dos documentos relativos às rotinas de admissão, férias, afastamentos e demissão de funcionários;</li>
        <li>Envio da DCTFWeb mensal e anual;</li>
        <li>Envio do FGTS Digital;</li>
        <li>Atendimento ao E-SOCIAL, dependendo das informações em tempo hábil, em boa ordem e formalizada por e-mail ou sistema de registro utilizado pela Contratada.</li>
      </ul>
    `),
  },
  {
    codigo: 'OBJ.LEGALIZACAO',
    titulo: '1.4 — Área de Legalização',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ',
    ordem: 4,
    conteudo: html(`
      <ul>
        <li>Renovação anual do Alvará de Localização e Funcionamento.</li>
        <li>Renovação do Alvará de Bombeiro.</li>
      </ul>
      <p><strong>Observações:</strong></p>
      <ul>
        <li>Não incluso alvarás específicos tais como Sanitário, Ambiental, Acessibilidade, Publicidade, bem como licenças especiais de operações.</li>
        <li>Não incluso o acompanhamento dos vencimentos de Alvarás e Corpo de Bombeiros, ficando a critério e responsabilidade do contratante a entrega dos documentos necessários à sua emissão ou renovação.</li>
      </ul>
    `),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 2ª — DAS RESPONSABILIDADES DA CONTRATADA
  // ════════════════════════════════════════════════════════════
  { codigo: 'RESP', titulo: 'Das Responsabilidades da Contratada', categoria: 'RESPONSABILIDADES', ordem: 100, conteudo: '<p>Cabem à CONTRATADA as seguintes responsabilidades:</p>' },
  {
    codigo: 'RESP.1', titulo: '2.1', categoria: 'RESPONSABILIDADES', parentCodigo: 'RESP', ordem: 101,
    conteudo: html(`<p>A CONTRATADA desempenhará os serviços contratados com todo zelo e diligência, observada a legislação vigente, resguardando os interesses da CONTRATANTE, sem prejuízo da dignidade e independência profissionais, sujeitando-se, ainda, às normas do Código de Ética Profissional do Contabilista, aprovado pela Resolução N° 803/96 do Conselho Federal de Contabilidade.</p>`),
  },
  {
    codigo: 'RESP.2', titulo: '2.2', categoria: 'RESPONSABILIDADES', parentCodigo: 'RESP', ordem: 102,
    conteudo: html(`<p>Obriga-se a CONTRATADA a fornecer à CONTRATANTE e dentro do horário normal de expediente (sendo de segunda à quinta das 08:00 às 18:00hs e às sextas das 08:00 às 17:00hs), todas as informações relativas ao andamento dos serviços ora contratados.</p>`),
  },
  {
    codigo: 'RESP.3', titulo: '2.3', categoria: 'RESPONSABILIDADES', parentCodigo: 'RESP', ordem: 103,
    conteudo: html(`<p>A CONTRATADA assume total responsabilidade pelo pagamento de todos os encargos trabalhistas e ônus tributários referentes a seus funcionários, não se caracterizando qualquer vínculo empregatício entre os empregados da CONTRATADA e a CONTRATANTE.</p>`),
  },
  {
    codigo: 'RESP.4', titulo: '2.4', categoria: 'RESPONSABILIDADES', parentCodigo: 'RESP', ordem: 104,
    conteudo: html(`<p>A CONTRATADA assume a responsabilidade por eventuais multas fiscais decorrentes de imperfeições ou atrasos nos serviços ora contratados, excetuando-se os ocasionados por força maior ou caso fortuito, assim definidos em lei, depois de esgotados os procedimentos de defesa administrativa, sempre observado o disposto nos itens 2.5 e 2.6.</p>`),
  },
  {
    codigo: 'RESP.5', titulo: '2.5', categoria: 'RESPONSABILIDADES', parentCodigo: 'RESP', ordem: 105,
    conteudo: html(`<p>A CONTRATADA não assume nenhuma responsabilidade pelas consequências de informações, declarações ou documentação inidôneas ou incompletas que lhe forem apresentadas, bem como por omissões próprias da CONTRATANTE, atrasos desta, ou decorrentes do desrespeito à orientação prestada ou às normas e formalidades legais.</p>`),
  },
  {
    codigo: 'RESP.6', titulo: '2.6', categoria: 'RESPONSABILIDADES', parentCodigo: 'RESP', ordem: 106,
    conteudo: html(`<p>Não se incluem na responsabilidade assumida pela CONTRATADA os juros e a correção monetária de qualquer natureza, visto que não se tratam de multas ou imposições fiscais, mas sim recomposição e remuneração do valor não recolhido.</p>`),
  },
  {
    codigo: 'RESP.7', titulo: '2.7', categoria: 'RESPONSABILIDADES', parentCodigo: 'RESP', ordem: 107,
    conteudo: html(`<p>Responsabilizar-se-á a CONTRATADA por todos os documentos a ela entregues pela CONTRATANTE, sempre por meio digital, enquanto permanecerem sob sua guarda para a consecução dos serviços pactuados, respondendo pelo seu mau uso, vazamento de dados, salvo comprovado caso fortuito ou força maior, mesmo se tal ocorrer por ação ou omissão de seus prepostos ou quaisquer pessoas que a eles tenham acesso.</p>`),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 3ª — DAS OBRIGAÇÕES DA CONTRATANTE
  // ════════════════════════════════════════════════════════════
  { codigo: 'OBR', titulo: 'Das Obrigações da Contratante', categoria: 'OBRIGACOES', ordem: 200, conteudo: '<p>Cabem à CONTRATANTE as seguintes obrigações:</p>' },
  {
    codigo: 'OBR.1', titulo: '3.1', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 201,
    conteudo: html(`<p>Obriga-se a CONTRATANTE a fornecer à CONTRATADA todos os dados, documentos, informações, arquivos e relatórios que se façam necessários ao bom desempenho dos serviços ora contratados, em tempo hábil, de forma completa e em boa ordem, não cabendo à CONTRATADA nenhuma responsabilidade caso recebidos intempestivamente e/ou incompletos.</p>`),
  },
  {
    codigo: 'OBR.2', titulo: '3.2', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 202,
    conteudo: html(`<p>A CONTRATANTE deverá obrigatoriamente adquirir o Certificado Digital (E-CNPJ) Modelo A1. Caberá à Contratante a manutenção da validade do Certificado e da Procuração Eletrônica. O procedimento de renovação e emissão de Certificado Digital ou Procuração Eletrônica ficará sob responsabilidade do contratante, sendo estes essenciais para o andamento dos serviços pactuados no Contrato.</p>`),
  },
  {
    codigo: 'OBR.3', titulo: '3.3', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 203,
    conteudo: html(`<p>A CONTRATADA não se responsabiliza e pode se recusar a prestar o serviço contratado quando não disponibilizados adequadamente e nos prazos fixados o suporte documental pertinente, cuja responsabilidade por sua elaboração, guarda e disponibilização é da CONTRATANTE. Também é dever da contratante a guarda dos arquivos digitais tais como nota fiscal eletrônica entre outros.</p>`),
  },
  {
    codigo: 'OBR.4', titulo: '3.4', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 204,
    conteudo: html(`<p>O descumprimento dos prazos para envio dos documentos e informações exime a CONTRATADA de qualquer responsabilidade pela não prestação ou prestação deficitária dos serviços contratados, bem como importa o repasse à CONTRATANTE de todos os custos de mão de obra ocasionados em razão do atraso.</p>`),
  },
  {
    codigo: 'OBR.5', titulo: '3.5', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 205,
    conteudo: html(`<p>As multas decorrentes da entrega fora do prazo legal ou que forem decorrentes da não execução das orientações por parte da CONTRATANTE serão de responsabilidade desta.</p>`),
  },
  {
    codigo: 'OBR.6', titulo: '3.6', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 206,
    conteudo: html(`<p>A CONTRATANTE informa que é de sua responsabilidade a administração dos controles internos adotados pela empresa e que os mesmos estão adequados ao tipo de atividade e volume de transações; que não realizará nenhum tipo de operação que possa ser considerada ilegal frente à legislação vigente; que os documentos encaminhados à contabilidade estão revestidos de total idoneidade; que as informações geradas no sistema de gestão e controles internos da empresa são realizadas com documentação adequada, sendo de inteira responsabilidade do CONTRATANTE todo o conteúdo do banco de dados e arquivos gerados; que não tem conhecimento de fatos que possam afetar as demonstrações contábeis ou ainda que afetem a continuidade de operações da empresa.</p>`),
  },
  {
    codigo: 'OBR.7', titulo: '3.7', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 207,
    conteudo: html(`<p>A CONTRATANTE responsabilizar-se-á por enviar à CONTRATADA o contrato de locação, caso este exista, não sendo a CONTRATADA penalizada em nenhum momento caso não haja o envio ou a comunicação da existência do mesmo.</p>`),
  },
  {
    codigo: 'OBR.8', titulo: '3.8', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 208,
    conteudo: html(`<p>A CONTRATANTE é exclusivamente responsável pelo manuseio, emissão e uso da Nota Fiscal, não cabendo responsabilidade à CONTRATADA de realizar serviços referentes à emissão, estrutura do layout e treinamentos fiscais para emissão de notas.</p>`),
  },
  {
    codigo: 'OBR.9', titulo: '3.9', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 209,
    conteudo: html(`<p>É obrigação da CONTRATANTE informar de forma expressa à CONTRATADA qualquer situação referente à participação da empresa ou dos sócios em outra sociedade, independentemente de sua modalidade, permitindo assim que a CONTRATADA faça a verificação do enquadramento tributário adequado e o realize conforme legislação em vigor. O mesmo deverá ocorrer nos casos de Alterações Contratuais e Societárias realizadas por terceiros.</p>`),
  },
  {
    codigo: 'OBR.10', titulo: '3.10', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 210,
    conteudo: html(`<p>A CONTRATANTE deverá manter os alvarás em dia e em local visível.</p>`),
  },
  {
    codigo: 'OBR.11', titulo: '3.11', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 211,
    conteudo: html(`<p>É de responsabilidade do proprietário do imóvel a emissão do habite-se e IPTU.</p>`),
  },
  {
    codigo: 'OBR.12', titulo: '3.12', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 212,
    conteudo: html(`<p>Toda nova rotina ou situação que ocorrer na empresa e que envolva a parte contábil, fiscal e trabalhista deverá ser informada à CONTRATADA imediatamente (ex.: abertura de novas contas bancárias, mudança de endereço, a quem pagará o aluguel, novos empréstimos, doações, contrato de comodato, compra e venda de bens da empresa, etc.).</p>`),
  },
  {
    codigo: 'OBR.13', titulo: '3.13', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 213,
    conteudo: html(`<p>É de responsabilidade da CONTRATANTE solicitar certidões negativas de débitos com no mínimo 07 dias úteis de antecedência.</p>`),
  },
  {
    codigo: 'OBR.14', titulo: '3.14', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 214,
    conteudo: html(`<p>A CONTRATANTE tem ciência da Lei 9.613/98, alterada pela Lei 12.683/2012, especificamente no que trata da lavagem de dinheiro, regulamentada pela Resolução CFC n.º 1.445/13 do Conselho Federal de Contabilidade e, portanto, deverá agir de forma ética e honesta e em conformidade com as leis vigentes.</p>`),
  },
  {
    codigo: 'OBR.15', titulo: '3.15', categoria: 'OBRIGACOES', parentCodigo: 'OBR', ordem: 215,
    conteudo: html(`<p>Conforme Resolução CFC nº 987/03, a CONTRATANTE deverá disponibilizar anualmente à CONTRATADA a Carta de Responsabilidade da Administração para o encerramento do exercício contábil. A assinatura das demonstrações contábeis fica vinculada à entrega da Carta de Responsabilidade da Administração.</p>`),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 4ª — DAS DISPOSIÇÕES GERAIS
  // ════════════════════════════════════════════════════════════
  { codigo: 'DISP', titulo: 'Das Disposições Gerais', categoria: 'DISPOSICOES', ordem: 300, conteudo: '<p>Aplicam-se ao presente contrato as seguintes disposições gerais:</p>' },
  {
    codigo: 'DISP.1', titulo: '4.1 — Obrigação de meio', categoria: 'DISPOSICOES', parentCodigo: 'DISP', ordem: 301,
    conteudo: html(`<p>A CONTRATADA promete envidar todos os esforços e conhecimentos técnicos contábeis e tributários para a execução do objeto do presente contrato; todavia, fica estabelecido entre os signatários deste instrumento que a modalidade de obrigação é a de meio. Em caso de eventuais autuações por parte das administrações tributárias (União, Estado e Município) em face da CONTRATANTE, a assunção de responsabilidades pela CONTRATADA, a saber, multas e juros, deverá ser provada em circunstância que indique a ocorrência irrefutável de negligência, imprudência e imperícia.</p>`),
  },
  {
    codigo: 'DISP.4.8', titulo: '4.8 — Prazo de adequação a mudanças legais', categoria: 'DISPOSICOES', parentCodigo: 'DISP', ordem: 308,
    conteudo: html(`<p>A CONTRATADA terá um prazo mínimo de 07 (sete) dias úteis para estudar, avaliar e posicionar seu entendimento à CONTRATANTE no que tange a adventos ou mudanças de Leis, Decretos, Instruções Normativas, Atos Normativos e Regulamentos.</p>`),
  },
  {
    codigo: 'DISP.4.9', titulo: '4.9 — Cláusula de não aliciamento', categoria: 'DISPOSICOES', parentCodigo: 'DISP', ordem: 309,
    conteudo: html(`<p>Fica pactuado entre as partes que caso um funcionário da CENTRAL CONTÁBIL seja contratado pelo Cliente ou qualquer empresa diretamente relacionada (mesmo grupo empresarial, por exemplo), durante a vigência do contrato e até 12 meses após o encerramento do mesmo, o cliente pagará à CONTRATADA, a título de indenização, a importância correspondente a 10 (dez) vezes o valor dos honorários.</p>`),
  },
  {
    codigo: 'DISP.4.13', titulo: '4.13 — Atos constitutivos prévios', categoria: 'DISPOSICOES', parentCodigo: 'DISP', ordem: 313,
    conteudo: html(`<p>Os atos constitutivos da CONTRATANTE já foram realizados por outro profissional, o que desonera qualquer tipo de reclamação e responsabilidade contra a CONTRATADA da forma jurídica e tributária optada na ocasião.</p>`),
  },
  {
    codigo: 'DISP.4.14', titulo: '4.14 — Declarações exteriores', categoria: 'DISPOSICOES', parentCodigo: 'DISP', ordem: 314,
    conteudo: html(`<p>As declarações de recebimento ou remessa para o exterior, como SISCOSERV, DME (Declaração de operações liquidadas com moeda em espécie), COAF e outras declarações de atividades financeiras vinculadas ao Ministério da Fazenda, assim como licenças ambientais, Marinha, registro em entidades de classe ou ligadas ao ramo profissional da atividade exercida, não são de responsabilidade da CONTRATADA.</p>`),
  },
  {
    codigo: 'DISP.4.15', titulo: '4.15 — Tributos aduaneiros', categoria: 'DISPOSICOES', parentCodigo: 'DISP', ordem: 315,
    conteudo: html(`<p>A apuração de tributos e impostos aduaneiros (encargos de importação) caberá ao profissional competente (despachante aduaneiro) a ser contratado pela empresa.</p>`),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 5ª — ENVIO DA DOCUMENTAÇÃO
  // ════════════════════════════════════════════════════════════
  {
    codigo: 'DOC', titulo: 'Envio da Documentação para Prestação dos Serviços Contratados',
    categoria: 'DOCUMENTACAO', ordem: 400,
    conteudo: html(`<p>Caberá à CONTRATANTE o envio dos documentos, informações, dados, arquivos e relatórios, conforme especificado nos itens abaixo (por área contratada), respeitando ambas as partes os prazos estipulados.</p>`),
  },
  {
    codigo: 'DOC.CONTABIL', titulo: '5.1 — Área Contábil', categoria: 'DOCUMENTACAO', parentCodigo: 'DOC', ordem: 401,
    conteudo: html(`
      <p><strong>Envio de documentos Financeiros/Contábeis da Empresa para a Central:</strong></p>
      <p>Deverão ser entregues à CONTRATADA, MENSALMENTE, até o 5º dia útil do mês subsequente: Relatórios de bancos, Extrato Bancário de todas as Contas Correntes, Extrato Conta Aplicação, Extratos de Cartão de Crédito, Comprovante de Depósito Bancário, Boletos Bancários, Borderôs, Contratos de Câmbio e Mútuo, Documentos de Importação, Contratos de seguros, Empréstimos e financiamentos, e quaisquer outros relatórios gerados pelo sistema da CONTRATANTE.</p>
      <p><strong>Prazos de entrega dos Balancetes:</strong></p>
      <ul>
        <li>Lucro Real Mensal: até o último dia útil do mês subsequente;</li>
        <li>Lucro Real Trimestral: até o último dia útil do mês subsequente ao fechamento do trimestre;</li>
        <li>Lucro Presumido e Simples Nacional: conforme acordado entre as partes;</li>
        <li>Balanço Anual: até 90 (noventa) dias após a entrega de todos os documentos necessários.</li>
      </ul>
    `),
  },
  {
    codigo: 'DOC.FISCAL', titulo: '5.2 — Área Fiscal', categoria: 'DOCUMENTACAO', parentCodigo: 'DOC', ordem: 402,
    conteudo: html(`
      <p><strong>Envio de documentos Fiscais da Empresa para a Central:</strong></p>
      <p>Deverão ser entregues à CONTRATADA MENSALMENTE, até o 5º dia útil do mês subsequente: SPED FISCAL gerado e validado pelo sistema de gestão da CONTRATANTE; SINTEGRA (empresa Simples Nacional) e/ou XML das notas fiscais de entrada e de saída; SPED CONTRIBUIÇÕES; relatórios/boletins de caixas; Notas Fiscais de Entrada e Saída ou XML; Nota Fiscal de Energia Elétrica; Telefone; Conhecimentos de Transportes; NF de Serviço Prestados/Tomados; Redução Z (ECF) se houver venda a varejo.</p>
      <p><strong>Prazo de entrega de apuração/guias:</strong> até no máximo 02 dias úteis antes do vencimento.</p>
    `),
  },
  {
    codigo: 'DOC.TRABALHISTA', titulo: '5.3 — Área Trabalhista (Departamento Pessoal)', categoria: 'DOCUMENTACAO', parentCodigo: 'DOC', ordem: 403,
    conteudo: html(`
      <p><strong>Envio de Documentos de DP da Empresa para a Central:</strong></p>
      <p>As informações para fechamento de folha de pagamento deverão ser enviadas MENSALMENTE (com data a combinar com o cliente). As rescisões, férias e outras solicitações deverão ser solicitadas com antecedência.</p>
      <ul>
        <li>Ficha admissional (modelo enviado pela Central Contábil) devidamente preenchida;</li>
        <li>Admissões e Demissões: solicitadas tempestivamente, no momento em que ocorre (eSocial);</li>
        <li>Informações para Fechamento da Folha: planilhas/arquivos de importação com nome dos empregados e variáveis;</li>
        <li>Documentos para Salário Família: certidões de nascimento e cartão de vacina;</li>
        <li>Dependentes de IRPF: certidão de nascimento e CPF.</li>
      </ul>
      <p><strong>Prazos da Central para a Empresa:</strong></p>
      <ul>
        <li>Folha de pagamento (contracheques, encargos): 03 dias úteis;</li>
        <li>Rescisões, férias: até no máximo 02 dias úteis antes do vencimento.</li>
      </ul>
    `),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 6ª — LGPD
  // ════════════════════════════════════════════════════════════
  { codigo: 'LGPD', titulo: 'Da Privacidade de Dados', categoria: 'PRIVACIDADE', ordem: 500, conteudo: '<p>As Partes obrigam-se a atuar em conformidade com a Lei 13.709/2018 (LGPD).</p>' },
  {
    codigo: 'LGPD.1', titulo: '6.1 — Conformidade legal', categoria: 'PRIVACIDADE', parentCodigo: 'LGPD', ordem: 501,
    conteudo: html(`<p>As PARTES, por si e por seus colaboradores, obrigam-se a atuar no presente Contrato em conformidade com a Legislação vigente sobre Proteção de Dados Pessoais e as determinações de órgãos reguladores/fiscalizadores sobre a matéria, em especial a Lei 13.709/2018.</p>`),
  },
  {
    codigo: 'LGPD.2', titulo: '6.2 — Manuseio de dados pela CONTRATADA', categoria: 'PRIVACIDADE', parentCodigo: 'LGPD', ordem: 502,
    conteudo: html(`
      <p>No manuseio dos dados, a CONTRATADA deverá:</p>
      <ul>
        <li>Tratar os dados pessoais a que tiver acesso apenas de acordo com as instruções do CONTRATANTE;</li>
        <li>Manter e utilizar medidas de segurança administrativas, técnicas e físicas apropriadas e suficientes para proteger a confidencialidade e integridade de todos os dados pessoais;</li>
        <li>Acessar os dados dentro de seu escopo e na medida abrangida por sua permissão;</li>
        <li>Garantir a confidencialidade dos dados processados, assegurando que todos os colaboradores assinaram Contrato com Cláusula de Confidencialidade;</li>
        <li>Manter quaisquer Dados Pessoais estritamente confidenciais e não os utilizar para outros fins.</li>
      </ul>
    `),
  },
  {
    codigo: 'LGPD.5', titulo: '6.5 — Notificação de incidentes', categoria: 'PRIVACIDADE', parentCodigo: 'LGPD', ordem: 505,
    conteudo: html(`<p>A CONTRATADA deverá notificar o CONTRATANTE em até 48 (quarenta e oito) horas a respeito de: (a) qualquer não cumprimento (ainda que suspeito) das disposições legais relativas à proteção de Dados Pessoais; (b) qualquer outra violação de segurança no âmbito das atividades e responsabilidades da CONTRATADA.</p>`),
  },
  {
    codigo: 'LGPD.6', titulo: '6.6 — Política de Privacidade', categoria: 'PRIVACIDADE', parentCodigo: 'LGPD', ordem: 506,
    conteudo: html(`<p>Fica o CONTRATANTE ciente de que demais informações sobre o tratamento de dados pessoais pela CONTRATADA estão inseridas de forma clara e transparente em sua Política de Privacidade, disponível em: <a href="https://central-rnc.com.br/politica-de-privacidade/">https://central-rnc.com.br/politica-de-privacidade/</a>. Ao assinar este Contrato, o CONTRATANTE declara ciência e aceite dos termos da Política de Privacidade da CONTRATADA.</p>`),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 7ª — HONORÁRIOS
  // ════════════════════════════════════════════════════════════
  { codigo: 'HON', titulo: 'Dos Honorários e da Condição de Pagamento', categoria: 'HONORARIOS', ordem: 600, conteudo: '<p>A remuneração da CONTRATADA pelos serviços prestados é regulada pelos itens abaixo:</p>' },
  {
    codigo: 'HON.1', titulo: '7.1 — Valor dos honorários', categoria: 'HONORARIOS', parentCodigo: 'HON', ordem: 601,
    conteudo: html(`<p>Com base no Quadro de Parâmetros Técnicos Operacionais constante no ANEXO I do presente Contrato, pela prestação dos serviços ofertados, de acordo com a qualidade e responsabilidade técnica exigida e em função do volume de documentos e/ou horas estimadas de trabalho na(s) área(s) contratada(s), ficam estipulados os <strong>honorários mensais no valor de {{honorario.valor}}</strong>.</p>`),
  },
  {
    codigo: 'HON.2', titulo: '7.2 — Vencimento e cobrança', categoria: 'HONORARIOS', parentCodigo: 'HON', ordem: 602,
    conteudo: html(`<p>Os Honorários terão vencimento no <strong>{{honorario.dia_vencimento}}</strong> e serão cobrados através de <strong>{{honorario.forma_pagamento}}</strong>, entregue com pelo menos dois dias de antecedência do vencimento.</p>`),
  },
  {
    codigo: 'HON.4', titulo: '7.4 — Reajuste por mudança de regime ou volume', categoria: 'HONORARIOS', parentCodigo: 'HON', ordem: 604,
    conteudo: html(`
      <p>Os Honorários deverão sofrer reajuste sempre que ocorrer uma ou mais das seguintes condições:</p>
      <ul>
        <li>Volume médio trimestral superior aos parâmetros mencionados na proporção de 10% (dez por cento);</li>
        <li>Alteração do regime de Tributação. Os aumentos serão incididos sobre o último valor de honorário no regime antigo, e passarão a vigorar a partir do 1º dia do mês em que houve a alteração:
          <ul>
            <li>De Simples para Lucro Presumido ou Arbitrado: 25%;</li>
            <li>De Simples/Presumido/Arbitrado para Lucro Real: 35%.</li>
          </ul>
        </li>
        <li>Aumento do volume de trabalho, alterações nos processos, RH e tecnologia;</li>
        <li>Necessidade de entrega em prazos mais curtos;</li>
        <li>Aumento da responsabilidade técnica ou complexidade;</li>
        <li>Mudanças na Legislação que acarretem sobrecarga;</li>
        <li>Expansão dos negócios (novas filiais, inscrições);</li>
        <li>Aquisição de novas responsabilidades e/ou serviços;</li>
        <li>Mudança de Atividade Econômica ou forma jurídica;</li>
        <li>Aumento de horas técnicas no atendimento;</li>
        <li>A qualquer tempo por consenso das partes.</li>
      </ul>
    `),
  },
  {
    codigo: 'HON.6', titulo: '7.6 — Atraso no pagamento', categoria: 'HONORARIOS', parentCodigo: 'HON', ordem: 606,
    conteudo: html(`<p>Os honorários pagos após a data avençada (atraso nos pagamentos) acarretarão à CONTRATANTE o acréscimo de multa de 2% (dois por cento), sem prejuízo de juros moratórios de 1% (um por cento) ao mês ou fração, acrescidos de correção monetária equivalente ao IGPM, e autorizam a paralisação da execução dos serviços pela CONTRATADA até que eventuais débitos sejam liquidados.</p>`),
  },
  {
    codigo: 'HON.7', titulo: '7.7 — Reajuste anual automático', categoria: 'HONORARIOS', parentCodigo: 'HON', ordem: 607,
    conteudo: html(`
      <p>Em razão da reposição da inflação e correções monetárias, fica estabelecido para fins de reequilíbrio econômico-financeiro do contrato:</p>
      <ul>
        <li>Os honorários serão reajustados anualmente <strong>no mês de janeiro</strong> de cada ano com base no índice do percentual de Salário Mínimo, independente do período da contratação;</li>
        <li>Para empresas que não tiverem 01 (um) ano de contratação no período do reajuste, o valor cobrado será proporcional;</li>
        <li>O reajuste refere-se exclusivamente à reposição de inflação, excluindo-se aquele decorrente de aumento do volume dos serviços.</li>
      </ul>
    `),
  },
  {
    codigo: 'HON.8', titulo: '7.8 — Honorário extra de encerramento anual', categoria: 'HONORARIOS', parentCodigo: 'HON', ordem: 608,
    conteudo: html(`<p>Anualmente, no <strong>1º (primeiro) dia de dezembro</strong>, será cobrado um honorário extra, do mesmo valor do honorário do mês de novembro, para cobrir as despesas de encerramento e princípio do exercício anual: encerramento das demonstrações contábeis anuais, DRE, DEFIS, ECD, ECF, RAIS, DIRF, DOT e demais obrigações acessórias anuais. <em>Mesmo no caso de início do contrato em qualquer mês do exercício, a parcela adicional de encerramento será devida integralmente.</em></p>`),
  },
  {
    codigo: 'HON.10', titulo: '7.10 — Reembolso de despesas', categoria: 'HONORARIOS', parentCodigo: 'HON', ordem: 610,
    conteudo: html(`<p>A CONTRATANTE reembolsará a CONTRATADA o custo de todas as despesas e/ou taxas pagas em seu nome utilizadas na execução dos serviços ora ajustados, tais como: taxas de expediente, autenticações, reconhecimento de firmas, emolumentos e taxas exigidos em órgãos públicos, hospedagem, despesas com deslocamento (combustível, táxi, transportes, uber, passagens), despesas com postagens e Sedex, acompanhado dos respectivos comprovantes de desembolso.</p>`),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 8ª — SERVIÇOS EXTRAORDINÁRIOS
  // ════════════════════════════════════════════════════════════
  {
    codigo: 'EXT', titulo: 'Dos Serviços Extraordinários', categoria: 'EXTRAORDINARIOS', ordem: 700,
    conteudo: html(`<p>São considerados serviços extras todo e qualquer atendimento/trabalho que não tenha caráter de previsibilidade e que aconteçam por demanda específica e/ou que necessitem acompanhamento emergencial ou especial e/ou que requeiram horas extras de trabalho (maior complexidade, tempo extra, peculiaridades), e para tanto necessitam aprovação prévia de proposta para sua execução. Exemplos por área:</p>`),
  },
  {
    codigo: 'EXT.LEGAL', titulo: 'Serviços Extraordinários — Área de Legalização', categoria: 'EXTRAORDINARIOS', parentCodigo: 'EXT', ordem: 701,
    conteudo: html(`
      <ul>
        <li>Abertura de empresas e filiais; Alteração contratual; Baixas e extinções; Reativações; Fusão, Aquisições e Incorporações; Transformações Societárias;</li>
        <li>Consultas Prévias de Viabilidade; Pesquisa de Nome Empresarial; DBEs; alterações no CNPJ;</li>
        <li>Inscrições de contribuintes substitutos; Cadastros em órgãos (SERASA, CREA, IBAMA, IBGE, SICAF, conselhos regionais);</li>
        <li>Certidões negativas de débitos de quaisquer naturezas;</li>
        <li>Publicações em Jornais; Licenciamento ambiental; ANVISA;</li>
        <li>Alvarás extras e Licenças Operacionais; FUNDAP; Alfândega/Radar;</li>
        <li>Confecção de documentos administrativos e comerciais;</li>
        <li>Serviços do MEI; Retrabalhos.</li>
      </ul>
    `),
  },
  {
    codigo: 'EXT.TRAB', titulo: 'Serviços Extraordinários — Área Trabalhista', categoria: 'EXTRAORDINARIOS', parentCodigo: 'EXT', ordem: 702,
    conteudo: html(`
      <ul>
        <li>DP extraordinário por contratação/demissão de "parada de usina"; Folha de empregada doméstica;</li>
        <li>Recálculo de GPS; Revisão de Folha;</li>
        <li>Acompanhamento para homologação de rescisão (no E.S);</li>
        <li>Acompanhamento e assessoria em Processos de Autuações e Fiscalizações (cobrada hora técnica);</li>
        <li>Folhas, decores, RPAs e Informes de pessoas físicas que não sejam contratados (domésticos de sócios, produtor rural, representantes).</li>
      </ul>
    `),
  },
  {
    codigo: 'EXT.FISCAL', titulo: 'Serviços Extraordinários — Área Fiscal-Tributária', categoria: 'EXTRAORDINARIOS', parentCodigo: 'EXT', ordem: 703,
    conteudo: html(`
      <ul>
        <li>Atendimento e separação de documentos para Auditorias, Jurídico, Perícia, Due Diligence;</li>
        <li>Refazimento de serviços contábeis/fiscais; Retificações de obrigações acessórias;</li>
        <li>Solicitação e renovação de benefícios fiscais (Compete, Invest, Substituto Tributário, Regimes Especiais);</li>
        <li>Perícias, Auditorias, Restituições de Créditos, PERDCOMP;</li>
        <li>Planejamento tributário, Estudos e Consultas Tributárias;</li>
        <li>Pareceres Técnicos; Defesas administrativas; Parcelamentos;</li>
        <li>ITR; Lucro imobiliário;</li>
        <li>Atendimento a fiscalizações (cobrada hora técnica);</li>
        <li>Bloco K e H; Classificação NCM; GIA-ST e inscrições em outros Estados;</li>
        <li>Acompanhamento de DTE e e-CAC para processos jurídicos.</li>
      </ul>
    `),
  },
  {
    codigo: 'EXT.PF', titulo: 'Serviços Extraordinários — Pessoa Física', categoria: 'EXTRAORDINARIOS', parentCodigo: 'EXT', ordem: 704,
    conteudo: html(`
      <ul>
        <li>Confecção de Declaração de Imposto de Renda PF (orçamento pré-aprovado conforme tipo, demanda e complexidade);</li>
        <li>Folhas, decores, RPAs e Informes de pessoas físicas que não sejam contratados da empresa.</li>
      </ul>
    `),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 9ª — VIGÊNCIA E RESCISÃO
  // ════════════════════════════════════════════════════════════
  { codigo: 'VIG', titulo: 'Da Vigência e Rescisão', categoria: 'VIGENCIA', ordem: 800, conteudo: '<p>A vigência e as condições de rescisão deste contrato seguem as regras abaixo:</p>' },
  {
    codigo: 'VIG.1', titulo: '9.1 — Início e prazo', categoria: 'VIGENCIA', parentCodigo: 'VIG', ordem: 801,
    conteudo: html(`<p>O Contrato começa a vigorar em <strong>{{contrato.data_inicio}}</strong>, e seu prazo será por tempo indeterminado, perdurando enquanto for de conveniência de ambas as partes.</p>`),
  },
  {
    codigo: 'VIG.2', titulo: '9.2 — Rescisão e pré-aviso', categoria: 'VIGENCIA', parentCodigo: 'VIG', ordem: 802,
    conteudo: html(`<p>O Contrato poderá ser rescindido a qualquer tempo, sem qualquer multa ou ônus rescisório, devendo a parte interessada comunicar à outra com prazo mínimo de <strong>30 (trinta) dias</strong> para empresas que pagam até 02 salários mínimos vigentes e <strong>60 (sessenta) dias</strong> para empresas que pagam acima de 02 salários mínimos vigentes. O comunicado deverá ocorrer mediante ofício por escrito, assinado pelo sócio administrador da CONTRATANTE.</p>`),
  },
  {
    codigo: 'VIG.4', titulo: '9.4 — Multa por rescisão sumária', categoria: 'VIGENCIA', parentCodigo: 'VIG', ordem: 804,
    conteudo: html(`<p>Caso a Contratante não formalize o pedido de rescisão e efetuá-la de forma sumária, desrespeitando o pré-aviso previsto, ficará obrigada ao pagamento de multa compensatória no valor de <strong>3 (três) parcelas mensais</strong> dos honorários vigentes à época.</p>`),
  },
  {
    codigo: 'VIG.10', titulo: '9.10 — Suspensão por inadimplência', categoria: 'VIGENCIA', parentCodigo: 'VIG', ordem: 810,
    conteudo: html(`<p>A falta de pagamento de qualquer parcela de honorários faculta à CONTRATADA suspender imediatamente a execução dos serviços, bem como considerar rescindido o presente, independentemente de notificação judicial ou extrajudicial.</p>`),
  },

  // ════════════════════════════════════════════════════════════
  // CLAUSULA 10ª — FORO
  // ════════════════════════════════════════════════════════════
  {
    codigo: 'FORO', titulo: 'Do Foro', categoria: 'FORO', ordem: 900,
    conteudo: html(`<p>Fica eleito o Foro da Cidade de Serra-ES, com expressa renúncia a qualquer outro, por mais privilegiado que seja, para dirimir as questões oriundas da interpretação e execução do presente contrato. E, por estarem justos e contratados, assinam o presente, em 02 (duas) vias de igual teor e para um só efeito, na presença de 02 (duas) testemunhas instrumentárias.</p>`),
  },
]

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  console.log(`\nCadastrando ${clausulas.length} clausulas...\n`)

  // Mapa codigo → id (resolve hierarquia depois de criar todos)
  const codigoToId = new Map<string, string>()
  let criadas = 0
  let atualizadas = 0

  // Passo 1: criar/atualizar todas as clausulas (sem parentId ainda)
  for (const c of clausulas) {
    const existing = await (prisma as any).clausula.findFirst({
      where: { codigo: c.codigo, empresaId: null },
      orderBy: { versao: 'desc' },
    })

    let saved: any
    if (existing) {
      // Atualiza a versão existente (assume desenvolvimento — pra produção, use updateClausula que cria nova versão)
      saved = await (prisma as any).clausula.update({
        where: { id: existing.id },
        data: {
          titulo: c.titulo,
          conteudo: c.conteudo,
          categoria: c.categoria,
          ordem: c.ordem,
          publicada: true,
          publicadaEm: existing.publicadaEm || new Date(),
        },
      })
      atualizadas++
    } else {
      saved = await (prisma as any).clausula.create({
        data: {
          codigo: c.codigo,
          versao: 1,
          titulo: c.titulo,
          conteudo: c.conteudo,
          categoria: c.categoria,
          ordem: c.ordem,
          publicada: true,
          publicadaEm: new Date(),
          empresaId: null,
        },
      })
      criadas++
    }
    codigoToId.set(c.codigo, saved.id)
    console.log(`  ${existing ? 'UPD' : 'NEW'}  [${c.categoria.padEnd(18)}] ${c.codigo.padEnd(18)} ${c.titulo.slice(0, 60)}`)
  }

  // Passo 2: aplicar parentId
  console.log(`\nAplicando hierarquia...`)
  for (const c of clausulas) {
    if (!c.parentCodigo) continue
    const id = codigoToId.get(c.codigo)
    const parentId = codigoToId.get(c.parentCodigo)
    if (!id || !parentId) continue
    await (prisma as any).clausula.update({ where: { id }, data: { parentId } })
  }

  // Passo 3: criar/atualizar template "Presumido/Real COM IE"
  console.log(`\nCriando template de contrato...`)
  const nomeTemplate = 'Presumido/Real COM IE — Padrão Central'
  let template = await (prisma as any).contratoTemplate.findFirst({ where: { nome: nomeTemplate, empresaId: null } })
  if (template) {
    template = await (prisma as any).contratoTemplate.update({
      where: { id: template.id },
      data: { ativo: true, descricao: 'Modelo padrão para clientes em Lucro Presumido ou Real com Inscrição Estadual.' },
    })
    console.log(`  UPD  Template "${nomeTemplate}"`)
  } else {
    template = await (prisma as any).contratoTemplate.create({
      data: {
        nome: nomeTemplate,
        descricao: 'Modelo padrão para clientes em Lucro Presumido ou Real com Inscrição Estadual.',
        regimeTributario: 'PRESUMIDO',
        temIE: true,
        comMovimento: true,
        ativo: true,
        empresaId: null,
      },
    })
    console.log(`  NEW  Template "${nomeTemplate}"`)
  }

  // Passo 4: vincular todas as cláusulas ao template (ordenadas)
  await (prisma as any).contratoTemplateClausula.deleteMany({ where: { templateId: template.id } })
  const sortedByOrder = [...clausulas].sort((a, b) => a.ordem - b.ordem)
  let i = 0
  for (const c of sortedByOrder) {
    const clausulaId = codigoToId.get(c.codigo)!
    await (prisma as any).contratoTemplateClausula.create({
      data: {
        templateId: template.id,
        clausulaId,
        ordem: i++,
        fixaVersao: false,  // sempre puxa a versão publicada mais recente do código
      },
    })
  }

  console.log(`\n✓ Resumo:`)
  console.log(`  ${criadas} cláusulas criadas, ${atualizadas} atualizadas (${clausulas.length} total)`)
  console.log(`  Template "${nomeTemplate}" com ${clausulas.length} cláusulas vinculadas`)
  console.log(`\nPronto! Acesse /clausulas e /contrato-templates para ver o resultado.\n`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
