"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { signOutExtension } from "@/lib/extension-bridge"

const MAIN_NAV = [
  { href: "/dashboard", label: "Today", icon: SunIcon },
  { href: "/dashboard/journal", label: "Journal", icon: BookIcon },
  { href: "/dashboard/rules", label: "Rules", icon: ListIcon },
  { href: "/dashboard/saved-messages", label: "Saved", icon: StarIcon },
  { href: "/dashboard/account", label: "Account", icon: UserIcon },
]

const HELP_NAV = [
  { href: "/dashboard/guide", label: "Guide" },
  { href: "/dashboard/faq", label: "FAQ" },
  { href: "https://discord.com/invite/fuxFDEsDph", label: "Discord", external: true },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const supabase = createClient()
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = "/"
      else setEmail(session.user.email ?? null)
    })
  }, [])

  useEffect(() => setMenuOpen(false), [pathname])

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
      await signOutExtension()
    } finally {
      window.location.href = "/"
    }
  }

  const isActive = (href: string) => href === "/dashboard" ? pathname === href : pathname?.startsWith(href)

  const nav = (
    <nav className="flex h-full flex-col">
      <a href="/dashboard" className="flex items-center gap-2.5 px-3 py-2 mb-6">
        <img src="/icon.png" alt="" className="w-7 h-7" />
        <span className="font-semibold tracking-tight text-ink-body">Snapchart</span>
      </a>

      <ul className="space-y-0.5">
        {MAIN_NAV.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <a
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive(href) ? "bg-ink-elevated text-ink-body" : "text-ink-text hover:bg-ink-elevated/60 hover:text-ink-body"}`}
            >
              <Icon />
              {label}
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-6 px-3">
        <a
          href="https://www.tradingview.com/chart/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors"
        >
          Open TradingView ↗
        </a>
      </div>

      <div className="mt-auto pt-8">
        <ul className="space-y-0.5 mb-4">
          {HELP_NAV.map(({ href, label, external }) => (
            <li key={href}>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${isActive(href) ? "text-ink-body" : "text-ink-muted hover:text-ink-body"}`}
              >
                {label}{external ? " ↗" : ""}
              </a>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink-border px-3 pt-4">
          <div className="truncate text-xs text-ink-muted mb-2" title={email ?? ""}>{email}</div>
          <button onClick={signOut} className="text-sm text-ink-text hover:text-ink-body">Sign out</button>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-ink-bg text-ink-body">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-ink-border bg-ink-bg px-3 py-5 md:block">
        {nav}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-border bg-ink-bg px-4 py-3 md:hidden">
        <a href="/dashboard" className="flex items-center gap-2">
          <img src="/icon.png" alt="" className="w-6 h-6" />
          <span className="font-semibold">Snapchart</span>
        </a>
        <button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-ink-text hover:bg-ink-elevated" aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-ink-border bg-ink-bg px-3 py-5">{nav}</aside>
        </div>
      )}

      <main className="md:pl-60">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">{children}</div>
      </main>
    </div>
  )
}

// Small inline icons (no icon library in this project)
function Svg({ children }: { children: React.ReactNode }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}
function SunIcon() { return <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg> }
function BookIcon() { return <Svg><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M8 7h8M8 11h6" /></Svg> }
function ListIcon() { return <Svg><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></Svg> }
function StarIcon() { return <Svg><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></Svg> }
function UserIcon() { return <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Svg> }
