import Pip from "./Pip"
import { SITE_URL } from "@/lib/urls"

// Centered dark layout for sign-in, welcome, onboarding and goodbye pages
export default function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-ink-bg text-ink-body flex flex-col">
      <header className="px-6 py-5">
        <a href={SITE_URL} className="inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <Pip size={30} />
          <span className="font-semibold tracking-tight">Pip</span>
        </a>
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16">
        <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>{children}</div>
      </main>
    </div>
  )
}
