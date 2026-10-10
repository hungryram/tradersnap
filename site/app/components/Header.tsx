"use client"

import { useState } from "react"
import { APP_URL, CHROME_STORE_URL } from "../links"

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/guide", label: "Guide" },
]

export default function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-ink-border/60 bg-ink-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <img src="/icon.png" alt="" className="h-7 w-7" />
          <span className="font-semibold tracking-tight">Snapchart</span>
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm text-ink-text">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-ink-body transition-colors">{item.label}</a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <a href={APP_URL} className="text-sm text-ink-text hover:text-ink-body transition-colors">Log in</a>
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            Add to Chrome
          </a>
        </div>

        <button
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-ink-border text-ink-text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-ink-border/60 px-4 pb-4">
          <nav className="flex flex-col py-2 text-ink-text">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="py-2.5 hover:text-ink-body">{item.label}</a>
            ))}
            <a href={APP_URL} className="py-2.5 hover:text-ink-body">Log in</a>
          </nav>
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-blue-600 py-2.5 text-center font-medium text-white">
            Add to Chrome, free
          </a>
        </div>
      )}
    </header>
  )
}
