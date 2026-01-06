import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Snapchart",
  description: "AI Trading Psychology Assistant",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
