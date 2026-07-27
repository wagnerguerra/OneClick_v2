-- Flag de tenant: exigir reautenticação (senha + justificativa) para ver a
-- senha do certificado e baixar o PFX (#HLP0301). Default true = comportamento
-- atual. Coluna NOT NULL com default, idempotente. Auditoria independe da flag.

ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "cert_reaut_obrigatoria" BOOLEAN NOT NULL DEFAULT true;
