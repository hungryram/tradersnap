import { DISCORD_URL } from "../links"
import Pip from "./Pip"

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/guide", label: "Guide" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
]

export default function Footer() {
  return (
    <footer className="border-t border-ink-border/60 mt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <Pip size={30} />
            <span className="font-semibold tracking-tight">Snapchart</span>
          </a>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-text">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-ink-body transition-colors">{l.label}</a>
            ))}
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink-body transition-colors">
              <img src="/discord.svg" alt="" className="h-3.5 w-3.5" /> Discord
            </a>
          </nav>
        </div>
        <p className="mt-10 text-xs leading-relaxed text-ink-muted max-w-4xl">
          Snapchart is a discipline tool, not financial advice. It does not tell you when to enter or exit trades. It helps you reflect on your own
          decisions and trading rules. Feedback is AI-generated and may be inaccurate, incomplete or mistaken, and is for educational purposes only.
          Trading involves substantial risk. <strong className="text-ink-text">You are solely responsible for your trades and outcomes.</strong>
        </p>
        <p className="mt-4 text-xs text-ink-muted">© {new Date().getFullYear()} Snapchart</p>
      </div>
    </footer>
  )
}
