# PRD — Módulo: Controle de Obrigações DCTFWeb

## 1. Visão Geral

### 1.1 Objetivo

Desenvolver um módulo de controle e monitoramento da DCTFWeb que permita ao escritório contábil:

* Garantir cumprimento de prazos
* Identificar pendências automaticamente
* Cruzar dados internos com dados da Receita Federal
* Monitorar débitos e pagamentos
* Reduzir risco fiscal dos clientes

O sistema utilizará integração com a Integra Contador para consulta e atualização dos dados diretamente junto à Receita.

---

### 1.2 Problema

Atualmente, o controle da DCTFWeb é:

* Manual
* Fragmentado (folha, Reinf, portal e-CAC)
* Sujeito a falhas humanas
* Sem visão centralizada

---

### 1.3 Solução

Criar um **HUB DE CONFORMIDADE**, centralizando:

* Status da origem (eSocial/Reinf)
* Status da DCTFWeb
* Situação fiscal
* Pagamento
* Alertas e riscos

---

## 2. Escopo

### 2.1 Incluído

* Controle por empresa e competência
* Integração com API (consulta)
* Classificação automática de status
* Dashboard operacional
* Alertas automáticos
* Histórico de eventos

---

### 2.2 Não incluído (Fase 1)

* Transmissão automática da DCTFWeb
* Geração automática de DARF
* Integração bancária para pagamento

---

## 3. Arquitetura

### 3.1 Stack

* Backend: Node.js
* Banco: MySQL
* Integração: API Integra Contador
* Frontend: (já existente no sistema)

---

## 4. Modelagem de Dados

### 4.1 Tabela: obrigacoes_dctfweb

```sql
CREATE TABLE obrigacoes_dctfweb (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    competencia VARCHAR(7) NOT NULL,

    esocial_fechado TINYINT DEFAULT 0,
    reinf_fechado TINYINT DEFAULT 0,

    status_dctfweb VARCHAR(50),
    valor_debito_api DECIMAL(14,2),
    situacao_fiscal VARCHAR(50),

    status_processo VARCHAR(50),
    divergente TINYINT DEFAULT 0,

    darf_emitido TINYINT DEFAULT 0,
    darf_pago TINYINT DEFAULT 0,
    valor_darf DECIMAL(14,2),

    data_consulta_api DATETIME,
    data_transmissao DATETIME,
    data_pagamento DATETIME,

    nivel_alerta VARCHAR(20),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 5. Regras de Negócio

### 5.1 Status do Processo

| Condição                   | Status                |
| -------------------------- | --------------------- |
| Origem não fechada         | aguardando_fechamento |
| Origem fechada sem DCTFWeb | pronto_envio          |
| Transmitida sem pagamento  | aguardando_pagamento  |
| Transmitida e paga         | concluido             |

---

### 5.2 Regras de Alerta

* 🔴 vermelho:

  * Não transmitida após fechamento
  * Débito vencido
  * Erro na API

* 🟡 amarelo:

  * Próximo do prazo
  * Sem pagamento
  * Divergência de valores

* 🟢 verde:

  * Regular

---

### 5.3 Divergência

```text
Se valor_debito_api ≠ valor_darf
→ divergente = 1
```

---

### 5.4 Detecção de erro operacional

```text
Se esocial_fechado = 1
E status_dctfweb = nao_encontrada
→ erro operacional
```

---

## 6. Integração com API

### 6.1 Frequência

* Job diário automático

---

### 6.2 Dados a coletar

* Status da DCTFWeb
* Valor do débito
* Situação fiscal
* Data de atualização

---

### 6.3 Atualização

* Atualizar registro existente
* Criar novo se não existir

---

## 7. Fluxo do Sistema

```text
1. Sistema identifica competência ativa
2. Verifica status de origem (eSocial/Reinf)
3. Consulta API Integra Contador
4. Atualiza status
5. Aplica regras de diagnóstico
6. Classifica alerta
7. Exibe no dashboard
```

---

## 8. Dashboard

### 8.1 Grid Principal

Campos:

* Empresa
* Competência
* Origem (ok/pendente)
* DCTFWeb (status)
* Valor débito
* Pagamento
* Alerta

---

### 8.2 Filtros

* Competência
* Status
* Com pendência
* Com divergência
* Com débito aberto

---

## 9. Indicadores (KPIs)

* % DCTFWeb entregues no prazo
* % com pendência
* % com débito aberto
* Tempo médio de entrega

---

## 10. Alertas

### 10.1 Regras de prazo

| Dia | Ação           |
| --- | -------------- |
| 10  | alerta leve    |
| 13  | alerta crítico |
| 15  | atraso         |

---

## 11. Segurança

* Controle por id_empresa
* Logs de alteração
* Auditoria de consultas API

---

## 12. Logs

Criar tabela opcional:

```sql
CREATE TABLE log_dctfweb (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT,
    competencia VARCHAR(7),
    acao VARCHAR(100),
    detalhe TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 13. Futuras Evoluções

* Transmissão automática da DCTFWeb
* Geração automática de DARF
* Integração com financeiro
* Notificações (email/WhatsApp)
* Integração com módulo de folha

---

## 14. Critérios de Sucesso

* Redução de atrasos
* Redução de erros operacionais
* Visão centralizada das obrigações
* Aumento de produtividade da equipe

---

## 15. Conclusão

Este módulo transforma o controle da DCTFWeb de:

❌ operacional manual
➡️
✅ monitoramento automatizado e inteligente

Permitindo que o escritório atue de forma preventiva, com foco em risco fiscal e eficiência operacional.

---
