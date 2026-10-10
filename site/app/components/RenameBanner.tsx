"use client"

import { useEffect, useState } from "react"

// Shown only to visitors redirected from the old domain (?from=snapchart).
// Remove a few months after the rename (October 2026).
export default function RenameBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let dismissed = false
    try { dismissed = sessionStorage.getItem("pip_rename_banner") === "dismissed" } catch {}
    if (!dismissed && new URLSearchParams(window.location.search).get("from") === "snapchart") setShow(true)
  }, [])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    try { sessionStorage.setItem("pip_rename_banner", "dismissed") } catch {}
  }

  return (
    <div className="border-b border-brand-500/30 bg-brand-500/10" role="status">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 text-sm sm:px-6">
        <p className="text-ink-body">
          <span className="font-semibold">Snapchart is now Pip, your AI trading coach.</span>{" "}
          <span className="text-ink-text">Same account, same rules, new name.</span>
        </p>
        <button onClick={dismiss} aria-label="Dismiss" className="-mr-1 rounded px-2 text-lg leading-none text-ink-text hover:text-ink-body">
          &times;
        </button>
      </div>
    </div>
  )
}
