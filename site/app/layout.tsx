import type { Metadata } from "next"
import Script from "next/script"
import { Inter } from "next/font/google"
import { SITE_URL } from "./links"
import Header from "./components/Header"
import Footer from "./components/Footer"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], display: "swap" })
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-96T9YB0EZC"

const title = "Snapchart: meet Pip, your AI trading coach"
const description =
  "Pip lives on your chart. He checks your setup against your own rules, tracks your trades and speaks up when you start tilting. Not signals. Discipline."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: "%s | Snapchart" },
  description,
  openGraph: { title, description, url: SITE_URL, siteName: "Snapchart", type: "website" },
  twitter: { card: "summary", title, description },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
