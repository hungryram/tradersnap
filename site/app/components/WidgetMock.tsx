// A static picture of the extension on a chart: the coach speaking up after a losing streak
export default function WidgetMock() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-6 rounded-[2rem] bg-blue-600/10 blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-ink-border bg-ink-surface shadow-2xl">
        {/* Browser bar */}
        <div className="flex items-center gap-2 border-b border-ink-border px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-border" />
          <span className="ml-3 rounded-md bg-ink-elevated px-3 py-1 text-[11px] text-ink-muted">tradingview.com/chart</span>
        </div>

        <div className="relative h-[380px] sm:h-[420px]">
          <Chart />

          {/* Coach widget */}
          <div className="absolute bottom-3 right-3 w-[78%] max-w-[300px] rounded-xl border border-ink-border bg-ink-bg/95 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-ink-border px-3 py-2">
              <div className="flex items-center gap-2">
                <img src="/icon.png" alt="" className="h-4 w-4" />
                <span className="text-xs font-medium">Snapchart</span>
              </div>
              <span className="text-[10px] text-ink-muted">4 trades · 1W 3L</span>
            </div>
            <div className="space-y-2.5 p-3 text-[12px] leading-relaxed">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-100">
                That's 3 losses in a row (−$412). Your rule is to stop after 3. Want to take 15 minutes before the next one?
              </div>
              <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-blue-600 px-2.5 py-1.5 text-white">
                one more, this setup is clean
              </div>
              <div className="rounded-lg bg-ink-elevated p-2.5 text-ink-text">
                Let's check it against your rules first. Your A+ setup needs a trend on the 5m. Right now price is chopping around both MAs.
              </div>
            </div>
            <div className="flex gap-2 border-t border-ink-border p-2.5">
              <span className="flex-1 rounded-md bg-ink-elevated px-2 py-1.5 text-center text-[11px] text-ink-text">Analyze chart</span>
              <span className="flex-1 rounded-md bg-ink-elevated px-2 py-1.5 text-center text-[11px] text-ink-text">Send with chart</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Choppy price action with two moving averages
function Chart() {
  const candles = [
    [40, 52, 36, 56], [52, 47, 44, 57], [47, 58, 45, 61], [58, 54, 50, 62], [54, 49, 46, 58],
    [49, 60, 47, 63], [60, 55, 52, 64], [55, 51, 47, 58], [51, 59, 49, 62], [59, 53, 50, 63],
    [53, 48, 44, 56], [48, 56, 46, 59], [56, 61, 53, 66], [61, 55, 52, 64], [55, 50, 47, 58],
    [50, 57, 48, 60], [57, 52, 49, 60], [52, 58, 50, 62], [58, 54, 51, 61], [54, 49, 46, 57],
  ]
  const w = 560, h = 420, step = w / (candles.length + 2)
  const y = (v: number) => h - 60 - (v - 30) * 7
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="0" x2={w} y1={40 + i * 75} y2={40 + i * 75} stroke="#30302e" strokeWidth="1" />
      ))}
      <polyline fill="none" stroke="#3b82f6" strokeOpacity="0.7" strokeWidth="2"
        points={candles.map((_, i) => `${(i + 1) * step},${y(52 + Math.sin(i / 2) * 2)}`).join(" ")} />
      <polyline fill="none" stroke="#f59e0b" strokeOpacity="0.6" strokeWidth="2"
        points={candles.map((_, i) => `${(i + 1) * step},${y(53 + Math.cos(i / 3) * 1.5)}`).join(" ")} />
      {candles.map(([o, c, l, hi], i) => {
        const x = (i + 1) * step
        const up = c >= o
        const color = up ? "#22c55e" : "#ef4444"
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(hi)} y2={y(l)} stroke={color} strokeWidth="1.5" />
            <rect x={x - step * 0.3} width={step * 0.6} y={y(Math.max(o, c))} height={Math.max(2, Math.abs(y(o) - y(c)))} fill={color} rx="1" />
          </g>
        )
      })}
    </svg>
  )
}
