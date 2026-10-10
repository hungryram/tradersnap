"use client"

import { useEffect, useState } from "react"
import Pip, { type PipMood } from "./Pip"

const MOODS: { mood: PipMood; label: string; text: string }[] = [
  { mood: "idle", label: "Watching", text: "Quietly keeps score of your day while you trade." },
  { mood: "thinking", label: "Checking", text: "Reads your chart and holds it up against your rules." },
  { mood: "happy", label: "On plan", text: "The setup lines up with your rules. Trade your plan." },
  { mood: "caution", label: "Heads up", text: "Losing streak, revenge trade or a rule about to break." },
]

// Pip's moods, cycling on their own until someone picks one
export default function MeetPip() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setIndex((i) => (i + 1) % MOODS.length), 2800)
    return () => clearInterval(t)
  }, [paused])

  const current = MOODS[index]

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-24">
      <div className="grid items-center gap-10 rounded-3xl border border-ink-border bg-ink-surface p-8 sm:p-12 md:grid-cols-[auto_1fr]">
        <div className="mx-auto flex flex-col items-center">
          <div className="rounded-full bg-brand-500/10 p-5 ring-1 ring-brand-500/20">
            <Pip mood={current.mood} size={150} title={`Pip: ${current.label}`} />
          </div>
          <p className="mt-4 text-sm font-medium text-brand-300" aria-live="polite">{current.label}</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-medium text-brand-300">Meet Pip</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">A coach you can read at a glance</h2>
          <p className="mt-4 text-ink-text leading-relaxed max-w-xl">
            Pip lives in the corner of your chart. You don't have to open anything to know where you stand: his face tells you.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {MOODS.map((m, i) => (
              <button
                key={m.mood}
                onClick={() => { setIndex(i); setPaused(true) }}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${i === index ? "border-brand-500/50 bg-brand-500/10" : "border-ink-border hover:bg-ink-elevated"}`}
              >
                <Pip mood={m.mood} size={36} animated={i === index} />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs leading-relaxed text-ink-text">{m.text}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
