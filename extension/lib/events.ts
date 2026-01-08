// Helper function to log usage events
export async function logEvent(
  eventType: 'extension_opened' | 'chart_uploaded' | 'analysis_started' | 'analysis_finished' | 'user_reported_trade_taken' | 'chat_message_sent' | 'session_cleared',
  metadata?: Record<string, any>,
  sessionId?: string
) {
  try {
    // Get session token
    const result = await chrome.storage.local.get('supabase_session')
    const session = result.supabase_session
    
    if (!session?.access_token) {
      console.log('[Events] No session, skipping event log')
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
    }).catch(err => {
      console.error('[Events] Failed to log event:', err)
      // Silent fail - don't disrupt user experience
    })
  } catch (error) {
    console.error('[Events] Error logging event:', error)
    // Silent fail
  }
}
