import { useEffect, useState } from "react"
import Pip from "./Pip"

// A 60-second reset after a loss: breathe with the circle, then decide. The
// trader can lock "Check this setup" for 5 minutes, a cooldown they choose.
const SECONDS = 60
const BREATH_MS = 8000 // 4 seconds in, 4 out

export default function ResetBreak({ dark, onDone }: {
  dark: boolean
  onDone: (lockMinutes: number | null) => void
}) {
  const [left, setLeft] = useState(SECONDS)
  const [inhale, setInhale] = useState(true)
  const [lock, setLock] = useState(true)

  useEffect(() => {
    const tick = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000)
    const breath = setInterval(() => setInhale(i => !i), BREATH_MS / 2)
    return () => { clearInterval(tick); clearInterval(breath) }
  }, [])

  const done = left === 0
  const text = dark ? "text-dark-body" : "text-slate-900"
  const muted = dark ? "text-dark-text" : "text-slate-500"

  return (
    <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 p-6 text-center backdrop-blur ${dark ? "bg-dark-bg/95" : "bg-white/95"}`} role="dialog" aria-label="60-second reset">
      <div className="relative flex h-44 w-44 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full bg-blue-500/20 transition-transform ease-in-out"
          style={{ transform: `scale(${inhale ? 1 : 0.55})`, transitionDuration: `${BREATH_MS / 2}ms` }}
        />
        <span
          className="absolute inset-6 rounded-full border border-blue-400/40 transition-transform ease-in-out"
          style={{ transform: `scale(${inhale ? 1 : 0.7})`, transitionDuration: `${BREATH_MS / 2}ms` }}
        />
        <Pip size={64} mood={done ? "happy" : "idle"} />
      </div>

      <div>
        <p className={`text-lg font-semibold ${text}`}>{done ? "Reset done." : inhale ? "Breathe in…" : "Breathe out…"}</p>
        <p className={`mt-1 text-sm ${muted}`}>
          {done ? "The last trade is over. The next one only happens if it's on your plan." : `${left}s. Let the last trade go.`}
        </p>
      </div>

      <label className={`flex cursor-pointer items-center gap-2 text-sm ${text}`}>
        <input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} className="h-4 w-4 accent-blue-600" />
        Also lock Check this setup for 5 minutes
      </label>

      <div className="flex gap-2">
        <button onClick={() => onDone(null)} className={`rounded-lg border px-4 py-2 text-sm ${dark ? "border-dark-border text-dark-text hover:text-dark-body" : "border-slate-300 text-slate-600 hover:text-slate-900"}`}>
          {done ? "Close" : "Skip"}
        </button>
        <button onClick={() => onDone(lock ? 5 : null)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {done ? (lock ? "Start my 5-minute break" : "I'm ready") : lock ? "Lock for 5 minutes now" : "I'm ready"}
        </button>
      </div>
    </div>
  )
}
