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
  const [userPlan, setUserPlan] = useState<string | null>(null)

  useEffect(() => {

    
    const initializeAuth = async () => {
      try {
        // Step 1: Check Supabase session (this will auto-refresh if needed)
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('[Popup] Supabase session error:', error)
        }
        
        if (session) {

          setIsLoggedIn(true)
          setUser(session.user)
          // Update chrome.storage with fresh session
          await chrome.storage.local.set({ supabase_session: session })
          
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
            }
          } catch (e) {
            console.error('[Popup] Failed to fetch user plan:', e)
          }
          
          // Broadcast to all tabs immediately

          const tabs = await chrome.tabs.query({})
          for (const tab of tabs) {
            if (tab.id) {
              try {
                await chrome.tabs.sendMessage(tab.id, {
                  type: 'SESSION_UPDATED',
                  session: session
                })

              } catch (err) {
                // Tab might not have content script - ignore
              }
            }
          }
          
          setIsLoading(false)
          return
        }
        
        // Step 2: If no extension session, check if user logged in via website

        try {
          const tabs = await chrome.tabs.query({ url: `${process.env.PLASMO_PUBLIC_API_URL}/*` })
          if (tabs.length > 0 && tabs[0].id) {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => localStorage.getItem('trading_buddy_session')
            })
            
            if (results?.[0]?.result) {
              const webSession = JSON.parse(results[0].result)

              
              // Set session in extension's Supabase client
              const { error: setError } = await supabase.auth.setSession({
                access_token: webSession.access_token,
                refresh_token: webSession.refresh_token
              })
              
              if (!setError) {

                setIsLoggedIn(true)
                setUser(webSession.user)
                await chrome.storage.local.set({ supabase_session: webSession })
                
                // Broadcast to all tabs
                const allTabs = await chrome.tabs.query({})
                for (const tab of allTabs) {
                  if (tab.id) {
                    try {
                      await chrome.tabs.sendMessage(tab.id, {
                        type: 'SESSION_UPDATED',
                        session: webSession
                      })
                    } catch (err) {
                      // Ignore
                    }
                  }
                }
                
                setIsLoading(false)
                return
              } else {
                console.error('[Popup] Failed to import session:', setError)
              }
            }
          }
        } catch (e) {

        }
        
        // Step 2: Check chrome.storage (might have session from content script)
        const result = await chrome.storage.local.get('supabase_session')
        if (result.supabase_session?.user) {

          // Verify it's not expired
          const expiresAt = result.supabase_session.expires_at
          if (expiresAt && expiresAt > Date.now() / 1000) {
            setIsLoggedIn(true)
            setUser(result.supabase_session.user)
            setIsLoading(false)
            return
          } else {

            await chrome.storage.local.remove('supabase_session')
          }
        }
        
        // No valid session found

        setIsLoggedIn(false)
        setUser(null)
        setIsLoading(false)
      } catch (error) {
        console.error('[Popup] Error initializing auth:', error)
        setIsLoading(false)
      }
    }
    
    initializeAuth()

    // Listen for auth changes from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {

        setIsLoggedIn(!!session)
        setUser(session?.user || null)
        
        // Update chrome.storage
        if (session) {
          await chrome.storage.local.set({ supabase_session: session })
          
          // Broadcast to all tabs that session has been updated
          const tabs = await chrome.tabs.query({})
          for (const tab of tabs) {
            if (tab.id) {
              try {
                await chrome.tabs.sendMessage(tab.id, {
                  type: 'SESSION_UPDATED',
                  session: session
                })

              } catch (err) {
                // Tab might not have content script - ignore
              }
            }
          }
        } else {
          await chrome.storage.local.remove('supabase_session')
        }
      }
    )

    // Auto-refresh session every 30 seconds to prevent expiration
    const refreshInterval = setInterval(async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (session) {
        // Session exists and is auto-refreshed by Supabase
        await chrome.storage.local.set({ supabase_session: session })
        setIsLoggedIn(true)
        setUser(session.user)
        
        // Broadcast to all tabs
        const tabs = await chrome.tabs.query({})
        for (const tab of tabs) {
          if (tab.id) {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: 'SESSION_UPDATED',
                session: session
              })
            } catch (err) {
              // Tab might not have content script - ignore
            }
          }
        }
      } else if (error) {
        console.error('[Popup] Session refresh error:', error)
      }
    }, 30000) // Every 30 seconds

    // Also listen for storage changes (from content script)
    const handleStorageChange = (changes: any, areaName: string) => {
      if (areaName === 'local' && changes.supabase_session) {
        const newSession = changes.supabase_session.newValue
        if (newSession?.user) {

          setIsLoggedIn(true)
          setUser(newSession.user)
        } else {
          setIsLoggedIn(false)
          setUser(null)
        }
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      subscription.unsubscribe()
      clearInterval(refreshInterval)
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const handleSignOut = async () => {
    try {

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

      }
      

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
