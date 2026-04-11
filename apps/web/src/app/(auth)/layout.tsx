export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo — branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-[#5ea3cb] to-[#4a8db5] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative z-10 text-center text-white px-12">
          <h1 className="text-5xl font-bold mb-4">OneClick</h1>
          <p className="text-xl text-white/80">Gestão Descomplicada</p>
          <div className="mt-8 text-white/60 text-sm max-w-md mx-auto">
            <p>Plataforma completa de ERP/CRM para sua empresa. Cadastros, corporativo e qualidade em um só lugar.</p>
          </div>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
