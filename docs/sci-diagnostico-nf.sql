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
-- (Resolvido — ver a seção 5C no fim: quem está frouxo é o faturamento.)
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
-- 3. OS TRÊS TESTES QUE APONTARAM O CULPADO (resultados na seção 5)
-- ---------------------------------------------------------------------

-- 3.1 SEM NENHUM FILTRO ALÉM DA EMPRESA E DA COMPETÊNCIA.
--     Mostra, por competência: quantas notas existem, quantas têm
--     BDDATASAIDA preenchida e como se distribuem por BDCODSITNF.
--     Resultado real: datas TODAS preenchidas e 99% das notas em
--     BDCODSITNF = 0. Nenhum dos dois filtros é o culpado — ver seção 5.
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
--     A consulta antiga só aceitava 'NFS', 'NFSE' e 'S'. Resultado real:
--     só NFe e NFCe. Nota de serviço não está aqui — está em
--     VEF_EMP_TMOVSER (ver 5B).
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
-- 5. RESULTADO — investigado no SCI em 10/08/2026 (ACAI BRASIL, 05–07/2026)
--
-- São DOIS problemas distintos, e nenhum dos dois está no SQL.
--
-- ---------------------------------------------------------------------
-- (A) NF ENTRADA e NF SAÍDA: o SQL sempre funcionou. O nome da chave é
--     que não batia.
--
--     As consultas rodadas na mão devolvem:
--       fisca_saida    -> 190 / 175 / 208  (mai / jun / jul)
--       fisca_entrada  ->  26 /  22 /  35
--
--     Mas o `sci_metrics.py` publica esses números sob as chaves
--     `fisca_saida` / `fisca_entrada` (nome herdado do SERPRO2), enquanto
--     o resto do sistema lê `nf_saida` / `nf_entrada`:
--       sci.service.ts:196-197        metrics.nf_entrada / metrics.nf_saida
--       cliente.service.ts:1050       INDICADORES = [... 'nf_entrada', 'nf_saida' ...]
--
--     A chave não existia, virava `[]` e a média saía zero. Sem erro, sem
--     log — só o zero. Os dois indicadores nunca chegaram nem à baseline
--     nem à tabela cliente_erp_snapshots. Conferido em produção:
--       SELECT indicador, count(*) FROM cliente_erp_snapshots GROUP BY 1;
--       -> só lancamentos, vidas e faturamento. Nenhum nf_*.
--
--     Corrigido com um de-para na fronteira (SciService.normalizarMetricas
--     + ALIAS em salvarSnapshotsSci). Depois da correção, o mesmo período:
--       nfEntrada  0 -> 27,67      nfSaida  0 -> 191
--       (lancamentos 872 e faturamento 267.020,47 seguem idênticos)
--
-- ---------------------------------------------------------------------
-- (B) NF PRESTADO e NF TOMADO: procuravam no lugar errado.
--
--     As consultas caçavam a nota de serviço dentro das views de mercadoria
--     (VEF_EMP_TMOVSAI / VEF_EMP_TMOVENT), filtrando
--     BDESPECIE IN ('NFS','NFSE','S'). Nunca acharam nada — em ~9 milhões de
--     saídas não existe UMA linha com essas espécies.
--
--     O SCI guarda serviço numa view própria: VEF_EMP_TMOVSER (274.602
--     linhas). Quem separa prestado de tomado é BDTIPLAN, com domínio em
--     VEF_BASE_TTIPLANSER:
--       SELECT * FROM VEF_BASE_TTIPLANSER;
--         (1, 0, 'Emitidos')   -> prestado
--         (2, 1, 'Recebidos')  -> tomado
--
--     Espécie ali é texto livre — NFSE, NFS-E, NFS-e, nfse, NFS, NFSe... —
--     e por isso NÃO entra no filtro: a view inteira já é de serviço. Era
--     esse campo, aliás, que a consulta antiga tentava usar como peneira.
--
--     Corrigido em sci_metrics.py (_query_servico). Conferido:
--       ACAI BRASIL (indústria)   prestado   0 · tomado 17,67  (19/27/7)
--       LANGUAGE IDIOMAS (escola) prestado  79 · tomado 11
--     A indústria só toma serviço e a escola presta — o resultado bate com
--     a natureza de cada uma, que é o teste que importa.

-- ---------------------------------------------------------------------
-- (C) DE QUEBRA: o filtro de situação do FATURAMENTO é que está frouxo.
--
--     Domínio real de BDCODSITNF (base inteira, saídas):
--       0 -> 9.313.106   (normal)      5 -> 42.202     2 -> 39.642 (canceladas)
--       8 -> 5.995       6 -> 2.491    4 -> 172        1 -> 18     3 -> 3
--
--     As contagens de NF usam `<> 2` e estão certas: excluem cancelada.
--     O faturamento usa `<> 1` — e o código 1 tem 18 linhas na base toda.
--     Na prática ele não exclui nada; as canceladas entram na soma. Não
--     distorce hoje porque nota cancelada vem com BDVALORNOTA = 0, mas o
--     filtro está errado e é uma armadilha se isso mudar.
--     (Todo o resto do SERPRO2 usa `<> 1` também — o mesmo engano copiado.)
-- =====================================================================


-- =====================================================================
-- 6. NOTA DE SERVIÇO — a view certa (usada pela correção)
-- =====================================================================

-- 6.1 Domínio que separa prestado de tomado
SELECT * FROM VEF_BASE_TTIPLANSER;
--   (1, 0, 'Emitidos')  ·  (2, 1, 'Recebidos')

-- 6.2 Serviço PRESTADO (BDTIPLAN = 0) — trocar 0 por 1 para TOMADO
SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
       EXTRACT(YEAR FROM A.BDDATAEMISSAO) AS ANO,
       EXTRACT(MONTH FROM A.BDDATAEMISSAO) AS MES,
       COUNT(*) AS MOVIMENTACAO
FROM VEF_EMP_TMOVSER A
INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
WHERE A.BDDATAEMISSAO BETWEEN '2026-05-01' AND '2026-07-31'
  AND A.BDTIPLAN = 0
  AND (A.BDCODSITNF IS NULL OR A.BDCODSITNF <> 2)
  AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = '10203600000100'
GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
         EXTRACT(YEAR FROM A.BDDATAEMISSAO), EXTRACT(MONTH FROM A.BDDATAEMISSAO)
ORDER BY 1, 4, 5;

-- 6.3 Por que a espécie não serve de filtro aqui: é texto livre.
SELECT BDESPECIE, COUNT(*) FROM VEF_EMP_TMOVSER GROUP BY BDESPECIE ORDER BY 2 DESC;
--   NFSE 108.297 · NFS-E 54.962 · NFS-e 42.386 · NFS 33.377 · nfse 17.690
--   NFSe 8.242 · '1' 4.152 · nfs 2.700 · (null) 2.397 · ND 58 · NFFSE 36
