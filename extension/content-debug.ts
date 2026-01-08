// Debug helper - runs at document_start before everything else
export {}

declare global {
  interface Window {
    debugSnapchart: () => Promise<void>
  }
}

window.debugSnapchart = async () => {
  console.log('=== Snapchart Debug Info ===')
  
  const chromeStorage = await chrome.storage.local.get('supabase_session')
  console.log('Chrome Storage Session:', chromeStorage.supabase_session ? {
    user: chromeStorage.supabase_session.user?.email,
    expires_at: chromeStorage.supabase_session.expires_at,
    expired: chromeStorage.supabase_session.expires_at < Date.now() / 1000
  } : 'None')
  
  try {
    const localStorageSession = localStorage.getItem('trading_buddy_session')
    console.log('LocalStorage Session:', localStorageSession ? JSON.parse(localStorageSession).user?.email : 'None')
  } catch (e) {
    console.log('LocalStorage Session: Not accessible (different domain)')
  }
  
  console.log('Current URL:', window.location.href)
  console.log('API URL:', process.env.PLASMO_PUBLIC_API_URL)
  console.log('========================')
}

console.log('[Snapchart Debug] Function loaded. Run: debugSnapchart()')
