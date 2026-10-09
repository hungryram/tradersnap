import { parseNumber, type Position, type Snapshot } from "./types"

// Reads TradingView's trading panel (Paper Trading or a connected broker), and
// falls back to the watchlist's position tags when the panel is collapsed.
// Uses data-* / aria-label / title attributes; TradingView's class names carry
// build hashes (value-WrxTGWVE) that change with every release, so only their
// stable prefixes are matched.
// Returns null when neither is on the page, so a closed panel is never
// mistaken for "all positions closed".
export function createTradingViewReader(): (doc?: Document) => Snapshot | null {
  // The watchlist can't see the account or Realized PnL; reuse the last values the panel showed
  let lastAccount: string | null = null
  let lastRealized: number | null = null

  return (doc: Document = document) => {
    const panel = readPanel(doc)
    if (panel) {
      lastAccount = panel.account
      lastRealized = panel.realizedPnl
      return panel
    }
    const watchlist = readWatchlist(doc)
    if (!watchlist) return null
    return { ...watchlist, account: lastAccount, realizedPnl: lastRealized }
  }
}

export function readTradingView(doc: Document = document): Snapshot | null {
  return readPanel(doc) ?? readWatchlist(doc)
}

function readPanel(doc: Document): Snapshot | null {
  // data-name is "<Broker>.positions-table", e.g. "Paper.positions-table"
  const table = doc.querySelector<HTMLTableElement>('table[data-name$=".positions-table"]')
  if (!table) return null

  const broker = table.getAttribute("data-name")!.split(".")[0]
  const manager = table.closest('[aria-label="Account manager"]') ?? doc

  const positions = new Map<string, Position>()
  table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-id]").forEach(row => {
    const cell = (label: string) => row.querySelector(`td[data-label="${label}"]`)?.textContent?.trim() ?? null
    const symbol = row.getAttribute("data-row-id")!
    const sideText = cell("Side")?.toLowerCase()
    const qty = parseNumber(cell("Quantity"))
    if (!sideText || !qty) return

    positions.set(symbol, {
      symbol,
      side: sideText.startsWith("short") || sideText.startsWith("sell") ? "short" : "long",
      qty: Math.abs(qty),
      avgPrice: parseNumber(cell("Avg fill price")),
      unrealizedPnl: parseNumber(cell("Unrealized PnL"))
    })
  })

  const accountName = manager.querySelector('[data-qa-id="account-selector"] [class*="accountName"]')?.textContent?.trim()

  return {
    account: accountName ? `${broker}:${accountName}` : broker,
    realizedPnl: readSummaryField(manager, "Realized PnL"),
    positions
  }
}

// Account summary bar: <span class="title-…">Realized PnL</span> next to <div class="value-…">+2,068.50</div>
function readSummaryField(root: ParentNode, title: string): number | null {
  for (const span of Array.from(root.querySelectorAll("span"))) {
    if (span.textContent?.trim() !== title) continue
    const field = span.closest('[class*="accountSummaryField"]')
    const value = field?.querySelector('[class*="value-"]')
    if (value) return parseNumber(value.textContent)
  }
  return null
}

// Watchlist rows (data-symbol-full="CME_MINI:MNQZ2026") carry a tag like
// title="Long 1 @ 31,158.00" while a position is open. Only rows scrolled into
// view exist, so the snapshot lists which symbols it could see.
function readWatchlist(doc: Document): Snapshot | null {
  const rows = doc.querySelectorAll<HTMLElement>("[data-symbol-full]")
  if (rows.length === 0) return null

  const positions = new Map<string, Position>()
  const coverage = new Set<string>()
  rows.forEach(row => {
    const symbol = row.getAttribute("data-symbol-full")!
    coverage.add(symbol)

    const tag = Array.from(row.querySelectorAll<HTMLElement>("[title]"))
      .map(el => el.getAttribute("title")!.match(/^(Long|Short)\s+([\d.,]+)\s+@\s+([\d.,]+)/i))
      .find(Boolean)
    if (!tag) return

    const side = tag[1].toLowerCase() === "short" ? "short" : "long"
    const qty = parseNumber(tag[2])
    const avgPrice = parseNumber(tag[3])
    if (!qty) return
    const last = parseNumber(row.querySelector('[class*="cell-"][class*="last-"]')?.textContent)

    positions.set(symbol, {
      symbol,
      side,
      qty,
      avgPrice,
      // No PnL in the watchlist: estimate it from the last price and the contract's dollar value per point
      unrealizedPnl: last !== null && avgPrice !== null
        ? Math.round((last - avgPrice) * qty * pointValue(symbol) * (side === "long" ? 1 : -1) * 100) / 100
        : null
    })
  })

  return { account: null, realizedPnl: null, positions, coverage }
}

// Dollars per 1.0 point of price for common futures; anything else (stocks, ETFs) is 1
const POINT_VALUES: Record<string, number> = {
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  CL: 1000, MCL: 100, QM: 500, NG: 10000, GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000,
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000, "6E": 125000, "6J": 12500000, "6B": 62500,
  BTC: 5, MBT: 0.1, ETH: 50, MET: 0.1
}

// "CME_MINI:MNQZ2026" or "CME_MINI:MNQ1!" -> MNQ
export function pointValue(symbol: string): number {
  const ticker = symbol.split(":").pop() ?? symbol
  const root = ticker.replace(/[FGHJKMNQUVXZ]\d{2,4}$/, "").replace(/\d+!$/, "")
  return POINT_VALUES[root] ?? 1
}
