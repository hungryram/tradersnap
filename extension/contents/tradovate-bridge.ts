import type { PlasmoCSConfig } from "plasmo"

// Runs inside Tradovate's own page (the page's JavaScript world) so it can see the trading data the page
// already receives over its WebSocket: one big sync when it loads (accounts, today's fills and fees,
// positions, contract names), then live updates. It never touches the sign-in token and makes no requests
// of its own. Trimmed records are passed to Pip's content script with postMessage
// (lib/trades/tradovate.ts turns them into trades).

export const config: PlasmoCSConfig = {
  matches: ["*://*.tradovate.com/*"],
  world: "MAIN",
  run_at: "document_start"
}

const SOURCE = "pip-tradovate"
const post = (kind: string, payload: unknown) => window.postMessage({ source: SOURCE, kind, payload }, window.location.origin)

const num = (x: any) => (typeof x === "number" && Number.isFinite(x) ? x : 0)
const FEE_FIELDS = ["clearingFee", "exchangeFee", "nfaFee", "brokerageFee", "ipFee", "commission", "orderRoutingFee"]

// Only the fields Pip needs leave the page script
const pickFill = (f: any) => ({ id: f.id, orderId: f.orderId, contractId: f.contractId, timestamp: f.timestamp, action: f.action, qty: f.qty, price: f.price })
const pickFee = (f: any) => ({ id: f.id, fee: FEE_FIELDS.reduce((sum, k) => sum + num(f[k]), 0) })
const pickOrder = (o: any) => ({ id: o.id, accountId: o.accountId })
const pickPosition = (p: any) => ({ accountId: p.accountId, contractId: p.contractId, netPos: p.netPos })
const pickAccount = (a: any) => ({ id: a.id, name: a.name })
const pickContract = (c: any) => ({ id: c.id, name: c.name, contractMaturityId: c.contractMaturityId })

const isContract = (x: any) => !!x && typeof x === "object" && typeof x.id === "number" && typeof x.name === "string" && "contractMaturityId" in x
const list = (x: any): any[] => (Array.isArray(x) ? x : [])

function handleMessage(message: any) {
  if (!message || typeof message !== "object") return
  const d = message.d

  // The sync response when the page loads
  if (d && !Array.isArray(d) && typeof d === "object" && Array.isArray(d.fills) && Array.isArray(d.orders)) {
    const productValue = new Map<number, number>()
    for (const p of list(d.products)) if (typeof p?.id === "number" && typeof p.valuePerPoint === "number") productValue.set(p.id, p.valuePerPoint)
    const maturityProduct = new Map<number, number>()
    for (const m of list(d.contractMaturities)) if (typeof m?.id === "number" && typeof m.productId === "number") maturityProduct.set(m.id, m.productId)
    post("sync", {
      accounts: list(d.accounts).map(pickAccount),
      contracts: list(d.contracts).map((c: any) => ({ ...pickContract(c), valuePerPoint: productValue.get(maturityProduct.get(c.contractMaturityId) as number) ?? null })),
      orders: list(d.orders).map(pickOrder),
      fills: list(d.fills).map(pickFill),
      fees: list(d.fillFees).map(pickFee),
      positions: list(d.positions).map(pickPosition)
    })
    return
  }

  // Live updates: { e: "props", d: { entityType, eventType, entity } }
  if (message.e === "props" && d && typeof d === "object" && d.entity) {
    const { entityType, entity } = d
    switch (entityType) {
      case "fill": post("fill", pickFill(entity)); break
      case "fillFee": post("fee", pickFee(entity)); break
      case "order": post("order", pickOrder(entity)); break
      case "position": post("position", pickPosition(entity)); break
      case "contract": if (isContract(entity)) post("contracts", [pickContract(entity)]); break
    }
    return
  }

  // Contract lookups (the page asks for names as it needs them)
  if (Array.isArray(d) && d.length && d.every(isContract)) post("contracts", d.map(pickContract))
  else if (isContract(d)) post("contracts", [pickContract(d)])
}

// The trading socket only; market-data sockets (md-...) carry quotes and charts
const OriginalWebSocket = window.WebSocket
window.WebSocket = new Proxy(OriginalWebSocket, {
  construct(target, args: ConstructorParameters<typeof WebSocket>) {
    const socket = new target(...args)
    const url = String(args[0])
    if (/tradovateapi\.com\/v1\/websocket/.test(url) && !/\/\/md/.test(url)) {
      socket.addEventListener("message", event => {
        // Frames look like: o (open), h (heartbeat), a[ ...JSON messages... ]
        if (typeof event.data !== "string" || !event.data.startsWith("a[")) return
        try {
          for (const message of JSON.parse(event.data.slice(1))) handleMessage(message)
        } catch { /* partial or unrelated frame */ }
      })
    }
    return socket
  }
})
