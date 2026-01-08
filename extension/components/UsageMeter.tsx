import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

interface UsageData {
  messages: {
    used: number
    limit: number
  }
  screenshots: {
    used: number
    limit: number
  }
  resetDate: string
}

interface UsageMeterProps {
  session: any
  latestUsage?: { messages: number; screenshots: number; limits: any } // From chat API response
}

export function UsageMeter({ session, latestUsage }: UsageMeterProps) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (session) {
      fetchUsage()
    }
  }, [session])

  // Update usage when new data comes from chat API
  useEffect(() => {
    if (latestUsage) {
      setUsage({
        messages: {
          used: latestUsage.messages,
          limit: latestUsage.limits.maxMessages
        },
        screenshots: {
          used: latestUsage.screenshots,
          limit: latestUsage.limits.maxScreenshots
        },
        resetDate: new Date().toISOString()
      })
    }
  }, [latestUsage])

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
        setUsage(data.usage)
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

  const messagePercent = (usage.messages.used / usage.messages.limit) * 100
  const screenshotPercent = (usage.screenshots.used / usage.screenshots.limit) * 100
  const isNearLimit = messagePercent >= 80 || screenshotPercent >= 80
  const isAtLimit = messagePercent >= 100 || screenshotPercent >= 100

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
          <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-lg border border-slate-200 p-4 z-50">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Usage Today</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">💬 Messages</span>
                  <span className="text-sm font-medium text-slate-900">
                    {usage.messages.used} / {usage.messages.limit}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all rounded-full ${
                      messagePercent >= 100
                        ? "bg-red-500"
                        : messagePercent >= 80
                        ? "bg-amber-500"
                        : "bg-blue-600"
                    }`}
                    style={{ width: `${Math.min(messagePercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Screenshots */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">📸 Chart Screenshots</span>
                  <span className="text-sm font-medium text-slate-900">
                    {usage.screenshots.used} / {usage.screenshots.limit}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all rounded-full ${
                      screenshotPercent >= 100
                        ? "bg-red-500"
                        : screenshotPercent >= 80
                        ? "bg-amber-500"
                        : "bg-green-600"
                    }`}
                    style={{ width: `${Math.min(screenshotPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Warning Messages */}
              {isAtLimit && (
                <p className="text-xs text-red-600">
                  ⚠️ Daily limit reached. Resets at midnight UTC.
                </p>
              )}
              {isNearLimit && !isAtLimit && (
                <p className="text-xs text-amber-600">
                  ⚠️ Running low. Upgrade to Pro for 200 messages and 50 screenshots per day.
                </p>
              )}

              {/* Reset info */}
              <div className="pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  Usage resets daily at midnight UTC
                </p>
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
