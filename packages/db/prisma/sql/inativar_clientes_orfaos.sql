-- ============================================================
-- Limpeza de clientes ÓRFÃOS (empresaId NULL) que duplicam uma cópia real com
-- empresa vinculada. Vieram do legado: importados sem empresa e depois recriados
-- COM empresa quando o multi-tenant entrou. Sujavam a lista e o seletor de
-- orçamento (o mesmo cliente aparecia 2x).
--
-- Ação (decisão do Wagner, 07/07/2026): INATIVAR (soft-delete) e VINCULAR cada
-- órfã ao tenant da sua cópia real (todas = Central Contábil). Não exclui nada —
-- soft-delete é reversível (restaurar). Os sócios das 5 órfãs que os têm seguem
-- anexados ao registro inativado (dado preservado, não perdido).
--
-- Idempotente: usa empresa_id IS NULL + deleted_at IS NULL como guarda; depois de
-- rodar, as linhas passam a ter empresa_id e deleted_at setados e deixam de casar
-- → re-execução é no-op. O empresa_id vem da PRÓPRIA cópia real (não hardcoded),
-- então funciona em qualquer ambiente (dev/prod).
-- ============================================================
UPDATE clientes a
   SET deleted_at = now(),
       empresa_id = (
         SELECT b.empresa_id FROM clientes b
          WHERE b.documento = a.documento
            AND b.empresa_id IS NOT NULL
            AND b.deleted_at IS NULL
          ORDER BY b.created_at
          LIMIT 1
       ),
       updated_at = now()
 WHERE a.empresa_id IS NULL
   AND a.deleted_at IS NULL
   AND a.documento <> ''
   AND EXISTS (
     SELECT 1 FROM clientes b
      WHERE b.documento = a.documento
        AND b.empresa_id IS NOT NULL
        AND b.deleted_at IS NULL
   );
