import { useEffect, useState } from "react"
import Pip from "./components/Pip"

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
        
        // Signing in on the website hands the extension its own login (see background.ts)
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
          // Create a visible tab to sign out (Chrome reviewers prefer visible navigation)
          await chrome.tabs.create({ 
            url: `${process.env.PLASMO_PUBLIC_API_URL}/?signout=true`
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
    <div className="w-80 h-96 p-4 bg-dark-bg text-dark-body">
      <div className="mb-4 flex items-center gap-3">
        <Pip size={40} mood={isLoggedIn ? 'idle' : 'thinking'} />
        <div>
          <h1 className="text-lg font-semibold leading-tight">Pip</h1>
          <p className="text-xs text-dark-text">Your AI trading coach</p>
        </div>
      </div>
      
      {!isLoggedIn ? (
        <div className="space-y-4">
          <p className="text-sm text-dark-text">
            Sign in or create a free account to start checking your charts against your rules.
          </p>
          <button 
            className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-white"
            onClick={() => {
              chrome.tabs.create({ 
                url: `${process.env.PLASMO_PUBLIC_API_URL}` 
              })
            }}
          >
            Sign in / Create account
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-dark-surface p-3 rounded">
            <p className="text-xs text-dark-text">Signed in as</p>
            <p className="text-sm font-medium truncate">{user?.email}</p>
            {userPlan && (
              <p className="text-xs text-dark-text mt-1">
                Plan: <span className="text-dark-body capitalize">{userPlan === 'pro' ? 'Pro' : 'Free'}</span>
              </p>
            )}
          </div>
          
          <div className="text-xs text-dark-text space-y-1">
            <p>Keyboard shortcuts when chatbox is open:</p>
            <p><span className="font-mono bg-dark-surface px-1 rounded">Ctrl + Alt + A</span> - Analyze chart</p>
            <p><span className="font-mono bg-dark-surface px-1 rounded">Ctrl + Alt + Enter</span> - Send with chart</p>
          </div>

          <button 
            className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-white text-sm"
            onClick={() => {
              chrome.tabs.create({ 
                url: `${process.env.PLASMO_PUBLIC_API_URL}/dashboard/rules` 
              })
            }}
          >
            Open Dashboard
          </button>
          
          <button 
            className="w-full bg-dark-elevated hover:bg-dark-border px-4 py-2 rounded-lg text-sm"
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
