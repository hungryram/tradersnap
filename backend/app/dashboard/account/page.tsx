"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"

interface UserData {
  user: {
    email: string
    plan: string
    subscription_status: string
    onboarded: boolean
    created_at: string
  }
  usage: {
    used: number
    limit: number
    period_start: string
  }
}

export default function AccountPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isLoadingPortal, setIsLoadingPortal] = useState(false)

  useEffect(() => {
    loadAccountData()
  }, [])

  async function loadAccountData() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push("/")
      return
    }

    try {
      const origin = window.location.origin
      const response = await fetch(`${origin}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) throw new Error("Failed to load account data")

      const data = await response.json()
      setUserData(data)
      setIsLoading(false)
    } catch (err) {
      console.error("Load error:", err)
      setIsLoading(false)
    }
  }

  async function openBillingPortal() {
    setIsLoadingPortal(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/")
        return
      }

      const origin = window.location.origin
      const response = await fetch(
        `${origin}/api/billing/portal`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      )

      if (!response.ok) throw new Error("Failed to create portal session")

      const data = await response.json()
      window.location.href = data.url
      
    } catch (err) {
      console.error("Portal error:", err)
      setIsLoadingPortal(false)
      alert("Failed to open billing portal. Please try again.")
    }
  }

  async function upgradeToProPlan() {
    setIsLoadingPortal(true)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/")
        return
      }

      const origin = window.location.origin
      const response = await fetch(`${origin}/api/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO,
          plan: "pro"
        })
      })

      if (!response.ok) throw new Error("Failed to create checkout session")

      const data = await response.json()
      window.location.href = data.url
      
    } catch (err) {
      console.error("Checkout error:", err)
      alert("Failed to start checkout")
    } finally {
      setIsLoadingPortal(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    )
  }

  const usagePercent = userData ? (userData.usage.used / userData.usage.limit) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <h1 className="text-xl font-bold text-slate-900">Trading Buddy</h1>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/dashboard/rules"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Rules
            </a>
            <button
              onClick={async () => {
                try {
                  await supabase.auth.signOut()
                  localStorage.removeItem('trading_buddy_session')
                  window.location.href = '/'
                } catch (error) {
                  console.error('Sign out error:', error)
                  window.location.href = '/'
                }
              }}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="space-y-6">
          {/* Account Info */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Account</h2>
            <div className="space-y-3">
              <div>
                <span className="text-sm text-slate-600">Email</span>
                <p className="font-medium text-slate-900">{userData?.user.email}</p>
              </div>
              <div>
                <span className="text-sm text-slate-600">Plan</span>
                <p className="font-medium text-slate-900 capitalize">
                  {userData?.user.plan || "Free"}
                </p>
              </div>
              <div>
                <span className="text-sm text-slate-600">Status</span>
                <p className="font-medium text-slate-900 capitalize">
                  {userData?.user.subscription_status || "Inactive"}
                </p>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Usage This Month</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Chart Analyses</span>
                <span className="font-medium text-slate-900">
                  {userData?.usage.used} / {userData?.usage.limit}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              {usagePercent >= 80 && (
                <p className="text-xs text-amber-600">
                  ⚠️ You're running low on analyses. Consider upgrading your plan.
                </p>
              )}
            </div>
          </div>

          {/* Billing */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Billing</h2>
            
            {userData?.user.plan === "free" ? (
              <>
                <p className="text-sm text-slate-600 mb-4">
                  Upgrade to Pro for 20 rulesets and 300 chart analyses per month.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={upgradeToProPlan}
                    disabled={isLoadingPortal}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium"
                  >
                    {isLoadingPortal ? "Loading..." : "Upgrade to Pro"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600 mb-4">
                  Manage your subscription, payment methods, and billing history.
                </p>
                <button
                  onClick={openBillingPortal}
                  disabled={isLoadingPortal}
                  className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white px-6 py-2 rounded-lg text-sm font-medium"
                >
                  {isLoadingPortal ? "Loading..." : "Manage Billing"}
                </button>
              </>
            )}
          </div>

          {/* Extension */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Chrome Extension</h2>
            <p className="text-sm text-slate-600 mb-4">
              Install the Trading Buddy extension to analyze your charts.
            </p>
            <a
              href="chrome://extensions"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium"
            >
              Open Extensions Page
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
