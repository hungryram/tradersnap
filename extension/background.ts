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
    
    // Enhance image for better AI readability (sharpen text/numbers)
    const enhancedDataUrl = await enhanceImageForAI(dataUrl)
    
    console.log('[Background] Screenshot captured and enhanced, size:', enhancedDataUrl.length)
    return { success: true, dataUrl: enhancedDataUrl }
  } catch (error) {
    console.error("[Background] Screenshot capture failed:", error)
    return { success: false, error: (error as Error).message }
  }
}

async function enhanceImageForAI(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      
      // Draw original image
      ctx.drawImage(img, 0, 0)
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      
      // Apply sharpening filter to enhance text/numbers
      // Increase contrast slightly for better readability
      for (let i = 0; i < data.length; i += 4) {
        // Increase contrast (makes text sharper)
        const factor = 1.2
        data[i] = Math.min(255, (data[i] - 128) * factor + 128)     // R
        data[i + 1] = Math.min(255, (data[i + 1] - 128) * factor + 128) // G
        data[i + 2] = Math.min(255, (data[i + 2] - 128) * factor + 128) // B
      }
      
      // Put enhanced image back
      ctx.putImageData(imageData, 0, 0)
      
      // Convert to data URL
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = dataUrl
  })
}
