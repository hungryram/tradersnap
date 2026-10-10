import { ensureOrderHistoryLoaded, pointValue, readTradingViewPanel } from "./tradingview"
import type { ClosedTrade, Fill } from "./types"

// Rebuilds trades from the platform's own fill history: a trade runs from flat
// to flat for one symbol. Adds, partial exits and stop/target fills are fills
// inside the trade; a fill that crosses zero closes one trade and opens the next.
//
// The history only shows the most recent orders, so the position before the
// oldest visible fill comes from today's open positions minus every fill since.
// Trades that started before the visible history are skipped (their entry is unknown).
export function buildTrades(
  fills: Fill[],
  openPositions: Map<string, number>,
  account: string | null,
  platform: ClosedTrade["platform"]
): ClosedTrade[] {
  const bySymbol = new Map<string, Fill[]>()
  for (const fill of fills) {
    if (!bySymbol.has(fill.symbol)) bySymbol.set(fill.symbol, [])
    bySymbol.get(fill.symbol)!.push(fill)
  }

  const trades: ClosedTrade[] = []
  for (const [symbol, symbolFills] of bySymbol) {
    symbolFills.sort((a, b) => a.time - b.time || compareIds(a.orderId, b.orderId))
    const { value: pv, known: pvKnown } = pointValue(symbol)

    let position = (openPositions.get(symbol) ?? 0) - symbolFills.reduce((sum, f) => sum + f.qty, 0)
    position = Math.round(position * 1e6) / 1e6

    type Open = { firstOrderId: string; openedAt: number; avg: number; maxQty: number; points: number; exitQty: number; exitValue: number; commission: number; fills: number }
    // A position already open before the visible history has no known entry
    let trade: Open | null = null

    for (const fill of symbolFills) {
      let qty = fill.qty
      // Commission is charged once per fill, to the trade it closes or adds to (else the one it opens)
      const commissionCharged: boolean = !!(fill.commission && trade)
      if (commissionCharged) trade!.commission += Math.abs(fill.commission!)

      if (position !== 0 && Math.sign(qty) !== Math.sign(position)) {
        // Reducing or closing
        const closing = Math.min(Math.abs(qty), Math.abs(position))
        if (trade) {
          trade.points += (fill.price - trade.avg) * closing * Math.sign(position)
          trade.exitQty += closing
          trade.exitValue += fill.price * closing
          trade.fills++
        }
        position += Math.sign(qty) * closing
        qty -= Math.sign(qty) * closing
        position = Math.round(position * 1e6) / 1e6

        if (position === 0) {
          if (trade) {
            const pnl = trade.points * pv - trade.commission
            trades.push({
              client_trade_id: [platform, account, symbol, trade.firstOrderId].join("|"),
              platform,
              account,
              symbol,
              side: Math.sign(fill.qty) < 0 ? "long" : "short",
              qty: trade.maxQty,
              entry_price: round(trade.avg, 6),
              exit_price: round(trade.exitValue / trade.exitQty, 6),
              fill_count: trade.fills,
              realized_pnl: round(pnl, 2),
              pnl_source: pvKnown ? "realized" : "estimated",
              opened_at: new Date(trade.openedAt).toISOString(),
              closed_at: new Date(fill.time).toISOString()
            })
          }
          trade = null
        }
        if (qty === 0) continue
        // The rest of a crossing fill opens a new trade the other way
      }

      if (position === 0) {
        trade = {
          firstOrderId: fill.orderId, openedAt: fill.time, avg: fill.price, maxQty: Math.abs(qty),
          points: 0, exitQty: 0, exitValue: 0, commission: fill.commission && !commissionCharged ? Math.abs(fill.commission) : 0, fills: 1
        }
        position = qty
      } else {
        // Adding to the position
        if (trade) {
          trade.avg = (trade.avg * Math.abs(position) + fill.price * Math.abs(qty)) / (Math.abs(position) + Math.abs(qty))
          trade.maxQty = Math.max(trade.maxQty, Math.abs(position + qty))
          trade.fills++
        }
        position = Math.round((position + qty) * 1e6) / 1e6
      }
    }
  }

  return trades.sort((a, b) => a.closed_at.localeCompare(b.closed_at))
}

function compareIds(a: string, b: string) {
  return a.length - b.length || a.localeCompare(b)
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export type TrackingStatus = "tracking" | "loading" | "no-panel"

// Reads the panel every second and reports each closed trade once per page load
// (the server ignores trades it already has, so a reload re-sending is harmless).
export function startTradeTracking(options: {
  onTrades: (trades: ClosedTrade[]) => void
  onStatus: (status: TrackingStatus) => void
  // Open positions each tick the panel is visible (symbol -> signed size)
  onPositions?: (positions: Map<string, number>) => void
  intervalMs?: number
}): () => void {
  const reported = new Set<string>()
  let lastStatus: TrackingStatus | null = null
  const setStatus = (status: TrackingStatus) => {
    if (status !== lastStatus) options.onStatus(status)
    lastStatus = status
  }

  const timer = setInterval(() => {
    try {
      const panel = readTradingViewPanel()
      if (!panel) return setStatus("no-panel")
      options.onPositions?.(panel.positions)
      if (!panel.fills) {
        ensureOrderHistoryLoaded()
        return setStatus("loading")
      }
      setStatus("tracking")

      const fresh = buildTrades(panel.fills, panel.positions, panel.account, "tradingview")
        .filter(trade => !reported.has(trade.client_trade_id))
      if (fresh.length === 0) return
      fresh.forEach(trade => reported.add(trade.client_trade_id))
      options.onTrades(fresh)
    } catch (error) {
      console.warn("[Snapchart] Trade reader failed:", error)
    }
  }, options.intervalMs ?? 1000)

  return () => clearInterval(timer)
}
