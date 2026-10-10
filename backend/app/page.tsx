"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { finishLogin } from "@/lib/after-login"
import { signOutExtension } from "@/lib/extension-bridge"
import AuthShell from "./components/AuthShell"
import AuthPanel from "./components/AuthPanel"

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // The extension's sign-out sends people here with ?signout=true
    if (searchParams.get("signout") === "true") {
      Promise.all([supabase.auth.signOut(), signOutExtension()]).finally(() => {
        window.history.replaceState({}, "", "/")
        setChecking(false)
      })
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) router.replace(await finishLogin(session))
      else setChecking(false)
    })
  }, [searchParams])

  if (checking) return <AuthShell><div /></AuthShell>

  return (
    <AuthShell>
      {searchParams.get("deleted") === "1" && (
        <p className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          Your account and data have been deleted. Thanks for trying Snapchart.
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Sign in to Snapchart</h1>
      <p className="text-sm text-ink-text mb-8">New here? Any option below creates your free account.</p>
      <AuthPanel />
    </AuthShell>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<AuthShell><div /></AuthShell>}>
      <HomeContent />
    </Suspense>
  )
}
