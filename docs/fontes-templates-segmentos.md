# Fontes para Templates de Segmento

> Base canônica que alimenta os seeds `seed-segmento-*.ts`. Consolidação de obrigações fiscais brasileiras vigentes em **2026** baseada em legislação federal, estadual (ES) e municipal.
>
> ⚠️ **Validação anual obrigatória**: prazos e exigências mudam por instrução normativa. Confira em janeiro de cada ano antes de aplicar templates.
>
> **Última revisão**: 2026-05-09

## Como usar este documento

Cada seção lista obrigações com **prazo legal estabelecido pela norma**. Os seeds devem citar a fonte primária no comentário do passo, ex:

```ts
// Fonte: IN RFB 2.005/2021, art. 4º — DCTFWeb dia 15 do mês seguinte ao fato gerador
{ nome: 'Transmitir DCTFWeb da competência', slaHoras: 16 }
```

---

## 1. Calendário Federal — Mensal

| Obrigação | Prazo | Regime que se aplica | Norma de referência |
|-----------|-------|----------------------|---------------------|
| **eSocial** S-1200/S-1210/S-1280 | Dia **15** do mês seguinte | Todos com folha (PJ + MEI com empregado) | Decreto 8.373/2014 + IN RFB |
| **DCTFWeb** | Dia **15** do mês seguinte (em conjunto com eSocial) | Lucro Real, Presumido, Simples — todos com débito federal | IN RFB 2.005/2021 |
| **DARF FGTS** (via eSocial) | Dia **20** do mês seguinte (FGTS Digital) | Empregadores | Lei 8.036/1990 + Portaria MTP 3.207/2022 |
| **DAE** (DARF previdenciário simplificado) | Dia **20** do mês seguinte | MEI / doméstico | Resolução CGSN 140/2018 |
| **EFD-Contribuições** | Até dia **10** do **2º mês subsequente** | Lucro Real e Presumido (PIS/COFINS) | IN RFB 1.252/2012 |
| **EFD-ICMS/IPI (SPED Fiscal)** | Varia por UF (ES: dia **15** mês seguinte) | Contribuintes ICMS/IPI (atacadistas, indústrias, varejo grande) | Convênio ICMS 143/2006 |
| **DARF IRPJ/CSLL** (estimativa mensal) | Último dia útil do **mês seguinte** | Lucro Real anual com estimativa mensal | Lei 9.430/1996 |
| **DARF PIS/COFINS** | Dia **25** do mês seguinte | Lucro Real (não-cumulativo) e Presumido (cumulativo) | Lei 10.637/2002 + 10.833/2003 |
| **DARF IRRF** | Dia **20** do mês seguinte (varia por código de receita) | Quem efetua retenção | RIR/2018 |
| **DAS** (Simples Nacional) | Dia **20** do mês seguinte | Simples Nacional | LC 123/2006 |
| **DAS-MEI** | Dia **20** do mês seguinte | MEI | Resolução CGSN |

## 2. Calendário Federal — Anual

| Obrigação | Prazo | Aplicação | Norma |
|-----------|-------|-----------|-------|
| **ECD** (Escrituração Contábil Digital) | Último dia útil de **junho** (ano seguinte) | PJ com escrituração contábil — Lucro Real e Presumido | IN RFB 2.003/2021 |
| **ECF** (Escrituração Contábil Fiscal) | Último dia útil de **julho** (ano seguinte) | Lucro Real, Presumido (substituiu DIPJ) | IN RFB 2.004/2021 |
| **DEFIS** | Até **31 de março** | Simples Nacional | LC 123/2006 |
| **DASN-SIMEI** | Até **31 de maio** | MEI | Resolução CGSN |
| **DIRF** | Último dia útil de **fevereiro** | Quem reteve IRRF (em transição para EFD-Reinf) | IN RFB 1.990/2020 |
| **eSocial S-1299** (fechamento anual) | Dia **15 de janeiro** (ano seguinte) | Empregadores | Manual eSocial |

## 3. Calendário Espírito Santo — Estadual

Fonte primária: **SEFAZ-ES** (https://sefaz.es.gov.br) — verificar Decreto 1.090-R/2002 (RICMS-ES) e portarias subsequentes.

| Obrigação | Prazo | Aplicação |
|-----------|-------|-----------|
| **GIA-ICMS / GIA-ST** | Dia **15** do mês seguinte | Contribuintes ICMS-ES (atacadistas, indústrias) |
| **ICMS Apuração** (DUA-e) | Variável por categoria (geralmente dia **5** ou **9** do mês seguinte) | Contribuintes ICMS |
| **ICMS-ST** | Dia **9** do mês seguinte (operações sujeitas a ST) | Atacadistas e indústrias com NCM em ST |
| **DeSTDA** | Dia **20** do mês seguinte | Optantes Simples com inscrição estadual |
| **EFD-ICMS/IPI ES** | Dia **15** do mês seguinte | Contribuintes IRPJ/IPI/ICMS sob credenciamento |

### Particularidades capixabas

- **COMPETE-ES** (Lei 10.568/2016): benefício fiscal para atacadistas e centros de distribuição que adquirem mercadorias com diferimento parcial do ICMS. **Requisitos típicos**:
  - Inscrição estadual ativa
  - Faturamento mínimo (varia por modalidade)
  - Termo de Acordo SEFAZ
  - Apuração mensal com guia específica
- **FUNDAP** (em transição): sucessor do antigo benefício a importadores via Vitória — verificar status atual antes de aplicar
- **Compete Industrial** (Lei 10.567/2016): para indústrias instaladas no ES

## 4. Calendário Municipal — Vitória/Vila Velha/Serra/Cariacica

ISS é municipal. Cada prefeitura tem prazo próprio. Padrões observados:

| Município | Prazo ISS | Sistema |
|-----------|-----------|---------|
| **Vitória** | Dia **10** do mês seguinte | NFS-e Vitória |
| **Vila Velha** | Dia **15** do mês seguinte | NFS-e ABRASF |
| **Serra** | Dia **10** do mês seguinte | NFS-e Serra |
| **Cariacica** | Dia **10** do mês seguinte | NFS-e Cariacica |

ISS retido em fonte: empresa tomadora apura e recolhe na competência da prestação.

## 5. Particularidades por segmento

### 5.1 Atacadista (Lucro Real)
- ICMS-ST sobre NCMs específicos — Anexo do Convênio ICMS
- COMPETE-ES (avaliar elegibilidade)
- PIS/COFINS não-cumulativo (apuração com créditos sobre insumos)
- EFD-Contribuições + EFD-ICMS/IPI mensal
- IRPJ/CSLL trimestral ou estimativa mensal (escolha no início do exercício)

### 5.2 Indústria (Lucro Real)
- Tudo do atacadista +
- **Bloco K** do SPED Fiscal (controle de produção e estoque) — IN RFB 2.052/2021
- IPI sobre produção (apuração mensal, recolhimento via DARF)
- Compete Industrial (se aplicável)

### 5.3 Tecnologia/SaaS (Presumido)
- ISS sobre serviços — alíquota varia por município (geralmente 2%-5%)
- PIS/COFINS cumulativo (3,65%)
- IRPJ/CSLL trimestral baseado em presunção (32% para serviços)
- **Lei do Bem** (Lei 11.196/2005) — incentivo a P&D — avaliar elegibilidade
- Sem ICMS, sem EFD-ICMS/IPI

### 5.4 Tecnologia (Lucro Real)
- Tudo do Presumido +
- PIS/COFINS não-cumulativo
- EFD-Contribuições mensal
- ECF anual mais detalhada
- IRPJ/CSLL com possibilidade de prejuízo fiscal

### 5.5 Comércio Varejo (Simples Nacional)
- DAS mensal único (consolida ICMS, ISS, IRPJ, CSLL, PIS, COFINS, INSS-patronal — partes)
- DEFIS anual (até 31/03)
- NFC-e em ES (substituiu cupom fiscal)
- DeSTDA mensal se tem inscrição estadual

### 5.6 Holding/Participações (Presumido)
- IRPJ trimestral (32% sobre receitas administrativas, 8% para venda de imóveis)
- CSLL idem
- PIS/COFINS cumulativo
- Receitas financeiras (juros sobre aplicações) — tributação especial
- Distribuição de lucros (isenta para sócio PF se baseada em lucro contábil)
- ECF + ECD anual

### 5.7 Construção Civil (Presumido)
- IRPJ/CSLL com presunção de **8%** (construção)
- ISS por obra (alvará e CEI por obra)
- **RET — Regime Especial de Tributação** (Lei 10.931/2004) para incorporações imobiliárias
- Retenção INSS de **3,5%** sobre faturamento (cessão de mão de obra)
- Patrimônio de afetação (incorporações)

### 5.8 Telecomunicações (Lucro Real)
- ICMS-Comunicação **25-30%** (varia por UF — ES: 25%)
- Recolhimento à **ANATEL**: FUST (1%), FUNTTEL (0,5%), CFRP (1%) sobre receita bruta
- Convênio ICMS 126/1998 (regime específico telecom)
- EFD-ICMS/IPI mensal
- ECF anual

### 5.9 Educação (Presumido — algumas instituições imunes)
- ISS — alíquotas reduzidas (Vitória: 2% para educação)
- Imunidade tributária do art. 150, VI, "c" CF para entidades educacionais sem fins lucrativos (avaliar caso a caso)
- Quando tributada: PIS/COFINS, IRPJ/CSLL Presumido (32% sobre serviços)

## 6. Plano de contas modelo

CFC publica **NBCs** (Normas Brasileiras de Contabilidade). Plano de contas referencial:
- **Cont. Geral**: NBC TG 26 + NBC TG 1.000 (PMEs)
- **Atacadista/Comércio**: estrutura por estoque, custo da mercadoria vendida, ICMS recuperável
- **Indústria**: estoques de matéria-prima, produtos em elaboração, produtos acabados, custos diretos/indiretos
- **Construção**: contas por obra, custos contratuais, faturamento POC (percentage of completion)
- **Holding**: investimentos em coligadas/controladas, MEP (método de equivalência patrimonial)

URL raiz: https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade

## 7. URLs raízes para validação manual

Quando precisar validar prazo específico, navegar a partir de:

| Tema | URL raiz |
|------|----------|
| Receita Federal — declarações | https://www.gov.br/receitafederal/pt-br/servicos/declaracoes-e-escrituracoes |
| Normas Receita | http://normas.receita.fazenda.gov.br/ |
| eSocial | https://www.gov.br/esocial/pt-br |
| FGTS Digital | https://fgtsdigital.sistema.gov.br/ |
| SEFAZ-ES | https://internet.sefaz.es.gov.br/ |
| SESCON-ES | https://sescon-es.org.br/ |
| CFC normas | https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade/ |
| Portal Simples Nacional | https://www8.receita.fazenda.gov.br/SimplesNacional/ |
| Portal MEI | https://www.gov.br/empresas-e-negocios/pt-br/empreendedor |

## 8. Convenções para os seeds

Quando em dúvida sobre um prazo:
1. Marcar `// FIXME: validar prazo 2026` no comentário
2. Usar prazo "típico" da norma original
3. SLA `slaHoras` deve refletir o prazo legal **menos margem de segurança** (ex: lei dia 15 → SLA até dia 13)
4. Marcadores `[CONFIRMAR ESCRITÓRIO]` em passos cuja cadência depende da rotina interna (coleta de documentos do cliente, por exemplo)

## 9. Renovação anual deste documento

Tarefa sugerida em janeiro de cada ano:
- [ ] Conferir IN RFB de cada obrigação acessória federal
- [ ] Conferir Decreto SEFAZ-ES vigente
- [ ] Atualizar prazos do COMPETE-ES (lei pode mudar)
- [ ] Validar mudanças no eSocial (novas versões S-x.y)
- [ ] Atualizar campo "Última revisão" no topo
