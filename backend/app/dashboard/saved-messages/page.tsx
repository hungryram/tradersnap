"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"
import { marked } from "marked"
import DOMPurify from "dompurify"
import { SkeletonCard } from "../components/ui"

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
            analysis.setup_status === 'valid' ? 'bg-green-500/15 text-green-300' :
            analysis.setup_status === 'potentially_valid' ? 'bg-yellow-500/15 text-yellow-300' :
            'bg-red-500/15 text-red-300'
          }`}>
            {analysis.setup_status}
          </span>
        </div>

        {/* Validity Estimate */}
        {analysis.validity_estimate && (
          <div>
            <p className="text-sm font-medium mb-1">Validity Estimate:</p>
            <p className="text-sm text-ink-text">
              {analysis.validity_estimate.percent_range?.[0]}-{analysis.validity_estimate.percent_range?.[1]}% 
              ({analysis.validity_estimate.confidence} confidence)
            </p>
            <p className="text-sm text-ink-text mt-1">{analysis.validity_estimate.reason}</p>
          </div>
        )}

        {/* Summary */}
        {analysis.summary && (
          <div>
            <p className="text-sm font-medium mb-1">Summary:</p>
            <p className="text-sm text-ink-text">{analysis.summary}</p>
          </div>
        )}

        {/* Bullets */}
        {analysis.bullets && analysis.bullets.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Key Points:</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-ink-text">
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
                <div key={i} className="text-sm border-l-2 border-ink-border pl-3">
                  <p className="font-medium">{level.label} ({level.type})</p>
                  <p className="text-ink-text text-xs">{level.why_it_matters}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Behavioral Nudge */}
        {analysis.behavioral_nudge && (
          <div className="bg-brand-500/10 border border-brand-500/30 rounded p-3">
            <p className="text-sm font-medium text-brand-200 mb-1">💡 Trading Tip:</p>
            <p className="text-sm text-brand-200">{analysis.behavioral_nudge}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>

      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-body mb-2">Saved for Pip</h1>
            <p className="text-ink-text text-sm max-w-xl">
              Pip keeps these in mind in every conversation: your rules of thumb, lessons, things you never want to repeat. Save a message in the chat
              with <span className="text-ink-body">Save for Pip</span> under it.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-ink-body">
              {messages.length}/{favoritesLimit}
            </div>
            <div className="text-xs text-ink-muted">
              saved{userPlan === 'free' ? <> · <a href="/dashboard/account#plans" className="text-brand-300 hover:text-brand-200">Pro saves 20</a></> : null}
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
            className="w-full px-4 py-3 border border-ink-border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* Messages List */}
        {isLoading ? (
          <div className="space-y-4" role="status" aria-label="Loading saved messages">
            {[0, 1, 2].map(i => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-12 bg-ink-surface rounded-lg border border-ink-border">
            <p className="text-ink-text mb-2">
              {searchTerm ? "No saved messages match your search." : "Nothing saved yet."}
            </p>
            <p className="text-ink-muted text-sm max-w-md mx-auto">
              {!searchTerm && "Hover over any message in the chat and click Save for Pip. Pip will remember it in every conversation after that."}
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
                className={`bg-ink-surface rounded-lg border p-6 shadow-sm transition-all ${
                  isActiveInAI 
                    ? 'border-ink-border' 
                    : 'border-ink-border opacity-50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      msg.role === 'user' 
                        ? 'bg-brand-500/15 text-brand-300' 
                        : 'bg-green-500/15 text-green-300'
                    }`}>
                      {msg.role === 'user' ? 'You' : 'Pip'}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {new Date(msg.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {!isActiveInAI && (
                      <span className="px-2 py-0.5 rounded text-xs bg-ink-elevated text-ink-text" title="Pip uses your most recent saves up to your plan's limit">
                        Over your limit, Pip isn't using this
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => unfavoriteMessage(msg.id)}
                    className="rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-red-500/10 hover:text-red-300"
                    title="Pip will stop using this message"
                  >
                    Remove
                  </button>
                </div>
                <div className="text-ink-body">
                  {typeof msg.content === 'string' ? (
                    <div 
                      className="text-sm leading-relaxed"
                      style={{
                        overflowWrap: 'break-word',
                        wordWrap: 'break-word'
                      }}
                    >
                      <div 
                        className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-1"
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
    </div>
  )
}
