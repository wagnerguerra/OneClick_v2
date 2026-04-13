export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  )
}
