import React, { useEffect } from "react"
import { getVisiblePriceRange, getPriceRangeFromDrawings, priceToY, xRelToX } from "./chartAnchors"

interface TrendlineDrawing {
  type: "trendline"
  anchors: Array<{
    x_rel: number
    price: number
  }>
  label: string
  color: "blue" | "red" | "green" | "yellow" | "purple"
  style?: "solid" | "dashed"
  confidence?: "low" | "medium" | "high"
}

interface ZoneDrawing {
  type: "zone"
  x_start_rel: number
  x_end_rel: number
  price_min: number
  price_max: number
  label: string
  color: "blue" | "red" | "green" | "yellow" | "purple"
  style?: "solid" | "dashed"
  confidence?: "low" | "medium" | "high"
}

type Drawing = TrendlineDrawing | ZoneDrawing

interface ChartLightboxProps {
  imageUrl: string
  drawings?: Drawing[]
  showOverlay: boolean
  onClose: () => void
  onToggleOverlay: () => void
}

export const ChartLightbox = ({ imageUrl, drawings = [], showOverlay, onClose, onToggleOverlay }: ChartLightboxProps) => {
  useEffect(() => {
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'
    
    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-90"
      onClick={onClose}
    >
      <div 
        className="relative max-w-[95vw] max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-4 py-2 bg-slate-800 rounded-t-lg">
          <div className="flex items-center gap-3">
            <span className="text-white font-medium">Chart Analysis</span>
            {drawings.length > 0 && (
              <button
                onClick={onToggleOverlay}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  showOverlay 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                }`}
              >
                {showOverlay ? '👁️ Hide Annotations' : '👁️ Show Annotations'}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-slate-300 text-2xl font-bold px-2"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* Chart with Canvas Overlay */}
        <div className="relative bg-slate-900 rounded-b-lg overflow-auto">
          <ChartCanvas 
            imageUrl={imageUrl}
            drawings={drawings}
            showOverlay={showOverlay}
          />
        </div>
      </div>
    </div>
  )
}

// Separate canvas component for rendering
const ChartCanvas = ({ imageUrl, drawings, showOverlay }: { imageUrl: string, drawings: Drawing[], showOverlay: boolean }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })

  React.useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setDimensions({ width: img.width, height: img.height })
      drawCanvas(img)
    }
    img.src = imageUrl
  }, [imageUrl, showOverlay, drawings])

  const drawCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size to match image
    canvas.width = img.width
    canvas.height = img.height

    // Draw image
    ctx.drawImage(img, 0, 0)

    // Draw annotations if enabled
    if (showOverlay && drawings.length > 0) {
      // Strategy 1: Get price range from drawings (AI can read prices)
      let priceRange = getPriceRangeFromDrawings(drawings)
      
      // Strategy 2: Fallback to DOM extraction
      if (!priceRange) {
        console.log('[ChartLightbox] No price range from drawings, trying DOM extraction...')
        priceRange = getVisiblePriceRange()
      }
      
      const colorMap = {
        blue: "#3b82f6",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        purple: "#a855f7"
      }

      if (priceRange) {
        // PRICE-ANCHORED MODE
        console.log("[ChartLightbox] Using PRICE-ANCHORED mode", { priceRange, drawingCount: drawings.length })

        const chartRect = {
          left: 0,
          top: 0,
          width: canvas.width,
          height: canvas.height
        }

        drawings.forEach((drawing) => {
          const color = colorMap[drawing.color]
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = 3
          ctx.font = "16px sans-serif"

          if (drawing.style === "dashed") {
            ctx.setLineDash([10, 10])
          } else {
            ctx.setLineDash([])
          }

          if (drawing.type === "trendline" && drawing.anchors.length === 2) {
            const [anchor1, anchor2] = drawing.anchors
            const x1 = xRelToX(anchor1.x_rel, chartRect)
            const y1 = priceToY(anchor1.price, chartRect, priceRange)
            const x2 = xRelToX(anchor2.x_rel, chartRect)
            const y2 = priceToY(anchor2.price, chartRect, priceRange)

            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()

            const midX = (x1 + x2) / 2
            const midY = (y1 + y2) / 2
            ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
            ctx.fillRect(midX - 60, midY - 15, 120, 30)
            ctx.fillStyle = "white"
            ctx.fillText(drawing.label, midX - 50, midY + 5)
          } else if (drawing.type === "zone") {
            const x1 = xRelToX(drawing.x_start_rel, chartRect)
            const x2 = xRelToX(drawing.x_end_rel, chartRect)
            const y1 = priceToY(drawing.price_max, chartRect, priceRange)
            const y2 = priceToY(drawing.price_min, chartRect, priceRange)

            ctx.fillStyle = color + "20"
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

            const centerX = (x1 + x2) / 2
            const centerY = (y1 + y2) / 2
            ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
            ctx.fillRect(centerX - 60, centerY - 15, 120, 30)
            ctx.fillStyle = "white"
            ctx.fillText(drawing.label, centerX - 50, centerY + 5)
          }
        })
      } else {
        // FALLBACK MODE
        console.log("[ChartLightbox] Price extraction failed - using fallback", { drawingCount: drawings.length })

        drawings.forEach((drawing) => {
          const color = colorMap[drawing.color]
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = 3
          ctx.font = "16px sans-serif"

          if (drawing.style === "dashed") {
            ctx.setLineDash([10, 10])
          } else {
            ctx.setLineDash([])
          }

          if (drawing.type === "trendline" && drawing.anchors && drawing.anchors.length === 2) {
            const x1 = drawing.anchors[0].x_rel * canvas.width
            const x2 = drawing.anchors[1].x_rel * canvas.width
            const y1 = canvas.height * 0.5
            const y2 = canvas.height * 0.5

            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()

            const midX = (x1 + x2) / 2
            const midY = (y1 + y2) / 2
            ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
            ctx.fillRect(midX - 70, midY - 15, 140, 30)
            ctx.fillStyle = "white"
            ctx.fillText(drawing.label + " (approx)", midX - 60, midY + 5)
          } else if (drawing.type === "zone") {
            const x1 = drawing.x_start_rel * canvas.width
            const x2 = drawing.x_end_rel * canvas.width
            const y1 = canvas.height * 0.3
            const y2 = canvas.height * 0.7

            ctx.fillStyle = color + "20"
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

            const centerX = (x1 + x2) / 2
            const centerY = (y1 + y2) / 2
            ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
            ctx.fillRect(centerX - 70, centerY - 15, 140, 30)
            ctx.fillStyle = "white"
            ctx.fillText(drawing.label + " (approx)", centerX - 60, centerY + 5)
          }
        })
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full h-auto"
      style={{ 
        maxHeight: '85vh',
        display: 'block'
      }}
    />
  )
}
