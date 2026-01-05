/**
 * Chart-anchored annotations for TradingView screenshots
 * Converts price + relative X coordinates to pixel positions
 */

export interface ChartRect {
  left: number
  top: number
  width: number
  height: number
}

export interface PriceRange {
  minPrice: number
  maxPrice: number
}

/**
 * Find the TradingView chart canvas bounding rect
 * Tries multiple selectors to find the main chart area
 */
export function getChartRect(): ChartRect | null {
  try {
    // Try to find TradingView's main chart canvas
    const selectors = [
      'canvas[data-name="candles"]',
      'canvas[data-name="tv-main-pane"]',
      '.chart-markup-table canvas',
      '.chart-container canvas',
      'div[data-name="legend-source-item"] canvas',
      'canvas' // Last resort: first canvas on page
    ]

    for (const selector of selectors) {
      const canvas = document.querySelector(selector) as HTMLCanvasElement
      if (canvas && canvas.offsetWidth > 100 && canvas.offsetHeight > 100) {
        const rect = canvas.getBoundingClientRect()
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }
      }
    }

    console.warn('[chartAnchors] Could not find TradingView chart canvas')
    return null
  } catch (error) {
    console.error('[chartAnchors] Error getting chart rect:', error)
    return null
  }
}

/**
 * Extract price range from the drawings themselves
 * Since AI can read prices from the chart, use those as the range
 * Includes validation to reject obviously wrong prices
 */
export function getPriceRangeFromDrawings(drawings: any[]): PriceRange | null {
  try {
    const prices: number[] = []
    
    drawings.forEach((drawing) => {
      if (drawing.type === "trendline" && drawing.anchors) {
        drawing.anchors.forEach((anchor: any) => {
          if (typeof anchor.price === 'number' && anchor.price > 0) {
            prices.push(anchor.price)
          }
        })
      } else if (drawing.type === "zone") {
        if (typeof drawing.price_min === 'number' && drawing.price_min > 0) {
          prices.push(drawing.price_min)
        }
        if (typeof drawing.price_max === 'number' && drawing.price_max > 0) {
          prices.push(drawing.price_max)
        }
      }
    })
    
    if (prices.length < 2) {
      console.warn('[chartAnchors] Not enough prices in drawings')
      return null
    }
    
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice
    
    // Validation: Reject if price range seems unrealistic
    // Check 1: All prices should be in similar magnitude (within 50% of each other)
    const maxDeviation = prices.some(p => {
      const deviation = Math.abs(p - minPrice) / minPrice
      return deviation > 0.5
    })
    
    if (maxDeviation && priceRange / minPrice > 0.5) {
      console.warn('[chartAnchors] Price range too large - prices seem inconsistent:', {
        prices,
        minPrice,
        maxPrice,
        rangePercent: (priceRange / minPrice * 100).toFixed(1) + '%'
      })
      return null
    }
    
    // Check 2: Price range should be reasonable (not too tiny, not too huge)
    const rangeRatio = priceRange / minPrice
    if (rangeRatio < 0.001 || rangeRatio > 1.0) {
      console.warn('[chartAnchors] Price range ratio unrealistic:', {
        minPrice,
        maxPrice,
        rangeRatio: rangeRatio.toFixed(4)
      })
      return null
    }
    
    // Add 10% padding above and below for better visualization
    const padding = priceRange * 0.10
    
    console.log('[chartAnchors] Price range from drawings (validated):', { 
      minPrice: minPrice - padding, 
      maxPrice: maxPrice + padding,
      priceCount: prices.length,
      rawMin: minPrice,
      rawMax: maxPrice,
      rangePercent: (priceRange / minPrice * 100).toFixed(2) + '%'
    })
    
    return { 
      minPrice: minPrice - padding, 
      maxPrice: maxPrice + padding 
    }
  } catch (error) {
    console.error('[chartAnchors] Error getting price range from drawings:', error)
    return null
  }
}

/**
 * Parse visible price range from TradingView's right-axis labels
 * Returns min/max prices visible on the chart
 */
export function getVisiblePriceRange(): PriceRange | null {
  try {
    // TradingView price axis label selectors (multiple strategies)
    const selectors = [
      '[class*="priceAxisLabel"]',
      '[class*="price-axis"]',
      '[class*="priceScaleCanvasText"]',
      '[data-name="price-axis-label"]',
      '.price-axis-label',
      'div[style*="position: absolute"] div[style*="price"]'
    ]

    let prices: number[] = []

    // Strategy 1: Try known selectors
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector))
      prices = elements
        .map((el) => {
          const text = el.textContent?.trim()
          if (!text) return null
          // Remove commas, dollar signs, and parse
          const cleaned = text.replace(/[$,\s]/g, '')
          const price = parseFloat(cleaned)
          return isNaN(price) || price === 0 ? null : price
        })
        .filter((p): p is number => p !== null)

      if (prices.length >= 2) break
    }

    // Strategy 2: If selectors fail, scan all text nodes for numbers that look like prices
    if (prices.length < 2) {
      console.log('[chartAnchors] Selector strategy failed, trying text node scan')
      
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      )

      const pricePattern = /\b\d{1,6}(?:\.\d{1,2})?\b/g
      const foundPrices: number[] = []

      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.textContent || ''
        const matches = text.match(pricePattern)
        if (matches) {
          matches.forEach((match) => {
            const price = parseFloat(match)
            // Filter for realistic prices: between 10 and 10 million
            // This filters out page numbers, counts, etc.
            if (!isNaN(price) && price >= 10 && price < 10000000) {
              foundPrices.push(price)
            }
          })
        }
      }

      if (foundPrices.length >= 2) {
        prices = foundPrices
      }
    }

    if (prices.length < 2) {
      console.warn('[chartAnchors] Could not extract enough price labels')
      return null
    }

    // Remove outliers (prices that are way off from the median)
    const sorted = [...prices].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const filtered = prices.filter((p) => Math.abs(p - median) / median < 0.5) // Within 50% of median

    if (filtered.length < 2) {
      console.warn('[chartAnchors] Not enough valid prices after filtering')
      return null
    }

    const minPrice = Math.min(...filtered)
    const maxPrice = Math.max(...filtered)
    
    // Sanity check: price range should be reasonable (at least 0.1% difference)
    const priceSpread = (maxPrice - minPrice) / minPrice
    if (priceSpread < 0.001) {
      console.warn('[chartAnchors] Price range too narrow:', { minPrice, maxPrice, spread: priceSpread })
      return null
    }

    console.log('[chartAnchors] Extracted price range:', { minPrice, maxPrice, priceCount: filtered.length, spread: priceSpread })

    return { minPrice, maxPrice }
  } catch (error) {
    console.error('[chartAnchors] Error extracting price range:', error)
    return null
  }
}

/**
 * Convert price to Y-pixel coordinate
 */
export function priceToY(price: number, rect: ChartRect, range: PriceRange): number {
  const priceSpan = range.maxPrice - range.minPrice
  const ratio = (range.maxPrice - price) / priceSpan
  return rect.top + ratio * rect.height
}

/**
 * Convert relative X (0-1) to X-pixel coordinate
 */
export function xRelToX(xRel: number, rect: ChartRect): number {
  return rect.left + xRel * rect.width
}

/**
 * Set up observers to keep annotations aligned when chart changes
 */
export function setupChartObservers(onChartChange: () => void): () => void {
  const observers: Array<ResizeObserver | MutationObserver> = []

  try {
    // ResizeObserver on chart container
    const chartContainer = document.querySelector('.chart-container, #tv_chart_container, [class*="chart-markup"]')
    if (chartContainer) {
      const resizeObserver = new ResizeObserver(() => {
        console.log('[chartAnchors] Chart resized')
        onChartChange()
      })
      resizeObserver.observe(chartContainer)
      observers.push(resizeObserver)
    }

    // MutationObserver on TradingView root to detect layout changes
    const tvRoot = document.querySelector('#tradingview_widget, .tradingview-widget-container')
    if (tvRoot) {
      const mutationObserver = new MutationObserver((mutations) => {
        const relevantChange = mutations.some(
          (m) => m.type === 'childList' || (m.type === 'attributes' && m.attributeName === 'style')
        )
        if (relevantChange) {
          console.log('[chartAnchors] Chart layout changed')
          onChartChange()
        }
      })
      mutationObserver.observe(tvRoot, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['style', 'class']
      })
      observers.push(mutationObserver)
    }
  } catch (error) {
    console.error('[chartAnchors] Error setting up observers:', error)
  }

  // Return cleanup function
  return () => {
    observers.forEach((observer) => observer.disconnect())
  }
}
