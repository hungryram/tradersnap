import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useRef, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ChartOverlay } from "./ChartOverlay"
import { ChartLightbox } from "./ChartLightbox"
import Pip, { type PipMood } from "./components/Pip"
import CheckDetails, { ChecklistMeter, checklistProgress } from "./components/CheckDetails"
import ResetBreak from "./components/ResetBreak"
import { analytics } from "~lib/analytics"
import { startTradeTracking, type TrackingStatus } from "~lib/trades/tracker"
import type { ClosedTrade } from "~lib/trades/types"
import { afterTrades, morningPlan, onPositionOpened, sessionRecap, type CheckIn, type CoachLimits, type CoachTrade } from "~lib/coach/checkins"
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
    "https://admin.tradewithpip.ai/*",
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

// Largest image (as a data URL) a request can carry under the server's 4.5 MB body limit
const MAX_IMAGE_CHARS = 4_000_000

// Before a check-in appears, Pip "types" for a moment, so it reads as Pip noticing
// something and speaking up
const CHECKIN_TYPING_MS = 1500
// How long Pip may take to write a check-in in his own words before the plain version is used
const COMPOSE_TIMEOUT_MS = { warning: 3000, info: 6000 }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// A strategy Pip drafted in a reply: a code block opened with ```rules <strategy name>
function rulesFromReply(content: unknown): { rules: string; name: string | null } | null {
  if (typeof content !== 'string') return null
  const match = content.match(/```rules([^\n]*)\n([\s\S]*?)```/)
  const rules = match?.[2].trim()
  if (!rules || rules.length < 10) return null
  return { rules, name: match![1].trim() || null }
}

// Pip's face for a message: pleased when a setup lines up, wary at a rule break or warning
// The "log this result?" offer saved with a chat message, in the shape the widget uses
function tradeProposalFields(msg: any) {
  const p = msg.trade_proposal
  if (!p) return {}
  return {
    tradeProposal: { id: p.id, kind: p.kind ?? 'trade', amount: p.amount, symbol: p.symbol ?? null, logged_net: p.logged_net ?? 0, logged_count: p.logged_count ?? 0, strategies: p.strategies ?? [] },
    tradeStatus: p.status === 'pending' ? undefined : p.status
  }
}

function messageMood(msg: any): PipMood {
  if (msg.type === 'checkin') return msg.level === 'warning' ? 'caution' : 'idle'
  if (msg.type === 'error') return 'idle'
  const status = typeof msg.content === 'object' ? msg.content?.setup_status : null
  if (status === 'valid' || status === 'aligned' || status === 'pass') return 'happy'
  if (status === 'invalid' || status === 'violated' || status === 'fail') return 'caution'
  return 'idle'
}

// Message when today's allowance is used up (checked before taking a screenshot)
function limitReachedText(plan: string, canBuyMore?: boolean) {
  const isPaid = plan !== 'free'
  const base = "That's today's allowance used up. It refills at midnight UTC."
  if (canBuyMore) return base + (isPaid ? " Want to keep going? You can grab extra usage for today." : " Want to keep going? Grab extra usage for today, or go Pro for about 7x more every day.")
  return base + (isPaid ? "" : " If you want more room every day, Pro gives you about 7x.")
}

// Shown on the "Check this setup" button while a check runs
const ANALYZE_STAGES = ["Capturing your chart...", "Reading price action...", "Checking your rules...", "Writing your verdict..."]

// Tap-to-ask starters for an empty chat (chart ones turn on the Chart toggle)
const SUGGESTIONS = [
  { text: "What should I wait for here?", chart: true },
  { text: "Is this a good entry by my rules?", chart: true },
  { text: "I just took a loss. Help me reset.", chart: false },
  { text: "Am I overtrading today?", chart: false },
]

const TradingBuddyWidget = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 60 })
  const [isDragging, setIsDragging] = useState(false)
  // Where in the header the drag started, so the window moves with the cursor instead of jumping
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  // Saved position/size are loaded once; don't save until then
  const layoutLoadedRef = useRef(false)
  // Launcher button: offset from the bottom-right corner, draggable
  const [launcherPos, setLauncherPos] = useState({ right: 20, bottom: 20 })
  const [messages, setMessages] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [inputText, setInputText] = useState("")
  // Composer: include a screenshot of the chart with the next message
  const [attachChart, setAttachChart] = useState(false)
  // Step shown while an analysis runs (~15s)
  const [analyzeStage, setAnalyzeStage] = useState(0)
  const [isSending, setIsSending] = useState(false)
  const [lastChartImage, setLastChartImage] = useState<string | null>(null)
  const [lastChartToken, setLastChartToken] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 384, height: 600 })
  const [isResizing, setIsResizing] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [showOverlays, setShowOverlays] = useState<{[key: number]: boolean}>({})
  const [expandedDetails, setExpandedDetails] = useState<{[key: number]: boolean}>({})
  // 👍/👎 per analysis message id (kept for this page load)
  const [ratings, setRatings] = useState<{[messageId: string]: 1 | -1}>({})
  const [autoDetectTrades, setAutoDetectTrades] = useState(false)
  const [tradeStats, setTradeStats] = useState<{ count: number, wins: number, losses: number, net: number, lossStreak: number, checked?: number, unchecked?: number } | null>(null)
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus | null>(null)
  // Coach check-ins: messages the coach starts when something happens in the trader's day
  const [tradingLimits, setTradingLimits] = useState<CoachLimits | null>(null)
  const [limitsLoaded, setLimitsLoaded] = useState(false)
  const [tradesToday, setTradesToday] = useState<CoachTrade[]>([])
  const [checkinsMode, setCheckinsMode] = useState<'on' | 'warnings' | 'off'>('on')
  const [unreadCheckins, setUnreadCheckins] = useState<CheckIn[]>([])
  const [bubble, setBubble] = useState<CheckIn | null>(null)
  const [pipTyping, setPipTyping] = useState(false)
  // The 60-second reset after a loss, and the discipline streak (days in a row, no rule broken)
  const [resetOpen, setResetOpen] = useState(false)
  // Which strategy each pending "log this result?" card has selected (empty: no strategy, or something else)
  const [tradeStrategy, setTradeStrategy] = useState<Record<string, string>>({})
  const [streak, setStreak] = useState<{ days: number; brokenToday: boolean } | null>(null)
  const streakRef = useRef<number | null>(null)
  // "Save as my rules" under replies where Pip drafted a ruleset: per message index
  const [rulesSave, setRulesSave] = useState<Record<number, { state: 'saving' | 'saved' | 'error'; error?: string; name?: string; id?: string; created?: boolean }>>({})
  // Re-render now and then so time-based moods (a fresh win) wear off
  const [, setMoodTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMoodTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])
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
  // Saved messages are what Pip always remembers; the toast confirms a save and shows the count
  const [savedCount, setSavedCount] = useState<{ used: number; limit: number } | null>(null)
  const [saveToast, setSaveToast] = useState<{ text: string; tone: 'good' | 'limit' } | null>(null)
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSaveToast = (text: string, tone: 'good' | 'limit') => {
    setSaveToast({ text, tone })
    if (saveToastTimer.current) clearTimeout(saveToastTimer.current)
    saveToastTimer.current = setTimeout(() => setSaveToast(null), tone === 'limit' ? 7000 : 3500)
  }
  // First-run checklist; null until loaded from storage
  const [gettingStarted, setGettingStarted] = useState<{ analyzed?: boolean, chatted?: boolean, chartChatted?: boolean, dismissed?: boolean, autoOpened?: boolean, completed?: boolean } | null>(null)
  const [tabId] = useState(() => `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Follow new messages / typing only while the reader is at the bottom
  const stickToBottomRef = useRef(true)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<HTMLDivElement>(null)
  const isInitialLoadRef = useRef(true)
  const skipNextScrollRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Tell the widgets in other tabs that the saved chat changed, so they reload it
  const broadcastChat = () => {
    chrome.storage.local.set({ chat_sync: { action: 'message_sent', timestamp: Date.now(), tabId } }).catch(() => {})
  }
  const busyRef = useRef(false)

  // Function to load chat history from database
  const loadChatHistoryFromDB = async (keepLocal = false) => {
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
            timestamp: msg.created_at ? new Date(msg.created_at) : new Date(),
            isFavorited: msg.is_favorited || false,
            ...tradeProposalFields(msg)
          }
        })
        
        // Sort by timestamp to ensure chronological order (oldest first).
        // Older messages share a timestamp with their reply, so put the user's message first on ties.
        formattedMessages.sort((a: any, b: any) =>
          a.timestamp.getTime() - b.timestamp.getTime() || (a.type === 'user' ? -1 : 0) - (b.type === 'user' ? -1 : 0)
        )
        
        // Syncing from another tab: keep this tab's own Pip check-ins and notices (they are not stored in the database)
        setMessages(prev => {
          if (!keepLocal) return formattedMessages
          const oldest = formattedMessages[0]?.timestamp.getTime() ?? 0
          const local = prev.filter(m => (m.type === 'checkin' || m.type === 'info') && !m.id && new Date(m.timestamp).getTime() >= oldest)
          return [...formattedMessages, ...local].sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        })
        
        // Update cache
        chrome.storage.local.set({ chat_messages: formattedMessages.slice(-20) })
      }
    } catch (error) {
      // Silently fail - chat history is optional, app works fine without it
      // Common reasons: offline, CORS, server maintenance
    }
  }

  // Handle scroll to show/hide scroll-to-bottom button
  const handleScroll = () => {
    if (!messagesContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80
    stickToBottomRef.current = isNearBottom
    setShowScrollButton(!isNearBottom)
  }

  // Explicit scroll (sending a message, the down-arrow button): follow again
  const scrollToBottom = () => {
    stickToBottomRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Format timestamp like iPhone messages
  const formatMessageTime = (timestamp: Date) => {
    // Handle both Date objects and strings/numbers
    let msgDate: Date
    
    if (timestamp instanceof Date) {
      msgDate = timestamp
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      msgDate = new Date(timestamp)
    } else {
      // Invalid input, return empty string silently
      return ""
    }
    
    // Validate the date
    if (isNaN(msgDate.getTime())) {
      return "" // Return empty string instead of "Invalid Date"
    }
    
    const now = new Date()
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
      const result = await chrome.storage.local.get(['chat_messages', 'theme', 'textSize', 'supabase_session', 'timeout_end', 'auto_detect_trades'])
      
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
        // Errors are transient; drop any saved by older versions
        setMessages(result.chat_messages.filter((msg: any) => msg.type !== 'error'))
      }
      
      if (result.theme) {
        setTheme(result.theme)
      }
      
      if (result.textSize) {
        setTextSize(result.textSize)
      }

      if (result.auto_detect_trades) {
        setAutoDetectTrades(true)
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
            setTradingLimits(meData.user?.trading_limits ?? null)
            firstNameRef.current = meData.user?.first_name ?? null
            setLimitsLoaded(true)
            if (meData.usage?.favorites) setSavedCount({ used: meData.usage.favorites.used, limit: meData.usage.favorites.limit })
            if (meData.usage) {
              setCurrentUsage({
                messages: meData.usage.messages.used,
                screenshots: meData.usage.screenshots.used,
                limits: {
                  maxMessages: meData.usage.messages.limit,
                  maxScreenshots: meData.usage.screenshots.limit
                },
                credits: meData.usage.credits,
                canBuyMore: meData.usage.canBuyMore
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

      if (areaName === 'local' && changes.auto_detect_trades) {
        setAutoDetectTrades(!!changes.auto_detect_trades.newValue)
      }
      
      // Listen for chat sync events from other tabs
      if (areaName === 'local' && changes.chat_sync) {
        const syncEvent = changes.chat_sync.newValue
        if (syncEvent?.action === 'message_sent' && syncEvent.tabId !== tabId) {
          // Reload chat history from database (only if message came from another tab)
          if (!busyRef.current) loadChatHistoryFromDB(true)
        }
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  // Today's trades, counted from the trader's local midnight
  const fetchTradeStats = useCallback(async () => {
    const { supabase_session } = await chrome.storage.local.get('supabase_session')
    if (!supabase_session?.access_token) return
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    try {
      const response = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/trades?since=${encodeURIComponent(midnight.toISOString())}&streak=1&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
        { headers: { Authorization: `Bearer ${supabase_session.access_token}` } }
      )
      if (response.ok) {
        const data = await response.json()
        setTradeStats(data.stats)
        setTradesToday(data.trades ?? [])
        if ('streak' in data) { setStreak(data.streak ?? null); streakRef.current = data.streak?.days ?? null }
      }
    } catch (error) {
      console.error('[Content] Failed to load trades:', error)
    }
  }, [])

  // Auto-detect trades from TradingView's trading panel (opt-in from the menu)
  const isSignedIn = !!session
  useEffect(() => {
    if (!autoDetectTrades || !isSignedIn) return
    fetchTradeStats()

    // Any tab that logs a trade bumps trade_sync so every tab refreshes its counts
    const handleTradeSync = (changes: any, areaName: string) => {
      if (areaName === 'local' && changes.trade_sync) fetchTradeStats()
    }
    chrome.storage.onChanged.addListener(handleTradeSync)

    if (!window.location.hostname.endsWith('tradingview.com')) {
      return () => chrome.storage.onChanged.removeListener(handleTradeSync)
    }

    const unsent: ClosedTrade[] = []
    let sending = false
    const sendTrades = async () => {
      if (sending || unsent.length === 0) return
      sending = true
      try {
        const { supabase_session } = await chrome.storage.local.get('supabase_session')
        if (!supabase_session?.access_token) return
        while (unsent.length > 0) {
          const batch = unsent.slice(0, 100)
          const response = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/trades`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabase_session.access_token}`
            },
            body: JSON.stringify({ trades: batch })
          }).catch(() => null)
          // Network or server trouble: keep the trades and retry later. A 400 will never succeed.
          if (!response || (!response.ok && response.status !== 400)) return
          unsent.splice(0, batch.length)
        }
        chrome.storage.local.set({ trade_sync: Date.now() })
      } finally {
        sending = false
      }
    }

    const stopTracking = startTradeTracking({
      onTrades: (trades) => {
        unsent.push(...trades)
        sendTrades()
      },
      onStatus: setTrackingStatus,
      onPositions: positions => onPositionsRef.current(positions)
    })
    const retryTimer = setInterval(sendTrades, 30000)

    return () => {
      stopTracking()
      setTrackingStatus(null)
      clearInterval(retryTimer)
      chrome.storage.onChanged.removeListener(handleTradeSync)
    }
  }, [autoDetectTrades, isSignedIn, fetchTradeStats])

  // First run: open the chat with the getting-started checklist. Onboarding links
  // to the trading platform with ?snapchart=start; otherwise it opens once on the
  // first visit to a trading site.
  useEffect(() => {
    const initGettingStarted = async () => {
      const { getting_started, has_seen_welcome } = await chrome.storage.local.get(['getting_started', 'has_seen_welcome'])
      // People who used Pip before the checklist existed don't need it
      let state = getting_started ?? (has_seen_welcome ? { dismissed: true } : {})

      const params = new URLSearchParams(window.location.search)
      const fromOnboarding = params.get('snapchart') === 'start'
      const onTradingSite = window.location.origin !== new URL(process.env.PLASMO_PUBLIC_API_URL!).origin
      if (fromOnboarding || (onTradingSite && !state.dismissed && !state.autoOpened)) {
        setIsOpen(true)
        state = { ...state, autoOpened: true }
        chrome.storage.local.set({ getting_started: state })
      }
      if (fromOnboarding) {
        analytics.track('opened_tradingview', { host: window.location.hostname })
        params.delete('snapchart')
        const query = params.toString()
        window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash)
      }
      setGettingStarted(state)
    }
    initGettingStarted()
  }, [])

  const updateGettingStarted = useCallback(async (patch: Record<string, boolean>, event?: string) => {
    const { getting_started = {} } = await chrome.storage.local.get('getting_started')
    if (Object.entries(patch).every(([key, value]) => getting_started[key] === value)) return
    const next = { ...getting_started, ...patch }
    await chrome.storage.local.set({ getting_started: next })
    setGettingStarted(next)
    if (event) analytics.track(event)
  }, [])

  const setAutoDetect = (next: boolean) => {
    setAutoDetectTrades(next)
    chrome.storage.local.set({ auto_detect_trades: next })
    if (next) analytics.track('autodetect_enabled')
    else setTradeStats(null)
  }

  const isTradingView = window.location.hostname.endsWith('tradingview.com')

  // ---- Coach check-ins ------------------------------------------------------
  // Latest values for callbacks that outlive a render (tracker ticks, timers)
  const isOpenRef = useRef(isOpen)
  const checkinsModeRef = useRef(checkinsMode)
  const tradesTodayRef = useRef(tradesToday)
  const limitsRef = useRef(tradingLimits)
  const firstNameRef = useRef<string | null>(null)
  const lastInfoAtRef = useRef(0)
  const openPositionsRef = useRef<Set<string> | null>(null)
  const onPositionsRef = useRef<(positions: Map<string, number>) => void>(() => {})
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])
  useEffect(() => { checkinsModeRef.current = checkinsMode }, [checkinsMode])
  useEffect(() => { tradesTodayRef.current = tradesToday }, [tradesToday])
  useEffect(() => { limitsRef.current = tradingLimits }, [tradingLimits])

  useEffect(() => {
    chrome.storage.local.get('checkins_mode').then(({ checkins_mode }) => {
      if (checkins_mode === 'on' || checkins_mode === 'warnings' || checkins_mode === 'off') setCheckinsMode(checkins_mode)
    }).catch(() => {})
  }, [])

  const coachContext = () => ({ now: new Date(), trades: tradesTodayRef.current, limits: limitsRef.current, name: firstNameRef.current, streak: streakRef.current })

  // One list of shown check-ins per day in storage, so another tab never repeats one
  const claimCheckIn = async (id: string) => {
    const now = new Date()
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    const { checkins_fired } = await chrome.storage.local.get('checkins_fired')
    const ids: string[] = checkins_fired?.day === day ? checkins_fired.ids : []
    if (ids.includes(id)) return false
    await chrome.storage.local.set({ checkins_fired: { day, ids: [...ids, id] } })
    return true
  }

  // Asks the server for Pip's own wording; null (and the plain text is used) if it's slow or fails
  const composeCheckIn = async (checkIn: CheckIn): Promise<string | null> => {
    try {
      const { supabase_session } = await chrome.storage.local.get('supabase_session')
      if (!supabase_session?.access_token) return null
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), COMPOSE_TIMEOUT_MS[checkIn.level])
      const response = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/checkins/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabase_session.access_token}` },
        body: JSON.stringify({
          kind: checkIn.kind,
          fallback: checkIn.text,
          facts: checkIn.compose,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          dayStart: new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timer))
      if (!response.ok) return null
      const data = await response.json()
      return typeof data.text === 'string' && data.text.trim() ? data.text.trim() : null
    } catch {
      return null
    }
  }

  // "I just made 200": log it to the journal once the trader taps Log it
  const setTradeStatus = (proposalId: string, tradeStatus: string, tradeError?: string) =>
    setMessages(prev => prev.map(m => m.tradeProposal?.id === proposalId ? { ...m, tradeStatus, tradeError } : m))

  const logReportedTrade = async (proposal: { id: string; amount: number; symbol: string | null }, kind: 'trade' | 'day_total' = 'trade') => {
    setTradeStatus(proposal.id, 'saving')
    try {
      const { supabase_session } = await chrome.storage.local.get('supabase_session')
      const response = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/trades/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabase_session?.access_token}` },
        body: JSON.stringify({
          proposal_id: proposal.id,
          amount: proposal.amount,
          symbol: proposal.symbol,
          kind,
          // A day total is logged as the difference from what the journal holds since the trader's local midnight
          day_start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
          strategy_id: kind === 'trade' ? tradeStrategy[proposal.id] || null : null
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setTradeStatus(proposal.id, 'error', data.error || "Couldn't log that one. Try again.")
        return
      }
      setTradeStatus(proposal.id, data.duplicate ? 'duplicate' : 'logged')
      // Pip answers in the chat (saved on the server, so it shows after a reload and in other tabs)
      if (data.message) {
        setMessages(prev => [...prev, { type: 'assistant', content: data.message, timestamp: new Date(), id: data.messageId || undefined, isFavorited: false }])
        setTimeout(() => scrollToBottom(), 100)
      }
      analytics.track('trade_logged', { duplicate: !!data.duplicate })
      fetchTradeStats()
      broadcastChat()
    } catch {
      setTradeStatus(proposal.id, 'error', "Couldn't log that one. Check your connection and try again.")
    }
  }

  const dismissReportedTrade = async (proposalId: string) => {
    setTradeStatus(proposalId, 'dismissed')
    analytics.track('trade_log_dismissed', {})
    try {
      const { supabase_session } = await chrome.storage.local.get('supabase_session')
      await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/trades/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabase_session?.access_token}` },
        body: JSON.stringify({ proposal_id: proposalId, dismiss: true })
      })
      broadcastChat()
    } catch {
      // Hidden here either way; the server copy catches up next time
    }
  }

  const finishReset = (lockMinutes: number | null) => {
    setResetOpen(false)
    analytics.track('reset_finished', { locked: !!lockMinutes })
    if (!lockMinutes) return
    const endTime = Date.now() + lockMinutes * 60_000
    const reason = `You chose a ${lockMinutes}-minute break after a loss. Pip unlocks when it's done.`
    chrome.storage.local.set({ timeout_end: { endTime, reason } })
    setIsTimedOut(true)
    setTimeoutEndTime(endTime)
    setTimeoutReason(reason)
  }

  const openReset = () => {
    setIsOpen(true)
    setBubble(null)
    setResetOpen(true)
    analytics.track('reset_started', {})
  }

  const deliverCheckIns = async (candidates: (CheckIn | null)[]) => {
    for (let checkIn of candidates) {
      if (!checkIn) continue
      const mode = checkinsModeRef.current
      if (mode === 'off' || (mode === 'warnings' && checkIn.level !== 'warning')) continue
      // Gentle messages at most every 5 minutes; warnings always get through
      if (checkIn.level === 'info' && Date.now() - lastInfoAtRef.current < 5 * 60_000) continue
      if (!(await claimCheckIn(checkIn.id))) continue
      if (checkIn.level === 'info') lastInfoAtRef.current = Date.now()

      setBubble(null)
      setPipTyping(true)
      // Pip writes every check-in in his own words; the rules-based text is the fallback
      const [composed] = await Promise.all([
        checkIn.kind !== 'announcement' ? composeCheckIn(checkIn) : Promise.resolve(null),
        sleep(CHECKIN_TYPING_MS)
      ])
      setPipTyping(false)
      if (composed) checkIn = { ...checkIn, text: composed }

      setMessages(prev => [...prev, { type: 'checkin', content: checkIn.text, level: checkIn.level, kind: checkIn.kind, offerReset: !!checkIn.offerReset, timestamp: new Date() }])
      analytics.track('checkin_shown', { kind: checkIn.kind, level: checkIn.level })
      if (!isOpenRef.current) {
        setUnreadCheckins(prev => [...prev, checkIn])
        setBubble(checkIn)
      }
    }
  }

  // One-time hello after updating from the Snapchart days (flagged by background.ts on update)
  useEffect(() => {
    if (!isSignedIn) return
    ;(async () => {
      const { pip_rename_pending } = await chrome.storage.local.get('pip_rename_pending')
      if (!pip_rename_pending) return
      await chrome.storage.local.set({ pip_rename_announced: true })
      await chrome.storage.local.remove('pip_rename_pending')
      const hello: CheckIn = {
        id: 'pip_rename',
        kind: 'announcement',
        level: 'info',
        text: "Hey, Snapchart is now Pip. That's me. Same account, same rules, same trades. Just a better name."
      }
      setMessages(prev => [...prev, { type: 'checkin', content: hello.text, level: hello.level, kind: hello.kind, timestamp: new Date() }])
      if (!isOpenRef.current) {
        setUnreadCheckins(prev => [...prev, hello])
        setBubble(hello)
      }
    })()
  }, [isSignedIn])

  // Morning plan: first visit of the day to a trading site, before the session is over
  useEffect(() => {
    if (!isSignedIn || !limitsLoaded) return
    if (window.location.origin === new URL(process.env.PLASMO_PUBLIC_API_URL!).origin) return
    const ctx = coachContext()
    const end = ctx.limits?.session_end ? Number(ctx.limits.session_end.slice(0, 2)) * 60 + Number(ctx.limits.session_end.slice(3, 5)) : 16 * 60
    if (ctx.now.getHours() * 60 + ctx.now.getMinutes() >= end) return
    deliverCheckIns([morningPlan(ctx)])
  }, [isSignedIn, limitsLoaded])

  // A trade closed (today's trades reloaded)
  useEffect(() => {
    if (!isSignedIn || tradesToday.length === 0) return
    deliverCheckIns(afterTrades(coachContext()))
  }, [tradesToday])

  // A position opened in the trading panel: revenge trade, over max, outside hours
  onPositionsRef.current = (positions) => {
    const open = new Set([...positions].filter(([, qty]) => qty !== 0).map(([symbol]) => symbol))
    const previous = openPositionsRef.current
    openPositionsRef.current = open
    if (!previous) return // first look after page load: these were already open
    const opened = [...open].filter(symbol => !previous.has(symbol))
    if (opened.length > 0) deliverCheckIns(onPositionOpened(coachContext(), new Date()))
  }

  // End-of-session recap, checked every minute
  useEffect(() => {
    if (!isSignedIn) return
    const timer = setInterval(() => {
      if (tradesTodayRef.current.length === 0) return
      deliverCheckIns([sessionRecap(coachContext(), (openPositionsRef.current?.size ?? 0) > 0)])
    }, 60_000)
    return () => clearInterval(timer)
  }, [isSignedIn])

  // Gentle bubbles tuck away after 10 seconds (the unread badge stays)
  useEffect(() => {
    if (!bubble || bubble.level === 'warning') return
    const timer = setTimeout(() => setBubble(null), 10_000)
    return () => clearTimeout(timer)
  }, [bubble])

  // Opening the chat reads them
  useEffect(() => {
    if (isOpen) {
      setUnreadCheckins([])
      setBubble(null)
    }
  }, [isOpen])

  const replyToCheckIn = (checkIn: CheckIn) => {
    analytics.track('checkin_replied', { kind: checkIn.kind })
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 150)
  }

  const dismissCheckIn = (checkIn: CheckIn) => {
    analytics.track('checkin_dismissed', { kind: checkIn.kind })
    setBubble(null)
    setUnreadCheckins(prev => prev.filter(c => c.id !== checkIn.id))
  }

  const cycleCheckinsMode = () => {
    const next = checkinsMode === 'on' ? 'warnings' : checkinsMode === 'warnings' ? 'off' : 'on'
    setCheckinsMode(next)
    chrome.storage.local.set({ checkins_mode: next })
    analytics.track('checkins_mode', { mode: next })
  }

  const rateAnalysis = async (messageId: string, rating: 1 | -1) => {
    setRatings(prev => ({ ...prev, [messageId]: rating }))
    try {
      const { supabase_session } = await chrome.storage.local.get('supabase_session')
      if (!supabase_session?.access_token) return
      await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabase_session.access_token}` },
        body: JSON.stringify({ message_id: messageId, rating })
      })
    } catch {
      // Ratings are best-effort
    }
  }

  // All checklist items done: record it once
  useEffect(() => {
    const g = gettingStarted
    if (!g || g.dismissed || g.completed || !session) return
    if (g.analyzed && g.chartChatted && (autoDetectTrades || !isTradingView)) {
      updateGettingStarted({ completed: true }, 'checklist_completed')
    }
  }, [gettingStarted, autoDetectTrades, session])

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

  // Logins arrive through the background script (website -> externally_connectable),
  // which also keeps the session renewed. Coming back to the tab (e.g. after the
  // laptop slept) is a good moment to make sure it's still fresh.
  useEffect(() => {
    const ensureSession = () => {
      if (document.visibilityState === 'visible') {
        chrome.runtime.sendMessage({ type: 'ENSURE_SESSION' }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', ensureSession)
    return () => document.removeEventListener('visibilitychange', ensureSession)
  }, [])

  // Save messages to storage whenever they change (limit to last 20 to prevent quota issues)
  useEffect(() => {
    // Errors are transient; don't restore them on the next page load
    const savable = messages.filter(msg => msg.type !== 'error')
    if (savable.length > 0) {
      // Keep only last 20 messages to avoid storage quota exceeded errors
      const recentMessages = savable.slice(-20)
      chrome.storage.local.set({ chat_messages: recentMessages }).catch(err => {
        console.error('[Content] Failed to save messages:', err)
        // If storage fails, try saving just last 10
        chrome.storage.local.set({ chat_messages: savable.slice(-10) }).catch(() => {
          console.error('[Content] Storage quota critically exceeded')
        })
      })
    }
  }, [messages])

  // Don't swap the chat out from under a reply that's still being written in this tab
  useEffect(() => {
    busyRef.current = isSending || isAnalyzing
  }, [isSending, isAnalyzing])

  // Safety net: a tab that was in the background catches up when you switch back to it
  useEffect(() => {
    const catchUp = () => {
      if (document.visibilityState === 'visible' && !busyRef.current) loadChatHistoryFromDB(true)
    }
    document.addEventListener('visibilitychange', catchUp)
    return () => document.removeEventListener('visibilitychange', catchUp)
  }, [])

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

  // Walk through what the analysis is doing while it runs
  useEffect(() => {
    if (!isAnalyzing) {
      setAnalyzeStage(0)
      return
    }
    const timer = setInterval(() => setAnalyzeStage(stage => Math.min(stage + 1, ANALYZE_STAGES.length - 1)), 3500)
    return () => clearInterval(timer)
  }, [isAnalyzing])

  // Grow the message box with its text (up to ~5 lines)
  useEffect(() => {
    const box = inputRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 128)}px`
  }, [inputText])

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
    } else if (stickToBottomRef.current) {
      // New text while the reader is at the bottom: keep up instantly. A smooth
      // scroll here would fight the typing updates and the reader's own scrolling.
      const container = messagesContainerRef.current
      if (container) container.scrollTop = container.scrollHeight
    }
  }, [messages])

  // Simple markdown-to-HTML converter for chat messages
  const saveRulesFromReply = async (index: number, rules: string, name: string | null) => {
    if (!confirm(name
      ? `Save these as your "${name}" strategy? If you already have a strategy with that name, these rules replace it.`
      : 'Save these as your main strategy? They replace its current rules.')) return
    setRulesSave(prev => ({ ...prev, [index]: { state: 'saving' } }))
    try {
      const { supabase_session } = await chrome.storage.local.get('supabase_session')
      if (!supabase_session?.access_token) throw new Error('Sign in to save your rules.')
      const response = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/rulesets/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabase_session.access_token}` },
        body: JSON.stringify({ rules_text: rules, name })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Couldn't save your rules.")
      setRulesSave(prev => ({ ...prev, [index]: { state: 'saved', name: data.name ?? name ?? undefined, id: data.id, created: !!data.created } }))
      analytics.track('rules_saved_from_chat', {})
    } catch (error) {
      setRulesSave(prev => ({ ...prev, [index]: { state: 'error', error: error instanceof Error ? error.message : "Couldn't save your rules." } }))
    }
  }

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
      case 'small': return 'text-[13px] leading-relaxed'
      case 'large': return 'text-[17px] leading-relaxed'
      default: return 'text-[15px] leading-relaxed' // medium
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
      if (message.type === "TOGGLE_WIDGET") {
        setIsOpen(open => !open)
      }

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
          content: "I need you signed in before I can help. It only takes a few seconds.",
          requiresLogin: true,
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
          content: `I don't know your rules yet, so I can't check this chart against them. [Add your rules](${process.env.PLASMO_PUBLIC_API_URL}/dashboard/rules) (there are templates, it takes two minutes), then try again.`,
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
            content: limitReachedText(userData.user.plan, userData.usage.canBuyMore),
            timestamp: new Date(),
            requiresUpgrade: userData.user.plan === 'free',
            canBuyMore: !!userData.usage.canBuyMore
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
          content: "I couldn't grab your chart that time. Mind trying again?",
          timestamp: new Date()
        }])
        return
      }

      const chartImage = screenshotResponse.dataUrl
      setLastChartImage(chartImage)
      setLastChartToken(null)
      analytics.chartUploaded('screenshot', { sessionId: session?.id })

      // Add user message
      const userMessage = {
        type: 'user',
        content: '📸 Check this setup',
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
            image: chartImage,
            timestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        }
      )

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({}))
        setMessages(prev => [...prev, {
          type: 'error',
          content: errorData.message || "Something went wrong on my end while checking your chart. Give it another try in a moment. That one didn't count against your usage.",
          timestamp: new Date(),
          requiresUpgrade: errorData.requiresUpgrade,
          canBuyMore: errorData.canBuyMore
        }])
        return
      }

      const analysis = await analyzeResponse.json()
      setLastChartToken(analysis.chartToken || null)
      analytics.analysisFinished(analysis.setup_status || 'unknown', { sessionId: session?.id })
      updateGettingStarted({ analyzed: true }, 'first_analysis')

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

      broadcastChat()

      // Refresh usage to update progress bar
      await refreshUsage()

      // Notify user if chart wasn't counted due to quality
      if (analysis.chartUnreadable) {
        setMessages(prev => [...prev, {
          type: 'info',
          content: 'ℹ️ Chart quality insufficient - screenshot not counted. Try zooming in or making the chart clearer. The chart might be too messy.',
          timestamp: new Date()
        }])
      }

      // Scroll to bottom with extra delay for screenshot rendering
      setTimeout(() => scrollToBottom(), 300)

    } catch (error) {
      console.error('[Content] Analysis error:', error)
      setMessages(prev => [...prev, {
        type: 'error',
        content: "Something went wrong on my end while checking your chart. Give it another try in a moment. That one didn't count against your usage.",
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
            },
            credits: meData.usage.credits,
            canBuyMore: meData.usage.canBuyMore
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
            isFavorited: msg.is_favorited || false,
            ...tradeProposalFields(msg)
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
          content: "I need you signed in before I can help. It only takes a few seconds.",
          requiresLogin: true,
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

        const data = await response.json().catch(() => ({}))
        const counts = typeof data.used === 'number' && typeof data.limit === 'number' ? { used: data.used, limit: data.limit } : null
        if (counts) setSavedCount(counts)
        showSaveToast(
          willBeFavorited
            ? `Saved. I'll keep this in mind from now on.${counts ? ` (${counts.used} of ${counts.limit})` : ''}`
            : `Removed. I won't use this one anymore.${counts ? ` (${counts.used} of ${counts.limit})` : ''}`,
          'good'
        )
      } else if (response.status === 429) {
        const data = await response.json().catch(() => ({}))
        if (typeof data.used === 'number' && typeof data.limit === 'number') setSavedCount({ used: data.used, limit: data.limit })
        showSaveToast(data.error || "You've used all your saves. Remove one in Saved to make room.", 'limit')
      } else {
        console.error('[Content] Failed to toggle favorite:', response.status)
        const errorText = await response.text()
        console.error('[Content] Error response:', errorText)
      }
    } catch (error) {
      console.error('[Content] Error toggling favorite:', error)
    }
  }

  const stopGeneration = () => {
    // Abort fetch request if still in progress
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Stop typing animation if in progress
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
      
      // Show full message immediately
      setMessages(prev => prev.map((msg, idx) => 
        idx === prev.length - 1 && msg.isTyping 
          ? { ...msg, isTyping: false, content: msg.fullContent || msg.content } 
          : msg
      ))
    }
    
    setIsSending(false)
    setTimeout(() => inputRef.current?.focus(), 100)
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
                content: limitReachedText(userData.user.plan, userData.usage.canBuyMore),
                timestamp: new Date(),
                requiresUpgrade: userData.user.plan === 'free',
                canBuyMore: !!userData.usage.canBuyMore
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
          content: "I need you signed in before I can help. It only takes a few seconds.",
          requiresLogin: true,
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
          content: "Looks like you got signed out. Sign back in and we'll pick up right where we left off.",
          requiresLogin: true,
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
          content: "Looks like you got signed out. Sign back in and we'll pick up right where we left off.",
          requiresLogin: true,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
        setIsSending(false)
        return
      }

      // Conversation history: the real exchanges (not errors or notices), last 20.
      // historyStart tells the server where they sit in the whole chat, so it can
      // keep its window steady between messages (which keeps it cached and cheap).
      const exchanges = messages.filter(msg => msg.type === 'user' || msg.type === 'assistant' || msg.type === 'checkin')
      const historyStart = Math.max(0, exchanges.length - 20)
      const conversationHistory = exchanges
        .slice(historyStart)
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
        historyStart,
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dayStart: new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      }
      
      // Include chart image if captured or use last analyzed chart
      if (chartImage) {
        requestBody.image = chartImage
      } else if (lastChartImage && !includeChart && lastChartImage.length < MAX_IMAGE_CHARS) {
        // Include last chart for context in follow-up questions (skipped if it's an
        // old full-size screenshot that would push the request over the server's limit)
        requestBody.image = lastChartImage
        requestBody.isContextImage = true
        requestBody.chartToken = lastChartToken
      }
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController()
      
      // Call chat API
      const apiResponse = await fetch(
        `${process.env.PLASMO_PUBLIC_API_URL}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabase_session.access_token}`
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal
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
            requiresUpgrade: errorData.requiresUpgrade,
            canBuyMore: errorData.canBuyMore
          }
          setMessages(prev => [...prev, errorMsg])
          setIsSending(false)
          return
        }
        
        throw new Error(`API error: ${apiResponse.status}`)
      }

      const chatResult = await apiResponse.json()
      analytics.chatMessageSent(includeChart, { sessionId: session?.id })
      updateGettingStarted(includeChart ? { chatted: true, chartChatted: true } : { chatted: true })
      
      // Update usage tracking
      if (chatResult.usage) {
        setCurrentUsage((prev: any) => ({ ...chatResult.usage, canBuyMore: prev?.canBuyMore }))
      }
      
      // Notify user if chart wasn't counted due to quality
      if (chatResult.chartUnreadable) {
        setMessages(prev => [...prev, {
          type: 'info',
          content: 'ℹ️ Chart quality insufficient - screenshot not counted. Try zooming in or making the chart clearer. The chart might be too messy.',
          timestamp: new Date()
        }])
      }
      
      // Broadcast to other tabs that chat was updated
      broadcastChat()
      
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
          content: "I lost my train of thought there. Can you send that again? It didn't count against your usage.",
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
        setIsSending(false)
        abortControllerRef.current = null
        setTimeout(() => inputRef.current?.focus(), 100)
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
        isFavorited: false,
        tradeProposal: chatResult.tradeProposal || undefined
      }
      setMessages(prev => [...prev, assistantMessage])
      if (chatResult.tradeProposal) analytics.track('trade_log_offered', {})
      
      // Scroll to show the thinking bubble
      setTimeout(() => scrollToBottom(), 100)
      
      // Animate typing effect
      let charIndex = 0
      const charsPerTick = Math.max(2, Math.ceil(fullResponse.length / 100)) // ~100 ticks, about 2 seconds
      typingIntervalRef.current = setInterval(() => {
        charIndex += charsPerTick
        if (charIndex >= fullResponse.length) {
          charIndex = fullResponse.length
          clearInterval(typingIntervalRef.current!)
          typingIntervalRef.current = null
          // Mark typing as complete
          setMessages(prev => prev.map((msg, idx) => 
            idx === prev.length - 1 ? { ...msg, isTyping: false, content: fullResponse } : msg
          ))
          // Only now set isSending to false (after typing animation completes)
          setIsSending(false)
          abortControllerRef.current = null
          setTimeout(() => inputRef.current?.focus(), 100)
        } else {
          setMessages(prev => prev.map((msg, idx) => 
            idx === prev.length - 1 ? { ...msg, content: fullResponse.substring(0, charIndex) } : msg
          ))
        }
      }, 20) // 20ms per update
      
    } catch (error) {
      console.error("[Content] Chat failed:", error)
      
      // Check if it's a 401 error (session expired)
      if (error instanceof Error && error.message.includes('401')) {
        // Clear stale session
        await chrome.storage.local.remove('supabase_session')
        setSession(null)
        
        const errorMsg = {
          type: 'error',
          content: "Looks like you got signed out. Sign back in and we'll pick up right where we left off.",
          requiresLogin: true,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
      } else {
        const errorMsg = {
          type: 'error',
          content: "I couldn't reach the server just now. Check your connection and send that again?",
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
      }
      
      // Reset state on error
      setIsSending(false)
      abortControllerRef.current = null
      setTimeout(() => inputRef.current?.focus(), 100)
      
    } finally {
      // Don't set isSending to false here - it's now handled after typing animation completes
      // This ensures the stop button stays visible while AI is typing
    }
  }

  // Keep the window on screen: fully inside horizontally, header always reachable
  const clampPosition = (pos: { x: number, y: number }, width = size.width) => ({
    x: Math.min(Math.max(0, pos.x), Math.max(0, window.innerWidth - width)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, window.innerHeight - 80))
  })

  // Drag from anywhere on the header except its buttons
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
    e.preventDefault()
    dragOffsetRef.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition(clampPosition({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y }))
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Restore where the window and launcher were left; first time, open on the right below the site's toolbar
  useEffect(() => {
    chrome.storage.local.get(['widget_layout', 'launcher_pos']).then(({ widget_layout, launcher_pos }) => {
      const width = Math.min(widget_layout?.width ?? size.width, window.innerWidth)
      const height = widget_layout?.height ?? size.height
      if (widget_layout) setSize({ width, height })
      setPosition(clampPosition(widget_layout ? { x: widget_layout.x, y: widget_layout.y } : { x: window.innerWidth - width - 24, y: 60 }, width))
      if (launcher_pos) setLauncherPos(launcher_pos)
      layoutLoadedRef.current = true
    }).catch(() => { layoutLoadedRef.current = true })

    const keepOnScreen = () => setPosition(pos => clampPosition(pos))
    window.addEventListener('resize', keepOnScreen)
    return () => window.removeEventListener('resize', keepOnScreen)
  }, [])

  // Remember position and size once a drag or resize ends
  useEffect(() => {
    if (!layoutLoadedRef.current || isDragging || isResizing) return
    chrome.storage.local.set({ widget_layout: { ...position, ...size } }).catch(() => {})
  }, [isDragging, isResizing])

  // Launcher: drag to move, click to open
  const handleLauncherMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY, right: launcherPos.right, bottom: launcherPos.bottom }
    let moved = false
    let latest = launcherPos
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!moved && Math.hypot(dx, dy) < 4) return
      moved = true
      latest = {
        right: Math.min(Math.max(0, start.right - dx), window.innerWidth - 60),
        bottom: Math.min(Math.max(0, start.bottom - dy), window.innerHeight - 40)
      }
      setLauncherPos(latest)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (moved) chrome.storage.local.set({ launcher_pos: latest }).catch(() => {})
      else setIsOpen(true)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
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

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

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
    if (!isResizing) return
    e.preventDefault()
    e.stopPropagation()
    const deltaX = e.clientX - startPosRef.current.x
    const deltaY = e.clientY - startPosRef.current.y
    const newWidth = Math.max(300, Math.min(800, startSizeRef.current.width + deltaX))
    const newHeight = Math.max(400, Math.min(900, startSizeRef.current.height + deltaY))
    
    // Directly set DOM styles to bypass React and any site interference
    if (widgetRef.current) {
      widgetRef.current.style.setProperty('width', `${newWidth}px`, 'important')
      widgetRef.current.style.setProperty('height', `${newHeight}px`, 'important')
      widgetRef.current.style.setProperty('max-width', 'none', 'important')
      widgetRef.current.style.setProperty('max-height', 'none', 'important')
    }
    setSize({ width: newWidth, height: newHeight })
  }, [isResizing])

  const handleResizeMouseUp = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      // Multiple layers of mouseup detection to ensure we catch it
      const handleMouseUpCapture = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsResizing(false)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
      
      const handleMouseUpBubble = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsResizing(false)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
      
      // Use capture phase to intercept events before page handlers
      document.addEventListener("mousemove", handleResizeMouseMove, true)
      document.addEventListener("mouseup", handleMouseUpCapture, true)
      document.addEventListener("mouseup", handleMouseUpBubble, false)
      window.addEventListener("mouseup", handleMouseUpBubble, false)
      
      // Prevent text selection during resize
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'nwse-resize'
      
      // Safety timeout - force end resize after 30 seconds of no mouseup
      const safetyTimeout = setTimeout(() => {
        setIsResizing(false)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }, 30000)
      
      return () => {
        clearTimeout(safetyTimeout)
        document.removeEventListener("mousemove", handleResizeMouseMove, true)
        document.removeEventListener("mouseup", handleMouseUpCapture, true)
        document.removeEventListener("mouseup", handleMouseUpBubble, false)
        window.removeEventListener("mouseup", handleMouseUpBubble, false)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
    }
  }, [isResizing, handleResizeMouseMove, handleResizeMouseUp])

  // Pip's mood: thinking while working, wary on a streak or warning, pleased right after a win
  const busy = isAnalyzing || isSending
  const lastTrade = tradesToday.reduce<CoachTrade | null>((latest, t) => !latest || t.closed_at > latest.closed_at ? t : latest, null)
  const freshWin = !!(lastTrade && (lastTrade.realized_pnl ?? 0) > 0 && Date.now() - new Date(lastTrade.closed_at).getTime() < 3 * 60 * 1000)
  const lastMessage = messages[messages.length - 1]
  const headerMood: PipMood = busy || pipTyping ? 'thinking' : lastMessage && lastMessage.type !== 'user' ? messageMood(lastMessage) : 'idle'

  if (!isOpen) {
    const losingStreak = !!(autoDetectTrades && tradeStats && tradeStats.lossStreak >= 2)
    const statusDot = trackingStatus === 'tracking' ? 'bg-green-400' : trackingStatus === 'loading' ? 'bg-amber-400' : trackingStatus === 'no-panel' ? 'bg-red-400' : null
    const tip = [
      'Open Pip (Alt+Shift+S). Drag to move.',
      trackingStatus === 'no-panel' ? "Not tracking trades: open TradingView's trading panel." : null,
      losingStreak ? `${tradeStats!.lossStreak} losses in a row. Consider a break.` : null,
      streak && streak.days > 0 && !streak.brokenToday ? `🔥 ${streak.days} ${streak.days === 1 ? 'day' : 'days'} in a row with no rules broken` : null
    ].filter(Boolean).join('\n')
    const warned = unreadCheckins.some(c => c.level === 'warning')
    const launcherMood: PipMood = busy || pipTyping ? 'thinking' : warned || losingStreak ? 'caution' : freshWin ? 'happy' : 'idle'
    return (
      <div
        data-snapchart-widget
        style={{
          position: "fixed",
          bottom: `${launcherPos.bottom}px`,
          right: `${launcherPos.right}px`,
          zIndex: 2147483647
        }}
      >
        <button
          onMouseDown={handleLauncherMouseDown}
          title={tip}
          aria-label="Open Pip, your trading coach"
          className="relative block select-none rounded-full text-white shadow-xl shadow-black/40 transition-transform hover:scale-105 cursor-grab active:cursor-grabbing"
        >
          <Pip mood={launcherMood} size={56} />
          {autoDetectTrades && tradeStats && tradeStats.count > 0 && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-dark-border bg-dark-bg px-1.5 text-[10px] font-semibold leading-4 tabular-nums" title={`${tradeStats.count} trades today`}>
              {tradeStats.count}
            </span>
          )}
          {statusDot && <span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-white ${statusDot}`} />}
          {unreadCheckins.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold" title={`${unreadCheckins.length} new from your coach`}>
              {unreadCheckins.length}
            </span>
          ) : losingStreak && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold">{tradeStats!.lossStreak}L</span>
          )}
        </button>

        {pipTyping && !bubble && (
          <div
            className={`absolute flex items-center gap-1 rounded-2xl border px-3 py-2.5 shadow-xl ${
              launcherPos.bottom > window.innerHeight - 220 ? 'top-full mt-3' : 'bottom-full mb-3'
            } ${window.innerWidth - launcherPos.right < 300 ? 'left-0' : 'right-0'} ${
              theme === 'dark' ? 'border-dark-border bg-dark-surface text-dark-text' : 'border-slate-200 bg-white text-slate-400'
            }`}
            role="status"
            aria-label="Pip is typing"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-[bounce_1.4s_ease-in-out_infinite]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
        )}

        {bubble && (
          <div
            className={`absolute w-72 rounded-xl border p-3 text-sm shadow-2xl ${
              launcherPos.bottom > window.innerHeight - 220 ? 'top-full mt-3' : 'bottom-full mb-3'
            } ${window.innerWidth - launcherPos.right < 300 ? 'left-0' : 'right-0'} ${
              theme === 'dark' ? 'border-dark-border bg-dark-surface text-dark-body' : 'border-slate-200 bg-white text-slate-900'
            }`}
            role="status"
          >
            <div className="flex items-start gap-2">
              <Pip mood={bubble.level === 'warning' ? 'caution' : 'idle'} size={28} />
              <p className="flex-1 leading-snug">{bubble.text}</p>
              <button
                onClick={() => dismissCheckIn(bubble)}
                aria-label="Dismiss"
                className={`-mr-1 -mt-1 rounded px-1.5 text-base leading-none ${theme === 'dark' ? 'text-dark-text hover:bg-dark-elevated' : 'text-slate-400 hover:bg-slate-100'}`}
              >
                &times;
              </button>
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              {bubble.offerReset && (
                <button onClick={openReset} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
                  60-second reset
                </button>
              )}
              <button onClick={() => replyToCheckIn(bubble)} className={`rounded-md px-3 py-1 text-xs font-medium ${bubble.offerReset ? (theme === 'dark' ? 'border border-dark-border text-dark-body hover:bg-dark-elevated' : 'border border-slate-300 text-slate-700 hover:bg-slate-100') : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                Reply
              </button>
            </div>
          </div>
        )}
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

  const getVerdictLabel = (status: string) => {
    switch (status) {
      case "valid":
      case "aligned":
      case "pass": return "LINES UP WITH YOUR RULES"
      case "potentially_valid":
      case "incomplete":
      case "warn": return "INCOMPLETE SETUP"
      case "invalid":
      case "violated":
      case "fail": return "RULE BROKEN"
      default: return status.replace(/_/g, ' ').toUpperCase()
    }
  }

  return (
    <>
      {/* Resize overlay - captures all mouse events during resize */}
      {isResizing && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2147483646,
            cursor: 'nwse-resize',
            backgroundColor: 'transparent'
          }}
        />
      )}
      
      {/* Main Widget */}
      <div
      ref={widgetRef}
      data-snapchart-widget
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 2147483647,
        width: `${size.width}px`,
        height: `${size.height}px`,
        maxWidth: 'none',
        maxHeight: 'none',
        minWidth: '300px',
        minHeight: '400px'
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' && !lightboxData && !showMenu) setIsOpen(false)
      }}
      onKeyPress={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div className={`${theme === 'dark' ? 'bg-dark-bg text-white border-dark-border' : 'bg-white text-slate-900 border-slate-200'} relative rounded-lg shadow-2xl flex flex-col border overflow-hidden`} style={{ width: '100%', height: '100%' }}>
        {resetOpen && <ResetBreak dark={theme === 'dark'} onDone={finishReset} />}
        {/* Header - Draggable */}
        <div
          className={`select-none flex items-center justify-between p-2 cursor-move ${theme === 'dark' ? 'border-b border-dark-border bg-gradient-to-r from-dark-surface to-dark-elevated' : 'border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-1.5">
            <Pip mood={headerMood} size={28} title="Pip" />
            <div className="text-sm font-medium text-white">Pip</div>
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
              <div 
                ref={menuRef} 
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className={`absolute top-12 right-0 rounded-lg shadow-xl border py-2 z-50 min-w-[180px] ${theme === 'dark' ? 'bg-dark-surface border-dark-border' : 'bg-white border-slate-200'}`}
              >
                <button
                  onClick={() => {
                    window.open(`${process.env.PLASMO_PUBLIC_API_URL}/dashboard`, '_blank')
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
                <div className={`px-4 py-1.5 ${theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>
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
                <button
                  onClick={() => setAutoDetect(!autoDetectTrades)}
                  title="Logs your trades and wins/losses from TradingView's trading panel (Positions and Order history). Keep the panel open while you trade; it can be small."
                  className={`w-full flex items-center justify-between gap-3 px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  <span>Auto-detect trades</span>
                  <span className={`text-xs font-medium ${autoDetectTrades ? 'text-green-500' : theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>
                    {autoDetectTrades ? 'On' : 'Off'}
                  </span>
                </button>
                <button
                  onClick={cycleCheckinsMode}
                  title="The coach messages you when something happens: a losing streak, a quick re-entry after a loss, your limits, your plan for the day."
                  className={`w-full flex items-center justify-between gap-3 px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  <span>Coach check-ins</span>
                  <span className={`text-xs font-medium ${checkinsMode === 'on' ? 'text-green-500' : checkinsMode === 'warnings' ? 'text-amber-500' : theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>
                    {checkinsMode === 'on' ? 'On' : checkinsMode === 'warnings' ? 'Warnings only' : 'Off'}
                  </span>
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm('Clear all chat messages? This will reset the conversation but keep your rules and everything you saved for Pip.')) {
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
                          broadcastChat()
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
                    window.open('mailto:help@snapchartapp.com?subject=Pip%20feedback', '_blank')
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  Send feedback or report a bug
                </button>
                <button
                  onClick={() => {
                    window.open('https://tradewithpip.ai/privacy', '_blank')
                    setShowMenu(false)
                  }}
                  className={`w-full text-left px-4 py-1.5 text-sm ${theme === 'dark' ? 'hover:bg-dark-elevated text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}
                >
                  Privacy Policy
                </button>
                <button
                  onClick={() => {
                    window.open('https://tradewithpip.ai/terms', '_blank')
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
              title="Close (Esc or Alt+Shift+S)"
              className="text-white hover:text-blue-100 text-base"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Today's detected trades */}
        {autoDetectTrades && session && (
          <div className={`flex items-center gap-3 px-3 py-1.5 text-xs border-b ${theme === 'dark' ? 'bg-dark-bg border-dark-border text-dark-text' : 'bg-white border-slate-200 text-slate-600'}`}>
            {trackingStatus && (
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${trackingStatus === 'tracking' ? 'bg-green-500' : trackingStatus === 'loading' ? 'bg-amber-500' : 'bg-red-500'}`}
                title={trackingStatus === 'tracking' ? 'Tracking your trades' : trackingStatus === 'loading' ? 'Loading your order history' : "Not tracking: open TradingView's trading panel"}
              />
            )}
            <span className={`font-semibold ${theme === 'dark' ? 'text-dark-body' : 'text-slate-900'}`}>Today</span>
            {trackingStatus === 'no-panel' && (
              <span className="text-red-500">Not tracking: open TradingView's trading panel (it can be small)</span>
            )}
            {trackingStatus === 'no-panel' ? null : tradeStats && tradeStats.count > 0 ? (
              <>
                <span>{tradeStats.count} {tradeStats.count === 1 ? 'trade' : 'trades'}</span>
                <span>
                  <span className="text-green-500">{tradeStats.wins}W</span>{' '}
                  <span className="text-red-500">{tradeStats.losses}L</span>
                </span>
                <span className={tradeStats.net >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {tradeStats.net < 0 ? '\u2212' : '+'}${Math.abs(tradeStats.net).toFixed(2)}
                </span>
                {(tradeStats.unchecked ?? 0) > 0 && (
                  <span className="text-amber-500" title="Trades without a chart check in the 20 minutes before entry">{tradeStats.unchecked} unchecked</span>
                )}
                {tradeStats.lossStreak >= 2 ? (
                  <span className="ml-auto font-medium text-amber-500">{tradeStats.lossStreak} losses in a row</span>
                ) : streak && streak.days > 0 && !streak.brokenToday ? (
                  <span className="ml-auto" title={`${streak.days} trading ${streak.days === 1 ? 'day' : 'days'} in a row with no rules broken`}>🔥 {streak.days}</span>
                ) : null}
              </>
            ) : (
              <span>{trackingStatus === 'loading' ? 'Loading your order history\u2026' : 'No trades yet'}</span>
            )}
          </div>
        )}

        {/* Getting started (pinned above the messages so it never scrolls away) */}
        {gettingStarted && !gettingStarted.dismissed && (
          <GettingStarted
            dark={theme === 'dark'}
            signedIn={!!session}
            analyzed={!!gettingStarted.analyzed}
            chartChatted={!!gettingStarted.chartChatted}
            showTradeTracking={isTradingView}
            tradeTrackingOn={autoDetectTrades}
            onSignIn={() => window.open(`${process.env.PLASMO_PUBLIC_API_URL}/welcome`, '_blank')}
            onAnalyze={handleAnalyze}
            onTryChartQuestion={() => {
              setInputText('What should I wait for on this chart?')
              setAttachChart(true)
              setTimeout(() => inputRef.current?.focus(), 50)
            }}
            onEnableTradeTracking={() => setAutoDetect(true)}
            onDismiss={() => updateGettingStarted({ dismissed: true })}
          />
        )}

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
            <div className="mt-6 text-center">
              <div className="mx-auto mb-3 w-fit"><Pip size={64} /></div>
              <p className={`text-sm font-medium ${theme === 'dark' ? 'text-dark-body' : 'text-slate-900'}`}>Hi, I'm Pip, your trading coach</p>
              <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>I can check a chart against your rules, or you can ask me anything.</p>
              <div className="mt-4 flex flex-col items-center gap-2">
                {SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion.text}
                    onClick={() => {
                      setInputText(suggestion.text)
                      setAttachChart(suggestion.chart)
                      setTimeout(() => inputRef.current?.focus(), 50)
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${theme === 'dark' ? 'border-dark-border text-dark-body hover:bg-dark-elevated' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
                  >
                    {suggestion.chart ? '\u{1F4F7} ' : ''}{suggestion.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="relative group">
              <div className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.type !== 'user' && (
                  <div className="mr-2 mt-0.5 shrink-0">
                    <Pip mood={messageMood(msg)} size={26} animated={i === messages.length - 1} />
                  </div>
                )}
                {msg.type === 'user' && (
                  <div className="max-w-[80%]">
                    <div className={`${theme === 'dark' ? 'bg-dark-bubble text-dark-body' : 'bg-slate-200 text-slate-900'} px-4 py-2 rounded-2xl rounded-tr-sm ${getTextSizeClass()} transition-all ${
                      ''
                    }`}>
                      {msg.content}
                    </div>
                    {msg.timestamp && (
                      <div className={`text-[10px] mt-0.5 text-right px-1 ${theme === 'dark' ? 'text-dark-text' : 'text-slate-400'}`}>
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
                      </div>
                    )}
                  </div>
                )}
                
                {msg.type === 'error' && (
                  // Problems are said by Pip, in his own bubble, with the next step as a button
                  <div className={`max-w-[85%] rounded-2xl rounded-tl-sm border px-4 py-3 ${getTextSizeClass()} ${theme === 'dark' ? 'border-dark-border bg-dark-elevated text-dark-body' : 'border-slate-200 bg-white text-slate-900'}`}>
                    <div className={`markdown-content ${theme === 'dark' ? 'dark' : ''}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    {(msg.requiresLogin || msg.canBuyMore || msg.requiresUpgrade) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.requiresLogin && (
                          <button
                            onClick={() => window.open(process.env.PLASMO_PUBLIC_API_URL, '_blank')}
                            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                          >
                            Sign in
                          </button>
                        )}
                        {msg.canBuyMore && (
                          <button
                            onClick={() => window.open(`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/account`, '_blank')}
                            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                          >
                            Get more for today
                          </button>
                        )}
                        {msg.requiresUpgrade && (
                          <button
                            onClick={() => window.open(`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/account#plans`, '_blank')}
                            className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${theme === 'dark' ? 'border-dark-border text-dark-body hover:bg-dark-surface' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                          >
                            See Pro ($19/mo)
                          </button>
                        )}
                      </div>
                    )}
                    {msg.requiresLogin && (
                      <p className={`mt-2 text-xs ${theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>Come back here once you're in and try again.</p>
                    )}
                  </div>
                )}
                
                {msg.type === 'checkin' && (
                  <div className={`max-w-[85%] rounded-2xl rounded-tl-sm border px-4 py-3 ${getTextSizeClass()} ${
                    msg.level === 'warning'
                      ? theme === 'dark' ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-amber-300 bg-amber-50 text-amber-900'
                      : theme === 'dark' ? 'border-dark-border bg-dark-elevated text-dark-body' : 'border-slate-200 bg-white text-slate-900'
                  }`}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">Pip checked in</div>
                    {msg.content}
                    {msg.offerReset && (
                      <button onClick={openReset} className="mt-2.5 block rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                        Take a 60-second reset
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

                    className={`markdown-content ${theme === 'dark' ? 'dark' : ''} px-4 py-3 rounded-2xl rounded-tl-sm ${getTextSizeClass()} shadow-sm transition-all ${theme === 'dark' ? 'bg-dark-elevated border border-dark-border text-dark-body' : 'bg-white border border-slate-200 text-slate-900'} ${
                      ''
                    }`}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                  {msg.tradeProposal && !msg.isTyping && msg.tradeStatus !== 'dismissed' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
                      {msg.tradeStatus === 'logged' || msg.tradeStatus === 'duplicate' ? (
                        <span className={`text-xs ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                          {msg.tradeStatus === 'duplicate' ? 'I already have that one in your journal.' : 'Logged to your journal.'}{' '}
                          <a href={`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/journal`} target="_blank" rel="noopener noreferrer" className="underline">View</a>
                        </span>
                      ) : (
                        <>
                          {(() => {
                            const p = msg.tradeProposal
                            const kind: string = p.kind ?? 'trade'
                            const money = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                            const gap = Math.round((p.amount - (p.logged_net ?? 0)) * 100) / 100
                            const busy = msg.tradeStatus === 'saving'
                            const primary = 'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60'
                            const secondary = `rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${theme === 'dark' ? 'border-blue-500 text-blue-300 hover:bg-blue-500/10' : 'border-blue-600 text-blue-700 hover:bg-blue-50'}`
                            const dayLabel = (p.logged_net ?? 0) !== 0 ? `Log ${money(gap)} to make your day ${money(p.amount)}` : `Log ${money(p.amount)} as my day total`
                            return (
                              <>
                                {kind === 'unclear' && (
                                  <span className={`w-full text-xs ${theme === 'dark' ? 'text-dark-text' : 'text-slate-600'}`}>Was that one trade, or your total for the day?</span>
                                )}
                                {kind !== 'day_total' && p.strategies?.length > 0 && (
                                  <select
                                    value={tradeStrategy[p.id] ?? ''}
                                    onChange={e => setTradeStrategy(prev => ({ ...prev, [p.id]: e.target.value }))}
                                    disabled={busy}
                                    title="Which of your strategies this trade was"
                                    className={`max-w-[10rem] rounded-lg border px-2 py-1.5 text-xs ${theme === 'dark' ? 'border-dark-border bg-dark-elevated text-dark-body' : 'border-slate-300 bg-white text-slate-700'}`}
                                  >
                                    <option value="">No strategy / other</option>
                                    {p.strategies.map((st: { id: string; name: string }) => <option key={st.id} value={st.id}>{st.name}</option>)}
                                  </select>
                                )}
                                {kind !== 'day_total' && (
                                  <button onClick={() => logReportedTrade(p, 'trade')} disabled={busy} className={primary}>
                                    {busy ? 'Logging…' : kind === 'unclear' ? `One trade: ${money(p.amount)}${p.symbol ? ` ${p.symbol}` : ''}` : `Log ${money(p.amount)}${p.symbol ? ` ${p.symbol}` : ''} to my journal`}
                                  </button>
                                )}
                                {kind !== 'trade' && (
                                  <button onClick={() => logReportedTrade(p, 'day_total')} disabled={busy} className={kind === 'day_total' ? primary : secondary} title="Adds what the journal is missing so your day adds up. It counts in P&L, not as a trade.">
                                    {busy && kind === 'day_total' ? 'Logging…' : kind === 'unclear' ? `Day total${(p.logged_net ?? 0) !== 0 ? ` (adds ${money(gap)})` : ''}` : dayLabel}
                                  </button>
                                )}
                              </>
                            )
                          })()}
                          <button
                            onClick={() => dismissReportedTrade(msg.tradeProposal.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs ${theme === 'dark' ? 'border-dark-border text-dark-text hover:text-dark-body' : 'border-slate-300 text-slate-600 hover:text-slate-900'}`}
                          >
                            Not now
                          </button>
                        </>
                      )}
                      {msg.tradeStatus === 'error' && <span className="text-xs text-red-400">{msg.tradeError}</span>}
                    </div>
                  )}
                  {(() => {
                    const draft = rulesFromReply(msg.content)
                    if (!draft) return null
                    const status = rulesSave[i]
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
                        {status?.state === 'saved' ? (
                          <span className={`text-xs ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                            {status.created ? 'Created' : 'Saved to'} your <span className="font-semibold">{status.name ?? 'main'}</span> strategy ·{' '}
                            <a href={`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/rules${status.id ? `?strategy=${status.id}` : ''}`} target="_blank" rel="noopener noreferrer" className="underline">View</a>
                          </span>
                        ) : (
                          <button
                            onClick={() => saveRulesFromReply(i, draft.rules, draft.name)}
                            disabled={status?.state === 'saving'}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                          >
                            {status?.state === 'saving' ? 'Saving…' : draft.name ? `Save as my "${draft.name}" strategy` : 'Save as my rules'}
                          </button>
                        )}
                        {status?.state === 'error' && <span className="text-xs text-red-400">{status.error}</span>}
                      </div>
                    )
                  })()}
                  {msg.timestamp && (
                    <div className={`text-[10px] mt-0.5 text-left px-1 ${theme === 'dark' ? 'text-dark-text' : 'text-slate-400'}`}>
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
                  
                  {(() => {
                    const analysis = msg.content
                    const dark = theme === 'dark'
                    const muted = dark ? 'text-dark-text' : 'text-slate-500'
                    const sectionLabel = `text-[11px] font-semibold uppercase tracking-wide mb-1 ${muted}`
                    const checks: any[] = analysis.rule_checks || []
                    const selfChecks: string[] = analysis.self_check_rules || []
                    const passed = checks.filter(check => check.status === 'pass').length
                    const failed = checks.filter(check => check.status === 'fail').length
                    const unclear = checks.length - passed - failed
                    const detailsOpen = !!expandedDetails[i]
                    const levelDot = (type: string) =>
                      type === 'support' ? 'bg-green-500'
                      : type === 'resistance' ? 'bg-red-500'
                      : type === 'invalidation' ? 'bg-orange-500'
                      : 'bg-blue-500'

                    // The card answers one question at a glance: does this fit my rules, and if
                    // not, what am I waiting for? Everything else is one tap away in Details.
                    const aligned = analysis.setup_status === 'aligned'
                    const waitFor: string[] = analysis.wait_for || []
                    const nextStep = !aligned ? waitFor[0] : undefined
                    // The nudge earns a spot up front only on a rule break or an off-plan setup
                    const nudgeUpFront = !!analysis.behavioral_nudge && (analysis.setup_status === 'violated' || analysis.matched_strategy === null)
                    const ticked: number[] = msg.checklistTicked || []
                    const checklist = checklistProgress(analysis, ticked)
                    const tick = (index: number) => {
                      skipNextScrollRef.current = true
                      setMessages(prev => prev.map((m, idx) => idx === i
                        ? { ...m, checklistTicked: ticked.includes(index) ? ticked.filter(t => t !== index) : [...ticked, index] }
                        : m))
                    }

                    return (
                      <>
                        {/* Which of their strategies this chart was checked against */}
                        {'matched_strategy' in analysis && (
                          <div className={`mb-1.5 text-[11px] ${muted}`}>
                            {analysis.matched_strategy
                              ? <>Your <span className={dark ? 'text-dark-body font-medium' : 'text-slate-900 font-medium'}>{analysis.matched_strategy}</span> strategy</>
                              : 'Not one of your strategies'}
                          </div>
                        )}
                        <div className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${getVerdictColor(analysis.setup_status)}`}>
                          {analysis.headline || getVerdictLabel(analysis.setup_status)}
                        </div>
                        {analysis.headline_reason && (
                          <div className={dark ? 'text-dark-body' : 'text-slate-900'}>{analysis.headline_reason}</div>
                        )}
                        {nextStep && (
                          <div className="mt-2 flex gap-1.5 text-[13px]">
                            <span className={`shrink-0 font-semibold ${muted}`}>Wait for:</span>
                            <span>{nextStep}</span>
                          </div>
                        )}
                        {nudgeUpFront && (
                          <div className={`mt-2 text-[13px] italic ${dark ? 'text-amber-200/90' : 'text-amber-800'}`}>{analysis.behavioral_nudge}</div>
                        )}

                        {/* Details toggle and rating on one quiet row */}
                        <div className={`mt-3 flex items-center justify-between gap-2 border-t pt-2 text-[12px] ${dark ? 'border-dark-border' : 'border-slate-200'}`}>
                          <button onClick={() => setExpandedDetails(prev => ({ ...prev, [i]: !prev[i] }))} className={`flex items-center gap-2 ${muted} hover:underline`}>
                            {detailsOpen ? 'Hide details ▴' : (checklist.total ? 'Checklist' : 'Details')}
                            {!detailsOpen && checklist.total > 0 && <ChecklistMeter done={checklist.done} total={checklist.total} dark={dark} />}
                            {!detailsOpen && <span>▾</span>}
                          </button>
                          {msg.id && (
                            ratings[msg.id] ? (
                              <span className={muted}>Thanks!</span>
                            ) : (
                              <span className={`flex items-center gap-0.5 ${muted}`} title="Was this verdict right?">
                                <button onClick={() => rateAnalysis(msg.id, 1)} aria-label="Verdict was right" className={`rounded px-1 py-0.5 ${dark ? 'hover:bg-dark-elevated' : 'hover:bg-slate-100'}`}>👍</button>
                                <button onClick={() => rateAnalysis(msg.id, -1)} aria-label="Verdict was wrong" className={`rounded px-1 py-0.5 ${dark ? 'hover:bg-dark-elevated' : 'hover:bg-slate-100'}`}>👎</button>
                              </span>
                            )
                          )}
                        </div>

                        {detailsOpen && (
                          <>
                            <CheckDetails analysis={analysis} dark={dark} ticked={ticked} onTick={tick} skipFirstWaitFor={!!nextStep} />
                            {analysis.behavioral_nudge && !nudgeUpFront && (
                              <div className={`mt-3 text-[13px] italic ${dark ? 'text-amber-200/90' : 'text-amber-800'}`}>{analysis.behavioral_nudge}</div>
                            )}
                          </>
                        )}

                        <div className={`mt-2 text-[10px] ${muted}`}>Not financial advice. AI can be wrong.</div>
                      </>
                    )
                  })()}
                </div>
                  {msg.timestamp && (
                    <div className={`text-[10px] mt-0.5 text-left px-1 ${theme === 'dark' ? 'text-dark-text' : 'text-slate-400'}`}>
                      {formatMessageTime(msg.timestamp)}
                    </div>
                  )}
                </div>
              )}
              </div>
              {msg.id && (msg.type === 'user' || msg.type === 'assistant') && (
                <div className={`mt-1 flex ${msg.type === 'user' ? 'justify-end' : 'pl-[34px]'}`}>
                  <button
                    onClick={() => toggleFavorite(msg.id, msg.isFavorited)}
                    title={msg.isFavorited ? 'Pip remembers this in every chat. Click to remove.' : 'Save this so Pip remembers it in every chat'}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-all ${
                      msg.isFavorited
                        ? theme === 'dark' ? 'text-blue-300 hover:bg-dark-elevated' : 'text-blue-700 hover:bg-slate-100'
                        : `opacity-0 group-hover:opacity-100 focus:opacity-100 ${theme === 'dark' ? 'text-dark-text hover:bg-dark-elevated hover:text-dark-body' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={msg.isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 3h12v18l-6-4-6 4z" />
                    </svg>
                    {msg.isFavorited ? 'Saved · Pip remembers this' : 'Save for Pip'}
                  </button>
                </div>
              )}
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
          
          {(isAnalyzing || isSending || pipTyping) && (
            <div className="flex justify-start">
              <div className="mr-2 mt-0.5 shrink-0"><Pip mood="thinking" size={26} /></div>
              <div className={`px-4 py-3 rounded-2xl rounded-tl-sm ${getTextSizeClass()} ${theme === 'dark' ? 'bg-dark-elevated border border-dark-border text-dark-text' : 'bg-white border border-slate-200 text-slate-400'}`}>
                <div className="flex items-center gap-1">
                  {isAnalyzing && <span className="mr-1.5">{ANALYZE_STAGES[analyzeStage]}</span>}
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-[bounce_1.4s_ease-in-out_infinite]"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-[bounce_1.4s_ease-in-out_0.2s_infinite]"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-[bounce_1.4s_ease-in-out_0.4s_infinite]"></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`relative p-3 space-y-1.5 ${theme === 'dark' ? 'border-t border-dark-border bg-dark-bg' : 'border-t border-slate-200 bg-white'}`}>
          {saveToast && (
            <div
              role="status"
              className={`absolute inset-x-3 bottom-full mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg ${
                saveToast.tone === 'limit'
                  ? theme === 'dark' ? 'border-amber-500/40 bg-dark-surface text-amber-100' : 'border-amber-300 bg-amber-50 text-amber-900'
                  : theme === 'dark' ? 'border-dark-border bg-dark-surface text-dark-body' : 'border-slate-200 bg-white text-slate-800'
              }`}
            >
              <Pip size={20} mood={saveToast.tone === 'limit' ? 'caution' : 'happy'} animated={false} />
              <div className="flex-1 leading-snug">
                {saveToast.text}
                {saveToast.tone === 'limit' && (
                  <a href={`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/saved-messages`} target="_blank" rel="noopener noreferrer" className="ml-1 underline">Manage saved</a>
                )}
              </div>
              <button onClick={() => setSaveToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">&times;</button>
            </div>
          )}
          {/* Timeout Timer (replaces input when active) */}
          {isTimedOut && timeoutEndTime ? (
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-dark-surface border border-dark-border' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">⏸️</div>
                  <div>
                    <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Taking a break
                    </div>
                    <div className={`text-xs ${theme === 'dark' ? 'text-dark-text' : 'text-slate-600'}`}>
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
              {/* Main action */}
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || isSending}
                title={isSending ? "Please wait for the reply" : "Check this chart against your rules"}
                className={`w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 ${getTextSizeClass()} transition-colors`}
              >
                <span className={`h-2 w-2 rounded-full bg-white ${isAnalyzing ? 'animate-pulse' : ''}`} />
                {isAnalyzing ? ANALYZE_STAGES[analyzeStage] : "Check this setup"}
              </button>

              {/* Message box */}
              <div className={`rounded-xl border transition-colors focus-within:border-blue-500 ${theme === 'dark' ? 'border-dark-border bg-dark-surface' : 'border-slate-300 bg-white'}`}>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    // Enter sends, Shift+Enter starts a new line; Ctrl+Enter (Cmd+Enter on Mac) sends with the chart
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (inputText.trim() && !isSending && !isAnalyzing) {
                        handleSendMessage(inputText, attachChart || e.ctrlKey || e.metaKey)
                        setAttachChart(false)
                      }
                    }
                  }}
                  onKeyPress={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  placeholder={isSending ? "Coach is replying..." : attachChart ? "Ask about this chart..." : "Ask your coach anything..."}
                  maxLength={500}
                  className={`block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 leading-relaxed ${getTextSizeClass()} focus:outline-none ${theme === 'dark' ? 'text-white placeholder-dark-placeholder' : 'text-slate-900 placeholder-slate-500'}`}
                />
                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                  <button
                    onClick={() => setAttachChart(!attachChart)}
                    aria-pressed={attachChart}
                    title="Send a screenshot of your chart with this message. Shortcut: Ctrl+Enter (Cmd+Enter on Mac) sends with the chart"
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      attachChart
                        ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                        : theme === 'dark' ? 'border-dark-border text-dark-text hover:text-dark-body' : 'border-slate-300 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    {attachChart ? 'Chart included' : 'Include my chart'}
                  </button>
                  <div className="flex items-center gap-2">
                    {inputText.length >= 400 && (
                      <span className={`text-[11px] tabular-nums ${inputText.length >= 500 ? 'text-red-500' : theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>{inputText.length}/500</span>
                    )}
                    {isSending ? (
                      <button
                        onClick={stopGeneration}
                        className={`h-7 w-7 flex items-center justify-center rounded-full transition-colors ${theme === 'dark' ? 'bg-dark-elevated text-red-400 hover:bg-red-950' : 'bg-slate-100 text-red-600 hover:bg-red-50'}`}
                        title="Stop"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"></rect></svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (inputText.trim() && !isAnalyzing) {
                            handleSendMessage(inputText, attachChart)
                            setAttachChart(false)
                          }
                        }}
                        disabled={!inputText.trim() || isAnalyzing}
                        className="h-7 w-7 flex items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={attachChart ? "Send with chart" : "Send"}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* What's left today */}
              {currentUsage?.credits ? (
                <div className={`px-1 text-[11px] ${theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`h-1 flex-1 rounded-full ${theme === 'dark' ? 'bg-dark-elevated' : 'bg-slate-200'}`}>
                      <div
                        className={`h-1 rounded-full ${currentUsage.credits.percent >= 100 && currentUsage.credits.bonus <= 0 ? 'bg-red-500' : currentUsage.credits.percent >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${currentUsage.credits.percent}%` }}
                      />
                    </div>
                    <span className="tabular-nums">{currentUsage.credits.percent}% used today</span>
                  </div>
                  <div className="mt-0.5 flex justify-between">
                    <span>About {currentUsage.credits.checksLeft} chart {currentUsage.credits.checksLeft === 1 ? 'check' : 'checks'} left</span>
                    {currentUsage.credits.percent >= 80 && (currentUsage.canBuyMore || currentUsage.limits?.maxScreenshots !== undefined) && (
                      <a href={`${process.env.PLASMO_PUBLIC_API_URL}/dashboard/account`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Get more</a>
                    )}
                  </div>
                </div>
              ) : currentUsage && (
                <div className={`flex justify-between px-1 text-[11px] ${theme === 'dark' ? 'text-dark-text' : 'text-slate-500'}`}>
                  <span className={currentUsage.screenshots >= currentUsage.limits.maxScreenshots ? 'text-red-400' : ''}>
                    {Math.max(0, currentUsage.limits.maxScreenshots - currentUsage.screenshots)} of {currentUsage.limits.maxScreenshots} chart checks left today
                  </span>
                  <span className={currentUsage.messages >= currentUsage.limits.maxMessages ? 'text-red-400' : ''}>
                    {Math.max(0, currentUsage.limits.maxMessages - currentUsage.messages)} messages left
                  </span>
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
            borderBottomRightRadius: '8px',
            pointerEvents: 'auto',
            touchAction: 'none'
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

// First-run checklist, pinned above the chat. Collapsed it shows only the next
// step; expanded it shows every step.
function GettingStarted(props: {
  dark: boolean
  signedIn: boolean
  analyzed: boolean
  chartChatted: boolean
  showTradeTracking: boolean
  tradeTrackingOn: boolean
  onSignIn: () => void
  onAnalyze: () => void
  onTryChartQuestion: () => void
  onEnableTradeTracking: () => void
  onDismiss: () => void
}) {
  const { dark } = props
  const [expanded, setExpanded] = useState(false)
  const muted = dark ? 'text-dark-text' : 'text-slate-500'
  const strong = dark ? 'text-dark-body' : 'text-slate-900'

  const items = [
    !props.signedIn && { done: false, title: 'Create your free account', detail: 'About 10 seconds.', action: 'Sign in', onClick: props.onSignIn },
    { done: props.analyzed, title: 'Check this chart against your rules', detail: 'A verdict in about 15 seconds. Free, doesn\'t count toward your daily limit.', action: props.signedIn ? 'Check this setup' : null, onClick: props.onAnalyze },
    { done: props.chartChatted, title: 'Ask about your chart', detail: 'Type a question, turn on Chart, and send. Your first one is free too.', action: props.signedIn ? 'Try a question' : null, onClick: props.onTryChartQuestion },
    props.showTradeTracking && { done: props.tradeTrackingOn, title: 'Track your trades automatically', detail: "Keep TradingView's trading panel open (it can be small).", action: props.signedIn ? 'Turn on' : null, onClick: props.onEnableTradeTracking }
  ].filter(Boolean) as { done: boolean, title: string, detail: string, action: string | null, onClick: () => void }[]

  const doneCount = items.filter(item => item.done).length
  const allDone = doneCount === items.length
  const next = items.find(item => !item.done)
  const shown = expanded ? items : next ? [next] : []

  return (
    <div className={`px-3 py-2.5 border-b ${dark ? 'bg-dark-bg border-dark-border' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-2">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 flex items-center gap-2 text-left">
          <span className={`text-xs font-semibold ${strong}`}>{allDone ? "You're all set" : 'Get started'}</span>
          <span className="flex gap-1" aria-label={`${doneCount} of ${items.length} done`}>
            {items.map(item => (
              <span key={item.title} className={`h-1.5 w-4 rounded-full ${item.done ? 'bg-green-500' : dark ? 'bg-dark-border' : 'bg-slate-200'}`} />
            ))}
          </span>
          <span className={`text-[11px] ${muted}`}>{expanded ? 'Hide steps' : `${doneCount}/${items.length}`}</span>
        </button>
        <button onClick={props.onDismiss} className={`text-[11px] ${muted} hover:underline`} title="Hide the checklist">
          {allDone ? 'Close' : 'Skip'}
        </button>
      </div>

      {shown.length > 0 && (
        <ol className="mt-2 space-y-2.5">
          {shown.map(item => (
            <li key={item.title} className="flex gap-2.5">
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${item.done ? 'bg-green-500 border-green-500 text-white' : dark ? 'border-dark-border' : 'border-slate-300'}`}>
                {item.done ? '\u2713' : ''}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm leading-tight ${item.done ? `line-through ${muted}` : strong}`}>{item.title}</div>
                {!item.done && <div className={`text-xs mt-0.5 ${muted}`}>{item.detail}</div>}
                {!item.done && item.action && (
                  <button onClick={item.onClick} className="mt-1.5 rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1 text-xs font-medium text-white">
                    {item.action}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {expanded && (
        <p className={`mt-3 text-[11px] leading-snug ${muted}`}>
          Pip captures your chart only when you ask, and saves your chat so you can pick up later (clear it anytime). By using it you agree to the{' '}
          <a href="https://tradewithpip.ai/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a> and{' '}
          <a href="https://tradewithpip.ai/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>.
        </p>
      )}
    </div>
  )
}
