export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo — branding com imagem de fundo */}
      <div className="hidden lg:flex lg:w-1/2 items-end justify-start relative overflow-hidden">
        {/* Camada 0: Imagem de fundo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/auth-bg.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Camada 1: Gradiente sobre a imagem */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a3a52]/85 via-[#1e4d6b]/75 to-[#2a6f97]/80" />

        {/* Camada 2: Padrão geométrico sutil */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.04]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Camada 3: Orbs decorativos */}
        <div className="absolute inset-0">
          <div className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full bg-[#5ea3cb]/15 blur-[100px]" />
          <div className="absolute top-1/3 right-0 w-[400px] h-[400px] rounded-full bg-[#4ecdc4]/10 blur-[120px]" />
          <div className="absolute -bottom-32 left-1/4 w-[600px] h-[600px] rounded-full bg-[#2a6f97]/20 blur-[100px]" />
        </div>

        {/* Camada 4: Linhas decorativas diagonais */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.03]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="0" y1="100%" x2="60%" y2="0" stroke="white" strokeWidth="1" />
          <line x1="20%" y1="100%" x2="80%" y2="0" stroke="white" strokeWidth="1" />
          <line x1="40%" y1="100%" x2="100%" y2="0" stroke="white" strokeWidth="1" />
          <line x1="60%" y1="100%" x2="100%" y2="20%" stroke="white" strokeWidth="1" />
        </svg>

        {/* Conteúdo */}
        <div className="relative z-10 px-12 pb-16 max-w-lg">
          <p className="text-[1.75rem] leading-snug font-light text-white/90 tracking-wide">
            Plataforma completa de ERP/CRM para sua empresa.
            <span className="block mt-2 text-white/50 text-lg font-normal">
              Cadastros, corporativo e qualidade em um só lugar.
            </span>
          </p>
        </div>

        {/* Rodapé discreto */}
        <div className="absolute bottom-6 left-12 text-white/25 text-xs">
          &copy; {new Date().getFullYear()} OneClick
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
