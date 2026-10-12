import type { PlasmoCSConfig } from "plasmo"

// Runs inside TopstepX's own page (the page's JavaScript world) so it can see the trade data the page
// already downloads: the closed-trades list, and live updates over the page's account WebSocket.
// It never touches the sign-in token and makes no requests of its own. Trade records are passed to
// Pip's content script with postMessage (lib/trades/topstepx.ts turns them into trades).

export const config: PlasmoCSConfig = {
  matches: ["*://*.topstepx.com/*"],
  world: "MAIN",
  run_at: "document_start"
}

const SOURCE = "pip-topstepx"
const post = (kind: string, payload: unknown) => window.postMessage({ source: SOURCE, kind, payload }, window.location.origin)

const isTrade = (x: any) =>
  !!x && typeof x === "object" && typeof x.id === "number" && typeof x.accountId === "number" &&
  "pnL" in x && "entryPrice" in x && "exitPrice" in x && "positionSize" in x && "createdAt" in x

const isPosition = (x: any) =>
  !!x && typeof x === "object" && typeof x.id === "number" && typeof x.accountId === "number" &&
  typeof x.positionSize === "number" && "averagePrice" in x

const isAccount = (x: any) => !!x && typeof x === "object" && typeof x.accountId === "number" && typeof x.accountName === "string"

// Only the fields Pip needs leave the page script
const pickTrade = (t: any) => ({
  id: t.id, accountId: t.accountId, contractId: t.contractId, contractDisplayName: t.contractDisplayName,
  createdAt: t.createdAt, exitedAt: t.exitedAt, entryPrice: t.entryPrice, exitPrice: t.exitPrice,
  fees: t.fees, pnL: t.pnL, positionSize: t.positionSize, voided: t.voided
})

const pickPosition = (p: any) => ({
  id: p.id, accountId: p.accountId, contractId: p.contractId, contractDisplayName: p.contractDisplayName,
  symbolName: p.symbolName, positionSize: p.positionSize
})

function scan(value: any, trades: any[], accounts: any[], depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return
  if (Array.isArray(value)) { for (const v of value) scan(v, trades, accounts, depth + 1); return }
  if (isTrade(value)) trades.push(pickTrade(value))
  else if (isAccount(value)) accounts.push({ accountId: value.accountId, accountName: value.accountName, nickname: value.nickname ?? null })
  else for (const v of Object.values(value)) scan(v, trades, accounts, depth + 1)
}

function handle(url: string, data: unknown) {
  try {
    const trades: any[] = []
    const accounts: any[] = []
    scan(data, trades, accounts)
    // The open-positions list is sent even when empty: it says what was already open when the page loaded
    if (/\/Position\/all\//.test(url) && Array.isArray(data)) post("positions", data.filter(isPosition).map(pickPosition))
    if (accounts.length) post("accounts", accounts)
    // The closed-trades list is sent even when empty, so Pip knows the history has loaded
    if (trades.length || /\/Trade\/id\//.test(url)) post("trades", trades)
  } catch { /* never break the page */ }
}

const WATCHED = /userapi\.topstepx\.com\/(Trade|TradingAccount|Position)/

// fetch
const originalFetch = window.fetch
window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args)
  try {
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : (args[0] as Request).url
    if (WATCHED.test(url)) response.clone().json().then(data => handle(url, data)).catch(() => {})
  } catch { /* ignore */ }
  return response
}

// XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
  const href = String(url)
  if (WATCHED.test(href)) {
    this.addEventListener("load", () => {
      try { handle(href, JSON.parse(this.responseText)) } catch { /* not JSON */ }
    })
  }
  return (originalOpen as any).call(this, method, url, ...rest)
}

// The account WebSocket (SignalR): frames are JSON messages separated by the 0x1e character
const OriginalWebSocket = window.WebSocket
window.WebSocket = new Proxy(OriginalWebSocket, {
  construct(target, args: ConstructorParameters<typeof WebSocket>) {
    const socket = new target(...args)
    if (/topstepx\.com\/hubs\/account/.test(String(args[0]))) {
      socket.addEventListener("message", event => {
        if (typeof event.data !== "string") return
        for (const part of event.data.split("\u001e")) {
          if (!part || !(part.includes("pnL") || part.includes("RealTimePosition"))) continue // only frames about trades and positions
          try {
            const message = JSON.parse(part)
            if (message?.type !== 1) continue
            if (message.target === "RealTimePosition") {
              // { action: 0 created | 1 changed | 2 deleted, data: position }
              for (const arg of message.arguments ?? []) if (isPosition(arg?.data)) post("position", { action: arg.action, position: pickPosition(arg.data) })
            } else {
              handle("hub", message.arguments)
            }
          } catch { /* partial frame */ }
        }
      })
    }
    return socket
  }
})
