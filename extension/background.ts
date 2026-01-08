export {}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type)
  if (message.type === "CAPTURE_SCREENSHOT") {
    console.log('[Background] Capturing screenshot...')
    captureScreenshot(sender.tab?.id).then((result) => {
      console.log('[Background] Screenshot result:', result.success)
      sendResponse(result)
    })
    return true // Async response
  }
})

async function captureScreenshot(tabId?: number) {
  try {
    console.log('[Background] Calling chrome.tabs.captureVisibleTab...')
    
    // Make sure we're capturing from the active window
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const activeTab = tabs[0]
    
    if (!activeTab) {
      throw new Error('No active tab found')
    }
    
    console.log('[Background] Active tab:', activeTab.id, activeTab.url)
    
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
      format: "png"
    })
    console.log('[Background] Screenshot captured, size:', dataUrl.length)
    return { success: true, dataUrl }
  } catch (error) {
    console.error("[Background] Screenshot capture failed:", error)
    return { success: false, error: (error as Error).message }
  }
}
