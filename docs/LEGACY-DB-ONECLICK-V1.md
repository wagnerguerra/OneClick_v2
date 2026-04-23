# Banco de Dados Legado — OneClick v1 (db_intranet)

> Documentacao do banco MySQL `db_intranet` usado pelo OneClick v1.
> Fonte: analise do codigo em `\\192.168.0.7\wwwroot\v4\` e `C:\Users\wagner\Desktop\PROJETOS\SERPRO2`.

## Conexao

| Param    | Valor                        |
|----------|------------------------------|
| Host     | 192.168.0.7 (ou localhost)   |
| Port     | 3306                         |
| Database | db_intranet                  |
| Charset  | utf8mb4                      |

---

## Tabelas Principais

### GER_CAD_CLI (Cadastro de Clientes)

Tabela principal de clientes/empresas.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | INT PK | ID do cliente |
| `cad_cli_cnpj` | VARCHAR | CNPJ (pode conter pontuacao) |
| `cad_cli_cgc` | VARCHAR | Alternativa ao CNPJ (instalacoes antigas) |
| `cad_cli_razao` | VARCHAR | Razao social |
| `cad_cli_fantasia` / `cad_cli_nome_fantasia` | VARCHAR | Nome fantasia |
| `cad_cli_email` | VARCHAR | E-mail principal |
| `cad_cli_tel` | VARCHAR | Telefone |
| **Endereco** | | |
| `cad_cli_end` | VARCHAR | Logradouro |
| `cad_cli_num` | VARCHAR | Numero |
| `cad_cli_bairro` | VARCHAR | Bairro |
| `cad_cli_complemento` | VARCHAR | Complemento |
| `cad_cli_cidade` | VARCHAR | Cidade/municipio |
| `cad_cli_estado` | CHAR(2) | UF |
| `cad_cli_cep` | VARCHAR | CEP |
| **Classificacao** | | |
| `cad_cli_situacao` | INT FK | Referencia `cad_cli_sit.id` |
| `cad_cli_grupo` | INT FK | Referencia `cad_gru.id` |
| `cad_cli_tipo` | VARCHAR | Tipo do cliente (texto livre) |
| `cad_cli_origem` | VARCHAR | Origem do cliente (texto livre) |
| `cad_cli_ativo` | TINYINT | 1=ativo, 0=inativo |
| **Fiscal** | | |
| `cad_cli_regime` | INT FK | Tributacao — referencia `cad_tri.id` |
| `cad_cli_regime2` | INT FK | Regime contabil — referencia `cad_cli_regime.id` |
| `cad_cli_ie` / `cad_cli_IE` | VARCHAR | Inscricao Estadual |
| `cad_cli_im` / `cad_cli_IM` | VARCHAR | Inscricao Municipal |
| **Datas** | | |
| `cad_cli_data_entrada` / `cad_cli_data_inicio` | DATE | Data de inicio do cliente |
| `cad_cli_data_saida` / `cad_cli_data_encerramento` | DATE | Data de saida/encerramento |
| `created_at` / `cad_cli_criado` | DATETIME | Data de criacao do registro |
| **Areas Contratadas** (flags 0/1) | | |
| `cad_cli_con_con` / `cad_cli_contabil_contratado` | TINYINT | Contabil contratado |
| `cad_cli_fis_con` / `cad_cli_fiscal_contratado` | TINYINT | Fiscal contratado |
| `cad_cli_trab_con` / `cad_cli_trabalhista_contratado` / `cad_cli_dp_con` | TINYINT | Trabalhista/DP contratado |
| `cad_cli_legal_con` / `cad_cli_legal_contratado` | TINYINT | Legal contratado |
| **Responsaveis por Area** | | |
| `cad_cli_res_con` / `cad_cli_resp_contabil` | INT | Responsavel contabil (ID colaborador) |
| `cad_cli_res_fis` / `cad_cli_resp_fiscal` | INT | Responsavel fiscal |
| `cad_cli_res_trab` / `cad_cli_resp_trabalhista` | INT | Responsavel trabalhista |
| `cad_cli_res_legal` / `cad_cli_resp_legal` | INT | Responsavel legal |
| **Particularidades** (texto por area) | | |
| `cad_cli_com_par` | TEXT | Particularidades comerciais |
| `cad_cli_con_par` | TEXT | Particularidades contabeis |
| `cad_cli_fis_par` | TEXT | Particularidades fiscais |
| `cad_cli_trab_par` | TEXT | Particularidades trabalhistas |
| `cad_cli_legal_par` | TEXT | Particularidades legais |
| `cad_cli_leg_par` | TEXT | Particularidades de legalizacao |
| **Legalizacao** | | |
| `leg_nire` / `leg_NIRE` | VARCHAR | NIRE |
| `leg_rge` / `leg_RGE` | VARCHAR | RGE |
| `leg_simples` | VARCHAR | Simples Nacional |
| `leg_tipo` | VARCHAR | Tipo (legalizacao) |
| `leg_metragem` | VARCHAR | Metragem |
| `leg_rota` | VARCHAR | Rota |
| `leg_projeto` | VARCHAR | Projeto |
| `leg_capacidade` | VARCHAR | Capacidade |
| `leg_referencia` | VARCHAR | Referencia |
| `leg_coordenadas` | VARCHAR | Coordenadas GPS |
| `leg_cnae` | VARCHAR | CNAE principal |
| `leg_siat` | VARCHAR | SIAT |
| **Empresa (multi-tenant)** | | |
| `id_empresa` / `empresa_id` | INT | ID da empresa |
| `hash_empresa` / `empresa_hash` | VARCHAR | Hash da empresa |

> **Nota:** Variacoes de nomes de colunas existem entre instalacoes. O codigo usa deteccao dinamica.

---

### cad_cli_sit (Situacoes do Cliente)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | INT PK | ID |
| `situacao` | VARCHAR | Descricao (ATIVO, PROSPECT, INATIVO, MENSAL, etc.) |
| `id_empresa` | VARCHAR | Filtro por empresa (opcional) |

**Valores conhecidos:** MENSAL, EM CONSTITUICAO, POTENCIAL, AVULSO, PARALIZADO, PRE OPERACIONAL, PROSPECT

---

### cad_gru (Grupos/Segmentos)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | INT PK | ID |
| `grupo` | VARCHAR | Nome do grupo |
| `id_empresa` | VARCHAR | Filtro por empresa (opcional) |

---

### cad_tri (Tributacao)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | INT PK | ID |
| `tributacao` | VARCHAR | Descricao |
| `id_empresa` | INT | Filtro por empresa (opcional) |

**Valores conhecidos:** SIMPLES NACIONAL, LUCRO PRESUMIDO, LUCRO REAL, MEI, IMUNE, ISENTA, NAO INFORMADO

---

### cad_cli_regime (Regime Contabil)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | INT PK | ID |
| `regime` | VARCHAR | Descricao |

**Valores conhecidos:** CAIXA, COMPETENCIA, NAO INFORMADO

---

### cad_soc (Socios)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | INT PK | ID do socio |
| `nome` / `cad_soc_nome` | VARCHAR | Nome completo |
| `cpf` / `cad_soc_cpf` | VARCHAR | CPF |
| `qualificacao` / `cad_soc_qualificacao` | VARCHAR | Qualificacao |

---

### cad_soc_vin (Vinculo Socio-Cliente)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id_socio` / `socio_id` | INT FK | Referencia `cad_soc.id` |
| `cnpj_cliente` / `cad_cli_cnpj` | VARCHAR | CNPJ do cliente |
| `cliente` / `cad_cli_id` | INT FK | ID do cliente (alternativo) |
| `participacao` / `valor_participacao` | DECIMAL | Percentual de participacao |
| `id_empresa` | VARCHAR | Filtro por empresa |

---

### cad_for (Fornecedores)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| Colunas similares a GER_CAD_CLI | | |
| `cad_for_tip` | INT FK | Tipo (referencia cad_for_tip.id) |
| `cad_for_ris` | INT FK | Risco (referencia cad_for_ris.id) |

---

### Tabelas Auxiliares

| Tabela | Descricao |
|--------|-----------|
| `cad_for_tip` | Tipos de fornecedor (Produtos, Servicos, Produtos e Servicos) |
| `cad_for_ris` | Riscos de fornecedor (1=baixo, 2=medio, 3=alto) |
| `GER_CAD_CAR` | Cargos/funcoes |
| `CAD_CLI_VENCIMENTOS` | Vencimentos de obrigacoes do cliente |
| `CAD_CLI_ANDAMENTOS` | Andamentos/atividades do cliente |
| `CAD_CLI_ANDAMENTOS_TIPOS` | Tipos de andamento |
| `CRP_FERIAS` | Ferias dos colaboradores |
| `COM_ORC_CAD` | Orcamentos |

---

## Mapeamento para o Novo Sistema

| Campo Legado | Campo Prisma (Cliente) | Observacao |
|---|---|---|
| `cad_cli_razao` | `razaoSocial` | |
| `cad_cli_fantasia` | `nomeFantasia` | |
| `cad_cli_cnpj` / `cad_cli_cgc` | `documento` | Limpar formatacao |
| `situacao_nome` (via JOIN) | `situacao` | Mapeado para enum |
| `cad_cli_tipo` | `tipoCliente` | |
| `cad_cli_origem` | `origem` | |
| `grupo_nome` (via JOIN) | `grupo` | |
| `cad_cli_email` | `email` | |
| `cad_cli_tel` | `telefone` | |
| `cad_cli_end/num/bairro/etc` | `logradouro/numero/bairro/etc` | |
| `tributacao_nome` (via JOIN) | `tributacao` | Mapeado para TaxRegime enum |
| `regime_nome` (via JOIN) | `regime` | Mapeado para RegimeContabil enum |
| `cad_cli_ie` | `inscricaoEstadual` | |
| `cad_cli_im` | `inscricaoMunicipal` | |
| `cad_cli_data_entrada` | `dataEntrada` | |
| `cad_cli_data_saida` | `dataSaida` | |
| `cad_cli_*_con` (flags) | `areasContratadas` | Convertido para "Contabil;Fiscal;..." |
| `cad_cli_*_par` (textos) | `observacoes` | Concatenado com prefixos de area |
| `cad_cli_ativo` | `isActive` | 0=false, 1=true |

---

## Fonte dos Dados

- **Codigo-fonte v1:** `\\192.168.0.7\wwwroot\v4\`
- **Backend SERPRO2:** `C:\Users\wagner\Desktop\PROJETOS\SERPRO2\backend\src\services\`
- **Sistema local:** `http://192.168.0.58:5173/`
