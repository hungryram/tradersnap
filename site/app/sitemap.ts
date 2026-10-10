import type { MetadataRoute } from "next"
import { SITE_URL } from "./links"

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/faq", "/guide", "/contact", "/privacy", "/terms"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }))
}
