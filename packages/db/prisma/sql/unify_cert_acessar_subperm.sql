-- #HLP0301 — Unifica as sub-permissões de acesso a certificados digitais.
--
-- 'download_arquivo' (baixar PFX) e 'ver_senha' (ver senha em claro) sempre são
-- necessárias juntas para usar o certificado, então viram uma única permissão:
-- 'acessar_certificados'.
--
-- Migração: qualquer usuário que tenha QUALQUER uma das duas antigas recebe a
-- unificada. As chaves antigas são removidas do JSON em todos os registros do
-- módulo (limpa também as que estavam como false).
UPDATE user_permissions
SET sub_permissions =
      (sub_permissions - 'download_arquivo' - 'ver_senha')
      || CASE
           WHEN (sub_permissions->>'download_arquivo')::boolean IS TRUE
             OR (sub_permissions->>'ver_senha')::boolean IS TRUE
           THEN jsonb_build_object('acessar_certificados', true)
           ELSE '{}'::jsonb
         END
WHERE module_slug = 'gestao-certificados'
  AND (sub_permissions ? 'download_arquivo' OR sub_permissions ? 'ver_senha');

-- Remove o módulo 'certificados' (Legalização) — resquício de implementação
-- inicial, sem página nem uso. O módulo em uso é 'gestao-certificados'.
DELETE FROM user_permissions WHERE module_slug = 'certificados';
