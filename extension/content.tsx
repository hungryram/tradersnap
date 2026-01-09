import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useRef, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ChartOverlay } from "./ChartOverlay"
import { ChartLightbox } from "./ChartLightbox"
import { analytics } from "~lib/analytics"
import { marked } from "marked"
import DOMPurify from "dompurify"

import styleText from "data-text:~style.css"

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = styleText
  return style
}

const supabase = createBrowserClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!
)

export const config: PlasmoCSConfig = {
  matches: [
    // Admin dashboard (for session testing)
    "https://admin.snapchartapp.com/*",
    // Trading platforms
    "*://*.tradingview.com/*",
    "*://*.tradovate.com/*",
    "*://*.thinkorswim.com/*",
    "*://*.tdameritrade.com/*",
    "*://*.ninjatrader.com/*",
    "*://*.tradestation.com/*",
    "*://*.interactivebrokers.com/*",
    "*://*.etrade.com/*",
    "*://*.schwab.com/*",
    "*://*.fidelity.com/*",
    "*://*.robinhood.com/*",
    "*://*.webull.com/*",
    "*://*.tastytrade.com/*",
    "*://*.tastyworks.com/*",
    "*://*.metatrader4.com/*",
    "*://*.metatrader5.com/*",
    "*://*.ctrader.com/*",
    "*://*.tradier.com/*",
    "*://*.lightspeed.com/*",
    "*://*.speedtrader.com/*",
    "*://*.topstepx.com/*",
    "*://*.rithmic.com/*",
    // Crypto exchanges with charts
    "*://*.binance.com/*",
    "*://*.coinbase.com/*",
    "*://*.kraken.com/*",
    "*://*.bybit.com/*"
  ],
  all_frames: false
}

// Instead of inline script injection, we'll check localStorage directly from content script
// This runs in extension context but can still access the page's localStorage via chrome APIs

const TradingBuddyWidget = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [inputText, setInputText] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [lastChartImage, setLastChartImage] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 384, height: 600 })
  const [isResizing, setIsResizing] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [showOverlays, setShowOverlays] = useState<{[key: number]: boolean}>({})
  const [lightboxData, setLightboxData] = useState<{imageUrl: string, drawings: any[], messageIndex: number} | null>(null)
  const [session, setSession] = useState<any>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [messageOffset, setMessageOffset] = useState(0)
  const [currentUsage, setCurrentUsage] = useState<any>(null) // Track usage from chat responses
  const [showUsage, setShowUsage] = useState(true) // Toggle for usage progress bars - open by default
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const [timeoutEndTime, setTimeoutEndTime] = useState<number | null>(null)
  const [timeoutReason, setTimeoutReason] = useState<string>('')
  const [, setForceUpdate] = useState(0) // Force re-render for countdown
  const [glowingMessageId, setGlowingMessageId] = useState<string | null>(null)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [tabId] = useState(() => `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isInitialLoadRef = useRef(true)
  const skipNextScrollRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Function to load chat history from database
  const loadChatHistoryFromDB = async () => {
    const result = await chrome.storage.local.get('supabase_session')
    if (!result.supabase_session) return
    
    try {
      const historyResponse = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/chat/history?limit=20&offset=0`,
        {
          headers: {
            "Authorization": `Bearer ${result.supabase_session.access_token}`
          }
        }
      )

      if (historyResponse.ok) {
        const { messages: dbMessages } = await historyResponse.json()
        
        // If we got 20 messages, there might be more
        setHasMoreMessages(dbMessages.length === 20)
        setMessageOffset(20)
        
        // Convert DB format to UI format
        const formattedMessages = dbMessages.map((msg: any) => {
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
            id: msg.id,
            type: msg.role === 'user' ? 'user' : 'assistant',
            content: content,
            timestamp: new Date(msg.created_at),
            isFavorited: msg.is_favorited || false
          }
        })
        
        setMessages(formattedMessages)
        
        // Update cache
        chrome.storage.local.set({ chat_messages: formattedMessages.slice(-20) })
      }
    } catch (error) {
      console.error('[Content] Error loading chat history:', error)
    }
  }

  // Handle scroll to show/hide scroll-to-bottom button
  const handleScroll = () => {
    if (!messagesContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    setShowScrollButton(!isNearBottom)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Format timestamp like iPhone messages
  const formatMessageTime = (timestamp: Date) => {
    const now = new Date()
    const msgDate = new Date(timestamp)
    const diffMs = now.getTime() - msgDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    // Less than 1 hour: show "X min ago" or "Just now"
    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    
    // Same day: show time like "2:30 PM"
    if (msgDate.toDateString() === now.toDateString()) {
      return msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    
    // Yesterday
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (msgDate.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    }
    
    // Older: show date
    return msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  // Load messages, theme, and session from storage on mount
  useEffect(() => {
    const loadData = async () => {
      const result = await chrome.storage.local.get(['chat_messages', 'theme', 'textSize', 'supabase_session', 'timeout_end'])
      
      // Check for active timeout
      if (result.timeout_end) {
        const now = Date.now()
        const endTime = result.timeout_end.endTime
        const reason = result.timeout_end.reason
        
        if (endTime > now) {

          setIsTimedOut(true)
          setTimeoutEndTime(endTime)
          setTimeoutReason(reason || 'Take a break to reset')
        } else {
          // Timeout expired, clear it

          chrome.storage.local.remove('timeout_end')
        }
      }
      
      // Load cached messages for instant display
      if (result.chat_messages) {
        setMessages(result.chat_messages)
      }
      
      if (result.theme) {
        setTheme(result.theme)
      }
      
      if (result.textSize) {
        setTextSize(result.textSize)
      }
      
      if (result.supabase_session) {

        setSession(result.supabase_session)

        // Fetch initial usage data
        try {
          const meResponse = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/me`, {
            headers: {
              Authorization: `Bearer ${result.supabase_session.access_token}`
            }
          })
          if (meResponse.ok) {
            const meData = await meResponse.json()
            if (meData.usage) {
              setCurrentUsage({
                messages: meData.usage.messages.used,
                screenshots: meData.usage.screenshots.used,
                limits: {
                  maxMessages: meData.usage.messages.limit,
                  maxScreenshots: meData.usage.screenshots.limit
                }
              })
            }
          }
        } catch (error) {
          console.error('[Content] Failed to fetch initial usage:', error)
        }

        // Fetch full chat history from Supabase (initial load: 20 messages)
        setIsLoadingHistory(true)
        try {
          await loadChatHistoryFromDB()
        } finally {
          setIsLoadingHistory(false)
        }
      }
    }
    loadData()

    // Listen for session updates from chrome.storage
    const handleStorageChange = (changes: any, areaName: string) => {
      if (areaName === 'local' && changes.supabase_session) {

        setSession(changes.supabase_session.newValue)
      }
      
      // Listen for chat sync events from other tabs
      if (areaName === 'local' && changes.chat_sync) {
        const syncEvent = changes.chat_sync.newValue
        if (syncEvent?.action === 'message_sent' && syncEvent.tabId !== tabId) {
          // Reload chat history from database (only if message came from another tab)
          loadChatHistoryFromDB()
        }
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  // Check if this is first launch
  useEffect(() => {
    const checkFirstLaunch = async () => {
      const result = await chrome.storage.local.get(['has_seen_welcome'])
      if (!result.has_seen_welcome) {
        setShowWelcomeModal(true)
      }
    }
    checkFirstLaunch()
  }, [])

  // Timeout countdown timer
  useEffect(() => {
    if (!isTimedOut || !timeoutEndTime) return

    const interval = setInterval(() => {
      const now = Date.now()
      if (now >= timeoutEndTime) {
        // Timeout expired, unlock chat

        setIsTimedOut(false)
        setTimeoutEndTime(null)
        setTimeoutReason('')
        chrome.storage.local.remove('timeout_end')
        clearInterval(interval)
      } else {
        // Force re-render to update countdown display
        setForceUpdate(prev => prev + 1)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isTimedOut, timeoutEndTime])

  // Listen for login messages from backend (no polling!)
  useEffect(() => {
    // Only run on admin domain
    if (window.location.origin !== process.env.PLASMO_PUBLIC_API_URL) {
      return
    }

    const checkLocalStorage = () => {
      try {
        const stored = localStorage.getItem('trading_buddy_session')
        
        if (stored) {
          const session = JSON.parse(stored)
          
          // Check if session is expired or about to expire (within 5 minutes)
          const expiresAt = session.expires_at
          const now = Date.now() / 1000
          const fiveMinutes = 5 * 60
          
          if (expiresAt && expiresAt > now) {
            setSession(session)
            try {
              chrome.storage.local.set({ supabase_session: session })
            } catch (err) {
              if (err instanceof Error && err.message.includes('Extension context invalidated')) {
                return
              }
              throw err
            }
            
            // If expiring soon, log a warning
            if (expiresAt - now < fiveMinutes) {
              console.warn('[Content] Session expiring soon! Please refresh the page.')
            }
          } else {
            localStorage.removeItem('trading_buddy_session')
            try {
              chrome.storage.local.remove('supabase_session')
            } catch (err) {
              if (err instanceof Error && err.message.includes('Extension context invalidated')) {
                return
              }
              throw err
            }
            setSession(null)
          }
        } else {
          // No session in localStorage (signed out) - clear chrome.storage too
          try {
            chrome.storage.local.remove('supabase_session')
          } catch (err) {
            if (err instanceof Error && err.message.includes('Extension context invalidated')) {
              return
            }
            throw err
          }
          setSession(null)
        }
      } catch (e) {
        // Extension context invalidated (extension reloaded) - silently ignore in production
        if (e instanceof Error && e.message.includes('Extension context invalidated')) {
          // User needs to reload the page after extension update
          return
        }
        console.error('[Content] Failed to parse localStorage session:', e)
      }
    }
    
    // Check once on mount
    checkLocalStorage()
    
    // Limited fallback polling (5 checks over 10 seconds, then stop)
    // This ensures session syncs during login since storage events don't fire in same tab
    let checksRemaining = 5
    const fallbackIntervalId = setInterval(() => {
      checksRemaining--
      checkLocalStorage()
      if (checksRemaining === 0) {
        clearInterval(fallbackIntervalId)
      }
    }, 2000)
    
    // Listen for storage events (cross-tab session sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trading_buddy_session' && e.newValue) {
        try {
          const session = JSON.parse(e.newValue)
          setSession(session)
          try {
            chrome.storage.local.set({ supabase_session: session })
          } catch (err) {
            if (err instanceof Error && err.message.includes('Extension context invalidated')) {
              return
            }
            throw err
          }
        } catch (err) {
          console.error('[Content] Failed to parse storage session:', err)
        }
      }
    }
    
    // Listen for login messages from the website
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      
      if (event.data.type === 'TRADING_BUDDY_LOGIN' && event.data.session) {
        const session = event.data.session
        setSession(session)
        try {
          chrome.storage.local.set({ supabase_session: session })
        } catch (err) {
          if (err instanceof Error && err.message.includes('Extension context invalidated')) {
            return
          }
          throw err
        }
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('message', handleMessage)
    
    return () => {
      clearInterval(fallbackIntervalId)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  // Save messages to storage whenever they change (limit to last 20 to prevent quota issues)
  useEffect(() => {
    if (messages.length > 0) {
      // Keep only last 20 messages to avoid storage quota exceeded errors
      const recentMessages = messages.slice(-20)
      chrome.storage.local.set({ chat_messages: recentMessages }).catch(err => {
        console.error('[Content] Failed to save messages:', err)
        // If storage fails, try saving just last 10
        chrome.storage.local.set({ chat_messages: messages.slice(-10) }).catch(() => {
          console.error('[Content] Storage quota critically exceeded')
        })
      })
    }
  }, [messages])

  // Reset scroll flag when widget opens
  useEffect(() => {
    if (isOpen) {
      isInitialLoadRef.current = true
      // Auto-focus input field when chat opens
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      // Force scroll to bottom after a delay to ensure DOM is ready
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
      }, 200)
    }
  }, [isOpen])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length === 0) return
    
    // Skip scroll if this was a favorite toggle
    if (skipNextScrollRef.current) {
      skipNextScrollRef.current = false
      return
    }
    
    if (isInitialLoadRef.current) {
      // On initial load/reopen, wait for render then scroll instantly
      isInitialLoadRef.current = false
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
        })
      })
    } else {
      // On new messages, smooth scroll
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // Simple markdown-to-HTML converter for chat messages
  const renderMarkdown = (text: string): string => {
    const rawHtml = marked.parse(text, { breaks: true, gfm: true }) as string
    const sanitized = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['href', 'target', 'rel']
    })
    // Add target="_blank" and rel="noopener noreferrer" to all links
    return sanitized.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=')
  }

  // Get text size classes based on current size setting
  const getTextSizeClass = () => {
    switch (textSize) {
      case 'small': return 'text-xs'
      case 'large': return 'text-base'
      default: return 'text-sm' // medium
    }
  }

  // Get half-sized text class for secondary elements
  const getHalfTextSizeClass = () => {
    switch (textSize) {
      case 'small': return 'text-[10px]'
      case 'large': return 'text-sm'
      default: return 'text-xs' // medium
    }
  }

  useEffect(() => {
    // Listen for messages from background script
    const messageListener = (message: any) => {
      if (message.type === "OPEN_WIDGET") {
        setIsOpen(true)
        analytics.extensionOpened({ sessionId: session?.id })
        if (message.action === "analyze") {
          handleAnalyze()
        }
      }
      
      // Listen for session updates from popup
      if (message.type === "SESSION_UPDATED" && message.session) {

        setSession(message.session)
      }
    }

    // Check if extension context is still valid
    try {
      chrome.runtime.onMessage.addListener(messageListener)
    } catch (err) {
      // Extension reloaded - silently return, user will reload page
      if (err instanceof Error && err.message.includes('Extension context invalidated')) {
        return
      }
      console.error('[Content] Extension context invalidated on mount. Page needs refresh.')
      return
    }
    
    // Document-level keyboard shortcuts - work anywhere when chat is open
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      // Ctrl+Alt+A - Analyze chart
      if ((e.key === 'a' || e.key === 'A') && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault()
        handleAnalyze()
        return
      }
      
      // Ctrl+Alt+Enter - Send with chart (only if input has text)
      if (e.key === 'Enter' && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) {
        if (inputText.trim() && !isSending) {
          e.preventDefault()
          handleSendMessage(inputText, true)
        }
        return
      }
    }
    
    chrome.runtime.onMessage.addListener(messageListener)
    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      try {
        chrome.runtime.onMessage.removeListener(messageListener)
      } catch (err) {
        // Extension context invalidated during cleanup - ignore
      }
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, inputText, isSending])

  const handleAnalyze = async () => {
    if (isSending || isAnalyzing) return

    setIsAnalyzing(true)
    setIsSending(true)
    
    // Scroll to show loading bubble
    setTimeout(() => scrollToBottom(), 100)

    try {
      // Get fresh session
      const result = await chrome.storage.local.get('supabase_session')
      const { supabase_session } = result

      if (!supabase_session) {
        setMessages(prev => [...prev, {
          type: 'error',
          content: 'Session expired. Please reload the extension.',
          timestamp: new Date()
        }])
        return
      }

      // Get active ruleset
      const rulesetResponse = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/rulesets/active`,
        {
          headers: { "Authorization": `Bearer ${supabase_session.access_token}` }
        }
      )

      if (!rulesetResponse.ok) {
        setMessages(prev => [...prev, {
          type: 'error',
          content: 'No active ruleset found. Please set one in the dashboard.',
          timestamp: new Date()
        }])
        return
      }

      const { ruleset } = await rulesetResponse.json()

      // Check screenshot limit before capturing
      // Fetch current usage from /api/me
      const meResponse = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/me`,
        {
          headers: { "Authorization": `Bearer ${supabase_session.access_token}` }
        }
      )
      
      if (meResponse.ok) {
        const userData = await meResponse.json()
        if (userData?.usage.screenshots.used >= userData?.usage.screenshots.limit) {
          setMessages(prev => [...prev, {
            type: 'error',
            content: userData.user.plan === 'pro' 
              ? "You've reached your daily limit of 50 chart analyses. Your limit resets at midnight UTC."
              : "You've used all 5 free chart analyses today. [Upgrade to Pro](https://admin.snapchartapp.com/dashboard/account) for 50 charts/day.",
            timestamp: new Date()
          }])
          return
        }
      }

      // Capture screenshot
      setIsOpen(false)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const screenshotResponse = await chrome.runtime.sendMessage({
        type: "CAPTURE_SCREENSHOT"
      })
      
      setIsOpen(true)

      if (!screenshotResponse.success || !screenshotResponse.dataUrl) {
        setMessages(prev => [...prev, {
          type: 'error',
          content: 'Failed to capture chart. Please try again.',
          timestamp: new Date()
        }])
        return
      }

      const chartImage = screenshotResponse.dataUrl
      setLastChartImage(chartImage)
      analytics.chartUploaded('screenshot', { sessionId: session?.id })

      // Add user message
      const userMessage = {
        type: 'user',
        content: '📸 Analyze this chart',
        timestamp: new Date(),
        chartImage: chartImage
      }
      setMessages(prev => [...prev, userMessage])
      analytics.analysisStarted({ sessionId: session?.id })

      // Call analyze endpoint
      const analyzeResponse = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabase_session.access_token}`
          },
          body: JSON.stringify({
            rulesetId: ruleset.id,
            image: chartImage
          })
        }
      )

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({}))
        setMessages(prev => [...prev, {
          type: 'error',
          content: errorData.error || 'Analysis failed. Please try again.',
          timestamp: new Date()
        }])
        return
      }

      const analysis = await analyzeResponse.json()
      analytics.analysisFinished(analysis.setup_status || 'unknown', { sessionId: session?.id })

      // Update user message with database ID
      if (analysis.userMessageId) {
        setMessages(prev => prev.map(msg => 
          msg === userMessage ? { ...msg, id: analysis.userMessageId, isFavorited: false } : msg
        ))
      }

      // Add analysis result as assistant message with database ID
      const assistantMessage = {
        type: 'assistant',
        content: analysis,
        timestamp: new Date(),
        id: analysis.assistantMessageId,
        isFavorited: false
      }
      setMessages(prev => [...prev, assistantMessage])

      // Refresh usage to update progress bar
      await refreshUsage()

      // Notify user if chart wasn't counted due to quality
      if (analysis.chartUnreadable) {
        setMessages(prev => [...prev, {
          type: 'info',
          content: 'ℹ️ Chart quality insufficient - screenshot not counted. Try zooming in or making the chart clearer.',
          timestamp: new Date()
        }])
      }

      // Scroll to bottom with extra delay for screenshot rendering
      setTimeout(() => scrollToBottom(), 300)

    } catch (error) {
      console.error('[Content] Analysis error:', error)
      setMessages(prev => [...prev, {
        type: 'error',
        content: 'An error occurred during analysis.',
        timestamp: new Date()
      }])
    } finally {
      setIsAnalyzing(false)
      setIsSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const refreshUsage = async () => {
    if (!session) return
    
    try {
      const meResponse = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })
      if (meResponse.ok) {
        const meData = await meResponse.json()
        if (meData.usage) {
          setCurrentUsage({
            messages: meData.usage.messages.used,
            screenshots: meData.usage.screenshots.used,
            limits: {
              maxMessages: meData.usage.messages.limit,
              maxScreenshots: meData.usage.screenshots.limit
            }
          })
        }
      }
    } catch (error) {
      console.error('[Content] Failed to refresh usage:', error)
    }
  }

  const loadOlderMessages = async () => {
    if (isLoadingMore || !hasMoreMessages || !session) return

    setIsLoadingMore(true)
    try {
      const historyResponse = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/chat/history?limit=20&offset=${messageOffset}`,
        {
          headers: {
            "Authorization": `Bearer ${session.access_token}`
          }
        }
      )

      if (historyResponse.ok) {
        const { messages: dbMessages } = await historyResponse.json()


        // If we got fewer than 20, we've reached the end
        setHasMoreMessages(dbMessages.length === 20)
        setMessageOffset(prev => prev + dbMessages.length)

        // Convert DB format to UI format
        const formattedMessages = dbMessages.map((msg: any) => {
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
            id: msg.id,
            type: msg.role === 'user' ? 'user' : 'assistant',
            content: content,
            timestamp: new Date(msg.created_at),
            isFavorited: msg.is_favorited || false
          }
        })

        // Prepend older messages to the beginning
        setMessages(prev => [...formattedMessages, ...prev])
      }
    } catch (error) {
      console.error('[Content] Error loading older messages:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const toggleFavorite = async (messageId: string, currentlyFavorited: boolean | undefined) => {
    try {
      // Get fresh session from storage
      const result = await chrome.storage.local.get('supabase_session')
      const { supabase_session } = result

      if (!supabase_session) {
        console.error('[Content] No session found for favorite toggle')
        // Show error to user
        setMessages(prev => [...prev, {
          type: 'error',
          content: 'Session expired. Please reload the extension to continue.',
          timestamp: new Date()
        }])
        return
      }

      // Treat undefined as false
      const wasFavorited = currentlyFavorited === true
      const willBeFavorited = !wasFavorited



      const response = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/chat/favorite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase_session.access_token}`
          },
          body: JSON.stringify({
            messageId,
            isFavorited: willBeFavorited
          })
        }
      )

      if (response.ok) {
        // Prevent auto-scroll on favorite toggle
        skipNextScrollRef.current = true

        // Update local state
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, isFavorited: willBeFavorited }
            : msg
        ))
        
        // Trigger glow animation only when favoriting (not unfavoriting)
        if (willBeFavorited) {
          setGlowingMessageId(messageId)
          setTimeout(() => setGlowingMessageId(null), 800) // Clear after animation
        }
      } else if (response.status === 429) {
        const errorData = await response.json()
        // Add upgrade link to the error message if it mentions upgrading
        let errorMessage = errorData.error || 'You have reached your favorites limit.'
        if (errorMessage.includes('Upgrade to Pro')) {
          errorMessage = errorMessage.replace(
            'Upgrade to Pro',
            '[Upgrade to Pro](https://admin.snapchartapp.com/dashboard/account)'
          )
        }
        setMessages(prev => [...prev, {
          type: 'error',
          content: errorMessage,
          timestamp: new Date()
        }])
      } else {
        console.error('[Content] Failed to toggle favorite:', response.status)
        const errorText = await response.text()
        console.error('[Content] Error response:', errorText)
      }
    } catch (error) {
      console.error('[Content] Error toggling favorite:', error)
    }
  }

  const handleSendMessage = async (text: string, includeChart: boolean = false) => {
    if (!text.trim() || isSending) return
    
    setIsSending(true)
    
    // Scroll to show loading bubble
    setTimeout(() => scrollToBottom(), 100)
    
    let chartImage = null
    
    // Capture chart if requested
    if (includeChart) {
      // Check screenshot limit before capturing
      try {
        const result = await chrome.storage.local.get('supabase_session')
        const { supabase_session } = result
        
        if (supabase_session?.access_token) {
          const meResponse = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/me`, {
            headers: {
              'Authorization': `Bearer ${supabase_session.access_token}`
            }
          })
          
          if (meResponse.ok) {
            const userData = await meResponse.json()
            const screenshotsUsed = userData.usage.screenshots.used
            const screenshotsLimit = userData.usage.screenshots.limit
            
            if (screenshotsUsed >= screenshotsLimit) {
              setIsSending(false)
              const errorMsg = {
                type: 'error',
                content: userData.user.plan === 'free' 
                  ? `You've used all 5 chart screenshots for today. [Upgrade to Pro](https://admin.snapchartapp.com/dashboard/account) for 50 screenshots per day.`
                  : `You've used all 50 chart screenshots for today. Limit resets at midnight UTC.`,
                timestamp: new Date(),
                requiresUpgrade: userData.user.plan === 'free'
              }
              setMessages(prev => [...prev, errorMsg])
              return
            }
          }
        }
      } catch (error) {
        console.error('[Content] Failed to check screenshot limit:', error)
      }
      
      // Hide widget before screenshot
      setIsOpen(false)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const screenshotResponse = await chrome.runtime.sendMessage({
        type: "CAPTURE_SCREENSHOT"
      })
      
      // Show widget again
      setIsOpen(true)
      
      if (screenshotResponse.success) {
        chartImage = screenshotResponse.dataUrl
      }
    }
    
    // Add user message with optional chart thumbnail
    const userMessage = {
      type: 'user',
      content: text,
      timestamp: new Date(),
      chartImage: chartImage || undefined
    }
    setMessages(prev => [...prev, userMessage])
    setInputText("")
    setTimeout(() => inputRef.current?.focus(), 50)
    
    try {
      // Get session
      const result = await chrome.storage.local.get('supabase_session')
      let { supabase_session } = result
      
      const currentTime = Math.floor(Date.now() / 1000)
      
      if (!supabase_session?.access_token) {
        // Open popup to sign in
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {
          // Fallback if background script not available

        })
        
        const errorMsg = {
          type: 'error',
          content: 'Session missing. Please [sign in](https://admin.snapchartapp.com/) or use the extension popup (click the icon in your toolbar).',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
        setIsSending(false)
        return
      }
      
      // Check if token is expired or expiring soon
      if (supabase_session.expires_at && supabase_session.expires_at < currentTime) {

        await chrome.storage.local.remove('supabase_session')
        
        const errorMsg = {
          type: 'error',
          content: 'Session expired. Please sign in again from the extension popup.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
        setIsSending(false)
        return
      }

      // If token is expired, clear session and ask user to sign in again
      if (supabase_session.expires_at < Date.now() / 1000) {

        await chrome.storage.local.remove('supabase_session')
        
        const errorMsg = {
          type: 'error',
          content: 'Session expired. Please sign in again from the extension popup.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
        setIsSending(false)
        return
      }

      // Build conversation history (last 10 messages for context)
      const conversationHistory = messages
        .slice(-10)
        .map(msg => {
          let content = ''
          if (typeof msg.content === 'string') {
            content = msg.content
          } else if (msg.content?.summary) {
            // For chart analysis, include key info
            const analysis = msg.content
            content = `Chart Analysis: ${analysis.summary}. ${analysis.bullets?.join('. ') || ''}`
          } else {
            content = JSON.stringify(msg.content)
          }
          
          return {
            role: msg.type === 'user' ? 'user' : 'assistant',
            content
          }
        })
        .filter(msg => msg.content && msg.content.trim().length > 0) // Remove empty messages



      // Build request body
      const requestBody: any = {
        message: text,
        includeChart,
        conversationHistory,
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
      
      // Include chart image if captured or use last analyzed chart
      if (chartImage) {
        requestBody.image = chartImage
      } else if (lastChartImage && !includeChart) {
        // Include last chart for context in follow-up questions
        requestBody.image = lastChartImage
        requestBody.isContextImage = true
      }
      
      // Call chat API
      const apiResponse = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabase_session.access_token}`
          },
          body: JSON.stringify(requestBody)
        }
      )

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({}))
        console.error('[Content] Chat API error:', apiResponse.status, errorData)
        
        // Handle usage limit errors specially
        if (apiResponse.status === 429 && errorData.message) {
          const errorMsg = {
            type: 'error',
            content: errorData.message,
            timestamp: new Date(),
            requiresUpgrade: errorData.requiresUpgrade
          }
          setMessages(prev => [...prev, errorMsg])
          setIsSending(false)
          return
        }
        
        throw new Error(`API error: ${apiResponse.status}`)
      }

      const chatResult = await apiResponse.json()
      analytics.chatMessageSent(includeChart, { sessionId: session?.id })
      
      // Update usage tracking
      if (chatResult.usage) {
        setCurrentUsage(chatResult.usage)
      }
      
      // Notify user if chart wasn't counted due to quality
      if (chatResult.chartUnreadable) {
        setMessages(prev => [...prev, {
          type: 'info',
          content: 'ℹ️ Chart quality insufficient - screenshot not counted. Try zooming in or making the chart clearer.',
          timestamp: new Date()
        }])
      }
      
      // Broadcast to other tabs that chat was updated
      chrome.storage.local.set({
        chat_sync: {
          action: 'message_sent',
          timestamp: Date.now(),
          tabId: tabId
        }
      })
      
      // Check for timeout action
      if (chatResult.action && chatResult.action.type === 'timeout') {
        const endTime = Date.now() + (chatResult.action.duration * 1000)
        
        // Store timeout in chrome.storage
        chrome.storage.local.set({
          timeout_end: {
            endTime,
            reason: chatResult.action.reason
          }
        })
        
        // Set timeout state
        setIsTimedOut(true)
        setTimeoutEndTime(endTime)
        setTimeoutReason(chatResult.action.reason)
      }
      
      // Update user message with database ID
      if (chatResult.userMessageId) {
        setMessages(prev => prev.map(msg => 
          msg === userMessage ? { ...msg, id: chatResult.userMessageId, isFavorited: false } : msg
        ))
      }
      
      // Add assistant message with typing animation
      const fullResponse = chatResult.message || "I couldn't process that request."
      
      // Safety check - if response is empty or too short, don't animate
      if (!fullResponse || fullResponse.trim().length === 0) {
        console.error('[Content] Empty response from chat API')
        const errorMsg = {
          type: 'error',
          content: 'Received empty response. Please try again.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
        setIsSending(false)
        return
      }
      
      // Check if response includes drawings (from chart analysis)
      const hasDrawings = chatResult.drawings && chatResult.drawings.length > 0
      const responseChartImage = chartImage || (hasDrawings ? lastChartImage : null)
      
      // Add empty message that will be filled with typing animation
      const assistantMessage = {
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
        fullContent: fullResponse,
        chartImage: responseChartImage,
        drawings: hasDrawings ? chatResult.drawings : undefined,
        id: chatResult.assistantMessageId,
        isFavorited: false
      }
      setMessages(prev => [...prev, assistantMessage])
      
      // Scroll to show the thinking bubble
      setTimeout(() => scrollToBottom(), 100)
      
      // Animate typing effect
      let charIndex = 0
      const typingInterval = setInterval(() => {
        charIndex += 1 // Type 1 character at a time
        if (charIndex >= fullResponse.length) {
          charIndex = fullResponse.length
          clearInterval(typingInterval)
          // Mark typing as complete
          setMessages(prev => prev.map((msg, idx) => 
            idx === prev.length - 1 ? { ...msg, isTyping: false, content: fullResponse } : msg
          ))
        } else {
          setMessages(prev => prev.map((msg, idx) => 
            idx === prev.length - 1 ? { ...msg, content: fullResponse.substring(0, charIndex) } : msg
          ))
        }
      }, 25) // 25ms per character
      
    } catch (error) {
      console.error("[Content] Chat failed:", error)
      
      // Check if it's a 401 error (session expired)
      if (error instanceof Error && error.message.includes('401')) {
        // Clear stale session
        await chrome.storage.local.remove('supabase_session')
        setSession(null)
        
        const errorMsg = {
          type: 'error',
          content: 'Session expired. Please [sign in](https://admin.snapchartapp.com/) or use the extension popup to continue.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
      } else {
        const errorMsg = {
          type: 'error',
          content: `Failed to send message. ${error instanceof Error ? error.message : 'Please try again.'}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
      }
    } finally {
      setIsSending(false)
      // Auto-focus input after AI responds
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsDragging(true)
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - 150,
        y: e.clientY - 25
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging])

  // Resize handlers
  const startSizeRef = useRef({ width: 0, height: 0 })
  const startPosRef = useRef({ x: 0, y: 0 })

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    startSizeRef.current = { width: size.width, height: size.height }
    startPosRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    const deltaX = e.clientX - startPosRef.current.x
    const deltaY = e.clientY - startPosRef.current.y
    const newWidth = Math.max(300, Math.min(800, startSizeRef.current.width + deltaX))
    const newHeight = Math.max(400, Math.min(900, startSizeRef.current.height + deltaY))
    setSize({ width: newWidth, height: newHeight })
  }, [])

  const handleResizeMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMouseMove)
      document.addEventListener("mouseup", handleResizeMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleResizeMouseMove)
        document.removeEventListener("mouseup", handleResizeMouseUp)
      }
    }
  }, [isResizing, handleResizeMouseMove, handleResizeMouseUp])

  if (!isOpen) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 2147483647
        }}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-xl font-medium flex items-center gap-2"
        >
          <img src={chrome.runtime.getURL("assets/icon.png")} alt="Snapchart" className="w-6 h-6" />
          Snapchart
        </button>
      </div>
    )
  }

  const getVerdictColor = (status: string) => {
    switch (status) {
      case "valid":
      case "aligned":
      case "pass": return "bg-green-100 text-green-700 border border-green-200"
      case "potentially_valid":
      case "incomplete":
      case "warn": return "bg-yellow-100 text-yellow-700 border border-yellow-200"
      case "invalid":
      case "violated":
      case "fail": return "bg-red-100 text-red-700 border border-red-200"
      default: return "bg-slate-100 text-slate-700 border border-slate-200"
    }
  }

  return (
    <>
      {/* Welcome Modal */}
      {showWelcomeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-4">
          <div className={`max-w-md w-full rounded-xl shadow-2xl p-6 ${theme === 'dark' ? 'bg-dark-surface text-slate-100' : 'bg-white text-slate-900'}`}>
            <div className="flex items-center gap-3 mb-4">
              <img src={chrome.runtime.getURL("assets/icon.png")} alt="Snapchart" className="w-12 h-12" />
              <h2 className="text-2xl font-bold">Welcome to Snapchart!</h2>
            </div>
            <p className={`mb-4 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
              This extension captures screenshots for chart analysis and stores your chat history (which you can clear anytime) to help improve your trading psychology.
            </p>
            <p className={`mb-6 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => window.open('https://www.snapchartapp.com/terms', '_blank')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border ${theme === 'dark' ? 'border-dark-border text-slate-300 hover:bg-dark-elevated' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              >
                View Terms
              </button>
              <button
                onClick={() => window.open('https://www.snapchartapp.com/privacy', '_blank')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border ${theme === 'dark' ? 'border-dark-border text-slate-300 hover:bg-dark-elevated' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              >
                View Privacy
              </button>
            </div>
            <button
              onClick={() => {
                chrome.storage.local.set({ has_seen_welcome: true })
                setShowWelcomeModal(false)
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Main Widget */}
      <div
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 2147483647
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div className={`${theme === 'dark' ? 'bg-dark-bg text-white border-dark-border' : 'bg-white text-slate-900 border-slate-200'} rounded-lg shadow-2xl flex flex-col border overflow-hidden`} style={{ width: `${size.width}px`, height: `${size.height}px` }}>
        {/* Header - Draggable */}
        <div
          className={`select-none flex items-center justify-between p-2 cursor-move ${theme === 'dark' ? 'border-b border-dark-border bg-gradient-to-r from-dark-surface to-dark-elevated' : 'border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-1.5">
            <img src={chrome.runtime.getURL("assets/icon.png")} alt="Snapchart" className="w-6 h-6" />
            <div className="text-sm font-medium text-white">Snapchart</div>
          </div>
          <div className="flex items-center gap-1 relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="text-white hover:text-blue-100 text-base px-1"
              title="Menu"
            >
              ⋮
            </button>
            {showMenu && (
              <div className={`absolute top-12 right-0 rounded-lg shadow-xl border py-2 z-50 min-w-[180px] ${theme === 'dark' ? 'bg-dark-surface border-dark-border' : 'bg-white border-slate-200'}`}>
                <button
                  onClick={() => {
                    window.open(`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/account`, '_blank')
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => {
                    const newTheme = theme === 'light' ? 'dark' : 'light'
                    setTheme(newTheme)
                    chrome.storage.local.set({ theme: newTheme })
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </button>
                <div className={`px-4 py-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  <div className="text-xs font-medium mb-1">Text Size</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setTextSize('small')
                        chrome.storage.local.set({ textSize: 'small' })
                      }}
                      className={`px-2 py-0.5 rounded text-xs ${
                        textSize === 'small'
                          ? theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                          : theme === 'dark' ? 'bg-dark-elevated text-slate-300 hover:bg-dark-border' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Small
                    </button>
                    <button
                      onClick={() => {
                        setTextSize('medium')
                        chrome.storage.local.set({ textSize: 'medium' })
                      }}
                      className={`px-2 py-0.5 rounded text-xs ${
                        textSize === 'medium'
                          ? theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                          : theme === 'dark' ? 'bg-dark-elevated text-slate-300 hover:bg-dark-border' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Medium
                    </button>
                    <button
                      onClick={() => {
                        setTextSize('large')
                        chrome.storage.local.set({ textSize: 'large' })
                      }}
                      className={`px-2 py-0.5 rounded text-xs ${
                        textSize === 'large'
                          ? theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                          : theme === 'dark' ? 'bg-dark-elevated text-slate-300 hover:bg-dark-border' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Large
                    </button>
                  </div>
                </div>
                {messages.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm('Clear all chat messages? This will reset the conversation but keep your trading rules and favorites.')) {
                        try {
                          // Clear from Supabase
                          if (session?.access_token) {
                            const response = await fetch(
                              `${process.env.PLASMO_PUBLIC_API_URL}/api/chat/clear`,
                              {
                                method: 'DELETE',
                                headers: {
                                  'Authorization': `Bearer ${session.access_token}`
                                }
                              }
                            )
                            
                            if (!response.ok) {
                              console.error('[Content] Failed to clear chat from database')
                            } else {

                            }
                          }
                          
                          // Clear ALL messages from chatbox (including favorites locally)
                          // Favorites remain in database for dashboard
                          setMessages([])
                          chrome.storage.local.remove('chat_messages')
                          analytics.sessionCleared()
                          setShowMenu(false)
                        } catch (error) {
                          console.error('[Content] Error clearing chat:', error)
                          // Still clear locally even if API fails
                          setMessages([])
                          chrome.storage.local.remove('chat_messages')
                          setShowMenu(false)
                        }
                      }
                    }}
                    className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                  >
                    Clear Chat
                  </button>
                )}
                <div className={`border-t my-2 ${theme === 'dark' ? 'border-dark-border' : 'border-slate-200'}`} />
                <button
                  onClick={() => {
                    window.open('https://snapchart.canny.io/', '_blank')
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  Feature Requests
                </button>
                <button
                  onClick={() => {
                    window.open('https://www.snapchartapp.com/privacy', '_blank')
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  Privacy Policy
                </button>
                <button
                  onClick={() => {
                    window.open('https://www.snapchartapp.com/terms', '_blank')
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  Terms of Service
                </button>
              </div>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-blue-100 text-base"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto p-4 space-y-4 relative ${theme === 'dark' ? 'bg-dark-surface' : 'bg-slate-50'}`}
        >
          {/* Load Older Messages Button */}
          {hasMoreMessages && messages.length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={loadOlderMessages}
                disabled={isLoadingMore}
                className={`text-xs px-4 py-2 rounded-full ${
                  theme === 'dark' 
                    ? 'bg-dark-elevated text-slate-300 hover:bg-dark-elevated' 
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                } disabled:opacity-50 transition-colors`}
              >
                {isLoadingMore ? '↻ Loading...' : '↑ Load older messages'}
              </button>
            </div>
          )}

          {messages.length === 0 && (
            <div className={`text-center text-sm mt-8 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              <div className="text-4xl mb-2">👋</div>
              <p className="mb-2">Hi! I'm your trading psychology coach.</p>
              <p className="text-xs">Ask a question or analyze a chart to begin.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="relative group">
              {/* Favorite Star Button */}
              {msg.id && (
                <button
                  onClick={() => toggleFavorite(msg.id, msg.isFavorited)}
                  className={`absolute ${msg.type === 'user' ? 'right-0' : 'left-0'} top-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 ${
                    theme === 'dark' ? 'hover:bg-dark-elevated' : 'hover:bg-slate-200'
                  }`}
                  title={msg.isFavorited ? 'Unfavorite' : 'Favorite'}
                >
                  <span className="text-lg">
                    {msg.isFavorited ? '⭐' : '☆'}
                  </span>
                </button>
              )}
              <div className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.type === 'user' && (
                  <div className="max-w-[80%]">
                    <div className={`bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm ${getTextSizeClass()} transition-all ${
                      msg.isFavorited ? 'border-l-4 border-amber-400' : ''
                    } ${
                      glowingMessageId === msg.id ? 'animate-[borderGlow_0.8s_ease-in-out]' : ''
                    }`}>
                      {msg.content}
                    </div>
                    {msg.timestamp && (
                      <div className="text-[10px] text-slate-400 mt-0.5 text-right px-1">
                        {formatMessageTime(msg.timestamp)}
                      </div>
                    )}
                    {msg.chartImage && (
                      <div>
                        <img 
                          src={msg.chartImage} 
                          alt="Chart" 
                          className="mt-2 rounded-lg border border-blue-400 max-w-full h-auto"
                          style={{ maxHeight: '200px', cursor: 'pointer' }}
                          onClick={() => setLightboxData({ imageUrl: msg.chartImage, drawings: [], messageIndex: i })}
                          title="Click to view full size"
                        />
                        {currentUsage?.limits && currentUsage.limits.maxScreenshots === 5 && (
                          <p className={`text-[10px] mt-1 italic ${theme === 'dark' ? 'text-blue-200' : 'text-slate-700'}`}>
                            Lower resolution on Free plan may affect analysis accuracy.{' '}
                            <a 
                              href="https://admin.snapchartapp.com/dashboard/account" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={`underline font-medium ${theme === 'dark' ? 'text-blue-300 hover:text-white' : 'text-blue-800 hover:text-blue-950'}`}
                            >
                              Upgrade to Pro
                            </a>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {msg.type === 'error' && (
                  <div className={`bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] ${getTextSizeClass()}`}>
                    <div className="markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    {msg.requiresUpgrade && (
                      <button
                        onClick={() => window.open('https://admin.snapchartapp.com/dashboard/account', '_blank')}
                        className="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Upgrade to Pro - $49/mo
                      </button>
                    )}
                  </div>
                )}
                
                {msg.type === 'info' && (
                  <div className={`px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] ${getTextSizeClass()} ${
                    theme === 'dark' 
                      ? 'bg-blue-950/50 border border-blue-800/50 text-blue-200' 
                      : 'bg-blue-50 border border-blue-200 text-blue-700'
                  }`}>
                    {msg.content}
                  </div>
                )}
                
                {msg.type === 'assistant' && typeof msg.content === 'string' && (
                <div className="max-w-[85%]">
                  {/* Show chart with overlay if drawings exist */}
                  {msg.chartImage && msg.drawings && msg.drawings.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>Chart Analysis</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowOverlays(prev => ({ ...prev, [i]: !prev[i] }))}
                            className={`text-xs px-2 py-1 rounded ${showOverlays[i] ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                          >
                            {showOverlays[i] ? '👁️ Hide' : '👁️ Show'}
                          </button>
                          <button
                            onClick={() => setLightboxData({ imageUrl: msg.chartImage, drawings: msg.drawings, messageIndex: i })}
                            className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                          >
                            🔍 Full Size
                          </button>
                        </div>
                      </div>
                      <div onClick={() => setLightboxData({ imageUrl: msg.chartImage, drawings: msg.drawings, messageIndex: i })} className="cursor-pointer">
                        <ChartOverlay
                          imageUrl={msg.chartImage}
                          drawings={msg.drawings}
                          showOverlay={showOverlays[i] || false}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div 

                    className={`markdown-content px-4 py-3 rounded-2xl rounded-tl-sm ${getTextSizeClass()} shadow-sm transition-all ${theme === 'dark' ? 'bg-dark-elevated border border-dark-border text-slate-100' : 'bg-white border border-slate-200 text-slate-900'} ${
                      msg.isFavorited ? 'border-l-4 !border-l-amber-400' : ''
                    } ${
                      glowingMessageId === msg.id ? 'animate-[borderGlow_0.8s_ease-in-out]' : ''
                    }`}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                  {msg.timestamp && (
                    <div className="text-[10px] text-slate-400 mt-0.5 text-left px-1">
                      {formatMessageTime(msg.timestamp)}
                    </div>
                  )}
                </div>
              )}
              
              {msg.type === 'assistant' && typeof msg.content === 'object' && msg.content.setup_status && (
                <div className="max-w-[85%]">
                  <div className={`px-4 py-3 rounded-2xl rounded-tl-sm ${getTextSizeClass()} shadow-sm ${theme === 'dark' ? 'bg-dark-elevated border border-dark-border' : 'bg-white border border-slate-200'}`}>
                  {/* Show chart with overlay if it exists */}
                  {msg.chartImage && msg.content.drawings && msg.content.drawings.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>Chart Analysis</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowOverlays(prev => ({ ...prev, [i]: !prev[i] }))}
                            className={`text-xs px-2 py-1 rounded ${showOverlays[i] ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                          >
                            {showOverlays[i] ? '👁️ Hide' : '👁️ Show'}
                          </button>
                          <button
                            onClick={() => setLightboxData({ imageUrl: msg.chartImage, drawings: msg.content.drawings, messageIndex: i })}
                            className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                          >
                            🔍 Full Size
                          </button>
                        </div>
                      </div>
                      <div onClick={() => setLightboxData({ imageUrl: msg.chartImage, drawings: msg.content.drawings, messageIndex: i })} className="cursor-pointer">
                        <ChartOverlay
                          imageUrl={msg.chartImage}
                          drawings={msg.content.drawings}
                          showOverlay={showOverlays[i] || false}
                        />
                      </div>
                    </div>
                  )}
                  
                  {msg.content.ruleset_name && (
                    <div className={`text-[10px] uppercase tracking-wide mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                      Analyzed with: {msg.content.ruleset_name}
                    </div>
                  )}
                  
                  <div className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold uppercase mb-3 ${getVerdictColor(msg.content.setup_status)}`}>
                    {msg.content.setup_status.replace(/_/g, ' ')}
                  </div>

                  {msg.content.validity_estimate && (
                    <div className={`text-xs mb-2 px-3 py-2.5 rounded ${theme === 'dark' ? 'bg-dark-elevated' : 'bg-slate-100'}`}>
                      <div className="flex items-center justify-between">
                        <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>
                          Validity: {msg.content.validity_estimate.percent_range[0]}–{msg.content.validity_estimate.percent_range[1]}%
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {msg.content.validity_estimate.confidence} confidence
                        </span>
                      </div>
                      {msg.content.validity_estimate.reason && (
                        <div className={`text-[11px] mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          {msg.content.validity_estimate.reason}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className={`font-medium mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>{msg.content.summary}</div>
                  
                  {msg.content.bullets && msg.content.bullets.length > 0 && (
                    <ul className={`space-y-2 mb-3 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      {msg.content.bullets.map((bullet: string, idx: number) => (
                        <li key={idx}>• {bullet}</li>
                      ))}
                    </ul>
                  )}

                  {msg.content.levels_to_watch && msg.content.levels_to_watch.length > 0 && (
                    <div className={`rounded-lg p-3 mb-2 ${theme === 'dark' ? 'bg-dark-surface border border-dark-border' : 'bg-blue-50'}`}>
                      <div className={`font-medium text-xs mb-1 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>Levels to Watch</div>
                      {msg.content.levels_to_watch.map((level: any, idx: number) => {
                        const getTypeIcon = (type: string) => {
                          switch(type) {
                            case 'resistance': return '🔴'
                            case 'support': return '🟢'
                            case 'structure': return '🔵'
                            case 'invalidation': return '❌'
                            case 'trendline': return '📈'
                            case 'breakout_level': return '⚡'
                            case 'consolidation': return '🔶'
                            default: return '📍'
                          }
                        }
                        
                        return (
                          <div key={idx} className={`text-xs mb-1.5 last:mb-0 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                            <div className={`font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                              {getTypeIcon(level.type)} {level.label}
                            </div>
                            <div className={`text-[11px] ml-4 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                              {level.why_it_matters}
                              {level.when_observed && <span className={`text-[10px] ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}> ({level.when_observed})</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {msg.content.behavioral_nudge && (
                    <div className={`rounded-lg p-3 border ${theme === 'dark' ? 'bg-amber-950/30 border-amber-800/50 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                      💡 {msg.content.behavioral_nudge}
                    </div>
                  )}

                  {/* Disclaimer for analyze results */}
                  <div className={`text-[9px] mt-3 pt-2 border-t leading-tight ${theme === 'dark' ? 'text-slate-400 border-dark-border' : 'text-slate-500 border-slate-200'}`}>
                    AI can make mistakes. Not financial advice. This analysis is for educational purposes only. Trading involves substantial risk of loss.
                  </div>
                </div>
                  {msg.timestamp && (
                    <div className="text-[10px] text-slate-400 mt-0.5 text-left px-1">
                      {formatMessageTime(msg.timestamp)}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          ))}


          
          {/* Auto-scroll anchor */}
          <div ref={messagesEndRef} />

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button
              onClick={scrollToBottom}
              className={`sticky bottom-4 left-1/2 -translate-x-1/2 mx-auto w-8 h-8 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-110 hover:opacity-100 z-50 opacity-70 ${
                theme === 'dark' 
                  ? 'bg-dark-surface text-white border border-dark-border' 
                  : 'bg-white text-slate-700 border border-slate-300'
              }`}
              title="Scroll to bottom"
            >
              ↓
            </button>
          )}
          
          {(isAnalyzing || isSending) && (
            <div className="flex justify-start">
              <div className={`px-4 py-3 rounded-2xl rounded-tl-sm ${getTextSizeClass()} ${theme === 'dark' ? 'bg-dark-elevated border border-dark-border text-slate-300' : 'bg-white border border-slate-200 text-slate-400'}`}>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-[bounce_1.4s_ease-in-out_infinite]"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-[bounce_1.4s_ease-in-out_0.2s_infinite]"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-[bounce_1.4s_ease-in-out_0.4s_infinite]"></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`p-3 space-y-1.5 ${theme === 'dark' ? 'border-t border-dark-border bg-dark-bg' : 'border-t border-slate-200 bg-white'}`}>
          {/* Timeout Timer (replaces input when active) */}
          {isTimedOut && timeoutEndTime ? (
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-dark-surface border border-dark-border' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">⏸️</div>
                  <div>
                    <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Mandatory Break
                    </div>
                    <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      {timeoutReason}
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-mono font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                  {(() => {
                    const remaining = Math.max(0, Math.floor((timeoutEndTime - Date.now()) / 1000))
                    const minutes = Math.floor(remaining / 60)
                    const seconds = remaining % 60
                    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                  })()}
                </div>
              </div>
              <div className={`mt-2 text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>
                Step away and reset. Chat unlocks automatically when timer ends.
              </div>
            </div>
          ) : (
            <>
              {/* Text input for chatting */}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && !e.shiftKey && inputText.trim() && !isSending) {
                      e.preventDefault()
                      if (e.ctrlKey && e.altKey) {
                        // Ctrl+Alt+Enter: Send with chart
                        handleSendMessage(inputText, true)
                      } else {
                        // Regular Enter: Send without chart
                        handleSendMessage(inputText, false)
                      }
                    }
                  }}
                  onKeyPress={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  placeholder="What's on your mind?"
                  disabled={isSending}
                  maxLength={500}
                  className={`flex-1 px-3 py-1.5 border rounded-lg ${getTextSizeClass()} focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-dark-surface border-dark-border text-white placeholder-slate-400 disabled:bg-dark-elevated' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 disabled:bg-slate-100'}`}
                />
                <button
                  onClick={() => {
                    if (inputText.trim() && !isSending) {
                      handleSendMessage(inputText, false)
                    }
                  }}
                  disabled={isSending || !inputText.trim()}
                  className={`bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-3 py-1.5 rounded-lg ${getTextSizeClass()} font-medium`}
                >
                  {isSending ? "..." : "Send"}
                </button>
              </div>
              {inputText.length > 0 && (
                <div className={`${getHalfTextSizeClass()} ${inputText.length >= 500 ? 'text-red-500 font-medium' : theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  {inputText.length}/500 characters{inputText.length >= 500 && ' (limit reached)'}
                </div>
              )}
              <div/>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (inputText.trim() && !isSending) {
                      handleSendMessage(inputText, true)
                    }
                  }}
                  disabled={isSending || !inputText.trim()}
                  className={`flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-2 py-1.5 rounded-lg ${getTextSizeClass()} font-medium flex items-center justify-center gap-1.5`}
                >
                  <span className="text-sm">📸</span>
                  Send with Chart
                </button>
                
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className={`flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-2 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 ${getTextSizeClass()}`}
                >
                  <span className="text-sm">🔍</span>
                  {isAnalyzing ? "Analyzing..." : "Analyze Chart"}
                </button>
              </div>

              {/* Usage Toggle Button */}
              {currentUsage && (
                <button
                  onClick={() => setShowUsage(!showUsage)}
                  className={`${getHalfTextSizeClass()} underline ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {showUsage ? "Hide Usage" : "View Usage"}
                </button>
              )}

              {/* Usage Progress Bars */}
              {currentUsage && showUsage && (
                <div className="space-y-1.5">
                  {/* Messages Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5 text-slate-500 text-[10px]">
                      <span>Messages</span>
                      <span>{currentUsage.messages}/{currentUsage.limits.maxMessages}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-0.5 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          currentUsage.messages >= currentUsage.limits.maxMessages
                            ? "bg-red-500"
                            : currentUsage.messages / currentUsage.limits.maxMessages >= 0.8
                            ? "bg-amber-500"
                            : "bg-blue-600"
                        }`}
                        style={{ width: `${Math.min((currentUsage.messages / currentUsage.limits.maxMessages) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Screenshots Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5 text-slate-500 text-[10px]">
                      <span>Screenshots</span>
                      <span>{currentUsage.screenshots}/{currentUsage.limits.maxScreenshots}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-0.5 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          currentUsage.screenshots >= currentUsage.limits.maxScreenshots
                            ? "bg-red-500"
                            : currentUsage.screenshots / currentUsage.limits.maxScreenshots >= 0.8
                            ? "bg-amber-500"
                            : "bg-green-600"
                        }`}
                        style={{ width: `${Math.min((currentUsage.screenshots / currentUsage.limits.maxScreenshots) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
          </>
          )}
        </div>
        
        {/* Resize handle */}
        <div 
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          style={{
            background: 'linear-gradient(135deg, transparent 50%, #cbd5e1 50%)',
            borderBottomRightRadius: '8px'
          }}
        />
      </div>

      {/* Lightbox for full-size chart view */}
      {lightboxData && (
        <ChartLightbox
          imageUrl={lightboxData.imageUrl}
          drawings={lightboxData.drawings}
          showOverlay={showOverlays[lightboxData.messageIndex] || false}
          onClose={() => setLightboxData(null)}
          onToggleOverlay={() => setShowOverlays(prev => ({ 
            ...prev, 
            [lightboxData.messageIndex]: !prev[lightboxData.messageIndex] 
          }))}
        />
      )}
    </div>
    </>
  )
}

export default TradingBuddyWidget
