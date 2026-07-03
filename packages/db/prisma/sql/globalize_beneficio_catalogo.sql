-- ============================================================
-- Torna o CATÁLOGO de benefícios fiscais GLOBAL (empresa_id = NULL).
--
-- O catálogo é dado de REFERÊNCIA compartilhado (tipos de benefício —
-- COMPENSAÇÃO, etc.). Entradas criadas com um empresa_id específico ficavam
-- invisíveis para usuários de outras empresas (e para não-master em geral),
-- deixando o dropdown "Selecione o benefício" vazio no cadastro do cliente.
--
-- Combinado com o filtro do listCatalogo (empresa_id IS NULL OR ...), isto
-- deixa o catálogo visível a todos. NÃO afeta os VÍNCULOS por cliente
-- (beneficio_fiscal_cliente), que continuam isolados por empresa.
--
-- Idempotente: após a 1ª execução, nada mais casa em "IS NOT NULL".
-- ============================================================
UPDATE beneficio_fiscal_catalogo
   SET empresa_id = NULL
 WHERE empresa_id IS NOT NULL;
