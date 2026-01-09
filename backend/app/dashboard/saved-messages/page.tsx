"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import DashboardNav from "../components/DashboardNav"
import { marked } from "marked"
import DOMPurify from "dompurify"

interface FavoritedMessage {
  id: string
  role: string
  content: string | any
  created_at: string
  is_favorited: boolean
}

export default function SavedMessagesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [messages, setMessages] = useState<FavoritedMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free')
  const [favoritesLimit, setFavoritesLimit] = useState(3)

  useEffect(() => {
    checkAuth()
    loadUserProfile()
    loadFavoritedMessages()
  }, [])

  async function loadUserProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${window.location.origin}/api/me`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setUserPlan(data.user.plan)
        setFavoritesLimit(data.usage.favorites.limit)
      }
    } catch (error) {
      console.error("Error loading user profile:", error)
    }
  }

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push("/")
    }
  }

  async function loadFavoritedMessages() {
    setIsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${window.location.origin}/api/chat/favorites`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        
        // Parse JSON content for analysis messages
        const parsedMessages = (data.messages || []).map((msg: FavoritedMessage) => {
          let content = msg.content
          
          // Parse JSON content for analysis messages
          if (msg.role === 'assistant' && typeof content === 'string') {
            try {
              const parsed = JSON.parse(content)
              // Check if it's an analysis response (has setup_status field)
              if (parsed.setup_status) {
                content = parsed
              }
            } catch (e) {
              // Not JSON or parsing failed - keep as string
            }
          }
          
          return {
            ...msg,
            content: content
          }
        })
        
        setMessages(parsedMessages)
      }
    } catch (error) {
      console.error("Error loading favorited messages:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function unfavoriteMessage(messageId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${window.location.origin}/api/chat/favorite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            messageId,
            isFavorited: false
          })
        }
      )

      if (response.ok) {
        // Remove from local state
        setMessages(prev => prev.filter(msg => msg.id !== messageId))
      }
    } catch (error) {
      console.error("Error unfavoriting message:", error)
    }
  }

  const filteredMessages = messages.filter(msg => {
    const searchLower = searchTerm.toLowerCase()
    if (typeof msg.content === 'string') {
      return msg.content.toLowerCase().includes(searchLower)
    } else if (typeof msg.content === 'object') {
      // Search in analysis object fields
      const analysisText = [
        msg.content.summary,
        msg.content.setup_status,
        ...(msg.content.bullets || []),
        msg.content.behavioral_nudge
      ].filter(Boolean).join(' ').toLowerCase()
      return analysisText.includes(searchLower)
    }
    return false
  })

  const renderMarkdown = (text: string): string => {
    const rawHtml = marked.parse(text, { breaks: true, gfm: true }) as string
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['href', 'target', 'rel']
    })
  }

  const renderAnalysis = (analysis: any) => {
    return (
      <div className="space-y-4">
        {/* Setup Status */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Setup Status:</span>
          <span className={`px-2 py-1 rounded text-sm font-medium ${
            analysis.setup_status === 'valid' ? 'bg-green-100 text-green-700' :
            analysis.setup_status === 'potentially_valid' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {analysis.setup_status}
          </span>
        </div>

        {/* Validity Estimate */}
        {analysis.validity_estimate && (
          <div>
            <p className="text-sm font-medium mb-1">Validity Estimate:</p>
            <p className="text-sm text-slate-700">
              {analysis.validity_estimate.percent_range?.[0]}-{analysis.validity_estimate.percent_range?.[1]}% 
              ({analysis.validity_estimate.confidence} confidence)
            </p>
            <p className="text-sm text-slate-600 mt-1">{analysis.validity_estimate.reason}</p>
          </div>
        )}

        {/* Summary */}
        {analysis.summary && (
          <div>
            <p className="text-sm font-medium mb-1">Summary:</p>
            <p className="text-sm text-slate-700">{analysis.summary}</p>
          </div>
        )}

        {/* Bullets */}
        {analysis.bullets && analysis.bullets.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Key Points:</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
              {analysis.bullets.map((bullet: string, i: number) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Levels to Watch */}
        {analysis.levels_to_watch && analysis.levels_to_watch.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Levels to Watch:</p>
            <div className="space-y-2">
              {analysis.levels_to_watch.map((level: any, i: number) => (
                <div key={i} className="text-sm border-l-2 border-slate-300 pl-3">
                  <p className="font-medium">{level.label} ({level.type})</p>
                  <p className="text-slate-600 text-xs">{level.why_it_matters}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Behavioral Nudge */}
        {analysis.behavioral_nudge && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm font-medium text-blue-900 mb-1">💡 Trading Tip:</p>
            <p className="text-sm text-blue-800">{analysis.behavioral_nudge}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardNav />

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Saved Messages</h1>
            <p className="text-slate-600 text-sm">
              Messages you've favorited for the AI to remember
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-900">
              {messages.length}/{favoritesLimit}
            </div>
            <div className="text-xs text-slate-500">
              {userPlan === 'pro' ? 'Pro Plan' : 'Free Plan'}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search saved messages..."
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Messages List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-slate-600 mt-4">Loading saved messages...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
            <div className="text-4xl mb-4">⭐</div>
            <p className="text-slate-600 mb-2">
              {searchTerm ? "No messages match your search" : "No saved messages yet"}
            </p>
            <p className="text-slate-500 text-sm">
              {!searchTerm && "Star messages in the chat to save them here"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMessages.map((msg, index) => {
              // Only the most recent N messages (based on limit) are sent to AI
              const isActiveInAI = index < favoritesLimit
              
              return (
              <div
                key={msg.id}
                className={`bg-white rounded-lg border p-6 shadow-sm transition-all ${
                  isActiveInAI 
                    ? 'border-slate-200 hover:shadow-md' 
                    : 'border-slate-100 opacity-50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      msg.role === 'user' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {msg.role === 'user' ? 'You' : 'Coach'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(msg.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {!isActiveInAI && (
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                        Not sent to AI
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => unfavoriteMessage(msg.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                    title="Unfavorite"
                  >
                    ⭐
                  </button>
                </div>
                <div className="text-slate-900">
                  {typeof msg.content === 'string' ? (
                    <div 
                      className="text-sm leading-relaxed"
                      style={{
                        overflowWrap: 'break-word',
                        wordWrap: 'break-word'
                      }}
                    >
                      <div 
                        className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-1"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    </div>
                  ) : (
                    renderAnalysis(msg.content)
                  )}
                </div>
              </div>
            )
            })}
          </div>
        )}
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
