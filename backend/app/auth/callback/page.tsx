"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    handleCallback()
  }, [])

  async function handleCallback() {
    try {
      // Exchange the code from URL for a session
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) throw error

      if (session) {
        // Check onboarding status
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.user.onboarded) {
            router.push("/dashboard/rules")
          } else {
            router.push("/onboarding")
          }
        } else {
          router.push("/onboarding")
        }
      } else {
        router.push("/")
      }
    } catch (error) {
      console.error("Auth callback error:", error)
      router.push("/")
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🔐</div>
        <p className="text-slate-600">Signing you in...</p>
      </div>
    </div>
  )
}
