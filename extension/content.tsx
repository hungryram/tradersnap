import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ChartOverlay } from "./ChartOverlay"
import { ChartLightbox } from "./ChartLightbox"
import { UsageMeter } from "~components/UsageMeter"

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
    "*://*.bybit.com/*",
    // Your backend for login (add your domain here)
    "*://localhost/*",
    "*://localhost:*/*"
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
  const [showOverlays, setShowOverlays] = useState<{[key: number]: boolean}>({})
  const [lightboxData, setLightboxData] = useState<{imageUrl: string, drawings: any[], messageIndex: number} | null>(null)
  const [session, setSession] = useState<any>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [messageOffset, setMessageOffset] = useState(0)
  const [currentUsage, setCurrentUsage] = useState<any>(null) // Track usage from chat responses
  const [showUsage, setShowUsage] = useState(false) // Toggle for usage progress bars
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const [timeoutEndTime, setTimeoutEndTime] = useState<number | null>(null)
  const [timeoutReason, setTimeoutReason] = useState<string>('')
  const [, setForceUpdate] = useState(0) // Force re-render for countdown
  const [glowingMessageId, setGlowingMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isInitialLoadRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load messages, theme, and session from storage on mount
  useEffect(() => {
    const loadData = async () => {
      const result = await chrome.storage.local.get(['chat_messages', 'theme', 'supabase_session', 'timeout_end'])
      
      console.log('[Content] Loading from chrome.storage:', {
        hasMessages: !!result.chat_messages,
        hasTheme: !!result.theme,
        hasSession: !!result.supabase_session,
        sessionKeys: result.supabase_session ? Object.keys(result.supabase_session) : []
      })
      
      // Check for active timeout
      if (result.timeout_end) {
        const now = Date.now()
        const endTime = result.timeout_end.endTime
        const reason = result.timeout_end.reason
        
        if (endTime > now) {
          console.log('[Content] Active timeout found, ends in:', Math.floor((endTime - now) / 1000), 'seconds')
          setIsTimedOut(true)
          setTimeoutEndTime(endTime)
          setTimeoutReason(reason || 'Take a break to reset')
        } else {
          // Timeout expired, clear it
          console.log('[Content] Timeout expired, clearing')
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
      
      if (result.supabase_session) {
        console.log('[Content] Found session in storage, expires:', new Date(result.supabase_session.expires_at * 1000).toLocaleString())
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
            console.log('[Content] Loaded chat history from Supabase:', dbMessages.length, 'messages')
            
            // If we got 20 messages, there might be more
            setHasMoreMessages(dbMessages.length === 20)
            setMessageOffset(20)
            
            // Convert DB format to UI format
            const formattedMessages = dbMessages.map(msg => ({
              id: msg.id,
              type: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content,
              timestamp: new Date(msg.created_at),
              isFavorited: msg.is_favorited || false
            }))
            
            setMessages(formattedMessages)
            
            // Update cache
            chrome.storage.local.set({ chat_messages: formattedMessages.slice(-20) })
          } else {
            console.error('[Content] Failed to load chat history:', historyResponse.status)
          }
        } catch (error) {
          console.error('[Content] Error loading chat history:', error)
          // Keep using cached messages if API fails
        } finally {
          setIsLoadingHistory(false)
        }
      }
    }
    loadData()

    // Listen for session updates from chrome.storage
    const handleStorageChange = (changes: any, areaName: string) => {
      if (areaName === 'local' && changes.supabase_session) {
        console.log('[Content] Session changed in storage:', changes.supabase_session.newValue)
        setSession(changes.supabase_session.newValue)
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  // Timeout countdown timer
  useEffect(() => {
    if (!isTimedOut || !timeoutEndTime) return

    const interval = setInterval(() => {
      const now = Date.now()
      if (now >= timeoutEndTime) {
        // Timeout expired, unlock chat
        console.log('[Content] Timeout expired, unlocking chat')
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

    console.log('[Content] Setting up message listener for login events')

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
            console.log('[Content] Session valid, time until expiry:', Math.floor((expiresAt - now) / 60), 'minutes')
            setSession(session)
            chrome.storage.local.set({ supabase_session: session })
            
            // If expiring soon, log a warning
            if (expiresAt - now < fiveMinutes) {
              console.warn('[Content] Session expiring soon! Please refresh the page.')
            }
          } else {
            console.log('[Content] Session expired, clearing...')
            localStorage.removeItem('trading_buddy_session')
            chrome.storage.local.remove('supabase_session')
            setSession(null)
          }
        }
      } catch (e) {
        console.error('[Content] Failed to parse localStorage session:', e)
      }
    }
    
    // Check once on mount
    checkLocalStorage()
    
    // Listen for login messages from the website (no polling!)
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from same origin for security
      if (event.origin !== window.location.origin) return
      
      if (event.data.type === 'TRADING_BUDDY_LOGIN' && event.data.session) {
        console.log('[Content] Received login message from website')
        const session = event.data.session
        setSession(session)
        chrome.storage.local.set({ supabase_session: session })
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    return () => {
      console.log('[Content] Removing message listener')
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
    }
  }, [isOpen])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length === 0) return
    
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
  const formatMarkdown = (text: string) => {
    return text
      // Headers
      .replace(/^### (.+)$/gm, '<div class="font-bold text-sm mt-2 mb-1">$1</div>')
      .replace(/^## (.+)$/gm, '<div class="font-bold text-base mt-2 mb-1">$1</div>')
      .replace(/^# (.+)$/gm, '<div class="font-bold text-lg mt-2 mb-1">$1</div>')
      // Markdown links - [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 underline">$1</a>')
      // Plain URLs (http/https)
      .replace(/(?<!href="|">)(https?:\/\/[^\s<]+[^<.,\s])/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 underline">$1</a>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Line breaks
      .replace(/\n/g, '<br/>')
  }

  useEffect(() => {
    // Listen for messages from background script
    const messageListener = (message) => {
      if (message.type === "OPEN_WIDGET") {
        setIsOpen(true)
        if (message.action === "analyze") {
          handleAnalyze()
        }
      }
      
      // Listen for session updates from popup
      if (message.type === "SESSION_UPDATED" && message.session) {
        console.log('[Content] Received session update from popup')
        setSession(message.session)
      }
    }

    // Check if extension context is still valid
    try {
      chrome.runtime.onMessage.addListener(messageListener)
    } catch (err) {
      console.error('[Content] Extension context invalidated on mount. Page needs refresh.')
      return
    }
    
    // Handle keyboard shortcuts - only when chat is open
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when chat is open
      if (!isOpen) return
      
      // Ctrl+A / Cmd+A - Analyze chart
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.shiftKey) {
        // Don't prevent default if user is selecting text
        const selection = window.getSelection()
        if (selection && selection.toString().length > 0) return
        
        e.preventDefault()
        setIsOpen(true)
        handleAnalyze()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      try {
        chrome.runtime.onMessage.removeListener(messageListener)
      } catch (err) {
        // Extension context invalidated during cleanup - ignore
      }
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleAnalyze = async () => {
    // Use the chat endpoint, which properly tracks screenshot usage
    await handleSendMessage('📸 Analyze this chart', true)
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
        console.log('[Content] Loaded older messages:', dbMessages.length)

        // If we got fewer than 20, we've reached the end
        setHasMoreMessages(dbMessages.length === 20)
        setMessageOffset(prev => prev + dbMessages.length)

        // Convert DB format to UI format
        const formattedMessages = dbMessages.map(msg => ({
          id: msg.id,
          type: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
          timestamp: new Date(msg.created_at),
          isFavorited: msg.is_favorited || false
        }))

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

      console.log('[Content] Toggling favorite:', { messageId, wasFavorited, willBeFavorited })

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
        console.log('[Content] Favorite toggled successfully')
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
    
    let chartImage = null
    
    // Capture chart if requested
    if (includeChart) {
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
      
      console.log('[Content] Chat - checking session...', {
        hasResult: !!result,
        hasSession: !!supabase_session,
        hasAccessToken: !!supabase_session?.access_token,
        sessionKeys: supabase_session ? Object.keys(supabase_session) : [],
        expiresAt: supabase_session?.expires_at,
        expiresAtDate: supabase_session?.expires_at ? new Date(supabase_session.expires_at * 1000).toISOString() : null,
        isExpired: supabase_session?.expires_at ? supabase_session.expires_at < currentTime : null,
        currentTime,
        currentTimeDate: new Date(currentTime * 1000).toISOString(),
        timeUntilExpiry: supabase_session?.expires_at ? Math.floor((supabase_session.expires_at - currentTime) / 60) + ' minutes' : null
      })
      
      if (!supabase_session?.access_token) {
        console.error('[Content] No valid session found!')
        
        // Open popup to sign in
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {
          // Fallback if background script not available
          console.log('[Content] Could not open popup automatically')
        })
        
        const errorMsg = {
          type: 'error',
          content: 'Session missing. Please sign in using the extension popup (click the icon in your toolbar).',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
        setIsSending(false)
        return
      }
      
      // Check if token is expired or expiring soon
      if (supabase_session.expires_at && supabase_session.expires_at < currentTime) {
        console.log('[Content] Token expired, clearing session')
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
        console.log('[Content] Token expired, clearing session')
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

      console.log('[Content] Sending chat request')

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
      
      // Update usage tracking
      if (chatResult.usage) {
        setCurrentUsage(chatResult.usage)
      }
      
      // Check for timeout action
      if (chatResult.action && chatResult.action.type === 'timeout') {
        console.log('[Content] Timeout action received:', chatResult.action)
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
      
      // Animate typing effect
      let charIndex = 0
      const typingInterval = setInterval(() => {
        charIndex += 2 // Type 2 characters at a time for faster animation
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
      }, 20) // 20ms per iteration = fast but visible typing
      
    } catch (error) {
      console.error("[Content] Chat failed:", error)
      const errorMsg = {
        type: 'error',
        content: 'Failed to send message. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsSending(false)
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
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
  }

  const handleResizeMouseMove = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.max(300, Math.min(800, size.width + e.movementX))
      const newHeight = Math.max(400, Math.min(900, size.height + e.movementY))
      setSize({ width: newWidth, height: newHeight })
    }
  }

  const handleResizeMouseUp = () => {
    setIsResizing(false)
  }

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMouseMove)
      document.addEventListener("mouseup", handleResizeMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleResizeMouseMove)
        document.removeEventListener("mouseup", handleResizeMouseUp)
      }
    }
  }, [isResizing, size])

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

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case "pass": return "text-green-600"
      case "warn": return "text-yellow-600"
      case "fail": return "text-red-600"
      default: return "text-slate-600"
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 2147483647
      }}
      className="select-none"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div className={`${theme === 'dark' ? 'bg-slate-900 text-white border-slate-700' : 'bg-white text-slate-900 border-slate-200'} rounded-lg shadow-2xl flex flex-col border`} style={{ width: `${size.width}px`, height: `${size.height}px` }}>
        {/* Header - Draggable */}
        <div
          className={`flex items-center justify-between p-4 cursor-move ${theme === 'dark' ? 'border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-700' : 'border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <img src={chrome.runtime.getURL("assets/icon.png")} alt="Snapchart" className="w-8 h-8" />
            <div>
              <div className="font-semibold text-white">Snapchart</div>
              <div className="text-xs text-blue-100">AI Psychology Coach</div>
            </div>
          </div>
          <div className="flex items-center gap-2 relative">
            <UsageMeter session={session} latestUsage={currentUsage} />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="text-white hover:text-blue-100 text-xl px-2"
              title="Menu"
            >
              ⋮
            </button>
            {showMenu && (
              <div className={`absolute top-12 right-0 rounded-lg shadow-xl border py-2 z-50 min-w-[180px] ${theme === 'dark' ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                <button
                  onClick={() => {
                    window.open(`${process.env.PLASMO_PUBLIC_API_URL}/dashboard`, '_blank')
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-2 flex items-center gap-2 ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  <span>⚙️</span>
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => {
                    const newTheme = theme === 'light' ? 'dark' : 'light'
                    setTheme(newTheme)
                    chrome.storage.local.set({ theme: newTheme })
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-2 flex items-center gap-2 ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  <span>{theme === 'light' ? '🌙' : '☀️'}</span>
                  <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm('Clear all chat messages? This will reset the conversation but keep your trading rules.')) {
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
                              console.log('[Content] Chat cleared from database')
                            }
                          }
                          
                          // Clear from local state and storage
                          setMessages([])
                          chrome.storage.local.remove('chat_messages')
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
                    className={`w-full text-left px-4 py-2 flex items-center gap-2 ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                  >
                    <span>🗑️</span>
                    <span>Clear Chat</span>
                  </button>
                )}
              </div>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-blue-100 text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'}`}>
          {/* Load Older Messages Button */}
          {hasMoreMessages && messages.length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={loadOlderMessages}
                disabled={isLoadingMore}
                className={`text-xs px-4 py-2 rounded-full ${
                  theme === 'dark' 
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' 
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
              <p className="text-xs">Click "Analyze Chart" below to get started.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="relative group">
              {/* Favorite Star Button */}
              {msg.id && (
                <button
                  onClick={() => toggleFavorite(msg.id, msg.isFavorited)}
                  className={`absolute ${msg.type === 'user' ? 'right-0' : 'left-0'} top-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 ${
                    theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-200'
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
                    <div className={`bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm text-sm transition-all ${
                      msg.isFavorited ? 'border-l-4 border-amber-400' : ''
                    } ${
                      glowingMessageId === msg.id ? 'animate-[borderGlow_0.8s_ease-in-out]' : ''
                    }`}>
                      {msg.content}
                    </div>
                    {msg.chartImage && (
                      <img 
                        src={msg.chartImage} 
                        alt="Chart" 
                        className="mt-2 rounded-lg border border-blue-400 max-w-full h-auto"
                        style={{ maxHeight: '200px', cursor: 'pointer' }}
                        onClick={() => window.open(msg.chartImage, '_blank')}
                        title="Click to view full size"
                      />
                    )}
                  </div>
                )}
                
                {msg.type === 'error' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] text-sm">
                    <div>{msg.content}</div>
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
                    className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm shadow-sm transition-all ${theme === 'dark' ? 'bg-slate-700 border border-slate-600 text-slate-100' : 'bg-white border border-slate-200 text-slate-900'} ${
                      msg.isFavorited ? 'border-l-4 !border-l-amber-400' : ''
                    } ${
                      glowingMessageId === msg.id ? 'animate-[borderGlow_0.8s_ease-in-out]' : ''
                    }`}
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                  />
                </div>
              )}
              
              {msg.type === 'assistant' && typeof msg.content === 'object' && msg.content.verdict && (
                <div className={`px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] text-sm shadow-sm ${theme === 'dark' ? 'bg-slate-700 border border-slate-600' : 'bg-white border border-slate-200'}`}>
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
                  
                  <div className={`text-xs font-bold uppercase mb-2 ${getVerdictColor(msg.content.verdict)}`}>
                    {msg.content.verdict}
                  </div>
                  
                  <div className={`font-medium mb-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>{msg.content.summary}</div>
                  
                  {msg.content.bullets && msg.content.bullets.length > 0 && (
                    <ul className={`text-xs space-y-1 mb-3 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      {msg.content.bullets.map((bullet, idx) => (
                        <li key={idx}>• {bullet}</li>
                      ))}
                    </ul>
                  )}

                  {msg.content.levels_to_watch && msg.content.levels_to_watch.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-2 mb-2">
                      <div className="font-medium text-xs mb-1 text-slate-900">📍 Levels to Watch</div>
                      {msg.content.levels_to_watch.map((level, idx) => (
                        <div key={idx} className="text-xs text-slate-700 mb-1">
                          <div className="font-medium">{level.label}</div>
                          <div className="text-slate-600">{level.why_it_matters}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.content.behavioral_nudge && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
                      💡 {msg.content.behavioral_nudge}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          ))}


          
          {/* Auto-scroll anchor */}
          <div ref={messagesEndRef} />
          
          {(isAnalyzing || isSending) && (
            <div className="flex justify-start">
              <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm ${theme === 'dark' ? 'bg-slate-700 border border-slate-600' : 'bg-white border border-slate-200'}`}>
                <div className={`flex gap-1 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce delay-100">●</span>
                  <span className="animate-bounce delay-200">●</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`p-4 space-y-2 ${theme === 'dark' ? 'border-t border-slate-700 bg-slate-900' : 'border-t border-slate-200 bg-white'}`}>
          {/* Timeout Timer (replaces input when active) */}
          {isTimedOut && timeoutEndTime ? (
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-slate-800 border border-slate-700' : 'bg-amber-50 border border-amber-200'}`}>
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
                      if (e.ctrlKey || e.metaKey) {
                        // Ctrl+Enter or Cmd+Enter: Send with chart
                        handleSendMessage(inputText, true)
                      } else {
                        // Regular Enter: Send without chart
                        handleSendMessage(inputText, false)
                      }
                    }
                  }}
                  onKeyPress={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  placeholder="Ask me anything..."
                  disabled={isSending}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-400 disabled:bg-slate-700' : 'border-slate-300 disabled:bg-slate-100'}`}
                />
                <button
                  onClick={() => {
                    if (inputText.trim() && !isSending) {
                      handleSendMessage(inputText, false)
                    }
                  }}
                  disabled={isSending || !inputText.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {isSending ? "..." : "Send"}
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (inputText.trim() && !isSending) {
                      handleSendMessage(inputText, true)
                    }
                  }}
                  disabled={isSending || !inputText.trim()}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  <span>📸</span>
                  Send with Chart
                </button>
                
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm"
                >
                  <span>🔍</span>
                  {isAnalyzing ? "Analyzing..." : "Analyze Chart"}
                </button>
              </div>

              {/* Usage Toggle Button */}
              {currentUsage && (
                <button
                  onClick={() => setShowUsage(!showUsage)}
                  className="text-xs text-slate-600 hover:text-slate-900 underline"
                >
                  {showUsage ? "Hide Usage" : "View Usage"}
                </button>
              )}

              {/* Usage Progress Bars */}
              {currentUsage && showUsage && (
                <div className="space-y-1.5 text-xs">
                  {/* Messages Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-1 text-slate-600">
                      <span>💬 Messages</span>
                      <span className="font-medium">{currentUsage.messages}/{currentUsage.limits.maxMessages}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
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
                    <div className="flex items-center justify-between mb-1 text-slate-600">
                      <span>📸 Screenshots</span>
                      <span className="font-medium">{currentUsage.screenshots}/{currentUsage.limits.maxScreenshots}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
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
  )
}

export default TradingBuddyWidget
