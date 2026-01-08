/**
 * Analytics tracking for user behavior
 * 
 * This tracks meaningful actions (not every click) to understand:
 * - Who's using the extension
 * - If the analysis is too strict/lenient
 * - Who's forming habits (returning users)
 * - Where people drop off
 */

interface AnalyticsContext {
  sessionId?: string
  session?: any
}

// Get session from chrome storage
async function getSession() {
  try {
    const result = await chrome.storage.local.get('supabase_session')
    return result.supabase_session
  } catch {
    return null
  }
}

// Core event logger
async function logEvent(
  eventType: string,
  metadata?: Record<string, any>,
  sessionId?: string
) {
  try {
    const session = await getSession()
    
    if (!session?.access_token) {
      // No session - skip logging (user not logged in)
      return
    }

    // Fire and forget - don't block UI
    fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        event_type: eventType,
        session_id: sessionId,
        metadata: metadata || {}
      })
    }).catch(() => {
      // Silent fail - don't disrupt user experience
    })
  } catch {
    // Silent fail
  }
}

// Public API - clean, typed functions

export const analytics = {
  /**
   * Track when user opens the extension widget
   */
  extensionOpened: (ctx?: AnalyticsContext) => {
    logEvent('extension_opened', {}, ctx?.sessionId)
  },

  /**
   * Track when a chart screenshot is captured
   */
  chartUploaded: (source: 'screenshot' | 'paste' = 'screenshot', ctx?: AnalyticsContext) => {
    logEvent('chart_uploaded', { source }, ctx?.sessionId)
  },

  /**
   * Track when analysis starts
   */
  analysisStarted: (ctx?: AnalyticsContext) => {
    logEvent('analysis_started', {}, ctx?.sessionId)
  },

  /**
   * Track when analysis completes with a decision
   */
  analysisFinished: (
    decision: 'pass' | 'warn' | 'fail' | string,
    ctx?: AnalyticsContext
  ) => {
    logEvent('analysis_finished', { decision }, ctx?.sessionId)
  },

  /**
   * Track when user reports they took a trade
   * (Future feature: add a "Did you take this trade?" button)
   */
  tradeReported: (taken: boolean, ctx?: AnalyticsContext) => {
    logEvent('user_reported_trade_taken', { taken }, ctx?.sessionId)
  },

  /**
   * Track when user sends a chat message
   */
  chatMessageSent: (includedChart: boolean, ctx?: AnalyticsContext) => {
    logEvent('chat_message_sent', { included_chart: includedChart }, ctx?.sessionId)
  },

  /**
   * Track when user clears their chat history
   */
  sessionCleared: () => {
    logEvent('session_cleared')
  }
}
