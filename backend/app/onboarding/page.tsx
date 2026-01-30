"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { RULE_TEMPLATES, type RuleTemplate } from "@/lib/rule-templates"

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [rulesetName, setRulesetName] = useState("My Trading Rules")
  const [rulesText, setRulesText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  function applyTemplate(template: RuleTemplate) {
    setRulesText(template.rules)
    setRulesetName(template.name)
  }

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push("/")
      return
    }

    // Check if already onboarded
    const origin = window.location.origin
    const response = await fetch(`${origin}/api/me`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      // Temporarily disabled to test templates
      if (data.user.onboarded) {
        router.push("/dashboard/rules")
        return
      }
    }

    setIsLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push("/")
        return
      }

      // Create first ruleset
      const origin = window.location.origin
      const rulesetResponse = await fetch(`${origin}/api/rulesets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: rulesetName,
          rules_text: rulesText,
          is_primary: true
        })
      })

      if (!rulesetResponse.ok) {
        const error = await rulesetResponse.json()
        throw new Error(error.error || "Failed to create ruleset")
      }

      // Mark user as onboarded - call API endpoint to update profile
      const updateResponse = await fetch(`${origin}/api/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ onboarded: true })
      })

      if (!updateResponse.ok) {
        throw new Error("Failed to mark as onboarded")
      }

      // Redirect to dashboard
      router.push("/dashboard/rules")
      
    } catch (err) {
      console.error("Onboarding error:", err)
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.")
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
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Welcome to Snapchart! 👋
            </h1>
            <p className="text-slate-600">
              Before you start using the extension, let's set up your trading rules.
              The AI will analyze your charts against these rules to help you stay disciplined.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                Ruleset Name
              </label>
              <input
                id="name"
                type="text"
                value={rulesetName}
                onChange={(e) => setRulesetName(e.target.value)}
                placeholder="e.g., Scalping Strategy, Swing Trading Rules"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="rules" className="block text-sm font-medium text-slate-700">
                  Your Trading Rules
                </label>
                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showTemplates ? "Hide Templates" : "📋 Use Template"}
                </button>
              </div>

              {showTemplates && (
                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  {RULE_TEMPLATES.map((template, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applyTemplate(template)}
                      className="text-left p-3 bg-white border border-slate-300 hover:border-blue-500 hover:shadow-sm rounded-lg transition-all"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900 text-sm">
                          {template.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          template.category === 'beginner' ? 'bg-green-100 text-green-700' :
                          template.category === 'trend' ? 'bg-blue-100 text-blue-700' :
                          template.category === 'structure' ? 'bg-purple-100 text-purple-700' :
                          template.category === 'mean-reversion' ? 'bg-orange-100 text-orange-700' :
                          'bg-pink-100 text-pink-700'
                        }`}>
                          {template.category === 'mean-reversion' ? 'mean reversion' : template.category}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        {template.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <textarea
                id="rules"
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                placeholder="Click 'Use Template' above to get started, or enter your own trading rules here.

Example:
- Only trade with the trend on higher timeframe
- Wait for pullback to key support/resistance
- Enter only after bullish/bearish confirmation candle
- Stop loss below/above swing low/high
- Risk max 1% per trade"
                rows={12}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                required
                minLength={10}
              />
              <p className="mt-2 text-xs text-slate-500">
                💡 Be specific! The AI will check your charts against these exact rules.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isSaving ? "Saving..." : "Continue to Dashboard"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
