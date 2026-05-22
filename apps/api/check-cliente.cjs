const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
;(async () => {
  const c = await prisma.cliente.findFirst({
    where: { documento: { contains: '11318082' } },
    select: {
      id: true,
      razaoSocial: true,
      documento: true,
      nfseDistEnabled: true,
      nfseDistCertificadoId: true,
      nfseDistUltimoNsu: true,
      nfseDistSyncStatus: true,
      nfseDistSyncRequestedAt: true,
      nfseDistProgresso: true,
    },
  })
  console.log('CLIENTE:', JSON.stringify(c, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2))
  if (c) {
    const certs = await prisma.certificadoDigital.findMany({
      where: { clienteId: c.id },
      select: {
        id: true, tipo: true, status: true, arquivado: true,
        arquivoPath: true, senhaCifrada: true, expiraEm: true, cnpj: true,
      },
    })
    console.log('CERTS:', JSON.stringify(certs.map(x => ({ ...x, senhaCifrada: x.senhaCifrada ? '<set>' : null })), null, 2))
  }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
