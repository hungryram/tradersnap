"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"

interface UserData {
  user: {
    email: string
    first_name: string | null
    last_name: string | null
    plan: string
    subscription_status: string
    onboarded: boolean
    created_at: string
  }
  usage: {
    messages: {
      used: number
      limit: number
    }
    screenshots: {
      used: number
      limit: number
    }
    favorites: {
      used: number
      limit: number
    }
    resetDate: string
  }
}

export default function AccountPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isLoadingPortal, setIsLoadingPortal] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    loadAccountData()
  }, [])

  async function loadAccountData() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push("/")
      return
    }

    // Save session to localStorage for extension to detect
    try {
      localStorage.setItem('trading_buddy_session', JSON.stringify(session))
    } catch (e) {
      console.error('Failed to save session to localStorage:', e)
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
      setFirstName(data.user.first_name || "")
      setLastName(data.user.last_name || "")
      setEmail(data.user.email)
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
      window.open(data.url, '_blank')
      setIsLoadingPortal(false)
      
    } catch (err) {
      console.error("Portal error:", err)
      setIsLoadingPortal(false)
      alert("Failed to open billing portal. Please try again.")
    }
  }

  async function saveProfile() {
    setIsSavingProfile(true)
    setProfileMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/")
        return
      }

      const origin = window.location.origin
      const response = await fetch(`${origin}/api/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          email: email !== userData?.user.email ? email : undefined
        })
      })

      if (!response.ok) throw new Error("Failed to update profile")

      const data = await response.json()
      setProfileMessage({ type: 'success', text: data.message })
      setIsEditingProfile(false)
      
      // Reload account data to refresh
      await loadAccountData()
      
    } catch (err) {
      console.error("Profile update error:", err)
      setProfileMessage({ type: 'error', text: "Failed to update profile" })
    } finally {
      setIsSavingProfile(false)
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

      const data = await response.json()

      if (!response.ok) {
        // If already subscribed, open billing portal instead
        if (data.redirectToPortal) {
          await openBillingPortal()
          return
        }
        throw new Error(data.error || "Failed to create checkout session")
      }

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

  const messagePercent = userData ? (userData.usage.messages.used / userData.usage.messages.limit) * 100 : 0
  const screenshotPercent = userData ? (userData.usage.screenshots.used / userData.usage.screenshots.limit) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="Snapchart" className="w-8 h-8" />
            <h1 className="text-xl font-bold text-slate-900">Snapchart</h1>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/dashboard/rules"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Rules
            </a>
            <a
              href="/dashboard/saved-messages"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Favorites
            </a>
            <a
              href="/dashboard/account"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              My Account
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
          {/* Profile Info */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Profile</h2>
              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
              )}
            </div>

            {profileMessage && (
              <div className={`mb-4 p-3 rounded-lg ${profileMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                <p className="text-sm">{profileMessage.text}</p>
              </div>
            )}

            {isEditingProfile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-1">
                      First Name
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      maxLength={50}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-1">
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      maxLength={50}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">Changing your email requires verification</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={saveProfile}
                    disabled={isSavingProfile}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-6 py-2 rounded-lg"
                  >
                    {isSavingProfile ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingProfile(false)
                      setFirstName(userData?.user.first_name || "")
                      setLastName(userData?.user.last_name || "")
                      setEmail(userData?.user.email || "")
                      setProfileMessage(null)
                    }}
                    disabled={isSavingProfile}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium px-6 py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <span className="text-sm text-slate-600">Name</span>
                  <p className="font-medium text-slate-900">
                    {userData?.user.first_name || userData?.user.last_name 
                      ? `${userData?.user.first_name || ''} ${userData?.user.last_name || ''}`.trim()
                      : <span className="text-slate-400 italic">Not set</span>
                    }
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Email</span>
                  <p className="font-medium text-slate-900">{userData?.user.email}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Plan</span>
                  <p className="font-medium text-slate-900 capitalize">
                    {userData?.user.plan === "pro" ? "Pro" : "Free"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Usage Today */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Usage Today</h2>
            <div className="space-y-4">
              {/* Messages */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Messages</span>
                  <span className="font-medium text-slate-900">
                    {userData?.usage.messages.used} / {userData?.usage.messages.limit}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(messagePercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Screenshots */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Chart Screenshots</span>
                  <span className="font-medium text-slate-900">
                    {userData?.usage.screenshots.used} / {userData?.usage.screenshots.limit}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(screenshotPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Reset info */}
              <p className="text-xs text-slate-500 mt-3">
                Usage resets daily at midnight UTC
              </p>

              {(messagePercent >= 80 || screenshotPercent >= 80) && userData?.user.plan === "free" && (
                <p className="text-xs text-amber-600">
                  ⚠️ You're running low on usage. Upgrade to Pro for 200 messages and 50 screenshots per day.
                </p>
              )}
            </div>
          </div>

          {/* Favorites */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Favorites</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">AI Context Limit</span>
                <span className="font-medium text-slate-900">
                  {userData?.usage.favorites.limit} favorites sent to AI
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {userData?.user.plan === "free" 
                  ? "Upgrade to Pro to send 20 favorites to the AI instead of 3"
                  : "The AI sees your 20 most recent favorites for better context"}
              </p>
            </div>
          </div>

          {/* Billing */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Billing</h2>
            
            {userData?.user.plan === "free" ? (
              <>
                <p className="text-sm text-slate-600 mb-4">
                  Upgrade to Pro for 200 messages and 50 chart screenshots per day, plus 20 favorites in AI context.
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
              Install the Snapchart extension to analyze your charts.
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

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 mt-12">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="flex justify-center gap-6 text-sm text-slate-600">
            <a href="https://www.snapchartapp.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">
              Privacy Policy
            </a>
            <span className="text-slate-400">|</span>
            <a href="https://www.snapchartapp.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
