# Variáveis de Ambiente

Referência completa das envs do projeto. O `CLAUDE.md` referencia este arquivo.

## Database
```env
DATABASE_URL=postgresql://...    # use 127.0.0.1, NÃO localhost (Node 22 + IPv6 quebra Docker)
REDIS_URL=redis://...            # idem — 127.0.0.1
```

## Auth (Better Auth)
```env
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Stripe Billing
```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Storage (S3 / Minio)
```env
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

## Email (SMTP / Resend)
```env
RESEND_API_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sistema@central-rnc.com.br
SMTP_PASS=
```

## Legacy MySQL (OneClick Fiscal / SERPRO)
```env
LEGACY_DB_HOST=localhost
LEGACY_DB_USER=root
LEGACY_DB_NAME=oneclick_fiscal_serpro
LEGACY_DB_PORT=3001
```

## ERP SCI (Firebird)
```env
SCI_DSN=\\192.168.0.2\s\SCI\banco\VSCI.SDB
SCI_USER=INTEGRACOES
SCI_CHARSET=UTF8
```

## Certificados / Fiscal
```env
CERTIFICADO_KEK=                  # chave KEK para criptografar senha do PFX
NFE_DIST_ENABLED=false            # habilita cron diário NFe SEFAZ (manual sempre roda)
NFE_DIST_CRON=30 3 * * *          # default 03:30 America/Sao_Paulo
NFSE_DIST_ENABLED=false           # habilita cron diário NFS-e Nacional
NFSE_DIST_CRON=45 3 * * *         # default 03:45 America/Sao_Paulo
```

## App
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
API_URL=http://localhost:4000
```

## Sistema Legado (referência)
- **Código-fonte**: `C:\Users\wagner\Desktop\PROJETOS\SERPRO2`
- **Stack**: Node.js + Vanilla JS + Bootstrap 5 + MySQL
- **URL local**: `http://192.168.0.58:5173/`
- **Banco**: MySQL `oneclick_fiscal_serpro` na porta 3001

## Integrações Externas
- **SMTP**: Gmail para e-mails transacionais
- **BrasilAPI**: Consulta de CNPJ e CEP
- **Omie**: ERP de alguns clientes (integração futura)
- **SCI (Firebird)**: ERP contábil em `\\192.168.0.2`, charset UTF8
