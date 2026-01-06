import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

interface UsageData {
  used: number
  limit: number
  period_start: string
}

interface UsageMeterProps {
  session: any
}

export function UsageMeter({ session }: UsageMeterProps) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (session) {
      fetchUsage()
    }
  }, [session])

  async function fetchUsage() {
    if (!session?.access_token) return

    try {
      const response = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUsage({
          used: data.usage.used,
          limit: data.usage.limit,
          period_start: data.usage.period_start
        })
      }
    } catch (err) {
      console.error("Failed to fetch usage:", err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading || !usage) {
    return null
  }

  const percentage = (usage.used / usage.limit) * 100
  const isNearLimit = percentage >= 80
  const isAtLimit = percentage >= 100

  return (
    <div className="relative">
      {/* Usage Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg transition-colors ${
          isAtLimit
            ? "text-red-600 hover:bg-red-50"
            : isNearLimit
            ? "text-amber-600 hover:bg-amber-50"
            : "text-slate-600 hover:bg-slate-100"
        }`}
        title="View usage"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v20M2 12h20" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        {isNearLimit && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full"></span>
        )}
        {isAtLimit && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Popover Content */}
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 p-4 z-50">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Usage This Month</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Chart Analyses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Chart Analyses</span>
                  <span className="text-sm font-medium text-slate-900">
                    {usage.used} / {usage.limit}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all rounded-full ${
                      isAtLimit
                        ? "bg-red-500"
                        : isNearLimit
                        ? "bg-amber-500"
                        : "bg-blue-600"
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>

                {/* Warning Messages */}
                {isAtLimit && (
                  <p className="text-xs text-red-600 mt-2">
                    ⚠️ Limit reached. Upgrade to continue analyzing charts.
                  </p>
                )}
                {isNearLimit && !isAtLimit && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ Running low on analyses. Consider upgrading your plan.
                  </p>
                )}
              </div>

              {/* Chat Usage (Unlimited for now) */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Chat Messages</span>
                  <span className="text-sm font-medium text-green-600">Unlimited ✓</span>
                </div>
              </div>

              {/* Upgrade Button */}
              <a
                href={`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/account`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Manage Plan
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
