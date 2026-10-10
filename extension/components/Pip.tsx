"use client"

import { useId } from "react"

// Pip, the trading coach. One SVG with four moods and light CSS animation
// (blinking, antenna glow, thinking dots). The same file lives in the site,
// the dashboard and the extension; keep them in sync.
export type PipMood = "idle" | "thinking" | "happy" | "caution"

const RING: Record<PipMood, string> = { idle: "#9AA8C7", thinking: "#9AA8C7", happy: "#4FA3D9", caution: "#E8A33D" }
const ANTENNA: Record<PipMood, string> = { idle: "#FF7A6B", thinking: "#7CF2D6", happy: "#4FA3D9", caution: "#E8A33D" }

const CSS = `
.pip-anim .pip-blink{animation:pip-blink 5s infinite;transform-origin:center;transform-box:fill-box}
.pip-anim .pip-glow{animation:pip-glow 2.4s ease-in-out infinite}
.pip-anim.pip-caution .pip-glow{animation-duration:.9s}
.pip-anim .pip-dot{animation:pip-dot 1.2s ease-in-out infinite}
.pip-anim .pip-dot2{animation-delay:.2s}.pip-anim .pip-dot3{animation-delay:.4s}
.pip-anim .pip-bob{animation:pip-bob 3.2s ease-in-out infinite}
@keyframes pip-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
@keyframes pip-glow{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes pip-dot{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes pip-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@media (prefers-reduced-motion:reduce){.pip-anim *{animation:none!important}}
`

export default function Pip({ mood = "idle", size = 40, animated = true, title, className = "" }: {
  mood?: PipMood
  size?: number
  animated?: boolean
  title?: string
  className?: string
}) {
  const clip = "pip" + useId().replace(/[^a-zA-Z0-9_-]/g, "")
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`${animated ? "pip-anim" : ""} pip-${mood} ${className}`}
      style={{ flex: "none", display: "block" }}
    >
      {title && <title>{title}</title>}
      <style>{CSS}</style>
      <defs>
        <clipPath id={clip}><circle cx="64" cy="64" r="57" /></clipPath>
      </defs>
      <circle cx="64" cy="64" r="60" fill="#E6FAF4" />
      <g clipPath={`url(#${clip})`}>
        <rect x="22" y="104" width="84" height="40" rx="18" fill="#2BB59A" />
        <g className="pip-bob">
          <line x1="64" y1="20" x2="64" y2="30" stroke="#1E2A4A" strokeWidth="3.5" strokeLinecap="round" />
          <circle className="pip-glow" cx="64" cy="18" r="5.5" fill={ANTENNA[mood]} />
          <rect x="24" y="30" width="80" height="70" rx="22" fill="#2BB59A" />
          <rect x="33" y="40" width="62" height="50" rx="14" fill="#16233B" />
          <Face mood={mood} />
          <circle cx="20" cy="66" r="6" fill="#1F8C77" />
          <circle cx="108" cy="66" r="6" fill="#1F8C77" />
        </g>
      </g>
      <circle cx="64" cy="64" r="57" fill="none" stroke={RING[mood]} strokeWidth="6" />
    </svg>
  )
}

function Face({ mood }: { mood: PipMood }) {
  const line = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  if (mood === "happy") {
    return (
      <g stroke="#8FD3FF" {...line}>
        <path d="M44 64 Q51 55 58 64" strokeWidth="4" />
        <path d="M70 64 Q77 55 84 64" strokeWidth="4" />
        <path d="M52 80 L58 77 L63 79 L76 70" strokeWidth="3.5" />
        <path d="M70 70 L76 70 L76 76" strokeWidth="3.5" />
      </g>
    )
  }
  if (mood === "caution") {
    return (
      <g>
        <path d="M43 52 L58 56" stroke="#FFC15E" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M71 53 Q78 48 85 52" stroke="#FFC15E" strokeWidth="3.5" {...line} />
        <g className="pip-blink">
          <rect x="45" y="60" width="12" height="7" rx="3.5" fill="#FFC15E" />
          <ellipse cx="77" cy="64" rx="6" ry="7" fill="#FFC15E" />
        </g>
        <path d="M53 73 L60 77 L66 75 L75 83" stroke="#FFC15E" strokeWidth="3.5" {...line} />
      </g>
    )
  }
  if (mood === "thinking") {
    return (
      <g fill="#7CF2D6">
        <g className="pip-blink">
          <ellipse cx="53" cy="58" rx="5" ry="7" />
          <ellipse cx="79" cy="58" rx="5" ry="7" />
        </g>
        <circle className="pip-dot" cx="54" cy="78" r="2.8" />
        <circle className="pip-dot pip-dot2" cx="64" cy="78" r="2.8" />
        <circle className="pip-dot pip-dot3" cx="74" cy="78" r="2.8" />
      </g>
    )
  }
  return (
    <g>
      <g className="pip-blink" fill="#7CF2D6">
        <ellipse cx="51" cy="62" rx="6" ry="8" />
        <ellipse cx="77" cy="62" rx="6" ry="8" />
      </g>
      <path d="M54 78 L60 74 L66 80 L74 72" stroke="#7CF2D6" strokeWidth="3.5" {...line} />
    </g>
  )
}
