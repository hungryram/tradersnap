import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

import "~style.css"

const supabase = createClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!
)

function IndexPopup() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    // Check auth state
    console.log('[Popup] Component mounted, checking initial auth state...')
    console.log('[Popup] Supabase URL:', process.env.PLASMO_PUBLIC_SUPABASE_URL)
    console.log('[Popup] API URL:', process.env.PLASMO_PUBLIC_API_URL)
    
    // First, try to load session from the auth domain's localStorage
    const checkAuthDomainSession = async () => {
      try {
        // Query the auth domain tab if it's open
        const tabs = await chrome.tabs.query({ url: `${process.env.PLASMO_PUBLIC_API_URL}/*` })
        if (tabs.length > 0) {
          console.log('[Popup] Auth domain tab found, checking for session...')
          const result = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id! },
            func: () => localStorage.getItem('trading_buddy_session')
          })
          
          if (result[0]?.result) {
            const session = JSON.parse(result[0].result)
            console.log('[Popup] Found session in auth domain localStorage!')
            setIsLoggedIn(true)
            setUser(session.user)
            chrome.storage.local.set({ supabase_session: session })
            return
          }
        }
      } catch (error) {
        console.log('[Popup] Could not access auth domain:', error)
      }
      
      // Fallback to Supabase session check
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        console.log('[Popup] Initial session:', session ? 'Found' : 'None')
        setIsLoggedIn(!!session)
        setUser(session?.user || null)
      
      // Store session in chrome.storage for content script
      if (session) {
        chrome.storage.local.set({ 
          supabase_session: session 
        })
      }
    })
    }
    
    checkAuthDomainSession()

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

    // Poll for session updates (in case user signs in via magic link)
    const pollInterval = setInterval(async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (session && !isLoggedIn) {
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
          
          <p className="text-sm text-slate-300">
            Use <span className="font-mono bg-slate-800 px-1 rounded">Cmd/Ctrl + Shift + A</span> to analyze charts
          </p>

          <button 
            className="w-full bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm"
            onClick={async () => {
              const storage = await chrome.storage.local.get('supabase_session')
              console.log('Storage check:', storage)
              alert(storage.supabase_session ? 'Session stored ✓' : 'No session in storage ✗')
            }}
          >
            Check Storage
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
