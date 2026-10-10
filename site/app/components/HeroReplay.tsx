"use client"

import { useEffect, useRef, useState } from "react"
import Pip, { type PipMood } from "./Pip"

// An example session that plays on a loop: Pip catching a revenge trade.
// Pip's lines are the extension's real check-in and coaching messages.
type Step =
  | { kind: "pip"; mood: PipMood; text: string; tag?: string }
  | { kind: "user"; text: string }
  | { kind: "event"; text: string; tone: "loss" | "neutral" }

const SCRIPT: { step: Step; wait: number }[] = [
  { wait: 900, step: { kind: "pip", mood: "idle", text: "Morning. Today's plan: max 4 trades, stop after 2 losses in a row. One good setup beats five forced ones." } },
  { wait: 2600, step: { kind: "event", tone: "loss", text: "9:48 · NQ trade closed · −$180" } },
  { wait: 1600, step: { kind: "event", tone: "neutral", text: "9:50 · New NQ position opened" } },
  { wait: 1200, step: { kind: "pip", mood: "caution", text: "You're back in 2 minutes after a −$180 loss. Was this setup on your plan, or is it the last trade talking?" } },
  { wait: 3200, step: { kind: "user", text: "it's the same setup, I'm sure" } },
  { wait: 1400, step: { kind: "pip", mood: "caution", tag: "Incomplete setup", text: "Checked your chart. Your rule needs a higher low on the 5m before entry. There isn't one yet. Waiting is a position too." } },
  { wait: 3600, step: { kind: "user", text: "ok. closing it, sitting this one out" } },
  { wait: 1400, step: { kind: "pip", mood: "happy", text: "Good call. That's the rep that matters. No rules broken." } },
]

const TYPING_MS = 1100
const LOOP_PAUSE_MS = 5000

export default function HeroReplay() {
  const [count, setCount] = useState(0)
  const [typing, setTyping] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setCount(SCRIPT.length)
      return
    }
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms))

    const play = () => {
      setCount(0)
      let t = 0
      SCRIPT.forEach(({ step, wait }, i) => {
        t += wait
        if (step.kind === "pip") {
          later(() => setTyping(true), t)
          t += TYPING_MS
        }
        later(() => { setTyping(false); setCount(i + 1) }, t)
      })
      later(play, t + LOOP_PAUSE_MS)
    }
    play()
    return () => timers.current.forEach(clearTimeout)
  }, [])

  const shown = SCRIPT.slice(0, count).map((s) => s.step)
  const lastPip = [...shown].reverse().find((s) => s.kind === "pip") as Extract<Step, { kind: "pip" }> | undefined
  const mood: PipMood = typing ? "thinking" : lastPip?.mood ?? "idle"

  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div className="absolute -inset-10 rounded-full bg-brand-500/15 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-ink-border bg-ink-surface shadow-2xl shadow-black/50">
        {/* Browser bar */}
        <div className="flex items-center gap-2 border-b border-ink-border px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-border" />
          <span className="ml-3 truncate rounded-md bg-ink-elevated px-3 py-1 text-[11px] text-ink-muted">tradingview.com/chart · NQ1! · 5m</span>
          <span className="ml-auto hidden text-[10px] uppercase tracking-wider text-ink-muted sm:block">Example session</span>
        </div>

        <div className="relative h-[460px]">
          <Chart />

          {/* The widget */}
          <div className="absolute inset-x-3 bottom-3 top-10 flex flex-col overflow-hidden rounded-xl border border-ink-border bg-ink-bg/95 shadow-xl backdrop-blur sm:left-auto sm:w-[330px]">
            <div className="flex items-center gap-2.5 border-b border-ink-border px-3 py-2">
              <Pip mood={mood} size={30} title={`Pip is ${mood}`} />
              <div className="leading-tight">
                <div className="text-sm font-medium">Pip</div>
                <div className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Tracking your trades
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-end gap-2.5 overflow-hidden p-3 text-[12.5px] leading-relaxed [mask-image:linear-gradient(to_bottom,transparent,black_22%)]" aria-live="polite">
              {shown.map((step, i) => <Line key={i} step={step} />)}
              {typing && (
                <div className="flex items-center gap-2">
                  <Pip mood="thinking" size={22} />
                  <div className="flex gap-1 rounded-lg bg-ink-elevated px-3 py-2.5">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-ink-border p-2.5">
              <span className="flex-1 rounded-md bg-brand-500 px-2 py-1.5 text-center text-[11px] font-medium text-ink-bg">Analyze this chart</span>
              <span className="flex-1 rounded-md bg-ink-elevated px-2 py-1.5 text-center text-[11px] text-ink-text">Ask Pip</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({ step }: { step: Step }) {
  if (step.kind === "event") {
    return (
      <div className="flex justify-center animate-[fadeUp_.35s_ease-out]">
        <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] tabular-nums ${step.tone === "loss" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-ink-border bg-ink-elevated text-ink-text"}`}>
          {step.text}
        </span>
      </div>
    )
  }
  if (step.kind === "user") {
    return (
      <div className="ml-auto w-fit max-w-[80%] animate-[fadeUp_.35s_ease-out] rounded-lg rounded-tr-sm bg-ink-elevated px-3 py-1.5 text-ink-body">
        {step.text}
      </div>
    )
  }
  const tone = step.mood === "caution"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-50"
    : step.mood === "happy"
      ? "border-brand-500/30 bg-brand-500/10 text-ink-body"
      : "border-ink-border bg-ink-surface text-ink-body"
  return (
    <div className="flex items-start gap-2 animate-[fadeUp_.35s_ease-out]">
      <Pip mood={step.mood} size={22} animated={false} className="mt-0.5" />
      <div className={`rounded-lg rounded-tl-sm border px-3 py-2 ${tone}`}>
        {step.tag && <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-amber-300">{step.tag}</div>}
        {step.text}
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
  const w = 560, h = 460, step = w / (candles.length + 2)
  const y = (v: number) => h - 80 - (v - 30) * 7.5
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-80" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1="0" x2={w} y1={30 + i * 80} y2={30 + i * 80} stroke="#19263F" strokeWidth="1" />
      ))}
      <polyline fill="none" stroke="#4FD6B6" strokeOpacity="0.5" strokeWidth="2"
        points={candles.map((_, i) => `${(i + 1) * step},${y(52 + Math.sin(i / 2) * 2)}`).join(" ")} />
      <polyline fill="none" stroke="#E8A33D" strokeOpacity="0.45" strokeWidth="2"
        points={candles.map((_, i) => `${(i + 1) * step},${y(53 + Math.cos(i / 3) * 1.5)}`).join(" ")} />
      {candles.map(([o, c, l, hi], i) => {
        const x = (i + 1) * step
        const color = c >= o ? "#22c55e" : "#ef4444"
        return (
          <g key={i} opacity="0.85">
            <line x1={x} x2={x} y1={y(hi)} y2={y(l)} stroke={color} strokeWidth="1.5" />
            <rect x={x - step * 0.3} width={step * 0.6} y={y(Math.max(o, c))} height={Math.max(2, Math.abs(y(o) - y(c)))} fill={color} rx="1" />
          </g>
        )
      })}
    </svg>
  )
}
