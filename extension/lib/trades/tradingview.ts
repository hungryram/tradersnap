import { parseNumber, type Fill } from "./types"

// Reads TradingView's trading panel (Paper Trading or a connected broker).
// Columns are found by their code names in the table header (side-column,
// qty-column, ...), which stay the same in every language and column order.
// TradingView's class names carry build hashes (value-WrxTGWVE), so only their
// stable prefixes are matched.

export type PanelState = {
  account: string | null
  // Open positions by symbol, signed: +2 long, -1 short
  positions: Map<string, number>
  // Filled orders from Order history; null until that tab has loaded once
  fills: Fill[] | null
}

// Panels whose Order history tab has already been opened once
const opened = new WeakSet<Element>()

export function readTradingViewPanel(doc: Document = document): PanelState | null {
  const positionsTable = doc.querySelector<HTMLTableElement>('table[data-name$=".positions-table"]')
  if (!positionsTable) return null

  const broker = positionsTable.getAttribute("data-name")!.split(".")[0]
  const manager = positionsTable.closest('[aria-label="Account manager"]') ?? doc
  const accountName = manager.querySelector('[data-qa-id="account-selector"] [class*="accountName"]')?.textContent?.trim()

  const positions = new Map<string, number>()
  for (const row of tableRows(positionsTable)) {
    const qty = parseNumber(row.text("qty-column"))
    const side = sideOf(row.cell("side-column"))
    if (!qty || !side) continue
    positions.set(row.id, side === "buy" ? Math.abs(qty) : -Math.abs(qty))
  }

  return {
    account: accountName ? `${broker}:${accountName}` : broker,
    positions,
    fills: readFills(manager)
  }
}

function readFills(manager: ParentNode): Fill[] | null {
  const table = manager.querySelector<HTMLTableElement>('table[data-name$=".history-table"]')
  if (!table) return null
  const rows = tableRows(table)
  // Empty before the tab was opened means "not loaded"; empty after means no orders yet
  if (rows.length === 0) return opened.has(manager as Element) ? [] : null

  const fills: Fill[] = []
  for (const row of rows) {
    // Cancelled and working orders have no fill price
    const price = parseNumber(row.text("avgPrice-column"))
    const qty = parseNumber(row.text("qty-column"))
    const side = sideOf(row.cell("side-column"))
    const time = parseLocalTime(row.text("closeDate-column") ?? row.text("placingTime-column"))
    const symbol = row.cell("symbol-column")?.querySelector('[class*="titleContent"]')?.textContent?.trim()
      ?? row.text("symbol-column")
    if (price === null || !qty || !side || time === null || !symbol) continue

    fills.push({
      orderId: row.text("id-column") || row.id,
      symbol,
      qty: side === "buy" ? Math.abs(qty) : -Math.abs(qty),
      price,
      time,
      commission: parseNumber(row.text("commission-column"))
    })
  }
  return fills
}

// Order history only fills in after its tab has been opened once; after that
// TradingView keeps it updated in the background. Open it once per panel and
// switch straight back to whatever tab the trader was on.
export function ensureOrderHistoryLoaded(doc: Document = document): void {
  const manager = doc.querySelector('[aria-label="Account manager"]')
  if (!manager || opened.has(manager)) return
  const historyTab = manager.querySelector<HTMLElement>('button[role="tab"]#history')
  if (!historyTab) return
  opened.add(manager)

  if (historyTab.getAttribute("aria-selected") === "true") return
  const current = manager.querySelector<HTMLElement>('button[role="tab"][aria-selected="true"]')
  historyTab.click()
  if (current) setTimeout(() => current.click(), 300)
}

type Row = { id: string; cell: (column: string) => Element | null; text: (column: string) => string | null }

// Maps header data-name -> column index, so cells are found the same way in any language
function tableRows(table: HTMLTableElement): Row[] {
  const columns = new Map<string, number>()
  table.querySelectorAll("thead th").forEach((th, index) => {
    const name = th.getAttribute("data-name")
    if (name) columns.set(name, index)
  })

  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-id]")).map(tr => {
    const cell = (column: string) => {
      const index = columns.get(column)
      return index === undefined ? null : tr.children[index] ?? null
    }
    return {
      id: tr.getAttribute("data-row-id")!,
      cell,
      text: (column: string) => cell(column)?.textContent?.trim() || null
    }
  })
}

// "Buy"/"Long" are translated, but TradingView colors buys blue (or green) and sells red
function sideOf(cell: Element | null): "buy" | "sell" | null {
  if (!cell) return null
  const text = cell.textContent?.trim().toLowerCase() ?? ""
  if (/^(buy|long)/.test(text)) return "buy"
  if (/^(sell|short)/.test(text)) return "sell"
  if (cell.querySelector('[class*="blue-"], [class*="green-"]')) return "buy"
  if (cell.querySelector('[class*="red-"]')) return "sell"
  return null
}

// TradingView shows order times as "2026-10-09 13:31:28" in the computer's local time
function parseLocalTime(text: string | null): number | null {
  const m = text?.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  return isNaN(date.getTime()) ? null : date.getTime()
}

// Dollars per 1.0 point of price for common futures; anything else (stocks, ETFs) is 1
const POINT_VALUES: Record<string, number> = {
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  CL: 1000, MCL: 100, QM: 500, NG: 10000, GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000,
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000, "6E": 125000, "6J": 12500000, "6B": 62500,
  BTC: 5, MBT: 0.1, ETH: 50, MET: 0.1
}

const FUTURES_TICKER = /[FGHJKMNQUVXZ]\d{2,4}$|\d+!$/

// "CME_MINI:MNQZ2026" or "CME_MINI:MNQ1!" -> { value: 2, known: true }
export function pointValue(symbol: string): { value: number; known: boolean } {
  const ticker = symbol.split(":").pop() ?? symbol
  const root = ticker.replace(/[FGHJKMNQUVXZ]\d{2,4}$/, "").replace(/\d+!$/, "")
  if (POINT_VALUES[root] !== undefined) return { value: POINT_VALUES[root], known: true }
  // Stocks and ETFs really are $1 per point; an unlisted futures contract is a guess
  return { value: 1, known: !FUTURES_TICKER.test(ticker) }
}
