"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import DashboardNav from "../components/DashboardNav"

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
  const [userPlan, setUserPlan] = useState<string>("free")

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
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

    await loadRulesets(session.access_token)
  }

  async function loadRulesets(token: string) {
    try {
      const origin = window.location.origin
      
      // Load user data to get plan
      const meResponse = await fetch(`${origin}/api/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      
      if (meResponse.ok) {
        const meData = await meResponse.json()
        setUserPlan(meData.user.plan)
      }
      
      const response = await fetch(`${origin}/api/rulesets`, {
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

      const origin = window.location.origin
      const response = await fetch(
        `${origin}/api/rulesets/${currentRuleset.id}`,
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

  async function handleSetPrimary() {
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

      const origin = window.location.origin
      const response = await fetch(
        `${origin}/api/rulesets/${currentRuleset.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            is_primary: true
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to set as primary")
      }

      setSuccess("Set as primary ruleset!")
      await loadRulesets(session.access_token)
      
    } catch (err) {
      console.error("Set primary error:", err)
      setError(err instanceof Error ? err.message : "Failed to set as primary")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveAsNew() {
    setError(null)
    setSuccess(null)

    // Prompt for new name
    const newName = prompt("Enter a name for the new ruleset:", `${rulesetName} - Copy`)
    
    if (!newName || newName.trim() === "") {
      setError("Ruleset name is required")
      return
    }

    setIsSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/")
        return
      }

      const origin = window.location.origin
      const response = await fetch(`${origin}/api/rulesets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: newName.trim(),
          rules_text: rulesText,
          is_primary: false
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save as new")
      }

      setSuccess("Saved as new ruleset!")
      await loadRulesets(session.access_token)
      
    } catch (err) {
      console.error("Save as new error:", err)
      setError(err instanceof Error ? err.message : "Failed to save as new")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this ruleset?")) {
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/")
        return
      }

      const origin = window.location.origin
      const response = await fetch(`${origin}/api/rulesets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error("Failed to delete ruleset")
      }

      setSuccess("Ruleset deleted!")
      await loadRulesets(session.access_token)
      
    } catch (err) {
      console.error("Delete error:", err)
      setError(err instanceof Error ? err.message : "Failed to delete")
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
      <DashboardNav />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Your Trading Rules and Strategy</h2>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-600 text-sm space-y-2">
                <p>The AI can't read your mind—it needs to understand your rules and strategy to coach you effectively.</p>
                <p className="font-mono text-xs">
                  <span className="text-green-600">✓ Good rule:</span> "Wait for 5-min candle close above resistance, then enter on next candle"<br />
                  <span className="text-red-600">✗ Weak rule:</span> "Be patient"
                </p>
                <p>Keep it simple. 3-5 clear rules beat 20 vague ones. You can always refine them as you learn what works.</p>
              </div>
              {userPlan && (
                <p className="text-sm text-slate-500 mt-2">
                  Rulesets: {rulesets.length}/{userPlan === "free" ? 3 : 20}
                </p>
              )}
            </div>
            {currentRuleset && rulesets.length > 1 && !currentRuleset.is_primary && (
              <button
                onClick={() => handleDelete(currentRuleset.id)}
                className="text-red-600 hover:text-red-700 text-sm px-3 py-1 border border-red-300 rounded hover:bg-red-50"
              >
                🗑️ Delete Ruleset
              </button>
            )}
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
              {rulesets.length > 1 && (
                <div>
                  <label htmlFor="ruleset-select" className="block text-sm font-medium text-slate-700 mb-2">
                    Select Ruleset
                  </label>
                  <select
                    id="ruleset-select"
                    value={currentRuleset.id}
                    onChange={(e) => {
                      const selected = rulesets.find(r => r.id === e.target.value)
                      if (selected) {
                        setCurrentRuleset(selected)
                        setRulesText(selected.rules_text)
                        setRulesetName(selected.name)
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {rulesets.map((ruleset) => (
                      <option key={ruleset.id} value={ruleset.id}>
                        {ruleset.name} {ruleset.is_primary && "(Primary)"}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1.5">Switch between rulesets anytime for different strategies or timeframes.</p>
                </div>
              )}

              {rulesets.length >= 3 && userPlan === "free" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <p className="text-sm text-slate-700">
                      <strong>💡 Free Plan Limit Reached</strong>
                      <br />
                      You've created {rulesets.length} rulesets (maximum for free plan).
                      <br />
                      Upgrade to Pro for up to 20 rulesets and 300 analyses per month.
                    </p>
                    <a
                      href="/dashboard/account"
                      className="ml-4 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Upgrade Now
                    </a>
                  </div>
                </div>
              )}
              
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
                  <span className="text-slate-500 text-xs ml-2">
                    ({rulesText.length}/{userPlan === 'pro' ? 5000 : 1000} characters)
                  </span>
                </label>
                <textarea
                  id="rules"
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  maxLength={userPlan === 'pro' ? 5000 : 1000}
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

              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-6 py-2 rounded-lg"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                
                {!currentRuleset.is_primary && (
                  <button
                    onClick={handleSetPrimary}
                    disabled={isSaving}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium px-6 py-2 rounded-lg"
                  >
                    Set as Primary
                  </button>
                )}
                
                <button
                  onClick={handleSaveAsNew}
                  disabled={isSaving}
                  className="bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Save as New
                </button>
              </div>
            </div>
          )}        </div>
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
