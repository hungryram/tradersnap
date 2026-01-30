'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function DashboardNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const supabase = createClient()

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      localStorage.removeItem('trading_buddy_session')
      window.location.href = '/'
    } catch (error) {
      console.error('Sign out error:', error)
      window.location.href = '/'
    }
  }

  const navLinks = [
    { href: 'https://www.snapchartapp.com/', label: 'Home', external: true },
    { href: '/dashboard/rules', label: 'Rules' },
    { href: '/dashboard/saved-messages', label: 'Favorites' },
    { href: '/dashboard/guide', label: 'Start Here' },
    { href: '/dashboard/faq', label: 'FAQ' },
    { href: 'https://discord.com/invite/fuxFDEsDph', label: 'Discord', external: true, icon: '/discord.svg', cta: true },
    { href: '/dashboard/account', label: 'My Account' },
  ]

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="https://www.snapchartapp.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/icon.png" alt="Snapchart" className="w-8 h-8" />
            <h1 className="text-xl font-bold text-slate-900">Snapchart</h1>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            {navLinks.map((link) => (
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={link.cta 
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                    : "text-sm text-slate-600 hover:text-slate-900"
                  }
                >
                  {link.icon && <img src={link.icon} alt="" className={link.cta ? "w-4 h-4 brightness-0 invert" : "w-4 h-4"} />}
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className={`text-sm ${
                    pathname === link.href
                      ? 'text-slate-900 font-medium'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {link.label}
                </a>
              )
            ))}
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Sign Out
            </button>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900"
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 space-y-2 border-t border-slate-200 pt-4">
            {navLinks.map((link) => (
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={link.cta
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors justify-center"
                    : "block text-sm text-slate-600 hover:text-slate-900 py-2"
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.icon && <img src={link.icon} alt="" className={link.cta ? "w-4 h-4 brightness-0 invert" : "w-4 h-4"} />}
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className={`block text-sm py-2 ${
                    pathname === link.href
                      ? 'text-slate-900 font-medium'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              )
            ))}
            <button
              onClick={() => {
                handleSignOut()
                setMobileMenuOpen(false)
              }}
              className="block w-full text-left text-sm text-slate-600 hover:text-slate-900 py-2"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
