-- =====================================================================
-- Diagnóstico: por que NF Entrada / Saída / Prestado / Tomado voltam ZERO
-- do "Obter parâmetros iniciais", enquanto Lançamentos, Faturamento e
-- Vidas voltam preenchidos.
--
-- Firebird (SCI). Trocar :CNPJ pelo CNPJ só com dígitos e :DATAI/:DATAF
-- pelo período (YYYY-MM-DD). Exemplo do caso relatado:
--   :CNPJ  = 11318082000133   (ACAI BRASIL)
--   :DATAI = 2026-05-01
--   :DATAF = 2026-07-31
--
-- Fonte das consultas: apps/api/src/cliente/sci_metrics.py (portado do
-- SERPRO2, erp_sci/sci_metrics.py).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. O QUE O SISTEMA RODA HOJE (as quatro que voltam zero)
-- ---------------------------------------------------------------------

-- 1.1 NF SAÍDA  → query_fisca_saida
SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
       EXTRACT(YEAR FROM A.BDDATASAIDA) AS ANO,
       EXTRACT(MONTH FROM A.BDDATASAIDA) AS MES,
       COUNT(*) AS MOVIMENTACAO
FROM VEF_EMP_TMOVSAI A
INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
WHERE A.BDDATASAIDA BETWEEN '2026-05-01' AND '2026-07-31'
  AND A.BDCODSITNF <> 2
  AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
         EXTRACT(YEAR FROM A.BDDATASAIDA), EXTRACT(MONTH FROM A.BDDATASAIDA)
ORDER BY 1, 4, 5;

-- 1.2 NF ENTRADA  → query_fisca_entrada
SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
       EXTRACT(YEAR FROM A.BDDATAENTRADAENT) AS ANO,
       EXTRACT(MONTH FROM A.BDDATAENTRADAENT) AS MES,
       COUNT(*) AS MOVIMENTACAO
FROM VEF_EMP_TMOVENT A
INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
WHERE A.BDDATAENTRADAENT BETWEEN '2026-05-01' AND '2026-07-31'
  AND A.BDCODSITNF <> 2
  AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
         EXTRACT(YEAR FROM A.BDDATAENTRADAENT), EXTRACT(MONTH FROM A.BDDATAENTRADAENT)
ORDER BY 1, 4, 5;

-- 1.3 NF PRESTADO  → query_nf_prestado  (saída + espécie de serviço)
SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
       EXTRACT(YEAR FROM A.BDDATASAIDA) AS ANO,
       EXTRACT(MONTH FROM A.BDDATASAIDA) AS MES,
       COUNT(*) AS MOVIMENTACAO
FROM VEF_EMP_TMOVSAI A
INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
WHERE A.BDDATASAIDA BETWEEN '2026-05-01' AND '2026-07-31'
  AND A.BDCODSITNF <> 2
  AND A.BDESPECIE IN ('NFS', 'NFSE', 'S')
  AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
         EXTRACT(YEAR FROM A.BDDATASAIDA), EXTRACT(MONTH FROM A.BDDATASAIDA)
ORDER BY 1, 4, 5;

-- 1.4 NF TOMADO  → query_nf_tomado  (entrada + espécie de serviço)
SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
       EXTRACT(YEAR FROM A.BDDATAENTRADAENT) AS ANO,
       EXTRACT(MONTH FROM A.BDDATAENTRADAENT) AS MES,
       COUNT(*) AS MOVIMENTACAO
FROM VEF_EMP_TMOVENT A
INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
WHERE A.BDDATAENTRADAENT BETWEEN '2026-05-01' AND '2026-07-31'
  AND A.BDCODSITNF <> 2
  AND A.BDESPECIE IN ('NFS', 'NFSE', 'S')
  AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
         EXTRACT(YEAR FROM A.BDDATAENTRADAENT), EXTRACT(MONTH FROM A.BDDATAENTRADAENT)
ORDER BY 1, 4, 5;


-- ---------------------------------------------------------------------
-- 2. A CONSULTA QUE FUNCIONA, PARA COMPARAR
--
-- O faturamento sai da MESMA view da NF Saída (VEF_EMP_TMOVSAI) e vem
-- preenchido. Logo a view TEM linhas para este cliente — o que derruba a
-- contagem de notas é um dos dois filtros em que as duas divergem:
--
--   faturamento : BDREFLAN (competência AAAAMM)   +  BDCODSITNF <> 1
--   nf saída    : BDDATASAIDA (data)              +  BDCODSITNF <> 2
--
-- Note a incoerência: uma exclui situação 1, a outra exclui situação 2.
-- As duas não podem estar certas — se "cancelada" é 1, o filtro das notas
-- está jogando fora justamente as válidas.
-- ---------------------------------------------------------------------

-- 2.1 FATURAMENTO  → query_faturamento (esta traz dados hoje)
SELECT a.BDCODEMP, b.BDNOMEMP, b.BDCNPJEMP,
       CAST(SUBSTRING(CAST(a.BDREFLAN AS VARCHAR(6)) FROM 1 FOR 4) AS INTEGER) AS ANO,
       CAST(SUBSTRING(CAST(a.BDREFLAN AS VARCHAR(6)) FROM 5 FOR 2) AS INTEGER) AS MES,
       SUM(a.BDVALORNOTA) AS MOVIMENTACAO
FROM VEF_EMP_TMOVSAI a
INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = b.BDCODEMP
WHERE REPLACE(REPLACE(REPLACE(b.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
  AND CAST(a.BDREFLAN AS VARCHAR(6)) BETWEEN '202605' AND '202607'
  AND a.BDCODSITNF <> 1
GROUP BY a.BDCODEMP, b.BDNOMEMP, b.BDCNPJEMP, a.BDREFLAN
ORDER BY a.BDREFLAN;


-- ---------------------------------------------------------------------
-- 3. OS TRÊS TESTES QUE APONTAM O CULPADO
-- ---------------------------------------------------------------------

-- 3.1 SEM NENHUM FILTRO ALÉM DA EMPRESA E DA COMPETÊNCIA.
--     Mostra, por competência: quantas notas existem, quantas têm
--     BDDATASAIDA preenchida e como se distribuem por BDCODSITNF.
--     Se BDDATASAIDA vier nula/1899 → o problema é o filtro de DATA.
--     Se tudo estiver em BDCODSITNF = 2 → o problema é o filtro de SITUAÇÃO.
SELECT a.BDREFLAN,
       a.BDCODSITNF,
       COUNT(*) AS QTD,
       COUNT(a.BDDATASAIDA) AS COM_DATA_SAIDA,
       MIN(a.BDDATASAIDA) AS DATA_MIN,
       MAX(a.BDDATASAIDA) AS DATA_MAX,
       SUM(a.BDVALORNOTA) AS VALOR
FROM VEF_EMP_TMOVSAI a
INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = b.BDCODEMP
WHERE REPLACE(REPLACE(REPLACE(b.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
  AND CAST(a.BDREFLAN AS VARCHAR(6)) BETWEEN '202605' AND '202607'
GROUP BY a.BDREFLAN, a.BDCODSITNF
ORDER BY a.BDREFLAN, a.BDCODSITNF;

-- 3.2 O MESMO PARA AS ENTRADAS.
SELECT a.BDREFLAN,
       a.BDCODSITNF,
       COUNT(*) AS QTD,
       COUNT(a.BDDATAENTRADAENT) AS COM_DATA_ENTRADA,
       MIN(a.BDDATAENTRADAENT) AS DATA_MIN,
       MAX(a.BDDATAENTRADAENT) AS DATA_MAX
FROM VEF_EMP_TMOVENT a
INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = b.BDCODEMP
WHERE REPLACE(REPLACE(REPLACE(b.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
  AND CAST(a.BDREFLAN AS VARCHAR(6)) BETWEEN '202605' AND '202607'
GROUP BY a.BDREFLAN, a.BDCODSITNF
ORDER BY a.BDREFLAN, a.BDCODSITNF;

-- 3.3 ESPÉCIES REALMENTE USADAS (para NF prestado / tomado).
--     A consulta só aceita 'NFS', 'NFSE' e 'S'. Se a base gravar 'NFSe',
--     'SE', '99' ou com espaços, a lista está curta demais.
SELECT a.BDESPECIE, COUNT(*) AS QTD
FROM VEF_EMP_TMOVSAI a
INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = b.BDCODEMP
WHERE REPLACE(REPLACE(REPLACE(b.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '11318082000133'
  AND CAST(a.BDREFLAN AS VARCHAR(6)) BETWEEN '202605' AND '202607'
GROUP BY a.BDESPECIE
ORDER BY 2 DESC;


-- ---------------------------------------------------------------------
-- 4. DOMÍNIO DE BDCODSITNF NA BASE INTEIRA
--    Diz qual código é "normal" e qual é "cancelada" pelo peso de cada um.
--    O código com a esmagadora maioria das linhas é o normal.
-- ---------------------------------------------------------------------
SELECT BDCODSITNF, COUNT(*) AS QTD
FROM VEF_EMP_TMOVSAI
GROUP BY BDCODSITNF
ORDER BY 2 DESC;

-- Se existir a tabela de domínio no SCI, ela responde direto:
-- SELECT * FROM TSITUACAONF;
-- SELECT * FROM VEF_TSITNF;


-- =====================================================================
-- 5. DUAS SUSPEITAS, AMBAS VINDAS DO PRÓPRIO LEGADO
--
-- (a) O FILTRO DE SITUAÇÃO ESTÁ INVERTIDO.
--     Varredura no SERPRO2: TODO o resto do sistema exclui a situação 1.
--       backend/src/services/relatorioCfopService.js:299  BDCODSITNF <> 1  (entradas)
--       backend/src/services/relatorioCfopService.js:304  BDCODSITNF <> 1  (saídas)
--       apps/relatorio-cfop-faturado/sciService.js:341    BDCODSITNF <> 1
--       apps/relatorio-cfop-faturado/sciService.js:353    BDCODSITNF <> 1
--       erp_sci/sci_metrics.py:287 (faturamento)          BDCODSITNF <> 1  "desconsidera canceladas"
--     Só as quatro contagens de NF usam `<> 2`:
--       erp_sci/sci_metrics.py:191, 211, 231, 252
--     Se 1 é a cancelada — como o comentário do próprio faturamento diz —,
--     então `<> 2` está descartando as notas VÁLIDAS e mantendo as canceladas.
--     O teste 3.1 confirma: se a maioria das linhas estiver em BDCODSITNF = 2,
--     é isso.
--
-- (b) A DATA DA SAÍDA PODE ESTAR VAZIA.
--     O relatório de CFOP do legado consulta as saídas por BDDATAEMISSAO
--     (relatorioCfopService.js:304), não por BDDATASAIDA. Nota de serviço
--     (NFS-e) costuma não ter "saída". Se COM_DATA_SAIDA vier 0 no teste 3.1,
--     o BETWEEN elimina tudo antes de qualquer outro filtro.
--
-- As duas causas podem coexistir. O teste 3.1 separa uma da outra numa
-- consulta só: a coluna COM_DATA_SAIDA responde (b) e a quebra por
-- BDCODSITNF responde (a).
--
-- Correção depende do resultado — não mexi em sci_metrics.py sem a
-- confirmação, porque trocar o filtro no escuro passaria a contar nota
-- cancelada como movimento e inflaria o parâmetro de todo mundo.
-- =====================================================================
