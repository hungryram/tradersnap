"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-client"

interface FavoritedMessage {
  id: string
  role: string
  content: string
  created_at: string
  is_favorited: boolean
}

export default function SavedMessagesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [messages, setMessages] = useState<FavoritedMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    checkAuth()
    loadFavoritedMessages()
  }, [])

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
        setMessages(data.messages || [])
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

  const filteredMessages = messages.filter(msg =>
    msg.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Saved Messages</h1>
            <p className="text-slate-600 text-sm">
              Messages you've favorited for the AI to remember
            </p>
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
            {filteredMessages.map((msg) => (
              <div
                key={msg.id}
                className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow"
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
                  </div>
                  <button
                    onClick={() => unfavoriteMessage(msg.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                    title="Unfavorite"
                  >
                    ⭐
                  </button>
                </div>
                <div className="text-slate-900 prose prose-sm max-w-none">
                  {msg.content.split('\n').map((line, i) => {
                    // Parse markdown-style bold
                    const parts = line.split(/(\*\*.*?\*\*)/g)
                    return (
                      <p key={i} className="mb-2 last:mb-0">
                        {parts.map((part, j) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={j}>{part.slice(2, -2)}</strong>
                          }
                          return <span key={j}>{part}</span>
                        })}
                      </p>
                    )
                  })}
                </div>
              </div>
            ))}
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
