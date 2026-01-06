import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"

import "~style.css"

const supabase = createBrowserClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!
)

function IndexPopup() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check auth state
    console.log('[Popup] Component mounted, checking initial auth state...')
    
    const initializeAuth = async () => {
      // First, check chrome.storage for existing session
      try {
        const result = await chrome.storage.local.get('supabase_session')
        console.log('[Popup] Storage check:', result)
        
        if (result.supabase_session?.user) {
          console.log('[Popup] Found session in storage!')
          setIsLoggedIn(true)
          setUser(result.supabase_session.user)
          setIsLoading(false)
          return
        }
      } catch (error) {
        console.error('[Popup] Storage check failed:', error)
      }
      
      // Fallback: Try auth domain localStorage
      try {
        const tabs = await chrome.tabs.query({ url: `${process.env.PLASMO_PUBLIC_API_URL}/*` })
        if (tabs.length > 0) {
          console.log('[Popup] Auth domain tab found')
          const result = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id! },
            func: () => localStorage.getItem('trading_buddy_session')
          })
          
          if (result[0]?.result) {
            const session = JSON.parse(result[0].result)
            console.log('[Popup] Found session in auth domain!')
            setIsLoggedIn(true)
            setUser(session.user)
            chrome.storage.local.set({ supabase_session: session })
            setIsLoading(false)
            return
          }
        }
      } catch (error) {
        console.log('[Popup] Auth domain check failed:', error)
      }
      
      // Final fallback: Supabase getSession
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[Popup] Supabase session:', session ? 'Found' : 'None')
      setIsLoggedIn(!!session)
      setUser(session?.user || null)
      setIsLoading(false)
      
      if (session) {
        chrome.storage.local.set({ supabase_session: session })
      }
    }
    
    // Run initialization
    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Popup] Auth state changed:', event)
        setIsLoggedIn(!!session)
        setUser(session?.user || null)
        
        // Update chrome.storage
        if (session) {
          chrome.storage.local.set({ 
            supabase_session: session 
          })
        } else {
          chrome.storage.local.remove('supabase_session')
        }
      }
    )

    // Poll for session updates (in case user signs in via magic link or web app)
    const pollInterval = setInterval(async () => {
      // Check chrome.storage first (updated by content script when web app session changes)
      const storageResult = await chrome.storage.local.get('supabase_session')
      if (storageResult.supabase_session) {
        console.log('[Popup] Session found in storage during poll!')
        setIsLoggedIn(true)
        setUser(storageResult.supabase_session.user)
        return
      }
      
      // Fallback to Supabase session check
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (session) {
        console.log('[Popup] Session found during poll!')
        setIsLoggedIn(true)
        setUser(session.user)
        chrome.storage.local.set({ supabase_session: session })
      } else if (session && isLoggedIn) {
        // Refresh existing session in storage (updates access token if refreshed)
        chrome.storage.local.set({ supabase_session: session })
      }
    }, 2000) // Check every 2 seconds

    return () => {
      subscription.unsubscribe()
      clearInterval(pollInterval)
    }
  }, [isLoggedIn])

  const handleSignOut = async () => {
    try {
      console.log('[Popup] Signing out...')
      await supabase.auth.signOut()
      await chrome.storage.local.remove('supabase_session')
      
      // Also try to clear from auth domain localStorage
      try {
        const tabs = await chrome.tabs.query({ url: `${process.env.PLASMO_PUBLIC_API_URL}/*` })
        if (tabs.length > 0) {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id! },
            func: () => localStorage.removeItem('trading_buddy_session')
          })
        }
      } catch (error) {
        console.log('[Popup] Could not clear auth domain storage:', error)
      }
      
      console.log('[Popup] Sign out complete')
      setIsLoggedIn(false)
      setUser(null)
    } catch (error) {
      console.error('[Popup] Sign out error:', error)
      // Force clear local state even if API call fails
      await chrome.storage.local.remove('supabase_session')
      setIsLoggedIn(false)
      setUser(null)
    }
  }

  return (
    <div className="w-80 h-96 p-4 bg-slate-900 text-white">
      <h1 className="text-xl font-bold mb-4">Trading Buddy</h1>
      
      {!isLoggedIn ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Sign in to start analyzing your trades
          </p>
          <button 
            className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
            onClick={() => {
              chrome.tabs.create({ 
                url: `${process.env.PLASMO_PUBLIC_API_URL}` 
              })
            }}
          >
            Sign In
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-800 p-3 rounded">
            <p className="text-xs text-slate-400">Signed in as</p>
            <p className="text-sm font-medium truncate">{user?.email}</p>
          </div>
          
          <div className="text-xs text-slate-300 space-y-1">
            <p>Keyboard shortcuts:</p>
            <p><span className="font-mono bg-slate-800 px-1 rounded">Ctrl + A</span> - Analyze chart</p>
            <p><span className="font-mono bg-slate-800 px-1 rounded">Ctrl + Enter</span> - Send with chart</p>
          </div>

          <button 
            className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
            onClick={() => {
              chrome.tabs.create({ 
                url: `${process.env.PLASMO_PUBLIC_API_URL}/dashboard/rules` 
              })
            }}
          >
            Open Dashboard
          </button>
          
          <button 
            className="w-full bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

export default IndexPopup
