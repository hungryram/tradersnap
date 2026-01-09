import { useEffect, useState } from "react"

import "~style.css"

function IndexPopup() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [userPlan, setUserPlan] = useState<string | null>(null)

  useEffect(() => {
    console.log('[Popup] Initializing...')
    
    const checkSession = async () => {
      try {
        // First check chrome.storage
        const result = await chrome.storage.local.get('supabase_session')
        console.log('[Popup] Chrome storage check:', result.supabase_session ? 'Session found' : 'No session')
        
        if (result.supabase_session?.user) {
          const session = result.supabase_session
          
          // Verify it's not expired
          const expiresAt = session.expires_at
          const now = Date.now() / 1000
          
          if (expiresAt && expiresAt > now) {
            console.log('[Popup] Valid session:', session.user.email)
            setIsLoggedIn(true)
            setUser(session.user)
            
            // Fetch user plan
            try {
              const response = await fetch(`${process.env.PLASMO_PUBLIC_API_URL}/api/me`, {
                headers: {
                  'Authorization': `Bearer ${session.access_token}`
                }
              })
              if (response.ok) {
                const data = await response.json()
                setUserPlan(data.user.plan)
                console.log('[Popup] User plan:', data.user.plan)
              }
            } catch (e) {
              console.error('[Popup] Failed to fetch user plan:', e)
            }
            setIsLoading(false)
            return
          } else {
            console.log('[Popup] Session expired, clearing')
            await chrome.storage.local.remove('supabase_session')
          }
        }
        
        // If no session in chrome.storage, try to fetch from dashboard tab
        console.log('[Popup] No session in chrome.storage, checking dashboard tab...')
        try {
          const tabs = await chrome.tabs.query({ url: `${process.env.PLASMO_PUBLIC_API_URL}/*` })
          if (tabs.length > 0 && tabs[0].id) {
            console.log('[Popup] Found dashboard tab, checking localStorage...')
            const results = await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => localStorage.getItem('trading_buddy_session')
            })
            
            if (results?.[0]?.result) {
              const webSession = JSON.parse(results[0].result)
              console.log('[Popup] Found session in dashboard localStorage:', webSession.user?.email)
              
              // Verify not expired
              if (webSession.expires_at && webSession.expires_at > Date.now() / 1000) {
                console.log('[Popup] Session valid, saving to chrome.storage')
                await chrome.storage.local.set({ supabase_session: webSession })
                setIsLoggedIn(true)
                setUser(webSession.user)
                setIsLoading(false)
                return
              } else {
                console.log('[Popup] Dashboard session expired')
              }
            } else {
              console.log('[Popup] No session in dashboard localStorage')
            }
          } else {
            console.log('[Popup] No dashboard tab found')
          }
        } catch (e) {
          console.error('[Popup] Error fetching from dashboard:', e)
        }
        
        console.log('[Popup] No valid session found')
        setIsLoggedIn(false)
        setUser(null)
      } catch (error) {
        console.error('[Popup] Error checking session:', error)
        setIsLoggedIn(false)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    
    checkSession()

    // Listen for chrome.storage changes (when session is updated elsewhere)
    const handleStorageChange = (changes: any, areaName: string) => {
      if (areaName === 'local' && changes.supabase_session) {
        console.log('[Popup] Storage changed:', changes.supabase_session.newValue ? 'Session updated' : 'Session removed')
        checkSession()
      }
    }
    
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const handleSignOut = async () => {
    try {
      console.log('[Popup] Signing out...')
      
      // Clear chrome.storage first (session and timeout)
      await chrome.storage.local.remove(['supabase_session', 'timeout_end'])
      
      // Force sign out by navigating to admin domain with logout query
      try {
        const tabs = await chrome.tabs.query({ url: `${process.env.PLASMO_PUBLIC_API_URL}/*` })
        if (tabs.length > 0 && tabs[0].id) {
          console.log('[Popup] Found admin tab, injecting sign-out script...')
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              // Clear localStorage
              localStorage.removeItem('trading_buddy_session')
              // Redirect to trigger Supabase sign out
              window.location.href = '/?signout=true'
            }
          })
        } else {
          console.log('[Popup] No admin tab, opening one to trigger sign out...')
          // Create a tab that will trigger sign out
          await chrome.tabs.create({ 
            url: `${process.env.PLASMO_PUBLIC_API_URL}/?signout=true`,
            active: false 
          })
        }
      } catch (error) {
        console.error('[Popup] Could not sign out from admin:', error)
      }
      
      console.log('[Popup] Sign out complete')
      setIsLoggedIn(false)
      setUser(null)
    } catch (error) {
      console.error('[Popup] Sign out error:', error)
      // Force clear local state even if script fails
      await chrome.storage.local.remove(['supabase_session', 'timeout_end'])
      setIsLoggedIn(false)
      setUser(null)
    }
  }

  return (
    <div className="w-80 h-96 p-4 bg-slate-900 text-white">
      <h1 className="text-xl font-bold mb-4">Snapchart</h1>
      
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
            {userPlan && (
              <p className="text-xs text-slate-400 mt-1">
                Plan: <span className="text-slate-200 capitalize">{userPlan === 'pro' ? 'Pro' : 'Free'}</span>
              </p>
            )}
          </div>
          
          <div className="text-xs text-slate-300 space-y-1">
            <p>Keyboard shortcuts when chatbox is open:</p>
            <p><span className="font-mono bg-slate-800 px-1 rounded">Ctrl + Alt + A</span> - Analyze chart</p>
            <p><span className="font-mono bg-slate-800 px-1 rounded">Ctrl + Alt + Enter</span> - Send with chart</p>
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
