"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"

interface Ruleset {
  id: string
  name: string
  rules_text: string
  is_primary: boolean
  updated_at: string
}

export default function RulesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [rulesets, setRulesets] = useState<Ruleset[]>([])
  const [currentRuleset, setCurrentRuleset] = useState<Ruleset | null>(null)
  const [rulesText, setRulesText] = useState("")
  const [rulesetName, setRulesetName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push("/")
      return
    }

    await loadRulesets(session.access_token)
  }

  async function loadRulesets(token: string) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rulesets`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) throw new Error("Failed to load rulesets")

      const data = await response.json()
      setRulesets(data.rulesets)

      // Load primary ruleset by default
      const primary = data.rulesets.find((r: Ruleset) => r.is_primary)
      if (primary) {
        setCurrentRuleset(primary)
        setRulesText(primary.rules_text)
        setRulesetName(primary.name)
      }

      setIsLoading(false)
    } catch (err) {
      console.error("Load error:", err)
      setError("Failed to load rules")
      setIsLoading(false)
    }
  }

  async function handleSave() {
    setError(null)
    setSuccess(null)
    setIsSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/")
        return
      }

      if (!currentRuleset) return

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/rulesets/${currentRuleset.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            name: rulesetName,
            rules_text: rulesText
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save")
      }

      setSuccess("Rules saved successfully!")
      await loadRulesets(session.access_token)
      
    } catch (err) {
      console.error("Save error:", err)
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    )
  }

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
              href="/dashboard/account"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Account
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
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Your Trading Rules</h2>
            <p className="text-slate-600 text-sm">
              The AI analyzes your charts against these rules. Update them anytime.
            </p>
          </div>

          {!currentRuleset ? (
            <div className="text-center py-12">
              <p className="text-slate-600 mb-4">No rules found. Create your first ruleset.</p>
              <button
                onClick={() => router.push("/onboarding")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
              >
                Create Rules
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                  Ruleset Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={rulesetName}
                  onChange={(e) => setRulesetName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="rules" className="block text-sm font-medium text-slate-700 mb-2">
                  Rules
                </label>
                <textarea
                  id="rules"
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  rows={16}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">{success}</p>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-6 py-2 rounded-lg"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
