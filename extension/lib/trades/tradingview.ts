import { parseNumber, type Position, type Snapshot } from "./types"

// Reads TradingView's trading panel (Paper Trading or a connected broker).
// Uses data-name / data-label / aria-label attributes; TradingView's class
// names carry build hashes (value-WrxTGWVE) that change with every release.
// Returns null when the positions table isn't on the page, so a closed panel
// is never mistaken for "all positions closed".
export function readTradingView(doc: Document = document): Snapshot | null {
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
