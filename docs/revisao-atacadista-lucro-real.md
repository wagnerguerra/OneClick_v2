# Revisão de templates — Atacadista / Distribuidor / Importador (Lucro Real)

> **Como usar este documento**
>
> Revise cada template focando em:
> 1. Marcadores 🔸 `[CONFIRMAR ESCRITÓRIO]` ou `[CONFIRMAR CLIENTE]` — substituir pela rotina real do escritório
> 2. Etapas e passos faltantes ou irrelevantes pro seu fluxo
> 3. SLAs (em horas) — refletem o prazo legal menos margem; ajuste se sua margem é diferente
> 4. Obrigatoriedade dos passos (`**obr**`) e opcional (`*opcional*`)
>
> Após revisão, rodar `pnpm --filter @saas/db exec tsx prisma/enable-atacadista-lucro-real.ts` para ativar todos com `disponivelOrcamento: true`.

**Total: 19 templates**
- Onboarding: 4
- Mensal: 10
- Anual: 5

Legenda papel: 🟢 raiz · 🟡 meio · 🔵 folha · avulso

---

## 1. Onboarding (1× ao entrar como cliente)

### Avaliação COMPETE-ES

🔵 **folha** (final da cadeia) · SLA total **32h** · prioridade **MEDIA**

⚪ inativo no seletor de orçamento

**2 etapas · 8 passos** (1 obrigatórios, 1 a confirmar)

> Avaliação de elegibilidade e simulação do benefício COMPETE-ES (Lei 10.568/2016) para atacadistas e centros de distribuição instalados no ES.

**Predecessores:**
- ⤴ vem de **Setup Tributário Atacadista LR**

- **Análise de elegibilidade** _(SLA 16h)_
    - Verificar atividade principal (CNAE) e enquadramento legal **obr** · SLA 4h
      _Lei 10.568/2016 — art. 1º_
    - Confirmar inscrição estadual ativa há > 12 meses · SLA 2h
    - Verificar regularidade fiscal estadual (CND-SEFAZ) · SLA 4h
    - Conferir faturamento mínimo da modalidade pretendida · SLA 6h
- **Simulação e formalização** _(SLA 16h)_
    - Simular impacto no fluxo de caixa (diferimento parcial ICMS) · SLA 8h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Apresentar simulação ao cliente em reunião *opcional* · SLA 4h
    - Protocolar Termo de Acordo na SEFAZ-ES (se cliente aceitar) · SLA 4h
    - Acompanhar publicação no DOE-ES · SLA —

---

### Onboarding Atacadista LR

🟢 **raiz** (origem da cadeia) · SLA total **96h** · prioridade **ALTA**

⚪ inativo no seletor de orçamento

**3 etapas · 14 passos** (7 obrigatórios, 3 a confirmar)

> Acolhimento e configuração inicial específicos para atacadistas/importadores no regime Lucro Real. Sucessor da Transferência de Contabilidade quando aplicável.

**Sucessores (criados ao concluir):**
- ⤵ dispara **Setup Tributário Atacadista LR**
- ⤵ dispara **Plano de Contas Atacadista**

- **Diagnóstico fiscal inicial** _(SLA 24h)_
    - Levantar CNAEs principais e secundários **obr** · SLA 4h
    - Verificar inscrição estadual ativa (SEFAZ-ES) **obr** · SLA 4h
    - Identificar NCMs típicos do mix de produtos · SLA 8h
    - Avaliar histórico de faturamento (definir periodicidade IRPJ trimestral vs estimativa mensal) · SLA 8h
- **Acolhimento operacional** _(SLA 24h)_
    - 🔸 [CONFIRMAR ESCRITÓRIO] Reunião de boas-vindas com sócios e financeiro · SLA 8h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Apresentar equipe Fiscal e Contábil responsáveis · SLA 4h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Definir cronograma mensal (dia limite para envio de NFs e extratos) **obr** · SLA 4h
    - Solicitar acesso ao e-CAC (procuração) e SEFAZ-ES (certificado digital) **obr** · SLA 8h
- **Configuração no sistema** _(SLA 48h)_
    - Cadastrar cliente com dados completos (sócios, endereço, contatos) **obr** · SLA 8h
    - Vincular áreas contratadas (Fiscal, Contábil, Trabalhista, Societário) **obr** · SLA 4h
    - Importar plano de contas modelo (vide serviço Plano de Contas Atacadista) · SLA 16h
    - Configurar integração SCI/Omie (idSistema, idOmie) · SLA 8h
    - Cadastrar certificado digital A1 e validar acesso e-CAC **obr** · SLA 8h
    - Habilitar consulta automática de Caixa Postal e-CAC · SLA 4h

---

### Plano de Contas Atacadista

🔵 **folha** (final da cadeia) · SLA total **24h** · prioridade **MEDIA**

⚪ inativo no seletor de orçamento

**1 etapas · 5 passos** (1 obrigatórios, 1 a confirmar)

> Importação de plano de contas modelo para atacadista — estoque, CMV, ICMS recuperável, créditos PIS/COFINS, contas de receita por filial.

**Predecessores:**
- ⤴ vem de **Onboarding Atacadista LR**

- **Importação** _(SLA 24h)_
    - Importar plano de contas referencial (NBC TG) · SLA 8h
      _Estrutura: Ativo > Estoques > Mercadorias para Revenda_
    - Configurar contas de impostos a recuperar (ICMS, PIS, COFINS) **obr** · SLA 4h
    - Configurar contas de receita por filial/centro de custo · SLA 4h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Ajustar contas específicas do cliente (se houver) · SLA 4h
    - Sincronizar com sistema contábil (SCI/Omie) · SLA 4h

---

### Setup Tributário Atacadista LR

🟡 **meio** (encadeado) · SLA total **48h** · prioridade **ALTA**

⚪ inativo no seletor de orçamento

**3 etapas · 9 passos** (3 obrigatórios, 1 a confirmar)

> Configuração tributária inicial: regime Lucro Real, periodicidade IRPJ, mapeamento de PIS/COFINS não-cumulativo, identificação de NCMs sujeitos a ICMS-ST.

**Predecessores:**
- ⤴ vem de **Onboarding Atacadista LR**

**Sucessores (criados ao concluir):**
- ⤵ dispara **Avaliação COMPETE-ES** _(opcional · manual)_

- **Definição do regime** _(SLA 16h)_
    - Confirmar opção por Lucro Real (anual ou trimestral) — formalizar **obr** · SLA 4h
    - Avaliar se compensa estimativa mensal (Lucro Real anual com base estimada) · SLA 4h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Documentar opção em ata interna · SLA 8h
- **PIS/COFINS não-cumulativo** _(SLA 16h)_
    - Mapear créditos sobre insumos (energia, frete, embalagem) **obr** · SLA 8h
      _Lei 10.637/2002 + 10.833/2003_
    - Identificar receitas com tributação monofásica/diferenciada · SLA 4h
    - Configurar planilha base de apuração mensal · SLA 4h
- **ICMS-ST** _(SLA 16h)_
    - Cruzar NCMs do estoque com Anexo do Convênio ICMS **obr** · SLA 8h
    - Identificar protocolos ST entre ES e estados de origem dos fornecedores · SLA 4h
    - Configurar tabelas MVA (Margem de Valor Agregado) por NCM · SLA 4h

---

## 2. Rotina Mensal (12×/ano)

### Apuração ICMS Próprio + ICMS-ST Atacadista LR

🟡 **meio** (encadeado) · SLA total **48h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**2 etapas · 10 passos** (4 obrigatórios, 0 a confirmar)

> Apuração mensal de ICMS próprio (livro de apuração) e ICMS-ST sobre operações com NCMs sujeitos. Geração da DUA-e e GIA-ST.

**Predecessores:**
- ⤴ vem de **Lançamentos Contábeis Mensais Atacadista**

**Sucessores (criados ao concluir):**
- ⤵ dispara **EFD-ICMS/IPI Atacadista LR**

- **ICMS Próprio** _(SLA 24h)_
    - Apurar saldo credor/devedor com base nas entradas e saídas **obr** · SLA 8h
    - Considerar transferências entre filiais (se houver) · SLA 4h
    - Aplicar reduções/diferimentos (incluindo COMPETE-ES se elegível) · SLA 4h
    - Gerar DUA-e e validar valor **obr** · SLA 4h
      _Recolhimento dia 5/9 do mês seguinte conforme calendário SEFAZ-ES_
    - Encaminhar DUA-e ao financeiro do cliente · SLA 4h
- **ICMS-ST** _(SLA 24h)_
    - Identificar NFs com NCMs em ST **obr** · SLA 4h
    - Calcular base de ST (preço + MVA + frete + outras adições) · SLA 8h
    - Apurar ICMS-ST devido **obr** · SLA 4h
    - Gerar GIA-ST e DUA-ST · SLA 4h
      _Recolhimento dia 9 do mês seguinte_
    - Encaminhar guias ao cliente · SLA 4h

---

### Apuração IRPJ/CSLL Estimativa Mensal

🔵 **folha** (final da cadeia) · SLA total **32h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**2 etapas · 7 passos** (4 obrigatórios, 0 a confirmar)

> Apuração mensal por estimativa (Lucro Real anual) ou trimestral. Recolhimento via DARF.

**Predecessores:**
- ⤴ vem de **Lançamentos Contábeis Mensais Atacadista**

- **Apuração** _(SLA 24h)_
    - Verificar opção do exercício (mensal vs trimestral) **obr** · SLA 2h
    - Apurar receita bruta + adições/exclusões **obr** · SLA 8h
    - Calcular IRPJ (15% + adicional 10%) + CSLL (9%) **obr** · SLA 4h
    - Considerar estimativa mensal vs balanço de suspensão · SLA 8h
    - Aplicar deduções (incentivos fiscais elegíveis) · SLA 2h
- **Recolhimento** _(SLA 8h)_
    - Gerar DARFs (2362 IRPJ Mensal Estim, 2484 CSLL Mensal Estim) **obr** · SLA 4h
      _Vencimento último dia útil do mês seguinte_
    - Encaminhar ao financeiro · SLA 4h

---

### Apuração PIS/COFINS Não-cumulativo

🟡 **meio** (encadeado) · SLA total **32h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**2 etapas · 7 passos** (4 obrigatórios, 0 a confirmar)

> Apuração mensal de PIS (1,65%) e COFINS (7,60%) não-cumulativos com créditos sobre insumos, energia, frete e ativo imobilizado.

**Predecessores:**
- ⤴ vem de **Lançamentos Contábeis Mensais Atacadista**

**Sucessores (criados ao concluir):**
- ⤵ dispara **EFD-Contribuições Atacadista LR**

- **Cálculo** _(SLA 24h)_
    - Apurar receitas tributadas **obr** · SLA 4h
    - Identificar receitas monofásicas/diferenciadas (subtrair) · SLA 4h
    - Apurar créditos sobre insumos, energia, fretes **obr** · SLA 8h
      _Lei 10.637/2002 art. 3º_
    - Apurar créditos sobre ativo imobilizado (depreciação) · SLA 4h
    - Calcular saldo devedor/credor **obr** · SLA 4h
- **Recolhimento** _(SLA 8h)_
    - Gerar DARFs (códigos 6912 PIS e 5856 COFINS) **obr** · SLA 4h
      _Vencimento dia 25 do mês seguinte_
    - Encaminhar ao financeiro do cliente · SLA 4h

---

### Coleta Documentos Mensal Atacadista

🟡 **meio** (encadeado) · SLA total **48h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**2 etapas · 7 passos** (4 obrigatórios, 1 a confirmar)

> Recebimento e validação de documentos do cliente para o fechamento mensal: NFs entrada/saída, extratos bancários, folha, acordos comerciais.

**Predecessores:**
- ⤴ vem de **Mensal Atacadista LR**

**Sucessores (criados ao concluir):**
- ⤵ dispara **Lançamentos Contábeis Mensais Atacadista**

- **Solicitação** _(SLA 24h)_
    - 🔸 [CONFIRMAR ESCRITÓRIO] Disparar e-mail/WhatsApp lembrando cliente do prazo (dia X) **obr** · SLA 4h
    - Listar pendências da competência anterior se houver · SLA 4h
- **Recebimento e validação** _(SLA 24h)_
    - Receber e arquivar XMLs de NFs de entrada **obr** · SLA 8h
    - Receber e arquivar XMLs de NFs de saída **obr** · SLA 8h
    - Receber extratos bancários (OFX/PDF) **obr** · SLA 4h
    - Receber relatórios de folha (se houver) · SLA 2h
    - Validar integridade (sequência numérica de NFs sem lacuna) · SLA 2h

---

### Conciliação e Balancete Mensal Atacadista

🔵 **folha** (final da cadeia) · SLA total **24h** · prioridade **MEDIA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**2 etapas · 6 passos** (3 obrigatórios, 1 a confirmar)

> Conciliações finais (banco, estoque, ICMS recuperável, PIS/COFINS) e geração do balancete mensal.

**Predecessores:**
- ⤴ vem de **EFD-ICMS/IPI Atacadista LR**

- **Conciliações** _(SLA 16h)_
    - Conciliar saldos bancários com extratos **obr** · SLA 4h
    - Conciliar estoque físico (se cliente faz inventário mensal) *opcional* · SLA 4h
    - Conciliar ICMS a recuperar (entradas vs apuração) **obr** · SLA 4h
    - Conciliar PIS/COFINS a recuperar · SLA 4h
- **Balancete** _(SLA 8h)_
    - Gerar balancete de verificação **obr** · SLA 4h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Enviar balancete + DRE ao cliente · SLA 4h

---

### EFD-Contribuições Atacadista LR

🔵 **folha** (final da cadeia) · SLA total **32h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**2 etapas · 6 passos** (4 obrigatórios, 0 a confirmar)

> Geração e transmissão da EFD-Contribuições com blocos A, C, D, F, M — receitas, apuração de PIS/COFINS, créditos.

**Predecessores:**
- ⤴ vem de **Apuração PIS/COFINS Não-cumulativo**

- **Geração** _(SLA 24h)_
    - Gerar bloco A (operações de aquisição com créditos) **obr** · SLA 8h
    - Gerar bloco C (NFs de saída — receitas) **obr** · SLA 8h
    - Gerar bloco M (consolidação PIS/COFINS) **obr** · SLA 4h
    - Validar com PVA-Contribuições · SLA 4h
- **Transmissão** _(SLA 8h)_
    - Transmitir EFD-Contribuições até dia 10 do 2º mês subsequente **obr** · SLA 4h
      _IN RFB 1.252/2012 — vencimento dia 10 do 2º mês subsequente_
    - Arquivar recibo · SLA 4h

---

### EFD-ICMS/IPI Atacadista LR

🟡 **meio** (encadeado) · SLA total **32h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**2 etapas · 8 passos** (3 obrigatórios, 0 a confirmar)

> Geração e transmissão da EFD-ICMS/IPI (SPED Fiscal) com blocos C, D, E, H — entradas, saídas, apuração, inventário.

**Predecessores:**
- ⤴ vem de **Apuração ICMS Próprio + ICMS-ST Atacadista LR**

**Sucessores (criados ao concluir):**
- ⤵ dispara **Conciliação e Balancete Mensal Atacadista** _(sem herdar responsável)_

- **Geração** _(SLA 24h)_
    - Gerar bloco C (NFs eletrônicas — modelo 55) **obr** · SLA 4h
    - Gerar bloco D (transporte e energia, se houver) *opcional* · SLA 4h
    - Gerar bloco E (apuração ICMS e IPI) **obr** · SLA 4h
    - Gerar bloco H (inventário — anual, registrar mês 02 ou 12) *opcional* · SLA 4h
    - Validar com PVA-Fiscal (validador da Receita) · SLA 4h
    - Corrigir inconsistências e regerar · SLA 4h
- **Transmissão** _(SLA 8h)_
    - Transmitir EFD-ICMS/IPI até dia 15 **obr** · SLA 4h
      _Convênio ICMS 143/2006 — ES dia 15 do mês seguinte_
    - Arquivar recibo de transmissão · SLA 4h

---

### Folha + eSocial + DCTFWeb

🔵 **folha** (final da cadeia) · SLA total **48h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**3 etapas · 12 passos** (7 obrigatórios, 2 a confirmar)

> Apuração de folha, transmissão eSocial (S-1200/S-1210/S-1280), DCTFWeb e geração de guias INSS/FGTS.

**Predecessores:**
- ⤴ vem de **Lançamentos Contábeis Mensais Atacadista**

- **Folha** _(SLA 24h)_
    - 🔸 [CONFIRMAR CLIENTE] Receber variáveis (horas extras, faltas, comissões) até dia 25 **obr** · SLA 4h
    - Calcular folha (salários, encargos, líquidos) **obr** · SLA 8h
    - Validar líquidos com cliente · SLA 4h
    - Gerar holerites · SLA 4h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Enviar holerites a funcionários (folhas-pagamento.com.br ou e-mail) · SLA 4h
- **eSocial e DCTFWeb** _(SLA 16h)_
    - Transmitir eventos S-1200 (remuneração) **obr** · SLA 4h
    - Transmitir eventos S-1210 (pagamentos) · SLA 4h
    - Transmitir S-1280 (compensações cruzadas) *opcional* · SLA 2h
    - Fechar período no eSocial **obr** · SLA 2h
    - Transmitir DCTFWeb até dia 15 **obr** · SLA 4h
      _IN RFB 2.005/2021 — vencimento dia 15 do mês seguinte ao fato gerador_
- **Guias** _(SLA 8h)_
    - Gerar DARF de INSS via DCTFWeb **obr** · SLA 4h
    - Gerar GFIP/SEFIP FGTS via FGTS Digital **obr** · SLA 4h
      _Vencimento dia 20 do mês seguinte (FGTS Digital)_

---

### Lançamentos Contábeis Mensais Atacadista

🟡 **meio** (encadeado) · SLA total **72h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**3 etapas · 11 passos** (3 obrigatórios, 0 a confirmar)

> Lançamento de NFs entrada/saída, custos, despesas, receitas financeiras e classificação por centro de custo.

**Predecessores:**
- ⤴ vem de **Coleta Documentos Mensal Atacadista**

**Sucessores (criados ao concluir):**
- ⤵ dispara **Apuração ICMS Próprio + ICMS-ST Atacadista LR** _(sem herdar responsável)_
- ⤵ dispara **Apuração PIS/COFINS Não-cumulativo** _(sem herdar responsável)_
- ⤵ dispara **Apuração IRPJ/CSLL Estimativa Mensal** _(sem herdar responsável)_
- ⤵ dispara **Folha + eSocial + DCTFWeb** _(sem herdar responsável)_

- **Entradas** _(SLA 24h)_
    - Importar XMLs de entrada para o ERP contábil · SLA 8h
    - Conferir CFOPs (1xxx/2xxx) e tributação **obr** · SLA 8h
    - Provisionar mercadorias em estoque · SLA 4h
    - Lançar fretes, seguros e outras adições ao custo · SLA 4h
- **Saídas** _(SLA 24h)_
    - Importar XMLs de saída · SLA 8h
    - Conferir CFOPs (5xxx/6xxx) **obr** · SLA 8h
    - Lançar receitas por filial/centro de custo · SLA 8h
- **Despesas e financeiras** _(SLA 24h)_
    - Lançar despesas administrativas e comerciais · SLA 8h
    - Lançar receitas financeiras (juros, rendimentos) · SLA 4h
    - Lançar despesas financeiras (juros pagos, IOF) · SLA 4h
    - Conciliar conta caixa/banco com extratos **obr** · SLA 8h

---

### Mensal Atacadista LR

🟢 **raiz** (origem da cadeia) · SLA total **240h** · prioridade **ALTA**

recorrente mensal · ⚪ inativo no seletor de orçamento

**1 etapas · 4 passos** (1 obrigatórios, 0 a confirmar)

> Cadeia mensal completa do fechamento de atacadista Lucro Real. Dispara coleta → lançamentos → apurações → obrigações → fechamento.

**Sucessores (criados ao concluir):**
- ⤵ dispara **Coleta Documentos Mensal Atacadista**

- **Visão geral do mês** _(SLA 240h)_
    - Confirmar entrada de documentos completa · SLA 24h
    - Confirmar todas apurações concluídas · SLA 24h
    - Confirmar obrigações acessórias transmitidas · SLA 24h
    - Encerrar competência mensal **obr** · SLA 8h

---

## 3. Rotina Anual (1×/ano)

### Anual Atacadista LR

🟢 **raiz** (origem da cadeia) · SLA total **480h** · prioridade **ALTA**

⚪ inativo no seletor de orçamento

**1 etapas · 4 passos** (4 obrigatórios, 0 a confirmar)

> Cadeia anual de fechamento e entregas — encerramento, ECD, ECF e distribuição de lucros.

**Sucessores (criados ao concluir):**
- ⤵ dispara **Encerramento do Exercício Atacadista LR**

- **Coordenação anual** _(SLA 480h)_
    - Confirmar encerramento de exercício pronto **obr** · SLA 24h
    - Confirmar ECD transmitida **obr** · SLA 24h
    - Confirmar ECF transmitida **obr** · SLA 24h
    - Encerrar ciclo anual **obr** · SLA 8h

---

### Distribuição de Lucros e IRPF dos Sócios

🔵 **folha** (final da cadeia) · SLA total **40h** · prioridade **MEDIA**

⚪ inativo no seletor de orçamento

**2 etapas · 8 passos** (3 obrigatórios, 3 a confirmar)

> Análise da distribuição de lucros aos sócios e suporte à declaração de IRPF — orientação sobre rendimento isento.

**Predecessores:**
- ⤴ vem de **ECF Atacadista LR**

- **Distribuição** _(SLA 24h)_
    - Apurar lucro contábil disponível para distribuição **obr** · SLA 8h
    - Verificar limites de distribuição isenta (lucro contábil x lucro presumido) · SLA 4h
    - 🔸 [CONFIRMAR CLIENTE] Confirmar valor distribuído por sócio **obr** · SLA 4h
    - Lançar contabilmente a distribuição **obr** · SLA 4h
    - Emitir comprovante de distribuição para cada sócio · SLA 4h
- **IRPF dos sócios** _(SLA 16h)_
    - 🔸 [CONFIRMAR CLIENTE] Receber dados patrimoniais dos sócios PF *opcional* · SLA 4h
    - Preparar informe de rendimentos (lucro distribuído isento) · SLA 4h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Auxiliar sócio na declaração de IRPF (escopo: como anexo do serviço) *opcional* · SLA 8h

---

### ECD Atacadista LR

🟡 **meio** (encadeado) · SLA total **80h** · prioridade **ALTA**

⚪ inativo no seletor de orçamento

**2 etapas · 12 passos** (5 obrigatórios, 2 a confirmar)

> Geração e transmissão da Escrituração Contábil Digital. Inclui Diário, Razão, Balancetes e Balanços.

**Predecessores:**
- ⤴ vem de **Encerramento do Exercício Atacadista LR**

**Sucessores (criados ao concluir):**
- ⤵ dispara **ECF Atacadista LR**

- **Preparação** _(SLA 60h)_
    - Validar plano de contas referencial **obr** · SLA 8h
    - Conferir totais batem com balanço fechado **obr** · SLA 8h
    - Gerar Bloco I (Diário) · SLA 16h
    - Gerar Bloco J (Demonstrações) · SLA 8h
    - Gerar Bloco K (Plano de contas) · SLA 4h
    - Validar com PVA-ECD · SLA 8h
    - Corrigir inconsistências · SLA 8h
- **Assinatura e transmissão** _(SLA 20h)_
    - 🔸 [CONFIRMAR CLIENTE] Coletar assinatura digital do contador (responsável técnico) **obr** · SLA 4h
    - 🔸 [CONFIRMAR CLIENTE] Coletar assinatura digital do sócio/administrador **obr** · SLA 4h
    - Transmitir até último dia útil de junho **obr** · SLA 4h
      _IN RFB 2.003/2021 — prazo último dia útil de junho do ano seguinte_
    - Arquivar recibo · SLA 4h
    - Registrar livros na Junta Comercial (autenticação) · SLA 4h

---

### ECF Atacadista LR

🟡 **meio** (encadeado) · SLA total **120h** · prioridade **ALTA**

⚪ inativo no seletor de orçamento

**2 etapas · 12 passos** (7 obrigatórios, 2 a confirmar)

> Geração e transmissão da Escrituração Contábil Fiscal — substituiu DIPJ. Apuração definitiva IRPJ/CSLL anual e LALUR.

**Predecessores:**
- ⤴ vem de **ECD Atacadista LR**

**Sucessores (criados ao concluir):**
- ⤵ dispara **Distribuição de Lucros e IRPF dos Sócios** _(opcional · manual)_

- **Apuração** _(SLA 80h)_
    - Importar dados da ECD **obr** · SLA 8h
    - Apurar e-LALUR (adições, exclusões, compensações de prejuízos) **obr** · SLA 24h
    - Apurar e-LACS (CSLL) **obr** · SLA 16h
    - Calcular IRPJ definitivo (Real anual ou trimestral) **obr** · SLA 8h
    - Calcular CSLL definitiva **obr** · SLA 8h
    - Apurar saldo a pagar ou a compensar (IRRF, estimativas mensais) · SLA 8h
    - Validar com PVA-ECF · SLA 8h
- **Transmissão** _(SLA 40h)_
    - 🔸 [CONFIRMAR CLIENTE] Coletar assinaturas digitais **obr** · SLA 8h
    - Transmitir até último dia útil de julho **obr** · SLA 4h
      _IN RFB 2.004/2021 — prazo último dia útil de julho do ano seguinte_
    - Arquivar recibo · SLA 4h
    - Gerar DARFs de saldo a pagar (se houver) · SLA 8h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Encaminhar resumo ao cliente · SLA 16h

---

### Encerramento do Exercício Atacadista LR

🟡 **meio** (encadeado) · SLA total **80h** · prioridade **ALTA**

⚪ inativo no seletor de orçamento

**2 etapas · 11 passos** (5 obrigatórios, 1 a confirmar)

> Encerramento contábil do exercício — apuração do resultado, lançamentos de zeramento, ajustes patrimoniais.

**Predecessores:**
- ⤴ vem de **Anual Atacadista LR**

**Sucessores (criados ao concluir):**
- ⤵ dispara **ECD Atacadista LR**

- **Ajustes** _(SLA 40h)_
    - Conferir provisões (férias, 13º, IR) **obr** · SLA 8h
    - Ajustar depreciações e amortizações · SLA 4h
    - Apurar ajustes do RTT (se aplicável) *opcional* · SLA 4h
    - Lançar avaliação de estoque (custo médio) · SLA 8h
    - Apurar resultado do exercício (receitas - despesas - impostos) **obr** · SLA 8h
    - Lançar IRPJ e CSLL anuais (Lucro Real) **obr** · SLA 8h
- **Demonstrativos** _(SLA 40h)_
    - Gerar Balanço Patrimonial **obr** · SLA 8h
    - Gerar DRE **obr** · SLA 4h
    - Gerar DMPL/DRA/DFC (Demonstrações complementares) · SLA 8h
    - Elaborar notas explicativas · SLA 16h
    - 🔸 [CONFIRMAR ESCRITÓRIO] Apresentar ao cliente em reunião · SLA 4h

---

