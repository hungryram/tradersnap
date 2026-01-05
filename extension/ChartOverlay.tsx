import { useEffect, useRef } from "react"
import { getVisiblePriceRange, getPriceRangeFromDrawings, priceToY, xRelToX, type PriceRange } from "./chartAnchors"

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

interface ChartOverlayProps {
  imageUrl: string
  drawings?: Drawing[]
  showOverlay: boolean
}

const colorMap = {
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7"
}

export const ChartOverlay = ({ imageUrl, drawings = [], showOverlay }: ChartOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const drawOverlay = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Draw annotations if enabled
      if (showOverlay && drawings.length > 0) {
        // Strategy 1: Try to get price range from the drawings themselves (AI can read prices)
        let priceRange = getPriceRangeFromDrawings(drawings)
        
        // Strategy 2: Fallback to extracting from DOM
        if (!priceRange) {
          console.log('[ChartOverlay] No price range from drawings, trying DOM extraction...')
          priceRange = getVisiblePriceRange()
        }
        
        if (priceRange) {
          // PRICE-ANCHORED MODE (accurate)
          console.log("[ChartOverlay] Using price-anchored mode:", { priceRange, drawings })

          const chartRect = {
            left: 0,
            top: 0,
            width: canvas.width,
            height: canvas.height
          }

          console.log("[ChartOverlay] Using PRICE-ANCHORED mode", { 
            priceRange, 
            chartRect,
            drawingCount: drawings.length,
            firstDrawing: drawings[0]
          })

          drawings.forEach((drawing) => {
            const color = colorMap[drawing.color]
            ctx.strokeStyle = color
            ctx.fillStyle = color
            ctx.lineWidth = 2
            ctx.font = "12px sans-serif"

            if (drawing.style === "dashed") {
              ctx.setLineDash([5, 5])
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

              // Label at midpoint
              const midX = (x1 + x2) / 2
              const midY = (y1 + y2) / 2
              ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
              ctx.fillRect(midX - 40, midY - 10, 80, 20)
              ctx.fillStyle = "white"
              ctx.fillText(drawing.label, midX - 35, midY + 5)
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
              ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
              ctx.fillRect(centerX - 40, centerY - 10, 80, 20)
              ctx.fillStyle = "white"
              ctx.fillText(drawing.label, centerX - 35, centerY + 5)
            }
          })
        } else {
          // FALLBACK MODE - just draw lines connecting x_rel points vertically centered
          console.log("[ChartOverlay] Price extraction failed - using simplified fallback", {
            drawingCount: drawings.length,
            firstDrawing: drawings[0]
          })
          
          drawings.forEach((drawing) => {
            const color = colorMap[drawing.color]
            ctx.strokeStyle = color
            ctx.fillStyle = color
            ctx.lineWidth = 2
            ctx.font = "12px sans-serif"

            if (drawing.style === "dashed") {
              ctx.setLineDash([5, 5])
            } else {
              ctx.setLineDash([])
            }

            if (drawing.type === "trendline" && drawing.anchors.length === 2) {
              const [anchor1, anchor2] = drawing.anchors
              // Just use x_rel and put lines at approximate vertical positions
              const x1 = anchor1.x_rel * canvas.width
              const x2 = anchor2.x_rel * canvas.width
              // Rough approximation: assume mid-chart
              const y1 = canvas.height * 0.5
              const y2 = canvas.height * 0.5

              ctx.beginPath()
              ctx.moveTo(x1, y1)
              ctx.lineTo(x2, y2)
              ctx.stroke()

              ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
              ctx.fillRect(x1 - 60, y1 - 25, 120, 20)
              ctx.fillStyle = "white"
              ctx.fillText(drawing.label + " (approx)", x1 - 55, y1 - 10)
            }
          })
        }
      }
    }

    // Load image and draw
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      drawOverlay()
    }

    // Redraw when showOverlay or drawings change
    if (img.complete) {
      canvas.width = img.width
      canvas.height = img.height
      drawOverlay()
    }
  }, [imageUrl, drawings, showOverlay])

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Chart"
        style={{ display: "none" }}
        crossOrigin="anonymous"
      />
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  )
}
